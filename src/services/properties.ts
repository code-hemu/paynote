import type {
  ListResult,
  Property,
  PropertyDetail,
  PropertyInput,
  PropertyListOptions,
} from '../db/types.ts'
import { getDatabaseClient } from './database.ts'

export type PropertyLoader = (
  options?: PropertyListOptions,
) => Promise<ListResult<Property>>

export function listProperties(
  options?: PropertyListOptions,
): Promise<ListResult<Property>> {
  return getDatabaseClient().listProperties(options)
}

export function getProperty(id: string): Promise<Property> {
  return getDatabaseClient().getProperty(id)
}

export function getPropertyDetail(id: string): Promise<PropertyDetail> {
  return getDatabaseClient().getPropertyDetail(id)
}

export function createProperty(input: PropertyInput): Promise<Property> {
  return getDatabaseClient().createProperty(input)
}

export function updateProperty(
  id: string,
  input: PropertyInput,
): Promise<Property> {
  return getDatabaseClient().updateProperty(id, input)
}

export function deleteProperty(id: string): Promise<void> {
  return getDatabaseClient().deleteProperty(id)
}
