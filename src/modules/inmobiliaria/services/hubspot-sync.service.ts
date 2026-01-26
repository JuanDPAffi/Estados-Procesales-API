import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { Inmobiliaria, InmobiliariaDocument } from '../schema/inmobiliaria.schema';
import { SalesTeam, SalesTeamDocument } from '../../comercial/schemas/sales-team.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';

@Injectable()
export class HubspotSyncService {
  private readonly logger = new Logger(HubspotSyncService.name);
  private readonly HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN; 

  constructor(
    @InjectModel(Inmobiliaria.name) private inmoModel: Model<InmobiliariaDocument>,
    @InjectModel(SalesTeam.name) private salesTeamModel: Model<SalesTeamDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncHubspotOwners() {
    if (!this.HUBSPOT_TOKEN) {
      this.logger.warn('HUBSPOT_ACCESS_TOKEN no configurado. Saltando sync.');
      return;
    }

    this.logger.log('Iniciando sincronización completa (Owners + Representantes + SalesTeam) desde HubSpot...');
    
    try {
      // 1. Obtener mapa de Owners (Dueños de cuenta en HubSpot)
      const ownersMap = await this.getHubspotOwnersMap();
      
      // 2. Obtener configuraciones de equipos (LÓGICA NUEVA: Lee directorName directo de la BD)
      const salesTeamMap = await this.buildSalesTeamMap();

      // 3. Obtener Compañías con sus Asociaciones a Contactos
      const companies = await this.getAllHubspotCompaniesWithAssociations([
        'numero_de_identificacion', 
        'hubspot_owner_id',
        'name',
        'zona_affi',
        'cluster',
        'monto_afianzado',
        'cantidad_de_contratos_afianzados'
      ]);

      // 4. Recolectar IDs de contactos únicos
      const contactIdsToFetch = new Set<string>();
      companies.forEach(comp => {
        if (comp.associations?.contacts?.results) {
          comp.associations.contacts.results.forEach((assoc: any) => contactIdsToFetch.add(assoc.id));
        }
      });

      // 5. Descargar detalles de contactos (Batch)
      const contactsMap = await this.batchGetContacts(Array.from(contactIdsToFetch));

      // 6. Procesar actualizaciones
      const operations = [];

      for (const company of companies) {
        const rawNit = company.properties.numero_de_identificacion; 
        const ownerId = company.properties.hubspot_owner_id;
        
        if (!rawNit) continue;

        const cleanNit = String(rawNit).replace(/\D/g, ''); 
        
        // --- A. Lógica de Owner & Equipo Comercial ---
        let ownerData = ownerId ? ownersMap.get(ownerId) : null;
        let equipoComercialData = null;

        if (ownerData) {
          const emailGerente = ownerData.email.toLowerCase();
          
          // Buscamos si este gerente tiene un equipo asignado
          const teamInfo = salesTeamMap.get(emailGerente);
          
          equipoComercialData = {
            gerenteNombre: ownerData.fullName,
            gerenteEmail: emailGerente,
            // AQUI ESTÁ EL CAMBIO: Ahora toma el nombre directo del mapa
            directorName: teamInfo ? teamInfo.directorName : 'No asignado',
            directorEmail: teamInfo ? teamInfo.directorEmail : 'No asignado'
          };
        }
        
        // --- B. Lógica de Representante Legal ---
        let repLegalData = null;
        let currentPriority = 0;
        const contactAssociations = company.associations?.contacts?.results || [];

        for (const assoc of contactAssociations) {
          const contact = contactsMap.get(assoc.id);
          if (!contact) continue;

          const priorityFound = this.getContactPriority(contact);
          if (priorityFound > currentPriority) {
            repLegalData = {
              nombre: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim(),
              email: contact.properties.email
            };
            currentPriority = priorityFound;
          }
        }

        // Armamos el objeto de actualización
        const updateSet: any = {
          nombreInmobiliaria: company.properties.name,
          zonaAffi: company.properties.zona_affi,
          cluster: company.properties.cluster,
          montoAfianzado: Number(company.properties.monto_afianzado || 0),
          cantidadContratos: Number(company.properties.cantidad_de_contratos_afianzados || 0),
          hubspotOwnerId: ownerId
        };
        
        if (ownerData) {
          updateSet.assignedAccountManagerEmail = ownerData.email.toLowerCase();
        }

        if (equipoComercialData) {
          updateSet.equipoComercial = equipoComercialData;
        }

        if (repLegalData && repLegalData.email) {
          updateSet.nombreRepresentante = repLegalData.nombre;
          updateSet.emailRepresentante = repLegalData.email.toLowerCase();
        }

        operations.push({
          updateOne: {
            filter: { nit: cleanNit },
            update: { $set: updateSet }
          }
        });
      }

      if (operations.length > 0) {
        await this.inmoModel.bulkWrite(operations);
        this.logger.log(`Sync HubSpot completada: ${operations.length} registros actualizados con datos comerciales.`);
      }

    } catch (error) {
      this.logger.error('Error crítico en sync HubSpot', error);
    }
  }

  // --- HELPERS LÓGICA COMERCIAL (CORREGIDO) ---

  private async buildSalesTeamMap(): Promise<Map<string, { directorEmail: string, directorName: string }>> {
    const map = new Map();
    
    // 1. Traemos todos los equipos (esto incluye tu campo nuevo 'directorName')
    const teams = await this.salesTeamModel.find().lean();
    
    // 2. Iteramos directamente sobre los equipos
    for (const team of teams) {
      const dEmail = team.directorEmail.toLowerCase();
      
      // LEEMOS EL CAMPO NUEVO. Si no existe en el doc, ponemos un fallback.
      // Usamos (team as any) por si tu tipo TypeScript no está actualizado aún.
      const dName = (team as any).directorName || 'Director (Nombre no registrado)';
      
      if (team.accountManagersEmails && Array.isArray(team.accountManagersEmails)) {
        team.accountManagersEmails.forEach(amEmail => {
          // Guardamos email Y nombre directo del documento
          map.set(amEmail.toLowerCase(), { directorEmail: dEmail, directorName: dName });
        });
      }
    }
    return map;
  }

  // --- HELPERS API HUBSPOT (SIN CAMBIOS) ---

  private async getHubspotOwnersMap(): Promise<Map<string, { email: string, fullName: string }>> {
    const map = new Map();
    let nextLink: string | null = 'https://api.hubapi.com/crm/v3/owners?limit=100';

    try {
      while (nextLink) {
        const res = await axios.get(nextLink, { headers: { Authorization: `Bearer ${this.HUBSPOT_TOKEN}` } });
        res.data.results.forEach((owner: any) => {
          map.set(owner.id, {
            email: owner.email,
            fullName: `${owner.firstName || ''} ${owner.lastName || ''}`.trim()
          });
        });
        nextLink = res.data.paging?.next?.link || null;
      }
    } catch (error) {
      this.logger.error('Error obteniendo Owners', error);
    }
    return map;
  }

  private async getAllHubspotCompaniesWithAssociations(properties: string[]): Promise<any[]> {
    const results = [];
    const propsString = properties.join(',');
    let nextLink: string | null = `https://api.hubapi.com/crm/v3/objects/companies?limit=100&properties=${propsString}&associations=contacts`;

    try {
      while (nextLink) {
        const res = await axios.get(nextLink, { headers: { Authorization: `Bearer ${this.HUBSPOT_TOKEN}` } });
        results.push(...res.data.results);
        nextLink = res.data.paging?.next?.link || null;
      }
    } catch (error) { this.logger.error('Error obteniendo Compañías', error); }
    return results;
  }

  private async batchGetContacts(contactIds: string[]): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    if (contactIds.length === 0) return map;
    const properties = ['email', 'firstname', 'lastname', 'cargo_affi', 'rol_de_contacto'];
    const chunkSize = 100;
    
    for (let i = 0; i < contactIds.length; i += chunkSize) {
      const chunk = contactIds.slice(i, i + chunkSize);
      try {
        const response = await axios.post(
          'https://api.hubapi.com/crm/v3/objects/contacts/batch/read',
          { properties, inputs: chunk.map(id => ({ id })) },
          { headers: { Authorization: `Bearer ${this.HUBSPOT_TOKEN}` } }
        );
        response.data.results.forEach((contact: any) => map.set(contact.id, contact));
      } catch (e) { this.logger.error(`Error batchContacts chunk`, e); }
    }
    return map;
  }

  private getContactPriority(contact: any): number {
    const cargo = (contact.properties.cargo_affi || '').toLowerCase().trim();
    const rol = (contact.properties.rol_de_contacto || '').toLowerCase().trim();
    if (cargo === 'representante legal') return 3;
    if (cargo === 'gerente general') return 2;
    if (rol === 'gerente general') return 1;
    return 0;
  }
}