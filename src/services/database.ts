import { DATABASE_DIRECTORY } from '../db/constants.ts'
import { SqliteClient } from '../db/client.ts'

import { deleteStoredDatabase } from './encrypted-store.ts'

let client: SqliteClient | null = null
let databaseKey: Uint8Array | null = null

export function setDatabaseKey(key: Uint8Array): void {
  databaseKey = new Uint8Array(key)

  if (client) {
    client.setKey(databaseKey)
  }
}

export function clearDatabaseKey(): void {
  databaseKey = null
  client?.setKey(null)
}

export function getDatabaseClient(): SqliteClient {
  if (!client) {
    client = new SqliteClient({ key: databaseKey ?? undefined })
  } else if (databaseKey) {
    client.setKey(databaseKey)
  }

  return client
}

export async function closeDatabase(): Promise<void> {
  const current = client
  client = null
  databaseKey = null

  if (current) {
    await current.close()
  }
}

export async function eraseDatabaseStorage(): Promise<void> {
  await closeDatabase()
  await deleteStoredDatabase()
  await deleteLegacyOpfsDirectory()
}

async function deleteLegacyOpfsDirectory(): Promise<void> {
  const storage = globalThis.navigator?.storage

  if (!storage?.getDirectory) {
    return
  }

  try {
    const root = await storage.getDirectory()
    await root.removeEntry(DATABASE_DIRECTORY.replace(/^\/+/, ''), {
      recursive: true,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return
    }

    throw error
  }
}
