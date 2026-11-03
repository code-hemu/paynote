import type { DbErrorPayload } from './protocol.ts'

export class DbError extends Error {
  readonly code: string

  constructor(message: string, code = 'DB_ERROR') {
    super(message)
    this.name = 'DbError'
    this.code = code
  }
}

export class DbUnsupportedError extends DbError {
  constructor(message: string) {
    super(message, 'DB_UNSUPPORTED')
    this.name = 'DbUnsupportedError'
  }
}

export class DbBusyError extends DbError {
  constructor(message: string) {
    super(message, 'DB_BUSY')
    this.name = 'DbBusyError'
  }
}

class DbInitError extends DbError {
  constructor(message: string) {
    super(message, 'DB_INIT')
    this.name = 'DbInitError'
  }
}

export class DbQueryError extends DbError {
  constructor(message: string) {
    super(message, 'DB_QUERY')
    this.name = 'DbQueryError'
  }
}

export class DbSchemaError extends DbError {
  constructor(message: string) {
    super(message, 'DB_SCHEMA')
    this.name = 'DbSchemaError'
  }
}

export class DbValidationError extends DbError {
  constructor(message: string) {
    super(message, 'DB_VALIDATION')
    this.name = 'DbValidationError'
  }
}

export class DbNotFoundError extends DbError {
  constructor(message: string) {
    super(message, 'DB_NOT_FOUND')
    this.name = 'DbNotFoundError'
  }
}

export class DbConflictError extends DbError {
  constructor(message: string) {
    super(message, 'DB_CONFLICT')
    this.name = 'DbConflictError'
  }
}

export class DbClientError extends DbError {
  constructor(message: string) {
    super(message, 'DB_CLIENT')
    this.name = 'DbClientError'
  }
}

export class DbTimeoutError extends DbError {
  constructor(message: string) {
    super(message, 'DB_TIMEOUT')
    this.name = 'DbTimeoutError'
  }
}

export function toDbError(error: unknown): DbError {
  if (error instanceof DbError) {
    return error
  }

  if (error instanceof Error) {
    if (error.message.includes('FOREIGN KEY constraint failed')) {
      return new DbConflictError('This record is still used by other records.')
    }

    if (error.message.includes('UNIQUE constraint failed')) {
      return new DbConflictError('A record with the same unique value already exists.')
    }

    return new DbQueryError(error.message)
  }

  return new DbQueryError('The database operation failed.')
}

export function serializeError(error: unknown): DbErrorPayload {
  if (error instanceof DbError) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      code: 'DB_ERROR',
      message: error.message,
    }
  }

  return {
    name: 'DbError',
    code: 'DB_ERROR',
    message: 'The database operation failed.',
  }
}

export function deserializeError(payload: DbErrorPayload): DbError {
  switch (payload.code) {
    case 'DB_UNSUPPORTED':
      return new DbUnsupportedError(payload.message)
    case 'DB_BUSY':
      return new DbBusyError(payload.message)
    case 'DB_INIT':
      return new DbInitError(payload.message)
    case 'DB_QUERY':
      return new DbQueryError(payload.message)
    case 'DB_SCHEMA':
      return new DbSchemaError(payload.message)
    case 'DB_VALIDATION':
      return new DbValidationError(payload.message)
    case 'DB_NOT_FOUND':
      return new DbNotFoundError(payload.message)
    case 'DB_CONFLICT':
      return new DbConflictError(payload.message)
    case 'DB_TIMEOUT':
      return new DbTimeoutError(payload.message)
    case 'DB_CLIENT':
      return new DbClientError(payload.message)
    default:
      return new DbError(payload.message, payload.code)
  }
}
