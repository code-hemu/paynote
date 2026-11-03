import { DATABASE_WORKER_FILE } from './constants.ts'
import {
  DbClientError,
  DbTimeoutError,
  deserializeError,
} from './errors.ts'
import {
  isDbResponse,
  type DbHealthResult,
  type DbInitResult,
  type DbMethod,
  type DbMethodMap,
} from './protocol.ts'
import type {
  Customer,
  CustomerInput,
  CustomerListOptions,
  ListResult,
  Property,
  PropertyInput,
  PropertyListOptions,
  Receipt,
  ReceiptInput,
  ReceiptListOptions,
  ReceiptSummary,
} from './types.ts'

export interface WorkerLike {
  postMessage(message: unknown): void
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
  terminate(): void
}

export interface SqliteHealth extends DbHealthResult {
  usageBytes: number
  quotaBytes: number | null
  persistent: boolean
}

export interface SqliteClientOptions {
  createWorker?: () => WorkerLike
  timeoutMs?: number
}

interface PendingRequest {
  resolve(value: unknown): void
  reject(reason: unknown): void
  timer: ReturnType<typeof setTimeout>
}

const DEFAULT_TIMEOUT_MS = 15_000

function defaultCreateWorker(): WorkerLike {
  if (typeof Worker === 'undefined') {
    throw new DbClientError('Web Workers are not available in this browser.')
  }

  const baseUrl =
    typeof document !== 'undefined'
      ? document.baseURI
      : globalThis.location.href
  const worker = new Worker(new URL(DATABASE_WORKER_FILE, baseUrl), {
    type: 'module',
    name: 'paynote-sqlite',
  })

  return worker as unknown as WorkerLike
}

export class SqliteClient {
  private readonly createWorker: () => WorkerLike
  private readonly timeoutMs: number
  private worker: WorkerLike | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private initPromise: Promise<DbInitResult> | null = null
  private initResult: DbInitResult | null = null

  constructor(options: SqliteClientOptions = {}) {
    this.createWorker = options.createWorker ?? defaultCreateWorker
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async init(): Promise<DbInitResult> {
    if (this.initResult) {
      return this.initResult
    }

    if (!this.initPromise) {
      this.initPromise = this.request('init')
        .then(async (result) => {
          this.initResult = result
          await requestPersistentStorage()
          return result
        })
        .catch((error: unknown) => {
          this.initPromise = null
          throw error
        })
    }

    return this.initPromise
  }

  async health(): Promise<SqliteHealth> {
    await this.init()

    const [databaseHealth, storage] = await Promise.all([
      this.request('health'),
      readStorageEstimate(),
    ])

    return {
      ...databaseHealth,
      ...storage,
    }
  }

  listCustomers(
    options?: CustomerListOptions,
  ): Promise<ListResult<Customer>> {
    return this.request('customers.list', options)
  }

  getCustomer(id: string): Promise<Customer> {
    return this.request('customers.get', { id })
  }

  createCustomer(input: CustomerInput): Promise<Customer> {
    return this.request('customers.create', input)
  }

  updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
    return this.request('customers.update', { id, input })
  }

  async deleteCustomer(id: string): Promise<void> {
    await this.request('customers.delete', { id })
  }

  listProperties(
    options?: PropertyListOptions,
  ): Promise<ListResult<Property>> {
    return this.request('properties.list', options)
  }

  getProperty(id: string): Promise<Property> {
    return this.request('properties.get', { id })
  }

  createProperty(input: PropertyInput): Promise<Property> {
    return this.request('properties.create', input)
  }

  updateProperty(id: string, input: PropertyInput): Promise<Property> {
    return this.request('properties.update', { id, input })
  }

  async deleteProperty(id: string): Promise<void> {
    await this.request('properties.delete', { id })
  }

  listReceipts(
    options?: ReceiptListOptions,
  ): Promise<ListResult<ReceiptSummary>> {
    return this.request('receipts.list', options)
  }

  getReceipt(id: string): Promise<Receipt> {
    return this.request('receipts.get', { id })
  }

  createReceipt(input: ReceiptInput): Promise<Receipt> {
    return this.request('receipts.create', input)
  }

  updateReceipt(id: string, input: ReceiptInput): Promise<Receipt> {
    return this.request('receipts.update', { id, input })
  }

  async deleteReceipt(id: string): Promise<void> {
    await this.request('receipts.delete', { id })
  }

  async close(): Promise<void> {
    if (!this.worker) {
      return
    }

    try {
      await this.request('close')
    } catch {
      this.rejectPending(new DbClientError('The database connection was closed.'))
    } finally {
      this.worker?.terminate()
      this.worker = null
      this.initPromise = null
      this.initResult = null
      this.rejectPending(new DbClientError('The database connection was closed.'))
    }
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) {
      return this.worker
    }

    let worker: WorkerLike

    try {
      worker = this.createWorker()
    } catch (error) {
      throw error instanceof Error
        ? new DbClientError(error.message)
        : new DbClientError('The database worker could not be created.')
    }

    worker.onmessage = (event) => {
      this.handleMessage(event.data)
    }
    worker.onerror = (event) => {
      this.handleCrash(
        new DbClientError(event.message || 'The database worker crashed.'),
      )
    }
    worker.onmessageerror = () => {
      this.handleCrash(
        new DbClientError('The database worker sent an unreadable message.'),
      )
    }

    this.worker = worker
    return worker
  }

  private handleMessage(message: unknown) {
    if (!isDbResponse(message)) {
      return
    }

    const pending = this.pending.get(message.id)

    if (!pending) {
      return
    }

    this.pending.delete(message.id)
    clearTimeout(pending.timer)

    if (message.ok) {
      pending.resolve(message.result)
    } else {
      pending.reject(deserializeError(message.error))
    }
  }

  private handleCrash(error: DbClientError) {
    this.worker?.terminate()
    this.worker = null
    this.initPromise = null
    this.initResult = null
    this.rejectPending(error)
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }

    this.pending.clear()
  }

  private request<M extends DbMethod>(
    method: M,
    params?: DbMethodMap[M]['params'],
  ): Promise<DbMethodMap[M]['result']> {
    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1

    return new Promise<DbMethodMap[M]['result']>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new DbTimeoutError(
            `The database did not answer the "${method}" request in time.`,
          ),
        )
      }, this.timeoutMs)

      this.pending.set(id, {
        resolve: (value) => {
          resolve(value as DbMethodMap[M]['result'])
        },
        reject,
        timer,
      })

      try {
        worker.postMessage({ id, method, params })
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(
          error instanceof Error
            ? new DbClientError(error.message)
            : new DbClientError('The database request could not be sent.'),
        )
      }
    })
  }
}

async function readStorageEstimate(): Promise<{
  usageBytes: number
  quotaBytes: number | null
  persistent: boolean
}> {
  let usageBytes = 0
  let quotaBytes: number | null = null
  let persistent = false

  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.()
    usageBytes = typeof estimate?.usage === 'number' ? estimate.usage : 0
    quotaBytes = typeof estimate?.quota === 'number' ? estimate.quota : null
  } catch {
    usageBytes = 0
    quotaBytes = null
  }

  try {
    persistent = (await globalThis.navigator?.storage?.persisted?.()) ?? false
  } catch {
    persistent = false
  }

  return { usageBytes, quotaBytes, persistent }
}

async function requestPersistentStorage() {
  const storage = globalThis.navigator?.storage

  if (!storage?.persisted || !storage.persist) {
    return
  }

  try {
    if (!(await storage.persisted())) {
      await storage.persist()
    }
  } catch {
    return
  }
}
