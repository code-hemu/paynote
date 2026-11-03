import { SqliteClient } from '../db/client.ts'

let client: SqliteClient | null = null

export function getDatabaseClient(): SqliteClient {
  client ??= new SqliteClient()
  return client
}
