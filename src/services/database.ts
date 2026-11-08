import { SqliteClient } from '../db/client.ts'

let client: SqliteClient | null = null
let databaseKey: Uint8Array | null = null

export function setDatabaseKey(key: Uint8Array): void {
  databaseKey = new Uint8Array(key)

  if (client) {
    client.setKey(databaseKey)
  }
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
