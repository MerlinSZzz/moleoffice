// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0301 MAKES ONE INDEX, SO THE STABLE UPGRADE NOTICES ARE FOUND WITHOUT READING THE FIRST REVISION OF EVERY
 * MESSAGE.
 *
 * Wave 13q item 1k. Each of the six reads of src/server/lib/stable-upgrade-notices.ts that look for a notice read the
 * first revision of every message. `hasOriginalUpgradeNoticeForOwner` took about 160 ms on the person's messages page,
 * through 64,085 message creates. Migration 0301 makes one index of the revisions, partial to the first revision of an
 * upgrade notice and in `at` and record order, and each read now names that index's WHERE in the words
 * src/server/db/schema.ts holds. The answers stay as they were.
 *
 * A MADE-UP OFFICE AT THE COUNT ITEM 1K GIVES, built here in a fresh test database. It holds 64,085 first revisions of
 * messages. Nearly all are planted straight into the revisions table, each titled and worded as made-up, and one in eight
 * is a Mole Office line of another kind to the owner. The notices among them are filed through the notice door itself, by
 * made-up agents, about made-up releases of a made-up repository. Nothing else is made at the office's scale: Mole Office
 * never runs ANALYZE, so SQLite's plans do not depend on how many rows a table holds.
 *
 *   B. each of the six reads holds those words, and SQLite's plan for it reads the revisions through the index;
 *   C. what each read and each door built on it answers equals what the notices filed here say it must, compared by
 *      hash: the lookups and replays by send id, the history page by page, the owner's contact, and the earlier
 *      emergencies and the newest completed release that the emergency judgment reads;
 *   D. the words are the writers' own: they keep each notice the door filed and no other line of Mole Office, and every
 *      revision that holds an upgrade event has the first revision of its record in the index;
 *   E. the way back passes the migration: `theWayBackCheck` in tools/stable/the-way-back.mjs finds that it only adds.
 *
 * Cases B, D and E fail before the migration and the changed reads. Case C holds before and after. Case C compares
 * the earlier emergencies as a set, because that read had no order before.
 *
 * MUTATIONS (item 1k), each after a control run, each put back from the commit:
 *   1. In `theNewestCompletedOrder`, take out the index's name. Case B goes red for that read: SQLite starts from the
 *      changes in their order and finds each revision by its record.
 *   2. In `hasOriginalUpgradeNoticeForOwner`, ask in the words it used before, with the notice term last. SQLite still
 *      reads the index, and case B goes red for that read, because its words are no longer the shared ones.
 *   4. In the history read, order by `c.append_order ASC`. Case C goes red for the history pages.
 *   5. In the migration, make the index UNIQUE. Case E goes red: a new unique index on a table the previous version
 *      writes does more than add.
 * Case D has no mutation of its own. The control run before the code shows it red.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { STABLE_UPGRADE_NOTICE_EVENT, STABLE_UPGRADE_PUBLIC_REASONS } from '../src/shared/stable-upgrade-notices.ts'
import { localStamp } from '../src/shared/typed-time.mjs'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import type { Actor } from '../src/server/lib/records.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

type ObjectValue = Record<string, any>
type Pin = { id: string; seq: 1; contentHash: string }
type Throw = { change: string; appendOrder: number }

/** The index, under the name schema.ts and the migration give it. */
const INDEX = 'revisions_first_upgrade_notice_idx'
/** The first revisions of messages in the person's office, as item 1k counts them, which this office is made up to. */
const MESSAGE_CREATES = 64_085
const PROJECT = 'default'
const ELSEWHERE = 'made-up-elsewhere'
const SETTING = 'MOLE_OFFICE_STABLE_EMERGENCY'

/**
 * THE SIX READS, each known by words only it holds among the reads the module prepares; a read another module prepares
 * is known by none. The source of the module is counted against this list in case B, so a seventh read of the revisions
 * cannot be added without being checked here.
 */
const READS = {
  'the originals of a send id or an ending': { alias: undefined, is: /AS request_kind\b/ },
  'a data-folder move notice with this send id': { alias: undefined, is: /^SELECT 1 FROM revisions\b/ },
  'the earlier emergencies': { alias: undefined, is: /stableUpgradeNotice\.version'\) = 4\b/ },
  'the newest completed release': { alias: 'r', is: /\bc\.append_order AS at\b/ },
  'the history': { alias: 'r', is: /^SELECT r\.record_id AS id FROM revisions r\b/ },
  "the owner's contact": { alias: undefined, is: /\$\.to\[0\]\.kind/ },
} as const
type ARead = keyof typeof READS

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/stable-upgrade-notices.ts')
let schema: typeof import('../src/server/db/schema.ts')
let wayBack: typeof import('../tools/stable/the-way-back.mjs')
let migrations: string
let repository: string
let folder: string
let git: string
let number = 0
const commits: Record<'R' | 'A' | 'B' | 'C', string> = { R: '', A: '', B: '', C: '' }
const ids = new Map<string, string>()
const keys = new Map<string, string>()
const runs = new Map<string, string>()
const personKey = randomBytes(32).toString('hex')
const owner = THE_TEST_OFFICES_OWNER.id
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const ownerHeaders = { 'x-mole-office-workspace': PROJECT, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': owner, 'x-mole-office-key': personKey }

/** One notice the door filed here: what was asked, the identity it was asked with, and what the door answered. */
type Filed = { request: ObjectValue; identity: () => ObjectValue; result: ObjectValue }
const filed: Filed[] = []

/** One read of the revisions while a question was asked: its statement, its values and what SQLite handed back. */
type Kept = { read: ARead | null; statement: string; values: unknown[]; rows: unknown }
let keeping: Kept[] | null = null
/** Every read of the revisions any question made, in the order they were made. */
const everyRead: Kept[] = []

/** What each question was answered, and what the notices filed here say it must be. */
const asked: Record<string, unknown> = {}
const expected: Record<string, unknown> = {}

function actor(who = 'controller'): Actor {
  return { type: 'agent', id: ids.get(who)!, keyHolder: ids.get(who)!, provedBy: 'an-agent-key', sessionId: runs.get(who)! }
}
async function ask(method: 'GET' | 'POST', url: string, payload: unknown, as: Record<string, string>) {
  return app.inject({ method, url, headers: as, ...(payload === undefined ? {} : { payload: payload as object }) })
}
function reference(id: string, seq = 1): Pin {
  const row = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').get(id, seq) as { content_hash: string }
  return { id, seq: seq as 1, contentHash: row.content_hash }
}
function inTheRepository(...args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  return execFileSync('git', ['-C', git, '-c', 'user.name=Made-up writer', '-c', 'user.email=made-up@example.invalid', ...args],
    { env: { ...env, HOME: folder, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', timeout: 30_000 }).trim()
}
const treeOf = (sha: string) => inTheRepository('rev-parse', `${sha}^{tree}`)

/** The library call, kept with what it answered, so each notice can be asked about again. */
function file(request: ObjectValue, identity: () => ObjectValue): ObjectValue {
  const result = lib.fileStableUpgradeNotice(PROJECT, request as never, actor(), identity as never) as ObjectValue
  filed.push({ request, identity, result })
  return result
}

/** An ordinary BEFORE, with an approved notice and an original green receipt, from a made-up serving process. */
function anUpgradeBefore(): ObjectValue {
  const n = ++number
  const notice = `A made-up upgrade notice ${n}.`
  const note = t.api.createRecord({ kind: 'note', title: `A made-up approval ${n}`, workspaceId: PROJECT, data: { body: notice }, actor: actor('secretary') })
  const toCommit = createHash('sha1').update(`made-up target ${n}`).digest('hex')
  const evidence = t.api.createRecord({ kind: 'whole_suite_receipt', title: `A made-up receipt ${n}`, workspaceId: PROJECT,
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, commit: toCommit }, actor: actor() })
  const announcement = { candidateTag: `stable-2026-10-25-made-up-${n}`, baselineTag: `made-up-baseline-${n}`, fromCommit: 'a'.repeat(40), toCommit,
    tree: WHOLE_SUITE_RECEIPT_EXAMPLE.tree, notice, evidence: reference(evidence.id), noticeApproval: reference(note.id) }
  return file({ stage: 'before', sendId: `made-up-before-${n}`, announcement },
    () => ({ commit: announcement.fromCommit, repository, database: t.file, port: 12345 }))
}
function anUpgradeAfter(before: ObjectValue, state: 'refused' | 'failed-restored', reason: string): ObjectValue {
  return file({ stage: 'after', sendId: `made-up-after-${++number}`, before: before.original, outcome: { state, reason } },
    () => ({ commit: 'a'.repeat(40), repository, database: t.file, port: 12345 }))
}

/** The owner throws the emergency switch on the settings door, as the Gates page does, and the throw is read back. */
async function throwTheSwitch(minutes: number): Promise<Throw> {
  const until = localStamp(new Date(Date.now() + minutes * 60_000)).slice(0, 16)
  const saved = await ask('POST', '/api/office/settings', { changes: [{ name: SETTING, value: '1', until }], because: `A made-up emergency throw ${++number}.` }, ownerHeaders)
  expect(saved.statusCode, saved.body).toBe(200)
  const gates = await ask('GET', '/api/office/gates', undefined, ownerHeaders)
  expect(gates.statusCode, gates.body).toBe(200)
  const rows = (gates.json() as { classes: { groups: { rows: ObjectValue[] }[] }[] }).classes.flatMap(one => one.groups.flatMap(group => group.rows))
  const row = rows.find(one => one.id === 'stable-emergency')
  return { change: row?.lastChange?.id, appendOrder: row?.lastChange?.appendOrder }
}
/** A secretary tells the owner, in chat, which commit goes in. */
function tellTheOwner(sha: string): Pin {
  return reference(t.api.createRecord({ workspaceId: PROJECT, kind: 'message', title: 'A made-up emergency message',
    data: { body: `The office is broken. Made-up fix ${sha} goes in now.`, to: [{ kind: 'person', id: owner }] }, actor: actor('secretary') }).id)
}
const serving = (sha: string, port = 12346) => () => ({ commit: sha, repository, database: t.file, port })
/** An emergency BEFORE, with the secretary's note that authorizes it, pinning the throw and the message. */
function anEmergencyBefore(pins: { throw: Throw; message: Pin }, toCommit: string): ObjectValue {
  const n = ++number
  const notice = `A made-up emergency notice ${n}.`
  const release = { candidateTag: `stable-2026-10-25-made-up-emergency-${n}`, baselineTag: `made-up-baseline-${n}`, fromCommit: 'a'.repeat(40), toCommit, tree: treeOf(toCommit) }
  const authorization = { version: 1, mode: 'emergency', reason: 'A made-up emergency release.', timeZone: zone, ...release, message: pins.message,
    serving: { commit: release.fromCommit, repository, database: t.file, port: 12345 },
    validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
    baselineSource: { kind: 'bootstrap', note: { id: 'made-up-baseline-note', seq: 1, contentHash: '0'.repeat(16) } } }
  const note = t.api.createRecord({ kind: 'note', title: `A made-up emergency approval ${n}`, workspaceId: PROJECT,
    data: { body: notice, extra: { stableReleaseAuthorization: authorization } }, actor: actor('secretary') })
  const announcement = { ...release, notice, noticeApproval: reference(note.id), emergency: pins }
  return file({ kind: 'emergency', stage: 'before', sendId: `made-up-emergency-before-${n}`, announcement }, serving(release.fromCommit, 12345))
}
function anEmergencyAfter(before: ObjectValue, toCommit: string): ObjectValue {
  return file({ kind: 'emergency', stage: 'after', sendId: `made-up-emergency-after-${++number}`, before: before.original,
    outcome: { state: 'completed', verification: { result: 'completed', serving: serving(toCommit)() } } }, serving(toCommit))
}

/** Keys sorted at every depth, so a hash compares values and not the order their keys were written in. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as ObjectValue)[key])]))
  return value
}
/** Text in SQLite's own order, byte by byte, as `ORDER BY` without a collation sorts it. */
const bytewise = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const hashOf = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value) ?? null)).digest('hex')

/** Ask one question, keeping every read of the revisions it made, and answer what it answered and those reads. */
function question<T>(answer: () => T): { answer: T; reads: Kept[] } {
  const kept: Kept[] = []
  keeping = kept
  try {
    return { answer: answer(), reads: kept }
  } finally {
    keeping = null
  }
}
/** The rows each named read handed back, in the order the reads were made. */
const rowsOf = (reads: Kept[], read: ARead) => reads.filter(one => one.read === read).map(one => one.rows)

/** The words of the index's WHERE, read by name from schema.ts, so this file compiles before they are there. */
function theWords(alias?: string): string {
  const words = (schema as unknown as Record<string, unknown>)['theFirstRevisionOfAnUpgradeNotice']
  if (typeof words !== 'function') throw new Error('src/server/db/schema.ts has no theFirstRevisionOfAnUpgradeNotice, so the index and its reads share no words.')
  return (words as (alias?: string) => string)(alias)
}

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'notices-by-index-'))
  git = join(folder, 'repository')
  mkdirSync(git)
  inTheRepository('init', '-q', '-b', 'main')
  const step = (name: keyof typeof commits) => {
    writeFileSync(join(git, 'step.txt'), `Made-up step ${name}.\n`)
    inTheRepository('add', 'step.txt')
    inTheRepository('commit', '-q', '-m', `Made-up step ${name}`)
    commits[name] = inTheRepository('rev-parse', 'HEAD')
  }
  step('R'); step('A'); step('B'); step('C')

  t = await freshDb()
  const db = t.client.sqlite
  const sqlite = db as unknown as { prepare: (sql: string) => ObjectValue }
  const prepare = sqlite.prepare
  sqlite.prepare = function (this: unknown, statement: string) {
    const prepared = prepare.call(this, statement)
    if (!/\bFROM revisions\b/.test(statement)) return prepared
    // The frame under this wrapper is the line that prepared the statement.
    const ours = /src\/server\/lib\/stable-upgrade-notices\.ts:\d+/.test(new Error().stack?.split('\n')[2] ?? '')
    const read = ours ? (Object.keys(READS) as ARead[]).find(name => READS[name].is.test(statement)) ?? null : null
    for (const method of ['all', 'get'] as const) {
      const run = prepared[method] as (...values: unknown[]) => unknown
      prepared[method] = function (this: unknown, ...values: unknown[]) {
        const rows = run.apply(this, values)
        if (keeping !== null) {
          keeping.push({ read, statement, values, rows })
          everyRead.push({ read, statement, values, rows })
        }
        return rows
      }
    }
    return prepared
  }
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  const settings = await import('../src/config/settings.mjs')
  repository = settings.theServingInstall().repository
  migrations = settings.THE_MIGRATIONS_FOLDER
  const webDir = join(dirname(t.file), 'made-up-web')
  mkdirSync(webDir)
  const { writeTheBuildStamp } = await import('../src/config/build-stamp.mjs')
  writeTheBuildStamp(webDir, { commit: settings.theServingInstall().commit })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  for (const who of ['controller', 'secretary', 'stranger']) {
    const made = await ask('POST', '/api/agents/started', { handle: `made-up-${who}`, name: `Made-up ${who}`, role: who === 'secretary' ? 'secretary' : 'worker' }, ownerHeaders)
    expect(made.statusCode, made.body).toBe(201)
    const data = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    ids.set(who, data.agent.id); keys.set(who, data.whatToGiveIt.key)
    runs.set(who, t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: `Made-up ${who} run`, data: { state: 'running', servingAgent: data.agent.id }, actor: t.api.HUMAN }).id)
  }
  lib = await import('../src/server/lib/stable-upgrade-notices.ts')
  schema = await import('../src/server/db/schema.ts')
  wayBack = await import('../tools/stable/the-way-back.mjs')

  // ---------------------------------------------------------------- the notices, through the door
  // Three ordinary releases: one refused, one failed and restored, one still unfinished.
  anUpgradeAfter(anUpgradeBefore(), 'refused', STABLE_UPGRADE_PUBLIC_REASONS[0])
  anUpgradeAfter(anUpgradeBefore(), 'failed-restored', STABLE_UPGRADE_PUBLIC_REASONS[1])
  anUpgradeBefore()
  // An emergency release that completed, with the follow-up receipt and the report it owes, then one still unfinished.
  const first = anEmergencyBefore({ throw: await throwTheSwitch(60), message: tellTheOwner(commits.A) }, commits.A)
  anEmergencyAfter(first, commits.A)
  t.api.createRecord({ kind: 'whole_suite_receipt', title: 'A made-up follow-up receipt', workspaceId: PROJECT,
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, repository: git, commit: commits.B, tree: treeOf(commits.B) }, actor: actor() })
  const report = t.api.createRecord({ kind: 'report', title: 'A made-up follow-up report', workspaceId: PROJECT, data: { blocks: [] }, actor: actor() }).id
  t.api.createLink({ fromId: report, toId: first.original.id, type: 'about', actor: actor() })
  anEmergencyBefore({ throw: await throwTheSwitch(61), message: tellTheOwner(commits.B) }, commits.B)
  // The message the emergency judgment is asked about below, written now so the count below holds when it is asked.
  const theLastMessage = tellTheOwner(commits.C)

  // ---------------------------------------------------------------- the made-up messages, straight into the table
  const creates = () => (db.prepare("SELECT count(*) AS n FROM revisions WHERE seq = 1 AND op = 'create' AND kind = 'message'").get() as { n: number }).n
  const planted = MESSAGE_CREATES - creates()
  const otherLines = Object.keys(SYSTEM_LINES).filter(kind => kind !== STABLE_UPGRADE_NOTICE_EVENT).slice(0, 8)
  const insert = db.prepare('INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, at) ' +
    "VALUES (?, ?, ?, 1, ?, 'message', ?, ?, 'create', 'agent', ?, ?)")
  db.transaction(() => {
    for (let i = 0; i < planted; i++) {
      const at = localStamp(new Date(new Date(2026, 5, 1).getTime() + i * 120_000))
      const line = i % 8 === 0
      const data = line
        ? { body: `A made-up line of Mole Office ${i}, planted by this test.`, sentBy: moleOffice(), to: [{ kind: 'person', id: owner }], notice: otherLines[i % otherLines.length] }
        : { body: `A made-up message ${i}, planted by this test.`, sentBy: { kind: 'agent', id: ids.get('stranger') }, to: [{ kind: 'person', id: owner }] }
      insert.run(`made-up-revision-${i}`, `made-up-message-${i}`, PROJECT, `made-up-${i}`, `A made-up message ${i}`, JSON.stringify(data), line ? moleOffice().id : ids.get('stranger'), at)
    }
  })()
  expect(creates(), 'the made-up office holds the count of first revisions of messages it is made up to').toBe(MESSAGE_CREATES)

  // ---------------------------------------------------------------- the questions, and what the filed notices say
  const atOf = (id: string) => (db.prepare('SELECT at FROM revisions WHERE record_id = ? AND seq = 1').get(id) as { at: string }).at
  const orderOf = (id: string) => (db.prepare("SELECT append_order AS n FROM changes WHERE record_id = ? AND op = 'create'").get(id) as { n: number }).n
  const event = (one: Filed) => one.result.event as ObjectValue
  const kindOf = (one: Filed) => (event(one).request.kind as string | undefined) ?? null

  // BY SEND ID: every notice is found, and asked again, as the one the door filed; a send id nobody used finds none.
  for (const one of filed) {
    const sendId = one.request.sendId as string
    const lookup = question(() => lib.lookupStableUpgradeNotice(PROJECT, sendId, actor()))
    asked[`lookup ${sendId}`] = { answer: lookup.answer, rows: rowsOf(lookup.reads, 'the originals of a send id or an ending') }
    const row = { id: one.result.original.id, version: event(one).version, request_kind: kindOf(one) }
    expected[`lookup ${sendId}`] = { answer: { notice: { ...one.result, replayed: true } }, rows: [[row]] }
    const again = question(() => lib.fileStableUpgradeNotice(PROJECT, one.request as never, actor(), one.identity as never))
    asked[`replay ${sendId}`] = { answer: again.answer, moves: rowsOf(again.reads, 'a data-folder move notice with this send id'), rows: rowsOf(again.reads, 'the originals of a send id or an ending') }
    expected[`replay ${sendId}`] = { answer: { ...one.result, replayed: true }, moves: [undefined], rows: [[row]] }
  }
  const nobody = question(() => lib.lookupStableUpgradeNotice(PROJECT, 'made-up-send-id-nobody-used', actor()))
  asked['lookup of a send id nobody used'] = { answer: nobody.answer, rows: rowsOf(nobody.reads, 'the originals of a send id or an ending') }
  expected['lookup of a send id nobody used'] = { answer: { notice: null }, rows: [[]] }

  // THE HISTORY, two to a page: every BEFORE, newest first by the order its creation was written in.
  const befores = filed.filter(one => one.request.stage === 'before').sort((a, b) => orderOf(b.result.original.id) - orderOf(a.result.original.id))
  const endingOf = (before: Filed) => filed.find(one => one.request.stage === 'after' && one.request.before.id === before.result.original.id)
  const page = (answer: ObjectValue) => ({ entries: (answer.entries as ObjectValue[]).map(one => ({ before: one.before, after: one.after, tag: one.tag, outcome: one.outcome })), older: answer.older })
  let cursor: string | undefined
  for (let n = 0; n * 2 < befores.length; n++) {
    const read = question(() => lib.stableUpgradeHistory(PROJECT, 2, cursor))
    asked[`history page ${n + 1}`] = { answer: page(read.answer as ObjectValue), rows: rowsOf(read.reads, 'the history') }
    const carried = befores.slice(n * 2, n * 2 + 2)
    const more = befores.length > n * 2 + 2
    expected[`history page ${n + 1}`] = {
      answer: { entries: carried.map(one => ({ before: one.result.original, after: endingOf(one)?.result.original ?? null,
        tag: one.request.announcement.candidateTag, outcome: endingOf(one)?.request.outcome.state ?? 'unfinished' })),
        older: more ? Buffer.from(carried.at(-1)!.result.original.id).toString('base64url') : null },
      rows: [befores.slice(n * 2, n * 2 + 3).map(one => ({ id: one.result.original.id }))],
    }
    cursor = (read.answer as ObjectValue).older ?? undefined
  }

  // THE OWNER'S CONTACT: the newest notice to the owner, in any project or in this one, and none elsewhere or to another.
  const newest = [...filed].sort((a, b) => bytewise(atOf(b.result.original.id) + b.result.original.id, atOf(a.result.original.id) + a.result.original.id))[0]!
  const theNewest = { id: newest.result.original.id, project: PROJECT, version: event(newest).version }
  for (const [name, who, project, answer, row] of [
    ['the owner', owner, undefined, true, theNewest],
    ['the owner in this project', owner, PROJECT, true, theNewest],
    ['the owner in another project', owner, ELSEWHERE, false, undefined],
    ['another agent', ids.get('stranger')!, undefined, false, undefined],
  ] as const) {
    const read = question(() => lib.hasOriginalUpgradeNoticeForOwner(who, project))
    asked[`contact of ${name}`] = { answer: read.answer, rows: rowsOf(read.reads, "the owner's contact") }
    expected[`contact of ${name}`] = { answer, rows: [row] }
  }

  // THE EMERGENCY JUDGMENT reads the earlier emergency BEFOREs, and the newest completed AFTER of any kind.
  const judged = question(() => lib.theEmergencyAsJudged(PROJECT, actor(), { message: theLastMessage, commit: commits.C }))
  const emergencies = befores.filter(one => kindOf(one) === 'emergency')
  asked['earlier emergencies'] = {
    answer: [...judged.answer.earlier].map(one => ({ tag: one.tag, outcome: one.outcome })).sort((a, b) => bytewise(a.tag, b.tag)),
    rows: rowsOf(judged.reads, 'the earlier emergencies').map(rows => [...(rows as { id: string }[])].sort((a, b) => bytewise(a.id, b.id))),
  }
  expected['earlier emergencies'] = {
    answer: emergencies.map(one => ({ tag: one.request.announcement.candidateTag, outcome: endingOf(one)?.request.outcome.state ?? 'unfinished' })).sort((a, b) => bytewise(a.tag, b.tag)),
    rows: [emergencies.map(one => ({ id: one.result.original.id })).sort((a, b) => bytewise(a.id, b.id))],
  }
  const completed = filed.filter(one => one.request.stage === 'after' && ['completed', 'handed-off'].includes(one.request.outcome.state))
  asked['the newest completed release'] = { rows: rowsOf(judged.reads, 'the newest completed release') }
  expected['the newest completed release'] = {
    rows: [completed.map(one => ({ id: one.result.original.id, at: orderOf(one.result.original.id) })).sort((a, b) => b.at - a.at)],
  }
}, 240_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (folder) rmSync(folder, { recursive: true, force: true })
})


describe('C. what each read and each door answers, by hash', () => {
  it('answers each question as the notices filed here say it must', () => {
    expect(Object.keys(asked).length, 'questions were asked').toBeGreaterThan(20)
    expect(Object.keys(asked).sort()).toEqual(Object.keys(expected).sort())
    const hashes = (all: Record<string, unknown>) => Object.fromEntries(Object.keys(all).sort().map(name => [name, hashOf(all[name])]))
    const differ = Object.keys(asked).filter(name => hashOf(asked[name]) !== hashOf(expected[name]))
    expect(differ.map(name => ({ name, asked: canonical(asked[name]), expected: canonical(expected[name]) })), 'the questions answered otherwise').toEqual([])
    expect(hashes(asked)).toEqual(hashes(expected))
  })
})

describe("D. the words are the writers' own", () => {
  /** Whether a first revision with this data would be in the index, as SQLite reads the index's WHERE. */
  const kept = (data: string, row: { seq?: number; op?: string; kind?: string } = {}): number =>
    (t.client.sqlite.prepare(`SELECT CASE WHEN ${theWords()} THEN 1 ELSE 0 END AS kept FROM (SELECT ? AS data, ? AS seq, ? AS op, ? AS kind)`)
      .get(data, row.seq ?? 1, row.op ?? 'create', row.kind ?? 'message') as { kept: number }).kept

  it('keeps the first revision of each notice the door filed, and no line of another kind, no later revision and no other kind of record', () => {
    expect(SYSTEM_LINES.stableUpgradeNotice('A made-up line.').notice, "the kind the system line's writer stores").toBe(STABLE_UPGRADE_NOTICE_EVENT)
    for (const one of filed) {
      const data = (t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id = ? AND seq = 1').get(one.result.original.id) as { data: string }).data
      expect(kept(data), `the notice ${one.request.sendId as string}`).toBe(1)
      expect(kept(data, { seq: 2 }), 'a later revision of it').toBe(0)
      expect(kept(data, { op: 'baseline' }), 'a baseline of it').toBe(0)
      expect(kept(data, { kind: 'note' }), 'a record of another kind').toBe(0)
    }
    for (const kind of Object.keys(SYSTEM_LINES).filter(one => one !== STABLE_UPGRADE_NOTICE_EVENT)) {
      expect(kept(JSON.stringify({ body: 'A made-up line.', sentBy: moleOffice(), notice: kind })), `a line of the kind ${kind}`).toBe(0)
    }
  })

  it('holds in the index the first revision of every record any revision of which holds an upgrade event', () => {
    const withAnEvent = (t.client.sqlite.prepare(`SELECT DISTINCT record_id AS id FROM revisions WHERE json_extract(data, '$.extra.${STABLE_UPGRADE_NOTICE_EVENT}') IS NOT NULL ORDER BY id`).all() as { id: string }[]).map(one => one.id)
    const inTheIndex = (t.client.sqlite.prepare(`SELECT record_id AS id FROM revisions INDEXED BY ${INDEX} WHERE ${theWords()} ORDER BY id`).all() as { id: string }[]).map(one => one.id)
    expect(withAnEvent.length, 'the door filed notices here').toBe(filed.length)
    expect(inTheIndex).toEqual(withAnEvent)
  })
})

