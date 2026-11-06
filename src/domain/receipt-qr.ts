import { formatCurrency, formatDate } from '../utils/format.ts'

import type { PrintableReceipt } from './print.ts'

export function receiptQrText(printable: PrintableReceipt): string {
  const fields: Array<[string, string]> = [
    ['Receipt No', printable.receiptNumber],
    ['Date', formatDate(printable.receiptDate)],
    ['Type', printable.category],
    ['Issued By', printable.business.name || 'PayNote'],
    ['Received From', printable.customerName || 'Walk-in'],
    ['Amount', formatCurrency(printable.totalPaise)],
    ['Property', printable.propertyName],
  ]

  return fields
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}
