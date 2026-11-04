export interface AppInfo {
  appName: string
  appVersion: string
  platform: string
  storageType: string
  schemaVersion: number
}

export interface StorageHealth {
  ok: boolean
  schemaVersion: number
  usageBytes: number
  quotaBytes: number | null
  recordCount: number
  persistent?: boolean
  databasePath: string
  detail: string
}
