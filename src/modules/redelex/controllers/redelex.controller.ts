import { Controller, Get, Post, Param, UseGuards, BadRequestException, NotFoundException, ForbiddenException, ParseIntPipe, Req, Query } from '@nestjs/common';
import { RedelexService } from '../services/redelex.service';
import { SystemOrJwtGuard } from '../../../common/guards/system-or-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/roles.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { ValidRoles } from '../../auth/schemas/user.schema';

@UseGuards(SystemOrJwtGuard, RolesGuard)
@Controller('redelex')
export class RedelexController {
  constructor(private readonly redelexService: RedelexService) {}

  @Get('mis-procesos')
  @Permissions(PERMISSIONS.PROCESOS_VIEW_OWN)
  async getMisProcesos(@Req() req) {
    const user = req.user;
    const userNit = user.nit;
    const nombreInmobiliaria = user.nombreInmobiliaria || user.name || 'Usuario'; 

    if (!userNit) throw new BadRequestException('Su usuario no tiene un NIT asociado.');

    const respuestaServicio = await this.redelexService.getMisProcesosLive(userNit);

    return {
      success: true,
      identificacion: userNit,
      nombreInmobiliaria: nombreInmobiliaria,
      procesos: respuestaServicio.procesos || []
    };
  }

  @Get('procesos-por-identificacion/:identificacion')
  @Permissions(
      PERMISSIONS.PROCESOS_VIEW_ALL, 
      PERMISSIONS.COMMERCIAL_VIEW_GLOBAL,
      PERMISSIONS.COMMERCIAL_VIEW_TEAM,
      PERMISSIONS.COMMERCIAL_VIEW_OWN
  )
  async getProcesosPorIdentificacion(
      @Param('identificacion') identificacion: string,
      @Req() req: any 
  ) {
    if (!identificacion) throw new BadRequestException('La identificación es obligatoria');
    return this.redelexService.getProcesosByIdentificacion(identificacion, req.user);
  }

  @Get('tablero-comercial')
  @Permissions(
      PERMISSIONS.COMMERCIAL_VIEW_GLOBAL, 
      PERMISSIONS.COMMERCIAL_VIEW_TEAM, 
      PERMISSIONS.COMMERCIAL_VIEW_OWN,
      PERMISSIONS.PROCESOS_VIEW_ALL
  )
  async getTableroComercial(
    @Req() req, 
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('search') search: string
  ) {
    return this.redelexService.getProcesosComerciales(req.user, { page, limit, search });
  }

  @Get('proceso/:id')
  async getProcesoDetalle(@Param('id', ParseIntPipe) id: number, @Req() req) {
    const user = req.user;
    
    const data = await this.redelexService.getProcesoDetalleById(id);
    if (!data) throw new NotFoundException('Proceso no encontrado');

    const canViewAll = user.role === ValidRoles.ADMIN || 
      (user.permissions && user.permissions.includes(PERMISSIONS.PROCESOS_VIEW_ALL)) ||
      (user.permissions && user.permissions.includes(PERMISSIONS.COMMERCIAL_VIEW_GLOBAL));

    if (canViewAll) {
        return { success: true, data };
    }

    if (!data.sujetos || !Array.isArray(data.sujetos)) {
       throw new ForbiddenException('Datos del proceso protegidos.');
    }

    if (
        (user.permissions && user.permissions.includes(PERMISSIONS.COMMERCIAL_VIEW_TEAM)) ||
        (user.permissions && user.permissions.includes(PERMISSIONS.COMMERCIAL_VIEW_OWN))
    ) {
        const { allowedNits } = await this.redelexService.calculateAllowedNits(user);
        
        const esClienteSuyo = data.sujetos.some((sujeto: any) => {
            const rawId = sujeto.NumeroIdentificacion || sujeto.Identificacion || '';
            const idLimpio = String(rawId).replace(/[^0-9]/g, ''); 
            return allowedNits.includes(rawId) || allowedNits.some(nit => String(nit).includes(idLimpio));
        });

        if (esClienteSuyo) {
            return { success: true, data };
        }
    }

    const userNit = user.nit;
    if (userNit) {
        const cleanUserNit = String(userNit).replace(/[^0-9]/g, '');
        
        const esPropio = data.sujetos.some((sujeto: any) => {
          const rawId = sujeto.NumeroIdentificacion || sujeto.Identificacion || '';
          const cleanIdSujeto = String(rawId).replace(/[^0-9]/g, '');
          return cleanIdSujeto.includes(cleanUserNit) || cleanUserNit.includes(cleanIdSujeto);
        });

        if (esPropio) {
            return { success: true, data };
        }
    }

    throw new ForbiddenException('No tienes permisos para ver este proceso o no pertenece a tu cartera.');
  }

  @Get('informe-inmobiliaria/:informeId')
  @Permissions(
      PERMISSIONS.REPORTS_VIEW, 
      PERMISSIONS.COMMERCIAL_VIEW_GLOBAL,
      PERMISSIONS.COMMERCIAL_VIEW_TEAM,
      PERMISSIONS.COMMERCIAL_VIEW_OWN
  )
  async getInformeInmobiliar(
      @Param('informeId', ParseIntPipe) informeId: number,
      @Req() req: any
  ) {
    const data = await this.redelexService.getInformeInmobiliaria(informeId, req.user);
    return { success: true, count: data.length, data };
  }

  @Post('sync-informe/:informeId')
  @Permissions(PERMISSIONS.SYSTEM_CONFIG) 
  async syncInformeCedula(@Param('informeId', ParseIntPipe) informeId: number) {
    const result = await this.redelexService.syncInformeCedulaProceso(informeId);
    return { success: true, message: 'Sincronización completada', ...result };
  }
}