import { IsNotEmpty, IsString, IsOptional, IsObject, IsEmail } from 'class-validator';

export class CreateTicketDto {
  @IsEmail()
  @IsOptional()
  email?: string; 

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    procesoId?: number | string;
    radicado?: string;
    cuenta?: string;
    clase?: string;
    etapa?: string;
  };
}