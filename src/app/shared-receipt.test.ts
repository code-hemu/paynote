import { describe, expect, it } from '@guchho/test'

import type { PrintableReceipt } from '../domain/print.ts'
import {
  createReceiptShareLink,
  readReceiptShareToken,
} from '../services/receipt-share.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import { openSharedReceipt } from './shared-receipt.ts'

interface Fixture {
  document: FakeDocument
  root: FakeElement
  loading: FakeElement
  errorPanel: FakeElement
  errorMessage: FakeElement
  sheet: FakeElement
  pinScreen: FakeElement
  appShell: FakeElement
}

function createFixture(): Fixture {
  const document = new FakeDocument(new FakeWindow())
  const root = document.add(new FakeElement({ sharedReceipt: '' }))
  const loading = document.add(new FakeElement({ sharedReceiptLoading: '' }))
  const errorPanel = document.add(
    new FakeElement({ sharedReceiptError: '' }),
  )
  const errorMessage = document.add(
    new FakeElement({ sharedReceiptErrorMessage: '' }),
  )
  const sheet = document.add(new FakeElement({ sharedReceiptSheet: '' }))
  const pinScreen = document.add(new FakeElement({ pinScreen: '' }))
  const appShell = document.add(new FakeElement({ appShell: '' }))

  root.hidden = true
  errorPanel.hidden = true
  appShell.hidden = true

  return {
    document,
    root,
    loading,
    errorPanel,
    errorMessage,
    sheet,
    pinScreen,
    appShell,
  }
}

function printable(): PrintableReceipt {
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
  }
}

function collectText(element: FakeElement): string {
  return [element.textContent, ...element.children.map(collectText)].join(' ')
}

describe('shared receipt page', () => {
  it('renders a decrypted receipt without unlocking PayNote', async () => {
    const fixture = createFixture()
    const link = await createReceiptShareLink(
      'https://example.com/',
      printable(),
    )
    const token = readReceiptShareToken(link.url)!

    await openSharedReceipt(
      fixture.document as unknown as Document,
      token,
    )

    expect(fixture.root.hidden).toBe(false)
    expect(fixture.pinScreen.hidden).toBe(true)
    expect(fixture.appShell.hidden).toBe(true)
    expect(fixture.loading.hidden).toBe(true)
    expect(fixture.errorPanel.hidden).toBe(true)
    expect(fixture.sheet.children.length).toBe(1)
    expect(fixture.document.title).toBe('PN-2026-0001 · PayNote')

    const text = collectText(fixture.sheet)
    expect(text).toContain('Asha Traders')
    expect(text).toContain('Asha Rao')
    expect(text).toContain('Main Shop')
    expect(text).toContain('Authorised Signatory')
    expect(text).toContain('1,250.50')
  })

  it('shows an error for an invalid share link', async () => {
    const fixture = createFixture()

    await openSharedReceipt(
      fixture.document as unknown as Document,
      { ciphertext: 'invalid', key: '' },
    )

    expect(fixture.root.hidden).toBe(false)
    expect(fixture.pinScreen.hidden).toBe(true)
    expect(fixture.loading.hidden).toBe(true)
    expect(fixture.errorPanel.hidden).toBe(false)
    expect(fixture.errorMessage.textContent).toContain(
      'invalid or has been altered',
    )
    expect(fixture.sheet.children.length).toBe(0)
  })
})
