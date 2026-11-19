// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RE-CHECKED ENTRY LETS ITS LANE GO, AND COMES BACK FIRST (wave 13u, item 53, round A).
 *
 * WHAT WAS WRONG. When putting an entry on main changed files since its verdict, the office moved it to reinspecting,
 * and reinspecting held the lane. Every judged entry of the lane waited with "the-lane-is-held" until a scoped check of
 * the changed files released or refused it, however long nobody started that check.
 *
 * WHAT THIS FILE PROVES, each by a run against a real database and the real server, on made-up entries:
 *
 *   1. A reinspecting entry holds no lane, and a judged entry of the same lane takes it meanwhile. The submitter's
 *      notice says the entry let its lane go, and not that no other entry can take it.
 *   2. A release while the lane is free and main is still the one the entry was integrated on moves it to testing,
 *      which takes the lane, as before.
 *   3. A release while another entry holds the lane moves it back to judged, with the re-checked contents judged and
 *      `returnsFirst` set, and without counting an attempt. Once the lane is free, a judged entry written before it
 *      waits for it ('a-returning-entry-goes-first'), and the lane lists it first.
 *   4. A release after another entry landed on the main the entry was integrated on moves it back to judged too, though
 *      the lane is free: its integration is not on main any more.
 *   5. An entry moved to the front stays ahead of a returning entry (the secretary's WAgC_Gdjlvlo).
 *   6. A returning entry's next integration asks only for the paths whose content changed again, and that check holds
 *      the lane, so a re-checked entry lets its lane go at most once for each verdict. While nobody has started that
 *      check, the queue says the lane waits on it. Its release clears the mark.
 *   7. A refusal bounces the entry as refused while another entry holds the lane, and the holder keeps the lane.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the code records the runs). Each goes red where named:
 *   - reinspecting holds the lane again (`occupiesTheLane: true`): cases 1, 3, 4, 5, 6 and 7;
 *   - a release always moves the entry to testing: cases 3, 4, 5 and 6;
 *   - the release does not ask whether an entry landed on the main it was integrated on: case 4;
 *   - the merge tool does not wait for a returning entry: case 3;
 *   - a returning entry goes before a moved one: case 5;
 *   - a returning entry's check lets the lane go too: case 6;
 *   - the queue says the entry waits on a check nobody started, whatever it holds: case 6;
 *   - the notice says the entry holds its lane whatever it does: case 1.
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout and removed
 * after, the records are filed as fixtures, and nothing reaches a running office.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ABSENT, MERGE_STATE_SPECS, type MergeState } from '../src/shared/merge-queue.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []

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

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `lets-its-lane-go-${prefix}-`))
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

let mainCheckout = ''

async function step(id: string, step: string, facts: Record<string, unknown>) {
  return call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step, facts })
}

async function entry(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${id}`, asStranger)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry']
}

/** A verdict on a run, through the real doors: the assembly first, then the verdict. `read.only` makes it a scoped check. */
async function verdict(run: string, body: Record<string, unknown>, read: Record<string, unknown> = {}) {
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
  return call('POST', `/api/checks/${run}`, asInspector, { chaptersRead: [], read: whatWasRead, ...(body['verdict'] === 'released' ? { traced: syntheticTrace(t, only ?? seal.files.map((one) => one.path)) } : {}), ...body })
}
const release = (run: string, read: Record<string, unknown> = {}) =>
  verdict(run, { verdict: 'released', check: 'Synthetic: read the changes and found nothing missing.' }, read)
const refuse = (run: string, read: Record<string, unknown> = {}) =>
  verdict(run, { verdict: 'refused', check: 'Synthetic: read the changes.', missing: ['The test would pass with the feature deleted.'], says: { chapter: 5 } }, read)

function messagesAbout(run: string): { title: string; body: string }[] {
  const rows = t.client.sqlite
    .prepare("SELECT title, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid")
    .all(run) as { title: string; data: string }[]
  return rows.map((row) => ({ title: row.title, body: (JSON.parse(row.data) as { body: string }).body }))
}

/** The notice the submitter of an entry is sent about its check again, found by its title. */
function theNoticeOf(id: string, run: string): string {
  const notices = messagesAbout(run).filter((one) => one.title.startsWith(`Merge entry ${id} waits on a check again`))
  expect(notices.map((one) => one.title)).toHaveLength(1)
  return notices[0]!.body
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

/** The lane as the queue lists it: who holds it, and its entries' ids in the lane's order. */
async function theLane(): Promise<{ occupiedBy: string | null; order: string[] }> {
  const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(mainCheckout)}`, asStranger)
  expect(listed.status, listed.raw).toBe(200)
  const lane = listed.body['lanes'][0] as { occupiedBy: { entry: string } | null; entries: { id: string }[] }
  return { occupiedBy: lane.occupiedBy?.entry ?? null, order: lane.entries.map((one) => one.id) }
}

const withdraw = async (id: string) => {
  const r = await call('POST', `/api/merge-queue/${id}/withdraw`, asPerson, { because: 'the case is over' })
  expect(r.status, r.raw).toBe(200)
}

/**
 * EVERY ENTRY NOT FINAL IS WITHDRAWN AFTER EACH CASE, in both lanes of the repository: the holder, and every judged or
 * returning entry, which would otherwise wait ahead of the next case's entries. A landing entry cannot be withdrawn, so
 * it is sent back to judged first, the way the main world moving would send it.
 */
async function withdrawEveryEntryLeft(): Promise<void> {
  for (const lane of [mainCheckout, `${mainCheckout} documents`]) {
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(lane)}`, asStranger)
    for (const one of (listed.body['lanes']?.[0]?.entries ?? []) as { id: string; state: MergeState }[]) {
      if (MERGE_STATE_SPECS[one.state].final) continue
      if (one.state === 'landing') await step(one.id, 'main-moved', { mainAt: '0'.repeat(40) })
      await withdraw(one.id)
    }
  }
}

beforeAll(async () => {
  t = await freshDb()
  aTreeAlreadyMade = scratch('tree-template')
  buildTree(aTreeAlreadyMade)
  // THE DEFAULT SET, AS A NEW OFFICE COPIES IT AT ITS FIRST START: a check quotes the office's own chapter records.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
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
  mainCheckout = realpathSync(scratch('main'))
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: mainCheckout, actor: { type: 'human', id: THE_PERSON } })
}, 60_000)

afterEach(async () => {
  await withdrawEveryEntryLeft()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('a re-checked entry lets its lane go', () => {
  it('holds no lane while its check runs, so a judged entry of the lane takes the lane, and its submitter is told so', async () => {
    const x = await aReinspectingEntry('x-lets-go')
    const y = await aJudgedEntry('y-takes-the-lane')
    const reinspecting = await entry(x.id)
    expect(reinspecting.state).toBe('reinspecting')
    expect(reinspecting.occupies).toBeNull()
    expect(reinspecting.returnsFirst).toBeUndefined()
    expect(reinspecting.checkNotRecordedAsStarted.says).toContain(`merge entry ${x.id} waits on a check nobody is recorded as having started`)
    expect(reinspecting.checkNotRecordedAsStarted.says).not.toContain('the lane waits')
    expect((await entry(y.id)).toolWaits).toBeUndefined()
    const taken = await step(y.id, 'integrating', {})
    expect(taken.status, taken.raw).toBe(200)
    expect(taken.body['entry'].occupies).toBe(mainCheckout)
    expect((await theLane()).occupiedBy).toBe(y.id)
    const notice = theNoticeOf(x.id, x.asked.run)
    expect(notice).toContain(`Merge entry ${x.id} let its lane go while a check of it runs, so other entries of the lane may land meanwhile.`)
    expect(notice).not.toContain('no other entry can take the lane')
  })

  it('takes the lane back and goes to testing when its release comes while the lane is free and main has not moved', async () => {
    const x = await aReinspectingEntry('x-straight-back')
    const released = await release(x.asked.run, { worktree: x.onTop.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    expect(released.body['mergeQueue'].moved).toEqual([{ entry: x.id, state: 'testing', says: expect.stringContaining('every path') }])
    const testing = await entry(x.id)
    expect(testing.occupies).toBe(mainCheckout)
    expect(testing.returnsFirst).toBeUndefined()
    expect(testing.machine.judged).toEqual({ ...contentOf(x.seal), [A]: x.onTop.files[A] })
  })

  it('goes back to judged when its release comes while another entry holds the lane, and takes the lane first once it is free', async () => {
    const z = await aJudgedEntry('z-written-first')
    const x = await aReinspectingEntry('x-returns')
    const y = await aJudgedEntry('y-goes-ahead')
    expect((await step(y.id, 'integrating', {})).status).toBe(200)
    const attempts = (await entry(x.id)).machine.attempts
    const released = await release(x.asked.run, { worktree: x.onTop.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    expect(released.body['mergeQueue'].moved).toEqual([{ entry: x.id, state: 'judged', says: expect.stringContaining(`held by merge entry ${y.id}`) }])
    expect(released.body['mergeQueue'].moved[0].says).toContain('every path')
    const returned = await entry(x.id)
    expect(returned.occupies).toBeNull()
    expect(returned.returnsFirst).toEqual({ run: x.asked.run, at: expect.any(String), turn: expect.any(Number) })
    expect(returned.machine.judged).toEqual({ ...contentOf(x.seal), [A]: x.onTop.files[A] })
    expect(returned.machine.reinspected).toEqual([{ run: x.asked.run, only: [A], needsJudgment: [], releasedAt: expect.any(String) }])
    expect(returned.machine.attempts).toEqual(attempts)
    expect((await entry(z.id)).toolWaits).toMatchObject({ because: 'the-lane-is-held', holder: y.id })

    await withdraw(y.id)
    expect((await entry(z.id)).toolWaits).toEqual({ because: 'a-returning-entry-goes-first', first: x.id, says: expect.stringContaining(`Merge entry ${x.id} let its lane go while a check of it ran`) })
    expect((await entry(x.id)).toolWaits).toBeUndefined()
    expect((await theLane()).order.filter((id) => id === x.id || id === z.id)).toEqual([x.id, z.id])
  })

  it('goes back to judged when another entry landed on the main it was integrated on, though the lane is free', async () => {
    const x = await aReinspectingEntry('x-main-moved')
    const y = await aJudgedEntry('y-lands')
    expect((await step(y.id, 'integrating', {})).status).toBe(200)
    expect((await step(y.id, 'integrated', { result: y.seal.commit, mainAt: x.onTop.mainAt, files: contentOf(y.seal) })).body['entry'].state).toBe('testing')
    expect((await step(y.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 10, passed: 10 })).status).toBe(200)
    expect((await step(y.id, 'landing', { mainAt: x.onTop.mainAt })).status).toBe(200)
    const landed = await step(y.id, 'landed', { mainAfter: y.seal.commit })
    expect(landed.status, landed.raw).toBe(200)
    expect(landed.body['entry'].state).toBe('merged')
    expect((await theLane()).occupiedBy).toBeNull()
    const released = await release(x.asked.run, { worktree: x.onTop.clone, only: [A] })
    expect(released.status, released.raw).toBe(201)
    expect(released.body['mergeQueue'].moved).toEqual([{ entry: x.id, state: 'judged', says: expect.stringContaining(`Merge entry ${y.id} landed on ${x.onTop.mainAt}`) }])
    const returned = await entry(x.id)
    expect(returned.occupies).toBeNull()
    expect(returned.returnsFirst).toEqual({ run: x.asked.run, at: expect.any(String), turn: expect.any(Number) })
  })

  it('waits behind an entry moved to the front, which stays ahead of a returning entry', async () => {
    const x = await aReinspectingEntry('x-behind-a-move')
    const y = await aJudgedEntry('y-holds')
    const m = await aJudgedEntry('m-moved')
    expect((await step(y.id, 'integrating', {})).status).toBe(200)
    expect((await release(x.asked.run, { worktree: x.onTop.clone, only: [A] })).body['mergeQueue'].moved[0].state).toBe('judged')
    const moved = await call('POST', `/api/merge-queue/${m.id}/first`, asPerson, { because: 'Synthetic: the person wants this one first.' })
    expect(moved.status, moved.raw).toBe(200)
    await withdraw(y.id)
    expect((await entry(x.id)).toolWaits).toMatchObject({ because: 'a-moved-entry-goes-first', first: m.id })
    expect((await entry(m.id)).toolWaits).toBeUndefined()
    expect((await theLane()).order.filter((id) => id === x.id || id === m.id)).toEqual([m.id, x.id])
  })

  it('holds the lane through the check of its next integration, which asks only for what changed again, and its release clears the mark', async () => {
    const x = await aReinspectingEntry('x-checked-twice')
    const y = await aJudgedEntry('y-ahead-once')
    const z = await aJudgedEntry('z-waits-for-the-second-check')
    expect((await step(y.id, 'integrating', {})).status).toBe(200)
    expect((await release(x.asked.run, { worktree: x.onTop.clone, only: [A] })).body['mergeQueue'].moved[0].state).toBe('judged')
    await withdraw(y.id)
    // MAIN MOVED AGAIN, and this time the rebase changed B as well as A. A's content is what the first check read.
    const again = aCloneOnTopOfMain(x.dir, [A, B])
    expect(again.files[A]).toBe(x.onTop.files[A])
    expect(again.files[B]).not.toBe(x.onTop.files[B])
    const asked = await toReinspecting(x, again)
    expect(asked.only).toEqual([B])
    const holding = await entry(x.id)
    expect(holding.occupies).toBe(mainCheckout)
    expect(holding.returnsFirst).toEqual({ run: x.asked.run, at: expect.any(String), turn: expect.any(Number) })
    expect(holding.checkNotRecordedAsStarted.says).toContain('the lane waits on a check nobody is recorded as having started')
    const refused = await step(z.id, 'integrating', {})
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['error']).toContain(x.id)
    expect(theNoticeOf(x.id, asked.run)).toContain(`Merge entry ${x.id} holds its lane in`)
    const released = await release(asked.run, { worktree: again.clone, only: [B] })
    expect(released.status, released.raw).toBe(201)
    expect(released.body['mergeQueue'].moved).toEqual([{ entry: x.id, state: 'testing', says: expect.stringContaining('every path') }])
    const testing = await entry(x.id)
    expect(testing.occupies).toBe(mainCheckout)
    expect(testing.returnsFirst).toBeUndefined()
  })

  it('bounces as refused when its check refuses while another entry holds the lane, and the holder keeps the lane', async () => {
    const x = await aReinspectingEntry('x-refused')
    const y = await aJudgedEntry('y-keeps-the-lane')
    expect((await step(y.id, 'integrating', {})).status).toBe(200)
    const refused = await refuse(x.asked.run, { worktree: x.onTop.clone, only: [A] })
    expect(refused.status, refused.raw).toBe(201)
    const bounced = await entry(x.id)
    expect(bounced.state).toBe('bounced')
    expect(bounced.occupies).toBeNull()
    expect(bounced.machine.bounced).toMatchObject({ reason: 'refused', files: [A], mainAt: x.onTop.mainAt })
    expect((await entry(y.id)).occupies).toBe(mainCheckout)
    expect((await theLane()).occupiedBy).toBe(y.id)
  })
})
