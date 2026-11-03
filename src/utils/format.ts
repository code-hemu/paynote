const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—'
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }

  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const unit = BYTE_UNITS[unitIndex] ?? 'B'
  const precision = value >= 10 ? 0 : 1
  return `${value.toFixed(precision)} ${unit}`
}

export function formatSchemaVersion(version: number): string {
  return `v${version}`
}
