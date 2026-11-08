type CategoryFieldType = 'text' | 'date' | 'number' | 'textarea'

interface CategoryField {
  key: string
  label: string
  type: CategoryFieldType
  required?: boolean
  placeholder?: string
  maxLength?: number
}

export interface ReceiptCategory {
  value: string
  label: string
  description: string
  fields: readonly CategoryField[]
}

const PAYMENT_METHODS = [
  'cash',
  'upi',
  'bank-transfer',
  'cheque',
  'card',
  'other',
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  'bank-transfer': 'Bank transfer',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other',
}

const commonPeriodField: CategoryField = {
  key: 'period',
  label: 'Payment period',
  type: 'text',
  placeholder: 'e.g. November 2026',
  maxLength: 100,
}

export const RECEIPT_CATEGORIES: readonly ReceiptCategory[] = [
  {
    value: 'rent',
    label: 'Rent',
    description: 'Recurring rent collected against a property.',
    fields: [
      commonPeriodField,
      {
        key: 'tenant',
        label: 'Tenant name',
        type: 'text',
        maxLength: 200,
      },
      {
        key: 'dueDate',
        label: 'Due date',
        type: 'date',
      },
    ],
  },
  {
    value: 'deposit',
    label: 'Deposit',
    description: 'Security or advance deposit received.',
    fields: [
      commonPeriodField,
      {
        key: 'depositType',
        label: 'Deposit type',
        type: 'text',
        placeholder: 'Security, advance, booking…',
        maxLength: 100,
      },
      {
        key: 'refundable',
        label: 'Refundable',
        type: 'text',
        placeholder: 'Yes or no',
        maxLength: 20,
      },
    ],
  },
  {
    value: 'maintenance',
    label: 'Maintenance',
    description: 'Maintenance or repair charges.',
    fields: [
      commonPeriodField,
      {
        key: 'workDescription',
        label: 'Work description',
        type: 'textarea',
        maxLength: 500,
      },
    ],
  },
  {
    value: 'utilities',
    label: 'Utilities',
    description: 'Electricity, water, gas, and other utility payments.',
    fields: [
      {
        key: 'utilityType',
        label: 'Utility',
        type: 'text',
        placeholder: 'Electricity, water, gas…',
        maxLength: 100,
      },
      {
        key: 'meterNumber',
        label: 'Meter or account number',
        type: 'text',
        maxLength: 100,
      },
      commonPeriodField,
    ],
  },
  {
    value: 'purchase',
    label: 'Purchase',
    description: 'Goods or materials purchased.',
    fields: [
      {
        key: 'vendor',
        label: 'Vendor or supplier',
        type: 'text',
        maxLength: 200,
      },
      {
        key: 'invoiceNumber',
        label: 'Invoice number',
        type: 'text',
        maxLength: 100,
      },
    ],
  },
  {
    value: 'sale',
    label: 'Sale',
    description: 'Goods or materials sold.',
    fields: [
      {
        key: 'buyer',
        label: 'Buyer name',
        type: 'text',
        maxLength: 200,
      },
      {
        key: 'invoiceNumber',
        label: 'Invoice number',
        type: 'text',
        maxLength: 100,
      },
    ],
  },
  {
    value: 'service',
    label: 'Service',
    description: 'Professional or contract service charges.',
    fields: [
      {
        key: 'serviceDescription',
        label: 'Service description',
        type: 'textarea',
        maxLength: 500,
      },
      {
        key: 'servicePeriod',
        label: 'Service period',
        type: 'text',
        maxLength: 100,
      },
    ],
  },
  {
    value: 'salary',
    label: 'Salary',
    description: 'Salary or wages paid.',
    fields: [
      commonPeriodField,
      {
        key: 'employee',
        label: 'Employee name',
        type: 'text',
        maxLength: 200,
      },
      {
        key: 'daysWorked',
        label: 'Days worked',
        type: 'number',
      },
    ],
  },
  {
    value: 'commission',
    label: 'Commission',
    description: 'Brokerage or commission payments.',
    fields: [
      {
        key: 'dealReference',
        label: 'Deal or agreement reference',
        type: 'text',
        maxLength: 100,
      },
      {
        key: 'commissionRate',
        label: 'Commission rate (%)',
        type: 'number',
      },
    ],
  },
  {
    value: 'loan',
    label: 'Loan',
    description: 'Loan repayment or interest.',
    fields: [
      {
        key: 'loanAccount',
        label: 'Loan account number',
        type: 'text',
        maxLength: 100,
      },
      {
        key: 'installment',
        label: 'Installment number',
        type: 'number',
      },
      {
        key: 'principalPaise',
        label: 'Principal component (₹)',
        type: 'number',
      },
    ],
  },
  {
    value: 'donation',
    label: 'Donation',
    description: 'Donations and contributions received.',
    fields: [
      {
        key: 'purpose',
        label: 'Purpose',
        type: 'text',
        maxLength: 200,
      },
      {
        key: 'receipt80g',
        label: '80G eligible',
        type: 'text',
        placeholder: 'Yes or no',
        maxLength: 20,
      },
    ],
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Any other receipt type.',
    fields: [
      {
        key: 'reference',
        label: 'Reference',
        type: 'text',
        maxLength: 100,
      },
    ],
  },
] as const

export function findCategory(value: string): ReceiptCategory | undefined {
  return RECEIPT_CATEGORIES.find((category) => category.value === value)
}

export function isReceiptCategory(value: string): boolean {
  return findCategory(value) !== undefined
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value)
}

export function paymentMethodLabel(value: string): string {
  return isPaymentMethod(value) ? PAYMENT_METHOD_LABELS[value] : value
}

const ONLINE_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'upi',
  'bank-transfer',
  'card',
]

export function paymentReferenceLabel(value: string): string {
  return isPaymentMethod(value) && ONLINE_PAYMENT_METHODS.includes(value)
    ? 'Transaction number'
    : 'Reference number'
}
