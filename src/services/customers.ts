import type {
  Customer,
  CustomerDetail,
  CustomerInput,
  CustomerListOptions,
  ListResult,
} from '../db/types.ts'
import { getDatabaseClient } from './database.ts'

export type CustomerLoader = (
  options?: CustomerListOptions,
) => Promise<ListResult<Customer>>

export function listCustomers(
  options?: CustomerListOptions,
): Promise<ListResult<Customer>> {
  return getDatabaseClient().listCustomers(options)
}

export function getCustomer(id: string): Promise<Customer> {
  return getDatabaseClient().getCustomer(id)
}

export function getCustomerDetail(id: string): Promise<CustomerDetail> {
  return getDatabaseClient().getCustomerDetail(id)
}

export function isCustomerNameTaken(
  name: string,
  excludeId?: string | null,
): Promise<boolean> {
  return getDatabaseClient().isCustomerNameTaken(name, excludeId)
}

export function createCustomer(input: CustomerInput): Promise<Customer> {
  return getDatabaseClient().createCustomer(input)
}

export function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<Customer> {
  return getDatabaseClient().updateCustomer(id, input)
}

export function deleteCustomer(id: string): Promise<void> {
  return getDatabaseClient().deleteCustomer(id)
}
