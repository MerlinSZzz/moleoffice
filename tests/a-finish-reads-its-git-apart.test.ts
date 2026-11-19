// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE THAT FINISHES A RUN READS ITS GIT ON THE SEAL-READ THREAD, and seals what the request thread would have sealed
 * (item 2o of the requirement list, the finish; src/server/lib/a-finish-reads-git-apart.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. No git of a PATCH that finishes a run, of a POST that files a run already finished, or of the reminder before the
 *      seal runs on the server's thread: every git is held until another request was answered. The seal stored is the
 *      one the synchronous read makes of the same tree, byte for byte, and the reminder's items are the ones the
 *      synchronous facts give.
 *      A PATCH that seals a run also starts the read of the landings below the sealed commit, and the server does not
 *      wait for it (`theOfficeDecidesAtTheSeal`, src/server/lib/merge-queue-at-the-seal.ts). That read starts, and its
 *      git too is held until another request was answered, though it may start waiting only after the reply.
 *   2. Which read is the seal's is said by the finish's log line, whatever order the gits run in: a read for the seal
 *      comes only after a pass that reached the seal.
 *   3. The guards keep their order. A caller the run's end refuses has no git read. A caller refused over a migration
 *      item, or by who may change the run, had only the gate's read, never the seal's, and the run is as it was.
 *   4. A run filed finished across a second keeps its reading when the run's first own commit is the same, and reads
 *      again when it is not, then seals what the synchronous read seals.
 *   5. A tree that changed during a read is read again: a moved HEAD is sealed as it is now, and an edit is refused as
 *      the synchronous read refuses it. A reading older than the bound when its pass starts is read again too, so an edit
 *      made after the thread's last check, while the server was held, is refused rather than sealed over. A HEAD moved, or
 *      an index changed, after the thread's last check and before the pass, well within the bound, is read again too:
 *      the new HEAD is sealed, and the staged change is refused as the synchronous read refuses it.
 *   6. A write that cannot get a usable reading in four reads is refused with 409, a busy office's and a changing tree's,
 *      in the write and in the reminder, and nothing of it is stored: no record, no revision, no count, no message.
 *   7. A thread that ends during the read is a 503 with nothing written, for a PATCH and for a POST.
 *   8. Each effect of the write happens once: a held draft is sent once, one seal is filed, and each gate counted at off
 *      is counted once, though the write ran three passes. A run changed during the reminder's read is refused, with no
 *      reminder and no count.
 *
 * Every repository and the office are made here in the system's temporary folder, and every key is made up. The bare
 * migration prefix is built at runtime, so no literal in this file reads as one.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { FINISHED_STATES } from '../src/config/finished.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { STILL_GOING_STATES } from '../src/config/still-going.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { momentOfAStoredStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { aGitThatWaits, aRepository, AS_THE_PERSON, asAgent, git, theOfficesCheckers, type AGitThatWaits, type AHeldGit } from './a-seal-read-fixture.ts'
import { freshDb, type TestDb } from './helpers.ts'

const OFFICE_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-finisher-under-test'
const STRANGER = 'a-stranger-to-the-run'
const A_MIGRATION_PREFIX = ['02', '16_'].join('')
const THE_BARE_MIGRATION_FILE = 'tests/made-up-migration.test.ts'
const AS_THE_OFFICE_WORKER = { ...asAgent('mole-office/the-message-worker'), 'x-mole-office-key': OFFICE_KEY }

let t: TestDb
let app: FastifyInstance
let held: AGitThatWaits
let scratch = ''
let note = ''
let trees = 0
const lines: Record<string, unknown>[] = []
let seal: typeof import('../src/server/lib/sealed-tip.ts')
let beforeTheSeal: typeof import('../src/server/lib/before-the-seal.ts')
let apart: typeof import('../src/server/lib/the-seal-read-apart.ts')
let records: typeof import('../src/server/lib/records.ts')
let bound = 0
let mostReads = 0
/** The word a run says its work is finished with (src/config/finished.mjs). */
const FINISHED = FINISHED_STATES[0]
/** A state in which a run is still going (src/config/still-going.mjs). */
const RUNNING = STILL_GOING_STATES[0]

/**
 * HOW LONG `drive` GOES ON AFTER THE REPLY OF A WRITE THAT SEALS, in milliseconds, for the git of the read of the landings
 * the seal started. That git is started inside the write and says it waits a few milliseconds later. Twenty seconds is
 * the fixture's own wait for a held git (`reached` in tests/a-seal-read-fixture.ts).
 */
const THE_LANDINGS_READ_IS_HELD_WITHIN_MS = 20_000

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mo-finish-apart-'))
  held = aGitThatWaits(scratch)
  t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: OFFICE_KEY, providers: {} })}\n`, { mode: 0o600 })
  const { buildApp } = await import('../src/server/index.ts')
  let waiting = ''
  const log = {
    write(msg: string) {
      waiting += msg
      for (let end = waiting.indexOf('\n'); end !== -1; end = waiting.indexOf('\n')) {
        const one = waiting.slice(0, end)
        waiting = waiting.slice(end + 1)
        if (one.trim() !== '') lines.push(JSON.parse(one) as Record<string, unknown>)
      }
    },
  }
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: log })).app
  await app.ready()
  seal = await import('../src/server/lib/sealed-tip.ts')
  beforeTheSeal = await import('../src/server/lib/before-the-seal.ts')
  apart = await import('../src/server/lib/the-seal-read-apart.ts')
  records = await import('../src/server/lib/records.ts')
  ;({ THE_MOST_A_READING_IS_USED_AFTER_ITS_CHECK_MS: bound, THE_MOST_READS: mostReads } = await import('../src/server/lib/a-finish-reads-git-apart.ts'))
  await theOfficesCheckers(app)
  for (const handle of [HANDLE, STRANGER]) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
    expect(r.statusCode, r.body).toBe(201)
  }
  note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note the other request reads', data: { body: 'Made up.' }, actor: { type: 'human', id: THE_PERSON } }).id
}, 60_000)

afterEach(() => {
  held.stopHolding()
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name IN (?, ?, ?)').run(...['who-ends-a-run', 'before-the-seal', 'writes-from-a-stale-copy'].map((id) => String(gateNamed(id)?.setting)))
})

afterAll(async () => {
  held?.stopHolding()
  await app?.close()
  t?.close()
  held?.remove()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

// ================================================================================================== the trees

/** A repository at its first commit on main, with the branch `worker` checked out and git told to ignore `*.ignored`. */
function aTree(): string {
  trees += 1
  const dir = aRepository(join(scratch, `tree-${String(trees)}`))
  git(dir, 'switch', '-qc', 'worker')
  return dir
}

/**
 * Commit B on the worker branch: a file in the work area, the ignore rule, and with `migration` a test naming a migration
 * by its bare prefix. `at` dates it to that whole second.
 */
function commitB(dir: string, options: { migration?: boolean; at?: number } = {}): string {
  writeFileSync(join(dir, 'work', 'b.txt'), 'b\n')
  writeFileSync(join(dir, '.gitignore'), '*.ignored\n')
  if (options.migration === true) {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, THE_BARE_MIGRATION_FILE), `const before = migrationsBefore('${A_MIGRATION_PREFIX}')\n`)
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'B', ...(options.at === undefined ? [] : ['--date', `@${String(options.at)} +0000`]))
  return git(dir, 'rev-parse', 'HEAD')
}

/** The seal the request thread would make of `dir` now, as stored. */
function theSynchronousSealOf(dir: string): string {
  return JSON.stringify(seal.theGitOfASeal(dir, null, 'main', ['work']))
}

/** The refusal the request thread's seal of `dir` gives now. */
function theSynchronousRefusalOf(dir: string): string {
  try {
    seal.theGitOfASeal(dir, null, 'main', ['work'])
  } catch (err) {
    expect(err).toBeInstanceOf(records.PanelError)
    return (err as Error).message
  }
  throw new Error(`The synchronous seal of ${dir} did not refuse, so there is nothing to compare the refusal with.`)
}

// ================================================================================================== the runs

/** A running run of HANDLE's in `dir`, filed by the agent itself, so it has no key and no reminder is given. */
async function aRunWithoutAKey(dir: string): Promise<string> {
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(HANDLE), payload: { kind: 'session', title: 'A run to finish', data: { state: RUNNING, servingAgent: HANDLE, doing: 'the work under test', workingDirectory: dir, cutFrom: 'main' } } })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

/** A running run filed by the office worker, as the launcher files one, with the key it mints and the run's own headers. */
async function aRunWithItsKey(dir: string): Promise<{ id: string; headers: Record<string, string> }> {
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OFFICE_WORKER, payload: { kind: 'session', title: 'A keyed run to finish', data: { state: RUNNING, runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'the work under test', workingDirectory: dir, cutFrom: 'main', tip: git(dir, 'rev-parse', 'HEAD') } } })
  expect(filed.statusCode, filed.body).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted no key, so the reminder would never be given').toMatch(/^[0-9a-f]{64}$/)
  return { id: body.record.id, headers: { ...asAgent(HANDLE), 'x-mole-office-session': body.record.id, 'x-mole-office-key': key } }
}

const finish = (id: string, headers: Record<string, string>, dataPatch: Record<string, unknown> = { state: FINISHED }, more: Record<string, unknown> = { remindBeforeTheSeal: false }) =>
  app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch, ...more } })

const fileFinished = (dir: string) =>
  app.inject({ method: 'POST', url: '/api/records', headers: asAgent(HANDLE), payload: { kind: 'session', title: 'A run filed finished', data: { state: FINISHED, servingAgent: HANDLE, doing: 'the work under test', workingDirectory: dir, cutFrom: 'main' } } })

function atPosition(gate: string, position: string): void {
  t.client.sqlite.prepare('INSERT OR REPLACE INTO runtime_settings (name, value) VALUES (?, ?)').run(String(gateNamed(gate)?.setting), position)
}

// ================================================================================================== what was written

/** The tables the server adds to for every request it answers, a refused one too: they measure calls and hold no work. */
const EVERY_REQUEST_IS_MEASURED_IN = ['api_calls', 'header_only_calls']

/**
 * Every table's row count, every gate count and every run's row: what a write that stored nothing leaves as it was. The
 * gates `except` names are left out, for a refusal counted by its gate, and so are the tables every request is measured
 * in.
 */
function everythingStored(except: string[] = []): string {
  const sqlite = t.client.sqlite
  const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map(({ name }) => name)
    .filter((name) => !EVERY_REQUEST_IS_MEASURED_IN.includes(name) && name !== 'gate_counts')
  const gates = (sqlite.prepare('SELECT * FROM gate_counts ORDER BY gate, day').all() as { gate: string }[]).filter((one) => !except.includes(one.gate))
  return JSON.stringify({
    rows: Object.fromEntries(tables.map((name) => [name, (sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n])),
    gates,
    runs: sqlite.prepare("SELECT id, data, updated_at FROM records WHERE kind = 'session' ORDER BY id").all(),
  })
}

/** How often `gate` was met today, all positions together. */
function metCount(gate: string): number {
  const row = t.client.sqlite.prepare('SELECT sum(would_stop) AS n FROM gate_counts WHERE gate = ?').get(gate) as { n: number | null }
  return row.n ?? 0
}

/** How many seals name `run`. A seal record holds the seal under `data.seal`, and the seal names its run. */
function theSealsOf(run: string): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip' AND json_extract(data, '$.seal.run') = ?").get(run) as { n: number }).n
}

function theRun(id: string): { data: Record<string, unknown>; createdAt: string } {
  const run = t.api.getRecord(id)
  if (run === null) throw new Error(`Run ${id} is not stored.`)
  return run as unknown as { data: Record<string, unknown>; createdAt: string }
}

// ================================================================================================== the log line

/** The finish's one log line written since `mark`, the number of lines there were then. */
function theFinishLineSince(mark: number): string {
  const found = lines.slice(mark).filter((one) => 'finishParts' in one).map((one) => String(one['msg']))
  expect(found, 'one finishing write logs one line of its parts').toHaveLength(1)
  return found[0] ?? ''
}

/** Each git read the line names, as [facts, seals] asked of it. */
function theReadsIn(line: string): [number, number][] {
  return [...line.matchAll(/the git read apart after pass \d+, for (\d+) of the facts and (\d+) of the seal/g)].map((one) => [Number(one[1]), Number(one[2])])
}

// ================================================================================================== the held gits

interface Driven<T> {
  reply: T
  /** For each held git, the other request's status, and whether that git was still held when it was answered. */
  others: { status: number; stillHeld: boolean }[]
  all: AHeldGit[]
}

/**
 * SEND `request` WITH EVERY GIT WHOSE ARGUMENTS HOLD `word` HELD, and let each go once `meanwhile` is done with it. By
 * default another request is answered while it is held. Each git held on the server's own thread holds this loop too,
 * so it goes on by itself after three seconds and is marked `alone`.
 *
 * Given `sealed`, the run the request seals, this goes on after the reply as well, until a git of the read of the
 * landings below the sealed commit (`theLandingsReadAmong`) has been held and let go, or for
 * THE_LANDINGS_READ_IS_HELD_WITHIN_MS after the reply. The seal starts that read and the server does not wait for it,
 * so its git may start waiting only after the reply has gone.
 */
async function drive<T>(request: () => Promise<T>, word: string, meanwhile?: (one: AHeldGit, index: number) => Promise<void> | void, sealed?: string): Promise<Driven<T>> {
  held.holdEach(word)
  let settled = false
  let settledAt = 0
  const sent = request().then((reply) => {
    settled = true
    settledAt = Date.now()
    return reply
  })
  const others: Driven<T>['others'] = []
  const seen = new Set<string>()
  const letGo: AHeldGit[] = []
  const waitsForTheLandings = (): boolean =>
    sealed !== undefined && theLandingsReadAmong(letGo, sealed).length === 0 && Date.now() - settledAt < THE_LANDINGS_READ_IS_HELD_WITHIN_MS
  while (!settled || waitsForTheLandings()) {
    for (const one of held.heldNow()) {
      if (seen.has(one.id)) continue
      seen.add(one.id)
      if (meanwhile === undefined) {
        const other = await app.inject({ method: 'GET', url: `/api/records/${note}`, headers: AS_THE_PERSON })
        others.push({ status: other.statusCode, stillHeld: held.stillHeld(one) })
        held.letGoOf(one)
      } else await meanwhile(one, seen.size - 1)
      letGo.push(one)
    }
    await new Promise((done) => setTimeout(done, 5))
  }
  return { reply: await sent, others, all: held.stopHolding() }
}

/** Hold the server's thread, and this test's, for `ms`. */
function holdTheServer(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function expectEveryGitOffTheServersThread(d: Driven<unknown>): void {
  expect(d.all.length, 'the finish ran no git, so this case proves nothing').toBeGreaterThan(0)
  expect(d.all.filter((one) => one.alone).map((one) => one.args.slice(0, 4).join(' ')), 'gits that ran on the server thread').toEqual([])
  expect(d.others).toHaveLength(d.all.length)
  expect(d.others.every((one) => one.status === 200 && one.stillHeld), JSON.stringify(d.others)).toBe(true)
}

const walks = (d: Driven<unknown>): number => d.all.filter((one) => one.args.includes('--others')).length

/**
 * THE GITS OF THE READ OF THE LANDINGS BELOW `run`'S SEALED COMMIT, among `gits`: the read the seal starts
 * (`theOfficeDecidesAtTheSeal`, src/server/lib/merge-queue-at-the-seal.ts). It runs in the seal's repository and reads
 * from the sealed commit, so its arguments hold both, as the stored seal names them.
 */
function theLandingsReadAmong(gits: AHeldGit[], run: string): AHeldGit[] {
  const git = seal.readRunSeal(run)?.seal.git
  if (git == null) return []
  return gits.filter((one) => one.args.includes(git.repository) && one.args.includes(git.commit))
}

// ================================================================================================== 1 and 2

it('reads every git of a PATCH that finishes a run off the server thread, and seals what the synchronous read seals', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(HANDLE)), '', undefined, id)
  expect(d.reply.statusCode, d.reply.body).toBe(200)
  expectEveryGitOffTheServersThread(d)
  expect(theLandingsReadAmong(d.all, id).length, 'the seal started no read of its landings, or this case never held its git').toBeGreaterThan(0)
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1]])
  expect(walks(d), 'one walk of the tree for each read').toBe(2)
  expect(JSON.stringify(seal.readRunSeal(id)?.seal.git)).toBe(theSynchronousSealOf(dir))
}, 120_000)

it('reads every git of a POST that files a run already finished off the server thread, and seals the same', async () => {
  const dir = aTree()
  commitB(dir, { at: Math.floor(Date.now() / 1000) - 3600 })
  const mark = lines.length
  const d = await drive(() => fileFinished(dir), '')
  expect(d.reply.statusCode, d.reply.body).toBe(201)
  expectEveryGitOffTheServersThread(d)
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1]])
  const id = (d.reply.json() as { record: { id: string } }).record.id
  expect(JSON.stringify(seal.readRunSeal(id)?.seal.git)).toBe(theSynchronousSealOf(dir))
}, 120_000)

it('reads the reminder before the seal off the server thread and gives the synchronous items, and the gate\'s read too', async () => {
  const dir = aTree()
  const { id, headers } = await aRunWithItsKey(dir)
  commitB(dir, { migration: true })
  // THE SYNCHRONOUS ITEMS, of the run as the write would store it, read on this thread before the write.
  const before = t.api.getRecord(id)
  if (before === null) throw new Error(`Run ${id} is not stored.`)
  const dataPatch = { state: FINISHED, submission: { kind: 'git' } }
  const judged = { ...before, data: { ...before.data, ...dataPatch } }
  const expected = beforeTheSeal.whatAnInspectorWouldMostLikelyRefuse(await beforeTheSeal.theFactsBeforeTheSealWithTheCopiedWordsOf(judged, { tip: null }))
  expect(expected.items.length, 'the migration item gives the reminder something to say').toBeGreaterThan(0)
  const mark = lines.length
  const first = await drive(() => finish(id, headers, dataPatch, {}), '')
  expect(first.reply.statusCode, first.reply.body).toBe(200)
  expectEveryGitOffTheServersThread(first)
  const reminded = (first.reply.json() as { beforeTheSeal?: { sealed: boolean; items: unknown[]; notChecked: string[] } }).beforeTheSeal
  expect(reminded?.sealed).toBe(false)
  expect(JSON.stringify({ items: reminded?.items, notChecked: reminded?.notChecked })).toBe(JSON.stringify(expected))
  const line = theFinishLineSince(mark)
  expect(line).toContain('the reminder before the seal ')
  expect(theReadsIn(line), 'the reminder writes nothing of the patch, so no pass ran').toEqual([])
  expect(theRun(id).data['state']).toBe(RUNNING)
  // THE NEXT WRITE IS NOT REMINDED AGAIN, and the gate refuses it over the item with its own read, off the thread too.
  const again = lines.length
  const second = await drive(() => finish(id, headers, dataPatch, {}), '')
  expect(second.reply.statusCode, second.reply.body).toBe(409)
  expect(second.reply.body).toContain('still finds a migration item')
  expectEveryGitOffTheServersThread(second)
  const refused = theFinishLineSince(again)
  expect(refused).not.toContain('the reminder before the seal ')
  expect(theReadsIn(refused), refused).toEqual([[1, 0]])
  expect(theRun(id).data['state']).toBe(RUNNING)
}, 180_000)

it('seals a keyed run with its git after the reminder, and what the seal found is the write\'s own reading', async () => {
  const dir = aTree()
  const { id, headers } = await aRunWithItsKey(dir)
  await aReportInForm(t, id, HANDLE)
  commitB(dir)
  const dataPatch = { state: FINISHED, submission: { kind: 'git' } }
  const first = await finish(id, headers, dataPatch, {})
  expect(first.statusCode, first.body).toBe(200)
  expect((first.json() as { beforeTheSeal?: unknown }).beforeTheSeal, 'a keyed run is reminded first').toBeDefined()
  const mark = lines.length
  const d = await drive(() => finish(id, headers, dataPatch, {}), '', undefined, id)
  expect(d.reply.statusCode, d.reply.body).toBe(200)
  expectEveryGitOffTheServersThread(d)
  expect(theLandingsReadAmong(d.all, id).length, 'the seal started no read of its landings, or this case never held its git').toBeGreaterThan(0)
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1]])
  expect(line, 'the seal\'s own reading answers what the seal found, so it is not read a third time').not.toContain('what the seal found')
  expect(JSON.stringify(seal.readRunSeal(id)?.seal.git)).toBe(theSynchronousSealOf(dir))
}, 180_000)

// ================================================================================================== 3

it('reads no git for a caller that may not end the run', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir, { migration: true })
  const stored = everythingStored(['who-ends-a-run'])
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(STRANGER)), '--others', (one) => held.letGoOf(one))
  expect(d.reply.statusCode, d.reply.body).toBe(403)
  expect(d.reply.body).toContain(JSON.stringify(records.WHO_MAY_END_A_RUN).slice(1, -1))
  expect(walks(d), 'no walk of the tree for a refused caller').toBe(0)
  expect(theReadsIn(theFinishLineSince(mark))).toEqual([])
  expect(theRun(id).data['state']).toBe(RUNNING)
  expect(everythingStored(['who-ends-a-run']), 'only the gate\'s own count may change').toBe(stored)
}, 60_000)

it('refuses over a migration item before asking who may change the run, with the gate\'s read alone', async () => {
  atPosition('who-ends-a-run', 'off')
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir, { migration: true })
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(STRANGER), { state: FINISHED, doing: 'a stranger\'s words' }), '--others', (one) => held.letGoOf(one))
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect(d.reply.body).toContain('This run cannot seal: the check the reminder before the seal uses still finds a migration item')
  expect(theReadsIn(theFinishLineSince(mark)), 'the gate read once, and the seal never').toEqual([[1, 0]])
  expect(walks(d)).toBe(1)
  expect(theRun(id).data['state']).toBe(RUNNING)
  expect(theRun(id).data['doing']).toBe('the work under test')
  expect(theSealsOf(id)).toBe(0)
}, 60_000)

it('never asks for the seal\'s git of a caller who may not change the run, after the gate\'s own read', async () => {
  atPosition('who-ends-a-run', 'off')
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const met = metCount('who-ends-a-run')
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(STRANGER), { state: FINISHED, doing: 'a stranger\'s words' }), '--others', (one) => held.letGoOf(one))
  expect(d.reply.statusCode, d.reply.body).toBe(403)
  expect(d.reply.body).toContain(JSON.stringify(records.WHO_MAY_CHANGE_A_RUN).slice(1, -1))
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0]])
  expect(walks(d)).toBe(1)
  expect(theRun(id).data['state']).toBe(RUNNING)
  expect(theRun(id).data['sealedTip']).toBeUndefined()
  expect(theSealsOf(id)).toBe(0)
  expect(metCount('who-ends-a-run') - met, 'the run\'s end met once, though the write ran twice').toBe(1)
}, 60_000)

it('refuses a submission of no kind with the seal\'s own 409, and never reads the seal\'s git for it', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const mark = lines.length
  const kind = 'a kind there is not'
  const d = await drive(() => finish(id, asAgent(HANDLE), { state: FINISHED, submission: { kind } }), '--others', (one) => held.letGoOf(one))
  // THE SEAL'S OWN REFUSAL, made before it captures anything, as at the base: `sealFinishedRun` says so with a 409.
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect((d.reply.json() as { error: string }).error).toBe(seal.whyASubmissionKindIsRefused(kind))
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line).every(([, ofTheSeal]) => ofTheSeal === 0), line).toBe(true)
  expect(theRun(id).data['state']).toBe(RUNNING)
  expect(theSealsOf(id)).toBe(0)
}, 60_000)

// ================================================================================================== 4

/** Wait until the whole second after the one `at` fell in has begun, and a little more. */
async function untilTheNextSecondAfter(at: number): Promise<void> {
  const next = (Math.floor(at / 1000) + 1) * 1000 + 50
  while (Date.now() < next) await new Promise((done) => setTimeout(done, 10))
}

it('keeps its reading when a run filed finished crosses a second and its first own commit is the same', async () => {
  const dir = aTree()
  commitB(dir, { at: Math.floor(Date.now() / 1000) - 3600 })
  let first = 0
  const mark = lines.length
  const d = await drive(() => fileFinished(dir), '--others', async (one, index) => {
    if (index === 0) {
      first = one.at
      await untilTheNextSecondAfter(one.at)
    }
    held.letGoOf(one)
  })
  expect(d.reply.statusCode, d.reply.body).toBe(201)
  const id = (d.reply.json() as { record: { id: string } }).record.id
  const filedAt = momentOfAStoredStamp(theRun(id).createdAt, null) ?? 0
  expect(Math.floor(filedAt / 1000), 'the run was filed in a later second than the first pass ran in').toBeGreaterThan(Math.floor(first / 1000))
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1]])
  expect(JSON.stringify(seal.readRunSeal(id)?.seal.git)).toBe(theSynchronousSealOf(dir))
}, 60_000)

it('reads again when a run filed finished crosses a second and its first own commit changes, then seals the same', async () => {
  const dir = aTree()
  // B IS WRITTEN IN THE SECOND THE FIRST PASS FILES THE RUN IN, so it is the run's own then, and not a second later.
  await untilTheNextSecondAfter(Date.now())
  const second = Math.floor(Date.now() / 1000)
  commitB(dir, { at: second })
  let first = 0
  const mark = lines.length
  const d = await drive(() => fileFinished(dir), '--others', async (one, index) => {
    if (index === 0) {
      first = one.at
      await untilTheNextSecondAfter(one.at)
    }
    held.letGoOf(one)
  })
  expect(Math.floor(first / 1000), 'the first pass ran in the second B is dated to; the machine was too slow to tell').toBe(second)
  expect(d.reply.statusCode, d.reply.body).toBe(201)
  const id = (d.reply.json() as { record: { id: string } }).record.id
  expect(Math.floor((momentOfAStoredStamp(theRun(id).createdAt, null) ?? 0) / 1000)).toBeGreaterThan(second)
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [2, 0], [0, 1]])
  expect(JSON.stringify(seal.readRunSeal(id)?.seal.git)).toBe(theSynchronousSealOf(dir))
}, 60_000)

// ================================================================================================== 5

it('reads again when HEAD moves during the seal\'s read, and seals the new HEAD', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(HANDLE)), '--others', (one, index) => {
    if (index === 1) {
      writeFileSync(join(dir, 'work', 'c.txt'), 'c\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-qm', 'C')
    }
    held.letGoOf(one)
  })
  expect(d.reply.statusCode, d.reply.body).toBe(200)
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1], [1, 1]])
  expect(seal.readRunSeal(id)?.seal.git?.commit).toBe(git(dir, 'rev-parse', 'HEAD'))
  expect(JSON.stringify(seal.readRunSeal(id)?.seal.git)).toBe(theSynchronousSealOf(dir))
}, 60_000)

it('refuses an edit made during the seal\'s read as the synchronous read refuses it', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(HANDLE)), '--others', (one, index) => {
    if (index === 1) writeFileSync(join(dir, 'work', 'b.txt'), 'b, edited and not staged\n')
    held.letGoOf(one)
  })
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect((d.reply.json() as { error: string }).error).toBe(theSynchronousRefusalOf(dir))
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1], [1, 1]])
  expect(theRun(id).data['state']).toBe(RUNNING)
  expect(theSealsOf(id)).toBe(0)
}, 60_000)

it('reads again when its reading is older than the bound, so an edit after the last check is refused, not sealed over', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(HANDLE)), '--others', (one, index) => {
    held.letGoOf(one)
    if (index === 1) {
      // THE THREAD ENDS ITS READ AND ITS CHECK WHILE THE SERVER IS HELD, and the edit comes after both.
      holdTheServer(2000)
      writeFileSync(join(dir, 'work', 'b.txt'), 'b, edited after the check\n')
      holdTheServer(bound + 100)
    }
  })
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect((d.reply.json() as { error: string }).error).toBe(theSynchronousRefusalOf(dir))
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1], [1, 1]])
  expect(theSealsOf(id)).toBe(0)
}, 60_000)

/**
 * FINISH `id`, AND MAKE `change` WHEN THE THREAD'S ANSWER TO THE SEAL'S READ REACHES THE SERVER, after the thread's last
 * check and before the pass that would use the answer. The answer comes as the thread's 'message' event, and the pass
 * waits on a promise that event resolves, so what runs inside the event runs before the pass. Says how many ms after the
 * thread's last check the change was made.
 */
async function finishWithAChangeOnTheSealsAnswer(id: string, change: () => void): Promise<{ reply: Awaited<ReturnType<typeof finish>>; late: number }> {
  const emit = Worker.prototype.emit
  let late = -1
  let failed: unknown = null
  Worker.prototype.emit = function (this: Worker, event: string | symbol, ...args: unknown[]): boolean {
    const answered = emit.call(this, event, ...args)
    const reading = event === 'message' ? (args[0] as { outcome?: { finished?: { seals: unknown[]; checkedAt: number } } }).outcome?.finished : undefined
    if (late === -1 && reading !== undefined && reading.seals.length > 0) {
      try {
        change()
      } catch (err) {
        failed = err
      }
      late = performance.timeOrigin + performance.now() - reading.checkedAt
    }
    return answered
  }
  try {
    const reply = await finish(id, asAgent(HANDLE))
    if (failed !== null) throw failed
    expect(late, 'no answer of the thread held the seal, so nothing was changed').toBeGreaterThanOrEqual(0)
    expect(late, 'the change came after the bound, so the age of the reading alone could make the read again; the machine was too slow to tell').toBeLessThan(bound)
    return { reply, late }
  } finally {
    Worker.prototype.emit = emit
  }
}

it('reads again when HEAD moves after the thread\'s last check and before the pass, and seals the new HEAD', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  // C HAS B'S TREE, so the tree stays as it is and only HEAD moves.
  const c = git(dir, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'C')
  const mark = lines.length
  const { reply } = await finishWithAChangeOnTheSealsAnswer(id, () => git(dir, 'update-ref', 'refs/heads/worker', c))
  expect(reply.statusCode, reply.body).toBe(200)
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1], [1, 1]])
  expect(seal.readRunSeal(id)?.seal.git?.commit).toBe(c)
  expect(JSON.stringify(seal.readRunSeal(id)?.seal.git)).toBe(theSynchronousSealOf(dir))
}, 60_000)

it('reads again when a change is staged after the thread\'s last check and before the pass, and refuses as the synchronous read does', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const mark = lines.length
  // AN EDIT STAGED: the file and the index change, and of git's own files only the index does. The seal compares the
  // file with the commit, so a change of the index alone would still be sealable.
  const { reply } = await finishWithAChangeOnTheSealsAnswer(id, () => {
    writeFileSync(join(dir, 'work', 'b.txt'), 'b, edited and staged after the check\n')
    git(dir, 'add', 'work/b.txt')
  })
  expect(reply.statusCode, reply.body).toBe(409)
  expect((reply.json() as { error: string }).error).toBe(theSynchronousRefusalOf(dir))
  const line = theFinishLineSince(mark)
  expect(theReadsIn(line), line).toEqual([[1, 0], [0, 1], [1, 1]])
  expect(theRun(id).data['state']).toBe(RUNNING)
  expect(theSealsOf(id)).toBe(0)
}, 60_000)

// ================================================================================================== 6

it('refuses after four reads when the office is too busy to use any reading in time, and stores nothing', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  const stored = everythingStored()
  const mark = lines.length
  const d = await drive(() => finish(id, asAgent(HANDLE)), '--others', (one) => {
    held.letGoOf(one)
    holdTheServer(1000)
  })
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect(d.reply.body).toContain(`${String(mostReads)} times for the write, the most it reads`)
  expect(theReadsIn(theFinishLineSince(mark))).toHaveLength(mostReads)
  expect(everythingStored()).toBe(stored)
}, 60_000)

it('refuses after four reads of a tree that changes during each, and stores nothing, not even a held draft\'s message', async () => {
  const dir = aTree()
  const { id, headers } = await aRunWithItsKey(dir)
  commitB(dir)
  atPosition('before-the-seal', 'off')
  const turn = await app.inject({ method: 'POST', url: '/api/drafts/turn', headers, payload: { turn: 'started' } })
  expect(turn.statusCode, turn.body).toBe(200)
  const draft = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'Held until the turn ends', data: { body: 'A held draft of a test.', to: [{ kind: 'person', id: THE_PERSON }] } } })
  expect(draft.statusCode, draft.body).toBe(202)
  // AT OFF THE REMINDER STEP COUNTS ITS GATE BEFORE THE WRITE, once, when it finds an item, and a refused write keeps
  // that count, as at the base. Everything else is as it was.
  const before = t.api.getRecord(id)
  if (before === null) throw new Error(`Run ${id} is not stored.`)
  const dataPatch = { state: FINISHED, submission: { kind: 'git' } }
  const found = beforeTheSeal.whatAnInspectorWouldMostLikelyRefuse(await beforeTheSeal.theFactsBeforeTheSealWithTheCopiedWordsOf({ ...before, data: { ...before.data, ...dataPatch } }, { tip: null }))
  const reminded = metCount('before-the-seal')
  const stored = everythingStored(['before-the-seal'])
  const mark = lines.length
  const d = await drive(() => finish(id, headers, dataPatch, {}), '--others', (one, index) => {
    // AN IGNORED FILE IN A FOLDER THE INDEX NAMES: the tree is still sealable, and the stamp still sees it.
    if (index > 0) writeFileSync(join(dir, 'work', `${String(index)}.ignored`), 'ignored\n')
    held.letGoOf(one)
  })
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect(d.reply.body).toContain(`${String(mostReads)} times for the write, the most it reads`)
  expect(theReadsIn(theFinishLineSince(mark))).toHaveLength(mostReads)
  expect(metCount('before-the-seal') - reminded).toBe(found.items.length > 0 ? 1 : 0)
  expect(everythingStored(['before-the-seal'])).toBe(stored)
}, 60_000)

it('refuses the reminder after four reads of a tree that changes during each, and keeps no reminder', async () => {
  const dir = aTree()
  const { id, headers } = await aRunWithItsKey(dir)
  commitB(dir)
  const stored = everythingStored()
  const d = await drive(() => finish(id, headers, { state: FINISHED, submission: { kind: 'git' } }, {}), '--others', (one, index) => {
    writeFileSync(join(dir, 'work', `${String(index)}.ignored`), 'ignored\n')
    held.letGoOf(one)
  })
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect(d.reply.body).toContain(`${String(mostReads)} times for the reminder before the seal, the most it reads`)
  expect(walks(d)).toBe(mostReads)
  expect(everythingStored()).toBe(stored)
}, 60_000)

// ================================================================================================== 7

it('answers 503 and writes nothing when the thread ends during the read of a PATCH or a POST', async () => {
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  commitB(dir)
  for (const write of [() => finish(id, asAgent(HANDLE)), () => fileFinished(dir)]) {
    const stored = everythingStored()
    const d = await drive(write, '--others', async (one) => {
      const ended = apart.endTheSealReadThread()
      held.letGoOf(one)
      await ended
    })
    expect(d.reply.statusCode, d.reply.body).toBe(503)
    expect(d.reply.body).toContain('The office could not read the Git seal on its own thread')
    expect(everythingStored()).toBe(stored)
  }
}, 60_000)

// ================================================================================================== 8

it('sends a held draft once and files one seal, though the write ran three passes', async () => {
  const dir = aTree()
  const { id, headers } = await aRunWithItsKey(dir)
  await aReportInForm(t, id, HANDLE)
  commitB(dir)
  const dataPatch = { state: FINISHED, submission: { kind: 'git' } }
  const first = await finish(id, headers, dataPatch, {})
  expect((first.json() as { beforeTheSeal?: unknown }).beforeTheSeal, 'a keyed run is reminded first').toBeDefined()
  const turn = await app.inject({ method: 'POST', url: '/api/drafts/turn', headers, payload: { turn: 'started' } })
  expect(turn.statusCode, turn.body).toBe(200)
  // THE MESSAGE IS FOUND BY A TITLE MADE FOR THIS CASE, so no other message is counted.
  const title = `Held until the turn ends, ${randomBytes(6).toString('hex')}`
  const draft = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title, data: { body: 'A held draft sent once.', to: [{ kind: 'person', id: THE_PERSON }] } } })
  expect(draft.statusCode, draft.body).toBe(202)
  const sent = () => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND title = ?").get(title) as { n: number }).n
  expect(sent()).toBe(0)
  const mark = lines.length
  const reply = await finish(id, headers, dataPatch, {})
  expect(reply.statusCode, reply.body).toBe(200)
  expect(theReadsIn(theFinishLineSince(mark))).toHaveLength(2)
  expect(sent()).toBe(1)
  expect(theSealsOf(id)).toBe(1)
}, 60_000)

it('counts each gate met at off once, though the write ran three passes', async () => {
  atPosition('who-ends-a-run', 'off')
  atPosition('writes-from-a-stale-copy', 'off')
  const dir = aTree()
  const id = await aRunWithoutAKey(dir)
  const stale = ((await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: asAgent(HANDLE) })).json() as { version: string }).version
  expect(stale).toMatch(/./)
  const moved = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asAgent(HANDLE), payload: { dataPatch: { doing: 'moved on' } } })
  expect(moved.statusCode, moved.body).toBe(200)
  commitB(dir)
  const ends = metCount('who-ends-a-run')
  const copies = metCount('writes-from-a-stale-copy')
  const mark = lines.length
  const reply = await finish(id, asAgent(STRANGER), { state: FINISHED }, { remindBeforeTheSeal: false, ifVersion: stale })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(theReadsIn(theFinishLineSince(mark))).toHaveLength(2)
  expect(metCount('who-ends-a-run') - ends).toBe(1)
  expect(metCount('writes-from-a-stale-copy') - copies).toBe(1)
  expect(theSealsOf(id)).toBe(1)
}, 60_000)

it('counts the reminder at off once, and refuses a run changed during the reminder\'s read with no reminder and no count', async () => {
  atPosition('before-the-seal', 'off')
  const counted = aTree()
  const first = await aRunWithItsKey(counted)
  commitB(counted, { migration: true })
  const met = metCount('before-the-seal')
  const refused = await finish(first.id, first.headers, { state: FINISHED, submission: { kind: 'git' } }, {})
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.body).toContain('still finds a migration item')
  expect(metCount('before-the-seal') - met, 'the reminder at off found the item once').toBe(1)

  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(String(gateNamed('before-the-seal')?.setting))
  const changed = aTree()
  const other = await aRunWithItsKey(changed)
  commitB(changed, { migration: true })
  const before = metCount('before-the-seal')
  const d = await drive(() => finish(other.id, other.headers, { state: FINISHED, submission: { kind: 'git' } }, {}), '--others', async (one) => {
    const meanwhile = await app.inject({ method: 'PATCH', url: `/api/records/${other.id}`, headers: other.headers, payload: { dataPatch: { doing: 'changed during the read' } } })
    expect(meanwhile.statusCode, meanwhile.body).toBe(200)
    held.letGoOf(one)
  })
  expect(d.reply.statusCode, d.reply.body).toBe(409)
  expect(d.reply.body).toContain(`Run ${other.id} changed while the office read its git for the reminder before the seal`)
  expect(metCount('before-the-seal')).toBe(before)
  expect(theRun(other.id).data['remindedBeforeTheSeal']).toBeUndefined()
  expect(theRun(other.id).data['state']).toBe(RUNNING)
}, 60_000)
