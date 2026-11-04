export const DEFAULT_RECEIPT_NUMBER_FORMAT = '{PREFIX}-{YYYY}-{0000}'

export interface ReceiptNumberParts {
  prefix: string
  year: number
  sequence: number
}

export function formatReceiptNumber(
  template: string,
  parts: ReceiptNumberParts,
): string {
  const format = template.trim() || DEFAULT_RECEIPT_NUMBER_FORMAT
  const year = String(parts.year)

  return format
    .replace(/\{PREFIX\}/gi, parts.prefix)
    .replace(/\{YYYY\}/gi, year)
    .replace(/\{YY\}/gi, year.slice(-2))
    .replace(/\{(0+)\}/g, (_match, padding: string) =>
      String(parts.sequence).padStart(padding.length, '0'),
    )
}
