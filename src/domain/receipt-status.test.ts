import { describe, expect, it } from '@guchho/test'

import {
  assertTransition,
  canTransition,
  isReceiptStatus,
  isTerminalStatus,
  nextStatuses,
  normalizeReceiptStatus,
} from './receipt-status.ts'

function captureError(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected the action to fail.')
}

describe('receipt status', () => {
  it('recognizes and normalizes statuses', () => {
    expect(isReceiptStatus('paid')).toBe(true)
    expect(isReceiptStatus('refunded')).toBe(false)
    expect(normalizeReceiptStatus(undefined)).toBe('issued')
    expect(normalizeReceiptStatus('draft')).toBe('draft')
    expect(captureError(() => normalizeReceiptStatus('refunded'))).toBeInstanceOf(
      Error,
    )
  })

  it('allows only the intended lifecycle transitions', () => {
    expect(canTransition('draft', 'issued')).toBe(true)
    expect(canTransition('draft', 'cancelled')).toBe(true)
    expect(canTransition('issued', 'paid')).toBe(true)
    expect(canTransition('issued', 'draft')).toBe(false)
    expect(canTransition('paid', 'cancelled')).toBe(true)
    expect(canTransition('paid', 'issued')).toBe(false)
    expect(canTransition('cancelled', 'issued')).toBe(false)
    expect(canTransition('paid', 'paid')).toBe(true)
  })

  it('returns the same status first and terminal statuses have no moves', () => {
    expect(nextStatuses('issued')).toEqual(['issued', 'paid', 'cancelled'])
    expect(nextStatuses('cancelled')).toEqual(['cancelled'])
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('paid')).toBe(false)
  })

  it('throws a readable error for invalid transitions', () => {
    const error = captureError(() => assertTransition('cancelled', 'paid'))

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('cannot be changed')
  })
})
