import { serve } from 'guchho'

import { buildOptions } from './build-options.mjs'

const host = '127.0.0.1'
const port = 5173
const outdir = '.guchho'

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

const timer = setInterval(() => {
  server.rebuild().catch((error) => {
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
