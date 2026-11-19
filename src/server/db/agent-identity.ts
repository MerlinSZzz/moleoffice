// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DURABLE AGENT IDENTITY, IN THREE ACTS AT THREE POSITIONS. Written and proved and NOT REGISTERED.
 *
 * This is window B's row 4 — the one step of the six that nobody had written. `design/round-ten/
 * verification/wave-7.json` found it missing and refused the whole window over it: *"nothing
 * anywhere migrates `session.data.agent` to `data.runtime`"*. The answer was to write it
 * rather than narrow the window, so this is that file, and its three acts are the three rows of
 * `agent-coordination.md` §8.1.
 *
 * ---------------------------------------------------------------------------------------
 * THREE ACTS, BECAUSE `migrateInPlace` ORDERS THEM APART AND EACH ORDER IS A FACT
 * ---------------------------------------------------------------------------------------
 *
 * ACT A — MINT THE IDENTITIES, and bind the runs that were addressed to them.
 *   Position: after `migrateBlocks`, BEFORE `migrateOrigins`. It CREATES records, and the origin
 *   stamp has to see the corpus it is stamping. It writes `origin = 'authored'` itself rather than
 *   leaving it for the stamp to guess, so the two are belt and braces: `migrateOrigins` only ever
 *   writes `WHERE origin IS NULL`.
 *
 * ACT B — RENAME `session.data.agent` TO `session.data.runtime`.
 *   Position: after `migrateBlockedBy`, BEFORE `migrateRevisions`. It rewrites `records.data`, and
 *   window B's ordering rule gives it two options and no third: run above `migrateRevisions`, or
 *   restamp the newest revision itself. It takes the first. `migrateRevisions` runs
 *   `planStaleLedgers` (`src/server/db/revision-backfill.ts:254-284`), which writes a catch-up
 *   revision for every record whose newest revision no longer hashes to what the row holds — so
 *   renaming the key ABOVE that pass is what makes the catch-up revision hold `data.runtime`.
 *   Measured on the corpus: all 92 records holding the old key already have revisions and 92 of
 *   those newest revisions hold `data.agent`, so this is 92 catch-ups and not one baseline.
 *
 * ACT C — `agent_messages` and `agent_runs`: resolve the recipient, stamp the moments.
 *   Position: after `migrateReviews`, and after the annotation-state step's act two. Their act
 *   reads `agent_messages` to decide which comments were spoken for; this act writes that table.
 *   Reading before writing is the whole of the ordering, and it is why these two steps have to land
 *   in one commit rather than one after the other.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WOULD DO TO THE OWNER'S CORPUS, MEASURED 26 AUGUST 2026 AND NOT COPIED FROM THE PLAN
 * ---------------------------------------------------------------------------------------
 *
 *   ACT A ... 0 identities. NOT ONE. No session record is named by any of the three things that
 *             can name one: `agent_messages.recipient_session_id` is NULL on the one message this
 *             corpus holds, `agent_runs.recipient_session_id` is NULL on the one run, and no live
 *             annotation carries a `chosenRecipient` at all. `agent-coordination.md` §8.2 step 2
 *             says 2 identities and names `z8hXT8FbfKfi` and `JmIVj-h7yGO3`; neither is chosen by
 *             anything in the corpus as it stands today. That is act A's answer, not act A failing,
 *             and the refusal rules below are what make the difference visible: a chosen session
 *             that could not be minted STOPS the migration and is named.
 *   ACT B ... 92 records, exactly the number window B's row 4 states, and NOT the composition it
 *             describes. The plan's own query has no `deleted_at` clause; the design says "every
 *             live session record". Today: 88 LIVE sessions carry a value, 5 live sessions carry no
 *             such key, and 4 DELETED sessions carry one that no paper mentions. 88 + 4 = 92.
 *             THE DELETED FOUR ARE RENAMED TOO, and that is a decision with a reason: window B
 *             deletes the `session.agent` DECLARATION in the same commit, and
 *             `src/server/lib/records.ts` validates the MERGED record, so a record left holding a
 *             key no kind declares cannot be merge-patched at all — 400, unknown key. A deleted
 *             record can be put back and then written to. Leaving those four behind would mean
 *             leaving four records that come back unwritable, which is the exact trap the plan
 *             spends a page on.
 *   ACT C ... 1 row. `mGYhhpVnfVbZ` reads `sent` and holds no `sent_at`; the moment comes from run
 *             `KvSXYrF3PFXp` in its own thread — `dispatchThread` sets the message sent and inserts
 *             the run in one transaction (`src/server/lib/agents.ts`), so the run's `created_at` IS
 *             that moment. 0 recipients to resolve: that message reads `new`, which is a person
 *             deliberately asking for a fresh agent and is never rewritten. 0 annotations to move.
 *             `agent_runs.agent_id` stays NULL on the one run, because the run is unaddressed.
 *
 * Re-measure before running it. Every act re-counts what it was told and REFUSES the whole run,
 * naming both numbers, if the database in front of it is not the one that was counted.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE HANDLE RULE COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * `whyThatIsNotAHandle` is read from `src/shared/participants.ts`, which opens no database, as
 * `participants-migration.ts` reads the registry's rule from it. It is not read from
 * `src/server/lib/inbox.ts`, which imports `../db/client.ts`, which OPENS whatever `.env` names the
 * moment it is imported — the owner's live corpus. This file used to keep its own copy of the rule
 * for that reason; the copy is gone, and the rule is written once.
 */

import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { contentOf, versionOf } from './version.ts'
import { nowStamp } from '../../shared/time.ts'
import { whyThatIsNotAHandle } from '../../shared/participants.ts'

/** The kind whose records are durable agents, and the kind that is one run of a tool. */
export const AGENT_KIND = 'agent'
export const SESSION_KIND = 'session'

/** The key that is going, and the key it becomes. The same fact under a name that is now taken. */
export const THE_OLD_KEY = 'agent'
export const THE_NEW_KEY = 'runtime'

/**
 * WHAT IS APPENDED TO A SESSION'S TITLE TO NAME THE IDENTITY MADE FROM IT.
 *
 * `records_title_idx` is NOT unique — verified — so without this the picker would list two rows
 * reading "Round ten — one project world" and nothing could tell a person which was the run and
 * which was the agent.
 */
export const THE_TITLE_SUFFIX = ' (agent)'

/** Who this migration writes as, in the spelling every other table uses for an actor. */
export const ACTOR_TYPE = 'system'
export const ACTOR_ID = 'agent-identity-migration'

/**
 * The word `agent_messages.state` used to hold that no longer exists, and the run stops on it.
 *
 * `MESSAGE_STATES` was three words — `queued`, `sent`, `answered` — and is now six, and `answered`
 * is not among them. A row still holding it is a row written by code this corpus no longer runs,
 * and deciding whether it meant `handled` or something else is reading somebody's dispatch for them.
 */
export const THE_WORD_THAT_STOPS_IT = 'answered'

/** Said on every revision this migration is the reason for. */
export const REVISION_NOTE_BIND =
  'The round ten agent-identity migration wrote which durable agent this run worked as. Nobody chose it here: ' +
  'the identity was made from this very run, because something in the corpus had addressed it. Its time is this ' +
  "migration's moment rather than a moment somebody worked."

/**
 * WHAT THE SUMMARY OF A MINTED IDENTITY SAYS, and it names the run rather than a date.
 *
 * `agent-coordination.md` §8.2 writes this sentence with "on 2026-08-21" in it, which was the day
 * that paper was written and is not a fact about any corpus this runs against. The run's id IS a
 * fact, it is in the database, and it is what somebody would need to check the guess. So the shape
 * of the sentence is kept and the invented date is not.
 */
export function summaryForAnIdentity(sessionId: string): string {
  return (
    `Made by the round ten migration from run ${sessionId}, which something in this project had addressed. ` +
    `Rename it if this is not what you meant.`
  )
}

// ============================================================================================ shapes

/** One session somebody addressed, and what it says about itself. */
export interface ChosenSession {
  id: string
  workspaceId: string
  title: string
  /** `data.runtime` if it has one, else `data.agent`. Null when the session says neither. */
  runtime: string | null
  /** Where the choice was made: which tables and records name this session. */
  chosenBy: string[]
  /** The agent record this session already says it worked as in that project, or null. */
  alreadyBoundTo: string | null
  /**
   * Whether the record something addressed is a `session` at all.
   *
   * A SEPARATE FIELD RATHER THAN A SENTINEL IN `title`. Something addressed to a record of another
   * kind is a refusal, and reading that refusal out of the title would mean a run somebody really
   * did call "not a session" refused for the wrong reason.
   */
  isSession: boolean
  /** The kind of the record something addressed, for the refusal to name. */
  kind: string
}

/** One identity this step would mint. */
export interface Minting {
  sessionId: string
  workspaceId: string
  agentId: string
  handle: string
  title: string
  runtime: string | null
}

/** One row this step will not decide about. Left exactly as it is, and always named. */
export interface SkipNote {
  kind:
    | 'already_minted'
    | 'no_such_session'
    | 'no_title'
    | 'already_bound'
    | 'not_a_session'
    | 'unreadable_data'
    | 'already_renamed'
    | 'no_key'
    | 'deliberately_new'
    | 'already_stamped'
    | 'already_resolved'
    | 'unaddressed_run'
  id: string
  detail: string
}

export interface MeasuredIdentities {
  /** Distinct session records something in this corpus has addressed. */
  chosen: number
  /** Agent records already here. */
  agents: number
}

export interface IdentitiesReport {
  alreadyDone: boolean
  chosen: number
  minted: Minting[]
  /** Sessions bound to the identity made from them — `data.ranAs` gained an entry. */
  bound: number
  /** Records written: one per identity, plus one per session bound. */
  recordsWritten: number
  changeRows: number
  notes: SkipNote[]
}

export interface MeasuredRuntime {
  /** Every record holding `data.agent`, of any kind, live or deleted. The plan's own query. */
  holdingTheOldKey: number
  /** Of those, the ones that are live sessions. */
  liveSessions: number
  /** Of those, the ones that are deleted sessions — the four no paper mentions. */
  deletedSessions: number
}

/** One session whose key this step would rename. */
export interface Rename {
  id: string
  workspaceId: string
  deleted: boolean
  /** The value being carried across, unchanged. Null when the key is there holding JSON null. */
  value: string | null
  /** Where `agent` sat among the keys of `data`. The rename keeps it there. */
  at: number
}

export interface RuntimeReport {
  alreadyDone: boolean
  read: number
  renamed: Rename[]
  liveRenamed: number
  deletedRenamed: number
  recordsWritten: number
  changeRows: number
  notes: SkipNote[]
}

/** One message this step would stamp or resolve. */
export interface MessageWrite {
  id: string
  threadId: string
  state: string
  /** The identity this message is being filed under, or null when only a moment is being written. */
  recipientAgentId: string | null
  /** The moment Mole Office accepted the dispatch, taken from a run and never invented. */
  sentAt: string | null
  /** Which run said so. Null when no moment was written. */
  from: string | null
}

/** A message past `queued` whose moment is nowhere in the corpus. Any one of these refuses. */
export interface Undatable {
  id: string
  threadId: string
  state: string
  why: string
}

export interface MeasuredDispatch {
  messages: number
  /** Rows whose state is past `queued` and that hold no `sent_at`. */
  needingAMoment: number
  /** Rows naming a session as their recipient. */
  namingASession: number
  /** Live annotations whose chosen recipient is a session. */
  annotationsNamingASession: number
  /** Runs naming a session as their recipient and holding no `agent_id`. */
  runsNamingASession: number
}

export interface DispatchReport {
  alreadyDone: boolean
  messages: number
  writes: MessageWrite[]
  momentsWritten: number
  recipientsResolved: number
  annotationsMoved: number
  runsBound: number
  rowsWritten: number
  notes: SkipNote[]
}

// ================================================================================== reading the corpus

function tableIsThere(sqlite: Database.Database, name: string): boolean {
  return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

/** Whether a string is a handle at all, said as a sentence: the rule in `src/shared/participants.ts`, passed on from here. */
export { whyThatIsNotAHandle }

/**
 * A TITLE, MADE INTO A HANDLE. Lowercased, everything that is not a letter or a digit becomes a
 * dash, runs of dashes collapse, the ends are trimmed, and it is cut to 40.
 *
 * IT CAN FAIL, and failing is a refusal rather than a fallback. A title of nothing but punctuation
 * gives an empty string, and minting an agent called `agent-2` because its run was called "***"
 * would be this file inventing somebody's address.
 */
export function handleFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
  return slug
}

/** Every handle any agent record in this project holds today. */
function handlesTaken(sqlite: Database.Database, workspaceId: string): Set<string> {
  if (!tableIsThere(sqlite, 'records')) return new Set()
  const rows = sqlite
    .prepare(
      "SELECT json_extract(data, '$.handle') AS handle FROM records WHERE kind = ? AND workspace_id = ? " +
        "AND json_valid(data)",
    )
    .all(AGENT_KIND, workspaceId) as { handle: string | null }[]
  return new Set(rows.map((r) => r.handle).filter((h): h is string => typeof h === 'string'))
}

/**
 * EVERY SESSION SOMETHING IN THIS CORPUS HAS ADDRESSED, and what addressed it.
 *
 * Three sources, exactly the three `agent-coordination.md` §8.2 step 2 names, and no fourth. A
 * session nothing ever addressed gets no identity: minting one for every run would put 93 agents in
 * a picker that is meant to hold the handful somebody talks to.
 */
export function chosenSessions(sqlite: Database.Database): ChosenSession[] {
  if (!tableIsThere(sqlite, 'records')) return []
  const chosenBy = new Map<string, string[]>()
  const add = (id: unknown, why: string): void => {
    if (typeof id !== 'string' || id === '') return
    const list = chosenBy.get(id) ?? []
    list.push(why)
    chosenBy.set(id, list)
  }

  if (tableIsThere(sqlite, 'agent_messages')) {
    // `recipient_kind = 'session'` AND NOT MERELY `recipient_session_id IS NOT NULL`.
    //
    // ONE COLUMN CARRIES WHICH RECIPIENT IT IS, WHATEVER KIND IT IS, and `recipient_kind` is what
    // says how to read it — `src/server/lib/agents.ts` writes a durable agent's id into that same
    // column at write time and moves it to `recipient_agent_id` at send time. So a query that reads
    // the column alone finds every message addressed to an AGENT and calls each one a run, which is
    // a refusal on a corpus where nothing is wrong. Measured: it stopped a server from booting.
    const rows = sqlite
      .prepare(
        "SELECT id, recipient_session_id FROM agent_messages WHERE recipient_kind = 'session' " +
          'AND recipient_session_id IS NOT NULL',
      )
      .all() as { id: string; recipient_session_id: string }[]
    for (const row of rows) add(row.recipient_session_id, `message ${row.id}`)
  }
  if (tableIsThere(sqlite, 'agent_runs')) {
    const rows = sqlite
      .prepare('SELECT id, recipient_session_id FROM agent_runs WHERE recipient_session_id IS NOT NULL')
      .all() as { id: string; recipient_session_id: string }[]
    for (const row of rows) add(row.recipient_session_id, `run ${row.id}`)
  }
  const annotations = sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.chosenRecipient.sessionId') AS session FROM records " +
        "WHERE kind = 'annotation' AND deleted_at IS NULL AND json_valid(data) " +
        "AND json_extract(data, '$.chosenRecipient.kind') = 'session'",
    )
    .all() as { id: string; session: string | null }[]
  for (const row of annotations) add(row.session, `comment ${row.id}`)

  const readSession = sqlite.prepare(
    'SELECT id, workspace_id, title, data, kind FROM records WHERE id = ?',
  )
  const out: ChosenSession[] = []
  for (const [id, why] of [...chosenBy.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const row = readSession.get(id) as
      | { id: string; workspace_id: string; title: string; data: string; kind: string }
      | undefined
    if (row === undefined) {
      out.push({ id, workspaceId: '', title: '', runtime: null, chosenBy: why, alreadyBoundTo: null, isSession: false, kind: '' })
      continue
    }
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(row.data) as Record<string, unknown>
    } catch {
      data = {}
    }
    const runtime = data[THE_NEW_KEY] ?? data[THE_OLD_KEY]
    const ranAs = Array.isArray(data['ranAs']) ? (data['ranAs'] as Record<string, unknown>[]) : []
    const bound = ranAs.find((entry) => entry['workspaceId'] === row.workspace_id)
    out.push({
      id,
      workspaceId: row.workspace_id,
      title: row.title,
      runtime: typeof runtime === 'string' && runtime !== '' ? runtime : null,
      chosenBy: why,
      alreadyBoundTo: typeof bound?.['agentId'] === 'string' ? (bound['agentId'] as string) : null,
      isSession: row.kind === SESSION_KIND,
      kind: row.kind,
    })
  }
  return out
}

export function countIdentities(sqlite: Database.Database): MeasuredIdentities {
  if (!tableIsThere(sqlite, 'records')) return { chosen: 0, agents: 0 }
  const agents = (
    sqlite.prepare('SELECT count(*) AS n FROM records WHERE kind = ?').get(AGENT_KIND) as { n: number }
  ).n
  return { chosen: chosenSessions(sqlite).length, agents }
}

// ======================================================================================== act A, plan

/** What act A would do, computed and written nowhere. */
export function planIdentities(sqlite: Database.Database): {
  mintings: Minting[]
  notes: SkipNote[]
  refusals: string[]
  chosen: number
} {
  const notes: SkipNote[] = []
  const refusals: string[] = []
  const mintings: Minting[] = []
  const chosen = chosenSessions(sqlite)

  const taken = new Map<string, Set<string>>()
  const takenIn = (workspaceId: string): Set<string> => {
    const already = taken.get(workspaceId)
    if (already !== undefined) return already
    const fresh = handlesTaken(sqlite, workspaceId)
    taken.set(workspaceId, fresh)
    return fresh
  }

  for (const session of chosen) {
    if (session.workspaceId === '') {
      // A CHOICE POINTING AT NOTHING. This refuses the whole run: something in the corpus is
      // addressed to a record that is not here, and minting an identity for it would invent the
      // thing that was addressed.
      refusals.push(
        `${session.chosenBy.join(', ')} name${session.chosenBy.length === 1 ? 's' : ''} session ${session.id}, and ` +
          `no record with that id is in this database`,
      )
      continue
    }
    if (session.kind === AGENT_KIND) {
      // ALREADY A DURABLE IDENTITY, so there is nothing to mint. `agent_runs.recipient_session_id`
      // carries whichever kind of recipient was chosen, the same way the message column does, and a
      // run addressed to an agent is the ordinary case rather than a broken chain.
      notes.push({
        kind: 'already_minted',
        id: session.id,
        detail: `${session.chosenBy.join(', ')} name ${session.id}, which is already a durable agent. Nothing was minted for it.`,
      })
      continue
    }
    if (!session.isSession) {
      refusals.push(
        `${session.chosenBy.join(', ')} name${session.chosenBy.length === 1 ? 's' : ''} ${session.id} as a run, and ` +
          `that record is a "${session.kind}"`,
      )
      continue
    }
    if (session.alreadyBoundTo !== null) {
      // ALREADY DONE, and this is what makes act A safe to run twice: the session says which agent
      // it worked as, so the identity has already been made and bound.
      notes.push({
        kind: 'already_bound',
        id: session.id,
        detail: `Run ${session.id} already says it worked as ${session.alreadyBoundTo} in "${session.workspaceId}". Nothing was minted for it.`,
      })
      continue
    }
    const title = session.title.trim()
    if (title === '') {
      refusals.push(`session ${session.id} has no title, so there is nothing to make a handle out of`)
      continue
    }
    const base = handleFromTitle(title)
    if (whyThatIsNotAHandle(base) !== null) {
      refusals.push(
        `session ${session.id} is called ${JSON.stringify(title)}, and the handle that makes is ` +
          `${JSON.stringify(base)} — ${String(whyThatIsNotAHandle(base))}`,
      )
      continue
    }
    // DEDUPLICATED WITH A NUMERIC SUFFIX, as §8.2 step 2 says, against what is taken in this
    // project AND against what this same run is about to take.
    const here = takenIn(session.workspaceId)
    let handle = base
    let n = 1
    while (here.has(handle)) {
      n += 1
      handle = `${base.slice(0, 40 - String(n).length - 1)}-${String(n)}`
    }
    here.add(handle)
    mintings.push({
      sessionId: session.id,
      workspaceId: session.workspaceId,
      agentId: anOfficeId(),
      handle,
      title: `${title}${THE_TITLE_SUFFIX}`,
      runtime: session.runtime,
    })
  }

  return { mintings, notes, refusals, chosen: chosen.length }
}

/**
 * ACT A — RUN IT. One transaction; anything that disagrees rolls the whole act back.
 *
 * It writes the identity AND binds the run to it in `data.ranAs`, because those are one fact: the
 * only reason the identity exists is that this run was addressed, and a corpus holding the identity
 * without the binding would mint a second one on the next run.
 */
export function migrateAgentIdentities(sqlite: Database.Database, measured: MeasuredIdentities): IdentitiesReport {
  const here = countIdentities(sqlite)
  const wrong: string[] = []
  if (here.chosen !== measured.chosen) {
    wrong.push(`you measured ${measured.chosen} addressed runs; this database holds ${here.chosen}`)
  }
  if (here.agents !== measured.agents) {
    wrong.push(`you measured ${measured.agents} agent records; this database holds ${here.agents}`)
  }
  if (wrong.length > 0) {
    throw new Error(
      `This is not the corpus that was counted, so nothing was written.\n  ${wrong.join('\n  ')}\n` +
        'Re-run `npx tsx design/round-ten/migrations/run-agent-identity.mjs <this database>` with no --apply and ' +
        'hand the runner what it prints.',
    )
  }

  const plan = planIdentities(sqlite)
  if (plan.refusals.length > 0) {
    throw new Error(
      'Nothing was written, because this migration will not invent an agent.\n  ' +
        plan.refusals.join('\n  ') +
        '\nEvery identity it makes comes from a run something in this corpus addressed, and every one of the ' +
        'above breaks that chain. Fix the row that names a run that is not there, or delete the choice, and run ' +
        'it again.',
    )
  }

  const report: IdentitiesReport = {
    alreadyDone: plan.mintings.length === 0,
    chosen: plan.chosen,
    minted: plan.mintings,
    bound: 0,
    recordsWritten: 0,
    changeRows: 0,
    notes: plan.notes,
  }
  if (plan.mintings.length === 0) return report

  const addRecord = sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, ' +
      'deleted_at, origin) SELECT ?, ?, owner_id, ?, ?, ?, ?, ?, ?, NULL, ? FROM records WHERE id = ?',
  )
  const readRow = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?')
  const setData = sqlite.prepare('UPDATE records SET data = ?, updated_at = ? WHERE id = ?')
  const addChange = sqlite.prepare(
    'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, ' +
      'workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  const run = sqlite.transaction(() => {
    const at = nowStamp()
    for (const minting of plan.mintings) {
      const data: Record<string, unknown> = { handle: minting.handle, state: 'active' }
      // A RUNTIME IS COPIED WHERE THE RUN HAS ONE AND LEFT OUT WHERE IT DOES NOT. Absent is a real
      // answer here — §5.5 draws it as "Runtime not set" — and writing `claude-code` because most
      // runs are would be a guess wearing a default's clothes.
      if (minting.runtime !== null) data[THE_NEW_KEY] = minting.runtime
      addRecord.run(
        minting.agentId,
        minting.workspaceId,
        at,
        at,
        AGENT_KIND,
        minting.title,
        summaryForAnIdentity(minting.sessionId),
        JSON.stringify(data),
        // ORIGIN WRITTEN HERE, EXPLICITLY. `migrateOrigins` runs after this and only ever writes
        // `WHERE origin IS NULL`, so a row it has no measurement of would otherwise be drawn as
        // "Nobody said where this record came from" beside a summary saying exactly where it came
        // from.
        'authored',
        minting.sessionId,
      )
      report.recordsWritten += 1
      addChange.run(anOfficeId(), minting.agentId, 'create', ACTOR_TYPE, ACTOR_ID, null, null, null, null, at, minting.workspaceId)
      report.changeRows += 1

      // AND THE RUN SAYS WHICH AGENT IT WORKED AS. One entry per project, appended to whatever the
      // run already holds, never replacing an entry for another project.
      const row = readRow.get(minting.sessionId) as
        | { id: string; kind: string; title: string; summary: string | null; data: string; deleted_at: string | null; workspace_id: string }
        | undefined
      if (row === undefined) throw new Error(`Run ${minting.sessionId} went between planning this migration and running it.`)
      const data2 = JSON.parse(row.data) as Record<string, unknown>
      const ranAs = Array.isArray(data2['ranAs']) ? (data2['ranAs'] as Record<string, unknown>[]) : []
      ranAs.push({ workspaceId: minting.workspaceId, agentId: minting.agentId })
      data2['ranAs'] = ranAs
      setData.run(JSON.stringify(data2), at, minting.sessionId)
      report.bound += 1
      report.recordsWritten += 1
      addChange.run(
        anOfficeId(),
        minting.sessionId,
        'update',
        ACTOR_TYPE,
        ACTOR_ID,
        null,
        'data.ranAs',
        null,
        JSON.stringify([{ workspaceId: minting.workspaceId, agentId: minting.agentId }]),
        at,
        minting.workspaceId,
      )
      report.changeRows += 1
    }

    // CHECK — every identity reads back as an agent with the handle it was given, and every run
    // reads back bound to it. Re-read from the rows: a write that went to the wrong row passes
    // every check made from the plan alone.
    for (const minting of plan.mintings) {
      const agent = readRow.get(minting.agentId) as { kind: string; data: string } | undefined
      if (agent === undefined || agent.kind !== AGENT_KIND) {
        throw new Error(`Agent ${minting.agentId} is not there after being written. Nothing has been kept.`)
      }
      if ((JSON.parse(agent.data) as Record<string, unknown>)['handle'] !== minting.handle) {
        throw new Error(`Agent ${minting.agentId} does not hold the handle it was given. Nothing has been kept.`)
      }
      const session = readRow.get(minting.sessionId) as { data: string } | undefined
      const ranAs = session === undefined ? [] : ((JSON.parse(session.data) as Record<string, unknown>)['ranAs'] as unknown[])
      const bound = Array.isArray(ranAs) && ranAs.some((e) => (e as Record<string, unknown>)['agentId'] === minting.agentId)
      if (!bound) {
        throw new Error(`Run ${minting.sessionId} does not say it worked as ${minting.agentId}. Nothing has been kept.`)
      }
    }
  })

  run()
  return report
}

export function describeAgentIdentities(report: IdentitiesReport): string {
  // "NOTHING TO MINT" IS ONLY SAID WHEN THERE REALLY WAS SOMETHING TO LOOK AT. A corpus where
  // nothing has ever been addressed is a different fact from one where every addressed run already
  // has its identity, and reading the first as the second would say "all done" over a corpus that
  // was never asked the question. `describeOrigin` in db/migrate.ts splits the same two cases.
  if (report.alreadyDone && report.chosen === 0) {
    return 'agents: nothing has ever been addressed to a run in this corpus, so there is no identity to make from one'
  }
  if (report.alreadyDone) {
    return `agents: nothing to mint (${report.chosen} addressed run(s) read; every one of them already names the identity it worked as)`
  }
  const lines = [
    `agents: ${report.minted.length} identity(ies) made from ${report.chosen} addressed run(s), ` +
      `${report.bound} run(s) bound to one, ${report.recordsWritten} record(s) written, ` +
      `${report.changeRows} change row(s)`,
  ]
  for (const minting of report.minted) {
    lines.push(
      `  MINTED ${minting.agentId} "${minting.title}" handle ${minting.handle}` +
        `${minting.runtime === null ? ', runtime not set' : `, runtime ${minting.runtime}`} — from run ${minting.sessionId}`,
    )
  }
  for (const note of report.notes) lines.push(`  LEFT AS IT IS — ${note.id}: ${note.detail}`)
  return lines.join('\n')
}

// ======================================================================================== act B, plan

export function countSessionRuntime(sqlite: Database.Database): MeasuredRuntime {
  if (!tableIsThere(sqlite, 'records')) return { holdingTheOldKey: 0, liveSessions: 0, deletedSessions: 0 }
  const one = (sql: string): number => (sqlite.prepare(sql).get() as { n: number }).n
  return {
    // THE PLAN'S OWN QUERY, word for word: no kind clause and no `deleted_at` clause.
    holdingTheOldKey: one("SELECT count(*) AS n FROM records WHERE json_valid(data) AND json_type(data, '$.agent') IS NOT NULL"),
    liveSessions: one(
      "SELECT count(*) AS n FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_valid(data) " +
        "AND json_type(data, '$.agent') IS NOT NULL",
    ),
    deletedSessions: one(
      "SELECT count(*) AS n FROM records WHERE kind = 'session' AND deleted_at IS NOT NULL AND json_valid(data) " +
        "AND json_type(data, '$.agent') IS NOT NULL",
    ),
  }
}

/**
 * RENAME ONE KEY OF ONE OBJECT, IN PLACE, KEEPING EVERY OTHER KEY WHERE IT WAS.
 *
 * `json_set` and `json_remove` would move the key to the end. Key order is part of what
 * `versionOf` hashes (`JSON.stringify` of `data`), so rebuilding the object in a different order
 * would make every one of these records differ from its newest revision by more than the rename —
 * which is a bigger claim than this step is making. Measured on the corpus: the key sits at
 * position 0 on 9 records and position 1 on 83, so it is a small set of positions and each one is
 * kept.
 */
export function renameInPlace(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === THE_OLD_KEY) out[THE_NEW_KEY] = value
    else out[key] = value
  }
  return out
}

export function planSessionRuntime(sqlite: Database.Database): {
  renames: Rename[]
  notes: SkipNote[]
  refusals: string[]
  read: number
} {
  const notes: SkipNote[] = []
  const refusals: string[] = []
  const renames: Rename[] = []
  if (!tableIsThere(sqlite, 'records')) return { renames, notes, refusals, read: 0 }

  const rows = sqlite
    .prepare("SELECT id, kind, workspace_id, data, deleted_at FROM records WHERE data LIKE '%\"agent\"%' ORDER BY id")
    .all() as { id: string; kind: string; workspace_id: string; data: string; deleted_at: string | null }[]

  for (const row of rows) {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(row.data) as Record<string, unknown>
    } catch {
      // LEFT ALONE AND NAMED, not refused: a record whose `data` will not parse is broken in a way
      // this step did not cause and cannot repair, and refusing over it would stop the other 91.
      notes.push({ kind: 'unreadable_data', id: row.id, detail: `${row.id} holds data that will not parse as JSON. It was not touched.` })
      continue
    }
    if (!Object.hasOwn(data, THE_OLD_KEY)) continue
    if (row.kind !== SESSION_KIND) {
      // A DIFFERENT KIND'S `agent` KEY IS NOT THIS STEP'S BUSINESS. It refuses rather than skipping
      // quietly, because window B deletes the `session.agent` declaration and a key of the same
      // name on another kind is a fact nobody has decided about.
      refusals.push(`record ${row.id} is a "${row.kind}" and holds a data.agent key; only a session's is renamed here`)
      continue
    }
    if (Object.hasOwn(data, THE_NEW_KEY)) {
      // BOTH KEYS. Which one is true is a question about somebody's run and this file will not
      // answer it — the old key might hold the same word, or an older one, and a rename would
      // silently overwrite whichever `runtime` says.
      refusals.push(
        `session ${row.id} holds BOTH data.agent (${JSON.stringify(data[THE_OLD_KEY])}) and data.runtime ` +
          `(${JSON.stringify(data[THE_NEW_KEY])}), and nothing here can say which is true`,
      )
      continue
    }
    const value = data[THE_OLD_KEY]
    if (value !== null && typeof value !== 'string') {
      refusals.push(`session ${row.id} holds a data.agent that is not a word: ${JSON.stringify(value)}`)
      continue
    }
    renames.push({
      id: row.id,
      workspaceId: row.workspace_id,
      deleted: row.deleted_at !== null,
      value,
      at: Object.keys(data).indexOf(THE_OLD_KEY),
    })
  }
  return { renames, notes, refusals, read: rows.length }
}

/**
 * ACT B — RUN IT. One transaction. NO VALUE CHANGES: the same word comes out under the other key.
 *
 * IT RESTAMPS NOTHING, and that is a position rather than an omission. It runs ABOVE
 * `migrateRevisions`, which is one of window B's two options for a step that rewrites
 * `records.data`; the catch-up pass in the same run writes the revision. Registered anywhere below
 * that pass this step would leave 92 records whose newest revision hashes to content the record no
 * longer holds, and every compare-and-set built from a read of one of them would refuse every
 * write. `tests/every-window-b-step-keeps-the-ledger.test.ts` is what would notice.
 */
export function migrateSessionRuntime(sqlite: Database.Database, measured: MeasuredRuntime): RuntimeReport {
  const here = countSessionRuntime(sqlite)
  const wrong: string[] = []
  if (here.holdingTheOldKey !== measured.holdingTheOldKey) {
    wrong.push(
      `you measured ${measured.holdingTheOldKey} records holding data.agent; this database holds ${here.holdingTheOldKey}`,
    )
  }
  if (here.liveSessions !== measured.liveSessions) {
    wrong.push(`you measured ${measured.liveSessions} live sessions holding it; this database holds ${here.liveSessions}`)
  }
  if (here.deletedSessions !== measured.deletedSessions) {
    wrong.push(
      `you measured ${measured.deletedSessions} deleted sessions holding it; this database holds ${here.deletedSessions}`,
    )
  }
  if (wrong.length > 0) {
    throw new Error(
      `This is not the corpus that was counted, so nothing was written.\n  ${wrong.join('\n  ')}\n` +
        'Re-run `node design/round-ten/scratch/w7-session-runtime-count.mjs <this database>` and hand the runner ' +
        'what it prints.',
    )
  }

  const plan = planSessionRuntime(sqlite)
  if (plan.refusals.length > 0) {
    throw new Error(
      'Nothing was written, because this migration will not decide which word is true.\n  ' +
        plan.refusals.join('\n  ') +
        `\nThe rename carries one word from one key to another and changes nothing else. Settle these records — ` +
        `write the "${THE_NEW_KEY}" each one should hold and remove its "${THE_OLD_KEY}" — and run it again.`,
    )
  }

  const report: RuntimeReport = {
    alreadyDone: plan.renames.length === 0,
    read: plan.read,
    renamed: plan.renames,
    liveRenamed: 0,
    deletedRenamed: 0,
    recordsWritten: 0,
    changeRows: 0,
    notes: plan.notes,
  }
  if (plan.renames.length === 0) return report

  const readData = sqlite.prepare('SELECT data FROM records WHERE id = ?').pluck()
  const setData = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const addChange = sqlite.prepare(
    'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, ' +
      'workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  const run = sqlite.transaction(() => {
    const at = nowStamp()
    for (const rename of plan.renames) {
      const raw = readData.get(rename.id) as string | undefined
      if (raw === undefined) throw new Error(`Record ${rename.id} went between planning this migration and running it.`)
      const before = JSON.parse(raw) as Record<string, unknown>
      setData.run(JSON.stringify(renameInPlace(before)), rename.id)
      report.recordsWritten += 1
      if (rename.deleted) report.deletedRenamed += 1
      else report.liveRenamed += 1
      // `updated_at` IS DELIBERATELY NOT TOUCHED. Nothing about this run changed; the same word is
      // under a different key, and moving the record's own "last worked on" would put 92 rows at
      // the top of every list ordered by it, on a day nobody worked on any of them.
      addChange.run(
        anOfficeId(),
        rename.id,
        'update',
        ACTOR_TYPE,
        ACTOR_ID,
        null,
        `data.${THE_OLD_KEY} -> data.${THE_NEW_KEY}`,
        rename.value,
        rename.value,
        at,
        rename.workspaceId,
      )
      report.changeRows += 1
    }

    // CHECK — not one record still holds the old key, and every value came across unchanged. Asked
    // of the database in its own statement rather than inferred from the loop above.
    const left = sqlite
      .prepare("SELECT id FROM records WHERE json_valid(data) AND json_type(data, '$.agent') IS NOT NULL")
      .pluck()
      .all() as string[]
    if (left.length > 0) {
      throw new Error(
        `${left.length} record(s) still hold data.agent after the step that renames it: ${left.join(', ')}. ` +
          'Nothing has been kept.',
      )
    }
    for (const rename of plan.renames) {
      const raw = readData.get(rename.id) as string | undefined
      const now = raw === undefined ? {} : (JSON.parse(raw) as Record<string, unknown>)
      const value = now[THE_NEW_KEY]
      if ((value ?? null) !== rename.value) {
        throw new Error(
          `Session ${rename.id} held ${JSON.stringify(rename.value)} and now reads ${JSON.stringify(value ?? null)} ` +
            'under the new key. Nothing has been kept.',
        )
      }
    }
  })

  run()
  return report
}

export function describeSessionRuntime(report: RuntimeReport): string {
  if (report.alreadyDone) {
    return `session runtime: nothing to rename (no record holds data.${THE_OLD_KEY})`
  }
  const lines = [
    `session runtime: ${report.recordsWritten} record(s) renamed data.${THE_OLD_KEY} -> data.${THE_NEW_KEY} ` +
      `(${report.liveRenamed} live, ${report.deletedRenamed} deleted), no value changed, ` +
      `${report.changeRows} change row(s). The revision each one needs is written by the catch-up pass in this ` +
      `same run, which is why this step sits above it.`,
  ]
  for (const note of report.notes) lines.push(`  LEFT AS IT IS — ${note.id}: ${note.detail}`)
  return lines.join('\n')
}

// ======================================================================================== act C, plan

export function countDispatchBackfill(sqlite: Database.Database): MeasuredDispatch {
  const empty = {
    messages: 0,
    needingAMoment: 0,
    namingASession: 0,
    annotationsNamingASession: 0,
    runsNamingASession: 0,
  }
  if (!tableIsThere(sqlite, 'agent_messages')) return empty
  const one = (sql: string): number => (sqlite.prepare(sql).get() as { n: number }).n
  return {
    messages: one('SELECT count(*) AS n FROM agent_messages'),
    needingAMoment: one("SELECT count(*) AS n FROM agent_messages WHERE state <> 'queued' AND sent_at IS NULL"),
    namingASession: one("SELECT count(*) AS n FROM agent_messages WHERE recipient_kind = 'session'"),
    annotationsNamingASession: !tableIsThere(sqlite, 'records')
      ? 0
      : one(
          "SELECT count(*) AS n FROM records WHERE kind = 'annotation' AND deleted_at IS NULL AND json_valid(data) " +
            "AND json_extract(data, '$.chosenRecipient.kind') = 'session'",
        ),
    runsNamingASession: !tableIsThere(sqlite, 'agent_runs')
      ? 0
      : one('SELECT count(*) AS n FROM agent_runs WHERE recipient_session_id IS NOT NULL AND agent_id IS NULL'),
  }
}

/** Which agent each session says it worked as, in one project. Act A wrote these. */
export function identitiesBySession(sqlite: Database.Database): Map<string, { agentId: string; workspaceId: string }> {
  const out = new Map<string, { agentId: string; workspaceId: string }>()
  if (!tableIsThere(sqlite, 'records')) return out
  const rows = sqlite
    .prepare(
      "SELECT id, workspace_id, json_extract(data, '$.ranAs') AS ranAs FROM records WHERE kind = 'session' " +
        "AND json_valid(data) AND json_type(data, '$.ranAs') = 'array'",
    )
    .all() as { id: string; workspace_id: string; ranAs: string }[]
  for (const row of rows) {
    let entries: Record<string, unknown>[] = []
    try {
      entries = JSON.parse(row.ranAs) as Record<string, unknown>[]
    } catch {
      continue
    }
    const here = entries.find((entry) => entry['workspaceId'] === row.workspace_id)
    if (typeof here?.['agentId'] === 'string') out.set(row.id, { agentId: here['agentId'], workspaceId: row.workspace_id })
  }
  return out
}

/**
 * WHEN MOLE OFFICE ACCEPTED EACH DISPATCH, taken from the run that carried it and NEVER invented.
 *
 * `dispatchThread` sets a message sent and inserts its run in ONE transaction, so a run's
 * `created_at` is the moment its message went. Where a thread holds several of each, the runs are
 * paired with the messages in order and each run is used once: a run cannot have carried two
 * messages, and using one twice would stamp a moment that never happened onto the second.
 *
 * A message past `queued` with no run left to pair with is UNDATABLE, and that refuses the whole
 * act. Never stamp a time nobody recorded.
 */
export function planDispatchBackfill(sqlite: Database.Database): {
  writes: MessageWrite[]
  undatable: Undatable[]
  refusals: string[]
  annotationMoves: { id: string; sessionId: string; agentId: string }[]
  runBindings: { id: string; sessionId: string; agentId: string }[]
  notes: SkipNote[]
  messages: number
  answered: string[]
} {
  const notes: SkipNote[] = []
  const refusals: string[] = []
  const writes: MessageWrite[] = []
  const undatable: Undatable[] = []
  const annotationMoves: { id: string; sessionId: string; agentId: string }[] = []
  const runBindings: { id: string; sessionId: string; agentId: string }[] = []
  if (!tableIsThere(sqlite, 'agent_messages')) {
    return { writes, undatable, refusals, annotationMoves, runBindings, notes, messages: 0, answered: [] }
  }

  const identities = identitiesBySession(sqlite)
  const messages = sqlite
    .prepare(
      'SELECT id, thread_id, state, recipient_kind, recipient_session_id, recipient_agent_id, sent_at, state_at, ' +
        'created_at FROM agent_messages ORDER BY created_at, id',
    )
    .all() as {
    id: string
    thread_id: string
    state: string
    recipient_kind: string | null
    recipient_session_id: string | null
    recipient_agent_id: string | null
    sent_at: string | null
    state_at: string | null
    created_at: string
  }[]

  const answered = messages.filter((m) => m.state === THE_WORD_THAT_STOPS_IT).map((m) => m.id)

  // THE RUNS IN EACH THREAD, OLDEST FIRST, EACH USABLE ONCE.
  const runsByThread = new Map<string, { id: string; created_at: string }[]>()
  if (tableIsThere(sqlite, 'agent_runs')) {
    const runs = sqlite.prepare('SELECT id, thread_id, created_at FROM agent_runs ORDER BY created_at, id').all() as {
      id: string
      thread_id: string
      created_at: string
    }[]
    for (const run of runs) {
      const list = runsByThread.get(run.thread_id) ?? []
      list.push({ id: run.id, created_at: run.created_at })
      runsByThread.set(run.thread_id, list)
    }
  }
  const used = new Set<string>()

  for (const message of messages) {
    let recipientAgentId: string | null = null
    if (message.recipient_kind === 'session') {
      const session = message.recipient_session_id
      const identity = session === null ? undefined : identities.get(session)
      if (identity === undefined) {
        // THE REFUSAL RULE §8.2 STEP 5 STATES, as a predicate rather than a count: a row reading
        // `session` whose session did not become an identity stops the migration and is named.
        refusals.push(
          `message ${message.id} is addressed to run ${String(session)}, and that run did not become a durable ` +
            `identity — so there is nothing to file the message under`,
        )
      } else if (message.recipient_agent_id === null) {
        recipientAgentId = identity.agentId
      } else {
        notes.push({
          kind: 'already_resolved',
          id: message.id,
          detail: `Message ${message.id} already names agent ${message.recipient_agent_id}. It was not rewritten.`,
        })
      }
    } else if (message.recipient_kind === 'new') {
      // A PERSON ASKED FOR A FRESH AGENT AND THAT IS NEVER REWRITTEN. `recipient_kind` stays `new`
      // for ever; who eventually took it is a different column.
      notes.push({
        kind: 'deliberately_new',
        id: message.id,
        detail: `Message ${message.id} was addressed to a deliberately new agent. Nothing here resolves that choice.`,
      })
    }

    let sentAt: string | null = null
    let from: string | null = null
    if (message.state !== 'queued' && message.sent_at === null) {
      const candidates = (runsByThread.get(message.thread_id) ?? []).filter(
        (run) => !used.has(run.id) && run.created_at >= message.created_at,
      )
      const run = candidates[0]
      if (run === undefined) {
        undatable.push({
          id: message.id,
          threadId: message.thread_id,
          state: message.state,
          why:
            `no run in its thread was created at or after the message and is not already accounted for by an ` +
            `earlier message`,
        })
      } else {
        used.add(run.id)
        sentAt = run.created_at
        from = run.id
      }
    } else if (message.sent_at !== null) {
      notes.push({
        kind: 'already_stamped',
        id: message.id,
        detail: `Message ${message.id} already says it was accepted at ${message.sent_at}. It was not restamped.`,
      })
    }

    if (recipientAgentId !== null || sentAt !== null) {
      writes.push({ id: message.id, threadId: message.thread_id, state: message.state, recipientAgentId, sentAt, from })
    }
  }

  // THE ANNOTATIONS §8.2 STEP 8 MOVES, under the same predicate.
  if (tableIsThere(sqlite, 'records')) {
    const rows = sqlite
      .prepare(
        "SELECT id, json_extract(data, '$.chosenRecipient.sessionId') AS session, " +
          "json_extract(data, '$.chosenRecipient.agentId') AS agent FROM records " +
          "WHERE kind = 'annotation' AND deleted_at IS NULL AND json_valid(data) " +
          "AND json_extract(data, '$.chosenRecipient.kind') = 'session' ORDER BY id",
      )
      .all() as { id: string; session: string | null; agent: string | null }[]
    for (const row of rows) {
      const identity = row.session === null ? undefined : identities.get(row.session)
      if (identity === undefined) {
        refusals.push(
          `comment ${row.id} is addressed to run ${String(row.session)}, and that run did not become a durable identity`,
        )
        continue
      }
      // ALREADY FILED UNDER THE IDENTITY ITS RUN WORKED AS, so there is nothing to move.
      //
      // THE SAME READING THE MESSAGE LOOP ABOVE ALREADY GAVE, and it was missing here alone: a
      // message whose `recipient_agent_id` is already filled in is noted `already_resolved` and left,
      // while an annotation carrying the same answer in `chosenRecipient.agentId` was counted as a
      // write. `src/server/lib/records.ts` writes that value at the moment somebody chooses a run,
      // so this is the difference between "the door already did it" and "this pass has work to do" —
      // and a step that reports a write it would not make is what stops a server starting for
      // nothing.
      if (row.agent === identity.agentId) {
        notes.push({
          kind: 'already_resolved',
          id: row.id,
          detail: `Comment ${row.id} already names agent ${row.agent}, which is what run ${String(row.session)} worked as. It was not rewritten.`,
        })
        continue
      }
      annotationMoves.push({ id: row.id, sessionId: row.session as string, agentId: identity.agentId })
    }
  }

  // AND THE RUNS. A run addressed to a session takes that session's identity; an unaddressed one
  // keeps `agent_id` NULL, which is a real answer and is what §8.2 step 7 says about this corpus.
  if (tableIsThere(sqlite, 'agent_runs')) {
    const rows = sqlite
      .prepare('SELECT id, recipient_session_id FROM agent_runs WHERE agent_id IS NULL ORDER BY id')
      .all() as { id: string; recipient_session_id: string | null }[]
    for (const row of rows) {
      if (row.recipient_session_id === null) {
        notes.push({
          kind: 'unaddressed_run',
          id: row.id,
          detail: `Run ${row.id} carries a message nobody addressed, so it is filed under no agent. Its agent_id stays empty.`,
        })
        continue
      }
      const identity = identities.get(row.recipient_session_id)
      if (identity === undefined) {
        refusals.push(
          `run ${row.id} is addressed to session ${row.recipient_session_id}, and that session did not become a ` +
            `durable identity`,
        )
        continue
      }
      runBindings.push({ id: row.id, sessionId: row.recipient_session_id, agentId: identity.agentId })
    }
  }

  return { writes, undatable, refusals, annotationMoves, runBindings, notes, messages: messages.length, answered }
}

/**
 * ACT C — RUN IT. One transaction.
 *
 * IT WRITES `records.data` on the annotations it moves, and it runs BELOW `migrateRevisions`, so it
 * takes window B's other option and RESTAMPS each one's newest revision itself — the shape
 * `design/round-nine/step20-bundle/place-migration.ts:308,347` uses, with the same check afterwards
 * that the record hashes to what its newest revision holds.
 */
export function migrateAgentDispatch(sqlite: Database.Database, measured: MeasuredDispatch): DispatchReport {
  const here = countDispatchBackfill(sqlite)
  const wrong: string[] = []
  if (here.messages !== measured.messages) wrong.push(`you measured ${measured.messages} messages; this database holds ${here.messages}`)
  if (here.needingAMoment !== measured.needingAMoment) {
    wrong.push(`you measured ${measured.needingAMoment} messages past queued with no moment; this database holds ${here.needingAMoment}`)
  }
  if (here.namingASession !== measured.namingASession) {
    wrong.push(`you measured ${measured.namingASession} messages naming a run; this database holds ${here.namingASession}`)
  }
  if (here.annotationsNamingASession !== measured.annotationsNamingASession) {
    wrong.push(
      `you measured ${measured.annotationsNamingASession} comments naming a run; this database holds ` +
        `${here.annotationsNamingASession}`,
    )
  }
  if (here.runsNamingASession !== measured.runsNamingASession) {
    wrong.push(`you measured ${measured.runsNamingASession} runs naming a session; this database holds ${here.runsNamingASession}`)
  }
  if (wrong.length > 0) {
    throw new Error(
      `This is not the corpus that was counted, so nothing was written.\n  ${wrong.join('\n  ')}\n` +
        'Re-run `npx tsx design/round-ten/migrations/run-agent-identity.mjs <this database>` with no --apply and ' +
        'hand the runner what it prints.',
    )
  }

  const plan = planDispatchBackfill(sqlite)

  // REFUSE FIRST, which is §8.2 step 1 and is asked before anything else is looked at.
  if (plan.answered.length > 0) {
    throw new Error(
      `Nothing was written. ${plan.answered.length} message(s) still hold the state "${THE_WORD_THAT_STOPS_IT}", ` +
        `which the six words \`agent_messages.state\` now carries do not include: ${plan.answered.join(', ')}. ` +
        'Whether one of those was handled, delivered or picked up is a fact about somebody\'s dispatch, and ' +
        'nothing here will decide it. Write the word each one should hold and run this again.',
    )
  }
  if (plan.refusals.length > 0) {
    throw new Error(
      'Nothing was written, because this migration will not file somebody\'s words under an agent that does not ' +
        'exist.\n  ' +
        plan.refusals.join('\n  ') +
        '\nEvery one of these names a run that act A did not mint an identity for. Run act A first, or settle the ' +
        'row that names it.',
    )
  }
  if (plan.undatable.length > 0) {
    // THE REFUSAL IS RIGHT AND IT IS NOT SOFTENED. What it says to is what changed: it used to end
    // "Write the `sent_at` these rows should hold", which is an instruction to whoever writes
    // migrations, and the person who reads it is the owner of a Mole Office that has just refused to
    // start. So it says what the row is, that Mole Office no longer makes one, and what they can do.
    throw new Error(
      'Nothing was written, because this migration will not stamp a time nobody recorded.\n  ' +
        plan.undatable.map((one) => `message ${one.id} in thread ${one.threadId} reads "${one.state}" and ${one.why}`).join('\n  ') +
        '\nA message reading anything but "queued" has been given to somebody, and when that happened is part of ' +
        'the word rather than a decoration on it. That moment comes from the run that carried the message and from ' +
        'nowhere else, and no run in this database can date the rows above.\n' +
        'NOTHING IN MOLE OFFICE WRITES A ROW LIKE THIS ANY MORE: a message is written with the moment it reached ' +
        'its word, and the one door that writes one refuses a row that owes a moment and carries none — see ' +
        '`aMomentIsOwedBy` in src/server/lib/dispatch.ts. A row that reaches here was written by an older build ' +
        'or by something outside Mole Office.\n' +
        'Mole Office will not invent the moment, because a moment nobody recorded is a wait nobody had. Settle each ' +
        'row named above on a copy of the database — decide when it went out and write that into `sent_at` — and ' +
        'run this again.',
    )
  }

  const report: DispatchReport = {
    alreadyDone: plan.writes.length === 0 && plan.annotationMoves.length === 0 && plan.runBindings.length === 0,
    messages: plan.messages,
    writes: plan.writes,
    momentsWritten: 0,
    recipientsResolved: 0,
    annotationsMoved: 0,
    runsBound: 0,
    rowsWritten: 0,
    notes: plan.notes,
  }
  if (report.alreadyDone) return report

  const stamp = sqlite.prepare('UPDATE agent_messages SET sent_at = ?, state_at = ? WHERE id = ?')
  const resolve = sqlite.prepare("UPDATE agent_messages SET recipient_agent_id = ?, recipient_kind = 'agent' WHERE id = ?")
  const bindRun = sqlite.prepare('UPDATE agent_runs SET agent_id = ? WHERE id = ?')
  const readRow = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?')
  const setData = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const newestSeq = sqlite.prepare('SELECT max(seq) AS seq FROM revisions WHERE record_id = ?')
  const newestRevision = sqlite.prepare('SELECT id FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').pluck()
  const restamp = sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ?, note = ? WHERE id = ?')
  const addRevision = sqlite.prepare(
    'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, ' +
      'op, actor_type, actor_id, session_id, at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const addChange = sqlite.prepare(
    'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, ' +
      'workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  const NOTE =
    'The round ten agent-identity migration moved this comment from the run it named to the durable identity that ' +
    'run worked as. The words are untouched; only who they are filed under moved, and the run is still named by ' +
    'the identity itself.'

  const run = sqlite.transaction(() => {
    const at = nowStamp()
    for (const write of plan.writes) {
      if (write.sentAt !== null) {
        // `state_at` = `sent_at` WHERE THERE IS ONE. §8.2 step 5's own words: the moment the word
        // last moved is the moment it moved to `sent`, because it has not moved since.
        stamp.run(write.sentAt, write.sentAt, write.id)
        report.momentsWritten += 1
      }
      if (write.recipientAgentId !== null) {
        // BOTH COLUMNS TOGETHER, and this act is what §8.2 step 5 asks for: a comment addressed to a
        // run is filed under the durable identity that run worked as. §3.2's invariant no longer
        // requires the kind to move with it — see the check at the end of this transaction — but
        // this statement is unchanged, because moving the kind is this migration's own decision
        // about the rows it finds and not something the invariant was making it do.
        resolve.run(write.recipientAgentId, write.id)
        report.recipientsResolved += 1
      }
      report.rowsWritten += 1
    }

    for (const binding of plan.runBindings) {
      bindRun.run(binding.agentId, binding.id)
      report.runsBound += 1
      report.rowsWritten += 1
    }

    for (const move of plan.annotationMoves) {
      const row = readRow.get(move.id) as
        | { id: string; kind: string; title: string; summary: string | null; data: string; deleted_at: string | null; workspace_id: string }
        | undefined
      if (row === undefined) throw new Error(`Comment ${move.id} went between planning this migration and running it.`)
      const data = JSON.parse(row.data) as Record<string, unknown>
      const chosen = { ...(data['chosenRecipient'] as Record<string, unknown>) }
      chosen['kind'] = AGENT_KIND
      chosen['agentId'] = move.agentId
      data['chosenRecipient'] = chosen
      setData.run(JSON.stringify(data), move.id)
      report.annotationsMoved += 1
      report.rowsWritten += 1
      addChange.run(anOfficeId(), move.id, 'update', ACTOR_TYPE, ACTOR_ID, null, 'data.chosenRecipient', move.sessionId, move.agentId, at, row.workspace_id)

      // THE RESTAMP, because this act runs below `migrateRevisions` and nothing else will catch it
      // up. The newest revision is rewritten in place where there is one, and a fresh revision is
      // written where the record has none at all.
      const content = contentOf({
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data,
        deletedAt: row.deleted_at,
      })
      const newest = newestRevision.get(move.id) as string | undefined
      if (newest === undefined) {
        addRevision.run(
          anOfficeId(),
          move.id,
          row.workspace_id,
          ((newestSeq.get(move.id) as { seq: number | null } | undefined)?.seq ?? 0) + 1,
          versionOf(content),
          row.kind,
          row.title,
          row.summary,
          JSON.stringify(content.data),
          row.deleted_at,
          'update',
          ACTOR_TYPE,
          ACTOR_ID,
          null,
          at,
          NOTE,
        )
      } else {
        restamp.run(JSON.stringify(content.data), versionOf(content), NOTE, newest)
      }
    }

    // CHECK — the ledger agrees with every comment this moved. Re-read from the row, inside the
    // transaction, so a disagreement rolls the act back rather than leaving a comment whose
    // compare-and-set token refuses every write.
    for (const move of plan.annotationMoves) {
      const row = readRow.get(move.id) as
        | { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null }
        | undefined
      if (row === undefined) continue
      const want = versionOf(
        contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        }),
      )
      const held = sqlite
        .prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
        .pluck()
        .get(move.id) as string | undefined
      if (held !== want) {
        throw new Error(
          `Comment ${move.id} holds content hashing to ${want} and its newest revision says ${String(held)}. ` +
            'Nothing has been kept.',
        )
      }
    }

    // AND THE INVARIANT, asked of the table rather than of the loop: `recipient_agent_id` is not
    // null ONLY on a row whose recipient has a durable identity — `agent` or `session`.
    //
    // IT USED TO ASK `(recipient_kind = 'agent') <> (recipient_agent_id IS NOT NULL)`, WHICH IS NOT
    // TRUE OF THIS PRODUCT. Measured 31 August 2026 through the ordinary routes: a QUEUED message
    // addressed to a durable agent stores `kind = 'agent'` and leaves `recipient_agent_id` NULL,
    // because `moveMessageTo` writes that column at SEND. So one such comment in a corpus, plus any
    // other reason for this step to run, made this line throw — and a throw here reaches
    // `prepareToServe` as `finding out whether it needs migrating FAILED` with a stack behind it,
    // rather than as the refusal an operator can read and act on.
    const broken = sqlite
      .prepare(
        "SELECT id FROM agent_messages WHERE recipient_agent_id IS NOT NULL " +
          "AND (recipient_kind IS NULL OR recipient_kind NOT IN ('agent', 'session'))",
      )
      .pluck()
      .all() as string[]
    if (broken.length > 0) {
      throw new Error(
        `${broken.length} message(s) name a durable identity without naming a recipient that has one: ` +
          `${broken.join(', ')}. Nothing has been kept.`,
      )
    }
  })

  run()
  return report
}

export function describeAgentDispatch(report: DispatchReport): string {
  if (report.alreadyDone) {
    return `dispatch: nothing to backfill (${report.messages} message(s) read; every one already says when it went and who to)`
  }
  const lines = [
    `dispatch: ${report.momentsWritten} message(s) stamped with the moment Mole Office accepted them, ` +
      `${report.recipientsResolved} filed under a durable identity, ${report.annotationsMoved} comment(s) moved ` +
      `from a run to an identity, ${report.runsBound} run(s) bound, ${report.rowsWritten} row(s) written`,
  ]
  for (const write of report.writes) {
    if (write.sentAt !== null) lines.push(`  ${write.id} accepted at ${write.sentAt}, taken from run ${String(write.from)}`)
    if (write.recipientAgentId !== null) lines.push(`  ${write.id} filed under ${write.recipientAgentId}`)
  }
  for (const note of report.notes) lines.push(`  LEFT AS IT IS — ${note.id}: ${note.detail}`)
  return lines.join('\n')
}
