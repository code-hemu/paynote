import { decodeBase64, encodeBase64 } from '../utils/base64.ts'

import {
  AES_KEY_BYTES,
  DATABASE_KEY_AAD,
  IV_BYTES,
  PIN_ITERATIONS,
  SALT_BYTES,
  decryptBytes,
  derivePinMaterial,
  encryptBytes,
  equalBytes,
  randomBytes,
} from './crypto.ts'

export const PIN_STORAGE_KEY = 'paynote.pin'
export const PIN_LENGTH = 4

const PIN_VERSION = 2
const LEGACY_PIN_VERSION = 1
const HASH_BYTES = 32
const WRAPPED_KEY_BYTES = AES_KEY_BYTES + 16

interface PinRecordV1 {
  version: 1
  salt: string
  hash: string
  iterations: number
  createdAt: string
}

interface PinRecordV2 {
  version: 2
  salt: string
  hash: string
  iterations: number
  createdAt: string
  wrappedKey: string
  keyIv: string
}

type PinRecord = PinRecordV1 | PinRecordV2

export interface PinService {
  hasPin(): boolean
  createPin(pin: string): Promise<Uint8Array>
  unlockPin(pin: string): Promise<Uint8Array | null>
  changePin(oldPin: string, newPin: string): Promise<Uint8Array | null>
  verifyPin(pin: string): Promise<boolean>
  clearPin(): void
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? globalThis.window?.localStorage ?? null
  } catch {
    return null
  }
}

function readRecord(): PinRecord | null {
  const storage = getStorage()

  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(PIN_STORAGE_KEY)

    if (!raw) {
      return null
    }

    const value: unknown = JSON.parse(raw)

    if (typeof value !== 'object' || value === null) {
      return null
    }

    const record = value as Partial<Omit<PinRecordV1, 'version'>> & {
      version?: number
      wrappedKey?: string
      keyIv?: string
    }

    if (
      (record.version !== PIN_VERSION &&
        record.version !== LEGACY_PIN_VERSION) ||
      typeof record.salt !== 'string' ||
      typeof record.hash !== 'string' ||
      typeof record.iterations !== 'number' ||
      !Number.isInteger(record.iterations) ||
      record.iterations <= 0
    ) {
      return null
    }

    const salt = decodeBase64(record.salt)
    const hash = decodeBase64(record.hash)

    if (salt.length !== SALT_BYTES || hash.length !== HASH_BYTES) {
      return null
    }

    const base: PinRecordV1 = {
      version: 1,
      salt: record.salt,
      hash: record.hash,
      iterations: record.iterations,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    }

    if (record.version === LEGACY_PIN_VERSION) {
      return base
    }

    if (
      typeof record.wrappedKey !== 'string' ||
      typeof record.keyIv !== 'string'
    ) {
      return null
    }

    if (
      decodeBase64(record.wrappedKey).length !== WRAPPED_KEY_BYTES ||
      decodeBase64(record.keyIv).length !== IV_BYTES
    ) {
      return null
    }

    return {
      ...base,
      version: 2,
      wrappedKey: record.wrappedKey,
      keyIv: record.keyIv,
    }
  } catch {
    return null
  }
}

function writeRecord(record: PinRecordV2): void {
  const storage = getStorage()

  if (!storage) {
    throw new Error('This browser does not allow the PIN to be saved.')
  }

  storage.setItem(PIN_STORAGE_KEY, JSON.stringify(record))
}

async function authenticate(
  pin: string,
  record: PinRecord,
): Promise<Awaited<ReturnType<typeof derivePinMaterial>> | null> {
  try {
    const material = await derivePinMaterial(
      pin,
      decodeBase64(record.salt),
      record.iterations,
    )

    return equalBytes(material.authHash, decodeBase64(record.hash))
      ? material
      : null
  } catch {
    return null
  }
}

async function wrapDataKey(
  keyEncryptionKey: CryptoKey,
  dataKey: Uint8Array,
): Promise<{ wrappedKey: Uint8Array; keyIv: Uint8Array }> {
  const encrypted = await encryptBytes(
    keyEncryptionKey,
    dataKey,
    DATABASE_KEY_AAD,
  )

  return {
    wrappedKey: encrypted.ciphertext,
    keyIv: encrypted.iv,
  }
}

async function unwrapDataKey(
  keyEncryptionKey: CryptoKey,
  record: PinRecordV2,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await decryptBytes(
      keyEncryptionKey,
      decodeBase64(record.keyIv),
      decodeBase64(record.wrappedKey),
      DATABASE_KEY_AAD,
    )
  } catch {
    throw new Error(
      'The encrypted database key could not be opened. The stored PIN data may be damaged.',
    )
  }
}

function createDataKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(AES_KEY_BYTES)
}

async function recordForKey(
  pin: string,
  dataKey: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<PinRecordV2> {
  const material = await derivePinMaterial(pin, salt, iterations)
  const wrapped = await wrapDataKey(material.keyEncryptionKey, dataKey)

  return {
    version: PIN_VERSION,
    salt: encodeBase64(salt),
    hash: encodeBase64(material.authHash),
    iterations,
    wrappedKey: encodeBase64(wrapped.wrappedKey),
    keyIv: encodeBase64(wrapped.keyIv),
    createdAt: new Date().toISOString(),
  }
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

export async function createPin(pin: string): Promise<Uint8Array> {
  if (!isValidPin(pin)) {
    throw new Error(`PIN must be exactly ${PIN_LENGTH} digits.`)
  }

  if (readRecord()) {
    throw new Error(
      'A PIN already exists. Use Reset PIN or erase the workspace instead.',
    )
  }

  const salt = randomBytes(SALT_BYTES)
  const dataKey = createDataKey()
  const material = await derivePinMaterial(pin, salt, PIN_ITERATIONS)
  const wrapped = await wrapDataKey(material.keyEncryptionKey, dataKey)

  writeRecord({
    version: PIN_VERSION,
    salt: encodeBase64(salt),
    hash: encodeBase64(material.authHash),
    iterations: PIN_ITERATIONS,
    wrappedKey: encodeBase64(wrapped.wrappedKey),
    keyIv: encodeBase64(wrapped.keyIv),
    createdAt: new Date().toISOString(),
  })

  return dataKey
}

export async function unlockPin(pin: string): Promise<Uint8Array | null> {
  if (!isValidPin(pin)) {
    return null
  }

  const record = readRecord()

  if (!record) {
    return null
  }

  const material = await authenticate(pin, record)

  if (!material) {
    return null
  }

  if (record.version === PIN_VERSION) {
    return unwrapDataKey(material.keyEncryptionKey, record)
  }

  const dataKey = createDataKey()
  const salt = randomBytes(SALT_BYTES)
  const upgraded = await recordForKey(
    pin,
    dataKey,
    salt,
    record.iterations,
  )

  writeRecord(upgraded)
  return dataKey
}

export async function changePin(
  oldPin: string,
  newPin: string,
): Promise<Uint8Array | null> {
  if (!isValidPin(oldPin) || !isValidPin(newPin)) {
    return null
  }

  const record = readRecord()

  if (!record) {
    return null
  }

  const material = await authenticate(oldPin, record)

  if (!material) {
    return null
  }

  const dataKey =
    record.version === PIN_VERSION
      ? await unwrapDataKey(material.keyEncryptionKey, record)
      : createDataKey()
  const salt = randomBytes(SALT_BYTES)
  const updated = await recordForKey(
    newPin,
    dataKey,
    salt,
    PIN_ITERATIONS,
  )

  writeRecord(updated)
  return dataKey
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!isValidPin(pin)) {
    return false
  }

  const record = readRecord()

  if (!record) {
    return false
  }

  return (await authenticate(pin, record)) !== null
}

export function hasPin(): boolean {
  return readRecord() !== null
}

export function clearPin(): void {
  const storage = getStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(PIN_STORAGE_KEY)
  } catch {
    return
  }
}

export const pinService: PinService = {
  hasPin,
  createPin,
  unlockPin,
  changePin,
  verifyPin,
  clearPin,
}

