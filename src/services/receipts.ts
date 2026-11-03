import type {
  ListResult,
  Receipt,
  ReceiptInput,
  ReceiptListOptions,
  ReceiptSummary,
} from '../db/types.ts'
import { getDatabaseClient } from './database.ts'

export type ReceiptLoader = (
  options?: ReceiptListOptions,
) => Promise<ListResult<ReceiptSummary>>

export function listReceipts(
  options?: ReceiptListOptions,
): Promise<ListResult<ReceiptSummary>> {
  return getDatabaseClient().listReceipts(options)
}

export function getReceipt(id: string): Promise<Receipt> {
  return getDatabaseClient().getReceipt(id)
}

export function createReceipt(input: ReceiptInput): Promise<Receipt> {
  return getDatabaseClient().createReceipt(input)
}

export function updateReceipt(
  id: string,
  input: ReceiptInput,
): Promise<Receipt> {
  return getDatabaseClient().updateReceipt(id, input)
}

export function deleteReceipt(id: string): Promise<void> {
  return getDatabaseClient().deleteReceipt(id)
}
