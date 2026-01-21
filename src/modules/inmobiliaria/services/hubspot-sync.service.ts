import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { Inmobiliaria, InmobiliariaDocument } from '../schema/inmobiliaria.schema';

@Injectable()
export class HubspotSyncService {
  private readonly logger = new Logger(HubspotSyncService.name);
  private readonly HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN; 

  constructor(
    @InjectModel(Inmobiliaria.name) private inmoModel: Model<InmobiliariaDocument>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncHubspotOwners() {
    if (!this.HUBSPOT_TOKEN) {
      this.logger.warn('HUBSPOT_ACCESS_TOKEN no configurado. Saltando sync.');
      return;
    }

    this.logger.log('Iniciando sincronización de propietarios desde HubSpot...');
    
    try {
      const ownersMap = await this.getHubspotOwnersMap();
      const companies = await this.getAllHubspotCompanies(['numero_de_identificacion', 'hubspot_owner_id']);

      const operations = [];

      for (const company of companies) {
        const rawNit = company.properties.numero_de_identificacion; 
        const ownerId = company.properties.hubspot_owner_id;
        
        if (!rawNit || !ownerId) continue;

        const cleanNit = String(rawNit).replace(/\D/g, ''); 

        const ownerEmail = ownersMap.get(ownerId);

        if (ownerEmail) {
          operations.push({
            updateOne: {
              filter: { nit: cleanNit },
              update: { 
                $set: { 
                  assignedAccountManagerEmail: ownerEmail.toLowerCase(),
                } 
              }
            }
          });
        }
      }

      if (operations.length > 0) {
        await this.inmoModel.bulkWrite(operations);
        this.logger.log(`Sync HubSpot completada: ${operations.length} inmobiliarias actualizadas.`);
      } else {
        this.logger.warn('Sync finalizada sin cambios. Verifica que los NITs en HubSpot (ej: 900.123...) coincidan con Mongo al quitarles los puntos.');
      }

    } catch (error) {
      this.logger.error('Error en sync HubSpot', error);
    }
  }

  private async getHubspotOwnersMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let nextLink: string | null = 'https://api.hubapi.com/crm/v3/owners?limit=100';

    while (nextLink) {
      const res = await axios.get(nextLink, { headers: { Authorization: `Bearer ${this.HUBSPOT_TOKEN}` } });
      res.data.results.forEach((owner: any) => map.set(owner.id, owner.email));
      nextLink = res.data.paging?.next?.link || null;
    }
    return map;
  }

  private async getAllHubspotCompanies(properties: string[]): Promise<any[]> {
    const results = [];
    const propsString = properties.join(',');
    let nextLink: string | null = `https://api.hubapi.com/crm/v3/objects/companies?limit=100&properties=${propsString}`;

    while (nextLink) {
      const res = await axios.get(nextLink, { headers: { Authorization: `Bearer ${this.HUBSPOT_TOKEN}` } });
      results.push(...res.data.results);
      nextLink = res.data.paging?.next?.link || null;
    }
    return results;
  }
}