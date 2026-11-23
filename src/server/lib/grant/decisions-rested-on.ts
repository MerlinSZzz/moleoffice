// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DEPARTMENT AND A SECRETARY'S DUTIES ASK OF EACH DECISION THEY REST ON. Wave 13s, step 1b of departments and
 * posts: one check for both guards, so what one asks cannot drift from what the other asks.
 *
 * Each decision named in restsOn is live, in this project, replaced by no live decision (`whatSupersedes` in
 * lib/replaced-decisions.ts), decided by "the owner", and given no mark by `decisionsNotOnThePersonsOwnWords`. The
 * answer names the first decision that fails and what is wrong with it, or gives every decision with its data, for the
 * check of a warrant's words. Each guard says a fault in its own sentences and throws in its own file:
 * grant/departments.ts for a department and grant/secretary-duties.ts for duties.
 */
import { THE_OWNER } from '@shared/kinds.ts'
import { isObject } from '@shared/secretary-duties-record.ts'
import { sqlite } from '../../db/client.ts'
import { whatSupersedes } from '../replaced-decisions.ts'
import { decisionsNotOnThePersonsOwnWords } from '../the-persons-own-words.ts'

/** A decision a record rests on, with its data. */
export interface ADecisionRestedOn {
  id: string
  data: unknown
}

/** Every decision with its data, or the first that may not be rested on and what is wrong with it. */
export type TheDecisionsRestedOn =
  | { fit: true; decisions: ADecisionRestedOn[] }
  | { fit: false; id: string; fault: 'notLive' | 'notTheOwners' | 'notOnThePersonsOwnWords' }
  | { fit: false; id: string; fault: 'replaced'; standing: { id: string; title: string } }

/** One decision's id, kind, project, data and whether it is deleted. */
interface ADecisionRow {
  id: string
  kind: string
  workspace_id: string
  data: string | null
  deleted_at: string | null
}

/**
 * EACH DECISION IN `ids`, ASKED IN ORDER: live in this project, then replaced by none, then decided by the owner. Then
 * all of them at once: on the person's own words. The decisions are read in one statement.
 */
export function theDecisionsRestedOn(workspaceId: string, ids: readonly string[]): TheDecisionsRestedOn {
  if (ids.length === 0) return { fit: true, decisions: [] }
  const rows = sqlite
    .prepare(`SELECT id, kind, workspace_id, data, deleted_at FROM records WHERE id IN (${ids.map(() => '?').join(', ')})`)
    .all(...ids) as ADecisionRow[]
  const byId = new Map(rows.map((row) => [row.id, row]))
  const decisions: ADecisionRestedOn[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (row === undefined || row.kind !== 'decision' || row.deleted_at !== null || row.workspace_id !== workspaceId) {
      return { fit: false, id, fault: 'notLive' }
    }
    const standing = whatSupersedes(id)
    if (standing !== null) return { fit: false, id, fault: 'replaced', standing }
    const data: unknown = row.data === null ? null : JSON.parse(row.data)
    if (!isObject(data) || data['decided_by'] !== THE_OWNER) return { fit: false, id, fault: 'notTheOwners' }
    decisions.push({ id, data })
  }
  const marked = decisionsNotOnThePersonsOwnWords(decisions)
  const notOnTheirWords = decisions.find((one) => marked.has(one.id))
  if (notOnTheirWords !== undefined) return { fit: false, id: notOnTheirWords.id, fault: 'notOnThePersonsOwnWords' }
  return { fit: true, decisions }
}
