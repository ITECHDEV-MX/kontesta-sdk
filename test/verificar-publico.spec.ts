import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// scripts/verificar-publico.mjs trabaja con listas PERMITIDAS. Cada caso copia el repo a un directorio
// temporal, le mete UNA cosa que no debe estar y comprueba que el verificador lo rechaza.

const raiz = resolve(__dirname, '..');
const script = join(raiz, 'scripts/verificar-publico.mjs');
const temporales: string[] = [];

function copia(): string {
  const d = mkdtempSync(join(tmpdir(), 'verificar-publico-'));
  temporales.push(d);
  cpSync(raiz, d, {
    recursive: true,
    filter: (src) => !/[/\\](?:node_modules|[.]git|dist|coverage)(?:[/\\]|$)/.test(src.slice(raiz.length)),
  });
  return d;
}

function corre(d: string) {
  const r = spawnSync(process.execPath, [script, d], { encoding: 'utf8' });
  return { status: r.status, salida: `${r.stdout}${r.stderr}` };
}

afterAll(() => {
  for (const d of temporales) rmSync(d, { recursive: true, force: true });
});

describe('verificar-publico', () => {
  it('el repo tal cual pasa', () => {
    expect(corre(copia()).status).toBe(0);
  });

  it('versiones, decimales, horas y fechas no son IP', () => {
    const d = copia();
    appendFileSync(
      join(d, 'README.md'),
      '\nVersiones 1.2.3, 22.14.0, 3.0.0, 1.0, 18.17 y 2.0.1; precios 10.00 y 150.00; 0.64, 3.14, 0.0625, 1.050; 08:00:00; 2026-09-27T07:00:00Z.\n',
    );
    expect(corre(d).status).toBe(0);
  });

  it('los de documentación y los de prueba dentro de test/ pasan', () => {
    const d = copia();
    appendFileSync(
      join(d, 'README.md'),
      `\nEjemplos: ${[198, 51, 100, 3].join('.')}, ${['2001', 'db8', '', '7'].join(':')} y ver 08:00:00.\n`,
    );
    appendFileSync(join(d, 'test/helpers.ts'), `\n// https://${['api', 'otro', 'test'].join('.')} y ${['local', 'host'].join('')}\n`);
    expect(corre(d).status).toBe(0);
  });

  it('una IP de documentación (RFC 5737) pasa', () => {
    const d = copia();
    appendFileSync(join(d, 'README.md'), `\nEjemplo: ${[203, 0, 113, 10].join('.')}\n`);
    expect(corre(d).status).toBe(0);
  });

  // Valores SINTÉTICOS (ninguno es una IP, ruta o host real de la casa), armados en tiempo de ejecución
  // para que este archivo no se delate a sí mismo.
  const ip = (...p: (number | string)[]) => p.join('.');
  const v6 = (...p: string[]) => p.join(':');
  const abs = (dir: string, resto: string) => `/${dir}/${resto}`;
  const api = (...p: string[]) => ['', 'v1', ...p].join('/');
  const host = (...p: string[]) => p.join('.');
  const local = ['local', 'host'].join('');
  // Literales hex armados en tiempo de ejecución (escritos tal cual, este archivo sería un hallazgo).
  const hx = (d: string) => `0${'x'}${d}`;
  const casos: [string, string, string, RegExp][] = [
    ['IP privada 10/8', 'README.md', `\nservidor ${ip(10, 0, 0, 5)}\n`, /IP literal: 10[.]0[.]0[.]5/],
    ['IP privada de clase C', 'README.md', `\nred ${ip(192, 168, 7, 9)}\n`, /IP literal: 192[.]168[.]7[.]9/],
    ['IP privada de clase B', 'src/config.ts', `\n// ${ip(172, 16, 4, 2)}\n`, /IP literal: 172[.]16[.]4[.]2/],
    ['IP de CGNAT', 'CHANGELOG.md', `\n${ip(100, 64, 0, 1)}\n`, /IP literal: 100[.]64[.]0[.]1/],
    ['IP al final de una frase', 'README.md', `\nel servidor es ${ip(10, 20, 30, 40)}.\n`, /IP literal: 10[.]20[.]30[.]40/],
    ['IP pública', 'README.md', `\nDNS ${ip(8, 8, 8, 8)}\n`, /IP literal: 8[.]8[.]8[.]8/],
    ['loopback', 'src/index.ts', `\n// ${ip(127, 0, 0, 1)}\n`, /IP literal: 127[.]0[.]0[.]1/],
    ['URL con IP', 'README.md', `\nhttp://${ip(10, 1, 2, 3)}:8080/x\n`, /IP literal: 10[.]1[.]2[.]3/],
    ['IPv6 privada', 'README.md', `\n${v6('fd00', '', '1')}\n`, /IPv6 literal: fd00/],
    ['IPv6 completa', 'src/index.ts', `\n// ${v6('fe80', '0', '0', '0', '1ff', 'fe23', '4567', '890a')}\n`, /IPv6 literal: fe80:/],
    ['ruta /Users', 'src/index.ts', `\n// ${abs('Users', 'alguien/proyecto')}\n`, /ruta absoluta: \/Users\//],
    ['ruta /home', 'README.md', `\nver ${abs('home', 'deploy/app')}\n`, /ruta absoluta: \/home\//],
    ['ruta /root', 'README.md', `\n${abs('root', '.npmrc')}\n`, /ruta absoluta: \/root\//],
    ['ruta /opt', 'CHANGELOG.md', `\n${abs('opt', 'servicio/bin')}\n`, /ruta absoluta: \/opt\//],
    ['ruta /srv', 'README.md', `\n${abs('srv', 'repo/x')}\n`, /ruta absoluta: \/srv\//],
    ['ruta /var', 'README.md', `\n${abs('var', 'lib/algo')}\n`, /ruta absoluta: \/var\//],
    ['ruta /private', 'README.md', `\n${abs('private', 'tmp/x')}\n`, /ruta absoluta: \/private\//],
    ['ruta /tmp', 'README.md', `\n${abs('tmp', 'build/x')}\n`, /ruta absoluta: \/tmp\//],
    ['ruta /etc', 'README.md', `\n${abs('etc', 'algo.conf')}\n`, /ruta absoluta: \/etc\//],
    ['ruta /mnt', 'README.md', `\n${abs('mnt', 'disco/x')}\n`, /ruta absoluta: \/mnt\//],
    ['ruta /Volumes', 'README.md', `\n${abs('Volumes', 'Disco/x')}\n`, /ruta absoluta: \/Volumes\//],
    ['ruta del directorio personal', 'README.md', `\nver ${'~'}/proyectos/x\n`, /ruta absoluta: ~\//],
    ['esquema de archivo', 'README.md', `\n${'file'}://algo/x\n`, /ruta absoluta: file:\/\//],
    ['ruta de Windows', 'README.md', `\n${'C:'}\\Users\\alguien\\x\n`, new RegExp(`ruta absoluta: ${'C'}:`)],
    ['host no permitido', 'README.md', `\nhttps://${host('ci', 'algo-interno', 'dev')}/x\n`, /host fuera de la lista: ci[.]algo-interno[.]dev/],
    ['dominio suelto', 'src/config.ts', `\n// ${host('servidor', 'empresa', 'corp')}\n`, /host fuera de la lista: servidor[.]empresa[.]corp/],
    ['dominio de TLD nuevo', 'README.md', `\nver ${host('ops', 'algo', 'page')} y listo\n`, /host fuera de la lista: ops[.]algo[.]page/],
    ['host de pruebas fuera de test/', 'src/index.ts', `\n// https://${host('api', 'algo', 'test')}\n`, /host fuera de la lista: api[.]algo[.]test/],
    ['host local fuera de test/', 'README.md', `\nusa ${local} para probar\n`, new RegExp(`${local} fuera de las pruebas`)],
    ['ruta de API que no es de llave', 'README.md', `\nGET ${api('interno', 'x')}\n`, /no está en openapi[.]json: \/v1\/interno\/x/],
    ['otra ruta que no es de llave', 'src/index.ts', `\n// '${api('otro-interno', 'y')}'\n`, /no está en openapi[.]json: \/v1\/otro-interno\/y/],
    ['dominio tras comodín', 'README.md', `\nver *.${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['dominio tras {x}', 'README.md', `\nver {x}.${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['dominio tras plantilla', 'src/index.ts', `\n// \${x}.${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['host tras //', 'README.md', `\nver //${host('zona', 'algo', 'page')}/r\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['host tras una ruta', 'README.md', `\nver r/${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['IP en hex (32 bits)', 'README.md', `\nver ${hx('0A000005')}\n`, new RegExp(`IP en hexadecimal: ${hx('0A0')}`)],
    ['IP en hex (octetos)', 'README.md', `\nver ${[hx('0a'), hx('0'), hx('0'), hx('5')].join('.')}\n`, /IP con ceros, octal o hex/],
    // Ronda 1b de Sec: separadores y escrituras que antes escapaban.
    ['dominio tras @', 'README.md', `\nver ops@${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['dominio tras _.', 'README.md', `\nver _.${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['dominio tras x_y.', 'README.md', `\nver x_y.${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: y[.]zona[.]algo[.]page/],
    ['dominio tras $', 'src/index.ts', `\n// $${host('zona', 'algo', 'page')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['dominio pegado a _v2', 'README.md', `\nver ${host('zona', 'algo', 'page')}_v2\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['dominio en anchos completos', 'README.md', `\nver ${host('zona', 'algo', 'page').replace(/[a-z.]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 65248))}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['IP hex de 7 dígitos', 'README.md', `\nver ${hx('A000005')}\n`, new RegExp(`IP en hexadecimal: ${hx('A0')}`)],
    ['IP con un octeto hex en medio', 'README.md', `\nver ${['10', hx('0'), '0', '5'].join('.')}\n`, /IP con ceros, octal o hex/],
    ['IP como entero de 32 bits', 'README.md', `\nver ${String(2 ** 24 * 10 + 5)}\n`, /IP como entero: 1677/],
    // Ronda 1c de Sec: guiones, octal y ceros, formas cortas y puntos camuflados.
    ['IP pegada a un guion al final', 'README.md', `\nver ${ip(10, 20, 30, 40)}-\n`, /IP literal: 10[.]20[.]30[.]40/],
    ['IP pegada a un guion al inicio', 'README.md', `\nver -${ip(10, 20, 30, 41)}\n`, /IP literal: 10[.]20[.]30[.]41/],
    ['rango de IPs', 'README.md', `\nver ${ip(10, 0, 0, 5)}-${ip(10, 0, 0, 9)}\n`, /IP literal: 10[.]0[.]0[.]9/],
    ['octeto octal', 'README.md', `\nver ${['0177', '0', '0', '1'].join('.')}\n`, /IP con ceros, octal o hex: 0177/],
    ['octeto con ceros', 'README.md', `\nver ${['0010', '0', '0', '5'].join('.')}\n`, /IP con ceros, octal o hex: 0010/],
    ['octeto hex con ceros', 'README.md', `\nver ${[hx('000a'), '0', '0', '5'].join('.')}\n`, /IP con ceros, octal o hex/],
    ['hex entero con ceros', 'README.md', `\nver ${hx('000000B16212C')}\n`, /IP en hexadecimal/],
    ['entero octal', 'README.md', `\nver ${'0' + (2 ** 24 * 10 + 5).toString(8)}\n`, /IP con ceros u octal/],
    ['entero decimal con ceros', 'README.md', `\nver ${'000' + String(2 ** 24 * 11 + 5)}\n`, /IP con ceros u octal/],
    ['forma corta de 2 partes', 'README.md', `\nver ${ip(127, 1)}\n`, /IP abreviada: 127[.]1/],
    ['forma corta de 3 partes', 'README.md', `\nver ${ip(10, 0, 5)}\n`, /IP abreviada: 10[.]0[.]5/],
    ['forma corta con la última grande', 'README.md', `\nver ${ip(11, 22, 8492)}\n`, /IP abreviada: 11[.]22[.]8492/],
    ['puntos escapados', 'README.md', `\nver ${['10', '0', '0', '6'].join('\\.')}\n`, /IP literal: 10[.]0[.]0[.]6/],
    ['puntos en URL', 'README.md', `\nver ${['10', '0', '0', '7'].join('%' + '2e')}\n`, /IP literal: 10[.]0[.]0[.]7/],
    ['puntos en HTML', 'README.md', `\nver ${['10', '0', '0', '8'].join('&#' + '46;')}\n`, /IP literal: 10[.]0[.]0[.]8/],
    ['puntos con nombre HTML', 'README.md', `\nver ${['10', '0', '0', '9'].join('&' + 'period;')}\n`, /IP literal: 10[.]0[.]0[.]9/],
    ['punto ideográfico', 'README.md', `\nver ${['10', '0', '1', '1'].join(String.fromCharCode(12290))}\n`, /IP literal: 10[.]0[.]1[.]1/],
    ['punto de ancho completo', 'README.md', `\nver ${['10', '0', '1', '2'].join(String.fromCharCode(65294))}\n`, /IP literal: 10[.]0[.]1[.]2/],
    ['punto de medio ancho', 'README.md', `\nver ${['10', '0', '1', '3'].join(String.fromCharCode(65377))}\n`, /IP literal: 10[.]0[.]1[.]3/],
    ['host con puntos escapados', 'README.md', `\nver ${['zona', 'algo', 'page'].join('\\.')}\n`, /host fuera de la lista: zona[.]algo[.]page/],
    ['host local en mayúsculas', 'README.md', `\nusa ${local.toUpperCase()} para probar\n`, new RegExp(`${local} fuera de las pruebas`)],
    // Ronda 1d: forma corta con la última parte > 255 aunque traiga ceros u octal (base sintética: once, veintidós, treinta y tres, cuarenta y cuatro).
    ['forma corta octal 1', 'README.md', `\nver ${ip(11, 22, '020454')}\n`, /IP abreviada: 11[.]22[.]020454/],
    ['forma corta octal 2', 'README.md', `\nver ${ip('013', 22, 8492)}\n`, /IP abreviada: 013[.]22[.]8492/],
    ['forma corta octal 3', 'README.md', `\nver ${ip(11, '05420454')}\n`, /IP abreviada: 11[.]05420454/],
    ['forma corta octal 4', 'README.md', `\nver ${ip(11, 1450284)}\n`, /IP abreviada: 11[.]1450284/],
    ['comodín del lado citado', 'README.md', `\nGET ${api('{x}', 'lo-que-sea')}\n`, /no está en openapi[.]json: \/v1\/\{x\}\/lo-que-sea/],
  ];

  for (const [nombre, archivo, texto, espera] of casos) {
    it(`rechaza: ${nombre}`, () => {
      const d = copia();
      appendFileSync(join(d, archivo), texto);
      const r = corre(d);
      expect(r.status).toBe(1);
      expect(r.salida).toMatch(espera);
    });
  }

  it('rechaza un archivo que no está en la lista', () => {
    const d = copia();
    writeFileSync(join(d, 'notas-internas.md'), 'hola\n');
    const r = corre(d);
    expect(r.status).toBe(1);
    expect(r.salida).toMatch(/notas-internas[.]md: archivo fuera de la lista/);
  });

  it('revisa también dist/', () => {
    const d = copia();
    mkdirSync(join(d, 'dist'), { recursive: true });
    writeFileSync(join(d, 'dist/index.js'), `const x = 'http://${[10, 9, 9, 9].join('.')}/x';\n`);
    const r = corre(d);
    expect(r.status).toBe(1);
    expect(r.salida).toMatch(/dist\/index[.]js: IP literal: 10[.]9[.]9[.]9/);
  });

  it('rechaza un archivo de dist/ que no es de la lista', () => {
    const d = copia();
    mkdirSync(join(d, 'dist'), { recursive: true });
    writeFileSync(join(d, 'dist/index.js.map'), '{}\n');
    expect(corre(d).salida).toMatch(/dist\/index[.]js[.]map: archivo fuera de la lista/);
  });
});
