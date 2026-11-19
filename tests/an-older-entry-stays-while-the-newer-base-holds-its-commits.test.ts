// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OLDER ENTRY STAYS IN THE QUEUE WHILE THE NEWER ENTRY'S BASE HOLDS ITS COMMITS (wave 13u round 157).
 *
 * WHAT WENT WRONG. A newer entry from one branch superseded an older entry whenever its commit contained the older
 * entry's commit. One line cut a round from its previous round's tip, so the newer entry's sealed base was the older
 * entry's commit. The queue superseded the older entry. The merge tool then refused the newer one, because it lands an
 * entry only when its sealed base is on main (tools/merge-tool/integrate.mjs), and that base had not landed. Neither
 * entry could land.
 *
 * WHAT IS PROVED HERE, against a real database, the real server and made-up git trees under `.logs/`:
 *
 *   1. A newer entry whose base is the older entry's commit keeps both entries, and its answer says the older one stays
 *      ahead of it and that it lands only after the older one.
 *   2. A newer entry cut from the same main as the older one still supersedes it.
 *   3. A newer entry rebased onto a later main, carrying the older entry's commit as a copy, still supersedes it: its
 *      base holds none of the older entry's commits.
 *   4. A newer entry whose base holds one of the older entry's two commits keeps both, and its answer says how many.
 *
 * The words are the queue's own, read by name from what it exports, so no sentence is copied here.
 *
 * Every repository, commit, run and entry here is made up, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'ks-worker')
const asStarter = as('agent', 'ks-starter')
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `older-stays-${prefix}-`))
  made.push(dir)
  return dir
}

/** A made-up git tree with one baseline commit on `main`. */
function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic older-stays fixture')
  writeFileSync(join(dir, 'base.txt'), 'baseline\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  return dir
}

/** One made-up commit in `dir` on its current branch, touching `work/<file>`, inside the worker's work area. */
function commit(dir: string, file: string, text: string): string {
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', file), text)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', `Synthetic ${file}`)
  return git(dir, 'rev-parse', 'HEAD')
}

/** A run of the worker in `dir`, cut from `cutFrom` and finished, so it is sealed on the folder's HEAD as it stands now. */
async function aSealedRun(dir: string, cutFrom: string): Promise<string> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic older-stays run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'ks-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'ks-worker', cutFrom, workingDirectory: dir },
  }).id
  const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(r.statusCode, r.body).toBe(200)
  return run
}

async function submit(run: string, branch: string) {
  const r = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'git', repository: 'ks-main', branch } } })
  expect(r.statusCode, r.body).toBe(201)
  return r.json() as { entry: Record<string, unknown>; superseded: string[]; says: string }
}

function stateOf(id: string): unknown {
  return t.api.getRecord(id)!.data['state']
}

function baseOf(entry: Record<string, unknown>): string {
  return String((entry['changeset'] as { base: string }).base)
}

/** The queue's own words for an older entry, read by name so that this file type-checks before the queue exports them. */
async function theQueuesWords() {
  const queue = await import('../src/server/lib/merge-queue.ts')
  const stays = Reflect.get(queue, 'AN_OLDER_ENTRY_STAYS_AHEAD') as ((olderId: string, base: string, held: number, own: number) => string) | undefined
  const rule = Reflect.get(queue, 'ONLY_A_BASE_WITHOUT_ITS_COMMITS_SUPERSEDES') as string | undefined
  const supersedes = Reflect.get(queue, 'IT_SUPERSEDES') as ((olderId: string) => string) | undefined
  const howItContains = Reflect.get(queue, 'HOW_IT_CONTAINS') as Record<string, string> | undefined
  expect(stays, 'the queue exports AN_OLDER_ENTRY_STAYS_AHEAD').toBeDefined()
  expect(rule, 'the queue exports ONLY_A_BASE_WITHOUT_ITS_COMMITS_SUPERSEDES').toBeDefined()
  expect(supersedes, 'the queue exports IT_SUPERSEDES').toBeDefined()
  expect(howItContains, 'the queue exports HOW_IT_CONTAINS').toBeDefined()
  return { stays: stays!, rule: rule!, supersedes: supersedes!, howItContains: howItContains! }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const started = async (by: Record<string, string>, handle: string, workArea?: string[]) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) } })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, 'ks-starter')
  await started(asStarter, 'ks-worker', ['work'])
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'ks-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('an older entry stays while the newer base holds its commits', () => {
  it('1: keeps both when the newer base is the older commit, and says the older one lands first', async () => {
    const words = await theQueuesWords()
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'line')
    const first = commit(dir, 'first.txt', 'the first round\n')
    const older = await submit(await aSealedRun(dir, 'main'), 'line')
    const olderId = String(older.entry['id'])
    commit(dir, 'second.txt', 'the second round, cut from the first one\n')
    const newer = await submit(await aSealedRun(dir, first), 'line')
    expect(baseOf(newer.entry)).toBe(first)
    expect(newer.superseded).toEqual([])
    expect(stateOf(olderId)).toBe('submitted')
    expect(stateOf(String(newer.entry['id']))).toBe('submitted')
    expect(newer.says).not.toContain(words.supersedes(olderId))
    expect(newer.says).toContain(` ${words.stays(olderId, first, 1, 1)}`)
  })

  it('2: still supersedes the older entry when the newer one is cut from the same main', async () => {
    const words = await theQueuesWords()
    const dir = tree()
    const main = git(dir, 'rev-parse', 'main')
    git(dir, 'switch', '-q', '-c', 'line')
    commit(dir, 'first.txt', 'the first round\n')
    const older = await submit(await aSealedRun(dir, 'main'), 'line')
    const olderId = String(older.entry['id'])
    commit(dir, 'second.txt', 'the second round, on the same main\n')
    const newer = await submit(await aSealedRun(dir, 'main'), 'line')
    expect(baseOf(newer.entry)).toBe(main)
    expect(newer.superseded).toEqual([olderId])
    expect(stateOf(olderId)).toBe('superseded')
    expect(newer.says).toContain(` ${words.supersedes(olderId)} `)
    expect(newer.says).not.toContain(words.rule)
  })

  it('3: still supersedes the older entry when the newer one carries its commit onto a later main', async () => {
    const words = await theQueuesWords()
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'line')
    const first = commit(dir, 'first.txt', 'the first round\n')
    const older = await submit(await aSealedRun(dir, 'main'), 'line')
    const olderId = String(older.entry['id'])
    // MAIN MOVES, and the line carries the first round's commit onto it as a copy before its next seal.
    git(dir, 'switch', '-q', 'main')
    writeFileSync(join(dir, 'elsewhere.txt'), 'another line landed\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'Synthetic later main')
    const later = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'switch', '-q', '-c', 'line-again')
    git(dir, 'cherry-pick', first)
    commit(dir, 'second.txt', 'the second round, rebased onto the later main\n')
    const newer = await submit(await aSealedRun(dir, 'main'), 'line-again')
    expect(baseOf(newer.entry)).toBe(later)
    expect(newer.superseded).toEqual([olderId])
    expect(stateOf(olderId)).toBe('superseded')
    expect(newer.says).toContain(` ${words.supersedes(olderId)} `)
    expect(newer.says).toContain(words.howItContains['same patches'])
    expect(newer.says).not.toContain(words.rule)
  })

  it("4: keeps both when the newer base holds one of the older entry's two commits, and says how many", async () => {
    const words = await theQueuesWords()
    const dir = tree()
    git(dir, 'switch', '-q', '-c', 'line')
    const first = commit(dir, 'first.txt', 'the first piece\n')
    commit(dir, 'second.txt', 'the second piece\n')
    const older = await submit(await aSealedRun(dir, 'main'), 'line')
    const olderId = String(older.entry['id'])
    commit(dir, 'third.txt', 'the next round, cut from the first piece\n')
    const newer = await submit(await aSealedRun(dir, first), 'line')
    expect(baseOf(newer.entry)).toBe(first)
    expect(newer.superseded).toEqual([])
    expect(stateOf(olderId)).toBe('submitted')
    expect(newer.says).toContain(` ${words.stays(olderId, first, 1, 2)}`)
  })
})
