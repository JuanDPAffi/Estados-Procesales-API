import { Controller, Get, Post, Param, UseGuards, BadRequestException, NotFoundException, ForbiddenException, ParseIntPipe, Req, Query, Logger } from '@nestjs/common';
import { RedelexService } from '../services/redelex.service';
import { SystemOrJwtGuard } from '../../../common/guards/system-or-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/roles.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { ValidRoles } from '../../auth/schemas/user.schema';
import { RedelexMetricsInterceptor } from '../../../common/interceptors/redelex-metrics.interceptor';
import { UseInterceptors } from '@nestjs/common';

@UseGuards(SystemOrJwtGuard, RolesGuard)
@UseInterceptors(RedelexMetricsInterceptor)
@Controller('redelex')
export class RedelexController {
  private readonly logger = new Logger(RedelexController.name);
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
      procesos: respuestaServicio.procesos || [],
      redelex_ms: respuestaServicio.redelex_ms 
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
    
    const result = await this.redelexService.getProcesosByIdentificacion(identificacion, req.user);
    
    return {
        ...result,
        redelex_ms: (result as any).redelex_ms || 0 
    };
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
    const result = await this.redelexService.getProcesosComerciales(req.user, { page, limit, search });
    
    return {
        ...result,
        redelex_ms: (result as any).redelex_ms || 0
    };
  }

  @Post('trigger-daily-reports')
  @Permissions(PERMISSIONS.SYSTEM_CONFIG)
  async triggerDailyReports() {
    const result = await this.redelexService.sendDailyReports();
    return { success: true, ...result };
  }

  @Get('proceso/:id')
  async getProcesoDetalle(@Param('id', ParseIntPipe) id: number, @Req() req) {
    const user = req.user;
    const data = await this.redelexService.getProcesoDetalleById(id);
    if (!data) throw new NotFoundException('Proceso no encontrado');

    const redelex_ms = (data as any).redelex_ms || 0;

    const canViewAll = user.role === ValidRoles.ADMIN || 
      (user.permissions && user.permissions.includes(PERMISSIONS.PROCESOS_VIEW_ALL)) ||
      (user.permissions && user.permissions.includes(PERMISSIONS.COMMERCIAL_VIEW_GLOBAL));

    if (canViewAll) {
        return { success: true, data, redelex_ms };
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
            return { success: true, data, redelex_ms };
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
            return { success: true, data, redelex_ms };
        }
    }

    throw new ForbiddenException('No tienes permisos para ver este proceso o no pertenece a tu cartera.');
  }

  @Get('informe-inmobiliaria/:informeId')
  @Permissions(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.COMMERCIAL_VIEW_GLOBAL, PERMISSIONS.COMMERCIAL_VIEW_TEAM, PERMISSIONS.COMMERCIAL_VIEW_OWN)
  async getInformeInmobiliar(@Param('informeId', ParseIntPipe) informeId: number, @Req() req: any) {
    const data = await this.redelexService.getInformeInmobiliaria(informeId, req.user);
    
    return { 
        success: true, 
        count: data.length, 
        data,
        redelex_ms: (data as any).redelex_ms || 0
    };
  }

  @Post('sync-informe/:informeId')
  @Permissions(PERMISSIONS.SYSTEM_CONFIG) 
  async syncInformeCedula(@Param('informeId', ParseIntPipe) informeId: number) {
    const result = await this.redelexService.syncInformeCedulaProceso(informeId);
    
    return { 
        success: true, 
        message: 'Sincronización completada', 
        ...result,
        redelex_ms: (result as any).redelex_ms || 0
    };
  }
}