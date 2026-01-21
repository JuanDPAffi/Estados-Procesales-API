import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ValidRoles } from '../../auth/schemas/user.schema';
export type SalesTeamDocument = SalesTeam & Document;

export enum Zona {
  REGIONES = 'Regiones',
  BOGOTA = 'Bogotá',
  ANTIOQUIA = 'Antioquia',
  NACIONAL = 'Nacional',
}

@Schema({ timestamps: true })
export class SalesTeam {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  directorEmail: string;

  @Prop({ 
    required: true, 
    enum: [ValidRoles.DIRECTOR_COMERCIAL, ValidRoles.GERENTE_COMERCIAL],
    default: ValidRoles.DIRECTOR_COMERCIAL 
  })
  managerRole: string;

  @Prop({ type: [String], default: [] })
  accountManagersEmails: string[];

  @Prop({ 
    required: true, 
    enum: Zona 
  })
  zona: string;
}

export const SalesTeamSchema = SchemaFactory.createForClass(SalesTeam);