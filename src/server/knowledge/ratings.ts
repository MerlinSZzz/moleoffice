// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Ratings after a run reads an entry, and the single low-average notice. */
import { z } from 'zod'
import { settingValue } from '../../config/settings.mjs'
import { KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { KNOWLEDGE_WORDS as w } from '@shared/words/en-wave-13u.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import { nowStamp } from '@shared/time.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { sqlite } from '../db/client.ts'
import { wholeNumberSetting } from '../db/env.ts'
import { theApproverOf } from '../lib/agent-renames.ts'
import { writeASystemLineToOne } from '../lib/groups.ts'
import { PanelError } from '../lib/panel-error.ts'
import { createLink, createRecord, getRecord, listRecords, patchRecord, type Actor } from '../lib/records.ts'
import { theRoleCardsAreRead } from '../lib/roles.ts'
import { theAgentARunServes } from '../lib/the-agent-a-run-serves.ts'
import { knowledgeWrite } from './guard.ts'
import { runForQuery } from './library.ts'

const body = z.strictObject({ score: z.unknown(), text: z.string(), suggestion: z.string() })
export const ratingAskIsOn = () => settingValue('MOLE_OFFICE_KNOWLEDGE_RATING_ASK') === '1'
const noticeIsOn = () => settingValue('MOLE_OFFICE_KNOWLEDGE_LOW_RATING_NOTICE') === '1'
export const fewestRatings = () => wholeNumberSetting('MOLE_OFFICE_KNOWLEDGE_FEWEST_RATINGS')
export const queryRows = () => listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_query' })
export const ratingRows = () => listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_rating' })
export const readIds = (value: unknown): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

/** Runs can see all distinct entries they read, less the entries they already rated. */
export function unratedEntries(run: string) {
  const read = new Set(queryRows().filter(q => q.data['run'] === run).flatMap(q => readIds(q.data['readAfter'])))
  for (const row of ratingRows()) if (row.data['run'] === run && typeof row.data['entry'] === 'string') read.delete(row.data['entry'])
  return [...read].map(id => getRecord(id)).filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.deletedAt === null && entry.kind === 'knowledge_entry' && entry.workspaceId === KNOWLEDGE_WORKSPACE)
}
export function ratingReminder(run: string): string | null {
  if (!ratingAskIsOn()) return null
  const pending = unratedEntries(run)
  return pending.length ? w.ratingReminder(pending.map(e => w.ratingReminderItem(e.title, e.id)).join('; ')) : null
}

/** Walk uses in their stored order; a use's writer or run supplies the start of its role chain. */
function secretaryFor(entry: string): { secretary: { kind: 'agent'; id: string }; project: string } | null {
  if (!theRoleCardsAreRead()) return null
  const uses = sqlite.prepare(`SELECT r.id, r.kind, r.workspace_id, r.data,
    (SELECT actor_id FROM changes WHERE record_id = r.id AND op = 'create' AND actor_type = 'agent' ORDER BY rowid LIMIT 1) AS writer,
    (SELECT MAX(rowid) FROM changes WHERE record_id = r.id AND op IN ('create', 'update')) AS use_order
    FROM records r WHERE r.deleted_at IS NULL AND (
      (r.workspace_id = ? AND r.kind = 'knowledge_query' AND
        (EXISTS (SELECT 1 FROM json_each(r.data, '$.answered') WHERE value = ?) OR EXISTS (SELECT 1 FROM json_each(r.data, '$.readAfter') WHERE value = ?))) OR
      (r.kind = 'knowledge_bookmark' AND EXISTS (SELECT 1 FROM links l WHERE l.from_id = r.id AND l.to_id = ? AND l.type = 'relates_to')))
    ORDER BY use_order DESC, r.rowid DESC`).all(KNOWLEDGE_WORKSPACE, entry, entry, entry) as { id: string; kind: string; workspace_id: string; data: string; writer: string | null }[]
  for (const use of uses) {
    const data = JSON.parse(use.data) as Record<string, unknown>
    const project = use.kind === 'knowledge_query' ? data['project'] : use.workspace_id
    if (typeof project !== 'string' || !isAProjectOnAList(project)) continue
    const run = use.kind === 'knowledge_query' && typeof data['run'] === 'string' ? getRecord(data['run']) : null
    const agent = use.kind === 'knowledge_query' ? (run ? theAgentARunServes(run.data)?.id : undefined) : use.writer
    if (!agent) continue
    const secretary = theApproverOf(agent)
    if (secretary.kind === 'agent') return { secretary: { kind: 'agent', id: secretary.id }, project }
  }
  return null
}

/** Save one immutable rating; a notice and its mark share its transaction. */
export function rateEntry(id: string, input: unknown, actor: Actor, project: string) {
  const entry = getRecord(id)
  if (!entry || entry.deletedAt !== null || entry.workspaceId !== KNOWLEDGE_WORKSPACE || entry.kind !== 'knowledge_entry') throw new PanelError(w.missing, 404)
  const run = runForQuery(actor, project)
  const runRecord = run ? getRecord(run) : null
  if (!run || actor.type !== 'agent' || !runRecord || runRecord.kind !== 'session' || runRecord.deletedAt !== null) throw new PanelError(w.ratingNoRun, 400)
  const parsed = body.safeParse(input)
  const score = parsed.success ? parsed.data.score : (typeof input === 'object' && input !== null ? (input as Record<string, unknown>)['score'] : undefined)
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) throw new PanelError(w.ratingScore, 400)
  if (!parsed.success || !parsed.data.text.trim() || !parsed.data.suggestion.trim() || Array.from(parsed.data.text).length > 500 || Array.from(parsed.data.suggestion).length > 500) throw new PanelError(w.ratingText, 400)
  return sqlite.transaction(() => knowledgeWrite(() => {
    if (!queryRows().some(q => q.data['run'] === run && readIds(q.data['readAfter']).includes(id))) throw new PanelError(w.ratingUnread, 403)
    const all = ratingRows().filter(r => r.data['entry'] === id)
    if (all.some(r => r.data['run'] === run)) throw new PanelError(w.ratingAgain, 409)
    const rating = createRecord({ kind: 'knowledge_rating', title: w.ratingTitle, workspaceId: KNOWLEDGE_WORKSPACE, actor,
      data: { entry: id, score, text: parsed.data.text, suggestion: parsed.data.suggestion, run, project } })
    createLink({ fromId: rating.id, toId: id, type: 'relates_to', actor })
    const average = (all.reduce((sum, r) => sum + Number(r.data['score']), 0) + score) / (all.length + 1)
    let notice: string | null = null
    if (average < 4 && all.length + 1 >= fewestRatings() && noticeIsOn() && !entry.data['lowRatingNotice']) {
      const recipient = secretaryFor(id)
      if (recipient) {
        const line = writeASystemLineToOne(recipient.secretary, recipient.project,
          SYSTEM_LINES.aKnowledgeRatingIsLow(entry.title, average, all.length + 1, id),
          { type: 'system', id: moleOffice().id })
        patchRecord(id, { dataPatch: { lowRatingNotice: { message: line.id, at: nowStamp() } } }, { type: 'system', id: moleOffice().id })
      } else notice = w.noSecretary
    }
    return { rating, average, count: all.length + 1, notice }
  }))()
}
