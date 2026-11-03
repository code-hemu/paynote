import type { Database } from '@sqlite.org/sqlite-wasm'

import { DbSchemaError } from './errors.ts'

interface Migration {
  version: number
  name: string
  statements: readonly string[]
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

const REQUIRED_TABLES = [
  'settings',
  'customers',
  'properties',
  'receipts',
  'receipt_details',
  'receipt_items',
  'receipt_sequences',
  'audit_logs',
  'schema_migrations',
] as const

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    statements: [
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        email TEXT,
        address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      'CREATE INDEX idx_customers_name ON customers(full_name)',
      'CREATE INDEX idx_customers_phone ON customers(phone)',
      `CREATE TABLE properties (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        property_type TEXT NOT NULL
          CHECK (property_type IN ('house', 'godown', 'shop', 'other')),
        property_number TEXT,
        address TEXT,
        description TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      'CREATE INDEX idx_properties_name ON properties(name)',
      'CREATE INDEX idx_properties_type ON properties(property_type)',
      `CREATE TABLE receipts (
        id TEXT PRIMARY KEY,
        receipt_number TEXT NOT NULL UNIQUE,
        receipt_type TEXT NOT NULL,
        customer_id TEXT,
        property_id TEXT,
        receipt_date TEXT NOT NULL,
        payment_period TEXT,
        amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
        payment_method TEXT NOT NULL,
        reference_number TEXT,
        description TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT
      )`,
      'CREATE INDEX idx_receipts_receipt_date ON receipts(receipt_date)',
      'CREATE INDEX idx_receipts_receipt_type ON receipts(receipt_type)',
      'CREATE INDEX idx_receipts_customer_id ON receipts(customer_id)',
      'CREATE INDEX idx_receipts_property_id ON receipts(property_id)',
      `CREATE TABLE receipt_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id TEXT NOT NULL,
        field_key TEXT NOT NULL CHECK (length(field_key) > 0),
        field_value TEXT NOT NULL,
        UNIQUE (receipt_id, field_key),
        FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX idx_receipt_details_receipt_id ON receipt_details(receipt_id)',
      `CREATE TABLE receipt_sequences (
        year INTEGER PRIMARY KEY,
        prefix TEXT NOT NULL DEFAULT 'PN',
        next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT,
        created_at TEXT NOT NULL
      )`,
      'CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)',
      'CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id)',
      `INSERT INTO settings (key, value, updated_at) VALUES
        ('business.name', '', ${NOW}),
        ('receipt.prefix', 'PN', ${NOW}),
        ('receipt.timezone', 'Asia/Kolkata', ${NOW})
        ON CONFLICT(key) DO NOTHING`,
      `INSERT INTO receipt_sequences (year, prefix, next_number, updated_at)
        VALUES (
          CAST(strftime('%Y', 'now') AS INTEGER),
          'PN',
          1,
          ${NOW}
        )
        ON CONFLICT(year) DO NOTHING`,
    ],
  },
  {
    version: 2,
    name: 'receipt_status_and_items',
    statements: [
      `ALTER TABLE receipts ADD COLUMN status TEXT NOT NULL DEFAULT 'issued'
        CHECK (status IN ('draft', 'issued', 'paid', 'cancelled'))`,
      'CREATE INDEX idx_receipts_status ON receipts(status)',
      `CREATE TABLE receipt_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0),
        rate_paise INTEGER NOT NULL CHECK (rate_paise >= 0),
        discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
        line_total_paise INTEGER NOT NULL CHECK (line_total_paise >= 0),
        FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX idx_receipt_items_receipt_id ON receipt_items(receipt_id)',
    ],
  },
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0

export function readSchemaVersion(db: Database): number {
  return toNumber(db.selectValue('PRAGMA user_version'))
}

export function migrateDatabase(db: Database): number {
  db.exec('PRAGMA foreign_keys = ON')

  let currentVersion = readSchemaVersion(db)

  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new DbSchemaError(
      `This workspace uses database version ${currentVersion}, but this PayNote build supports version ${LATEST_SCHEMA_VERSION}. Update PayNote or restore a compatible backup.`,
    )
  }

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue
    }

    if (migration.version !== currentVersion + 1) {
      throw new DbSchemaError(
        `Database version ${currentVersion} cannot be upgraded because migration ${migration.version} is out of sequence. Restore a backup or clear site data.`,
      )
    }

    try {
      db.transaction('IMMEDIATE', () => {
        for (const statement of migration.statements) {
          db.exec(statement)
        }

        db.exec(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          {
            bind: [migration.version, migration.name, new Date().toISOString()],
          },
        )
        db.exec(`PRAGMA user_version = ${migration.version}`)
      })
    } catch (error) {
      throw new DbSchemaError(
        `The database could not be upgraded to version ${migration.version}: ${errorMessage(error)}`,
      )
    }

    currentVersion = migration.version
  }

  assertDatabaseHealth(db)
  return currentVersion
}

export function assertDatabaseHealth(db: Database): void {
  const tables = db.selectObjects(
    `SELECT name FROM sqlite_master WHERE type = 'table'`,
  )
  const tableNames = new Set(
    tables.map((row) => (typeof row.name === 'string' ? row.name : String(row.name ?? ''))),
  )
  const missingTables = REQUIRED_TABLES.filter((table) => !tableNames.has(table))

  if (missingTables.length > 0) {
    throw new DbSchemaError(
      `The database is missing required tables: ${missingTables.join(', ')}. Restore a backup or clear site data.`,
    )
  }

  const quickCheck = db.selectValue('PRAGMA quick_check')

  if (quickCheck !== 'ok') {
    throw new DbSchemaError(
      'The database file appears to be damaged. Restore a backup or clear site data to start over.',
    )
  }

  const foreignKeyViolations = db.selectObjects('PRAGMA foreign_key_check')

  if (foreignKeyViolations.length > 0) {
    throw new DbSchemaError(
      'The database contains records that point to missing records. Restore a backup before continuing.',
    )
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown migration error.'
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  return Number(value ?? 0)
}
