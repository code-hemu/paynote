export const RECEIPT_STATUSES = ['draft', 'issued', 'paid', 'cancelled'] as const

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const TRANSITIONS: Record<ReceiptStatus, readonly ReceiptStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['paid', 'cancelled'],
  paid: ['cancelled'],
  cancelled: [],
}

export function isReceiptStatus(value: unknown): value is ReceiptStatus {
  return (
    typeof value === 'string' &&
    (RECEIPT_STATUSES as readonly string[]).includes(value)
  )
}

export function normalizeReceiptStatus(value: unknown): ReceiptStatus {
  if (value === undefined || value === null || value === '') {
    return 'issued'
  }

  if (!isReceiptStatus(value)) {
    throw new Error('Receipt status must be draft, issued, paid, or cancelled.')
  }

  return value
}

export function canTransition(
  from: ReceiptStatus,
  to: ReceiptStatus,
): boolean {
  return from === to || TRANSITIONS[from].includes(to)
}

export function nextStatuses(from: ReceiptStatus): ReceiptStatus[] {
  return [from, ...TRANSITIONS[from]]
}

export function assertTransition(from: ReceiptStatus, to: ReceiptStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `A ${RECEIPT_STATUS_LABELS[from].toLowerCase()} receipt cannot be changed to ${RECEIPT_STATUS_LABELS[to].toLowerCase()}.`,
    )
  }
}

export function isTerminalStatus(status: ReceiptStatus): boolean {
  return status === 'cancelled'
}
