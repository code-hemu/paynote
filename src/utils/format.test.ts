import { describe, expect, it } from '@guchho/test'

import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatSchemaVersion,
  resetFormatPreferences,
  setFormatPreferences,
} from './format.ts'

describe('formatBytes', () => {
  it('formats byte values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats larger units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
  })

  it('handles invalid input', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

describe('formatSchemaVersion', () => {
  it('prefixes the version', () => {
    expect(formatSchemaVersion(1)).toBe('v1')
  })
})

describe('formatDate', () => {
  it('formats an ISO timestamp', () => {
    expect(formatDate('2026-11-03T15:30:00.000Z')).toBe('03 Nov 2026')
  })

  it('handles invalid input', () => {
    expect(formatDate('not-a-date')).toBe('—')
  })

  it('uses display preferences for amounts and dates', () => {
    setFormatPreferences({
      currency: 'USD',
      locale: 'en-US',
      dateFormat: 'MM/DD/YYYY',
      timeZone: 'UTC',
    })

    try {
      expect(formatCurrency(123456)).toBe('$1,234.56')
      expect(formatDate('2026-11-03')).toBe('11/03/2026')
      expect(formatDate('2026-11-03', { dateFormat: 'YYYY-MM-DD' })).toBe(
        '2026-11-03',
      )
    } finally {
      resetFormatPreferences()
    }

    expect(formatCurrency(123456)).toBe('₹1,234.56')
    expect(formatDate('2026-11-03')).toBe('03 Nov 2026')
  })
})
