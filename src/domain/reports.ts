import type { ReceiptStatus } from './receipt-status.ts'

export type ReportPreset = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom'

export interface ReportFilters {
  fromDate: string | null
  toDate: string | null
  receiptType: string | null
  customerId: string | null
  propertyId: string | null
  status: ReceiptStatus | null
}

export interface ReportBreakdownRow {
  key: string
  label: string
  count: number
  totalPaise: number
}

export interface ReportSummary {
  totalPaise: number
  receiptCount: number
  averagePaise: number
  cancelledCount: number
  byDay: ReportBreakdownRow[]
  byMonth: ReportBreakdownRow[]
  byYear: ReportBreakdownRow[]
  byCategory: ReportBreakdownRow[]
  byPaymentMethod: ReportBreakdownRow[]
  byCustomer: ReportBreakdownRow[]
  byProperty: ReportBreakdownRow[]
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function emptyReportSummary(): ReportSummary {
  return {
    totalPaise: 0,
    receiptCount: 0,
    averagePaise: 0,
    cancelledCount: 0,
    byDay: [],
    byMonth: [],
    byYear: [],
    byCategory: [],
    byPaymentMethod: [],
    byCustomer: [],
    byProperty: [],
  }
}

export function localDateString(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) {
    return null
  }

  const parsed = new Date(`${value}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return localDateString(parsed) === value ? parsed : null
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

export function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31)
}

export function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = copy.getDay()
  const offset = day === 0 ? 6 : day - 1
  copy.setDate(copy.getDate() - offset)
  return copy
}

export function rangeForPreset(
  preset: ReportPreset,
  now: Date = new Date(),
): { fromDate: string | null; toDate: string | null } {
  switch (preset) {
    case 'today':
      return { fromDate: localDateString(now), toDate: localDateString(now) }
    case 'week':
      return {
        fromDate: localDateString(startOfWeek(now)),
        toDate: localDateString(now),
      }
    case 'month':
      return {
        fromDate: localDateString(startOfMonth(now)),
        toDate: localDateString(endOfMonth(now)),
      }
    case 'year':
      return {
        fromDate: localDateString(startOfYear(now)),
        toDate: localDateString(endOfYear(now)),
      }
    case 'all':
    case 'custom':
    default:
      return { fromDate: null, toDate: null }
  }
}

export function normalizeFilters(
  filters: Partial<ReportFilters>,
): ReportFilters {
  const fromDate = filters.fromDate?.trim() || null
  const toDate = filters.toDate?.trim() || null

  if (fromDate && !parseDate(fromDate)) {
    throw new Error('From date must be a valid date.')
  }

  if (toDate && !parseDate(toDate)) {
    throw new Error('To date must be a valid date.')
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new Error('From date must be on or before the to date.')
  }

  return {
    fromDate,
    toDate,
    receiptType: filters.receiptType?.trim() || null,
    customerId: filters.customerId?.trim() || null,
    propertyId: filters.propertyId?.trim() || null,
    status: filters.status ?? null,
  }
}

export function summarizeReceipts(
  receipts: Array<{
    receiptDate: string
    amountPaise: number
    receiptType: string
    paymentMethod: string
    customerId: string | null
    customerName: string | null
    propertyId: string | null
    propertyName: string | null
    status: ReceiptStatus
  }>,
): ReportSummary {
  const summary = emptyReportSummary()
  const day = new Map<string, ReportBreakdownRow>()
  const month = new Map<string, ReportBreakdownRow>()
  const year = new Map<string, ReportBreakdownRow>()
  const category = new Map<string, ReportBreakdownRow>()
  const payment = new Map<string, ReportBreakdownRow>()
  const customer = new Map<string, ReportBreakdownRow>()
  const property = new Map<string, ReportBreakdownRow>()

  for (const receipt of receipts) {
    if (receipt.status === 'cancelled') {
      summary.cancelledCount += 1
      continue
    }

    summary.receiptCount += 1
    summary.totalPaise += receipt.amountPaise

    addRow(day, receipt.receiptDate, receipt.receiptDate, receipt.amountPaise)
    const monthKey = receipt.receiptDate.slice(0, 7)
    addRow(month, monthKey, monthKey, receipt.amountPaise)
    const yearKey = receipt.receiptDate.slice(0, 4)
    addRow(year, yearKey, yearKey, receipt.amountPaise)
    addRow(
      category,
      receipt.receiptType,
      receipt.receiptType,
      receipt.amountPaise,
    )
    addRow(
      payment,
      receipt.paymentMethod,
      receipt.paymentMethod,
      receipt.amountPaise,
    )

    if (receipt.customerId) {
      addRow(
        customer,
        receipt.customerId,
        receipt.customerName ?? 'Unnamed customer',
        receipt.amountPaise,
      )
    }

    if (receipt.propertyId) {
      addRow(
        property,
        receipt.propertyId,
        receipt.propertyName ?? 'Unnamed property',
        receipt.amountPaise,
      )
    }
  }

  summary.averagePaise =
    summary.receiptCount === 0
      ? 0
      : Math.round(summary.totalPaise / summary.receiptCount)
  summary.byDay = sortByKey(day)
  summary.byMonth = sortByKey(month)
  summary.byYear = sortByKey(year)
  summary.byCategory = sortByTotal(category)
  summary.byPaymentMethod = sortByTotal(payment)
  summary.byCustomer = sortByTotal(customer)
  summary.byProperty = sortByTotal(property)

  return summary
}

function addRow(
  map: Map<string, ReportBreakdownRow>,
  key: string,
  label: string,
  amountPaise: number,
): void {
  const existing = map.get(key)

  if (existing) {
    existing.count += 1
    existing.totalPaise += amountPaise
    return
  }

  map.set(key, { key, label, count: 1, totalPaise: amountPaise })
}

function sortByKey(map: Map<string, ReportBreakdownRow>): ReportBreakdownRow[] {
  return [...map.values()].sort((left, right) => left.key.localeCompare(right.key))
}

function sortByTotal(map: Map<string, ReportBreakdownRow>): ReportBreakdownRow[] {
  return [...map.values()].sort(
    (left, right) => right.totalPaise - left.totalPaise,
  )
}
