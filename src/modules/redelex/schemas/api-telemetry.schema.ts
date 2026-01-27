import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'api_telemetry' })
export class ApiTelemetry extends Document {
  @Prop({ required: true })
  path: string;

  @Prop({ required: true })
  method: string;

  @Prop({ required: true })
  total_ms: number;

  @Prop({ required: true })
  redelex_ms: number;

  @Prop({ required: true })
  processing_ms: number;

  @Prop()
  userEmail: string;

  @Prop()
  statusCode: number;
}

export const ApiTelemetrySchema = SchemaFactory.createForClass(ApiTelemetry);