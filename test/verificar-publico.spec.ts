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
    filter: (src) => !/[/\\](?:node_modules|\.git|dist|coverage)(?:[/\\]|$)/.test(src.slice(raiz.length)),
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
  const ip = (...p: number[]) => p.join('.');
  const v6 = (...p: string[]) => p.join(':');
  const abs = (dir: string, resto: string) => `/${dir}/${resto}`;
  const api = (...p: string[]) => ['', 'v1', ...p].join('/');
  const host = (...p: string[]) => p.join('.');
  const local = ['local', 'host'].join('');
  const casos: [string, string, string, RegExp][] = [
    ['IP privada 10/8', 'README.md', `\nservidor ${ip(10, 0, 0, 5)}\n`, /IP literal: 10\.0\.0\.5/],
    ['IP privada 192.168', 'README.md', `\nred ${ip(192, 168, 1, 20)}\n`, /IP literal: 192\.168\.1\.20/],
    ['IP privada 172.16', 'src/config.ts', `\n// ${ip(172, 16, 4, 2)}\n`, /IP literal: 172\.16\.4\.2/],
    ['IP de CGNAT', 'CHANGELOG.md', `\n${ip(100, 64, 0, 1)}\n`, /IP literal: 100\.64\.0\.1/],
    ['IP al final de una frase', 'README.md', `\nel servidor es ${ip(10, 20, 30, 40)}.\n`, /IP literal: 10\.20\.30\.40/],
    ['IP pública', 'README.md', `\nDNS ${ip(8, 8, 8, 8)}\n`, /IP literal: 8\.8\.8\.8/],
    ['loopback', 'src/index.ts', `\n// ${ip(127, 0, 0, 1)}\n`, /IP literal: 127\.0\.0\.1/],
    ['URL con IP', 'README.md', `\nhttp://${ip(10, 1, 2, 3)}:8080/x\n`, /IP literal: 10\.1\.2\.3/],
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
    ['host no permitido', 'README.md', `\nhttps://${host('ci', 'algo-interno', 'dev')}/x\n`, /host fuera de la lista: ci\.algo-interno\.dev/],
    ['dominio suelto', 'src/config.ts', `\n// ${host('servidor', 'empresa', 'corp')}\n`, /host fuera de la lista: servidor\.empresa\.corp/],
    ['dominio de TLD nuevo', 'README.md', `\nver ${host('ops', 'algo', 'page')} y listo\n`, /host fuera de la lista: ops\.algo\.page/],
    ['host de pruebas fuera de test/', 'src/index.ts', `\n// https://${host('api', 'algo', 'test')}\n`, /host fuera de la lista: api\.algo\.test/],
    ['host local fuera de test/', 'README.md', `\nusa ${local} para probar\n`, new RegExp(`${local} fuera de las pruebas`)],
    ['ruta de API que no es de llave', 'README.md', `\nGET ${api('interno', 'x')}\n`, /no está en openapi\.json: \/v1\/interno\/x/],
    ['otra ruta que no es de llave', 'src/index.ts', `\n// '${api('otro-interno', 'y')}'\n`, /no está en openapi\.json: \/v1\/otro-interno\/y/],
    ['comodín del lado citado', 'README.md', `\nGET ${api('{x}', 'lo-que-sea')}\n`, /no está en openapi\.json: \/v1\/\{x\}\/lo-que-sea/],
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
    expect(r.salida).toMatch(/notas-internas\.md: archivo fuera de la lista/);
  });

  it('revisa también dist/', () => {
    const d = copia();
    mkdirSync(join(d, 'dist'), { recursive: true });
    writeFileSync(join(d, 'dist/index.js'), `const x = 'http://${[10, 9, 9, 9].join('.')}/x';\n`);
    const r = corre(d);
    expect(r.status).toBe(1);
    expect(r.salida).toMatch(/dist\/index\.js: IP literal: 10\.9\.9\.9/);
  });

  it('rechaza un archivo de dist/ que no es de la lista', () => {
    const d = copia();
    mkdirSync(join(d, 'dist'), { recursive: true });
    writeFileSync(join(d, 'dist/index.js.map'), '{}\n');
    expect(corre(d).salida).toMatch(/dist\/index\.js\.map: archivo fuera de la lista/);
  });
});
