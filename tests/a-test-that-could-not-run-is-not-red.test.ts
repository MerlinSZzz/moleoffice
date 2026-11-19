// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A run with no result is not red. The real merge tool keeps both red controls, the stalled bounce,
 * whose first run is the rerun that cannot start, and the cases about comparison pairs and changed answers.
 * Other missing or interrupted results are read directly from synthetic reports and launcher
 * output through the result reader. Every office, repository and result here is synthetic.
 * A file red alone with the entry and green alone on main is named in `redOnlyWithIt`, the fact by
 * which the office may hand such a red to the entry's own line (wave 13u round 63). A run whose red
 * the pair cleared sends no such fact. A file a vitest worker exit left unfinished in the suite got no
 * answer there, so it is run alone and its green run alone is not named as a changed answer.
 * A changed answer carries the failure lines of the run it was red in, read from that run's real vitest log: the
 * suite's for a file green alone, its own run alone for a file green in the pair (bkz8lMSIr2Dz; 13u round 180).
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { aTestAddress, aTestIdentity, THE_MERGE_TOOLS_TEST_ADDRESS } from './the-test-commit-address.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'the-merger.mjs')
const SANDBOX_TOOL = join(REPO, 'tests', 'stand-in-sandbox-tool.mjs')
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }

type Queue = typeof import('../src/server/lib/merge-queue.ts')
type Repositories = typeof import('../src/server/lib/repositories.ts')

let t: TestDb
let app: FastifyInstance
let queue: Queue
let repositories: Repositories
let api: string
let base: string
// red-files.mjs declares no types, so tsc reads noResultIn's optional run as null only. The cases below pass it runs.
let resultReader: Omit<typeof import('../tools/merge-tool/red-files.mjs'), 'noResultIn'> & {
  noResultIn(reportFile: string, tree: string, file: string, run?: object | null): string | null
}
const groups = new Set<number>()
const repositoryOf = new Map<string, string>()

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'mq-worker')
const asInspector = as('agent', 'mq-inspector')
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

// ============================================================================ fixtures

const PASSING = `import { expect, it } from 'vitest'
it('passes', () => { expect(1).toBe(1) })
`
/** SYNTHETIC: a test that fails wherever it runs. */
const FAILING = `import { expect, it } from 'vitest'
it('fails with this entry', () => { expect(1).toBe(2) })
`

/** A synthetic main checkout: a git repository with a build that does nothing and one passing test. */
function mainCheckout(name: string): string {
  const dir = realpathSync(mkdtempSync(join(base, `main-${name}-`)))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', aTestAddress('fixture'))
  git(dir, 'config', 'user.name', 'Synthetic fixture')
  write(dir, {
    'package.json': JSON.stringify({ name: 'synthetic-not-run-fixture', private: true, type: 'module', scripts: { build: 'node tools/build.mjs', test: 'vitest run' } }, null, 2),
    '.gitignore': 'node_modules\n.logs\n',
    // Its own config, so vitest does not walk up into this checkout's.
    'vitest.config.mjs': "export default { test: { include: ['tests/**/*.test.ts'] } }\n",
    'tools/build.mjs': 'process.exit(0)\n',
    'tests/one.test.ts': PASSING,
  })
  symlinkSync(realpathSync(join(REPO, 'node_modules')), join(dir, 'node_modules'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  const registered = repositories.registerRepository({ workspaceId: 'default', name: `fixture-${name}`, root: dir, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  repositoryOf.set(dir, registered.id)
  return dir
}

/** Submits a worker's clone of `main` with one commit writing `files`, from a finished run, and answers the entry. */
async function submitted(main: string, name: string, files: Record<string, string>): Promise<string> {
  const dir = join(base, `worker-${name}`)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  write(dir, files)
  git(dir, 'add', '-A')
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Synthetic submission ${name}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...withoutInheritedEffort(), ...aTestIdentity('Synthetic worker', 'worker') },
  })
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run whose tests could not run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'mq-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'mq-worker', cutFrom: 'main', workingDirectory: realpathSync(dir) },
  }).id
  theRunReportsForTheQueue(t, run, { type: 'agent', id: 'mq-worker' })
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
  const r = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'git', repository: repositoryOf.get(main)!, branch: 'work' } } })
  expect(r.statusCode, r.body).toBe(201)
  return String(r.json().entry.id)
}

/** The inspector releases the run that submitted the entry, through the real check doors, as tests/the-merger.test.ts does. */
async function released(entry: string): Promise<void> {
  expect(stateOf(entry)).toBe('pinned')
  const run = String(t.api.getRecord(entry)!.data['run'])
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: String(t.api.getRecord(run)!.data['workingDirectory']), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/assembled`,
    headers: asInspector,
    payload: { changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })), base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' }, read },
  })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const verdict = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asInspector, payload: { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Synthetic: read the changes and found nothing missing.', chaptersRead: [], read } })
  expect(verdict.statusCode, verdict.body).toBe(201)
  expect(stateOf(entry)).toBe('judged')
}

function stateOf(entry: string): string {
  return String(t.api.getRecord(entry)!.data['state'])
}

function readingOf(entry: string): Record<string, any> {
  return queue.readMergeEntry(t.api.getRecord(entry)!) as unknown as Record<string, any>
}

const workdirOf = (entry: string): string => join(base, 'work', entry)

/** The steps the tool wrote down in <workdir>/steps.jsonl, each before it sent it to the office. */
function stepsWritten(entry: string): string[] {
  const file = join(workdirOf(entry), 'steps.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter((one) => one !== '').map((one) => String((JSON.parse(one) as { step: string }).step))
}

/** The sandbox the tool made for the entry, by the folder it wrote into its state. */
function sandboxNameOf(entry: string): string {
  const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')) as { sandbox?: { folder?: string } }
  return String(state.sandbox?.folder).split('/').pop()!
}

interface Run {
  code: number | null
  err: string
  out: string
  /** The steps written by this run only. */
  steps: string[]
}

async function runTheTool(entry: string, env: Record<string, string> = {}): Promise<Run> {
  const before = stepsWritten(entry).length
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: 'default', actor: office, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
  const child = spawn(
    process.execPath,
    [
      TOOL, '--entry', entry, '--session', session, '--api', api, '--workspace', 'default', '--workdir', workdirOf(entry), '--slot-every', '1', '--health-for', '30', '--office-for', '30',
      '--sandbox-tool', SANDBOX_TOOL, '--sandboxes', join(base, 'sandboxes'),
    ],
    // THE BUS LEAVES AT ONCE in this test: its 30-minute wait for riders is not what this file is about.
    { cwd: REPO, env: { ...withoutInheritedEffort(), MOLE_OFFICE_API: api, MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: '0', MOLE_OFFICE_COMMIT_EMAIL: THE_MERGE_TOOLS_TEST_ADDRESS, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  groups.add(child.pid!)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve))
  groups.delete(child.pid!)
  return { code, err, out, steps: stepsWritten(entry).slice(before) }
}

/** Pins the entry, has it released, and runs the tool once more with `env`: it integrates and tests. */
async function testedWith(entry: string, env: Record<string, string>): Promise<Run> {
  const pinned = await runTheTool(entry)
  expect(pinned.code, pinned.err + pinned.out).toBe(0)
  await released(entry)
  return runTheTool(entry, env)
}

/** A tool run that stopped on a run with no result: exit 1, no `tested` step, the entry still testing and not bounced. */
function expectItStoppedWithoutAVerdict(entry: string, run: Run, state: 'testing' | 'integrating' = 'testing'): string {
  expect(run.code, run.err + run.out).toBe(1)
  expect(run.steps).toEqual(state === 'integrating' ? ['integrating'] : ['integrating', 'integrated'])
  expect(run.steps).not.toContain('tested')
  const reading = readingOf(entry)
  expect(reading['state']).toBe(state)
  expect(reading['machine']?.['bounced']).toBeUndefined()
  expect(reading['machine']?.['tested']).toBeUndefined()
  const reason = String(reading['tool']?.['reason'])
  expect(reason).toContain('The merge tool could not go on: ')
  expect(reason).toContain(state === 'integrating' ? 'Nothing says whether it builds.' : 'A run with no result is not counted as red, so nothing was reported as tested.')
  return reason
}

/** What the tool wrote beside its last `tested` step, from <workdir>/steps.jsonl. */
function testedDetailOf(entry: string): Record<string, any> {
  const lines = readFileSync(join(workdirOf(entry), 'steps.jsonl'), 'utf8').split('\n').filter((one) => one !== '')
  const tested = lines.map((one) => JSON.parse(one) as { step: string; detail: Record<string, any> }).filter((one) => one.step === 'tested')
  expect(tested.length, 'no tested step').toBeGreaterThan(0)
  return tested.at(-1)!.detail
}

/** The facts of the tool's last `tested` step, from <workdir>/steps.jsonl. */
function testedFactsOf(entry: string): Record<string, any> {
  const lines = readFileSync(join(workdirOf(entry), 'steps.jsonl'), 'utf8').split('\n').filter((one) => one !== '')
  const tested = lines.map((one) => JSON.parse(one) as { step: string; facts: Record<string, any> }).filter((one) => one.step === 'tested')
  expect(tested.length, 'no tested step').toBeGreaterThan(0)
  return tested.at(-1)!.facts
}

/**
 * THE FAILURE LINES THE TOOL READS FROM A REAL VITEST LOG of one failing case: one block, standing on the line of the log
 * its FAIL line stands on, that opens with the FAIL line and holds the error. Outside an agent vitest writes its colour
 * codes into the log as well, so the log is read here without them, by node's own stripVTControlCharacters.
 */
function theFailureLinesOfARealRun(log: string, failed: string, error: string) {
  const lines = stripVTControlCharacters(readFileSync(log, 'utf8')).split(/\r?\n/)
  const at = lines.findIndex((one) => one === ` FAIL  ${failed}`)
  expect(at, `no FAIL line for ${failed} in ${log}`).toBeGreaterThanOrEqual(0)
  return { log, found: 'blocks', blocks: [{ line: at + 1, lines: expect.arrayContaining([` FAIL  ${failed}`, expect.stringContaining(error)]), cut: expect.any(Boolean) }], leftOut: 0 }
}

/** The commit of the integrated tree the entry was tested on, from <workdir>/state.json. */
function integratedCommitOf(entry: string): string {
  const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')) as { integrated?: { Cfinal?: string } }
  return String(state.integrated?.Cfinal)
}

/** The labels of the runs the tool made in the entry's sandbox, in order, read off each run's report path. */
function execLabelsOf(entry: string): string[] {
  const name = sandboxNameOf(entry)
  return readFileSync(join(base, 'sandboxes', 'calls.jsonl'), 'utf8')
    .split('\n')
    .filter((one) => one !== '')
    .map((one) => JSON.parse(one) as { verb: string; name: string; command?: string[] })
    .filter((one) => one.verb === 'exec' && one.name === name)
    .map((one) => /--outputFile\.json=.*\/([^/]+)\.json$/u.exec((one.command ?? []).find((word) => word.startsWith('--outputFile.json=')) ?? '')?.[1] ?? 'build')
}

const notRunning = (entry: string): string => `sandbox: The sandbox ${sandboxNameOf(entry)} is not running (docker says it is exited). Start it with node tools/sandbox.mjs up.`

// ============================================================================ set-up

beforeAll(async () => {
  t = await freshDb()
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  base = realpathSync(mkdtempSync(join(REPO, '.logs', 'not-run-')))
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const argv = process.argv
  process.argv = [argv[0]!, argv[1]!, '--entry', 'synthetic-reader-entry', '--session', 'synthetic-reader-session', '--workdir', join(base, 'reader-work'), '--api', api]
  try {
    resultReader = await import('../tools/merge-tool/red-files.mjs')
  } finally {
    process.argv = argv
  }
  queue = await import('../src/server/lib/merge-queue.ts')
  repositories = await import('../src/server/lib/repositories.ts')
  for (const payload of [
    { handle: 'mq-worker', name: 'Synthetic mq-worker', workArea: ['src', 'tests', 'tools'] },
    { handle: 'mq-inspector', name: 'Synthetic mq-inspector', role: 'inspector' },
    { handle: 'mq-secretary', name: 'Synthetic mq-secretary', role: 'secretary' },
  ]) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
}, 60_000)

let keepTheFixtures = false
afterEach((context) => {
  if (context.task.result?.state === 'fail') keepTheFixtures = true
})

afterAll(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
  await app?.close()
  t?.close()
  if (base !== undefined && !keepTheFixtures) rmSync(base, { recursive: true, force: true })
  else if (base !== undefined) process.stderr.write(`tests/a-test-that-could-not-run-is-not-red.test.ts: a test failed, so the fixtures and the tool's logs are kept under ${base}\n`)
})

/** A completed failed test result, varied by the direct reader cases below. */
function aResult(name: string) {
  const tree = realpathSync(mkdtempSync(join(base, `reader-${name}-`)))
  const file = 'tests/one.test.ts'
  const report = join(tree, 'report.json'), outFile = join(tree, 'launcher.log')
  writeFileSync(report, JSON.stringify({ numTotalTests: 1, numPassedTests: 0, numFailedTests: 1,
    testResults: [{ name: join(tree, file), status: 'failed', assertionResults: [{ fullName: 'synthetic failed assertion', status: 'failed' }] }],
  }))
  writeFileSync(outFile, 'sandbox-start: started {"pid":4242}\n')
  return { tree, file, report, run: { code: 1, timedOut: false, signal: null, outFile, tail: '' } }
}

// ============================================================================ the tests

describe('a red file whose run alone gave no result', () => {
  it('reads a rerun cut off by a signal or time limit as no result even with a partial report', () => {
    const { tree, file, report, run } = aResult('cut-off')
    for (const code of [124, 137, 143, null]) {
      expect(resultReader.noResultIn(report, tree, file, { ...run, code, stoppedReason: 'synthetic interruption' })).toBe('the command was stopped before its end (synthetic interruption)')
    }
    expect(resultReader.noResultIn(report, tree, file, { ...run, timedOut: true, stoppedReason: 'synthetic time limit' })).toBe('the command was stopped before its end (synthetic time limit)')
    expect(resultReader.noResultIn(report, tree, file, run)).toBeNull()
  })

  it('still bounces as red a file that fails alone with this entry and passes alone on main (the control)', async () => {
    const main = mainCheckout('really-red')
    const entry = await submitted(main, 'really-red', { 'tests/one.test.ts': FAILING })
    const run = await testedWith(entry, {})
    expect(run.code, run.err + run.out).toBe(0)
    expect(run.steps).toEqual(['integrating', 'integrated', 'tested'])
    const bounced = readingOf(entry)['machine']['bounced']
    expect(bounced).toMatchObject({ reason: 'red', redTests: ['tests/one.test.ts'] })
    // THE PAIR IS NAMED, with each run's time and load (finding 81).
    expect(String(bounced.says)).toMatch(
      /tests\/one\.test\.ts \(1 test\(s\) fail only with this entry: fails with this entry \(in a pair of runs one straight after the other, on main at \d{4}-\d\d-\d\d \d\d:\d\d:\d\d \(1-minute load [\d.]+\) and with this entry at \d{4}-\d\d-\d\d \d\d:\d\d:\d\d \(1-minute load [\d.]+\)\)\)/u,
    )
    const compared = testedDetailOf(entry)['compared'] as Record<string, any>[]
    expect(compared).toEqual([expect.objectContaining({ file: 'tests/one.test.ts', clearedByThePair: false, pair: { main: expect.objectContaining({ failing: [], load1: expect.any(Number) }), entry: expect.objectContaining({ failing: ['fails with this entry'], load1: expect.any(Number) }) } })])
    // A FILE THAT STAYED RED DID NOT CHANGE ITS ANSWER, so the tested facts carry no list (wave 13u round 51).
    expect(testedFactsOf(entry)).not.toHaveProperty('changedTheirAnswer')
    // AND THE FACTS SAY IT IS RED ONLY WITH THIS ENTRY, after the pair (wave 13u round 63).
    expect(testedFactsOf(entry)['redOnlyWithIt']).toEqual(['tests/one.test.ts'])
    // MAIN'S FRESH RUN IS THE PAIR'S FIRST HALF, and the entry's run comes straight after it: no run on main is repeated.
    expect(execLabelsOf(entry)).toEqual(expect.arrayContaining(['main-rerun-1', 'pair-entry-1']))
    expect(execLabelsOf(entry)).not.toContain('pair-main-1')
    expect(stateOf(entry)).toBe('bounced')
  }, 240_000)
})

describe('a whole suite or a run on main that gave no result', () => {
  it('reads absent, unreadable and incomplete reports as no result and keeps the launcher sentence', () => {
    const { tree, file, report, run } = aResult('report')
    rmSync(report)
    expect(resultReader.noResultIn(report, tree, file, run)).toBe('it left no readable report')
    writeFileSync(report, '{unfinished')
    expect(resultReader.noResultIn(report, tree, file, run)).toBe('it left no readable report')
    writeFileSync(report, JSON.stringify({ testResults: [] }))
    expect(resultReader.noResultIn(report, tree, file, run)).toBe('its report does not name the file')
    for (const sentence of ['sandbox: The synthetic sandbox is not running.', 'sandbox-start: The ledger did not answer. The command never ran.']) {
      writeFileSync(run.outFile, sentence + '\n')
      expect(resultReader.whyARunGaveNoResult(run)).toBe('the launcher never started the command')
      expect(resultReader.whatTheRunSaid({ ...run, tail: sentence })).toBe(`the launcher exited 1 and said "${sentence}"`)
    }
  })

  it('reads a run on main with no report as no result even when it exits zero', () => {
    const { tree, file, report, run } = aResult('main-report')
    expect(resultReader.noResultIn(report, tree, file, run)).toBeNull()
    rmSync(report)
    expect(resultReader.noResultIn(report, tree, file, { ...run, code: 0 })).toBe('it left no readable report')
  })
})

describe("the office's words after three tool runs whose reruns gave no result", () => {
  it('bounces the entry as stalled, with what the tool said, and no word says a test failed', async () => {
    const main = mainCheckout('stalled')
    const entry = await submitted(main, 'stalled', { 'tests/broken.test.ts': FAILING })
    const env = { STAND_IN_SANDBOX_EXEC_ENDS: 'down:rerun-1.json' }
    // THE RUN THAT BROUGHT THE ENTRY INTO TESTING IS NOT A STALL: that move wrote a fresh ask for the tool
    // (whatFollowsARunThatEnded). Each of the three runs after it ends without moving the entry.
    const first = await testedWith(entry, env)
    // The first run stops the tool when the rerun cannot start, naming the file and the launcher's sentence, and bounces nothing.
    const reason = expectItStoppedWithoutAVerdict(entry, first)
    expect(reason).toContain('1 of the 1 test file(s) red in the whole suite gave no result when run again alone')
    expect(reason).toContain(`tests/broken.test.ts: it left no readable report; the launcher exited 1 and said "${notRunning(entry)}"`)
    expect(first.err).toContain(notRunning(entry))
    expect(readingOf(entry)['machine']['stalls']).toBeUndefined()
    for (const runs of [1, 2, 3]) {
      const again = await runTheTool(entry, env)
      expect(again.code, again.err + again.out).toBe(1)
      expect(again.steps).toEqual([])
      if (runs < 3) {
        expect(stateOf(entry)).toBe('testing')
        expect(readingOf(entry)['machine']['stalls']).toMatchObject({ runs })
      }
    }

    const reading = readingOf(entry)
    expect(reading['state']).toBe('bounced')
    const bounced = reading['machine']['bounced']
    expect(bounced).toMatchObject({ reason: 'stalled', files: [] })
    expect(bounced.redTests).toBeUndefined()
    const says = String(bounced.says)
    expect(says).toContain('The merge tool ended 3 times without moving it, so the office stopped asking for the tool.')
    expect(says).toContain(`tests/broken.test.ts: it left no readable report; the launcher exited 1 and said "${notRunning(entry)}"`)
    expect(says).toContain('A run with no result is not counted as red, so nothing was reported as tested.')

    const told = reading['machine']['told'] as { submitter: string[]; secretary: string | null }
    const toTheSubmitter = told.submitter.map((id) => String(t.api.getRecord(id)!.data['body']))
    expect(toTheSubmitter.length).toBeGreaterThan(0)
    for (const body of toTheSubmitter) {
      expect(body).toContain(says)
      expect(body).toContain("Next: this is most likely the office's own trouble, not your work")
    }
    expect(told.secretary).not.toBeNull()
    const line = t.api.getRecord(told.secretary!)!
    expect(line.title).toMatch(new RegExp(`^bounced [^:]+: mq-worker #${entry} stalled after 3 merge tool runs → back to mq-worker$`, 'u'))

    // NO WORD SAYS A TEST FAILED: none of the office's texts on this entry carries the red bounce's words.
    for (const text of [says, ...toTheSubmitter, line.title, String(line.data['body'])]) {
      expect(text).not.toContain('stayed red')
      expect(text).not.toContain('fix the tests')
      expect(text).not.toContain('in a way main does not')
      expect(text).not.toMatch(/ red (test|tests|alone)\b/u)
    }
  }, 360_000)
})

describe('a build that gave no result', () => {
  it('reads an unstarted or interrupted build as no result and a completed failed build as a result', () => {
    const { run } = aResult('build')
    expect(resultReader.whyARunGaveNoResult({ ...run, error: 'synthetic launch failure' })).toBe('the launcher could not be started')
    expect(resultReader.whatTheRunSaid({ ...run, error: 'synthetic launch failure' })).toBe('it could not be started (synthetic launch failure)')
    expect(resultReader.whyARunGaveNoResult(run)).toBeNull()
    for (const code of [124, 137, 143, null]) expect(resultReader.whyARunGaveNoResult({ ...run, code })).toBe('the command was cut off before its end')
    expect(resultReader.whyARunGaveNoResult({ ...run, timedOut: true })).toBe('the command was cut off before its end')
    writeFileSync(run.outFile, 'sandbox-start: The ledger did not answer. The command never ran.\n')
    expect(resultReader.whyARunGaveNoResult(run)).toBe('the launcher never started the command')
  })

  it('bounces at the integration build guard when a build ran to its end and failed (the control)', async () => {
    const entry = await submitted(mainCheckout('build-red'), 'build-red', { 'tools/build.mjs': "console.error('synthetic build failure')\nprocess.exit(1)\n" })
    const run = await testedWith(entry, {})
    expect(run.code, run.err + run.out).toBe(0)
    expect(run.steps).toEqual(['integrating', 'guard-failed'])
    expect(readingOf(entry)['machine']['bounced']).toMatchObject({ reason: 'guard', files: ['tools/build.mjs'], says: expect.stringContaining('synthetic build failure') })
    expect(stateOf(entry)).toBe('bounced')
  }, 240_000)
})

describe('two entries tested in one suite, whose runs on main plus this entry gave no result', () => {
  it('reads a file or build without a result on either entry of a shared suite', () => {
    for (const side of ['lead', 'rider']) {
      const { tree, file, report, run } = aResult(`shared-${side}`)
      expect(resultReader.noResultIn(report, tree, file, { ...run, error: 'synthetic launch failure' })).toBe('the launcher could not be started')
      rmSync(report)
      expect(resultReader.noResultIn(report, tree, file, run)).toBe('it left no readable report')
      writeFileSync(run.outFile, 'sandbox: The synthetic sandbox is not running.\n')
      expect(resultReader.whyARunGaveNoResult(run)).toBe('the launcher never started the command')
    }
  })
})

describe('an entry is blamed only on a pair of runs, one straight after the other (finding 81)', () => {
  /** SYNTHETIC: fails the first two times it runs in a tree (the whole suite, then its first run alone), and passes after, as a test that times out under load does once the load falls. */
  const FAILS_TWICE = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const count = new URL('../runs.count', import.meta.url)
const runs = (existsSync(count) ? Number(readFileSync(count, 'utf8')) : 0) + 1
writeFileSync(count, String(runs))
it('passes', () => { expect(runs).toBeGreaterThan(2) })
`
  /** SYNTHETIC: a test on main that fails wherever it runs, standing for one that times out under load. */
  const FAILS_ON_MAIN = `import { expect, it } from 'vitest'
it('times out under load', () => { expect('slow').toBe('quick') })
`

  /** Writes, as an earlier entry would have kept it, main's result at M for `file`: every test passes. SYNTHETIC. */
  function aKeptResultSayingMainPasses(entry: string, main: string, file: string): void {
    const M = git(main, 'rev-parse', 'HEAD')
    const at = join(dirname(workdirOf(entry)), 'main-alone', M, `${createHash('sha256').update(file).digest('hex').slice(0, 32)}.json`)
    mkdirSync(dirname(at), { recursive: true })
    writeFileSync(at, JSON.stringify({ mainAt: M, file, failing: [], log: 'synthetic: no log, a kept result written by the test', measuredBy: 'a-synthetic-earlier-entry', at: '2026-09-25 13:02:00' }, null, 2))
  }

  /** A main checkout that carries FAILS_ON_MAIN as tests/load.test.ts. */
  function aMainWithATestThatFailsOnMain(name: string): string {
    const main = mainCheckout(name)
    write(main, { 'tests/load.test.ts': FAILS_ON_MAIN })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Synthetic: main carries a test that fails on main')
    return main
  }

  it('does not blame the entry for a test that failed in its first rerun and passes with it in the pair', async () => {
    const entry = await submitted(mainCheckout('pair-passes'), 'pair-passes', { 'tests/one.test.ts': FAILS_TWICE })
    const run = await testedWith(entry, {})
    expect(run.code, run.err + run.out).toBe(0)
    expect(run.steps.slice(0, 3)).toEqual(['integrating', 'integrated', 'tested'])
    const tested = readingOf(entry)['machine']['tested']
    expect(tested['green']).toBe(true)
    expect(String(tested['says'])).toMatch(
      /1 file\(s\) were red alone and are not this entry's doing: tests\/one\.test\.ts \(no test fails only with this entry in a pair of runs one straight after the other, on main at [\d-]+ [\d:]+ \(1-minute load [\d.]+\) and with this entry at [\d-]+ [\d:]+ \(1-minute load [\d.]+\); passed with this entry there: passes\)/u,
    )
    expect(testedDetailOf(entry)['clearedByThePair']).toEqual([expect.objectContaining({ file: 'tests/one.test.ts', pair: { main: expect.objectContaining({ failing: [] }), entry: expect.objectContaining({ failing: [] }) } })])
    // THE FILE CHANGED ITS ANSWER IN THE PAIR: the tested facts name it, with the pair's entry run and the tree's commit,
    // and the failure lines of its run alone with the entry, where it was red. MUTATION: read them from the pair's entry
    // run, where it passed, or from the suite, and this goes red.
    expect(testedFactsOf(entry)['changedTheirAnswer']).toEqual([
      { file: 'tests/one.test.ts', how: 'green-in-the-pair', commit: integratedCommitOf(entry), log: expect.stringContaining('pair-entry-1'),
        failureLines: theFailureLinesOfARealRun(join(workdirOf(entry), 'rerun-1.log'), 'tests/one.test.ts > passes', 'AssertionError: expected 2 to be greater than 2') },
    ])
    expect(testedFactsOf(entry)).not.toHaveProperty('redOnlyWithIt')
    expect(readingOf(entry)['machine']?.['bounced']).toBeUndefined()
  }, 240_000)

  it('runs the pair although a kept result says main passes, and does not blame the entry for a test that fails on main in the pair', async () => {
    const main = aMainWithATestThatFailsOnMain('kept-passes')
    const entry = await submitted(main, 'kept-passes', { 'src/quiet.txt': 'nothing a test reads\n' })
    aKeptResultSayingMainPasses(entry, main, 'tests/load.test.ts')
    const run = await testedWith(entry, {})
    expect(run.code, run.err + run.out).toBe(0)
    const tested = readingOf(entry)['machine']['tested']
    expect(tested['green']).toBe(true)
    expect(String(tested['says'])).toContain('tests/load.test.ts (no test fails only with this entry in a pair of runs one straight after the other, on main at ')
    expect(String(tested['says'])).toContain('; failed on main there too: times out under load)')
    // THE KEPT RESULT WAS NOT A HALF OF THE PAIR: main was run again, then the entry at once.
    const labels = execLabelsOf(entry)
    expect(labels).not.toContain('main-rerun-1')
    expect(labels.slice(-2)).toEqual(['pair-main-1', 'pair-entry-1'])
    // THE PAIR CLEARED IT ONLY BECAUSE MAIN FAILED TOO, so it did not change its answer: no list is sent.
    expect(testedFactsOf(entry)).not.toHaveProperty('changedTheirAnswer')
    expect(readingOf(entry)['machine']?.['bounced']).toBeUndefined()
  }, 240_000)

  it('reads a missing or interrupted result in either half of the comparison pair', () => {
    for (const side of ['main', 'entry']) {
      const { tree, file, report, run } = aResult(`pair-${side}`)
      expect(resultReader.noResultIn(report, tree, file, { ...run, code: 137, stoppedReason: 'synthetic container stopped' })).toBe('the command was stopped before its end (synthetic container stopped)')
      rmSync(report)
      expect(resultReader.noResultIn(report, tree, file, run)).toBe('it left no readable report')
    }
  })
})

describe('a file that changed its answer is named to the office (wave 13u round 51)', () => {
  /**
   * SYNTHETIC: fails only its first run in a tree, the whole suite, and passes when run alone straight after, as a test
   * that times out under load once does. The file therefore changed its answer on the tree under test.
   */
  const FAILS_ONCE = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const count = new URL('../runs.count', import.meta.url)
const runs = (existsSync(count) ? Number(readFileSync(count, 'utf8')) : 0) + 1
writeFileSync(count, String(runs))
it('passes after its first run', () => { expect(runs).toBeGreaterThan(1) })
`

  it('names a file red in the whole suite and green alone, with how, the commit and the log', async () => {
    const entry = await submitted(mainCheckout('green-alone'), 'green-alone', { 'tests/one.test.ts': FAILS_ONCE })
    const run = await testedWith(entry, {})
    expect(run.code, run.err + run.out).toBe(0)
    expect(run.steps.slice(0, 3)).toEqual(['integrating', 'integrated', 'tested'])
    expect(readingOf(entry)['machine']['tested']['green']).toBe(true)
    const commit = integratedCommitOf(entry)
    // ITS FAILURE LINES ARE THE SUITE'S, where it was red, and never its green run alone's. MUTATION: read them from the
    // run alone, and this goes red.
    const suiteLog = testedFactsOf(entry)['log'] as string
    expect(suiteLog.startsWith(`${workdirOf(entry)}/`)).toBe(true)
    expect(suiteLog).not.toBe(join(workdirOf(entry), 'suite.log'))
    expect(testedFactsOf(entry)['changedTheirAnswer']).toEqual([{ file: 'tests/one.test.ts', how: 'green-alone', commit, log: expect.stringContaining('rerun-1'),
      failureLines: theFailureLinesOfARealRun(suiteLog, 'tests/one.test.ts > passes after its first run', 'AssertionError: expected 1 to be greater than 1') }])
    // THE TOOL'S LOG NAMES THE FILE, HOW, AND THE COMMIT IN TWELVE CHARACTERS.
    expect(readFileSync(join(workdirOf(entry), 'the-merger.log'), 'utf8')).toContain(`tests/one.test.ts green-alone at ${commit.slice(0, 12)}`)
    expect(readingOf(entry)['machine']?.['bounced']).toBeUndefined()
  }, 240_000)
})

describe('a file whose vitest worker exited in the whole suite got no answer there (problem T2hRV4rStToG)', () => {
  /**
   * SYNTHETIC: its second test kills its own vitest worker in its first run in a tree, the whole suite, and passes in
   * every run after. Vitest 4.1.10 then calls the file passed with all three tests pending, prints its unhandled
   * "Worker exited unexpectedly" error and exits 1; run alone straight after, the file is green (measured 7 November
   * 2026 in a throwaway folder).
   */
  const LOSES_ITS_WORKER_ONCE = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const count = new URL('../runs.count', import.meta.url)
const runs = (existsSync(count) ? Number(readFileSync(count, 'utf8')) : 0) + 1
writeFileSync(count, String(runs))
it('passes', () => { expect(1).toBe(1) })
it('loses its worker in its first run only', () => { if (runs === 1) process.kill(process.pid, 'SIGKILL'); expect(runs).toBeGreaterThan(1) })
it('comes after', () => { expect(1).toBe(1) })
`
  const SAID = 'A vitest worker exited unexpectedly in the suite and left 3 test(s) of tests/one.test.ts unfinished. So the suite gave that file no answer: its run alone decides it, and a green run alone is not counted as a changed answer.'

  it('runs it alone, lets the entry pass, names the worker exit, and does not name the file as a changed answer', async () => {
    const entry = await submitted(mainCheckout('worker-exit'), 'worker-exit', { 'tests/one.test.ts': LOSES_ITS_WORKER_ONCE })
    const run = await testedWith(entry, {})
    expect(run.code, run.err + run.out).toBe(0)
    expect(run.steps.slice(0, 3)).toEqual(['integrating', 'integrated', 'tested'])
    expect(execLabelsOf(entry)).toContain('rerun-1')
    const tested = readingOf(entry)['machine']['tested']
    expect(tested['green']).toBe(true)
    expect(String(tested['says'])).toContain('npm test had 0 red file(s) and 1 file(s) a worker exit left unfinished in sandbox ')
    expect(String(tested['says'])).toContain(SAID)
    expect(testedFactsOf(entry)).not.toHaveProperty('changedTheirAnswer')
    const said = readFileSync(join(workdirOf(entry), 'the-merger.log'), 'utf8')
    expect(said).toContain(SAID)
    expect(said).not.toContain('FILES THAT CHANGED THEIR ANSWER')
    expect(readingOf(entry)['machine']?.['bounced']).toBeUndefined()
  }, 240_000)

  it('reads a file as left unfinished only in a red run whose log holds vitest\'s worker exit, and only with no failed test', () => {
    const tree = realpathSync(mkdtempSync(join(base, 'reader-worker-exit-')))
    const report = join(tree, 'report.json'), withTheExit = join(tree, 'suite.log'), without = join(tree, 'quoting.log')
    // SYNTHETIC: one file vitest called passed with two of its three tests pending, and one with a failed test beside a pending one.
    writeFileSync(report, JSON.stringify({ numTotalTests: 5, numPassedTests: 2, numFailedTests: 1,
      testResults: [
        { name: join(tree, 'tests/held.test.ts'), status: 'passed', assertionResults: [{ status: 'passed' }, { status: 'pending' }, { status: 'pending' }] },
        { name: join(tree, 'tests/answered.test.ts'), status: 'failed', assertionResults: [{ status: 'failed' }, { status: 'pending' }] },
      ],
    }))
    // The worker exit as vitest prints it, from 13q's kept log; and a failed assertion that only quotes its words.
    writeFileSync(withTheExit, readFileSync(join(REPO, 'tests', 'fixtures', 'stable', 'worker-crash', 'suite.txt'), 'utf8'))
    writeFileSync(without, 'AssertionError: expected the log to say Worker exited unexpectedly\n')
    const read = resultReader.redFilesIn(report, tree)
    expect(read?.failed).toEqual(['tests/answered.test.ts', 'tests/held.test.ts'])
    expect(resultReader.theFilesAWorkerExitLeftUnfinished(read, { code: 1, outFile: withTheExit })).toEqual([{ file: 'tests/held.test.ts', tests: 2 }])
    expect(resultReader.theFilesAWorkerExitLeftUnfinished(read, { code: 1, outFile: without })).toEqual([])
    expect(resultReader.theFilesAWorkerExitLeftUnfinished(read, { code: 0, outFile: withTheExit })).toEqual([])
    expect(resultReader.theFilesAWorkerExitLeftUnfinished(read, { code: 1, outFile: join(tree, 'no-such.log') })).toEqual([])
    expect(resultReader.theFilesAWorkerExitLeftUnfinished(null, { code: 1, outFile: withTheExit })).toEqual([])
  })
})

describe('a file red alone with no failed test named, and green on main (wave 13y round 54)', () => {
  /** SYNTHETIC: its second test kills its own vitest worker, as a full heap did. Vitest leaves both tests pending and exits 1. */
  const LOSES_ITS_WORKER = `import { expect, it } from 'vitest'
it('passes', () => { expect(1).toBe(1) })
it('loses its worker', () => { process.kill(process.pid, 'SIGKILL') })
`
  /**
   * SYNTHETIC: fails its first run in a tree, the whole suite, so that the file is run alone. After that its test passes
   * while a promise it does not wait for is rejected, and vitest calls the test passed and exits 1. A whole suite that
   * exits 1 with no red file is bounced as red by itself, without a run alone, so the first run has to name a failure.
   */
  const REJECTS_OUTSIDE_A_TEST = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const count = new URL('../runs.count', import.meta.url)
const runs = (existsSync(count) ? Number(readFileSync(count, 'utf8')) : 0) + 1
writeFileSync(count, String(runs))
it('passes after its first run', () => {
  if (runs > 1) void Promise.reject(new Error('synthetic: rejected outside any test'))
  expect(runs).toBeGreaterThan(1)
})
`
  const SAID = '(the run itself: vitest failed with no failed test named'

  it.each([
    ['loses-its-worker', LOSES_ITS_WORKER],
    ['rejects-outside-a-test', REJECTS_OUTSIDE_A_TEST],
  ])('is not filed as red on main, and the entry is bounced red with what vitest did (%s)', async (name, text) => {
    const main = mainCheckout(name)
    const entry = await submitted(main, name, { 'tests/one.test.ts': text })
    const run = await testedWith(entry, {})
    expect(run.code, run.err + run.out).toBe(0)
    expect(run.steps).toEqual(['integrating', 'integrated', 'tested'])
    expect(run.steps).not.toContain('red-on-main')
    const bounced = readingOf(entry)['machine']['bounced']
    expect(bounced).toMatchObject({ reason: 'red', redTests: ['tests/one.test.ts'] })
    expect(String(bounced.says)).toContain(`tests/one.test.ts (1 test(s) fail only with this entry: ${SAID}`)
    expect(String(bounced.says)).not.toContain('fails on main')
    const detail = testedDetailOf(entry)
    expect(detail['redOnMainToo'] ?? []).toEqual([])
    const compared = detail['compared'] as Record<string, any>[]
    expect(compared).toEqual([expect.objectContaining({ file: 'tests/one.test.ts', onMainToo: false, clearedByThePair: false, failing: [expect.stringContaining(SAID)], pair: { main: expect.objectContaining({ failing: [] }), entry: expect.objectContaining({ failing: [expect.stringContaining(SAID)] }) } })])
    expect(execLabelsOf(entry)).toEqual(expect.arrayContaining(['main-rerun-1', 'pair-entry-1']))
    expect(stateOf(entry)).toBe('bounced')
  }, 240_000)
})
