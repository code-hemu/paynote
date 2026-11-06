import type {
  BackupFile,
  RestoreMode,
  RestoreSummary,
} from '../domain/backup.ts'
import type { ReportSummary } from '../domain/reports.ts'
import type { DbProfile } from './profile.ts'
import type { ReportOptions } from './reports.ts'
import type { SettingRecord } from './types.ts'
import type {
  Customer,
  CustomerDetail,
  CustomerInput,
  CustomerListOptions,
  ListResult,
  Property,
  PropertyDetail,
  PropertyInput,
  PropertyListOptions,
  Receipt,
  ReceiptInput,
  ReceiptListOptions,
  ReceiptSummary,
} from './types.ts'

export interface DbErrorPayload {
  name: string
  code: string
  message: string
}

export interface DatabaseInfo {
  schemaVersion: number
  recordCount: number
  databasePath: string
  storageType: string
}

export type DbInitResult = DatabaseInfo
export type DbHealthResult = DatabaseInfo

const DB_METHODS = [
  'init',
  'health',
  'close',
  'customers.list',
  'customers.get',
  'customers.detail',
  'customers.nameTaken',
  'customers.create',
  'customers.update',
  'customers.delete',
  'properties.list',
  'properties.get',
  'properties.detail',
  'properties.create',
  'properties.update',
  'properties.delete',
  'receipts.list',
  'receipts.get',
  'receipts.create',
  'receipts.update',
  'receipts.delete',
  'settings.list',
  'settings.set',
  'reports.summary',
  'backup.export',
  'backup.restore',
  'backup.deleteAll',
] as const

export type DbMethod = (typeof DB_METHODS)[number]

export interface DbMethodMap {
  init: {
    params: { profile?: DbProfile; key?: Uint8Array } | undefined
    result: DbInitResult
  }
  health: { params: undefined; result: DbHealthResult }
  close: { params: undefined; result: null }
  'customers.list': {
    params: CustomerListOptions | undefined
    result: ListResult<Customer>
  }
  'customers.get': { params: { id: string }; result: Customer }
  'customers.detail': { params: { id: string }; result: CustomerDetail }
  'customers.nameTaken': {
    params: { name: string; excludeId?: string | null }
    result: boolean
  }
  'customers.create': { params: CustomerInput; result: Customer }
  'customers.update': {
    params: { id: string; input: CustomerInput }
    result: Customer
  }
  'customers.delete': { params: { id: string }; result: null }
  'properties.list': {
    params: PropertyListOptions | undefined
    result: ListResult<Property>
  }
  'properties.get': { params: { id: string }; result: Property }
  'properties.detail': { params: { id: string }; result: PropertyDetail }
  'properties.create': { params: PropertyInput; result: Property }
  'properties.update': {
    params: { id: string; input: PropertyInput }
    result: Property
  }
  'properties.delete': { params: { id: string }; result: null }
  'receipts.list': {
    params: ReceiptListOptions | undefined
    result: ListResult<ReceiptSummary>
  }
  'receipts.get': { params: { id: string }; result: Receipt }
  'receipts.create': { params: ReceiptInput; result: Receipt }
  'receipts.update': {
    params: { id: string; input: ReceiptInput }
    result: Receipt
  }
  'receipts.delete': { params: { id: string }; result: null }
  'settings.list': { params: undefined; result: SettingRecord[] }
  'settings.set': {
    params: { values: Record<string, string> }
    result: SettingRecord[]
  }
  'reports.summary': {
    params: ReportOptions | undefined
    result: ReportSummary
  }
  'backup.export': { params: undefined; result: BackupFile }
  'backup.restore': {
    params: { backup: BackupFile; mode: RestoreMode }
    result: RestoreSummary
  },
  'backup.deleteAll': {
    params: undefined
    result: null
  }
}

export type DbRequest<M extends DbMethod = DbMethod> = {
  [K in M]: {
    id: number
    method: K
    params?: DbMethodMap[K]['params']
  }
}[M]

export type DbResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: DbErrorPayload }

export function isDbRequest(value: unknown): value is DbRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const request = value as Record<string, unknown>
  return (
    Number.isInteger(request.id) &&
    typeof request.method === 'string' &&
    (DB_METHODS as readonly string[]).includes(request.method)
  )
}

export function isDbResponse(value: unknown): value is DbResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Record<string, unknown>
  return Number.isInteger(response.id) && typeof response.ok === 'boolean'
}
