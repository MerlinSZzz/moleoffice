// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SECRETARY'S DUTIES: WHO MAY WRITE THEM, AND WHAT THE BRIEF SHOWS OF THEM. Wave 13s round 92, item 2 of the line's
 * requirements. src/server/lib/grant/secretary-duties.ts is the guard and the brief's part; src/server/api/secretary-duties.ts
 * holds the doors.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Three secretaries and one
 * worker are made-up agents with made-up handles, each holding the key the office answered. The decisions are made-up
 * decisions the test's person files. Every record here is synthetic.
 *
 * THE CASES, in order, on one world:
 *   1. the person writes two secretaries' duties by their own press, and the one-secretary door shows a door's answer;
 *   2. the secretary named writes its own, with the person's words from a decision it rests on;
 *   3. another secretary is refused, even carrying the same words, and nothing is written;
 *   4. the secretary named, raised under the person's grant, is refused without the person's words;
 *   5. duties resting on a replaced decision are refused;
 *   6. words that are not in the decision are refused;
 *   7. a write through /api/records meets the same refusals, word for word, and two more: a second record for one
 *      secretary, and an agent that does not hold the secretary card;
 *   8. each change leaves a revision carrying its warrant, and the person's own write carries none;
 *   9. the brief's part shows the reader its own duties whole and every other secretary in one line, read from the guard
 *      as the brief reads it (case 16 reads the brief itself);
 *  10. the brief's part reads in no more statements than the cap;
 *  11. inside a test world, its starter and a secretary it names write duties with no warrant, as the person does, and
 *      outside one the same writes are refused (round 94, the fix the check of round 93 asked for);
 *  12. deleting duties asks who takes them away and keeps the warrant, or the person's own press without one;
 *  13. restoring duties asks the whole guard and keeps the warrant, or the person's own press without one;
 *  14. changing the kind, title or summary asks the guard, including unchanged data sent with a changed title;
 *  15. a restore cannot give one secretary two live duties records, even on the person's own press;
 *  16. the brief's head carries the duties lines only for a reader with a duties record, and the worker's JSON part lists
 *      every secretary (round 97, piece C).
 *      Cases 12 to 16 added on 24 October 2026; cases 12 to 15 make their own made-up records.
 *  17. moving duties to another project asks who takes them away from the project they leave, on a dry run as well;
 *  18. moving duties asks the whole write guard in the project they go to, on the records as they land there, and a
 *      dry run says that guard has not been asked;
 *  19. a move cannot leave one secretary two duties records in the project it goes to, even on the person's own press.
 *      Cases 17 to 19 added on 24 October 2026 (round 98, item 8); each makes its own made-up records, and the other
 *      project is a made-up project the test establishes.
 *  20. a secretary moves its own duties, with the decision they rest on, only while it holds the person's grant; without
 *      it the move and its dry run are refused at the decision, in the sentence a delete of that decision gets;
 *  21. a decision that duties rest on is not deleted or moved while they rest on it: the duties' own secretary without
 *      the grant is refused both at who may write the decision, and the secretary under the grant and the person are
 *      refused both, and the move's dry run, in a sentence naming the duties and their door. The delete is made once
 *      the person rests the duties on another decision, and the move once the person takes the duties away.
 *      Cases 20 and 21 added on 24 October 2026 (round 99: the correction round 98's check asked for, and item 9); each
 *      makes its own made-up records. Case 21 changed in round 100 (item 11): until then the person and the secretary
 *      under the grant deleted or moved the decision, and the duties were left naming a decision that was gone;
 *  22. after the person's press deletes or moves a decision that duties rest on, every decision the duties name is still
 *      a live decision in their project, and the person's next change of the duties is written. Added on 24 October 2026
 *      (round 100, item 11): it is the gap, red on round 99's code for both acts.
 *  23. a decision that duties rest on does not change its kind, or change `decided_by` away from the person, while they
 *      rest on it: the secretary under the grant and the person are refused both, in the delete's sentence, and each
 *      change is made once the person rests the duties on another decision;
 *  24. a newer decision that replaces the one duties rest on is filed, and so is one replacing that in turn. The duties
 *      stay as they were, and the reply that draws their page names the last of the line, the decision that stands. The
 *      duties' next change, still naming the replaced decision, is refused on the person's press and on the secretary's
 *      warrant, naming the decision that stands as the one to rest on. The secretary carrying the person's words from
 *      that decision then rests them there, and the page names no replaced decision;
 *  25. the person's revoke of the promotion that filed a decision duties rest on is refused, in the delete's sentence
 *      with the order added: the duties first, then the revoke. It is made once the person rests the duties on another
 *      decision.
 *      Cases 23 to 25 added on 24 October 2026 (round 101, item 12); each makes its own made-up records. Each was red on
 *      round 100's code: 23 at the first change, made with 200 where 409 is asked; 24 at the page's first read; 25 at
 *      the order sentence, because round 100 already refused the revoke with 409 through the delete, and had no order
 *      sentence to give.
 *  26. a decision that duties rest on, on the person's own words, is not changed to cite something that is not the
 *      person's own words while they rest on it: the secretary under the grant and the person are refused, in the
 *      delete's sentence, and nothing is written. A change to cite another record of the person's is made, and so is the
 *      first change once the person rests the duties on another decision;
 *  27. a secretary deleting its own duties, changing their kind or moving them, while they rest on a replaced decision,
 *      is told to rest them on the decision that stands first and then to make that act. It is not told only to name the
 *      decision that stands in restsOn. Nothing is written. Once the duties rest on the decision that stands, the delete
 *      and the change of kind are made;
 *  28. the person's revoke of an act under the grant that would put back a version stranding the duties is refused, with
 *      the order: change or delete the duties first, then revoke. The acts are a change into a decision, a change of
 *      `decided_by` to the person, and a change of `authority_reference` to the person's own record. Each revoke is made
 *      once the person rests the duties on another decision;
 *  29. two live decisions replace the one duties rest on: the second filed names it in `replaces`, and the person links
 *      the first filed as replacing it too. The decision's own reply, the duties' reply, the list of decisions, the
 *      answer to which decisions govern a file the decision names, and the governs check, which lists the decision as
 *      still cited by a task filed between the first and the second, all name the first filed. Once the first filed is
 *      replaced in turn, all five name the last of its line.
 *      Cases 26 to 29 added on 24 October 2026 (round 102, item 13); each makes its own made-up records. Each was red on
 *      round 101's code: 26 at the refused change, made with 200 where 409 is asked; 27 at the sentence, which ended
 *      with only "Name <id> in data.restsOn instead"; 28 at the order sentence, because round 101 refused the revoke of
 *      the change into a decision with 409 through the patch's guard and ended with "Then change its kind again."; and
 *      29 at the first read, where the decision's own reply, the list and what governs the file named the second filed,
 *      and the governs check did not list the decision, because it counted from the second filed.
 *
 * MUTATIONS RUN ON 24 OCTOBER 2026, after a control run with every case green, each alone and then restored, with the
 * cases each turned red. In src/server/lib/grant/secretary-duties.ts unless named:
 *   - the person's press not recognised: 1, 2, 6, 7, 8, 9, 10;
 *   - the warrant's words never matching: 2, 7, 8, 9, 10;
 *   - any agent passing as the secretary named: 3, 6, 7, 8;
 *   - a raised secretary passing with no warrant: 4, 8, 9;
 *   - a replaced decision accepted: 5, 7, 8;
 *   - the words check skipped: 6, 7, 8;
 *   - records.ts's call on a change removed: 3 to 9;
 *   - records.ts's call on a create removed: 6 to 10;
 *   - theWordsAllowThis not called: 8;
 *   - the brief's head without the duties lines (src/server/api/brief.ts): 9. Run again on 13 November 2026, once case 9
 *     read the guard's part and not the brief: 16;
 *   - every other secretary's whole record read in place of its area line: 9, and 9 again on 13 November 2026;
 *   - one more statement for each record the brief's part reads: 10;
 *   - a test world's starter and secretary not read by checkWhoWrites, as the guard stood before round 94: 11;
 *   - that authority let past who may write, but not taken as the person's own press: 11.
 * Round 97 mutations, each run alone on 24 October 2026 and restored before the next. Each piece ran its own in its own
 * tree, so the guard's were run before case 16 was written and the head's before cases 12 to 15:
 *   - deleteRecord does not call checkTheDutiesTakenAway (records.ts): 12;
 *   - restoreRecord does not call checkTheSecretaryDuties (records.ts): 13, 15;
 *   - patchRecord does not guard a change out of this kind (records.ts): 14;
 *   - patchRecord asks only when data is sent (records.ts): 14;
 *   - a title change passes the stored data as before (records.ts): 14, at its wrong-words refusal;
 *   - checkTheDutiesTakenAway does not call theWordsAllowThis: 12, 14, at their kept-warrant checks;
 *   - checkThereIsNoOther is skipped for a restore: 15;
 *   - theDutiesLines answers [part.note] again for a reader with no record: 16;
 *   - the brief pushes the blank line whatever the lines are (src/server/api/brief.ts): 16, on the blank lines;
 *   - theDutiesLines answers [] for every reader: 9, 16.
 * Round 98 mutations, each run alone on 24 October 2026 after a control run with every case green, and restored before
 * the next. In src/server/lib/move.ts; the first eight at bc3e9054d and the last at 453ace874:
 *   - the move does not ask checkTheDutiesTakenAway: 17, at its dry run;
 *   - the project left is asked only on a dry run: 17, at the warrant naming only the duties as they will stand;
 *   - the project left is asked only when the move is made: 17, at its dry run;
 *   - the project left is asked about the project they go to: 17, at the words absent from the decision;
 *   - the move does not ask checkTheSecretaryDuties: 17, 18, 19;
 *   - the project they go to is asked before the write: 18, at the move with its decision;
 *   - the project they go to is asked about the project left: 17, 18, 19;
 *   - the record is not named as its own (`mine` is null): 17, 18, 19;
 *   - a dry run without the sentence that the project they go to has not checked the duties: 18.
 * Round 99 mutations, each run alone on 24 October 2026 after a control run with every case green, and restored before
 * the next:
 *   - a raise does not carry a move (src/server/lib/records.ts, `assertMayWrite`): 20 and 21, at the moves under the
 *     grant;
 *   - an agent's move of a decision let through without the grant (records.ts, `assertMayWrite`): 20, at its dry run;
 *     21, at the move without the grant;
 *   - the move's first check asks only the record named, not the decision that moves with it (src/server/lib/move.ts):
 *     20, at its dry run. The writer, `fileRecordsInWorkspace` in records.ts, asks every record again, so only a dry
 *     run shows this one.
 * Round 100 mutations, each run alone on 24 October 2026 at b67b4179d after a control run with every case green, and
 * restored before the next. In src/server/lib/grant/secretary-duties.ts unless named:
 *   - deleteRecord does not call checkNoDutiesRestOn (records.ts): 21, at the first delete under the grant; 22, at the
 *     delete;
 *   - the move does not call checkNoDutiesRestOn (move.ts): 21, at the first dry run under the grant; 22, at the move;
 *   - duties moving with the decision are asked as if left behind: 18, 19 and 20, at their moves with the decision;
 *   - duties already taken away still count as resting on the decision: 21, at the move after the person took them
 *     away;
 *   - the person's own press passes the delete (records.ts): 21, at the person's delete; 22, at the delete.
 * Round 101 mutations, each run alone on 24 October 2026 on round 100's tip b1516b751 with this round's code, after a
 * control run with every case green, and restored before the next:
 *   - patchRecord does not call checkNoDutiesRestOn (records.ts): 23, at the first change of the kind;
 *   - patchRecord asks only about a change of kind (records.ts): 23, at the first change of `decided_by`;
 *   - patchRecord reads `decided_by` from the record before the change on both sides (records.ts): 23, at the first
 *     change of `decided_by`;
 *   - the line of replacements is not followed past the first (src/server/lib/replaced-decisions.ts): 24, at the read
 *     after the second replacement;
 *   - the reply carries no `restsOnReplacedBy` (src/server/api/records.ts): 24, at the first read; and case 5 of
 *     tests/a-duties-page-names-its-secretary-and-its-doors.test.ts;
 *   - the refusal of a replaced decision does not name the decision that stands: 24, at the person's refused change;
 *   - retract does not call checkNoDutiesRestOn (records.ts): 25, at the order sentence. The delete underneath still
 *     refuses with its own sentence, so the status alone would not show it;
 *   - retract asks it as a delete (records.ts): 25, at the order sentence.
 * Round 102 mutations, each run alone on 24 October 2026 on round 101's tip cc307856b with this round's code, after a
 * control run with every case green, and restored before the next. In src/server/lib/grant/secretary-duties.ts unless
 * named; the logs are out/r102/20 to 36 in sandbox w13s:
 *   - theActThatWouldStrandTheDuties never answers `authorityReference`: 26, at the first change under the grant, made
 *     with 200; 28, at the revoke of the change of `authority_reference`, made where 409 is asked;
 *   - any change of `authority_reference` refused, not only one that gives the decision the mark: 26, at the change to
 *     another record of the person's own, refused where 200 is asked;
 *   - patchRecord does not ask the decision's guard (records.ts): 23, at the change of the kind under the grant; 26, at
 *     the first change under the grant;
 *   - a refusal to take duties away ends with the write's sentence: 27, at the sentence;
 *   - checkTheDutiesTakenAway does not say which act it asks for: 27, at the sentence;
 *   - deleteRecord names its act as a change of kind (records.ts): 27, at the delete's sentence;
 *   - the revoke does not ask before it puts the earlier version back (records.ts, `putBack`): 28, at the order
 *     sentence. The restore's patch still refuses with 409, in the patch's sentence, so the status alone would not show
 *     it;
 *   - the revoke asks without the version it revokes (records.ts): 28, at the order sentence;
 *   - the first filed among those that supersede a decision taken as the newest filed (src/server/lib/replaced-decisions.ts):
 *     29, at the first read; and case 6 of tests/a-duties-page-names-its-secretary-and-its-doors.test.ts;
 *   - whatSupersedes answers the first of the line, not the last (replaced-decisions.ts): 24, at the read after the
 *     second replacement; 29, at the read after the first filed is replaced in turn; and page case 6;
 *   - the duties' restsOnReplacedBy reads only the first of the line: 24 and 29, at those reads; and page case 6;
 *   - what governs a file reads only the first of the line (src/server/lib/governs.ts): 29, at the read after the first
 *     filed is replaced in turn;
 *   - the decision's own reply reads only the first of the line (src/server/api/records.ts): 29, at that read; and page
 *     case 6;
 *   - the list of decisions reads only the first of the line (api/records.ts): 29, at that read;
 *   - the governs check names the first of the line as what stands in place of a decision still cited (governs.ts): 29,
 *     at that read;
 *   - the governs check counts the work that cites a decision from the last of its line, not the first (governs.ts): 29,
 *     at that read, where it no longer lists the decision.
 *   tests/a-decision-says-what-it-governs.test.ts ran beside the three governs mutations and stayed green: each decision
 *   it replaces has one replacement, not replaced in turn, so the first and the last of each line are the same decision.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_WORKER } from '../src/shared/roles.ts'
import { THE_DOORS_THE_LIST_NAMES } from '../src/shared/what-the-grant-carries-words.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { SECRETARY_DUTIES_KIND } from '../src/shared/secretary-duties-record.ts'

type TheGuard = typeof import('../src/server/lib/grant/secretary-duties.ts')
type TheCounting = typeof import('../src/server/lib/slow-requests.ts')
type TheMove = typeof import('../src/server/lib/move.ts')

const MAP = 'duties-map-secretary'
const SPEED = 'duties-speed-secretary'
const THIRD = 'duties-third-secretary'
const WORKER = 'duties-worker'

let t: TestDb
let app: FastifyInstance
let guard: TheGuard
let counting: TheCounting
let move: TheMove
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const ids = new Map<string, string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

/** A made-up second project, which cases 17 to 19 move duties into. */
const OTHER_PROJECT = 'made-up-other-project'

/** The same caller, asking from another project. */
const inThe = (project: string, headers: Record<string, string>): Record<string, string> => ({
  ...headers,
  'x-mole-office-workspace': project,
})

/** The project a record is filed in, read from the table. */
function projectOf(id: string): string {
  const row = t.client.sqlite.prepare('SELECT workspace_id FROM records WHERE id = ?').get(id) as { workspace_id: string } | undefined
  if (row === undefined) throw new Error(`no record ${id}`)
  return row.workspace_id
}

const idOf = (handle: string): string => {
  const id = ids.get(handle)
  if (id === undefined || id === '') throw new Error(`the test registered no agent ${handle}`)
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** A decision the person files themselves, in their own name. */
async function aDecision(title: string, optionTaken: string, replaces: string[] = []): Promise<string> {
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'decision',
    title,
    data: { option_taken: optionTaken, because: 'A made-up reason.', decided_by: THE_OWNER, replaces },
  })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

/** The person's words, as a warrant the secretary carries for one or more acts. */
function aWarrant(words: string, ...acting: string[]): Record<string, unknown> {
  return { saidBy: THE_PERSON, words, where: 'terminal', when: '2026-10-12 21:06', for: acting }
}

/** What the office holds about every duties record and every change to one, so a refusal can be shown to write nothing. */
function theDutiesAsStored(): string {
  const kind = SECRETARY_DUTIES_KIND
  return JSON.stringify([
    t.client.sqlite.prepare('SELECT id, title, data, deleted_at FROM records WHERE kind = ? ORDER BY id').all(kind),
    t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
    t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
  ])
}

/** The one live duties record naming this agent. */
function theRecordOf(handle: string): { id: string; data: Record<string, unknown> } {
  const row = t.client.sqlite
    .prepare(`SELECT id, data FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.secretary.id') = ?`)
    .get(SECRETARY_DUTIES_KIND, idOf(handle)) as { id: string; data: string } | undefined
  if (row === undefined) throw new Error(`no duties record names ${handle}`)
  return { id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }
}

/** The person raises this made-up secretary under their grant. */
async function raise(handle: string): Promise<void> {
  const raised = await call('POST', `/api/roles/elevation/${handle}`, PERSON, { reason: 'A made-up raise for a duties change.' })
  expect(raised.status, raised.raw).toBe(201)
}

/** A new made-up secretary, raised under the person's grant unless `raised` is false, and its own made-up decision and duties. */
async function madeUpDutiesFor(handle: string, raised = true): Promise<{ handle: string; id: string; data: Record<string, unknown>; words: string }> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: THE_SECRETARY })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
  if (raised) await raise(handle)
  const words = `The made-up duties for ${handle} may be written, taken away and brought back.`
  const decision = await aDecision('A made-up decision for a duties change', words)
  const data = { secretary: { kind: 'agent', id: idOf(handle) }, area: 'A made-up area for this change.', restsOn: [decision] }
  const filed = await call('POST', '/api/records', PERSON, { kind: SECRETARY_DUTIES_KIND, title: 'Made-up duties for this change', data })
  expect(filed.status, filed.raw).toBe(201)
  return { handle, id: String(filed.body.record.id), data, words }
}

/** A made-up fork the person files: a record of the person's own, which a decision may cite. */
async function aForkThePersonFiled(question: string): Promise<string> {
  const fork = await call('POST', '/api/records', PERSON, {
    kind: 'proposal',
    title: 'A made-up fork for a duties change',
    data: { question, options: ['a — yes', 'b — no'], who_settles_it: THE_OWNER },
  })
  expect(fork.status, fork.raw).toBe(201)
  return String(fork.body.record.id)
}

/**
 * NEW MADE-UP DUTIES THAT THE PERSON RESTS ON A DECISION A MADE-UP SECRETARY'S PROMOTION FILED on the person's words, and
 * the version of the decision that the promotion wrote. The decision cites the fork, which the person wrote, so the
 * duties may rest on it: a secretary's promotion would otherwise cite the warrant's place, which is not a record.
 */
async function dutiesOnAPromotedDecision(handle: string): Promise<{
  one: Awaited<ReturnType<typeof madeUpDutiesFor>>
  decision: string
  seq: number
  fork: string
}> {
  const one = await madeUpDutiesFor(handle)
  const fork = await aForkThePersonFiled('May the made-up duties rest on a promoted decision?')
  const promoted = await call('POST', `/api/records/${fork}/promote`, as(one.handle), {
    title: 'A made-up decision a promotion filed',
    data: { because: 'A made-up reason the person gave.', authority_reference: fork },
    warrant: aWarrant('Yes, the made-up duties may rest on it.', fork),
  })
  expect(promoted.status, promoted.raw).toBe(201)
  const read = await call('GET', `/api/records/${fork}`, PERSON)
  const act = (read.body.onThePersonsWords as { recordId: string; seq: number }[])[0]
  expect(act, read.raw).toBeDefined()
  const decision = String(act?.recordId)
  const rested = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, PERSON, { area: String(one.data['area']), restsOn: [decision] })
  expect(rested.status, rested.raw).toBe(200)
  return { one, decision, seq: Number(act?.seq), fork }
}

/** A made-up note the secretary files itself: a live record that is not the person's own words. */
async function aNoteTheSecretaryFiled(handle: string): Promise<string> {
  const note = await call('POST', '/api/records', as(handle), {
    kind: 'note',
    title: 'A made-up note a secretary wrote',
    data: { body: 'A made-up note, in the secretary\'s own words.' },
  })
  expect(note.status, note.raw).toBe(201)
  return String(note.body.record.id)
}

/** The person rests these made-up duties on a new decision of their own, so the decision they rested on is free. */
async function restTheDutiesElsewhere(one: { handle: string; data: Record<string, unknown> }, why: string): Promise<void> {
  const another = await aDecision('Another made-up decision for these duties', `The made-up duties ${why} rest here now.`)
  const rested = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, PERSON, { area: String(one.data['area']), restsOn: [another] })
  expect(rested.status, rested.raw).toBe(200)
}

/** The record and its whole ledger, read even after deletion or a change of kind. */
function storedDutiesRecord(id: string): {
  record: { deleted_at: string | null; kind: string; title: string; summary: string | null; data: string }
  changes: { op: string; field: string | null; warrant: string | null }[]
  revisions: { op: string; deleted_at: string | null; kind: string; title: string; summary: string | null; data: string; warrant: string | null }[]
} {
  return {
    record: t.client.sqlite.prepare('SELECT deleted_at, kind, title, summary, data FROM records WHERE id = ?').get(id),
    changes: t.client.sqlite.prepare('SELECT * FROM changes WHERE record_id = ? ORDER BY rowid').all(id),
    revisions: t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(id),
  } as ReturnType<typeof storedDutiesRecord>
}

/** One real write adds its change rows and exactly one revision, each keeping only the warrant that opened it. */
function expectDutiesActKept(id: string, before: ReturnType<typeof storedDutiesRecord>, op: string, warrant: Record<string, unknown> | null): ReturnType<typeof storedDutiesRecord> {
  const after = storedDutiesRecord(id)
  const added = after.changes.slice(before.changes.length)
  expect(added.length).toBeGreaterThan(0)
  const kept = (value: string | null): unknown => value === null ? null : JSON.parse(value)
  for (const change of added) {
    expect(change.op).toBe(op)
    expect(kept(change.warrant)).toEqual(warrant)
  }
  expect(after.revisions).toHaveLength(before.revisions.length + 1)
  const revision = after.revisions.at(-1)
  expect(revision).toMatchObject({ ...after.record, op })
  expect(kept(revision?.warrant ?? null)).toEqual(warrant)
  return after
}

const DOORS = Object.keys(THE_DOORS_THE_LIST_NAMES)
const MAP_WORDS = 'The made-up map secretary looks after the made-up map plugin.'
const SPEED_WORDS = "The made-up speed secretary takes one pass on the made-up API's response speed."
const OLD_WORDS = 'The made-up speed secretary looks after the made-up old area.'
let mapDecision = ''
let speedDecision = ''
let oldDecision = ''
let newDecision = ''

let MAP_DUTIES: Record<string, unknown> = {}
let SPEED_DUTIES: Record<string, unknown> = {}
let THIRD_DUTIES: Record<string, unknown> = {}
/** The speed secretary's duties as a later change asks for them. */
let SPEED_CHANGED: Record<string, unknown> = {}

/** The refusals the PUT door gave, so case 7 can say /api/records gives the same words. */
const refusedByThePut: { anotherSecretary: string; notTheirWords: string; replaced: string; notACardHolder: string } = {
  anotherSecretary: '',
  notTheirWords: '',
  replaced: '',
  notACardHolder: '',
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  guard = await import('../src/server/lib/grant/secretary-duties.ts')
  counting = await import('../src/server/lib/slow-requests.ts')
  move = await import('../src/server/lib/move.ts')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[MAP, THE_SECRETARY], [SPEED, THE_SECRETARY], [THIRD, THE_SECRETARY], [WORKER, THE_WORKER]] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  mapDecision = await aDecision('A made-up decision on the map secretary', MAP_WORDS)
  speedDecision = await aDecision('A made-up decision on the speed secretary', SPEED_WORDS)
  oldDecision = await aDecision('A made-up decision later replaced', OLD_WORDS)
  newDecision = await aDecision('A made-up decision replacing it', 'The made-up old area is closed.', [oldDecision])
  expect(DOORS.length, 'the list of what the grant carries names fewer than two doors').toBeGreaterThanOrEqual(2)
  MAP_DUTIES = {
    area: 'The made-up map plugin.',
    responsibleFor: ['The made-up map page.', 'The made-up map tiles.'],
    lines: ['a made-up line'],
    doors: [DOORS[0]],
    reportsToThePerson: ['A made-up weekly line on the map.'],
    restsOn: [mapDecision],
  }
  SPEED_DUTIES = {
    area: "One made-up pass on the API's response speed.",
    responsibleFor: ['The made-up slow requests.'],
    doors: [DOORS[1]],
    restsOn: [speedDecision],
  }
  SPEED_CHANGED = { ...SPEED_DUTIES, area: "One made-up pass on the API's response speed, and its report.", reportsToThePerson: ['The made-up report.'] }
  THIRD_DUTIES = { area: 'A made-up third area.', restsOn: [mapDecision] }
  const project = await call('POST', '/api/workspaces', PERSON, { id: OTHER_PROJECT, title: 'A made-up other project' })
  expect(project.status, project.raw).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("one secretary's duties", () => {
  it("1: the person writes a secretary's duties by their own press", async () => {
    for (const [handle, duties] of [[MAP, MAP_DUTIES], [THIRD, THIRD_DUTIES]] as const) {
      const put = await call('PUT', `/api/secretaries/${idOf(handle)}/duties`, PERSON, duties)
      expect(put.status, put.raw).toBe(201)
      expect(put.body.written).toBe('created')
      expect(put.body.record.data).toEqual({ secretary: { kind: 'agent', id: idOf(handle) }, ...duties })
    }
    const one = await call('GET', `/api/secretaries/${idOf(MAP)}/duties`, as(SPEED))
    expect(one.status, one.raw).toBe(200)
    expect(one.body.nobodyRecorded).toBeNull()
    expect(one.body.duties.area).toBe(MAP_DUTIES['area'])
    expect(one.body.doors).toEqual([expect.objectContaining({ door: DOORS[0], onTheList: true })])
    expect(one.body.doors[0].asTheListAnswersNow.door).toBe(DOORS[0])
    // A SECRETARY NOBODY HAS RECORDED DUTIES FOR IS ANSWERED SO, never as an empty list.
    const none = await call('GET', `/api/secretaries/${idOf(SPEED)}/duties`, as(SPEED))
    expect(none.status, none.raw).toBe(200)
    expect(none.body.duties).toBeNull()
    expect(none.body.doors).toBeNull()
    expect(none.body.nobodyRecorded).toContain(SPEED)
  })

  it('2: the secretary named writes its own duties with the person’s words from a decision they rest on', async () => {
    const binding = guard.theBindingOf(idOf(SPEED), SPEED_DUTIES)
    const put = await call('PUT', `/api/secretaries/${idOf(SPEED)}/duties`, as(SPEED), {
      ...SPEED_DUTIES,
      warrant: aWarrant(SPEED_WORDS.slice(0, 40), binding),
    })
    expect(put.status, put.raw).toBe(201)
    expect(put.body.record.data).toEqual({ secretary: { kind: 'agent', id: idOf(SPEED) }, ...SPEED_DUTIES })
    const all = await call('GET', '/api/secretaries/duties', as(THIRD))
    expect(all.status, all.raw).toBe(200)
    const listed = all.body.secretaries as { agent: { handle: string }; duties: { area: string } | null }[]
    expect(listed.map((one) => one.agent.handle).sort()).toEqual([MAP, SPEED, THIRD].sort())
    expect(listed.every((one) => one.duties !== null), all.raw).toBe(true)
  })

  it('3: another secretary is refused, even carrying the same words, and nothing is written', async () => {
    const before = theDutiesAsStored()
    const binding = guard.theBindingOf(idOf(SPEED), SPEED_CHANGED)
    const put = await call('PUT', `/api/secretaries/${idOf(SPEED)}/duties`, as(THIRD), {
      ...SPEED_CHANGED,
      warrant: aWarrant(SPEED_WORDS, binding),
    })
    expect(put.status, put.raw).toBe(403)
    expect(put.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary)
    expect(theDutiesAsStored()).toBe(before)
    refusedByThePut.anotherSecretary = put.error
  })

  it('4: the secretary named, raised under the person’s grant, is refused without the person’s words', async () => {
    const raised = await call('POST', `/api/roles/elevation/${MAP}`, PERSON, { reason: 'A made-up raise for this test.' })
    expect(raised.status, raised.raw).toBe(201)
    const before = theDutiesAsStored()
    const put = await call('PUT', `/api/secretaries/${idOf(MAP)}/duties`, as(MAP), {
      ...MAP_DUTIES,
      area: 'The made-up map plugin, widened under the grant.',
      ...FOR_THE_PERSON,
    })
    expect(put.status, put.raw).toBe(403)
    expect(put.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone)
    expect(theDutiesAsStored()).toBe(before)
  })

  it('5: duties resting on a replaced decision are refused', async () => {
    const before = theDutiesAsStored()
    const duties = { ...SPEED_DUTIES, restsOn: [oldDecision] }
    const put = await call('PUT', `/api/secretaries/${idOf(SPEED)}/duties`, as(SPEED), {
      ...duties,
      warrant: aWarrant(OLD_WORDS, guard.theBindingOf(idOf(SPEED), duties)),
    })
    expect(put.status, put.raw).toBe(400)
    expect(put.error).toContain(`${oldDecision} ${guard.WHY_DUTIES_ARE_REFUSED.replaced}`)
    expect(theDutiesAsStored()).toBe(before)
    refusedByThePut.replaced = put.error
    // THE DECISION THAT REPLACED IT IS ONE THE DUTIES MAY REST ON, so the refusal is about the replacement and nothing else.
    expect(newDecision).not.toBe('')
  })

  it('6: words that are not in the decision are refused', async () => {
    const before = theDutiesAsStored()
    const put = await call('PUT', `/api/secretaries/${idOf(SPEED)}/duties`, as(SPEED), {
      ...SPEED_CHANGED,
      warrant: aWarrant('Made-up words the person never said.', guard.theBindingOf(idOf(SPEED), SPEED_CHANGED)),
    })
    expect(put.status, put.raw).toBe(403)
    expect(put.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheirWords)
    expect(theDutiesAsStored()).toBe(before)
    refusedByThePut.notTheirWords = put.error
    const worker = await call('PUT', `/api/secretaries/${idOf(WORKER)}/duties`, PERSON, THIRD_DUTIES)
    expect(worker.status, worker.raw).toBe(400)
    expect(worker.error).toContain(WORKER)
    expect(theDutiesAsStored()).toBe(before)
    refusedByThePut.notACardHolder = worker.error
  })

  it('7: a write through /api/records meets the same refusals, word for word', async () => {
    const before = theDutiesAsStored()
    const speed = theRecordOf(SPEED)
    const kind = SECRETARY_DUTIES_KIND
    const asData = (handle: string, duties: Record<string, unknown>): Record<string, unknown> => ({
      secretary: { kind: 'agent', id: idOf(handle) },
      ...duties,
    })

    // ANOTHER SECRETARY, on a create naming the speed secretary.
    const title = 'Made-up duties filed by another secretary'
    const byAnother = await call('POST', '/api/records', as(THIRD), {
      kind,
      title,
      data: asData(SPEED, SPEED_CHANGED),
      warrant: aWarrant(SPEED_WORDS, title, guard.theBindingOf(idOf(SPEED), SPEED_CHANGED)),
    })
    expect(byAnother.status, byAnother.raw).toBe(403)
    expect(byAnother.error).toBe(refusedByThePut.anotherSecretary)

    // WORDS NOT IN THE DECISION, on a change.
    const notTheirs = await call('PATCH', `/api/records/${speed.id}`, as(SPEED), {
      data: asData(SPEED, SPEED_CHANGED),
      warrant: aWarrant('Made-up words the person never said.', speed.id, guard.theBindingOf(idOf(SPEED), SPEED_CHANGED)),
    })
    expect(notTheirs.status, notTheirs.raw).toBe(403)
    expect(notTheirs.error).toBe(refusedByThePut.notTheirWords)

    // A REPLACED DECISION, on a change.
    const onTheOld = { ...SPEED_DUTIES, restsOn: [oldDecision] }
    const replaced = await call('PATCH', `/api/records/${speed.id}`, as(SPEED), {
      data: asData(SPEED, onTheOld),
      warrant: aWarrant(OLD_WORDS, speed.id, guard.theBindingOf(idOf(SPEED), onTheOld)),
    })
    expect(replaced.status, replaced.raw).toBe(400)
    expect(replaced.error).toBe(refusedByThePut.replaced)

    // AN AGENT THAT DOES NOT HOLD THE SECRETARY CARD.
    const worker = await call('POST', '/api/records', PERSON, { kind, title: 'Made-up duties of a worker', data: asData(WORKER, THIRD_DUTIES) })
    expect(worker.status, worker.raw).toBe(400)
    expect(worker.error).toBe(refusedByThePut.notACardHolder)

    // A SECOND RECORD FOR ONE SECRETARY, even by the person.
    const second = await call('POST', '/api/records', PERSON, { kind, title: 'Made-up second duties', data: asData(SPEED, SPEED_DUTIES) })
    expect(second.status, second.raw).toBe(409)
    expect(second.error).toContain(speed.id)
    expect(second.error).toContain(`PUT /api/secretaries/${idOf(SPEED)}/duties`)

    expect(theDutiesAsStored()).toBe(before)
  })

  it('8: each change leaves a revision carrying its warrant, and the person’s own write carries none', async () => {
    const binding = guard.theBindingOf(idOf(SPEED), SPEED_CHANGED)
    const words = SPEED_WORDS.slice(20)
    const put = await call('PUT', `/api/secretaries/${idOf(SPEED)}/duties`, as(SPEED), { ...SPEED_CHANGED, warrant: aWarrant(words, binding) })
    expect(put.status, put.raw).toBe(200)
    expect(put.body.written).toBe('changed')
    const revisionsOf = (handle: string): (Record<string, unknown> | null)[] =>
      (
        t.client.sqlite.prepare('SELECT warrant FROM revisions WHERE record_id = ? ORDER BY rowid').all(theRecordOf(handle).id) as {
          warrant: string | null
        }[]
      ).map((row) => (row.warrant === null ? null : (JSON.parse(row.warrant) as Record<string, unknown>)))
    const speed = revisionsOf(SPEED)
    expect(speed.length, JSON.stringify(speed)).toBe(2)
    expect(speed[0]?.['for']).toEqual([guard.theBindingOf(idOf(SPEED), SPEED_DUTIES)])
    expect(speed[1]?.['for']).toEqual([binding])
    expect(speed[1]?.['words']).toBe(words)
    const changes = t.client.sqlite.prepare('SELECT warrant FROM changes WHERE record_id = ? ORDER BY rowid').all(theRecordOf(SPEED).id) as {
      warrant: string | null
    }[]
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every((row) => row.warrant !== null), JSON.stringify(changes)).toBe(true)
    expect(revisionsOf(MAP)).toEqual([null])
  })

  it("9: the brief's part shows the reader its own duties whole and every other secretary in one line", () => {
    // THE GUARD'S PART, READ AS src/server/api/brief.ts READS IT: theDutiesPartFor with the reader's registry id. Case 16
    // proves that the brief carries this part and writes its lines into the head. This case read the whole brief twice,
    // which ran past vitest's five seconds in the whole suite.
    const part = guard.theDutiesPartFor('default', idOf(SPEED))
    const { area, responsibleFor, doors, reportsToThePerson, restsOn } = SPEED_CHANGED as Record<string, unknown>
    expect(part.yours).toEqual({ recordId: theRecordOf(SPEED).id, secretary: idOf(SPEED), area, responsibleFor, doors, reportsToThePerson, restsOn })
    expect(part.others.map((one) => [one.handle, one.area]).sort()).toEqual(
      [[MAP, MAP_DUTIES['area']], [THIRD, THIRD_DUTIES['area']]].sort(),
    )
    for (const one of part.others) expect(Object.keys(one).sort()).toEqual(['area', 'handle', 'recordId', 'secretary'])
    const lines = guard.theDutiesLines(part)
    expect(lines).toContain(`  ${MAP}: ${String(MAP_DUTIES['area'])}`)
    expect(lines.join('\n')).not.toContain(String((MAP_DUTIES['responsibleFor'] as string[])[0]))

    // A READER NO RECORD NAMES HAS EVERY SECRETARY IN ITS PART, AND NO DUTIES OF ITS OWN.
    const theirs = guard.theDutiesPartFor('default', idOf(WORKER))
    expect(theirs.yours).toBeNull()
    expect(theirs.others.map((one) => one.handle).sort()).toEqual([MAP, SPEED, THIRD].sort())
  })

  it('10: the brief’s part reads in no more statements than the cap', () => {
    counting.measureTheStatementsOf(t.client.sqlite)
    const did = counting.aFreshCount()
    const part = counting.countedTo(did, () => guard.theDutiesPartFor('default', idOf(SPEED)))
    expect(part.yours).not.toBeNull()
    expect(part.others.length).toBe(2)
    expect(did.statements).toBeGreaterThan(0)
    expect(did.statements).toBeLessThanOrEqual(guard.THE_DUTIES_PART_READS_IN_STATEMENTS)
  })

  it('11: inside a test world, its starter and the secretary write duties as the person does', async () => {
    const authority = await import('../src/server/lib/worldauthority.ts')
    const third = { ...THIRD_DUTIES, area: 'A made-up third area, changed in a test world by its starter.' }
    const map = { ...MAP_DUTIES, area: 'The made-up map plugin, changed in a test world by a secretary.' }
    // THE WORKER STARTED THE WORLD AND THE SPEED SECRETARY IS ITS SECRETARY. Neither is the secretary these duties name,
    // and neither carries a warrant.
    const writes = [[THIRD, WORKER, third], [MAP, SPEED, map]] as const

    // OUTSIDE A WORLD THE SAME WRITES ARE REFUSED, so what lets them in below is the world and nothing else.
    const before = theDutiesAsStored()
    for (const [handle, writer, duties] of writes) {
      const put = await call('PUT', `/api/secretaries/${idOf(handle)}/duties`, as(writer), duties)
      expect(put.status, put.raw).toBe(403)
      expect(put.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary)
    }
    expect(theDutiesAsStored()).toBe(before)

    try {
      process.env.MOLE_OFFICE_WORLD_STARTED_BY = WORKER
      process.env.MOLE_OFFICE_WORLD_SECRETARIES = SPEED
      authority.forgetTheWorldsOwnAuthority()
      for (const [handle, writer, duties] of writes) {
        const put = await call('PUT', `/api/secretaries/${idOf(handle)}/duties`, as(writer), duties)
        expect(put.status, put.raw).toBe(200)
        expect(put.body.written).toBe('changed')
        expect(theRecordOf(handle).data).toEqual({ secretary: { kind: 'agent', id: idOf(handle) }, ...duties })
      }
    } finally {
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
      delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
      authority.forgetTheWorldsOwnAuthority()
    }
  })

  it('12: deleting duties asks the guard and keeps the warrant that opened the delete', async () => {
    const one = await madeUpDutiesFor('made-up-duties-delete')
    const url = `/api/records/${one.id}`
    const writing = guard.theBindingOf(idOf(one.handle), one.data)
    for (const [headers, payload, why] of [
      [as(THIRD), { warrant: aWarrant(one.words, one.id, writing) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
      [as(WORKER), { warrant: aWarrant(one.words, one.id, writing) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
      [as(one.handle), { ...FOR_THE_PERSON }, guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone],
    ] as const) {
      const before = storedDutiesRecord(one.id)
      const refused = await call('DELETE', url, headers, payload)
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toContain(why)
      expect(storedDutiesRecord(one.id)).toEqual(before)
    }
    const binding = guard.theBindingOf(idOf(one.handle), null)
    const boundToWriting = storedDutiesRecord(one.id)
    const wrongBinding = await call('DELETE', url, as(one.handle), { warrant: aWarrant(one.words, one.id, writing) })
    expect(wrongBinding.status, wrongBinding.raw).toBe(403)
    expect(wrongBinding.error).toContain(binding)
    expect(storedDutiesRecord(one.id)).toEqual(boundToWriting)
    const wrong = aWarrant('Made-up words absent from the decision.', one.id, binding)
    const before = storedDutiesRecord(one.id)
    const refused = await call('DELETE', url, as(one.handle), { warrant: wrong })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheirWords)
    expect(storedDutiesRecord(one.id)).toEqual(before)

    const warrant = aWarrant(one.words, one.id, binding)
    const removed = await call('DELETE', url, as(one.handle), { warrant })
    expect(removed.status, removed.raw).toBe(200)
    const after = expectDutiesActKept(one.id, before, 'delete', warrant)
    expect(after.record).toEqual({ ...before.record, deleted_at: expect.any(String) })
    // AN ALREADY DELETED RECORD STILL ASKS WHO IS TAKING IT AWAY, before its no-write answer.
    const again = await call('DELETE', url, as(WORKER))
    expect(again.status, again.raw).toBe(403)
    expect(storedDutiesRecord(one.id)).toEqual(after)

    const own = await madeUpDutiesFor('made-up-duties-person-delete')
    // TAKING DUTIES AWAY DOES NOT REQUIRE A LIVE SECRETARY ROW.
    t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(idOf(own.handle))
    const ownBefore = storedDutiesRecord(own.id)
    const pressed = await call('DELETE', `/api/records/${own.id}`, PERSON)
    expect(pressed.status, pressed.raw).toBe(200)
    const ownAfter = expectDutiesActKept(own.id, ownBefore, 'delete', null)
    expect(ownAfter.record).toEqual({ ...ownBefore.record, deleted_at: expect.any(String) })

    // A MADE-UP DAMAGED RECORD NAMES NO SECRETARY. Only the person's press can take it away.
    const damaged = await madeUpDutiesFor('made-up-duties-without-secretary')
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ area: damaged.data['area'] }), damaged.id)
    const damagedBefore = storedDutiesRecord(damaged.id)
    const refusedDamage = await call('DELETE', `/api/records/${damaged.id}`, as(damaged.handle), {
      warrant: aWarrant(damaged.words, damaged.id, guard.theBindingOf(idOf(damaged.handle), null)),
    })
    expect(refusedDamage.status, refusedDamage.raw).toBe(403)
    expect(refusedDamage.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.noSecretaryToTakeAway)
    expect(storedDutiesRecord(damaged.id)).toEqual(damagedBefore)
    const removedDamage = await call('DELETE', `/api/records/${damaged.id}`, PERSON)
    expect(removedDamage.status, removedDamage.raw).toBe(200)
    expectDutiesActKept(damaged.id, damagedBefore, 'delete', null)
  })

  it('13: restoring duties asks the whole guard and keeps the warrant that opened the restore', async () => {
    const one = await madeUpDutiesFor('made-up-duties-restore')
    const url = `/api/records/${one.id}`
    const removed = await call('DELETE', url, PERSON)
    expect(removed.status, removed.raw).toBe(200)
    const binding = guard.theBindingOf(idOf(one.handle), one.data)
    const before = storedDutiesRecord(one.id)
    expect(before.record.deleted_at).not.toBeNull()
    for (const [headers, payload, why] of [
      [as(THIRD), { warrant: aWarrant(one.words, one.id, binding) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
      [as(WORKER), { warrant: aWarrant(one.words, one.id, binding) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
      [as(one.handle), { ...FOR_THE_PERSON }, guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone],
    ] as const) {
      const refused = await call('POST', `${url}/restore`, headers, payload)
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toContain(why)
      expect(storedDutiesRecord(one.id)).toEqual(before)
    }
    const wrongBinding = await call('POST', `${url}/restore`, as(one.handle), {
      warrant: aWarrant(one.words, one.id, guard.theBindingOf(idOf(one.handle), null)),
    })
    expect(wrongBinding.status, wrongBinding.raw).toBe(403)
    expect(wrongBinding.error).toContain(binding)
    expect(storedDutiesRecord(one.id)).toEqual(before)
    const wrongWords = await call('POST', `${url}/restore`, as(one.handle), {
      warrant: aWarrant('Made-up words absent from the decision.', one.id, binding),
    })
    expect(wrongWords.status, wrongWords.raw).toBe(403)
    expect(wrongWords.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheirWords)
    expect(storedDutiesRecord(one.id)).toEqual(before)

    const warrant = aWarrant(one.words, one.id, binding)
    const restored = await call('POST', `${url}/restore`, as(one.handle), { warrant })
    expect(restored.status, restored.raw).toBe(200)
    const after = expectDutiesActKept(one.id, before, 'update', warrant)
    expect(after.record).toEqual({ ...before.record, deleted_at: null })
    expect((await call('DELETE', url, PERSON)).status).toBe(200)
    const ownBefore = storedDutiesRecord(one.id)
    const pressed = await call('POST', `${url}/restore`, PERSON)
    expect(pressed.status, pressed.raw).toBe(200)
    const ownAfter = expectDutiesActKept(one.id, ownBefore, 'update', null)
    expect(ownAfter.record).toEqual({ ...ownBefore.record, deleted_at: null })
    expect((await call('DELETE', url, PERSON)).status).toBe(200)
  })

  it('14: changing the kind, title or summary asks the guard, even with unchanged data sent', async () => {
    for (const change of ['kind', 'title', 'summary'] as const) {
      const one = await madeUpDutiesFor(`made-up-duties-${change}`)
      const url = `/api/records/${one.id}`
      const patch = { [change]: change === 'kind' ? 'note' : `A made-up changed ${change}.` }
      const writing = guard.theBindingOf(idOf(one.handle), one.data)
      const before = storedDutiesRecord(one.id)
      for (const [headers, payload, why] of [
        [as(THIRD), { ...patch, warrant: aWarrant(one.words, one.id, writing) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
        [as(WORKER), { ...patch, warrant: aWarrant(one.words, one.id, writing) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
        [as(one.handle), { ...patch, ...FOR_THE_PERSON }, guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone],
      ] as const) {
        const refused = await call('PATCH', url, headers, payload)
        expect(refused.status, refused.raw).toBe(403)
        expect(refused.error).toContain(why)
        expect(storedDutiesRecord(one.id)).toEqual(before)
      }
      const binding = guard.theBindingOf(idOf(one.handle), change === 'kind' ? null : one.data)
      // BOTH A TITLE-ONLY CHANGE AND A TITLE WITH UNCHANGED DATA MUST ASK WHOSE WORDS THESE ARE.
      for (const data of change === 'kind' ? [undefined] : [undefined, one.data]) {
        const wrong = await call('PATCH', url, as(one.handle), {
          ...patch, ...(data === undefined ? {} : { data }),
          warrant: aWarrant('Made-up words absent from the decision.', one.id, binding),
        })
        expect(wrong.status, wrong.raw).toBe(403)
        expect(wrong.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheirWords)
        expect(storedDutiesRecord(one.id)).toEqual(before)
      }
      const warrant = aWarrant(one.words, one.id, binding)
      const changed = await call('PATCH', url, as(one.handle), { ...patch, warrant })
      expect(changed.status, changed.raw).toBe(200)
      const after = expectDutiesActKept(one.id, before, 'update', warrant)
      expect(after.record).toEqual({ ...before.record, ...patch, ...(change === 'kind' ? { data: JSON.stringify(changed.body.record.data) } : {}) })
      expect(JSON.parse(after.record.data)).toEqual(changed.body.record.data)
      // THE PERSON CAN PRESS THE SAME CHANGE. Put a kind back through the whole write guard first.
      const reset = await call('PATCH', url, PERSON, { [change]: before.record[change] })
      expect(reset.status, reset.raw).toBe(200)
      const ownBefore = storedDutiesRecord(one.id)
      const pressed = await call('PATCH', url, PERSON, patch)
      expect(pressed.status, pressed.raw).toBe(200)
      const ownAfter = expectDutiesActKept(one.id, ownBefore, 'update', null)
      expect(ownAfter.record).toEqual({ ...ownBefore.record, ...patch, ...(change === 'kind' ? { data: JSON.stringify(pressed.body.record.data) } : {}) })
      expect(JSON.parse(ownAfter.record.data)).toEqual(pressed.body.record.data)
      expect((await call('DELETE', url, PERSON)).status).toBe(200)
    }
  })

  it('15: restoring duties cannot leave two live records for one secretary, for the person or the secretary', async () => {
    const one = await madeUpDutiesFor('made-up-duties-duplicate')
    const url = `/api/records/${one.id}`
    expect((await call('DELETE', url, PERSON)).status).toBe(200)
    const filed = await call('POST', '/api/records', PERSON, {
      kind: SECRETARY_DUTIES_KIND, title: 'Made-up duties that stand', data: one.data,
    })
    expect(filed.status, filed.raw).toBe(201)
    const liveId = String(filed.body.record.id)
    const live = storedDutiesRecord(liveId)
    const before = storedDutiesRecord(one.id)
    expect(before.record.deleted_at).not.toBeNull()
    const warrant = aWarrant(one.words, one.id, guard.theBindingOf(idOf(one.handle), one.data))
    for (const [headers, payload] of [[PERSON, {}], [as(one.handle), { warrant }]] as const) {
      const refused = await call('POST', `${url}/restore`, headers, payload)
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.error).toContain(liveId)
      expect(refused.error).toContain(live.record.title)
      expect(storedDutiesRecord(one.id)).toEqual(before)
      expect(storedDutiesRecord(liveId)).toEqual(live)
    }
    expect((await call('DELETE', `/api/records/${liveId}`, PERSON)).status).toBe(200)
  })

  it("16: the brief's head carries the duties lines only for a reader with a duties record", async () => {
    // THE SECRETARY WITH A RECORD STILL READS EACH OF ITS DUTIES LINES IN THE HEAD.
    const secretary = await call('GET', '/api/brief', as(SPEED))
    expect(secretary.status, secretary.raw.slice(0, 2000)).toBe(200)
    const part = secretary.body.secretaryDuties as ReturnType<TheGuard['theDutiesPartFor']>
    const lines = guard.theDutiesLines(part)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(String(secretary.body.head)).toContain(line)

    // THE WORKER'S HEAD HOLDS NONE OF THOSE LINES, and its JSON part still lists every secretary.
    const worker = await call('GET', '/api/brief', as(WORKER))
    expect(worker.status, worker.raw.slice(0, 2000)).toBe(200)
    const theirs = worker.body.secretaryDuties as ReturnType<TheGuard['theDutiesPartFor']>
    const head = String(worker.body.head)
    const heading = lines[0] ?? ''
    expect(heading, 'the secretary with a record has a heading line').not.toBe('')
    expect(theirs.others.length).toBeGreaterThan(0)
    expect(head).not.toContain(heading)
    expect(head).not.toContain(theirs.note)
    for (const one of theirs.others) expect(head).not.toContain(one.area)
    expect(guard.theDutiesLines(theirs)).toEqual([])

    // A READER WITH NO RECORD GETS NO DUTIES LINES, whatever its note says and however many other areas it holds.
    const madeUpNote = 'A made-up note for a reader no duties record names.'
    const madeUpArea = {
      recordId: 'made-up-record-id',
      secretary: 'made-up-secretary-id',
      handle: 'made-up-handle',
      area: 'A made-up area for a made-up other secretary.',
    }
    expect(guard.theDutiesLines({ yours: null, others: [], note: madeUpNote })).toEqual([])
    expect(guard.theDutiesLines({ yours: null, others: [madeUpArea], note: madeUpNote })).toEqual([])

    // AND NO EXTRA BLANK LINE WHERE THE DUTIES LINES WERE: the notebook opening read from the head, one blank line, then
    // the project line read from the head.
    expect(worker.body.project, 'the brief names its project').not.toBeNull()
    const headLines = head.split('\n')
    const firstBlank = headLines.indexOf('')
    expect(firstBlank, 'the notebook opening is followed by a blank line').toBeGreaterThan(0)
    const notebookOpening = headLines.slice(0, firstBlank).join('\n')
    const projectLine = headLines[firstBlank + 1] ?? ''
    expect(notebookOpening, 'the head opens with the notebook').not.toBe('')
    expect(projectLine, 'the project line follows the notebook opening after one blank line').not.toBe('')
    expect(projectLine).toContain(String(worker.body.project.title))
  })

  it('17: moving duties to another project asks who takes them away from the project they leave', async () => {
    const one = await madeUpDutiesFor('made-up-duties-move-away')
    const url = `/api/records/${one.id}/workspace`
    const away = guard.theBindingOf(idOf(one.handle), null)
    const writing = guard.theBindingOf(idOf(one.handle), one.data)
    const decision = String((one.data['restsOn'] as string[])[0])
    const expectUnmoved = (before: ReturnType<typeof storedDutiesRecord>): void => {
      expect(projectOf(one.id)).toBe('default')
      expect(storedDutiesRecord(one.id)).toEqual(before)
    }
    for (const [headers, payload, why] of [
      [as(THIRD), { to: OTHER_PROJECT, warrant: aWarrant(one.words, one.id, away, writing) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
      [as(THIRD), { to: OTHER_PROJECT, dryRun: true, warrant: aWarrant(one.words, one.id, away, writing) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
      [as(WORKER), { to: OTHER_PROJECT, warrant: aWarrant(one.words, one.id, away, writing) }, guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary],
      [as(one.handle), { to: OTHER_PROJECT, ...FOR_THE_PERSON }, guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone],
    ] as const) {
      const before = storedDutiesRecord(one.id)
      const refused = await call('POST', url, headers, payload)
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toContain(why)
      expectUnmoved(before)
    }
    // A WARRANT FOR THE DUTIES AS THEY WILL STAND, AND NOT FOR TAKING THEM AWAY FROM HERE, does not move them.
    const before = storedDutiesRecord(one.id)
    const wrongBinding = await call('POST', url, as(one.handle), { to: OTHER_PROJECT, warrant: aWarrant(one.words, one.id, writing) })
    expect(wrongBinding.status, wrongBinding.raw).toBe(403)
    expect(wrongBinding.error).toContain(away)
    expectUnmoved(before)
    const wrongWords = await call('POST', url, as(one.handle), {
      to: OTHER_PROJECT,
      warrant: aWarrant('Made-up words absent from the decision.', one.id, away, writing),
    })
    expect(wrongWords.status, wrongWords.raw).toBe(403)
    expect(wrongWords.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheirWords)
    expectUnmoved(before)

    // THE RIGHT WARRANT PASSES THIS GUARD, and the project they go to refuses them: the decision they rest on stays here.
    const right = await call('POST', url, as(one.handle), { to: OTHER_PROJECT, warrant: aWarrant(one.words, one.id, away, writing) })
    expect(right.status, right.raw).toBe(400)
    expect(right.error).toContain(decision)
    expectUnmoved(before)
  })

  it('18: moving duties asks the whole write guard in the project they go to, on the records as they land', async () => {
    const one = await madeUpDutiesFor('made-up-duties-move-to')
    const url = `/api/records/${one.id}/workspace`
    const decision = String((one.data['restsOn'] as string[])[0])
    // ALONE, THE DUTIES WOULD REST ON A DECISION THE OTHER PROJECT DOES NOT HOLD, so even the person's press is refused.
    const before = storedDutiesRecord(one.id)
    const alone = await call('POST', url, PERSON, { to: OTHER_PROJECT })
    expect(alone.status, alone.raw).toBe(400)
    expect(alone.error).toContain(decision)
    expect(projectOf(one.id)).toBe('default')
    expect(storedDutiesRecord(one.id)).toEqual(before)
    // A DRY RUN SAYS THE PROJECT THEY GO TO HAS NOT BEEN ASKED, because it is asked only on the records as they land.
    const dry = await call('POST', url, PERSON, { to: OTHER_PROJECT, dryRun: true })
    expect(dry.status, dry.raw).toBe(200)
    expect(dry.body.note).toContain(move.aDryRunDoesNotAskWhereTheDutiesGo([one.id], OTHER_PROJECT))
    expect(storedDutiesRecord(one.id)).toEqual(before)

    // WITH THE DECISION MOVED ALONG, the duties find it where they land, and the move is made.
    const linked = await call('POST', '/api/links', PERSON, { fromId: one.id, toId: decision, type: 'derived_from' })
    expect(linked.status, linked.raw).toBe(201)
    const withTheLink = storedDutiesRecord(one.id)
    const moved = await call('POST', url, PERSON, { to: OTHER_PROJECT, also: [decision] })
    expect(moved.status, moved.raw).toBe(200)
    expect(projectOf(one.id)).toBe(OTHER_PROJECT)
    expect(projectOf(decision)).toBe(OTHER_PROJECT)
    expectDutiesActKept(one.id, withTheLink, 'update', null)
  })

  it("19: a move cannot leave one secretary two duties records in the project it goes to, even on the person's press", async () => {
    const one = await madeUpDutiesFor('made-up-duties-move-twice')
    const decision = String((one.data['restsOn'] as string[])[0])
    // THE OTHER PROJECT ALREADY HOLDS THIS SECRETARY'S DUTIES, on a made-up decision the person files there.
    const there = inThe(OTHER_PROJECT, PERSON)
    const theirDecision = await call('POST', '/api/records', there, {
      kind: 'decision',
      title: 'A made-up decision in the other project',
      data: { option_taken: one.words, because: 'A made-up reason.', decided_by: THE_OWNER, replaces: [] },
    })
    expect(theirDecision.status, theirDecision.raw).toBe(201)
    const filed = await call('POST', '/api/records', there, {
      kind: SECRETARY_DUTIES_KIND,
      title: 'Made-up duties that stand in the other project',
      data: { ...one.data, restsOn: [String(theirDecision.body.record.id)] },
    })
    expect(filed.status, filed.raw).toBe(201)
    const standingId = String(filed.body.record.id)
    const linked = await call('POST', '/api/links', PERSON, { fromId: one.id, toId: decision, type: 'derived_from' })
    expect(linked.status, linked.raw).toBe(201)

    const before = storedDutiesRecord(one.id)
    const standing = storedDutiesRecord(standingId)
    const refused = await call('POST', `/api/records/${one.id}/workspace`, PERSON, { to: OTHER_PROJECT, also: [decision] })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.error).toContain(standingId)
    expect(refused.error).toContain(standing.record.title)
    expect(refused.error).toContain(`PUT /api/secretaries/${idOf(one.handle)}/duties`)
    expect(projectOf(one.id)).toBe('default')
    expect(projectOf(decision)).toBe('default')
    expect(storedDutiesRecord(one.id)).toEqual(before)
    expect(storedDutiesRecord(standingId)).toEqual(standing)
  })

  it("20: a secretary moves its own duties, with the decision they rest on, only while it holds the person's grant", async () => {
    const one = await madeUpDutiesFor('made-up-duties-move-on-the-grant', false)
    const url = `/api/records/${one.id}/workspace`
    const decision = String((one.data['restsOn'] as string[])[0])
    const linked = await call('POST', '/api/links', PERSON, { fromId: one.id, toId: decision, type: 'derived_from' })
    expect(linked.status, linked.raw).toBe(201)
    const warrant = aWarrant(one.words, one.id, guard.theBindingOf(idOf(one.handle), null), guard.theBindingOf(idOf(one.handle), one.data))
    const asked = { to: OTHER_PROJECT, also: [decision], warrant, ...FOR_THE_PERSON }
    // WITHOUT THE GRANT THE DECISION DOES NOT MOVE, so neither do the duties, though the person's words are carried. The
    // refusal is the one a delete of that decision gets, with its verb changed, and a dry run gets it too.
    const before = storedDutiesRecord(one.id)
    const decisionBefore = storedDutiesRecord(decision)
    const dry = await call('POST', url, as(one.handle), { ...asked, dryRun: true })
    expect(dry.status, dry.raw).toBe(403)
    const refused = await call('POST', url, as(one.handle), asked)
    expect(refused.status, refused.raw).toBe(403)
    expect(dry.body.reason).toBe(refused.body.reason)
    const deleteRefused = await call('DELETE', `/api/records/${decision}`, as(one.handle), { ...FOR_THE_PERSON })
    expect(deleteRefused.status, deleteRefused.raw).toBe(403)
    expect(refused.body.reason).toBe(String(deleteRefused.body.reason).replace('delete', 'move'))
    expect(projectOf(one.id)).toBe('default')
    expect(projectOf(decision)).toBe('default')
    expect(storedDutiesRecord(one.id)).toEqual(before)
    expect(storedDutiesRecord(decision)).toEqual(decisionBefore)

    // UNDER THE GRANT THE SAME REQUEST MOVES BOTH, and the duties' rows keep the warrant that opened their move.
    await raise(one.handle)
    const moved = await call('POST', url, as(one.handle), asked)
    expect(moved.status, moved.raw).toBe(200)
    expect(projectOf(one.id)).toBe(OTHER_PROJECT)
    expect(projectOf(decision)).toBe(OTHER_PROJECT)
    expectDutiesActKept(one.id, before, 'update', warrant)
  })

  it('21: a decision that duties rest on is not deleted or moved while they rest on it, even by the person, and is once they do not', async () => {
    // ONE CALLER'S ACT ON THE DECISION OF ONE MADE-UP DUTIES RECORD. The duties are not asked either way: the act leaves
    // them as they were, in the project they were in.
    const act = async (verb: 'delete' | 'move', one: Awaited<ReturnType<typeof madeUpDutiesFor>>, headers: Record<string, string>, payload: Record<string, unknown>): Promise<{ status: number; body: { reason?: unknown }; error: string; raw: string; decision: string }> => {
      const decision = String((one.data['restsOn'] as string[])[0])
      const duties = storedDutiesRecord(one.id)
      const answer = verb === 'delete'
        ? await call('DELETE', `/api/records/${decision}`, headers, payload)
        : await call('POST', `/api/records/${decision}/workspace`, headers, { to: OTHER_PROJECT, ...payload })
      expect(storedDutiesRecord(one.id)).toEqual(duties)
      expect(projectOf(one.id)).toBe('default')
      return { ...answer, decision }
    }

    // THE DUTIES' OWN SECRETARY WITHOUT THE GRANT is refused both, in one sentence with its verb changed, and nothing
    // is written. Who may write the decision is asked first.
    const unraised = await madeUpDutiesFor('made-up-decision-without-the-grant', false)
    const itsDecision = String((unraised.data['restsOn'] as string[])[0])
    const before = storedDutiesRecord(itsDecision)
    const deleteRefused = await act('delete', unraised, as(unraised.handle), {})
    const moveRefused = await act('move', unraised, as(unraised.handle), {})
    expect(deleteRefused.status, deleteRefused.raw).toBe(403)
    expect(moveRefused.status, moveRefused.raw).toBe(403)
    expect(moveRefused.body.reason).toBe(String(deleteRefused.body.reason).replace('delete', 'move'))
    expect(storedDutiesRecord(itsDecision)).toEqual(before)
    expect(projectOf(itsDecision)).toBe('default')

    // THE SECRETARY UNDER THE PERSON'S GRANT, acting for the person, and the person's own press are refused both while
    // the duties rest on the decision. The refusal names the duties and the door that changes them, and writes nothing.
    const expectRefusedWhileTheyRest = (refused: Awaited<ReturnType<typeof act>>, one: Awaited<ReturnType<typeof madeUpDutiesFor>>, decisionBefore: ReturnType<typeof storedDutiesRecord>): void => {
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.restOnTheDecision)
      expect(refused.error).toContain(one.id)
      expect(refused.error).toContain(`PUT /api/secretaries/${idOf(one.handle)}/duties`)
      expect(storedDutiesRecord(refused.decision)).toEqual(decisionBefore)
      expect(projectOf(refused.decision)).toBe('default')
    }
    for (const [who, headersOf, payload] of [
      ['on-the-grant', (handle: string) => as(handle), FOR_THE_PERSON],
      ['by-the-person', () => PERSON, {}],
    ] as const) {
      // THE DELETE, refused, and then made once the person rests the duties on another decision.
      const toDelete = await madeUpDutiesFor(`made-up-decision-deleted-${who}`)
      const decisionToDelete = String((toDelete.data['restsOn'] as string[])[0])
      const deleteBefore = storedDutiesRecord(decisionToDelete)
      const deleteWhileTheyRest = await act('delete', toDelete, headersOf(toDelete.handle), payload)
      expectRefusedWhileTheyRest(deleteWhileTheyRest, toDelete, deleteBefore)
      expect(deleteWhileTheyRest.error).not.toContain('"also"')
      const another = await aDecision('Another made-up decision for these duties', `The made-up duties ${who} rest here now.`)
      const restedElsewhere = await call('PUT', `/api/secretaries/${idOf(toDelete.handle)}/duties`, PERSON, { area: String(toDelete.data['area']), restsOn: [another] })
      expect(restedElsewhere.status, restedElsewhere.raw).toBe(200)
      const deleted = await act('delete', toDelete, headersOf(toDelete.handle), payload)
      expect(deleted.status, deleted.raw).toBe(200)
      expect(storedDutiesRecord(deleted.decision).record.deleted_at).not.toBeNull()

      // THE MOVE AND ITS DRY RUN, refused in one sentence that also offers to move the duties with it, and then made once
      // the person takes the duties away.
      const toMove = await madeUpDutiesFor(`made-up-decision-moved-${who}`)
      const decisionToMove = String((toMove.data['restsOn'] as string[])[0])
      const moveBefore = storedDutiesRecord(decisionToMove)
      const dryWhileTheyRest = await act('move', toMove, headersOf(toMove.handle), { ...payload, dryRun: true })
      expectRefusedWhileTheyRest(dryWhileTheyRest, toMove, moveBefore)
      const moveWhileTheyRest = await act('move', toMove, headersOf(toMove.handle), payload)
      expectRefusedWhileTheyRest(moveWhileTheyRest, toMove, moveBefore)
      expect(moveWhileTheyRest.error).toBe(dryWhileTheyRest.error)
      expect(moveWhileTheyRest.error).toContain('"also"')
      const takenAway = await call('DELETE', `/api/records/${toMove.id}`, PERSON)
      expect(takenAway.status, takenAway.raw).toBe(200)
      const moved = await act('move', toMove, headersOf(toMove.handle), payload)
      expect(moved.status, moved.raw).toBe(200)
      expect(projectOf(moved.decision)).toBe(OTHER_PROJECT)
    }
  })

  it("22: after the person's press deletes or moves a decision that duties rest on, the duties still rest on live decisions in their project, and the person can change them", async () => {
    for (const verb of ['delete', 'move'] as const) {
      const one = await madeUpDutiesFor(`made-up-duties-on-a-${verb === 'delete' ? 'deleted' : 'moved'}-decision`)
      const decision = String((one.data['restsOn'] as string[])[0])
      // THE PERSON'S OWN PRESS ON THE DECISION. This case does not ask what the office answers to it, only what it leaves.
      if (verb === 'delete') await call('DELETE', `/api/records/${decision}`, PERSON)
      else await call('POST', `/api/records/${decision}/workspace`, PERSON, { to: OTHER_PROJECT })
      // EVERY DECISION THE DUTIES NAME IS STILL A LIVE DECISION IN THE PROJECT THE DUTIES ARE IN.
      const named = theRecordOf(one.handle).data['restsOn'] as string[]
      for (const id of named) {
        const row = t.client.sqlite.prepare('SELECT kind, workspace_id, deleted_at FROM records WHERE id = ?').get(id)
        expect.soft(row, `after the ${verb}, the duties name ${id}`).toEqual({ kind: 'decision', workspace_id: projectOf(one.id), deleted_at: null })
      }
      // AND THE PERSON'S NEXT CHANGE OF THEM, WHICH CHANGES ONLY THE AREA, IS WRITTEN.
      const changed = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, PERSON, {
        area: `A made-up area, changed after the ${verb} of its decision was asked.`,
        restsOn: named,
      })
      expect.soft(changed.status, `after the ${verb}, the person's change: ${changed.raw}`).toBe(200)
    }
  })

  it('23: a decision that duties rest on does not change its kind, or stop saying the person decided it, while they rest on it', async () => {
    // EACH CALLER, EACH CHANGE, ON ITS OWN MADE-UP DUTIES. The kind change and the change of `decided_by` each leave
    // the duties resting on a record they may not rest on, so both are refused as the delete is, and made once the
    // person rests the duties on another decision.
    for (const [who, headersOf, payload] of [
      ['on-the-grant', (handle: string) => as(handle), FOR_THE_PERSON],
      ['by-the-person', () => PERSON, {}],
    ] as const) {
      for (const change of ['kind', 'decided-by'] as const) {
        const one = await madeUpDutiesFor(`made-up-${change}-${who}`)
        const decision = String((one.data['restsOn'] as string[])[0])
        const asked = change === 'kind' ? { kind: 'note' } : { dataPatch: { decided_by: one.handle } }
        const decisionBefore = storedDutiesRecord(decision)
        const dutiesBefore = storedDutiesRecord(one.id)
        const refused = await call('PATCH', `/api/records/${decision}`, headersOf(one.handle), { ...asked, ...payload })
        expect(refused.status, `${change} ${who}: ${refused.raw}`).toBe(409)
        expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.restOnTheDecision)
        expect(refused.error).toContain(one.id)
        expect(refused.error).toContain(`PUT /api/secretaries/${idOf(one.handle)}/duties`)
        expect(storedDutiesRecord(decision)).toEqual(decisionBefore)
        expect(storedDutiesRecord(one.id)).toEqual(dutiesBefore)

        const another = await aDecision('Another made-up decision for these duties', `The made-up duties ${change} ${who} rest here now.`)
        const restedElsewhere = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, PERSON, { area: String(one.data['area']), restsOn: [another] })
        expect(restedElsewhere.status, restedElsewhere.raw).toBe(200)
        const made = await call('PATCH', `/api/records/${decision}`, headersOf(one.handle), { ...asked, ...payload })
        expect(made.status, `${change} ${who}, once the duties rest elsewhere: ${made.raw}`).toBe(200)
      }
    }
  })

  it("24: a newer decision replacing the one duties rest on is filed, the duties' page names it, and their next change is refused until it rests there", async () => {
    const one = await madeUpDutiesFor('made-up-replaced-under-duties')
    const decision = String((one.data['restsOn'] as string[])[0])
    const dutiesBefore = storedDutiesRecord(one.id)
    const whatThePageReads = async (): Promise<unknown> => {
      const read = await call('GET', `/api/records/${one.id}`, PERSON)
      expect(read.status, read.raw).toBe(200)
      return read.body.restsOnReplacedBy
    }
    expect(await whatThePageReads()).toEqual({})

    // THE PERSON'S DECISION GOES IN, and a second that replaces it in turn: neither is refused for the duties, and
    // nothing moves the duties onto either. The page names the last of the line, the one that stands.
    const newer = { title: 'A made-up newer decision replacing the one under duties', words: `The made-up duties for ${one.handle} rest on the newer decision.` }
    const newerId = await aDecision(newer.title, newer.words, [decision])
    expect(storedDutiesRecord(one.id)).toEqual(dutiesBefore)
    expect(await whatThePageReads()).toEqual({ [decision]: { id: newerId, title: newer.title } })
    const newest = { title: 'A made-up decision replacing the newer one in turn', words: `The made-up duties for ${one.handle} rest on the newest decision.` }
    const newestId = await aDecision(newest.title, newest.words, [newerId])
    expect(storedDutiesRecord(one.id)).toEqual(dutiesBefore)
    expect(await whatThePageReads()).toEqual({ [decision]: { id: newestId, title: newest.title } })

    // THEIR NEXT CHANGE, STILL NAMING THE REPLACED DECISION, is refused on the person's press and on the secretary's
    // warrant alike, naming the decision that stands as the one to rest on, and nothing is written.
    const area = 'A made-up area, changed after its decision was replaced.'
    const stillOnIt = { area, restsOn: [decision] }
    for (const [who, headers, payload] of [
      ['the person', PERSON, {}],
      ['the secretary', as(one.handle), { warrant: aWarrant(one.words, guard.theBindingOf(idOf(one.handle), stillOnIt)) }],
    ] as const) {
      const before = theDutiesAsStored()
      const refused = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, headers, { ...stillOnIt, ...payload })
      expect(refused.status, `${who}: ${refused.raw}`).toBe(400)
      expect(refused.error).toContain(`${decision} ${guard.WHY_DUTIES_ARE_REFUSED.replaced}`)
      expect(refused.error).toContain(`${newestId} ("${newest.title}")`)
      expect(refused.error).not.toContain(newerId)
      expect(theDutiesAsStored()).toBe(before)
    }

    // THE SECRETARY CARRYING THE PERSON'S WORDS from the decision that stands rests the duties there, and the page then
    // names no replaced decision.
    const onTheNewest = { area, restsOn: [newestId] }
    const written = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, as(one.handle), {
      ...onTheNewest,
      warrant: aWarrant(newest.words, guard.theBindingOf(idOf(one.handle), onTheNewest)),
    })
    expect(written.status, written.raw).toBe(200)
    expect(theRecordOf(one.handle).data['restsOn']).toEqual([newestId])
    expect(await whatThePageReads()).toEqual({})
  })

  it('25: the promotion that filed a decision duties rest on is not revoked while they rest on it, and the refusal says the order', async () => {
    const { one, decision, seq } = await dutiesOnAPromotedDecision('made-up-revoked-under-duties')

    // THE PERSON'S REVOKE IS REFUSED, in the delete's sentence with the order added, and nothing is written.
    const revoke = (): ReturnType<typeof call> => call('POST', `/api/records/${decision}/revisions/${String(seq)}/revoke`, PERSON)
    const decisionBefore = storedDutiesRecord(decision)
    const dutiesBefore = storedDutiesRecord(one.id)
    const refused = await revoke()
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.restOnTheDecision)
    expect(refused.error).toContain(one.id)
    expect(refused.error).toContain(`PUT /api/secretaries/${idOf(one.handle)}/duties`)
    expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.changeThemThenRevoke)
    expect(storedDutiesRecord(decision)).toEqual(decisionBefore)
    expect(storedDutiesRecord(one.id)).toEqual(dutiesBefore)

    // ONCE THE PERSON RESTS THE DUTIES ON ANOTHER DECISION, the revoke is made and the decision is retracted.
    const another = await aDecision('Another made-up decision for these duties', 'The made-up revoked duties rest here now.')
    const restedElsewhere = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, PERSON, { area: String(one.data['area']), restsOn: [another] })
    expect(restedElsewhere.status, restedElsewhere.raw).toBe(200)
    const revoked = await revoke()
    expect(revoked.status, revoked.raw).toBe(200)
    expect(storedDutiesRecord(decision).record.deleted_at).not.toBeNull()
  })

  it("26: a decision that duties rest on does not change what it cites to a record that is not the person's own, while they rest on it", async () => {
    // EACH CALLER ON ITS OWN MADE-UP DUTIES, resting on a decision a secretary's promotion filed, which cites a fork the
    // person wrote. Citing instead a note the secretary wrote would leave the duties resting on a decision that is not on
    // the person's own words, so the change is refused as the change of `decided_by` is, and made once the person rests
    // the duties on another decision. Citing another record of the person's own leaves them where they may rest, and is
    // made while they rest there.
    for (const [who, headersOf, payload] of [
      ['on-the-grant', (handle: string) => as(handle), FOR_THE_PERSON],
      ['by-the-person', () => PERSON, {}],
    ] as const) {
      const { one, decision } = await dutiesOnAPromotedDecision(`made-up-reference-${who}`)
      const toTheirOwnNote = { dataPatch: { authority_reference: await aNoteTheSecretaryFiled(one.handle) }, ...payload }
      const decisionBefore = storedDutiesRecord(decision)
      const dutiesBefore = storedDutiesRecord(one.id)
      const refused = await call('PATCH', `/api/records/${decision}`, headersOf(one.handle), toTheirOwnNote)
      expect(refused.status, `${who}: ${refused.raw}`).toBe(409)
      expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.restOnTheDecision)
      expect(refused.error).toContain(one.id)
      expect(refused.error).toContain(`PUT /api/secretaries/${idOf(one.handle)}/duties`)
      expect(storedDutiesRecord(decision)).toEqual(decisionBefore)
      expect(storedDutiesRecord(one.id)).toEqual(dutiesBefore)

      const toAnotherOfTheirs = { dataPatch: { authority_reference: await aForkThePersonFiled(`Another made-up fork, ${who}?`) }, ...payload }
      const madeWhileTheyRest = await call('PATCH', `/api/records/${decision}`, headersOf(one.handle), toAnotherOfTheirs)
      expect(madeWhileTheyRest.status, `${who}, to another record of the person's own: ${madeWhileTheyRest.raw}`).toBe(200)

      await restTheDutiesElsewhere(one, `reference ${who}`)
      const made = await call('PATCH', `/api/records/${decision}`, headersOf(one.handle), toTheirOwnNote)
      expect(made.status, `${who}, once the duties rest elsewhere: ${made.raw}`).toBe(200)
    }
  })
  it('27: a secretary taking away its own duties that rest on a replaced decision is told to rest them on the decision that stands first, and then takes them away', async () => {
    // EACH WAY OF TAKING THEM AWAY, ON ITS OWN MADE-UP DUTIES. The person files a newer decision replacing the one the
    // duties rest on. The secretary, carrying the person's words from the replaced decision, is refused, and the refusal
    // says to rest the duties on the decision that stands and then take them away, not to name it in restsOn, which is
    // what a write is told. The secretary does that, and the delete and the change of kind are made.
    for (const act of ['delete', 'kind', 'move'] as const) {
      const one = await madeUpDutiesFor(`made-up-taken-away-replaced-${act}`)
      const decision = String((one.data['restsOn'] as string[])[0])
      const newer = { title: `A made-up decision replacing the one under duties, ${act}`, words: `The made-up duties for ${one.handle} rest on the newer decision.` }
      const newerId = await aDecision(newer.title, newer.words, [decision])
      const away = guard.theBindingOf(idOf(one.handle), null)
      const ask = (words: string): ReturnType<typeof call> =>
        act === 'delete'
          ? call('DELETE', `/api/records/${one.id}`, as(one.handle), { warrant: aWarrant(words, one.id, away) })
          : act === 'kind'
            ? call('PATCH', `/api/records/${one.id}`, as(one.handle), { kind: 'note', warrant: aWarrant(words, one.id, away) })
            : call('POST', `/api/records/${one.id}/workspace`, as(one.handle), { to: OTHER_PROJECT, warrant: aWarrant(words, one.id, away, guard.theBindingOf(idOf(one.handle), one.data)) })
      const before = theDutiesAsStored()
      const refused = await ask(one.words)
      expect(refused.status, `${act}: ${refused.raw}`).toBe(400)
      expect(refused.error).toContain(`${decision} ${guard.WHY_DUTIES_ARE_REFUSED.replaced}`)
      expect(refused.error).toContain(guard.theWayToTakeThemAway(act, idOf(one.handle), newerId))
      expect(refused.error).not.toContain(guard.theWayToRestThemOn(newerId))
      expect(theDutiesAsStored()).toBe(before)
      if (act === 'move') continue

      const onTheNewer = { area: String(one.data['area']), restsOn: [newerId] }
      const rested = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, as(one.handle), {
        ...onTheNewer,
        warrant: aWarrant(newer.words, guard.theBindingOf(idOf(one.handle), onTheNewer)),
      })
      expect(rested.status, rested.raw).toBe(200)
      const takenAway = await ask(newer.words)
      expect(takenAway.status, `${act}, once they rest on the decision that stands: ${takenAway.raw}`).toBe(200)
      expect(storedDutiesRecord(one.id).record).toMatchObject(act === 'delete' ? { deleted_at: expect.any(String) } : { kind: 'note' })
    }
  })

  it('28: the revoke of an act that would put back a version duties may not rest on is refused, and the refusal says the order', async () => {
    // EACH CHANGE THAT TAKES AWAY WHAT LETS DUTIES REST ON A DECISION, put back by revoking the act a made-up secretary
    // made under the person's grant. Each act left a decision the duties may rest on, and the person rests them there.
    // The person's revoke would put back the version before it, so it is refused, in the change's own sentence with the
    // order in place of its last sentence: the duties first, then the revoke. It is made once the duties rest elsewhere.
    for (const change of ['kind', 'decidedBy', 'authorityReference'] as const) {
      const one = await madeUpDutiesFor(`made-up-put-back-${change.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`)
      const fork = await aForkThePersonFiled(`May the made-up duties rest here, ${change}?`)
      const onTheGrant = (body: Record<string, unknown>): Record<string, unknown> => ({ ...body, ...FOR_THE_PERSON })
      let decision = ''
      if (change === 'kind') {
        // A NOTE THE SECRETARY WROTE, made a decision under the grant, which the person then says they decided.
        decision = await aNoteTheSecretaryFiled(one.handle)
        const act = await call('PATCH', `/api/records/${decision}`, as(one.handle), onTheGrant({ kind: 'decision' }))
        expect(act.status, act.raw).toBe(200)
        const theirs = await call('PATCH', `/api/records/${decision}`, PERSON, {
          dataPatch: { option_taken: `The made-up duties rest here, ${change}.`, decided_by: THE_OWNER, authority_reference: fork },
        })
        expect(theirs.status, theirs.raw).toBe(200)
      } else if (change === 'decidedBy') {
        // A DECISION THE PERSON FILED SAYING A MADE-UP DEPUTY DECIDED IT, changed under the grant to say the person did.
        const filed = await call('POST', '/api/records', PERSON, {
          kind: 'decision',
          title: 'A made-up decision a deputy made',
          data: { option_taken: `The made-up duties rest here, ${change}.`, because: 'A made-up reason.', decided_by: 'made-up-deputy', replaces: [] },
        })
        expect(filed.status, filed.raw).toBe(201)
        decision = String(filed.body.record.id)
        const act = await call('PATCH', `/api/records/${decision}`, as(one.handle), onTheGrant({
          dataPatch: { decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: fork },
        }))
        expect(act.status, act.raw).toBe(200)
      } else {
        // A DECISION A PROMOTION FILED CITING A NOTE THE SECRETARY WROTE, changed under the grant to cite the person's fork.
        const promoted = await call('POST', `/api/records/${fork}/promote`, as(one.handle), {
          title: 'A made-up decision a promotion filed',
          data: { because: 'A made-up reason the person gave.', authority_reference: await aNoteTheSecretaryFiled(one.handle) },
          warrant: aWarrant('Yes, the made-up duties may rest on it.', fork),
        })
        expect(promoted.status, promoted.raw).toBe(201)
        const read = await call('GET', `/api/records/${fork}`, PERSON)
        decision = String((read.body.onThePersonsWords as { recordId: string }[])[0]?.recordId)
        const act = await call('PATCH', `/api/records/${decision}`, as(one.handle), onTheGrant({ dataPatch: { authority_reference: fork } }))
        expect(act.status, act.raw).toBe(200)
      }
      const rested = await call('PUT', `/api/secretaries/${idOf(one.handle)}/duties`, PERSON, { area: String(one.data['area']), restsOn: [decision] })
      expect(rested.status, `${change}: ${rested.raw}`).toBe(200)
      const theAct = t.client.sqlite.prepare('SELECT seq FROM revisions WHERE record_id = ? AND elevation IS NOT NULL ORDER BY seq DESC LIMIT 1').get(decision) as { seq: number } | undefined
      expect(theAct, `${change}: the act under the grant is in the decision's history`).toBeDefined()
      const revoke = (): ReturnType<typeof call> => call('POST', `/api/records/${decision}/revisions/${String(theAct?.seq)}/revoke`, PERSON)

      const decisionBefore = storedDutiesRecord(decision)
      const dutiesBefore = storedDutiesRecord(one.id)
      const refused = await revoke()
      expect(refused.status, `${change}: ${refused.raw}`).toBe(409)
      expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.restOnTheDecision)
      expect(refused.error).toContain(one.id)
      expect(refused.error).toContain(`PUT /api/secretaries/${idOf(one.handle)}/duties`)
      expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.changeThemThenRevokeTheAct)
      expect(refused.error).not.toContain(guard.THE_ACTS_ON_A_DECISION[change].then)
      expect(storedDutiesRecord(decision)).toEqual(decisionBefore)
      expect(storedDutiesRecord(one.id)).toEqual(dutiesBefore)

      await restTheDutiesElsewhere(one, `revoke ${change}`)
      const revoked = await revoke()
      expect(revoked.status, `${change}, once the duties rest elsewhere: ${revoked.raw}`).toBe(200)
    }
  })

  it("29: two live decisions replace the one duties rest on, and the decision's page, the duties' page, the list, what governs a file and the governs check name one: the first filed, then the last of its line", async () => {
    const one = await madeUpDutiesFor('made-up-replaced-twice')
    const decision = String((one.data['restsOn'] as string[])[0])
    // THE PERSON SAYS WHAT THE DECISION GOVERNS, so the answer to which decisions govern a file lists it too.
    const place = 'made-up/replaced-twice.ts'
    const governs = await call('PATCH', `/api/records/${decision}`, PERSON, { dataPatch: { governs: [{ path: place }] } })
    expect(governs.status, governs.raw).toBe(200)
    // THE FIRST FILED replaces nothing when it is filed. The second filed names the decision in `replaces`, so its link is
    // the first stored. The person then links the first filed as replacing the decision too, through the links door.
    const first = { id: '', title: 'A made-up decision filed first, linked as replacing it afterwards' }
    const second = { id: '', title: 'A made-up decision filed second, replacing it when filed' }
    first.id = await aDecision(first.title, 'The made-up duties rest on the first filed replacement.')
    second.id = await aDecision(second.title, 'The made-up duties rest on the second filed replacement.', [decision])
    const linked = await call('POST', '/api/links', PERSON, { fromId: first.id, toId: decision, type: 'supersedes' })
    expect(linked.status, linked.raw).toBe(201)
    // A TASK STILL CITES THE DECISION, filed after the first filed and before the second, so the governs check lists the
    // decision as replaced and still cited only when it counts from the first filed, and names what stands in its place.
    const task = await call('POST', '/api/records', PERSON, { kind: 'task', title: 'A made-up task citing the replaced decision', data: { state: 'todo' } })
    expect(task.status, task.raw).toBe(201)
    const citing = await call('POST', '/api/links', PERSON, { fromId: String(task.body.record.id), toId: decision, type: 'relates_to' })
    expect(citing.status, citing.raw).toBe(201)
    ;[decision, first.id, second.id].forEach((id, i) => {
      t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(`2026-10-01 10:${String(10 + i)}:00`, id)
    })
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2026-10-01 10:11:30', String(task.body.record.id))
    const whatThePagesRead = async (): Promise<unknown[]> => {
      const own = await call('GET', `/api/records/${decision}`, PERSON)
      const duties = await call('GET', `/api/records/${one.id}`, PERSON)
      const list = await call('GET', '/api/records?kind=decision&replaced=include&limit=500&shape=full', PERSON)
      const governing = await call('GET', `/api/decisions/governing?path=${encodeURIComponent(place)}`, PERSON)
      const check = await call('GET', '/api/decisions/governs-check', PERSON)
      for (const read of [own, duties, list, governing, check]) expect(read.status, read.raw).toBe(200)
      const row = (list.body.records as { id: string; replacedBy?: unknown }[]).find((listed) => listed.id === decision)
      const governed = (governing.body.decisions as { id: string; replacedBy: unknown }[]).find((listed) => listed.id === decision)
      const cited = (check.body.stillCited as { replaced: { id: string }; replacedBy: { id: string; title: string } }[]).find((listed) => listed.replaced.id === decision)
      return [
        own.body.replacedBy,
        (duties.body.restsOnReplacedBy as Record<string, unknown>)[decision],
        row?.replacedBy,
        governed?.replacedBy,
        cited === undefined ? undefined : { id: cited.replacedBy.id, title: cited.replacedBy.title },
      ]
    }
    expect(await whatThePagesRead()).toEqual([first, first, first, first, first].map(({ id, title }) => ({ id, title })))

    // THE FIRST FILED IS REPLACED IN TURN, and every page then names the last of its line, not the second filed.
    const third = { id: '', title: 'A made-up decision replacing the first filed in turn' }
    third.id = await aDecision(third.title, 'The made-up duties rest on the end of the line.', [first.id])
    expect(await whatThePagesRead()).toEqual([third, third, third, third, third].map(({ id, title }) => ({ id, title })))
  })
})
