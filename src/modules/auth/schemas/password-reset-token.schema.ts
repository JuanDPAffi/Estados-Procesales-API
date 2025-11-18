import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PasswordResetTokenDocument = PasswordResetToken & Document;

@Schema()
export class PasswordResetToken {
  @Prop({ 
    type: Types.ObjectId, 
    ref: 'User', 
    required: true 
  })
  userId: Types.ObjectId;

  @Prop({ required: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const PasswordResetTokenSchema = SchemaFactory.createForClass(
  PasswordResetToken,
);

// TTL index: se borra automáticamente después de expirar
PasswordResetTokenSchema.index(
  { expiresAt: 1 }, 
  { expireAfterSeconds: 0 }
);