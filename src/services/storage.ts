import { SECURE_DATABASE_PATH, STORAGE_TYPE } from '../db/constants.ts'
import { DbError } from '../db/errors.ts'
import { LATEST_SCHEMA_VERSION } from '../db/migrations.ts'
import type { AppInfo, StorageHealth } from '../types/system.ts'
import { getDatabaseClient } from './database.ts'

export function getStorageLocation(): string {
  return SECURE_DATABASE_PATH
}

export const STORAGE_LOCATION = getStorageLocation()

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
    const health = await getDatabaseClient().health()

    return {
      ok: true,
      schemaVersion: health.schemaVersion,
      usageBytes: health.usageBytes,
      quotaBytes: health.quotaBytes,
      recordCount: health.recordCount,
      persistent: health.persistent,
      databasePath: health.databasePath,
      detail: health.persistent
        ? 'Records are saved in an encrypted database on this device.'
        : 'Records are encrypted, but this browser may evict them. Enable persistent storage to reduce that risk.',
    }
  } catch (error) {
    return {
      ok: false,
      schemaVersion: LATEST_SCHEMA_VERSION,
      usageBytes: 0,
      quotaBytes: null,
      recordCount: 0,
      persistent: false,
      databasePath: getStorageLocation(),
      detail:
        error instanceof DbError || error instanceof Error
          ? error.message
          : 'The SQLite workspace could not be opened.',
    }
  }
}
