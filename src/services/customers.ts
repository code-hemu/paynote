import type {
  Customer,
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
