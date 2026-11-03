import type { ReceiptFormValues } from '../domain/receipt-form.ts'

export const RECEIPT_DRAFT_KEY = 'paynote.receipt.draft.v1'

export interface ReceiptDraft {
  savedAt: string
  values: ReceiptFormValues
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function saveReceiptDraft(
  values: ReceiptFormValues,
  store: Storage | null = storage(),
  now: Date = new Date(),
): void {
  if (!store) {
    return
  }

  try {
    store.setItem(
      RECEIPT_DRAFT_KEY,
      JSON.stringify({ savedAt: now.toISOString(), values }),
    )
  } catch {
    return
  }
}

export function loadReceiptDraft(
  store: Storage | null = storage(),
): ReceiptDraft | null {
  if (!store) {
    return null
  }

  try {
    const raw = store.getItem(RECEIPT_DRAFT_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<ReceiptDraft>

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.savedAt !== 'string' ||
      !parsed.values ||
      typeof parsed.values !== 'object'
    ) {
      return null
    }

    return { savedAt: parsed.savedAt, values: parsed.values }
  } catch {
    return null
  }
}

export function clearReceiptDraft(store: Storage | null = storage()): void {
  try {
    store?.removeItem(RECEIPT_DRAFT_KEY)
  } catch {
    return
  }
}
