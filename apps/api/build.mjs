// Bundles the API + worker for production. Workspace packages (@dafitmatch/shared, TS source)
// are inlined; every npm dependency stays external and is installed on the host.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@dafitmatch/'));

await build({
  entryPoints: ['src/server.ts', 'src/worker.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
