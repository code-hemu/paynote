import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { serve } from 'guchho'

import { buildOptions } from './build-options.mjs'

const host = '127.0.0.1'
const port = 5173
const outdir = '.guchho'
const pwaFiles = ['manifest.webmanifest', 'pwa-icon.svg']

function copyPwaFiles() {
  for (const file of pwaFiles) {
    copyFileSync(new URL(`../${file}`, import.meta.url), join(outdir, file))
  }
}

const server = await serve({
  build: {
    ...buildOptions,
    outdir,
  },
  server: {
    host,
    port,
    fallback: 'index.html',
  },
})

await server.context.watch({ delay: 150 })
copyPwaFiles()

const timer = setInterval(() => {
  server
    .rebuild()
    .then(copyPwaFiles)
    .catch((error) => {
      console.error(error)
    })
}, 250)

const shutdown = async () => {
  clearInterval(timer)
  await server.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

console.log(`Dev server: ${server.url}`)
