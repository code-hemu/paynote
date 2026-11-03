import { build } from 'guchho'

import { buildOptions } from './build-options.mjs'

try {
  const result = await build({
    ...buildOptions,
    metafile: true,
  })

  for (const warning of result.warnings) {
    console.warn(warning.text)
  }

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
