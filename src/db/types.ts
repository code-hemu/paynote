export const PROPERTY_TYPES = ['house', 'godown', 'shop', 'other'] as const

export type PropertyType = (typeof PROPERTY_TYPES)[number]

export type SortDirection = 'asc' | 'desc'
export type CustomerSortField = 'name' | 'createdAt' | 'updatedAt'

export interface PageOptions {
  limit?: number
  offset?: number
}

export interface ListResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface Customer {
  id: string
  fullName: string
  phone: string
  email: string | null
  address: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerInput {
  fullName: string
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

export interface CustomerListOptions extends PageOptions {
  search?: string | null
  sortBy?: CustomerSortField | null
  sortDirection?: SortDirection | null
}

export interface Property {
  id: string
  name: string
  propertyType: PropertyType
  propertyNumber: string | null
  address: string | null
  description: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PropertyInput {
  name: string
  propertyType: PropertyType
  propertyNumber?: string | null
  address?: string | null
  description?: string | null
  notes?: string | null
}

export interface PropertyListOptions extends PageOptions {
  search?: string | null
  propertyType?: PropertyType | null
}

export interface ReceiptDetail {
  fieldKey: string
  fieldValue: string
}

interface ReceiptDetailInput {
  fieldKey: string
  fieldValue: string
}

export interface ReceiptSummary {
  id: string
  receiptNumber: string
  receiptType: string
  customerId: string | null
  customerName: string | null
  propertyId: string | null
  propertyName: string | null
  receiptDate: string
  paymentPeriod: string | null
  amountPaise: number
  paymentMethod: string
  referenceNumber: string | null
  description: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Receipt extends ReceiptSummary {
  details: ReceiptDetail[]
}

export interface ReceiptInput {
  receiptType: string
  customerId?: string | null
  propertyId?: string | null
  receiptDate?: string | null
  paymentPeriod?: string | null
  amountPaise: number
  paymentMethod: string
  referenceNumber?: string | null
  description?: string | null
  notes?: string | null
  details?: ReceiptDetailInput[]
}

export interface ReceiptListOptions extends PageOptions {
  search?: string | null
  receiptType?: string | null
  customerId?: string | null
  propertyId?: string | null
  fromDate?: string | null
  toDate?: string | null
}
