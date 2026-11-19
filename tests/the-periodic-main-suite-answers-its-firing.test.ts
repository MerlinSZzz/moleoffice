// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Actual polling/producer and real independent Git, SQLite and authenticated Office doors.
 * Cloud artifacts and the resource OS table are synthetic; no whole suite or timer is started.
 *
 * THE SCHEDULE (step 1b): the counter's triggers are the two settings MOLE_OFFICE_MAIN_SUITE_LANDINGS and
 * MOLE_OFFICE_MAIN_SUITE_HOURS, a count and an every. The runner puts them back when the counter says otherwise,
 * and a firing runs at once: the counter alone spaces the runs. Started by a host timer with no process row named,
 * the runner registers its own process group for the seat, which it can only do as the leader of that group.
 * MUTATIONS: the trigger PATCH skipped: "puts the triggers" red. The own-group check skipped: "refuses to register"
 * red. The producer's own spacing kept on the job path: "runs a later firing" red.
 * THE NIGHT THE CLOCKS GO BACK (13r round P, run cGsNm_MnEMOJ, problem tl4r2TCQl_Oh): three cases run from the real
 * time and again from a start that puts their firing or their held-back boundary in the second pass of the hour that
 * comes twice in Europe/London, worked out from Intl. MUTATIONS: a counter row's kept moment ignored and its stamp
 * read as the earlier moment: the second runs of "journals tracing ..." and "an earlier firing receipt ..." red.
 * cadence() reading heldBack.until instead of heldBack.untilInstant: the second run of "keeps pending work ..." red.
 * The anchored-due case rewrites the published instant and leaves the stamp, and a reply with the stamp and no
 * instant is refused. MUTATION: cadence() reading nextDue.at instead of nextDue.instant: "uses the published
 * anchored next due time" red, and no other case.
 * THE SEAT'S LINE (13q item 1j): a poll that finds the one full-suite seat taken keeps its place and waits inside the
 * poll until the firing's time ends, asking again with the same row. Its journal step is `in line` until the seat is
 * granted. Another synthetic run's group holds the seat through the office's own slot rules. MUTATIONS: the poll
 * giving the producer no time to wait: "waits in the seat's line ..." and both runs of "keeps pending work ..." red.
 * `running` written before the wait: "waits in the seat's line ..." red. A journal at `in line` read as one at
 * `running`: "takes a poll that ended in the seat's line ..." red.
 * THE FIRING'S MOMENT (13q item 1g): a poll reads its firing's moment from the instant the office publishes beside the
 * row's stamp. From an office that publishes none it reads the stamp, as the later of the moments the stamp can name,
 * and its result says which it used. One case pins two firings an hour apart that both have the stamp 01:30 on
 * 25 Oct 2026 in Europe/London, on a fixed clock. MUTATIONS: the stamp read as its earlier moment, as before, and the
 * instant left unread: "reads a firing's moment ..." red each time, and no other case.
 * THE LOCK ON EVERY END (13q, the producer's wait): three polls, each with the runner's own process row as the host timer
 * starts it, over an office that takes its calls one at a time and leaves one unanswered: a failed producer's answer,
 * which is how the poll's lock was left behind at 04:13; the answer of a suite not run; and the release of the row in
 * the inner finally. Each poll ends refused, asks no call while another is out, leaves no rejection unhandled and no
 * lock, and the next poll is let in: "removes its lock when ..." three times. With an answer returned and not awaited,
 * the release was asked while the answer was out, and a failed producer's unanswered answer was a rejection nothing
 * handled, which ends the host timer's Node process before the outer finally removes the lock.
 */
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { A_KEY_SHOWN_AS, askTheOffice, type AnAnswer, type ARequest } from '../tools/office-request.mjs'
import { A_FIRINGS_MOMENT_FROM_ITS_STAMP, THE_NEXT_FIRING_WAS_ALREADY_DUE, THE_POLL_PRECEDES_ITS_FIRING, mainSuiteJobTick, runMainSuiteJobCli } from '../tools/run-the-main-suite-job.mjs'
import { producerOfficeRequest, runPeriodicSuiteOnce, SEAT_ASKED_AGAIN_EVERY_MS } from '../tools/periodic-main-suite.mjs'
import { verifyUpgradeEvidence } from '../tools/stable/stable-upgrade-evidence.mjs'
import { localStamp } from '../src/shared/time.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import type { OsProbe, OsProcess } from '../src/server/lib/resources.ts'

let db: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let resources: typeof import('../src/server/lib/resources.ts')
let counters: typeof import('../src/server/lib/counters.ts')
let env: NodeJS.ProcessEnv
let root: string, repository: string, workdir: string, resource: string
let now: number, cloudCalls: number, answers: number
let mode: 'green' | 'red' | 'build' | 'busy' | 'partial' | 'interrupted' | 'hung'
let calls: ARequest[]
let intercept: ((asked: ARequest, answer: AnAnswer) => Promise<AnAnswer>) | null
let job: string
let number = 0

const fixtureGroup = (pid: number, pgid: number, command: string): [number, OsProcess] => [pid, { pid, pgid, ppid: 1, command, startedAt: localStamp(new Date()) }]
// One entry for the registered group 700, made after its session, so a probe put back after a test reads the same process start.
let THE_FIXTURE_GROUP: [number, OsProcess]
const syntheticProbe = (live: Map<number, OsProcess>): OsProbe => ({
  platform: 'synthetic', processById: pid => live.get(pid) ?? null,
  processesInGroup: pgid => [...live.values()].filter(one => one.pgid === pgid), listeningPorts: () => [],
  gpu: () => ({ available: true, processes: [] }), containers: () => ({ available: true, containers: [] }),
  locks: () => ({ files: [], unreadable: [] }), ownProcessGroup: () => 999,
  killProcessGroup: () => { throw new Error('A synthetic group must never be signalled.') },
  stopContainer: () => { throw new Error('No test container was started.') },
})

function git(...args: string[]): string {
  const ran = spawnSync('git', args, { encoding: 'utf8', timeout: 15_000, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (ran.status !== 0) throw new Error(`Synthetic Git fixture failed: ${ran.stderr}`)
  return ran.stdout.trim()
}

async function realOffice(asked: ARequest): Promise<AnAnswer> {
  return askTheOffice(asked, { env, fetchImpl: async (url, init) => {
    const parsed = new URL(String(url))
    const response = await server.app.inject({ method: init?.method as 'GET' | 'POST' | 'PATCH', url: parsed.pathname + parsed.search,
      headers: init?.headers as Record<string, string>, ...(init?.body === undefined ? {} : { payload: String(init.body) }) })
    return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> })
  } })
}

async function officeRequest(asked: ARequest): Promise<AnAnswer> {
  calls.push(asked)
  if (asked.method === 'GET' && asked.path === '/api/counters') throw new Error('The poll must never read the unbounded counters list.')
  if (asked.method === 'POST' && asked.path.endsWith('/answer')) answers++
  const answer = await realOffice(asked)
  return intercept === null ? answer : intercept(asked, answer)
}

async function ask(asked: ARequest): Promise<any> {
  const answer = await realOffice(asked)
  expect(answer.status, answer.body).toBeLessThan(300)
  return JSON.parse(answer.body)
}

beforeAll(async () => {
  db = await freshDb(); server = await apiApp()
  counters = await import('../src/server/lib/counters.ts')
  resources = await import('../src/server/lib/resources.ts')
  // The actual job guard holds copied worlds. This fresh external database identifies itself
  // as its own synthetic home office, without starting any timer or watcher.
  const office = await import('../src/server/lib/office.ts')
  const world = await import('../src/server/lib/world.ts')
  const identity = world.theWorldThisDatabaseIs()
  expect(identity).not.toBeNull()
  office.registerWorldHere({ name: 'Synthetic periodic firing test office', purpose: null, handback: null, kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, head: 'abc1234', databaseIdentity: identity ?? '',
    address: 'http://synthetic-office.invalid', addressForOtherMachines: null, standing: 'canonical', parentWorld: null, installation: 'this-installation' })
  expect(office.theOfficeIsInThisDatabase()).toBe(true)
  job = (await import(new URL('../src/config/main-suite-job.mjs', import.meta.url).href)).MAIN_SUITE_JOB
  const agent = db.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic periodic job worker', data: { handle: 'synthetic-periodic-worker', runtime: 'codex', state: 'active' }, actor: db.api.HUMAN })
  const participants = await import('../src/server/lib/participants.ts')
  const keys = await import('../src/server/lib/keys.ts')
  const session = db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic periodic job run', data: { state: 'running', runtime: 'mole-office' }, actor: db.api.HUMAN })
  env = { MOLE_OFFICE_API: 'http://synthetic-office.invalid', MOLE_OFFICE_AGENT: 'synthetic-periodic-worker', MOLE_OFFICE_SESSION: session.id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: keys.makeAnAgentKey(participants.agentForRecord(agent.id)!.id, null), [THE_TEST_MARK]: String(process.pid) }
  THE_FIXTURE_GROUP = fixtureGroup(700, 700, 'Synthetic periodic fixture group')
  resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP])))
  resource = (await ask({ method: 'POST', path: '/api/resources', body: { type: 'process', key: '700', sessionRecordId: session.id, detail: 'Synthetic periodic fixture group' } })).resource.id
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'periodic-firing-synthetic-'))
  repository = join(root, 'main'); workdir = join(root, 'poll')
  mkdirSync(join(repository, 'tests'), { recursive: true })
  writeFileSync(join(repository, 'tests', 'one.test.ts'), '// Synthetic cloud source; never executed.\n')
  git('init', '-q', '-b', 'main', repository); git('-C', repository, 'add', '.')
  git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'Synthetic main tip')
  now = Math.ceil(Date.now() / 1000) * 1000 + 1000
  cloudCalls = 0; answers = 0; mode = 'green'; calls = []; intercept = null
  // The schedule the counters below are made with: 6 landings, the default, or 2.5 hours.
  env.MOLE_OFFICE_MAIN_SUITE_HOURS = '2.5'; delete env.MOLE_OFFICE_MAIN_SUITE_LANDINGS
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
afterAll(async () => { resources.useOsProbe(resources.LINUX_PROBE); await server.app.close(); db.close() })

async function syntheticCloud({ clone, commit, paths }: any): Promise<any> {
  cloudCalls++
  if (mode === 'busy') return { code: 75, answer: { ran: false, reason: 'the cloud box is busy with another suite' } }
  if (mode === 'interrupted') return { code: 75, answer: { ran: false, reason: 'Synthetic interruption with unavailable result' } }
  writeFileSync(paths.log, 'Synthetic cloud log: no whole suite ran.\n')
  const output = join(dirname(clone), 'door-output.log')
  if (mode === 'hung') {
    // A made-up whole run that stopped moving: the door ended it and named the worker's wait. The report beside it
    // looks green and complete, as one written while tests were still running can, and is never to be filed.
    writeFileSync(paths.manifest, JSON.stringify([{ file: join(clone, 'tests/one.test.ts') }]))
    writeFileSync(paths.report, JSON.stringify({ fixture: 'synthetic', success: true, numTotalTests: 1, numFailedTests: 0, numPassedTests: 1, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0, numPendingTestSuites: 0,
      testResults: [{ name: join(clone, 'tests/one.test.ts'), status: 'passed', assertionResults: [{ fullName: 'Synthetic cloud assertion', status: 'passed' }] }] }))
    mkdirSync(paths.reads); writeFileSync(join(paths.reads, 'synthetic.json'), 'Synthetic read record; no tests ran.\n')
    const result = { code: 75, answer: { ran: false, reason: 'Synthetic hung whole run: tests/one.test.ts waits in wait_for_partner', phase: 'test', buildExitCode: 0, hung: HUNG }, output }
    writeFileSync(output, `${JSON.stringify(result.answer)}\n`); return result
  }
  if (mode === 'build') {
    const result = { code: 17, answer: { ran: true, code: 17, commit, phase: 'build', buildExitCode: 17, wallSec: 1, workers: 1, files: 0, failed: [] }, output }
    writeFileSync(output, `${JSON.stringify(result.answer)}\n`); return result
  }
  const files = mode === 'partial' ? [] : ['tests/one.test.ts']
  const failed = mode === 'red' ? files : []
  writeFileSync(paths.manifest, JSON.stringify([{ file: join(clone, 'tests/one.test.ts') }]))
  writeFileSync(paths.report, JSON.stringify({ fixture: 'synthetic', success: mode !== 'red', numTotalTests: files.length, numFailedTests: failed.length, numPassedTests: files.length - failed.length, numPendingTests: 0, numTodoTests: 0,
    numTotalTestSuites: files.length, numPassedTestSuites: files.length - failed.length, numFailedTestSuites: failed.length, numPendingTestSuites: 0,
    testResults: files.map(file => ({ name: join(clone, file), status: failed.includes(file) ? 'failed' : 'passed', assertionResults: [{ fullName: 'Synthetic cloud assertion', status: failed.includes(file) ? 'failed' : 'passed' }] })) }))
  mkdirSync(paths.reads); writeFileSync(join(paths.reads, 'synthetic.json'), 'Synthetic read record; no tests ran.\n')
  const code = mode === 'red' ? 1 : 0
  const result = { code, answer: { ran: true, code, commit, phase: 'test', buildExitCode: 0, suiteExitCode: code, wallSec: 1, workers: 1, files: files.length, failed }, output }
  writeFileSync(output, `${JSON.stringify(result.answer)}\n`); return result
}

/** The made-up records of a hung run, as the door's criterion 27 shapes them. No process here was observed. */
const HUNG = { quietSec: 2700, workers: [{ pid: 4242, wait: 'wait_for_partner', file: 'tests/one.test.ts' }], leftBehind: [{ pid: 4243, command: 'sleep', wait: 'hrtimer_nanosleep' }] }

const io = () => ({ officeRequest, runCloud: syntheticCloud, clock: () => now })
const options = (id: string) => ({ repository, workdir, processResource: resource, counterId: id, env })
const tick = (id: string) => mainSuiteJobTick(options(id), io())
const receipts = () => db.api.listRecords({ workspaceId: 'default', kinds: ['whole_suite_receipt'] }).filter(one => one.data.repository === repository)
const journal = (id: string, seq: number) => join(workdir, `firing-${id}-${seq}.json`)

async function firing(hours = 2.5, atMostOnceEvery = 30): Promise<{ id: string; seq: number }> {
  const made = await ask({ method: 'POST', path: '/api/counters', body: { title: `Synthetic periodic counter ${++number}`, label: 'Synthetic suite clock', counts: 'Synthetic periodic suite requests.', mayAdd: { anyone: false, who: [] }, triggers: [{ kind: 'count', n: 6 }, { kind: 'every', hours, from: localStamp(new Date(now)) }], atMostOnceEvery, action: { kind: 'job', job } } })
  const id = made.counter.id as string
  const pass = counters.fireTheCountersThatAreDue(new Date(now))
  expect(pass.failed).toEqual([])
  const read = await ask({ method: 'GET', path: `/api/counters/${id}?limit=25` })
  const row = read.rows.find((one: any) => one.what === 'firing')
  expect(row).toBeDefined()
  return { id, seq: row.seq }
}
async function row(id: string, seq: number): Promise<any> {
  const read = await ask({ method: 'GET', path: `/api/counters/${id}?limit=25&before=${seq + 1}` })
  return read.rows.find((one: any) => one.seq === seq)
}

let otherGroup = 700
/** Another synthetic run, whose own group holds the one full-suite seat through the office's slot rules while `during` runs. */
async function whileAnotherRunHoldsTheSeat<T>(during: () => Promise<T>): Promise<T> {
  const pid = ++otherGroup
  resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP, fixtureGroup(pid, pid, 'Synthetic other whole suite')])))
  const slots = await import('../src/server/lib/slots.ts')
  let held: string | null = null
  try {
    const session = db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic other suite run', data: { state: 'running', runtime: 'mole-office' }, actor: db.api.HUMAN }).id
    const group = resources.registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(pid), detail: 'Synthetic other suite group', actor: db.api.HUMAN }).id
    const seat = slots.acquireSlot({ workspaceId: 'default', sessionRecordId: session, pool: 'full-suite', holder: { resource: group }, actor: db.api.HUMAN })
    held = seat.slot.id
    expect(seat.slot.state).toBe('granted')
    return await during()
  } finally {
    if (held !== null) slots.releaseSlot(held, { workspaceId: 'default', force: true, note: 'Synthetic: the other suite finished.', actor: db.api.HUMAN })
    resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP])))
  }
}
const producersSlotRows = () => db.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'slot' AND released_at IS NULL AND session_record_id = ?").get(env.MOLE_OFFICE_SESSION) as { n: number }

it('executes the dormant CLI and rejects an inexact configured counter without Office writes', async () => {
  const cli = resolve('tools/run-the-main-suite-job.mjs')
  const safe = { PATH: process.env.PATH, HOME: root, MOLE_OFFICE_MAIN_SUITE_COUNTER: '', [THE_TEST_MARK]: String(process.pid) }
  const ran = spawnSync(process.execPath, ['--import', 'tsx', cli], { encoding: 'utf8', timeout: 15_000, env: safe })
  expect(ran.status, ran.stderr).toBe(0)
  expect(JSON.parse(ran.stdout.trim().split('\n').at(-1)!)).toMatchObject({ status: 'dormant' })
  await expect(tick('../other-counter')).rejects.toThrow('one exact record id')
  expect(calls).toEqual([]); expect(existsSync(workdir)).toBe(false)
})

it.each(['green', 'red', 'build'] as const)('answers exact firing with verified original %s receipt and preserves the upgrade gate', async outcome => {
  const { id, seq } = await firing(); mode = outcome
  const result = await tick(id)
  const receipt = receipts()[0]!
  expect(result).toMatchObject({ status: 'answered', counter: id, seq, result: receipt.id })
  expect(result.says).toContain(`outcome ${outcome === 'build' ? 'build-failed' : outcome}`)
  expect((await row(id, seq)).answer).toMatchObject({ finished: true, ids: [receipt.id], says: result.says })
  expect(cloudCalls).toBe(1); expect(answers).toBe(1)
  expect(calls.filter(one => one.path.startsWith('/api/records?')).every(one => new URL(one.path, 'http://synthetic.invalid').searchParams.get('limit') === '25')).toBe(true)
  const original = await ask({ method: 'GET', path: `/api/records/${receipt.id}/revisions/1` })
  const verify = verifyUpgradeEvidence({ repository, commit: receipt.data.commit, evidence: { recordId: receipt.id, seq: 1, contentHash: original.contentHash } }, { officeRequest })
  if (outcome === 'green') expect((await verify).green).toBe(true)
  else await expect(verify).rejects.toThrow('not green')
  expect(await tick(id)).toMatchObject({ status: 'idle' }); expect(cloudCalls).toBe(1); expect(answers).toBe(1)
})

it('runs a later firing at once on a new main, with the saved firing job after the latest action changes', async () => {
  const { id, seq } = await firing()
  await ask({ method: 'PATCH', path: `/api/counters/${id}`, body: { action: { kind: 'job', job: 'review-panel.timing' }, because: 'Synthetic latest action edit after firing.' } })
  expect(await tick(id)).toMatchObject({ status: 'answered', seq })
  expect((await row(id, seq)).answer.finished).toBe(true)
  const state = JSON.parse(readFileSync(join(workdir, 'producer', 'state.json'), 'utf8'))
  expect(state.lastStartedAtMs).toBe(now)
  const saved = JSON.parse(readFileSync(journal(id, seq), 'utf8'))
  expect(saved.job).toBe(job)
  // The counter alone spaces the runs: a firing 31 minutes later on a new main runs the suite at once.
  git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'Synthetic next main')
  now += 31 * 60_000
  const next = await firing()
  expect(await tick(next.id)).toMatchObject({ status: 'answered', seq: next.seq })
  expect(cloudCalls).toBe(2); expect(receipts()).toHaveLength(2)
})

it('selects the oldest unfinished firing beyond a page and performs only one per poll', async () => {
  const { id, seq } = await firing()
  for (let i = 0; i < 26; i++) { now += 9000_000; counters.fireTheCountersThatAreDue(new Date(now)) }
  const result = await tick(id)
  expect(result.seq).toBe(seq)
  expect(answers).toBe(1); expect(cloudCalls).toBe(0)
  const pages = calls.filter(one => one.path.startsWith(`/api/counters/${id}?`))
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.every(one => new URL(one.path, 'http://synthetic.invalid').searchParams.get('limit') === '25')).toBe(true)
  const second = await tick(id)
  expect(second.seq).toBeGreaterThan(seq); expect(answers).toBe(2); expect(cloudCalls).toBe(0)
})

it('refuses a repeated firing cursor before launching the producer', async () => {
  const { id } = await firing()
  intercept = async (asked, answer) => {
    if (asked.path.startsWith(`/api/counters/${id}?`)) {
      const value = JSON.parse(answer.body); value.more = true
      if (asked.path.includes('before=')) value.rows = [{ ...value.rows[0], seq: Number(new URL(asked.path, 'http://synthetic.invalid').searchParams.get('before')) }]
      return { ...answer, body: JSON.stringify(value) }
    }
    return answer
  }
  await expect(tick(id)).rejects.toThrow('cursor')
  expect(cloudCalls).toBe(0); expect(answers).toBe(0)
})

/**
 * THE NEXT TIME A ZONE'S CLOCKS GO BACK after a moment, and how long the hour that comes twice lasts. Worked out from
 * Intl hour by hour, so no date is copied into this file, and none goes stale.
 */
function theNextFallBack(zone: string, after: number): { at: number; fold: number } {
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longOffset' })
  const offset = (ms: number): number => {
    const name = format.formatToParts(ms).find(part => part.type === 'timeZoneName')?.value ?? ''
    const parts = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name)
    if (parts === null) throw new Error(`Intl named an offset this test cannot read: ${name}`)
    return parts[1] === undefined ? 0 : (parts[1] === '-' ? -1 : 1) * (Number(parts[2]) * 60 + Number(parts[3])) * 60_000
  }
  const hour = 3600_000
  for (let ms = Math.floor(after / hour) * hour; ms < after + 2 * 366 * 24 * hour; ms += hour) {
    if (offset(ms + hour) >= offset(ms)) continue
    let earlier = ms, later = ms + hour
    while (later - earlier > 1) { const middle = Math.floor((earlier + later) / 2); if (offset(middle) === offset(ms)) earlier = middle; else later = middle }
    return { at: later, fold: offset(ms) - offset(later) }
  }
  throw new Error(`${zone} has no night when its clocks go back in the next two years.`)
}

/** A start after the real time such that the moment `later` ms after it falls in the middle of the hour that comes twice, on its second pass. */
function aStartThatPutsInTheRepeatedHour(zone: string, later: number): number {
  for (let after = Date.now(); ;) {
    const back = theNextFallBack(zone, after)
    const start = back.at + back.fold / 2 - later
    if (start > Date.now() + 1000) return start
    after = back.at + 1
  }
}

/**
 * ONE CASE, FROM THE REAL TIME AND ACROSS THE NIGHT THE CLOCKS GO BACK, each run named so that a red names its run. The
 * second run is in Europe/London, where the office this was seen in keeps its time; a zone with no such night, UTC
 * among them, could never show it. The zone is put back in `finally`, so no later case runs in it.
 */
function fromTheRealTimeAndAcrossTheClockChange(name: string, later: number, body: () => Promise<void>): void {
  for (const { run, zone, start } of [
    { run: 'real time', zone: undefined, start: () => now },
    { run: 'hour that comes twice', zone: 'Europe/London', start: () => aStartThatPutsInTheRepeatedHour('Europe/London', later) },
  ]) it(`${name} (${run})`, async () => {
    const zoneBefore = process.env.TZ
    try {
      if (zone !== undefined) process.env.TZ = zone
      now = start()
      await body()
    } finally {
      if (zoneBefore === undefined) delete process.env.TZ
      else process.env.TZ = zoneBefore
    }
  })
}

const triggersOf = (counter: { triggers: { kind: string; n?: number; hours?: number }[] }) => counter.triggers.map(one => one.kind === 'count' ? { kind: one.kind, n: one.n } : { kind: one.kind, hours: one.hours })

it('puts the triggers the two settings name back on a changed counter, says why, and then runs its firing', async () => {
  const { id, seq } = await firing()
  await ask({ method: 'PATCH', path: `/api/counters/${id}`, body: { triggers: [{ kind: 'count', n: 1 }], because: 'Synthetic trigger change by hand.' } })
  expect(await tick(id)).toMatchObject({ status: 'answered', seq })
  const patches = calls.filter(one => one.method === 'PATCH')
  expect(patches.map(one => one.path)).toEqual([`/api/counters/${id}`])
  const body = patches[0]!.body as { triggers: unknown; because: string }
  expect(body.triggers).toEqual([{ kind: 'count', n: 6 }, { kind: 'every', hours: 2.5 }])
  expect(body.because).toContain('MOLE_OFFICE_MAIN_SUITE_LANDINGS'); expect(body.because).toContain('MOLE_OFFICE_MAIN_SUITE_HOURS')
  expect(triggersOf((await ask({ method: 'GET', path: `/api/counters/${id}?limit=1` })).counter)).toEqual([{ kind: 'count', n: 6 }, { kind: 'every', hours: 2.5 }])
  expect(cloudCalls).toBe(1)
  // A counter that already says what the settings say is left alone.
  expect(await tick(id)).toMatchObject({ status: 'idle' })
  expect(calls.filter(one => one.method === 'PATCH')).toHaveLength(1)
})

it('refuses a firing when the counter does not take the triggers the two settings name, without answering it', async () => {
  const { id, seq } = await firing()
  intercept = async (asked, answer) => {
    if (asked.path !== `/api/counters/${id}` && !asked.path.startsWith(`/api/counters/${id}?`)) return answer
    const value = JSON.parse(answer.body); value.counter.triggers = [{ kind: 'count', n: 1, words: 'Synthetic', holdsNow: false }]
    return { ...answer, body: JSON.stringify(value) }
  }
  await expect(tick(id)).rejects.toThrow('the two settings name')
  intercept = null
  expect(calls.filter(one => one.method === 'PATCH')).toHaveLength(1)
  expect((await row(id, seq)).answer.finished).toBe(false); expect(cloudCalls).toBe(0)
})

it('waits in the seat\'s line inside the poll, stays pending when asked to stop, and answers skipped when the firing\'s time ends', async () => {
  const { id, seq } = await firing()
  const since = now
  const dueAt = now + 9000_000
  const stepsWhileWaiting: string[] = []
  await whileAnotherRunHoldsTheSeat(async () => {
    const stop = new AbortController()
    const stopped = await mainSuiteJobTick({ ...options(id), signal: stop.signal }, { ...io(), sleep: async (ms: number) => {
      expect(ms).toBe(SEAT_ASKED_AGAIN_EVERY_MS)
      stepsWhileWaiting.push(JSON.parse(readFileSync(journal(id, seq), 'utf8')).step)
      now += ms; stop.abort()
    } })
    expect(stopped).toMatchObject({ status: 'pending', seq })
    expect(stopped.says).toContain('asked to stop while it waited for the full-suite seat')
    expect(stopped.says).toContain(`from ${localStamp(new Date(since))} until ${localStamp(new Date(now))}`)
    expect(stopped.says).toContain(`number 1 in line when it last asked, at ${localStamp(new Date(since))}`)
    expect(stopped.says).toContain(`until ${localStamp(new Date(dueAt))}, at most ${Math.ceil((dueAt - now) / 60_000)} more minutes`)
    expect((await row(id, seq)).answer.finished).toBe(false)
    expect(producersSlotRows().n).toBe(0)
    // The next poll waits again, and its wait ends with the firing's time.
    expect(await mainSuiteJobTick(options(id), { ...io(), sleep: async () => { now = dueAt } })).toMatchObject({ status: 'answered', seq })
  })
  expect(stepsWhileWaiting).toEqual(['in line'])
  const completed = (await row(id, seq)).answer
  expect(completed.says).toContain('skipped'); expect(completed.says).toContain('seat was taken for the whole wait')
  expect(completed.says).toContain(`number 1 in line when it last asked, at ${localStamp(new Date(dueAt))}`)
  expect(completed.says).toContain('No poll waits for this firing any longer')
  expect(completed.ids).toEqual([]); expect(cloudCalls).toBe(0)
  const asks = calls.filter(one => one.path === '/api/slots/acquire')
  expect(asks.length).toBeGreaterThan(2)
  expect(asks.every(one => (one.body as { resource: string }).resource === resource)).toBe(true)
  expect(producersSlotRows().n).toBe(0)
})

it('takes a poll that ended in the seat\'s line for one that started no suite', async () => {
  const { id, seq } = await firing()
  const since = now
  mkdirSync(workdir, { recursive: true })
  writeFileSync(journal(id, seq), JSON.stringify({ version: 1, counter: id, seq, job, firedAt: (await row(id, seq)).at, repository, step: 'in line', inLineSince: since }))
  // Before the firing's time ends, the next poll asks for the seat again and runs the suite.
  const ran = await tick(id)
  expect(ran).toMatchObject({ status: 'answered', seq, result: receipts()[0]!.id })
  expect(cloudCalls).toBe(1)
  // After it, the firing is answered skipped, and the answer says what the journal shows.
  const late = await firing()
  writeFileSync(journal(late.id, late.seq), JSON.stringify({ version: 1, counter: late.id, seq: late.seq, job, firedAt: (await row(late.id, late.seq)).at, repository, step: 'in line', inLineSince: since }))
  now += 9000_000
  expect(await tick(late.id)).toMatchObject({ status: 'answered', seq: late.seq })
  const says = (await row(late.id, late.seq)).answer.says
  expect(says).toContain('skipped')
  expect(says).toContain(`A poll waited in the seat's line from ${localStamp(new Date(since))} and ended without a result, before any suite started.`)
  expect(cloudCalls).toBe(1)
})

it('registers its own process group for the seat when no process row is named, and lets the row go at the end', async () => {
  const { id, seq } = await firing()
  // The runner's own group must not be put in line. The seat tests above give back every seat and place they take; this asks for
  // group 700's seat and gives it back, so the test does not depend on that.
  const held = await ask({ method: 'POST', path: '/api/slots/acquire', body: { pool: 'full-suite', resource, detail: 'Synthetic seat given back' } })
  await ask({ method: 'POST', path: `/api/slots/${held.slot.id as string}/release`, body: { note: 'Synthetic seat given back before the runner registers its own group.' } })
  resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP, fixtureGroup(process.pid, process.pid, 'Synthetic runner leading its own group')])))
  try {
    const { processResource: _named, ...unnamed } = options(id)
    expect(await mainSuiteJobTick(unnamed, io())).toMatchObject({ status: 'answered', seq })
  } finally { resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP]))) }
  const registered = calls.filter(one => one.method === 'POST' && one.path === '/api/resources')
  expect(registered.map(one => one.body)).toEqual([expect.objectContaining({ type: 'process', key: String(process.pid), sessionRecordId: env.MOLE_OFFICE_SESSION })])
  const acquired = calls.find(one => one.path === '/api/slots/acquire')?.body as { resource: string }
  expect(typeof acquired.resource).toBe('string'); expect(acquired.resource).not.toBe(resource)
  const released = calls.filter(one => one.path === `/api/resources/${acquired.resource}/release`)
  expect(released.map(one => one.body)).toEqual([{ signalNothing: true }])
  expect(calls.indexOf(released[0]!)).toBeGreaterThan(calls.findIndex(one => one.path === '/api/slots/acquire'))
  expect(cloudCalls).toBe(1)
})

it('refuses to register a process group it does not lead, lets that row go, and leaves the firing unanswered', async () => {
  const { id, seq } = await firing()
  resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP, fixtureGroup(4242, 4242, 'Synthetic outer group'), fixtureGroup(process.pid, 4242, 'Synthetic runner inside another group')])))
  try {
    const { processResource: _named, ...unnamed } = options(id)
    await expect(mainSuiteJobTick(unnamed, io())).rejects.toThrow(/own process group|setsid/)
  } finally { resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP]))) }
  const registered = calls.filter(one => one.method === 'POST' && one.path === '/api/resources')
  expect(registered).toHaveLength(1)
  expect(calls.filter(one => one.method === 'POST' && /^\/api\/resources\/[^/]+\/release$/.test(one.path)).map(one => one.body)).toEqual([{ signalNothing: true }])
  expect(calls.some(one => one.path === '/api/slots/acquire')).toBe(false)
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).step).not.toBe('running')
  expect((await row(id, seq)).answer.finished).toBe(false); expect(cloudCalls).toBe(0)
})

/**
 * AN OFFICE THAT TAKES ITS CALLS ONE AT A TIME AND LEAVES ONE UNANSWERED, as the live office does while a run-finishing
 * write holds its request thread. The poll's real transport runs over a stand-in fetch. Each call waits until the one
 * before it has ended, then reaches the test office. The call `unanswered` picks is taken by the office and its answer
 * is then lost, as when the call's wait is up, so the poll sees an office that did not answer. Each call keeps how many
 * others were still out when it was asked, and the unanswered one keeps whether the poll's lock was there meanwhile.
 */
function aStallingOffice(unanswered: (one: { method: string; path: string }) => boolean) {
  const asked: { method: string; path: string; alongside: number }[] = []
  let out = 0
  let turn: Promise<void> = Promise.resolve()
  let lockWhileUnanswered: boolean | null = null
  const standInFetch: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url))
    const one = { method: String(init?.method), path: parsed.pathname + parsed.search, alongside: out }
    asked.push(one)
    out += 1
    const before = turn
    let ended!: () => void
    turn = new Promise<void>((resolve) => { ended = resolve })
    try {
      await before
      const response = await server.app.inject({ method: one.method as 'GET' | 'POST' | 'PATCH', url: one.path,
        headers: init?.headers as Record<string, string>, ...(init?.body === undefined ? {} : { payload: String(init.body) }) })
      if (unanswered(one)) {
        // What the poll does while this call is out, it does now.
        await new Promise((resolve) => setImmediate(resolve))
        lockWhileUnanswered = existsSync(join(workdir, 'poll.lock'))
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
      return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> })
    } finally {
      out -= 1
      ended()
    }
  }
  return { officeRequest: (request: ARequest) => producerOfficeRequest(request, env, standInFetch), asked, lockWhileUnanswered: () => lockWhileUnanswered }
}

/**
 * One poll over a stalling office, with the runner's own process row, as the host timer starts it. It answers how the
 * poll ended, and every rejection that nothing handled while it ran: on the host timer such a rejection ends the Node
 * process at once, before the outer finally removes the lock.
 */
async function aPollWithItsOwnRowOver(office: ReturnType<typeof aStallingOffice>, id: string) {
  // As in the case above, group 700's seat is asked for and given back, so the runner's own group is not put in line.
  const held = await ask({ method: 'POST', path: '/api/slots/acquire', body: { pool: 'full-suite', resource, detail: 'Synthetic seat given back' } })
  await ask({ method: 'POST', path: `/api/slots/${held.slot.id as string}/release`, body: { note: 'Synthetic seat given back before the runner registers its own group.' } })
  const unhandled: unknown[] = []
  const noted = (reason: unknown) => { unhandled.push(reason) }
  process.on('unhandledRejection', noted)
  resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP, fixtureGroup(process.pid, process.pid, 'Synthetic runner leading its own group')])))
  try {
    const { processResource: _named, ...unnamed } = options(id)
    const ended = await mainSuiteJobTick(unnamed, { ...io(), officeRequest: office.officeRequest }).then(() => null, (error: unknown) => error)
    // Node reports a rejection nothing handled after the turn it was made in.
    await new Promise((resolve) => setImmediate(resolve))
    return { ended, unhandled }
  } finally {
    process.off('unhandledRejection', noted)
    resources.useOsProbe(syntheticProbe(new Map([THE_FIXTURE_GROUP])))
  }
}

const theRowsRelease = (one: { method: string; path: string }) => one.method === 'POST' && /^\/api\/resources\/[^/]+\/release$/.test(one.path)
/** What every poll below shows once it has ended: refused, each call asked only after the one before it ended, and no lock left. */
async function endsWithItsLockGone(office: ReturnType<typeof aStallingOffice>, poll: { ended: unknown; unhandled: unknown[] }, id: string, seq: number) {
  expect((poll.ended as Error | null)?.name).toBe('TheOfficeDidNotAnswer')
  expect(poll.unhandled).toEqual([])
  expect(office.asked.filter((one) => one.alongside > 0)).toEqual([])
  expect(office.asked.filter(theRowsRelease)).toHaveLength(1)
  expect(office.lockWhileUnanswered()).toBe(true)
  expect(existsSync(join(workdir, 'poll.lock'))).toBe(false)
  // The office took the unanswered call, so the firing is answered, and the next poll is let in and finds nothing pending.
  expect((await row(id, seq)).answer.finished).toBe(true)
  expect(await tick(id)).toMatchObject({ status: 'idle' })
}

it('removes its lock when a failed producer\'s answer goes unanswered, and lets its own row go only after that answer ended', async () => {
  const { id, seq } = await firing(); mode = 'interrupted'
  const office = aStallingOffice((one) => one.method === 'POST' && one.path === `/api/counters/${id}/firings/${seq}/answer`)
  const poll = await aPollWithItsOwnRowOver(office, id)
  expect(typeof JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure).toBe('string')
  await endsWithItsLockGone(office, poll, id, seq)
  expect(cloudCalls).toBe(1)
})

it('removes its lock when the answer of a suite not run goes unanswered, and lets its own row go only after that answer ended', async () => {
  const { id, seq } = await firing(); mode = 'busy'
  const office = aStallingOffice((one) => one.method === 'POST' && one.path === `/api/counters/${id}/firings/${seq}/answer`)
  const poll = await aPollWithItsOwnRowOver(office, id)
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8'))).toMatchObject({ step: 'answering' })
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure).toBeUndefined()
  await endsWithItsLockGone(office, poll, id, seq)
  expect(cloudCalls).toBe(1)
})

it('removes its lock when the release of its own row goes unanswered, after the firing\'s answer was confirmed', async () => {
  const { id, seq } = await firing(); mode = 'busy'
  const office = aStallingOffice(theRowsRelease)
  const poll = await aPollWithItsOwnRowOver(office, id)
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8'))).toMatchObject({ step: 'answered' })
  expect(office.asked.findIndex(theRowsRelease)).toBeGreaterThan(office.asked.findIndex((one) => one.path === `/api/counters/${id}/firings/${seq}/answer`))
  await endsWithItsLockGone(office, poll, id, seq)
  expect(cloudCalls).toBe(1)
})

it('files the counter the two settings describe once, and names the setting that turns it on', async () => {
  type Cli = (words: string[], env: NodeJS.ProcessEnv, signal: AbortSignal | undefined, supplied: ReturnType<typeof io>) => Promise<any>
  const cli = runMainSuiteJobCli as unknown as Cli
  const unset: NodeJS.ProcessEnv = { ...env, MOLE_OFFICE_MAIN_SUITE_LANDINGS: '4' }
  delete unset.MOLE_OFFICE_MAIN_SUITE_COUNTER
  const filed = await cli(['--file-the-counter', '--repository', repository], unset, undefined, io())
  expect(filed).toMatchObject({ status: 'filed', counter: expect.any(String) })
  const id = filed.counter as string
  expect(filed.says).toContain(`MOLE_OFFICE_MAIN_SUITE_COUNTER=${id}`)
  const read = (await ask({ method: 'GET', path: `/api/counters/${id}?limit=1` })).counter
  expect(read.follows.map(({ event, lane }: { event: string; lane: string }) => ({ event, lane }))).toEqual([{ event: 'landing', lane: repository }])
  expect(triggersOf(read)).toEqual([{ kind: 'count', n: 4 }, { kind: 'every', hours: 2.5 }])
  expect(read.action).toMatchObject({ kind: 'job', job })
  await expect(cli(['--file-the-counter', '--repository', repository], { ...unset, MOLE_OFFICE_MAIN_SUITE_COUNTER: id }, undefined, io())).rejects.toThrow('already')
  expect(calls.filter(one => one.method === 'POST' && one.path === '/api/counters')).toHaveLength(1)
})

it('retries a verified receipt after an answer was lost before delivery without another suite or receipt', async () => {
  const { id, seq } = await firing()
  let dropped = false
  // A refused transport does not cross the product door on this first answer.
  const transport = io()
  const firstOffice = transport.officeRequest
  transport.officeRequest = async asked => {
    if (!dropped && asked.method === 'POST' && asked.path.endsWith('/answer')) { dropped = true; return { status: 503, location: null, cut: false, body: '{}', added: null } }
    return firstOffice(asked)
  }
  await expect(mainSuiteJobTick(options(id), transport)).rejects.toThrow('answer is unverified')
  expect((await row(id, seq)).answer.finished).toBe(false)
  const saved = JSON.parse(readFileSync(journal(id, seq), 'utf8'))
  expect(saved.result.evidence.seq).toBe(1)
  git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'Synthetic main changed while original answer was pending')
  now += 60_000
  expect(await tick(id)).toMatchObject({ status: 'answered', seq, result: receipts()[0]!.id })
  expect(cloudCalls).toBe(1); expect(receipts()).toHaveLength(1); expect(answers).toBe(1)
})

it('observes an answer committed before its reply was lost and never posts a duplicate answer', async () => {
  const { id, seq } = await firing()
  intercept = async (asked, answer) => asked.method === 'POST' && asked.path.endsWith('/answer') ? { ...answer, status: 503 } : answer
  await expect(tick(id)).rejects.toThrow('answer is unverified')
  expect((await row(id, seq)).answer.finished).toBe(true)
  intercept = null
  expect(await tick(id)).toMatchObject({ status: 'idle' })
  expect(answers).toBe(1); expect(cloudCalls).toBe(1); expect(receipts()).toHaveLength(1)
})

it('finds the original receipt after latest identity and outcomes are edited', async () => {
  const { id } = await firing(); mode = 'red'
  await tick(id)
  const receipt = receipts()[0]!
  await ask({ method: 'PATCH', path: `/api/records/${receipt.id}`, body: { dataPatch: { commit: 'f'.repeat(40), repository: '/synthetic/edited', suiteExitCode: 0, failedFiles: [], failedTests: [] } } })
  mode = 'green'
  const result = await runPeriodicSuiteOnce({ ...options(id), workdir: join(workdir, 'producer') }, io())
  expect(result).toMatchObject({ status: 'skipped', receipt: receipt.id, green: false, outcome: 'red' })
  expect(cloudCalls).toBe(1)
  expect(calls.filter(one => one.path.startsWith('/api/records?')).every(one => !one.path.includes('q='))).toBe(true)
})

it('rechecks original receipt under the acquired seat before another producer can run it', async () => {
  const { id } = await firing()
  const prior = await runPeriodicSuiteOnce({ ...options(id), workdir: join(root, 'other-producer') }, io())
  const receipt = receipts()[0]!
  let listReads = 0
  intercept = async (asked, answer) => {
    if (asked.path.startsWith('/api/records?') && ++listReads === 1) {
      const value = JSON.parse(answer.body); value.records = value.records.filter((one: any) => one.id !== receipt.id); value.returned = value.records.length
      return { ...answer, body: JSON.stringify(value) }
    }
    return answer
  }
  const found = await runPeriodicSuiteOnce({ ...options(id), workdir: join(root, 'late-producer') }, io())
  expect(found).toMatchObject({ status: 'skipped', receipt: prior.receipt })
  expect(listReads).toBe(2); expect(cloudCalls).toBe(1); expect(receipts()).toHaveLength(1)
})

it('does not treat latest receipt identity edits as an original run on a new commit', async () => {
  const { id } = await firing()
  await runPeriodicSuiteOnce({ ...options(id), workdir: join(root, 'first-producer') }, io())
  const receipt = receipts()[0]!
  git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'Synthetic distinct main commit')
  const nextCommit = git('-C', repository, 'rev-parse', 'HEAD')
  await ask({ method: 'PATCH', path: `/api/records/${receipt.id}`, body: { dataPatch: { commit: nextCommit } } })
  const result = await runPeriodicSuiteOnce({ ...options(id), workdir: join(root, 'next-producer') }, io())
  expect(result).toMatchObject({ status: 'filed', commit: nextCommit })
  expect(result.receipt).not.toBe(receipt.id)
  expect(cloudCalls).toBe(2); expect(receipts()).toHaveLength(2)
})

it('answers honest cloud refusal and interruption with logs while unfinished producer recovery stays supervised', async () => {
  const { id, seq } = await firing(); mode = 'busy'
  const busy = await tick(id)
  expect(busy.says).toContain('not run'); expect((await row(id, seq)).answer.ids).toEqual([])
  const next = await firing(); mode = 'interrupted'
  const stopped = await tick(next.id)
  expect(stopped.status).toBe('failed'); expect(stopped.says).toContain('supervised recovery')
  const state = JSON.parse(readFileSync(join(workdir, 'producer', 'state.json'), 'utf8'))
  expect(state.pending).not.toBeNull(); expect(stopped.says).toContain(join(workdir, 'producer'))
  await expect(runPeriodicSuiteOnce({ ...options(id), workdir: join(workdir, 'producer') }, io())).rejects.toThrow('unfinished')
  expect(cloudCalls).toBe(2); expect(receipts()).toHaveLength(0)
})

it('ends a hung run\'s attempt with its records kept and no receipt, names the hung file and wait, and lets the next firing run', async () => {
  const { id, seq } = await firing(); mode = 'hung'
  expect(await tick(id)).toMatchObject({ status: 'failed' })
  expect((await row(id, seq)).answer.ids).toEqual([])
  const state = JSON.parse(readFileSync(join(workdir, 'producer', 'state.json'), 'utf8'))
  expect(state).toMatchObject({ pending: null, lastStartedAtMs: now })
  const kept = readdirSync(join(workdir, 'producer')).filter(name => name.startsWith('attempt-')).map(name => join(workdir, 'producer', name, 'hung.json'))
  expect(kept).toHaveLength(1)
  expect(JSON.parse(readFileSync(kept[0]!, 'utf8'))).toEqual(HUNG)
  const failure = JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure
  expect(failure).toContain(HUNG.workers[0]!.file); expect(failure).toContain(HUNG.workers[0]!.wait); expect(failure).toContain(kept[0])
  expect(receipts(), 'the report written while tests ran is not filed as counts').toHaveLength(0)
  const next = await firing(); mode = 'green'
  expect(await tick(next.id)).toMatchObject({ status: 'answered', seq: next.seq })
  expect(cloudCalls).toBe(2); expect(receipts()).toHaveLength(1)
})

it('refuses unavailable or partial original artifacts and never answers them as verified outcomes', async () => {
  const { id, seq } = await firing(); mode = 'partial'
  expect(await tick(id)).toMatchObject({ status: 'failed' })
  expect((await row(id, seq)).answer.ids).toEqual([])
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure).toContain('partial coverage')
  const receipt = receipts()[0]!
  rmSync((receipt.data.artifacts as { name: string; path: string }[]).find(one => one.name === 'log')!.path)
  expect(await tick(id)).toMatchObject({ status: 'idle' })
  await expect(runPeriodicSuiteOnce({ ...options(id), workdir: join(root, 'unavailable-evidence') }, io())).rejects.toThrow('inaccessible')
  expect(answers).toBe(1); expect(cloudCalls).toBe(1)
})

it('refuses masked original evidence and keeps its private firing journal for inspection', async () => {
  const { id, seq } = await firing()
  intercept = async (asked, answer) => {
    if (asked.path.endsWith('/revisions/1')) {
      const value = JSON.parse(answer.body)
      if (value.content?.data?.repository === repository) {
        value.who.actorId = A_KEY_SHOWN_AS
        return { ...answer, body: JSON.stringify(value) }
      }
    }
    return answer
  }
  expect(await tick(id)).toMatchObject({ status: 'failed' })
  expect((await row(id, seq)).answer.ids).toEqual([])
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure).toMatch(/masked|pinned revision|original receipt create/)
  expect(existsSync(journal(id, seq))).toBe(true)
  expect(readdirSync(workdir)).not.toContain('poll.lock')
  expect(cloudCalls).toBe(1); expect(answers).toBe(1)
})

it('skips a first poll after the next due time before any producer or cloud attempt', async () => {
  const { id, seq } = await firing(); now += 9000_000
  expect(await tick(id)).toMatchObject({ status: 'answered', seq })
  expect((await row(id, seq)).answer.says).toContain('already due before this poll')
  expect(existsSync(join(workdir, 'producer'))).toBe(false)
  expect(cloudCalls).toBe(0); expect(answers).toBe(1)
})

it('uses the published anchored next due time and refuses an unavailable schedule', async () => {
  const { id, seq } = await firing()
  const published = (await ask({ method: 'GET', path: `/api/counters/${id}?limit=25` })).counter.nextDue.at
  mode = 'busy'
  // THE INSTANT IS WHAT THE TOOL ACTS ON, so only the instant is rewritten and the stamp is left as published.
  const rewritten = new Date(now + 1000).toISOString()
  intercept = async (asked, answer) => {
    if (asked.path.startsWith(`/api/counters/${id}?`)) {
      const value = JSON.parse(answer.body)
      value.counter.nextDue = { ...value.counter.nextDue, instant: rewritten }
      return { ...answer, body: JSON.stringify(value) }
    }
    return answer
  }
  expect(published).toBe(localStamp(new Date(now + 9000_000)))
  expect(await tick(id)).toMatchObject({ status: 'answered', seq })
  // Busy cloud is a terminal "not run", with the Office's authoritative due stamp.
  expect((await row(id, seq)).answer.says).toContain(localStamp(new Date(Date.parse(rewritten))))
  const next = await firing()
  // A REPLY WITH THE STAMP AND NO INSTANT IS REFUSED, never read from the stamp instead.
  let stampLeft: unknown
  intercept = async (asked, answer) => {
    if (asked.path.startsWith(`/api/counters/${next.id}?`)) {
      const value = JSON.parse(answer.body); delete value.counter.nextDue.instant; stampLeft = value.counter.nextDue.at
      return { ...answer, body: JSON.stringify(value) }
    }
    return answer
  }
  await expect(tick(next.id)).rejects.toThrow('defensible next due time')
  expect(stampLeft, 'the refused reply had no stamp to fall back on').toBe(localStamp(new Date(now + 9000_000)))
  expect(cloudCalls).toBe(1)
})

/**
 * THE FIRING'S MOMENT ON THE NIGHT THE CLOCKS GO BACK (13q item 1g), on a fixed clock in Europe/London. The clock is
 * faked for the office as well as for the poll, and both are put back at the end. On 25 Oct 2026 the wall clock there
 * reads 01:00 to 02:00 twice, so a firing at 00:30 UTC and one at 01:30 UTC both have the stamp 01:30.
 * The counter's page comes in three shapes. `published` carries on each row the instant the office keeps for it in its
 * own table: the page carries none until 13r publishes it, so this stands in for that change. `not published` carries
 * none, as an office from before that change answers. `not kept` carries null, as for a row written before the office
 * kept an instant. The every trigger is half an hour, so each poll after a firing's due time answers it as skipped and
 * no producer starts.
 */
it('reads a firing\'s moment from the instant the office publishes, and from its stamp as the later moment when it publishes none', async () => {
  const at = (hour: number, minute: number) => Date.UTC(2026, 9, 25, hour, minute)
  const stored = (made: { id: string; seq: number }) => (db.client.sqlite.prepare('SELECT at_instant AS atInstant FROM counter_rows WHERE counter_id = ? AND seq = ?').get(made.id, made.seq) as { atInstant: string | null }).atInstant
  const shapes = ['published', 'not published', 'not kept'] as const
  type Shape = typeof shapes[number]
  const shapeOf = new Map<string, Shape>()
  const refusal = async (id: string): Promise<string> => {
    try { await tick(id) } catch (error) { return (error as Error).message }
    throw new Error(`The poll of counter ${id} was let in.`)
  }
  const zoneBefore = process.env.TZ
  try {
    process.env.TZ = 'Europe/London'
    vi.useFakeTimers({ toFake: ['Date'], now: at(0, 29) })
    env.MOLE_OFFICE_MAIN_SUITE_HOURS = '0.5'
    // A poll let in by mistake meets a busy cloud box and answers "not run" at once, so a red here is quick.
    mode = 'busy'
    intercept = async (asked, answer) => {
      const id = [...shapeOf.keys()].find(one => asked.path.startsWith(`/api/counters/${one}?`))
      if (asked.method !== 'GET' || id === undefined) return answer
      const value = JSON.parse(answer.body)
      for (const one of value.rows) {
        if (shapeOf.get(id) === 'published') one.atInstant = stored({ id, seq: one.seq })
        else if (shapeOf.get(id) === 'not kept') one.atInstant = null
        else delete one.atInstant
      }
      return { ...answer, body: JSON.stringify(value) }
    }
    // Each counter is filed at `filed`, before its firing, and fires at `moment`.
    const fireEach = async (filed: number, moment: number): Promise<Map<Shape, { id: string; seq: number }>> => {
      const made = new Map<Shape, { id: string; seq: number }>()
      for (const shape of shapes) {
        vi.setSystemTime(filed); now = moment
        const one = await firing(0.5)
        shapeOf.set(one.id, shape); made.set(shape, one)
        expect(Date.parse(stored(one) ?? ''), `${shape}: the office keeps the firing's moment`).toBe(moment)
      }
      return made
    }
    const clock = (moment: number) => { vi.setSystemTime(moment); now = moment }

    // THE FIRST PASS: 01:30 BST, which is 00:30 UTC. A poll at 01:10 GMT comes after it. The office reads a counter
    // filed in the first pass of the hour as filed in the second, and so as due no earlier than that, so these counters
    // are filed at 00:59:58 BST, before the hour.
    const first = await fireEach(at(0, 0) - 2000, at(0, 30))
    const stamp = (await row(first.get('published')!.id, first.get('published')!.seq)).at as string
    clock(at(1, 10))
    for (const shape of shapes) {
      const made = first.get(shape)!
      if (shape === 'published') {
        const result = await tick(made.id)
        expect(result, shape).toMatchObject({ status: 'answered', seq: made.seq, firingMoment: { readFrom: 'atInstant' } })
        expect(result.firingMoment.says, shape).toContain(stored(made))
        expect((await row(made.id, made.seq)).answer.says, shape).toContain(THE_NEXT_FIRING_WAS_ALREADY_DUE)
        continue
      }
      // THE STAMP ALONE NAMES TWO MOMENTS, and the later one, 01:30 GMT, is still to come, so this poll is refused.
      const refused = await refusal(made.id)
      expect(refused, shape).toContain(THE_POLL_PRECEDES_ITS_FIRING)
      expect(refused, shape).toContain(stamp)
      expect(refused, shape).toContain(shape === 'not published' ? A_FIRINGS_MOMENT_FROM_ITS_STAMP.notPublished : A_FIRINGS_MOMENT_FROM_ITS_STAMP.notKept)
      expect(refused, shape).toContain(A_FIRINGS_MOMENT_FROM_ITS_STAMP.twice)
      expect((await row(made.id, made.seq)).answer.finished, shape).toBe(false)
    }

    // THE SECOND PASS: 01:30 GMT, which is 01:30 UTC. The poll's clock reads 01:40 BST, fifty minutes before it.
    const second = await fireEach(at(1, 30) - 2000, at(1, 30))
    expect((await row(second.get('published')!.id, second.get('published')!.seq)).at, 'both firings have one stamp').toBe(stamp)
    clock(at(1, 30)); now = at(0, 40)
    for (const shape of shapes) {
      const made = second.get(shape)!
      const refused = await refusal(made.id)
      expect(refused, shape).toContain(THE_POLL_PRECEDES_ITS_FIRING)
      expect(refused, shape).toContain(shape === 'published' ? stored(made)! : stamp)
      expect((await row(made.id, made.seq)).answer.finished, shape).toBe(false)
    }

    // AFTER THE LATER MOMENT the stamp is let in, and the result says the moment was read from the stamp.
    clock(at(1, 40))
    for (const shape of ['not published', 'not kept'] as const) {
      const made = first.get(shape)!
      const result = await tick(made.id)
      expect(result, shape).toMatchObject({ status: 'answered', seq: made.seq, firingMoment: { readFrom: 'at' } })
      expect(result.firingMoment.says, shape).toContain(stamp)
      expect(result.firingMoment.says, shape).toContain(A_FIRINGS_MOMENT_FROM_ITS_STAMP.twice)
    }
    clock(at(2, 0))
    for (const shape of shapes) {
      const made = second.get(shape)!
      const result = await tick(made.id)
      expect(result, shape).toMatchObject({ status: 'answered', seq: made.seq, firingMoment: { readFrom: shape === 'published' ? 'atInstant' : 'at' } })
      expect((await row(made.id, made.seq)).answer.says, shape).toContain(THE_NEXT_FIRING_WAS_ALREADY_DUE)
    }
    expect(existsSync(join(workdir, 'producer'))).toBe(false)
    expect(cloudCalls).toBe(0)
  } finally {
    vi.useRealTimers()
    if (zoneBefore === undefined) delete process.env.TZ
    else process.env.TZ = zoneBefore
  }
})

fromTheRealTimeAndAcrossTheClockChange('keeps pending work through raw due until the actual counter publishes its later held-back boundary', 10800_000, async () => {
  const { id, seq } = await firing(2.5, 180)
  const firedAt = now
  now += 9000_000
  counters.fireTheCountersThatAreDue(new Date(now))
  const read = await ask({ method: 'GET', path: `/api/counters/${id}?limit=25` })
  expect(read.counter.nextDue.at).toBe(localStamp(new Date(now)))
  expect(read.counter.heldBack.until).toBe(localStamp(new Date(firedAt + 10800_000)))
  await whileAnotherRunHoldsTheSeat(async () => {
    const stop = new AbortController()
    const slept: number[] = []
    const pending = await mainSuiteJobTick({ ...options(id), signal: stop.signal }, { ...io(), sleep: async (ms: number) => { slept.push(ms); now += ms; stop.abort() } })
    expect(pending).toMatchObject({ status: 'pending', seq })
    // The raw due time has passed, and the producer still waits in line, because its time ends at the held-back boundary.
    expect(slept).toEqual([SEAT_ASKED_AGAIN_EVERY_MS])
    expect(pending.says).toContain('asked to stop while it waited for the full-suite seat')
    // It may wait until the held-back boundary, not only until the raw due time it has already passed.
    expect(pending.says).toContain(`until ${localStamp(new Date(firedAt + 10800_000))}, at most ${Math.ceil((firedAt + 10800_000 - now) / 60_000)} more minutes`)
    expect((await row(id, seq)).answer.finished).toBe(false)
    now = firedAt + 10800_000
    expect(await tick(id)).toMatchObject({ status: 'answered', seq })
  })
  expect((await row(id, seq)).answer.says).toContain('skipped')
  expect(cloudCalls).toBe(0)
})

it('refuses interrupted running recovery with an advancing clock, retained older receipt and changed main', async () => {
  const { id, seq } = await firing()
  await runPeriodicSuiteOnce({ ...options(id), workdir: join(workdir, 'producer') }, io())
  const old = receipts()[0]!
  git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'Synthetic changed main after interruption')
  writeFileSync(journal(id, seq), JSON.stringify({ version: 1, counter: id, seq, job, firedAt: (await row(id, seq)).at, repository, step: 'running', startedAtMs: now }))
  const result = await mainSuiteJobTick(options(id), { ...io(), clock: () => ++now })
  expect(result).toMatchObject({ status: 'failed', seq })
  expect((await row(id, seq)).answer.ids).toEqual([])
  expect(result.says).not.toContain(old.id)
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure).toContain('Neither timestamps nor a retained lastReceipt')
  expect(cloudCalls).toBe(1); expect(receipts()).toHaveLength(1)
})

it('executes the command the host timer runs, in plain Node, against the actual authenticated throwaway counter door', async () => {
  const made = await ask({ method: 'POST', path: '/api/counters', body: { title: `Synthetic CLI counter ${++number}`, label: 'Synthetic CLI clock', counts: 'Synthetic CLI requests.', triggers: [{ kind: 'count', n: 6 }, { kind: 'every', hours: 2.5, from: localStamp(new Date(now + 9000_000)) }], action: { kind: 'job', job } } })
  const address = await server.app.listen({ host: '127.0.0.1', port: 0 })
  const child = spawn(process.execPath, [resolve('tools/run-the-main-suite-job.mjs'), '--repository', repository, '--workdir', workdir], {
    env: { PATH: process.env.PATH, HOME: root, ...env, MOLE_OFFICE_API: address, MOLE_OFFICE_MAIN_SUITE_COUNTER: made.counter.id }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
  })
  let stdout = '', stderr = ''
  child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
  const exited = await new Promise<number | null>((yes, no) => { child.once('error', no); child.once('exit', yes) })
  expect(exited, stderr).toBe(0)
  expect(JSON.parse(stdout.trim().split('\n').at(-1)!)).toMatchObject({ status: 'idle' })
  expect(existsSync(join(workdir, 'producer'))).toBe(false); expect(cloudCalls).toBe(0)
})

it('checks original receipt discovery in bounded advancing pages even after finding a match', async () => {
  const { id } = await firing()
  const producer = { ...options(id), workdir: join(root, 'paged-producer') }
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', `Synthetic paged receipt ${i}`)
      now += 9000_000
    }
    expect(await runPeriodicSuiteOnce(producer, { ...io(), receiptPageSize: 2 })).toMatchObject({ status: 'filed' })
  }
  calls = []
  expect(await runPeriodicSuiteOnce(producer, { ...io(), receiptPageSize: 2 })).toMatchObject({ status: 'skipped', green: true })
  const pages = calls.filter(one => one.path.startsWith('/api/records?')).map(one => new URL(one.path, 'http://synthetic.invalid'))
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.every(one => one.searchParams.get('limit') === '2' && !one.searchParams.has('q'))).toBe(true)
  expect(pages.map(one => Number(one.searchParams.get('offset')))).toEqual(pages.map((_, index) => index * 2))
  expect(cloudCalls).toBe(3); expect(receipts()).toHaveLength(3)
})

it('refuses a regressing original receipt cursor without another suite or fabricated absence', async () => {
  const { id, seq } = await firing()
  await runPeriodicSuiteOnce({ ...options(id), workdir: join(root, 'cursor-receipt') }, io())
  intercept = async (asked, answer) => {
    if (asked.path.startsWith('/api/records?')) {
      const value = JSON.parse(answer.body)
      value.left = 1; value.next = 'GET /api/records?kind=whole_suite_receipt&shape=narrow&limit=25&offset=0'
      return { ...answer, body: JSON.stringify(value) }
    }
    return answer
  }
  expect(await tick(id)).toMatchObject({ status: 'failed', seq })
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure).toContain('cursor')
  expect((await row(id, seq)).answer.ids).toEqual([])
  expect(cloudCalls).toBe(1); expect(receipts()).toHaveLength(1)
})

it('refuses unavailable original artifacts on a pending answer retry without rerunning or borrowing another receipt', async () => {
  const { id, seq } = await firing()
  let dropped = false
  const transport = io()
  transport.officeRequest = async asked => {
    if (!dropped && asked.method === 'POST' && asked.path.endsWith('/answer')) { dropped = true; return { status: 503, location: null, cut: false, body: '{}', added: null } }
    return officeRequest(asked)
  }
  await expect(mainSuiteJobTick(options(id), transport)).rejects.toThrow('answer is unverified')
  const receipt = receipts()[0]!
  rmSync((receipt.data.artifacts as { name: string; path: string }[]).find(one => one.name === 'log')!.path)
  expect(await tick(id)).toMatchObject({ status: 'failed', seq })
  expect((await row(id, seq)).answer.ids).toEqual([])
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).failure).toContain('inaccessible')
  expect(await tick(id)).toMatchObject({ status: 'idle' })
  expect(cloudCalls).toBe(1); expect(receipts()).toHaveLength(1); expect(answers).toBe(1)
})

fromTheRealTimeAndAcrossTheClockChange('journals tracing of a verified red before its answer and reads the previous answered receipt from this counter', 9000_000, async () => {
  const { id } = await firing(); await tick(id)
  const previous = receipts()[0]!
  git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'Synthetic trace tip')
  now += 9000_000; counters.fireTheCountersThatAreDue(new Date(now)); mode = 'red'
  const page = await ask({ method: 'GET', path: `/api/counters/${id}?limit=25` })
  const next = page.rows.find((r: any) => r.what === 'firing' && r.answer?.finished === false)
  let traced = 0
  const landing = randomUUID(), problem = randomUUID()
  const result = await mainSuiteJobTick(options(id), { ...io(), traceMainSuiteReds: async (asked: any) => {
    traced++; expect(answers).toBe(1)
    expect(JSON.parse(readFileSync(journal(id, next.seq), 'utf8')).step).toBe('tracing')
    expect(asked.previousReceipt).toMatchObject({ id: previous.id, data: { commit: previous.data.commit } })
    expect(asked.receipt.data.failedFiles).toEqual(['tests/one.test.ts'])
    return { files: [{ file: 'tests/one.test.ts', status: 'traced', landing, problem, runs: [{ commit: previous.data.commit }], unvisited: [] }] }
  } })
  expect(traced).toBe(1); expect(result.status).toBe('answered')
  expect(result.says).toContain(landing); expect(result.says).toContain(problem); expect(result.says.length).toBeLessThanOrEqual(2000)
  expect(JSON.parse(readFileSync(journal(id, next.seq), 'utf8')).trace.files[0].problem).toBe(problem)
})
it('never traces a verified green receipt', async () => {
  const { id } = await firing(); let traced = 0
  const result = await mainSuiteJobTick(options(id), { ...io(), traceMainSuiteReds: async () => { traced++; throw new Error('A green receipt must not trace.') } })
  expect(result.status).toBe('answered'); expect(traced).toBe(0)
})
it('retries tracing without a saved result, then reuses a saved trace after a lost firing answer', async () => {
  const { id, seq } = await firing(); mode = 'red'; let traced = 0
  const supplied = { ...io(), traceMainSuiteReds: async () => {
    traced++
    if (traced === 1) throw new Error('Synthetic interrupted trace')
    return { files: [{ file: 'tests/one.test.ts', status: 'not traced', reason: 'no earlier receipt', runs: [], unvisited: [] }] }
  } }
  await expect(mainSuiteJobTick(options(id), supplied)).rejects.toThrow('Synthetic interrupted trace')
  expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).step).toBe('tracing'); expect(answers).toBe(0)
  now += 9000_000
  intercept = async (asked, answer) => asked.path.endsWith('/answer') ? { ...answer, status: 503 } : answer
  // A transport loss is simulated before the actual write so the firing stays pending.
  const lost = { ...supplied, officeRequest: async (asked: ARequest) => asked.path.endsWith('/answer') ? { status: 503, body: '{}', cut: false, location: null, added: [] } : officeRequest(asked) }
  await expect(mainSuiteJobTick(options(id), lost)).rejects.toThrow('unverified')
  expect(traced).toBe(2); expect(JSON.parse(readFileSync(journal(id, seq), 'utf8')).trace.files[0].reason).toBe('no earlier receipt')
  intercept = null
  expect((await mainSuiteJobTick(options(id), supplied)).status).toBe('answered')
  expect(traced).toBe(2); expect(cloudCalls).toBe(1)
})
fromTheRealTimeAndAcrossTheClockChange('an earlier firing receipt from another repository is unknown and never falls back to an older green start', 2 * 9000_000, async () => {
  const { id } = await firing(); await tick(id)
  const originalRepository = repository
  repository = join(root, 'other-main'); workdir = join(root, 'other-poll')
  git('clone', '--no-local', originalRepository, repository)
  now += 9000_000; counters.fireTheCountersThatAreDue(new Date(now)); await tick(id)
  const wrongRepositoryReceipt = receipts()[0]!
  repository = originalRepository; workdir = join(root, 'third-poll')
  git('-C', repository, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'Synthetic new red main')
  now += 9000_000; counters.fireTheCountersThatAreDue(new Date(now)); mode = 'red'
  let traced = 0
  const result = await mainSuiteJobTick(options(id), { ...io(), traceMainSuiteReds: async () => { traced++; throw new Error('An unproved baseline must not trace.') } })
  expect(traced).toBe(0); expect(result.status).toBe('answered'); expect(result.says).toContain('unknown'); expect(result.says).toContain('another repository')
  const state = JSON.parse(readFileSync(journal(id, result.seq), 'utf8'))
  expect(state.tracePrevious).toBe(wrongRepositoryReceipt.id)
  expect(state.trace.files[0]).toMatchObject({ status: 'unknown', reason: expect.stringContaining('another repository') })
  expect(cloudCalls).toBe(3)
})
