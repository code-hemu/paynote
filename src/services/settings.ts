import type { SettingRecord } from '../db/types.ts'
import { getDatabaseClient } from './database.ts'

function listSettings(): Promise<SettingRecord[]> {
  return getDatabaseClient().listSettings()
}

export function setSettings(
  values: Record<string, string>,
): Promise<SettingRecord[]> {
  return getDatabaseClient().setSettings(values)
}

export async function readSettings(): Promise<Record<string, string>> {
  const settings: Record<string, string> = {}

  for (const setting of await listSettings()) {
    settings[setting.key] = setting.value
  }

  return settings
}
