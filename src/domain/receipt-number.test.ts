import { describe, expect, it } from '@guchho/test'

import {
  DEFAULT_RECEIPT_NUMBER_FORMAT,
  formatReceiptNumber,
} from './receipt-number.ts'

describe('receipt number format', () => {
  it('uses the default format when the template is empty', () => {
    expect(
      formatReceiptNumber('', { prefix: 'PN', year: 2026, sequence: 1 }),
    ).toBe(formatReceiptNumber(DEFAULT_RECEIPT_NUMBER_FORMAT, {
      prefix: 'PN',
      year: 2026,
      sequence: 1,
    }))
  })

  it('replaces prefix, year, and padded sequence tokens', () => {
    expect(
      formatReceiptNumber('{PREFIX}/{YY}/{000}', {
        prefix: 'AT',
        year: 2026,
        sequence: 7,
      }),
    ).toBe('AT/26/007')
  })

  it('supports formats without a padded sequence token', () => {
    expect(
      formatReceiptNumber('{PREFIX}-{YYYY}', {
        prefix: 'PN',
        year: 2026,
        sequence: 12,
      }),
    ).toBe('PN-2026')
  })
})
