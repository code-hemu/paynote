import { describe, expect, it } from '@guchho/test'

import {
  emptyReportSummary,
  localDateString,
  normalizeFilters,
  parseDate,
  rangeForPreset,
  startOfWeek,
  summarizeReceipts,
} from './reports.ts'

function captureError(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected the action to fail.')
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptDate: '2026-11-03',
    amountPaise: 10000,
    receiptType: 'rent',
    paymentMethod: 'cash',
    customerId: 'customer-1',
    customerName: 'Asha Rao',
    propertyId: null,
    propertyName: null,
    status: 'issued' as const,
    ...overrides,
  }
}

describe('reports', () => {
  it('builds local date ranges for presets', () => {
    const now = new Date(2026, 10, 3, 12)

    expect(rangeForPreset('today', now)).toEqual({
      fromDate: '2026-11-03',
      toDate: '2026-11-03',
    })
    expect(rangeForPreset('week', now)).toEqual({
      fromDate: '2026-11-02',
      toDate: '2026-11-03',
    })
    expect(rangeForPreset('month', now)).toEqual({
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
    })
    expect(rangeForPreset('year', now)).toEqual({
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    })
    expect(rangeForPreset('all', now)).toEqual({ fromDate: null, toDate: null })
    expect(rangeForPreset('custom', now)).toEqual({ fromDate: null, toDate: null })
  })

  it('treats Sunday as the end of a Monday-first week', () => {
    const sunday = new Date(2026, 10, 8, 12)

    expect(localDateString(startOfWeek(sunday))).toBe('2026-11-02')
  })

  it('parses valid local dates and rejects invalid ones', () => {
    expect(parseDate('2026-11-03')?.getFullYear()).toBe(2026)
    expect(parseDate('2026-02-30')).toBeNull()
    expect(parseDate('03/11/2026')).toBeNull()
  })

  it('normalizes filters and rejects invalid ranges', () => {
    expect(
      normalizeFilters({
        fromDate: ' 2026-11-01 ',
        toDate: '2026-11-30',
        receiptType: ' rent ',
      }),
    ).toEqual({
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      receiptType: 'rent',
      customerId: null,
      propertyId: null,
      status: null,
    })

    expect(captureError(() => normalizeFilters({ fromDate: 'bad' }))).toBeInstanceOf(Error)
    expect(
      captureError(() =>
        normalizeFilters({ fromDate: '2026-11-30', toDate: '2026-11-01' }),
      ),
    ).toBeInstanceOf(Error)
  })

  it('summarizes active receipts and separates cancelled ones', () => {
    const summary = summarizeReceipts([
      receipt({ amountPaise: 10000 }),
      receipt({ amountPaise: 20000, receiptDate: '2026-11-04', customerId: null }),
      receipt({ amountPaise: 50000, status: 'cancelled' }),
    ])

    expect(summary.receiptCount).toBe(2)
    expect(summary.cancelledCount).toBe(1)
    expect(summary.totalPaise).toBe(30000)
    expect(summary.averagePaise).toBe(15000)
    expect(summary.byDay.map((row) => row.key)).toEqual(['2026-11-03', '2026-11-04'])
    expect(summary.byMonth).toEqual([
      { key: '2026-11', label: '2026-11', count: 2, totalPaise: 30000 },
    ])
    expect(summary.byYear).toEqual([
      { key: '2026', label: '2026', count: 2, totalPaise: 30000 },
    ])
    expect(summary.byCategory).toEqual([
      { key: 'rent', label: 'rent', count: 2, totalPaise: 30000 },
    ])
    expect(summary.byCustomer).toEqual([
      { key: 'customer-1', label: 'Asha Rao', count: 1, totalPaise: 10000 },
    ])
  })

  it('returns an empty summary for no receipts', () => {
    expect(summarizeReceipts([])).toEqual(emptyReportSummary())
  })
})
