import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm'

import { writeAuditLog } from './audit.ts'
import {
  DbConflictError,
  DbNotFoundError,
  DbValidationError,
} from './errors.ts'
import { rowNullableText, rowText, toNumber } from './rows.ts'
import type {
  Customer,
  CustomerInput,
  CustomerListOptions,
  CustomerSortField,
  ListResult,
} from './types.ts'
import {
  escapeLike,
  newId,
  normalizePage,
  normalizeSearch,
  normalizeSortDirection,
  nowIso,
  optionalText,
  requireId,
  requireText,
} from './validation.ts'

const CUSTOMER_COLUMNS = `id, full_name, phone, email, address, notes, created_at, updated_at`

const CUSTOMER_SORT_COLUMNS: Record<CustomerSortField, string> = {
  name: 'full_name COLLATE NOCASE',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

export function listCustomers(
  db: Database,
  options: CustomerListOptions = {},
): ListResult<Customer> {
  const { limit, offset } = normalizePage(options)
  const search = normalizeSearch(options.search)
  const sortBy = normalizeCustomerSortField(options.sortBy)
  const sortDirection = normalizeSortDirection(options.sortDirection)
  const sortColumn = CUSTOMER_SORT_COLUMNS[sortBy]
  const conditions: string[] = []
  const bind: SqlValue[] = []

  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(`(
      full_name LIKE ? ESCAPE '\\'
      OR phone LIKE ? ESCAPE '\\'
      OR email LIKE ? ESCAPE '\\'
    )`)
    bind.push(pattern, pattern, pattern)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = toNumber(
    db.selectValue(
      `SELECT COUNT(*) FROM customers ${where}`,
      bind.length > 0 ? bind : undefined,
    ),
  )
  const rows = db.selectObjects(
    `SELECT ${CUSTOMER_COLUMNS}
     FROM customers
     ${where}
     ORDER BY ${sortColumn} ${sortDirection.toUpperCase()}, full_name COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
    [...bind, limit, offset],
  )

  return {
    items: rows.map(mapCustomer),
    total,
    limit,
    offset,
  }
}

export function getCustomer(db: Database, id: string): Customer {
  const customerId = requireId(id, 'Customer ID')
  const row = db.selectObject(
    `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ?`,
    [customerId],
  )

  if (!row) {
    throw new DbNotFoundError('Customer not found.')
  }

  return mapCustomer(row)
}

export function isCustomerNameTaken(
  db: Database,
  name: string,
  excludeId?: string | null,
): boolean {
  const fullName = requireText(name, 'Customer name')
  const row = excludeId
    ? db.selectValue(
        'SELECT 1 FROM customers WHERE full_name = ? COLLATE NOCASE AND id <> ?',
        [fullName, excludeId],
      )
    : db.selectValue(
        'SELECT 1 FROM customers WHERE full_name = ? COLLATE NOCASE',
        [fullName],
      )

  return row !== undefined && row !== null
}

export function createCustomer(db: Database, input: CustomerInput): Customer {
  const customer = normalizeCustomer(input)

  return db.transaction('IMMEDIATE', () => {
    if (isCustomerNameTaken(db, customer.fullName)) {
      throw new DbConflictError(
        `A customer named "${customer.fullName}" already exists.`,
      )
    }

    const id = newId()
    const now = nowIso()

    db.exec({
      sql: `INSERT INTO customers (
        id,
        full_name,
        phone,
        email,
        address,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        id,
        customer.fullName,
        customer.phone,
        customer.email,
        customer.address,
        customer.notes,
        now,
        now,
      ],
    })

    writeAuditLog(db, 'create', 'customer', id, {
      fullName: customer.fullName,
    })

    return getCustomer(db, id)
  })
}

export function updateCustomer(
  db: Database,
  id: string,
  input: CustomerInput,
): Customer {
  const customerId = requireId(id, 'Customer ID')
  const customer = normalizeCustomer(input)

  return db.transaction('IMMEDIATE', () => {
    getCustomer(db, customerId)

    if (isCustomerNameTaken(db, customer.fullName, customerId)) {
      throw new DbConflictError(
        `A customer named "${customer.fullName}" already exists.`,
      )
    }

    db.exec({
      sql: `UPDATE customers
        SET full_name = ?,
            phone = ?,
            email = ?,
            address = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?`,
      bind: [
        customer.fullName,
        customer.phone,
        customer.email,
        customer.address,
        customer.notes,
        nowIso(),
        customerId,
      ],
    })

    writeAuditLog(db, 'update', 'customer', customerId, {
      fullName: customer.fullName,
    })

    return getCustomer(db, customerId)
  })
}

export function deleteCustomer(db: Database, id: string): void {
  const customerId = requireId(id, 'Customer ID')

  db.transaction('IMMEDIATE', () => {
    const customer = getCustomer(db, customerId)
    const receiptCount = toNumber(
      db.selectValue('SELECT COUNT(*) FROM receipts WHERE customer_id = ?', [
        customerId,
      ]),
    )

    if (receiptCount > 0) {
      throw new DbConflictError('This customer has receipts and cannot be deleted.')
    }

    db.exec({ sql: 'DELETE FROM customers WHERE id = ?', bind: [customerId] })
    writeAuditLog(db, 'delete', 'customer', customerId, {
      fullName: customer.fullName,
    })
  })
}

function normalizeCustomerSortField(value: unknown): CustomerSortField {
  if (value === undefined || value === null || value === '') {
    return 'name'
  }

  if (value === 'name' || value === 'createdAt' || value === 'updatedAt') {
    return value
  }

  throw new DbValidationError('Sort field must be name, createdAt, or updatedAt.')
}

function normalizeCustomer(input: CustomerInput): {
  fullName: string
  phone: string
  email: string | null
  address: string | null
  notes: string | null
} {
  return {
    fullName: requireText(input.fullName, 'Customer name'),
    phone: optionalText(input.phone, 'Phone', 40) ?? '',
    email: optionalText(input.email, 'Email', 200),
    address: optionalText(input.address, 'Address', 500),
    notes: optionalText(input.notes, 'Notes', 2000),
  }
}

function mapCustomer(row: Record<string, SqlValue>): Customer {
  return {
    id: rowText(row, 'id'),
    fullName: rowText(row, 'full_name'),
    phone: rowText(row, 'phone'),
    email: rowNullableText(row, 'email'),
    address: rowNullableText(row, 'address'),
    notes: rowNullableText(row, 'notes'),
    createdAt: rowText(row, 'created_at'),
    updatedAt: rowText(row, 'updated_at'),
  }
}
