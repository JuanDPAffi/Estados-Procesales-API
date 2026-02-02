import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import axios from 'axios';
import { RedelexToken, RedelexTokenDocument } from '../schemas/redelex-token.schema';
import { CedulaProceso, CedulaProcesoDocument } from '../schemas/cedula-proceso.schema';
import { Inmobiliaria, InmobiliariaDocument } from '../../inmobiliaria/schema/inmobiliaria.schema';
import { SalesTeam, SalesTeamDocument } from '../../comercial/schemas/sales-team.schema';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { ValidRoles } from '../../auth/schemas/user.schema';
import { ProcesoDetalleDto, ProcesoResumenDto, ProcesosPorIdentificacionResponse, InformeCedulaItem, MedidaCautelarDto, InformeInmobiliariaRaw, InformeInmobiliariaDto } from '../dto/redelex.dto';
import { CambioEtapa, CambioEtapaDocument } from '../schemas/cambio-etapa.schema';
import { MsGraphMailAdapter } from '../../mail/adapters/ms-graph-mail.adapter';

@Injectable()
export class RedelexService {
  private readonly logger = new Logger(RedelexService.name);
  private readonly baseUrl = 'https://cloudapp.redelex.com/api';
  private readonly apiKey: string;
  private readonly INFORME_MIS_PROCESOS_ID = 5632;
  private readonly licenseId = '2117C477-209F-44F5-9587-783D9F25BA8B';
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor(
    @InjectModel(RedelexToken.name)
    private readonly redelexTokenModel: Model<RedelexTokenDocument>,
    @InjectModel(CedulaProceso.name)
    private readonly cedulaProcesoModel: Model<CedulaProcesoDocument>,
    @InjectModel(Inmobiliaria.name)
    private readonly inmoModel: Model<InmobiliariaDocument>,
    @InjectModel(SalesTeam.name)
    private readonly salesTeamModel: Model<SalesTeamDocument>,
    @InjectModel(CambioEtapa.name)
    private readonly cambioEtapaModel: Model<CambioEtapaDocument>,
    private readonly msGraphMailAdapter: MsGraphMailAdapter,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('REDELEX_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('REDELEX_API_KEY no está configurado');
    }
  }

  private getClienteClase(internalClass: string): string {
    if (!internalClass) return '';
    const c = internalClass.toUpperCase().trim();
    if (c.includes('EJECUTIVO SINGULAR')) return 'EJECUTIVO';
    if (c.includes('VERBAL SUMARIO')) return 'RESTITUCIÓN';
    return c;
  }

  private getClienteEtapa(internalStage: string): string {
    if (!internalStage) return 'DESCONOCIDO';
    const s = internalStage.toUpperCase().trim();

    if (s.includes('ALISTAMIENTO') || s.includes('DOCUMENTACION') || s.includes('ASIGNACION')) { return 'RECOLECCION Y VALIDACION DOCUMENTAL'; }    
    
    if (s === 'DEMANDA') return 'DEMANDA';
    
    if (s === 'MANDAMIENTO') return 'MANDAMIENTO DE PAGO';
    
    if (s === 'ADMISION') return 'ADMISION DEMANDA';
    
    if (['NOTIFICACION', 'EMPLAZAMIENTO'].includes(s)) return 'NOTIFICACION';
    
    if (['EXCEPCIONES', 'CONTESTACION'].includes(s)) return 'EXCEPCIONES';
    
    if (s === 'AUDIENCIA') return 'AUDIENCIA';
    
    if (s === 'SENTENCIA') return 'SENTENCIA';
    
    if (['LIQUIDACION', 'AVALUO', 'REMATE'].includes(s)) return 'LIQUIDACION';
    
    if (['LANZAMIENTO', 'ENTREGA'].includes(s)) return 'LANZAMIENTO';
    
    if (['TERMINACION', 'TERMINADO', 'DESISTIMIENTO'].includes(s)) return 'TERMINACION';

    return s;
  }

  public async calculateAllowedNits(user: any): Promise<{ isGlobal: boolean, allowedNits: string[] }> {
    let allowedNits: string[] = [];
    let isGlobal = false;
    const userEmail = user.email ? user.email.toLowerCase() : '';

    if (
      user.role === ValidRoles.ADMIN || 
      user.role === ValidRoles.AFFI ||
      this.hasPermission(user, 'procesos:view_all') ||
      this.hasPermission(user, PERMISSIONS.COMMERCIAL_VIEW_GLOBAL) 
    ) {
      isGlobal = true;
    }
    else if (this.hasPermission(user, PERMISSIONS.COMMERCIAL_VIEW_TEAM)) {
      const team = await this.salesTeamModel.findOne({ directorEmail: userEmail });
      
      if (team && team.accountManagersEmails && team.accountManagersEmails.length > 0) {
        const inmos = await this.inmoModel.find({ 
          assignedAccountManagerEmail: { $in: team.accountManagersEmails } 
        }).select('nit').lean();
        
        allowedNits = inmos.map(i => i.nit);
      }
    }
    else if (this.hasPermission(user, PERMISSIONS.COMMERCIAL_VIEW_OWN)) {
      const inmos = await this.inmoModel.find({ 
        assignedAccountManagerEmail: userEmail 
      }).select('nit').lean();
      
      allowedNits = inmos.map(i => i.nit);
    }

    return { isGlobal, allowedNits };
  }

  async getProcesosComerciales(user: any, filters: any = {}) {
    const { isGlobal, allowedNits } = await this.calculateAllowedNits(user);

    if (!isGlobal && allowedNits.length === 0) {
      return { 
        success: true, 
        data: [], 
        total: 0, 
        message: 'No tienes inmobiliarias asignadas bajo tu gestión.' 
      };
    }

    const query: any = {};

    if (!isGlobal) {
      query.$or = [
        { demandanteIdentificacion: { $in: allowedNits } },
        { demandadoIdentificacion: { $in: allowedNits } }
      ];
    }

    if (filters.search) {
      const regex = new RegExp(this.escapeRegex(filters.search), 'i');
      const searchConditions = [
        { numeroRadicacion: regex },
        { demandanteNombre: regex },
        { demandadoNombre: regex },
        { codigoAlterno: regex }
      ];

      if (isGlobal) {
        query.$or = searchConditions;
      } else {
        query.$and = [
          { $or: query.$or },
          { $or: searchConditions }
        ];
        delete query.$or;
      }
    }

    const limit = Number(filters.limit) || 20;
    const page = Number(filters.page) || 1;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.cedulaProcesoModel.find(query)
        .sort({ updatedAt: -1 }) 
        .skip(skip)
        .limit(limit)
        .lean(),
      this.cedulaProcesoModel.countDocuments(query)
    ]);

    return {
      success: true,
      total,
      page,
      limit,
      roleApplied: isGlobal ? 'GLOBAL' : 'SEGMENTADO',
      data: data.map(p => ({
        procesoId: p.procesoId,
        radicado: p.numeroRadicacion,
        demandante: p.demandanteNombre,
        demandado: p.demandadoNombre,
        etapa: p.etapaProcesal,
        clase: p.claseProceso,
        codigo: p.codigoAlterno,
        esDemandante: allowedNits.includes(p.demandanteIdentificacion),
        esDemandado: allowedNits.includes(p.demandadoIdentificacion),
        esPropio: allowedNits.includes(p.demandanteIdentificacion) || allowedNits.includes(p.demandadoIdentificacion)
      }))
    };
  }

  async getProcesosByIdentificacion(
    identificacion: string,
    user: any
  ): Promise<ProcesosPorIdentificacionResponse> {
    const value = identificacion.trim();
    const pattern = this.escapeRegex(value);

    const { isGlobal, allowedNits } = await this.calculateAllowedNits(user);

    if (!isGlobal && allowedNits.length === 0) {
       return { success: true, identificacion: value, procesos: [] };
    }

    const searchCondition = {
        $or: [
          { demandadoIdentificacion: { $regex: pattern, $options: 'i' } },
          { demandanteIdentificacion: { $regex: pattern, $options: 'i' } },
          { numeroRadicacion: { $regex: pattern, $options: 'i' } }, 
          { codigoAlterno: { $regex: pattern, $options: 'i' } }
        ]
    };

    let finalQuery: any = searchCondition;

    if (!isGlobal) {
        finalQuery = {
            $and: [
                searchCondition,
                {
                    $or: [
                        { demandanteIdentificacion: { $in: allowedNits } },
                        { demandadoIdentificacion: { $in: allowedNits } }
                    ]
                }
            ]
        };
    }

    const docs = await this.cedulaProcesoModel
      .find(finalQuery)
      .sort({ updatedAt: -1 });

    const procesos: ProcesoResumenDto[] = docs.map((d) => ({
      procesoId: d.procesoId,
      demandadoNombre: d.demandadoNombre || '',
      demandadoIdentificacion: d.demandadoIdentificacion || '',
      demandanteNombre: d.demandanteNombre || '',
      demandanteIdentificacion: d.demandanteIdentificacion || '',
      claseProceso: d.claseProceso || '',
      etapaProcesal: d.etapaProcesal || '', 
      numeroRadicacion: d.numeroRadicacion || '',
      codigoAlterno: d.codigoAlterno || ''
    }));

    return {
      success: true,
      identificacion: value,
      procesos,
    };
  }

  async getInformeInmobiliaria(
    informeId: number,
    user: any
  ): Promise<InformeInmobiliariaDto[]> {
    if (!this.apiKey) throw new Error('REDELEX_API_KEY no configurado');

    const { isGlobal, allowedNits } = await this.calculateAllowedNits(user);

    if (!isGlobal && allowedNits.length === 0) return [];

    const data = await this.secureRedelexGet(
      `${this.baseUrl}/Informes/GetInformeJson`,
      { token: this.apiKey, informeId },
    );

    const rawString = data.jsonString as string;
    if (!rawString) return [];

    const items = JSON.parse(rawString) as InformeInmobiliariaRaw[];

    let result = items.map((item) => ({
      idProceso: item['ID Proceso'],
      claseProceso: item['Clase Proceso'],
      demandadoIdentificacion: item['Demandado - Identificacion'],
      demandadoNombre: item['Demandado - Nombre'],
      demandanteIdentificacion: item['Demandante - Identificacion'],
      demandanteNombre: item['Demandante - Nombre'],
      codigoAlterno: item['Codigo Alterno'],
      etapaProcesal: item['Etapa Procesal'],
      fechaRecepcionProceso: item['Fecha Recepcion Proceso'],
      sentenciaPrimeraInstancia: item['Sentencia - Primera Instancia'],
      despacho: item['Despacho'],
      numeroRadicacion: item['Numero Radicacion']
        ? String(item['Numero Radicacion']).replace(/'/g, '')
        : '',
      ciudadInmueble: item['Ciudad'],
    }));

    if (!isGlobal) {
      result = result.filter(item => {
        const demte = String(item.demandanteIdentificacion || '').trim();
        const demdo = String(item.demandadoIdentificacion || '').trim();
        return allowedNits.includes(demte) || allowedNits.includes(demdo);
      });
    }

    return result;
  }

  private hasPermission(user: any, perm: string): boolean {
    if (!user) return false;
    if (user.role === ValidRoles.ADMIN) return true;
    return user.permissions && user.permissions.includes(perm);
  }

  async getValidAuthToken(): Promise<string> {
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }
    let tokenDoc = await this.redelexTokenModel.findOne().sort({ createdAt: -1 });
    if (!tokenDoc || new Date(Date.now() + 60000) > tokenDoc.expiresAt) {
      return await this.handleTokenRefresh();
    }
    return tokenDoc.token;
  }

  private async handleTokenRefresh(): Promise<string> {
    if (this.tokenRefreshPromise) return this.tokenRefreshPromise;
    this.tokenRefreshPromise = this.generateAndStoreToken().finally(() => {
      this.tokenRefreshPromise = null;
    });
    return this.tokenRefreshPromise;
  }

  private async generateAndStoreToken(): Promise<string> {
    if (!this.apiKey) throw new Error('REDELEX_API_KEY no configurado');
    const response = await axios.post(
      `${this.baseUrl}/apikeys/CreateApiKey`,
      { token: this.apiKey },
      { headers: { 'api-license-id': this.licenseId } },
    );
    const authToken = response.data.authToken;
    const expiresIn = response.data.expiresInSeconds || 86400;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await this.redelexTokenModel.deleteMany();
    await this.redelexTokenModel.create({ token: authToken, expiresAt });
    return authToken;
  }

  async secureRedelexGet(url: string, params: any = {}) {
    const t_start = performance.now();
    let token = await this.getValidAuthToken();
    const headers = { Authorization: `Bearer ${token}`, 'api-license-id': this.licenseId };
    
    try {
      const response = await axios.get(url, { params, headers });
      const t_end = performance.now();
      const data = response.data;
      data.redelex_ms = Math.round(t_end - t_start);
      return data;
    } catch (err: any) {
      if (err.response?.status === 401) {
        token = await this.handleTokenRefresh();
        headers.Authorization = `Bearer ${token}`;
        const retry = await axios.get(url, { params, headers });
        retry.data.redelex_ms = Math.round(performance.now() - t_start);
        return retry.data;
      }
      throw err;
    }
  }

  async getProcesoById(procesoId: number) {
    const t_start = performance.now();
    const token = await this.getValidAuthToken();
    const url = `${this.baseUrl}/Procesos/GetProcesoModulos`;
    const response = await axios.post(
      url,
      {
        procesoId: procesoId,
        modulos: ["P-SUJ", "P-ACT", "P-CPERS", "P-CALIF", "P-MEDC", "P-ABOGA", "P-ACTJU"],
        filtros: []
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'api-license-id': this.licenseId,
          'Content-Type': 'application/json',
        },
      },
    );
    const t_end = performance.now();
    const data = response.data;
    
    data.redelex_ms = Math.round(t_end - t_start);
    
    return data;
  }

  async getProcesoDetalleById(procesoId: number): Promise<any | null> {
    const raw = await this.getProcesoById(procesoId);
    if (!raw) return null;
    
    const mapped: any = this.mapRedelexProcesoToDto(raw);
    if (mapped) {
      mapped.redelex_ms = raw.redelex_ms;
    }
    return mapped;
  }

  async sendDailyReports() {
    this.logger.log('Iniciando proceso de generación de reportes diarios...');

    const hoy = new Date();
    const ayerInicio = new Date(hoy);
    ayerInicio.setDate(hoy.getDate() - 1);
    ayerInicio.setHours(0, 0, 0, 0);

    const ayerFin = new Date(ayerInicio);
    ayerFin.setHours(23, 59, 59, 999);
    
    const fechaReporteLegible = ayerInicio.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

    const inmosConUsuario = await this.inmoModel.find({ 
        isActive: true,
        emailRegistrado: { $exists: true, $ne: null, $nin: ["", " ", "null", "undefined", "NULL"] } 
    }).select('nit emailRegistrado').lean();

    if (inmosConUsuario.length === 0) {
        this.logger.warn('No se encontraron usuarios activos para enviar reportes.');
        return { message: 'Sin destinatarios válidos.' };
    }

    const cambiosRaw = await this.cambioEtapaModel.find({
        createdAt: { $gte: ayerInicio, $lte: ayerFin },
        reportado: false 
    }).sort({ createdAt: 1 }).lean();

    if (cambiosRaw.length === 0) {
        this.logger.log('No hubo cambios procesales en el día de ayer.');
    }

    const cambiosPorNit = new Map<string, Map<number, any>>();

    inmosConUsuario.forEach(inmo => {
        cambiosPorNit.set(inmo.nit, new Map<number, any>());
    });

    cambiosRaw.forEach(cambio => {
        const nit = cambio.demandanteIdentificacion;
        const pid = cambio.procesoId;

        if (cambiosPorNit.has(nit)) {
            const cambiosDeInmo = cambiosPorNit.get(nit);

            if (!cambiosDeInmo.has(pid)) {
                cambiosDeInmo.set(pid, {
                    idsParaMarcar: [cambio._id],
                    numeroRadicacion: cambio.numeroRadicacion,
                    demandadoNombre: cambio.demandadoNombre,
                    demandadoIdentificacion: cambio.demandadoIdentificacion,
                    despacho: cambio.despacho,
                    claseProceso: cambio.claseProceso,
                    etapaAnterior: cambio.etapaAnterior,
                    etapaActual: cambio.etapaActual
                });
            } else {
                const acumulado = cambiosDeInmo.get(pid);
                acumulado.etapaActual = cambio.etapaActual;
                acumulado.idsParaMarcar.push(cambio._id);
            }
        }
    });

    let enviados = 0;
    const todosLosIdsParaMarcar = [];

    for (const inmo of inmosConUsuario) {
        const mapaCambios = cambiosPorNit.get(inmo.nit);
        const listaConsolidada = Array.from(mapaCambios.values());
        const emailDestino = inmo.emailRegistrado;

        if (this.isValidEmail(emailDestino)) {
            try {
                await this.msGraphMailAdapter.sendDailyReportEmail(
                    emailDestino, 
                    listaConsolidada, 
                    fechaReporteLegible 
                );
                
                enviados++;
                
                listaConsolidada.forEach(c => todosLosIdsParaMarcar.push(...c.idsParaMarcar));

            } catch (e) {
                this.logger.error(`Fallo envío a ${emailDestino} (NIT: ${inmo.nit})`, e.message);
            }
        }
    }

    if (todosLosIdsParaMarcar.length > 0) {
        const updateResult = await this.cambioEtapaModel.updateMany(
            { _id: { $in: todosLosIdsParaMarcar } }, 
            { $set: { reportado: true, reportedAt: new Date() } }
        );
        this.logger.log(`Registros marcados como reportados: ${updateResult.modifiedCount}`);
    }
    
    return { 
        success: true,
        fechaReporte: fechaReporteLegible,
        usuariosProcesados: inmosConUsuario.length,
        correosEnviados: enviados,
        registrosBaseDeDatosAfectados: todosLosIdsParaMarcar.length 
    };
  }

  private isValidEmail(email: string): boolean {
      return email && email.includes('@') && !['null', 'undefined'].includes(email.toLowerCase());
  }

  async syncInformeCedulaProceso(informeId: number) {
    if (!this.apiKey) throw new Error('REDELEX_API_KEY no configurado');

    const data = await this.secureRedelexGet(
      `${this.baseUrl}/Informes/GetInformeJson`,
      { token: this.apiKey, informeId },
    );

    const redelexTime = data.redelex_ms || 0;

    const raw = data.jsonString as string;
    if (!raw) return { total: 0, upserted: 0, modified: 0, deleted: 0, redelex_ms: redelexTime };
    
    const items = JSON.parse(raw) as InformeCedulaItem[];
    const procesosMap = new Map<number, any>();

    for (const item of items) {
      const pId = Math.round(item['ID Proceso']);
      const rol = String(item['Sujeto Intervencion'] ?? '').toUpperCase().trim();

      if (!procesosMap.has(pId)) {
        procesosMap.set(pId, {
          procesoId: pId,
          numeroRadicacion: String(item['Numero Radicacion'] ?? '').replace(/'/g, '').trim(),
          codigoAlterno: String(item['Codigo Alterno'] ?? '').trim(),
          claseProceso: String(item['Clase Proceso'] ?? '').trim(),
          etapaProcesal: String(item['Etapa Procesal'] ?? '').trim(),
          despacho: String(item['Despacho'] ?? '').trim(), 
          demandadoNombre: '', 
          demandadoIdentificacion: '',
          demandanteNombre: '', 
          demandanteIdentificacion: ''
        });
      }

      const proceso = procesosMap.get(pId);
      if (rol === 'DEMANDANTE') {
        proceso.demandanteNombre = String(item['Sujeto Nombre'] ?? '').trim();
        proceso.demandanteIdentificacion = String(item['Sujeto Identificacion'] ?? '').trim();
      } else if (rol === 'DEMANDADO') {
        proceso.demandadoNombre = String(item['Sujeto Nombre'] ?? '').trim();
        proceso.demandadoIdentificacion = String(item['Sujeto Identificacion'] ?? '').trim();
      }
    }

    const procesosUnicos = Array.from(procesosMap.values());
    let upserted = 0; 
    let modified = 0; 
    const BATCH_SIZE = 1000;
    
    const cambiosDetectados = [];

    for (let i = 0; i < procesosUnicos.length; i += BATCH_SIZE) {
      const chunk = procesosUnicos.slice(i, i + BATCH_SIZE);
      const idsChunk = chunk.map(p => p.procesoId);
      
      // Consultamos el estado ACTUAL en BD antes de actualizar
      const procesosExistentes = await this.cedulaProcesoModel.find({
        procesoId: { $in: idsChunk }
      }).select('procesoId etapaProcesal').lean();

      const mapaExistentes = new Map(procesosExistentes.map(p => [p.procesoId, p]));

      for (const pNuevo of chunk) {
        const pViejo = mapaExistentes.get(pNuevo.procesoId);

        // LÓGICA DE DETECCIÓN INTELIGENTE DE CAMBIOS
        if (pViejo) {
          const etapaAnteriorCliente = this.getClienteEtapa(pViejo.etapaProcesal);
          const etapaActualCliente = this.getClienteEtapa(pNuevo.etapaProcesal);
          
          // 1. ¿Es un cambio visual para el cliente? (Ej: Documentación -> Asignación NO es cambio)
          const esCambioVisual = etapaAnteriorCliente !== etapaActualCliente;

          // 2. ¿La nueva etapa es reportable? (Terminación NO se notifica)
          const esReportable = etapaActualCliente !== 'TERMINACION';

          const esInicioProceso = etapaAnteriorCliente === 'DESCONOCIDO' && etapaActualCliente === 'RECOLECCION Y VALIDACION DOCUMENTAL';

          if (esCambioVisual && esReportable && !esInicioProceso) {
             cambiosDetectados.push({
                procesoId: pNuevo.procesoId,
                numeroRadicacion: pNuevo.numeroRadicacion,
                demandanteIdentificacion: pNuevo.demandanteIdentificacion,
                demandadoNombre: pNuevo.demandadoNombre,
                demandadoIdentificacion: pNuevo.demandadoIdentificacion,
                claseProceso: this.getClienteClase(pNuevo.claseProceso),
                despacho: pNuevo.despacho || 'No registrado',
                etapaAnterior: etapaAnteriorCliente,
                etapaActual: etapaActualCliente,
                reportado: false
             });
          }
        }
      }

      // Upsert en la colección principal (Mantiene los datos crudos/técnicos de Redelex)
      const bulkOps = chunk.map((p) => ({
        updateOne: { filter: { procesoId: p.procesoId }, update: { $set: p }, upsert: true },
      }));

      if (bulkOps.length > 0) {
        const res = await this.cedulaProcesoModel.bulkWrite(bulkOps, { ordered: false });
        upserted += res.upsertedCount; 
        modified += res.modifiedCount;
      }
    }

    // Guardamos los cambios detectados (ya filtrados y traducidos)
    if (cambiosDetectados.length > 0) {
      await this.cambioEtapaModel.insertMany(cambiosDetectados);
      this.logger.log(`Se registraron ${cambiosDetectados.length} cambios de etapa relevantes para cliente.`);
    }

    const idsProcesados = Array.from(procesosMap.keys());
    const deleteResult = await this.cedulaProcesoModel.deleteMany({ procesoId: { $nin: idsProcesados } });

    return { 
      total: procesosUnicos.length, 
      upserted, 
      modified, 
      deleted: deleteResult.deletedCount ?? 0,
      cambiosDetectados: cambiosDetectados.length,
      redelex_ms: redelexTime
    };
  }

  async getMisProcesosLive(userNit: string, nombreInmobiliaria: string = '') {
    if (!this.apiKey) throw new Error('REDELEX_API_KEY no configurado');
    const data = await this.secureRedelexGet(`${this.baseUrl}/Informes/GetInformeJson`, { token: this.apiKey, informeId: this.INFORME_MIS_PROCESOS_ID });
    const rawString = data.jsonString as string;
    if (!rawString) return { success: true, identificacion: userNit, procesos: [] };
    const items = JSON.parse(rawString) as any[];
    const procesosMap = new Map<number, any>();
    items.forEach((item) => {
      const id = Number(item['ID Proceso']);
      if (!id) return;
      if (!procesosMap.has(id)) {
        procesosMap.set(id, {
          procesoId: id,
          claseProceso: String(item['Clase Proceso'] ?? '').trim(),
          numeroRadicacion: String(item['Numero Radicacion'] ?? '').replace(/'/g, '').trim(),
          despacho: String(item['Despacho'] ?? '').trim(),
          etapaProcesal: String(item['Etapa Procesal'] ?? '').trim(),
          fechaRecepcionProceso: String(item['Fecha Recepcion Proceso'] ?? '').trim(),
          sentencia: String(item['Sentencia'] ?? '').trim(),
          ciudadInmueble: String(item['Ciudad'] ?? '').trim(),
          demandadoNombre: '', demandadoIdentificacion: '', demandanteNombre: '', demandanteIdentificacion: ''
        });
      }
      const proceso = procesosMap.get(id);
      const rol = String(item['Sujeto Intervencion'] || '').toUpperCase().trim();
      const idSujeto = String(item['Sujeto Identificacion'] || item['Identificacion'] || item['Nit'] || '').trim();
      const nombreSujeto = String(item['Sujeto Nombre'] || '').trim();
      if (rol === 'DEMANDANTE') { proceso.demandanteNombre = nombreSujeto; proceso.demandanteIdentificacion = idSujeto; } 
      else if (rol === 'DEMANDADO') { proceso.demandadoNombre = nombreSujeto; proceso.demandadoIdentificacion = idSujeto; }
    });
    const nitBusqueda = userNit.trim();
    const nombreBusqueda = nombreInmobiliaria.toUpperCase().replace(/\./g, '').replace(' SAS', '').replace(' S.A.S', '').trim();
    const procesosFiltrados = Array.from(procesosMap.values()).filter(p => {
        const clase = String(p.claseProceso || '').toUpperCase();
        const esClaseValida = clase.includes('EJECUTIVO SINGULAR') || clase.includes('VERBAL SUMARIO');
        if (!esClaseValida) return false;
        const idDemandante = String(p.demandanteIdentificacion || '');
        const nombreDemandante = String(p.demandanteNombre || '').toUpperCase();
        if (idDemandante && idDemandante.includes(nitBusqueda)) return true;
        if (!idDemandante && nombreBusqueda.length > 3 && nombreDemandante.includes(nombreBusqueda)) return true;
        return false;
    });
    return { 
      success: true, 
      identificacion: userNit, 
      procesos: procesosFiltrados,
      redelex_ms: data.redelex_ms
    };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private mapMedidaCautelar(medida: any): MedidaCautelarDto {
    return {
      tipoBien: medida.TipoBien ?? null, sujeto: medida.Sujeto ?? null, tipoMedida: medida.TipoMedida ?? null,
      descripcion: medida.Descripcion ?? null, medidaEfectiva: medida.MedidaEfectiva ?? null, avaluoJudicial: medida.AvaluoJudicial ?? null,
      observaciones: medida.Observaciones ?? null, identificacionSujeto: medida.Identificacion ?? null, area: medida.Area ?? null, fecha: medida.Fecha ?? null,
    };
  }

  private mapRedelexProcesoToDto(raw: any): ProcesoDetalleDto | null {
    if (!raw || !raw.proceso) return null;
    const p = raw.proceso;
    const sujetos = Array.isArray(p.Sujetos) ? p.Sujetos : [];
    const abogados = Array.isArray(p.Abogados) ? p.Abogados : [];
    const medidas = Array.isArray(p.MedidasCautelares) ? p.MedidasCautelares : [];
    const medidasValidas: MedidaCautelarDto[] = medidas.filter((m: any) => (m.MedidaEfectiva || '').trim().toUpperCase() !== 'N').map((m: any) => this.mapMedidaCautelar(m));
    const actuaciones = Array.isArray(p.Actuaciones) ? p.Actuaciones : [];
    const ultimaActuacionPrincipal = actuaciones.length > 0 ? actuaciones.filter((act: any) => (act.Cuaderno || '').trim() === 'Principal').sort((a: any, b: any) => new Date(b.FechaActuacion || 0).getTime() - new Date(a.FechaActuacion || 0).getTime())[0] : null;
    const actuacionesRecientesList = actuaciones.filter((act: any) => String(act.Cuaderno || '').toUpperCase().includes('PRINCIPAL')).sort((a: any, b: any) => new Date(b.FechaActuacion || 0).getTime() - new Date(a.FechaActuacion || 0).getTime()).map((act: any) => ({
        id: act.ActuacionId ? String(act.ActuacionId) : `act-${Math.random().toString(36).substr(2, 9)}`, 
        fecha: act.FechaActuacion, observacion: act.Observacion, etapa: act.Etapa, tipo: act.Tipo, cuaderno: act.Cuaderno
      }));
    const camposPersonalizados = Array.isArray(p.CamposPersonalizados) ? p.CamposPersonalizados : [];
    const campoUbicacionContrato = camposPersonalizados.find((c: any) => String(c.Nombre || '').toUpperCase().includes('UBICACION CONTRATO'));
    const calif = p.CalificacionContingenciaProceso || {};
    return {
      sujetos: sujetos, 
      idProceso: p.ProcesoId ?? null, 
      numeroRadicacion: p.Radicacion ?? null, 
      codigoAlterno: p.CodigoAlterno ?? null,
      claseProceso: p.ClaseProceso ?? null, 
      etapaProcesal: p.Etapa ?? null, 
      estado: p.Estado ?? null, 
      regional: p.Regional ?? null, 
      tema: p.Tema ?? null,
      despacho: p.DespachoConocimiento ?? null, 
      despachoOrigen: p.DespachoOrigen ?? null, 
      fechaAdmisionDemanda: p.FechaAdmisionDemanda ?? null,
      fechaCreacion: p.FechaCreacion ?? null, 
      fechaEntregaAbogado: p.FechaEntregaAbogado ?? null, 
      fechaRecepcionProceso: p.FechaRecepcionProceso ?? null,
      ubicacionContrato: campoUbicacionContrato?.Valor?.trim() ?? null, 
      camposPersonalizados: camposPersonalizados, 
      fechaAceptacionSubrogacion: null,
      fechaPresentacionSubrogacion: null, 
      motivoNoSubrogacion: null, 
      calificacion: calif.Calificacion ?? null, 
      sentenciaPrimeraInstanciaResultado: p.SentenciaPrimeraInstancia ?? null,
      sentenciaPrimeraInstanciaFecha: p.FechaSentenciaPrimeraInstancia ?? null, 
      medidasCautelares: medidasValidas, 
      ultimaActuacionFecha: ultimaActuacionPrincipal?.FechaActuacion ?? null,
      ultimaActuacionTipo: ultimaActuacionPrincipal?.Tipo ?? null, 
      ultimaActuacionObservacion: ultimaActuacionPrincipal?.Observacion ?? null, 
      actuacionesRecientes: actuacionesRecientesList, 
      abogados: abogados,
    };
  }
}
