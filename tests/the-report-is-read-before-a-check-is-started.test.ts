// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE REPORT IS READ BEFORE A CHECK IS STARTED (wave 13v round 34), by the first part of a
 * decision.
 *
 * The decision: on submission the queue first runs what costs no tokens, and among those gates "a completeness check of
 * the report (doing line, chapters read, a control-mutation-restore proof per new test). A failure bounces the entry
 * there." Only then the office starts the inspector.
 *
 * WHAT IS PROVED HERE, against a real database, the real server and the real worker pass:
 *
 *   1. THE HOLD. An entry whose run has no doing line bounces at the pin, before any check of the run started. The
 *      worker's queue row for that check says why it waits, and one worker pass says it held and starts nothing. Once
 *      the doing line is written and the same sealed run is submitted again, the new entry pins and the row says nothing.
 *   2. WHAT THE REPORT MUST HOLD. A doing line, a linked report that lists the chapters, and for each test file the run
 *      added a control, a mutation and a restore: in one block of the report, or in the run's named-tests lines, read
 *      from the tool_uses rows, green, red and green in that order. Each missing piece bounces the entry, saying what is
 *      missing and that no check was started. The submitter is told to write it and submit again. An entry it bounces
 *      asks nobody to press, though it touches a sensitive path.
 *   3. WHAT IS NOT READ. A released run, and a run whose check has started, pin with no doing line and no report: their
 *      tokens are spent. A secretary's design/-only entry is judged at the pin with no report, which
 *      tests/merge-state-machine.test.ts proves ("is judged at the pin with no release").
 *
 * WHAT WOULD MAKE EACH CASE GO RED is in the commit that adds the code, with the control run and the restore.
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout and removed after,
 * the records are filed as fixtures, the check tool is tests/fake-inspection-tool.mjs, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ABSENT } from '../src/shared/merge-queue.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
/** The chapters on the worker card's must-read line, read from the card in beforeAll: what a complete report lists. */
let theCardsChapters: number[] = []
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []

const WORKSPACE = 'default'
const THE_WORKER = 'mole-office/the-message-worker'
const LIVE = new Set(['submitted', 'pinned', 'judged', 'integrating', 'reinspecting', 'testing', 'landing'])
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asInspector = as('agent', 'inspector-one')
const asSupervisor = as('agent', 'super-r')
const asWorker = as('agent', 'worker-w')
const asStranger = as('agent', 'a-stranger')
const asTheOffice = as('agent', THE_WORKER)
const theWorker = { type: 'agent' as const, id: 'worker-w' }
const THE_WORKERS_CARD = 'worker'

const A = 'work/a.txt'
const NEW_TEST = 'tests/a-synthetic-new.test.ts'
const PROOF = 'Synthetic: a-synthetic-new.test.ts had its control green, its mutation red, and its restore green again.'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `report-gate-${prefix}-`))
  made.push(dir)
  return dir
}

/** A synthetic tree whose main holds work/a.txt, switched to a branch `work` with nothing on it yet. */
function aTree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic report-gate fixture')
  mkdirSync(dirname(join(dir, A)), { recursive: true })
  writeFileSync(join(dir, A), `${A} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  return dir
}

interface Seal { id: string; hash: string; commit: string; forkBase: string; files: { path: string; hash: string | null }[] }

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

function theSealOf(run: string): Seal {
  const id = t.api.getRecord(run)!.data['sealedTip'] as string
  const seal = t.api.getRecord(id)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: Seal['files'] } }
  return { id, hash: seal.hash, commit: seal.git.commit, forkBase: seal.git.forkBase, files: seal.git.files }
}

/** The sealed content as the state machine spells it: every changed path at its blob hash. */
function contentOf(seal: Seal): Record<string, string> {
  return Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))
}

/** One named-tests line on the run, as tools/run-named-tests.mjs writes it, through the real door. */
async function aTestRunLine(run: string, ended: 'green' | 'red'): Promise<void> {
  const said = `named 1 file (a-synthetic-new.test.ts); 1 ran, exactly those; vitest exited ${ended === 'green' ? '0' : '1'}`
  const r = await call('POST', '/api/toolset/uses', { ...asWorker, 'x-mole-office-session': run }, { tool: 'named-tests', said })
  expect(r.status, r.raw).toBe(201)
}

interface TheRun {
  /** False files the run with no doing line. */
  doing?: false
  /** The files the run's commit adds beside work/a.txt; NEW_TEST when not given. */
  adds?: string[]
  /** The run's linked report: its chapters (null writes none) and its one block. Null links no report. */
  report?: { chapters?: number[] | null; text: string } | null
  /** The run's named-tests lines, in order. */
  lines?: ('green' | 'red')[]
}

/**
 * A finished run of the worker, sealed at its tree's tip. Its work is committed after the run is filed, so the commit is
 * the run's own: the queue reads a run's own commits from the second it started.
 */
async function aSealedRun(made: TheRun = {}): Promise<{ run: string; seal: Seal }> {
  const dir = aTree()
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic report-gate run',
    workspaceId: WORKSPACE,
    actor: theWorker,
    origin: 'fixture',
    data: {
      state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir,
      ...(made.doing === false ? {} : { doing: 'Synthetic: the run changes work/a.txt and adds a test.' }),
    },
  }).id
  // EACH TREE'S OWN LINE keeps two trees two works, so no entry supersedes another.
  for (const path of [A, ...(made.adds ?? [NEW_TEST])]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), `${path} submitted from ${dir}.\n`)
  }
  if (made.adds?.includes('drizzle/0264_synthetic.sql')) {
    mkdirSync(join(dir, 'drizzle', 'meta'), { recursive: true })
    writeFileSync(join(dir, 'drizzle', 'meta', '_journal.json'), JSON.stringify({
      version: '7', dialect: 'sqlite',
      entries: [{ idx: 264, version: '6', when: 200, tag: '0264_synthetic', breakpoints: true }],
    }, null, 2) + '\n')
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic work of the run')
  for (const ended of made.lines ?? []) await aTestRunLine(run, ended)
  const report = made.report === undefined ? { text: PROOF } : made.report
  if (report !== null) {
    const chapters = report.chapters === undefined ? theCardsChapters : report.chapters
    const id = t.api.createRecord({
      kind: 'report',
      title: `Synthetic report of run ${run}`,
      workspaceId: WORKSPACE,
      actor: theWorker,
      origin: 'fixture',
      data: { ...(chapters === null ? {} : { chaptersRead: chapters }), blocks: [{ id: 'b-1', type: 'text', text: report.text }] },
    }).id
    t.api.createLink({ fromId: id, toId: run, type: 'about', actor: theWorker })
  }
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  return { run, seal: theSealOf(run) }
}

/** Submit a sealed run as the supervisor; the new entry's id. */
async function submit(run: string): Promise<string> {
  const r = await call('POST', '/api/merge-queue', asSupervisor, { run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'work' } })
  expect(r.status, r.raw).toBe(201)
  return String(r.body['entry'].id)
}

async function pin(id: string, seal: Seal) {
  const pinned = await call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: 'pinned', facts: { files: contentOf(seal) } })
  expect(pinned.status, pinned.raw).toBe(200)
  return pinned.body as { entry: Record<string, any>; decided: string }
}

/** An inspector's release of a run, through the real doors: the assembly first, then the verdict. */
async function release(run: string): Promise<void> {
  const seal = theSealOf(run)
  const worktree = String(t.api.getRecord(run)!.data['workingDirectory'])
  const read = { sealId: seal.id, sealHash: seal.hash, worktree, tip: seal.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const released = await call('POST', `/api/checks/${run}`, asInspector, {
    chaptersRead: [],
    read,
    traced: syntheticTrace(t, seal.files.map((one) => one.path)),
    verdict: 'released',
    check: 'Synthetic: read the changes and found nothing missing.',
  })
  expect(released.status, released.raw).toBe(201)
}

interface Message { id: string; title: string; body: string }
/** The messages about a run whose title starts so, oldest first. */
function messagesAbout(run: string, starts: string): Message[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, title, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid")
    .all(run) as { id: string; title: string; data: string }[]
  return rows.filter((row) => row.title.startsWith(starts)).map((row) => ({ id: row.id, title: row.title, body: (JSON.parse(row.data) as { body: string }).body }))
}

/** The check the office asked for on a run, as the run holds it. */
function theCheckOf(run: string): { message?: string; execution?: unknown } | undefined {
  return t.api.getRecord(run)!.data['theCheck'] as { message?: string; execution?: unknown } | undefined
}

/**
 * The worker's queue row for a check's message, read through the real door. The message is delivered to the run's own
 * agent as well, on a row that carries no check, and the two rows come in either order.
 */
async function theRowOf(message: string): Promise<{ inspection: { run: string; waits?: string } }> {
  const r = await call('GET', '/api/worker/queue', {})
  expect(r.status, r.raw).toBe(200)
  const queue = r.body['queue'] as { messageId: string; handle: string; inspection?: { run: string; waits?: string } }[]
  const row = queue.find((one) => one.messageId === message && one.inspection !== undefined)
  const deliveries = t.client.sqlite.prepare('SELECT recipient_id AS recipient, mark, because FROM message_delivery WHERE message_id = ?').all(message)
  const rows = queue.map((one) => `${one.messageId} to ${one.handle}${one.inspection === undefined ? '' : ' (a check)'}`).join('; ')
  expect(row?.inspection, `no check row for ${message}; its deliveries ${JSON.stringify(deliveries)}; the queue: ${rows}`).toBeDefined()
  return row as { inspection: { run: string; waits?: string } }
}

const checkSessions = (): number =>
  (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.runtime') = 'inspection-tool'").get() as { n: number }).n

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: THE_WORKERS_CARD, workArea: ['work', 'tests', 'drizzle'] })
  theCardsChapters = (await import('../src/server/lib/chapters.ts')).theCardLineOf(THE_WORKERS_CARD).map((one) => one.chapter)
  await register(asPerson, { handle: 'a-stranger', name: 'A Stranger' })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_PERSON } })
  // THE NAMED-TESTS TOOL, as a fixture record, so the run's lines are written through the real door.
  const category = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Synthetic: developing the office', data: { says: 'Synthetic.' }, actor: theWorker, origin: 'fixture' }).id
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'tool',
    title: 'Synthetic: named tests',
    data: { entry: 'tool', slug: 'named-tests', forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
    actor: theWorker,
    origin: 'fixture',
  })
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: WORKSPACE,
    session: null,
    stopWithPid: null,
    checkout: process.cwd(),
    runs: 2,
    hops: 3,
    outputRoot: realpathSync(mkdtempSync(join(tmpdir(), 'report-gate-worker-'))),
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'), MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs') },
  }
  made.push(settings.outputRoot)
}, 60_000)

/** Withdraw every entry a case left waiting, so it is not in the next case's way. */
afterEach(async () => {
  const listed = await call('GET', '/api/merge-queue', asStranger)
  for (const lane of (listed.body['lanes'] ?? []) as { entries: { id: string; state: string }[] }[]) {
    for (const one of lane.entries) {
      if (LIVE.has(one.state)) await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'the case is over' })
    }
  }
})

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The report-gate test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

// ============================================================================ 1. the hold (first: no other check is queued)

describe('a check whose run’s entry bounced for its report is held, not started', () => {
  let run = ''
  let seal: Seal
  let check = ''

  it('bounces at the pin, and the worker says the check waits in the queue’s sentence and starts nothing', async () => {
    ;({ run, seal } = await aSealedRun({ doing: false }))
    // This case needs a real check. A worker's seal may leave its round note, so the check is asked for explicitly, as the person.
    if (!theCheckOf(run)?.message) {
      const asked = await call('POST', `/api/checks/${run}/ask-again`, asPerson, {})
      expect(asked.status, asked.raw).toBe(200)
    }
    check = theCheckOf(run)?.message ?? ''
    expect(check, JSON.stringify(theCheckOf(run))).not.toBe('')
    expect(theCheckOf(run)?.execution).toBeUndefined()

    const id = await submit(run)
    const pinned = await pin(id, seal)
    expect(pinned.entry['state']).toBe('bounced')
    expect(pinned.entry['machine'].bounced).toMatchObject({ reason: 'incomplete', files: [] })

    const row = await theRowOf(check)
    expect(row.inspection.run).toBe(run)
    const waits = row.inspection.waits ?? ''
    expect(waits).toContain(`merge entry ${id} bounced`)
    expect(waits).toContain(`run ${run}'s report lacks what a check needs`)
    expect(waits).toContain('POST /api/merge-queue')

    const pass = await onePass(settings, watching)
    expect(pass.held).toContainEqual({ messageId: check, because: waits })
    expect(pass.started).toEqual([])
    expect(watching).toEqual([])
    expect(theCheckOf(run)?.execution).toBeUndefined()
    expect(checkSessions()).toBe(0)
  })

  it('is not held once the doing line is written and the same sealed run is submitted again and pins', async () => {
    const doing = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { doing: 'Synthetic: the run changes work/a.txt and adds a test.' } })
    expect(doing.status, doing.raw).toBe(200)
    expect(theSealOf(run).id).toBe(seal.id)
    const again = await submit(run)
    const pinned = await pin(again, seal)
    expect(pinned.entry['state'], pinned.decided).toBe('pinned')
    expect(pinned.entry['waitsOn']).toContain("inspector's release")
    const row = await theRowOf(check)
    expect(row.inspection.run).toBe(run)
    expect(row.inspection.waits).toBeUndefined()
  })
})

// ============================================================================ 2. what the report must hold

describe('the report is read at the pin for a doing line, the chapters and a proof of each new test', () => {
  it('pins an entry whose run has all three, the proof in a block of its report', async () => {
    const one = await aSealedRun()
    const pinned = await pin(await submit(one.run), one.seal)
    expect(pinned.entry['state'], pinned.decided).toBe('pinned')
    expect(pinned.entry['waitsOn']).toContain("inspector's release")
  })

  it('bounces an entry whose run has no doing line, says no check started, and tells the submitter to write it and submit again', async () => {
    const one = await aSealedRun({ doing: false })
    const id = await submit(one.run)
    const pinned = await pin(id, one.seal)
    expect(pinned.entry['state']).toBe('bounced')
    const { whatTheDoingLineLacks } = await import('../src/server/lib/before-the-seal-rules.ts')
    expect(pinned.decided).toBe(whatTheDoingLineLacks(null))
    const says = String(pinned.entry['machine'].bounced.says)
    expect(says).toContain("Its run's report was read before any check of the run started, and it lacks what a check needs.")
    expect(says).toContain('No check was started, so no tokens were spent.')
    expect(says).toContain(whatTheDoingLineLacks(null))
    const notice = messagesAbout(one.run, `Bounced (incomplete): merge entry ${id}`)
    expect(notice).toHaveLength(1)
    expect(notice[0]!.body).toContain('Next: write what is named above on the run and on its report. The sealed commits need not change.')
    expect(notice[0]!.body).toContain('Then submit the same sealed run again with POST /api/merge-queue.')
  })

  it('bounces an entry whose run has no linked report', async () => {
    const one = await aSealedRun({ report: null })
    const pinned = await pin(await submit(one.run), one.seal)
    expect(pinned.entry['state']).toBe('bounced')
    expect(pinned.decided).toContain('No report is linked to the run.')
  })

  it('bounces an entry whose linked report does not list the chapters, naming the chapter it lacks', async () => {
    const one = await aSealedRun({ report: { chapters: [1, 2, 3], text: PROOF } })
    const pinned = await pin(await submit(one.run), one.seal)
    expect(pinned.entry['state']).toBe('bounced')
    expect(pinned.decided).toContain('No linked report lists the chapters read.')
    expect(pinned.decided).toMatch(/does not list chapters? [\d, ]*\b5\b/u)
    const none = await aSealedRun({ report: { chapters: null, text: PROOF } })
    const unlisted = await pin(await submit(none.run), none.seal)
    expect(unlisted.entry['state']).toBe('bounced')
    expect(unlisted.decided).toContain('has no chaptersRead')
  })

  it('bounces an entry whose new test has no control, mutation and restore, naming the file', async () => {
    const one = await aSealedRun({ report: { text: 'Synthetic: a-synthetic-new.test.ts was written and run green.' } })
    const pinned = await pin(await submit(one.run), one.seal)
    expect(pinned.entry['state']).toBe('bounced')
    expect(pinned.entry['machine'].bounced.files).toEqual([NEW_TEST])
    expect(pinned.decided).toContain(`No control, mutation and restore was found for the new test ${NEW_TEST}.`)
  })

  it("finds the proof in the run's named-tests lines when they go green, red and green, and not in another order", async () => {
    const report = { text: 'Synthetic: the report names no proof.' }
    const proved = await aSealedRun({ report, lines: ['green', 'red', 'green'] })
    const pinned = await pin(await submit(proved.run), proved.seal)
    expect(pinned.entry['state'], pinned.decided).toBe('pinned')
    const unproved = await aSealedRun({ report, lines: ['red', 'green', 'green'] })
    const bounced = await pin(await submit(unproved.run), unproved.seal)
    expect(bounced.entry['state']).toBe('bounced')
    expect(bounced.entry['machine'].bounced.files).toEqual([NEW_TEST])
  })

  it('asks nobody to press for an entry it bounces, though the entry touches a sensitive path', async () => {
    const one = await aSealedRun({ doing: false, adds: [NEW_TEST, 'drizzle/0264_synthetic.sql'] })
    const pinned = await pin(await submit(one.run), one.seal)
    expect(pinned.entry['state']).toBe('bounced')
    expect(pinned.entry['machine'].pressToLand).toBeUndefined()
    expect(messagesAbout(one.run, 'Press to land')).toEqual([])
  })
})

// ============================================================================ 3. what is not read

describe('a run whose check has run or started is not read for its report', () => {
  it('pins a released run with no doing line and no report, judged by its release', async () => {
    const one = await aSealedRun({ doing: false, report: null })
    await release(one.run)
    const pinned = await pin(await submit(one.run), one.seal)
    expect(pinned.entry['state'], pinned.decided).toBe('judged')
  })

  it('pins a run whose check has started, with no doing line and no report', async () => {
    const one = await aSealedRun({ doing: false, report: null })
    const office = (await import('../src/server/lib/inspection.ts')).THE_OFFICE
    t.api.patchRecord(one.run, {
      dataPatch: { theCheck: { execution: { session: 'synthetic-started-check', log: '/synthetic/check.log', model: 'synthetic', minutes: 1 } } },
    }, office)
    const pinned = await pin(await submit(one.run), one.seal)
    expect(pinned.entry['state'], pinned.decided).toBe('pinned')
    expect(pinned.entry['waitsOn']).toContain("inspector's release")
  })
})
