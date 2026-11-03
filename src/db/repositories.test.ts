import initSqlite, {
  type Database,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, describe, expect, it } from '@guchho/test'

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
  listProperties,
  updateProperty,
} from './properties.ts'
import {
  createReceipt,
  deleteReceipt,
  listReceipts,
  updateReceipt,
} from './receipts.ts'

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

describe('customer repository', () => {
  it('creates, searches, updates, and deletes customers', () => {
    openDatabase()

    const created = createCustomer(db, {
      fullName: 'Asha Rao',
      phone: '9876543210',
      email: 'asha@example.com',
    })

    expect(created.fullName).toBe('Asha Rao')
    expect(created.email).toBe('asha@example.com')
    expect(listCustomers(db, { search: 'asha' }).total).toBe(1)
    expect(captureError(() => getCustomer(db, 'missing'))).toBeInstanceOf(
      DbNotFoundError,
    )

    const updated = updateCustomer(db, created.id, {
      fullName: 'Asha Rao',
      phone: '9000000000',
    })

    expect(updated.phone).toBe('9000000000')
    expect(updated.email).toBeNull()
    expect(
      db.selectValue(`SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'customer'`),
    ).toBe(2)

    deleteCustomer(db, created.id)
    expect(listCustomers(db).total).toBe(0)
  })

  it('sorts customers by name in both directions', () => {
    openDatabase()

    createCustomer(db, { fullName: 'Zara Khan' })
    createCustomer(db, { fullName: 'Asha Rao' })

    expect(
      listCustomers(db, { sortBy: 'name', sortDirection: 'asc' }).items.map(
        (customer) => customer.fullName,
      ),
    ).toEqual(['Asha Rao', 'Zara Khan'])
    expect(
      listCustomers(db, { sortBy: 'name', sortDirection: 'desc' }).items.map(
        (customer) => customer.fullName,
      ),
    ).toEqual(['Zara Khan', 'Asha Rao'])
  })

  it('rejects deleting a customer that has receipts', () => {
    openDatabase()

    const customer = createCustomer(db, { fullName: 'Ravi Shah' })
    const property = createProperty(db, {
      name: 'Main Shop',
      propertyType: 'shop',
    })

    createReceipt(db, {
      receiptType: 'rent',
      customerId: customer.id,
      propertyId: property.id,
      amountPaise: 450000,
      paymentMethod: 'cash',
    })

    expect(captureError(() => deleteCustomer(db, customer.id))).toBeInstanceOf(
      DbConflictError,
    )
  })
})

describe('property repository', () => {
  it('filters properties by type and searches by address', () => {
    openDatabase()

    createProperty(db, {
      name: 'Main Shop',
      propertyType: 'shop',
      address: 'Market Road',
    })
    createProperty(db, {
      name: 'North Godown',
      propertyType: 'godown',
      propertyNumber: 'G-2',
    })

    expect(listProperties(db, { propertyType: 'shop' }).total).toBe(1)
    expect(listProperties(db, { search: 'market' }).total).toBe(1)

    const godown = listProperties(db, { propertyType: 'godown' }).items[0]

    if (!godown) {
      throw new Error('Expected the seeded godown property.')
    }

    const updated = updateProperty(db, godown.id, {
      name: 'North Godown',
      propertyType: 'godown',
      notes: 'Monsoon access only',
    })

    expect(updated.notes).toBe('Monsoon access only')
  })

  it('rejects deleting a property that has receipts', () => {
    openDatabase()

    const property = createProperty(db, {
      name: 'Main Shop',
      propertyType: 'shop',
    })

    createReceipt(db, {
      receiptType: 'rent',
      propertyId: property.id,
      amountPaise: 450000,
      paymentMethod: 'cash',
    })

    expect(captureError(() => deleteProperty(db, property.id))).toBeInstanceOf(
      DbConflictError,
    )
  })
})

describe('receipt repository', () => {
  it('generates numbers, stores details, filters, and keeps numbers on update', () => {
    openDatabase()

    const customer = createCustomer(db, { fullName: 'Asha Rao' })
    const property = createProperty(db, {
      name: 'Main Shop',
      propertyType: 'shop',
    })

    const first = createReceipt(db, {
      receiptType: 'rent',
      customerId: customer.id,
      propertyId: property.id,
      receiptDate: '2026-11-03',
      amountPaise: 125000,
      paymentMethod: 'cash',
      details: [{ fieldKey: 'Month', fieldValue: 'November' }],
    })
    const second = createReceipt(db, {
      receiptType: 'deposit',
      customerId: customer.id,
      receiptDate: '2026-11-04',
      amountPaise: 500000,
      paymentMethod: 'upi',
      referenceNumber: 'UPI-123',
    })

    expect(first.receiptNumber).toBe('PN-2026-0001')
    expect(second.receiptNumber).toBe('PN-2026-0002')
    expect(first.details).toEqual([{ fieldKey: 'Month', fieldValue: 'November' }])
    expect(listReceipts(db, { search: 'asha' }).total).toBe(2)
    expect(listReceipts(db, { receiptType: 'deposit' }).total).toBe(1)
    expect(
      listReceipts(db, { fromDate: '2026-11-04', toDate: '2026-11-04' }).total,
    ).toBe(1)

    const updated = updateReceipt(db, first.id, {
      receiptType: 'rent',
      customerId: customer.id,
      propertyId: property.id,
      receiptDate: '2026-11-05',
      amountPaise: 130000,
      paymentMethod: 'bank',
      details: [{ fieldKey: 'Month', fieldValue: 'November 2026' }],
    })

    expect(updated.receiptNumber).toBe('PN-2026-0001')
    expect(updated.details[0]?.fieldValue).toBe('November 2026')
    expect(listReceipts(db, { customerId: customer.id }).total).toBe(2)

    deleteReceipt(db, second.id)
    expect(listReceipts(db).total).toBe(1)
  })

  it('rejects invalid amounts, missing references, and missing receipts', () => {
    openDatabase()

    const customer = createCustomer(db, { fullName: 'Asha Rao' })

    expect(
      captureError(() =>
        createReceipt(db, {
          receiptType: 'rent',
          amountPaise: -1,
          paymentMethod: 'cash',
        }),
      ),
    ).toBeInstanceOf(DbValidationError)

    expect(
      captureError(() =>
        createReceipt(db, {
          receiptType: 'rent',
          customerId: 'missing',
          amountPaise: 100,
          paymentMethod: 'cash',
        }),
      ),
    ).toBeInstanceOf(DbValidationError)

    expect(
      captureError(() =>
        updateReceipt(db, 'missing', {
          receiptType: 'rent',
          customerId: customer.id,
          amountPaise: 100,
          paymentMethod: 'cash',
        }),
      ),
    ).toBeInstanceOf(DbNotFoundError)
  })
})
