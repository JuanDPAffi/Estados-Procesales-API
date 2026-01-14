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
}