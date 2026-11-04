import type { Database } from '@sqlite.org/sqlite-wasm'

import type {
  BackupFile,
  BackupSequence,
  BackupSetting,
  RestoreMode,
  RestoreSummary,
} from '../domain/backup.ts'
import { createBackupManifest } from '../domain/backup.ts'
import { computeLineItem } from '../domain/money.ts'
import { toCsv } from '../utils/csv.ts'

import { getDatabaseProfile } from './context.ts'
import { listCustomers } from './customers.ts'
import { DbConflictError, DbValidationError } from './errors.ts'
import { LATEST_SCHEMA_VERSION } from './migrations.ts'
import { DB_PROFILES, type DbProfile } from './profile.ts'
import { listProperties } from './properties.ts'
import { getReceipt, listReceipts } from './receipts.ts'
import { rowNumber, rowText } from './rows.ts'
import { listSettings, setSetting } from './settings.ts'
import type {
  Customer,
  Property,
  Receipt,
  ReceiptItem,
  ReceiptSummary,
} from './types.ts'
import { normalizeStatus, nowIso } from './validation.ts'

const PAGE_SIZE = 200

export function exportBackup(db: Database): BackupFile {
  const customers = collectAll(
    (offset) => listCustomers(db, { limit: PAGE_SIZE, offset }).items,
  )
  const properties = collectAll(
    (offset) => listProperties(db, { limit: PAGE_SIZE, offset }).items,
  )
  const receiptSummaries = collectAll(
    (offset) => listReceipts(db, { limit: PAGE_SIZE, offset }).items,
  )
  const receipts = receiptSummaries.map((summary) => getReceipt(db, summary.id))
  const settings = listSettings(db)
  const sequences = listSequences(db)

  const data = {
    customers,
    properties,
    receipts,
    receiptCsv: buildReceiptCsv(receiptSummaries),
    settings: settings.map(
      (setting): BackupSetting => ({
        key: setting.key,
        value: setting.value,
        updatedAt: setting.updatedAt,
      }),
    ),
    sequences,
  }

  return {
    manifest: createBackupManifest(LATEST_SCHEMA_VERSION, data),
    ...data,
  }
}

export function restoreBackup(
  db: Database,
  backup: BackupFile,
  mode: RestoreMode,
): RestoreSummary {
  if (backup.manifest.schemaVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `This backup was created by a newer PayNote version (schema ${backup.manifest.schemaVersion}).`,
    )
  }

  const profile = getDatabaseProfile()

  return db.transaction('IMMEDIATE', () => {
    assertNoCrossProfileRecords(db, backup, profile)

    if (mode === 'replace') {
      db.exec({
        sql: 'DELETE FROM receipts WHERE profile = ?',
        bind: [profile],
      })
      db.exec({
        sql: 'DELETE FROM customers WHERE profile = ?',
        bind: [profile],
      })
      db.exec({
        sql: 'DELETE FROM properties WHERE profile = ?',
        bind: [profile],
      })
    }

    for (const customer of backup.customers) {
      insertCustomer(db, customer, mode, profile)
    }

    for (const property of backup.properties) {
      insertProperty(db, property, mode, profile)
    }

    for (const receipt of backup.receipts) {
      insertReceipt(db, receipt, mode, profile)
    }

    for (const setting of backup.settings) {
      db.exec(
        `INSERT INTO settings (profile, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(profile, key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
        { bind: [profile, setting.key, setting.value, setting.updatedAt] },
      )
    }

    setSetting(db, 'profile.type', profile)

    for (const sequence of backup.sequences) {
      db.exec(
        `INSERT INTO receipt_sequences (profile, year, prefix, next_number, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(profile, year) DO UPDATE SET
           prefix = excluded.prefix,
           next_number = MAX(receipt_sequences.next_number, excluded.next_number),
           updated_at = excluded.updated_at`,
        {
          bind: [
            profile,
            sequence.year,
            sequence.prefix,
            sequence.nextNumber,
            sequence.updatedAt,
          ],
        },
      )
    }

    return {
      customers: backup.customers.length,
      properties: backup.properties.length,
      receipts: backup.receipts.length,
      settings: backup.settings.length,
      mode,
    }
  })
}

export function deleteAllData(db: Database): null {
  return db.transaction('IMMEDIATE', () => {
    db.exec('DELETE FROM receipt_items')
    db.exec('DELETE FROM receipt_details')
    db.exec('DELETE FROM receipts')
    db.exec('DELETE FROM receipt_sequences')
    db.exec('DELETE FROM audit_logs')
    db.exec('DELETE FROM customers')
    db.exec('DELETE FROM properties')
    db.exec('DELETE FROM settings')
    seedDefaultSettings(db)
    return null
  })
}

function seedDefaultSettings(db: Database): void {
  const updatedAt = nowIso()

  for (const profile of DB_PROFILES) {
    db.exec({
      sql: `INSERT INTO settings (profile, key, value, updated_at) VALUES
        (?, 'profile.type', ?, ?),
        (?, 'business.name', '', ?),
        (?, 'receipt.prefix', 'PN', ?),
        (?, 'receipt.timezone', 'Asia/Kolkata', ?)`,
      bind: [
        profile,
        profile,
        updatedAt,
        profile,
        updatedAt,
        profile,
        updatedAt,
        profile,
        updatedAt,
      ],
    })
  }
}

function buildReceiptCsv(receipts: ReceiptSummary[]): string {
  return toCsv(
    [
      'Receipt number',
      'Date',
      'Customer',
      'Property',
      'Category',
      'Amount (INR)',
      'Payment method',
      'Status',
      'Reference',
    ],
    receipts.map((receipt) => [
      receipt.receiptNumber,
      receipt.receiptDate,
      receipt.customerName ?? '',
      receipt.propertyName ?? '',
      receipt.receiptType,
      (receipt.amountPaise / 100).toFixed(2),
      receipt.paymentMethod,
      receipt.status,
      receipt.referenceNumber ?? '',
    ]),
  )
}

function collectAll<T>(load: (offset: number) => T[]): T[] {
  const items: T[] = []
  let offset = 0

  for (;;) {
    const page = load(offset)

    if (page.length === 0) {
      break
    }

    items.push(...page)
    offset += page.length

    if (page.length < PAGE_SIZE) {
      break
    }
  }

  return items
}

function listSequences(db: Database): BackupSequence[] {
  return db
    .selectObjects(
      'SELECT year, prefix, next_number, updated_at FROM receipt_sequences WHERE profile = ? ORDER BY year ASC',
      [getDatabaseProfile()],
    )
    .map((row) => ({
      year: rowNumber(row, 'year'),
      prefix: rowText(row, 'prefix'),
      nextNumber: rowNumber(row, 'next_number'),
      updatedAt: rowText(row, 'updated_at'),
    }))
}

function assertNoCrossProfileRecords(
  db: Database,
  backup: BackupFile,
  profile: DbProfile,
): void {
  const groups: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['customers', backup.customers.map((customer) => customer.id)],
    ['properties', backup.properties.map((property) => property.id)],
    ['receipts', backup.receipts.map((receipt) => receipt.id)],
  ]

  for (const [table, ids] of groups) {
    for (const id of ids) {
      const owner = db.selectValue(`SELECT profile FROM ${table} WHERE id = ?`, [
        id,
      ])

      if (typeof owner === 'string' && owner !== profile) {
        throw new DbConflictError(
          'This backup contains records from the other workspace. Switch back to that workspace before restoring.',
        )
      }
    }
  }
}

function assertRestoreReference(
  db: Database,
  table: 'customers' | 'properties',
  id: string | null,
  profile: DbProfile,
): void {
  if (!id) {
    return
  }

  const exists = db.selectValue(
    `SELECT 1 FROM ${table} WHERE id = ? AND profile = ?`,
    [id, profile],
  )

  if (!exists) {
    throw new DbValidationError(
      'This backup contains a receipt that references a record outside this workspace.',
    )
  }
}

function insertCustomer(
  db: Database,
  customer: Customer,
  mode: RestoreMode,
  profile: DbProfile,
): void {
  const conflict = mode === 'merge'
    ? `ON CONFLICT(id) DO UPDATE SET
        full_name = excluded.full_name,
        phone = excluded.phone,
        email = excluded.email,
        address = excluded.address,
        notes = excluded.notes,
        updated_at = excluded.updated_at
        WHERE profile = excluded.profile`
    : ''

  db.exec(
    `INSERT INTO customers (
      id, profile, full_name, phone, email, address, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ${conflict}`,
    {
      bind: [
        customer.id,
        profile,
        customer.fullName,
        customer.phone ?? '',
        customer.email ?? null,
        customer.address ?? null,
        customer.notes ?? null,
        customer.createdAt,
        customer.updatedAt,
      ],
    },
  )
}

function insertProperty(
  db: Database,
  property: Property,
  mode: RestoreMode,
  profile: DbProfile,
): void {
  const conflict = mode === 'merge'
    ? `ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        property_type = excluded.property_type,
        property_number = excluded.property_number,
        address = excluded.address,
        description = excluded.description,
        notes = excluded.notes,
        updated_at = excluded.updated_at
        WHERE profile = excluded.profile`
    : ''

  db.exec(
    `INSERT INTO properties (
      id, profile, name, property_type, property_number, address, description, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ${conflict}`,
    {
      bind: [
        property.id,
        profile,
        property.name,
        property.propertyType,
        property.propertyNumber ?? null,
        property.address ?? null,
        property.description ?? null,
        property.notes ?? null,
        property.createdAt,
        property.updatedAt,
      ],
    },
  )
}

function insertReceipt(
  db: Database,
  receipt: Receipt,
  mode: RestoreMode,
  profile: DbProfile,
): void {
  const conflict = mode === 'merge'
    ? `ON CONFLICT(id) DO UPDATE SET
        receipt_number = excluded.receipt_number,
        receipt_type = excluded.receipt_type,
        customer_id = excluded.customer_id,
        property_id = excluded.property_id,
        receipt_date = excluded.receipt_date,
        payment_period = excluded.payment_period,
        amount_paise = excluded.amount_paise,
        payment_method = excluded.payment_method,
        status = excluded.status,
        reference_number = excluded.reference_number,
        description = excluded.description,
        notes = excluded.notes,
        updated_at = excluded.updated_at
        WHERE profile = excluded.profile`
    : ''

  assertRestoreReference(db, 'customers', receipt.customerId, profile)
  assertRestoreReference(db, 'properties', receipt.propertyId, profile)

  db.exec(
    `INSERT INTO receipts (
      id, profile, receipt_number, receipt_type, customer_id, property_id, receipt_date,
      payment_period, amount_paise, payment_method, status, reference_number,
      description, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ${conflict}`,
    {
      bind: [
        receipt.id,
        profile,
        receipt.receiptNumber,
        receipt.receiptType,
        receipt.customerId ?? null,
        receipt.propertyId ?? null,
        receipt.receiptDate,
        receipt.paymentPeriod ?? null,
        receipt.amountPaise,
        receipt.paymentMethod,
        normalizeStatus(receipt.status),
        receipt.referenceNumber ?? null,
        receipt.description ?? null,
        receipt.notes ?? null,
        receipt.createdAt,
        receipt.updatedAt,
      ],
    },
  )

  const storedProfile = db.selectValue(
    'SELECT profile FROM receipts WHERE id = ?',
    [receipt.id],
  )

  if (storedProfile !== profile) {
    throw new DbConflictError(
      'This backup contains records from the other workspace. Switch back to that workspace before restoring.',
    )
  }

  db.exec('DELETE FROM receipt_details WHERE receipt_id = ?', {
    bind: [receipt.id],
  })
  db.exec('DELETE FROM receipt_items WHERE receipt_id = ?', {
    bind: [receipt.id],
  })

  for (const detail of receipt.details ?? []) {
    db.exec(
      `INSERT INTO receipt_details (receipt_id, field_key, field_value)
       VALUES (?, ?, ?)`,
      { bind: [receipt.id, detail.fieldKey, detail.fieldValue] },
    )
  }

  const items: ReceiptItem[] = (receipt.items ?? []).map((item) => {
    const computed = computeLineItem({
      description: item.description,
      quantity: item.quantity,
      ratePaise: item.ratePaise,
      discountPaise: item.discountPaise ?? 0,
    })

    return { ...computed, lineTotalPaise: computed.lineTotalPaise }
  })

  items.forEach((item, index) => {
    db.exec(
      `INSERT INTO receipt_items (
        receipt_id, sort_order, description, quantity, rate_paise,
        discount_paise, line_total_paise
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      {
        bind: [
          receipt.id,
          index,
          item.description,
          item.quantity,
          item.ratePaise,
          item.discountPaise,
          item.lineTotalPaise,
        ],
      },
    )
  })
}
