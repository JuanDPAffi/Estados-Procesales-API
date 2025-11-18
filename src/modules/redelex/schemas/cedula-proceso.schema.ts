import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CedulaProcesoDocument = CedulaProceso & Document;

@Schema({ timestamps: true })
export class CedulaProceso {
  @Prop({ required: true })
  procesoId: number;

  @Prop({ required: true })
  demandadoNombre: string;

  @Prop({ required: true })
  demandadoIdentificacion: string;

  @Prop({ required: true })
  demandanteNombre: string;

  @Prop({ required: true })
  demandanteIdentificacion: string;

  // Timestamps automáticos
  createdAt?: Date;
  updatedAt?: Date;
}

export const CedulaProcesoSchema = SchemaFactory.createForClass(CedulaProceso);

// Índice único: un proceso solo debe existir una vez
CedulaProcesoSchema.index({ procesoId: 1 }, { unique: true });