import { describe, expect, it } from '@guchho/test'

import {
  buildReceiptInput,
  itemsTotalPaise,
  parsePositiveAmount,
  validateReceiptForm,
  type ReceiptFormValues,
} from './receipt-form.ts'

function makeValues(overrides: Partial<ReceiptFormValues> = {}): ReceiptFormValues {
  return {
    receiptType: 'rent',
    customerId: '',
    propertyId: '',
    receiptDate: '2026-11-03',
    paymentPeriod: '',
    paymentMethod: 'cash',
    referenceNumber: '',
    description: '',
    notes: '',
    status: 'issued',
    amount: '1250.50',
    details: {},
    items: [],
    ...overrides,
  }
}

describe('receipt form domain', () => {
  it('parses positive amounts and rounds to paise', () => {
    expect(parsePositiveAmount('')).toBe(0)
    expect(parsePositiveAmount('12.345')).toBe(1235)
    expect(parsePositiveAmount('-1')).toBe(Number.NaN)
    expect(parsePositiveAmount('abc')).toBe(Number.NaN)
  })

  it('computes totals from line items in paise', () => {
    expect(itemsTotalPaise([])).toBe(0)
    expect(
      itemsTotalPaise([
        { description: 'A', quantity: '2', rate: '10', discount: '1' },
        { description: 'B', quantity: '1.5', rate: '20.50', discount: '' },
      ]),
    ).toBe(4975)
  })

  it('accepts a valid receipt', () => {
    expect(validateReceiptForm(makeValues(), 125050)).toEqual({})
  })

  it('allows a zero amount only for drafts', () => {
    expect(validateReceiptForm(makeValues({ status: 'draft' }), 0).amount).toBeUndefined()
    expect(validateReceiptForm(makeValues(), 0).amount).toBe(
      'Amount must be greater than zero.',
    )
  })

  it('validates required fields, dates, and category fields', () => {
    const errors = validateReceiptForm(
      makeValues({
        receiptType: 'unknown',
        receiptDate: '2026-02-30',
        paymentMethod: 'barter',
        status: 'refunded',
        referenceNumber: 'x'.repeat(101),
        details: { dueDate: 'not-a-date' },
      }),
      -1,
    )

    expect(errors.receiptType).toBe('Choose a valid receipt category.')
    expect(errors.receiptDate).toBe('Enter a valid date.')
    expect(errors.paymentMethod).toBe('Choose a valid payment method.')
    expect(errors.status).toBe('Choose a valid status.')
    expect(errors.referenceNumber).toBe(
      'Reference number must be 100 characters or fewer.',
    )
    expect(errors.amount).toBe('Enter a valid amount.')

    const rentErrors = validateReceiptForm(
      makeValues({
        receiptType: 'rent',
        receiptDate: '2026-02-01',
        paymentMethod: 'cash',
        status: 'issued',
        details: { dueDate: 'not-a-date' },
      }),
      1000,
    )

    expect(rentErrors['detail.dueDate']).toBe('Due date must be a valid date.')
  })

  it('validates every populated line item and discount limits', () => {
    const errors = validateReceiptForm(
      makeValues({
        items: [
          { description: '', quantity: '0', rate: '-1', discount: '5' },
          { description: 'Valid', quantity: '1', rate: '10', discount: '' },
          { description: 'Overdiscounted', quantity: '1', rate: '1', discount: '5' },
        ],
      }),
      1000,
    )

    expect(errors['item.0.description']).toBe('Describe this line item.')
    expect(errors['item.0.quantity']).toBe('Quantity must be greater than zero.')
    expect(errors['item.0.rate']).toBe('Rate must be zero or greater.')
    expect(errors['item.0.discount']).toBeUndefined()
    expect(errors['item.1.description']).toBeUndefined()
    expect(errors['item.2.discount']).toBe('Discount cannot exceed the line amount.')
  })

  it('requires a positive total when line items have content', () => {
    const errors = validateReceiptForm(
      makeValues({
        items: [{ description: 'Free item', quantity: '1', rate: '0', discount: '' }],
      }),
      0,
    )

    expect(errors.amount).toBe('Line items must add up to more than zero.')
  })

  it('builds a normalized receipt input', () => {
    const values = makeValues({
      receiptType: 'rent',
      customerId: 'customer-1',
      propertyId: 'property-1',
      paymentPeriod: 'November 2026',
      referenceNumber: '  REF-1 ',
      description: '  Rent for November ',
      notes: ' Received in full ',
      details: { tenant: '  Asha Rao ', dueDate: '2026-11-05' },
      items: [
        { description: ' Rent ', quantity: '1', rate: '1000', discount: '50' },
        { description: '', quantity: '', rate: '', discount: '' },
      ],
    })
    const input = buildReceiptInput(values, 95000)

    expect(input).toMatchObject({
      receiptType: 'rent',
      customerId: 'customer-1',
      propertyId: 'property-1',
      receiptDate: '2026-11-03',
      paymentPeriod: 'November 2026',
      amountPaise: 95000,
      paymentMethod: 'cash',
      referenceNumber: 'REF-1',
      description: 'Rent for November',
      notes: 'Received in full',
      status: 'issued',
    })
    expect(input.details).toEqual([
      { fieldKey: 'tenant', fieldValue: 'Asha Rao' },
      { fieldKey: 'dueDate', fieldValue: '2026-11-05' },
      { fieldKey: 'period', fieldValue: 'November 2026' },
    ])
    expect(input.items).toEqual([
      { description: 'Rent', quantity: 1, ratePaise: 100000, discountPaise: 5000 },
    ])
  })

  it('falls back to issued for unknown statuses when building input', () => {
    expect(
      buildReceiptInput(makeValues({ status: 'unknown' }), 100).status,
    ).toBe('issued')
  })
})
