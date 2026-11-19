// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RESULT MAY NOT BE USED TO CLAIM, AND WHO HAS RE-CHECKED IT.
 *
 * Two routes. One reads which restrictions reach a record or a scope; one records a judgement about
 * one record after a restriction has been resolved.
 *
 * THERE IS NO ROUTE THAT RESOLVES A RESTRICTION, and that is not an omission. Resolving one is
 * creating a link — `POST /api/links {"fromId":"<the record that answers it>","toId":"<the
 * placeholder>","type":"resolves"}` — exactly as settling a proposal is creating a link. A second
 * door onto one act is a second place the guards have to be remembered, and the guards on this one
 * are already in `createLink`: a restriction may not resolve a restriction, and a placeholder
 * waiting on an unsettled fork may not be resolved at all. The link's reply says what the
 * resolution wrote.
 *
 * NEITHER ROUTE ANSWERS *IS THIS STILL VALID*. There is no such key and there must not be one. What
 * comes back is: this record is reached by that restriction, at this distance, through these links,
 * and its author wrote these two lists. Deciding whether a particular assertion falls inside
 * *geometric accuracy* is reading, and a machine doing it would be inventing a judgement.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { restrictionsInScope, restrictionsInThisProject, restrictionsOn, restrictionsReaching, type RestrictionInProject, type RestrictionReading } from '../lib/restrictions.ts'
// THE SENTENCE THIS ROUTE PRINTS ABOUT ITS OWN ANSWER, shared with the record page's panel.
import { restrictionNote, whatCouldNotBeCheckedSaid } from '@shared/restriction.ts'
import { recordJudgement, REVALIDATION_STATES } from '../lib/revalidations.ts'
// THE IMPLEMENTATION MAP'S FORWARD READ, wired in here rather than imported by the walk.
// `implementation.ts` imports `records.ts`, which imports `restrictions.ts`, so a shared reader
// importing the map directly would close a cycle. The wiring is one call and it happens as this
// route group registers, which is before any request can reach the walk.
import { filesInRepository } from '../lib/implementation.ts'
import { statedInRepository } from '../db/stated-in-repository.ts'
import { filesMatching } from '@shared/paths.ts'
import { useImplementationMap } from '../lib/restrictions.ts'

const readQuery = z
  .object({
    record: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    /**
     * EVERY RESTRICTION IN THIS PROJECT, which is what the Placeholders surface opens with.
     *
     * It is a fourth answer on this route rather than a fourth route, because it is the same
     * question under the same operation: what may not be claimed, and why. What differs is the
     * scope, and the three above already differ by their parameters.
     *
     * IT IS NOT `?scope=` WITH THE PROJECT'S NAME. A scope is a RECORD and its descendants, and a
     * project is not a record. More importantly a restriction with no `about` link is in no scope
     * at all, and it is exactly the case a surface must not lose.
     */
    everything: z.literal('true').optional(),
    /**
     * MANY RECORDS AT ONCE, ANSWERED PER RECORD — what a drawing asks, and the only shape that can
     * answer it.
     *
     * `?scope=` collapses to one reading per restriction because a scope asks *which restrictions
     * are in here*. A graph card asks the other question: *which restrictions reach THIS card*, and
     * it asks it about every card on screen in one breath. Answering that with `?record=` in a loop
     * is one request per card — the exact fault `loadPage` in PipelinePage.tsx has a measured
     * paragraph about, where 2,080 records became 726 refusals inside the browser.
     *
     * IT IS THE DRAWING'S OWN NODE ID SET AND NOT THE PROJECT. `restrictionsReaching` is the one
     * batched read in this codebase and it says so in its own docstring; this is its door.
     */
    records: z.string().min(1).optional(),
    // A FILE, RESOLVED TO THE RECORDS THAT STATE IT AS THEIRS before the walk runs. Both are
    // needed together: a path with no repository names nothing, and this refuses rather than
    // guessing which checkout was meant.
    repository: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
  })
  .strict()

/**
 * How many records one batched read will answer about.
 *
 * A BOUND RATHER THAN A SILENT TRUNCATION: over this, the route refuses and says the number, and
 * the caller asks about fewer. A drawing this product can draw is far below it — the largest in the
 * owner's corpus is 27 cards — and a caller that has more than this is asking a scope question.
 */
const MOST_RECORDS_AT_ONCE = 200

const judgement = z
  .object({
    state: z.enum(REVALIDATION_STATES),
    note: z.string().max(4000).nullish(),
  })
  .strict()

export const RESTRICTIONS_NOTE =
  'What a record or a scope may not be used to claim, and why: GET /api/restrictions?record=<id> or ' +
  '?scope=<id>. A restriction is a `placeholder` — a slot somebody deliberately left unresolved — or a ' +
  '`ran_instead` — the canonical method for a step is one thing and something else ran. Each reading carries ' +
  "the author's own `allowedUses` and `disallowedClaims`, UNCHANGED: Mole Office never re-words them, never " +
  'summarises them and never merges two authors\' lists. It carries how the restriction reached this record — ' +
  '`direct` (it is about this record), `carried` (a step this record holds has it, and this record\'s own ' +
  'claims are NOT restricted) or `depends` with the path — and where it stands: `active`, ' +
  '`resolved-unchecked`, or `resolved`. RESOLVING A RESTRICTION MAKES NOTHING VALID: it writes one ' +
  're-validation row per affected record and the restriction keeps travelling until somebody judges each ' +
  'one, with PUT /api/revalidations/<restriction>/<record>. `couldNotCheck` is always there and is never ' +
  'the same as an empty answer — a check that could not run must not read like nothing to report. THERE IS ' +
  'NO KEY SAYING WHETHER A CLAIM IS STILL VALID, and there will not be one: that is reading, and it is yours. ' +
  'FOR THE WHOLE PROJECT send ?everything=true: every restriction that has been filed, whether or not it reaches ' +
  'anything, worst severity first, each with where it stands, how many records it reaches and how many of those ' +
  'have not been re-checked. A restriction with no `about` link reaches nothing and is on that list, because it ' +
  'is still a slot somebody deliberately left. FOR MANY RECORDS AT ONCE send ?records=<id>,<id>… and the reply ' +
  'adds `byRecord`, which holds one key for every id you asked about — including the ones nothing reaches, so ' +
  'that a record nothing restricts and a record nobody looked at are never the same answer. It is what a drawing ' +
  'asks about the cards on screen; it answers about at most 200 records and refuses rather than answering about ' +
  'the first 200 of more.'

export const JUDGEMENT_NOTE =
  'Record that somebody looked at one piece of work after a restriction was resolved: PUT ' +
  '/api/revalidations/<restriction id>/<record id> {"state":"checked"|"not_affected","note":"…"}. Keyed on ' +
  'the PAIR and not on a row id, so a record that became a dependency AFTER the resolution can be judged too ' +
  '— that call makes the row. `note` is REQUIRED for "not_affected", because that takes somebody else\'s ' +
  'restriction off this record and a dismissal with no reason is a deletion. An agent may record "checked" ' +
  'anywhere, and may not record "not_affected" on a `stops_final` restriction a person wrote; the refusal ' +
  'names the claim or comment to file instead. Moving back to "needs_review" is allowed and is recorded.'

export interface RestrictionsReply {
  found: RestrictionReading[]
  skippedDeleted: number
  couldNotCheck: { what: string; because: string }[]
  counts?: { active: number; unchecked: number; stopsFinal: number; harmless: number }
  note: string
}

export async function restrictionRoutes(app: FastifyInstance): Promise<void> {
  // WHAT SERVES WHAT, from the Map's own reads and not from a second opinion. Until this runs, a
  // scope given implementation entries answers "the Implementation Map could not be read from
  // here" — an honest absence rather than an empty list.
  useImplementationMap({
    filesInRepository,
    statedInRepository: (repositoryId, workspaceId) =>
      statedInRepository(repositoryId, workspaceId).map((row) => ({ recordId: row.recordId, pattern: row.pattern })),
    filesMatching,
  })

  app.get('/restrictions', route('restriction.read', 'remote', RESTRICTIONS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const query = parse(readQuery, req.query, 'The query string is not usable:')
    if (query.everything === 'true') {
      const reply = restrictionsInThisProject(workspaceId)
      return { ...reply, note: everythingNote(reply.found, reply.couldNotCheck) }
    }
    if ((query.repository === undefined) !== (query.path === undefined)) {
      // HALF OF A FILE IS NOT A FILE. Answering about the repository alone, or about a path in a
      // checkout nobody named, would be answering a question that was not asked.
      return {
        found: [],
        skippedDeleted: 0,
        couldNotCheck: [
          {
            what: 'this request',
            because: 'it named a repository without a path, or a path without a repository, and one is not a file',
          },
        ],
        note: 'Send both ?repository= and ?path= to ask what a file reaches.',
      }
    }
    if (query.repository !== undefined && query.path !== undefined) {
      const reply = restrictionsInScope({
        workspaceId,
        entries: [{ repository: query.repository, path: query.path }],
      })
      return { ...reply, note: noteFor(reply.found, reply.couldNotCheck) }
    }
    if (query.records !== undefined) {
      const ids = [...new Set(query.records.split(',').map((one) => one.trim()).filter((one) => one.length > 0))]
      if (ids.length === 0 || ids.length > MOST_RECORDS_AT_ONCE) {
        // REFUSED, NOT TRUNCATED. A reply about the first 200 of 300 cards would draw 100 cards
        // with no mark and say nothing about it, which is the silent fold this product bans.
        return {
          found: [],
          byRecord: {},
          skippedDeleted: 0,
          couldNotCheck: [
            {
              what: 'this request',
              because:
                ids.length === 0
                  ? '?records= held no id once the empty entries were dropped, and an empty question is not an empty answer'
                  : `?records= named ${ids.length} records and this read answers about at most ${MOST_RECORDS_AT_ONCE} at once`,
            },
          ],
          note: `Send ?records=<id>,<id>… with between 1 and ${MOST_RECORDS_AT_ONCE} ids, or ?scope=<id> for a whole scope.`,
        }
      }
      const reply = restrictionsReaching(ids, workspaceId)
      // ONE KEY PER ID ASKED ABOUT, INCLUDING THE ONES WITH NOTHING. An absent key and an empty
      // list would be the same thing to a caller, and a card that draws no mark because nobody
      // looked must never look like a card nothing restricts.
      const byRecord: Record<string, RestrictionReading[]> = {}
      for (const id of ids) byRecord[id] = reply.found.get(id) ?? []
      const flat = Object.values(byRecord).flat()
      return {
        found: flat,
        byRecord,
        skippedDeleted: reply.skippedDeleted,
        couldNotCheck: reply.couldNotCheck,
        note: noteFor(flat, reply.couldNotCheck),
      }
    }
    if (query.record === undefined && query.scope === undefined) {
      // AN EMPTY QUESTION IS REFUSED RATHER THAN ANSWERED WITH AN EMPTY LIST. "Nothing restricts
      // anything you asked about" and "you asked about nothing" must never be the same reply.
      return {
        found: [],
        skippedDeleted: 0,
        couldNotCheck: [
          {
            what: 'this request',
            because: 'it named neither a record nor a scope, so nothing was looked at',
          },
        ],
        note: 'Send ?record=<id> for one record, or ?scope=<id> for a module, pipeline or project and everything inside it.',
      }
    }
    if (query.record !== undefined) {
      const reply = restrictionsOn(query.record, workspaceId)
      return { ...reply, note: noteFor(reply.found, reply.couldNotCheck) }
    }
    const reply = restrictionsInScope({ workspaceId, scopeRecordId: query.scope })
    return { ...reply, note: noteFor(reply.found, reply.couldNotCheck) }
  })

  app.put(
    '/revalidations/:restrictionId/:recordId',
    route('restriction.judge', 'remote', JUDGEMENT_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const params = req.params as { restrictionId: string; recordId: string }
      const body = parse(judgement, req.body, 'The body is not usable:')
      return recordJudgement({
        restrictionId: params.restrictionId,
        recordId: params.recordId,
        state: body.state,
        note: body.note ?? null,
        workspaceId,
        actor: actorFrom(req),
      })
    },
  )
}

/**
 * What the reply says about itself, COUNTED FROM THE READINGS IN IT.
 *
 * THE SENTENCE MOVED TO `src/shared/restriction.ts` WHEN THE SCREEN LANDED. The record page prints
 * the same sentence about the same rows, and a second wording in the browser would be one fact
 * worked out in two places. This is the call, kept so the route reads as it did.
 */
const noteFor = restrictionNote

/**
 * WHAT THE WHOLE-PROJECT ANSWER SAYS ABOUT ITSELF.
 *
 * A SEPARATE SENTENCE FROM `restrictionNote`, AND THAT IS NOT A SECOND WORDING OF ONE FACT. That
 * one says how many restrictions REACH the thing you asked about; this one says how many EXIST,
 * which is a different number about a different question. Saying "3 restrictions reach this" about
 * a project would be false: a restriction with no `about` link reaches nothing at all and is on
 * this list.
 *
 * WHAT COULD NOT BE CHECKED IS NOT A SECOND WORDING EITHER, AND IT USED TO BE ONE. That clause was
 * written out here and again in `restrictionNote`, byte for byte, so a repair to one left the other
 * printing on the Placeholders page. It is `whatCouldNotBeCheckedSaid` now, called from both, and
 * there is no longer a second copy to disagree with.
 */
function everythingNote(
  found: readonly RestrictionInProject[],
  couldNotCheck: readonly { what: string }[],
): string {
  const missing = whatCouldNotBeCheckedSaid(couldNotCheck)
  if (found.length === 0) {
    return `No placeholder or fallback is filed in this project.${missing}`
  }
  const standing = found.filter((row) => !row.answered).length
  const stopsFinal = found.filter((row) => row.severity === 'stops_final' && !row.answered).length
  return (
    `${found.length} restriction${found.length === 1 ? '' : 's'} in this project, ${standing} still open` +
    (stopsFinal === 0
      ? ''
      : `, ${stopsFinal} of which stop${stopsFinal === 1 ? 's' : ''} work resting on ${stopsFinal === 1 ? 'it' : 'them'} being called final`) +
    `.${missing}`
  )
}
