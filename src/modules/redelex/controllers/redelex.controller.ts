import { Controller, Get, Post, Param, UseGuards, BadRequestException, NotFoundException, ForbiddenException, ParseIntPipe, Req, Query, Logger } from '@nestjs/common';
import { RedelexService } from '../services/redelex.service';
import { SystemOrJwtGuard } from '../../../common/guards/system-or-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/roles.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { ValidRoles } from '../../auth/schemas/user.schema';

@UseGuards(SystemOrJwtGuard, RolesGuard)
@Controller('redelex')
export class RedelexController {
  private readonly logger = new Logger(RedelexController.name);
  constructor(private readonly redelexService: RedelexService) {}

  @Get('mis-procesos')
  @Permissions(PERMISSIONS.PROCESOS_VIEW_OWN)
  async getMisProcesos(@Req() req) {
    this.logger.log(`[a1] Request recibida en GET /mis-procesos - Usuario: ${req.user?.email}`);
    const user = req.user;
    const userNit = user.nit;
    const nombreInmobiliaria = user.nombreInmobiliaria || user.name || 'Usuario'; 

    if (!userNit) throw new BadRequestException('Su usuario no tiene un NIT asociado.');

    const respuestaServicio = await this.redelexService.getMisProcesosLive(userNit);

    const result = {
      success: true,
      identificacion: userNit,
      nombreInmobiliaria: nombreInmobiliaria,
      procesos: respuestaServicio.procesos || []
    };

    this.logger.log(`[a4] Respondiendo al cliente en /mis-procesos - Procesos encontrados: ${result.procesos.length}`);
    return result;
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
    this.logger.log(`[a1] Request recibida en GET /procesos-por-identificacion/${identificacion} - Usuario: ${req.user?.email}`);
    
    if (!identificacion) throw new BadRequestException('La identificación es obligatoria');
    
    const result = await this.redelexService.getProcesosByIdentificacion(identificacion, req.user);
    
    this.logger.log(`[a4] Respondiendo al cliente en /procesos-por-identificacion - Items: ${result.procesos?.length}`);
    return result;
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
    this.logger.log(`[a1] Request recibida en GET /tablero-comercial - Usuario: ${req.user?.email} - Search: ${search}`);
    
    const result = await this.redelexService.getProcesosComerciales(req.user, { page, limit, search });
    
    this.logger.log(`[a4] Respondiendo al cliente en /tablero-comercial - Total data: ${result.data?.length}`);
    return result;
  }

  @Get('proceso/:id')
  async getProcesoDetalle(@Param('id', ParseIntPipe) id: number, @Req() req) {
    this.logger.log(`[a1] Request recibida en GET /proceso/${id} - Usuario: ${req.user?.email}`);
    const user = req.user;
    const data = await this.redelexService.getProcesoDetalleById(id);
    if (!data) throw new NotFoundException('Proceso no encontrado');

    const canViewAll = user.role === ValidRoles.ADMIN || 
      (user.permissions && user.permissions.includes(PERMISSIONS.PROCESOS_VIEW_ALL)) ||
      (user.permissions && user.permissions.includes(PERMISSIONS.COMMERCIAL_VIEW_GLOBAL));

    if (canViewAll) {
        this.logger.log(`[a4] Respondiendo detalle proceso ${id} (Acceso Global)`);
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
            this.logger.log(`[a4] Respondiendo detalle proceso ${id} (Acceso Comercial Segmentado)`);
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
            this.logger.log(`[a4] Respondiendo detalle proceso ${id} (Acceso Propio por NIT)`);
            return { success: true, data };
        }
    }

    throw new ForbiddenException('No tienes permisos para ver este proceso o no pertenece a tu cartera.');
  }

  @Get('informe-inmobiliaria/:informeId')
  @Permissions(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.COMMERCIAL_VIEW_GLOBAL, PERMISSIONS.COMMERCIAL_VIEW_TEAM, PERMISSIONS.COMMERCIAL_VIEW_OWN)
  async getInformeInmobiliar(@Param('informeId', ParseIntPipe) informeId: number, @Req() req: any) {
    this.logger.log(`[a1] Request recibida en GET /informe-inmobiliaria/${informeId} - Usuario: ${req.user?.email}`);

    const data = await this.redelexService.getInformeInmobiliaria(informeId, req.user);
    const response = { success: true, count: data.length, data };
    
    this.logger.log(`[a4] Respondiendo al cliente informe ${informeId} - Items: ${data.length}`);
    return response;
  }

  @Post('sync-informe/:informeId')
  @Permissions(PERMISSIONS.SYSTEM_CONFIG) 
  async syncInformeCedula(@Param('informeId', ParseIntPipe) informeId: number) {
    this.logger.log(`[a1] Request recibida en POST /sync-informe/${informeId}`);
    
    const result = await this.redelexService.syncInformeCedulaProceso(informeId);
    
    this.logger.log(`[a4] Sincronización finalizada. Total: ${result.total}, Upserted: ${result.upserted}`);
    return { success: true, message: 'Sincronización completada', ...result };
  }
}