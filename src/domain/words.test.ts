import { describe, expect, it } from '@guchho/test'

import { amountInWords, numberToWords } from './words.ts'

describe('amount in words', () => {
  it('uses Indian numbering groups', () => {
    expect(numberToWords(0)).toBe('Zero')
    expect(numberToWords(18)).toBe('Eighteen')
    expect(numberToWords(45)).toBe('Forty Five')
    expect(numberToWords(105)).toBe('One Hundred Five')
    expect(numberToWords(999)).toBe('Nine Hundred Ninety Nine')
    expect(numberToWords(1000)).toBe('One Thousand')
    expect(numberToWords(125000)).toBe('One Lakh Twenty Five Thousand')
    expect(numberToWords(10000000)).toBe('One Crore')
    expect(numberToWords(123456789)).toBe(
      'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine',
    )
  })

  it('handles invalid and negative values', () => {
    expect(numberToWords(Number.NaN)).toBe('Zero')
    expect(numberToWords(-5)).toBe('Zero')
  })

  it('formats rupees and paise', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only')
    expect(amountInWords(100)).toBe('One Rupees Only')
    expect(amountInWords(125050)).toBe(
      'One Thousand Two Hundred Fifty Rupees and Fifty Paise Only',
    )
    expect(amountInWords(-100)).toBe('Zero Rupees Only')
  })
})
