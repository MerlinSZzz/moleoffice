// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A plugin-only change uses its own check, the secret scan and the privacy gate. These real merge
 * tool runs keep landing, each refusal, the mixed change, one bus case, a failed page build and
 * both link cases. They also check all plain privacy rows and the missing-page no-result case.
 * The office, repositories, plugin commands and privacy files are synthetic fixtures.
 *
 * The plugin's own check and the privacy gate each run in a test-batches seat, and an office gives no new seat while
 * this machine's load or its free space is past that pool's limits. Here the two limits are set past anything this
 * machine reaches, so a busy machine, such as one running the whole suite, does not hold the lane. Mutation: the
 * free-space limit set above this machine's disk makes the first case wait for a seat, red at its time limit.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { A_PLAIN_LOG } from '../tools/merge-tool/plain-logs.mjs'
import { aTestAddress, aTestIdentity, THE_MERGE_TOOLS_TEST_ADDRESS } from './the-test-commit-address.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'the-merger.mjs')
const SANDBOX_TOOL = join(REPO, 'tests', 'stand-in-sandbox-tool.mjs')
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }
const THE_GATE = 'tests/the-owners-project-is-not-in-the-source.test.ts'
const THE_OTHER_GATE = 'tests/the-made-up-other-gate.test.ts'
const THE_MARKED_GATE = 'tests/the-made-up-marked-gate.test.ts'
const THE_HOUSE_FILE = 'tests/the-made-up-house-rule.test.ts'
/** The plain P rows of the fixture list, in the path order the lane reads them. */
const PLAIN_GATES = [THE_OTHER_GATE, THE_GATE].sort()
/** The sentence the tool ends every stop with when a run gave no result. */
const NO_RESULT_SENTENCE = 'A run with no result is not counted as red, so nothing was reported as tested.'

type Queue = typeof import('../src/server/lib/merge-queue.ts')
type Repositories = typeof import('../src/server/lib/repositories.ts')

let t: TestDb
let app: FastifyInstance
let queue: Queue
let repositories: Repositories
let api: string
let base: string
const groups = new Set<number>()
const repositoryOf = new Map<string, string>()
/** The test-batches pool's two limits, set past anything this machine reaches. */
const THE_SEAT_LIMITS = { MOLE_OFFICE_TEST_BATCH_LOAD_LIMIT: '1000', MOLE_OFFICE_TEST_BATCH_FREE_GB_LIMIT: '1' }
const savedLimits = new Map(Object.keys(THE_SEAT_LIMITS).map((name) => [name, process.env[name]]))

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

/** SYNTHETIC: a stand-in for tools/check-a-plugin.mjs, failing its tests step when the folder holds fails-its-check.txt. */
const THE_CHECK = `import { existsSync } from 'node:fs'
const id = process.argv[2]
const passed = !existsSync('plugins/' + id + '/fails-its-check.txt')
const steps = ['manifest', 'views', 'imports', 'types', 'tests', 'build', 'size'].map((step) =>
  step === 'tests' && !passed ? { step, outcome: 'failed', says: 'Synthetic: a test of the made-up plugin failed.' } : { step, outcome: 'passed', says: 'Synthetic.' })
console.log(JSON.stringify({ plugin: id, folder: process.cwd() + '/plugins/' + id, passed, steps }))
process.exit(passed ? 0 : 1)
`

/**
 * SYNTHETIC: a stand-in for tools/build-a-plugin.mjs. It writes one page into plugins/<id>/dist, and fails when the folder
 * holds fails-its-build.txt. When the folder holds links-out.txt it also puts a link in the built folder.
 */
const THE_BUILD = `import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
const id = process.argv[2]
const folder = 'plugins/' + id
const answer = (built, says) => {
  console.log(JSON.stringify({ plugin: id, folder: process.cwd() + '/' + folder, built, says }))
  process.exit(built ? 0 : 1)
}
if (existsSync(folder + '/fails-its-build.txt')) answer(false, 'Synthetic: the made-up plugin does not build.')
rmSync(folder + '/dist', { recursive: true, force: true })
mkdirSync(folder + '/dist', { recursive: true })
writeFileSync(folder + '/dist/main.html', 'SYNTHETIC PAGE OF ' + id + '\\n')
if (existsSync(folder + '/links-out.txt')) symlinkSync('../plugin.json', folder + '/dist/linked.json')
answer(true, 'Synthetic: built 1 file.')
`

/**
 * SYNTHETIC: a stand-in for tools/secret-scan.mjs that finds one made-up key when the folder holds holds-a-made-up-key.txt
 * and nothing otherwise, and says what it could not look at.
 */
const THE_SCAN = `import { existsSync } from 'node:fs'
const file = process.argv[2] + '/holds-a-made-up-key.txt'
const found = existsSync(file) ? { 'synthetic-key': 1 } : {}
const files = existsSync(file) ? [{ file, found }] : []
console.log(JSON.stringify({ filesRead: 1, bytesRead: 1, found, files, couldNotLookAt: ['Synthetic: the keys this office issued, since this folder has no office database'] }))
process.exit(files.length === 0 ? 0 : 1)
`

/** SYNTHETIC: a stand-in for the privacy gate, refusing a file under plugins/ that holds the made-up word. */
const THE_GATE_TEST = `import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
const under = (folder) => readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? under(join(folder, name)) : [join(folder, name)]))
it('finds no made-up private word under plugins/', () => {
  expect(under('plugins').filter((file) => readFileSync(file, 'utf8').includes('SYNTHETIC-PRIVATE-WORD'))).toEqual([])
})
`

/** SYNTHETIC: the second plain privacy file, refusing another made-up word, so a case can tell that it ran. */
const THE_OTHER_GATE_TEST = `import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
const under = (folder) => readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? under(join(folder, name)) : [join(folder, name)]))
it('finds no other made-up private word under plugins/', () => {
  expect(under('plugins').filter((file) => readFileSync(file, 'utf8').includes('SYNTHETIC-OTHER-PRIVATE-WORD'))).toEqual([])
})
`

/** SYNTHETIC: main's house-rule list: two plain P rows, one marked P row and one H row, and the files they name. */
const THE_HOUSE_RULE_LIST = `export const CLASSES = ['H', 'P', 'S', 'Q', 'F']
export const HOUSE_RULES = {
  '${THE_HOUSE_FILE}': { class: 'H', kind: 'wording' },
  '${THE_MARKED_GATE}': { class: 'P', kind: 'privacy-marker', mark: 'borderline' },
  '${THE_OTHER_GATE}': { class: 'P', kind: 'owner-content' },
  '${THE_GATE}': { class: 'P', kind: 'owner-content' },
}
`

/** SYNTHETIC: the stand-in build writes the built page the plain privacy files need, as `npm run build` does. */
const THE_BUILD_WITH_THE_PAGE = `import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('dist/web', { recursive: true })
writeFileSync('dist/web/index.html', 'SYNTHETIC BUILT PAGE\\n')
`

/** SYNTHETIC: a stand-in build that writes no page, for the case where the lane must stop with no result. */
const THE_BUILD_WITHOUT_THE_PAGE = 'process.exit(0)\n'

interface MainOptions {
  build?: 'with-the-page' | 'without-the-page'
}

/**
 * A synthetic main checkout: its house-rule list, the build, one passing test, the stand-ins, and the plugins folder.
 * The build writes the built page unless the case asks for none.
 */
function mainCheckout(name: string, { build = 'with-the-page' }: MainOptions = {}): string {
  const dir = realpathSync(mkdtempSync(join(base, `main-${name}-`)))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', aTestAddress('fixture'))
  git(dir, 'config', 'user.name', 'Synthetic fixture')
  write(dir, {
    'package.json': JSON.stringify({ name: 'synthetic-plugin-lane-fixture', private: true, type: 'module', scripts: { build: 'node tools/build.mjs', test: 'vitest run' } }, null, 2),
    '.gitignore': 'node_modules\n.logs\ndist/\n',
    // Its own config, so vitest does not walk up into this checkout's.
    'vitest.config.mjs': "export default { test: { include: ['tests/**/*.test.ts'] } }\n",
    'tools/build.mjs': build === 'with-the-page' ? THE_BUILD_WITH_THE_PAGE : THE_BUILD_WITHOUT_THE_PAGE,
    'tools/check-a-plugin.mjs': THE_CHECK,
    'tools/build-a-plugin.mjs': THE_BUILD,
    'tools/secret-scan.mjs': THE_SCAN,
    [THE_GATE]: THE_GATE_TEST,
    [THE_OTHER_GATE]: THE_OTHER_GATE_TEST,
    [THE_MARKED_GATE]: PASSING,
    [THE_HOUSE_FILE]: PASSING,
    'tests/house-rules.mjs': THE_HOUSE_RULE_LIST,
    'tests/one.test.ts': PASSING,
    'plugins/README.md': 'Synthetic: where plugins live.\n',
  })
  symlinkSync(realpathSync(join(REPO, 'node_modules')), join(dir, 'node_modules'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  const registered = repositories.registerRepository({ workspaceId: 'default', name: `fixture-${name}`, root: dir, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  repositoryOf.set(dir, registered.id)
  return dir
}

/**
 * Submits a worker's clone of `main` with one commit writing `files` and the links `links` (path to what it points at),
 * from a finished run, and answers the entry.
 */
async function submitted(main: string, name: string, files: Record<string, string>, links: Record<string, string> = {}): Promise<string> {
  const dir = join(base, `worker-${name}`)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  write(dir, files)
  for (const [path, target] of Object.entries(links)) symlinkSync(target, join(dir, path))
  git(dir, 'add', '-A')
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Synthetic submission ${name}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...aTestIdentity('Synthetic worker', 'worker') },
  })
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run of a made-up plugin',
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

/** The steps the tool wrote down in <workdir>/steps.jsonl, each with its facts, before it sent it to the office. */
function stepsWritten(entry: string): { step: string; facts: Record<string, any> }[] {
  const file = join(workdirOf(entry), 'steps.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter((one) => one !== '').map((one) => JSON.parse(one) as { step: string; facts: Record<string, any> })
}

/** The sandbox the tool made for the entry, by the folder it wrote into its state. */
function sandboxNameOf(entry: string): string {
  const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')) as { sandbox?: { folder?: string } }
  return String(state.sandbox?.folder).split('/').pop()!
}

/** Each sandbox command in order, after checking its common launcher, with the report path written as <report>. */
function commandsRunIn(entry: string): string[] {
  const name = sandboxNameOf(entry)
  return readFileSync(join(base, 'sandboxes', 'calls.jsonl'), 'utf8')
    .split('\n')
    .filter((one) => one !== '')
    .map((one) => JSON.parse(one) as { verb: string; name: string; command?: string[] })
    .filter((one) => one.verb === 'exec' && one.name === name)
    .map((one) => {
      const command = one.command ?? []
      const prefix = ['nice', '-n', '19', ...A_PLAIN_LOG]
      expect(command.slice(0, prefix.length)).toEqual(prefix)
      return command.slice(prefix.length).map((word) => (word.startsWith('--outputFile.json=') ? '--outputFile.json=<report>' : word)).join(' ')
    })
}

interface Run {
  code: number | null
  err: string
  out: string
}

async function runTheTool(entry: string): Promise<Run> {
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: 'default', actor: office, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
  const child = spawn(
    process.execPath,
    [
      TOOL, '--entry', entry, '--session', session, '--api', api, '--workspace', 'default', '--workdir', workdirOf(entry), '--slot-every', '1', '--health-for', '30', '--office-for', '30',
      '--sandbox-tool', SANDBOX_TOOL, '--sandboxes', join(base, 'sandboxes'),
    ],
    // THE BUS LEAVES AT ONCE in this test: its 30-minute wait for riders is not what this file is about.
    { cwd: REPO, env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: '0', MOLE_OFFICE_COMMIT_EMAIL: THE_MERGE_TOOLS_TEST_ADDRESS }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  groups.add(child.pid!)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve))
  groups.delete(child.pid!)
  return { code, err, out }
}

/** Pins the entry, has it released, and runs the tool once more: it integrates, tests, and lands when green. */
async function throughTheQueue(entry: string): Promise<Run> {
  const pinned = await runTheTool(entry)
  expect(pinned.code, pinned.err + pinned.out).toBe(0)
  await released(entry)
  return runTheTool(entry)
}

/** The facts of the tool's last `tested` step. */
function testedFactsOf(entry: string): Record<string, any> {
  const tested = stepsWritten(entry).filter((one) => one.step === 'tested')
  expect(tested.length, 'no tested step').toBeGreaterThan(0)
  return tested.at(-1)!.facts
}

/** The files the gate report the tool kept names, relative to the integrated clone, in path order. */
function gateReportNames(entry: string): string[] {
  const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')) as { integrated?: { clone?: string } }
  const clone = String(state.integrated?.clone)
  const report = JSON.parse(readFileSync(join(workdirOf(entry), 'plugin-gates.json'), 'utf8')) as { testResults?: { name: string }[] }
  return (report.testResults ?? []).map((one) => relative(clone, one.name).split('\\').join('/')).sort()
}

/** The three commands of a plugin-only change, after the integration's build, and the build of its page when it lands. */
const thePluginLane = (id: string, lands: boolean): string[] => [
  'npm run build',
  `node tools/check-a-plugin.mjs ${id} --json`,
  `node tools/secret-scan.mjs plugins/${id} --json`,
  `npm test -- --no-file-parallelism --reporter=default --reporter=json --outputFile.json=<report> ${PLAIN_GATES.join(' ')}`,
  ...(lands ? [theBuildOf(id)] : []),
]

/** The command a landing runs in the sandbox to build a plugin's page. */
const theBuildOf = (id: string): string => `node tools/build-a-plugin.mjs ${id} --json`

/** The tool's last `landed` step, with its facts and the detail it kept beside them. */
function landedStep(entry: string): { facts: Record<string, any>; detail: Record<string, any> } {
  const landed = stepsWritten(entry).filter((one) => one.step === 'landed')
  expect(landed.length, 'no landed step').toBeGreaterThan(0)
  return landed.at(-1)! as unknown as { facts: Record<string, any>; detail: Record<string, any> }
}

/** What the tool's last `landed` step says. */
const landedSays = (entry: string): string => String(landedStep(entry).facts['says'])

/** The built page of the plugin `id` in the main checkout `main`, or null when there is none. */
function pageIn(main: string, id: string): string | null {
  const file = join(main, 'plugins', id, 'dist', 'main.html')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

const A_PLUGIN = {
  'plugins/made-up/plugin.json': '{ "synthetic": "the stand-in check does not read it" }\n',
  'plugins/made-up/main.ts': '// Synthetic: a made-up plugin.\nexport const made = 1\n',
}

// ============================================================================ set-up

beforeAll(async () => {
  Object.assign(process.env, THE_SEAT_LIMITS)
  t = await freshDb()
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  base = realpathSync(mkdtempSync(join(REPO, '.logs', 'plugin-lane-')))
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  queue = await import('../src/server/lib/merge-queue.ts')
  repositories = await import('../src/server/lib/repositories.ts')
  for (const payload of [
    { handle: 'mq-worker', name: 'Synthetic mq-worker', workArea: ['src', 'tests', 'tools', 'plugins'] },
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
  for (const [name, value] of savedLimits) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (base !== undefined && !keepTheFixtures) rmSync(base, { recursive: true, force: true })
  else if (base !== undefined) process.stderr.write(`tests/a-plugin-only-change-is-tested-by-its-own-check.test.ts: a test failed, so the fixtures and the tool's logs are kept under ${base}\n`)
})

// ============================================================================ the tests

// These tests cite a decision.
describe("a plugin-only change, in the merge tool (plan VlQueUhVQQmi)", () => {
  it("is tested by the plugin's own check, the secret scan and the privacy gate, not by the office's suite, and lands", async () => {
    const main = mainCheckout('green')
    const entry = await submitted(main, 'green', A_PLUGIN)
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(commandsRunIn(entry)).toEqual(thePluginLane('made-up', true))
    const facts = testedFactsOf(entry)
    expect(facts).toMatchObject({ green: true, plugin: { id: 'made-up', manifest: true } })
    expect(facts['says']).toContain("A plugin-only change: every file it changes is under plugins/made-up, its manifest included, so it was tested by that plugin's own check")
    expect(facts['says']).toContain("and not by the office's suite (the plugin-lane rule)")
    expect(facts['says'], 'what the secret scan could not look at is said').toContain('Synthetic: the keys this office issued')
    // It runs every plain P row of main's house-rule list, and only those rows.
    expect(gateReportNames(entry), 'the gate ran both plain P rows, and neither the marked P row nor the H row').toEqual(PLAIN_GATES)
    expect(String(facts['says'])).toContain("The privacy gate ran all 2 plain privacy files from main's tests/house-rules.mjs at ")
    expect(String(facts['says'])).toContain('2 of its 2 tests passed')
    expect(stateOf(entry)).toBe('merged')
    expect(t.api.getRecord(entry)!.data['integrated'], 'the receipt names the plugin beside the tests').toMatchObject({ tests: { plugin: { id: 'made-up', manifest: true } } })
    expect(landedSays(entry)).toContain("the page of the plugin made-up was built in the entry's sandbox and put in plugins/made-up/dist (log ")
    expect(pageIn(main, 'made-up'), 'the page is where the office serves it from').toBe('SYNTHETIC PAGE OF made-up\n')
    expect(existsSync(join(main, 'dist', 'plugin-pages-landing', 'made-up')), 'nothing is left waiting').toBe(false)
    expect(git(main, 'status', '--porcelain'), 'the main checkout is clean').toBe('')
  }, 240_000)

  it("bounces as red when the plugin's own check fails, naming the command and the step", async () => {
    const main = mainCheckout('check-fails')
    const entry = await submitted(main, 'check-fails', { ...A_PLUGIN, 'plugins/made-up/fails-its-check.txt': 'Synthetic: the stand-in check fails.\n' })
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(commandsRunIn(entry)).toEqual(thePluginLane('made-up', false))
    const facts = testedFactsOf(entry)
    expect(facts).toMatchObject({ green: false, redTests: ['node tools/check-a-plugin.mjs made-up'], plugin: { id: 'made-up', manifest: true } })
    expect(facts['says']).toContain("The plugin's own check did not pass: tests: Synthetic: a test of the made-up plugin failed.")
    expect(stateOf(entry)).toBe('bounced')
    expect(readingOf(entry)['machine']['bounced']).toMatchObject({ reason: 'red', redTests: ['node tools/check-a-plugin.mjs made-up'] })
  }, 240_000)

  it('bounces as red when the privacy gate refuses the plugin, naming the gate', async () => {
    const main = mainCheckout('gate-refuses')
    const entry = await submitted(main, 'gate-refuses', { ...A_PLUGIN, 'plugins/made-up/main.ts': '// Synthetic: SYNTHETIC-PRIVATE-WORD.\nexport const made = 1\n' })
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(testedFactsOf(entry)).toMatchObject({ green: false, redTests: [THE_GATE], plugin: { id: 'made-up', manifest: true } })
    expect(stateOf(entry)).toBe('bounced')
  }, 240_000)


  it('stops with no result when the integrated tree has no built page, and does not bounce the plugin', async () => {
    const main = mainCheckout('no-built-page', { build: 'without-the-page' })
    const entry = await submitted(main, 'no-built-page', A_PLUGIN)
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(1)
    const log = readFileSync(join(workdirOf(entry), 'the-merger.log'), 'utf8')
    expect(log).toContain('The integrated tree ')
    expect(log).toContain(' has no built page at ')
    expect(log).toContain('so the plain privacy files cannot run')
    expect(log).toContain(NO_RESULT_SENTENCE)
    expect(commandsRunIn(entry).filter((one) => one.startsWith('npm test')), 'the privacy files did not run').toEqual([])
    expect(stateOf(entry)).toBe('testing')
    expect(stepsWritten(entry).filter((one) => one.step === 'tested'), 'no tested step was written').toEqual([])
  }, 240_000)




  it("bounces as red when the secret scan finds a key in the plugin's folder, naming the scan, the kind and the file", async () => {
    const main = mainCheckout('holds-a-key')
    const entry = await submitted(main, 'holds-a-key', { ...A_PLUGIN, 'plugins/made-up/holds-a-made-up-key.txt': 'Synthetic: the stand-in scan finds a made-up key here.\n' })
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(commandsRunIn(entry)).toEqual(thePluginLane('made-up', false))
    const facts = testedFactsOf(entry)
    expect(facts).toMatchObject({ green: false, redTests: ['node tools/secret-scan.mjs plugins/made-up'], plugin: { id: 'made-up', manifest: true } })
    expect(facts['says']).toContain('The secret scan found 1 synthetic-key in plugins/made-up/holds-a-made-up-key.txt.')
    expect(stateOf(entry)).toBe('bounced')
  }, 240_000)

  it("is not taken for a change to a plugin and anything else, which the office's suite tests as before", async () => {
    const main = mainCheckout('not-only')
    const entry = await submitted(main, 'not-only', { ...A_PLUGIN, 'src/a.txt': 'Synthetic: a file outside the plugin.\n' })
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    const commands = commandsRunIn(entry)
    expect(commands.filter((one) => one.includes('check-a-plugin') || one.includes('secret-scan'))).toEqual([])
    expect(commands.some((one) => one.startsWith('npm test -- --maxWorkers='))).toBe(true)
    expect(testedFactsOf(entry)['plugin']).toBeUndefined()
    expect(stateOf(entry)).toBe('merged')
    expect(commands.at(-1), 'its landing builds the page of the plugin it changes, as a plugin-only one does').toBe(theBuildOf('made-up'))
    expect(landedSays(entry)).toContain("the page of the plugin made-up was built in the entry's sandbox and put in plugins/made-up/dist")
    expect(pageIn(main, 'made-up')).toBe('SYNTHETIC PAGE OF made-up\n')
  }, 240_000)

  it("does not ride another entry's bus, and is tested by its own check at its own turn", async () => {
    const main = mainCheckout('no-ride')
    const A = await submitted(main, 'no-ride-a', { 'src/a.txt': 'Synthetic: an ordinary change.\n' })
    const B = await submitted(main, 'no-ride-b', A_PLUGIN)
    for (const one of [A, B]) {
      const pinned = await runTheTool(one)
      expect(pinned.code, pinned.err + pinned.out).toBe(0)
      await released(one)
    }
    const first = await runTheTool(A)
    expect(first.code, first.err + first.out).toBe(0)
    expect(testedFactsOf(A)['testedWith'], 'the plugin entry rode the bus').toBeUndefined()
    expect(readFileSync(join(workdirOf(A), 'the-merger.log'), 'utf8')).toContain(`${B} changes only plugins/made-up, which that plugin's own check tests, so it is tested alone`)
    expect(stateOf(A)).toBe('merged')
    expect(commandsRunIn(A).filter((one) => one.includes('build-a-plugin')), 'a landing that changes no plugin builds none').toEqual([])
    expect(landedStep(A).detail['pluginPages'], 'nor names a plugin').toEqual([])
    expect(landedSays(A)).not.toContain('the page of the plugin')
    expect(stateOf(B)).toBe('judged')
    const second = await runTheTool(B)
    expect(second.code, second.err + second.out).toBe(0)
    expect(commandsRunIn(B)).toEqual(thePluginLane('made-up', true))
    expect(testedFactsOf(B)).toMatchObject({ green: true, plugin: { id: 'made-up', manifest: true } })
    expect(stateOf(B)).toBe('merged')
    expect(pageIn(main, 'made-up')).toBe('SYNTHETIC PAGE OF made-up\n')
  }, 300_000)


  it('keeps the last good page when the build fails at the landing, merges, and says why', async () => {
    const main = mainCheckout('build-fails')
    // SYNTHETIC: a page built before, which git does not keep.
    write(main, { 'plugins/made-up/dist/main.html': 'SYNTHETIC LAST GOOD PAGE\n' })
    const entry = await submitted(main, 'build-fails', { ...A_PLUGIN, 'plugins/made-up/fails-its-build.txt': 'Synthetic: the stand-in build fails.\n' })
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(commandsRunIn(entry)).toEqual(thePluginLane('made-up', true))
    expect(stateOf(entry)).toBe('merged')
    expect(landedSays(entry)).toContain('the page of the plugin made-up was NOT built, so plugins/made-up/dist keeps what it held: Synthetic: the made-up plugin does not build. (log ')
    expect(pageIn(main, 'made-up'), 'the last good page is still served').toBe('SYNTHETIC LAST GOOD PAGE\n')
  }, 240_000)

  it('copies no link out of the sandbox, puts nothing in place, and says why', async () => {
    const main = mainCheckout('links-out')
    const entry = await submitted(main, 'links-out', { ...A_PLUGIN, 'plugins/made-up/links-out.txt': 'Synthetic: the stand-in build leaves a link.\n' })
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stateOf(entry)).toBe('merged')
    expect(landedSays(entry)).toMatch(/the page of the plugin made-up was NOT built, so plugins\/made-up\/dist keeps what it held: the build in the sandbox left \S+\/plugins\/made-up\/dist\/linked\.json, which is not a plain file or folder, so nothing was copied out of it/u)
    expect(existsSync(join(main, 'plugins', 'made-up', 'dist')), 'nothing was put in place').toBe(false)
    expect(existsSync(join(main, 'dist', 'plugin-pages-landing', 'made-up')), 'nothing is left waiting').toBe(false)
  }, 240_000)


  it('builds no page where git keeps a link as dist, and says the office serves no file through it', async () => {
    const main = mainCheckout('dist-a-link')
    // SYNTHETIC: a link named dist, which the .gitignore line dist/ does not leave out, since it is not a folder.
    const entry = await submitted(main, 'dist-a-link', A_PLUGIN, { 'plugins/made-up/dist': '../../tools' })
    const run = await throughTheQueue(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stateOf(entry)).toBe('merged')
    expect(commandsRunIn(entry)).toEqual(thePluginLane('made-up', false))
    expect(landedSays(entry)).toMatch(/the page of the plugin made-up was NOT built, so plugins\/made-up\/dist keeps what it held: git keeps plugins\/made-up\/dist at [0-9a-f]{12} as a link, and the office serves no file of a plugin whose dist is a link/u)
    expect(git(main, 'status', '--porcelain'), 'the main checkout is clean').toBe('')
  }, 240_000)
})
