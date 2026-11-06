import type { DbProfile } from './profile.ts'

export interface DatabaseConfig {
  profile: DbProfile
  label: string
  file: string
  directory: string
  vfs: string
  lock: string
}

export const DATABASE_FILE = '/paynote.sqlite3'
export const DATABASE_DIRECTORY = '/paynote'
export const DATABASE_VFS = 'paynote-opfs'
export const DATABASE_LOCK = 'paynote-database'
export const DATABASE_WORKER_FILE = 'sqlite.worker.js'
export const SECURE_DATABASE_NAME = 'paynote-secure'
export const SECURE_DATABASE_STORE = 'database'
export const SECURE_DATABASE_KEY = 'main'
export const SECURE_DATABASE_PATH = 'IndexedDB · paynote-secure/database'
export const STORAGE_TYPE = 'SQLite WASM + AES-256-GCM (IndexedDB)'

const DATABASE_CONFIGS: Record<DbProfile, DatabaseConfig> = {
  business: {
    profile: 'business',
    label: 'Business',
    file: DATABASE_FILE,
    directory: DATABASE_DIRECTORY,
    vfs: DATABASE_VFS,
    lock: DATABASE_LOCK,
  },
  individual: {
    profile: 'individual',
    label: 'Individual',
    file: DATABASE_FILE,
    directory: DATABASE_DIRECTORY,
    vfs: DATABASE_VFS,
    lock: DATABASE_LOCK,
  },
}

export function databaseConfigFor(profile: DbProfile): DatabaseConfig {
  return DATABASE_CONFIGS[profile]
}
