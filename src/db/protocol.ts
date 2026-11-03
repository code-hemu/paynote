import type {
  Customer,
  CustomerInput,
  CustomerListOptions,
  ListResult,
  Property,
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
  'customers.create',
  'customers.update',
  'customers.delete',
  'properties.list',
  'properties.get',
  'properties.create',
  'properties.update',
  'properties.delete',
  'receipts.list',
  'receipts.get',
  'receipts.create',
  'receipts.update',
  'receipts.delete',
] as const

export type DbMethod = (typeof DB_METHODS)[number]

export interface DbMethodMap {
  init: { params: undefined; result: DbInitResult }
  health: { params: undefined; result: DbHealthResult }
  close: { params: undefined; result: null }
  'customers.list': {
    params: CustomerListOptions | undefined
    result: ListResult<Customer>
  }
  'customers.get': { params: { id: string }; result: Customer }
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
