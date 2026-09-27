#!/usr/bin/env node
/**
 * Verifica que este repositorio solo contenga lo que está permitido, con listas PERMITIDAS:
 *
 *   - archivos: exactamente los de ARCHIVOS (más dist/ cuando existe);
 *   - rutas de la API: todo `/v1/...` que aparezca es el inicio de una ruta de openapi/openapi.json;
 *   - hosts: todo «etiqueta.etiqueta» con TLD real (lista completa de IANA) está en HOSTS o en NO_SON_HOSTS;
 *     los hosts reservados para pruebas (`*.test` y el host local) solo en test/;
 *   - IPs literales (v4 y v6): solo las de documentación (RFC 5737, 2001:db8::/32);
 *   - sin rutas absolutas de máquinas (Unix, macOS, Windows, del directorio personal ni con esquema de archivo).
 *
 *   node scripts/verificar-publico.mjs [directorio]
 *
 * Revisa también dist/ si existe. Sale con 1 y la lista de hallazgos.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

const ARCHIVOS = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/publicar.yml',
  '.gitignore',
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.es.md',
  'README.md',
  'openapi/openapi.json',
  'package.json',
  'package-lock.json',
  'scripts/check-pack.mjs',
  'scripts/tlds-iana.txt',
  'scripts/verificar-publico.mjs',
  'src/client.ts',
  'src/config.ts',
  'src/generated/types.ts',
  'src/http/errors.ts',
  'src/http/transport.ts',
  'src/index.ts',
  'src/resources/automations.ts',
  'src/resources/conversations.ts',
  'src/resources/integrations.ts',
  'src/resources/leads.ts',
  'src/resources/metrics.ts',
  'src/resources/pipelines.ts',
  'src/resources/tags.ts',
  'src/resources/templates.ts',
  'src/resources/webhooks.ts',
  'src/types/common.ts',
  'src/types/inputs.ts',
  'src/types/resources.ts',
  'src/webhook/verify.ts',
  'test/client.spec.ts',
  'test/helpers.ts',
  'test/reintentos.spec.ts',
  'test/superficie.spec.ts',
  'test/verificar-publico.spec.ts',
  'test/verify-webhook.spec.ts',
  'tsconfig.json',
  'tsup.config.ts',
  'vitest.config.ts',
]);
const DIST = new Set(['dist/index.js', 'dist/index.mjs', 'dist/index.d.ts', 'dist/index.d.mts']);
const IGNORAR = new Set(['.git', 'node_modules', 'coverage']);

const HOSTS = new Set([
  'api.kontesta.app',
  'kontesta.mx',
  'github.com',
  'registry.npmjs.org',
  'www.npmjs.com',
  'docs.npmjs.com',
  'keepachangelog.com',
  'semver.org',
  'ig.me',
  'm.me',
  'wa.me',
  'api.openpay.mx',
  'sandbox-api.openpay.mx',
  'factura.com',
]);
/** Archivos de prueba: solo aquí se aceptan hosts reservados para pruebas (`*.test` y el host local). */
// Armado para que este archivo no se delate a sí mismo.
const LOCAL = ['local', 'host'].join('');
const esPrueba = (rel) => rel.startsWith('test/');
const hostPermitido = (h, rel) =>
  HOSTS.has(h) ||
  h === 'example.com' ||
  h.endsWith('.example.com') ||
  (esPrueba(rel) && (h === LOCAL || h.endsWith('.test')));

/**
 * Identificadores que PARECEN host porque terminan en un TLD real (`.id`, `.name`, `.md`, `.ping`, `.new`,
 * `.data`, `.map`, `.now`…) y no lo son: nombres de archivo, campos y métodos. Lista cerrada: uno nuevo
 * hace fallar la verificación hasta que alguien lo revise y lo agregue aquí.
 */
const NO_SON_HOSTS = new Set([
  'CHANGELOG.md', 'README.md', 'LICENSE.es.md', 'notas-internas.md', 'index.js.map',
  'ChannelAccount.id', 'Message.id', 'PhoneNumber.id', 'User.id', 'message.id', 'message.new',
  'CreateWebhookDto.events', 'Date.now', 'app.post', 'calls.map', 'e.name', 'event.data', 'info.files.map',
  'info.name', 'integrations.test', 'kontesta.webhooks.ping', 'lead.id', 'lead.name', 'new.target.name',
  'res.data', 'sub.id', 'test.ping', 'this.name', 'typed.id', 'webhooks.ping', 'i.test', 'OCTETOS.test',
  'DOCUMENTACION.test', 'exports.GA', 'partes.map',
]);

// Lista COMPLETA de TLD de IANA (scripts/tlds-iana.txt, el archivo tlds-alpha-by-domain.txt que publica IANA), más los
// reservados que IANA no delega. Todo «etiqueta.etiqueta» cuyo último tramo está aquí es un host.
const TLDS = new Set([
  ...readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tlds-iana.txt'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.trim().toLowerCase()),
  'test', 'local', LOCAL, 'internal', 'lan', 'corp', 'home', 'invalid', 'example', 'onion',
]);
// Puntos camuflados que se convierten en «.» antes de sacar los tokens: escapados, codificados en URL o en HTML, y
// los puntos ideográficos y de ancho completo.
const PUNTOS_CAMUFLADOS = /\\\.|%2e|&#0*46;|&#x0*2e;|&period;|[。．｡]/gi;
/**
 * Tokens donde buscar hosts e IPs, sin trucos de escritura: NFKC (anchos completos, ligaduras y demás formas de
 * compatibilidad); puntos camuflados a «.»; todo lo que no sea [A-Za-z0-9.-] se vuelve espacio (`ops@zona`,
 * `_.zona`, `$zona`, `page_v2`, `*.`, `{x}.`, `//`, `ruta/…`); los puntos repetidos también, y a cada token se le
 * quitan puntos y guiones del inicio y del final (una IP pegada a un guion).
 */
const tokens = (t) =>
  t
    .normalize('NFKC')
    .replace(PUNTOS_CAMUFLADOS, '.')
    .replace(/[^A-Za-z0-9.-]/g, ' ')
    .replace(/[.]{2,}/g, ' ')
    .split(/\s+/)
    .map((x) => x.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(Boolean);
const IP_DOCUMENTACION = /^(?:192[.]0[.]2|198[.]51[.]100|203[.]0[.]113)[.]/;
// Primer octeto de los rangos privados y de loopback: con él, una forma corta (dos o tres partes) cuenta como IP.
const PRIMEROS_PRIVADOS = new Set([10, 100, 127, 169, 172, 192]);
/** [valor, rara] de una parte, o null. `rara` = hex, octal o ceros a la izquierda. */
function valorParte(p) {
  if (/^0x[0-9a-f]+$/i.test(p)) return [parseInt(p, 16), true];
  if (!/^\d+$/.test(p)) return null;
  if (p.length > 1 && p[0] === '0') return [/^[0-7]+$/.test(p) ? parseInt(p, 8) : parseInt(p, 10), true];
  return [parseInt(p, 10), false];
}
/**
 * IPv4 en cualquier escritura que acepte inet_aton: de 1 a 4 partes; cada parte en decimal, octal (cero a la
 * izquierda) o hex (0x…, con o sin ceros); las primeras n-1 partes hasta 255 y la última llena el resto. Los rangos
 * de documentación se revisan sobre la forma canónica. Devuelve qué clase de IP es, o null.
 */
function comoIp(c, noSonIps) {
  if (noSonIps.has(c)) return null;
  const partes = c.split('.');
  if (partes.length > 4) return null;
  const vals = partes.map(valorParte);
  if (vals.some((v) => !v)) return null;
  const n = vals.length;
  const rara = vals.some(([, r]) => r);
  if (n === 1) {
    const [v] = vals[0];
    if (/^0x/i.test(c)) return v < 2 ** 32 ? 'IP en hexadecimal' : null;
    if (v >= 2 ** 24 && v < 2 ** 32) return rara ? 'IP con ceros u octal' : 'IP como entero';
    return null;
  }
  if (vals.slice(0, -1).some(([v]) => v > 255) || vals[n - 1][0] >= 256 ** (5 - n)) return null;
  const valor = vals.slice(0, -1).reduce((a, [v], i) => a + v * 256 ** (3 - i), 0) + vals[n - 1][0];
  const canonica = [24, 16, 8, 0].map((s) => Math.floor(valor / 2 ** s) % 256).join('.');
  if (IP_DOCUMENTACION.test(canonica)) return null;
  if (n === 4) return rara ? 'IP con ceros, octal o hex' : 'IP literal';
  // Dos o tres partes con la última que no cabe en un octeto: es una IP abreviada aunque traiga ceros u octal.
  // Va ANTES de la exención de ceros (regla de Sec, ronda 1d). Residual aceptado: a.b.0.d escrito como a.b.d
  // (la última parte cabe en un octeto) no se detecta.
  if (vals[0][0] !== 0 && vals[n - 1][0] > 255 && vals[n - 1][0] < 256 ** (5 - n)) return 'IP abreviada';
  // Si no: se parece a una versión (1.2.3) o a un decimal (10.00). Solo cuenta si trae hex o si empieza como un
  // rango privado o de loopback.
  if (vals.some(([, r], i) => r && !/^0x/i.test(partes[i]))) return null;
  if (rara || vals[n - 1][0] > 255 || PRIMEROS_PRIVADOS.has(vals[0][0])) return 'IP abreviada';
  return null;
}
/** IPv4 del texto: cada token y, si trae guiones (un rango, una IP pegada), cada pieza. */
function ipsV4(texto, noSonIps) {
  const fuera = new Map();
  for (const tok of tokens(texto)) {
    for (const c of [tok, ...tok.split('-')]) {
      const que = c && comoIp(c, noSonIps);
      if (que) fuera.set(c, que);
    }
  }
  return fuera;
}

// Un host que empieza con `$` es una plantilla de código (`https://${...}`), no un host.
const URL_HOST = /[a-z][a-z0-9+.-]*:\/\/([^/\s"'`)<>:${}]+)/gi;
/** Números que caen en el rango de una IPv4 como entero y no lo son (un `maximum` del OpenAPI). Lista cerrada. */
const NO_SON_IPS = new Set(['100000000']);
// IPv6: cuenta si trae «::», 5 grupos o más, o una letra hex (así una hora «08:00:00» no cuenta).
const IPV6 = /(?<![\w:])([0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})(?![\w:])/gi;
// Sin ningún dígito hex («::» suelto en código) no es una dirección.
const esIpv6 = (c) => /[0-9a-f]/i.test(c) && (c.includes('::') || c.split(':').length >= 5 || /[a-f]/i.test(c));
const IPV6_DOCUMENTACION = /^2001:0?db8:/i;
const RUTA_ABSOLUTA =
  /(?:^|[\s"'`(=:,])(\/(?:Users|home|root|opt|srv|var|private|tmp|etc|mnt|Volumes)\/[^\s"'`)]*|~\/[^\s"'`)]*)|\b([A-Za-z]:\\[^\s"'`)]*)|\b(file:\/\/[^\s"'`)]*)/g;
const RUTA_API = /\/v1\/[A-Za-z0-9_{}/-]*/g;

const spec = JSON.parse(readFileSync(join(raiz, 'openapi/openapi.json'), 'utf8'));
const rutasPublicas = Object.keys(spec.paths).map((r) => r.split('/'));
/**
 * Un fragmento `/v1/...` es válido si es el inicio de alguna ruta pública. Un segmento `{param}` de la ruta
 * PÚBLICA vale por cualquier valor (`/v1/conversations/c1/messages` casa con `/v1/conversations/{id}/messages`), y el
 * último segmento del fragmento puede venir a medias (los clientes arman el resto con una plantilla).
 */
const rutaPermitida = (frag) => {
  const fs = frag.replace(/\/+$/, '').split('/');
  if (fs.join('/') === '/v1') return true;
  return rutasPublicas.some((ps) => {
    if (fs.length > ps.length) return false;
    // El comodín `{param}` solo vale del lado PÚBLICO: un comodín en la ruta citada no casa con cualquier ruta.
    const medio = fs.slice(0, -1).every((a, i) => a === ps[i] || ps[i].startsWith('{'));
    const ultimo = ps[fs.length - 1];
    const f = fs[fs.length - 1];
    return medio && (ultimo.startsWith(f) || ultimo.startsWith('{'));
  });
};

function* archivos(dir) {
  for (const n of readdirSync(dir)) {
    if (IGNORAR.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* archivos(p);
    else yield p;
  }
}

const hallazgos = [];
for (const f of archivos(raiz)) {
  const rel = relative(raiz, f).split(sep).join('/');
  if (!ARCHIVOS.has(rel) && !DIST.has(rel)) {
    hallazgos.push(`${rel}: archivo fuera de la lista`);
    continue;
  }
  const t = readFileSync(f, 'utf8');
  const esLock = rel === 'package-lock.json';

  // En el lockfile solo cuenta de dónde se descarga cada paquete («resolved»).
  if (esLock) {
    for (const m of t.matchAll(/"resolved":\s*"[a-z]+:\/\/([^/"]+)/gi)) {
      if (!hostPermitido(m[1].toLowerCase(), rel)) hallazgos.push(`${rel}: host fuera de la lista: ${m[1]}`);
    }
  } else {
    const candidatos = new Set([
      ...[...t.matchAll(URL_HOST)].map((m) => m[1]),
      ...tokens(t).filter((c) => c.includes('.') && !/^[\d.]+$/.test(c) && TLDS.has(c.split('.').pop().toLowerCase())),
    ]);
    for (const h of candidatos) {
      if (!hostPermitido(h.toLowerCase(), rel) && !NO_SON_HOSTS.has(h)) hallazgos.push(`${rel}: host fuera de la lista: ${h}`);
    }
    // La palabra suelta, fuera de pruebas (el OpenAPI la usa en prosa: «sin IP literal, … ni credenciales»; una URL
    // hacia ese host la sigue atrapando la regla de hosts).
    if (!esPrueba(rel) && rel !== 'openapi/openapi.json' && new RegExp(`\\b${LOCAL}\\b`, 'i').test(t.normalize('NFKC'))) {
      hallazgos.push(`${rel}: ${LOCAL} fuera de las pruebas`);
    }
    // La lista de TLD de IANA es un dato (su cabecera trae un número de versión), no se revisa como texto.
    if (rel !== 'scripts/tlds-iana.txt') {
      for (const [c, que] of ipsV4(t, NO_SON_IPS)) hallazgos.push(`${rel}: ${que}: ${c}`);
    }
    for (const m of t.normalize('NFKC').matchAll(IPV6)) {
      if (esIpv6(m[1]) && !IPV6_DOCUMENTACION.test(m[1])) hallazgos.push(`${rel}: IPv6 literal: ${m[1]}`);
    }
    for (const m of t.matchAll(RUTA_ABSOLUTA)) hallazgos.push(`${rel}: ruta absoluta: ${m[1] ?? m[2] ?? m[3]}`);
    if (rel !== 'openapi/openapi.json') {
      for (const r of new Set(t.match(RUTA_API) ?? [])) {
        if (!rutaPermitida(r)) hallazgos.push(`${rel}: ruta de la API que no está en openapi.json: ${r}`);
      }
    }
  }
}
for (const a of ARCHIVOS) if (!existsSync(join(raiz, a))) hallazgos.push(`${a}: falta`);

if (hallazgos.length) {
  console.error(`::error::${hallazgos.length} hallazgos:`);
  for (const h of hallazgos) console.error(`  ${h}`);
  process.exit(1);
}
console.log('[verificar-publico] archivos, rutas, hosts, IPs y rutas de máquina: todo dentro de lo permitido.');
