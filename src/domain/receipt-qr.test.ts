import { describe, expect, it } from '@guchho/test'

import type { PrintableReceipt } from './print.ts'
import { receiptQrText } from './receipt-qr.ts'

function printable(): PrintableReceipt {
  return {
    business: {
      name: 'Asha Traders',
      address: '',
      phone: '',
      email: '',
      logo: '',
    },
    receiptNumber: 'PN-2026-0001',
    receiptDate: '2026-11-03',
    status: 'Paid',
    category: 'Rent',
    customerName: 'Asha Rao',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    propertyName: 'River Lane',
    propertyType: '',
    paymentMethod: '',
    referenceLabel: '',
    referenceNumber: '',
    description: '',
    notes: '',
    details: [],
    items: [],
    subtotalPaise: 125050,
    discountPaise: 0,
    totalPaise: 125050,
    amountWords: '',
  }
}

describe('receipt QR data', () => {
  it('includes the minimum receipt fields', () => {
    const text = receiptQrText(printable())

    expect(text).toContain('Receipt No: PN-2026-0001')
    expect(text).toContain('Type: Rent')
    expect(text).toContain('Issued By: Asha Traders')
    expect(text).toContain('Received From: Asha Rao')
    expect(text).toContain('Amount:')
    expect(text).toContain('Property: River Lane')
  })

  it('omits an empty property', () => {
    const receipt = printable()
    receipt.propertyName = ''

    expect(receiptQrText(receipt)).not.toContain('Property:')
  })
})
