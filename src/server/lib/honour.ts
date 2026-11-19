// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HONOUR READING: FIVE SIGNALS READ FROM RECORDS ONLY, criterion HB2 of
 * design/honour-board/ACCEPTANCE.md, and what the reading itself cost, criterion HB6.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE SENTENCES THIS FILE IS HELD TO
 * ---------------------------------------------------------------------------------------
 *
 * Never a re-reading of a session: nothing here opens a transcript, a log or a conversation. Every
 * signal is worked out of rows the office already holds, through the record doors below and the
 * seal reader over the sealed-tip keys. No model is asked: the marking is an ordinary function
 * call, and this file imports nothing that speaks a protocol. From results: a run is praised for
 * what it left behind in records, never for how it sounded.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE SIGNALS, EACH READ FROM ONE PLACE
 * ---------------------------------------------------------------------------------------
 *
 * 1. `corrected its brief` — a message whose `aboutRun` is this run, written by the agent this run
 *    serves (the message record's own change log names that agent as its writer), addressed to the
 *    agent's starter, whose words say the brief was wrong. Evidence: the message record's id.
 * 2. `found a real defect outside its brief` — a problem whose `found_by` names this run, which
 *    has reached one of the settled states (`fixed`, `worked_around`, `accepted`), and whose title
 *    the text of the brief kept about this run does not already name. The brief is the `note`
 *    record kept about the run, criterion HB4; with no brief kept the signal is missing rather
 *    than guessed, because "outside its brief" is exactly what the missing text was for.
 * 3. `caught a blocking defect in review` — a refusal some run carries whose `by` is the agent
 *    this run serves, and which stood: the refused run was released after the refusal, or the
 *    refusal's finding reached a problem in a settled state. Evidence: the refused run's id.
 * 4. `needed no rework` — a check released this run (its `released` is stored), no `refused` is
 *    stored beside it, the office asked for a check of this run once in its whole history, and no
 *    second run of the same agent (its `servingAgent`) in the same working directory was started. Where no check
 *    released this run, the missing reason is the acceptance's own words: no check was asked for
 *    this run.
 * 5. `proved every test by mutation` — the seal this run filed names files under `tests/` (the
 *    test files its commits added or changed), and this run's report names a mutation proof with
 *    a hash for every one of them: the report's text mentions each file and carries a sha hash
 *    beside one of its mentions, wherever in the report that is. The report is found through `theReportOfARun`, the one finder below: the seal's
 *    pinned records first, then an `about` link, then the run's own session's change rows.
 *    A test file the run carries unchanged keeps the proof it was given (`theProofsCarried`): an
 *    earlier sealed run of the same agent sealed the same path with the same bytes, and that run's
 *    report names a mutation proof with a hash for it.
 *    Evidence: the report record's id, then the id of each earlier report that proved a carried file.
 *
 * A signal the office cannot read is a `missing` entry with the sentence, never an invented one.
 */

import { everyAgentAStoredStampCouldName, listChanges, listRecords, getRecord, patchRecord, recordInWorkspace, resolveLinks, THE_HONOUR_KEY, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import type { PanelRecord } from '@shared/types.ts'
import { readRunSeal } from './sealed-tip.ts'
import type { SealedFile } from '@shared/sealed-tip.ts'
import { theAgentOfARun, theAgentsOfTheseRuns, wroteIt } from './inspection.ts'
import { theStampsReadOnce, type TheStampsOf } from './registry-aliases/stamps.ts'
import { type RegisteredAgent } from './participants.ts'
import { listParticipants } from '../db/list-participants.ts'
import { sqlite } from '../db/client.ts'
import { PROBLEM_STATES } from '@shared/kinds.ts'
import { localStamp, nowStamp } from '@shared/time.ts'
import { theMessagesHiddenFrom, type AMessageReader } from './messages.ts'

/** The five words, and nothing else: the acceptance names them, and this list is their record. */
export const HONOUR_SIGNALS = [
  'corrected its brief',
  'found a real defect outside its brief',
  'caught a blocking defect in review',
  'needed no rework',
  'proved every test by mutation',
] as const

export type HonourSignal = (typeof HONOUR_SIGNALS)[number]

/** One signal the reading earned, with the record ids that say so and when it was read. */
export interface HonourSignalEntry {
  signal: HonourSignal
  evidence: string[]
  read_at: string
}

/** One signal the reading could not earn, with the reason in one sentence. */
export interface HonourMissingEntry {
  signal: HonourSignal
  because: string
}

/** What the reading cost, criterion HB6: records it touched, milliseconds it took. */
export interface HonourCost {
  records: number
  ms: number
}

export type HonourStanding = 'exemplary' | 'noted' | 'none'

export interface HonourReading {
  read_at: string
  standing: HonourStanding
  threshold: number
  signals: HonourSignalEntry[]
  missing: HonourMissingEntry[]
  cost: HonourCost
}

/** The threshold of two is the secretary's choice, written here plain, where it can be changed. */
export const HONOUR_THRESHOLD = 2

/** How the count of earned signals reads as its name. */
export function theStandingFor(count: number): { standing: HonourStanding; threshold: number } {
  return {
    standing: count >= HONOUR_THRESHOLD ? 'exemplary' : count === 1 ? 'noted' : 'none',
    threshold: HONOUR_THRESHOLD,
  }
}

/** A settled finding is one somebody reached: `fixed`, `worked_around` and `accepted`, never `open` and never no word at all. */
const SETTLED_PROBLEM_STATES = new Set<string>(PROBLEM_STATES.filter((one) => one !== 'open'))

/**
 * THE FLAT TEXT OF ONE RECORD, for the two signals that read words: its title and the text of
 * every block under its body containers, however deep the nesting goes. Unreadable blocks
 * contribute none and raise nothing.
 */
function theTextOf(record: Pick<PanelRecord, 'title' | 'data'>): string {
  const words: string[] = [record.title]
  const one = (block: unknown): void => {
    if (block === null || typeof block !== 'object' || Array.isArray(block)) return
    const held = block as Record<string, unknown>
    if (typeof held['text'] === 'string') words.push(held['text'])
    if (typeof held['caption'] === 'string') words.push(held['caption'])
    for (const key of ['blocks', 'columns', 'tabs'] as const) {
      if (!Array.isArray(held[key])) continue
      for (const deeper of held[key] as unknown[]) {
        if (Array.isArray(deeper)) deeper.forEach(one)
        else one(deeper)
      }
    }
  }
  const data = (record.data ?? {}) as Record<string, unknown>
  for (const key of ['blocks', 'summaryBlocks'] as const) {
    if (Array.isArray(data[key])) (data[key] as unknown[]).forEach(one)
  }
  if (typeof data['body'] === 'string') words.push(data['body'])
  return words.join('\n')
}

/** True when the sealed path sits under a folder of tests, at any depth of the tree. */
function isTestPath(path: string): boolean {
  return path === 'tests' || path.startsWith('tests/') || path.includes('/tests/')
}

/** A hash is sixty-four hex characters, which is the length of a sha256 the proof prints. */
const A_HASH = /[a-f0-9]{64}/

/**
 * DOES A REPORT'S TEXT, lowercased, NAME A MUTATION PROOF WITH A HASH FOR THIS TEST FILE? A hash within 400 characters
 * of any mention of the file's name proves it. Signal five says why every mention is read.
 */
function theTextProves(text: string, path: string): boolean {
  const base = (path.split('/').pop() ?? path).toLowerCase()
  for (let at = text.indexOf(base); at !== -1; at = text.indexOf(base, at + 1)) {
    if (A_HASH.test(text.slice(Math.max(0, at - 400), at + 400))) return true
  }
  return false
}

/**
 * THE PROOFS A RUN CARRIES, signal 5 (item 23, 30 October 2026). A round does not prove again a test file it carries
 * unchanged from an earlier round of its line, so the reading asks the earlier runs for it. A test file is proved when
 * an earlier sealed run of the same agent sealed the same path with the same bytes, and that run's report names a
 * mutation proof with a hash for it, read by the rule this run's report is read by. The newest earlier run is asked
 * first. A file whose bytes changed since was not proved as it is now, and a run of another agent, or a run started
 * after this one, is not this run's line.
 *
 * An earlier run's seal is read as this run's is: one that no longer reads stops the reading, and says which. Each
 * earlier seal read is one record of the cost, and every record the report search opened is counted as well.
 */
function theProofsCarried(input: {
  files: SealedFile[]
  run: PanelRecord
  sessions: PanelRecord[]
  workspaceId: string
  agent: RegisteredAgent | null
  isTheRunsAgent: (stamp: string) => boolean
}): { proved: Set<string>; reports: string[]; examined: number } {
  const proved = new Set<string>()
  const reports: string[] = []
  let examined = 0
  // EARLIER IS THE ORDER THE OFFICE STORED THE RUNS IN: the stored stamp, then the row's place, as the office's other
  // readers order records. A stamp is whole seconds, so two runs filed in one second are told apart by the row. These
  // are places of rows the project's scan already counted, so they add no record to the cost.
  const here = sqlite.prepare('SELECT created_at AS at, rowid AS n FROM records WHERE id = ?').get(input.run.id) as { at: string; n: number } | undefined
  if (here === undefined) throw new Error(`The run ${input.run.id} was read, and its row is not there.`)
  const before = new Map(
    (sqlite
      .prepare(
        "SELECT id, created_at AS at, rowid AS n FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL " +
          'AND (created_at < ? OR (created_at = ? AND rowid < ?))',
      )
      .all(input.workspaceId, here.at, here.at, here.n) as { id: string; at: string; n: number }[]).map((row) => [row.id, row]),
  )
  const earlier = input.sessions
    .filter((one) => {
      const held = (one.data ?? {}) as Record<string, unknown>
      return before.has(one.id) && typeof held['sealedTip'] === 'string' &&
        typeof held['servingAgent'] === 'string' && input.isTheRunsAgent(held['servingAgent'])
    })
    .sort((a, b) => {
      const x = before.get(a.id)!
      const y = before.get(b.id)!
      return x.at === y.at ? y.n - x.n : x.at < y.at ? 1 : -1
    })
  for (const one of earlier) {
    const waiting = input.files.filter((file) => file.hash !== null && !proved.has(file.path))
    if (waiting.length === 0) break
    const sealed = readRunSeal(one.id)?.seal.git?.files ?? []
    examined += 1
    const same = waiting.filter((file) => sealed.some((was) => was.path === file.path && was.hash === file.hash))
    if (same.length === 0) continue
    const found = theReportOfARun({ runId: one.id, workspaceId: input.workspaceId, agent: input.agent })
    examined += found.examined
    if (found.report === null) continue
    const text = theTextOf(found.report).toLowerCase()
    const these = same.filter((file) => theTextProves(text, file.path))
    for (const file of these) proved.add(file.path)
    if (these.length > 0 && !reports.includes(found.report.id)) reports.push(found.report.id)
  }
  return { proved, reports, examined }
}

/**
 * THE THREE WAYS A RUN'S REPORT CAN BE FOUND, in the order the reading asks them, criterion HB2
 * signal 5 and criterion HB4's `report` field — both read through this one place.
 *
 * Workers file their report without an `about` link to the run: this is the real filing practice of
 * the corpus (the inspector's refusal of 16 September 12:16, checks/EY8j_o2oBXDe, verified on five
 * finished sessions). So the reading asks, in order:
 *
 *   1. `seal-pinned` — the records the run's own seal pinned (the `records` half of the seal this
 *      run filed at its finish), of kind `report` and written by the agent the run serves, read
 *      through `wroteIt` in `src/server/lib/inspection.ts`, which is what the inspector's own
 *      reading uses.
 *   2. `about-link` — the older reading: a report record linked `about` this run, where one exists.
 *   3. `session-changes` — the reports whose `create` change row carries this run's own session id,
 *      which cells only the run's own session can fill; the newest of them is the report read.
 *
 * Where none of the three holds a report, `report` is null and `foundBy` is null: nobody's word is
 * invented, and the reading says the absence instead.
 */
export type TheWayAReportWasFound = 'seal-pinned' | 'about-link' | 'session-changes'

export interface TheReportHeardOf {
  report: PanelRecord | null
  foundBy: TheWayAReportWasFound | null
  /** How many records the search actually opened, so the reading can count it against its cost. */
  examined: number
}

export function theReportOfARun(input: { runId: string; workspaceId: string; agent: RegisteredAgent | null; stampsOf?: TheStampsOf }): TheReportHeardOf {
  let examined = 0
  // ------------------------------------------------------------------- one: the seal's pinned records
  const pinnedIds = readRunSeal(input.runId)?.seal.records?.records.map((one) => one.id) ?? []
  const stampsOf = input.stampsOf ?? theStampsReadOnce(sqlite)
  for (const id of pinnedIds) {
    const record = getRecord(id)
    examined += 1
    if (record === null || record.kind !== 'report') continue
    if (input.agent === null || !wroteIt(input.agent, id, stampsOf(input.agent))) continue
    return { report: record, foundBy: 'seal-pinned', examined }
  }
  // --------------------------------------------------------------------------- two: the about link
  for (const link of resolveLinks(input.runId)) {
    if (link.type !== 'about' || !link.isBacklink || link.broken) continue
    const record = getRecord(link.other.id)
    examined += 1
    if (record === null || record.kind !== 'report') continue
    return { report: record, foundBy: 'about-link', examined }
  }
  // ------------------------------------------------- three: the run's own session's create change rows
  // THE CHANGE LOG CARRIES THE SESSION: every create row a run's own session wrote holds that run's
  // id in `session_id`, which is what makes this search the run's own words and nobody else's.
  const fromTheSession =
    (sqlite
      .prepare(
        'SELECT c.record_id AS id FROM changes c JOIN records r ON r.id = c.record_id ' +
          "WHERE r.kind = 'report' AND r.deleted_at IS NULL AND r.workspace_id = ? AND c.op = 'create' " +
          "AND c.actor_type = 'agent' AND c.session_id = ? ORDER BY c.rowid DESC LIMIT 1",
      )
      .all(input.workspaceId, input.runId) as { id: string }[])
  examined += fromTheSession.length
  for (const row of fromTheSession) {
    const record = getRecord(row.id)
    if (record === null) continue
    return { report: record, foundBy: 'session-changes', examined }
  }
  return { report: null, foundBy: null, examined }
}

/**
 * DOES THIS STORED STAMP NAME THE AGENT THIS RUN SERVES? Both sides are stored, so neither is
 * resolved by the arriving resolver (criterion I2, as amended on 16 September 2026).
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT `sameAgent`
 * ---------------------------------------------------------------------------------------
 *
 * `sameAgent` resolves its second argument with `participantForActor`, which is the ARRIVING
 * resolver: it throws 409 where one string is one agent's id and another live agent's handle. That
 * is right for a request, whose sender can be told to send its id instead, and wrong here. Both
 * values this asks about were written earlier by somebody who has gone: a writer's stamp off the
 * revision ledger, and the agent a refusal names. Nobody is left to ask. One ambiguous stamp in a
 * message's change log would have thrown out of the `find` that reads it, and
 * `GET /honour-board/runs/:run` does not catch, so that run's honour board would answer 409 instead
 * of a reading. Refusal H97ABDlJVUoO, which is the shape of problem 1depXfmbfVH9.
 *
 * WHAT IT ANSWERS INSTEAD. A stamp that names one agent is compared by registry id. A stamp two
 * agents could answer is NOBODY: not this run's agent, no throw, and the signal falls to its
 * `cannot` sentence like any other evidence the office cannot place.
 *
 * WHERE NEITHER SIDE IS REGISTERED, THE TWO STRINGS ARE COMPARED WHOLE, which is what `sameAgent`
 * does in the same case and for the same reason: the office's own writers hold no registry row on
 * purpose, and a run serving one of them must still be able to own its evidence.
 */
function theStampNamesTheRunsAgent(stamp: string, runsAgentId: string | null, serving: string): boolean {
  const named = everyAgentAStoredStampCouldName(stamp)
  if (named.length > 1) return false
  if (named.length === 1) return runsAgentId !== null && named[0]!.id === runsAgentId
  return runsAgentId === null && stamp.trim() !== '' && stamp.trim() === serving.trim()
}

/**
 * THE READING OF ONE RUN. It must be a session record of this project; everything else the
 * records hold it folds in or names as missing. It is the office's own reading, pressed by
 * `storeTheHonourReading` at a run's close and by the read door on demand — never on a timer.
 *
 * THE COST IS COUNTED AS IT IS SPENT (HB6). Every record the reading examined — the run, every
 * row of the scans over the project's run and message and problem records, every note, report and
 * neighbour fetched by a link — adds one to `cost.records`, and the whole touch is `cost.ms`. A
 * scan is no cheaper to make against a record than a read by id, and a cost that ignored the
 * records a scan walked would be dressed up lower than it costs.
 */
export function readTheHonourOfARun(input: { runId: string; workspaceId: string }): HonourReading {
  const beganMs = Date.now()
  const signals: HonourSignalEntry[] = []
  const missing: HonourMissingEntry[] = []
  const read_at = nowStamp()
  let records = 0
  const earned = (signal: HonourSignal): boolean => signals.some((one) => one.signal === signal)

  const earn = (signal: HonourSignal, evidence: string[]): void => {
    signals.push({ signal, evidence, read_at: nowStamp() })
  }
  const cannot = (signal: HonourSignal, because: string): void => {
    // ONE missing entry per signal, and the FIRST reason the reading founded is the one it keeps:
    // a later signal from a different folder of the same sentence said no more than the first.
    if (missing.some((one) => one.signal === signal)) return
    missing.push({ signal, because })
  }

  // ----------------------------------------------------------------------------- the run itself
  // READ IN THIS PROJECT, NOT BY BARE ID. A session record is unique across the database, so
  // `getRecord` would have answered about a run filed in another project while every scan below was
  // scoped to this one. The reading is about one run of one project, so the record door that says
  // which project an id is really in is the one asked.
  const run = recordInWorkspace(input.runId, input.workspaceId)
  records += 1
  if (run.kind !== 'session') throw new PanelError(`Record ${input.runId} is a ${run.kind}, not a session, and the five signals read off a run. Nothing was read.`, 400)

  const agent = theAgentOfARun(run)
  const data = (run.data ?? {}) as Record<string, unknown>
  const handle = agent?.handle ?? (typeof data['servingAgent'] === 'string' ? (data['servingAgent'] as string) : null)
  const starter = agent?.startedBy ?? null
  const runCwd = typeof data['workingDirectory'] === 'string' ? (data['workingDirectory'] as string) : ''
  const serving = handle ?? ''
  // THE RUN'S OWN AGENT AS A REGISTRY ID, worked out once for the two readings that ask whether a
  // stored stamp is this agent. `theAgentOfARun` has already placed it where it could; where it
  // could not, the stored `servingAgent` is placed by the same stored reader, and a name two agents
  // answer leaves this null, which makes every comparison below "nobody".
  const placed = agent === null ? everyAgentAStoredStampCouldName(serving) : []
  const runsAgentId = agent?.id ?? (placed.length === 1 ? placed[0]!.id : null)

  // ---------------------------------------------------------- the run records of the project
  const sessions = listRecords({ workspaceId: input.workspaceId, kind: 'session' })
  records += sessions.length

  // ------------------------------------------------------------------------- one: corrected its brief
  {
    let said: string | null = null
    const messages = listRecords({ workspaceId: input.workspaceId, kind: 'message' })
    records += messages.length
    for (const message of messages) {
      const held = (message.data ?? {}) as Record<string, unknown>
      if (held['aboutRun'] !== input.runId) continue
      if (!theTextOf({ title: message.title, data: held }).toLowerCase().includes('brief')) continue
      said ??= ''
      // FROM THE RUN'S OWN AGENT, read off the message record's own change log: the actor that
      // wrote the record is the whole of whose words the message holds. Both sides are STORED
      // stamps, so both are placed by the stored reader above: by exact id, then by the one agent
      // bearing the string as a handle. A raw string compare would miss an agent that wrote under
      // its handle, and the arriving resolver would throw on a name two agents answer.
      const writer = listChanges({ workspaceId: input.workspaceId, recordId: message.id }).find(
        (row) => row.actorType === 'agent' && theStampNamesTheRunsAgent(row.actorId, runsAgentId, serving),
      )
      if (writer === undefined) {
        cannot(HONOUR_SIGNALS[0], 'the messages about this run that say its brief was wrong were not written by the agent the run serves.')
        continue
      }
      const to = Array.isArray(held['to']) ? (held['to'] as unknown[]) : []
      const addressed = starter !== null && to.some(
        (one) => one !== null && typeof one === 'object' && !Array.isArray(one) &&
          (one as Record<string, unknown>)['kind'] === starter.kind &&
          (one as Record<string, unknown>)['id'] === starter.id,
      )
      if (!addressed) {
        cannot(HONOUR_SIGNALS[0], 'no message saying the brief was wrong is addressed to the starter who wrote the brief.')
        continue
      }
      if (!earned(HONOUR_SIGNALS[0])) earn(HONOUR_SIGNALS[0], [message.id])
    }
    // NO MESSAGE AT ALL IS ALSO A REAL ANSWER: a run whose messages say nothing about its brief has
    // no said correction, and the reading names the absence instead of staying quiet.
    if (said === null) cannot(HONOUR_SIGNALS[0], 'no message this run wrote to its starter says the brief was wrong.')
  }

  // --------------------------------------------------------------- two: a defect outside its brief
  {
    // THE BRIEF KEPT ABOUT THE RUN (criterion HB4) is the whole of what can tell a defect outside
    // it apart from one it was briefed on. Nothing else here is a brief.
    let briefText: string | null = null
    let briefId: string | null = null
    for (const link of resolveLinks(input.runId)) {
      if (link.type !== 'about' || !link.isBacklink || link.broken) continue
      const note = getRecord(link.other.id)
      records += 1
      if (note === null || note.kind !== 'note') continue
      if (briefText === null) {
        briefText = theTextOf(note)
        briefId = note.id
      }
    }

    const problems = listRecords({ workspaceId: input.workspaceId, kind: 'problem' })
    records += problems.length
    let because = 'no problem whose `found_by` names this run has reached a settled state yet.'
    for (const problem of problems) {
      const held = (problem.data ?? {}) as Record<string, unknown>
      const foundBy = typeof held['found_by'] === 'string' ? (held['found_by'] as string) : ''
      if (!foundBy.includes(input.runId)) continue
      const state = typeof held['state'] === 'string' ? (held['state'] as string) : ''
      if (!SETTLED_PROBLEM_STATES.has(state)) {
        because = `the problem whose \`found_by\` names this run is still at \`${state || 'no state'}\`, and a finding nobody reached is not a sealed one.`
        continue
      }
      if (briefText === null) {
        cannot(HONOUR_SIGNALS[1], 'the brief this run worked from is not kept about it, so a defect outside that brief cannot be told apart from one it was briefed on.')
        continue
      }
      const title = problem.title.toLowerCase()
      if (title !== '' && briefText.toLowerCase().includes(title)) {
        because = 'the defect it found is a thing the brief it worked from already named, so it is inside the brief and not a discovery.'
        continue
      }
      if (!earned(HONOUR_SIGNALS[1])) {
        earn(HONOUR_SIGNALS[1], briefId === null ? [problem.id] : [problem.id, briefId])
      }
    }
  }

  // ------------------------------------------------------- three: caught a blocking defect in review
  {
    // WHO WROTE A REFUSAL, read from records only. A refusal is stored on the run it was written
    // against, with `by` naming the agent that refused. Which RUN of that agent refused is named by
    // the office's own chain: the check-start message (`theCheck.message` on the refused run) is
    // the message the office started the checking run with, so the run that carries that message
    // id in its own `deliveringMessage` is the run that read the work. A refusal by this run's
    // agent whose checking run cannot be found is refused as evidence rather than guessed at.
    const checkingRunOf = new Map<string, string>()
    for (const one of sessions) {
      const delivered = (one.data ?? {}) as Record<string, unknown>
      if (typeof delivered['deliveringMessage'] === 'string') {
        checkingRunOf.set(delivered['deliveringMessage'] as string, one.id)
      }
    }

    for (const one of sessions) {
      const held = (one.data ?? {}) as Record<string, unknown>
      if (held['refused'] === undefined) continue
      const refused = (held['refused'] ?? null) as { by?: { kind?: unknown; id?: unknown }; at?: unknown } | null
      if (refused === null || typeof refused !== 'object') continue
      const by = refused.by
      // TWO STORED STAMPS, placed by the stored reader rather than compared as strings, so the
      // agent that wrote the refusal is found whether the run or the refusal named it by handle or
      // by id, and a name two agents answer is nobody rather than a throw.
      if (by === null || typeof by !== 'object' || by['kind'] !== 'agent' || typeof by['id'] !== 'string' ||
        !theStampNamesTheRunsAgent(by['id'], runsAgentId, serving)) continue
      // THE CHECKING RUN THIS REFUSAL CAME FROM, from the message the office asked the check with.
      // Where this very run carries that message, this run is the one that read the work. Where no
      // run carries it, the refusal is nobody's word about nothing.
      const checkMessage = (held['theCheck'] ?? null) as { message?: unknown } | null
      const startedByAMessage =
        checkMessage !== null && typeof checkMessage === 'object' &&
        typeof checkMessage['message'] === 'string' && checkingRunOf.get(checkMessage['message'] as string) === input.runId
      if (!startedByAMessage) {
        cannot(HONOUR_SIGNALS[2], `the refusal against run ${one.id} names the agent this run serves, and the office's records do not show this run as the one that read it.`)
        continue
      }
      const whenRefused = refusedAt(refused)
      const released = (held['released'] ?? null) as { at?: unknown } | null
      const whenReleased = releasedAt(released)
      const stoodByRelease = whenReleased !== null && whenRefused !== null && whenReleased >= whenRefused
      const stoodByFinding = sessions.some((target) => {
        const targetData = (target.data ?? {}) as Record<string, unknown>
        return typeof targetData['found_by'] === 'string' &&
          (targetData['found_by'] as string).includes(one.id) &&
          typeof targetData['state'] === 'string' &&
          SETTLED_PROBLEM_STATES.has(targetData['state'] as string)
      })
      if (!stoodByRelease && !stoodByFinding) {
        cannot(HONOUR_SIGNALS[2], `the refusal by the agent this run serves, against run ${one.id}, did not stand: it was answered by neither a release nor a settled finding.`)
        continue
      }
      if (!earned(HONOUR_SIGNALS[2])) earn(HONOUR_SIGNALS[2], [one.id])
    }
  }

  // ----------------------------------------------------------------------- four: needed no rework
  {
    const released = (data['released'] ?? null) as { at?: unknown; check?: unknown } | null
    if (released === null || typeof released !== 'object') {
      cannot(HONOUR_SIGNALS[3], 'no check was asked for this run')
    } else if (data['refused'] !== undefined && data['refused'] !== null) {
      cannot(HONOUR_SIGNALS[3], 'a check refused this run once, and the rebuttal that followed is the rework the signal reads the absence of.')
    } else if (listChanges({ workspaceId: input.workspaceId, recordId: input.runId }).filter((row) => row.field === 'data.theCheck').length > 1) {
      cannot(HONOUR_SIGNALS[3], 'the office asked for a check of this run more than once, so it was not released at the first asking.')
    } else {
      // A SECOND RUN OF THE SAME AGENT, in the same folder. A session of another agent there, such as
      // an inspector's check started in the worker's folder, is not this agent's rework (session
      // FFsyr8o6L6A8, problem Nn3781Q8frhE). The agent is placed by the stored reader, as above.
      const again = sessions.find((one) => {
        if (one.id === input.runId) return false
        const held = (one.data ?? {}) as Record<string, unknown>
        return typeof held['workingDirectory'] === 'string' && (held['workingDirectory'] as string) === runCwd &&
          typeof held['servingAgent'] === 'string' && theStampNamesTheRunsAgent(held['servingAgent'] as string, runsAgentId, serving)
      })
      if (again !== undefined) {
        cannot(HONOUR_SIGNALS[3], `a second run of the same agent in the same working directory was started (run ${again.id}), so the run was not whole at its first finish.`)
      } else {
        const check = (released['check'] ?? null) as unknown
        earn(HONOUR_SIGNALS[3], [typeof check === 'string' && check !== '' ? check : input.runId])
      }
    }
  }

  // ------------------------------------------------------------ five: proved every test by mutation
  {
    // THE COMMIT AND THE TEST FILES, off the seal: records only. `readRunSeal` reads the
    // `sealedTip` key stored on this run's own session record and nothing beside it.
    const submission = readRunSeal(input.runId)
    const ofTheSeal = submission?.seal.git ?? null
    const sealedTests = ofTheSeal === null ? [] : ofTheSeal.files.filter((one) => isTestPath(one.path))
    const testFiles = sealedTests.map((one) => one.path)
    if (testFiles.length === 0 && ofTheSeal !== null) {
      cannot(HONOUR_SIGNALS[4], `the work this run sealed manages no paths under \`tests/\` (area: ${ofTheSeal.files.length ? ofTheSeal.files[0]!.path : '(none)'}).`)
    } else if (testFiles.length === 0) {
      cannot(HONOUR_SIGNALS[4], 'no seal was put on this run\u2019s submission, so the test files its commits added or changed cannot be named.')
    } else {
      // THE REPORT THE RUN FILED, read through the one finder (the seal's pinned records first,
      // then an `about` link, then the run's own session's change rows), so signal 5 and HB4's
      // `report` field name one place. Each record the search opened is one read.
      const found = theReportOfARun({ runId: input.runId, workspaceId: input.workspaceId, agent })
      records += found.examined
      const report = found.report
      if (report === null) {
        cannot(HONOUR_SIGNALS[4], 'no report record is filed about this run, so a mutation proof with a hash is a number nothing names.')
      } else {
        const text = theTextOf(report).toLowerCase()
        // EVERY MENTION OF THE FILE IS READ, not only its first: a report may list its files in one
        // block and give each one's hash in a later one (report TrfdiT-oCC9Q, problem Nn3781Q8frhE).
        const ownUnproved = sealedTests.filter((file) => !theTextProves(text, file.path))
        const carried = ownUnproved.length === 0
          ? { proved: new Set<string>(), reports: [], examined: 0 }
          : theProofsCarried({
            files: ownUnproved,
            run,
            sessions,
            workspaceId: input.workspaceId,
            agent,
            isTheRunsAgent: (stamp) => theStampNamesTheRunsAgent(stamp, runsAgentId, serving),
          })
        records += carried.examined
        const unproved = ownUnproved.map((file) => file.path).filter((path) => !carried.proved.has(path))
        if (unproved.length > 0) {
          cannot(HONOUR_SIGNALS[4], `the report names a mutation proof with a hash for ${theCount(testFiles.length - unproved.length)} of ${theCount(testFiles.length)} test files this run changed, counting each one an earlier sealed run of the same agent sealed with the same bytes and proved; these are without one: ${unproved.join(', ')}.`)
        } else {
          earn(HONOUR_SIGNALS[4], [report.id, ...carried.reports.filter((id) => id !== report.id)])
        }
      }
    }
  }

  return {
    read_at,
    ...theStandingFor(signals.length),
    signals,
    missing,
    cost: { records, ms: Date.now() - beganMs },
  }
}

/** Parse one refusal's stamp, null when nothing readable is stored. */
function refusedAt(refused: { at?: unknown }): number | null {
  if (typeof refused['at'] !== 'string') return null
  const at = Date.parse(refused['at'])
  return Number.isFinite(at) ? at : null
}

/** Parse one release's stamp, null when nothing readable is stored. */
function releasedAt(released: { at?: unknown } | null): number | null {
  if (released === null || typeof released !== 'object' || typeof released['at'] !== 'string') return null
  const at = Date.parse(released['at'])
  return Number.isFinite(at) ? at : null
}

/** One or two words for a count, so a missing sentence reads to a person. */
function theCount(n: number): string {
  return n === 1 ? 'one' : String(n)
}

/**
 * THE READING STORED ON THE RUN, `data.honour`
 */
export function storeTheHonourReading(input: { runId: string; workspaceId: string; actor: Actor }): HonourReading & { nothingWritten?: string } {
  const reading = readTheHonourOfARun(input)
  const result = patchRecord(input.runId, { dataPatch: { [THE_HONOUR_KEY]: reading } }, input.actor)
  return { ...reading, ...(result.newSeq === null ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
}

// ============================================================================ as one reader may see it

/**
 * THE RECORD IDS A HONOUR VALUE HOLDS: every string that is an element of a list, at any depth. In a
 * reading those are the signals' evidence and nothing else, so this reads a whole reading, stored or
 * fresh, and any part of one a change or a revision logged (one signal, or one evidence list).
 */
function theIdsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((one: unknown) => (typeof one === 'string' ? [one] : theIdsIn(one)))
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(theIdsIn)
  return []
}

/** The same value with every id in `hidden` taken out of every list, at any depth. Nothing else changes. */
function withoutTheseIds<R>(value: R, hidden: ReadonlySet<string>): R {
  if (Array.isArray(value)) {
    return value.filter((one: unknown) => typeof one !== 'string' || !hidden.has(one)).map((one: unknown) => withoutTheseIds(one, hidden)) as R
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, withoutTheseIds(one, hidden)])) as R
  }
  return value
}

/**
 * HONOUR READINGS AS THIS READER MAY SEE THEM. A signal's evidence is record ids,
 * and one may be a message this reader may not read; such an id is taken out. The signal itself, which
 * says what the run did, stays. What is stored is never changed: this is done on the way out, by every
 * door that hands a reading back, fresh from the honour board or stored on a session record.
 */
export function theHonourThisReaderMaySee<R>(readings: readonly R[], reader: AMessageReader): R[] {
  if (reader.readsEveryMessage) return [...readings]
  const hidden = theMessagesHiddenFrom(reader, readings.flatMap(theIdsIn))
  return readings.map((one) => withoutTheseIds(one, hidden))
}

/**
 * FIELD DIFFERENCES AS THIS READER MAY SEE THEM: a difference inside a run's honour reading, as the
 * revision doors list them, has its before and after put through `theHonourThisReaderMaySee`. They are
 * stored as JSON text; one that is not JSON is a single value, and reads as nothing (null) when it is
 * itself such an id. Every other difference is handed back as it came.
 */
export function differencesWithTheHonourThisReaderMaySee<D extends { path: string; before: string | null; after: string | null }>(
  differences: readonly D[],
  reader: AMessageReader,
): D[] {
  if (reader.readsEveryMessage) return [...differences]
  const inTheHonour = (one: D): boolean => one.path === `data.${THE_HONOUR_KEY}` || one.path.startsWith(`data.${THE_HONOUR_KEY}.`) || one.path.startsWith(`data.${THE_HONOUR_KEY}[`)
  const asRead = (text: string | null): unknown => {
    if (text === null) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      return [text]
    }
  }
  const touched = differences.filter(inTheHonour)
  if (touched.length === 0) return [...differences]
  const hidden = theMessagesHiddenFrom(reader, touched.flatMap((one) => [...theIdsIn(asRead(one.before)), ...theIdsIn(asRead(one.after))]))
  if (hidden.size === 0) return [...differences]
  const asWritten = (text: string | null): string | null => {
    if (text === null) return null
    try {
      return JSON.stringify(withoutTheseIds(JSON.parse(text) as unknown, hidden))
    } catch {
      return hidden.has(text) ? null : text
    }
  }
  return differences.map((one) => (inTheHonour(one) ? { ...one, before: asWritten(one.before), after: asWritten(one.after) } : one))
}

/**
 * RECORDS AS THIS READER MAY SEE THEIR HONOUR READING: each session record's `data.honour` put through
 * `theHonourThisReaderMaySee`, the hidden messages asked about once for the whole list. Every other
 * record, and every other field, is handed back as it came.
 */
export function recordsWithTheHonourThisReaderMaySee<T extends { kind: string; data: Record<string, unknown> }>(rows: readonly T[], reader: AMessageReader): T[] {
  if (reader.readsEveryMessage) return [...rows]
  const holding = rows.filter((one) => one.kind === 'session' && one.data[THE_HONOUR_KEY] !== undefined)
  if (holding.length === 0) return [...rows]
  const seen = theHonourThisReaderMaySee(holding.map((one) => one.data[THE_HONOUR_KEY]), reader)
  const byRow = new Map(holding.map((one, at) => [one, seen[at]]))
  return rows.map((one) => (byRow.has(one) ? { ...one, data: { ...one.data, [THE_HONOUR_KEY]: byRow.get(one) } } : one))
}

/**
 * THE BRIEF AND THE REPORT, criterion HB4: the note the runner filed at the run's start and the
 * report the run filed, each found through the run's own records. Reading either costs one record
 * read. No brief kept, or no report filed, is a real answer — null, never a guess. The report is
 * read through `theReportOfARun`, the one place, and the way it was found is carried on the
 * report (`foundBy`): the workers of this corpus file their report without an `about` link, so
 * the reading asks the seal first, and says which way it was found.
 */
export function theBriefAndReportOfARun(runId: string, stampsOf?: TheStampsOf): {
  brief: { id: string; title: string } | null
  report: { id: string; title: string; foundBy: TheWayAReportWasFound } | null
  briefText: string | null
  /** How many records the search opened, the run's own record among them, so a caller can count it against its cost (HB6). */
  examined: number
} {
  let brief: { id: string; title: string } | null = null
  let briefText: string | null = null
  let report: { id: string; title: string; foundBy: TheWayAReportWasFound } | null = null
  let examined = 1
  const run = getRecord(runId)
  if (run !== null) {
    const agent = theAgentOfARun(run)
    const found = theReportOfARun({ runId, workspaceId: run.workspaceId, agent, stampsOf })
    examined += found.examined
    if (found.report !== null && found.foundBy !== null) {
      report = { id: found.report.id, title: found.report.title, foundBy: found.foundBy }
    }
    for (const link of resolveLinks(runId)) {
      if (link.type !== 'about' || !link.isBacklink || link.broken) continue
      const other = getRecord(link.other.id)
      examined += 1
      if (other === null) continue
      if (other.kind === 'note' && brief === null && other.title.startsWith('Brief of ')) {
        brief = { id: other.id, title: other.title }
        briefText = theTextOf(other)
      }
    }
  }
  return { brief, briefText, report, examined }
}

// ============================================================================ the board, criteria HB3 and HB5

/** How many runs the board hands back at most in one page. */
export const HONOUR_BOARD_PAGE = 25

/** The words a cell carries where a run's session record holds no `served` at all: an older run, or a runner that writes none. */
export const NOT_RECORDED = 'not recorded'

/** What the board's weekly table counts runs by: the model the run was started with, `data.model` on its session record. */
export const THE_TABLE_COUNTS_BY = 'the model the run was started with'

/** One run on the board, as one page of it carries it. */
export interface HonourBoardRow {
  run: string
  title: string
  startedAt: string
  agent: { id: string | null; handle: string | null; name: string | null }
  /** The model the run was started with, `data.model`, or null where the record holds none. */
  startedWith: string | null
  /** The run's conditions as its runner wrote them (HB1), or null where nobody wrote any. */
  served: Record<string, unknown> | null
  standing: HonourStanding
  signals: HonourSignalEntry[]
  missing: HonourMissingEntry[]
  read_at: string
  brief: { id: string; title: string } | null
  report: { id: string; title: string; foundBy: TheWayAReportWasFound } | null
}

/** One line of the weekly table: the runs read under one model and one temperature band, in one window. */
export interface HonourTableCell {
  runs: number
  signals: number
  exemplary: number
  noted: number
}

export interface HonourTableLine {
  model: string
  temperature: string
  lastSevenDays: HonourTableCell
  allTime: HonourTableCell
}

export interface HonourBoard {
  standing: 'exemplary' | 'noted'
  rows: HonourBoardRow[]
  total: number
  offset: number
  returned: number
  next: number | null
  counts: { read: number; exemplary: number; noted: number; none: number }
  threshold: number
  table: {
    countsBy: string
    since: string
    lines: HonourTableLine[]
    servedModel: { on: number; of: number }
    temperature: { on: number; of: number }
  }
  cost: HonourCost
}

interface AStoredReading {
  id: string
  title: string
  created_at: string
  started_with: string | null
  served_model: unknown
  temperature: unknown
  has_served: number
  standing: string | null
  signals: number | null
}

/** A temperature as the table's band: the number to one decimal, or the words the record holds instead. */
function theBandOf(row: AStoredReading): string {
  if (row.has_served !== 1) return NOT_RECORDED
  if (typeof row.temperature === 'number' && Number.isFinite(row.temperature)) return row.temperature.toFixed(1)
  return typeof row.temperature === 'string' ? row.temperature : NOT_RECORDED
}

function anEmptyCell(): HonourTableCell {
  return { runs: 0, signals: 0, exemplary: 0, noted: 0 }
}

/**
 * THE BOARD: the runs whose stored reading (`data.honour`) stands at `standing`, newest first, one page of
 * them, and the weekly table over every stored reading in the project. Criteria HB3, HB5 and HB6.
 *
 * WHAT IT READS. One pass over the project's session records, each one's stored reading and conditions
 * pulled out by the database, for the counts and the table; then, for the page's rows only, each run's
 * record and its brief and report (HB4). It reads no transcript, no log and no model, and it never reads
 * a run again: a run with no stored reading is not on the board. The cost counts every record read.
 *
 * THE TABLE COUNTS BY THE MODEL THE RUN WAS STARTED WITH (`data.model`), not the model the provider
 * served (`served.model`), because the runners do not fill the second yet; the table says how many runs
 * carry each, so the reader sees what it rests on. A temperature band is the number the runner wrote, or
 * the words it wrote instead. Nothing is guessed.
 */
export function theHonourBoard(input: { workspaceId: string; standing: 'exemplary' | 'noted'; offset: number; limit: number; now?: Date }): HonourBoard {
  const started = performance.now()
  const stored = sqlite
    .prepare(
      'SELECT id, title, created_at, ' +
        "json_extract(data, '$.model') AS started_with, " +
        "json_extract(data, '$.served.model') AS served_model, " +
        "json_extract(data, '$.served.temperature') AS temperature, " +
        "json_type(data, '$.served') = 'object' AS has_served, " +
        `json_extract(data, '$.${THE_HONOUR_KEY}.standing') AS standing, ` +
        `json_array_length(data, '$.${THE_HONOUR_KEY}.signals') AS signals ` +
        "FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL " +
        `AND json_valid(data) AND json_type(data, '$.${THE_HONOUR_KEY}') = 'object' ` +
        'ORDER BY created_at DESC, id DESC',
    )
    .all(input.workspaceId) as AStoredReading[]
  let records = stored.length

  const weekAgo = new Date((input.now ?? new Date()).getTime() - 7 * 24 * 60 * 60 * 1000)
  const since = localStamp(weekAgo)
  const counts = { read: stored.length, exemplary: 0, noted: 0, none: 0 }
  const lines = new Map<string, HonourTableLine>()
  let servedModelOn = 0
  let temperatureOn = 0
  for (const row of stored) {
    const standing = row.standing === 'exemplary' || row.standing === 'noted' ? row.standing : 'none'
    counts[standing] += 1
    if (typeof row.served_model === 'string' && row.served_model !== 'not reported') servedModelOn += 1
    if (typeof row.temperature === 'number') temperatureOn += 1
    const model = typeof row.started_with === 'string' && row.started_with !== '' ? row.started_with : NOT_RECORDED
    const temperature = theBandOf(row)
    const key = JSON.stringify([model, temperature])
    let line = lines.get(key)
    if (line === undefined) {
      line = { model, temperature, lastSevenDays: anEmptyCell(), allTime: anEmptyCell() }
      lines.set(key, line)
    }
    const cells = row.created_at >= since ? [line.allTime, line.lastSevenDays] : [line.allTime]
    for (const cell of cells) {
      cell.runs += 1
      cell.signals += row.signals ?? 0
      if (standing === 'exemplary') cell.exemplary += 1
      if (standing === 'noted') cell.noted += 1
    }
  }

  const standingHere = stored.filter((row) => row.standing === input.standing)
  const page = standingHere.slice(input.offset, input.offset + input.limit)
  const runs = page.flatMap((row) => {
    const record = getRecord(row.id)
    records += 1
    return record === null ? [] : [record]
  })
  const agents = listParticipants().agents
  const agentOf = theAgentsOfTheseRuns(runs, () => agents)
  const stampsOf = theStampsReadOnce(sqlite)
  const rows = runs.map((run): HonourBoardRow => {
    const kept = theBriefAndReportOfARun(run.id, stampsOf)
    records += kept.examined
    const reading = run.data[THE_HONOUR_KEY] as HonourReading
    const agentId = agentOf.get(run.id) ?? null
    const handle = typeof run.data['servingAgent'] === 'string' ? run.data['servingAgent'] : null
    const served = run.data['served']
    return {
      run: run.id,
      title: run.title,
      startedAt: run.createdAt,
      agent: { id: agentId, handle, name: agents.find((one) => one.id === agentId)?.name ?? null },
      startedWith: typeof run.data['model'] === 'string' ? run.data['model'] : null,
      served: typeof served === 'object' && served !== null && !Array.isArray(served) ? (served as Record<string, unknown>) : null,
      standing: reading.standing,
      signals: reading.signals,
      missing: reading.missing,
      read_at: reading.read_at,
      brief: kept.brief,
      report: kept.report,
    }
  })

  const next = input.offset + page.length < standingHere.length ? input.offset + page.length : null
  return {
    standing: input.standing,
    rows,
    total: standingHere.length,
    offset: input.offset,
    returned: rows.length,
    next,
    counts,
    threshold: HONOUR_THRESHOLD,
    table: {
      countsBy: THE_TABLE_COUNTS_BY,
      since,
      lines: [...lines.values()].sort((a, b) => b.allTime.runs - a.allTime.runs || a.model.localeCompare(b.model) || a.temperature.localeCompare(b.temperature)),
      servedModel: { on: servedModelOn, of: stored.length },
      temperature: { on: temperatureOn, of: stored.length },
    },
    cost: { records, ms: Math.round(performance.now() - started) },
  }
}
