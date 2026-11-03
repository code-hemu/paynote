import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm'

import { writeAuditLog } from './audit.ts'
import { DbNotFoundError, DbValidationError } from './errors.ts'
import {
  rowNullableText,
  rowNumber,
  rowText,
  toNumber,
} from './rows.ts'
import type {
  ListResult,
  Receipt,
  ReceiptDetail,
  ReceiptInput,
  ReceiptListOptions,
  ReceiptSummary,
} from './types.ts'
import {
  escapeLike,
  newId,
  normalizeDetails,
  normalizePage,
  normalizeSearch,
  nowIso,
  optionalDate,
  optionalId,
  optionalText,
  requireDate,
  requireId,
  requireNonNegativeInteger,
  requireText,
} from './validation.ts'

const RECEIPT_COLUMNS = `r.id,
  r.receipt_number,
  r.receipt_type,
  r.customer_id,
  c.full_name AS customer_name,
  r.property_id,
  p.name AS property_name,
  r.receipt_date,
  r.payment_period,
  r.amount_paise,
  r.payment_method,
  r.reference_number,
  r.description,
  r.notes,
  r.created_at,
  r.updated_at`

const RECEIPT_FROM = `FROM receipts r
  LEFT JOIN customers c ON c.id = r.customer_id
  LEFT JOIN properties p ON p.id = r.property_id`

export function listReceipts(
  db: Database,
  options: ReceiptListOptions = {},
): ListResult<ReceiptSummary> {
  const { limit, offset } = normalizePage(options)
  const search = normalizeSearch(options.search)
  const receiptType = optionalText(options.receiptType, 'Receipt type', 80)
  const customerId = optionalId(options.customerId, 'Customer ID')
  const propertyId = optionalId(options.propertyId, 'Property ID')
  const fromDate = optionalDate(options.fromDate, 'From date')
  const toDate = optionalDate(options.toDate, 'To date')
  const conditions: string[] = []
  const bind: SqlValue[] = []

  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(`(
      r.receipt_number LIKE ? ESCAPE '\\'
      OR r.description LIKE ? ESCAPE '\\'
      OR r.notes LIKE ? ESCAPE '\\'
      OR r.reference_number LIKE ? ESCAPE '\\'
      OR c.full_name LIKE ? ESCAPE '\\'
      OR p.name LIKE ? ESCAPE '\\'
    )`)
    bind.push(pattern, pattern, pattern, pattern, pattern, pattern)
  }

  if (receiptType) {
    conditions.push('r.receipt_type = ?')
    bind.push(receiptType)
  }

  if (customerId) {
    conditions.push('r.customer_id = ?')
    bind.push(customerId)
  }

  if (propertyId) {
    conditions.push('r.property_id = ?')
    bind.push(propertyId)
  }

  if (fromDate) {
    conditions.push('r.receipt_date >= ?')
    bind.push(fromDate)
  }

  if (toDate) {
    conditions.push('r.receipt_date <= ?')
    bind.push(toDate)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = toNumber(
    db.selectValue(
      `SELECT COUNT(*) ${RECEIPT_FROM} ${where}`,
      bind.length > 0 ? bind : undefined,
    ),
  )
  const rows = db.selectObjects(
    `SELECT ${RECEIPT_COLUMNS}
     ${RECEIPT_FROM}
     ${where}
     ORDER BY r.receipt_date DESC, r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...bind, limit, offset],
  )

  return {
    items: rows.map(mapReceiptSummary),
    total,
    limit,
    offset,
  }
}

export function getReceipt(db: Database, id: string): Receipt {
  const receiptId = requireId(id, 'Receipt ID')
  const row = db.selectObject(
    `SELECT ${RECEIPT_COLUMNS} ${RECEIPT_FROM} WHERE r.id = ?`,
    [receiptId],
  )

  if (!row) {
    throw new DbNotFoundError('Receipt not found.')
  }

  const details = db.selectObjects(
    `SELECT field_key, field_value
     FROM receipt_details
     WHERE receipt_id = ?
     ORDER BY id ASC`,
    [receiptId],
  )

  return {
    ...mapReceiptSummary(row),
    details: details.map(mapReceiptDetail),
  }
}

export function createReceipt(db: Database, input: ReceiptInput): Receipt {
  const receipt = normalizeReceipt(input)

  return db.transaction('IMMEDIATE', () => {
    assertReference(db, 'customers', receipt.customerId, 'Customer')
    assertReference(db, 'properties', receipt.propertyId, 'Property')

    const id = newId()
    const now = nowIso()
    const receiptNumber = nextReceiptNumber(db, receipt.receiptDate, now)

    db.exec({
      sql: `INSERT INTO receipts (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        id,
        receiptNumber,
        receipt.receiptType,
        receipt.customerId,
        receipt.propertyId,
        receipt.receiptDate,
        receipt.paymentPeriod,
        receipt.amountPaise,
        receipt.paymentMethod,
        receipt.referenceNumber,
        receipt.description,
        receipt.notes,
        now,
        now,
      ],
    })

    insertDetails(db, id, receipt.details)
    writeAuditLog(db, 'create', 'receipt', id, {
      receiptNumber,
      amountPaise: receipt.amountPaise,
    })

    return getReceipt(db, id)
  })
}

export function updateReceipt(
  db: Database,
  id: string,
  input: ReceiptInput,
): Receipt {
  const receiptId = requireId(id, 'Receipt ID')
  const receipt = normalizeReceipt(input)

  return db.transaction('IMMEDIATE', () => {
    const existing = getReceipt(db, receiptId)

    assertReference(db, 'customers', receipt.customerId, 'Customer')
    assertReference(db, 'properties', receipt.propertyId, 'Property')

    db.exec({
      sql: `UPDATE receipts
        SET receipt_type = ?,
            customer_id = ?,
            property_id = ?,
            receipt_date = ?,
            payment_period = ?,
            amount_paise = ?,
            payment_method = ?,
            reference_number = ?,
            description = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?`,
      bind: [
        receipt.receiptType,
        receipt.customerId,
        receipt.propertyId,
        receipt.receiptDate,
        receipt.paymentPeriod,
        receipt.amountPaise,
        receipt.paymentMethod,
        receipt.referenceNumber,
        receipt.description,
        receipt.notes,
        nowIso(),
        receiptId,
      ],
    })

    db.exec({
      sql: 'DELETE FROM receipt_details WHERE receipt_id = ?',
      bind: [receiptId],
    })
    insertDetails(db, receiptId, receipt.details)
    writeAuditLog(db, 'update', 'receipt', receiptId, {
      receiptNumber: existing.receiptNumber,
      amountPaise: receipt.amountPaise,
    })

    return getReceipt(db, receiptId)
  })
}

export function deleteReceipt(db: Database, id: string): void {
  const receiptId = requireId(id, 'Receipt ID')

  db.transaction('IMMEDIATE', () => {
    const receipt = getReceipt(db, receiptId)

    db.exec({ sql: 'DELETE FROM receipts WHERE id = ?', bind: [receiptId] })
    writeAuditLog(db, 'delete', 'receipt', receiptId, {
      receiptNumber: receipt.receiptNumber,
      amountPaise: receipt.amountPaise,
    })
  })
}

function normalizeReceipt(input: ReceiptInput): {
  receiptType: string
  customerId: string | null
  propertyId: string | null
  receiptDate: string
  paymentPeriod: string | null
  amountPaise: number
  paymentMethod: string
  referenceNumber: string | null
  description: string | null
  notes: string | null
  details: ReceiptDetail[]
} {
  return {
    receiptType: requireText(input.receiptType, 'Receipt type', 80),
    customerId: optionalId(input.customerId, 'Customer ID'),
    propertyId: optionalId(input.propertyId, 'Property ID'),
    receiptDate: requireDate(input.receiptDate, 'Receipt date'),
    paymentPeriod: optionalText(input.paymentPeriod, 'Payment period', 100),
    amountPaise: requireNonNegativeInteger(input.amountPaise, 'Amount'),
    paymentMethod: requireText(input.paymentMethod, 'Payment method', 80),
    referenceNumber: optionalText(input.referenceNumber, 'Reference number', 100),
    description: optionalText(input.description, 'Description', 2000),
    notes: optionalText(input.notes, 'Notes', 2000),
    details: normalizeDetails(input.details),
  }
}

function nextReceiptNumber(db: Database, receiptDate: string, now: string): string {
  const year = Number(receiptDate.slice(0, 4))
  const setting = db.selectValue(
    `SELECT value FROM settings WHERE key = 'receipt.prefix'`,
  )
  const defaultPrefix =
    typeof setting === 'string' && setting.trim() !== '' ? setting.trim() : 'PN'

  db.exec({
    sql: `INSERT INTO receipt_sequences (year, prefix, next_number, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(year) DO NOTHING`,
    bind: [year, defaultPrefix, now],
  })

  const sequence = db.selectObject(
    `SELECT prefix, next_number FROM receipt_sequences WHERE year = ?`,
    [year],
  )
  const prefix = rowText(sequence ?? {}, 'prefix') || defaultPrefix
  const nextNumber = Math.max(1, rowNumber(sequence ?? {}, 'next_number'))
  const receiptNumber = `${prefix}-${year}-${String(nextNumber).padStart(4, '0')}`

  db.exec({
    sql: `UPDATE receipt_sequences
      SET next_number = ?, updated_at = ?
      WHERE year = ?`,
    bind: [nextNumber + 1, now, year],
  })

  return receiptNumber
}

function assertReference(
  db: Database,
  table: 'customers' | 'properties',
  id: string | null,
  label: string,
): void {
  if (!id) {
    return
  }

  const exists = db.selectValue(`SELECT 1 FROM ${table} WHERE id = ?`, [id])

  if (!exists) {
    throw new DbValidationError(`${label} does not exist.`)
  }
}

function insertDetails(
  db: Database,
  receiptId: string,
  details: ReceiptDetail[],
): void {
  for (const detail of details) {
    db.exec({
      sql: `INSERT INTO receipt_details (receipt_id, field_key, field_value)
        VALUES (?, ?, ?)`,
      bind: [receiptId, detail.fieldKey, detail.fieldValue],
    })
  }
}

function mapReceiptSummary(row: Record<string, SqlValue>): ReceiptSummary {
  return {
    id: rowText(row, 'id'),
    receiptNumber: rowText(row, 'receipt_number'),
    receiptType: rowText(row, 'receipt_type'),
    customerId: rowNullableText(row, 'customer_id'),
    customerName: rowNullableText(row, 'customer_name'),
    propertyId: rowNullableText(row, 'property_id'),
    propertyName: rowNullableText(row, 'property_name'),
    receiptDate: rowText(row, 'receipt_date'),
    paymentPeriod: rowNullableText(row, 'payment_period'),
    amountPaise: rowNumber(row, 'amount_paise'),
    paymentMethod: rowText(row, 'payment_method'),
    referenceNumber: rowNullableText(row, 'reference_number'),
    description: rowNullableText(row, 'description'),
    notes: rowNullableText(row, 'notes'),
    createdAt: rowText(row, 'created_at'),
    updatedAt: rowText(row, 'updated_at'),
  }
}

function mapReceiptDetail(row: Record<string, SqlValue>): ReceiptDetail {
  return {
    fieldKey: rowText(row, 'field_key'),
    fieldValue: rowText(row, 'field_value'),
  }
}
