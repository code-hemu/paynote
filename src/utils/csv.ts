export type CsvValue = string | number | null | undefined

export function escapeCsv(value: CsvValue): string {
  const text = value === null || value === undefined ? '' : String(value)

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeCsv).join(',')]

  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','))
  }

  return `${lines.join('\r\n')}\r\n`
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'application/octet-stream',
): void {
  const doc = globalThis.document

  if (!doc || typeof URL.createObjectURL !== 'function') {
    return
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = doc.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  doc.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function timestampedFilename(
  base: string,
  extension: string,
  now: Date = new Date(),
): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${base}-${stamp}.${extension}`
}
