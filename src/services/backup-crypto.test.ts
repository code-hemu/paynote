import { describe, expect, it } from '@guchho/test'

import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  serializeBackup,
  type BackupFile,
} from '../domain/backup.ts'

import {
  encryptBackup,
  isEncryptedBackupText,
  parseBackupFile,
} from './backup-crypto.ts'

const PASSPHRASE = 'correct horse battery staple'

function makeBackup(): BackupFile {
  return {
    manifest: {
      app: BACKUP_APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 2,
      createdAt: '2026-11-03T10:00:00.000Z',
      counts: {
        customers: 1,
        properties: 0,
        receipts: 0,
        settings: 0,
      },
    },
    customers: [
      {
        id: 'customer-1',
        fullName: 'Asha Rao',
        phone: '9876543210',
        email: null,
        address: null,
        notes: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    properties: [],
    receipts: [],
    receiptCsv: 'Receipt number\r\n',
    settings: [],
    sequences: [],
  }
}

async function captureError(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    return error
  }

  throw new Error('Expected the action to fail.')
}

describe('encrypted backups', () => {
  it('round-trips a backup with the correct passphrase', async () => {
    const backup = makeBackup()
    const encrypted = await encryptBackup(backup, PASSPHRASE)

    expect(encrypted).not.toContain('Asha Rao')
    expect(isEncryptedBackupText(encrypted)).toBe(true)
    expect(await parseBackupFile(encrypted, PASSPHRASE)).toEqual(backup)
  })

  it('requires the passphrase for encrypted backups', async () => {
    const encrypted = await encryptBackup(makeBackup(), PASSPHRASE)
    const error = await captureError(() => parseBackupFile(encrypted))

    expect((error as Error).message).toContain('encrypted')
  })

  it('rejects a wrong passphrase', async () => {
    const encrypted = await encryptBackup(makeBackup(), PASSPHRASE)
    const error = await captureError(() =>
      parseBackupFile(encrypted, 'this is the wrong passphrase'),
    )

    expect((error as Error).message).toContain('incorrect')
  })

  it('still reads legacy plaintext backups', async () => {
    const backup = makeBackup()

    expect(await parseBackupFile(serializeBackup(backup))).toEqual(backup)
    expect(isEncryptedBackupText(serializeBackup(backup))).toBe(false)
  })

  it('rejects short export passphrases', async () => {
    const error = await captureError(() =>
      encryptBackup(makeBackup(), 'short'),
    )

    expect((error as Error).message).toContain('8 characters')
  })
})
