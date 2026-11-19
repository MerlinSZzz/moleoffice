// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S DOORS, AND THAT NO OTHER DOOR WRITES A MERGE ENTRY. Sandbox v1, piece P6: the
 * door half of test T5 in SPEC.md section 6, widened by decision R3
 * (a changeset through a git or a files adapter).
 *
 * WHAT IS PROVED HERE, each by a run against a real database and the real server:
 *
 *   1. A run with no seal is refused with 409 (H_SUBMIT), and a sealed run's git changeset is stored
 *      with the seal's own commit and base.
 *   2. Only the run's agent, the agent that started it, or the person may submit it.
 *   3. A files changeset is stored exactly as checked, and one whose operations disagree with
 *      themselves is refused with nothing written.
 *   4. A newer entry for the same work supersedes the older one; the same content twice is refused.
 *   5. Its submitter withdraws it; a stranger may not; a final entry cannot be withdrawn.
 *   6. ONE ENTRY PER LANE, held by the database: a second entry cannot take a lane another holds.
 *   7. Only the office's message worker knocks on the step and tool doors, and the step door writes
 *      nothing until the state machine exists.
 *   8. POST, PATCH, DELETE and restore through /api/records are refused on the kind, for an agent and
 *      for the person, and so is turning another record into one.
 *
 * WHAT IS NOT: which state may follow which. That is the state machine (P7), and it is not built.
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout
 * and removed after, the records are filed as fixtures, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { MERGE_STATES } from '../src/shared/merge-queue.ts'

let t: TestDb
let app: FastifyInstance
let queue: typeof import('../src/server/lib/merge-queue.ts')
const made: string[] = []

const THE_WORKER = 'mole-office/the-message-worker'
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'mq-worker')
const asStarter = as('agent', 'mq-starter')
const asStranger = as('agent', 'mq-stranger')
const asSupervisor = as('agent', 'mq-supervisor')
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asTheOffice = as('agent', THE_WORKER)

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `merge-queue-${prefix}-`))
  made.push(dir)
  return dir
}

/** A synthetic git tree with one commit on `work` over `main`, the shape a worker's worktree has. */
function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic merge queue fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}

/**
 * A run of the worker in its own tree, not finished, so it has no seal. `filedBy` is the agent that files it: the
 * worker itself unless a starter files it, as a supervisor that starts the run does.
 */
function aRun(dir: string, extra?: Record<string, unknown>, filedBy = 'mq-worker'): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic merge queue run',
    workspaceId: 'default',
    actor: { type: 'agent', id: filedBy },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'mq-worker', cutFrom: 'main', workingDirectory: dir, ...extra },
  }).id
}

/** A run started (parentAttachment) by a session another agent served, not the run's agent's registered starter, and filed by the registered starter. */
async function aSealedRunStartedBySomeoneElse(): Promise<{ run: string; supervisor: string }> {
  const supervisorRun = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic supervisor run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'mq-supervisor' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'mq-supervisor' },
  }).id
  const dir = tree()
  // THE WORKER'S REGISTERED STARTER FILES THE RUN UNDER THE SUPERVISOR'S RUN, as the secretary files a worker's run with
  // tools/register-a-run.mjs --parent <the supervisor's run>. Since the filing door of round 30 the supervisor,
  // which is not above mq-worker, may not file it itself. mq-starter started the supervisor, so it may name the
  // supervisor's run as the parent (problem NlOyicZP_Jjt).
  const run = aRun(dir, { parentAttachment: supervisorRun }, 'mq-starter')
  await finish(run)
  return { run, supervisor: supervisorRun }
}

async function finish(run: string): Promise<void> {
  const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(r.statusCode, r.body).toBe(200)
}

/** A finished, sealed run in a fresh tree. */
async function aSealedRun(): Promise<{ run: string; dir: string }> {
  const dir = tree()
  const run = aRun(dir)
  await finish(run)
  return { run, dir }
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

function mergeEntryCount(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'merge_entry'").get() as { n: number }).n
}

function stored(id: string): Record<string, unknown> {
  return t.api.getRecord(id)!.data
}

const sha = (c: string): string => c.repeat(64)

/** The main checkout a git changeset lands in: a directory registered as a repository of this project. */
let mainCheckout: string
let otherCheckout: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  queue = await import('../src/server/lib/merge-queue.ts')
  const started = async (by: Record<string, string>, handle: string, workArea?: string[]) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: by,
      payload: { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) },
    })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, 'mq-starter')
  await started(asStarter, 'mq-worker', ['work'])
  await started(asPerson, 'mq-stranger')
  // THE SUPERVISOR IS mq-starter'S, as the secretary registers a supervisor and the workers it hands it.
  await started(asStarter, 'mq-supervisor')
  const repositories = await import('../src/server/lib/repositories.ts')
  mainCheckout = realpathSync(scratch('main'))
  otherCheckout = realpathSync(scratch('other'))
  const actor = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: mainCheckout, actor })
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-other', root: otherCheckout, actor })
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-nowhere', root: null, actor })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const gitChangeset = (repository = 'fixture-main', branch?: string) => ({
  adapter: 'git',
  repository,
  ...(branch === undefined ? {} : { branch }),
})

// ============================================================================ 1 and 2. submitting

describe('submitting a run (H_SUBMIT)', () => {
  it('names the requested states when no entry matches, with or without a lane', async () => {
    const { run } = await aSealedRun()
    const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-main', 'filtered') })
    expect(submitted.status, submitted.raw).toBe(201)
    const states = MERGE_STATES.filter((state) => state !== submitted.body['entry'].state).slice(0, 1)
    expect(states.length).toBeGreaterThan(0)
    for (const lane of [undefined, mainCheckout]) {
      const query = `?state=${encodeURIComponent(states.join(','))}${lane === undefined ? '' : `&lane=${encodeURIComponent(lane)}`}`
      const listed = await call('GET', `/api/merge-queue${query}`, asWorker)
      expect(listed.status, listed.raw).toBe(200)
      expect(listed.body['says']).toContain(`(${states.join(', ')})`)
      const words = (queue as typeof queue & { noMergeEntriesInStates: (states: readonly string[], lane?: string) => string }).noMergeEntriesInStates(states, lane)
      expect(listed.body['says']).toBe(words)
    }
  })

  it('refuses a run with no seal with 409, and writes nothing', async () => {
    const run = aRun(tree())
    const before = mergeEntryCount()
    const r = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset() })
    expect(r.status, r.raw).toBe(409)
    expect(r.body['error']).toContain('has no seal')
    expect(mergeEntryCount()).toBe(before)
  })

  it("stores a sealed run's git changeset with the seal's commit and base, about the run and the seal", async () => {
    const { run, dir } = await aSealedRun()
    const r = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-main', 'work') })
    expect(r.status, r.raw).toBe(201)
    const entry = r.body['entry']
    expect(entry.state).toBe('submitted')
    expect(entry.changeset).toEqual({
      adapter: 'git',
      root: mainCheckout,
      repository: expect.any(String),
      branch: 'work',
      commit: git(dir, 'rev-parse', 'HEAD'),
      base: git(dir, 'rev-parse', 'main'),
    })
    expect(entry.lane).toBe(mainCheckout)
    expect(entry.occupies).toBeNull()
    expect(entry.pinnedRef).toBe(`refs/mole-office/queue/${String(entry.id)}`)
    expect(entry.submittedBy).toEqual({ kind: 'agent', id: expect.any(String) })
    const seal = t.api.getRecord(run)!.data['sealedTip']
    expect(entry.seal.id).toBe(seal)
    const about = t.client.sqlite
      .prepare("SELECT to_id AS id FROM links WHERE from_id = ? AND type = 'about' ORDER BY to_id")
      .all(entry.id) as { id: string }[]
    expect(about.map((one) => one.id).sort()).toEqual([run, seal].sort())

    // AND READ BACK, with the sentence saying what it waits on.
    const read = await call('GET', `/api/merge-queue/${String(entry.id)}`, asStranger)
    expect(read.status, read.raw).toBe(200)
    expect(read.body['entry'].state).toBe('submitted')
    expect(read.body['entry'].waitsOn).toContain('merge tool')
  })

  it("refuses a submitter who is not the run's agent, its starter or the person", async () => {
    const { run } = await aSealedRun()
    const refused = await call('POST', '/api/merge-queue', asStranger, { run, changeset: gitChangeset() })
    expect(refused.status, refused.raw).toBe(403)
    const byItsStarter = await call('POST', '/api/merge-queue', asStarter, { run, changeset: gitChangeset() })
    expect(byItsStarter.status, byItsStarter.raw).toBe(201)
  })

  it("accepts the run's own starter as parentAttachment records it, even when that is not the agent's registered starter (acceptance finding 1)", async () => {
    const { run, supervisor } = await aSealedRunStartedBySomeoneElse()
    // mq-supervisor is not mq-worker's registered starter (mq-starter is), and it is not mq-worker, so only
    // parentAttachment can make this submission theirs.
    expect(supervisor).not.toBe('mq-starter')
    const bySupervisor = await call('POST', '/api/merge-queue', asSupervisor, { run, changeset: gitChangeset() })
    expect(bySupervisor.status, bySupervisor.raw).toBe(201)
    expect(bySupervisor.body['entry'].submittedBy).toEqual({ kind: 'agent', id: expect.any(String) })

    // A stranger with no relation to the run — not its agent, not its registered starter, and not
    // named by its parentAttachment — is still refused.
    const { run: anotherRun } = await aSealedRunStartedBySomeoneElse()
    const refused = await call('POST', '/api/merge-queue', asStranger, { run: anotherRun, changeset: gitChangeset() })
    expect(refused.status, refused.raw).toBe(403)
  })

  it('refuses a repository this project does not have, and one with no checkout here', async () => {
    const { run } = await aSealedRun()
    const unknown = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('no-such-repository') })
    expect(unknown.status, unknown.raw).toBe(400)
    expect(unknown.body['error']).toContain('fixture-main')
    const nowhere = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-nowhere') })
    expect(nowhere.status, nowhere.raw).toBe(409)
  })
})

// ============================================================================ 3. files

describe('a files changeset', () => {
  const add = (path: string, after = sha('a')) => ({ op: 'add', path, before: 'absent', after, source: 'recovery/originals/' + path })

  it('is stored as checked, and a conflict bounces it back unless its submitter said otherwise', async () => {
    const { run } = await aSealedRun()
    const root = realpathSync(scratch('files-root'))
    const staged = realpathSync(scratch('files-staged'))
    const r = await call('POST', '/api/merge-queue', asWorker, {
      run,
      changeset: {
        adapter: 'files',
        root,
        stagedAt: staged,
        operations: [
          { ...add('report-files/a.pdf'), record: run },
          { op: 'modify', path: 'avatars/b.png', before: sha('b'), after: sha('c'), source: 'a returned file' },
          { op: 'delete', path: 'old/c.txt', before: sha('d'), after: 'absent', source: 'superseded by a.pdf' },
          { op: 'rename', from: 'x/old.csv', path: 'x/new.csv', before: sha('e'), after: sha('e'), source: 'the dataset was renamed' },
        ],
      },
    })
    expect(r.status, r.raw).toBe(201)
    const changeset = r.body['entry'].changeset
    expect(changeset.adapter).toBe('files')
    expect(changeset.root).toBe(root)
    expect(changeset.stagedAt).toBe(staged)
    expect(changeset.onConflict).toBe('bounce')
    expect(changeset.operations).toHaveLength(4)
    expect(r.body['entry'].lane).toBe(root)
    expect(r.body['entry'].pinnedRef).toBeUndefined()
    expect(r.body['interpreted'].join(' ')).toContain('nothing is overwritten')
  })

  it('refuses operations that disagree with themselves, and writes nothing', async () => {
    const { run } = await aSealedRun()
    const root = realpathSync(scratch('bad-root'))
    const staged = realpathSync(scratch('bad-staged'))
    const before = mergeEntryCount()
    const refusals: [string, unknown[]][] = [
      ['an add over an existing file', [{ ...add('a.txt'), before: sha('1') }]],
      ['a path that climbs out of the root', [add('../a.txt')]],
      ['an absolute path', [add('/etc/a.txt')]],
      ['two operations on one path', [add('a.txt'), add('a.txt', sha('2'))]],
      ['a hash that is not sha256', [add('a.txt', 'abc')]],
      ['a rename with no from', [{ op: 'rename', path: 'b.txt', before: sha('3'), after: sha('3'), source: 'x' }]],
      ['a delete that leaves content', [{ op: 'delete', path: 'c.txt', before: sha('4'), after: sha('5'), source: 'x' }]],
      ['an operation with no source', [{ ...add('d.txt'), source: ' ' }]],
    ]
    for (const [what, operations] of refusals) {
      const r = await call('POST', '/api/merge-queue', asWorker, { run, changeset: { adapter: 'files', root, stagedAt: staged, operations } })
      expect(r.status, `${what}: ${r.raw}`).toBe(400)
    }
    const missing = await call('POST', '/api/merge-queue', asWorker, {
      run,
      changeset: { adapter: 'files', root: join(root, 'not-there'), stagedAt: staged, operations: [add('e.txt')] },
    })
    expect(missing.status, missing.raw).toBe(400)
    expect(mergeEntryCount()).toBe(before)
  })
})

// ============================================================================ 4. superseding

describe('a newer entry for the same work', () => {
  it('supersedes the older one, and the same content twice is refused', async () => {
    const { run } = await aSealedRun()
    const first = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-other', 'work') })
    expect(first.status, first.raw).toBe(201)
    const repeat = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-other', 'work') })
    expect(repeat.status, repeat.raw).toBe(409)
    expect(repeat.body['error']).toContain('already carries exactly this')

    await finish(run) // a second finish writes a second seal
    const second = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-other', 'work') })
    expect(second.status, second.raw).toBe(201)
    const olderId = String(first.body['entry'].id)
    expect(second.body['superseded']).toEqual([olderId])
    expect(second.body['entry'].supersedes).toEqual([olderId])
    const older = (await call('GET', `/api/merge-queue/${olderId}`, asWorker)).body['entry']
    expect(older.state).toBe('superseded')
    expect(older.supersededBy).toBe(second.body['entry'].id)
  })

  it('is a files entry staged in the same folder, and a different folder is different work', async () => {
    const { run } = await aSealedRun()
    const root = realpathSync(scratch('same-root'))
    const staged = realpathSync(scratch('same-staged'))
    const elsewhere = realpathSync(scratch('elsewhere-staged'))
    const files = (stagedAt: string, after: string) => ({
      adapter: 'files',
      root,
      stagedAt,
      operations: [{ op: 'add', path: 'one.png', before: 'absent', after, source: 'a synthetic picture' }],
    })
    const a = await call('POST', '/api/merge-queue', asWorker, { run, changeset: files(staged, sha('1')) })
    const b = await call('POST', '/api/merge-queue', asWorker, { run, changeset: files(elsewhere, sha('1')) })
    const c = await call('POST', '/api/merge-queue', asWorker, { run, changeset: files(staged, sha('2')) })
    for (const r of [a, b, c]) expect(r.status, r.raw).toBe(201)
    expect(b.body['superseded']).toEqual([])
    expect(c.body['superseded']).toEqual([a.body['entry'].id])
    expect(stored(String(b.body['entry'].id))['state']).toBe('submitted')
  })
})

// ============================================================================ 5. withdrawing

describe('withdrawing an entry', () => {
  it('is its submitter\'s or the person\'s, needs a reason, and a final entry cannot be withdrawn', async () => {
    const { run } = await aSealedRun()
    const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-main', 'withdraw-me') })
    expect(submitted.status, submitted.raw).toBe(201)
    const id = String(submitted.body['entry'].id)

    const stranger = await call('POST', `/api/merge-queue/${id}/withdraw`, asStranger, { because: 'not mine to take back' })
    expect(stranger.status, stranger.raw).toBe(403)
    const noReason = await call('POST', `/api/merge-queue/${id}/withdraw`, asWorker, {})
    expect(noReason.status, noReason.raw).toBe(400)
    expect(stored(id)['state']).toBe('submitted')

    const withdrawn = await call('POST', `/api/merge-queue/${id}/withdraw`, asWorker, { because: 'the run found a mistake after it submitted' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(withdrawn.body['entry'].state).toBe('withdrawn')
    expect(withdrawn.body['entry'].withdrawn.because).toBe('the run found a mistake after it submitted')

    const again = await call('POST', `/api/merge-queue/${id}/withdraw`, asPerson, { because: 'twice' })
    expect(again.status, again.raw).toBe(409)
  })
})

// ============================================================================ 6. one entry per lane

describe('one entry per lane', () => {
  it('refuses a second entry the lane another entry holds, and a withdrawn holder frees it', async () => {
    const office = { type: 'agent' as const, id: THE_WORKER }
    const lane = realpathSync(scratch('lane-root'))
    const staged = [realpathSync(scratch('lane-a')), realpathSync(scratch('lane-b'))]
    const { run } = await aSealedRun()
    const ids: string[] = []
    for (const stagedAt of staged) {
      const r = await call('POST', '/api/merge-queue', asWorker, {
        run,
        changeset: { adapter: 'files', root: lane, stagedAt, operations: [{ op: 'add', path: 'f.bin', before: 'absent', after: sha('9'), source: 'synthetic' }] },
      })
      expect(r.status, r.raw).toBe(201)
      ids.push(String(r.body['entry'].id))
    }
    const [first, second] = ids as [string, string]

    queue.moveEntry({ id: first, to: 'integrating', actor: office })
    expect(stored(first)['occupies']).toBe(lane)
    let refused: unknown = null
    try {
      queue.moveEntry({ id: second, to: 'integrating', actor: office })
    } catch (error) {
      refused = error
    }
    expect(refused, 'a second entry took a lane another entry holds').toBeInstanceOf(t.api.PanelError)
    expect((refused as { status: number }).status).toBe(409)
    expect((refused as Error).message).toContain(first)
    expect(stored(second)['state']).toBe('submitted')
    expect(stored(second)['occupies']).toBeUndefined()

    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(lane)}`, asWorker)
    expect(listed.status, listed.raw).toBe(200)
    expect(listed.body['lanes']).toHaveLength(1)
    expect(listed.body['lanes'][0].occupiedBy.entry).toBe(first)
    expect(listed.body['lanes'][0].entries.map((one: { id: string }) => one.id)).toEqual([first, second])

    const withdrawn = await call('POST', `/api/merge-queue/${first}/withdraw`, asWorker, { because: 'let the other one through' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(stored(first)['occupies']).toBeUndefined()
    queue.moveEntry({ id: second, to: 'testing', actor: office })
    expect(stored(second)['occupies']).toBe(lane)
  })

  it('is the database refusing, whoever writes', () => {
    const holder = t.client.sqlite
      .prepare("SELECT id, json_extract(data, '$.occupies') AS lane FROM records WHERE kind = 'merge_entry' AND json_extract(data, '$.occupies') IS NOT NULL")
      .get() as { id: string; lane: string }
    expect(holder, 'no entry holds a lane, so this would prove nothing').toBeDefined()
    const other = t.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'merge_entry' AND json_extract(data, '$.occupies') IS NULL LIMIT 1")
      .get() as { id: string; data: string }
    const data = { ...(JSON.parse(other.data) as Record<string, unknown>), occupies: holder.lane }
    let refused: unknown = null
    try {
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), other.id)
      // IT WENT THROUGH, so the index is not doing its job. Put the row back before failing, so the
      // tests after this one are not reading an entry the queue could never have written.
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(other.data, other.id)
    } catch (error) {
      refused = error
    }
    expect(String(refused), 'the database let a second entry hold a lane').toMatch(/UNIQUE constraint failed: index 'records_one_merge_entry_per_lane'/)
  })
})

// ============================================================================ 7. the worker's doors

describe("the merge tool's doors are the message worker's", () => {
  async function anEntry(branch: string): Promise<string> {
    const { run } = await aSealedRun()
    const r = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-main', branch) })
    expect(r.status, r.raw).toBe(201)
    return String(r.body['entry'].id)
  }

  it('refuses a step from anybody else, and facts the state machine cannot read, and writes nothing', async () => {
    const id = await anEntry('step')
    const before = JSON.stringify(stored(id))
    const person = await call('POST', `/api/merge-queue/${id}/step`, asPerson, { step: 'pinned', facts: {} })
    expect(person.status, person.raw).toBe(403)
    const submitter = await call('POST', `/api/merge-queue/${id}/step`, asWorker, { step: 'pinned', facts: {} })
    expect(submitter.status, submitter.raw).toBe(403)
    const malformed = await call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: 'teleported', facts: {} })
    expect(malformed.status, malformed.raw).toBe(422)
    // THE STATE MACHINE (piece P7) READS THE FACTS STRICTLY: a pinned step names the pinned content.
    // tests/merge-state-machine.test.ts proves what each step does; here, only that nothing moved.
    const unreadable = await call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: 'pinned', facts: { ref: 'x' } })
    expect(unreadable.status, unreadable.raw).toBe(422)
    expect(unreadable.body['error']).toContain('cannot be read')
    expect(JSON.stringify(stored(id))).toBe(before)
  })

  it("records the merge tool's start and end, for a run of the merge tool only", async () => {
    const id = await anEntry('tool')
    const tool = (runtime: string) =>
      t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: 'default', actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime } }).id
    const session = tool('merge-tool')
    const notTheTool = tool('claude-code')
    const log = '/synthetic/the-merger.log'

    const person = await call('POST', `/api/merge-queue/${id}/tool-started`, asPerson, { session, log })
    expect(person.status, person.raw).toBe(403)
    const wrongRun = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session: notTheTool, log })
    expect(wrongRun.status, wrongRun.raw).toBe(409)
    const started = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session, log })
    expect(started.status, started.raw).toBe(200)
    expect(started.body['entry'].tool).toMatchObject({ session, log })

    const second = tool('merge-tool')
    const overlapping = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session: second, log })
    expect(overlapping.status, overlapping.raw).toBe(409)
    const endedByAnother = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session: second, reason: 'x' })
    expect(endedByAnother.status, endedByAnother.raw).toBe(409)

    const ended = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason: 'The synthetic tool exited 0.' })
    expect(ended.status, ended.raw).toBe(200)
    expect(ended.body['entry'].tool.endedAt).toEqual(expect.any(String))
    expect(ended.body['entry'].state).toBe('submitted')

    // A NEW RUN OF THE TOOL TAKES THE ENTRY ONCE THE OLD ONE ENDED, and carries none of its ending.
    const next = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session: second, log })
    expect(next.status, next.raw).toBe(200)
    expect(next.body['entry'].tool.session).toBe(second)
    expect(next.body['entry'].tool.endedAt).toBeUndefined()
  })
})

// ============================================================================ 8. no other door

describe('no door but the merge queue writes a merge entry', () => {
  it('refuses to create one through /api/records, for an agent and for the person', async () => {
    const before = mergeEntryCount()
    for (const who of [asWorker, asPerson]) {
      const r = await call('POST', '/api/records', who, {
        kind: 'merge_entry',
        title: 'A merge entry written by hand',
        data: { run: 'x', seal: { id: 'x', hash: 'x' }, changeset: { adapter: 'git', root: '/x' }, state: 'merged', submittedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } },
      })
      expect(r.status, r.raw).toBe(403)
      expect(r.body['error']).toContain('merge queue')
    }
    expect(mergeEntryCount()).toBe(before)
  })

  it('refuses to change, delete or restore one, and to turn another record into one', async () => {
    const { run } = await aSealedRun()
    const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: gitChangeset('fixture-main', 'by-hand') })
    expect(submitted.status, submitted.raw).toBe(201)
    const id = String(submitted.body['entry'].id)
    const before = JSON.stringify(t.api.getRecord(id))

    for (const who of [asWorker, asPerson]) {
      const patched = await call('PATCH', `/api/records/${id}`, who, { dataPatch: { state: 'merged' } })
      expect(patched.status, patched.raw).toBe(403)
      const retitled = await call('PATCH', `/api/records/${id}`, who, { title: 'Renamed by hand' })
      expect(retitled.status, retitled.raw).toBe(403)
      const deleted = await call('DELETE', `/api/records/${id}`, who)
      expect(deleted.status, deleted.raw).toBe(403)
      const restored = await call('POST', `/api/records/${id}/restore`, who)
      expect(restored.status, restored.raw).toBe(403)
    }
    expect(JSON.stringify(t.api.getRecord(id))).toBe(before)

    const note = t.api.createRecord({ kind: 'note', title: 'A note', workspaceId: 'default', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture', data: {} })
    const becoming = await call('PATCH', `/api/records/${note.id}`, asPerson, { kind: 'merge_entry' })
    expect(becoming.status, becoming.raw).toBe(403)
    expect(t.api.getRecord(note.id)!.kind).toBe('note')
  })
})

// ============================================================================ 9. a secretary's design/-only entry

// These tests cite a decision.
describe("a secretary's design/-only entry, with no run", () => {
  // THE SECRETARY HAS NO WORK AREA AND ITS design/ CHANGE IS NOT CHECKED, so it sends the git changeset and the working
  // folder, and the office files and seals the run itself (yH7W1sXTRY5q). Only the holder of the secretary card
  // may, the folder's HEAD must be the branch's tip, and every changed path must be under design/.
  // MUTATION PROOF, each alone in src/server/lib/merge-queue.ts: any caller let through, and the refusal case goes red on
  // the stranger's 201; the design/ path test dropped, and the outside-design/ case goes red on its 201.
  const asSecretary = as('agent', 'mq-secretary')
  const asCardSupervisor = as('agent', 'mq-card-supervisor')

  beforeAll(async () => {
    for (const [handle, role] of [['mq-secretary', 'secretary'], ['mq-card-supervisor', 'supervisor']] as const) {
      const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle, name: `Synthetic ${handle}`, role } })
      expect(r.statusCode, r.body).toBe(201)
    }
  })

  /** A synthetic secretary's checkout: main, and `notes` on top of it changing the files given, checked out. */
  function aSecretarysFolder(files: Record<string, string>): string {
    const dir = scratch('secretary')
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.email', 'fixture@example.invalid')
    git(dir, 'config', 'user.name', 'Synthetic secretary fixture')
    mkdirSync(join(dir, 'design'), { recursive: true })
    writeFileSync(join(dir, 'design', 'rules.md'), 'The rules, as they were.\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
    git(dir, 'switch', '-q', '-c', 'notes')
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic secretary change')
    return realpathSync(dir)
  }

  const counts = () =>
    Object.fromEntries(
      ['session', 'sealed_tip', 'merge_entry'].map((kind) => [kind, (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE kind = ?').get(kind) as { n: number }).n]),
    )
  const body = (dir: string, branch = 'notes') => ({ changeset: gitChangeset('fixture-main', branch), workingDirectory: dir })

  it('is accepted from the secretary, and files a run the office wrote, its seal, and the entry on both', async () => {
    const dir = aSecretarysFolder({ 'design/rules.md': 'The rules, as they are now.\n', 'design/notes/new.md': 'A new note.\n' })
    const r = await call('POST', '/api/merge-queue', asSecretary, body(dir))
    expect(r.status, r.raw).toBe(201)
    const entry = r.body['entry']
    expect(entry.state).toBe('submitted')
    expect(entry.submittedBy).toEqual({ kind: 'agent', id: expect.any(String) })
    const run = t.api.getRecord(entry.run)!
    expect(run.kind).toBe('session')
    expect(run.data).toMatchObject({
      state: 'finished',
      servingAgent: 'mq-secretary',
      workingDirectory: dir,
      cutFrom: git(dir, 'rev-parse', 'main'),
      extra: { purpose: 'secretary-documents' },
    })
    expect(String(run.data['doing'])).toContain("a secretary's design/-only merge entry, which needs no check")
    expect(String(run.data['doing'])).toContain('Nobody ran it')
    const first = t.client.sqlite.prepare('SELECT actor_type AS type, actor_id AS id FROM revisions WHERE record_id = ? ORDER BY seq LIMIT 1').get(run.id)
    expect(first).toEqual({ type: 'agent', id: 'mole-office/the-api-server' })
    expect(run.data['sealedTip']).toBe(entry.seal.id)
    const seal = t.api.getRecord(entry.seal.id)!.data['seal'] as { area: string[]; git: { commit: string; files: { path: string }[] } }
    expect(seal.area).toEqual(['design/'])
    expect(seal.git.commit).toBe(git(dir, 'rev-parse', 'notes'))
    expect(seal.git.files.map((one) => one.path)).toEqual(['design/notes/new.md', 'design/rules.md'])
    expect(entry.changeset).toMatchObject({ adapter: 'git', root: mainCheckout, branch: 'notes', commit: seal.git.commit })
    expect(r.body['interpreted'][0]).toContain(`The office filed run ${run.id}`)
  })

  it('refuses the same body from an ordinary agent and from a supervisor with 403, and writes nothing', async () => {
    const dir = aSecretarysFolder({ 'design/rules.md': 'Changed by somebody else.\n' })
    const before = counts()
    for (const who of [asStranger, asCardSupervisor]) {
      const r = await call('POST', '/api/merge-queue', who, body(dir))
      expect(r.status, r.raw).toBe(403)
      expect(r.body['error']).toContain('Only the agent that holds the secretary card')
      expect(r.body['error']).toContain('Nothing was written.')
    }
    expect(counts()).toEqual(before)
  })

  it('refuses a change that touches a path outside design/, naming every one, and writes no run, seal or entry', async () => {
    const dir = aSecretarysFolder({ 'design/rules.md': 'The rules, changed.\n', 'src/code.ts': 'export {}\n', 'CLAUDE.md': 'Changed.\n' })
    const before = counts()
    const r = await call('POST', '/api/merge-queue', asSecretary, body(dir))
    expect(r.status, r.raw).toBe(409)
    expect(r.body['error']).toContain('2 paths outside design/: CLAUDE.md, src/code.ts.')
    expect(counts()).toEqual(before)
  })

  it("refuses a folder whose HEAD is not the named branch's tip, and a branch the folder does not have", async () => {
    const dir = aSecretarysFolder({ 'design/rules.md': 'The rules, changed again.\n' })
    const before = counts()
    const onMain = await call('POST', '/api/merge-queue', asSecretary, body(dir, 'main'))
    expect(onMain.status, onMain.raw).toBe(409)
    expect(onMain.body['error']).toContain(`is at ${git(dir, 'rev-parse', 'notes')}, and the branch main is at ${git(dir, 'rev-parse', 'main')}`)
    const nowhere = await call('POST', '/api/merge-queue', asSecretary, body(dir, 'no-such-branch'))
    expect(nowhere.status, nowhere.raw).toBe(409)
    expect(nowhere.body['error']).toContain('has no branch no-such-branch')
    expect(counts()).toEqual(before)
  })
})
