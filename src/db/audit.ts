import type { Database } from '@sqlite.org/sqlite-wasm'

import { nowIso } from './validation.ts'

export function writeAuditLog(
  db: Database,
  action: 'create' | 'update' | 'delete',
  entityType: 'customer' | 'property' | 'receipt',
  entityId: string,
  details?: Record<string, unknown>,
): void {
  db.exec({
    sql: `INSERT INTO audit_logs (
      action,
      entity_type,
      entity_id,
      details,
      created_at
    ) VALUES (?, ?, ?, ?, ?)`,
    bind: [
      action,
      entityType,
      entityId,
      details ? JSON.stringify(details) : null,
      nowIso(),
    ],
  })
}
