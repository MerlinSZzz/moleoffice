// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type Database from 'better-sqlite3'

/** Copy the original starter into the new owner column only as the column is introduced. */
export interface Report { ran: boolean; rowsWritten: number }

/** The import applies this same rule only to newly inserted old archive rows. */
export const AGENT_OWNER_BACKFILL = "UPDATE agents SET owner_id = started_by_id, owner_kind = started_by_kind WHERE started_by_kind IN ('agent', 'person') AND started_by_id IS NOT NULL AND owner_id IS NULL AND owner_kind IS NULL"

export function setTheOldAgentsOwners(sqlite: Database.Database, applied: readonly string[]): Report {
  if (!applied.includes('0348_an_agent_keeps_its_owner_apart')) return { ran: false, rowsWritten: 0 }
  const rowsWritten = sqlite.prepare(AGENT_OWNER_BACKFILL).run().changes
  return { ran: true, rowsWritten }
}

export function rowsTheOwnerStepWrote(report: Report): number { return report.rowsWritten }
export function whatTheOwnerStepDid(report: Report): string {
  if (!report.ran && report.rowsWritten === 0) return 'this run did not apply the ownership migration, so nothing was written'
  return `${String(report.rowsWritten)} owner entries filled`
}
export function describeTheOwnerStep(report: Report): string { return `agent owners: ${whatTheOwnerStepDid(report)}` }
