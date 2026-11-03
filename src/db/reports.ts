import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm'

import {
  emptyReportSummary,
  normalizeFilters,
  type ReportBreakdownRow,
  type ReportFilters,
  type ReportSummary,
} from '../domain/reports.ts'

import { rowNumber, rowText, toNumber } from './rows.ts'
import {
  escapeLike,
  normalizeSearch,
  normalizeStatus,
  optionalDate,
  optionalId,
  optionalText,
} from './validation.ts'

export interface ReportOptions extends Partial<ReportFilters> {
  search?: string | null
}

const FROM = 'FROM receipts r LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN properties p ON p.id = r.property_id'

export function getReportSummary(
  db: Database,
  options: ReportOptions = {},
): ReportSummary {
  const filters = normalizeFilters(options)
  const search = normalizeSearch(options.search)
  const { where, bind } = buildWhere(filters, search)

  const totals =
    db.selectObject(
      `SELECT
        COUNT(*) AS receipt_count,
        COALESCE(SUM(CASE WHEN r.status != 'cancelled' THEN r.amount_paise ELSE 0 END), 0) AS total_paise,
        COALESCE(SUM(CASE WHEN r.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count
       ${FROM} ${where}`,
      bind.length > 0 ? bind : undefined,
    ) ?? {}

  const summary = emptyReportSummary()
  const cancelledCount = toNumber(totals.cancelled_count)
  const activeCount = Math.max(0, toNumber(totals.receipt_count) - cancelledCount)

  summary.receiptCount = activeCount
  summary.cancelledCount = cancelledCount
  summary.totalPaise = toNumber(totals.total_paise)
  summary.averagePaise =
    activeCount === 0 ? 0 : Math.round(summary.totalPaise / activeCount)

  const activeWhere =
    where === '' ? "WHERE r.status != 'cancelled'" : `${where} AND r.status != 'cancelled'`

  summary.byDay = groupBy(
    db,
    `substr(r.receipt_date, 1, 10)`,
    `substr(r.receipt_date, 1, 10)`,
    activeWhere,
    bind,
    'key',
  )
  summary.byMonth = groupBy(
    db,
    `substr(r.receipt_date, 1, 7)`,
    `substr(r.receipt_date, 1, 7)`,
    activeWhere,
    bind,
    'key',
  )
  summary.byYear = groupBy(
    db,
    `substr(r.receipt_date, 1, 4)`,
    `substr(r.receipt_date, 1, 4)`,
    activeWhere,
    bind,
    'key',
  )
  summary.byCategory = groupBy(
    db,
    'r.receipt_type',
    'COALESCE(r.receipt_type, \'—\')',
    activeWhere,
    bind,
  )
  summary.byPaymentMethod = groupBy(
    db,
    'r.payment_method',
    'COALESCE(r.payment_method, \'—\')',
    activeWhere,
    bind,
  )
  summary.byCustomer = groupBy(
    db,
    'r.customer_id',
    'COALESCE(c.full_name, \'Unassigned\')',
    `${activeWhere} AND r.customer_id IS NOT NULL`,
    bind,
  )
  summary.byProperty = groupBy(
    db,
    'r.property_id',
    'COALESCE(p.name, \'Unassigned\')',
    `${activeWhere} AND r.property_id IS NOT NULL`,
    bind,
  )

  return summary
}

function groupBy(
  db: Database,
  keyExpression: string,
  labelExpression: string,
  where: string,
  bind: SqlValue[],
  sort: 'key' | 'total' = 'total',
): ReportBreakdownRow[] {
  const order = sort === 'key' ? '1 ASC' : 'total_paise DESC'
  const rows = db.selectObjects(
    `SELECT ${keyExpression} AS key,
            ${labelExpression} AS label,
            COUNT(*) AS count,
            COALESCE(SUM(r.amount_paise), 0) AS total_paise
     ${FROM} ${where}
     GROUP BY ${keyExpression}
     ORDER BY ${order}`,
    bind.length > 0 ? bind : undefined,
  )

  return rows.map((row) => ({
    key: rowText(row, 'key'),
    label: rowText(row, 'label'),
    count: rowNumber(row, 'count'),
    totalPaise: rowNumber(row, 'total_paise'),
  }))
}

function buildWhere(
  filters: ReportFilters,
  search: string | null,
): { where: string; bind: SqlValue[] } {
  const conditions: string[] = []
  const bind: SqlValue[] = []

  if (search) {
    const pattern = `%${escapeLike(search)}%`
    conditions.push(`(
      r.receipt_number LIKE ? ESCAPE '\\'
      OR r.description LIKE ? ESCAPE '\\'
      OR c.full_name LIKE ? ESCAPE '\\'
      OR p.name LIKE ? ESCAPE '\\'
    )`)
    bind.push(pattern, pattern, pattern, pattern)
  }

  const receiptType = optionalText(filters.receiptType, 'Receipt type', 80)

  if (receiptType) {
    conditions.push('r.receipt_type = ?')
    bind.push(receiptType)
  }

  const customerId = optionalId(filters.customerId, 'Customer ID')

  if (customerId) {
    conditions.push('r.customer_id = ?')
    bind.push(customerId)
  }

  const propertyId = optionalId(filters.propertyId, 'Property ID')

  if (propertyId) {
    conditions.push('r.property_id = ?')
    bind.push(propertyId)
  }

  const fromDate = optionalDate(filters.fromDate, 'From date')

  if (fromDate) {
    conditions.push('r.receipt_date >= ?')
    bind.push(fromDate)
  }

  const toDate = optionalDate(filters.toDate, 'To date')

  if (toDate) {
    conditions.push('r.receipt_date <= ?')
    bind.push(toDate)
  }

  if (filters.status) {
    conditions.push('r.status = ?')
    bind.push(normalizeStatus(filters.status))
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    bind,
  }
}
