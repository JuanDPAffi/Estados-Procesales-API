import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as xlsx from 'xlsx';
import { Inmobiliaria, InmobiliariaDocument } from '../schema/inmobiliaria.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { CreateInmobiliariaDto, UpdateInmobiliariaDto } from '../dto/inmobiliaria.dto';

@Injectable()
export class InmobiliariaService {
  private readonly PROTECTED_NITS = ['900053370']; 

  constructor(
    @InjectModel(Inmobiliaria.name) private readonly inmoModel: Model<InmobiliariaDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(createDto: CreateInmobiliariaDto) {
    const existing = await this.inmoModel.findOne({ nit: createDto.nit, codigo: createDto.codigo });
    if (existing) throw new ConflictException('Ya existe una inmobiliaria con ese NIT y Código');
    const newInmo = new this.inmoModel(createDto);
    return newInmo.save();
  }

  async findAll() {
    return this.inmoModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string) {
    const inmo = await this.inmoModel.findById(id);
    if (!inmo) throw new NotFoundException('Inmobiliaria no encontrada');
    return inmo;
  }

  async update(id: string, updateDto: UpdateInmobiliariaDto, userEmail: string = 'Sistema') {
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

    const excelInmos = Array.from(uniqueRawData.values()).map((row: any) => {
      const estadoExcel = String(row['Estado Inmobiliaria'] || '').trim();
      return {
        nit: String(row['Nit'] || row['NIT'] || '').trim(),
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

    if (excelInmos.length === 0) throw new BadRequestException('No se encontraron registros válidos.');

    const currentInmosDocs = await this.inmoModel.find().select(
      'nit codigo nombreInmobiliaria fechaInicioFianza departamento ciudad telefono emailContacto isActive'
    );
    
    const currentMap = new Map(currentInmosDocs.map(d => [d.codigo, d]));
    const excelCodigosSet = new Set(excelInmos.map(i => i.codigo));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deactivated = 0;

    const inmoOperations = [];
    const nitsToUpdateUsers: { nit: string, isActive: boolean }[] = [];

    for (const item of excelInmos) {
        const existing = currentMap.get(item.codigo);

        if (existing) {
          const hasChanges = 
            existing.nit !== item.nit ||
            existing.nombreInmobiliaria !== item.nombreInmobiliaria ||
            existing.departamento !== item.departamento ||
            existing.ciudad !== item.ciudad ||
            existing.telefono !== item.telefono ||
            existing.emailContacto !== item.emailContacto ||
            existing.isActive !== item.isActive ||
            this.datesAreDifferent(existing.fechaInicioFianza, item.fechaInicioFianza);

          if (hasChanges) {
             inmoOperations.push({
              updateOne: {
                filter: { codigo: item.codigo },
                update: {
                  $set: {
                    nit: item.nit,
                    nombreInmobiliaria: item.nombreInmobiliaria,
                    fechaInicioFianza: item.fechaInicioFianza,
                    departamento: item.departamento,
                    ciudad: item.ciudad,
                    telefono: item.telefono,
                    emailContacto: item.emailContacto,
                    isActive: item.isActive,
                    modifiedBy: userEmail,
                    modificationSource: 'Importación Excel'
                  }
                }
              }
            });
            updated++;
            nitsToUpdateUsers.push({ nit: item.nit, isActive: item.isActive });
          } else {
            skipped++;
          }
        } else {
          inmoOperations.push({
            updateOne: {
              filter: { codigo: item.codigo },
              update: {
                $set: { ...item, modifiedBy: userEmail, modificationSource: 'Importación Excel' },
                $setOnInsert: { emailRegistrado: null }
              },
              upsert: true
            }
          });
          created++;
          nitsToUpdateUsers.push({ nit: item.nit, isActive: item.isActive });
        }
    }

    const codesToDeactivate: string[] = [];
    for (const doc of currentInmosDocs) {
        if (!excelCodigosSet.has(doc.codigo)) {
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
              modificationSource: 'Inactivación Masiva (Ausente en Excel)'
            } 
          }
        }
      });
      deactivated = codesToDeactivate.length;
    }

    if (inmoOperations.length > 0) {
      await this.inmoModel.bulkWrite(inmoOperations);
    }

    const nitsToActivate = nitsToUpdateUsers.filter(x => x.isActive).map(x => x.nit);
    const nitsToBlock = nitsToUpdateUsers.filter(x => !x.isActive).map(x => x.nit);

    if (nitsToActivate.length > 0) await this.userModel.updateMany({ nit: { $in: nitsToActivate } }, { $set: { isActive: true } });
    if (nitsToBlock.length > 0) await this.userModel.updateMany({ nit: { $in: nitsToBlock } }, { $set: { isActive: false } });

    return {
      message: 'Sincronización completada',
      resumen: {
        procesados_excel: excelInmos.length,
        nuevos: created,
        actualizados: updated,
        inactivados: deactivated
      }
    };
  }

  private datesAreDifferent(d1: any, d2: any): boolean {
    const time1 = d1 ? new Date(d1).getTime() : 0;
    const time2 = d2 ? new Date(d2).getTime() : 0;
    return Math.abs(time1 - time2) > 1000;
  }
  /**
   * Obtiene estadísticas de inmobiliarias que tienen procesos jurídicos asociados
   * @returns Objeto con estadísticas detalladas de inmobiliarias con procesos
   */
/**
   * Obtiene estadísticas de inmobiliarias que tienen procesos jurídicos asociados
   * Incluye también el conteo de "otros demandantes" (NITs con procesos que no son inmobiliarias)
   * @returns Objeto con estadísticas detalladas de inmobiliarias con procesos
   */
  async getEstadisticasConProcesos() {
    
    try {
      
      // Obtener todas las inmobiliarias
      const todasInmobiliarias = await this.inmoModel.find().select('nit isActive nombreInmobiliaria').exec();
      
      console.log(`[EstadisticasProcesos] Total inmobiliarias en BD: ${todasInmobiliarias.length}`);

      // Obtener todos los NITs únicos que tienen procesos
      const coleccionProcesos = this.inmoModel.db.collection('cedulaprocesos');
      
      // Verificar que la colección existe y tiene documentos
      const totalProcesos = await coleccionProcesos.countDocuments();
      console.log(`[EstadisticasProcesos] Total documentos en cedulaprocesos: ${totalProcesos}`);

      if (totalProcesos === 0) {
        console.log('[EstadisticasProcesos] No hay procesos en la colección');
        return {
          totalInmobiliariasConProcesos: 0,
          activas: { cantidad: 0, porcentaje: 0 },
          inactivas: { cantidad: 0, porcentaje: 0 },
          otrosDemandantes: { cantidad: 0, porcentaje: 0 }
        };
      }

      // Obtener NITs únicos de demandantes
      const nitsConProcesos = await coleccionProcesos.distinct('demandanteIdentificacion');
      
      console.log(`[EstadisticasProcesos] NITs únicos con procesos: ${nitsConProcesos.length}`);
      console.log(`[EstadisticasProcesos] Primeros 5 NITs: ${nitsConProcesos.slice(0, 5).join(', ')}`);

      // Filtrar NITs válidos (no vacíos)
      const nitsValidos = nitsConProcesos.filter(nit => nit && nit.trim() !== '');
      console.log(`[EstadisticasProcesos] NITs válidos (no vacíos): ${nitsValidos.length}`);

      // Filtrar inmobiliarias que tienen su NIT en la lista de procesos
      const inmobiliariasConProcesos = todasInmobiliarias.filter(inmo => 
        nitsValidos.includes(inmo.nit)
      );

      console.log(`[EstadisticasProcesos] Inmobiliarias con procesos: ${inmobiliariasConProcesos.length}`);

      // CALCULAR OTROS DEMANDANTES
      // Son los NITs válidos que tienen procesos pero NO están en la tabla de inmobiliarias
      const otrosDemandantesCount = nitsValidos.length - inmobiliariasConProcesos.length;
      console.log(`[EstadisticasProcesos] Otros demandantes (no inmobiliarias): ${otrosDemandantesCount}`);

      const total = inmobiliariasConProcesos.length;

      if (total === 0 && otrosDemandantesCount === 0) {
        console.log('[EstadisticasProcesos] No hay demandantes con procesos');
        return {
          totalInmobiliariasConProcesos: 0,
          activas: { cantidad: 0, porcentaje: 0 },
          inactivas: { cantidad: 0, porcentaje: 0 },
          otrosDemandantes: { cantidad: 0, porcentaje: 0 }
        };
      }

      // Separar por estado activo/inactivo
      const activasCount = inmobiliariasConProcesos.filter(inmo => inmo.isActive).length;
      const inactivasCount = inmobiliariasConProcesos.filter(inmo => !inmo.isActive).length;

      console.log(`[EstadisticasProcesos] Activas: ${activasCount}, Inactivas: ${inactivasCount}`);

      // Calcular porcentajes sobre el total de inmobiliarias con procesos
      const porcentajeActivas = total > 0 ? Math.round((activasCount / total) * 100 * 100) / 100 : 0;
      const porcentajeInactivas = total > 0 ? Math.round((inactivasCount / total) * 100 * 100) / 100 : 0;

      // Calcular porcentaje de otros demandantes sobre el total de NITs válidos
      const totalDemandantes = nitsValidos.length;
      const porcentajeOtros = totalDemandantes > 0 ? Math.round((otrosDemandantesCount / totalDemandantes) * 100 * 100) / 100 : 0;

      return {
        totalInmobiliariasConProcesos: total,
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
      console.error('[EstadisticasProcesos] Error completo:', error);
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
      console.log('[EstadisticasUsuarios] Iniciando...');

      // Obtener NITs únicos que tienen procesos
      const coleccionProcesos = this.inmoModel.db.collection('cedulaprocesos');
      const totalProcesos = await coleccionProcesos.countDocuments();
      
      console.log(`[EstadisticasUsuarios] Total procesos: ${totalProcesos}`);

      if (totalProcesos === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          conUsuarioActivo: { cantidad: 0, porcentaje: 0 },
          conUsuarioInactivo: { cantidad: 0, porcentaje: 0 },
          sinUsuario: { cantidad: 0, porcentaje: 0 }
        };
      }

      const nitsConProcesos = await coleccionProcesos.distinct('demandanteIdentificacion');
      console.log(`[EstadisticasUsuarios] NITs con procesos: ${nitsConProcesos.length}`);

      if (nitsConProcesos.length === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          conUsuarioActivo: { cantidad: 0, porcentaje: 0 },
          conUsuarioInactivo: { cantidad: 0, porcentaje: 0 },
          sinUsuario: { cantidad: 0, porcentaje: 0 }
        };
      }

      // Obtener todas las inmobiliarias con procesos
      const inmobiliariasConProcesos = await this.inmoModel.find({
        nit: { $in: nitsConProcesos }
      }).select('nit emailRegistrado nombreInmobiliaria').exec();

      const total = inmobiliariasConProcesos.length;
      console.log(`[EstadisticasUsuarios] Inmobiliarias con procesos: ${total}`);

      if (total === 0) {
        return {
          totalInmobiliariasConProcesos: 0,
          conUsuarioActivo: { cantidad: 0, porcentaje: 0 },
          conUsuarioInactivo: { cantidad: 0, porcentaje: 0 },
          sinUsuario: { cantidad: 0, porcentaje: 0 }
        };
      }

      // Obtener todos los NITs que tienen usuarios
      const nitsInmobiliarias = inmobiliariasConProcesos.map(i => i.nit);
      
      // Buscar usuarios por NIT (más directo y eficiente)
      const usuariosPorNit = await this.userModel.find({
        nit: { $in: nitsInmobiliarias },
        role: 'inmobiliaria'  // Solo usuarios tipo inmobiliaria
      }).select('nit email isActive').exec();

      console.log(`[EstadisticasUsuarios] Usuarios encontrados: ${usuariosPorNit.length}`);

      // Crear un mapa de NIT -> estado de usuario
      const mapaUsuarios = new Map();
      usuariosPorNit.forEach(user => {
        if (user.nit) {
          mapaUsuarios.set(user.nit, user.isActive);
        }
      });

      // Clasificar inmobiliarias
      let conUsuarioActivo = 0;
      let conUsuarioInactivo = 0;
      let sinUsuario = 0;

      inmobiliariasConProcesos.forEach(inmo => {
        if (mapaUsuarios.has(inmo.nit)) {
          // Tiene usuario, verificar si está activo
          if (mapaUsuarios.get(inmo.nit)) {
            conUsuarioActivo++;
          } else {
            conUsuarioInactivo++;
          }
        } else {
          // No tiene usuario
          sinUsuario++;
        }
      });

      console.log(`[EstadisticasUsuarios] Activos: ${conUsuarioActivo}, Inactivos: ${conUsuarioInactivo}, Sin usuario: ${sinUsuario}`);

      // Calcular porcentajes
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