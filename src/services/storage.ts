import { SqliteClient } from '../db/client.ts'
import { DATABASE_FILE, STORAGE_TYPE } from '../db/constants.ts'
import { DbError } from '../db/errors.ts'
import { LATEST_SCHEMA_VERSION } from '../db/migrations.ts'
import type { AppInfo, StorageHealth } from '../types/system.ts'

export const STORAGE_LOCATION = DATABASE_FILE

let client: SqliteClient | null = null

function getClient(): SqliteClient {
  client ??= new SqliteClient()
  return client
}

export function getAppInfo(): AppInfo {
  return {
    appName: 'PayNote',
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0',
    platform: navigator.platform || 'Web browser',
    storageType: STORAGE_TYPE,
    schemaVersion: LATEST_SCHEMA_VERSION,
  }
}

export async function getStorageHealth(): Promise<StorageHealth> {
  try {
    const health = await getClient().health()

    return {
      ok: true,
      schemaVersion: health.schemaVersion,
      usageBytes: health.usageBytes,
      quotaBytes: health.quotaBytes,
      recordCount: health.recordCount,
      persistent: health.persistent,
      detail: health.persistent
        ? 'Records are saved in the browser private file system on this device.'
        : 'Records are saved, but this browser may evict them. Enable persistent storage to reduce that risk.',
    }
  } catch (error) {
    return {
      ok: false,
      schemaVersion: LATEST_SCHEMA_VERSION,
      usageBytes: 0,
      quotaBytes: null,
      recordCount: 0,
      persistent: false,
      detail:
        error instanceof DbError || error instanceof Error
          ? error.message
          : 'The SQLite workspace could not be opened.',
    }
  }
}
