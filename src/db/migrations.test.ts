import initSqlite, {
  type Database,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, describe, expect, it } from '@guchho/test'

import { DbSchemaError } from './errors.ts'
import {
  assertDatabaseHealth,
  LATEST_SCHEMA_VERSION,
  migrateDatabase,
  readSchemaVersion,
} from './migrations.ts'

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
}

function captureError(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected the action to fail.')
}

describe('database migrations', () => {
  it('creates the current schema and is idempotent', () => {
    openDatabase()

    expect(migrateDatabase(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(readSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(migrateDatabase(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(
      db.selectValue(`SELECT value FROM settings WHERE key = 'receipt.prefix'`),
    ).toBe('PN')
  })

  it('rejects a workspace created by a newer app version', () => {
    openDatabase()
    db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`)

    const error = captureError(() => migrateDatabase(db))

    expect(error).toBeInstanceOf(DbSchemaError)
    expect((error as Error).message).toContain('Update PayNote')
  })

  it('rejects a version-current workspace with missing tables', () => {
    openDatabase()
    db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION}`)

    const error = captureError(() => migrateDatabase(db))

    expect(error).toBeInstanceOf(DbSchemaError)
    expect((error as Error).message).toContain('missing required tables')
  })

  it('detects records that reference missing records', () => {
    openDatabase()
    migrateDatabase(db)
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(`INSERT INTO receipts (
      id,
      receipt_number,
      receipt_type,
      customer_id,
      property_id,
      receipt_date,
      payment_period,
      amount_paise,
      payment_method,
      reference_number,
      description,
      notes,
      created_at,
      updated_at
    ) VALUES (
      'receipt-orphan',
      'PN-2026-9999',
      'rent',
      'missing-customer',
      NULL,
      '2026-11-03',
      NULL,
      100,
      'cash',
      NULL,
      NULL,
      NULL,
      '2026-11-03T00:00:00.000Z',
      '2026-11-03T00:00:00.000Z'
    )`)
    db.exec('PRAGMA foreign_keys = ON')

    const error = captureError(() => assertDatabaseHealth(db))

    expect(error).toBeInstanceOf(DbSchemaError)
    expect((error as Error).message).toContain('missing records')
  })

  it('upgrades existing data into the business profile', () => {
    openDatabase()
    migrateDatabase(db, 2)

    const timestamp = '2026-11-03T00:00:00.000Z'
    const sequenceYear = new Date().getFullYear()

    db.exec(
      `INSERT INTO customers (
        id, full_name, phone, email, address, notes, created_at, updated_at
      ) VALUES ('customer-1', 'Asha Rao', '', NULL, NULL, NULL, ?, ?)`,
      { bind: [timestamp, timestamp] },
    )
    db.exec(
      `INSERT INTO properties (
        id, name, property_type, property_number, address, description, notes,
        created_at, updated_at
      ) VALUES ('property-1', 'Annapurna', 'house', NULL, NULL, NULL, NULL, ?, ?)`,
      { bind: [timestamp, timestamp] },
    )
    db.exec(
      `INSERT INTO receipts (
        id, receipt_number, receipt_type, customer_id, property_id, receipt_date,
        payment_period, amount_paise, payment_method, status, reference_number,
        description, notes, created_at, updated_at
      ) VALUES (
        'receipt-1', 'PN-2026-0001', 'rent', 'customer-1', 'property-1',
        '2026-11-03', NULL, 100000, 'cash', 'issued', NULL, NULL, NULL, ?, ?
      )`,
      { bind: [timestamp, timestamp] },
    )
    db.exec(
      `INSERT INTO receipt_details (receipt_id, field_key, field_value)
       VALUES ('receipt-1', 'note', 'kept')`,
    )
    db.exec(
      `INSERT INTO receipt_items (
        receipt_id, sort_order, description, quantity, rate_paise,
        discount_paise, line_total_paise
      ) VALUES ('receipt-1', 0, 'Rent', 1, 100000, 0, 100000)`,
    )
    db.exec(
      `UPDATE settings SET value = 'Asha Traders', updated_at = ?
       WHERE key = 'business.name'`,
      { bind: [timestamp] },
    )
    db.exec(
      `UPDATE receipt_sequences SET next_number = 2, updated_at = ?
       WHERE year = ?`,
      { bind: [timestamp, sequenceYear] },
    )

    expect(migrateDatabase(db)).toBe(LATEST_SCHEMA_VERSION)

    expect(
      db.selectValue(`SELECT profile FROM receipts WHERE id = 'receipt-1'`),
    ).toBe('business')
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM receipt_details WHERE receipt_id = 'receipt-1'`,
      ),
    ).toBe(1)
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM receipt_items WHERE receipt_id = 'receipt-1'`,
      ),
    ).toBe(1)
    expect(
      db.selectValue(
        `SELECT value FROM settings WHERE profile = 'business' AND key = 'business.name'`,
      ),
    ).toBe('Asha Traders')
    expect(
      db.selectValue(
        `SELECT value FROM settings WHERE profile = 'individual' AND key = 'business.name'`,
      ),
    ).toBe('')
    expect(
      db.selectValue(
        `SELECT value FROM settings WHERE profile = 'individual' AND key = 'profile.type'`,
      ),
    ).toBe('individual')
    expect(
      db.selectValue(
        `SELECT next_number FROM receipt_sequences
         WHERE profile = 'business' AND year = ?`,
        [sequenceYear],
      ),
    ).toBe(2)
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM receipt_sequences
         WHERE profile = 'individual' AND year = ?`,
        [sequenceYear],
      ),
    ).toBe(0)
  })
})
