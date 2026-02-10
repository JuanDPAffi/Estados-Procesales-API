import { IsString, IsOptional, IsNotEmpty, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCallTicketDto {
  @IsString()
  @IsNotEmpty()
  callType: string;

  @IsString()
  @IsOptional()
  transferArea?: string;

  @IsString()
  @IsNotEmpty()
  contactEmail: string;

  @IsString()
  @IsNotEmpty()
  contactName: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsNotEmpty()
  companyNit: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  gerenteComercial?: string;

  @IsString()
  @IsNotEmpty()
  query: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value ? String(value) : value)
  procesoId?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value ? String(value) : value)
  cuenta?: string;
  
  @IsString()
  @IsOptional()
  inquilinoIdentificacion?: string;

  @IsString()
  @IsOptional()
  inquilinoNombre?: string;

  @IsString()
  @IsOptional()
  claseProceso?: string;

  @IsString()
  @IsOptional()
  etapaProcesal?: string;

  @IsString()
  @IsNotEmpty()
  response: string;

  @IsOptional()
  @IsBoolean()
  sendNotification?: boolean;
}