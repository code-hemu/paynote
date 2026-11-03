import { readFileSync } from 'node:fs'

import { describe, expect, it } from '@guchho/test'

import { navigation } from './navigation.ts'

const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const routes = [...navigation.map((item) => item.path), '*']
const fields = [
  'app-name',
  'app-version',
  'platform',
  'storage-type',
  'storage-engine',
  'device-platform',
  'database-path',
  'record-count',
  'usage-bytes',
  'quota-bytes',
]
const mountPoints = [
  'data-section-title',
  'data-storage-status',
  'data-storage-badge',
  'data-schema-version',
  'data-app-version',
  'data-dashboard-error',
  'data-error-message',
  'data-retry',
]

describe('index.html shell', () => {
  it('declares every route', () => {
    for (const route of routes) {
      expect(indexHtml).toContain(`data-route="${route}"`)
    }
  })

  it('declares every navigation destination', () => {
    for (const item of navigation) {
      expect(indexHtml).toContain(`href="#${item.path}" data-nav`)
    }
  })

  it('declares the dashboard mount points', () => {
    for (const mountPoint of mountPoints) {
      expect(indexHtml).toContain(mountPoint)
    }

    for (const field of fields) {
      expect(indexHtml).toContain(`data-field="${field}"`)
    }
  })
})
