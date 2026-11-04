import type { Database } from '@sqlite.org/sqlite-wasm'

import { getDatabaseProfile } from './context.ts'
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
      profile,
      action,
      entity_type,
      entity_id,
      details,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    bind: [
      getDatabaseProfile(),
      action,
      entityType,
      entityId,
      details ? JSON.stringify(details) : null,
      nowIso(),
    ],
  })
}
