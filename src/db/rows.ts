import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type Row = Record<string, SqlValue>

export function rowText(row: Row, key: string): string {
  const value = row[key]
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value)
}

export function rowNullableText(row: Row, key: string): string | null {
  const value = row[key]
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? null
      : String(value)
}

export function rowNumber(row: Row, key: string): number {
  return toNumber(row[key])
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }

  return Number(typeof value === 'bigint' ? value : value ?? 0)
}
