import { describe, expect, it } from '@guchho/test'

import { setActiveProfile } from '../db/profile.ts'
import type { ReceiptFormValues } from '../domain/receipt-form.ts'

import {
  loadReceiptDraft,
  receiptDraftKey,
  saveReceiptDraft,
} from './receipt-draft.ts'

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>()

  get length() {
    return this.items.size
  }

  clear() {
    this.items.clear()
  }

  getItem(key: string) {
    return this.items.get(key) ?? null
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.items.delete(key)
  }

  setItem(key: string, value: string) {
    this.items.set(key, String(value))
  }
}

const VALUES: ReceiptFormValues = {
  receiptType: 'rent',
  customerId: '',
  propertyId: '',
  receiptDate: '2026-11-04',
  paymentPeriod: '',
  paymentMethod: 'cash',
  referenceNumber: '',
  description: '',
  notes: '',
  status: 'issued',
  amount: '100',
  details: {},
  items: [],
}

describe('receipt drafts', () => {
  it('stores each profile draft under its own key', () => {
    const store = new MemoryStorage()
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: store,
    })

    try {
      setActiveProfile('business')
      saveReceiptDraft({ ...VALUES, notes: 'Business draft' }, store, new Date(0))
      expect(store.getItem(receiptDraftKey('business'))).not.toBeNull()
      expect(store.getItem(receiptDraftKey('individual'))).toBeNull()

      setActiveProfile('individual')
      expect(loadReceiptDraft(store)).toBeNull()

      saveReceiptDraft(
        { ...VALUES, notes: 'Individual draft' },
        store,
        new Date(0),
      )

      setActiveProfile('business')
      expect(loadReceiptDraft(store)?.values.notes).toBe('Business draft')

      setActiveProfile('individual')
      expect(loadReceiptDraft(store)?.values.notes).toBe('Individual draft')
    } finally {
      setActiveProfile('business')

      if (previous) {
        Object.defineProperty(globalThis, 'localStorage', previous)
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage
      }
    }
  })
})
