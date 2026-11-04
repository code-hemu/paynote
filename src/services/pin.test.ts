import { afterEach, describe, expect, it } from '@guchho/test'

import {
  PIN_STORAGE_KEY,
  clearPin,
  createPin,
  hasPin,
  isValidPin,
  verifyPin,
} from './pin.ts'

function storage(): Storage {
  return (globalThis.window as Window).localStorage
}

afterEach(() => {
  clearPin()
  storage().removeItem(PIN_STORAGE_KEY)
})

describe('PIN service', () => {
  it('accepts only four digit PINs', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12345')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })

  it('creates a hashed PIN record and verifies it', async () => {
    await createPin('1234')

    const raw = storage().getItem(PIN_STORAGE_KEY)

    expect(hasPin()).toBe(true)
    expect(raw).toContain('"version":1')
    expect(raw).not.toContain('"pin"')
    expect(raw).not.toContain('1234')
    expect(await verifyPin('1234')).toBe(true)
    expect(await verifyPin('0000')).toBe(false)
  })

  it('rejects an invalid PIN when creating one', async () => {
    let message = ''

    try {
      await createPin('12ab')
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toContain('4 digits')
    expect(hasPin()).toBe(false)
  })

  it('treats a corrupted record as missing', () => {
    storage().setItem(PIN_STORAGE_KEY, '{not-json')

    expect(hasPin()).toBe(false)
  })
})
