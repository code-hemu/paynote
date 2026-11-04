import { describe, expect, it } from '@guchho/test'

import { SqliteClient, type WorkerLike } from './client.ts'
import { DbClientError } from './errors.ts'
import type { DatabaseInfo, DbRequest } from './protocol.ts'

const DATABASE_INFO: DatabaseInfo = {
  schemaVersion: 1,
  recordCount: 0,
  databasePath: '/paynote.sqlite3',
  storageType: 'SQLite WASM + OPFS',
}

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null
  readonly messages: DbRequest[] = []
  terminated = false

  postMessage(message: unknown) {
    this.messages.push(message as DbRequest)
  }

  terminate() {
    this.terminated = true
  }

  respond(id: number, result: unknown) {
    this.onmessage?.({
      data: { id, ok: true, result },
    } as MessageEvent<unknown>)
  }

  crash(message: string) {
    this.onerror?.({ message } as ErrorEvent)
  }
}

async function waitForMessages(worker: FakeWorker, count: number) {
  for (let attempt = 0; attempt < 50 && worker.messages.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function initializeClient(client: SqliteClient, worker: FakeWorker) {
  const init = client.init()
  worker.respond(worker.messages[0]?.id ?? 0, DATABASE_INFO)
  await init
  worker.messages.length = 0
}

describe('SQLite client', () => {
  it('initializes once and caches the database info', async () => {
    const worker = new FakeWorker()
    const client = new SqliteClient({ createWorker: () => worker })
    const init = client.init()
    const request = worker.messages[0]

    expect(request?.method).toBe('init')
    expect(request?.params).toEqual({ profile: 'business' })
    worker.respond(request?.id ?? 0, DATABASE_INFO)

    expect(await init).toEqual(DATABASE_INFO)
    expect(await client.init()).toEqual(DATABASE_INFO)
    expect(worker.messages).toHaveLength(1)
  })

  it('opens the database for the requested profile', async () => {
    const worker = new FakeWorker()
    const client = new SqliteClient({
      createWorker: () => worker,
      profile: 'individual',
    })
    const init = client.init()

    expect(worker.messages[0]?.params).toEqual({ profile: 'individual' })
    worker.respond(worker.messages[0]?.id ?? 0, DATABASE_INFO)

    expect((await init).databasePath).toBe('/paynote.sqlite3')
    expect(client.getProfile()).toBe('individual')
  })

  it('switches profiles on the existing worker without closing it', async () => {
    const worker = new FakeWorker()
    const client = new SqliteClient({ createWorker: () => worker })
    await initializeClient(client, worker)

    const switching = client.switchProfile('individual')
    await waitForMessages(worker, 1)

    const switchRequest = worker.messages[0]
    expect(switchRequest?.method).toBe('init')
    expect(switchRequest?.params).toEqual({ profile: 'individual' })
    worker.respond(switchRequest?.id ?? 0, DATABASE_INFO)

    expect(await switching).toEqual(DATABASE_INFO)
    expect(client.getProfile()).toBe('individual')
    expect(worker.terminated).toBe(false)

    const list = client.listCustomers()
    await waitForMessages(worker, 2)
    expect(worker.messages[1]?.method).toBe('customers.list')
    worker.respond(worker.messages[1]?.id ?? 0, {
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    })
    await list
  })

  it('combines database health with browser storage estimates', async () => {
    const worker = new FakeWorker()
    const client = new SqliteClient({ createWorker: () => worker })
    const health = client.health()
    const initRequest = worker.messages[0]

    worker.respond(initRequest?.id ?? 0, DATABASE_INFO)
    await waitForMessages(worker, 2)

    const healthRequest = worker.messages[1]
    expect(healthRequest?.method).toBe('health')
    worker.respond(healthRequest?.id ?? 0, DATABASE_INFO)

    expect(await health).toEqual({
      ...DATABASE_INFO,
      usageBytes: 0,
      quotaBytes: 1024 * 1024,
      persistent: false,
    })
  })

  it('closes the worker after the close request', async () => {
    const worker = new FakeWorker()
    const client = new SqliteClient({ createWorker: () => worker })
    const init = client.init()

    worker.respond(worker.messages[0]?.id ?? 0, DATABASE_INFO)
    await init

    const close = client.close()
    await waitForMessages(worker, 2)

    const closeRequest = worker.messages[1]
    expect(closeRequest?.method).toBe('close')
    worker.respond(closeRequest?.id ?? 0, null)

    await close
    expect(worker.terminated).toBe(true)
  })

  it('sends typed CRUD requests', async () => {
    const worker = new FakeWorker()
    const client = new SqliteClient({ createWorker: () => worker })
    await initializeClient(client, worker)
    const customer = {
      id: 'customer-1',
      fullName: 'Asha Rao',
      phone: '9876543210',
      email: null,
      address: null,
      notes: null,
      createdAt: '2026-11-03T00:00:00.000Z',
      updatedAt: '2026-11-03T00:00:00.000Z',
    }

    const create = client.createCustomer({ fullName: 'Asha Rao' })
    await waitForMessages(worker, 1)
    const createRequest = worker.messages[0]
    expect(createRequest?.method).toBe('customers.create')
    expect(createRequest?.params).toEqual({ fullName: 'Asha Rao' })
    worker.respond(createRequest?.id ?? 0, customer)
    expect(await create).toEqual(customer)

    const list = client.listReceipts({ limit: 10 })
    await waitForMessages(worker, 2)
    const listRequest = worker.messages[1]
    expect(listRequest?.method).toBe('receipts.list')
    expect(listRequest?.params).toEqual({ limit: 10 })
    worker.respond(listRequest?.id ?? 0, {
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    })
    expect(await list).toEqual({ items: [], total: 0, limit: 10, offset: 0 })

    const remove = client.deleteCustomer('customer-1')
    await waitForMessages(worker, 3)
    const removeRequest = worker.messages[2]
    expect(removeRequest?.method).toBe('customers.delete')
    expect(removeRequest?.params).toEqual({ id: 'customer-1' })
    worker.respond(removeRequest?.id ?? 0, null)
    await remove
  })

  it('rejects pending requests when the worker crashes', async () => {
    const worker = new FakeWorker()
    const client = new SqliteClient({ createWorker: () => worker })
    const init = client.init()

    worker.crash('Worker failed')

    let error: unknown

    try {
      await init
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(DbClientError)
    expect(worker.terminated).toBe(true)
  })
})
