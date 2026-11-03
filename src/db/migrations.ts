import type { Database } from '@sqlite.org/sqlite-wasm'

interface Migration {
  version: number
  name: string
  statements: readonly string[]
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

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
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0

export function readSchemaVersion(db: Database): number {
  return toNumber(db.selectValue('PRAGMA user_version'))
}

export function migrateDatabase(db: Database): number {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)

  let currentVersion = readSchemaVersion(db)

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue
    }

    if (migration.version !== currentVersion + 1) {
      throw new Error(`Missing database migration before version ${migration.version}.`)
    }

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

    currentVersion = migration.version
  }

  return currentVersion
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
