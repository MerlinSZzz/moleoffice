// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { storedFileChanged } from './storage/store.ts'
/**
 * WHERE, HOW AND ON WHICH MACHINE EACH SESSION OF A PERMANENT RESIDENT STARTED: `session-origins.jsonl`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * As item 4 of a decision says, a resident's folder holds one file that
 * records where each session started, how it
 * started and on which machine, so the resident can be found and picked up again.
 *
 * So the root of every personal space holds `session-origins.jsonl`. The office writes it, and nobody else: the
 * resident may not write it or mark it void (src/server/lib/residents.ts refuses both). One JSON line per session
 * start, appended, and a line once written is never rewritten.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN A LINE IS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * THE FIRST, IN THE CONFIRM ACT, from the resident's most recent session. An agent with no session on record gets
 * an empty file, and the confirm's reply says so: a line with no session behind it would be a session start that
 * nobody saw.
 *
 * THEN ONE LINE FOR EACH LATER SESSION, appended by `bringTheOriginsUpToDate`. Nothing here changes how a session
 * is filed: that is wave 13n's code, and this file only reads what it filed. So the office brings every resident's
 * file up to date at three moments: once a minute, from the watcher the server starts beside its reminders
 * (`startTheOriginWatcher`); whenever anybody reads the resident or its space through the residents doors; and in
 * the confirm act. A session that started is therefore in the file within a minute, or at the next read.
 *
 * WHAT COUNTS AS A LATER SESSION: a live `session` record serving this agent that the file does not name yet and
 * that was filed after the newest session the file already names (or, for an empty file, at or after the moment
 * the agent became a resident). A session record that is deleted is never written.
 *
 * A RUN THAT NAMES ITS CONVERSATION AND HAS NO STAMP YET IS WAITED FOR (wave 13u round 109). The office files the run
 * of an agent it opens in one of its own panes before the program starts, and the run's stamp, which carries the
 * command that resumes it, comes at the program's first stop. A line written before that said the command was unknown
 * for good. So such a run's line, and every later one, waits until the stamp comes, the run ends, or 30 minutes have
 * passed since it was filed, whichever is first. A line then written with no stamp says why in
 * `resumeCommandUnknownBecause`. A run that names no conversation is written at once, as before.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A LINE HOLDS, AND WHAT IT NEVER HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Each field is read from the session record, and from nothing else. A field the record does not carry is null,
 * and `unknown` names every null field. Nothing is guessed: `resumeCommand` is the command discovery recorded on
 * the session (`stampOf` in lib/sessions.ts), never one built here from an id; `host` is the machine the session
 * record names, and `officeMachine` beside it is the machine the office runs on, which is a fact about the office
 * and not a guess about the session.
 *
 * IT NEVER HOLDS A KEY, A TOKEN OR ANY SECRET. Only the fields named below are read, and each value is screened by
 * `aSecretIsIn`: a value that looks like a key, or that holds the value of an environment variable whose name says
 * it is a key, token, secret or password, is not written. The field is null and `withheld` names it. A line is then
 * screened whole once more before it is written, and a line that still holds such a value is refused loudly rather
 * than written.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { localStamp, parseLocalStamp } from '@shared/time.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { isOneOf, theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { theAgentsWhoseOwnRunThisIs } from './the-run-a-key-holds.ts'
import { stampOf } from './stamp-of.ts'
import { recordInWorkspace } from './records.ts'
import { PanelError } from './panel-error.ts'
// THE MACHINE THE OFFICE RUNS ON, asked through the one layer that may ask the machine about itself.
import { thisMachine } from './machines.ts'

/** The file's name, at the root of every personal space. Reserved: nobody but the office writes it. */
export const SESSION_ORIGINS_FILE = 'session-origins.jsonl'

/** The longest a live run's line waits for the run's stamp, from when the run was filed. */
const A_LINE_WAITS_FOR_A_STAMP_MS = 30 * 60_000

/** One session record serving an agent, as the database holds it. */
interface ASessionRecord {
  id: string
  createdAt: string
  data: Record<string, unknown>
}

/** One line of the file, as the office writes it. */
export interface ASessionOrigin {
  /** When the office wrote this line, local time. */
  recordedAt: string
  /** The `session` record this line was read from. */
  sessionRecordId: string
  /** When that record was filed, local time. A fact about the record, kept apart from `startedAt`. */
  sessionRecordFiledAt: string
  /** When the session started, as the record says (`startedAt`, or discovery's `startedAt`). */
  startedAt: string | null
  /** Which tool ran it: claude-code, codex, dsh… */
  runtime: string | null
  model: string | null
  /** The machine the session record names. */
  host: string | null
  /** The machine this office runs on, by its own name, or null when the operating-system layer cannot say. */
  officeMachine: string | null
  /** The working directory. */
  cwd: string | null
  /** The checkout, where the session says: today a session says only the branch its checkout was cut from. */
  checkout: { cutFrom: string } | null
  /** The provider's own id for the conversation. */
  providerSession: string | null
  /** The command that picks the session up again, as discovery recorded it. */
  resumeCommand: string | null
  /**
   * Why no stamp carried the command, when the run names its conversation and had no stamp; otherwise null. A line
   * written before 27 October 2026 does not carry it.
   */
  resumeCommandUnknownBecause?: string | null
  /** How it was started, where recorded. */
  how: {
    /** What the tool recorded about how it was started, for example "cli". */
    entryPoint: string | null
    /** True when Mole Office itself started the process. */
    startedByMoleOffice: boolean | null
    /** The sandbox template, when a sandbox launcher started it. */
    sandbox: string | null
    /** Where a person can watch it, for example a tmux pane. */
    terminal: string | null
  }
  /** Every field above that is null, by name. */
  unknown: string[]
  /** Every field left out because its value looked like a secret, by name. */
  withheld: string[]
}

// ============================================================================ the screen for secrets

/** What a key looks like here and at the providers: long hex, the providers' prefixes, a long opaque token. */
const KEY_SHAPES: readonly RegExp[] = [
  /[0-9a-f]{32,}/iu,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  // A RUN OF 40 OR MORE CHARACTERS WITH NO SLASH, NO DOT AND NO SPACE. A path is broken up by slashes and a command
  // by spaces, so neither reaches this; a uuid is 36 characters.
  /[A-Za-z0-9+=_-]{40,}/u,
]

/** An environment variable whose name says it holds a secret. */
const A_SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/iu

/** The values of this process's environment whose names say they are secrets, eight characters or longer. */
function theSecretsInTheEnvironment(): string[] {
  return Object.entries(process.env)
    .filter(([name, value]) => A_SECRET_NAME.test(name) && typeof value === 'string' && value.length >= 8)
    .map(([, value]) => value as string)
}

/** Whether a value looks like a key, or holds a secret this process was given. */
export function aSecretIsIn(value: string, secrets: readonly string[] = theSecretsInTheEnvironment()): boolean {
  if (KEY_SHAPES.some((shape) => shape.test(value))) return true
  return secrets.some((secret) => value.includes(secret))
}

// ============================================================================ reading the sessions

/**
 * EVERY LIVE SESSION RECORD SERVING THIS AGENT, oldest first.
 *
 * `servingAgentId` is the registry id. `servingAgent` is a STORED reference, a handle or an id written by whoever filed
 * the run, so it counts only when the stored reader says it names this agent and no other (`theOneAgentAStringNames` in
 * lib/agent-references.ts).
 *
 * ALIASES ARE FOLLOWED IN BOTH FIELDS. A run stored before an alias was filed may hold the agent's old id. The statement
 * asks for the agent's canonical id and each alias filed for it, in `servingAgentId` and in `servingAgent`, and each row is
 * kept when its id, or the agent its stored reference names, has this agent's canonical id. With no alias filed the
 * statement and its plan are the ones it had before.
 */
export function theSessionsOfTheAgent(agentId: string, handle: string): ASessionRecord[] {
  const aliases = theFiledAliasesReadOnce(sqlite)
  const ids = aliases.everyIdOf(agentId)
  const canonical = ids[0]!
  const rows = sqlite
    .prepare(
      "SELECT id, created_at AS createdAt, data FROM records WHERE kind = 'session' AND deleted_at IS NULL AND (" +
        `json_extract(data, '$.servingAgentId') ${isOneOf(ids)} OR json_extract(data, '$.servingAgent') IN (${ids.map(() => '?').join(', ')}, ?)) ` +
        'ORDER BY created_at, rowid',
    )
    .all(...ids, ...ids, handle) as { id: string; createdAt: string; data: string }[]
  const out: ASessionRecord[] = []
  for (const row of rows) {
    const data = JSON.parse(row.data) as Record<string, unknown>
    const byId = data['servingAgentId']
    if (typeof byId === 'string') {
      if (aliases.canonicalOf(byId) === canonical) out.push({ id: row.id, createdAt: row.createdAt, data })
      continue
    }
    const said = data['servingAgent']
    const named = typeof said === 'string' ? theOneAgentAStringNames(sqlite, said) : null
    if (named !== null && aliases.canonicalOf(named.id) === canonical) {
      out.push({ id: row.id, createdAt: row.createdAt, data })
    }
  }
  return out
}

/**
 * THE AGENT'S NEWEST RUN, AS A DOOR WORKING IN ONE PROJECT READS IT: its way back, its tmux pane and its steps.
 *
 * An agent belongs to no project, and its runs are records, each filed in one. A door that answers about the newest run
 * filed in another project refuses, as every door with a record id does (recordInWorkspace in lib/records.ts): 404, and
 * the refusal names the project the run is in. It does not answer about an older run filed here instead, because the
 * page says it shows the newest run. tests/by-id-boundary.test.ts sends each of these doors a run from another project.
 */
export function theNewestRunOfTheAgent(agentId: string, handle: string, workspaceId: string): ASessionRecord | undefined {
  const newest = theSessionsOfTheAgent(agentId, handle).at(-1)
  if (newest !== undefined) recordInWorkspace(newest.id, workspaceId)
  return newest
}

// ============================================================================ the run a profile's resume line shows

/**
 * WHICH AGENT A RUN THAT NAMES NO SERVING AGENT COUNTS FOR, ON A PROFILE'S RESUME LINE ONLY (wave 13y round 135).
 *
 * The session hook files a run held by its filer, with no serving agent, and a run filed before its agent was known
 * names none either. Neither showed on its agent's profile, so after a crash the person had no resume command there.
 * For the resume line, and for the press that brings the run back, such a run counts for an agent in two ways:
 *
 *   (a) the agent filed it for itself, as the guard on a run's conversation reads whose run it is
 *       (`theAgentsWhoseOwnRunThisIs` in lib/the-run-a-key-holds.ts). A run discovery filed in the agent's name, from a
 *       sweep the agent asked for, is not one it filed for itself, so it does not count;
 *   (b) its newest write after the filing is under the agent's name and proved by the office's key, as the hook writes it.
 *
 * Only the newest such write under a name that names one agent is read, so a run counts for one agent at most. A later
 * write an agent's key proved is passed over, whichever agent's key it is, so no agent's key moves a run from one
 * agent's line to another's. So is a later write with no key behind it, and a write under a name that names no agent.
 *
 * THIS GIVES NO HOLDING. A run that counts here is not held by the agent's key: holding is the rule in
 * lib/the-run-a-key-holds.ts, and later writes under an agent's name never make its key hold a run. Every other reader
 * of an agent's runs (its origins file, its pane and its steps) still reads the serving agent only.
 */
function aReaderOfWhomARunCountsFor(): (run: { id: string; data: string }) => string | null {
  const writes = sqlite.prepare(
    'SELECT seq, actor_id AS actorId FROM revisions ' +
      "WHERE record_id = ? AND actor_type = 'agent' AND (seq = 1 OR proved_by = 'the-office-key') ORDER BY seq DESC",
  )
  const named = new Map<string, string | null>()
  const theAgentNamed = (name: string): string | null => {
    if (!named.has(name)) named.set(name, theOneAgentAStringNames(sqlite, name)?.id ?? null)
    return named.get(name)!
  }
  return (run) => {
    for (const write of writes.iterate(run.id) as IterableIterator<{ seq: number; actorId: string }>) {
      const agent = theAgentNamed(write.actorId)
      if (agent === null) continue
      // A later write is here only when the office's key proved it, by (b). The filing counts by (a) alone.
      if (write.seq > 1) return agent
      const data = JSON.parse(run.data) as Record<string, unknown>
      return theAgentsWhoseOwnRunThisIs({ id: run.id, data, deleted: false }).includes(agent) ? agent : null
    }
    return null
  }
}

/**
 * A RUN THAT NAMES NO SERVING AGENT, in the words of the indexes on a run's two serving fields (`STORED_FIELDS` in
 * db/schema.ts). Asked with a plain json_extract, SQLite read every run's data: 41 ms on a made-up office at the scale
 * of 22 October 2026, where every run names its serving agent, against 0.03 ms through the index (wave 13y round 135).
 */
function namesNoServingAgent(): string {
  return `${theWordsOfAStoredField(STORED_FIELDS.sessionServingAgentId, 'data')} IS NULL AND ` +
    `${theWordsOfAStoredField(STORED_FIELDS.sessionServingAgent, 'data')} IS NULL`
}

/**
 * The agent's newest run that names no serving agent and counts for it, filed after `after`, or undefined. `INDEXED BY`
 * holds the read to the index on the serving id, and makes a read SQLite cannot answer from it an error.
 */
function theNewestRunThatCountsByItsWrites(agentId: string, after: ASessionRecord | undefined): ASessionRecord | undefined {
  const aliases = theFiledAliasesReadOnce(sqlite)
  const canonical = aliases.everyIdOf(agentId)[0]!
  const countsFor = aReaderOfWhomARunCountsFor()
  const later = sqlite.prepare(
    "SELECT id, created_at AS createdAt, data FROM records INDEXED BY records_session_serving_agent_id_idx WHERE kind = 'session' " +
      'AND deleted_at IS NULL AND ' + namesNoServingAgent() + ' ' +
      (after === undefined ? '' : 'AND (created_at > ? OR (created_at = ? AND rowid > (SELECT rowid FROM records WHERE id = ?))) ') +
      'ORDER BY created_at DESC, rowid DESC',
  )
  const bound = after === undefined ? [] : [after.createdAt, after.createdAt, after.id]
  for (const row of later.iterate(...bound) as IterableIterator<{ id: string; createdAt: string; data: string }>) {
    const agent = countsFor(row)
    if (agent === null || aliases.canonicalOf(agent) !== canonical) continue
    return { id: row.id, createdAt: row.createdAt, data: JSON.parse(row.data) as Record<string, unknown> }
  }
  return undefined
}

/**
 * THE RUN AN AGENT'S RESUME LINE SHOWS: its newest run serving it, or a later run that counts for it by the rule above.
 * A run filed in another project is refused as in `theNewestRunOfTheAgent`.
 */
export function theNewestRunTheResumeLineShows(agentId: string, handle: string, workspaceId: string): ASessionRecord | undefined {
  const newest = theNewestRunForTheResumeLine(agentId, handle)
  if (newest !== undefined) recordInWorkspace(newest.id, workspaceId)
  return newest
}

/** The same newest run, without restricting the project in which it was filed. */
export function theNewestRunForTheResumeLine(agentId: string, handle: string): ASessionRecord | undefined {
  const served = theSessionsOfTheAgent(agentId, handle).at(-1)
  return theNewestRunThatCountsByItsWrites(agentId, served) ?? served
}

/**
 * THE RUNS A PRESS MAY BRING BACK FOR THE AGENT, so it finds what the line shows: `run` when it serves the agent or counts
 * for it by the rule above. `any` says whether the agent has a run of either sort at all.
 */
export function theRunTheResumeLineCounts(agentId: string, handle: string, run: string): { run: ASessionRecord | undefined; any: boolean } {
  const served = theSessionsOfTheAgent(agentId, handle)
  const found = served.find((one) => one.id === run)
  if (found !== undefined) return { run: found, any: true }
  const row = sqlite
    .prepare(
      "SELECT id, created_at AS createdAt, data FROM records WHERE id = ? AND kind = 'session' AND deleted_at IS NULL AND " +
        namesNoServingAgent(),
    )
    .get(run) as { id: string; createdAt: string; data: string } | undefined
  const aliases = theFiledAliasesReadOnce(sqlite)
  const agent = row === undefined ? null : aReaderOfWhomARunCountsFor()(row)
  if (row !== undefined && agent !== null && aliases.canonicalOf(agent) === aliases.everyIdOf(agentId)[0]) {
    return { run: { id: row.id, createdAt: row.createdAt, data: JSON.parse(row.data) as Record<string, unknown> }, any: true }
  }
  return { run: undefined, any: served.length > 0 || theNewestRunThatCountsByItsWrites(agentId, undefined) !== undefined }
}

// ============================================================================ one line

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/**
 * A RUN THAT NAMES ITS CONVERSATION AND HAS NO STAMP: whether its line waits for the stamp, and the sentence its line
 * carries when it is written without one. Null for a run that is stamped or names no conversation. The line waits while
 * the run has not ended and was filed less than 30 minutes ago; a filing time that is not a stamp is not waited on.
 */
function theStampItLacks(session: ASessionRecord, now: Date): { waits: boolean; because: string } | null {
  if (stampOf({ data: session.data }) !== null || text(session.data['providerSession']) === null) return null
  if (theRunHasEnded(session.data['state'])) {
    return { waits: false, because: 'The run ended with no stamp naming its conversation, so nothing recorded the command that resumes it.' }
  }
  const filedMs = parseLocalStamp(session.createdAt)
  if (filedMs !== null && now.getTime() - filedMs >= A_LINE_WAITS_FOR_A_STAMP_MS) {
    return {
      waits: false,
      because: 'The run still had no stamp naming its conversation 30 minutes after it was filed, so nothing had recorded the command that resumes it.',
    }
  }
  return {
    waits: filedMs !== null,
    because: "No stamp naming the run's conversation was on it when this line was written, so nothing had recorded the command that resumes it.",
  }
}

/** The line for one session record, screened. */
export function theOriginOf(session: ASessionRecord, now: Date = new Date()): ASessionOrigin {
  const secrets = theSecretsInTheEnvironment()
  const withheld: string[] = []
  const screened = (field: string, value: string | null): string | null => {
    if (value === null) return null
    if (aSecretIsIn(value, secrets)) {
      withheld.push(field)
      return null
    }
    return value
  }
  const stamp = stampOf({ data: session.data })
  const sandbox = session.data['sandbox']
  const sandboxTemplate =
    typeof sandbox === 'object' && sandbox !== null && !Array.isArray(sandbox) ? text((sandbox as Record<string, unknown>)['template']) : null
  const startedByMoleOffice = session.data['startedByMoleOffice']
  const cutFrom = screened('checkout', text(session.data['cutFrom']))
  const line: ASessionOrigin = {
    recordedAt: localStamp(now),
    sessionRecordId: session.id,
    sessionRecordFiledAt: session.createdAt,
    startedAt: screened('startedAt', text(session.data['startedAt']) ?? stamp?.startedAt ?? null),
    runtime: screened('runtime', text(session.data['runtime']) ?? stamp?.tool ?? null),
    model: screened('model', text(session.data['model'])),
    host: screened('host', text(session.data['machine'])),
    officeMachine: thisMachine(),
    cwd: screened('cwd', text(session.data['workingDirectory'])),
    checkout: cutFrom === null ? null : { cutFrom },
    providerSession: screened('providerSession', text(session.data['providerSession'])),
    resumeCommand: screened('resumeCommand', stamp?.resumeCommand ?? null),
    resumeCommandUnknownBecause: theStampItLacks(session, now)?.because ?? null,
    how: {
      entryPoint: screened('how.entryPoint', stamp?.entryPoint ?? null),
      startedByMoleOffice: typeof startedByMoleOffice === 'boolean' ? startedByMoleOffice : null,
      sandbox: screened('how.sandbox', sandboxTemplate),
      terminal: screened('how.terminal', text(session.data['terminal'])),
    },
    unknown: [],
    withheld,
  }
  const unknown: string[] = []
  for (const field of ['startedAt', 'runtime', 'model', 'host', 'officeMachine', 'cwd', 'checkout', 'providerSession', 'resumeCommand'] as const) {
    if (line[field] === null) unknown.push(field)
  }
  for (const field of ['entryPoint', 'startedByMoleOffice', 'sandbox', 'terminal'] as const) {
    if (line.how[field] === null) unknown.push(`how.${field}`)
  }
  line.unknown = unknown
  return line
}

/**
 * THE LINE AS TEXT, screened whole once more. A line that still holds a secret is refused, loudly, rather than
 * written: the field-by-field screen above missed something, and the file is where it must never go.
 */
function theLineAsText(line: ASessionOrigin): string {
  const said = JSON.stringify(line)
  if (theSecretsInTheEnvironment().some((secret) => said.includes(secret))) {
    throw new PanelError(
      `The session-origin line for session ${line.sessionRecordId} still held a value of a secret this office was given, ` +
        'after every field was screened, so it was not written. Nothing was written to the file.',
      500,
    )
  }
  return `${said}\n`
}

// ============================================================================ the file

/** The session record ids the file already names, in its order, or a refusal when a line cannot be read. */
function theSessionsTheFileNames(file: string): string[] {
  if (!existsSync(file)) return []
  const ids: string[] = []
  const lines = readFileSync(file, 'utf8').split('\n').filter((one) => one.trim() !== '')
  for (const [i, one] of lines.entries()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(one)
    } catch {
      throw new PanelError(
        `Line ${String(i + 1)} of ${SESSION_ORIGINS_FILE} is not JSON, and only the office writes that file. Nothing was ` +
          'appended, so no line is written twice or after a line nobody can read.',
        500,
      )
    }
    const id = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)['sessionRecordId'] : undefined
    if (typeof id !== 'string') {
      throw new PanelError(`Line ${String(i + 1)} of ${SESSION_ORIGINS_FILE} names no session record. Nothing was appended.`, 500)
    }
    ids.push(id)
  }
  return ids
}

/**
 * WRITE THE FILE'S FIRST LINE, in the confirm act: from the agent's most recent session, or an empty file when it
 * has none. Answers the session it was written from, or null. The file must not exist yet; the confirm made the
 * folder a moment ago.
 */
export function writeTheFirstOrigin(space: string, agentId: string, handle: string): string | null {
  const file = join(space, SESSION_ORIGINS_FILE)
  const sessions = theSessionsOfTheAgent(agentId, handle)
  const latest = sessions.at(-1)
  writeFileSync(file, latest === undefined ? '' : theLineAsText(theOriginOf(latest)), { flag: 'wx' })
  storedFileChanged(file)
  return latest?.id ?? null
}

/**
 * APPEND ONE LINE FOR EACH SESSION THE FILE DOES NOT NAME YET, filed in the newest named one's second or after it.
 * Answers how many lines were appended. `since` is when the agent became a resident: the floor for a file that names
 * no session. The floor itself counts: a record's time is kept to the second, so a session filed in the same second
 * as the newest one the file names may have started after it, and leaving it out would lose it for good. A session
 * the file already names is never written twice, because it is left out by its id.
 *
 * THE FIRST RUN WHOSE LINE WAITS FOR ITS STAMP STOPS THE WRITING THERE, so the file stays in the order the runs were
 * filed. Every run before it is written now; it and every run after it at a later reading.
 */
export function bringTheOriginsUpToDate(space: string, agentId: string, handle: string, since: string, now: Date = new Date()): number {
  const file = join(space, SESSION_ORIGINS_FILE)
  const named = theSessionsTheFileNames(file)
  const known = new Set(named)
  const sessions = theSessionsOfTheAgent(agentId, handle)
  const newestNamed = sessions.filter((one) => known.has(one.id)).map((one) => one.createdAt).sort().at(-1)
  const floor = newestNamed ?? since
  const unnamed = sessions.filter((one) => !known.has(one.id) && one.createdAt >= floor)
  const waiting = unnamed.findIndex((one) => theStampItLacks(one, now)?.waits === true)
  const fresh = waiting === -1 ? unnamed : unnamed.slice(0, waiting)
  if (fresh.length === 0) return 0
  appendFileSync(file, fresh.map((one) => theLineAsText(theOriginOf(one, now))).join(''))
  storedFileChanged(file)
  return fresh.length
}
