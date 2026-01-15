import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { sanitizarMongo } from '../src/infraestructura/seguridad/sanitizarMongo';

describe('sanitizarMongo (portal)', () => {
  it('elimina operadores $ y claves con punto en body/query/params', () => {
    const req = {
      body: {
        filtro: { $gt: 1, ok: true },
        nested: [{ $where: 'x' }, { ok: 1 }]
      },
      query: {
        'a.b': 'x',
        q: { $regex: '.*', ok: 1 }
      },
      params: {
        id: { $ne: 'x', ok: 1 }
      }
    } as unknown as Request;

    const next = vi.fn() as unknown as NextFunction;
    sanitizarMongo()(req, {} as unknown as Response, next);

    expect(req.body.filtro).toEqual({ ok: true });
    expect(req.body.nested[0]).toEqual({});
    expect(req.body.nested[1]).toEqual({ ok: 1 });

    expect(req.query).not.toHaveProperty('a.b');
    expect(req.query.q).toEqual({ ok: 1 });

    expect(req.params.id).toEqual({ ok: 1 });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
