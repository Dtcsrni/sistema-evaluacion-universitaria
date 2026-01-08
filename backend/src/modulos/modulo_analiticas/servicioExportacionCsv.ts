/**
 * Generador CSV sin dependencias de Excel.
 */
export function generarCsv(columnas: string[], filas: Array<Record<string, unknown>>) {
  const escapar = (valor: unknown) => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    const necesitaComillas = texto.includes(',') || texto.includes('"') || texto.includes('\n');
    const limpio = texto.replace(/"/g, '""');
    return necesitaComillas ? `"${limpio}"` : limpio;
  };

  const encabezado = columnas.map(escapar).join(',');
  const lineas = filas.map((fila) => columnas.map((col) => escapar(fila[col])).join(','));
  return [encabezado, ...lineas].join('\n');
}
