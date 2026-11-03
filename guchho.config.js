import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default {
  build: {
    outdir: 'dist',
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    minify: true,
  },
}
