const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const

function underHundred(value: number): string {
  if (value < 20) {
    return ONES[value] ?? 'Zero'
  }

  const tens = Math.floor(value / 10)
  const ones = value % 10
  const tensWord = TENS[tens] ?? ''

  return ones === 0 ? tensWord : `${tensWord} ${ONES[ones] ?? ''}`.trim()
}

function underThousand(value: number): string {
  const hundreds = Math.floor(value / 100)
  const remainder = value % 100
  const parts: string[] = []

  if (hundreds > 0) {
    parts.push(`${ONES[hundreds] ?? ''} Hundred`)
  }

  if (remainder > 0) {
    parts.push(underHundred(remainder))
  }

  return parts.join(' ')
}

export function numberToWords(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return 'Zero'
  }

  let remaining = Math.floor(value)

  if (remaining === 0) {
    return 'Zero'
  }

  const parts: string[] = []
  const groups: Array<[number, string]> = [
    [10_000_000, 'Crore'],
    [100_000, 'Lakh'],
    [1_000, 'Thousand'],
  ]

  for (const [size, label] of groups) {
    const count = Math.floor(remaining / size)

    if (count > 0) {
      parts.push(`${underThousand(count)} ${label}`)
      remaining %= size
    }
  }

  if (remaining > 0) {
    parts.push(underThousand(remaining))
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function amountInWords(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) {
    return 'Zero Rupees Only'
  }

  const rounded = Math.round(paise)
  const rupees = Math.floor(rounded / 100)
  const fraction = rounded % 100
  const parts = [`${numberToWords(rupees)} Rupees`]

  if (fraction > 0) {
    parts.push(`${numberToWords(fraction)} Paise`)
  }

  return `${parts.join(' and ')} Only`
}
