import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProcesoDocument = Proceso & Document;

@Schema({ timestamps: true })
export class Proceso {
  @Prop({ required: true })
  procesoId: number;

  @Prop()
  numeroRadicacion: string;

  @Prop()
  codigoAlterno: string;

  @Prop()
  etapaProcesal: string;

  @Prop({ required: true })
  claseProceso: string;

  @Prop({ required: true })
  demandadoNombre: string;

  @Prop({ required: true })
  demandadoIdentificacion: string;

  @Prop({ required: true })
  demandanteNombre: string;

  @Prop({ required: true })
  demandanteIdentificacion: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProcesoSchema = SchemaFactory.createForClass(Proceso);
ProcesoSchema.index({ procesoId: 1 }, { unique: true });