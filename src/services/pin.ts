export const PIN_STORAGE_KEY = 'paynote.pin'
export const PIN_LENGTH = 4

const PIN_VERSION = 1
const PIN_ITERATIONS = 150_000
const SALT_BYTES = 16
const HASH_BITS = 256

interface PinRecord {
  version: number
  salt: string
  hash: string
  iterations: number
  createdAt: string
}

export interface PinService {
  hasPin(): boolean
  createPin(pin: string): Promise<void>
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
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

    const record = value as Partial<PinRecord>

    if (
      record.version !== PIN_VERSION ||
      typeof record.salt !== 'string' ||
      typeof record.hash !== 'string' ||
      typeof record.iterations !== 'number' ||
      !Number.isInteger(record.iterations) ||
      record.iterations <= 0
    ) {
      return null
    }

    if (
      base64ToBytes(record.salt).length !== SALT_BYTES ||
      base64ToBytes(record.hash).length !== HASH_BITS / 8
    ) {
      return null
    }

    return {
      version: record.version,
      salt: record.salt,
      hash: record.hash,
      iterations: record.iterations,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    }
  } catch {
    return null
  }
}

function writeRecord(record: PinRecord): void {
  const storage = getStorage()

  if (!storage) {
    throw new Error('This browser does not allow the PIN to be saved.')
  }

  storage.setItem(PIN_STORAGE_KEY, JSON.stringify(record))
}

async function deriveHash(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle

  if (!subtle) {
    throw new Error('This browser does not support secure PIN verification.')
  }

  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    key,
    HASH_BITS,
  )

  return new Uint8Array(bits)
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  let difference = 0

  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }

  return difference === 0
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

export async function createPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) {
    throw new Error(`PIN must be exactly ${PIN_LENGTH} digits.`)
  }

  const subtle = globalThis.crypto?.subtle

  if (!subtle || typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('This browser does not support secure PIN verification.')
  }

  const salt = new Uint8Array(SALT_BYTES)
  globalThis.crypto.getRandomValues(salt)
  const hash = await deriveHash(pin, salt, PIN_ITERATIONS)

  writeRecord({
    version: PIN_VERSION,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: PIN_ITERATIONS,
    createdAt: new Date().toISOString(),
  })
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!isValidPin(pin)) {
    return false
  }

  const record = readRecord()

  if (!record) {
    return false
  }

  try {
    const salt = base64ToBytes(record.salt)
    const expected = base64ToBytes(record.hash)
    const actual = await deriveHash(pin, salt, record.iterations)

    return sameBytes(actual, expected)
  } catch {
    return false
  }
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
  verifyPin,
  clearPin,
}
