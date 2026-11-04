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
  'data-customer-search',
  'data-customer-sort',
  'data-customer-status',
  'data-customer-table',
  'data-customer-rows',
  'data-customer-empty',
  'data-customer-error',
  'data-customer-pagination',
  'data-settings',
  'data-settings-form',
  'data-settings-save',
  'data-settings-reset',
  'data-settings-theme',
  'data-settings-notice',
  'data-settings-error',
  'data-settings-logo-preview',
  'data-settings-logo-image',
  'data-settings-preview-name',
  'data-settings-preview-address',
  'data-settings-preview-phone',
  'data-settings-signature-image',
  'data-settings-business-field',
  'data-settings-individual-field',
  'data-settings-photo-upload',
  'data-settings-signature-upload',
  'data-settings-signature-draw',
]

describe('index.html shell', () => {
  it('declares every route', () => {
    for (const route of routes) {
      const marker =
        route === '/receipts/new'
          ? 'data-route-alias="/receipts/new"'
          : `data-route="${route}"`
      expect(indexHtml).toContain(marker)
    }
  })

  it('starts settings with the profile type selector', () => {
    const formStart = indexHtml.indexOf('data-settings-form')
    const profileType = indexHtml.indexOf('data-settings-input="profileType"')
    const businessName = indexHtml.indexOf('data-settings-input="businessName"')

    expect(profileType).toBeGreaterThan(formStart)
    expect(profileType).toBeLessThan(businessName)
    expect(indexHtml).toContain('settings-profile-type-individual')
    expect(indexHtml).toContain('settings-profile-type-business')
    expect(indexHtml).toContain('profile-type-switch')
  })

  it('declares individual personal information fields', () => {
    for (const field of [
      'businessName',
      'businessPhone',
      'businessEmail',
      'businessAddress',
      'profilePhoto',
      'profileSignature',
    ]) {
      expect(indexHtml).toContain(`data-settings-input="${field}"`)
    }

    expect(indexHtml).toContain('data-settings-individual-field')
    expect(indexHtml).toContain('Digital Signature')
    expect(indexHtml).toContain('Upload Signature')
    expect(indexHtml).toContain('Draw Signature')
    expect(indexHtml).toContain('Profile Photo')
  })

  it('links the manifest and omits header-only CSP directives', () => {
    expect(indexHtml).toContain('href="./manifest.webmanifest"')
    expect(indexHtml).not.toContain('frame-ancestors')
  })

  it('declares the PIN lock screen and starts the app locked', () => {
    for (const marker of [
      'data-pin-screen',
      'data-pin-panel',
      'data-pin-setup-form',
      'data-pin-unlock-form',
      'data-pin-setup-submit',
      'data-pin-unlock-submit',
      'data-pin-forgot',
      'data-pin-reset-panel',
      'data-pin-reset-confirm',
      'data-pin-reset-cancel',
      'data-pin-lock',
      'data-app-shell hidden',
    ]) {
      expect(indexHtml).toContain(marker)
    }
  })

  it('declares the standalone shared receipt view', () => {
    for (const marker of [
      'data-shared-receipt',
      'data-shared-receipt-loading',
      'data-shared-receipt-error',
      'data-shared-receipt-error-message',
      'data-shared-receipt-sheet',
      'data-shared-receipt-open',
    ]) {
      expect(indexHtml).toContain(marker)
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
