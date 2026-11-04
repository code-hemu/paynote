import initSqlite, {
  type Database,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, describe, expect, it } from '@guchho/test'

import { deleteAllData, exportBackup, restoreBackup } from './backup.ts'
import { setDatabaseProfile } from './context.ts'
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from './customers.ts'
import {
  DbConflictError,
  DbNotFoundError,
  DbValidationError,
} from './errors.ts'
import { migrateDatabase } from './migrations.ts'
import {
  createProperty,
  deleteProperty,
  getProperty,
  listProperties,
  updateProperty,
} from './properties.ts'
import {
  createReceipt,
  deleteReceipt,
  getReceipt,
  listReceipts,
  updateReceipt,
} from './receipts.ts'
import { getReportSummary } from './reports.ts'
import { getSetting, listSettings, setSetting } from './settings.ts'

let sqlite3: Sqlite3Static
let db: Database

beforeAll(async () => {
  sqlite3 = await initSqlite()
})

afterEach(() => {
  setDatabaseProfile('business')

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

function receiptInput(customerId: string | null = null) {
  return {
    receiptType: 'Rent',
    customerId,
    receiptDate: '2026-05-01',
    amountPaise: 100000,
    paymentMethod: 'Cash',
  }
}

describe('profile-scoped data', () => {
  it('keeps customers separate inside one database', () => {
    openDatabase()

    createCustomer(db, { fullName: 'Asha Rao' })

    setDatabaseProfile('individual')
    expect(listCustomers(db).total).toBe(0)

    createCustomer(db, { fullName: 'Asha Rao' })
    expect(listCustomers(db).total).toBe(1)

    setDatabaseProfile('business')
    const business = listCustomers(db)

    expect(business.total).toBe(1)
    expect(business.items[0]?.fullName).toBe('Asha Rao')
  })

  it('keeps settings separate per profile', () => {
    openDatabase()

    setSetting(db, 'business.name', 'Asha Traders')

    setDatabaseProfile('individual')
    expect(getSetting(db, 'business.name')).toBe('')

    setSetting(db, 'business.name', 'Asha Rao')
    expect(getSetting(db, 'business.name')).toBe('Asha Rao')

    setDatabaseProfile('business')
    expect(getSetting(db, 'business.name')).toBe('Asha Traders')
  })

  it('keeps receipt numbers and records separate per profile', () => {
    openDatabase()

    const businessCustomer = createCustomer(db, { fullName: 'Asha Rao' })
    const businessReceipt = createReceipt(db, {
      receiptType: 'Rent',
      customerId: businessCustomer.id,
      receiptDate: '2026-05-01',
      amountPaise: 100000,
      paymentMethod: 'Cash',
    })

    setDatabaseProfile('individual')
    expect(listReceipts(db).total).toBe(0)

    const individualCustomer = createCustomer(db, { fullName: 'Asha Rao' })
    const individualReceipt = createReceipt(db, {
      receiptType: 'Rent',
      customerId: individualCustomer.id,
      receiptDate: '2026-05-01',
      amountPaise: 200000,
      paymentMethod: 'Cash',
    })

    expect(individualReceipt.receiptNumber).toBe(
      businessReceipt.receiptNumber,
    )
    expect(listReceipts(db).total).toBe(1)

    setDatabaseProfile('business')
    const businessReceipts = listReceipts(db)

    expect(businessReceipts.total).toBe(1)
    expect(businessReceipts.items[0]?.amountPaise).toBe(100000)
  })

  it('blocks reads and mutations of another profile records', () => {
    openDatabase()

    const customer = createCustomer(db, { fullName: 'Business Customer' })
    const property = createProperty(db, {
      name: 'Business Property',
      propertyType: 'shop',
    })
    const receipt = createReceipt(db, {
      ...receiptInput(customer.id),
      propertyId: property.id,
    })

    setDatabaseProfile('individual')

    expect(captureError(() => getCustomer(db, customer.id))).toBeInstanceOf(
      DbNotFoundError,
    )
    expect(
      captureError(() =>
        updateCustomer(db, customer.id, { fullName: 'Changed' }),
      ),
    ).toBeInstanceOf(DbNotFoundError)
    expect(captureError(() => deleteCustomer(db, customer.id))).toBeInstanceOf(
      DbNotFoundError,
    )

    expect(captureError(() => getProperty(db, property.id))).toBeInstanceOf(
      DbNotFoundError,
    )
    expect(
      captureError(() =>
        updateProperty(db, property.id, {
          name: 'Changed',
          propertyType: 'house',
        }),
      ),
    ).toBeInstanceOf(DbNotFoundError)
    expect(captureError(() => deleteProperty(db, property.id))).toBeInstanceOf(
      DbNotFoundError,
    )

    expect(captureError(() => getReceipt(db, receipt.id))).toBeInstanceOf(
      DbNotFoundError,
    )
    expect(
      captureError(() =>
        updateReceipt(db, receipt.id, {
          ...receiptInput(customer.id),
          propertyId: property.id,
        }),
      ),
    ).toBeInstanceOf(DbNotFoundError)
    expect(captureError(() => deleteReceipt(db, receipt.id))).toBeInstanceOf(
      DbNotFoundError,
    )

    setDatabaseProfile('business')
    expect(getCustomer(db, customer.id).fullName).toBe('Business Customer')
    expect(getProperty(db, property.id).name).toBe('Business Property')
    expect(getReceipt(db, receipt.id).id).toBe(receipt.id)
  })

  it('rejects receipts that reference another profile records', () => {
    openDatabase()

    const customer = createCustomer(db, { fullName: 'Business Customer' })
    const property = createProperty(db, {
      name: 'Business Property',
      propertyType: 'shop',
    })

    setDatabaseProfile('individual')

    expect(
      captureError(() => createReceipt(db, receiptInput(customer.id))),
    ).toBeInstanceOf(DbValidationError)
    expect(
      captureError(() =>
        createReceipt(db, {
          ...receiptInput(),
          propertyId: property.id,
        }),
      ),
    ).toBeInstanceOf(DbValidationError)
    expect(listReceipts(db).total).toBe(0)

    setDatabaseProfile('business')
    expect(getCustomer(db, customer.id).fullName).toBe('Business Customer')
  })

  it('does not join names across profiles', () => {
    openDatabase()

    const customer = createCustomer(db, { fullName: 'Business Customer' })

    setDatabaseProfile('individual')
    db.exec({
      sql: `INSERT INTO receipts (
        id, profile, receipt_number, receipt_type, customer_id, receipt_date,
        amount_paise, payment_method, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        'cross-profile-receipt',
        'individual',
        'PN-2026-0001',
        'Rent',
        customer.id,
        '2026-05-01',
        100000,
        'Cash',
        'issued',
        '2026-05-01T00:00:00.000Z',
        '2026-05-01T00:00:00.000Z',
      ],
    })

    expect(getReceipt(db, 'cross-profile-receipt').customerName).toBeNull()
    expect(getReportSummary(db).byCustomer[0]?.label).toBe('Unassigned')
  })

  it('blocks restoring another profile backup', () => {
    openDatabase()

    createCustomer(db, { fullName: 'Business Customer' })
    const backup = exportBackup(db)

    setDatabaseProfile('individual')
    createCustomer(db, { fullName: 'Individual Customer' })

    expect(captureError(() => restoreBackup(db, backup, 'merge'))).toBeInstanceOf(
      DbConflictError,
    )
    expect(captureError(() => restoreBackup(db, backup, 'replace'))).toBeInstanceOf(
      DbConflictError,
    )

    const individual = listCustomers(db)
    expect(individual.total).toBe(1)
    expect(individual.items[0]?.fullName).toBe('Individual Customer')

    setDatabaseProfile('business')
    const business = listCustomers(db)
    expect(business.total).toBe(1)
    expect(business.items[0]?.fullName).toBe('Business Customer')
  })

  it('deletes every record from the database', () => {
    openDatabase()

    const customer = createCustomer(db, { fullName: 'Asha Rao' })
    const property = createProperty(db, {
      name: 'Annapurna',
      propertyType: 'house',
    })
    createReceipt(db, {
      receiptType: 'Rent',
      customerId: customer.id,
      propertyId: property.id,
      receiptDate: '2026-05-01',
      amountPaise: 100000,
      paymentMethod: 'Cash',
      details: [{ fieldKey: 'note', fieldValue: 'kept' }],
      items: [
        {
          description: 'Rent',
          quantity: 1,
          ratePaise: 100000,
          discountPaise: 0,
        },
      ],
    })
    setSetting(db, 'business.name', 'Asha Traders')

    setDatabaseProfile('individual')
    createCustomer(db, { fullName: 'Individual Only' })

    setDatabaseProfile('business')
    deleteAllData(db)

    expect(listCustomers(db).total).toBe(0)
    expect(listProperties(db).total).toBe(0)
    expect(listReceipts(db).total).toBe(0)
    expect(getSetting(db, 'business.name')).toBe('')
    expect(listSettings(db).map((setting) => setting.key)).toEqual([
      'business.name',
      'profile.type',
      'receipt.prefix',
      'receipt.timezone',
    ])
    expect(getSetting(db, 'profile.type')).toBe('business')

    setDatabaseProfile('individual')
    expect(listCustomers(db).total).toBe(0)
    expect(getSetting(db, 'profile.type')).toBe('individual')
    expect(getSetting(db, 'receipt.prefix')).toBe('PN')
  })
})
