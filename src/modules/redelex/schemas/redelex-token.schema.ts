import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RedelexTokenDocument = RedelexToken & Document;

@Schema({ timestamps: true })
export class RedelexToken {
  @Prop({ required: true })
  token: string;

  @Prop({ required: true })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RedelexTokenSchema = SchemaFactory.createForClass(RedelexToken);