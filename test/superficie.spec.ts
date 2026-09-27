import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Los tipos generados solo pueden declarar rutas del OpenAPI público de llave (lista permitida):
// openapi/openapi.json, o la ruta que indique KONTESTA_OPENAPI.

const SPEC = JSON.parse(
  readFileSync(resolve(__dirname, '..', process.env.KONTESTA_OPENAPI ?? 'openapi/openapi.json'), 'utf8'),
) as { paths: Record<string, unknown> };
const TIPOS = readFileSync(resolve(__dirname, '../src/generated/types.ts'), 'utf8');

describe('superficie de los tipos generados', () => {
  const rutas = [...TIPOS.matchAll(/^\s*"(\/[^"]*)":\s*\{/gm)].map((m) => m[1]!);

  it('declaran rutas', () => {
    expect(rutas.length).toBeGreaterThan(100);
  });

  it('todas están en el OpenAPI público', () => {
    expect(rutas.filter((r) => !(r in SPEC.paths))).toEqual([]);
  });

  it('y todas las del OpenAPI público están en los tipos', () => {
    expect(Object.keys(SPEC.paths).filter((r) => !rutas.includes(r))).toEqual([]);
  });
});
