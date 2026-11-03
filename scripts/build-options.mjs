import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

export const buildOptions = {
  entrypoints: [
    'index.html',
    { in: 'src/db/sqlite.worker.ts', out: 'sqlite.worker' },
  ],
  outdir: 'dist',
  format: 'esm',
  loader: {
    '.wasm': 'file',
    '.webmanifest': 'file',
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  minify: true,
}
