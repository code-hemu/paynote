import { describe, expect, it } from '@guchho/test'

import type { PrintableReceipt } from '../domain/print.ts'
import {
  createReceiptShareLink,
  readReceiptShareToken,
} from '../services/receipt-share.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import {
  clearSharedReceiptUrl,
  markSharedReceiptNoIndex,
  openSharedReceipt,
} from './shared-receipt.ts'

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
    customerPhone: '9123456780',
    customerEmail: 'customer@example.com',
    customerAddress: '42 River Lane',
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
    expect(text).toContain('12 Lake Road · 9876543210 · asha@example.com')
    expect(text).toContain('Asha Rao')
    expect(text).toContain('42 River Lane · 9123456780 · customer@example.com')
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

  it('returns whether the receipt was rendered', async () => {
    const fixture = createFixture()
    const link = await createReceiptShareLink(
      'https://example.com/',
      printable(),
    )
    const token = readReceiptShareToken(link.url)!

    const loaded = await openSharedReceipt(
      fixture.document as unknown as Document,
      token,
    )
    const failed = await openSharedReceipt(
      fixture.document as unknown as Document,
      { ciphertext: 'invalid', key: '' },
    )

    expect(loaded).toBe(true)
    expect(failed).toBe(false)
  })

  it('marks shared receipt pages as noindex', () => {
    const head = new FakeElement()
    const doc = Object.assign(new FakeDocument(new FakeWindow()), { head })

    markSharedReceiptNoIndex(doc as unknown as Document)

    const meta = head.children[0]
    expect(meta?.getAttribute('name')).toBe('robots')
    expect(meta?.getAttribute('content')).toBe('noindex, nofollow')
  })

  it('removes the share query and key from the address bar', () => {
    let replaced: Array<unknown> = []
    const view = {
      location: {
        href: 'https://code-hemu.github.io/paynote/?p=ciphertext#k=key',
      },
      history: {
        state: { existing: true },
        replaceState: (...args: Array<unknown>) => {
          replaced = args
        },
      },
    }

    clearSharedReceiptUrl(view as unknown as Pick<Window, 'location' | 'history'>)

    expect(replaced[0]).toEqual({ existing: true })
    expect(replaced[1]).toBe('')
    expect(replaced[2]).toBe('/paynote/')
  })
})
