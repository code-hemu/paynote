import { describe, expect, it } from '@guchho/test'

import type { Receipt } from '../db/types.ts'

import { buildPrintableReceipt } from './print.ts'
import { businessProfileFromSettings, SETTING_KEYS } from './settings.ts'

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'receipt-1',
    receiptNumber: 'PN-2026-0001',
    receiptType: 'rent',
    customerId: 'customer-1',
    customerName: 'Asha Rao',
    propertyId: 'property-1',
    propertyName: 'Main Shop',
    receiptDate: '2026-11-03',
    paymentPeriod: 'November 2026',
    amountPaise: 125050,
    paymentMethod: 'upi',
    status: 'paid',
    referenceNumber: 'UPI-1',
    description: 'Rent',
    notes: 'Paid in full',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    details: [
      { fieldKey: 'tenant', fieldValue: 'Asha Rao' },
      { fieldKey: 'unknownField', fieldValue: 'value' },
    ],
    items: [
      {
        description: 'Rent',
        quantity: 1,
        ratePaise: 125050,
        discountPaise: 0,
        lineTotalPaise: 125050,
      },
    ],
    ...overrides,
  }
}

describe('printable receipt', () => {
  it('renders business, category, details, totals, and words', () => {
    const printable = buildPrintableReceipt(makeReceipt(), {
      name: 'Asha Traders',
      address: '12 Lake Road',
      phone: '9876543210',
      email: 'asha@example.com',
      logo: 'https://example.com/logo.png',
    })

    expect(printable.business.name).toBe('Asha Traders')
    expect(printable.receiptNumber).toBe('PN-2026-0001')
    expect(printable.status).toBe('Paid')
    expect(printable.category).toBe('Rent')
    expect(printable.customerName).toBe('Asha Rao')
    expect(printable.propertyName).toBe('Main Shop')
    expect(printable.paymentMethod).toBe('UPI')
    expect(printable.referenceLabel).toBe('Transaction number')
    expect(printable.details).toEqual([
      { label: 'Tenant name', value: 'Asha Rao' },
      { label: 'Unknown Field', value: 'value' },
      { label: 'Payment period', value: 'November 2026' },
    ])
    expect(printable.subtotalPaise).toBe(125050)
    expect(printable.totalPaise).toBe(125050)
    expect(printable.amountWords).toBe(
      'One Thousand Two Hundred Fifty Rupees and Fifty Paise Only',
    )
  })

  it('shows the full name for individuals and the business name for businesses', () => {
    const receipt = makeReceipt()
    const settings = {
      [SETTING_KEYS.fullName]: 'Asha Rao',
      [SETTING_KEYS.businessName]: 'Asha Traders',
    }

    const individual = buildPrintableReceipt(
      receipt,
      businessProfileFromSettings({
        ...settings,
        [SETTING_KEYS.profileType]: 'individual',
      }),
    )
    expect(individual.business.name).toBe('Asha Rao')

    const business = buildPrintableReceipt(
      receipt,
      businessProfileFromSettings({
        ...settings,
        [SETTING_KEYS.profileType]: 'business',
      }),
    )
    expect(business.business.name).toBe('Asha Traders')
  })

  it('uses the stored amount when a receipt has no line items', () => {
    const printable = buildPrintableReceipt(
      makeReceipt({ items: [], details: [], paymentPeriod: null }),
      { name: '', address: '', phone: '', email: '', logo: '' },
    )

    expect(printable.items).toEqual([])
    expect(printable.subtotalPaise).toBe(125050)
    expect(printable.totalPaise).toBe(125050)
    expect(printable.details).toEqual([])
  })
})
