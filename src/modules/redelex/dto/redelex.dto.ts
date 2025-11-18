// Tipos de respuesta de Redelex

export interface ProcesoResumenDto {
  procesoId: number;
  demandadoNombre: string;
  demandadoIdentificacion: string;
  demandanteNombre: string;
  demandanteIdentificacion: string;
}

export interface ProcesosPorIdentificacionResponse {
  success: boolean;
  identificacion: string;
  procesos: ProcesoResumenDto[];
}

export interface ProcesoDetalleDto {
  idProceso: number;
  numeroRadicacion: string | null;
  codigoAlterno: string | null;

  claseProceso: string | null;
  etapaProcesal: string | null;
  estado: string | null;
  regional: string | null;
  tema: string | null;

  demandanteNombre: string | null;
  demandanteIdentificacion: string | null;
  demandadoNombre: string | null;
  demandadoIdentificacion: string | null;

  despacho: string | null;
  despachoOrigen: string | null;

  fechaAdmisionDemanda: string | null;
  fechaCreacion: string | null;
  fechaEntregaAbogado: string | null;
  fechaRecepcionProceso: string | null;

  ubicacionContrato: string | null;

  // Subrogación
  fechaAceptacionSubrogacion: string | null;
  fechaPresentacionSubrogacion: string | null;
  motivoNoSubrogacion: string | null;

  // Calificación
  calificacion: string | null;

  // Sentencia 1ra instancia
  sentenciaPrimeraInstanciaResultado: string | null;
  sentenciaPrimeraInstanciaFecha: string | null;

  // Medidas cautelares
  medidasCautelares: {
    id: number | null;
    fecha: string | null;
    tipoMedida: string | null;
    medidaEfectiva: string | null;
    sujetoNombre: string | null;
    tipoBien: string | null;
    direccion: string | null;
    area: number | null;
    avaluoJudicial: number | null;
    observaciones: string | null;
  } | null;

  // Última actuación
  ultimaActuacionFecha: string | null;
  ultimaActuacionTipo: string | null;
  ultimaActuacionObservacion: string | null;

  // Abogados
  abogadoPrincipal: string | null;
  abogadosInternos: any[];
}

// Tipo interno para el informe de cédula
export type InformeCedulaItem = {
  'ID Proceso': number;
  'Demandado - Nombre': string;
  'Demandado - Identificacion': string;
  'Demandante - Nombre': string;
  'Demandante - Identificacion': string;
};