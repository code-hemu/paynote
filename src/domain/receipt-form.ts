import { computeReceiptTotals, rupeesToPaise } from './money.ts'
import {
  findCategory,
  isPaymentMethod,
  isReceiptCategory,
} from './receipt-categories.ts'
import { isReceiptStatus, type ReceiptStatus } from './receipt-status.ts'

export type ReceiptFormErrors = Record<string, string>

export interface ReceiptItemFormValue {
  description: string
  quantity: string
  rate: string
  discount: string
}

export interface ReceiptFormValues {
  receiptType: string
  customerId: string
  propertyId: string
  receiptDate: string
  paymentPeriod: string
  paymentMethod: string
  referenceNumber: string
  description: string
  notes: string
  status: string
  amount: string
  details: Record<string, string>
  items: ReceiptItemFormValue[]
}

export interface ReceiptFormInput {
  receiptType: string
  customerId: string | null
  propertyId: string | null
  receiptDate: string
  paymentPeriod: string | null
  amountPaise: number
  paymentMethod: string
  referenceNumber: string | null
  description: string | null
  notes: string | null
  status: ReceiptStatus
  details: Array<{ fieldKey: string; fieldValue: string }>
  items: Array<{
    description: string
    quantity: number
    ratePaise: number
    discountPaise: number
  }>
}

export interface ParsedReceiptForm {
  values: ReceiptFormValues
  totalPaise: number
  errors: ReceiptFormErrors
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function parsePositiveAmount(value: string): number {
  const trimmed = value.trim()

  if (trimmed === '') {
    return 0
  }

  const amount = Number(trimmed)

  if (!Number.isFinite(amount) || amount < 0) {
    return Number.NaN
  }

  return rupeesToPaise(amount)
}

export function itemsTotalPaise(items: ReceiptItemFormValue[]): number {
  if (items.length === 0) {
    return 0
  }

  return computeReceiptTotals(
    items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity) || 0,
      ratePaise: rupeesToPaise(item.rate),
      discountPaise: rupeesToPaise(item.discount),
    })),
  ).totalPaise
}

export function validateReceiptForm(
  values: ReceiptFormValues,
  totalPaise: number,
): ReceiptFormErrors {
  const errors: ReceiptFormErrors = {}

  if (!values.receiptType.trim()) {
    errors.receiptType = 'Choose a receipt category.'
  } else if (!isReceiptCategory(values.receiptType)) {
    errors.receiptType = 'Choose a valid receipt category.'
  }

  if (!values.receiptDate.trim()) {
    errors.receiptDate = 'Receipt date is required.'
  } else if (!isValidDate(values.receiptDate.trim())) {
    errors.receiptDate = 'Enter a valid date.'
  }

  if (!values.paymentMethod.trim()) {
    errors.paymentMethod = 'Choose a payment method.'
  } else if (!isPaymentMethod(values.paymentMethod)) {
    errors.paymentMethod = 'Choose a valid payment method.'
  }

  if (values.status.trim() !== '' && !isReceiptStatus(values.status)) {
    errors.status = 'Choose a valid status.'
  }

  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    errors.amount = 'Enter a valid amount.'
  } else if (totalPaise === 0 && values.status !== 'draft') {
    errors.amount = 'Amount must be greater than zero.'
  } else if (totalPaise > Number.MAX_SAFE_INTEGER / 2) {
    errors.amount = 'Amount is too large.'
  }

  checkLength(values.referenceNumber, 'referenceNumber', 'Reference number', 100, errors)
  checkLength(values.description, 'description', 'Description', 2000, errors)
  checkLength(values.notes, 'notes', 'Notes', 2000, errors)

  if (values.customerId.trim().length > 100) {
    errors.customerId = 'Customer selection is invalid.'
  }

  if (values.propertyId.trim().length > 100) {
    errors.propertyId = 'Property selection is invalid.'
  }

  const category = findCategory(values.receiptType)

  for (const field of category?.fields ?? []) {
    const value = values.details[field.key] ?? ''

    if (field.required && value.trim() === '') {
      errors[`detail.${field.key}`] = `${field.label} is required.`
    }

    if (field.type === 'date' && value.trim() !== '' && !isValidDate(value.trim())) {
      errors[`detail.${field.key}`] = `${field.label} must be a valid date.`
    }

    if (field.maxLength && value.trim().length > field.maxLength) {
      errors[`detail.${field.key}`] = `${field.label} must be ${field.maxLength} characters or fewer.`
    }
  }

  let hasItemContent = false

  values.items.forEach((item, index) => {
    const prefix = `item.${index}`
    const hasAny =
      item.description.trim() !== '' ||
      item.quantity.trim() !== '' ||
      item.rate.trim() !== '' ||
      item.discount.trim() !== ''

    if (!hasAny) {
      return
    }

    hasItemContent = true

    if (item.description.trim() === '') {
      errors[`${prefix}.description`] = 'Describe this line item.'
    }

    const quantity = Number(item.quantity)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors[`${prefix}.quantity`] = 'Quantity must be greater than zero.'
    }

    const rate = parsePositiveAmount(item.rate)

    if (!Number.isFinite(rate) || rate < 0) {
      errors[`${prefix}.rate`] = 'Rate must be zero or greater.'
    }

    const discount = parsePositiveAmount(item.discount)

    if (!Number.isFinite(discount) || discount < 0) {
      errors[`${prefix}.discount`] = 'Discount must be zero or greater.'
    }

    if (
      Number.isFinite(rate) &&
      Number.isFinite(discount) &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      discount > Math.round(quantity * rate)
    ) {
      errors[`${prefix}.discount`] = 'Discount cannot exceed the line amount.'
    }
  })

  if (hasItemContent && totalPaise === 0 && values.status !== 'draft') {
    errors.amount = 'Line items must add up to more than zero.'
  }

  return errors
}

export function buildReceiptInput(
  values: ReceiptFormValues,
  totalPaise: number,
): ReceiptFormInput {
  const category = findCategory(values.receiptType)
  const details: Array<{ fieldKey: string; fieldValue: string }> = []

  for (const field of category?.fields ?? []) {
    const value = values.details[field.key]?.trim() ?? ''

    if (value !== '') {
      details.push({ fieldKey: field.key, fieldValue: value })
    }
  }

  if (values.paymentPeriod.trim() !== '' && !details.some((detail) => detail.fieldKey === 'period')) {
    details.push({ fieldKey: 'period', fieldValue: values.paymentPeriod.trim() })
  }

  const items = values.items
    .filter(
      (item) =>
        item.description.trim() !== '' ||
        item.quantity.trim() !== '' ||
        item.rate.trim() !== '',
    )
    .map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity) || 0,
      ratePaise: parsePositiveAmount(item.rate) || 0,
      discountPaise: parsePositiveAmount(item.discount) || 0,
    }))

  return {
    receiptType: values.receiptType.trim(),
    customerId: values.customerId.trim() || null,
    propertyId: values.propertyId.trim() || null,
    receiptDate: values.receiptDate.trim(),
    paymentPeriod: values.paymentPeriod.trim() || null,
    amountPaise: totalPaise,
    paymentMethod: values.paymentMethod.trim(),
    referenceNumber: values.referenceNumber.trim() || null,
    description: values.description.trim() || null,
    notes: values.notes.trim() || null,
    status: isReceiptStatus(values.status) ? values.status : 'issued',
    details,
    items,
  }
}

function checkLength(
  value: string,
  field: string,
  label: string,
  maxLength: number,
  errors: ReceiptFormErrors,
): void {
  if (value.trim().length > maxLength) {
    errors[field] = `${label} must be ${maxLength} characters or fewer.`
  }
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
