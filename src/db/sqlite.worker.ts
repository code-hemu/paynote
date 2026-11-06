import sqlite3InitModule, {
  type Database,
  type SAHPoolUtil,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm'

import type {
  BackupFile,
  RestoreMode,
} from '../domain/backup.ts'
import {
  AES_KEY_BYTES,
  DATABASE_AAD,
  decryptBytes,
  encryptBytes,
  importAesKey,
} from '../services/crypto.ts'
import {
  readStoredDatabase,
  writeStoredDatabase,
} from '../services/encrypted-store.ts'

import { deleteAllData, exportBackup, restoreBackup } from './backup.ts'
import {
  getDatabaseProfile,
  setDatabaseProfile,
} from './context.ts'
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
  databaseConfigFor,
  SECURE_DATABASE_PATH,
  STORAGE_TYPE,
  type DatabaseConfig,
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
  DEFAULT_DB_PROFILE,
  isDbProfile,
  type DbProfile,
} from './profile.ts'
import { getReportSummary } from './reports.ts'
import { listSettings, setSetting, setSettings } from './settings.ts'
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
let sqlite3Runtime: Sqlite3Static | null = null
let releaseLock: (() => void) | null = null
let initPromise: Promise<DbInitResult> | null = null
let activeConfig: DatabaseConfig = databaseConfigFor(DEFAULT_DB_PROFILE)
let aesKey: CryptoKey | null = null
let persistQueue: Promise<void> = Promise.resolve()
let requestQueue: Promise<void> = Promise.resolve()

const PERSISTED_METHODS = new Set<DbRequest['method']>([
  'customers.create',
  'customers.update',
  'customers.delete',
  'properties.create',
  'properties.update',
  'properties.delete',
  'receipts.create',
  'receipts.update',
  'receipts.delete',
  'settings.set',
  'backup.restore',
  'backup.deleteAll',
])

async function acquireDatabaseLock(lockName: string) {
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
      lockName,
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

async function initializeDatabase(
  profile: DbProfile,
  key: Uint8Array | undefined,
): Promise<DbInitResult> {
  if (!key || key.length !== AES_KEY_BYTES) {
    throw new DbValidationError(
      'Unlock PayNote before opening the encrypted database.',
    )
  }

  setDatabaseProfile(profile)
  activeConfig = databaseConfigFor(profile)
  await acquireDatabaseLock(activeConfig.lock)

  try {
    const sqlite3 = await initializeSqlite({
      locateFile: () => wasmUrl,
    })
    sqlite3Runtime = sqlite3
    aesKey = await importAesKey(key, ['encrypt', 'decrypt'])

    const stored = await readStoredDatabase()
    const legacy = stored ? null : await readLegacyDatabase(sqlite3, activeConfig)
    const db = new sqlite3.oo1.DB(':memory:', 'c')
    database = db

    if (stored && aesKey) {
      const bytes = await decryptBytes(
        aesKey,
        stored.iv,
        stored.ciphertext,
        DATABASE_AAD,
      )
      importDatabaseBytes(sqlite3, db, bytes)
    } else if (legacy?.bytes) {
      importDatabaseBytes(sqlite3, db, legacy.bytes)
    }

    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA journal_mode = DELETE')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA busy_timeout = 5000')

    const previousSchemaVersion = readSchemaVersion(db)
    migrateDatabase(db)
    const profileChanged = ensureProfileSetting(db, profile)
    const hasLegacyBytes = legacy !== null && legacy.bytes !== null
    const needsPersist =
      !stored ||
      hasLegacyBytes ||
      previousSchemaVersion !== readSchemaVersion(db) ||
      profileChanged

    if (needsPersist) {
      await persistDatabase()
    }

    if (hasLegacyBytes) {
      await legacy?.cleanup()
    }

    return readDatabaseInfo()
  } catch (error) {
    closeDatabase()
    throw error
  }
}

function importDatabaseBytes(
  sqlite3: Sqlite3Static,
  db: Database,
  bytes: Uint8Array,
) {
  if (typeof sqlite3.capi.sqlite3_deserialize !== 'function') {
    throw new DbUnsupportedError(
      'This SQLite build cannot open the encrypted database format.',
    )
  }

  const pointer = sqlite3.wasm.allocFromTypedArray(bytes)
  const result = sqlite3.capi.sqlite3_deserialize(
    databasePointer(db),
    'main',
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  )

  if (result !== 0) {
    throw new Error(
      `The encrypted database could not be opened (SQLite code ${result}).`,
    )
  }
}

function databasePointer(db: Database): number {
  if (typeof db.pointer !== 'number') {
    throw new Error('The SQLite database connection is not available.')
  }

  return db.pointer
}

interface LegacyDatabase {
  bytes: Uint8Array | null
  cleanup(): Promise<void>
}

async function readLegacyDatabase(
  sqlite3: Sqlite3Static,
  config: DatabaseConfig,
): Promise<LegacyDatabase> {
  let pool: SAHPoolUtil | null = null

  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({
      name: config.vfs,
      directory: config.directory,
      initialCapacity: 6,
    })

    const filename = pool
      .getFileNames()
      .find((name) => normalizeFilename(name) === normalizeFilename(config.file))

    if (!filename) {
      await removeLegacyPool(pool)
      return { bytes: null, cleanup: async () => undefined }
    }

    const legacyPool = pool
    const bytes = legacyPool.exportFile(filename)

    return {
      bytes,
      cleanup: async () => {
        await removeLegacyPool(legacyPool)
      },
    }
  } catch {
    return { bytes: null, cleanup: async () => undefined }
  }
}

async function removeLegacyPool(pool: SAHPoolUtil): Promise<void> {
  try {
    await pool.removeVfs()
  } catch {
    try {
      await pool.wipeFiles()
      await pool.removeVfs()
    } catch {
      return
    }
  }
}

function normalizeFilename(filename: string): string {
  return filename.replace(/^\/+/, '')
}

function ensureProfileSetting(db: Database, profile: DbProfile): boolean {
  const current = db.selectValue(
    "SELECT value FROM settings WHERE profile = ? AND key = 'profile.type'",
    [profile],
  )

  if (current !== profile) {
    setSetting(db, 'profile.type', profile)
    return true
  }

  return false
}

async function getDatabase(profile?: DbProfile): Promise<Database> {
  if (database) {
    return database
  }

  if (!initPromise) {
    initPromise = initializeDatabase(
      isDbProfile(profile) ? profile : activeConfig.profile,
      undefined,
    )
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

  const profile = getDatabaseProfile()
  const recordCount = database.selectValue(
    `SELECT
      (SELECT COUNT(*) FROM customers WHERE profile = ?) +
      (SELECT COUNT(*) FROM properties WHERE profile = ?) +
      (SELECT COUNT(*) FROM receipts WHERE profile = ?)`,
    [profile, profile, profile],
  )

  return {
    schemaVersion: readSchemaVersion(database),
    recordCount: toNumber(recordCount),
    databasePath: SECURE_DATABASE_PATH,
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
  sqlite3Runtime = null
  aesKey = null
  initPromise = null
  releaseDatabaseLock()
}

function persistDatabase(): Promise<void> {
  const db = database
  const key = aesKey
  const sqlite3 = sqlite3Runtime

  if (!db || !key || !sqlite3) {
    return Promise.reject(
      new Error('The encrypted database is not unlocked.'),
    )
  }

  const write = persistQueue
    .catch(() => undefined)
    .then(async () => {
      if (database !== db) {
        return
      }

      const bytes = sqlite3.capi.sqlite3_js_db_export(databasePointer(db))
      const encrypted = await encryptBytes(key, bytes, DATABASE_AAD)
      await writeStoredDatabase(encrypted.iv, encrypted.ciphertext)
    })

  persistQueue = write
  return write
}

async function dispatch(request: DbRequest): Promise<unknown> {
  if (request.method === 'close') {
    closeDatabase()
    return null
  }

  if (request.method === 'init') {
    const profile = isDbProfile(request.params?.profile)
      ? request.params.profile
      : activeConfig.profile

    if (database) {
      const previousProfile = getDatabaseProfile()
      setDatabaseProfile(profile)

      try {
        if (ensureProfileSetting(database, profile)) {
          await persistDatabase()
        }
      } catch (error) {
        setDatabaseProfile(previousProfile)
        throw error
      }
    } else {
      if (!initPromise) {
        initPromise = initializeDatabase(profile, request.params?.key)
      }

      try {
        await initPromise
      } catch (error) {
        initPromise = null
        throw error
      }
    }

    return readDatabaseInfo()
  }

  const db = await getDatabase()

  switch (request.method) {
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
    case 'properties.list':
      return listProperties(db, request.params)
    case 'properties.get':
      return getProperty(db, requireParams(request.params).id)
    case 'properties.detail':
      return getPropertyDetail(db, requireParams(request.params).id)
    case 'receipts.list':
      return listReceipts(db, request.params)
    case 'receipts.get':
      return getReceipt(db, requireParams(request.params).id)
    case 'settings.list':
      return listSettings(db)
    case 'settings.set':
      setSettings(db, requireParams(request.params).values)
      await persistDatabase()
      return listSettings(db)
    case 'reports.summary':
      return getReportSummary(db, request.params)
    case 'backup.export':
      return exportBackup(db)
    case 'backup.restore': {
      const params = request.params as { backup: BackupFile; mode: RestoreMode }
      const result = restoreBackup(db, params.backup, params.mode)
      await persistDatabase()
      return result
    }
    case 'backup.deleteAll': {
      const result = deleteAllData(db)
      await persistDatabase()
      return result
    }
  }

  const result = await handleMutation(request, db)

  if (PERSISTED_METHODS.has(request.method)) {
    await persistDatabase()
  }

  return result
}

async function handleMutation(
  request: DbRequest,
  db: Database,
): Promise<unknown> {
  switch (request.method) {
    case 'customers.create':
      return createCustomer(db, requireObject(request.params))
    case 'customers.update': {
      const params = requireParams(request.params)
      return updateCustomer(db, params.id, requireObject(params.input))
    }
    case 'customers.delete':
      return deleteCustomer(db, requireParams(request.params).id)
    case 'properties.create':
      return createProperty(db, requireObject(request.params))
    case 'properties.update': {
      const params = requireParams(request.params)
      return updateProperty(db, params.id, requireObject(params.input))
    }
    case 'properties.delete':
      return deleteProperty(db, requireParams(request.params).id)
    case 'receipts.create':
      return createReceipt(db, requireObject(request.params))
    case 'receipts.update': {
      const params = requireParams(request.params)
      return updateReceipt(db, params.id, requireObject(params.input))
    }
    case 'receipts.delete':
      return deleteReceipt(db, requireParams(request.params).id)
    default:
      throw new DbValidationError('The database request is not available.')
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
  if (!isDbRequest(event.data)) {
    return
  }

  const request = event.data
  requestQueue = requestQueue
    .catch(() => undefined)
    .then(() => handleRequest(request))
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
