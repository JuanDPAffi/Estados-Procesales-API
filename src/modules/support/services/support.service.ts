/*
  Cambios (30-12-2025) - Santiago Obando:
  - Ahora el servicio prioriza `user.ticketEmail || user.email` al buscar contactos y empresas en HubSpot.
  - Motivo: usar el email ingresado en el formulario como contact/empresa lookup y reply-to.
*/
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { CreateCallTicketDto } from '../dto/call-ticket.dto';

interface UserContext {
  email: string;
  name: string;
  nit?: string;
  role?: string;
  ticketEmail:string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly hubspotBaseUrl = 'https://api.hubapi.com/crm/v3/objects';

  private readonly DEFAULT_OWNER_ID = '81381349';

  constructor(private configService: ConfigService) {}

  private getHeaders() {
    const token = this.configService.get<string>('HUBSPOT_ACCESS_TOKEN');
    if (!token) throw new InternalServerErrorException('HUBSPOT_ACCESS_TOKEN no configurado');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async searchHubSpotCompany(nit: string) {
    const searchPayload = {
      filterGroups: [{ filters: [{ propertyName: 'numero_de_identificacion', operator: 'EQ', value: nit }] }],
      properties: [
        'name', 
        'numero_de_identificacion', 
        'hubspot_owner_id'
      ],
      limit: 1
    };

    try {
      const response = await axios.post(`${this.hubspotBaseUrl}/companies/search`, searchPayload, { headers: this.getHeaders() });
      
      if (response.data.total > 0) {
        const company = response.data.results[0];
        const ownerId = company.properties.hubspot_owner_id;
        let ownerName = '';

        if (ownerId) {
          try {
            const ownerUrl = 'https://api.hubapi.com/crm/v3/owners'; 
            const ownerResp = await axios.get(`${ownerUrl}/${ownerId}`, { headers: this.getHeaders() });
            const { firstName, lastName } = ownerResp.data;
            ownerName = `${firstName || ''} ${lastName || ''}`.trim();
          } catch (error) {
            this.logger.warn(`No se pudo resolver el nombre del owner ${ownerId}`);
            ownerName = 'No identificado';
          }
        }

        return { 
          found: true, 
          id: company.id, 
          name: company.properties.name, 
          nit: company.properties.numero_de_identificacion,
          ownerId: ownerId,
          ownerName: ownerName
        };
      }
      return { found: false };
    } catch (error) {
      this.logger.error(`Error buscando empresa HS: ${nit}`, error);
      return { found: false };
    }
  }

  async searchHubSpotContact(email: string) {
    const searchPayload = {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['firstname', 'lastname', 'email', 'phone'],
      limit: 1
    };
    try {
      const response = await axios.post(`${this.hubspotBaseUrl}/contacts/search`, searchPayload, { headers: this.getHeaders() });
      if (response.data.total > 0) {
        const contact = response.data.results[0];
        const fullName = `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim();
        return { 
          found: true, 
          id: contact.id, 
          name: fullName, 
          email: contact.properties.email, 
          phone: contact.properties.phone
        };
      }
      return { found: false };
    } catch (error) {
      this.logger.error(`Error buscando contacto HS: ${email}`, error);
      return { found: false };
    }
  }

  async createCallTicket(dto: CreateCallTicketDto, userEmail: string) {
    const headers = this.getHeaders();
    const contactId = await this.findContactId(dto.contactEmail, headers);
    
    let companyId = null;
    if (dto.companyNit) {
       companyId = await this.findCompanyId(dto.companyNit, dto.contactEmail, headers);
    }

    const associations = [];
    if (contactId) {
      associations.push({
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 }]
      });
    }
    if (companyId) {
      associations.push({
        to: { id: companyId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 26 }]
      });
    }

    const subject = `Llamada Estados Procesales - ${dto.contactName || 'Desconocido'}`;
    const ticketData = {
      properties: {
        subject: subject,
        tipo_de_solicitud: "Estados procesales",
        hs_ticket_category: "Estados Procesales",
        hubspot_owner_id: this.DEFAULT_OWNER_ID,
        grupo_de_atencion: "Servicio al cliente",
        tipo_de_llamada: dto.callType,
        area_origen_transferencia: dto.transferArea || "",
        consulta: dto.query,
        identificacion_consultado: dto.inquilinoIdentificacion || "",
        nombre_consultado: dto.inquilinoNombre || "",
        numero_cuenta_consultado: dto.cuenta || "", 
        hs_pipeline: "0",
        hs_pipeline_stage: "2"
      },
      associations: associations
    };

    try {
      const response = await axios.post(`${this.hubspotBaseUrl}/tickets`, ticketData, { headers });
      return { 
        success: true, 
        ticketId: response.data.id, 
        message: 'Ticket de llamada creado correctamente' 
      };
    } catch (error) {
      const hubspotError = error?.response?.data;
      this.logger.error('Error creando ticket de llamada', hubspotError || error.message);
      throw new BadRequestException(
        hubspotError?.message || 'Error de validación en HubSpot (Revisa logs)'
      );
    }
  }

  async createTicket(user: UserContext, dto: CreateTicketDto) {
    const token = this.configService.get<string>('HUBSPOT_ACCESS_TOKEN');
    
    if (!token) {
      this.logger.error('HUBSPOT_ACCESS_TOKEN no configurado');
      throw new InternalServerErrorException('Error de configuración en soporte');
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const contactId = await this.findContactId(user.email || user.email, headers);
    let companyId = null;
    const isAffi = user.role?.toLowerCase() === 'affi' || user.nit === '900053370';
    
    if (!isAffi && user.nit) {
      companyId = await this.findCompanyId(user.nit, user.email || user.email, headers);
    }

    const associations = [];
    if (contactId) {
      associations.push({
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 }]
      });
    }
    if (companyId) {
      associations.push({
        to: { id: companyId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 26 }]
      });
    }

    let headerInfo = '';
    
    if (dto.metadata) {
      if (!dto.subject.startsWith('[APOYO JURÍDICO]')) {
        dto.subject = `[APOYO JURÍDICO] ${dto.subject}`;
      }

      headerInfo = `
================================
SOLICITUD DE APOYO JURÍDICO
================================
ID Proceso: ${dto.metadata.procesoId || 'N/A'}
Radicado: ${dto.metadata.radicado || 'N/A'}
Cuenta: ${dto.metadata.cuenta || 'N/A'}
Clase: ${dto.metadata.clase || 'N/A'}
Etapa Actual: ${dto.metadata.etapa || 'N/A'}
      `;
    } 
    else {
      if (!dto.subject.startsWith('[SOPORTE]')) {
        dto.subject = `[SOPORTE] ${dto.subject}`;
      }
      
      headerInfo = `
================================
SOPORTE TÉCNICO - PLATAFORMA
================================
      `;
    }

    const userInfo = `
Usuario: ${user.name}
Correo: ${user.email}
Correo de respuesta: ${user.ticketEmail} 
Rol: ${user.role || 'N/A'}
NIT: ${user.nit || 'N/A'}
--------------------------------
    `;

    const finalContent = `
${headerInfo}
${userInfo}

MENSAJE DEL USUARIO:
${dto.content}
    `.trim();

    const ticketData = {
      properties: {
        hs_pipeline: '0',
        tipo_de_solicitud: "Estados procesales",
        hs_ticket_category: "Estados Procesales - Soporte",
        grupo_de_atencion: "Servicio al cliente",
        hubspot_owner_id: "81381349",
        hs_pipeline_stage: '1',
        hs_ticket_priority: 'HIGH',
        plataforma_estados_procesales: 'true',
        subject: dto.subject,
        content: finalContent,
      },
      associations: associations.length > 0 ? associations : undefined
    };

    try {
      const response = await axios.post(`${this.hubspotBaseUrl}/tickets`, ticketData, { headers });
      return { success: true, ticketId: response.data.id, associations: associations.length };
    } catch (error) {
      this.logger.error('Error creando ticket en HubSpot', error?.response?.data || error);
      throw new InternalServerErrorException('No se pudo crear el ticket de soporte');
    }
  }

  private async findContactId(email: string, headers: any): Promise<string | null> {
    const searchPayload = {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email'],
      limit: 1
    };
    try {
      const response = await axios.post(`${this.hubspotBaseUrl}/contacts/search`, searchPayload, { headers });
      return response.data.total > 0 ? response.data.results[0].id : null;
    } catch (error) {
      this.logger.warn(`No se pudo buscar contacto: ${email}`);
      return null;
    }
  }

  private async findCompanyId(nit: string, email: string, headers: any): Promise<string | null> {
    const searchPayload = {
      filterGroups: [
        { filters: [{ propertyName: 'numero_de_identificacion', operator: 'EQ', value: nit }] },
        { filters: [{ propertyName: 'correo', operator: 'EQ', value: email }] }
      ],
      properties: ['numero_de_identificacion'],
      limit: 1
    };
    try {
      const response = await axios.post(`${this.hubspotBaseUrl}/companies/search`, searchPayload, { headers });
      return response.data.total > 0 ? response.data.results[0].id : null;
    } catch (error) {
      this.logger.warn(`No se pudo buscar empresa NIT: ${nit}`);
      return null;
    }
  }
}