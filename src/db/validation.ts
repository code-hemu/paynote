import { computeLineItem } from '../domain/money.ts'
import {
  normalizeReceiptStatus,
  type ReceiptStatus,
} from '../domain/receipt-status.ts'
import { DbValidationError } from './errors.ts'
import {
  PROPERTY_TYPES,
  type PageOptions,
  type PropertyType,
  type ReceiptDetail,
  type ReceiptItem,
  type SortDirection,
} from './types.ts'

const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 50
const MAX_DETAILS = 100
const MAX_ITEMS = 100

export function nowIso(): string {
  return new Date().toISOString()
}

function currentDate(): string {
  const now = new Date()
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function newId(): string {
  return globalThis.crypto.randomUUID()
}

export function requireText(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DbValidationError(`${field} is required.`)
  }

  const text = value.trim()

  if (text.length > maxLength) {
    throw new DbValidationError(`${field} must be ${maxLength} characters or fewer.`)
  }

  return text
}

export function optionalText(
  value: unknown,
  field: string,
  maxLength = 500,
): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new DbValidationError(`${field} must be text.`)
  }

  const text = value.trim()

  if (text === '') {
    return null
  }

  if (text.length > maxLength) {
    throw new DbValidationError(`${field} must be ${maxLength} characters or fewer.`)
  }

  return text
}

export function requireId(value: unknown, field = 'ID'): string {
  return requireText(value, field, 100)
}

export function optionalId(value: unknown, field = 'ID'): string | null {
  const id = optionalText(value, field, 100)
  return id
}

export function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new DbValidationError(`${field} must be a non-negative whole number.`)
  }

  return value
}

export function requirePropertyType(value: unknown): PropertyType {
  if (typeof value !== 'string' || !PROPERTY_TYPES.includes(value as PropertyType)) {
    throw new DbValidationError(
      'Property type must be house, godown, shop, or other.',
    )
  }

  return value as PropertyType
}

export function optionalPropertyType(value: unknown): PropertyType | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return requirePropertyType(value)
}

export function requireDate(value: unknown, field: string): string {
  if (value === undefined || value === null || value === '') {
    return currentDate()
  }

  if (typeof value !== 'string') {
    throw new DbValidationError(`${field} must be a date.`)
  }

  const date = value.trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new DbValidationError(`${field} must use YYYY-MM-DD format.`)
  }

  const parsed = new Date(`${date}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new DbValidationError(`${field} is not a valid date.`)
  }

  return date
}

export function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return requireDate(value, field)
}

export function normalizeSortDirection(value: unknown): SortDirection {
  if (value === undefined || value === null || value === '') {
    return 'asc'
  }

  if (value === 'asc' || value === 'desc') {
    return value
  }

  throw new DbValidationError('Sort direction must be asc or desc.')
}

export function normalizePage(options: PageOptions = {}): {
  limit: number
  offset: number
} {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE
  const offset = options.offset ?? 0

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new DbValidationError(`Limit must be between 1 and ${MAX_PAGE_SIZE}.`)
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new DbValidationError('Offset must be zero or greater.')
  }

  return { limit, offset }
}

export function normalizeSearch(value: unknown, field = 'Search'): string | null {
  return optionalText(value, field, 200)
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export function normalizeDetails(value: unknown): ReceiptDetail[] {
  if (value === undefined || value === null) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new DbValidationError('Receipt details must be a list.')
  }

  if (value.length > MAX_DETAILS) {
    throw new DbValidationError(`A receipt can have at most ${MAX_DETAILS} details.`)
  }

  const seen = new Set<string>()
  const details: ReceiptDetail[] = []

  for (const rawDetail of value) {
    if (typeof rawDetail !== 'object' || rawDetail === null) {
      throw new DbValidationError('Each receipt detail must be an object.')
    }

    const detail = rawDetail as Record<string, unknown>
    const fieldKey = requireText(detail.fieldKey, 'Detail field key', 80)

    if (seen.has(fieldKey)) {
      throw new DbValidationError(`Receipt detail "${fieldKey}" is duplicated.`)
    }

    if (typeof detail.fieldValue !== 'string') {
      throw new DbValidationError(`Receipt detail "${fieldKey}" must be text.`)
    }

    const fieldValue = detail.fieldValue.trim()

    if (fieldValue.length > 2000) {
      throw new DbValidationError(
        `Receipt detail "${fieldKey}" must be 2000 characters or fewer.`,
      )
    }

    seen.add(fieldKey)
    details.push({ fieldKey, fieldValue })
  }

  return details
}

export function normalizeStatus(value: unknown): ReceiptStatus {
  try {
    return normalizeReceiptStatus(value)
  } catch (error) {
    throw new DbValidationError(
      error instanceof Error ? error.message : 'Receipt status is invalid.',
    )
  }
}

export function optionalAmount(value: unknown, field: string): number | null {
  if (value === undefined || value === null) {
    return null
  }

  return requireNonNegativeInteger(value, field)
}

export function normalizeItems(value: unknown): ReceiptItem[] {
  if (value === undefined || value === null) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new DbValidationError('Receipt line items must be a list.')
  }

  if (value.length > MAX_ITEMS) {
    throw new DbValidationError(`A receipt can have at most ${MAX_ITEMS} line items.`)
  }

  return value.map((rawItem, index) => {
    if (typeof rawItem !== 'object' || rawItem === null) {
      throw new DbValidationError('Each line item must be an object.')
    }

    const item = rawItem as Record<string, unknown>
    const description = requireText(item.description, 'Line item description', 500)
    const quantity = requirePositiveNumber(item.quantity, 'Line item quantity')
    const ratePaise = requireNonNegativeInteger(item.ratePaise, 'Line item rate')
    const discountPaise =
      item.discountPaise === undefined || item.discountPaise === null
        ? 0
        : requireNonNegativeInteger(item.discountPaise, 'Line item discount')
    const computed = computeLineItem({
      description,
      quantity,
      ratePaise,
      discountPaise,
    })

    if (computed.discountPaise > computed.grossPaise) {
      throw new DbValidationError(
        `Line item ${index + 1} discount cannot exceed its amount.`,
      )
    }

    return {
      description: computed.description,
      quantity: computed.quantity,
      ratePaise: computed.ratePaise,
      discountPaise: computed.discountPaise,
      lineTotalPaise: computed.lineTotalPaise,
    }
  })
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DbValidationError(`${field} must be greater than zero.`)
  }

  if (value > 1_000_000) {
    throw new DbValidationError(`${field} is too large.`)
  }

  return Math.round(value * 1000) / 1000
}
