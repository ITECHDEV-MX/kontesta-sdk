import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  // Sin mapas: el paquete publicado no lleva src/, y un .map apuntaría a rutas que no existen (B1).
  sourcemap: false,
  clean: true,
  target: 'es2022',
  platform: 'node',
  splitting: false,
  treeshake: true,
});
