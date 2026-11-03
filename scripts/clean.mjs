import { rm } from 'node:fs/promises'

await rm('.guchho', { recursive: true, force: true })
