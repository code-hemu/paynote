import { describe, expect, it } from '@guchho/test'

import {
  DbBusyError,
  DbConflictError,
  DbError,
  DbNotFoundError,
  DbQueryError,
  DbSchemaError,
  DbUnsupportedError,
  DbValidationError,
  deserializeError,
  serializeError,
  toDbError,
} from './errors.ts'

describe('database errors', () => {
  it('serializes database and generic errors', () => {
    expect(serializeError(new DbBusyError('Busy'))).toEqual({
      name: 'DbBusyError',
      code: 'DB_BUSY',
      message: 'Busy',
    })
    expect(serializeError(new Error('Boom'))).toEqual({
      name: 'Error',
      code: 'DB_ERROR',
      message: 'Boom',
    })
    expect(serializeError('unknown')).toEqual({
      name: 'DbError',
      code: 'DB_ERROR',
      message: 'The database operation failed.',
    })
  })

  it('deserializes known error codes', () => {
    const unsupported = deserializeError({
      name: 'DbUnsupportedError',
      code: 'DB_UNSUPPORTED',
      message: 'Unsupported',
    })
    const init = deserializeError({
      name: 'DbInitError',
      code: 'DB_INIT',
      message: 'Init failed',
    })
    const fallback = deserializeError({
      name: 'CustomError',
      code: 'CUSTOM',
      message: 'Custom',
    })

    expect(unsupported).toBeInstanceOf(DbUnsupportedError)
    expect(init.code).toBe('DB_INIT')
    expect(init.message).toBe('Init failed')
    expect(fallback.code).toBe('CUSTOM')
    expect(fallback).toBeInstanceOf(DbError)
  })

  it('maps SQLite constraints to typed errors', () => {
    expect(toDbError(new Error('FOREIGN KEY constraint failed'))).toBeInstanceOf(
      DbConflictError,
    )
    expect(toDbError(new Error('UNIQUE constraint failed: x'))).toBeInstanceOf(
      DbConflictError,
    )
    expect(toDbError(new Error('near "x": syntax error'))).toBeInstanceOf(
      DbQueryError,
    )
    expect(toDbError(new DbNotFoundError('Missing'))).toBeInstanceOf(
      DbNotFoundError,
    )
    expect(
      deserializeError({
        name: 'DbValidationError',
        code: 'DB_VALIDATION',
        message: 'Invalid',
      }),
    ).toBeInstanceOf(DbValidationError)
    expect(
      deserializeError({
        name: 'DbSchemaError',
        code: 'DB_SCHEMA',
        message: 'Incompatible',
      }),
    ).toBeInstanceOf(DbSchemaError)
  })
})
