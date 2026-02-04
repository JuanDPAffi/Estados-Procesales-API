import { Controller, Post, Get, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SupportService } from '../services/support.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { SystemOrJwtGuard } from '../../../common/guards/system-or-jwt.guard';
import { Permissions } from '../../../common/decorators/roles.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { CreateCallTicketDto } from '../dto/call-ticket.dto';
import { InmobiliariaService } from '../../inmobiliaria/services/inmobiliaria.service';

@Controller('support')
@UseGuards(SystemOrJwtGuard)
export class SupportController {
  constructor(
    private readonly supportService: SupportService,
    private readonly inmoService: InmobiliariaService
  ) {}

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
    const company = await this.inmoService.findOneByNit(nit);
    
    if (!company) {
        return { found: false };
    }

    return {
        found: true,
        ...company.toObject()
    };
  }

  @Post('call-ticket')
  @Permissions(PERMISSIONS.CALL_CREATE)
  async createCallTicket(@Body() dto: CreateCallTicketDto, @Req() req: any) {
    const userEmail = req.user?.email || 'sistema';
    return this.supportService.createCallTicket(dto, userEmail);
  }
}