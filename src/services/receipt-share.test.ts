import { describe, expect, it } from '@guchho/test'

import type { PrintableReceipt } from '../domain/print.ts'

import {
  createReceiptShareLink,
  decryptReceiptShare,
  readReceiptShareToken,
} from './receipt-share.ts'

function printable(overrides: Partial<PrintableReceipt> = {}): PrintableReceipt {
  return {
    business: {
      name: 'Asha Traders',
      address: '12 Lake Road',
      phone: '9876543210',
      email: 'asha@example.com',
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
    propertyName: 'Main Shop',
    propertyType: 'shop',
    paymentMethod: 'UPI',
    referenceLabel: 'Transaction number',
    referenceNumber: 'UPI-1',
    description: 'Monthly rent',
    notes: '',
    details: [],
    items: [],
    subtotalPaise: 125050,
    discountPaise: 0,
    totalPaise: 125050,
    amountWords: 'One Thousand Two Hundred Fifty Rupees and Fifty Paise Only',
    ...overrides,
  }
}

describe('receipt share links', () => {
  it('creates a link with encrypted data and a fragment key', async () => {
    const link = await createReceiptShareLink(
      'https://example.com/paynote/index.html?old=1#/receipts',
      printable(),
    )
    const url = new URL(link.url)

    expect(url.pathname).toBe('/paynote/index.html')
    expect(url.searchParams.has('p')).toBe(true)
    expect(url.searchParams.has('old')).toBe(false)
    expect(url.hash.startsWith('#k=')).toBe(true)
    expect(link.details.receiptNumber).toBe('PN-2026-0001')
    expect(link.url).not.toContain('Asha Rao')
    expect(link.url).not.toContain('PN-2026-0001')
  })

  it('decrypts the summary details from a generated link', async () => {
    const link = await createReceiptShareLink(
      'https://example.com/',
      printable(),
    )
    const token = readReceiptShareToken(link.url)

    expect(token).not.toBe(null)

    const details = await decryptReceiptShare(token!)

    expect(details).toEqual(link.details)
    expect(details).toMatchObject({
      version: 1,
      businessName: 'Asha Traders',
      receiptNumber: 'PN-2026-0001',
      receiptDate: '2026-11-03',
      status: 'Paid',
      customerName: 'Asha Rao',
      propertyName: 'Main Shop',
      category: 'Rent',
      amountPaise: 125050,
    })
  })

  it('supports unicode receipt details', async () => {
    const link = await createReceiptShareLink(
      'https://example.com/',
      printable({ customerName: 'राहुल शर्मा', propertyName: 'मुख्य दुकान' }),
    )
    const token = readReceiptShareToken(link.url)
    const details = await decryptReceiptShare(token!)

    expect(details.customerName).toBe('राहुल शर्मा')
    expect(details.propertyName).toBe('मुख्य दुकान')
  })

  it('returns null for links without a share payload', () => {
    expect(readReceiptShareToken('https://example.com/?q=1')).toBe(null)
    expect(readReceiptShareToken('not a url')).toBe(null)
  })

  it('rejects a link without a key', async () => {
    const link = await createReceiptShareLink(
      'https://example.com/',
      printable(),
    )
    const url = new URL(link.url)
    url.hash = ''

    await expect(
      decryptReceiptShare(readReceiptShareToken(url.href)!),
    ).rejects.toThrow('invalid or has been altered')
  })

  it('rejects tampered ciphertext', async () => {
    const link = await createReceiptShareLink(
      'https://example.com/',
      printable(),
    )
    const token = readReceiptShareToken(link.url)!
    const first = token.ciphertext[0]
    const replacement = first === 'A' ? 'B' : 'A'

    await expect(
      decryptReceiptShare({
        ...token,
        ciphertext: `${replacement}${token.ciphertext.slice(1)}`,
      }),
    ).rejects.toThrow('invalid or has been altered')
  })
})
