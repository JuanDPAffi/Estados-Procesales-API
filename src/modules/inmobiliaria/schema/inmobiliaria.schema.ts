import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InmobiliariaDocument = Inmobiliaria & Document;

@Schema({ timestamps: true })
export class Inmobiliaria {

  @Prop({ required: true, trim: true})
  nombreInmobiliaria: string;

  @Prop({ required: true, trim: true })
  nit: string;

  // ... (otros campos existentes se mantienen igual) ...
  @Prop({ required: true, trim: true })
  codigo: string;

  @Prop({ default: null, lowercase: true, trim: true })
  emailRegistrado: string | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  fechaInicioFianza: Date;

  @Prop({ trim: true, default: '' })
  departamento: string;

  @Prop({ trim: true, default: '' })
  ciudad: string;

  @Prop({ trim: true, default: '' })
  telefono: string;

  @Prop({ trim: true, default: '', lowercase: true })
  emailContacto: string;

  @Prop({ trim: true, lowercase: true, default: null })
  assignedAccountManagerEmail: string | null;

  @Prop({ trim: true })
  nombreRepresentante: string;

  @Prop({ trim: true, lowercase: true })
  emailRepresentante: string;

  @Prop({ trim: true })
  modifiedBy: string;

  @Prop({ trim: true, default: 'Sistema' })
  modificationSource: string;

  // --- NUEVOS CAMPOS HUBSPOT ---
  @Prop({ trim: true })
  hubspotOwnerId: string;

  @Prop({ trim: true })
  zonaAffi: string;

  @Prop({ trim: true })
  cluster: string;

  @Prop()
  montoAfianzado: number;

  @Prop()
  cantidadContratos: number;

  // Objeto incrustado para acceso rápido desde el frontend
  @Prop({ type: Object }) 
  equipoComercial: {
    gerenteNombre: string;
    gerenteEmail: string;
    directorName: string;
    directorEmail: string;
  };
}

export const InmobiliariaSchema = SchemaFactory.createForClass(Inmobiliaria);
InmobiliariaSchema.index({ codigo: 1 }, { unique: true });