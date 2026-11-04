import { describe, expect, it } from '@guchho/test'

import { DEFAULT_SETTINGS } from '../domain/settings.ts'
import {
  formatCurrency,
  formatDate,
  getFormatPreferences,
  resetFormatPreferences,
} from '../utils/format.ts'

import { applyAppPreferences, getAppPreferences } from './preferences.ts'

describe('app preferences', () => {
  it('applies receipt defaults and display formats', () => {
    applyAppPreferences({
      ...DEFAULT_SETTINGS,
      receiptCurrency: 'USD',
      numberFormat: 'en-US',
      dateFormat: 'MM/DD/YYYY',
      receiptTimezone: 'UTC',
      receiptFooterMessage: 'Thanks for your business.',
      defaultPaymentMethod: 'upi',
      receiptTaxRate: '5',
    })

    try {
      expect(getAppPreferences()).toEqual({
        defaultPaymentMethod: 'upi',
        footerMessage: 'Thanks for your business.',
        taxRate: '5',
      })
      expect(getFormatPreferences()).toEqual({
        currency: 'USD',
        locale: 'en-US',
        dateFormat: 'MM/DD/YYYY',
        timeZone: 'UTC',
      })
      expect(formatCurrency(123456)).toBe('$1,234.56')
      expect(formatDate('2026-11-03')).toBe('11/03/2026')
    } finally {
      applyAppPreferences(DEFAULT_SETTINGS)
      resetFormatPreferences()
    }
  })
})
