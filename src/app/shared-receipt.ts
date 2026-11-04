import type { PrintableReceipt } from '../domain/print.ts'
import { amountInWords } from '../domain/words.ts'
import {
  decryptReceiptShare,
  type ReceiptShareDetails,
  type ReceiptShareToken,
} from '../services/receipt-share.ts'

import { renderReceiptSheet } from './receipt-sheet.ts'

export async function openSharedReceipt(
  doc: Document,
  token: ReceiptShareToken,
): Promise<void> {
  const root = required<HTMLElement>(doc, '[data-shared-receipt]')
  const loading = required<HTMLElement>(doc, '[data-shared-receipt-loading]')
  const errorPanel = required<HTMLElement>(doc, '[data-shared-receipt-error]')
  const errorMessage = required<HTMLElement>(
    doc,
    '[data-shared-receipt-error-message]',
  )
  const sheet = required<HTMLElement>(doc, '[data-shared-receipt-sheet]')
  const pinScreen = doc.querySelector<HTMLElement>('[data-pin-screen]')
  const appShell = doc.querySelector<HTMLElement>('[data-app-shell]')

  if (pinScreen) {
    pinScreen.hidden = true
  }

  if (appShell) {
    appShell.hidden = true
  }

  root.hidden = false
  loading.hidden = false
  errorPanel.hidden = true
  sheet.replaceChildren()
  doc.title = 'Receipt · PayNote'

  try {
    const details = await decryptReceiptShare(token)
    const printable = printableFromShare(details)
    sheet.append(
      renderReceiptSheet(doc, printable, { footerMessage: '' }),
    )
    loading.hidden = true
    doc.title = `${details.receiptNumber} · PayNote`
  } catch (error) {
    loading.hidden = true
    errorMessage.textContent =
      error instanceof Error
        ? error.message
        : 'This receipt link is invalid or has been altered.'
    errorPanel.hidden = false
    doc.title = 'Receipt link unavailable · PayNote'
  }
}

function printableFromShare(
  details: ReceiptShareDetails,
): PrintableReceipt {
  return {
    business: {
      name: details.businessName,
      address: '',
      phone: '',
      email: '',
      logo: '',
    },
    receiptNumber: details.receiptNumber,
    receiptDate: details.receiptDate,
    status: details.status,
    category: details.category,
    customerName: details.customerName,
    propertyName: details.propertyName,
    propertyType: '',
    paymentMethod: '',
    referenceLabel: '',
    referenceNumber: '',
    description: '',
    notes: '',
    details: [],
    items: [],
    subtotalPaise: details.amountPaise,
    discountPaise: 0,
    totalPaise: details.amountPaise,
    amountWords: amountInWords(details.amountPaise),
  }
}

function required<T extends Element>(
  doc: Document,
  selector: string,
): T {
  const element = doc.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Shared receipt markup is incomplete: ${selector}.`)
  }

  return element
}
