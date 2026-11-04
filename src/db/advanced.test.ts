import initSqlite, {
  type Database,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, describe, expect, it } from '@guchho/test'

import type { BackupFile } from '../domain/backup.ts'

import { exportBackup, restoreBackup } from './backup.ts'
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from './customers.ts'
import { migrateDatabase } from './migrations.ts'
import { createProperty, deleteProperty } from './properties.ts'
import {
  createReceipt,
  deleteReceipt,
  getReceipt,
  listReceipts,
  updateReceipt,
} from './receipts.ts'
import { getReportSummary } from './reports.ts'
import {
  getSetting,
  listSettings,
  readSettings,
  setSettings,
} from './settings.ts'

let sqlite3: Sqlite3Static
let db: Database

beforeAll(async () => {
  sqlite3 = await initSqlite()
})

afterEach(() => {
  if (db) {
    db.close()
  }
})

function openDatabase() {
  db = new sqlite3.oo1.DB(':memory:', 'c')
  db.exec('PRAGMA foreign_keys = ON')
  migrateDatabase(db)
}

function captureError(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected the action to fail.')
}

function seedReceipts() {
  const customer = createCustomer(db, { fullName: 'Asha Rao' })
  const property = createProperty(db, {
    name: 'Main Shop',
    propertyType: 'shop',
  })

  createReceipt(db, {
    receiptType: 'rent',
    customerId: customer.id,
    propertyId: property.id,
    receiptDate: '2026-11-01',
    amountPaise: 100000,
    paymentMethod: 'cash',
    status: 'paid',
  })
  createReceipt(db, {
    receiptType: 'deposit',
    customerId: customer.id,
    propertyId: property.id,
    receiptDate: '2026-11-02',
    amountPaise: 200000,
    paymentMethod: 'upi',
    status: 'issued',
  })
  createReceipt(db, {
    receiptType: 'rent',
    customerId: customer.id,
    receiptDate: '2026-11-03',
    amountPaise: 300000,
    paymentMethod: 'cash',
    status: 'cancelled',
  })

  return { customer, property }
}

describe('settings repository', () => {
  it('stores, reads, and validates settings', () => {
    openDatabase()

    setSettings(db, {
      'business.name': 'Asha Traders',
      'receipt.prefix': 'AT',
    })

    expect(getSetting(db, 'business.name')).toBe('Asha Traders')
    expect(readSettings(db)).toEqual({
      'business.name': 'Asha Traders',
      'receipt.prefix': 'AT',
      'receipt.timezone': 'Asia/Kolkata',
    })
    expect(listSettings(db).map((setting) => setting.key)).toEqual([
      'business.name',
      'receipt.prefix',
      'receipt.timezone',
    ])

    setSettings(db, { 'business.name': 'Updated' })
    expect(getSetting(db, 'business.name')).toBe('Updated')
    expect(getSetting(db, 'missing')).toBeNull()
    expect(captureError(() => getSetting(db, ''))).toBeInstanceOf(Error)
    expect(captureError(() => setSettings(db, { key: 'x'.repeat(5001) }))).toBeInstanceOf(
      Error,
    )
  })
})

describe('receipt items and statuses', () => {
  it('derives totals from items and persists status', () => {
    openDatabase()

    const receipt = createReceipt(db, {
      receiptType: 'service',
      receiptDate: '2026-11-03',
      amountPaise: 1,
      paymentMethod: 'card',
      status: 'draft',
      items: [
        {
          description: 'Consulting',
          quantity: 2,
          ratePaise: 50000,
          discountPaise: 5000,
        },
        { description: 'Travel', quantity: 1, ratePaise: 2500 },
      ],
    })

    expect(receipt.amountPaise).toBe(97500)
    expect(receipt.items).toHaveLength(2)
    expect(receipt.items[0]?.lineTotalPaise).toBe(95000)
    expect(listReceipts(db, { status: 'draft' }).total).toBe(1)

    const issued = updateReceipt(db, receipt.id, {
      receiptType: 'service',
      receiptDate: '2026-11-03',
      amountPaise: 97500,
      paymentMethod: 'card',
      status: 'issued',
      items: receipt.items,
    })

    expect(issued.status).toBe('issued')
    expect(issued.receiptNumber).toBe(receipt.receiptNumber)

    expect(
      captureError(() =>
        updateReceipt(db, receipt.id, {
          receiptType: 'service',
          receiptDate: '2026-11-03',
          amountPaise: 97500,
          paymentMethod: 'card',
          status: 'draft',
        }),
      ),
    ).toBeInstanceOf(Error)

    const cancelled = updateReceipt(db, receipt.id, {
      receiptType: 'service',
      receiptDate: '2026-11-03',
      amountPaise: 97500,
      paymentMethod: 'card',
      status: 'cancelled',
    })

    expect(cancelled.status).toBe('cancelled')
    expect(getReceipt(db, receipt.id).status).toBe('cancelled')
  })

  it('uses the configured receipt prefix and keeps numbers unique', () => {
    openDatabase()
    setSettings(db, { 'receipt.prefix': 'AT' })

    const first = createReceipt(db, {
      receiptType: 'rent',
      receiptDate: '2026-11-03',
      amountPaise: 100,
      paymentMethod: 'cash',
    })
    const second = createReceipt(db, {
      receiptType: 'rent',
      receiptDate: '2026-11-03',
      amountPaise: 100,
      paymentMethod: 'cash',
    })

    expect(first.receiptNumber).toBe('AT-2026-0001')
    expect(second.receiptNumber).toBe('AT-2026-0002')
    expect(first.receiptNumber).not.toBe(second.receiptNumber)
  })

  it('uses the configured receipt number format', () => {
    openDatabase()
    setSettings(db, {
      'receipt.prefix': 'AT',
      'receipt.numberFormat': '{PREFIX}/{YY}/{000}',
    })

    const receipt = createReceipt(db, {
      receiptType: 'rent',
      receiptDate: '2026-11-03',
      amountPaise: 100,
      paymentMethod: 'cash',
    })

    expect(receipt.receiptNumber).toBe('AT/26/001')
  })
})

describe('reports repository', () => {
  it('excludes cancelled receipts and returns breakdowns', () => {
    openDatabase()
    seedReceipts()

    const summary = getReportSummary(db)

    expect(summary.receiptCount).toBe(2)
    expect(summary.cancelledCount).toBe(1)
    expect(summary.totalPaise).toBe(300000)
    expect(summary.averagePaise).toBe(150000)
    expect(summary.byDay.map((row) => row.key)).toEqual([
      '2026-11-01',
      '2026-11-02',
    ])
    expect(summary.byCategory.map((row) => row.key).sort()).toEqual([
      'deposit',
      'rent',
    ])
    expect(summary.byCustomer[0]).toMatchObject({
      label: 'Asha Rao',
      count: 2,
      totalPaise: 300000,
    })
    expect(summary.byProperty[0]?.label).toBe('Main Shop')
  })

  it('applies date, category, status, customer, and search filters', () => {
    openDatabase()
    const { customer } = seedReceipts()

    expect(
      getReportSummary(db, {
        fromDate: '2026-11-02',
        toDate: '2026-11-02',
      }).receiptCount,
    ).toBe(1)
    expect(getReportSummary(db, { receiptType: 'rent' }).totalPaise).toBe(100000)
    expect(getReportSummary(db, { status: 'paid' }).totalPaise).toBe(100000)
    expect(getReportSummary(db, { customerId: customer.id }).receiptCount).toBe(2)
    expect(getReportSummary(db, { search: 'asha' }).receiptCount).toBe(2)
    expect(getReportSummary(db, { search: 'missing' }).receiptCount).toBe(0)
  })
})

describe('backup repository', () => {
  it('exports full data with a receipt CSV and restores it', () => {
    openDatabase()
    seedReceipts()

    const backup = exportBackup(db)

    expect(backup.manifest.schemaVersion).toBeGreaterThanOrEqual(2)
    expect(backup.customers).toHaveLength(1)
    expect(backup.properties).toHaveLength(1)
    expect(backup.receipts).toHaveLength(3)
    expect(backup.receipts[0]?.details).toBeDefined()
    expect(backup.receipts[0]?.items).toBeDefined()
    expect(backup.receiptCsv).toContain('PN-2026-0001')

    const receipt = backup.receipts[0]!
    deleteReceipt(db, receipt.id)

    for (const remaining of listReceipts(db).items) {
      deleteReceipt(db, remaining.id)
    }

    deleteProperty(db, backup.properties[0]!.id)
    deleteCustomer(db, backup.customers[0]!.id)

    const result = restoreBackup(db, backup, 'replace')

    expect(result).toEqual({
      customers: 1,
      properties: 1,
      receipts: 3,
      settings: backup.settings.length,
      mode: 'replace',
    })
    expect(listCustomers(db).total).toBe(1)
    expect(listReceipts(db).total).toBe(3)
  })

  it('merges matching records and keeps unrelated records', () => {
    openDatabase()
    const { customer } = seedReceipts()
    const backup = exportBackup(db)
    const other = createCustomer(db, { fullName: 'Ravi Shah' })

    updateCustomer(db, customer.id, { fullName: 'Changed Name' })

    const result = restoreBackup(db, backup, 'merge')

    expect(result.mode).toBe('merge')
    expect(getCustomer(db, customer.id).fullName).toBe('Asha Rao')
    expect(getCustomer(db, other.id).fullName).toBe('Ravi Shah')
  })

  it('rolls back a failed replace restore', () => {
    openDatabase()
    seedReceipts()

    const backup = exportBackup(db) as BackupFile
    const template = backup.receipts[0]!

    backup.receipts.push({
      ...template,
      id: 'broken-receipt',
      receiptNumber: 'PN-2026-9999',
      customerId: 'missing-customer',
      details: [],
      items: [],
    })

    expect(captureError(() => restoreBackup(db, backup, 'replace'))).toBeInstanceOf(
      Error,
    )
    expect(listCustomers(db).total).toBe(1)
    expect(listReceipts(db).total).toBe(3)
  })

  it('rejects backups from a newer schema', () => {
    openDatabase()
    seedReceipts()

    const backup = exportBackup(db)
    backup.manifest.schemaVersion = 999

    expect(captureError(() => restoreBackup(db, backup, 'merge'))).toBeInstanceOf(
      Error,
    )
  })
})
