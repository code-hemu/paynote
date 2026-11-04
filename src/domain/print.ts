import type { Receipt } from '../db/types.ts'

import { computeReceiptTotals } from './money.ts'
import { findCategory, paymentMethodLabel } from './receipt-categories.ts'
import { RECEIPT_STATUS_LABELS } from './receipt-status.ts'
import type { BusinessProfile } from './settings.ts'
import { amountInWords } from './words.ts'

export interface PrintableReceipt {
  business: BusinessProfile
  receiptNumber: string
  receiptDate: string
  status: string
  category: string
  customerName: string
  propertyName: string
  propertyType: string
  paymentMethod: string
  referenceNumber: string
  description: string
  notes: string
  details: Array<{ label: string; value: string }>
  items: Array<{
    description: string
    quantity: number
    ratePaise: number
    discountPaise: number
    lineTotalPaise: number
  }>
  subtotalPaise: number
  discountPaise: number
  totalPaise: number
  amountWords: string
}

export function buildPrintableReceipt(
  receipt: Receipt,
  business: BusinessProfile,
): PrintableReceipt {
  const category = findCategory(receipt.receiptType)
  const totals = computeReceiptTotals(
    receipt.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      ratePaise: item.ratePaise,
      discountPaise: item.discountPaise,
    })),
  )
  const details = receipt.details.map((detail) => ({
    label:
      category?.fields.find((field) => field.key === detail.fieldKey)?.label ??
      humanize(detail.fieldKey),
    value: detail.fieldValue,
  }))

  if (receipt.paymentPeriod && !details.some((detail) => detail.label.toLowerCase().includes('period'))) {
    details.push({ label: 'Payment period', value: receipt.paymentPeriod })
  }

  return {
    business,
    receiptNumber: receipt.receiptNumber,
    receiptDate: receipt.receiptDate,
    status: RECEIPT_STATUS_LABELS[receipt.status],
    category: category?.label ?? receipt.receiptType,
    customerName: receipt.customerName ?? '',
    propertyName: receipt.propertyName ?? '',
    propertyType: receipt.propertyType ?? '',
    paymentMethod: paymentMethodLabel(receipt.paymentMethod),
    referenceNumber: receipt.referenceNumber ?? '',
    description: receipt.description ?? '',
    notes: receipt.notes ?? '',
    details,
    items: totals.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      ratePaise: item.ratePaise,
      discountPaise: item.discountPaise,
      lineTotalPaise: item.lineTotalPaise,
    })),
    subtotalPaise:
      receipt.items.length > 0 ? totals.subtotalPaise : receipt.amountPaise,
    discountPaise: totals.discountPaise,
    totalPaise: receipt.amountPaise,
    amountWords: amountInWords(receipt.amountPaise),
  }
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
