import { describe, expect, it } from '@guchho/test'

import { escapeCsv, timestampedFilename, toCsv } from './csv.ts'

describe('CSV utilities', () => {
  it('escapes commas, quotes, and line breaks', () => {
    expect(escapeCsv('plain')).toBe('plain')
    expect(escapeCsv(null)).toBe('')
    expect(escapeCsv(42)).toBe('42')
    expect(escapeCsv('a,b')).toBe('"a,b"')
    expect(escapeCsv('a"b')).toBe('"a""b"')
    expect(escapeCsv('a\nb')).toBe('"a\nb"')
  })

  it('builds CRLF-delimited CSV with a trailing newline', () => {
    expect(
      toCsv(
        ['Name', 'Amount'],
        [
          ['Asha, Rao', 100],
          ['Ravi', null],
        ],
      ),
    ).toBe('Name,Amount\r\n"Asha, Rao",100\r\nRavi,\r\n')
  })

  it('names downloads with a local date and time', () => {
    expect(
      timestampedFilename(
        'paynote-backup',
        'json',
        new Date(2026, 10, 3, 9, 7),
      ),
    ).toBe('paynote-backup-2026-11-03-0907.json')
  })
})
