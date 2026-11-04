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

import { listCustomers } from './customers.ts'
import { LATEST_SCHEMA_VERSION } from './migrations.ts'
import { listProperties } from './properties.ts'
import { getReceipt, listReceipts } from './receipts.ts'
import { rowNumber, rowText } from './rows.ts'
import { listSettings } from './settings.ts'
import type {
  Customer,
  Property,
  Receipt,
  ReceiptItem,
  ReceiptSummary,
} from './types.ts'
import { normalizeStatus } from './validation.ts'

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

  return db.transaction('IMMEDIATE', () => {
    if (mode === 'replace') {
      db.exec('DELETE FROM receipts')
      db.exec('DELETE FROM customers')
      db.exec('DELETE FROM properties')
    }

    for (const customer of backup.customers) {
      insertCustomer(db, customer, mode)
    }

    for (const property of backup.properties) {
      insertProperty(db, property, mode)
    }

    for (const receipt of backup.receipts) {
      insertReceipt(db, receipt, mode)
    }

    for (const setting of backup.settings) {
      db.exec(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
        { bind: [setting.key, setting.value, setting.updatedAt] },
      )
    }

    for (const sequence of backup.sequences) {
      db.exec(
        `INSERT INTO receipt_sequences (year, prefix, next_number, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(year) DO UPDATE SET
           prefix = excluded.prefix,
           next_number = MAX(receipt_sequences.next_number, excluded.next_number),
           updated_at = excluded.updated_at`,
        { bind: [sequence.year, sequence.prefix, sequence.nextNumber, sequence.updatedAt] },
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
    return null
  })
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
      'SELECT year, prefix, next_number, updated_at FROM receipt_sequences ORDER BY year ASC',
    )
    .map((row) => ({
      year: rowNumber(row, 'year'),
      prefix: rowText(row, 'prefix'),
      nextNumber: rowNumber(row, 'next_number'),
      updatedAt: rowText(row, 'updated_at'),
    }))
}

function insertCustomer(db: Database, customer: Customer, mode: RestoreMode): void {
  const conflict = mode === 'merge'
    ? `ON CONFLICT(id) DO UPDATE SET
        full_name = excluded.full_name,
        phone = excluded.phone,
        email = excluded.email,
        address = excluded.address,
        notes = excluded.notes,
        updated_at = excluded.updated_at`
    : ''

  db.exec(
    `INSERT INTO customers (
      id, full_name, phone, email, address, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ${conflict}`,
    {
      bind: [
        customer.id,
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

function insertProperty(db: Database, property: Property, mode: RestoreMode): void {
  const conflict = mode === 'merge'
    ? `ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        property_type = excluded.property_type,
        property_number = excluded.property_number,
        address = excluded.address,
        description = excluded.description,
        notes = excluded.notes,
        updated_at = excluded.updated_at`
    : ''

  db.exec(
    `INSERT INTO properties (
      id, name, property_type, property_number, address, description, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ${conflict}`,
    {
      bind: [
        property.id,
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

function insertReceipt(db: Database, receipt: Receipt, mode: RestoreMode): void {
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
        updated_at = excluded.updated_at`
    : ''

  db.exec(
    `INSERT INTO receipts (
      id, receipt_number, receipt_type, customer_id, property_id, receipt_date,
      payment_period, amount_paise, payment_method, status, reference_number,
      description, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ${conflict}`,
    {
      bind: [
        receipt.id,
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
