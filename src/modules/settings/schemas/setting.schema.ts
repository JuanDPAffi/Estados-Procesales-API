import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'system_settings' })
export class Setting extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ default: false })
  isActive: boolean;

  @Prop()
  message: string;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);