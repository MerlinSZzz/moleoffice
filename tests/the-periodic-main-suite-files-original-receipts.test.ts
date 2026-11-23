// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The real producer is driven against throwaway Git main branches and the real office API/database.
 * Cloud artifacts and the OS process table below are explicitly synthetic. No cloud, npm suite,
 * live database or listening server is involved; app.inject is the test office's HTTP boundary.
 *
 * THE READ RECORD (package RP): the producer packs an attempt's `reads/` into `reads.tar.zst` after the
 * suite and files a receipt naming the packed file. MUTATIONS: the folder removed before the archive's
 * proof: "packs the attempt read record ..." and "leaves the read folder ..." red, and two older cases
 * red as well because the later removal then found no folder.
 *
 * A RECEIPT LONGER THAN THE DEFAULT REPLY: the office answers the filing of a receipt with the whole record, and the
 * request helper hands back 60,000 characters unless a read asks for more. The filing asks for the evidence module's
 * reply length through the producer's own transport, so a long red receipt is filed and labelled. An answer cut even at
 * that length is still refused, and the filing is left unfinished.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { OsProbe, OsProcess } from '../src/server/lib/resources.ts'
import { PRODUCER_OFFICE_ANSWER_WAIT_MS, producerOfficeRequest, runPeriodicSuiteOnce, SEAT_ASKED_AGAIN_EVERY_MS, SEAT_ASKS_UNANSWERED_IN_A_ROW, watchPeriodicSuites } from '../tools/periodic-main-suite.mjs'
import { localStamp } from '../src/shared/time.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE, wholeSuiteReceiptCrossChecks, wholeSuiteReceiptIsComplete, wholeSuiteReceiptIsGreen } from '../src/shared/whole-suite-receipt.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { askTheOffice, THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { packTheReads, readsDigestOf } from '../tools/reads-archive.mjs'

let root: string
let repository: string
let office: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let resources: typeof import('../src/server/lib/resources.ts')
let processResource: string
let session: string
let clock: number
let cloudCalls: number
/** What the producer passed the door as carried over, one entry for each door call; undefined when it passed nothing. */
let carriedAsked: (string[] | undefined)[]
const ALONE_MODES = ['flaky', 'red alone', 'cut alone', 'unnamed alone', 'not run alone', 'errors outside', 'no summary', 'alone missing', 'alone mismatch', 'carried mismatch'] as const
const CRASH_MODES = ['worker crash', 'worker crash red alone', 'worker crash multiple files', 'worker crash without error', 'worker crash quoted error', 'worker crash wrong gap', 'worker crash wrong passed'] as const
let mode: 'green' | 'shared processes' | 'red' | 'busy' | 'build' | 'partial' | 'wrong commit' | 'bad counts' | 'bad suite' | 'bad passed' | 'cleanup' | 'interrupted' | typeof ALONE_MODES[number] | typeof CRASH_MODES[number]
let takesVersion2: boolean
let takesWorkerCrashes: boolean
let takesSkippedCases: boolean
let live: Map<number, OsProcess>
let released: string[]
let env: NodeJS.ProcessEnv
// Read by name, so this criterion compiles before the evidence module exports its reply length.
const evidenceModule = '../tools/stable/stable-upgrade-evidence.mjs'
let theLongestReceiptReply: number

beforeAll(async () => {
  theLongestReceiptReply = (await import(evidenceModule)).THE_LONGEST_RECEIPT_REPLY as number
})

function git(...args: string[]) {
  const result = spawnSync('git', args, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (result.status !== 0) throw new Error(`Fixture git failed: ${result.stderr}`)
  return result.stdout.trim()
}

const fakeProbe = (live: Map<number, OsProcess>): OsProbe => ({
  platform: 'fake', processById: (pid) => live.get(pid) ?? null,
  processesInGroup: (pgid) => [...live.values()].filter((entry) => entry.pgid === pgid),
  listeningPorts: () => [], gpu: () => ({ available: true, processes: [] }),
  containers: () => ({ available: true, containers: [] }), locks: () => ({ files: [], unreadable: [] }),
  ownProcessGroup: () => 999,
  killProcessGroup: () => { throw new Error('A fixture seat must never signal a process.') },
  stopContainer: () => { throw new Error('This fixture starts no container.') },
})

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'periodic-suite-fixture-'))
  repository = join(root, 'main')
  mkdirSync(repository)
  mkdirSync(join(repository, 'tests'))
  writeFileSync(join(repository, 'tests', 'one.test.ts'), '// made-up source for a synthetic cloud artifact\n')
  writeFileSync(join(repository, 'tests', 'two.test.ts'), '// made-up source for a synthetic cloud artifact\n')
  git('init', '-q', '-b', 'main', repository)
  git('-C', repository, 'add', '.')
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Made-up main fixture')
  office = await freshDb()
  server = await apiApp()
  resources = await import('../src/server/lib/resources.ts')
  live = new Map<number, OsProcess>([[700, { pid: 700, pgid: 700, ppid: 1, command: 'made-up periodic producer', startedAt: '2026-10-13 10:00:00' }]])
  resources.useOsProbe(fakeProbe(live))
  session = office.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Fixture producer run', data: { state: 'running', runtime: 'mole-office' }, actor: office.api.HUMAN }).id
  processResource = resources.registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: '700', detail: 'Made-up producer group', actor: office.api.HUMAN }).id
  clock = Date.parse('2026-10-13T10:00:00Z')
  cloudCalls = 0
  carriedAsked = []
  mode = 'green'
  takesVersion2 = true
  takesWorkerCrashes = true
  takesSkippedCases = true
  released = []
  const agent = office.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic receipt producer', data: { handle: 'synthetic-receipt-producer', runtime: 'codex', state: 'active' }, actor: office.api.HUMAN })
  const participants = await import('../src/server/lib/participants.ts')
  const keys = await import('../src/server/lib/keys.ts')
  env = { [THE_TEST_MARK]: String(process.pid), MOLE_OFFICE_SESSION: session, MOLE_OFFICE_AGENT: 'synthetic-receipt-producer', MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: 'http://synthetic-office.invalid', MOLE_AGENT_KEY: keys.makeAnAgentKey(participants.agentForRecord(agent.id)!.id, null) }
})

afterEach(async () => {
  resources.useOsProbe(resources.LINUX_PROBE)
  await server.app.close()
  office.close()
  rmSync(root, { recursive: true, force: true })
})

/** The test office over app.inject, as the request helper's fetch. */
const throughTheTestOffice: typeof fetch = async (url, init) => {
  const parsed = new URL(String(url))
  const response = await server.app.inject({ method: init?.method as 'GET' | 'POST', url: parsed.pathname + parsed.search, headers: init?.headers as Record<string, string>, ...(init?.body === undefined ? {} : { payload: String(init.body) }) })
  return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> })
}

async function officeRequest(asked: { method: string; path: string; body?: unknown }) {
  if (asked.path.startsWith('/api/merge-queue?')) {
    throw new Error('The producer must not issue an unbounded queue-list request.')
  }
  if (asked.path.endsWith('/release') && asked.path.startsWith('/api/slots/')) released.push(asked.path)
  const reply = await askTheOffice(asked, { env, fetchImpl: throughTheTestOffice })
  if (asked.path !== '/api/kinds/whole_suite_receipt') return reply
  // An office from before version 2 describes the same kind without the two fields version 2 adds.
  const body = JSON.parse(String(reply.body))
  body.kind.fields = body.kind.fields.filter((one: { key: string }) =>
    (takesVersion2 || !['aloneRuns', 'errorsOutsideTests'].includes(one.key)) && (takesWorkerCrashes || one.key !== 'workerCrashes') && (takesSkippedCases || one.key !== 'skippedCases'))
  return { ...reply, body: JSON.stringify(body) }
}

type Paths = { report: string; manifest: string; reads: string; log: string; alone: string }
/**
 * A made-up whole run that is red with two files, each then run alone. The first made-up file failed. The second
 * is one vitest calls passed, but one of its tests never ran, so it did not pass. Nothing here is an observed suite.
 * Files carried over run alone first, as the door runs them; in 'carried mismatch' the door says it put none first.
 */
function cloudWithRunsAlone(clone: string, commit: string, paths: Paths, carriedOver: string[] | undefined) {
  const summary = mode === 'no summary' ? '' : ` Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 1 passed | 1 skipped (3)\n${mode === 'errors outside' ? '     Errors  1 error\n' : ''}   Start at  10:00:00\n   Duration  1.00s\n`
  writeFileSync(paths.log, `Synthetic cloud log. No real tests ran.\n${summary}`)
  const files = ['tests/one.test.ts', 'tests/two.test.ts']
  writeFileSync(paths.manifest, JSON.stringify(files.map((file) => ({ file: join(clone, file) }))))
  writeFileSync(paths.report, JSON.stringify({
    fixture: true, success: false, numTotalTests: 3, numFailedTests: 1, numPassedTests: 1, numPendingTests: 1, numTodoTests: 0,
    numTotalTestSuites: 2, numPassedTestSuites: 1, numFailedTestSuites: 1, numPendingTestSuites: 0,
    testResults: [
      { name: join(clone, files[0]!), status: 'failed', assertionResults: [{ fullName: 'made-up assertion in tests/one.test.ts', status: 'failed' }] },
      { name: join(clone, files[1]!), status: 'passed', assertionResults: [{ fullName: 'made-up assertion in tests/two.test.ts', status: 'passed' }, { fullName: 'made-up test that never ran in tests/two.test.ts', status: 'pending' }] },
    ],
  }))
  mkdirSync(paths.reads)
  writeFileSync(join(paths.reads, 'fixture.jsonl'), 'Made-up read record; no actual suite was executed.\n')
  const first = mode === 'carried mismatch' ? [] : (carriedOver ?? []).filter((file) => files.includes(file))
  const order = [...first, ...files.filter((file) => !first.includes(file))]
  const runs = order.map((file, index) => {
    if (mode === 'not run alone' && index === 1) return { file, notRun: 'the limit of 20 files run alone was reached' }
    const n = index + 1
    const folder = join(paths.alone, String(n))
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'run.log'), `Synthetic run alone of ${file}. No real tests ran.\n`)
    const red = mode === 'red alone' && index === 0
    const named = mode === 'unnamed alone' && index === 0 ? 'tests/other.test.ts' : file
    writeFileSync(join(folder, 'report.json'), JSON.stringify({ fixture: true, testResults: [{ name: join(clone, named), status: red ? 'failed' : 'passed', assertionResults: [{ fullName: `made-up assertion in ${file}`, status: red ? 'failed' : 'passed' }] }] }))
    return { file, n, code: red ? 1 : mode === 'cut alone' && index === 0 ? 124 : 0 }
  })
  const alone = mode === 'alone mismatch' ? runs.slice(0, 1) : runs
  const answer = { ran: true, code: 1, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 1, files: 2, failed: ['tests/one.test.ts'], workers: 1, wallSec: 1, ...(mode === 'alone missing' ? {} : { alone }), ...(carriedOver === undefined ? {} : { carriedOverFirst: first }) }
  const result = { code: 1, answer, output: join(clone, '..', 'door-output.log') }
  writeFileSync(result.output, `${JSON.stringify(answer)}\n`)
  return result
}

async function syntheticCloud({ clone, commit, paths, carriedOver }: { clone: string; commit: string; paths: Paths; carriedOver?: string[] }) {
  cloudCalls += 1
  carriedAsked.push(carriedOver)
  if ((CRASH_MODES as readonly string[]).includes(mode)) return cloudWithWorkerCrash(clone, commit, paths)
  if ((ALONE_MODES as readonly string[]).includes(mode)) return cloudWithRunsAlone(clone, commit, paths, carriedOver)
  if (mode === 'busy') return { code: 75, answer: { ran: false, reason: 'the cloud box is busy with another suite' } }
  if (mode === 'interrupted') return { code: 75, answer: { ran: false, reason: 'timed out after 2 s' } }
  if (mode === 'cleanup') return { code: 75, answer: { ran: false, reason: 'made-up cleanup failure after the suite', phase: 'test', buildExitCode: 0, suiteExitCode: 0 } }
  writeFileSync(paths.log, 'Synthetic cloud log. No real tests ran.\n')
  if (mode === 'build') {
    const result = { code: 17, answer: { ran: true, code: 17, commit, phase: 'build', buildExitCode: 17, files: 0, failed: [], workers: 1, wallSec: 1 }, output: join(clone, '..', 'door-output.log') }
    writeFileSync(result.output, `${JSON.stringify(result.answer)}\n`)
    return result
  }
  const expected = ['tests/one.test.ts', 'tests/two.test.ts']
  const observed = mode === 'partial' ? expected.slice(0, 1) : expected
  const failed = mode === 'red' ? ['tests/one.test.ts'] : []
  writeFileSync(paths.manifest, JSON.stringify(expected.map((file) => ({ file: join(clone, file) }))))
  writeFileSync(paths.report, JSON.stringify({
    fixture: true, success: mode !== 'red' && mode !== 'bad suite', numTotalTests: mode === 'bad counts' ? 3 : observed.length,
    numTotalTestSuites: observed.length, numPassedTestSuites: observed.length - (mode === 'bad suite' ? 1 : failed.length), numFailedTestSuites: mode === 'bad suite' ? 1 : failed.length, numPendingTestSuites: 0,
    numPassedTests: mode === 'bad passed' ? 0 : mode === 'bad counts' ? 3 : observed.length - failed.length, numFailedTests: failed.length, numPendingTests: mode === 'bad passed' ? observed.length : 0, numTodoTests: 0,
    testResults: observed.map((file) => ({ name: join(clone, file), status: failed.includes(file) ? 'failed' : 'passed', assertionResults: [{ fullName: `made-up assertion in ${file}`, status: failed.includes(file) ? 'failed' : 'passed' }] })),
  }))
  mkdirSync(paths.reads)
  writeFileSync(join(paths.reads, 'fixture.jsonl'), 'Made-up read record; no actual suite was executed.\n')
  const code = mode === 'red' ? 1 : 0
  const result = { code, answer: { ran: true, code, commit: mode === 'wrong commit' ? 'f'.repeat(40) : commit, phase: 'test', buildExitCode: 0, suiteExitCode: code, files: observed.length, failed, workers: 1, wallSec: 1, ...(mode === 'shared processes' ? { filesShareAProcess: true } : {}), ...(carriedOver === undefined ? {} : { carriedOverFirst: carriedOver.filter((file) => failed.includes(file)) }) }, output: join(clone, '..', 'door-output.log') }
  writeFileSync(result.output, `${JSON.stringify(result.answer)}\n`)
  return result
}

type SkippedCase = { file: string; fullName: string; status: 'skipped' | 'disabled' | 'pending' }

/** A made-up green whole run with the requested skipped cases in its report, and no actual suite. */
function aCloudWithSkippedCases(skipped: SkippedCase[], files = ['tests/one.test.ts', 'tests/two.test.ts']) {
  return ({ clone, commit, paths }: { clone: string; commit: string; paths: Paths }) => {
    writeFileSync(paths.log, 'Synthetic cloud log. No real tests ran.\n')
    writeFileSync(paths.manifest, JSON.stringify(files.map((file) => ({ file: join(clone, file) }))))
    const rows: { name: string; status: string; assertionResults: { fullName: string; status: string }[] }[] = files.map((file) => ({
      name: join(clone, file), status: 'passed', assertionResults: [{ fullName: `made-up passing assertion in ${file}`, status: 'passed' }],
    }))
    for (const one of skipped) {
      const row = rows.find((candidate) => candidate.name === join(clone, one.file))
      if (row === undefined) throw new Error(`Made-up skipped case names a file outside the manifest: ${one.file}`)
      row.assertionResults.push({ fullName: one.fullName, status: one.status })
    }
    const assertions = rows.flatMap((row) => row.assertionResults)
    writeFileSync(paths.report, JSON.stringify({
      fixture: true, success: true, numTotalTests: assertions.length,
      numPassedTests: assertions.filter((test) => test.status === 'passed').length, numFailedTests: 0,
      numPendingTests: assertions.filter((test) => ['pending', 'skipped', 'disabled'].includes(test.status)).length, numTodoTests: 0,
      numTotalTestSuites: rows.length, numPassedTestSuites: rows.length, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults: rows,
    }))
    mkdirSync(paths.reads)
    writeFileSync(join(paths.reads, 'fixture.jsonl'), 'Made-up read record; no actual suite was executed.\n')
    const answer = { ran: true, code: 0, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 0, files: rows.length, failed: [], workers: 1, wallSec: 1 }
    const result = { code: 0, answer, output: join(clone, '..', 'door-output.log') }
    writeFileSync(result.output, `${JSON.stringify(answer)}\n`)
    return result
  }
}

const options = () => ({ repository, workdir: join(root, 'receipts'), processResource, env })
const transport = () => ({ officeRequest, runCloud: syntheticCloud, clock: () => clock })
const receipts = () => office.api.listRecords({ workspaceId: 'default', kinds: ['whole_suite_receipt'] })
const freeSeats = () => office.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'slot' AND released_at IS NULL").get() as { n: number }
const producersSlotRows = () => office.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'slot' AND released_at IS NULL AND session_record_id = ?").get(session) as { n: number }

/** A second made-up run, whose process group 701 holds the one full-suite seat through the office's own slot rules. */
async function anotherRunHoldsTheSeat() {
  live.set(701, { pid: 701, pgid: 701, ppid: 1, command: 'made-up other whole suite', startedAt: '2026-10-13 10:00:00' })
  const other = office.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Fixture other suite run', data: { state: 'running', runtime: 'mole-office' }, actor: office.api.HUMAN }).id
  const row = resources.registerResource({ workspaceId: 'default', sessionRecordId: other, type: 'process', key: '701', detail: 'Made-up other suite group', actor: office.api.HUMAN }).id
  const slots = await import('../src/server/lib/slots.ts')
  const held = slots.acquireSlot({ workspaceId: 'default', sessionRecordId: other, pool: 'full-suite', holder: { resource: row }, actor: office.api.HUMAN })
  expect(held.slot.state).toBe('granted')
  return { giveItBack: () => slots.releaseSlot(held.slot.id, { workspaceId: 'default', force: true, note: 'Fixture: the other made-up suite finished.', actor: office.api.HUMAN }) }
}

/** The answers the office gave to the producer's asks for the seat, in order. */
function seatAsks(): { transport: ReturnType<typeof transport>; asks: { body: unknown; slot: { id: string; state: string; position: number | null } }[] } {
  const asks: { body: unknown; slot: { id: string; state: string; position: number | null } }[] = []
  return { asks, transport: { ...transport(), officeRequest: async (asked: { method: string; path: string; body?: unknown }) => {
    const reply = await officeRequest(asked)
    if (asked.path === '/api/slots/acquire') asks.push({ body: asked.body, slot: JSON.parse(String(reply.body)).slot })
    return reply
  } } }
}

it('files exact original cloud facts through the office and leaves main intact', async () => {
  const before = git('-C', repository, 'rev-parse', 'HEAD')
  const result = await runPeriodicSuiteOnce(options(), transport())
  expect(result).toMatchObject({ status: 'filed', green: true, commit: before })
  const receipt = receipts()[0]!
  expect(receipt.title).toContain('Fixture:')
  expect(receipt.data).toMatchObject({ commit: before, tree: git('-C', repository, 'rev-parse', 'HEAD^{tree}'), where: 'cloud box', buildExitCode: 0, suiteExitCode: 0, failedFiles: [], failedTests: [], coverage: { expectedCount: 2, observedCount: 2, missing: [], unexpected: [] } })
  expect(receipt.data.artifacts).toHaveLength(4)
  expect((receipt.data.shortForms as { label: { text: string } }).label.text).toBe('Fixture suite result')
  expect(git('-C', repository, 'rev-parse', 'HEAD')).toBe(before)
  expect(git('-C', repository, 'status', '--porcelain')).toBe('')
  expect(freeSeats().n).toBe(0)
  expect(cloudCalls).toBe(1)
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'skipped' })
  expect(cloudCalls).toBe(1)
})

it('packs the attempt read record after the suite and files a receipt that names the packed file', async () => {
  const result = await runPeriodicSuiteOnce(options(), transport())
  expect(result).toMatchObject({ status: 'filed', green: true })
  const attempt = (result as { attempt: string }).attempt
  expect(existsSync(join(attempt, 'reads'))).toBe(false)
  expect(existsSync(join(attempt, 'reads.tar.zst'))).toBe(true)
  const note = readFileSync(join(attempt, 'reads.ARCHIVED.txt'), 'utf8')
  expect(note).toContain('sha256 of the tar stream: ')
  expect(note).toContain('files: 1')
  expect(note).toContain('tar -C')
  const receipt = JSON.parse(String((await officeRequest({ method: 'GET', path: `/api/records/${result.receipt}` })).body)).record
  const reads = (receipt.data.artifacts as { name: string; path: string; sha256Base64: string }[]).find((one) => one.name === 'reads')!
  expect(reads.path).toBe(join(attempt, 'reads.tar.zst'))
  expect(existsSync(reads.path)).toBe(true)
  expect(reads.sha256Base64).toBe(readsDigestOf(reads.path).sha256Base64)
  expect(result.says).toContain('packed as reads.tar.zst')
})

it('leaves the read folder and files a receipt naming it when the packed copy cannot prove itself', async () => {
  const result = await runPeriodicSuiteOnce(options(), { ...transport(), packReads: (attempt: string) => packTheReads(attempt, { tamper: (path: string) => writeFileSync(path, 'not a zstd frame') }) })
  expect(result).toMatchObject({ status: 'filed', green: true })
  const attempt = (result as { attempt: string }).attempt
  expect(existsSync(join(attempt, 'reads'))).toBe(true)
  expect(existsSync(join(attempt, 'reads.tar.zst'))).toBe(false)
  expect(result.says).toContain('was not packed')
  expect(result.says).toContain('does not decompress')
  const receipt = JSON.parse(String((await officeRequest({ method: 'GET', path: `/api/records/${result.receipt}` })).body)).record
  const reads = (receipt.data.artifacts as { name: string; path: string }[]).find((one) => one.name === 'reads')!
  expect(reads.path).toBe(join(attempt, 'reads'))
  expect(receipt.summary).toContain('was not packed')
})

/** The supplied historical sample, completed with explicitly synthetic omitted assertions. No suite is executed. */
function cloudWithWorkerCrash(clone: string, commit: string, paths: Paths) {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/stable/worker-crash/report.json', import.meta.url), 'utf8'))
  const rows = fixture.testResultsSample.map((row: { name: string }) => ({ ...row, name: row.name.replace('<clone>', clone) }))
  if (mode === 'worker crash multiple files') {
    const crashed = rows.find((row: { name: string }) => row.name.endsWith('/forest-map.test.ts'))
    const neighbour = rows.find((row: { name: string }) => row.name.endsWith('/forest-map-persistence.test.ts'))
    neighbour.assertionResults.push(...crashed.assertionResults.splice(-11))
  }
  const counted = (status: string) => rows.flatMap((row: { assertionResults: { status: string }[] }) => row.assertionResults).filter((test: { status: string }) => test.status === status).length
  const omitted = ['passed', 'failed', 'skipped', 'todo'].flatMap((status, index) => {
    const key = ['numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'][index]!
    return Array.from({ length: fixture.topLevel[key] - counted(status) }, (_, n) => ({ status, fullName: `Synthetic omitted ${status} assertion ${n}` }))
  })
  rows.push({ name: join(clone, 'tests/synthetic-omitted.test.ts'), status: 'failed', assertionResults: omitted })
  const report = { ...fixture.topLevel, testResults: rows }
  if (mode === 'worker crash wrong gap') report.numTotalTests += 1
  if (mode === 'worker crash wrong passed') { report.numPassedTests -= 1; report.numPendingTests += 1 }
  writeFileSync(paths.report, JSON.stringify(report))
  writeFileSync(paths.log, mode === 'worker crash without error' ? 'Synthetic log without an unhandled worker error.\n' : mode === 'worker crash quoted error' ? 'Synthetic failed assertion quoting: Worker exited unexpectedly\n' : readFileSync(new URL('./fixtures/stable/worker-crash/suite.txt', import.meta.url), 'utf8'))
  writeFileSync(paths.manifest, JSON.stringify(rows.map((row: { name: string }) => ({ file: row.name }))))
  mkdirSync(paths.reads)
  writeFileSync(join(paths.reads, 'fixture.jsonl'), 'Synthetic completion of a trimmed historical report.\n')
  const failed = rows.filter((row: { status: string }) => row.status === 'failed').map((row: { name: string }) => row.name.slice(clone.length + 1)).sort()
  const redFiles: string[] = rows.filter((row: { status: string; assertionResults: { status: string }[] }) => row.status === 'failed' || row.assertionResults.some((test) => test.status === 'pending')).map((row: { name: string }) => row.name.slice(clone.length + 1)).sort()
  const alone = redFiles.map((file, index) => {
    const n = index + 1
    const folder = join(paths.alone, String(n))
    mkdirSync(folder, { recursive: true })
    const red = mode === 'worker crash red alone' && file === 'tests/forest-map.test.ts'
    writeFileSync(join(folder, 'run.log'), 'Synthetic alone run. No real tests ran.\n')
    writeFileSync(join(folder, 'report.json'), JSON.stringify({ testResults: [{ name: join(clone, file), status: red ? 'failed' : 'passed', assertionResults: [{ status: red ? 'failed' : 'passed', fullName: 'Synthetic alone assertion' }] }] }))
    return { file, n, code: red ? 1 : 0 }
  })
  const answer = { ran: true, code: 1, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 1, files: rows.length, failed, alone, workers: 1, wallSec: 1 }
  const result = { code: 1, answer, output: join(clone, '..', 'door-output.log') }
  writeFileSync(result.output, `${JSON.stringify(answer)}\n`)
  return result
}

it('files the historical worker crash with its 22 unfinished tests and keeps that fact whether its file passes or fails alone', async () => {
  for (const next of ['worker crash', 'worker crash red alone'] as const) {
    const { result, data } = await onANewTip(next)
    expect(result).toMatchObject({ status: 'filed', green: false })
    expect(data).toMatchObject({ version: 2, workerCrashes: [{ file: 'tests/forest-map.test.ts', unfinishedTests: 22 }], errorsOutsideTests: 1 })
    expect(data.failedFiles).toContain('tests/forest-map.test.ts')
    expect((data.failedTests as { file: string }[]).some((test) => test.file === 'tests/forest-map.test.ts')).toBe(false)
    expect((data.aloneRuns as { file: string; outcome: string }[]).find((run) => run.file === 'tests/forest-map.test.ts')?.outcome).toBe(next === 'worker crash' ? 'green' : 'red')
    expect(result.says).toContain('Worker exited unexpectedly')
    expect(result.says).toContain('tests/forest-map.test.ts: 22 tests never finished')
  }
})

it('refuses the same count gap without an unhandled worker exit, an inexact gap, or a different contradictory assertion count', async () => {
  for (const next of ['worker crash without error', 'worker crash quoted error', 'worker crash wrong gap', 'worker crash wrong passed'] as const) {
    mode = next
    await expect(runPeriodicSuiteOnce({ ...options(), workdir: join(root, next) }, transport())).rejects.toThrow(/counts/)
  }
  expect(receipts()).toHaveLength(0)
})

it('names every file whose pending tests together explain the worker-exit gap and runs each alone', async () => {
  const { data } = await onANewTip('worker crash multiple files')
  const crashes = [{ file: 'tests/forest-map-persistence.test.ts', unfinishedTests: 11 }, { file: 'tests/forest-map.test.ts', unfinishedTests: 11 }]
  expect(data.workerCrashes).toEqual(crashes)
  for (const crash of crashes) expect(data.aloneRuns).toContainEqual(expect.objectContaining({ file: crash.file, outcome: 'green' }))
})

it('names the worker crash in the receipt summary and answer when the older office has no workerCrashes field', async () => {
  takesWorkerCrashes = false
  const { result, data } = await onANewTip('worker crash')
  expect(result).toMatchObject({ status: 'filed', green: false })
  expect(data).not.toHaveProperty('workerCrashes')
  expect(receiptAt(git('-C', repository, 'rev-parse', 'HEAD')).summary).toContain('tests/forest-map.test.ts: 22 tests never finished')
  expect(result.says).toContain('Worker exited unexpectedly')
  expect(result.says).toContain('summary')
})

it('records reds and failed builds without attributing them away or inventing a suite', async () => {
  mode = 'red'
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'filed', green: false })
  expect(receipts()[0]!.data).toMatchObject({ suiteExitCode: 1, failedFiles: ['tests/one.test.ts'], failedTests: [{ file: 'tests/one.test.ts', name: 'made-up assertion in tests/one.test.ts' }] })
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Second made-up main tip')
  clock += 9000_000
  mode = 'build'
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'filed', green: false })
  const build = receipts().find((record) => record.data.buildExitCode === 17)!
  expect(build.data).not.toHaveProperty('suiteExitCode')
  expect(build.data).not.toHaveProperty('coverage')
  expect(build.data.artifacts).toHaveLength(1)
  expect(freeSeats().n).toBe(0)
})

/** How many made-up failed assertions make a receipt longer than the request helper's default reply. */
const LONG_RED_FAILURES = Math.ceil(THE_LONGEST_REPLY / 100)

/**
 * The made-up red run, with so many made-up failed assertions in its first file that its receipt is longer than the
 * request helper's default reply. Nothing here is an observed suite.
 */
async function aLongRedCloud(asked: Parameters<typeof syntheticCloud>[0]) {
  const result = await syntheticCloud(asked)
  const failed = Array.from({ length: LONG_RED_FAILURES }, (_, n) => ({
    fullName: `Made-up failed assertion ${String(n + 1).padStart(4, '0')} in tests/one.test.ts, with a long name so that the receipt is long`, status: 'failed' }))
  writeFileSync(asked.paths.report, JSON.stringify({
    fixture: true, success: false, numTotalTests: failed.length + 1, numPassedTests: 1, numFailedTests: failed.length, numPendingTests: 0, numTodoTests: 0,
    numTotalTestSuites: 2, numPassedTestSuites: 1, numFailedTestSuites: 1, numPendingTestSuites: 0,
    testResults: [
      { name: join(asked.clone, 'tests/one.test.ts'), status: 'failed', assertionResults: failed },
      { name: join(asked.clone, 'tests/two.test.ts'), status: 'passed', assertionResults: [{ fullName: 'made-up assertion in tests/two.test.ts', status: 'passed' }] },
    ],
  }))
  return result
}

/** The producer's own transport over `fetchImpl`, with the long red run in place of the cloud. */
const aLongRedRun = (fetchImpl: typeof fetch) => ({ ...transport(), runCloud: aLongRedCloud,
  officeRequest: (asked: { method: string; path: string; body?: unknown }) => producerOfficeRequest(asked, env, fetchImpl) })
const theProducersState = () => JSON.parse(readFileSync(join(root, 'receipts', 'state.json'), 'utf8')) as { pending: { step?: string } | null; lastReceipt?: string }

it('files a red receipt longer than the default reply through its own transport, and reads the filing answer whole', async () => {
  expect(theLongestReceiptReply, 'the evidence module asks for more than the default reply').toBeGreaterThan(THE_LONGEST_REPLY)
  mode = 'red'
  const result = await runPeriodicSuiteOnce(options(), aLongRedRun(throughTheTestOffice))
  expect(result).toMatchObject({ status: 'filed', green: false })
  const receipt = receipts()[0]!
  expect(result).toMatchObject({ receipt: receipt.id })
  expect(JSON.stringify(receipt.data).length, 'the made-up receipt is longer than the request helper hands back by default').toBeGreaterThan(THE_LONGEST_REPLY)
  expect(receipt.data.failedTests).toHaveLength(LONG_RED_FAILURES)
  expect((receipt.data.shortForms as { label: { text: string } }).label.text).toBe('Fixture suite result')
  expect(theProducersState()).toMatchObject({ pending: null, lastReceipt: receipt.id })
  expect(freeSeats().n).toBe(0)
})

it('still refuses a filing answer cut at the longer reply, and leaves the filing unfinished', async () => {
  expect(theLongestReceiptReply, 'the evidence module asks for more than the default reply').toBeGreaterThan(THE_LONGEST_REPLY)
  mode = 'red'
  const longerThanItAsks: typeof fetch = async (url, init) => {
    const answered = await throughTheTestOffice(url, init)
    if (init?.method !== 'POST' || new URL(String(url)).pathname !== '/api/records') return answered
    // Spaces after the JSON leave it readable, so only the cut can refuse it.
    return new Response(`${await answered.text()}${' '.repeat(theLongestReceiptReply)}`, { status: answered.status })
  }
  await expect(runPeriodicSuiteOnce(options(), aLongRedRun(longerThanItAsks))).rejects.toThrow('The office reply for POST /api/records was cut. Its contents are unknown; no substitute was used.')
  expect(receipts(), 'the office stored the receipt, and only its answer was cut').toHaveLength(1)
  expect(theProducersState().pending).toMatchObject({ step: 'filing the receipt' })
  expect(freeSeats().n).toBe(0)
})

it('keeps incomplete manifest coverage nongreen even when npm test exits zero', async () => {
  mode = 'partial'
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'filed', green: false })
  expect(receipts()[0]!.data.coverage).toEqual({ expectedCount: 2, observedCount: 1, missing: ['tests/two.test.ts'], unexpected: [] })
})

it('started by hand without a wait, leaves its place in the seat\'s line at once and says which place it had', async () => {
  await anotherRunHoldsTheSeat()
  const { asks, transport: seen } = seatAsks()
  const result = await runPeriodicSuiteOnce(options(), { ...seen, sleep: async () => { throw new Error('A run given no wait must not wait for the seat.') } })
  expect(result).toMatchObject({ status: 'skipped', reason: 'seat' })
  expect(result.says).toContain('number 1 in line')
  expect(asks.map((one) => one.slot.state)).toEqual(['queued'])
  expect(released).toEqual([`/api/slots/${asks[0]!.slot.id}/release`])
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(0)
})

it('keeps its place in the seat\'s line, asking again with the same row, and runs once the seat is handed on to it', async () => {
  const other = await anotherRunHoldsTheSeat()
  const { asks, transport: seen } = seatAsks()
  const since = clock
  const slept: number[] = []
  const seated: number[] = []
  const result = await runPeriodicSuiteOnce({ ...options(), seatLine: { until: clock + 3600_000, seated: () => { seated.push(clock) } } }, { ...seen, sleep: async (ms: number) => {
    slept.push(ms)
    clock += ms
    if (slept.length === 2) other.giveItBack()
  } })
  const granted = since + 2 * SEAT_ASKED_AGAIN_EVERY_MS
  expect(result).toMatchObject({ status: 'filed', green: true })
  expect(slept).toEqual([SEAT_ASKED_AGAIN_EVERY_MS, SEAT_ASKED_AGAIN_EVERY_MS])
  expect(asks.map((one) => one.slot.state)).toEqual(['queued', 'queued', 'granted'])
  expect(asks.map((one) => one.body)).toEqual(asks.map(() => ({ pool: 'full-suite', resource: processResource, detail: expect.any(String) })))
  expect(new Set(asks.map((one) => one.slot.id)).size).toBe(1)
  // It never gave back the place it still wanted: the one release is the seat's, after the run.
  expect(released).toEqual([`/api/slots/${asks[0]!.slot.id}/release`])
  expect(seated).toEqual([granted])
  // The suite started when the seat was granted, not when the producer began to wait.
  expect(receipts()[0]!.data.startedAt).toBe(localStamp(new Date(granted)))
  expect(JSON.parse(readFileSync(join(root, 'receipts', 'state.json'), 'utf8')).lastStartedAtMs).toBe(granted)
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(1)
})

it('gives its place back when its wait ends, and says that it waited, from when, and its place when it last asked', async () => {
  await anotherRunHoldsTheSeat()
  const { asks, transport: seen } = seatAsks()
  const since = clock
  const until = clock + 2.5 * SEAT_ASKED_AGAIN_EVERY_MS
  const slept: number[] = []
  const result = await runPeriodicSuiteOnce({ ...options(), seatLine: { until, seated: () => { throw new Error('No seat was granted.') } } }, { ...seen, sleep: async (ms: number) => { slept.push(ms); clock += ms } })
  expect(result).toMatchObject({ status: 'skipped', reason: 'seat' })
  // The last wait ends at the bound, and the producer asks once more there before it gives its place back.
  expect(slept).toEqual([SEAT_ASKED_AGAIN_EVERY_MS, SEAT_ASKED_AGAIN_EVERY_MS, SEAT_ASKED_AGAIN_EVERY_MS / 2])
  expect(asks.map((one) => one.slot.state)).toEqual(['queued', 'queued', 'queued', 'queued'])
  expect(result.says).toContain('waited in the seat\'s line')
  expect(result.says).toContain(`from ${localStamp(new Date(since))} until ${localStamp(new Date(until))}`)
  expect(result.says).toContain(`number 1 in line when it last asked, at ${localStamp(new Date(until))}`)
  expect(released).toEqual([`/api/slots/${asks[0]!.slot.id}/release`])
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(0)
})

it('gives its place in the seat\'s line back when asking again fails', async () => {
  await anotherRunHoldsTheSeat()
  const { asks, transport: seen } = seatAsks()
  const refused = { ...seen, officeRequest: async (asked: { method: string; path: string; body?: unknown }) => asked.path === '/api/slots/acquire' && asks.length === 1
    ? { status: 503, cut: false, location: null, body: { error: 'Made-up refusal of the second ask.' } }
    : seen.officeRequest(asked) }
  await expect(runPeriodicSuiteOnce({ ...options(), seatLine: { until: clock + 3600_000, seated: () => {} } }, { ...refused, sleep: async (ms: number) => { clock += ms } })).rejects.toThrow('Made-up refusal of the second ask.')
  expect(released).toEqual([`/api/slots/${asks[0]!.slot.id}/release`])
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(0)
})

/**
 * The producer's real transport over a stand-in fetch. Every ask reaches the test office, and every slot id the office
 * answered is kept, whether or not that answer reaches the producer. An ask the case marks as dropped is answered by the
 * office and then rejected as the real fetch rejects when its wait is up, so the office keeps the row it filed.
 */
function asksWithLostAnswers(dropped: (ask: number) => boolean) {
  const answered: string[] = []
  const droppedAsks: number[] = []
  let asks = 0
  const standInFetch: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url))
    const path = parsed.pathname + parsed.search
    if (path.startsWith('/api/slots/') && path.endsWith('/release')) released.push(path)
    const response = await server.app.inject({ method: init?.method as 'GET' | 'POST', url: path, headers: init?.headers as Record<string, string>, ...(init?.body === undefined ? {} : { payload: String(init.body) }) })
    if (path === '/api/slots/acquire') {
      asks += 1
      answered.push((JSON.parse(response.body) as { slot: { id: string } }).slot.id)
      if (dropped(asks)) {
        droppedAsks.push(asks)
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
    }
    return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> })
  }
  return { officeRequest: (asked: { method: string; path: string; body?: unknown }) => producerOfficeRequest(asked, env, standInFetch), answered, droppedAsks, asks: () => asks }
}

it('keeps its place through unanswered re-asks and runs once the seat is handed on', async () => {
  const other = await anotherRunHoldsTheSeat()
  const office = asksWithLostAnswers((ask) => ask % 2 === 0)
  const slept: number[] = []
  const result = await runPeriodicSuiteOnce({ ...options(), seatLine: { until: clock + 3600_000, seated: () => {} } }, { ...transport(), officeRequest: office.officeRequest, sleep: async (ms: number) => {
    slept.push(ms)
    expect(producersSlotRows().n).toBeLessThanOrEqual(1)
    clock += ms
    if (slept.length === 2 * SEAT_ASKS_UNANSWERED_IN_A_ROW) other.giveItBack()
  } })
  expect(result).toMatchObject({ status: 'filed', green: true })
  expect(cloudCalls).toBe(1)
  expect(office.droppedAsks).toEqual(Array.from({ length: SEAT_ASKS_UNANSWERED_IN_A_ROW }, (_, index) => 2 * (index + 1)))
  expect(office.answered.length).toBe(2 * SEAT_ASKS_UNANSWERED_IN_A_ROW + 1)
  expect(new Set(office.answered).size).toBe(1)
  expect(released).toEqual([`/api/slots/${office.answered[0]!}/release`])
  expect(producersSlotRows().n).toBe(0)
})

it('stops waiting and gives its place back after unanswered asks reach the limit', async () => {
  await anotherRunHoldsTheSeat()
  const office = asksWithLostAnswers((ask) => ask > 1)
  await expect(runPeriodicSuiteOnce({ ...options(), seatLine: { until: clock + 3600_000, seated: () => {} } }, { ...transport(), officeRequest: office.officeRequest, sleep: async (ms: number) => { clock += ms } })).rejects.toThrow()
  expect(office.asks()).toBe(1 + SEAT_ASKS_UNANSWERED_IN_A_ROW)
  expect(office.droppedAsks).toHaveLength(SEAT_ASKS_UNANSWERED_IN_A_ROW)
  expect(released).toEqual([`/api/slots/${office.answered[0]!}/release`])
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(0)
})

it('learns the row the office filed for an unanswered first ask from the next ask', async () => {
  const other = await anotherRunHoldsTheSeat()
  const office = asksWithLostAnswers((ask) => ask === 1)
  const slept: number[] = []
  const result = await runPeriodicSuiteOnce({ ...options(), seatLine: { until: clock + 3600_000, seated: () => {} } }, { ...transport(), officeRequest: office.officeRequest, sleep: async (ms: number) => {
    slept.push(ms)
    clock += ms
    if (slept.length === 2) other.giveItBack()
  } })
  expect(result).toMatchObject({ status: 'filed', green: true })
  expect(office.droppedAsks).toEqual([1])
  expect(new Set(office.answered).size).toBe(1)
  expect(released).toEqual([`/api/slots/${office.answered[0]!}/release`])
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(1)
})

it('gives its place back when its wait ends while its asks go unanswered, before they reach the limit', async () => {
  await anotherRunHoldsTheSeat()
  const office = asksWithLostAnswers((ask) => ask > 1)
  // The ask that comes at the line's end is the last unanswered one the limit still allows.
  const until = clock + (SEAT_ASKS_UNANSWERED_IN_A_ROW - 1) * SEAT_ASKED_AGAIN_EVERY_MS
  const result = await runPeriodicSuiteOnce({ ...options(), seatLine: { until, seated: () => { throw new Error('No seat was granted.') } } }, { ...transport(), officeRequest: office.officeRequest, sleep: async (ms: number) => { clock += ms } })
  expect(result).toMatchObject({ status: 'skipped', reason: 'seat' })
  expect(office.droppedAsks).toHaveLength(SEAT_ASKS_UNANSWERED_IN_A_ROW - 1)
  expect(released).toEqual([`/api/slots/${office.answered[0]!}/release`])
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(0)
})

it('gives its place back without asking again when it is stopped while it waits after an unanswered ask', async () => {
  await anotherRunHoldsTheSeat()
  const office = asksWithLostAnswers((ask) => ask === 2)
  const controller = new AbortController()
  const result = await runPeriodicSuiteOnce({ ...options(), signal: controller.signal, seatLine: { until: clock + 3600_000, seated: () => { throw new Error('No seat was granted.') } } }, { ...transport(), officeRequest: office.officeRequest, sleep: async (ms: number) => {
    clock += ms
    if (office.droppedAsks.length === 1) controller.abort()
  } })
  expect(result).toMatchObject({ status: 'skipped', reason: 'seat' })
  expect(office.asks()).toBe(2)
  expect(released).toEqual([`/api/slots/${office.answered[0]!}/release`])
  expect(producersSlotRows().n).toBe(0)
  expect(cloudCalls).toBe(0)
})

/**
 * THE PRODUCER'S WAIT FOR AN ANSWER. Fake timers do not replace the timer inside AbortSignal.timeout, so the
 * cases below put a stand-in in its place that aborts on the faked setTimeout, as the real signal does when its time is
 * up, and keep the wait each signal was made for. The stand-in fetch reaches no office. Its made-up reply comes when the
 * faked clock reaches `after`, or never when `after` is null, and it is refused with its signal's reason if the signal
 * aborts first, as the real fetch is.
 */
async function onAFakeClock(during: (madeFor: Map<AbortSignal, number>) => Promise<void>) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const madeFor = new Map<AbortSignal, number>()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException(`Made-up wait of ${ms} ms ended`, 'TimeoutError')), ms)
    madeFor.set(controller.signal, ms)
    return controller.signal
  })
  try {
    await during(madeFor)
  } finally {
    timeout.mockRestore()
    vi.useRealTimers()
  }
}

const A_MADE_UP_ANSWER = { said: 'A made-up answer from no office' }
/** The stand-in fetch described above. `signals` keeps the signal of each call, and `asked` settles when the first call comes. */
function aReplyAfter(after: number | null) {
  const signals: AbortSignal[] = []
  let came!: () => void
  const asked = new Promise<void>((resolve) => { came = resolve })
  const fetchImpl: typeof fetch = async (_url, init) => {
    const signal = init?.signal as AbortSignal
    signals.push(signal)
    came()
    await new Promise<void>((resolve, reject) => {
      const timer = after === null ? undefined : setTimeout(resolve, after)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
    })
    return new Response(JSON.stringify(A_MADE_UP_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { fetchImpl, signals, asked }
}

/** The wait the producer had before, which the first call of a firing on the live office outlasted. */
const THE_EARLIER_WAIT_MS = 15_000

it('bounds each office call of the producer at the wait its module exports', async () => {
  await onAFakeClock(async (madeFor) => {
    const stand = aReplyAfter(0)
    const asked = producerOfficeRequest({ method: 'GET', path: '/api/kinds' }, env, stand.fetchImpl)
    await stand.asked
    await vi.advanceTimersByTimeAsync(1)
    expect((await asked).status).toBe(200)
    expect(stand.signals).toHaveLength(1)
    expect(madeFor.get(stand.signals[0]!)).toBe(PRODUCER_OFFICE_ANSWER_WAIT_MS)
  })
})

it('uses an answer that comes later than the earlier 15 s wait', async () => {
  await onAFakeClock(async () => {
    const late = THE_EARLIER_WAIT_MS + 5_000
    const stand = aReplyAfter(late)
    let settled = false
    const asked = producerOfficeRequest({ method: 'GET', path: '/api/kinds' }, env, stand.fetchImpl).finally(() => { settled = true })
    await stand.asked
    await vi.advanceTimersByTimeAsync(THE_EARLIER_WAIT_MS)
    expect(settled).toBe(false)
    expect(stand.signals[0]!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(late - THE_EARLIER_WAIT_MS)
    const reply = await asked
    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toEqual(A_MADE_UP_ANSWER)
  })
})

it('ends a call still unanswered at its bound as one the office did not answer, with the reason its signal gave', async () => {
  await onAFakeClock(async () => {
    const stand = aReplyAfter(null)
    const ended = producerOfficeRequest({ method: 'GET', path: '/api/kinds' }, env, stand.fetchImpl).then(() => null, (error: unknown) => error)
    await stand.asked
    await vi.advanceTimersByTimeAsync(PRODUCER_OFFICE_ANSWER_WAIT_MS - 1)
    expect(stand.signals[0]!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const error = await ended
    // The class is not exported, so the case reads what a caller sees: its name, and `why`, which the seat's line puts in its words.
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('TheOfficeDidNotAnswer')
    expect((error as { why?: unknown }).why).toBe((stand.signals[0]!.reason as DOMException).message)
  })
})

it('treats box busy as not run and retries later without a local fallback or receipt', async () => {
  mode = 'busy'
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'not run', says: expect.stringContaining('busy') })
  expect(receipts()).toHaveLength(0)
  expect(freeSeats().n).toBe(0)
  expect(JSON.parse(readFileSync(join(root, 'receipts', 'state.json'), 'utf8')).lastStartedAtMs).toBeNull()
  mode = 'green'
  clock += 60_000
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'filed', green: true })
  expect(cloudCalls).toBe(2)
})

it('enforces the two-to-three-hour start interval on new main tips', async () => {
  await runPeriodicSuiteOnce(options(), transport())
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Another made-up tip')
  clock += 8999_000
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'skipped' })
  expect(cloudCalls).toBe(1)
  clock += 1000
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'filed', green: true })
  expect(cloudCalls).toBe(2)
})

it('refuses mismatched commit or contradictory original counts and preserves the unfinished attempt', async () => {
  mode = 'wrong commit'
  await expect(runPeriodicSuiteOnce(options(), transport())).rejects.toThrow('requested commit')
  expect(receipts()).toHaveLength(0)
  expect(freeSeats().n).toBe(0)
  expect(JSON.parse(readFileSync(join(root, 'receipts', 'state.json'), 'utf8')).pending).not.toBeNull()
  await expect(runPeriodicSuiteOnce(options(), transport())).rejects.toThrow('unfinished')
  // A separate throwaway work directory is explicitly selected; no unfinished result is hidden or removed.
  mode = 'bad counts'
  await expect(runPeriodicSuiteOnce({ ...options(), workdir: join(root, 'other-receipts') }, transport())).rejects.toThrow('assertion counts')
  expect(receipts()).toHaveLength(0)
})

it('runs bounded periodic checks without making load while waiting for the next due tip', async () => {
  const controller = new AbortController()
  const seen: unknown[] = []
  let waits = 0
  await watchPeriodicSuites({ ...options(), signal: controller.signal }, {
    ...transport(), say: (result: unknown) => seen.push(result),
    sleep: async (ms: number) => {
      expect(ms).toBe(60_000)
      waits += 1
      if (waits === 1) {
        git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Periodic made-up tip')
        clock += 60_000
      } else if (waits === 2) clock += 9000_000
      else controller.abort()
    },
  })
  expect(seen).toHaveLength(3)
  expect(seen[1]).toMatchObject({ status: 'skipped' })
  expect(cloudCalls).toBe(2)
  expect(freeSeats().n).toBe(0)
})

it('refuses a failed suite summary or contradictory passed and pending assertion totals', async () => {
  for (const next of ['bad suite', 'bad passed'] as const) {
    mode = next
    await expect(runPeriodicSuiteOnce({...options(),workdir:join(root,next)},transport())).rejects.toThrow(/suite report|assertion counts/)
  }
  expect(receipts()).toHaveLength(0)
  expect(freeSeats().n).toBe(0)
})

it('keeps cadence and recovery state when an executed suite cannot return or clean up', async () => {
  mode='cleanup'
  await expect(runPeriodicSuiteOnce(options(),transport())).rejects.toThrow('evidence or cleanup')
  const state=JSON.parse(readFileSync(join(root,'receipts','state.json'),'utf8'))
  expect(state.lastStartedAtMs).toBe(clock)
  expect(state.pending.attempt).toBeTruthy()
  expect(JSON.parse(readFileSync(join(state.pending.attempt,'door-result.json'),'utf8')).answer.phase).toBe('test')
  clock+=60_000
  await expect(runPeriodicSuiteOnce(options(),transport())).rejects.toThrow('unfinished')
  expect(cloudCalls).toBe(1)
  expect(receipts()).toHaveLength(0)
  expect(freeSeats().n).toBe(0)
})

it('keeps an ambiguous phase-less interruption pending instead of starting again a minute later', async () => {
  mode = 'interrupted'
  await expect(runPeriodicSuiteOnce(options(), transport())).rejects.toThrow('evidence or cleanup')
  const state = JSON.parse(readFileSync(join(root, 'receipts', 'state.json'), 'utf8'))
  expect(state.lastStartedAtMs).toBe(clock)
  expect(state.pending.attempt).toBeTruthy()
  expect(JSON.parse(readFileSync(join(state.pending.attempt, 'door-result.json'), 'utf8')).answer).toEqual({ ran: false, reason: 'timed out after 2 s' })
  clock += 60_000
  await expect(runPeriodicSuiteOnce(options(), transport())).rejects.toThrow('unfinished')
  expect(cloudCalls).toBe(1)
  expect(receipts()).toHaveLength(0)
  expect(freeSeats().n).toBe(0)
})

// Version 2 of the receipt: each file red beside others is run alone on the same box, commit and build.
const both = ['tests/one.test.ts', 'tests/two.test.ts']
const receiptAt = (commit: string) => receipts().find((record) => record.data.commit === commit)!
async function onANewTip(next: typeof mode, asked = options()) {
  mode = next
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', `Made-up tip for ${next}`)
  clock += 9000_000
  const result = await runPeriodicSuiteOnce(asked, transport())
  return { result, data: receiptAt(git('-C', repository, 'rev-parse', 'HEAD')).data }
}

it('files version 2 when each file red beside others was green alone, names every one, and counts a file with a test that never ran as red', async () => {
  const { result, data } = await onANewTip('flaky')
  expect(result).toMatchObject({ status: 'filed', green: true, alone: { green: both, red: [], noResult: [], notRun: [] } })
  expect(data).toMatchObject({ version: 2, suiteExitCode: 1, failedFiles: both, failedTests: [{ file: 'tests/one.test.ts', name: 'made-up assertion in tests/one.test.ts' }], errorsOutsideTests: 0 })
  const at = (n: number, name: string) => join(String((result as { attempt?: unknown }).attempt), 'alone', String(n), name)
  expect(data.aloneRuns).toEqual(both.map((file, index) => ({ file, outcome: 'green', exitCode: 0, artifacts: [
    { name: 'log', path: at(index + 1, 'run.log'), sha256Base64: expect.any(String) }, { name: 'report', path: at(index + 1, 'report.json'), sha256Base64: expect.any(String) },
  ] })))
  expect(result.says).toContain('green alone: tests/one.test.ts, tests/two.test.ts')
})

it('keeps the receipt not green when a file red beside others was red alone, gave no result alone or was not run alone', async () => {
  const first = {
    'red alone': { outcome: 'red', exitCode: 1 },
    'cut alone': { outcome: 'no result', exitCode: 124, because: 'the command was stopped before its end (exit 124)' },
    'unnamed alone': { outcome: 'no result', exitCode: 0, because: 'its report does not name the file' },
  } as const
  for (const [next, expected] of Object.entries(first)) {
    const { result, data } = await onANewTip(next as typeof mode)
    expect(result, next).toMatchObject({ status: 'filed', green: false })
    expect(data.version, next).toBe(2)
    expect((data.aloneRuns as unknown[])[0], next).toMatchObject({ file: 'tests/one.test.ts', ...expected })
    expect((data.aloneRuns as unknown[])[1], next).toMatchObject({ file: 'tests/two.test.ts', outcome: 'green' })
  }
  const { result, data } = await onANewTip('not run alone')
  expect(result).toMatchObject({ status: 'filed', green: false, alone: { green: ['tests/one.test.ts'], notRun: ['tests/two.test.ts'] } })
  expect((data.aloneRuns as unknown[])[1]).toEqual({ file: 'tests/two.test.ts', outcome: 'not run', because: 'the limit of 20 files run alone was reached', artifacts: [] })
})

it('keeps a version 2 receipt not green when the whole run reports an error outside its tests, or its summary cannot be read', async () => {
  const errors = await onANewTip('errors outside')
  expect(errors.result).toMatchObject({ status: 'filed', green: false })
  expect(errors.data).toMatchObject({ version: 2, errorsOutsideTests: 1 })
  const unread = await onANewTip('no summary')
  expect(unread.result).toMatchObject({ status: 'filed', green: false })
  expect(unread.data.version).toBe(2)
  expect(unread.data).not.toHaveProperty('errorsOutsideTests')
})

it('files version 1 to an office that does not take version 2, and its answer names what each red file did alone', async () => {
  takesVersion2 = false
  const { result, data } = await onANewTip('flaky')
  expect(result).toMatchObject({ status: 'filed', green: false, alone: { green: both, red: [], noResult: [], notRun: [] } })
  expect(data).toMatchObject({ version: 1, suiteExitCode: 1, failedFiles: both })
  expect(data).not.toHaveProperty('aloneRuns')
  expect(data).not.toHaveProperty('errorsOutsideTests')
  expect(result.says).toContain('version 1')
  expect(result.says).toContain('green alone: tests/one.test.ts, tests/two.test.ts')
})

it('refuses runs alone that do not match the red files, and files version 1 when the door returned none', async () => {
  mode = 'alone mismatch'
  await expect(runPeriodicSuiteOnce(options(), transport())).rejects.toThrow('do not match the red files')
  expect(receipts()).toHaveLength(0)
  const { result, data } = await onANewTip('alone missing', { ...options(), workdir: join(root, 'other-receipts') })
  expect(result).toMatchObject({ status: 'filed', green: false })
  expect(result).not.toHaveProperty('alone')
  expect(result.says).toContain('returned no runs alone')
  expect(data).toMatchObject({ version: 1, failedFiles: both })
})

it('says in the receipt\'s summary that test files shared processes when the door says it passed the runner\'s switch', async () => {
  // The summary's words are read from a plain run's receipt, so the case pins none of them. It asks only that the
  // switch's run adds a sentence after them, and that the sentence names the variable the runner set.
  const SWITCH = 'MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS'
  const shared = await onANewTip('shared processes')
  expect(shared.result).toMatchObject({ status: 'filed', green: true })
  const withTheSwitch = receiptAt(git('-C', repository, 'rev-parse', 'HEAD')).summary!
  const plain = await onANewTip('green')
  expect(plain.result).toMatchObject({ status: 'filed', green: true })
  const without = receiptAt(git('-C', repository, 'rev-parse', 'HEAD')).summary!
  expect(without).not.toContain(SWITCH)
  expect(withTheSwitch.startsWith(`${without} `), 'a plain run\'s summary, then one more sentence').toBe(true)
  expect(withTheSwitch.slice(without.length + 1), 'the added sentence names the switch').toContain(SWITCH)
})

// Files the last receipt left not run alone, because of the door's limit, are carried over to the next run (criterion 29).
const two = 'tests/two.test.ts'
const attemptOf = (result: unknown) => String((result as { attempt?: unknown }).attempt)
const carriedFileOf = (result: unknown) => JSON.parse(readFileSync(join(attemptOf(result), 'carried-over.json'), 'utf8'))
const aloneLogOf = (data: Record<string, unknown>, file: string) => (data.aloneRuns as { file: string; artifacts: { name: string; path: string }[] }[]).find((run) => run.file === file)!.artifacts.find((one) => one.name === 'log')!.path
const theirOrder = (result: unknown, data: Record<string, unknown>) => both.map((file) => aloneLogOf(data, file) === join(attemptOf(result), 'alone', '1', 'run.log') ? 'first' : 'second')

it('passes the files the last receipt left not run alone to the door, runs them alone first, and says so in the receipt and the attempt', async () => {
  const left = await onANewTip('not run alone')
  const firstId = String(left.result.receipt)
  // A busy box between the two runs takes nothing the next run needs from the last receipt.
  mode = 'busy'
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Made-up tip the busy box did not run')
  clock += 9000_000
  expect(await runPeriodicSuiteOnce(options(), transport())).toMatchObject({ status: 'not run' })
  const { result, data } = await onANewTip('flaky')
  expect(carriedAsked).toEqual([undefined, [two], [two]])
  const from = { recordId: firstId, seq: 1, contentHash: expect.stringMatching(/^[a-f0-9]{16}$/) }
  expect(result).toMatchObject({ status: 'filed', green: true, carried: { from, files: [two], ranFirst: [two] } })
  expect(carriedFileOf(result)).toEqual({ from, files: [two] })
  expect(data.failedFiles, 'the runs alone are filed in failedFiles order').toEqual(both)
  expect(theirOrder(result, data), 'the carried-over file ran alone first').toEqual(['second', 'first'])
  const summary = receiptAt(git('-C', repository, 'rev-parse', 'HEAD')).summary!
  expect(summary).toContain(firstId)
  expect(summary).toContain(two)
  expect(result.says).toContain(firstId)
})

it('carries nothing over after no receipt, a receipt that ran every red file alone, or a version 1 receipt, and keeps the sorted order', async () => {
  const none = await onANewTip('flaky')
  expect(none.result).toMatchObject({ status: 'filed', carried: { from: null, files: [] } })
  expect(carriedFileOf(none.result)).toEqual({ from: null, files: [] })
  expect(theirOrder(none.result, none.data)).toEqual(['first', 'second'])
  const everyOne = await onANewTip('flaky')
  expect(everyOne.result).toMatchObject({ status: 'filed', carried: { from: { recordId: String(none.result.receipt), seq: 1 }, files: [] } })
  expect(theirOrder(everyOne.result, everyOne.data)).toEqual(['first', 'second'])
  takesVersion2 = false
  const older = await onANewTip('not run alone')
  expect(older.data.version).toBe(1)
  takesVersion2 = true
  const after = await onANewTip('flaky')
  expect(after.result).toMatchObject({ status: 'filed', carried: { from: { recordId: String(older.result.receipt), seq: 1 }, files: [] } })
  expect(theirOrder(after.result, after.data)).toEqual(['first', 'second'])
  expect(carriedAsked).toEqual([undefined, undefined, undefined, undefined])
})

it('runs alone no carried-over file that passed the whole run, and names it in the receipt as not red this time', async () => {
  await onANewTip('not run alone')
  const { result, data } = await onANewTip('green')
  expect(carriedAsked.at(-1)).toEqual([two])
  expect(result).toMatchObject({ status: 'filed', green: true, carried: { files: [two], ranFirst: [] } })
  expect(data.failedFiles).toEqual([])
  expect(receiptAt(git('-C', repository, 'rev-parse', 'HEAD')).summary).toContain(two)
})

it('says a last receipt it cannot read, passes nothing, and runs in the sorted order', async () => {
  await onANewTip('not run alone')
  const stateFile = join(root, 'receipts', 'state.json')
  writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(readFileSync(stateFile, 'utf8')), lastReceipt: 'aReceiptNobodyFiled' }))
  const { result, data } = await onANewTip('flaky')
  expect(carriedAsked.at(-1)).toBeUndefined()
  const carried = (result as { carried?: { from?: unknown; files?: unknown; unreadable?: unknown } }).carried
  expect(carried).toMatchObject({ from: { recordId: 'aReceiptNobodyFiled' }, files: [], unreadable: expect.stringMatching(/\S/) })
  expect(carriedFileOf(result)).toEqual({ from: { recordId: 'aReceiptNobodyFiled' }, files: [], unreadable: carried!.unreadable })
  expect(receiptAt(git('-C', repository, 'rev-parse', 'HEAD')).summary).toContain(String(carried!.unreadable))
  expect(result.says).toContain(String(carried!.unreadable))
  expect(theirOrder(result, data)).toEqual(['first', 'second'])
})

it('refuses a door answer that did not put the carried-over red files first, and files nothing', async () => {
  await onANewTip('not run alone')
  await expect(onANewTip('carried mismatch')).rejects.toThrow(two)
  expect(receipts()).toHaveLength(1)
})

it('names three skipped cases in two files, sorted by file and name, and says so in the receipt and the answer', async () => {
  const skipped: SkippedCase[] = [
    { file: 'tests/two.test.ts', fullName: 'made-up skipped b', status: 'skipped' },
    { file: 'tests/one.test.ts', fullName: 'made-up skipped z', status: 'skipped' },
    { file: 'tests/one.test.ts', fullName: 'made-up skipped a', status: 'skipped' },
  ]
  const result = await runPeriodicSuiteOnce(options(), { ...transport(), runCloud: aCloudWithSkippedCases(skipped) })
  expect(result).toMatchObject({ status: 'filed', green: true })
  const receipt = receipts()[0]!
  expect(receipt.data.skippedCases).toEqual({ count: 3, cases: [
    { file: 'tests/one.test.ts', name: 'made-up skipped a' },
    { file: 'tests/one.test.ts', name: 'made-up skipped z' },
    { file: 'tests/two.test.ts', name: 'made-up skipped b' },
  ] })
  const sentence = '3 test cases were skipped, which leaves the receipt neither red nor incomplete. The receipt names each by file and name.'
  expect(receipt.summary).toContain(sentence)
  expect(result.says).toContain(sentence)
})

it('files a zero skipped count and says nothing about skipped cases when the suite skipped none', async () => {
  const result = await runPeriodicSuiteOnce(options(), transport())
  expect(result).toMatchObject({ status: 'filed', green: true })
  const receipt = receipts()[0]!
  expect(receipt.data.skippedCases).toEqual({ count: 0 })
  expect(receipt.data.skippedCases).not.toHaveProperty('cases')
  expect(receipt.data.skippedCases).not.toHaveProperty('notListed')
  expect(receipt.summary).not.toContain('skipped')
  expect(result.says).not.toContain('skipped')
})

it('names the first 200 skipped cases and says how many more were only counted', async () => {
  const skipped: SkippedCase[] = Array.from({ length: 250 }, (_, n) => ({
    file: n % 2 === 0 ? 'tests/one.test.ts' : 'tests/two.test.ts',
    fullName: `made-up skipped ${String(249 - n).padStart(3, '0')}`,
    status: 'skipped',
  }))
  const result = await runPeriodicSuiteOnce(options(), { ...transport(), runCloud: aCloudWithSkippedCases(skipped) })
  expect(result).toMatchObject({ status: 'filed', green: true })
  const receipt = receipts()[0]!
  const counted = receipt.data.skippedCases as { count: number; cases: { file: string; name: string }[]; notListed?: number }
  expect(counted.count).toBe(250)
  expect(counted.cases).toHaveLength(200)
  expect(counted.notListed).toBe(50)
  expect(counted.cases).toEqual([...counted.cases].sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)))
  expect(counted.cases[0]).toEqual({ file: 'tests/one.test.ts', name: 'made-up skipped 001' })
  expect(counted.cases[199]).toEqual({ file: 'tests/two.test.ts', name: 'made-up skipped 148' })
  const sentence = '250 test cases were skipped, which leaves the receipt neither red nor incomplete. The receipt names the first 200 by file and name, and 50 more are only counted.'
  expect(receipt.summary).toContain(sentence)
  expect(result.says).toContain(sentence)
})

it('lists two skipped cases with the same file and name and keeps the receipt valid', async () => {
  const skipped: SkippedCase[] = [
    { file: 'tests/one.test.ts', fullName: 'made-up repeated skip', status: 'skipped' },
    { file: 'tests/one.test.ts', fullName: 'made-up repeated skip', status: 'skipped' },
  ]
  const result = await runPeriodicSuiteOnce(options(), { ...transport(), runCloud: aCloudWithSkippedCases(skipped) })
  expect(result).toMatchObject({ status: 'filed', green: true })
  const receipt = receipts()[0]!
  expect(receipt.data.skippedCases).toEqual({ count: 2, cases: [
    { file: 'tests/one.test.ts', name: 'made-up repeated skip' },
    { file: 'tests/one.test.ts', name: 'made-up repeated skip' },
  ] })
  expect(wholeSuiteReceiptCrossChecks(receipt.data)).toEqual([])
})

it('files no skipped field when the office has none, but still counts the skipped cases', async () => {
  takesSkippedCases = false
  const skipped: SkippedCase[] = [
    { file: 'tests/two.test.ts', fullName: 'made-up skipped b', status: 'skipped' },
    { file: 'tests/one.test.ts', fullName: 'made-up skipped a', status: 'skipped' },
  ]
  const result = await runPeriodicSuiteOnce(options(), { ...transport(), runCloud: aCloudWithSkippedCases(skipped) })
  expect(result).toMatchObject({ status: 'filed', green: true })
  const receipt = receipts()[0]!
  expect(receipt.data).not.toHaveProperty('skippedCases')
  const sentence = '2 test cases were skipped, which leaves the receipt neither red nor incomplete. This office has no skippedCases field, so the receipt does not name them; the original hashed report does.'
  expect(receipt.summary).toContain(sentence)
  expect(receipt.summary).not.toContain('The receipt names')
  expect(result.says).toContain(sentence)
  expect(result.says).not.toContain('The receipt names')
})

it('refuses a skipped case with no recorded name and files nothing', async () => {
  const skipped: SkippedCase[] = [{ file: 'tests/one.test.ts', fullName: '   ', status: 'skipped' }]
  await expect(runPeriodicSuiteOnce(options(), { ...transport(), runCloud: aCloudWithSkippedCases(skipped) }))
    .rejects.toThrow('A skipped test has no recorded name. No receipt was filed.')
  expect(receipts()).toHaveLength(0)
})

it('keeps the complete and green answers the same with and without skipped cases, for green and red receipts', () => {
  const green = { ...WHOLE_SUITE_RECEIPT_EXAMPLE }
  const greenSkipped = { ...green, skippedCases: { count: 2, cases: [
    { file: 'tests/one.test.ts', name: 'made-up skipped one' },
    { file: 'tests/two.test.ts', name: 'made-up skipped two' },
  ] } }
  const red = { ...green, suiteExitCode: 1, failedFiles: ['tests/one.test.ts'], failedTests: [{ file: 'tests/one.test.ts', name: 'made-up failed one' }] }
  const redSkipped = { ...red, skippedCases: { count: 1, cases: [{ file: 'tests/two.test.ts', name: 'made-up skipped two' }] } }
  for (const [name, plain, withSkipped, greenAnswer] of [
    ['green', green, greenSkipped, true],
    ['red', red, redSkipped, false],
  ] as const) {
    expect(wholeSuiteReceiptIsComplete(plain), `${name} receipt is complete`).toBe(true)
    expect(wholeSuiteReceiptIsComplete(withSkipped), `${name} receipt is complete with skipped cases`).toBe(true)
    expect(wholeSuiteReceiptIsGreen(withSkipped), `${name} receipt is green with skipped cases`).toBe(greenAnswer)
    expect(wholeSuiteReceiptIsGreen(withSkipped), `${name} receipt keeps its answer`).toBe(wholeSuiteReceiptIsGreen(plain))
  }
})
