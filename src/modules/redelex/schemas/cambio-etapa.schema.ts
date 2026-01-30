import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CambioEtapaDocument = CambioEtapa & Document;

@Schema({ timestamps: true })
export class CambioEtapa {
  @Prop({ required: true, index: true })
  procesoId: number;

  @Prop()
  numeroRadicacion: string;

  @Prop()
  demandanteIdentificacion: string;

  @Prop()
  demandadoNombre: string;

  @Prop()
  demandadoIdentificacion: string;

  @Prop()
  claseProceso: string;

  @Prop()
  despacho: string;

  @Prop()
  etapaAnterior: string;

  @Prop()
  etapaActual: string;

  @Prop({ default: false })
  reportado: boolean;

  @Prop()
  reportedAt: Date;
}

export const CambioEtapaSchema = SchemaFactory.createForClass(CambioEtapa);
CambioEtapaSchema.index({ reportedAt: 1 }, { expireAfterSeconds: 2592000 });