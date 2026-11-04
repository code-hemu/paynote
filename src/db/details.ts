import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm'

import { getDatabaseProfile } from './context.ts'
import { getCustomer } from './customers.ts'
import { getProperty } from './properties.ts'
import { listReceipts } from './receipts.ts'
import { rowNumber, rowText, toNumber } from './rows.ts'
import type {
  CustomerDetail,
  PropertyCustomerSummary,
  PropertyDetail,
} from './types.ts'

const RECENT_RECEIPT_LIMIT = 5

export function getCustomerDetail(db: Database, id: string): CustomerDetail {
  const customer = getCustomer(db, id)
  const summary =
    db.selectObject(
      `SELECT COUNT(*) AS receipt_count,
              COALESCE(SUM(amount_paise), 0) AS total_paise
       FROM receipts
       WHERE customer_id = ? AND profile = ?`,
      [customer.id, getDatabaseProfile()],
    ) ?? {}
  const recent = listReceipts(db, {
    customerId: customer.id,
    limit: RECENT_RECEIPT_LIMIT,
    offset: 0,
  })

  return {
    customer,
    receiptCount: rowNumber(summary, 'receipt_count'),
    totalPaise: rowNumber(summary, 'total_paise'),
    recentReceipts: recent.items,
  }
}

export function getPropertyDetail(db: Database, id: string): PropertyDetail {
  const property = getProperty(db, id)
  const summary =
    db.selectObject(
      `SELECT COUNT(*) AS receipt_count,
              COALESCE(SUM(amount_paise), 0) AS total_paise
       FROM receipts
       WHERE property_id = ? AND profile = ?`,
      [property.id, getDatabaseProfile()],
    ) ?? {}
  const customers = db.selectObjects(
    `SELECT c.id AS id,
            c.full_name AS full_name,
            COUNT(r.id) AS receipt_count,
            COALESCE(SUM(r.amount_paise), 0) AS total_paise
     FROM receipts r
     JOIN customers c ON c.id = r.customer_id AND c.profile = r.profile
     WHERE r.property_id = ? AND r.profile = ?
     GROUP BY c.id, c.full_name
     ORDER BY c.full_name COLLATE NOCASE ASC`,
    [property.id, getDatabaseProfile()],
  )
  const recent = listReceipts(db, {
    propertyId: property.id,
    limit: RECENT_RECEIPT_LIMIT,
    offset: 0,
  })

  return {
    property,
    receiptCount: rowNumber(summary, 'receipt_count'),
    totalPaise: rowNumber(summary, 'total_paise'),
    customers: customers.map(mapCustomerSummary),
    recentReceipts: recent.items,
  }
}

function mapCustomerSummary(
  row: Record<string, SqlValue>,
): PropertyCustomerSummary {
  return {
    id: rowText(row, 'id'),
    fullName: rowText(row, 'full_name'),
    receiptCount: toNumber(row.receipt_count),
    totalPaise: toNumber(row.total_paise),
  }
}
