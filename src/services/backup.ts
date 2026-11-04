import type {
  BackupFile,
  RestoreMode,
  RestoreSummary,
} from '../domain/backup.ts'
import { getDatabaseClient } from './database.ts'

export function exportBackup(): Promise<BackupFile> {
  return getDatabaseClient().exportBackup()
}

export function restoreBackup(
  backup: BackupFile,
  mode: RestoreMode,
): Promise<RestoreSummary> {
  return getDatabaseClient().restoreBackup(backup, mode)
}

export function deleteAllData(): Promise<null> {
  return getDatabaseClient().deleteAllData()
}
