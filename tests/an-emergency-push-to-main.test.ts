// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMERGENCY PUSH TO MAIN (item 16 of the 13u requirements). A test office made for
 * this file, with its owner, agents, chat messages, receipts and git repositories made up here. The private GitHub copy
 * is a local bare repository: a `git` on PATH sends every push to origin there, and a `gh` on PATH says "private". No
 * test sends a byte to GitHub.
 *
 * OLD: main moved only by a landing of the merge queue. An emergency fix waited in the queue like any other entry.
 * NEW: whoever holds the secretary card (or the person) pushes one commit straight to main, while the owner's emergency
 * switch, the office gate stable-emergency, is on. The push files a record of its own: who, the chat message that told
 * the owner, the commit, main before it, and the switch's row. Main has one writer at a time: the push takes the lock a
 * landing takes, waits for a landing that is writing main, and never waits for a test. The merge tool's emergency mode
 * moves main, pushes the commit on to the private GitHub copy and to the mirror through pushLanded, and ends the record
 * as git shows. An entry tested on the old main is integrated and tested again, and its log names the push. The push's
 * record marks its follow-up, the first whole-suite receipt on main that contains the commit (13q's theFollowUp).
 * The push may name the line its fix came from, by that line's supervisor handle, and the record keeps it. A red
 * follow-up in a file the push changed goes back first to that line: the office files a problem about the push and tells
 * the line and the secretary. With no line named, it goes to whoever pushed when that is an agent, and to whoever holds
 * the secretary card when the person pushed. A green follow-up, or a red one in no file the push changed, is left where
 * a red whole suite goes today. The queue page marks a red follow-up, and a lane that holds only pushes says so.
 * WHY: an emergency fix does not go through the merge queue; it goes straight to main and then into the stable version,
 * and the whole suite tests it afterwards. A red the fix causes must still reach somebody who can mend it.
 *
 * WHERE EACH CASE IS PUT, AND WHY: the door cases and the tool cases share this one file and its test office, because a
 * push the tool makes is filed through the office's door, and the tool's cases read the record the door wrote. The
 * hand-back cases are here for the same reason: the hand-back reads the push's record and its follow-up. The command
 * line's cases are here because they move this file's main checkout through this file's office, started on a port of
 * its own. The office's refusal of a landing while a push moves main is in tests/merge-state-machine.test.ts, beside the
 * refusal of a landing while another entry lands, because it is the same rule of the state machine. The trace's question
 * to the hand-back door is in tests/a-main-suite-red-is-traced-to-the-landing-that-made-it.test.ts, beside the trace's
 * other rule for a range no landing covers. The log line of a red suite that finds main moved is in
 * tests/the-whole-suite-red-gate.test.ts, beside that suite's other rules for a moved main.
 *
 * THE CLOCK ZONE IS UTC IN THIS FILE. The switch's end time is stored as a wall-clock stamp in the process's zone, and
 * 13q's rule refuses a stamp that names two moments (problem found on 25 October 2026, when 01:00 to 02:00 happens twice
 * in Europe/London). UTC has no repeated hour, so the cases do not depend on the night they run.
 *
 * CASE PROOF MAP. Each case was red on the code before this change, and each part undone alone turns its case red.
 * - (c) switch: no door, so 404 / the door no longer judges the switch.
 * - who and the record's doors: 404 and 400 for an unknown kind / the guard taken out of records.ts.
 * - (b) record: no door / a field left out of the record.
 * - (a) one writer: no door / the landing check taken out of the push door.
 * - ending as git shows: no door / the end taken on the tool's word.
 * - (d) follow-up: no door / followUp read as null.
 * - (b) page: no push in the reply / the lane's history not drawn.
 * - (c) tool: no tool / pushLanded not called.
 * - (a) tool waits: no tool / the wait for a landing taken out.
 * - (a) a landing waits: no wait / the push left out of untilNoOtherLandingOf.
 * - (b) log: no line / the line left out of land.mjs.
 * - (d) line kept: 400 for an unknown key `line` / the line left out of the record.
 * - (d) hand-back to the line: no door, so 404 / the line left out of the recipients, or the push's files not compared.
 * - (d) hand-back with no line: no door / the secretary card's holder not chosen when the person pushed.
 * - command, no key: the sentence not said in one place / the key check taken out of the-merger.mjs.
 * - command, with the key: --line an unknown argument, exit 2 / the line not sent to the door.
 * - (b) page, red follow-up: no mark / the mark left off.
 * - (b) page, a lane of pushes only: "0 in this lane" / the count of entries said again.
 * - (d) hand-back's deadline: the problem kept none / the deadline left out of the problem.
 * - (d) overdue, once: no deadline to read / the deadline never read as passed, or the earlier note not looked for.
 * - (d) the build sheriff: nobody told / the sheriff not chosen, or the reminder not marking the problem told.
 * - (d) the pushes in a landed-between range: no list / the list left empty.
 * - one push on its own door: no door, so 404 / the line's handle not read, or a record that is no push read as one.
 * - its own page, red follow-up: no part draws it / the mark left off the push's page, or the receipt's id said again.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => {
  // Before any module reads the zone: see THE CLOCK ZONE IS UTC above.
  process.env.TZ = 'UTC'
  // THE REPORT TIMES THE REMINDER CASE READS, whatever the checkout's .env says: 07:00 and 18:00, each reminded 30 minutes
  // before, as tests/the-secretary-report-reminders-carry-the-template.test.ts fixes them.
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  return {
    folder: '',
    state: {} as Record<string, any>,
    steps: [] as { name: string; facts: any }[],
    logged: [] as string[],
    /** The office as the merge tool asks it: GET only, as an agent that may read the queue. */
    inject: null as null | ((method: string, url: string, body?: unknown) => Promise<{ status: number; body: any }>),
  }
})
vi.mock('../tools/merge-tool/arguments.mjs', async () => {
  const { theOfficeConfiguration } = await import('../tools/merge-tool/config.mjs')
  const { THE_MERGE_TOOLS_TEST_ADDRESS } = await import('./the-test-commit-address.mjs')
  return {
    THE_OFFICE_CONFIGURATION: theOfficeConfiguration({ repository: fileURLToPath(new URL('..', import.meta.url)), commitEmail: THE_MERGE_TOOLS_TEST_ADDRESS }),
    get WORKDIR() { return join(boundary.folder, 'logs') },
    MIGRATIONS_FOLDER: 'drizzle/',
    SCRIPT_TIMEOUT_MS: 30_000,
    GIT_IDENTITY: { GIT_AUTHOR_NAME: 'Synthetic queue', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic queue', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
    theMainMirrorOf: (await import('../tools/sandbox-common.mjs')).theMainMirrorOf,
    // The private copy's address, read as arguments.mjs reads it: through settings.mjs, when the push asks.
    thePrivateOrigin: (await import('../src/config/settings.mjs')).settingValue.bind(null, 'MOLE_OFFICE_PRIVATE_ORIGIN'),
    chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
  }
})
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (text: string) => { throw Error(text) },
  log: (line: string) => { boundary.logged.push(line) },
  stamp: () => new Date().toISOString(),
  readState: () => boundary.state,
  writeState: (patch: any) => { boundary.state = { ...boundary.state, ...patch }; return boundary.state },
}))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  step: async (name: string, facts: any) => { boundary.steps.push({ name, facts }); return { state: name === 'main-moved' ? 'judged' : 'merged', facts } },
  theOfficesRuntime: async () => ({ repository: { path: join(boundary.folder, 'main') } }),
  waitForHealth: async () => ({ says: 'Synthetic health passed' }),
  conflictsAfterLanding: async () => [],
  ask: (method: string, path: string, body?: unknown) => boundary.inject!(method, path, body),
  sleep: (ms: number) => new Promise((ok) => setTimeout(ok, ms)),
  theLane: async (lane: string) => {
    const reply = await boundary.inject!('GET', `/api/merge-queue?lane=${encodeURIComponent(lane)}`)
    return (reply.body.lanes as { lane: string; entries: unknown[] }[]).find((one) => one.lane === lane)?.entries ?? []
  },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ carryPastDocuments: async () => null, theRecordCarriedForward: () => {}, untilNoOtherLandingOf: async () => {} }))

import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { sayInEnglish, type WordKey } from '../src/shared/i18n.ts'
import { localStamp } from '../src/shared/typed-time.mjs'
import { whenAHandBackIsDue } from '../src/shared/merge-class.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import type { Actor } from '../src/server/lib/records.ts'
import * as officeKeeper from '../tools/merge-tool/office-keeper.mjs'
import { sleep } from '../tools/merge-tool/office-keeper.mjs'
import { wholeSuiteFixRoundIsOn } from '../src/config/whole-suite-red.mjs'
import { pluginPagesPosition } from '../src/config/integration-guards.mjs'
import { theMainMirrorOf } from '../tools/sandbox-common.mjs'
import { bringTheMainMirrorForward } from '../tools/sandbox-git.mjs'
import { landGit as landGitFixture } from '../tools/merge-tool/land.mjs'
const notReached = (name: string) => () => { throw new Error(`Synthetic: ${name} is not reached in this file`) }
const landGit = (entry: any) => landGitFixture(entry, {
  replayOnly: true,
  ask: officeKeeper.ask,
  step: officeKeeper.step,
  theOfficesRuntime: officeKeeper.theOfficesRuntime,
  waitForHealth: officeKeeper.waitForHealth,
  conflictsAfterLanding: officeKeeper.conflictsAfterLanding,
  theLane: officeKeeper.theLane,
  sleep: officeKeeper.sleep,
  countAGateMet: notReached('countAGateMet'),
  runInSandbox: notReached('runInSandbox'),
  theSandbox: notReached('theSandbox'),
  wholeSuiteFixRoundIsOn,
  pluginPagesPosition,
})

type ObjectValue = Record<string, any>
type Pin = { id: string; seq: 1; contentHash: string }
const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const REAL_GIT = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
const SETTING = 'MOLE_OFFICE_STABLE_EMERGENCY'
const LIVE = 'submitted,pinned,judged,integrating,reinspecting,testing,landing,resolving'
const owner = THE_TEST_OFFICES_OWNER.id
const personKey = randomBytes(32).toString('hex')
const officeKey = randomBytes(32).toString('hex')
const ownerHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': owner, 'x-mole-office-key': personKey }
/** The office's message worker, as it asks the office: under its own name, proved by the office's key. */
const asTheWorker = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', 'x-mole-office-key': officeKey }
const ids = new Map<string, string>()
const handles = new Map<string, string>()
const keys = new Map<string, string>()
const runs = new Map<string, string>()
let t: TestDb
let app: FastifyInstance
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let folder: string
let root: string
let remote: string
let base: string
let originalPath: string | undefined
// THE PRIVATE COPY'S ADDRESS, made up here. It is set as MOLE_OFFICE_PRIVATE_ORIGIN in this test process only, and
// never in a .env file: the push reads that setting when it runs, and the setting has no default.
const THE_COPY = 'git@github.com:quill/a-private-copy.git'
let theOldOrigin: string | undefined
let fixes = 0
let because = 0

function headers(who: string) {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': ids.get(who)!, 'x-mole-office-key': keys.get(who)!, 'x-mole-office-session': runs.get(who)! }
}
function actor(who: string): Actor {
  return { type: 'agent', id: ids.get(who)!, keyHolder: ids.get(who)!, provedBy: 'an-agent-key', sessionId: runs.get(who)! }
}
async function ask(method: 'GET' | 'POST', url: string, payload?: unknown, as: Record<string, string> = headers('secretary')) {
  const reply = await app.inject({ method, url, headers: as, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: any = null
  try { body = reply.body === '' ? null : JSON.parse(reply.body) } catch { body = { error: reply.body } }
  return { status: reply.statusCode, body, raw: reply.body }
}
/** The office as the secretary's merge tool asks it, in the shape the tool's own ask answers. */
const asTheSecretary = (method: string, path: string, body?: unknown) => ask(method as 'GET' | 'POST', path, body)
function reference(id: string, seq = 1): Pin {
  const r = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').get(id, seq) as { content_hash: string }
  return { id, seq: seq as 1, contentHash: r.content_hash }
}
function totalWrites() { return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get() as { n: number }).n }
/** The sentences the push is refused with, read from the module that says them, so the words are pinned in one place. */
async function words(): Promise<Record<string, any>> { return await import('../src/shared/emergency-push.ts') as Record<string, any> }

function git(where: string, ...args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  return execFileSync('git', ['-C', where, '-c', 'user.name=Synthetic writer', '-c', 'user.email=synthetic@example.invalid', ...args],
    { env: { ...env, HOME: folder, GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'file' }, encoding: 'utf8', timeout: 30_000 }).trim()
}
const mainOf = () => git(root, 'rev-parse', 'HEAD')
/** Main in a bare repository, or null when it has none. */
const mainIn = (repository: string) => {
  const r = spawnSync('git', ['--git-dir', repository, 'rev-parse', '--verify', '-q', 'refs/heads/main'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}
/** A fix on a branch of its own, one commit after main, that changes `path`; main stays where it was. */
function aFix(words = `Synthetic fix ${++fixes}`, path = 'value.txt'): string {
  git(root, 'switch', '-q', '-c', `fix-${String(++fixes)}`)
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), `${words}\n`)
  git(root, 'add', path)
  git(root, 'commit', '-qm', words)
  const sha = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  return sha
}
const mirrorOf = () => theMainMirrorOf(join(folder, 'sandboxes'), root)

/** The owner throws the switch on the settings door, as the Gates page does. */
async function throwTheSwitch(value: '0' | '1', minutes: number | null = 60) {
  const until = minutes === null ? {} : { until: localStamp(new Date(Date.now() + minutes * 60_000)).slice(0, 16) }
  const saved = await ask('POST', '/api/office/settings', { changes: [{ name: SETTING, value, ...until }], because: `Made-up emergency throw ${++because}.` }, ownerHeaders)
  expect(saved.status, saved.raw).toBe(200)
}
async function theSwitch() {
  const reply = await ask('GET', '/api/office/gates', undefined, ownerHeaders)
  expect(reply.status, reply.raw).toBe(200)
  const rows = (reply.body as { classes: { groups: { rows: ObjectValue[] }[] }[] }).classes.flatMap((one) => one.groups.flatMap((group) => group.rows))
  return rows.find((one) => one.id === 'stable-emergency')!
}
/** The secretary tells the owner alone in chat which commit goes to main, as 13q's emergency rule asks. */
function tellTheOwner(commit: string): Pin {
  return reference(t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Synthetic emergency message',
    data: { body: `The office is broken. Synthetic fix ${commit} goes to main now.`, to: [{ kind: 'person', id: owner }] }, actor: actor('secretary') }).id)
}
const aPush = (commit: string, message: Pin, as: Record<string, string> = headers('secretary'), line?: string) =>
  ask('POST', '/api/merge-queue/emergency-pushes', { root, commit, message, ...(line === undefined ? {} : { line }) }, as)
const theEnd = (id: string, body: ObjectValue, as = headers('secretary')) => ask('POST', `/api/merge-queue/emergency-pushes/${id}/end`, body, as)
async function theLane(): Promise<ObjectValue> {
  const reply = await ask('GET', `/api/merge-queue?lane=${encodeURIComponent(root)}`, undefined, headers('stranger'))
  expect(reply.status, reply.raw).toBe(200)
  return reply.body
}
/** A merge entry of the main checkout in the shape the queue writes, written as the queue writes. Synthetic. */
function anEntry(state: 'landing' | 'testing'): string {
  return door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: `Synthetic ${state} entry`, workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN,
    data: { run: 'synthetic-run', seal: { id: 'synthetic-seal', hash: 'synthetic-hash' }, state, occupies: root, submittedBy: { kind: 'agent', id: 'synthetic-worker' },
      changeset: { adapter: 'git', root, repository: 'synthetic-main', branch: 'work', commit: 'c'.repeat(40), base } } })).id
}
function theEntryEnds(id: string) {
  door.asTheMergeQueue(() => t.api.patchRecord(id, { dataPatch: { state: 'merged', occupies: null } }, t.api.HUMAN))
}
/** A push the door took, moved by hand and ended as pushed, so the next case starts on a main nobody is moving. */
async function aPushThatLanded(push: { path?: string; line?: string; as?: Record<string, string> } = {}): Promise<{ id: string; commit: string }> {
  const commit = aFix(undefined, push.path)
  const taken = await aPush(commit, tellTheOwner(commit), push.as, push.line)
  expect(taken.status, taken.raw).toBe(201)
  git(root, 'merge', '-q', '--ff-only', commit)
  const ended = await theEnd(taken.body.push.id, { says: 'Synthetic: moved by hand.', onward: null })
  expect(ended.status, ended.raw).toBe(200)
  return { id: taken.body.push.id, commit }
}
function aReceipt(sha: string, green: boolean): string {
  const data = { ...WHOLE_SUITE_RECEIPT_EXAMPLE, repository: root, commit: sha, tree: git(root, 'rev-parse', `${sha}^{tree}`),
    ...(green ? {} : { suiteExitCode: 1, failedFiles: ['tests/synthetic.test.ts'], failedTests: [{ file: 'tests/synthetic.test.ts', name: 'Synthetic failing test' }] }) }
  return t.api.createRecord({ kind: 'whole_suite_receipt', title: `Synthetic receipt for ${sha.slice(0, 7)}`, workspaceId: 'default', data, actor: actor('stranger') }).id
}
/** A red whole-suite receipt of version 2 at `sha`, each of `files` red in the whole run and red alone, as the main suite files it. */
function aRedReceipt(sha: string, files: string[]): string {
  const report = { name: 'report', path: '/srv/example/receipts/alone/report.json', sha256Base64: WHOLE_SUITE_RECEIPT_EXAMPLE.artifacts[0]!.sha256Base64 }
  const data = { ...WHOLE_SUITE_RECEIPT_EXAMPLE, version: 2, repository: root, commit: sha, tree: git(root, 'rev-parse', `${sha}^{tree}`), suiteExitCode: 1,
    failedFiles: files, failedTests: files.map((file) => ({ file, name: 'Synthetic failing test' })), errorsOutsideTests: 0,
    aloneRuns: files.map((file) => ({ file, outcome: 'red', exitCode: 1, artifacts: [report] })) }
  return t.api.createRecord({ kind: 'whole_suite_receipt', title: `Synthetic red receipt for ${sha.slice(0, 7)}`, workspaceId: 'default', data, actor: actor('stranger') }).id
}
const HAND_BACK = '/api/merge-queue/emergency-pushes/hand-back-from-the-main-suite'
/** The main suite's job hands a red receipt's files to the pushes, as the agent that filed the receipt. */
const handBack = (receipt: string, files: string[], as = headers('stranger')) => ask('POST', HAND_BACK, { receipt, files }, as)
/** The office's notices of one kind (handed-back unless named) that name `problem`, oldest first, with whom each went to. */
function theNoticesAbout(problem: string, notice = 'handedBack'): { id: string; to: { kind: string; id: string }[]; aboutRun: unknown }[] {
  const rows = t.client.sqlite.prepare(`SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL
    AND json_extract(data, '$.notice') = ? AND instr(json_extract(data, '$.body'), ?) > 0 ORDER BY rowid`).all(notice, problem) as { id: string; data: string }[]
  return rows.map((row) => { const data = JSON.parse(row.data) as ObjectValue; return { id: row.id, to: data.to, aboutRun: data.aboutRun } })
}

beforeAll(async () => {
  theOldOrigin = process.env.MOLE_OFFICE_PRIVATE_ORIGIN
  process.env.MOLE_OFFICE_PRIVATE_ORIGIN = THE_COPY
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'emergency-push-')))
  boundary.folder = folder
  mkdirSync(join(folder, 'logs'))
  // THE MAIN CHECKOUT, with main checked out as the owner's is, and origin at the made-up private copy's address.
  root = join(folder, 'main')
  mkdirSync(root)
  git(root, 'init', '-q', '-b', 'main')
  writeFileSync(join(root, 'value.txt'), 'base\n')
  git(root, 'add', 'value.txt')
  git(root, 'commit', '-qm', 'Synthetic baseline')
  base = mainOf()
  git(root, 'remote', 'add', 'origin', THE_COPY)
  remote = join(folder, 'remote.git')
  mkdirSync(remote)
  git(remote, 'init', '-q', '--bare')
  git(root, 'push', '-q', remote, `${base}:refs/heads/main`)
  // THE NETWORK BOUNDARY, as in tests/merge-push-round-12.test.ts: every push and ls-remote of origin goes to the bare
  // repository, and gh says the copy is private. Git's own get-url still sees the address origin was given.
  const bin = join(folder, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), "#!/bin/sh\nprintf '%s\\n' 'private'\n")
  chmodSync(join(bin, 'gh'), 0o700)
  writeFileSync(join(bin, 'git'), `#!${process.execPath}
const {spawnSync}=require('node:child_process');const args=process.argv.slice(2);const c=args.indexOf('-C');const at=c<0?0:c+2;
if(args[at]==='push'||args[at]==='ls-remote'){const target=args.indexOf('origin',at+1);if(target>=0)args[target]=${JSON.stringify(remote)};}
const r=spawnSync(${JSON.stringify(REAL_GIT)},args,{stdio:'inherit',env:{...process.env,GIT_ALLOW_PROTOCOL:'file'}});process.exit(r.status??1);
`)
  chmodSync(join(bin, 'git'), 0o700)
  originalPath = process.env.PATH
  process.env.PATH = `${bin}:${originalPath}`
  // THE MIRROR, made as the sandbox launcher makes it at `up`.
  const made = bringTheMainMirrorForward(mirrorOf(), root, { make: true })
  expect(made.why).toBeNull()

  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  const settings = await import('../src/config/settings.mjs')
  const { commit } = settings.theServingInstall()
  const webDir = join(dirname(t.file), 'synthetic-web')
  mkdirSync(webDir)
  const { writeTheBuildStamp } = await import('../src/config/build-stamp.mjs')
  writeTheBuildStamp(webDir, { commit })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  for (const who of ['secretary', 'stranger', 'line']) {
    const role = who === 'secretary' ? 'secretary' : who === 'line' ? 'supervisor' : 'worker'
    const made = await ask('POST', '/api/agents/started', { handle: `emergency-push-${who}`, name: `Synthetic ${who}`, role }, ownerHeaders)
    expect(made.status, made.raw).toBe(201)
    ids.set(who, made.body.agent.id); keys.set(who, made.body.whatToGiveIt.key); handles.set(who, `emergency-push-${who}`)
    runs.set(who, t.api.createRecord({ workspaceId: 'default', kind: 'session', title: `Synthetic ${who} run`, data: { state: 'running', servingAgent: made.body.agent.id }, actor: t.api.HUMAN }).id)
  }
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'synthetic-main', root, actor: { type: 'human', id: owner } })
  door = await import('../src/server/lib/merge-entry-door.ts')
  boundary.inject = (method, url, body) => ask(method as 'GET' | 'POST', url, body, headers('stranger'))
})
afterAll(async () => {
  process.env.PATH = originalPath
  if (theOldOrigin === undefined) delete process.env.MOLE_OFFICE_PRIVATE_ORIGIN
  else process.env.MOLE_OFFICE_PRIVATE_ORIGIN = theOldOrigin
  await app?.close()
  t?.close()
  if (folder) rmSync(folder, { recursive: true, force: true })
})
beforeEach(() => { boundary.steps = []; boundary.logged = []; boundary.state = {} })

describe('the emergency push doors', () => {
  it('refuses a push while the emergency switch is off, in a sentence that names the switch, and writes nothing', async () => {
    const commit = aFix()
    const message = tellTheOwner(commit)
    const writes = totalWrites()
    const refused = await aPush(commit, message)
    expect(refused.status, refused.raw).toBe(409)
    const { aPushNeedsTheSwitch } = await words()
    expect(refused.body.error).toBe(aPushNeedsTheSwitch('The emergency switch is at 0.'))
    expect(refused.body.error).toContain('stable-emergency')
    expect(totalWrites()).toBe(writes)
    expect(mainOf()).toBe(base)
  })

  it('takes a push only from the person or whoever holds the secretary card, and its record only through its doors', async () => {
    await throwTheSwitch('1')
    const commit = aFix()
    const message = tellTheOwner(commit)
    const writes = totalWrites()
    const stranger = await aPush(commit, message, headers('stranger'))
    expect(stranger.status, stranger.raw).toBe(403)
    const { ONLY_THE_PERSON_OR_THE_SECRETARY_PUSHES, EMERGENCY_PUSH_KIND } = await words()
    expect(stranger.body.error).toBe(ONLY_THE_PERSON_OR_THE_SECRETARY_PUSHES)
    // THE RECORD'S OWN DOOR IS NOT A WAY ROUND: the record names who pushed, and only the push doors write it.
    const byHand = await ask('POST', '/api/records', { kind: EMERGENCY_PUSH_KIND, title: 'Synthetic push by hand', data: { state: 'pushing' } }, ownerHeaders)
    expect(byHand.status, byHand.raw).toBe(403)
    expect(totalWrites()).toBe(writes)
  })

  it('files a record of who pushed, the chat message, the commit, main before it and the switch row, and the lane lists it', async () => {
    const commit = aFix()
    const message = tellTheOwner(commit)
    const taken = await aPush(commit, message)
    expect(taken.status, taken.raw).toBe(201)
    const push = taken.body.push
    expect(push).toMatchObject({ state: 'pushing', root, commit, mainBefore: base, message, by: { kind: 'agent', id: ids.get('secretary') }, ended: null, followUp: null })
    const row = await theSwitch()
    expect(push.switch.value).toBe('1')
    expect(push.switch.lastChange.id).toBe(row.lastChange.id)
    expect(push.switch.chosen.until).toBe(row.chosen.until)
    // THE REVISION NAMES THE SECRETARY, not the office: the push is the secretary's act.
    const first = t.client.sqlite.prepare('SELECT actor_type, actor_id FROM revisions WHERE record_id = ? AND seq = 1').get(push.id) as { actor_type: string; actor_id: string }
    expect(first).toEqual({ actor_type: 'agent', actor_id: ids.get('secretary') })
    expect((await theLane()).emergencyPushes.map((one: ObjectValue) => one.id)).toEqual([push.id])
    // It ends as it stayed, so the next case starts with nobody moving main.
    const ended = await theEnd(push.id, { says: 'Synthetic: stopped before main moved.', onward: null })
    expect(ended.status, ended.raw).toBe(200)
    expect(ended.body.push.state).toBe('stopped')
  })

  it('keeps one writer of main: refused while another push moves main or an entry of the repository lands, never held by a test', async () => {
    const { aPushHoldsMain, aLandingHoldsMain } = await words()
    const first = aFix()
    const moving = await aPush(first, tellTheOwner(first))
    expect(moving.status, moving.raw).toBe(201)
    const second = aFix()
    const message = tellTheOwner(second)
    const held = await aPush(second, message)
    expect(held.status, held.raw).toBe(409)
    expect(held.body.error).toBe(aPushHoldsMain(moving.body.push.id, root))
    expect((await theEnd(moving.body.push.id, { says: 'Synthetic: stopped.', onward: null })).status).toBe(200)
    const landing = anEntry('landing')
    const writes = totalWrites()
    const refused = await aPush(second, message)
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body.error).toBe(aLandingHoldsMain(landing, root))
    expect(totalWrites()).toBe(writes)
    theEntryEnds(landing)
    // AN ENTRY UNDER TEST HOLDS ITS LANE, BUT NOT MAIN: the push goes ahead, and the entry is tested again after.
    const testing = anEntry('testing')
    const taken = await aPush(second, message)
    expect(taken.status, taken.raw).toBe(201)
    expect((await theEnd(taken.body.push.id, { says: 'Synthetic: stopped.', onward: null })).status).toBe(200)
    theEntryEnds(testing)
  })

  it('ends as git shows: pushed when main is at the commit, stopped when main stayed, and refused otherwise', async () => {
    const { aStoppedPushPushedNothing, aPushHasEnded, mainAtNeither } = await words()
    const commit = aFix()
    const taken = await aPush(commit, tellTheOwner(commit))
    expect(taken.status, taken.raw).toBe(201)
    const id = taken.body.push.id
    const onward = { ok: true, says: 'Synthetic: pushed on.' }
    // Main did not move, so nothing was pushed on.
    const stayed = await theEnd(id, { says: 'Synthetic: stopped.', onward })
    expect(stayed.status, stayed.raw).toBe(409)
    expect(stayed.body.error).toBe(aStoppedPushPushedNothing(id))
    // Main is somewhere else altogether.
    const elsewhere = aFix()
    git(root, 'merge', '-q', '--ff-only', elsewhere)
    const neither = await theEnd(id, { says: 'Synthetic: confused.', onward: null })
    expect(neither.status, neither.raw).toBe(409)
    expect(neither.body.error).toBe(mainAtNeither(id, root, elsewhere, commit, taken.body.push.mainBefore))
    git(root, 'reset', '-q', '--hard', taken.body.push.mainBefore)
    git(root, 'merge', '-q', '--ff-only', commit)
    const pushed = await theEnd(id, { says: 'Synthetic: moved and pushed on.', onward })
    expect(pushed.status, pushed.raw).toBe(200)
    expect(pushed.body.push).toMatchObject({ state: 'pushed', ended: { mainAfter: commit, says: 'Synthetic: moved and pushed on.', onward } })
    const again = await theEnd(id, { says: 'Synthetic: again.', onward: null })
    expect(again.status, again.raw).toBe(409)
    expect(again.body.error).toBe(aPushHasEnded(id, 'pushed'))
  })

  it('marks its follow-up: missing until a whole-suite receipt on main contains the commit, then that receipt', async () => {
    const pushed = await aPushThatLanded()
    const before = (await theLane()).emergencyPushes.find((one: ObjectValue) => one.id === pushed.id)
    expect(before.followUp).toEqual({ state: 'missing' })
    // A STOPPED PUSH OWES NO FOLLOW-UP.
    expect((await theLane()).emergencyPushes.filter((one: ObjectValue) => one.state === 'stopped').every((one: ObjectValue) => one.followUp === null)).toBe(true)
    // A receipt for the commit before the push does not contain it.
    aReceipt(pushed.commit === mainOf() ? git(root, 'rev-parse', 'HEAD~1') : base, true)
    expect((await theLane()).emergencyPushes.find((one: ObjectValue) => one.id === pushed.id).followUp).toEqual({ state: 'missing' })
    const receipt = aReceipt(pushed.commit, false)
    const after = (await theLane()).emergencyPushes.find((one: ObjectValue) => one.id === pushed.id)
    expect(after.followUp).toEqual({ state: 'filed', receipt: reference(receipt), commit: pushed.commit, green: false })
  })

  it('reads one push on a door of its own, with the handle of the line it names, and refuses a record that is no push', async () => {
    const { notAnEmergencyPush } = await words()
    expect(typeof notAnEmergencyPush, 'src/shared/emergency-push.ts says the refusal').toBe('function')
    const commit = aFix()
    const message = tellTheOwner(commit)
    const taken = await aPush(commit, message, headers('secretary'), handles.get('line'))
    expect(taken.status, taken.raw).toBe(201)
    const one = await ask('GET', `/api/merge-queue/emergency-pushes/${taken.body.push.id}`, undefined, headers('stranger'))
    expect(one.status, one.raw).toBe(200)
    expect(one.body.push).toEqual(taken.body.push)
    expect(one.body.workspaceId).toBe('default')
    expect(one.body.push).toMatchObject({ who: handles.get('secretary'), line: { kind: 'agent', id: ids.get('line') }, lineWho: handles.get('line') })
    const notAPush = await ask('GET', `/api/merge-queue/emergency-pushes/${message.id}`, undefined, headers('stranger'))
    expect(notAPush.status, notAPush.raw).toBe(409)
    expect(notAPush.body.error).toBe(notAnEmergencyPush(message.id))
    const nothing = await ask('GET', '/api/merge-queue/emergency-pushes/made-up-no-such-record', undefined, headers('stranger'))
    expect(nothing.status, nothing.raw).toBe(404)
    const ended = await theEnd(taken.body.push.id, { says: 'Synthetic: stopped before main moved.', onward: null })
    expect(ended.status, ended.raw).toBe(200)
  })

  it("shows each push in its lane's history on the queue page, in a lane with no entry left as well", async () => {
    const pushed = await aPushThatLanded()
    const reply = await ask('GET', `/api/merge-queue?state=${LIVE}`, undefined, ownerHeaders)
    expect(reply.status, reply.raw).toBe(200)
    const page = await import('../src/web/pages/MergeQueuePage.tsx')
    const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: reply.body as MergeQueueReply, now: new Date() }))
    expect(html).toContain(`data-lane="${root}"`)
    expect(html).toContain(`data-push="${pushed.id}"`)
    expect(html).toContain(pushed.commit.slice(0, 12))
    expect(html).toContain(handles.get('secretary'))
  })
})

describe("the merge tool's emergency push", () => {
  const theOfficeRunsElsewhere = async () => ({ mainOnly: true, says: 'Synthetic: the office runs from another folder on the database the main checkout names' })
  async function theTool() {
    return await import('../tools/merge-tool/emergency-push.mjs') as Record<string, any>
  }

  it('moves main to the commit, pushes it on to the private copy and to the mirror through pushLanded, and ends the record pushed', async () => {
    const { runTheEmergencyPush } = await theTool()
    const before = mainOf()
    const commit = aFix()
    const message = tellTheOwner(commit)
    const push = await runTheEmergencyPush({ root, commit, message, ask: asTheSecretary, sleep, whatAboutTheOffice: theOfficeRunsElsewhere, everyMs: 50 })
    expect(mainOf()).toBe(commit)
    expect(mainIn(remote)).toBe(commit)
    expect(mainIn(mirrorOf())).toBe(commit)
    expect(push).toMatchObject({ state: 'pushed', commit, mainBefore: before, ended: { mainAfter: commit, onward: { ok: true } } })
    expect(push.ended.onward.says).toContain(mirrorOf())
    const filed = (await theLane()).emergencyPushes.find((one: ObjectValue) => one.id === push.id)
    expect(filed.state).toBe('pushed')
  }, 60_000)

  it('is refused while the switch is off, says the sentence that names the switch, and moves nothing', async () => {
    const { runTheEmergencyPush } = await theTool()
    const { aPushNeedsTheSwitch } = await words()
    await throwTheSwitch('0', null)
    const before = mainOf()
    const commit = aFix()
    await expect(runTheEmergencyPush({ root, commit, message: tellTheOwner(commit), ask: asTheSecretary, sleep, whatAboutTheOffice: theOfficeRunsElsewhere, everyMs: 50 }))
      .rejects.toThrow(aPushNeedsTheSwitch('The emergency switch is at 0.'))
    expect(mainOf()).toBe(before)
    expect(mainIn(remote)).toBe(before)
    expect(mainIn(mirrorOf())).toBe(before)
    await throwTheSwitch('1')
  }, 60_000)

  it('waits while an entry of the repository is landing, and not while one is under test', async () => {
    const { runTheEmergencyPush } = await theTool()
    const landing = anEntry('landing')
    const commit = aFix()
    let ended = 0
    setTimeout(() => { theEntryEnds(landing); ended = Date.now() }, 600)
    const push = await runTheEmergencyPush({ root, commit, message: tellTheOwner(commit), ask: asTheSecretary, sleep, whatAboutTheOffice: theOfficeRunsElsewhere, everyMs: 50 })
    expect(ended).toBeGreaterThan(0)
    expect(push.state).toBe('pushed')
    expect(boundary.logged.some((line) => line.includes(`merge entry ${landing} is landing in ${root}`))).toBe(true)
    boundary.logged = []
    const testing = anEntry('testing')
    const next = aFix()
    const again = await runTheEmergencyPush({ root, commit: next, message: tellTheOwner(next), ask: asTheSecretary, sleep, whatAboutTheOffice: theOfficeRunsElsewhere, everyMs: 50 })
    expect(again.state).toBe('pushed')
    expect(boundary.logged.filter((line) => line.includes('waits'))).toEqual([])
    theEntryEnds(testing)
  }, 60_000)

  it('makes a landing wait while an emergency push moves main', async () => {
    const documents = await vi.importActual<typeof import('../tools/merge-tool/documents.mjs')>('../tools/merge-tool/documents.mjs')
    const commit = aFix()
    const taken = await aPush(commit, tellTheOwner(commit))
    expect(taken.status, taken.raw).toBe(201)
    let ended = 0
    setTimeout(() => { void theEnd(taken.body.push.id, { says: 'Synthetic: stopped.', onward: null }).then((reply) => { expect(reply.status).toBe(200); ended = Date.now() }) }, 600)
    // The landing looks again every 5 s; this case looks every 50 ms at most, so it waits for the push to end and no longer.
    await documents.untilNoOtherLandingOf(root, { theLane: officeKeeper.theLane, sleep: (ms: number) => officeKeeper.sleep(Math.min(ms, 50)), ask: officeKeeper.ask })
    expect(ended).toBeGreaterThan(0)
    expect(boundary.logged.some((line) => line.includes(`emergency push ${taken.body.push.id} is moving main in ${root}`))).toBe(true)
  }, 60_000)

  it("names the push in the log of an entry tested on the old main, which is sent back to be integrated and tested again", async () => {
    const M = mainOf()
    // THE ENTRY, integrated on M and tested there, in a clone of its own.
    const clone = join(folder, 'entry-clone')
    rmSync(clone, { recursive: true, force: true })
    git(folder, 'clone', '-q', root, clone)
    writeFileSync(join(clone, 'entry.txt'), 'Synthetic entry\n')
    git(clone, 'add', 'entry.txt')
    git(clone, 'commit', '-qm', 'Synthetic entry')
    boundary.state = { integrated: { M, Cfinal: git(clone, 'rev-parse', 'HEAD'), clone } }
    const pushed = await aPushThatLanded()
    const moved = await landGit({ state: 'landing', changeset: { root } })
    expect(moved.state).toBe('judged')
    expect(boundary.steps.map((one) => one.name)).toEqual(['main-moved'])
    expect(boundary.logged.some((line) => line.includes(`emergency push ${pushed.id}`) && line.includes(pushed.commit))).toBe(true)
    expect(mainOf()).toBe(pushed.commit)
  }, 60_000)
})

describe('the merge tool run as a command: node tools/the-merger.mjs --emergency-push', () => {
  let api = ''
  const groups = new Set<number>()
  beforeAll(async () => {
    // THIS FILE'S OFFICE ON A PORT OF ITS OWN, so the tool asks it over HTTP as it asks any office. Never the live one.
    await app.listen({ port: 0, host: '127.0.0.1' })
    api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    // THE MAIN CHECKOUT NAMES THIS OFFICE'S DATABASE, as the owner's main checkout names the database the stable office
    // runs on, so the tool finds that the push changes main only. The file is untracked, so main does not hold it.
    mkdirSync(join(root, 'src', 'config'), { recursive: true })
    writeFileSync(join(root, 'src', 'config', 'settings.mjs'), `export function settings() { return { databasePath: ${JSON.stringify(t.file)} } }\n`)
  })
  afterAll(() => {
    for (const group of groups) {
      try { process.kill(-group, 'SIGKILL') } catch { /* the group has ended */ }
    }
    rmSync(join(root, 'src'), { recursive: true, force: true })
  })

  /** The words the tool says, read from its own module, so a sentence is pinned in one place. */
  async function theToolsWords(): Promise<Record<string, unknown>> {
    return await import('../tools/merge-tool/emergency-push.mjs') as Record<string, unknown>
  }
  /**
   * THE TOOL AS A CHILD PROCESS, in an environment built from nothing: none of this shell's MOLE_OFFICE_* values but the
   * made-up private copy's address, and MOLE_AGENT_KEY only when the case gives one. PATH carries this file's `git` and
   * `gh`, so nothing reaches GitHub.
   */
  function theCommand(args: string[], key: string | null): Promise<{ code: number | null; out: string }> {
    const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: folder, TMPDIR: tmpdir(), TZ: 'UTC', MOLE_OFFICE_DB: join(folder, 'no-office.db'), MOLE_OFFICE_PRIVATE_ORIGIN: THE_COPY, ...(key === null ? {} : { MOLE_AGENT_KEY: key }) }
    const child = spawn(process.execPath, ['tools/the-merger.mjs', ...args], { cwd: REPO, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    groups.add(child.pid!)
    let out = ''
    child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr!.on('data', (chunk: Buffer) => (out += chunk.toString()))
    return new Promise((resolve) => {
      child.on('close', (code) => {
        groups.delete(child.pid!)
        resolve({ code, out })
      })
    })
  }
  const theArguments = (commit: string, message: Pin, more: string[] = []) => [
    '--emergency-push', commit, '--root', root, '--message', `${message.id}:${message.contentHash}`, '--as', handles.get('secretary')!,
    '--session', runs.get('secretary')!, '--api', api, '--workspace', 'default', '--sandboxes', join(folder, 'sandboxes'), ...more,
  ]

  it('refuses without MOLE_AGENT_KEY, in the sentence the tool says in one place, and moves and writes nothing', async () => {
    const sentence = Reflect.get(await theToolsWords(), 'AN_EMERGENCY_PUSH_NEEDS_YOUR_KEY')
    expect(typeof sentence, 'tools/merge-tool/emergency-push.mjs says the sentence').toBe('string')
    const [main, copy, mirror] = [mainOf(), mainIn(remote), mainIn(mirrorOf())]
    const commit = aFix()
    const message = tellTheOwner(commit)
    const writes = totalWrites()
    const run = await theCommand(theArguments(commit, message), null)
    expect(run.code, run.out).toBe(1)
    expect(run.out).toContain(`EMERGENCY PUSH: ${String(sentence)}`)
    expect([mainOf(), mainIn(remote), mainIn(mirrorOf())]).toEqual([main, copy, mirror])
    expect(totalWrites()).toBe(writes)
  }, 60_000)

  it('moves main, pushes the commit on, and ends the record pushed with the line it names, when the switch is on and the key is set', async () => {
    const commit = aFix()
    const run = await theCommand(theArguments(commit, tellTheOwner(commit), ['--line', handles.get('line')!]), keys.get('secretary')!)
    expect(run.code, run.out).toBe(0)
    expect([mainOf(), mainIn(remote), mainIn(mirrorOf())]).toEqual([commit, commit, commit])
    const filed = (await theLane()).emergencyPushes.find((one: ObjectValue) => one.commit === commit)
    expect(filed).toMatchObject({ state: 'pushed', by: { kind: 'agent', id: ids.get('secretary') }, line: { kind: 'agent', id: ids.get('line') }, ended: { mainAfter: commit } })
    expect(run.out).toContain(`EMERGENCY PUSH: emergency push ${String(filed.id)} moved main in ${root} to ${commit}`)
  }, 120_000)
})

describe('a red follow-up goes back to the line the fix came from', () => {
  const PUSHED = 'tests/synthetic-pushed.test.ts'
  const ELSEWHERE = 'tests/synthetic-elsewhere.test.ts'
  /** The queue page as the person sees it, drawn from the office's own reply. */
  async function theQueuePage(): Promise<{ html: string; reply: ObjectValue; css: string }> {
    const reply = await ask('GET', `/api/merge-queue?state=${LIVE}`, undefined, ownerHeaders)
    expect(reply.status, reply.raw).toBe(200)
    const page = await import('../src/web/pages/MergeQueuePage.tsx')
    return { html: renderToStaticMarkup(h(page.TheMergeQueue, { reply: reply.body as MergeQueueReply, now: new Date() })), reply: reply.body, css: page.MERGE_QUEUE_CSS }
  }
  /** One push's row on the page. */
  function theRowOf(html: string, push: string): string {
    const at = html.indexOf(`data-push="${push}"`)
    expect(at, `the page draws push ${push}`).toBeGreaterThan(-1)
    return html.slice(at, html.indexOf('</li>', at))
  }

  it('keeps the line a push names, and refuses a line that is no registered agent, with nothing written', async () => {
    const { aPushNamesNoLine } = await words()
    expect(typeof aPushNamesNoLine, 'src/shared/emergency-push.ts says the refusal').toBe('function')
    const commit = aFix()
    const message = tellTheOwner(commit)
    const writes = totalWrites()
    const unknown = await aPush(commit, message, headers('secretary'), 'emergency-push-nobody')
    expect(unknown.status, unknown.raw).toBe(409)
    expect(unknown.body.error).toBe(aPushNamesNoLine('emergency-push-nobody'))
    expect(totalWrites()).toBe(writes)
    const taken = await aPush(commit, message, headers('secretary'), handles.get('line'))
    expect(taken.status, taken.raw).toBe(201)
    expect(taken.body.push.line).toEqual({ kind: 'agent', id: ids.get('line') })
    expect((await theEnd(taken.body.push.id, { says: 'Synthetic: stopped.', onward: null })).status).toBe(200)
  })

  it('hands a red follow-up in a file the push changed to the line first, then the secretary, in one problem and one message', async () => {
    const pushed = await aPushThatLanded({ path: PUSHED, line: handles.get('line') })
    const receipt = aRedReceipt(pushed.commit, [PUSHED, ELSEWHERE])
    // ONLY THE AGENT THAT FILED THE RECEIPT HANDS IT BACK, proved by its own key, as a red main suite is handed back.
    const writes = totalWrites()
    const secretary = await handBack(receipt, [PUSHED, ELSEWHERE], headers('secretary'))
    expect(secretary.status, secretary.raw).toBe(403)
    expect(secretary.body.error).toBe(sayInEnglish('mainSuiteTrace.caller'))
    expect(totalWrites()).toBe(writes)
    const before = Date.now()
    const handed = await handBack(receipt, [PUSHED, ELSEWHERE])
    const after = Date.now()
    expect(handed.status, handed.raw).toBe(200)
    // A FILE THE PUSH DID NOT CHANGE IS NOT THE PUSH'S: it is left where a red whole suite goes today.
    expect(handed.body.notThePushes).toEqual([ELSEWHERE])
    expect(handed.body.handedBack).toHaveLength(1)
    const [one] = handed.body.handedBack
    expect(one).toMatchObject({ push: pushed.id, filed: true, files: [PUSHED], unnamedFiles: [] })
    const problem = t.api.getRecord(one.problem)!
    expect(problem.kind).toBe('problem')
    expect((problem.data as ObjectValue).state).toBe('open')
    const facts = (problem.data as ObjectValue).extra.emergencyPushHandBack
    const hours = Number((await import('../src/config/settings.mjs')).settingValue('MOLE_OFFICE_HAND_BACK_HOURS'))
    expect(facts).toEqual({ push: pushed.id, receipt: reference(receipt), files: [PUSHED], line: { kind: 'agent', id: ids.get('line') },
      hours, deadline: expect.any(String), timeZone: 'UTC', dueAt: expect.any(String) })
    // THE DEADLINE IS AN ENTRY'S: MOLE_OFFICE_HAND_BACK_HOURS after the hand-back, read by the rule that reads an entry's.
    const due = whenAHandBackIsDue(facts)
    expect(due).not.toBeNull()
    expect(due!).toBeGreaterThanOrEqual(before + hours * 3_600_000)
    expect(due!).toBeLessThanOrEqual(after + hours * 3_600_000)
    const notices = theNoticesAbout(one.problem)
    expect(notices.map((notice) => notice.to)).toEqual([[{ kind: 'agent', id: ids.get('line') }, { kind: 'agent', id: ids.get('secretary') }]])
    expect(notices[0]!.aboutRun).toBeUndefined()
    // ASKED AGAIN, the office names the open problem, and nobody is told twice.
    const again = await handBack(receipt, [PUSHED, ELSEWHERE])
    expect(again.status, again.raw).toBe(200)
    expect(again.body.handedBack).toEqual([{ push: pushed.id, problem: one.problem, filed: false, files: [PUSHED], unnamedFiles: [] }])
    expect(theNoticesAbout(one.problem)).toHaveLength(1)
  })

  it('hands the red follow-up of a push the person made, naming no line, to the holder of the secretary card, and a green follow-up hands back nothing', async () => {
    const byThePerson = await aPushThatLanded({ path: PUSHED, as: ownerHeaders })
    const red = aRedReceipt(byThePerson.commit, [PUSHED])
    const handed = await handBack(red, [PUSHED])
    expect(handed.status, handed.raw).toBe(200)
    expect(handed.body).toMatchObject({ handedBack: [{ push: byThePerson.id, filed: true, files: [PUSHED] }], notThePushes: [] })
    expect(theNoticesAbout(handed.body.handedBack[0].problem).map((notice) => notice.to)).toEqual([[{ kind: 'agent', id: ids.get('secretary') }]])
    const green = await aPushThatLanded({ path: PUSHED, line: handles.get('line') })
    aReceipt(green.commit, true)
    const later = aRedReceipt(green.commit, [PUSHED])
    const after = await handBack(later, [PUSHED])
    expect(after.status, after.raw).toBe(200)
    expect(after.body).toMatchObject({ handedBack: [], notThePushes: [PUSHED] })
  })

  it('tells the line and the secretary once that a hand-back is overdue when its deadline passes, and never takes the push back', async () => {
    const pushed = await aPushThatLanded({ path: PUSHED, line: handles.get('line') })
    const handed = await handBack(aRedReceipt(pushed.commit, [PUSHED]), [PUSHED])
    expect(handed.status, handed.raw).toBe(200)
    const problem = handed.body.handedBack[0].problem as string
    const due = whenAHandBackIsDue((t.api.getRecord(problem)!.data as ObjectValue).extra.emergencyPushHandBack ?? {})
    expect(due, 'the hand-back keeps a deadline the rule for an entry reads').not.toBeNull()
    /** The message worker's list of hand-backs, as it reads it each pass. */
    async function theWorkersList(): Promise<ObjectValue> {
      const reply = await ask('GET', '/api/worker/merges', undefined, asTheWorker)
      expect(reply.status, reply.raw).toBe(200)
      return reply.body
    }
    const named = (list: { problem: string }[]) => list.map((one) => one.problem)
    // BEFORE THE DEADLINE nothing about the problem is listed.
    expect(named((await theWorkersList()).takeBacksForAPerson)).not.toContain(problem)
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    try {
      vi.setSystemTime(due! + 60_000)
      const late = await theWorkersList()
      expect(late.takeBacksForAPerson.find((one: { problem: string }) => one.problem === problem)?.says).toMatch(/overdue/)
      // NO TAKE-BACK: an emergency push is never listed for one, so the worker never asks the office for one.
      expect(named(late.takeBacksDue)).not.toContain(problem)
      const url = `/api/worker/merges/hand-backs/${problem}/a-person-must-look`
      const noted = await ask('POST', url, {}, asTheWorker)
      expect(noted.status, noted.raw).toBe(200)
      const extra = (t.api.getRecord(problem)!.data as ObjectValue).extra
      expect(extra.takeBack?.aPersonMustLook?.says).toMatch(/overdue/)
      expect(theNoticesAbout(problem, 'aPushHandBackIsOverdue').map((notice) => notice.to))
        .toEqual([[{ kind: 'agent', id: ids.get('line') }, { kind: 'agent', id: ids.get('secretary') }]])
      // ONCE AND ONLY ONCE: asked again, the office writes nothing, and the next pass no longer lists the problem.
      const writes = totalWrites()
      const again = await ask('POST', url, {}, asTheWorker)
      expect(again.status, again.raw).toBe(200)
      expect(totalWrites()).toBe(writes)
      expect(theNoticesAbout(problem, 'aPushHandBackIsOverdue')).toHaveLength(1)
      expect(named((await theWorkersList()).takeBacksForAPerson)).not.toContain(problem)
      expect((t.api.getRecord(problem)!.data as ObjectValue).state).toBe('open')
      const takeBacks = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'merge_entry' AND json_extract(data, '$.fixRound.problem') = ?").get(problem) as { n: number }
      expect(takeBacks.n).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells the build sheriff when the person pushed, named no line and nobody holds the card; with no sheriff it files, the next report reminder names it once, and the person is never written to', async () => {
    const { sendTheBroadcastRemindersThatAreDue } = await import('../src/server/lib/broadcast.ts')
    const toThePerson = () => (t.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM records, json_each(records.data, '$.to') AS one
      WHERE records.kind = 'message' AND json_extract(one.value, '$.kind') = 'person'`).get() as { n: number }).n
    const lastRow = () => (t.client.sqlite.prepare('SELECT MAX(rowid) AS n FROM records').get() as { n: number }).n
    /** The secretary's report reminders written after row `mark`, oldest first. */
    const reminders = (mark: number) => (t.client.sqlite.prepare(`SELECT data FROM records WHERE kind = 'message' AND rowid > ?
      AND json_extract(data, '$.to[0].id') = ? AND json_type(data, '$.extra.broadcastSlot') = 'text' ORDER BY rowid`).all(mark, ids.get('secretary')) as { data: string }[])
      .map((row) => JSON.parse(row.data) as ObjectValue)
    /** A push the person made with no line, landed while the card is held, and its red follow-up handed back while nobody holds it. */
    async function handedBackWithNoCard(path: string, sheriff: string | null): Promise<string> {
      const pushed = await aPushThatLanded({ path, as: ownerHeaders })
      const named = process.env.MOLE_OFFICE_BUILD_SHERIFF
      const card = t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?')
      card.run('worker', ids.get('secretary'))
      // NO SHERIFF is the setting left out: the office refuses a setting that is set and empty.
      if (sheriff === null) delete process.env.MOLE_OFFICE_BUILD_SHERIFF
      else process.env.MOLE_OFFICE_BUILD_SHERIFF = sheriff
      try {
        // THE PUSH ITSELF names a message to the person; the count starts after it.
        const before = toThePerson()
        const handed = await handBack(aRedReceipt(pushed.commit, [path]), [path])
        expect(handed.status, handed.raw).toBe(200)
        expect(handed.body.handedBack).toMatchObject([{ push: pushed.id, filed: true, files: [path] }])
        expect(toThePerson(), 'the hand-back writes nothing to the person').toBe(before)
        return handed.body.handedBack[0].problem as string
      } finally {
        card.run('secretary', ids.get('secretary'))
        if (named === undefined) delete process.env.MOLE_OFFICE_BUILD_SHERIFF
        else process.env.MOLE_OFFICE_BUILD_SHERIFF = named
      }
    }
    const told = await handedBackWithNoCard(PUSHED, handles.get('stranger')!)
    expect(theNoticesAbout(told).map((notice) => notice.to)).toEqual([[{ kind: 'agent', id: ids.get('stranger') }]])
    // WITH NO SHERIFF EITHER, the problem is filed and nobody is told now.
    const untold = await handedBackWithNoCard(ELSEWHERE, null)
    expect((t.api.getRecord(untold)!.data as ObjectValue).state).toBe('open')
    expect(theNoticesAbout(untold)).toEqual([])
    // THE REMINDER BEFORE THE SECRETARY'S NEXT REPORT names it once, and the one after does not name it again.
    const day = new Date()
    const at = (hours: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, hours, 31)
    let mark = lastRow()
    const before = toThePerson()
    sendTheBroadcastRemindersThatAreDue('default', at(6))
    const [morning] = reminders(mark)
    expect(morning, 'the reminder before the 07:00 report').toBeDefined()
    expect(String(morning!.saidInFull ?? '').split(untold)).toHaveLength(2)
    expect(String(morning!.saidInFull ?? '')).not.toContain(told)
    mark = lastRow()
    sendTheBroadcastRemindersThatAreDue('default', at(17))
    const [evening] = reminders(mark)
    expect(evening, 'the reminder before the 18:00 report').toBeDefined()
    expect(String(evening!.saidInFull ?? '')).not.toContain(untold)
    expect(toThePerson(), 'the reminders write nothing to the person').toBe(before)
  })

  it('lists each emergency push in a landed-between range, with the files it changed, and no push outside the range', async () => {
    // THE PAGE READS ONLY A REPOSITORY THE QUEUE KNOWS: one ended entry of the main checkout makes it known.
    theEntryEnds(anEntry('testing'))
    const from = mainOf()
    const first = await aPushThatLanded({ path: PUSHED })
    const second = await aPushThatLanded({ path: ELSEWHERE })
    const between = (a: string, b: string) => ask('GET', `/api/merge-queue/landed-between?repository=${encodeURIComponent(root)}&from=${a}&to=${b}`, undefined, headers('stranger'))
    const both = await between(from, second.commit)
    expect(both.status, both.raw).toBe(200)
    expect(both.body.pushes).toEqual([
      { id: first.id, mainBefore: from, commit: first.commit, files: [PUSHED] },
      { id: second.id, mainBefore: first.commit, commit: second.commit, files: [ELSEWHERE] },
    ])
    const onlyTheSecond = await between(first.commit, second.commit)
    expect(onlyTheSecond.status, onlyTheSecond.raw).toBe(200)
    expect(onlyTheSecond.body.pushes).toEqual([{ id: second.id, mainBefore: first.commit, commit: second.commit, files: [ELSEWHERE] }])
  })

  it('marks a red follow-up on the queue page, so it stands out from the lines around it', async () => {
    const pushed = await aPushThatLanded({ path: PUSHED })
    aRedReceipt(pushed.commit, [PUSHED])
    const { html, css } = await theQueuePage()
    const row = theRowOf(html, pushed.id)
    expect(row.split('data-follow-up="red"')).toHaveLength(2)
    expect(row).toMatch(/<p class="mq-why mq-follow-red" data-follow-up="red">/)
    expect(css).toMatch(/\.mq-follow-red \{[^}]*color: var\(--st-failed\);[^}]*border-left: [^;}]*var\(--st-failed-line\)/)
  })

  it("marks a red follow-up on the push's own page as the queue page does, and both lead to its receipt without writing its id", async () => {
    const pushed = await aPushThatLanded({ path: PUSHED })
    const receipt = aRedReceipt(pushed.commit, [PUSHED])
    const read = await ask('GET', `/api/merge-queue/emergency-pushes/${pushed.id}`, undefined, ownerHeaders)
    expect(read.status, read.raw).toBe(200)
    // THE PART BOTH PAGES DRAW A PUSH WITH, imported by a name tsc does not resolve, since it is written after this case.
    const where = '../src/web/components/MergeQueuePush.tsx'
    const part = (await import(where)) as Record<string, any>
    const facts = renderToStaticMarkup(h(part.ThePushFacts, { push: read.body.push, now: new Date(), inspect: false, sections: () => ({ surface: null }) }))
    const at = facts.indexOf('data-push-fact="followUp"')
    expect(at, "the push's page draws its follow-up").toBeGreaterThan(-1)
    const { html } = await theQueuePage()
    const said = `${sayInEnglish('mergeQueuePage.push.followUp.red')} ${sayInEnglish('mergeQueuePage.push.followUp.receipt' as WordKey)}`
    for (const [page, row] of [['record', facts.slice(at, facts.indexOf('</div>', at))], ['queue', theRowOf(html, pushed.id)]] as const) {
      expect(row.split('data-follow-up="red"'), page).toHaveLength(2)
      const mark = row.indexOf('data-follow-up="red"')
      const red = row.slice(row.lastIndexOf('<p', mark), row.indexOf('</p>', mark) + 4)
      expect(red, page).toMatch(/^<p class="[^"]*\bmq-follow-red" data-follow-up="red">/)
      expect(red, page).toContain(`href="#/r/${receipt}"`)
      expect(red.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), page).toBe(said)
    }
  })

  it('says how many pushes a lane holds when it holds only pushes, and not that it is empty', async () => {
    const { html, reply } = await theQueuePage()
    const pushes = (reply.emergencyPushes as ObjectValue[]).filter((one) => one.root === root).length
    expect(pushes).toBeGreaterThan(0)
    expect(html).toContain(`data-lane="${root}"`)
    expect(html).not.toContain(sayInEnglish('mergeQueuePage.lane.count', { n: 0 }))
    expect(html).toContain(sayInEnglish('mergeQueuePage.lane.onlyPushes' as WordKey, { n: pushes }))
  })
})
