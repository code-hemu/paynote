import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm'

import type { SettingRecord } from './types.ts'
import {
  nowIso,
  requireText,
} from './validation.ts'
import { rowText } from './rows.ts'

const MAX_VALUE_LENGTH = 5000

export function listSettings(db: Database): SettingRecord[] {
  return db
    .selectObjects('SELECT key, value, updated_at FROM settings ORDER BY key ASC')
    .map(mapSetting)
}

export function readSettings(db: Database): Record<string, string> {
  const settings: Record<string, string> = {}

  for (const setting of listSettings(db)) {
    settings[setting.key] = setting.value
  }

  return settings
}

export function getSetting(db: Database, key: string): string | null {
  const settingKey = requireText(key, 'Setting key', 100)
  const row = db.selectObject('SELECT value FROM settings WHERE key = ?', [
    settingKey,
  ])

  return row ? rowText(row, 'value') : null
}

export function setSetting(db: Database, key: string, value: string): void {
  const settingKey = requireText(key, 'Setting key', 100)

  if (typeof value !== 'string') {
    throw new Error('Setting value must be text.')
  }

  if (value.length > MAX_VALUE_LENGTH) {
    throw new Error(`Setting values must be ${MAX_VALUE_LENGTH} characters or fewer.`)
  }

  const updatedAt = nowIso()

  db.exec(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    { bind: [settingKey, value, updatedAt] },
  )

  if (settingKey === 'receipt.prefix' && value.trim() !== '') {
    db.exec(
      'UPDATE receipt_sequences SET prefix = ?, updated_at = ?',
      { bind: [value.trim(), updatedAt] },
    )
  }
}

export function setSettings(
  db: Database,
  values: Record<string, string>,
): void {
  db.transaction('IMMEDIATE', () => {
    for (const [key, value] of Object.entries(values)) {
      setSetting(db, key, value)
    }
  })
}

function mapSetting(row: Record<string, SqlValue>): SettingRecord {
  return {
    key: rowText(row, 'key'),
    value: rowText(row, 'value'),
    updatedAt: rowText(row, 'updated_at'),
  }
}
