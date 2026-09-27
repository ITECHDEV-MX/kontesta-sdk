#!/usr/bin/env node
/**
 * check:pack: enumera con `npm pack --dry-run` lo que saldría a npm y lo compara con la lista EXACTA de
 * abajo. Falla si sale algo más (código fuente, pruebas, mapas, un .env que alguien dejó) o si falta algo
 * (el build no corrió). Además, los tipos empaquetados solo pueden declarar rutas de openapi/openapi.json.
 *
 * Requiere dist/ construido (`npm run build`). El OpenAPI se toma de openapi/openapi.json o de la ruta que
 * indique la variable KONTESTA_OPENAPI.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdk = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ESPERADO = [
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.es.md',
  'README.md',
  'dist/index.d.mts',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.mjs',
  'package.json',
].sort();

const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: sdk, encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(2);
}
const [info] = JSON.parse(r.stdout);
const sale = info.files.map((f) => f.path).sort();

console.log(`[sdk-pack] ${info.name}@${info.version} · ${sale.length} archivos · ${info.size} B empacado`);
for (const f of info.files) console.log(`  ${String(f.size).padStart(8)}  ${f.path}`);

const deMas = sale.filter((f) => !ESPERADO.includes(f));
const faltan = ESPERADO.filter((f) => !sale.includes(f));
if (deMas.length || faltan.length) {
  if (deMas.length) console.error(`::error::saldría a npm algo que no está en la lista: ${deMas.join(', ')}`);
  if (faltan.length) console.error(`::error::falta en el paquete: ${faltan.join(', ')} (¿corrió el build?)`);
  process.exit(1);
}

// Ningún archivo publicado puede delatar rutas locales ni referencias a mapas.
const { readFileSync } = await import('node:fs');
for (const f of sale.filter((x) => x.startsWith('dist/'))) {
  const t = readFileSync(resolve(sdk, f), 'utf8');
  if (/sourceMappingURL|\/Users\/|\/srv\/|\/home\//.test(t)) {
    console.error(`::error::${f} trae una referencia a un mapa o a una ruta local`);
    process.exit(1);
  }
}
// Los tipos empaquetados solo pueden declarar rutas del OpenAPI público (lista permitida).
const publico = JSON.parse(readFileSync(resolve(sdk, process.env.KONTESTA_OPENAPI ?? 'openapi/openapi.json'), 'utf8'));
const permitidas = new Set(Object.keys(publico.paths));
for (const f of sale.filter((x) => /\.d\.m?ts$/.test(x))) {
  const t = readFileSync(resolve(sdk, f), 'utf8');
  const rutas = [...t.matchAll(/^\s*"(\/[^"]*)":\s*\{/gm)].map((m) => m[1]);
  const fuera = [...new Set(rutas.filter((r) => !permitidas.has(r)))];
  if (fuera.length) {
    console.error(
      `::error::${f} declara rutas que no están en el OpenAPI público: ${fuera.slice(0, 10).join(', ')}` +
        (fuera.length > 10 ? ` (+${fuera.length - 10})` : ''),
    );
    process.exit(1);
  }
  console.log(`[sdk-pack] ${f}: ${new Set(rutas).size} rutas, todas del OpenAPI público.`);
}

console.log('[sdk-pack] exactamente lo esperado.');
