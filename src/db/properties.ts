import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm'

import { writeAuditLog } from './audit.ts'
import {
  DbConflictError,
  DbNotFoundError,
  DbValidationError,
} from './errors.ts'
import { rowNullableText, rowText, toNumber } from './rows.ts'
import type {
  ListResult,
  Property,
  PropertyInput,
  PropertyListOptions,
  PropertySortField,
  PropertyType,
} from './types.ts'
import {
  escapeLike,
  newId,
  normalizePage,
  normalizeSearch,
  normalizeSortDirection,
  nowIso,
  optionalPropertyType,
  optionalText,
  requireId,
  requirePropertyType,
  requireText,
} from './validation.ts'

const PROPERTY_COLUMNS = `id, name, property_type, property_number, address, description, notes, created_at, updated_at`

const PROPERTY_SORT_COLUMNS: Record<PropertySortField, string> = {
  name: 'name COLLATE NOCASE',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

export function listProperties(
  db: Database,
  options: PropertyListOptions = {},
): ListResult<Property> {
  const { limit, offset } = normalizePage(options)
  const search = normalizeSearch(options.search)
  const propertyType = optionalPropertyType(options.propertyType)
  const sortBy = normalizePropertySortField(options.sortBy)
  const sortDirection = normalizeSortDirection(options.sortDirection)
  const sortColumn = PROPERTY_SORT_COLUMNS[sortBy]
  const conditions: string[] = []
  const bind: SqlValue[] = []

  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(`(
      name LIKE ? ESCAPE '\\'
      OR property_number LIKE ? ESCAPE '\\'
      OR address LIKE ? ESCAPE '\\'
    )`)
    bind.push(pattern, pattern, pattern)
  }

  if (propertyType) {
    conditions.push('property_type = ?')
    bind.push(propertyType)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = toNumber(
    db.selectValue(
      `SELECT COUNT(*) FROM properties ${where}`,
      bind.length > 0 ? bind : undefined,
    ),
  )
  const rows = db.selectObjects(
    `SELECT ${PROPERTY_COLUMNS}
     FROM properties
     ${where}
     ORDER BY ${sortColumn} ${sortDirection.toUpperCase()}, name COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
    [...bind, limit, offset],
  )

  return {
    items: rows.map(mapProperty),
    total,
    limit,
    offset,
  }
}

export function getProperty(db: Database, id: string): Property {
  const propertyId = requireId(id, 'Property ID')
  const row = db.selectObject(
    `SELECT ${PROPERTY_COLUMNS} FROM properties WHERE id = ?`,
    [propertyId],
  )

  if (!row) {
    throw new DbNotFoundError('Property not found.')
  }

  return mapProperty(row)
}

export function createProperty(db: Database, input: PropertyInput): Property {
  const property = normalizeProperty(input)

  return db.transaction('IMMEDIATE', () => {
    const id = newId()
    const now = nowIso()

    db.exec({
      sql: `INSERT INTO properties (
        id,
        name,
        property_type,
        property_number,
        address,
        description,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        id,
        property.name,
        property.propertyType,
        property.propertyNumber,
        property.address,
        property.description,
        property.notes,
        now,
        now,
      ],
    })

    writeAuditLog(db, 'create', 'property', id, {
      name: property.name,
      propertyType: property.propertyType,
    })

    return getProperty(db, id)
  })
}

export function updateProperty(
  db: Database,
  id: string,
  input: PropertyInput,
): Property {
  const propertyId = requireId(id, 'Property ID')
  const property = normalizeProperty(input)

  return db.transaction('IMMEDIATE', () => {
    getProperty(db, propertyId)

    db.exec({
      sql: `UPDATE properties
        SET name = ?,
            property_type = ?,
            property_number = ?,
            address = ?,
            description = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?`,
      bind: [
        property.name,
        property.propertyType,
        property.propertyNumber,
        property.address,
        property.description,
        property.notes,
        nowIso(),
        propertyId,
      ],
    })

    writeAuditLog(db, 'update', 'property', propertyId, {
      name: property.name,
      propertyType: property.propertyType,
    })

    return getProperty(db, propertyId)
  })
}

export function deleteProperty(db: Database, id: string): void {
  const propertyId = requireId(id, 'Property ID')

  db.transaction('IMMEDIATE', () => {
    const property = getProperty(db, propertyId)
    const receiptCount = toNumber(
      db.selectValue('SELECT COUNT(*) FROM receipts WHERE property_id = ?', [
        propertyId,
      ]),
    )

    if (receiptCount > 0) {
      throw new DbConflictError('This property has receipts and cannot be deleted.')
    }

    db.exec({ sql: 'DELETE FROM properties WHERE id = ?', bind: [propertyId] })
    writeAuditLog(db, 'delete', 'property', propertyId, {
      name: property.name,
    })
  })
}

function normalizePropertySortField(value: unknown): PropertySortField {
  if (value === undefined || value === null || value === '') {
    return 'name'
  }

  if (value === 'name' || value === 'createdAt' || value === 'updatedAt') {
    return value
  }

  throw new DbValidationError('Sort field must be name, createdAt, or updatedAt.')
}

function normalizeProperty(input: PropertyInput): {
  name: string
  propertyType: PropertyType
  propertyNumber: string | null
  address: string | null
  description: string | null
  notes: string | null
} {
  return {
    name: requireText(input.name, 'Property name'),
    propertyType: requirePropertyType(input.propertyType),
    propertyNumber: optionalText(input.propertyNumber, 'Property number', 100),
    address: optionalText(input.address, 'Address', 500),
    description: optionalText(input.description, 'Description', 2000),
    notes: optionalText(input.notes, 'Notes', 2000),
  }
}

function mapProperty(row: Record<string, SqlValue>): Property {
  return {
    id: rowText(row, 'id'),
    name: rowText(row, 'name'),
    propertyType: rowText(row, 'property_type') as PropertyType,
    propertyNumber: rowNullableText(row, 'property_number'),
    address: rowNullableText(row, 'address'),
    description: rowNullableText(row, 'description'),
    notes: rowNullableText(row, 'notes'),
    createdAt: rowText(row, 'created_at'),
    updatedAt: rowText(row, 'updated_at'),
  }
}
