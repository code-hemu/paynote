import { describe, expect, it } from '@guchho/test'

import type { PrintableReceipt } from '../domain/print.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import { renderReceiptSheet } from './receipt-sheet.ts'

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
    propertyName: '',
    propertyType: '',
    paymentMethod: 'UPI',
    referenceLabel: '',
    referenceNumber: '',
    description: '',
    notes: '',
    details: [],
    items: [],
    subtotalPaise: 125050,
    discountPaise: 0,
    totalPaise: 125050,
    amountWords: 'One Thousand Two Hundred Fifty Rupees and Fifty Paise Only',
  }
}

function collectText(element: FakeElement): string {
  return [element.textContent, ...element.children.map(collectText)].join(' ')
}

function findByClass(root: FakeElement, name: string): FakeElement | null {
  if (root.className.split(/\s+/).includes(name)) {
    return root
  }

  for (const child of root.children) {
    const found = findByClass(child, name)

    if (found) {
      return found
    }
  }

  return null
}

describe('receipt sheet', () => {
  it('places the QR beside the authorised signatory', () => {
    const document = new FakeDocument(new FakeWindow())
    const sheet = renderReceiptSheet(
      document as unknown as Document,
      printable(),
      {
        qr: {
          imageUrl: 'data:image/svg+xml,test',
          link: 'https://example.com/?p=test#k=test',
        },
      },
    ) as unknown as FakeElement
    const signatureRow = findByClass(
      sheet,
      'receipt-sheet-signature-row',
    )
    const qr = findByClass(sheet, 'receipt-sheet-qr')
    const signature = findByClass(sheet, 'receipt-sheet-signature')
    const qrImage = qr?.children[0]

    expect(signatureRow?.children).toEqual([qr, signature])
    expect(
      (qrImage as unknown as { alt?: string } | undefined)?.alt ?? '',
    ).toContain('PN-2026-0001')
    expect(collectText(sheet)).toContain('Authorised Signatory')
  })
})
