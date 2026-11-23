// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATION SYNC, SERVER SIDE: one bounded read of a workspace's latest runs, the conversation each one's runtime
 * keeps, and the scrubbed copy stored on that run's own session record.
 *
 * The words and the rules are in src/shared/conversation-sync.ts. This file does the reading and writing: one query for
 * the opt-in, one query for the runs, one stat or one bounded export read per conversation up to the declared bound,
 * and one patch per run whose copy changed. It never calls GET /api/records, with or without a limit: the run rows are
 * read here, directly, in one statement.
 *
 * WHERE THE OPT-IN LIVES. One row of `runtime_settings` named `conversation-sync:<workspace id>`. That table keeps a
 * setting's name and its JSON value beside the authored tables, and the row is read by this file alone; the office's own
 * settings read walks its declared names and never sees it. A dedicated table would be the next step if this grows
 * beyond one row per workspace; this round is the bounded piece of work the requirement row asks for, and the row
 * travels with the project's export and backup exactly as the rest of the authored store does.
 *
 * WHERE THE COPY LIVES. On the run's session record, in `data.conversationSync`. The session record is already the
 * office's record of that conversation, so the copy is the record itself rather than a second store, and the project's
 * export carries it without this file adding a table or a file store. The field is not in `SECTIONS_OF.session`, so a
 * reader of the session page does not get 250 KB of transcript in the page; the sync's own read and its one-copy read
 * are the surfaces that name it.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import Database from 'better-sqlite3'
import { and, desc, eq, isNull } from 'drizzle-orm'

import { theCodexRolloutFor } from '../../config/codex-log.mjs'
import { theTranscriptFolder } from '../../config/claude-code-served.mjs'
import { shellQuote, theWayBackOf } from '../../config/the-way-back.mjs'
import {
  CONVERSATION_SYNC_MAX_BYTES,
  CONVERSATION_SYNC_MAX_FILES,
  CONVERSATION_SYNC_PAGE,
  CONVERSATION_SYNC_PAGE_MAX,
  CONVERSATION_SYNC_READS_RUNS,
  conversationPathsFor,
  restoreConversation,
  scrubConversation,
  scrubConversationPath,
  theConversationSyncSetting,
  theRuntimeHasAConversationFile,
  theRuntimeMark,
  type ConversationCopy,
  type ConversationLine,
  type ConversationPath,
  type ConversationSyncOutcome,
  type ConversationSyncReply,
  type ConversationSyncSetting,
  type ConversationSyncState,
} from '../../shared/conversation-sync.ts'
import { nowStamp } from '../../shared/time.ts'
import { db } from '../db/client.ts'
import { records, runtimeSettings } from '../db/schema.ts'
import { getRecord, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/** The one field on a session record the copy is stored in. */
export const CONVERSATION_SYNC_FIELD = 'conversationSync'

/** What one run's row of the bounded read gives this file. */
interface ARunRow {
  id: string
  title: string
  data: Record<string, unknown>
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

const bagOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/** The one bounded read of a workspace's latest runs, newest first. Deleted runs are not read. */
function theLatestRuns(workspaceId: string): ARunRow[] {
  return db
    .select({ id: records.id, title: records.title, data: records.data })
    .from(records)
    .where(and(eq(records.kind, 'session'), eq(records.workspaceId, workspaceId), isNull(records.deletedAt)))
    .orderBy(desc(records.createdAt), desc(records.id))
    .limit(CONVERSATION_SYNC_READS_RUNS)
    .all()
}

/** One row of the settings store, read as the setting it holds, or null because there is no row. */
export function readTheSyncSetting(workspaceId: string): ConversationSyncSetting | null {
  const row = db.select().from(runtimeSettings).where(eq(runtimeSettings.name, theConversationSyncSetting(workspaceId))).get()
  if (row === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(row.value)
  } catch {
    throw new PanelError(
      `The conversation sync setting for ${workspaceId} is stored in runtime_settings and is not JSON, so nothing was ` +
        'read and nothing was changed. Write the setting again.',
      500,
    )
  }
  const bag = bagOf(parsed)
  if (bag === null) return null
  const paths = Array.isArray(bag['paths'])
    ? bag['paths'].flatMap((one): ConversationPath[] => {
        const entry = bagOf(one)
        const token = textOf(entry?.['token'])
        const original = textOf(entry?.['original'])
        const mapped = textOf(entry?.['mapped'])
        return token === null || original === null ? [] : [{ token, original, mapped }]
      })
    : []
  const outcome = bagOf(bag['lastOutcome'])
  return {
    enabled: bag['enabled'] === true,
    paths,
    lastRunAt: textOf(bag['lastRunAt']),
    lastOutcome: outcome === null ? null : (outcome as unknown as ConversationSyncOutcome),
  }
}

/** Write the one setting row, replacing what it held. */
function writeTheConversationSync(workspaceId: string, setting: ConversationSyncSetting): void {
  const value = JSON.stringify(setting)
  const name = theConversationSyncSetting(workspaceId)
  const existing = db.select({ name: runtimeSettings.name }).from(runtimeSettings).where(eq(runtimeSettings.name, name)).get()
  if (existing === undefined) {
    db.insert(runtimeSettings).values({ name, value, until: null }).run()
    return
  }
  db.update(runtimeSettings).set({ value }).where(eq(runtimeSettings.name, name)).run()
}

/** The path map a workspace starts from, adding any checkout the map does not hold yet. */
function pathsForTheRuns(env: Record<string, string | undefined>, runs: readonly ARunRow[], stored: readonly ConversationPath[]): ConversationPath[] {
  const directories = runs.flatMap((run) => textOf(run.data['workingDirectory']) ?? [])
  const derived = conversationPathsFor(env, directories)
  const known = new Set(stored.map((one) => one.original))
  const out = [...stored]
  for (const one of derived) if (!known.has(one.original)) out.push(one)
  return out
}

/**
 * WHETHER A PROVIDER ID MAY BE USED AS A FILE STEM. A run's stored providerSession is a record field and a record can
 * hold anything; joined into a path it could name a file outside the runtime's folder. Only letters, digits, underscore
 * and hyphen are accepted, so neither a separator nor a dot can move the join, and the id is at least one character.
 */
function aProviderIdForAFileStem(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/u.test(value)
}

/** The folder OpenCode keeps its data in, from the two environment variables its own paths command obeys. */
export function theOpenCodeDataFolder(env: Record<string, string | undefined>): string | null {
  const data = textOf(env['XDG_DATA_HOME'])
  if (data !== null) return join(data, 'opencode')
  const home = textOf(env['HOME'])
  return home === null ? null : join(home, '.local', 'share', 'opencode')
}

/**
 * THE DATABASE FILE OPENCODE KEEPS ITS SESSIONS IN. Its own `db path` prints `<data>/<OPENCODE_DB>`, and a named
 * agent's run is given `opencode-agent-<agent>.db` by the launcher; a run started without either keeps `opencode.db`.
 * An absolute `OPENCODE_DB` is used as it is. `servingAgent` is the run's stored word, never a path, and the pattern
 * keeps it from becoming one.
 */
export function theOpenCodeDatabase(env: Record<string, string | undefined>, servingAgent: string | null): string | null {
  const folder = theOpenCodeDataFolder(env)
  if (folder === null) return null
  const named = textOf(env['OPENCODE_DB'])
  if (named !== null) return isAbsolute(named) ? named : join(folder, named)
  return join(folder, servingAgent !== null && /^[A-Za-z0-9_-]+$/u.test(servingAgent) ? `opencode-agent-${servingAgent}.db` : 'opencode.db')
}

/** What one session's export read gave: its words, or the state and the sentence that says why it was not read. */
type AnOpenCodeExport =
  | { state: 'synced'; text: string; bytes: number }
  | { state: 'missing' | 'unreadable' | 'too-large'; says: string }

/** A JSON column of an OpenCode row, or null when the column is absent or not JSON. */
function theParsedColumn(row: Record<string, unknown>, name: string): unknown {
  const value = row[name]
  if (typeof value !== 'string' || value === '') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** The `info` object of an OpenCode export, from the session row its own export reads. */
function theOpenCodeSessionInfo(row: Record<string, unknown>): Record<string, unknown> {
  const number = (name: string): number => (typeof row[name] === 'number' ? (row[name] as number) : 0)
  const text = (name: string): string | null => (typeof row[name] === 'string' && (row[name] as string) !== '' ? (row[name] as string) : null)
  const time: Record<string, unknown> = { created: number('time_created'), updated: number('time_updated') }
  if (typeof row['time_compacting'] === 'number') time['compacting'] = row['time_compacting']
  if (typeof row['time_archived'] === 'number') time['archived'] = row['time_archived']
  const summary =
    row['summary_additions'] === null && row['summary_deletions'] === null && row['summary_files'] === null
      ? null
      : {
          additions: number('summary_additions'),
          deletions: number('summary_deletions'),
          files: number('summary_files'),
          ...(theParsedColumn(row, 'summary_diffs') === null ? {} : { diffs: theParsedColumn(row, 'summary_diffs') }),
        }
  const metadata = theParsedColumn(row, 'metadata')
  const revert = theParsedColumn(row, 'revert')
  const permission = theParsedColumn(row, 'permission')
  const model = theParsedColumn(row, 'model')
  return {
    id: text('id'),
    slug: text('slug'),
    projectID: text('project_id'),
    directory: text('directory'),
    ...(text('path') === null ? {} : { path: text('path') }),
    title: text('title'),
    version: text('version'),
    ...(text('share_url') === null ? {} : { share: { url: text('share_url') } }),
    ...(summary === null ? {} : { summary }),
    ...(metadata === null ? {} : { metadata }),
    cost: number('cost'),
    tokens: {
      input: number('tokens_input'),
      output: number('tokens_output'),
      reasoning: number('tokens_reasoning'),
      cache: { read: number('tokens_cache_read'), write: number('tokens_cache_write') },
    },
    ...(revert === null ? {} : { revert }),
    ...(permission === null ? {} : { permission }),
    ...(text('agent') === null ? {} : { agent: text('agent') }),
    ...(model === null ? {} : { model }),
    time,
  }
}

/**
 * ONE OPENCODE SESSION AS THE RUNTIME'S OWN EXPORT READS IT: the session row, then its messages and each message's
 * parts, in the order the runtime writes them. The database is opened read-only and never written; a store that is not
 * there, a session that is not in it, a row that is not JSON, or a session over the bound is said in its own state.
 * The returned text is the raw export, before this file's scrub. The bound is the sync's copy unless the caller
 * names its own: the conversation export reads a session whole, up to the bytes one export carries.
 */
export function theOpenCodeExport(database: string, session: string, limit: number = CONVERSATION_SYNC_MAX_BYTES): AnOpenCodeExport {
  let store: Database.Database
  try {
    store = new Database(database, { readonly: true, fileMustExist: true })
  } catch (why) {
    return existsSync(database)
      ? { state: 'unreadable', says: `The OpenCode database could not be opened: ${database} (${why instanceof Error ? why.message : String(why)}).` }
      : { state: 'missing', says: `The OpenCode database is not there: ${database}.` }
  }
  try {
    const row = store.prepare('select * from session where id = ?').get(session) as Record<string, unknown> | undefined
    if (row === undefined) return { state: 'missing', says: `No OpenCode session ${session} is in ${database}.` }
    const sizes = store
      .prepare(
        'select (select coalesce(sum(length(data)), 0) from message where session_id = ?) as messages, ' +
          '(select coalesce(sum(length(data)), 0) from part where session_id = ?) as parts',
      )
      .get(session, session) as { messages: number; parts: number }
    const rough = Number(sizes.messages) + Number(sizes.parts)
    if (rough > limit) {
      return {
        state: 'too-large',
        says: `OpenCode session ${session} holds at least ${String(rough)} bytes of messages and parts, over the ${String(limit)}-byte limit, so it was left out.`,
      }
    }
    const messages = store.prepare('select id, data from message where session_id = ? order by time_created, id').all(session) as {
      id: string
      data: string
    }[]
    const parts = store.prepare('select data from part where message_id = ? order by time_created, id')
    const exported = {
      info: theOpenCodeSessionInfo(row),
      messages: messages.map((message) => ({
        info: JSON.parse(message.data) as unknown,
        parts: (parts.all(message.id) as { data: string }[]).map((part) => JSON.parse(part.data) as unknown),
      })),
    }
    const text = `${JSON.stringify(exported, null, 2)}\n`
    const bytes = Buffer.byteLength(text, 'utf8')
    return bytes > limit
      ? {
          state: 'too-large',
          says: `The OpenCode export of ${session} is ${String(bytes)} bytes, over the ${String(limit)}-byte limit, so it was left out.`,
        }
      : { state: 'synced', text, bytes }
  } catch (why) {
    return {
      state: 'unreadable',
      says: `The OpenCode database could not be read: ${database} (${why instanceof Error ? why.message : String(why)}).`,
    }
  } finally {
    store.close()
  }
}

/** The words a scrub kept, and the counts the copy says it did. */
interface AScrubTally {
  pathsMapped: number
  secretsRemoved: number
  secretShapes: Set<string>
}

/** The keys whose values are the record's identity, not conversation words, so a scrub never rewrites them. */
const THE_IDENTITY_KEYS = new Set([
  'id',
  'sessionID',
  'messageID',
  'partID',
  'projectID',
  'providerID',
  'modelID',
  'callID',
  'toolCallID',
  'parentID',
  'workspaceID',
  'slug',
  'version',
  'agent',
  'role',
  'type',
])

function theScrubbedJsonValue(value: unknown, key: string | null, paths: readonly ConversationPath[], tally: AScrubTally): unknown {
  if (typeof value === 'string') {
    if (key !== null && THE_IDENTITY_KEYS.has(key)) return value
    const scrubbed = scrubConversation(value, paths)
    tally.pathsMapped += scrubbed.pathsMapped
    tally.secretsRemoved += scrubbed.secretsRemoved
    for (const shape of scrubbed.secretShapes) tally.secretShapes.add(shape)
    return scrubbed.text
  }
  if (Array.isArray(value)) return value.map((one) => theScrubbedJsonValue(one, key, paths, tally))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, one]) => [name, theScrubbedJsonValue(one, name, paths, tally)]))
  }
  return value
}

/**
 * ONE OPENCODE EXPORT SCRUBBED WITHOUT BREAKING ITS JSON. The transcript scrub replaces words wherever they appear,
 * which is right for a text transcript and wrong for a key such as `tokens`: the secret-shape scan would mark the key
 * and the import would receive malformed JSON. So the export is walked as JSON, each content string is scrubbed, and
 * the identity keys (the session and message ids, the model and agent, the version) are left exactly as they are.
 */
function theScrubbedOpenCodeExport(
  text: string,
  paths: readonly ConversationPath[],
): { text: string; pathsMapped: number; secretsRemoved: number; secretShapes: string[] } {
  const tally: AScrubTally = { pathsMapped: 0, secretsRemoved: 0, secretShapes: new Set() }
  const walked = theScrubbedJsonValue(JSON.parse(text) as unknown, null, paths, tally)
  return { text: `${JSON.stringify(walked, null, 2)}\n`, pathsMapped: tally.pathsMapped, secretsRemoved: tally.secretsRemoved, secretShapes: [...tally.secretShapes] }
}

/** Where one run's conversation is: a file, an OpenCode session in a database, or the sentence saying why neither. */
type AConversationPlace =
  | { kind: 'file'; file: string }
  | { kind: 'opencode'; database: string; session: string }
  | { kind: 'none'; says: string }

/** The place one run's runtime keeps its conversation, or the sentence saying why it is not read. */
function theConversationFile(
  runtime: string,
  providerSession: string,
  workingDirectory: string,
  env: Record<string, string | undefined>,
  servingAgent: string | null,
): AConversationPlace {
  if (runtime === 'claude-code') {
    const folder = theTranscriptFolder(env, workingDirectory)
    if (folder === null) return { kind: 'none', says: 'Neither CLAUDE_CONFIG_DIR nor HOME was set, so there was no Claude Code transcript folder to look in.' }
    return { kind: 'file', file: join(folder, `${providerSession}.jsonl`) }
  }
  if (runtime === 'codex') {
    const home = textOf(env['CODEX_HOME']) ?? (textOf(env['HOME']) === null ? null : join(textOf(env['HOME']) as string, '.codex'))
    if (home === null) return { kind: 'none', says: 'Neither CODEX_HOME nor HOME was set, so there was no Codex sessions folder to look in.' }
    const file = theCodexRolloutFor(providerSession, join(home, 'sessions'))
    return file === null
      ? { kind: 'none', says: `No rollout of Codex conversation ${providerSession} is in ${join(home, 'sessions')}.` }
      : { kind: 'file', file }
  }
  if (runtime === 'opencode') {
    const database = theOpenCodeDatabase(env, servingAgent)
    if (database === null) return { kind: 'none', says: 'Neither XDG_DATA_HOME nor HOME was set, so there was no OpenCode database folder to look in.' }
    return { kind: 'opencode', database, session: providerSession }
  }
  return { kind: 'none', says: `A ${runtime} conversation is not one this release reads.` }
}

/** Which of a run's three fields is missing or unfit, in the order the sync and the export ask. */
export type ConversationNotNamedWhy = 'no-runtime' | 'runtime-not-read' | 'no-conversation-id' | 'conversation-id-unfit' | 'no-working-directory'

/** What a run's record names of its conversation, or the first field that is missing or unfit and the sync's sentence for it. */
export type TheConversationARunNames =
  | { named: true; runtime: string; providerSession: string; workingDirectory: string }
  | { named: false; why: ConversationNotNamedWhy; says: string; runtime: string | null; providerSession: string | null }

/**
 * WHAT A RUN'S RECORD NAMES OF ITS CONVERSATION: the runtime, the conversation id and the working directory. The sync
 * and the conversation export both ask here, so a run one of them reads is a run the other reads, and they refuse the
 * rest for the same reason in the same order. The sentences are the ones the sync writes on the run's copy.
 */
export function theConversationARunNames(
  runtime: string | null,
  providerSession: string | null,
  workingDirectory: string | null,
): TheConversationARunNames {
  const notNamed = (why: ConversationNotNamedWhy, says: string): TheConversationARunNames => ({ named: false, why, says, runtime, providerSession })
  if (runtime === null) return notNamed('no-runtime', 'No runtime was recorded for this run, so its conversation cannot be found and nothing was guessed.')
  if (!theRuntimeHasAConversationFile(runtime)) return notNamed('runtime-not-read', `A ${runtime} conversation is not one this release reads.`)
  if (providerSession === null) return notNamed('no-conversation-id', 'No conversation id was recorded for this run, so there is no file to read.')
  if (!aProviderIdForAFileStem(providerSession)) {
    return notNamed(
      'conversation-id-unfit',
      `The conversation id "${providerSession}" cannot be used as a file name: only letters, digits, underscore and hyphen are used, so no file was read.`,
    )
  }
  if (workingDirectory === null) return notNamed('no-working-directory', 'No working directory was recorded for this run, so its conversation cannot be found.')
  return { named: true, runtime, providerSession, workingDirectory }
}

/** What one run's conversation read whole gave: its scrubbed words and the scrub's counts, or why it was not read. */
export type AWholeConversation =
  | { read: true; text: string; shape: 'lines' | 'whole'; pathsMapped: number; secretsRemoved: number; secretShapes: string[] }
  | { read: false; why: 'not-there' | 'unreadable' | 'over-the-line'; says: string }

/**
 * ONE RUN'S CONVERSATION READ WHOLE, for the conversation export. It is found where the sync finds it and scrubbed as
 * the sync scrubs it: a Claude Code or Codex transcript as lines of text, an OpenCode session through its own export
 * walked as JSON. The only difference is the bound: the sync copies at most its own bytes, and this reads up to the
 * bytes the caller names. Nothing is written. The sentence of a conversation not read has its paths scrubbed.
 */
export function theWholeConversationOf(
  named: { runtime: string; providerSession: string; workingDirectory: string },
  servingAgent: string | null,
  paths: readonly ConversationPath[],
  limit: number,
  env: Record<string, string | undefined> = process.env,
): AWholeConversation {
  const located = theConversationFile(named.runtime, named.providerSession, named.workingDirectory, env, servingAgent)
  if (located.kind === 'none') return { read: false, why: 'not-there', says: scrubConversationPath(located.says, paths) }
  if (located.kind === 'opencode') {
    const read = theOpenCodeExport(located.database, located.session, limit)
    if (read.state !== 'synced') {
      const why = read.state === 'missing' ? 'not-there' : read.state === 'too-large' ? 'over-the-line' : 'unreadable'
      return { read: false, why, says: scrubConversationPath(read.says, paths) }
    }
    return { read: true, shape: 'whole', ...theScrubbedOpenCodeExport(read.text, paths) }
  }
  let size: number
  try {
    size = statSync(located.file).size
  } catch {
    return { read: false, why: 'not-there', says: `The conversation file is not there: ${scrubConversationPath(located.file, paths)}.` }
  }
  if (size > limit) {
    return { read: false, why: 'over-the-line', says: `The conversation file is ${String(size)} bytes, over the ${String(limit)}-byte limit.` }
  }
  let text: string
  try {
    text = readFileSync(located.file, 'utf8')
  } catch {
    return { read: false, why: 'unreadable', says: `The conversation file could not be read: ${scrubConversationPath(located.file, paths)}.` }
  }
  const scrubbed = scrubConversation(text, paths)
  return { read: true, shape: 'lines', ...scrubbed }
}

/**
 * THE PATH MAP ONE RUN'S EXPORT IS SCRUBBED WITH: the map the sync keeps for this workspace, with this run's checkout
 * and the latest runs' checkouts added where the map does not hold them yet, as the sync adds them. Nothing is written.
 */
export function thePathMapForOneRun(
  workspaceId: string,
  run: { id: string; title: string; data: Record<string, unknown> },
  env: Record<string, string | undefined> = process.env,
): ConversationPath[] {
  return pathsForTheRuns(env, [run, ...theLatestRuns(workspaceId)], readTheSyncSetting(workspaceId)?.paths ?? [])
}

/** A copy that did not sync, with the sentence that says why. */
function aCopyThatDidNotSync(
  runtime: string | null,
  providerSession: string | null,
  state: ConversationSyncState,
  says: string,
  previous: ConversationCopy | null,
): ConversationCopy {
  return {
    state,
    runtime: runtime ?? 'runtime not recorded',
    providerSession: providerSession ?? '',
    source: previous?.source ?? '',
    sha256: previous?.sha256 ?? '',
    bytes: previous?.bytes ?? 0,
    capturedAt: previous?.capturedAt ?? nowStamp(),
    lastChangedAt: nowStamp(),
    secretsRemoved: previous?.secretsRemoved ?? 0,
    secretShapes: previous?.secretShapes ?? [],
    pathsMapped: previous?.pathsMapped ?? 0,
    says,
    ...(previous?.text === undefined ? {} : { text: previous.text }),
  }
}

/**
 * RUN THE SYNC FOR ONE WORKSPACE. The caller has already checked that the person may turn it on or off. Nothing is
 * read from or written to any other project.
 */
export function runTheConversationSync(
  workspaceId: string,
  actor: Actor,
  env: Record<string, string | undefined> = process.env,
): { setting: ConversationSyncSetting; outcome: ConversationSyncOutcome; lines: ConversationLine[] } {
  const setting = readTheSyncSetting(workspaceId)
  if (setting === null || !setting.enabled) {
    throw new PanelError(
      'No conversation is synced before the person turns the sync on for this workspace. Nothing was read and nothing was written.',
      409,
    )
  }
  const runs = theLatestRuns(workspaceId)
  const paths = pathsForTheRuns(env, runs, setting.paths)
  const counts: Record<ConversationSyncState, number> = {
    synced: 0, missing: 0, unreadable: 0, 'too-large': 0, deleted: 0, 'not-synced': 0,
  }
  let overCount = 0
  let filesRead = 0
  for (const run of runs) {
    const stored = bagOf(run.data[CONVERSATION_SYNC_FIELD])
    const previous = stored as unknown as ConversationCopy | null
    const servingAgent = textOf(run.data['servingAgent'])
    const named = theConversationARunNames(textOf(run.data['runtime']), textOf(run.data['providerSession']), textOf(run.data['workingDirectory']))
    if (!named.named) {
      const copy = aCopyThatDidNotSync(named.runtime, named.providerSession, 'not-synced', named.says, previous)
      counts['not-synced'] += 1
      writeTheCopy(run.id, copy, previous, actor)
      continue
    }
    const { runtime, providerSession, workingDirectory } = named
    const mark = theRuntimeMark(runtime)
    if (filesRead >= CONVERSATION_SYNC_MAX_FILES) {
      overCount += 1
      counts['not-synced'] += 1
      continue
    }
    const located = theConversationFile(runtime, providerSession, workingDirectory, env, servingAgent)
    if (located.kind === 'none') {
      const copy = aCopyThatDidNotSync(runtime, providerSession, previous?.text === undefined ? 'missing' : 'deleted', located.says, previous)
      counts[copy.state] += 1
      writeTheCopy(run.id, copy, previous, actor)
      continue
    }
    if (located.kind === 'opencode') {
      const read = theOpenCodeExport(located.database, located.session)
      if (read.state !== 'synced') {
        const state: ConversationSyncState =
          read.state === 'missing' ? (previous?.text === undefined ? 'missing' : 'deleted') : read.state
        const copy = aCopyThatDidNotSync(runtime, providerSession, state, scrubConversationPath(read.says, paths), previous)
        counts[state] += 1
        writeTheCopy(run.id, copy, previous, actor)
        continue
      }
      filesRead += 1
      const scrubbed = theScrubbedOpenCodeExport(read.text, paths)
      const sha256 = createHash('sha256').update(read.text).digest('hex')
      const at = nowStamp()
      const copy: ConversationCopy = {
        state: 'synced',
        runtime,
        providerSession,
        source: `opencode export ${providerSession}`,
        sha256,
        bytes: read.bytes,
        capturedAt: at,
        lastChangedAt: at,
        secretsRemoved: scrubbed.secretsRemoved,
        secretShapes: scrubbed.secretShapes,
        pathsMapped: scrubbed.pathsMapped,
        says: `Read OpenCode session ${providerSession} from ${scrubConversationPath(located.database, paths)}: ${String(read.bytes)} bytes, ${String(scrubbed.secretsRemoved)} secret-shaped ${scrubbed.secretsRemoved === 1 ? 'piece' : 'pieces'} replaced and ${String(scrubbed.pathsMapped)} path ${scrubbed.pathsMapped === 1 ? 'occurrence' : 'occurrences'} mapped.`,
        text: scrubbed.text,
      }
      counts.synced += 1
      writeTheCopy(run.id, copy, previous, actor)
      continue
    }
    let size: number
    try {
      size = statSync(located.file).size
    } catch {
      const copy = aCopyThatDidNotSync(
        runtime,
        providerSession,
        previous?.text === undefined ? 'missing' : 'deleted',
        previous?.text === undefined
          ? `The conversation file is not there: ${scrubConversationPath(located.file, paths)}.`
          : `The file this copy came from is gone: ${scrubConversationPath(located.file, paths)}. The copy from the last read stands.`,
        previous,
      )
      counts[copy.state] += 1
      writeTheCopy(run.id, copy, previous, actor)
      continue
    }
    if (size > CONVERSATION_SYNC_MAX_BYTES) {
      const copy = aCopyThatDidNotSync(
        runtime,
        providerSession,
        'too-large',
        `The conversation file is ${String(size)} bytes, over the ${String(CONVERSATION_SYNC_MAX_BYTES)}-byte limit, so it was left out.${previous?.text === undefined ? '' : ' The copy from the last read stands.'}`,
        previous,
      )
      counts['too-large'] += 1
      writeTheCopy(run.id, copy, previous, actor)
      continue
    }
    let text: string
    try {
      text = readFileSync(located.file, 'utf8')
    } catch {
      const copy = aCopyThatDidNotSync(runtime, providerSession, 'unreadable', `The conversation file could not be read: ${scrubConversationPath(located.file, paths)}.`, previous)
      counts['unreadable'] += 1
      writeTheCopy(run.id, copy, previous, actor)
      continue
    }
    filesRead += 1
    const scrubbed = scrubConversation(text, paths)
    const sha256 = createHash('sha256').update(text).digest('hex')
    const at = nowStamp()
    const copy: ConversationCopy = {
      state: 'synced',
      runtime,
      providerSession,
      source: scrubConversationPath(located.file, paths),
      sha256,
      bytes: Buffer.byteLength(text, 'utf8'),
      capturedAt: at,
      lastChangedAt: at,
      secretsRemoved: scrubbed.secretsRemoved,
      secretShapes: scrubbed.secretShapes,
      pathsMapped: scrubbed.pathsMapped,
      says: `Read ${scrubConversationPath(located.file, paths)}: ${String(Buffer.byteLength(text, 'utf8'))} bytes, ${String(scrubbed.secretsRemoved)} secret-shaped ${scrubbed.secretsRemoved === 1 ? 'piece' : 'pieces'} replaced and ${String(scrubbed.pathsMapped)} path ${scrubbed.pathsMapped === 1 ? 'occurrence' : 'occurrences'} mapped.`,
      text: scrubbed.text,
    }
    counts.synced += 1
    writeTheCopy(run.id, copy, previous, actor)
  }
  const outcome: ConversationSyncOutcome = {
    at: nowStamp(),
    synced: counts.synced,
    missing: counts.missing,
    unreadable: counts.unreadable,
    tooLarge: counts['too-large'],
    deleted: counts.deleted,
    overCount,
    notSynced: counts['not-synced'],
    says:
      `${String(counts.synced)} ${counts.synced === 1 ? 'conversation was' : 'conversations were'} copied.` +
      (counts.missing > 0 ? ` ${String(counts.missing)} file ${counts.missing === 1 ? 'was' : 'were'} missing.` : '') +
      (counts.unreadable > 0 ? ` ${String(counts.unreadable)} file ${counts.unreadable === 1 ? 'was' : 'were'} unreadable.` : '') +
      (counts['too-large'] > 0 ? ` ${String(counts['too-large'])} file ${counts['too-large'] === 1 ? 'was' : 'were'} over the size limit and left out.` : '') +
      (counts.deleted > 0 ? ` ${String(counts.deleted)} file ${counts.deleted === 1 ? 'is' : 'are'} gone since the last read; the copies stand.` : '') +
      (overCount > 0 ? ` ${String(overCount)} ${overCount === 1 ? 'conversation was' : 'conversations were'} over the ${String(CONVERSATION_SYNC_MAX_FILES)}-file limit and left out.` : '') +
      (counts['not-synced'] > 0 ? ` ${String(counts['not-synced'])} ${counts['not-synced'] === 1 ? 'run has' : 'runs have'} no conversation this release reads.` : ''),
  }
  writeTheConversationSync(workspaceId, { ...setting, paths, lastRunAt: outcome.at, lastOutcome: outcome })
  // THE LINES ARE BUILT FROM THE ROWS AS THEY ARE AFTER THE LOOP: a run's copy is on the record the loop has just
  // patched, so reading the rows from before it would return no line for a first sync and the previous hash after one.
  return { setting: { ...setting, paths, lastRunAt: outcome.at, lastOutcome: outcome }, outcome, lines: theLines(workspaceId, theLatestRuns(workspaceId), paths) }
}

/** Patch one session record's copy when it changed. A run with no change is not written again. */
function writeTheCopy(runId: string, copy: ConversationCopy, previous: ConversationCopy | null, actor: Actor): void {
  if (
    previous !== null &&
    previous.state === copy.state &&
    previous.sha256 === copy.sha256 &&
    previous.text === copy.text &&
    previous.secretsRemoved === copy.secretsRemoved &&
    previous.pathsMapped === copy.pathsMapped
  ) return
  patchRecord(runId, { dataPatch: { [CONVERSATION_SYNC_FIELD]: copy } }, actor)
}

/** The lines a read returns, from the bounded run rows and the copies on them. */
function theLines(workspaceId: string, runs: readonly ARunRow[], paths: readonly ConversationPath[]): ConversationLine[] {
  const lines: ConversationLine[] = []
  for (const run of runs) {
    const copy = bagOf(run.data[CONVERSATION_SYNC_FIELD])
    if (copy === null) continue
    const storedRuntime = textOf(copy['runtime'])
    lines.push({
      runId: run.id,
      title: run.title,
      runtime: theRuntimeMark(storedRuntime === 'runtime not recorded' ? null : storedRuntime),
      providerSession: textOf(copy['providerSession']),
      state: (textOf(copy['state']) ?? 'not-synced') as ConversationSyncState,
      bytes: typeof copy['bytes'] === 'number' ? copy['bytes'] : 0,
      sha256: textOf(copy['sha256']),
      capturedAt: textOf(copy['capturedAt']),
      lastChangedAt: textOf(copy['lastChangedAt']),
      says: textOf(copy['says']) ?? 'Nothing was recorded about this copy.',
    })
  }
  return lines
}

/** THE SYNC'S OWN READ: the opt-in, the path map, and a page of the copies, with no transcript in it. */
export function readTheConversationSync(workspaceId: string, limit: number = CONVERSATION_SYNC_PAGE): ConversationSyncReply {
  const asked = Math.min(Math.max(1, Number.isFinite(limit) ? Math.trunc(limit) : CONVERSATION_SYNC_PAGE), CONVERSATION_SYNC_PAGE_MAX)
  const setting = readTheSyncSetting(workspaceId)
  if (setting === null) {
    return {
      workspaceId,
      enabled: false,
      paths: [],
      conversations: [],
      total: 0,
      left: 0,
      reading: 0,
      lastRunAt: null,
      lastOutcome: null,
      says: 'The person has not turned the conversation sync on for this workspace, so no conversation has been read.',
    }
  }
  const runs = theLatestRuns(workspaceId)
  const all = theLines(workspaceId, runs, setting.paths)
  const conversations = all.slice(0, asked)
  return {
    workspaceId,
    enabled: setting.enabled,
    paths: setting.paths,
    conversations,
    total: all.length,
    left: all.length - conversations.length,
    reading: runs.length,
    lastRunAt: setting.lastRunAt,
    lastOutcome: setting.lastOutcome,
    says: setting.enabled
      ? all.length === 0
        ? 'The sync is on for this workspace. No conversation has been copied yet.'
        : `${String(all.length)} ${all.length === 1 ? 'conversation is' : 'conversations are'} copied for this workspace.`
      : 'The person turned the conversation sync off for this workspace. The copies already made stand.',
  }
}

/** ONE CONVERSATION'S SCRUBBED WORDS, as the office stored them. */
export function readOneConversation(workspaceId: string, runId: string): { runId: string; title: string; copy: ConversationCopy } {
  // A RUN IN ANOTHER PROJECT is refused by `recordInWorkspace`, which names the project it is in.
  const record = recordInWorkspace(runId, workspaceId)
  if (record.deletedAt !== null) {
    throw new PanelError(`No run ${runId} is in this project. Nothing was read.`, 404)
  }
  const copy = bagOf((record.data as Record<string, unknown>)[CONVERSATION_SYNC_FIELD])
  if (copy === null) {
    throw new PanelError(`Run ${runId} has no conversation copy. The sync has not copied it, or it has no conversation this release reads.`, 404)
  }
  return { runId, title: record.title, copy: copy as unknown as ConversationCopy }
}

/**
 * PUT ONE COPY BACK ON THIS MACHINE AND SAY THE COMMAND THAT RESUMES IT.
 *
 * The transcript is written where the runtime looks for it under the mapped checkout path, with the path tokens
 * replaced by the mapped paths. A token with no mapping is refused by its own name before anything is written, so a
 * missing map entry is a known gap rather than a conversation that starts from zero.
 */
export function restoreOneConversation(
  workspaceId: string,
  runId: string,
  actor: Actor,
  to: string | null,
  env: Record<string, string | undefined> = process.env,
): { way: string; runtime: string; command: string | null; folder: string | null; installedAt: string; says: string } {
  const { copy } = readOneConversation(workspaceId, runId)
  if (copy.text === undefined || copy.text === '') {
    throw new PanelError(`Run ${runId} has no conversation words to restore. Nothing was written.`, 409)
  }
  if (!theRuntimeHasAConversationFile(copy.runtime)) {
    throw new PanelError(`A ${copy.runtime} conversation has no command this office can resume, so nothing was installed.`, 409)
  }
  // THE STORED ID IS A RECORD FIELD, not a fact this office made: a dot or a separator in it would move the installed
  // path out of the runtime's folder. It is refused by its value before the path is built, so nothing is written.
  if (!aProviderIdForAFileStem(copy.providerSession)) {
    throw new PanelError(
      `The conversation id "${copy.providerSession}" cannot be used as a file name: only letters, digits, underscore ` +
        "and hyphen are used, so nothing was written outside the runtime's folder.",
      409,
    )
  }
  const setting = readTheSyncSetting(workspaceId)
  if (setting === null) {
    throw new PanelError('The conversation sync has no setting for this workspace, so its path map is not known. Nothing was written.', 409)
  }
  const checkoutToken = /<checkout:\d+>/u.exec(copy.text)?.[0] ?? null
  const overrides: Record<string, string> = {}
  const home = textOf(env['HOME'])
  if (home !== null) overrides['<home>'] = home
  if (to !== null && checkoutToken !== null) {
    const target = setting.paths.find((one) => one.token === checkoutToken)
    if (target !== undefined && to.trim() !== '') overrides[checkoutToken] = to.trim()
  }
  const restored = restoreConversation(copy.text, setting.paths, overrides)
  if (restored.missing !== null) {
    throw new PanelError(
      `The path map has no entry for ${restored.missing}, so the conversation was not installed. Add that entry to the ` +
        'sync setting (the token, the path it stood for and the path it is to stand for) and restore it again. ' +
        'Nothing was written.',
      409,
    )
  }
  const folder = to !== null && to.trim() !== '' ? to.trim() : (checkoutToken === null ? null : (setting.paths.find((one) => one.token === checkoutToken)?.mapped ?? null))
  if (folder === null) {
    throw new PanelError(
      'No checkout path is mapped for this copy, so there is nowhere to install it. Set the path map entry or name ' +
        'the checkout in the restore. Nothing was written.',
      409,
    )
  }
  if (copy.runtime === 'opencode') {
    const dataFolder = theOpenCodeDataFolder(env)
    if (dataFolder === null) {
      throw new PanelError('Neither XDG_DATA_HOME nor HOME is set, so there is no OpenCode folder to write the import file to. Nothing was written.', 409)
    }
    const installedAt = join(dataFolder, 'mole-office-restore', `${copy.providerSession}.json`)
    mkdirSync(dirname(installedAt), { recursive: true })
    writeFileSync(installedAt, restored.text, 'utf8')
    const command = `cd ${shellQuote(folder)} && opencode import ${shellQuote(installedAt)} && opencode --session ${shellQuote(copy.providerSession)}`
    return {
      way: 'host',
      runtime: copy.runtime,
      command,
      folder,
      installedAt,
      says:
        `Wrote the OpenCode export at ${installedAt} for ${folder}. The command imports it and then resumes the session: ${command}`,
    }
  }
  let installedAt: string
  if (copy.runtime === 'claude-code') {
    const transcriptFolder = theTranscriptFolder(env, folder)
    if (transcriptFolder === null) {
      throw new PanelError('Neither CLAUDE_CONFIG_DIR nor HOME is set, so there is no Claude Code transcript folder to write to. Nothing was written.', 409)
    }
    installedAt = join(transcriptFolder, `${copy.providerSession}.jsonl`)
  } else {
    const codexHome = textOf(env['CODEX_HOME']) ?? (textOf(env['HOME']) === null ? null : join(textOf(env['HOME']) as string, '.codex'))
    if (codexHome === null) {
      throw new PanelError('Neither CODEX_HOME nor HOME is set, so there is no Codex sessions folder to write to. Nothing was written.', 409)
    }
    const at = copy.capturedAt.replace(/[^0-9]/g, '').slice(0, 14)
    installedAt = join(codexHome, 'sessions', at.slice(0, 4), at.slice(4, 6), at.slice(6, 8), `rollout-${at}-${copy.providerSession}.jsonl`)
  }
  mkdirSync(dirname(installedAt), { recursive: true })
  writeFileSync(installedAt, restored.text, 'utf8')
  const record = getRecord(runId)
  const way = record === null ? null : theWayBackOf({ id: runId, data: { ...(record.data as Record<string, unknown>), workingDirectory: folder } })
  const command = way !== null && 'command' in way ? way.command : null
  return {
    way: way === null ? 'none' : way.way,
    runtime: copy.runtime,
    command,
    folder,
    installedAt,
    says:
      `Installed the conversation at ${installedAt} under ${folder}. ` +
      (command === null ? 'No resume command could be built for it; the run record says why.' : `The command that resumes it is: ${command}`),
  }
}

/** Set the opt-in and the path map. The caller has already established that the person is doing this. */
export function setTheConversationSync(
  workspaceId: string,
  input: { enabled: boolean; paths?: readonly ConversationPath[] },
  env: Record<string, string | undefined> = process.env,
): ConversationSyncReply {
  const before = readTheSyncSetting(workspaceId)
  const runs = theLatestRuns(workspaceId)
  const paths = input.paths === undefined ? pathsForTheRuns(env, runs, before?.paths ?? []) : [...input.paths]
  const setting: ConversationSyncSetting = {
    enabled: input.enabled,
    paths,
    lastRunAt: before?.lastRunAt ?? null,
    lastOutcome: before?.lastOutcome ?? null,
  }
  writeTheConversationSync(workspaceId, setting)
  return readTheConversationSync(workspaceId)
}
