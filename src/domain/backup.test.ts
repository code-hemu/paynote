import { describe, expect, it } from '@guchho/test'

import type { BackupFile } from './backup.ts'
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  createBackupManifest,
  parseBackup,
  receiptStatusFromBackup,
  serializeBackup,
} from './backup.ts'

function makeBackup(): BackupFile {
  return {
    manifest: {
      app: BACKUP_APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 2,
      createdAt: '2026-11-03T10:00:00.000Z',
      counts: {
        customers: 1,
        properties: 1,
        receipts: 1,
        settings: 1,
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
    properties: [
      {
        id: 'property-1',
        name: 'Main Shop',
        propertyType: 'shop',
        propertyNumber: null,
        address: null,
        description: null,
        notes: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    receipts: [
      {
        id: 'receipt-1',
        receiptNumber: 'PN-2026-0001',
        receiptType: 'rent',
        customerId: 'customer-1',
        customerName: 'Asha Rao',
        propertyId: null,
        propertyName: null,
        receiptDate: '2026-11-03',
        paymentPeriod: null,
        amountPaise: 125000,
        paymentMethod: 'cash',
        status: 'issued',
        referenceNumber: null,
        description: null,
        notes: null,
        createdAt: '2026-11-03T10:00:00.000Z',
        updatedAt: '2026-11-03T10:00:00.000Z',
        details: [{ fieldKey: 'tenant', fieldValue: 'Asha Rao' }],
        items: [
          {
            description: 'Rent',
            quantity: 1,
            ratePaise: 125000,
            discountPaise: 0,
            lineTotalPaise: 125000,
          },
        ],
      },
    ],
    receiptCsv: 'Receipt number,Date\r\nPN-2026-0001,2026-11-03\r\n',
    settings: [
      {
        key: 'business.name',
        value: 'PayNote',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    sequences: [
      {
        year: 2026,
        prefix: 'PN',
        nextNumber: 2,
        updatedAt: '2026-11-03T10:00:00.000Z',
      },
    ],
  }
}

function captureError(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected the action to fail.')
}

function expectMessage(action: () => unknown, expected: string) {
  const error = captureError(action)

  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toContain(expected)
}

describe('backup format', () => {
  it('creates a manifest with counts and version metadata', () => {
    const backup = makeBackup()
    const manifest = createBackupManifest(
      2,
      backup,
      new Date('2026-11-03T12:00:00.000Z'),
    )

    expect(manifest).toEqual({
      app: BACKUP_APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 2,
      createdAt: '2026-11-03T12:00:00.000Z',
      counts: { customers: 1, properties: 1, receipts: 1, settings: 1 },
    })
  })

  it('round-trips a valid backup file', () => {
    const backup = makeBackup()
    const parsed = parseBackup(serializeBackup(backup))

    expect(parsed).toEqual(backup)
  })

  it('accepts backups without receipt CSV or sequences', () => {
    const backup = makeBackup() as unknown as Record<string, unknown>
    delete backup.receiptCsv
    delete backup.sequences

    const parsed = parseBackup(JSON.stringify(backup))

    expect(parsed.receiptCsv).toBe('')
    expect(parsed.sequences).toEqual([])
  })

  it('rejects corrupt JSON and non-object files', () => {
    expectMessage(() => parseBackup('{'), 'not valid JSON')
    expectMessage(() => parseBackup('[]'), 'JSON object')
  })

  it('rejects backups from other apps or formats', () => {
    const otherApp = makeBackup() as unknown as Record<string, unknown>
    ;(otherApp.manifest as Record<string, unknown>).app = 'other'
    expectMessage(() => parseBackup(JSON.stringify(otherApp)), 'not a PayNote backup')

    const otherFormat = makeBackup() as unknown as Record<string, unknown>
    ;(otherFormat.manifest as Record<string, unknown>).formatVersion = 99
    expectMessage(() => parseBackup(JSON.stringify(otherFormat)), 'Unsupported backup format')
  })

  it('rejects missing lists and invalid required fields', () => {
    const missing = makeBackup() as unknown as Record<string, unknown>
    delete missing.customers
    expectMessage(() => parseBackup(JSON.stringify(missing)), 'customers')

    const badCustomer = makeBackup()
    badCustomer.customers[0]!.fullName = ''
    expectMessage(() => parseBackup(JSON.stringify(badCustomer)), 'customers[0].fullName')

    const badReceipt = makeBackup()
    badReceipt.receipts[0]!.amountPaise = -1
    expectMessage(() => parseBackup(JSON.stringify(badReceipt)), 'amountPaise')

    const badStatus = makeBackup()
    ;(badStatus.receipts[0] as unknown as Record<string, unknown>).status = 'refunded'
    expectMessage(() => parseBackup(JSON.stringify(badStatus)), 'status is invalid')

    const badCsv = makeBackup() as unknown as Record<string, unknown>
    badCsv.receiptCsv = 42
    expectMessage(() => parseBackup(JSON.stringify(badCsv)), 'receipt CSV')

    const badSequence = makeBackup()
    badSequence.sequences[0]!.nextNumber = 0
    expectMessage(() => parseBackup(JSON.stringify(badSequence)), 'nextNumber')
  })

  it('normalizes legacy statuses', () => {
    expect(receiptStatusFromBackup('paid')).toBe('paid')
    expect(receiptStatusFromBackup(undefined)).toBe('issued')
  })
})
