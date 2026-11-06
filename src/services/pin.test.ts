import { afterEach, describe, expect, it } from '@guchho/test'

import { encodeBase64 } from '../utils/base64.ts'

import {
  PIN_ITERATIONS,
  derivePinMaterial,
  randomBytes,
} from './crypto.ts'
import {
  PIN_STORAGE_KEY,
  changePin,
  clearPin,
  createPin,
  hasPin,
  isValidPin,
  unlockPin,
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

  it('creates a hashed PIN record with a wrapped database key', async () => {
    const dataKey = await createPin('1234')

    const raw = storage().getItem(PIN_STORAGE_KEY)

    expect(hasPin()).toBe(true)
    expect(raw).toContain('"version":2')
    expect(raw).toContain('"wrappedKey"')
    expect(raw).not.toContain('"pin"')
    expect(raw).not.toContain('1234')
    expect(await verifyPin('1234')).toBe(true)
    expect(await verifyPin('0000')).toBe(false)
    expect(await unlockPin('1234')).toEqual(dataKey)
    expect(await unlockPin('0000')).toBeNull()
  })

  it('keeps the same database key when the PIN changes', async () => {
    const dataKey = await createPin('1234')

    expect(await changePin('0000', '5678')).toBeNull()
    expect(await unlockPin('1234')).toEqual(dataKey)
    expect(await changePin('1234', '5678')).toEqual(dataKey)
    expect(await unlockPin('1234')).toBeNull()
    expect(await unlockPin('5678')).toEqual(dataKey)
  })

  it('upgrades a legacy PIN record without losing access', async () => {
    const pin = '1234'
    const salt = randomBytes(16)
    const material = await derivePinMaterial(pin, salt, PIN_ITERATIONS)

    storage().setItem(
      PIN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        salt: encodeBase64(salt),
        hash: encodeBase64(material.authHash),
        iterations: PIN_ITERATIONS,
        createdAt: new Date(0).toISOString(),
      }),
    )

    const dataKey = await unlockPin(pin)

    expect(dataKey).toHaveLength(32)
    expect(storage().getItem(PIN_STORAGE_KEY)).toContain('"version":2')
    expect(await unlockPin(pin)).toEqual(dataKey)
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
