/**
 * Tipos compartidos del dominio.
 */
export type TipoExamen = 'parcial' | 'global';
export type EstadoExamen = 'generado' | 'entregado' | 'calificado';
export type EstadoEntrega = 'pendiente' | 'entregado';
export type EstadoSincronizacion = 'pendiente' | 'exitoso' | 'fallido';
export type TipoBanderaRevision = 'similitud' | 'patron' | 'duplicado' | 'otro';
