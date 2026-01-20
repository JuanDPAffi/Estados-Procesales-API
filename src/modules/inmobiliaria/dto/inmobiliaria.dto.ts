import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsDateString } from 'class-validator';

export class CreateInmobiliariaDto {
  @IsString()
  @IsNotEmpty()
  nombreInmobiliaria: string;

  @IsString()
  @IsNotEmpty()
  nit: string;

  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsOptional()
  @IsDateString()
  fechaInicioFianza?: Date;

  @IsString()
  @IsOptional()
  departamento?: string;

  @IsString()
  @IsOptional()
  ciudad?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  emailContacto?: string;
}

export class UpdateInmobiliariaDto {
  @IsString()
  @IsOptional()
  nombreInmobiliaria?: string;

  @IsString()
  @IsOptional()
  nit?: string;

  @IsString()
  @IsOptional()
  codigo?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  fechaInicioFianza?: Date;

  @IsString()
  @IsOptional()
  departamento?: string;

  @IsString()
  @IsOptional()
  ciudad?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  emailContacto?: string;
}

export class InmobiliariaEstadisticasProcesosDto {
  // Total de inmobiliarias que tienen al menos un proceso jurídico 
  totalInmobiliariasConProcesos: number;

  // Desglose de inmobiliarias activas 
  activas: {
    // Cantidad de inmobiliarias activas con procesos 
    cantidad: number;
    // Porcentaje sobre el total de inmobiliarias con procesos 
    porcentaje: number;
  };

  // Desglose de inmobiliarias inactivas
  inactivas: {
    // Cantidad de inmobiliarias inactivas con procesos
    cantidad: number;
    // Porcentaje sobre el total de inmobiliarias con procesos
    porcentaje: number;
  };
}

export class InmobiliariaEstadisticasUsuariosDto {
  /** Total de inmobiliarias que tienen procesos jurídicos */
  totalInmobiliariasConProcesos: number;

  /** Inmobiliarias con usuario asignado y activo */
  conUsuarioActivo: {
    cantidad: number;
    porcentaje: number;
  };

  /** Inmobiliarias con usuario asignado pero inactivo */
  conUsuarioInactivo: {
    cantidad: number;
    porcentaje: number;
  };

  /** Inmobiliarias sin usuario asignado */
  sinUsuario: {
    cantidad: number;
    porcentaje: number;
  };
}