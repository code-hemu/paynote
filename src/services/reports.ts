import type { ReportSummary } from '../domain/reports.ts'
import type { ReportOptions } from '../db/reports.ts'
import { getDatabaseClient } from './database.ts'

export function getReportSummary(
  options?: ReportOptions,
): Promise<ReportSummary> {
  return getDatabaseClient().getReportSummary(options)
}
