import sqlite3InitModule, {
  type Database,
  type SAHPoolUtil,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm'

import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  isCustomerNameTaken,
  listCustomers,
  updateCustomer,
} from './customers.ts'
import { getCustomerDetail, getPropertyDetail } from './details.ts'
import {
  DATABASE_DIRECTORY,
  DATABASE_FILE,
  DATABASE_LOCK,
  DATABASE_VFS,
  STORAGE_TYPE,
} from './constants.ts'
import {
  DbBusyError,
  DbUnsupportedError,
  DbValidationError,
  serializeError,
  toDbError,
} from './errors.ts'
import { migrateDatabase, readSchemaVersion } from './migrations.ts'
import {
  createProperty,
  deleteProperty,
  getProperty,
  listProperties,
  updateProperty,
} from './properties.ts'
import {
  createReceipt,
  deleteReceipt,
  getReceipt,
  listReceipts,
  updateReceipt,
} from './receipts.ts'
import {
  isDbRequest,
  type DatabaseInfo,
  type DbInitResult,
  type DbRequest,
} from './protocol.ts'

interface WorkerScope {
  postMessage(message: unknown): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
}

interface SqliteInitOptions {
  locateFile?: (path: string) => string
}

const scope = globalThis as unknown as WorkerScope
const initializeSqlite = sqlite3InitModule as unknown as (
  options?: SqliteInitOptions,
) => Promise<Sqlite3Static>

let database: Database | null = null
let pool: SAHPoolUtil | null = null
let releaseLock: (() => void) | null = null
let initPromise: Promise<DbInitResult> | null = null

async function acquireDatabaseLock() {
  const locks = globalThis.navigator?.locks

  if (!locks) {
    throw new DbUnsupportedError(
      'This browser does not support the Web Locks API required for SQLite storage.',
    )
  }

  let resolveAcquired: (value: boolean) => void = () => undefined
  const acquired = new Promise<boolean>((resolve) => {
    resolveAcquired = resolve
  })

  let lockRequest: Promise<unknown>

  try {
    lockRequest = locks.request(
      DATABASE_LOCK,
      { mode: 'exclusive', ifAvailable: true },
      (lock) => {
        if (!lock) {
          resolveAcquired(false)
          return
        }

        resolveAcquired(true)
        return new Promise<void>((resolve) => {
          releaseLock = resolve
        })
      },
    )
  } catch {
    throw new DbUnsupportedError(
      'This browser could not acquire the SQLite storage lock.',
    )
  }

  lockRequest.catch(() => {
    resolveAcquired(false)
  })

  const acquiredLock = await acquired

  if (!acquiredLock) {
    await lockRequest.catch(() => undefined)
    throw new DbBusyError(
      'PayNote is already open in another tab. Close the other tab and try again.',
    )
  }
}

function releaseDatabaseLock() {
  if (!releaseLock) {
    return
  }

  const release = releaseLock
  releaseLock = null
  release()
}

async function initializeDatabase(): Promise<DbInitResult> {
  await acquireDatabaseLock()

  try {
    const sqlite3 = await initializeSqlite({
      locateFile: () => wasmUrl,
    })

    pool = await sqlite3.installOpfsSAHPoolVfs({
      name: DATABASE_VFS,
      directory: DATABASE_DIRECTORY,
      initialCapacity: 6,
    })

    database = new pool.OpfsSAHPoolDb(DATABASE_FILE)
    database.exec('PRAGMA foreign_keys = ON')
    database.exec('PRAGMA journal_mode = DELETE')
    database.exec('PRAGMA synchronous = NORMAL')
    database.exec('PRAGMA busy_timeout = 5000')
    migrateDatabase(database)

    return readDatabaseInfo()
  } catch (error) {
    closeDatabase()
    throw error
  }
}

async function getDatabase(): Promise<Database> {
  if (database) {
    return database
  }

  if (!initPromise) {
    initPromise = initializeDatabase()
  }

  try {
    await initPromise
  } catch (error) {
    initPromise = null
    closeDatabase()
    throw error
  }

  if (!database) {
    initPromise = null
    throw new Error('The SQLite database did not initialize.')
  }

  return database
}

function readDatabaseInfo(): DatabaseInfo {
  if (!database) {
    throw new Error('The SQLite database is not open.')
  }

  const recordCount = database.selectValue(
    `SELECT
      (SELECT COUNT(*) FROM customers) +
      (SELECT COUNT(*) FROM properties) +
      (SELECT COUNT(*) FROM receipts)`,
  )

  return {
    schemaVersion: readSchemaVersion(database),
    recordCount: toNumber(recordCount),
    databasePath: DATABASE_FILE,
    storageType: STORAGE_TYPE,
  }
}

function closeDatabase() {
  if (database) {
    try {
      database.close()
    } catch {
      database = null
    }
  }

  database = null
  pool = null
  initPromise = null
  releaseDatabaseLock()
}

async function dispatch(request: DbRequest): Promise<unknown> {
  if (request.method === 'close') {
    closeDatabase()
    return null
  }

  const db = await getDatabase()

  switch (request.method) {
    case 'init':
    case 'health':
      return readDatabaseInfo()
    case 'customers.list':
      return listCustomers(db, request.params)
    case 'customers.get':
      return getCustomer(db, requireParams(request.params).id)
    case 'customers.detail':
      return getCustomerDetail(db, requireParams(request.params).id)
    case 'customers.nameTaken': {
      const params = requireParams(request.params)
      return isCustomerNameTaken(db, params.name, params.excludeId)
    }
    case 'customers.create':
      return createCustomer(db, requireObject(request.params))
    case 'customers.update': {
      const params = requireParams(request.params)
      return updateCustomer(db, params.id, requireObject(params.input))
    }
    case 'customers.delete':
      return deleteCustomer(db, requireParams(request.params).id)
    case 'properties.list':
      return listProperties(db, request.params)
    case 'properties.get':
      return getProperty(db, requireParams(request.params).id)
    case 'properties.detail':
      return getPropertyDetail(db, requireParams(request.params).id)
    case 'properties.create':
      return createProperty(db, requireObject(request.params))
    case 'properties.update': {
      const params = requireParams(request.params)
      return updateProperty(db, params.id, requireObject(params.input))
    }
    case 'properties.delete':
      return deleteProperty(db, requireParams(request.params).id)
    case 'receipts.list':
      return listReceipts(db, request.params)
    case 'receipts.get':
      return getReceipt(db, requireParams(request.params).id)
    case 'receipts.create':
      return createReceipt(db, requireObject(request.params))
    case 'receipts.update': {
      const params = requireParams(request.params)
      return updateReceipt(db, params.id, requireObject(params.input))
    }
    case 'receipts.delete':
      return deleteReceipt(db, requireParams(request.params).id)
  }
}

function requireParams<T>(params: T | undefined): T {
  if (params === undefined || params === null) {
    throw new DbValidationError('Request parameters are required.')
  }

  return params
}

function requireObject<T>(value: T | undefined): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    throw new DbValidationError('Request parameters are required.')
  }

  return value
}

async function handleRequest(request: DbRequest) {
  try {
    const result = await dispatch(request)
    scope.postMessage({ id: request.id, ok: true, result })
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: serializeError(toDbError(error)),
    })
  }
}

scope.addEventListener('message', (event) => {
  if (isDbRequest(event.data)) {
    void handleRequest(event.data)
  }
})

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  return Number(value ?? 0)
}
