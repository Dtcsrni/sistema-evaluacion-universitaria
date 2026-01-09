/**
 * Error estandar para respuestas controladas del API.
 */
export class ErrorAplicacion extends Error {
  codigo: string;
  estadoHttp: number;
  detalles?: unknown;

  constructor(codigo: string, mensaje: string, estadoHttp = 400, detalles?: unknown) {
    super(mensaje);
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
    this.detalles = detalles;
  }
}
