const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const

export interface FormatPreferences {
  currency: string
  locale: string
  dateFormat: string
  timeZone: string
}

const DEFAULT_FORMAT_PREFERENCES: FormatPreferences = {
  currency: 'INR',
  locale: 'en-IN',
  dateFormat: 'DD MMM YYYY',
  timeZone: 'UTC',
}

let currentPreferences: FormatPreferences = { ...DEFAULT_FORMAT_PREFERENCES }

export function setFormatPreferences(
  preferences: Partial<FormatPreferences>,
): void {
  currentPreferences = { ...currentPreferences, ...preferences }
}

export function getFormatPreferences(): FormatPreferences {
  return { ...currentPreferences }
}

export function resetFormatPreferences(): void {
  currentPreferences = { ...DEFAULT_FORMAT_PREFERENCES }
}

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

export function formatCurrency(
  paise: number,
  options: Partial<FormatPreferences> = {},
): string {
  if (!Number.isFinite(paise)) {
    return '—'
  }

  const currency = options.currency || currentPreferences.currency
  const locale = options.locale || currentPreferences.locale

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(paise / 100)
  } catch {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(paise / 100)
  }
}

export function formatLabel(value: string): string {
  if (!value) {
    return '—'
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function formatDate(
  value: string,
  options: Partial<FormatPreferences> = {},
): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  const pattern = options.dateFormat || currentPreferences.dateFormat
  const locale = options.locale || currentPreferences.locale
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const timeZone = dateOnly
    ? 'UTC'
    : options.timeZone || currentPreferences.timeZone

  try {
    return formatDatePattern(date, pattern, locale, timeZone)
  } catch {
    return new Intl.DateTimeFormat(locale === 'en-IN' ? 'en-GB' : locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date)
  }
}

function formatDatePattern(
  date: Date,
  pattern: string,
  locale: string,
  timeZone: string,
): string {
  if (pattern === 'DD MMM YYYY' || pattern === 'D MMM YYYY') {
    const formatter = new Intl.DateTimeFormat(locale, {
      day: pattern === 'DD MMM YYYY' ? '2-digit' : 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone,
    })
    const parts = formatter.formatToParts(date)
    const day = parts.find((part) => part.type === 'day')?.value ?? ''
    const month = parts.find((part) => part.type === 'month')?.value ?? ''
    const year = parts.find((part) => part.type === 'year')?.value ?? ''
    return `${day} ${month} ${year}`.trim()
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  })
  const parts = formatter.formatToParts(date)
  const day = parts.find((part) => part.type === 'day')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const year = parts.find((part) => part.type === 'year')?.value ?? ''

  if (pattern === 'MM/DD/YYYY') {
    return `${month}/${day}/${year}`
  }

  if (pattern === 'YYYY-MM-DD') {
    return `${year}-${month}-${day}`
  }

  return `${day}/${month}/${year}`
}
