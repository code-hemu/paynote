export const AES_KEY_BYTES = 32
export const IV_BYTES = 12
export const SALT_BYTES = 16
export const PIN_ITERATIONS = 150_000
export const BACKUP_ITERATIONS = 310_000
export const DATABASE_AAD = new TextEncoder().encode('paynote:database:v1')
export const DATABASE_KEY_AAD = new TextEncoder().encode(
  'paynote:database-key:v1',
)

export interface EncryptedBytes {
  iv: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
}

export interface PinMaterial {
  authHash: Uint8Array<ArrayBuffer>
  keyEncryptionKey: CryptoKey
}

function bufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>
}

function subtle(): SubtleCrypto {
  const crypto = globalThis.crypto

  if (!crypto?.subtle) {
    throw new Error(
      'This browser does not support the encryption PayNote needs to protect your records.',
    )
  }

  return crypto.subtle
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export async function importAesKey(
  rawKey: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return subtle().importKey('raw', bufferSource(rawKey), 'AES-GCM', false, usages)
}

export async function derivePinMaterial(
  pin: string,
  salt: Uint8Array,
  iterations: number = PIN_ITERATIONS,
): Promise<PinMaterial> {
  const crypto = globalThis.crypto

  if (!crypto?.subtle) {
    throw new Error(
      'This browser does not support the encryption PayNote needs to protect your records.',
    )
  }

  const pinKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: bufferSource(salt),
        iterations,
        hash: 'SHA-256',
      },
      pinKey,
      512,
    ),
  )

  return {
    authHash: bytes.slice(0, AES_KEY_BYTES),
    keyEncryptionKey: await importAesKey(bytes.slice(AES_KEY_BYTES), [
      'encrypt',
      'decrypt',
    ]),
  }
}

export async function derivePassphraseKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = BACKUP_ITERATIONS,
): Promise<CryptoKey> {
  const crypto = globalThis.crypto

  if (!crypto?.subtle) {
    throw new Error(
      'This browser does not support the encryption PayNote needs to protect your backups.',
    )
  }

  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: bufferSource(salt),
      iterations,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  additionalData?: Uint8Array,
): Promise<EncryptedBytes> {
  const iv = randomBytes(IV_BYTES)
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      {
        name: 'AES-GCM',
        iv: bufferSource(iv),
        additionalData:
          additionalData === undefined
            ? undefined
            : bufferSource(additionalData),
      },
      key,
      bufferSource(plaintext),
    ),
  )

  return { iv, ciphertext }
}

export async function decryptBytes(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  additionalData?: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = await subtle().decrypt(
    {
      name: 'AES-GCM',
      iv: bufferSource(iv),
      additionalData:
        additionalData === undefined
          ? undefined
          : bufferSource(additionalData),
    },
    key,
    bufferSource(ciphertext),
  )

  return new Uint8Array(plaintext)
}

export function equalBytes(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  if (left.length !== right.length) {
    return false
  }

  let difference = 0

  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }

  return difference === 0
}
