import type {
  Customer,
  Property,
  Receipt,
} from '../db/types.ts'

import type { ReceiptStatus } from './receipt-status.ts'
import { isReceiptStatus } from './receipt-status.ts'

export const BACKUP_APP_ID = 'paynote'
export const BACKUP_FORMAT_VERSION = 1

export interface BackupManifest {
  app: typeof BACKUP_APP_ID
  formatVersion: number
  schemaVersion: number
  createdAt: string
  counts: {
    customers: number
    properties: number
    receipts: number
    settings: number
  }
}

export interface BackupSetting {
  key: string
  value: string
  updatedAt: string
}

export interface BackupSequence {
  year: number
  prefix: string
  nextNumber: number
  updatedAt: string
}

export interface BackupFile {
  manifest: BackupManifest
  customers: Customer[]
  properties: Property[]
  receipts: Receipt[]
  receiptCsv: string
  settings: BackupSetting[]
  sequences: BackupSequence[]
}

export type RestoreMode = 'merge' | 'replace'

export interface RestoreSummary {
  customers: number
  properties: number
  receipts: number
  settings: number
  mode: RestoreMode
}

export function createBackupManifest(
  schemaVersion: number,
  data: Omit<BackupFile, 'manifest'>,
  now: Date = new Date(),
): BackupManifest {
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion,
    createdAt: now.toISOString(),
    counts: {
      customers: data.customers.length,
      properties: data.properties.length,
      receipts: data.receipts.length,
      settings: data.settings.length,
    },
  }
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2)
}

export function parseBackup(text: string): BackupFile {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }

  if (!isRecord(value)) {
    throw new Error('The backup file must contain a JSON object.')
  }

  const manifest = value.manifest

  if (!isRecord(manifest)) {
    throw new Error('The backup file is missing its manifest.')
  }

  if (manifest.app !== BACKUP_APP_ID) {
    throw new Error('This file is not a PayNote backup.')
  }

  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Unsupported backup format ${String(manifest.formatVersion)}. This build supports format ${BACKUP_FORMAT_VERSION}.`,
    )
  }

  const schemaVersion = manifest.schemaVersion

  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    throw new Error('The backup manifest has an invalid schema version.')
  }

  if (typeof manifest.createdAt !== 'string') {
    throw new Error('The backup manifest is missing a creation date.')
  }

  const customers = requireArray(value.customers, 'customers')
  const properties = requireArray(value.properties, 'properties')
  const receipts = requireArray(value.receipts, 'receipts')
  const settings = requireArray(value.settings, 'settings')
  const sequences = value.sequences === undefined ? [] : requireArray(value.sequences, 'sequences')

  if (value.receiptCsv !== undefined && typeof value.receiptCsv !== 'string') {
    throw new Error('The backup receipt CSV must be text.')
  }

  customers.forEach((customer, index) => validateCustomer(customer, index))
  properties.forEach((property, index) => validateProperty(property, index))
  receipts.forEach((receipt, index) => validateReceipt(receipt, index))
  settings.forEach((setting, index) => validateSetting(setting, index))
  sequences.forEach((sequence, index) => validateSequence(sequence, index))

  return {
    manifest: {
      app: BACKUP_APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion,
      createdAt: manifest.createdAt,
      counts: readCounts(manifest.counts, {
        customers: customers.length,
        properties: properties.length,
        receipts: receipts.length,
        settings: settings.length,
      }),
    },
    customers: customers as unknown as Customer[],
    properties: properties as unknown as Property[],
    receipts: receipts as unknown as Receipt[],
    receiptCsv: (value.receiptCsv as string | undefined) ?? '',
    settings: settings as unknown as BackupSetting[],
    sequences: sequences as unknown as BackupSequence[],
  }
}

function validateCustomer(value: unknown, index: number): void {
  const record = requireRecord(value, `customers[${index}]`)
  requireString(record.id, `customers[${index}].id`)
  requireString(record.fullName, `customers[${index}].fullName`)
  requireString(record.createdAt, `customers[${index}].createdAt`)
  requireString(record.updatedAt, `customers[${index}].updatedAt`)
}

function validateProperty(value: unknown, index: number): void {
  const record = requireRecord(value, `properties[${index}]`)
  requireString(record.id, `properties[${index}].id`)
  requireString(record.name, `properties[${index}].name`)
  requireString(record.propertyType, `properties[${index}].propertyType`)
  requireString(record.createdAt, `properties[${index}].createdAt`)
  requireString(record.updatedAt, `properties[${index}].updatedAt`)
}

function validateReceipt(value: unknown, index: number): void {
  const record = requireRecord(value, `receipts[${index}]`)
  requireString(record.id, `receipts[${index}].id`)
  requireString(record.receiptNumber, `receipts[${index}].receiptNumber`)
  requireString(record.receiptType, `receipts[${index}].receiptType`)
  requireString(record.receiptDate, `receipts[${index}].receiptDate`)
  requireString(record.paymentMethod, `receipts[${index}].paymentMethod`)

  if (typeof record.amountPaise !== 'number' || !Number.isInteger(record.amountPaise) || record.amountPaise < 0) {
    throw new Error(`receipts[${index}].amountPaise must be a non-negative whole number.`)
  }

  const status = record.status ?? 'issued'

  if (!isReceiptStatus(status)) {
    throw new Error(`receipts[${index}].status is invalid.`)
  }

  if (record.details !== undefined && !Array.isArray(record.details)) {
    throw new Error(`receipts[${index}].details must be a list.`)
  }

  if (record.items !== undefined && !Array.isArray(record.items)) {
    throw new Error(`receipts[${index}].items must be a list.`)
  }
}

function validateSetting(value: unknown, index: number): void {
  const record = requireRecord(value, `settings[${index}]`)
  requireString(record.key, `settings[${index}].key`)

  if (typeof record.value !== 'string') {
    throw new Error(`settings[${index}].value must be text.`)
  }
}

function validateSequence(value: unknown, index: number): void {
  const record = requireRecord(value, `sequences[${index}]`)

  if (typeof record.year !== 'number' || !Number.isInteger(record.year)) {
    throw new Error(`sequences[${index}].year must be a whole number.`)
  }

  requireString(record.prefix, `sequences[${index}].prefix`)

  if (
    typeof record.nextNumber !== 'number' ||
    !Number.isInteger(record.nextNumber) ||
    record.nextNumber < 1
  ) {
    throw new Error(`sequences[${index}].nextNumber must be a positive whole number.`)
  }
}

export function receiptStatusFromBackup(value: unknown): ReceiptStatus {
  if (isReceiptStatus(value)) {
    return value
  }

  return 'issued'
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`The backup file is missing the "${field}" list.`)
  }

  return value
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`)
  }

  return value
}

function requireString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be non-empty text.`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCounts(
  value: unknown,
  fallback: BackupManifest['counts'],
): BackupManifest['counts'] {
  if (!isRecord(value)) {
    return fallback
  }

  return {
    customers: numberOr(value.customers, fallback.customers),
    properties: numberOr(value.properties, fallback.properties),
    receipts: numberOr(value.receipts, fallback.receipts),
    settings: numberOr(value.settings, fallback.settings),
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : fallback
}
