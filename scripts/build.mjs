import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { build } from 'guchho'

import { buildOptions } from './build-options.mjs'

const pwaFiles = ['manifest.webmanifest', 'pwa-icon.svg']

function copyPwaFiles(outdir) {
  for (const file of pwaFiles) {
    copyFileSync(new URL(`../${file}`, import.meta.url), join(outdir, file))
  }

  const html = readFileSync(join(outdir, 'index.html'), 'utf8')
  const assets = new Set([
    './',
    './index.html',
    './manifest.webmanifest',
    './pwa-icon.svg',
    './sqlite.worker.js',
  ])

  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
    const path = match[1]

    if (path.startsWith('./assets/')) {
      assets.add(path)
    }
  }

  for (const file of readdirSync(join(outdir, 'assets'))) {
    if (file.endsWith('.wasm')) {
      assets.add(`./assets/${file}`)
    }
  }

  const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8').replace(
    '/* __BUILD_ASSETS__ */',
    [...assets].map((path) => `  '${path}',`).join('\n'),
  )

  writeFileSync(join(outdir, 'sw.js'), serviceWorker)
}

try {
  const result = await build({
    ...buildOptions,
    metafile: true,
  })

  for (const warning of result.warnings) {
    console.warn(warning.text)
  }

  copyPwaFiles(buildOptions.outdir)

  for (const output of result.outputs ?? []) {
    console.log(`${output.path} ${output.size} B`)
  }

  console.log(`Built in ${result.duration ?? 0}ms`)
} catch (error) {
  if (error && typeof error === 'object' && Array.isArray(error.errors)) {
    for (const message of error.errors) {
      console.error(message.text)
    }
  } else {
    console.error(error)
  }

  process.exitCode = 1
}
