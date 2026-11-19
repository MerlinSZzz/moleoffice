// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL SAYS WHAT A RE-CHECKED ENTRY DOES WITH ITS LANE (wave 13u, item 53, round B).
 *
 * WHAT WAS WRONG. Since round A, a reinspecting entry lets its lane go while its check runs, unless it is back from an
 * earlier check. A release that finds the lane held, or main moved, sends the entry back to judged with `returnsFirst`,
 * and it takes the lane before the lane's other judged entries. The merge tool's own words said neither. A run handed a
 * reinspecting entry ended "the entry is reinspecting and waits on" the inspector, which said nothing of the lane. A
 * returning entry took its lane with no line in the log, though an entry moved to the front, or one that waited for a
 * press, says so when it takes its lane.
 *
 * WHAT THIS FILE PROVES, each by a run of the real tool against the real server on a port of its own and a throwaway
 * database, on made-up entries:
 *
 *   1. A run handed a reinspecting entry that let its lane go ends ok, and says the entry let its lane go for the check.
 *   2. A run handed a reinspecting entry back from an earlier check ends ok, and says the entry holds its lane through
 *      this check because it came back from an earlier one.
 *   3. A run handed a returning entry, with its lane free, takes the lane, and its log says it took the lane as an entry
 *      back from a check, naming the check-again run and when the entry came back. A run that takes the lane for an
 *      entry not back from a check logs no such line.
 *      Each run then goes on to integrate, which fails at once here, because the lane's repository holds no commit. The
 *      case reads only the log line and who holds the lane after the run.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the code records the runs). Each goes red where named:
 *   - the run's ending for a reinspecting entry says nothing of its lane: cases 1 and 2;
 *   - the ending says the entry let its lane go whatever it holds: case 2;
 *   - the tool logs nothing when a returning entry takes its lane: case 3;
 *   - the tool logs the line for every entry that takes its lane: case 3.
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout and removed
 * after, the records are filed as fixtures, and nothing reaches a running office. Each tool process is started in its
 * own process group, waited for to its end, and any group still listed is killed after the file.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { MERGE_TOOL_ENDING_LINE } from '../src/config/merge-tool.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { ABSENT, MERGE_STATE_SPECS, type MergeState } from '../src/shared/merge-queue.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'the-merger.mjs')
/** The stand-in for tools/sandbox.mjs that the merge tool's tests use, told to refuse every `up`: no sandbox is started here. */
const SANDBOX_TOOL = join(REPO, 'tests', 'stand-in-sandbox-tool.mjs')

let t: TestDb
let app: FastifyInstance
let api: string
const made: string[] = []
const groups = new Set<number>()

const WORKSPACE = 'default'
const THE_WORKER = 'mole-office/the-message-worker'
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

const A = 'work/a.txt'
const B = 'work/b.txt'
const RULES = 'design/rules.md'

/** What the tool says of a reinspecting entry's lane, as the office's reading of the entry has it. */
const IT_LET_ITS_LANE_GO = 'It let its lane go for this check, so another entry of the lane may take the lane meanwhile.'
const IT_HOLDS_ITS_LANE_AS_ONE_BACK = 'It holds its lane through this check, because it came back from an earlier check.'
const AS_ONE_BACK_FROM_A_CHECK = 'as an entry back from a check'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  const dir = realpathSync(mkdtempSync(join(REPO, '.logs', `re-checked-lane-words-${prefix}-`)))
  made.push(dir)
  return dir
}

/** A synthetic tree: main holds three files; `work` changes all three. The shape a worker's worktree has. */
function buildTree(dir: string): void {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic lane fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  mkdirSync(join(dir, 'design'), { recursive: true })
  for (const path of [A, B, RULES]) writeFileSync(join(dir, path), `${path} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  for (const path of [A, B, RULES]) writeFileSync(join(dir, path), `${path} before.\n${path} submitted.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
}

/** One tree built once and copied for each entry, with a line of its own, so that two entries are two works. */
let aTreeAlreadyMade = ''

function tree(): string {
  const dir = scratch('tree')
  cpSync(aTreeAlreadyMade, dir, { recursive: true })
  writeFileSync(join(dir, B), `${B} before.\n${B} submitted from ${basename(dir)}.\n`)
  git(dir, 'commit', '-q', '-a', '--amend', '--no-edit')
  return dir
}

interface Seal { id: string; hash: string; commit: string; forkBase: string; files: { path: string; hash: string | null }[] }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** A finished run of the worker in its own tree, sealed at the tree's tip. */
async function aSealedRun(dir: string): Promise<{ run: string; dir: string; seal: Seal }> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic lane run',
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'worker-w' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir },
  }).id
  theRunReportsForTheQueue(t, run, { type: 'agent', id: 'worker-w' })
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  return { run, dir, seal: theSealOf(run) }
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

/** The lane's root: a repository of its own with no commit, so a tool run that takes the lane fails as it integrates. */
let mainCheckout = ''

async function step(id: string, step: string, facts: Record<string, unknown>) {
  return call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step, facts })
}

async function entry(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${id}`, asStranger)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry']
}

/** A release of a run, through the real doors: the assembly first, then the verdict. `read.only` makes it a scoped check. */
async function release(run: string, read: Record<string, unknown> = {}) {
  const seal = theSealOf(run)
  const worktree = String(t.api.getRecord(run)!.data['workingDirectory'])
  const whatWasRead = { sealId: seal.id, sealHash: seal.hash, worktree, tip: seal.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.', ...read }
  const only = read['only'] as string[] | undefined
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read: whatWasRead,
    ...(only === undefined ? {} : { only }),
  })
  expect(assembled.status, assembled.raw).toBe(201)
  return call('POST', `/api/checks/${run}`, asInspector, {
    chaptersRead: [],
    read: whatWasRead,
    traced: syntheticTrace(t, only ?? seal.files.map((one) => one.path)),
    verdict: 'released',
    check: 'Synthetic: read the changes and found nothing missing.',
  })
}

/**
 * A clone of the worker's tree with `work` put on top of a moved main, and the files in `changed` changed by that: the
 * shape the merge tool's clone has after a rebase that merged a hunk into each.
 */
function aCloneOnTopOfMain(dir: string, changed: readonly string[] = [A]): { clone: string; mainAt: string; result: string; files: Record<string, string> } {
  const clone = scratch('clone')
  execFileSync('git', ['clone', '-q', dir, clone])
  git(clone, 'config', 'user.email', 'fixture@example.invalid')
  git(clone, 'config', 'user.name', 'Synthetic lane clone')
  git(clone, 'checkout', '-q', 'main')
  writeFileSync(join(clone, 'work', 'other.txt'), `main moved on under ${basename(clone)}.\n`)
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '-m', 'Synthetic: main moved')
  git(clone, 'checkout', '-q', 'work')
  git(clone, 'rebase', '-q', 'main')
  for (const path of changed) writeFileSync(join(clone, path), `${path} before.\n${path} submitted.\n${path} merged with main.\n`)
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '--amend', '--no-edit')
  const result = git(clone, 'rev-parse', 'HEAD')
  // THE HASH THE SEAL HOLDS: sha256 of the blob's bytes as git cat-file reads them, not git's oid.
  const files = Object.fromEntries(
    [A, B, RULES].map((path) => [path, createHash('sha256').update(execFileSync('git', ['-C', clone, 'cat-file', 'blob', `HEAD:${path}`])).digest('hex')]),
  )
  return { clone, mainAt: git(clone, 'rev-parse', 'main'), result, files }
}

type Entry = { id: string; run: string; dir: string; seal: Seal }

/** A judged git entry of a fresh sealed run, submitted by the supervisor and released by the inspector. */
async function aJudgedEntry(branch: string): Promise<Entry> {
  const sealed = await aSealedRun(tree())
  const r = await call('POST', '/api/merge-queue', asSupervisor, { run: sealed.run, changeset: { adapter: 'git', repository: 'fixture-main', branch } })
  expect(r.status, r.raw).toBe(201)
  const id = String(r.body['entry'].id)
  expect((await release(sealed.run)).status).toBe(201)
  expect((await step(id, 'pinned', { files: contentOf(sealed.seal) })).body['entry'].state).toBe('judged')
  return { id, ...sealed }
}

/** A judged entry taken through integrating onto a moved main that changed `changed`, so the office asks for a check again. */
async function toReinspecting(one: Entry, onTop: ReturnType<typeof aCloneOnTopOfMain>): Promise<{ run: string; only: string[] }> {
  const taken = await step(one.id, 'integrating', {})
  expect(taken.status, taken.raw).toBe(200)
  const integrated = await step(one.id, 'integrated', { result: onTop.result, mainAt: onTop.mainAt, clone: onTop.clone, files: onTop.files })
  expect(integrated.status, integrated.raw).toBe(200)
  expect(integrated.body['entry'].state).toBe('reinspecting')
  return integrated.body['entry'].machine.reinspection as { run: string; only: string[] }
}

async function aReinspectingEntry(branch: string): Promise<Entry & { onTop: ReturnType<typeof aCloneOnTopOfMain>; asked: { run: string; only: string[] } }> {
  const one = await aJudgedEntry(branch)
  const onTop = aCloneOnTopOfMain(one.dir)
  return { ...one, onTop, asked: await toReinspecting(one, onTop) }
}

/** An entry back from a check: reinspecting, released while another entry held the lane, and that entry withdrawn. */
async function aReturningEntry(branch: string): Promise<Entry & { onTop: ReturnType<typeof aCloneOnTopOfMain>; asked: { run: string; only: string[] } }> {
  const x = await aReinspectingEntry(branch)
  const y = await aJudgedEntry(`${branch}-holder`)
  expect((await step(y.id, 'integrating', {})).status).toBe(200)
  const released = await release(x.asked.run, { worktree: x.onTop.clone, only: [A] })
  expect(released.status, released.raw).toBe(201)
  expect(released.body['mergeQueue'].moved[0].state).toBe('judged')
  await withdraw(y.id)
  return x
}

const withdraw = async (id: string) => {
  const r = await call('POST', `/api/merge-queue/${id}/withdraw`, asPerson, { because: 'the case is over' })
  expect(r.status, r.raw).toBe(200)
}

/** EVERY ENTRY NOT FINAL IS WITHDRAWN AFTER EACH CASE, so a case that failed part way leaves nothing ahead of the next. */
async function withdrawEveryEntryLeft(): Promise<void> {
  const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(mainCheckout)}`, asStranger)
  for (const one of (listed.body['lanes']?.[0]?.entries ?? []) as { id: string; state: MergeState }[]) {
    if (MERGE_STATE_SPECS[one.state].final) continue
    if (one.state === 'landing') await step(one.id, 'main-moved', { mainAt: '0'.repeat(40) })
    await withdraw(one.id)
  }
}

interface Ending { code: number | null; ending: { ok: boolean; says: string }; out: string; err: string }

/** The real tool, run as the worker runs it, in its own process group, waited for to its end. */
async function runTheTool(id: string): Promise<Ending> {
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
  const base = scratch('tool')
  const child = spawn(
    process.execPath,
    [TOOL, '--entry', id, '--session', session, '--api', api, '--workspace', WORKSPACE, '--workdir', join(base, 'work', id), '--office-for', '30', '--sandbox-tool', SANDBOX_TOOL, '--sandboxes', join(base, 'sandboxes')],
    { cwd: REPO, env: { ...withoutInheritedEffort(), MOLE_OFFICE_API: api, STAND_IN_SANDBOX_REFUSE_UP: '1' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  groups.add(child.pid!)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve))
  groups.delete(child.pid!)
  // AND THE RUN'S SESSION ENDS, as the worker's next pass ends it. While a run of the tool still says running, the office
  // offers its entry to no second run.
  t.api.patchRecord(session, { dataPatch: { state: code === 0 ? 'finished' : 'crashed' } }, { type: 'agent', id: THE_WORKER })
  const line = out.split('\n').filter((one) => one.startsWith(MERGE_TOOL_ENDING_LINE)).at(-1)
  expect(line, out + err).toBeDefined()
  return { code, ending: JSON.parse(line!.slice(MERGE_TOOL_ENDING_LINE.length)) as Ending['ending'], out, err }
}

beforeAll(async () => {
  t = await freshDb()
  aTreeAlreadyMade = scratch('tree-template')
  buildTree(aTreeAlreadyMade)
  // THE DEFAULT SET, AS A NEW OFFICE COPIES IT AT ITS FIRST START: a check quotes the office's own chapter records.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work', 'design'] })
  await register(asPerson, { handle: 'a-stranger', name: 'A Stranger' })
  const repositories = await import('../src/server/lib/repositories.ts')
  mainCheckout = scratch('main')
  git(mainCheckout, 'init', '-q', '-b', 'main')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: mainCheckout, actor: { type: 'human', id: THE_PERSON } })
}, 60_000)

afterEach(async () => {
  await withdrawEveryEntryLeft()
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
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('the merge tool says what a re-checked entry does with its lane', () => {
  it('ends a run handed a reinspecting entry that let its lane go by saying so', async () => {
    const x = await aReinspectingEntry('x-lets-go')
    expect((await entry(x.id)).occupies).toBeNull()
    const run = await runTheTool(x.id)
    expect(run.code, run.out + run.err).toBe(0)
    expect(run.ending.ok).toBe(true)
    expect(run.ending.says).toContain('the entry is reinspecting and waits on the inspector')
    expect(run.ending.says).toContain(IT_LET_ITS_LANE_GO)
    expect(run.ending.says).not.toContain('It holds its lane')
  }, 60_000)

  it('ends a run handed a reinspecting entry back from an earlier check by saying it holds its lane, and why', async () => {
    const x = await aReturningEntry('x-checked-twice')
    // MAIN MOVED AGAIN, and this time the rebase changed B as well as A, so the office asks about B.
    await toReinspecting(x, aCloneOnTopOfMain(x.dir, [A, B]))
    const holding = await entry(x.id)
    expect(holding.occupies).toBe(mainCheckout)
    expect(holding.returnsFirst).toEqual({ run: x.asked.run, at: expect.any(String), turn: expect.any(Number) })
    const run = await runTheTool(x.id)
    expect(run.code, run.out + run.err).toBe(0)
    expect(run.ending.ok).toBe(true)
    expect(run.ending.says).toContain('the entry is reinspecting and waits on the inspector')
    expect(run.ending.says).toContain(IT_HOLDS_ITS_LANE_AS_ONE_BACK)
    expect(run.ending.says).not.toContain(IT_LET_ITS_LANE_GO)
  }, 60_000)

  it('logs that a returning entry took its lane as one back from a check, and logs no such line for another entry', async () => {
    const x = await aReturningEntry('x-returns')
    const returned = await entry(x.id)
    expect(returned.state).toBe('judged')
    expect(returned.occupies).toBeNull()
    const run = await runTheTool(x.id)
    expect(run.out, run.out + run.err).toContain(
      `merge entry ${x.id} took its lane ${mainCheckout} ${AS_ONE_BACK_FROM_A_CHECK}: it let the lane go while check-again run ${x.asked.run} ran, ` +
        `and came back at ${String(returned.returnsFirst.at)} to find the lane held or main moved.`,
    )
    expect((await entry(x.id)).occupies).toBe(mainCheckout)
    await withdraw(x.id)

    // THE CONTROL: an entry that is not back from a check takes the lane with no such line.
    const z = await aJudgedEntry('z-not-back')
    const plain = await runTheTool(z.id)
    expect((await entry(z.id)).occupies).toBe(mainCheckout)
    expect(plain.out).toContain(`merge entry ${z.id} (git) is judged`)
    expect(plain.out).not.toContain(AS_ONE_BACK_FROM_A_CHECK)
  }, 120_000)
})
