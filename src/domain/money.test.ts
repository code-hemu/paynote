import { describe, expect, it } from '@guchho/test'

import {
  computeLineItem,
  computeReceiptTotals,
  paiseToRupees,
  roundPaise,
  rupeesToPaise,
} from './money.ts'

describe('money', () => {
  it('converts rupees and paise using deterministic rounding', () => {
    expect(rupeesToPaise(12.345)).toBe(1235)
    expect(rupeesToPaise('0.1')).toBe(10)
    expect(rupeesToPaise('')).toBe(0)
    expect(rupeesToPaise('not a number')).toBe(0)
    expect(paiseToRupees(1235)).toBe(12.35)
    expect(roundPaise(10.4)).toBe(10)
    expect(roundPaise(10.5)).toBe(11)
    expect(roundPaise(Number.NaN)).toBe(0)
  })

  it('computes line totals with fractional quantities', () => {
    const item = computeLineItem({
      description: '  Cement bags  ',
      quantity: 2.5,
      ratePaise: 45050,
      discountPaise: 1000,
    })

    expect(item.description).toBe('Cement bags')
    expect(item.grossPaise).toBe(112625)
    expect(item.lineTotalPaise).toBe(111625)
  })

  it('clamps invalid quantities, rates, and discounts', () => {
    expect(
      computeLineItem({
        description: 'Free',
        quantity: -1,
        ratePaise: -20,
        discountPaise: -500,
      }),
    ).toMatchObject({
      quantity: 0,
      ratePaise: 0,
      discountPaise: 0,
      grossPaise: 0,
      lineTotalPaise: 0,
    })
  })

  it('never lets a discount make a line negative', () => {
    const item = computeLineItem({
      description: 'Discounted',
      quantity: 1,
      ratePaise: 100,
      discountPaise: 500,
    })

    expect(item.lineTotalPaise).toBe(0)
  })

  it('aggregates subtotal, discount, and total across items', () => {
    const totals = computeReceiptTotals([
      { description: 'A', quantity: 2, ratePaise: 5000, discountPaise: 1000 },
      { description: 'B', quantity: 0.5, ratePaise: 10000, discountPaise: 0 },
    ])

    expect(totals.subtotalPaise).toBe(15000)
    expect(totals.discountPaise).toBe(1000)
    expect(totals.totalPaise).toBe(14000)
    expect(totals.items).toHaveLength(2)
  })

  it('returns zero totals for an empty receipt', () => {
    expect(computeReceiptTotals([])).toEqual({
      subtotalPaise: 0,
      discountPaise: 0,
      totalPaise: 0,
      items: [],
    })
  })
})
