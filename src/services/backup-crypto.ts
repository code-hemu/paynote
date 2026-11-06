import {
  BACKUP_APP_ID,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from '../domain/backup.ts'
import { decodeBase64, encodeBase64 } from '../utils/base64.ts'

import {
  BACKUP_ITERATIONS,
  SALT_BYTES,
  decryptBytes,
  derivePassphraseKey,
  encryptBytes,
  randomBytes,
} from './crypto.ts'

const ENCRYPTED_BACKUP_VERSION = 2
const ENCRYPTED_BACKUP_DOCUMENT = 'encrypted-backup'
const MIN_PASSPHRASE_LENGTH = 8
const MAX_PASSPHRASE_LENGTH = 1024
const MIN_ITERATIONS = 10_000
const MAX_ITERATIONS = 2_000_000
const BACKUP_AAD = new TextEncoder().encode('paynote:backup:v2')

interface EncryptedBackupEnvelope {
  app: typeof BACKUP_APP_ID
  document: typeof ENCRYPTED_BACKUP_DOCUMENT
  formatVersion: typeof ENCRYPTED_BACKUP_VERSION
  createdAt: string
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  cipher: {
    name: 'AES-GCM'
    iv: string
    ciphertext: string
  }
}

export async function encryptBackup(
  backup: BackupFile,
  passphrase: string,
): Promise<string> {
  validatePassphrase(passphrase)

  const salt = randomBytes(SALT_BYTES)
  const key = await derivePassphraseKey(passphrase, salt, BACKUP_ITERATIONS)
  const encrypted = await encryptBytes(
    key,
    new TextEncoder().encode(serializeBackup(backup)),
    BACKUP_AAD,
  )
  const envelope: EncryptedBackupEnvelope = {
    app: BACKUP_APP_ID,
    document: ENCRYPTED_BACKUP_DOCUMENT,
    formatVersion: ENCRYPTED_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: BACKUP_ITERATIONS,
      salt: encodeBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: encodeBase64(encrypted.iv),
      ciphertext: encodeBase64(encrypted.ciphertext),
    },
  }

  return JSON.stringify(envelope, null, 2)
}

export async function parseBackupFile(
  text: string,
  passphrase = '',
): Promise<BackupFile> {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    return parseBackup(text)
  }

  if (!isEncryptedBackupEnvelope(value)) {
    return parseBackup(text)
  }

  if (!passphrase) {
    throw new Error('This backup is encrypted. Enter its passphrase.')
  }

  validatePassphrase(passphrase)

  let decrypted: Uint8Array<ArrayBuffer>

  try {
    const key = await derivePassphraseKey(
      passphrase,
      decodeBase64(value.kdf.salt),
      value.kdf.iterations,
    )
    decrypted = await decryptBytes(
      key,
      decodeBase64(value.cipher.iv),
      decodeBase64(value.cipher.ciphertext),
      BACKUP_AAD,
    )
  } catch {
    throw new Error(
      'The backup passphrase is incorrect, or the backup file is damaged.',
    )
  }

  return parseBackup(new TextDecoder().decode(decrypted))
}

export function isEncryptedBackupText(text: string): boolean {
  try {
    return isEncryptedBackupEnvelope(JSON.parse(text))
  } catch {
    return false
  }
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `Backup passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    )
  }

  if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
    throw new Error('Backup passphrase is too long.')
  }
}

function isEncryptedBackupEnvelope(
  value: unknown,
): value is EncryptedBackupEnvelope {
  if (!value || typeof value !== 'object') {
    return false
  }

  const envelope = value as Partial<EncryptedBackupEnvelope>

  if (
    envelope.app !== BACKUP_APP_ID ||
    envelope.document !== ENCRYPTED_BACKUP_DOCUMENT ||
    envelope.formatVersion !== ENCRYPTED_BACKUP_VERSION ||
    !isRecord(envelope.kdf) ||
    !isRecord(envelope.cipher)
  ) {
    return false
  }

  const kdf = envelope.kdf
  const cipher = envelope.cipher

  if (
    kdf.name !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    typeof kdf.iterations !== 'number' ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < MIN_ITERATIONS ||
    kdf.iterations > MAX_ITERATIONS ||
    typeof kdf.salt !== 'string' ||
    cipher.name !== 'AES-GCM' ||
    typeof cipher.iv !== 'string' ||
    typeof cipher.ciphertext !== 'string'
  ) {
    return false
  }

  try {
    return (
      decodeBase64(kdf.salt).length === SALT_BYTES &&
      decodeBase64(cipher.iv).length === 12 &&
      decodeBase64(cipher.ciphertext).length > 16
    )
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
