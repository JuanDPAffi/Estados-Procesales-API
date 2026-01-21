import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum ValidRoles {
  ADMIN = 'admin',
  AFFI = 'affi',
  INMOBILIARIA = 'inmobiliaria',
  GERENTE_COMERCIAL = 'gerente_comercial',
  DIRECTOR_COMERCIAL = 'director_comercial',
  GERENTE_CUENTA = 'gerente_cuenta',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  })
  email: string;

  @Prop({ required: true, minlength: 8, select: false })
  password: string;

  @Prop({ 
    required: true, 
    default: ValidRoles.INMOBILIARIA, 
    enum: ValidRoles 
  })
  role: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  loginAttempts: number;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ select: false })
  activationToken?: string;

  @Prop({ required: false, trim: true})
  nombreInmobiliaria?: string;

  @Prop({ required: false, trim: true })
  nit?: string;

  @Prop({ required: false, trim: true })
  codigoInmobiliaria?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);