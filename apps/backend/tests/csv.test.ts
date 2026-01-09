import { describe, expect, it } from 'vitest';
import { generarCsv } from '../src/modulos/modulo_analiticas/servicioExportacionCsv';

describe('generarCsv', () => {
  it('escapa comas, comillas y saltos de linea', () => {
    const columnas = ['nombre', 'nota'];
    const filas = [{ nombre: 'Ana, "A"\nGrupo 1', nota: '5' }];

    const csv = generarCsv(columnas, filas);

    expect(csv).toBe('nombre,nota\n"Ana, ""A""\nGrupo 1",5');
  });
});
