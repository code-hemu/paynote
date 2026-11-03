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
})
