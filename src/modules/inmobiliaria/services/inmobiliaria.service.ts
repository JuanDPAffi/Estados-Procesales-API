import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as xlsx from 'xlsx';
import { Inmobiliaria, InmobiliariaDocument } from '../schema/inmobiliaria.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { CreateInmobiliariaDto, UpdateInmobiliariaDto } from '../dto/inmobiliaria.dto';
import { Pool } from 'pg';

@Injectable()
export class InmobiliariaService {
  private readonly PROTECTED_NITS = ['900053370']; 
  
  private readonly logger = new Logger(InmobiliariaService.name);
  
  private pgPool = new Pool({
    host: process.env.EXTERNAL_DB_HOST,
    port: parseInt(process.env.EXTERNAL_DB_PORT || '5432'),
    user: process.env.EXTERNAL_DB_USER,
    password: process.env.EXTERNAL_DB_PASS,
  });

  constructor(
    @InjectModel(Inmobiliaria.name) private readonly inmoModel: Model<InmobiliariaDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findOneByNit(nit: string) {
    // Normalizamos por si llega con puntos o guiones
    const cleanNit = this.normalizeNit(nit);
    // Buscamos y devolvemos solo lo necesario
    return this.inmoModel.findOne({ nit: cleanNit })
      .select('nombreInmobiliaria nit zonaAffi cluster montoAfianzado cantidadContratos nombreRepresentante emailRepresentante equipoComercial')
      .exec();
  }

  private normalizeNit(nit: any): string {
    if (!nit) return '';
    return String(nit).replace(/\D/g, ''); 
  }

  async create(createDto: CreateInmobiliariaDto) {
    createDto.nit = this.normalizeNit(createDto.nit);
    const existing = await this.inmoModel.findOne({ nit: createDto.nit, codigo: createDto.codigo });
    if (existing) throw new ConflictException('Ya existe una inmobiliaria con ese NIT y Código');
    const newInmo = new this.inmoModel(createDto);
    return newInmo.save();
  }

  async findAll() {
    const inmos = await this.inmoModel.find().sort({ createdAt: -1 }).lean().exec();
    
    const nitsWithProcesos = await this.inmoModel.db.collection('cedulaprocesos').distinct('demandanteIdentificacion');
    const nitsSet = new Set(nitsWithProcesos);

    return inmos.map(inmo => ({
      ...inmo,
      _id: inmo._id.toString(),
      tieneProcesos: nitsSet.has(inmo.nit)
    }));
  }

  async findOne(id: string) {
    const inmo = await this.inmoModel.findById(id);
    if (!inmo) throw new NotFoundException('Inmobiliaria no encontrada');
    return inmo;
  }

  async update(id: string, updateDto: UpdateInmobiliariaDto, userEmail: string = 'Sistema') {
    if (updateDto.nit) {
        updateDto.nit = this.normalizeNit(updateDto.nit);
    }

    const dataToUpdate = {
      ...updateDto,
      modifiedBy: userEmail,
      modificationSource: 'Edición Manual'
    };
    const updatedInmo = await this.inmoModel.findByIdAndUpdate(id, dataToUpdate, { new: true });
    if (!updatedInmo) throw new NotFoundException('Inmobiliaria no encontrada');
    
    if (updateDto.isActive !== undefined) {
       await this.syncUserStatus(updatedInmo.nit, updatedInmo.isActive);
    }
    return updatedInmo;
  }

  async toggleStatus(id: string) {
    const inmo = await this.inmoModel.findById(id);
    if (!inmo) throw new NotFoundException('Inmobiliaria no encontrada');
    inmo.isActive = !inmo.isActive;
    await inmo.save();
    await this.syncUserStatus(inmo.nit, inmo.isActive);
    return { message: `Inmobiliaria y usuarios ${inmo.isActive ? 'activados' : 'desactivados'}`, isActive: inmo.isActive };
  }

  private async syncUserStatus(nit: string, isActive: boolean) {
    await this.userModel.updateMany({ nit: nit }, { $set: { isActive: isActive } });
  }

  async syncFromExternalDb(userEmail: string = 'Sistema Automático') {
    const client = await this.pgPool.connect();
    try {
      this.logger.log('Iniciando sincronización desde PostgreSQL...');

      const query = `
        select
            a.fchempresa as Cod_Inmobiliaria,
            a.fvcnit as nit,
            a.fvcnombreempresa as inmobiliaria,
            case
                when i.fchestado = 'A' then 'Activo'
                else 'Inactivo'
            end as estado_inmobiliaria,
            o.fsmOficina as codigo_oficina,
            o.fvcnombreoficina as oficina,
            c.fvcnombreciudad as ciudad,
            c.fvcnombredpto as departamento,
            m.fvcdescripcion as zona,
            o.fnutelefono as Telefono,
            i.fvcemail as Email,
            o.fvcnombrealiado as Asesor_Afiansa,
            i.fdtfechainiciofianza as Fecha_Incio_Fianza
        from
            colocaciones.parinmobiliarias i,
            seguridad.parempresa a
            left join (
                select
                    a.*,
                    b.fincodaliado,
                    b.fvcnombrealiado
                from
                    seguridad.paroficina a
                    left outer join (
                        select
                            c.*,
                            d.fvcnombrealiado
                        from
                            solicitudes.paraliadofinanciero d,
                            solicitudes.paraliadoasociaciones c
                        where
                            c.fincodaliado = d.fincodaliado
                            and d.fvctipoaliado = 'Asesores'
                    ) b on a.fchempresa = b.fchempresa
                    and a.fsmOficina = b.finoficina
            ) o on a.fchempresa = o.fchempresa
            left join public.parciudades c on o.fvccodciudad = c.fvccodciudad
            left join public.parmiscelaneos m on fvccodigo = o.fchzona
            and fvctabla = 'ZonaOficinas'
        where
            i.fchempresa = a.fchempresa
        order by
            a.fchempresa,
            o.fsmoficina;
      `;

      const result = await client.query(query);
      const rows = result.rows;
      
      this.logger.log(`Registros obtenidos de PostgreSQL: ${rows.length}`);

      if (rows.length === 0) {
        return { message: 'No se encontraron registros en la base de datos externa.' };
      }

      const normalizedData = rows.map(row => ({
        nit: this.normalizeNit(row.nit),
        codigo: String(row.cod_inmobiliaria).trim(),
        nombreInmobiliaria: String(row.inmobiliaria).trim(),
        departamento: String(row.departamento || '').trim(),
        ciudad: String(row.ciudad || '').trim(),
        isActive: row.estado_inmobiliaria === 'Activo',
        fechaInicioFianza: row.fecha_incio_fianza || null,
        telefono: String(row.telefono || '').trim(),
        emailContacto: String(row.email || '').trim().toLowerCase()
      }));

      return await this.processBatch(normalizedData, userEmail, 'Sincronización DB Automática');

    } catch (error) {
      this.logger.error('Error sincronizando con Postgres', error);
      throw new BadRequestException('Fallo en la conexión o consulta a base de datos externa');
    } finally {
      client.release();
    }
  }

  async importInmobiliarias(file: Express.Multer.File, userEmail: string = 'Sistema') {
    const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!rawData || rawData.length === 0) {
      throw new BadRequestException('El archivo Excel está vacío o no tiene formato válido');
    }

    const uniqueRawData = new Map<string, any>();
    rawData.forEach((row: any) => {
      const codigo = String(row['Cod. Inmobiliaria'] || row['Cod Inmobiliaria'] || '').trim();
      if (codigo && !uniqueRawData.has(codigo)) uniqueRawData.set(codigo, row);
    });

    const normalizedData = Array.from(uniqueRawData.values()).map((row: any) => {
      const estadoExcel = String(row['Estado Inmobiliaria'] || '').trim();
      return {
        nit: this.normalizeNit(row['Nit'] || row['NIT']),
        codigo: String(row['Cod. Inmobiliaria'] || row['Cod Inmobiliaria'] || '').trim(),
        nombreInmobiliaria: String(row['Inmobiliaria'] || row['NOMBRE'] || '').trim(),
        fechaInicioFianza: row['Fecha Incio Fianza'] || row['Fecha Inicio'] || null,
        departamento: String(row['Departamento'] || '').trim(),
        ciudad: String(row['Ciudad'] || '').trim(),
        telefono: String(row['Telefono'] || '').trim(),
        emailContacto: String(row['Email'] || row['EMAIL'] || '').trim().toLowerCase(), 
        isActive: estadoExcel === 'Activa'
      };
    }).filter(item => item.nit && item.codigo);

    if (normalizedData.length === 0) throw new BadRequestException('No se encontraron registros válidos.');

    return await this.processBatch(normalizedData, userEmail, 'Importación Excel');
  }

  private async processBatch(incomingData: any[], userEmail: string, source: string) {
    // 1. Obtener datos actuales para comparar cambios (Optimización de memoria)
    // Solo traemos lo necesario para saber si vale la pena actualizar
    const currentInmosDocs = await this.inmoModel.find().select(
      'nit codigo nombreInmobiliaria fechaInicioFianza departamento ciudad telefono emailContacto isActive'
    );
    
    const currentMap = new Map(currentInmosDocs.map(d => [d.codigo, d]));
    const incomingCodesSet = new Set(incomingData.map(i => i.codigo));

    let created = 0;
    let updated = 0;
    let deactivated = 0;

    const inmoOperations = [];
    // Array para acumular los NITs que deben actualizar su estado de usuario al final
    const nitsToUpdateUsers: { nit: string, isActive: boolean }[] = [];

    // 2. Procesar datos entrantes (Crear o Actualizar)
    for (const item of incomingData) {
        const existing = currentMap.get(item.codigo);

        if (existing) {
          // Detectar si realmente hubo cambios para evitar escrituras innecesarias en BD
          const hasChanges = 
            existing.nit !== item.nit ||
            existing.nombreInmobiliaria !== item.nombreInmobiliaria ||
            existing.departamento !== item.departamento ||
            existing.ciudad !== item.ciudad ||
            existing.isActive !== item.isActive ||
            (item.telefono && existing.telefono !== item.telefono) ||
            (item.emailContacto && existing.emailContacto !== item.emailContacto) ||
            this.datesAreDifferent(existing.fechaInicioFianza, item.fechaInicioFianza);

          if (hasChanges) {
             const setFields: any = {
                nit: item.nit, // AQUÍ es donde se corrige el NIT si venía mal
                nombreInmobiliaria: item.nombreInmobiliaria,
                departamento: item.departamento,
                ciudad: item.ciudad,
                isActive: item.isActive,
                modifiedBy: userEmail,
                modificationSource: source,
                updatedAt: new Date()
             };

             if (item.fechaInicioFianza) setFields.fechaInicioFianza = item.fechaInicioFianza;
             if (item.telefono) setFields.telefono = item.telefono;
             if (item.emailContacto) setFields.emailContacto = item.emailContacto;

             inmoOperations.push({
               updateOne: {
                 filter: { codigo: item.codigo }, // FILTRO CORRECTO: Solo por Código
                 update: { $set: setFields }
               }
             });
             updated++;
             nitsToUpdateUsers.push({ nit: item.nit, isActive: item.isActive });
          }
        } else {
          // Es nuevo: Upsert True
          inmoOperations.push({
            updateOne: {
              filter: { codigo: item.codigo }, // FILTRO CORRECTO: Solo por Código
              update: { 
                $set: { ...item, modifiedBy: userEmail, modificationSource: source },
                $setOnInsert: { emailRegistrado: null, createdAt: new Date() }
              },
              upsert: true
            }
          });
          created++;
          nitsToUpdateUsers.push({ nit: item.nit, isActive: item.isActive });
        }
    }

    // 3. Procesar Inactivaciones (Los que estaban en BD pero NO llegaron en el Excel)
    const codesToDeactivate: string[] = [];
    for (const doc of currentInmosDocs) {
        if (!incomingCodesSet.has(doc.codigo)) {
            if (!this.PROTECTED_NITS.includes(doc.nit) && doc.isActive) {
                codesToDeactivate.push(doc.codigo);
                nitsToUpdateUsers.push({ nit: doc.nit, isActive: false });
            }
        }
    }
    
    if (codesToDeactivate.length > 0) {
      inmoOperations.push({
        updateMany: {
          filter: { codigo: { $in: codesToDeactivate } },
          update: { 
            $set: { 
              isActive: false,
              modifiedBy: userEmail,
              modificationSource: `${source} (Ausente)`
            } 
          }
        }
      });
      deactivated = codesToDeactivate.length;
    }

    // 4. Ejecución Segura en Base de Datos
    if (inmoOperations.length > 0) {
      try {
        // ordered: false es CRÍTICO aquí. Permite que si una fila falla, las demás continúen.
        await this.inmoModel.bulkWrite(inmoOperations, { ordered: false });
      } catch (error) {
        // Capturamos error E11000 (Duplicate Key) u otros errores de escritura parcial
        if (error.code === 11000 || (error.writeErrors && error.writeErrors.length > 0)) {
           const countErrores = error.writeErrors ? error.writeErrors.length : 1;
           this.logger.warn(`Advertencia en carga masiva: ${countErrores} registros fallaron (probablemente duplicados en BD), pero el resto se procesó.`);
           
           // Ajustar contadores (restar los fallidos si es necesario para el reporte)
           // Esto es visual, lo importante es que el proceso NO se detuvo.
        } else {
           // Si es un error grave de conexión, lo relanzamos
           throw error;
        }
      }
    }

    // 5. Sincronización de Usuarios (Usuarios asociados a las inmobiliarias procesadas)
    // Filtramos para obtener listas únicas de NITs a activar/desactivar
    const nitsToActivate = [...new Set(nitsToUpdateUsers.filter(x => x.isActive).map(x => x.nit))];
    const nitsToBlock = [...new Set(nitsToUpdateUsers.filter(x => !x.isActive).map(x => x.nit))];

    if (nitsToActivate.length > 0) await this.userModel.updateMany({ nit: { $in: nitsToActivate } }, { $set: { isActive: true } });
    if (nitsToBlock.length > 0) await this.userModel.updateMany({ nit: { $in: nitsToBlock } }, { $set: { isActive: false } });

    return {
      message: 'Sincronización completada',
      resumen: {
        procesados_origen: incomingData.length,
        nuevos: created,
        actualizados: updated,
        inactivados: deactivated
      }
    };
  }

  private datesAreDifferent(d1: any, d2: any): boolean {
    if (!d1 && !d2) return false;
    if (!d2) return false;
    const time1 = d1 ? new Date(d1).getTime() : 0;
    const time2 = d2 ? new Date(d2).getTime() : 0;
    return Math.abs(time1 - time2) > 1000;
  }

  async getEstadisticasConProcesos() {
    try {
      const todasInmobiliarias = await this.inmoModel.find().select('nit isActive nombreInmobiliaria').exec();
      const coleccionProcesos = this.inmoModel.db.collection('cedulaprocesos');
      const totalProcesos = await coleccionProcesos.countDocuments();

      if (totalProcesos === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          activas: { cantidad: 0, porcentaje: 0 },
          inactivas: { cantidad: 0, porcentaje: 0 },
          otrosDemandantes: { cantidad: 0, porcentaje: 0 }
        };
      }

      const nitsConProcesos = await coleccionProcesos.distinct('demandanteIdentificacion');
      const nitsValidos = nitsConProcesos.filter(nit => nit && nit.trim() !== '');
      
      const nitsValidosSet = new Set(nitsValidos);
      const inmobiliariasConProcesos = todasInmobiliarias.filter(inmo => 
        nitsValidosSet.has(inmo.nit)
      );

      const otrosDemandantesCount = nitsValidos.length - inmobiliariasConProcesos.length;
      
      // Totales para cálculo
      const totalClientes = inmobiliariasConProcesos.length; // Inmobiliarias encontradas
      const totalUniverso = nitsValidos.length; // Total de NITs únicos (Clientes + Externos)

      if (totalClientes === 0 && otrosDemandantesCount === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          activas: { cantidad: 0, porcentaje: 0 },
          inactivas: { cantidad: 0, porcentaje: 0 },
          otrosDemandantes: { cantidad: 0, porcentaje: 0 }
        };
      }

      const activasCount = inmobiliariasConProcesos.filter(inmo => inmo.isActive).length;
      const inactivasCount = inmobiliariasConProcesos.filter(inmo => !inmo.isActive).length;

      // --- CORRECCIÓN APLICADA AQUÍ ---
      // Usamos 'totalUniverso' como divisor para TODOS los porcentajes para que sumen 100%
      const porcentajeActivas = totalUniverso > 0 ? Math.round((activasCount / totalUniverso) * 100 * 100) / 100 : 0;
      const porcentajeInactivas = totalUniverso > 0 ? Math.round((inactivasCount / totalUniverso) * 100 * 100) / 100 : 0;
      const porcentajeOtros = totalUniverso > 0 ? Math.round((otrosDemandantesCount / totalUniverso) * 100 * 100) / 100 : 0;

      return {
        totalInmobiliariasConProcesos: totalClientes,
        activas: {
          cantidad: activasCount,
          porcentaje: porcentajeActivas
        },
        inactivas: {
          cantidad: inactivasCount,
          porcentaje: porcentajeInactivas
        },
        otrosDemandantes: {
          cantidad: otrosDemandantesCount,
          porcentaje: porcentajeOtros
        }
      };
    } catch (error) {
      console.error('[EstadisticasProcesos] Error:', error);
      return {
        totalInmobiliariasConProcesos: 0,
        activas: { cantidad: 0, porcentaje: 0 },
        inactivas: { cantidad: 0, porcentaje: 0 },
        otrosDemandantes: { cantidad: 0, porcentaje: 0 }
      };
    }
  }

  async getEstadisticasUsuariosConProcesos() {
    try {
      const coleccionProcesos = this.inmoModel.db.collection('cedulaprocesos');
      const totalProcesos = await coleccionProcesos.countDocuments();
      
      if (totalProcesos === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          conUsuarioActivo: { cantidad: 0, porcentaje: 0 },
          conUsuarioInactivo: { cantidad: 0, porcentaje: 0 },
          sinUsuario: { cantidad: 0, porcentaje: 0 }
        };
      }

      const nitsConProcesos = await coleccionProcesos.distinct('demandanteIdentificacion');

      if (nitsConProcesos.length === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          conUsuarioActivo: { cantidad: 0, porcentaje: 0 },
          conUsuarioInactivo: { cantidad: 0, porcentaje: 0 },
          sinUsuario: { cantidad: 0, porcentaje: 0 }
        };
      }

      const inmobiliariasConProcesos = await this.inmoModel.find({
        nit: { $in: nitsConProcesos }
      }).select('nit emailRegistrado nombreInmobiliaria').exec();

      const total = inmobiliariasConProcesos.length;

      if (total === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          conUsuarioActivo: { cantidad: 0, porcentaje: 0 },
          conUsuarioInactivo: { cantidad: 0, porcentaje: 0 },
          sinUsuario: { cantidad: 0, porcentaje: 0 }
        };
      }

      const nitsInmobiliarias = inmobiliariasConProcesos.map(i => i.nit);
      
      const usuariosPorNit = await this.userModel.find({
        nit: { $in: nitsInmobiliarias },
        role: 'inmobiliaria'
      }).select('nit email isActive').exec();

      const mapaUsuarios = new Map();
      usuariosPorNit.forEach(user => {
        if (user.nit) {
          mapaUsuarios.set(user.nit, user.isActive);
        }
      });

      let conUsuarioActivo = 0;
      let conUsuarioInactivo = 0;
      let sinUsuario = 0;

      inmobiliariasConProcesos.forEach(inmo => {
        if (mapaUsuarios.has(inmo.nit)) {
          if (mapaUsuarios.get(inmo.nit)) {
            conUsuarioActivo++;
          } else {
            conUsuarioInactivo++;
          }
        } else {
          sinUsuario++;
        }
      });

      const pctUsuarioActivo = total > 0 ? Math.round((conUsuarioActivo / total) * 100 * 100) / 100 : 0;
      const pctUsuarioInactivo = total > 0 ? Math.round((conUsuarioInactivo / total) * 100 * 100) / 100 : 0;
      const pctSinUsuario = total > 0 ? Math.round((sinUsuario / total) * 100 * 100) / 100 : 0;

      return {
        totalInmobiliariasConProcesos: total,
        conUsuarioActivo: {
          cantidad: conUsuarioActivo,
          porcentaje: pctUsuarioActivo
        },
        conUsuarioInactivo: {
          cantidad: conUsuarioInactivo,
          porcentaje: pctUsuarioInactivo
        },
        sinUsuario: {
          cantidad: sinUsuario,
          porcentaje: pctSinUsuario
        }
      };
    } catch (error) {
      console.error('[EstadisticasUsuarios] Error:', error);
      return {
        totalInmobiliariasConProcesos: 0,
        conUsuarioActivo: { cantidad: 0, porcentaje: 0 },
        conUsuarioInactivo: { cantidad: 0, porcentaje: 0 },
        sinUsuario: { cantidad: 0, porcentaje: 0 }
      };
    }
  }
}