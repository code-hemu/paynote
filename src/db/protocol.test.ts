import { describe, expect, it } from '@guchho/test'

import { isDbRequest, isDbResponse } from './protocol.ts'

describe('database protocol', () => {
  it('accepts well-formed requests', () => {
    expect(isDbRequest({ id: 1, method: 'init' })).toBe(true)
    expect(isDbRequest({ id: 2, method: 'health', params: undefined })).toBe(true)
    expect(isDbRequest({ id: 3, method: 'close' })).toBe(true)
    expect(
      isDbRequest({ id: 4, method: 'customers.list', params: { limit: 10 } }),
    ).toBe(true)
    expect(
      isDbRequest({ id: 5, method: 'receipts.create', params: undefined }),
    ).toBe(true)
  })

  it('rejects malformed requests', () => {
    expect(isDbRequest(null)).toBe(false)
    expect(isDbRequest('init')).toBe(false)
    expect(isDbRequest({ method: 'init' })).toBe(false)
    expect(isDbRequest({ id: '1', method: 'init' })).toBe(false)
    expect(isDbRequest({ id: 6, method: 'unknown' })).toBe(false)
  })

  it('accepts successful and failed responses', () => {
    expect(
      isDbResponse({
        id: 1,
        ok: true,
        result: { schemaVersion: 1 },
      }),
    ).toBe(true)
    expect(
      isDbResponse({
        id: 2,
        ok: false,
        error: { name: 'DbError', code: 'DB_ERROR', message: 'Failed' },
      }),
    ).toBe(true)
  })

  it('rejects malformed responses', () => {
    expect(isDbResponse(null)).toBe(false)
    expect(isDbResponse({ id: 1 })).toBe(false)
    expect(isDbResponse({ id: 1, ok: 'yes' })).toBe(false)
  })
})
