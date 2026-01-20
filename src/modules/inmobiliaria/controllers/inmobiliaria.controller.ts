import { Controller, Get, Post, Put, Patch, Body, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req } from '@nestjs/common';
import { InmobiliariaService } from '../services/inmobiliaria.service';
import { CreateInmobiliariaDto, UpdateInmobiliariaDto } from '../dto/inmobiliaria.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { SystemOrJwtGuard } from '../../../common/guards/system-or-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/roles.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { MailService } from '../../mail/services/mail.service';

@Controller('inmobiliarias')
@UseGuards(SystemOrJwtGuard, RolesGuard)
export class InmobiliariaController {
  constructor(
    private readonly inmoService: InmobiliariaService,
    private readonly mailService: MailService
  ) {}

  @Post()
  @Permissions(PERMISSIONS.INMO_CREATE)
  async create(@Body() createDto: CreateInmobiliariaDto) {
    return this.inmoService.create(createDto);
  }

  @Get()
  @Permissions(PERMISSIONS.INMO_VIEW)
  async findAll() {
    return this.inmoService.findAll();
  }

  //Cambio nueva ruta para estadísticas de inmobiliarias con procesos jurídicos
  //Cambio Santiago Obando Hurtado
  @Get('estadisticas/con-procesos')
  @Permissions(PERMISSIONS.INMO_VIEW)
  async getEstadisticasConProcesos() {
    return this.inmoService.getEstadisticasConProcesos();
  }

  
   // Retorna estadísticas de usuarios asignados a inmobiliarias con procesos

@Get('estadisticas/usuarios-con-procesos')
@Permissions(PERMISSIONS.INMO_VIEW)
async getEstadisticasUsuariosConProcesos() {
  return this.inmoService.getEstadisticasUsuariosConProcesos();
}
  
  @Get('send-import-reminder')
  @Permissions(PERMISSIONS.INMO_IMPORT)
  async sendImportReminder() {
    await this.mailService.sendImportReminderEmail();
    
    return { 
      ok: true, 
      message: 'Recordatorio enviado a los correos configurados.' 
    };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INMO_VIEW)
  async findOne(@Param('id') id: string) {
    return this.inmoService.findOne(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.INMO_EDIT)
  async update(
    @Param('id') id: string, 
    @Body() updateDto: UpdateInmobiliariaDto,
    @Req() req: any
  ) {
    const userEmail = req.user?.email || 'Sistema';
    
    return this.inmoService.update(id, updateDto, userEmail);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.INMO_ACTIVATE)
  async toggleStatus(@Param('id') id: string) {
    return this.inmoService.toggleStatus(id);
  }

  @Post('import')
  @Permissions(PERMISSIONS.INMO_IMPORT)
  @UseInterceptors(FileInterceptor('file'))
  async importInmobiliarias(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any
  ) {
    if (!file) throw new BadRequestException('No se ha subido ningún archivo');
    
    const userEmail = req.user?.email || 'Sistema';

    return this.inmoService.importInmobiliarias(file, userEmail);
  }
}