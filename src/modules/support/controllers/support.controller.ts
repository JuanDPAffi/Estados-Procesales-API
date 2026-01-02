/*
  Cambios (30-12-2025) - Santiago Obando:
  - Se agregó el mapeo de `ticketEmail` para pasar el email enviado en el formulario
    (`createDto.email`) hacia el servicio de soporte.
  - Motivo: permitir que el email ingresado en el modal sea el reply-to en HubSpot/CMR.
*/
import { Controller, Post, Get, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SupportService } from '../services/support.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { SystemOrJwtGuard } from '../../../common/guards/system-or-jwt.guard';
import { Permissions } from '../../../common/decorators/roles.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { CreateCallTicketDto } from '../dto/call-ticket.dto';

@Controller('support')
@UseGuards(SystemOrJwtGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('ticket')
  async createTicket(@Req() req, @Body() createDto: CreateTicketDto) {
    const { email, name, nit, role } = req.user;
    const ticketEmail = createDto?.email || email;

    return this.supportService.createTicket(
      { email, name, nit, role, ticketEmail },
      createDto
    );
  }

  @Get('hubspot/search-contact')
  @Permissions(PERMISSIONS.CALL_CREATE)
  async searchContact(@Query('email') email: string) {
    return this.supportService.searchHubSpotContact(email);
  }

  @Get('hubspot/search-company')
  @Permissions(PERMISSIONS.CALL_CREATE)
  async searchCompany(@Query('nit') nit: string) {
    return this.supportService.searchHubSpotCompany(nit);
  }

  @Post('call-ticket')
  @Permissions(PERMISSIONS.CALL_CREATE)
  async createCallTicket(@Body() dto: CreateCallTicketDto, @Req() req: any) {
    const userEmail = req.user?.email || 'sistema';
    return this.supportService.createCallTicket(dto, userEmail);
  }
}