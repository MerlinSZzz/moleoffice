// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SET-UP THE MERGE TOOL'S THREE TEST FILES SHARE: a real office on a port of its own, a proxy that writes down
 * each step the office accepted, synthetic repositories, and tools/the-merger.mjs run as a process of its own.
 *
 * tests/the-merger.test.ts says what this set-up is and why there is no stand-in. Its cases, and those of
 * tests/the-merger-suite.test.ts and tests/the-merger-bus.test.ts, use what this module exports. The three were one
 * file until wave 13p's round D split it, because that file alone took up to 568 seconds, close to the 590 an
 * agent's command may run.
 *
 * EACH FILE HAS AN OFFICE OF ITS OWN. A test file calls `aRealOfficeForTheMerger` once, at its top. That adds the
 * hooks that start the office on a fresh database before its first case and stop it after its last. Each test file
 * runs in a process of its own (`pool: 'forks'` in vitest.config.ts), so nothing below is shared between two files.
 */
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect } from 'vitest'
import { aTestAddress, aTestIdentity, THE_MERGE_TOOLS_TEST_ADDRESS } from './the-test-commit-address.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { settingNamed } from '../src/config/settings.mjs'
import { endMarker, startMarker } from '../tools/test-audit-table-markers.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { whyAGroupIsNeverSignalled } from '../tools/merge-tool/cleanup.mjs'

export const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The workers the merge tool gives a suite when nothing names another count: the setting's own default. */
export const SUITE_WORKERS = String(settingNamed('MOLE_OFFICE_MERGE_WORKERS').fallback)
export const TOOL = join(REPO, 'tools', 'the-merger.mjs')
/** The stand-in for tools/sandbox.mjs: it runs a command here, but only inside the instance folder, and writes down every call. */
const SANDBOX_TOOL = join(REPO, 'tests', 'stand-in-sandbox-tool.mjs')
const THE_WORKER = 'mole-office/the-message-worker'
export const office = { type: 'agent' as const, id: THE_WORKER }

type Queue = typeof import('../src/server/lib/merge-queue.ts')
type Repositories = typeof import('../src/server/lib/repositories.ts')

export let t: TestDb
export let app: FastifyInstance
export let queue: Queue
let repositories: Repositories
export let api: string
let proxy: Server
export let proxyApi: string
export let base: string
/**
 * EVERY PROCESS GROUP THIS FILE STARTED, with its leader's start time, so none outlives it whatever a test did. A group
 * is signalled only by `signalTheGroup`, which sends nothing to a group whose leader is no longer the process this file
 * started, nor to group 1 or this file's own group. A pid alone is not an identity: pids are given out again.
 */
export const groups = new Map<number, string | null>()
const OWN_GROUP = (() => {
  const own = theProcessAt(process.pid)
  return own.here ? own.pgid : null
})()

/** Records a group this file started; its leader is the process `pid`. */
export function startedAGroup(pid: number | undefined): number {
  if (pid === undefined) throw new Error('a process this file started has no pid')
  const now = theProcessAt(pid)
  groups.set(pid, now.here ? now.startedAt : null)
  return pid
}

/**
 * SENDS `signal` TO A GROUP THIS FILE STARTED, if its leader is still the process this file started. Otherwise says why
 * not, on stderr, and sends nothing. The refusals of group 1 and of the caller's own group are the merge cleanup's own.
 */
export function signalTheGroup(pid: number, signal: NodeJS.Signals): void {
  const recorded = groups.get(pid)
  const now = theProcessAt(pid)
  const why =
    whyAGroupIsNeverSignalled(pid, OWN_GROUP) ??
    (recorded === undefined
      ? 'this file did not record it'
      : recorded === null
        ? "its leader's start time could not be read when it started"
        : !now.here
          ? 'its leader has ended'
          : now.startedAt !== recorded
            ? 'its pid now belongs to another process'
            : null)
  if (why !== null) {
    process.stderr.write(`${theTestFile}: process group ${String(pid)} was not sent ${signal}: ${why}\n`)
    return
  }
  try {
    process.kill(-pid, signal)
  } catch {
    // Gone already.
  }
}
/** The repository row registered for each synthetic main checkout. */
export const repositoryOf = new Map<string, string>()

export const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
export const asWorker = as('agent', 'mq-worker')
export const asInspector = as('agent', 'mq-inspector')
export const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)

export const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function scratch(prefix: string): string {
  return realpathSync(mkdtempSync(join(base, `${prefix}-`)))
}

/**
 * WHERE A FILES ENTRY OF THE WORKER LANDS: a folder outside this checkout, registered as mq-worker's files area in
 * beforeAll through the office's door, since a files entry lands only inside its agent's files area and never inside
 * a git working tree such as this checkout (acceptance finding 52). It is a preview root too, so the landing's
 * read-back goes through the office as before.
 */
let filesBase: string
export function aFilesRoot(prefix: string): string {
  return realpathSync(mkdtempSync(join(filesBase, `${prefix}-`)))
}

export function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

// ============================================================================ fixtures

/**
 * tools/marks.mjs of the fixture: `npm run db:backup` and `db:migrate` write a mark naming main's HEAD at that moment. A
 * migration pointed at the database the backup stand-in names (`<main>/synthetic-source.db`) finds main through it, as
 * the real one reaches the live database from the clone; its mark also names where it ran and that checkout's HEAD.
 */
const MARKS_SCRIPT = `import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
const what = process.argv[2]
const named = process.env.MOLE_OFFICE_DB ?? ''
const root = what === 'migrate' && basename(named) === 'synthetic-source.db' ? dirname(named) : process.cwd()
const marks = root + '.marks'
mkdirSync(marks, { recursive: true })
const once = root + '.fail-' + what + '-once'
if (existsSync(once)) { unlinkSync(once); console.error('synthetic failure of ' + what + ', once'); process.exit(1) }
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const args = process.argv.slice(3)
if (what === 'backup') {
  writeFileSync(join(marks, 'requested-backup.json'), JSON.stringify({ args, head }))
  if (existsSync(root + '.backup-help-only')) {
    console.log('Synthetic older backup help: unknown option --if-older-than')
    process.exit(0)
  }
  const recent = root + '.recent-backup.json'
  const floor = args.indexOf('--if-older-than')
  if (floor !== -1 && existsSync(recent)) {
    const answer = JSON.parse(readFileSync(recent, 'utf8'))
    if (answer.ageMinutes < Number(args[floor + 1])) {
      console.log(JSON.stringify({ backupSkipped: true, ...answer }))
      process.exit(0)
    }
  }
  console.log(JSON.stringify({ from: root + '/synthetic-source.db', to: root + '.synthetic-backup.db', ms: 1 }, null, 2))
}
if (what === 'prune') {
  const pendingFile = root + '.prune-state'
  const pending = existsSync(pendingFile) ? { pending: JSON.parse(readFileSync(readFileSync(pendingFile, 'utf8'), 'utf8')).landing.pruned } : {}
  writeFileSync(join(marks, 'requested-prune.json'), JSON.stringify({ args, head, migrated: existsSync(root + '.migrated'), ...pending }))
  if (existsSync(root + '.prune-no-json')) { console.log('synthetic prune: no JSON'); process.exit(0) }
  console.log(JSON.stringify({
    removed: [{ name: 'mole-office-20260101-000001.db', ageMinutes: 63.24589, bytes: 456, freedBytes: 123 }],
    kept: [{ name: 'mole-office-20260101-000002.db' }],
    left: [{ name: 'mole-office-20260101-000003.db', reason: 'incomplete: synthetic missing files folder or list' }],
    wouldRemove: [], sayOnly: false,
  }))
}
if (what === 'migrate') writeFileSync(root + '.migrated', 'synthetic migration finished')
const ranIn = process.cwd()
const ranAt = execFileSync('git', ['-C', ranIn, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
writeFileSync(join(marks, what + '-' + String(Date.now()) + '-' + String(process.pid) + '.json'), JSON.stringify({ what, head, at: new Date().toISOString(), ranIn, ranAt }))
`

/** tools/audit.mjs of the fixture: writes design/AUDIT.md from the test files, the shape of the audit table. */
const AUDIT_SCRIPT = `import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
const files = readdirSync('tests').filter((one) => one.endsWith('.test.ts')).sort()
mkdirSync('design', { recursive: true })
writeFileSync('design/AUDIT.md', '# Synthetic audit table\\n\\n' + files.map((one) => '- tests/' + one).join('\\n') + '\\n')
`

/**
 * A VARIANT OF tools/audit.mjs THAT WRITES ONLY BETWEEN ONE MARKER PAIR, as the real tools/test-audit-table.mjs does, and
 * keeps every line outside the pair as it finds it. design/AUDIT.md then holds hand-written lines and generated ones.
 */
export const AUDIT_TABLE = 'synthetic-tests'
export const MARKED_AUDIT_SCRIPT = `import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
const files = readdirSync('tests').filter((one) => one.endsWith('.test.ts')).sort()
const text = readFileSync('design/AUDIT.md', 'utf8')
const start = ${JSON.stringify(startMarker(AUDIT_TABLE))}
const end = ${JSON.stringify(endMarker(AUDIT_TABLE))}
const from = text.indexOf(start)
const to = text.indexOf(end)
if (from < 0 || to < from) throw new Error('design/AUDIT.md has no table markers')
writeFileSync('design/AUDIT.md', text.slice(0, from + start.length) + '\\n' + files.map((one) => '- tests/' + one).join('\\n') + '\\n' + text.slice(to))
`
export const MARKED_AUDIT = [
  '# Synthetic audit table',
  '',
  'Written by hand, line 1.',
  'Written by hand, line 2.',
  'Written by hand, line 3.',
  'Written by hand, line 4.',
  '',
  startMarker(AUDIT_TABLE),
  'Nothing generated yet.',
  endMarker(AUDIT_TABLE),
  '',
  'Written by hand, after the table.',
  '',
].join('\n')

export const PASSING_TEST = `import { expect, it } from 'vitest'
it('passes', () => { expect(1).toBe(1) })
`

/** A synthetic main checkout: a git repository with a package.json whose scripts leave marks. */
export function mainCheckout(name: string, files: Record<string, string> = {}): string {
  const dir = scratch(`main-${name}`)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', aTestAddress('fixture'))
  git(dir, 'config', 'user.name', 'Synthetic merger fixture')
  write(dir, {
    'package.json': JSON.stringify(
      {
        name: 'synthetic-merger-fixture',
        private: true,
        type: 'module',
        scripts: { build: 'node tools/build.mjs', test: 'vitest run', 'db:backup': 'node tools/marks.mjs backup', 'db:migrate': 'node tools/marks.mjs migrate', 'db:prune-backups': 'node tools/marks.mjs prune' },
      },
      null,
      2,
    ),
    '.gitignore': 'node_modules\n.logs\n',
    // Its own config, so vitest does not walk up into this checkout's.
    'vitest.config.mjs': "export default { test: { include: ['tests/**/*.test.ts'] } }\n",
    'tools/build.mjs': 'process.exit(0)\n',
    'tools/marks.mjs': MARKS_SCRIPT,
    'tools/audit.mjs': AUDIT_SCRIPT,
    '.mole-office/protected.json': JSON.stringify(
      { protected: ['design/'], generated: [{ paths: ['design/AUDIT.md'], command: ['node', 'tools/audit.mjs'], regenerateWhen: ['tests/**'] }] },
      null,
      2,
    ),
    'tests/one.test.ts': PASSING_TEST,
    'src/a.txt': 'a1\na2\na3\n',
    'src/long.txt': Array.from({ length: 20 }, (_, i) => `line ${String(i + 1)}`).join('\n') + '\n',
    ...files,
  })
  execFileSync(process.execPath, ['tools/audit.mjs'], { cwd: dir })
  symlinkSync(realpathSync(join(REPO, 'node_modules')), join(dir, 'node_modules'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  const registered = repositories.registerRepository({ workspaceId: 'default', name: `fixture-${name}`, root: dir, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  repositoryOf.set(dir, registered.id)
  return dir
}

/** A worker's clone of the main checkout with one commit on `work`, edited by `edit`. */
export function workerClone(main: string, name: string, edit: (dir: string) => void): string {
  const dir = join(base, `worker-${name}`)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'config', 'user.email', aTestAddress('worker'))
  git(dir, 'config', 'user.name', 'Synthetic worker')
  git(dir, 'switch', '-q', '-c', 'work')
  edit(dir)
  git(dir, 'add', '-A')
  // THE FIXTURE'S AUTHOR IS SET IN THE ENVIRONMENT, NOT ONLY IN git config, and this file is the
  // one place that must not get this wrong: GIT_AUTHOR_* and GIT_COMMITTER_* outrank any git config
  // an agent sets, which is the whole fact the commit address change below is built on. A run
  // started by tools/sandbox-start.mjs without --plain-env exports all four, so a suite run the
  // ordinary way in a sandbox would make this commit the agent's and the assertion on HEAD^ would
  // read a name nobody wrote here. Naming them here is the fixture saying who wrote it, in the way
  // git actually reads.
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Synthetic submission ${name}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...withoutInheritedEffort(),
      ...aTestIdentity('Synthetic worker', 'worker'),
    },
  })
  return realpathSync(dir)
}

/** A finished, sealed run of the worker in `dir`. */
export async function sealedRun(dir: string): Promise<string> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic merger run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'mq-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'mq-worker', cutFrom: 'main', workingDirectory: dir },
  }).id
  theRunReportsForTheQueue(t, run, { type: 'agent', id: 'mq-worker' })
  const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(r.statusCode, r.body).toBe(200)
  return run
}

export async function submitGit(main: string, name: string, edit: (dir: string) => void): Promise<{ entry: string; worker: string }> {
  const worker = workerClone(main, name, edit)
  const run = await sealedRun(worker)
  const r = await app.inject({
    method: 'POST',
    url: '/api/merge-queue',
    headers: asWorker,
    payload: { run, changeset: { adapter: 'git', repository: repositoryOf.get(main)!, branch: 'work' } },
  })
  expect(r.statusCode, r.body).toBe(201)
  return { entry: String(r.json().entry.id), worker }
}

function toolSession(): string {
  return t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: 'default', actor: office, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
}

export function stateOf(entry: string): string {
  return String(t.api.getRecord(entry)!.data['state'])
}

/**
 * THE INSPECTOR RELEASES THE RUN THAT SUBMITTED THE ENTRY, through the real check doors: the assembly
 * first (the check door refuses a verdict with none), then the verdict, naming the run's own seal, its
 * hash and its tip. The office's verdict hook then moves the pinned entry to judged (H_RELEASE).
 */
export async function released(entry: string): Promise<void> {
  expect(stateOf(entry)).toBe('pinned')
  const run = String(t.api.getRecord(entry)!.data['run'])
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: String(t.api.getRecord(run)!.data['workingDirectory']), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/assembled`,
    headers: asInspector,
    payload: {
      changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
      base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
      read,
    },
  })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const verdict = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asInspector,
    payload: { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Synthetic: read the changes and found nothing missing.', chaptersRead: [], read },
  })
  expect(verdict.statusCode, verdict.body).toBe(201)
  expect(stateOf(entry)).toBe('judged')
}

/**
 * THE PERSON PRESSES A JUDGED ENTRY TO LAND, through the real door. An entry that changes drizzle/ or tools/the-merger.mjs
 * lands only after one press (wave 13v round 34), so a case whose entry changes one presses it
 * where it says so; tests/a-sensitive-path-lands-after-a-press.test.ts proves the wait itself.
 */
export async function pressedToLand(entry: string): Promise<void> {
  expect(stateOf(entry)).toBe('judged')
  const r = await app.inject({ method: 'POST', url: `/api/merge-queue/${entry}/press-to-land`, headers: asPerson, payload: { because: 'Synthetic: a test entry that changes a path which lands after a press.' } })
  expect(r.statusCode, r.body).toBe(200)
}

/** What the tool measured beside the facts of its last `step` of that name, from <workdir>/steps.jsonl. */
export function detailOf(entry: string, step: string): Record<string, any> {
  const lines = readFileSync(join(workdirOf(entry), 'steps.jsonl'), 'utf8').split('\n').filter((one) => one !== '')
  const found = lines.map((one) => JSON.parse(one) as { step: string; detail: Record<string, any> }).filter((one) => one.step === step)
  expect(found.length, `no ${step} step in ${workdirOf(entry)}/steps.jsonl`).toBeGreaterThan(0)
  return found.at(-1)!.detail
}

/** The entry as the office serves it. */
export function readingOf(entry: string): Record<string, any> {
  return queue.readMergeEntry(t.api.getRecord(entry)!) as unknown as Record<string, any>
}

export function marksOf(main: string, what: string): { head: string; at: string; ranIn?: string; ranAt?: string }[] {
  const dir = `${main}.marks`
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((one) => one.startsWith(`${what}-`))
    .sort()
    .map((one) => JSON.parse(readFileSync(join(dir, one), 'utf8')) as { head: string; at: string; ranIn?: string; ranAt?: string })
}

// ============================================================================ the tool, run for real

interface Run {
  code: number | null
  out: string
  err: string
  log: string
  steps: { step: string; facts: Record<string, any> }[]
}

const reported: { session: string | undefined; entry: string; step: string; facts: Record<string, any> }[] = []
export const hooks = new Map<string, (step: string) => void>()
/** A test can hold an accepted step before the proxy records it, even after its sender has ended. */
export const beforeRecording = new Map<string, (step: string) => Promise<void>>()
/**
 * THE ONE ANSWER THE PROXY CHANGES, for the test of acceptance finding 19 only. When set, GET
 * /api/runtime says the office runs from this synthetic main checkout, with `head` in the shape the
 * real door gives it ({full, short, branch}), read from that checkout at the moment it is asked.
 * Null for every other test, and then the proxy changes nothing at all.
 */
let officeRunsFrom: string | null = null

/** Sets `officeRunsFrom` for a test that needs it, and back to null after. */
export function theProxySaysTheOfficeRunsFrom(main: string | null): void {
  officeRunsFrom = main
}

export function workdirOf(entry: string): string {
  return join(base, 'work', entry)
}

export function sandboxesOf(): string {
  return join(base, 'sandboxes')
}

/** The folder of the entry's sandbox, as the tool wrote it into its state when it started the sandbox. */
export function sandboxFolderOf(entry: string): string {
  const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')) as { sandbox?: { folder?: string } }
  expect(state.sandbox?.folder, `no sandbox in ${workdirOf(entry)}/state.json`).toEqual(expect.any(String))
  return state.sandbox!.folder!
}

export function cloneOf(entry: string): string {
  return join(sandboxFolderOf(entry), 'work', 'clone')
}

/** Every call the tool made to the sandbox launcher for one entry's sandbox, in order. */
export function sandboxCallsOf(entry: string): Record<string, any>[] {
  const file = join(sandboxesOf(), 'calls.jsonl')
  if (!existsSync(file)) return []
  const name = sandboxFolderOf(entry).split('/').pop()
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((one) => one !== '')
    .map((one) => JSON.parse(one) as Record<string, any>)
    .filter((one) => one['name'] === name)
}

/** A run reads only the accepted steps its own session sent for its entry, whenever the proxy records them. */
export function startTheTool(entry: string, env: Record<string, string> = {}, flags: string[] = []): { child: ChildProcess; done: Promise<Run> } {
  const session = toolSession()
  const child = spawn(
    process.execPath,
    [
      // A FIFTH OF A SECOND BETWEEN TWO ASKS, for a seat, for room and for more riders: each of those waits ends at the
      // first ask after what the run waits for is free, and a whole second between asks only made the run see it later.
      TOOL, '--entry', entry, '--session', session, '--api', proxyApi, '--workspace', 'default', '--workdir', workdirOf(entry), '--slot-every', '0.2', '--health-for', '30', '--office-for', '30',
      '--sandbox-tool', SANDBOX_TOOL, '--sandboxes', sandboxesOf(), '--room-every', '0.2', ...flags,
    ],
    // THE BUS LEAVES AT ONCE unless a test says otherwise: its 30-minute wait for riders is the
    // subject of one test below, and of no other.
    { cwd: REPO, env: { ...withoutInheritedEffort(), MOLE_OFFICE_API: proxyApi, MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: '0', MOLE_OFFICE_COMMIT_EMAIL: THE_MERGE_TOOLS_TEST_ADDRESS, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  startedAGroup(child.pid)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const done = new Promise<Run>((resolve) => {
    // 'CLOSE', NOT 'EXIT': 'exit' can come before the child's output has all been read, and the run
    // would then be judged on part of what it printed.
    child.on('close', (code) => {
      groups.delete(child.pid!)
      resolve({ code, out, err, log: join(workdirOf(entry), 'the-merger.log'), steps: reported.filter((one) => one.session === session && one.entry === entry) })
    })
  })
  return { child, done }
}

/** A take-back has no tool session: the office files its finished run after it reads the tree. */
export async function runTheTakeBack(problem: string): Promise<{ code: number | null; out: string; err: string }> {
  const session = t.api.createRecord({ kind: 'session', title: 'A synthetic take-back check', workspaceId: 'default', actor: office, data: { state: 'running', runtime: 'merge-tool', startedByMoleOffice: true, extra: { purpose: 'take-back-check', problem } } }).id
  const child = spawn(process.execPath, [TOOL, '--take-back', problem, '--session', session, '--api', proxyApi, '--workspace', 'default', '--sandbox-tool', SANDBOX_TOOL, '--sandboxes', sandboxesOf(), '--room-every', '0.2'],
    { cwd: REPO, env: { ...withoutInheritedEffort(), MOLE_OFFICE_API: proxyApi, MOLE_OFFICE_COMMIT_EMAIL: THE_MERGE_TOOLS_TEST_ADDRESS }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  startedAGroup(child.pid)
  let out = '', err = ''
  child.stdout!.on('data', (chunk: Buffer) => { out += chunk.toString() })
  child.stderr!.on('data', (chunk: Buffer) => { err += chunk.toString() })
  return new Promise(resolve => child.on('close', code => { groups.delete(child.pid!); t.api.patchRecord(session, { dataPatch: { state: code === 0 ? 'finished' : 'crashed', doing: out || err } }, office); resolve({ code, out, err }) }))
}

export async function runTheTool(entry: string, env: Record<string, string> = {}, flags: string[] = []): Promise<Run> {
  return startTheTool(entry, env, flags).done
}

/** Wait until the tool's log for an entry holds `text`, or fail saying what it held. */
export async function untilTheLogSays(entry: string, text: string, ms = 240_000): Promise<void> {
  const file = join(workdirOf(entry), 'the-merger.log')
  const deadline = Date.now() + ms
  for (;;) {
    if (existsSync(file) && readFileSync(file, 'utf8').includes(text)) return
    if (Date.now() >= deadline) throw new Error(`The log of ${entry} never said ${JSON.stringify(text)}. It held: ${existsSync(file) ? readFileSync(file, 'utf8').slice(-2000) : 'nothing'}`)
    await new Promise((go) => setTimeout(go, 50))
  }
}

/**
 * A PROXY THAT CHANGES NOTHING, WITH ONE EXCEPTION. Every request goes to the real app as it came; a
 * step the office accepted (200) is written down with its session and facts, and a test's hook for that entry runs
 * first, so a test can move the main checkout at a chosen moment. The exception is `officeRunsFrom`:
 * while one test sets it, the runtime answer says the office runs from that test's main checkout.
 */
async function startTheProxy(): Promise<void> {
  proxy = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks)
    const url = req.url ?? '/'
    const match = /^\/api\/merge-queue\/([^/?]+)\/step$/.exec(url)
    const stepSent = req.method === 'POST' && match !== null ? (JSON.parse(body.toString('utf8')) as { step: string; facts: Record<string, any> }) : null
    if (stepSent !== null) hooks.get(decodeURIComponent(match![1]!))?.(stepSent.step)
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(key) || typeof value !== 'string') continue
      headers[key] = value
    }
    const upstream = await fetch(`${api}${url}`, { method: req.method, headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body }) })
    let bytes = Buffer.from(await upstream.arrayBuffer())
    if (officeRunsFrom !== null && req.method === 'GET' && url === '/api/runtime' && upstream.status === 200) {
      const said = JSON.parse(bytes.toString('utf8')) as Record<string, any>
      const full = git(officeRunsFrom, 'rev-parse', 'HEAD')
      said['repository'] = { ...(said['repository'] ?? {}), path: officeRunsFrom, workingDirectory: officeRunsFrom, head: { full, short: full.slice(0, 7), branch: 'main' } }
      bytes = Buffer.from(JSON.stringify(said))
    }
    if (stepSent !== null && upstream.status === 200) {
      await beforeRecording.get(decodeURIComponent(match![1]!))?.(stepSent.step)
      reported.push({ session: headers['x-mole-office-session'], entry: decodeURIComponent(match![1]!), step: stepSent.step, facts: stepSent.facts })
    }
    const out: Record<string, string> = {}
    upstream.headers.forEach((value, key) => {
      if (!['content-length', 'transfer-encoding', 'content-encoding', 'connection'].includes(key)) out[key] = value
    })
    res.writeHead(upstream.status, out)
    res.end(bytes)
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  proxyApi = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
}

// ============================================================================ set-up

/** Whether a test failed: the fixture folder, with the tool's logs and state, is then kept for reading. */
let keepTheFixtures = false
/** The test file that asked for the office, as the messages on stderr name it. */
let theTestFile = 'a test file of the merge tool'

/**
 * A REAL OFFICE FOR THE MERGE TOOL'S CASES IN ONE TEST FILE. Call it once, at the top of the file, with the file's path.
 * Before the first case it starts the office on a fresh database, with its agents, a files area and the proxy. After
 * the last case it sends SIGKILL to every process group the file started, stops the office and removes the fixtures,
 * unless a case failed.
 */
export function aRealOfficeForTheMerger(file: string): void {
  theTestFile = file
  beforeAll(async () => {
    t = await freshDb()
    mkdirSync(join(REPO, '.logs'), { recursive: true })
    base = realpathSync(mkdtempSync(join(REPO, '.logs', 'the-merger-')))
    filesBase = realpathSync(mkdtempSync(join(tmpdir(), 'the-merger-files-area-')))
    process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${REPO.replace(/\/$/, '')}:${base}:${filesBase}`
    app = (await apiApp()).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    queue = await import('../src/server/lib/merge-queue.ts')
    repositories = await import('../src/server/lib/repositories.ts')
    const started = async (by: Record<string, string>, handle: string, workArea?: string[]) => {
      const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) } })
      expect(r.statusCode, r.body).toBe(201)
    }
    await started(asPerson, 'mq-worker', ['src', 'tests', 'design'])
    const area = await app.inject({ method: 'POST', url: '/api/participants/agent/mq-worker/files-area', headers: asPerson, payload: { filesArea: [filesBase], because: 'the files entries of these tests land here' } })
    expect(area.statusCode, area.body).toBe(200)
    const inspector = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'mq-inspector', name: 'Synthetic mq-inspector', role: 'inspector' } })
    expect(inspector.statusCode, inspector.body).toBe(201)
    await startTheProxy()
  }, 60_000)

  afterEach((context) => {
    if (context.task.result?.state === 'fail') keepTheFixtures = true
  })

  afterAll(async () => {
    for (const group of groups.keys()) signalTheGroup(group, 'SIGKILL')
    await new Promise<void>((resolve) => proxy?.close(() => resolve()))
    await app?.close()
    t?.close()
    delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
    if (base !== undefined && !keepTheFixtures) rmSync(base, { recursive: true, force: true })
    if (filesBase !== undefined && !keepTheFixtures) rmSync(filesBase, { recursive: true, force: true })
    else if (base !== undefined) process.stderr.write(`${theTestFile}: a test failed, so the fixtures and the tool's logs are kept under ${base}\n`)
  })
}

export const stepsOf = (run: Run) => run.steps.map((one) => one.step)
export const factsOf = (run: Run, step: string) => run.steps.find((one) => one.step === step)?.facts ?? null
