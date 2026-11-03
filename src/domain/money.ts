export interface LineItemInput {
  description: string
  quantity: number
  ratePaise: number
  discountPaise: number
}

export interface LineItemTotals extends LineItemInput {
  grossPaise: number
  lineTotalPaise: number
}

export interface ReceiptTotals {
  subtotalPaise: number
  discountPaise: number
  totalPaise: number
  items: LineItemTotals[]
}

const MAX_QUANTITY = 1_000_000
const MAX_PAISE = Number.MAX_SAFE_INTEGER / 4

export function rupeesToPaise(value: number | string): number {
  const amount = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(amount)) {
    return 0
  }

  return Math.round(amount * 100)
}

export function paiseToRupees(paise: number): number {
  return paise / 100
}

export function roundPaise(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(value)
}

export function computeLineItem(item: LineItemInput): LineItemTotals {
  const quantity = clampQuantity(item.quantity)
  const ratePaise = clampPaise(item.ratePaise)
  const discountPaise = clampPaise(item.discountPaise)
  const grossPaise = roundPaise(quantity * ratePaise)
  const lineTotalPaise = Math.max(0, grossPaise - discountPaise)

  return {
    description: item.description.trim(),
    quantity,
    ratePaise,
    discountPaise,
    grossPaise,
    lineTotalPaise,
  }
}

export function computeReceiptTotals(items: LineItemInput[]): ReceiptTotals {
  const computed = items.map(computeLineItem)
  let subtotalPaise = 0
  let discountPaise = 0
  let totalPaise = 0

  for (const item of computed) {
    subtotalPaise += item.grossPaise
    discountPaise += item.discountPaise
    totalPaise += item.lineTotalPaise
  }

  return { subtotalPaise, discountPaise, totalPaise, items: computed }
}

function clampQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.min(MAX_QUANTITY, Math.round(value * 1000) / 1000)
}

function clampPaise(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.min(MAX_PAISE, Math.round(value))
}
