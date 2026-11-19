// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASED RUN WHOSE CONTENT REACHED MAIN BY HAND IS RECORDED AS SUCH. Point 12
 * of a decision, wave 13k round 5.
 *
 * On 26 September the secretary landed the content of three released runs on main by hand, because the merge queue could not
 * land them, and the office showed them only as released and confirmed. The door POST /api/checks/<run>/landed-by-hand
 * lets the person, or a holder of the secretary card, record it, naming the commit.
 *
 * WHAT IS MEASURED, on real git repositories this file makes in a temporary folder. Every record here is synthetic:
 *
 *   · a run whose content was cherry-picked onto a main that had moved on is recorded: 201, `theCheck.landedByHand`
 *     holds the commit, the lane, who, when, why and how git found the run's commit; the run still stands `closed`, its
 *     sentence says its content reached main by hand in that commit, and GET /api/checks/<run> reads it back; the
 *     release and the confirmation are exactly as they were; a second record is refused;
 *   · a run never submitted to the queue is read in the project's one registered repository, and refused while the
 *     project has none;
 *   · refused, 409 or 403, nothing written: a commit that is not on main; a commit on main that does not hold the run's
 *     commit; a run that is not released; a run whose merge entry merged; a caller who is neither the person nor a
 *     holder of the secretary card.
 *
 * MUTATION (wave 13k round 5): skip the check that the named commit holds the run's commits, in `recordAHandLanding`
 * (src/server/lib/inspection.ts). The case of a commit that does not hold the tip goes red.
 */

import { LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX } from '../src/shared/merge/landed-history.mjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb, theVerdictsApart, writeAVerdictAsItsDoorWould } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let door: typeof import('../src/server/lib/merge-entry-door.ts')

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

// A FOLDER THIS FILE MAKES, AND A HOME INSIDE IT, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'landed-by-hand-'))
const home = join(made, 'home')
const homeBefore = process.env['HOME']

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}
function commit(dir: string, file: string, content: string, subject: string): string {
  writeFileSync(join(dir, 'work', file), content)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', subject)
  return git(dir, 'rev-parse', 'HEAD')
}

let repositories = 0
/** A lane: a repository whose own checkout is main, and a worktree beside it on a branch cut from main. */
function aLane(name: string): { lane: string; branch: string } {
  repositories += 1
  const lane = join(made, `lane-${String(repositories)}`)
  mkdirSync(join(lane, 'work'), { recursive: true })
  git(lane, 'init', '-q', '-b', 'main')
  git(lane, 'config', 'user.email', 'fixture@example.invalid')
  git(lane, 'config', 'user.name', 'Synthetic hand-landing fixture')
  writeFileSync(join(lane, 'work', 'a.txt'), 'a before\n')
  writeFileSync(join(lane, 'work', 'b.txt'), 'b before\n')
  git(lane, 'add', '.')
  git(lane, 'commit', '-q', '-m', 'Synthetic baseline')
  const branch = join(made, `${name}-${String(repositories)}`)
  git(lane, 'worktree', 'add', '-q', '-b', name, branch, 'main')
  return { lane, branch }
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A run finished through the real finish door, so the office seals its git work. */
async function aSealedRun(handle: string, directory: string): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title: `Synthetic sealed run of ${handle}`, data: { state: 'running', servingAgent: handle, workingDirectory: directory, cutFrom: 'main' } },
  })
  expect(created.statusCode, created.body).toBe(201)
  const id = (created.json() as { record: { id: string } }).record.id
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asAgent(handle), payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
  return id
}

const A_RELEASE = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-26 03:00:00', how: 'an inspector' as const }
const A_CONFIRMATION = { by: { kind: 'agent' as const, id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-26 03:10:00', because: 'The report is sound.' }

let entries = 0
/** A merge entry of `run` in `lane`, standing `state`, written the way the merge queue writes one. */
function aMergeEntry(run: string, lane: string, state: 'merged' | 'bounced'): string {
  entries += 1
  const seal = String(t.api.getRecord(run)!.data['sealedTip'])
  return door.asTheMergeQueue(() =>
    t.api.createRecord({
      kind: 'merge_entry',
      title: `Synthetic merge entry ${String(entries)}`,
      workspaceId: WORKSPACE,
      origin: 'fixture',
      data: { run, seal: { id: seal, hash: 'h' }, changeset: { adapter: 'git', root: lane, repository: 'r', branch: `entry-${String(entries)}`, commit: 'c', base: 'b' }, state, submittedBy: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle } },
      actor: inspection.THE_OFFICE,
    }),
  ).id
}

/** A fixture's write. A run's verdicts go through `writeAVerdictAsItsDoorWould`, since an ordinary write of them is refused. */
async function patch(run: string, dataPatch: Record<string, unknown>): Promise<void> {
  const { verdicts, rest } = theVerdictsApart(dataPatch)
  writeAVerdictAsItsDoorWould(t, run, verdicts)
  if (Object.keys(rest).length === 0) return
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { dataPatch: rest } })
  expect(reply.statusCode, reply.body).toBe(200)
}

/**
 * The measured shape of 26 September: a run released and confirmed, its entry bounced, main moved on, and its commit
 * cherry-picked onto main by hand. Answers the run, the lane, its sealed commit and the commit on main that holds it.
 */
async function aRunLandedByHand(name: string, parts: { released?: boolean; entry?: 'bounced' | 'merged' | null } = {}): Promise<{ run: string; lane: string; sealed: string; onMain: string; mainOwn: string }> {
  const { lane, branch } = aLane(name)
  const sealed = commit(branch, 'a.txt', 'a from the run\n', 'The run changes a')
  const run = await aSealedRun('hand-worker', branch)
  if (parts.released !== false) await patch(run, { released: A_RELEASE, confirmed: A_CONFIRMATION })
  if (parts.entry !== null) aMergeEntry(run, lane, parts.entry ?? 'bounced')
  const mainOwn = commit(lane, 'b.txt', 'b moved on main\n', 'Main moves on meanwhile')
  git(lane, 'cherry-pick', sealed)
  return { run, lane, sealed, onMain: git(lane, 'rev-parse', 'HEAD'), mainOwn }
}

async function record(run: string, commitName: string, headers = asAgent(THE_TEST_OFFICES_SECRETARY.handle)): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/landed-by-hand`,
    headers,
    payload: { commit: commitName, because: `The queue could not land it, so ${THE_TEST_OFFICES_SECRETARY.handle} landed it by hand.` },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** A refusal: the status, the words given, "Nothing was written.", and the run's data exactly as before. */
async function expectRefused(run: string, commitName: string, status: number, headers: Record<string, string>, ...words: string[]): Promise<void> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const { code, said } = await record(run, commitName, headers)
  expect(code, JSON.stringify(said)).toBe(status)
  const why = String(said['error'])
  for (const word of words) expect(why).toContain(word)
  expect(why).toContain('Nothing was written.')
  expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
}

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  door = await import('../src/server/lib/merge-entry-door.ts')
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'hand-worker', name: 'Hand worker', role: 'worker', workArea: ['work'] })
  await register(AS_THE_PERSON, { handle: 'hand-inspector', name: 'Hand inspector', role: 'inspector' })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('a released run whose content reached main by hand', () => {
  it('finds both original patches through a retained squashed landing, including an overwritten intermediate change', async () => {
    const { lane, branch } = aLane('squashed-hand')
    const base = git(lane, 'rev-parse', 'HEAD')
    const first = commit(branch, 'a.txt', 'a draft\n', 'Synthetic first patch')
    const tip = commit(branch, 'a.txt', 'a finished\n', 'Synthetic final patch')
    const run = await aSealedRun('hand-worker', branch)
    await patch(run, { released: A_RELEASE, confirmed: A_CONFIRMATION })
    aMergeEntry(run, lane, 'bounced')
    const seal = String(t.api.getRecord(run)!.data.sealedTip)
    git(lane, 'update-ref', `${LANDED_KEEP_PREFIX}synthetic-hand`, tip)
    git(lane, 'update-ref', `${REPLAY_KEEP_PREFIX}synthetic-hand/${tip}`, tip)
    const message = `Finish the synthetic feature\n\nMole-landing: 1\nEntry: synthetic-hand\nRun: ${run}\nSeal: ${seal}\nSeal-hash: ${'a'.repeat(64)}\nBranch-tip: ${tip}\nReplayed-tip: ${tip}`
    const landed = git(lane, 'commit-tree', git(lane, 'rev-parse', `${tip}^{tree}`), '-p', base, '-m', message)
    git(lane, 'merge', '--ff-only', landed)
    const proof = (await import('../src/server/lib/sealed-tip.ts')).whatALaterSealHolds(lane, { forkBase: base, commit: tip }, { forkBase: base, commit: landed })
    expect(proof).toEqual({ holds: true, how: 'same patches', commits: [{ commit: first, as: first }, { commit: tip, as: tip }] })
    const result = await record(run, landed)
    expect(result.code, JSON.stringify(result.said)).toBe(201)
    git(branch, 'checkout', '--detach')
    git(lane, 'branch', '-D', 'squashed-hand')
    commit(branch, 'a.txt', 'the next round\n', 'Synthetic next round')
    const { verifyRunSeal } = await import('../src/server/lib/sealed-tip.ts')
    expect(verifyRunSeal(run, { fromTheCommit: true })?.seal.git?.commit).toBe(tip)
    const repositories = await import('../src/server/lib/repositories.ts')
    const repository = repositories.registerRepository({ workspaceId: WORKSPACE, name: 'synthetic-kept-history', root: lane, actor: { type: 'human', id: THE_PERSON } })
    try {
      const { readRunSeal, theBranchesThatKeepASealedCommit } = await import('../src/server/lib/sealed-tip.ts')
      expect(theBranchesThatKeepASealedCommit(run, seal, readRunSeal(run)!.seal.git!)).toMatchObject({ kept: true, branches: [`${LANDED_KEEP_PREFIX.slice('refs/'.length)}synthetic-hand`] })
    } finally { repositories.deleteRepository(repository.id, WORKSPACE, { type: 'human', id: THE_PERSON }) }
    // An archived original is not evidence of patches a checked resolution changed.
    git(lane, 'switch', '-qc', 'adapted-replay', base)
    const adapted = commit(lane, 'a.txt', 'a resolved differently\n', 'Synthetic changed resolution')
    git(lane, 'switch', '-q', 'main')
    const adaptedLanding = git(lane, 'commit-tree', git(lane, 'rev-parse', `${adapted}^{tree}`), '-p', base, '-m', message.replace(`Replayed-tip: ${tip}`, `Replayed-tip: ${adapted}`))
    expect((await import('../src/server/lib/sealed-tip.ts')).whatALaterSealHolds(lane, { forkBase: base, commit: tip }, { forkBase: base, commit: adaptedLanding }).holds).toBe(false)
    // An unrelated squash with no retained lineage must not settle this run.
    const unproved = git(lane, 'commit-tree', git(lane, 'rev-parse', `${tip}^{tree}`), '-p', base, '-m', 'Synthetic unproved squash')
    expect((await import('../src/server/lib/sealed-tip.ts')).whatALaterSealHolds(lane, { forkBase: base, commit: tip }, { forkBase: base, commit: unproved }).holds).toBe(false)
  })

  it('is recorded and read back: the commit, who, when, why and how git found it, and the run says so', async () => {
    const { run, lane, sealed, onMain } = await aRunLandedByHand('recorded')
    const before = t.api.getRecord(run)!.data
    const { code, said } = await record(run, onMain.slice(0, 12))
    expect(code, JSON.stringify(said)).toBe(201)

    const check = t.api.getRecord(run)!.data['theCheck'] as Record<string, unknown>
    expect(check['landedByHand']).toEqual({
      commit: onMain,
      lane,
      by: { kind: 'agent', id: expect.any(String) },
      at: expect.any(String),
      because: `The queue could not land it, so ${THE_TEST_OFFICES_SECRETARY.handle} landed it by hand.`,
      contains: { how: 'same patches', laterCommit: onMain, commits: [{ commit: sealed, as: onMain }] },
    })
    // NOTHING ELSE MOVED, and the run is still closed: a hand-landing adds a fact, not a standing.
    const after = t.api.getRecord(run)!.data
    expect(after['released']).toEqual(before['released'])
    expect(after['confirmed']).toEqual(before['confirmed'])
    expect(after['sealedTip']).toEqual(before['sealedTip'])
    const stands = said['stands'] as Record<string, unknown>
    expect(stands['standing']).toBe('closed')
    expect(String(said['says'])).toContain(`Its content reached main by hand, in ${onMain.slice(0, 12)} on ${lane}, not through the merge queue: agent ${THE_TEST_OFFICES_SECRETARY.handle} recorded it at`)

    // READ BACK through the check door a person's page reads.
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.body).toContain(`Its content reached main by hand, in ${onMain.slice(0, 12)}`)

    // ONCE.
    await expectRefused(run, onMain, 409, asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'is already recorded as landed by hand')
  })

  /**
   * A CHECK ASKED AGAIN, OR A CHECK TOOL'S ENDING RECORDED, KEEPS THE HAND-LANDING. Wave 13k round 7, piece 2 (the
   * inspector's note 1 on round 6), in src/server/lib/inspection.ts:
   *   · `askForTheCheckAgain` refuses a settled run in words and writes nothing. Round 6 dropped every other key of the
   *     old check around the settlement, which the session kind refuses (a check with no asking), so it answered 400;
   *     this case found that;
   *   · `rememberTheCheck`, which writes the whole check when a check tool's ending is recorded, keeps the settlement.
   * CONTROLS (wave 13k round 7), each alone: take out the refusal, or the keeping in `rememberTheCheck`, and the case
   * goes red, because the settlement guard refuses the office's own write of the whole check (403).
   */
  it('keeps the hand-landing when the check is asked again, and when a check tool\'s ending is recorded', async () => {
    const { run, onMain } = await aRunLandedByHand('kept')
    expect((await record(run, onMain)).code).toBe(201)
    const landed = (t.api.getRecord(run)!.data['theCheck'] as Record<string, unknown>)['landedByHand']
    expect(landed).toBeDefined()

    const before = JSON.stringify(t.api.getRecord(run)!.data)
    const again = await app.inject({ method: 'POST', url: `/api/checks/${run}/ask-again`, headers: AS_THE_PERSON, payload: {} })
    expect(again.statusCode, again.body).toBe(409)
    expect(again.body).toContain(`Run ${run} is settled: its content reached main by hand, in ${onMain.slice(0, 12)}.`)
    expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)

    // A CHECK TOOL THAT WAS RUNNING ENDS WITHOUT A VERDICT, and the office records its ending over the whole check.
    const tool = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic check tool run',
      workspaceId: WORKSPACE,
      origin: 'fixture',
      data: { state: 'running', runtime: 'inspection-tool', deliveringMessage: 'SyntheticCheckMessage' },
      actor: inspection.THE_OFFICE,
    }).id
    const asked = {
      askedAt: '2026-09-26 13:00:00',
      askedOf: 'hand-inspector',
      message: 'SyntheticCheckMessage',
      checkout: { directory: '/synthetic/worktree', cutFrom: 'main' },
      says: 'Synthetic: the office asked for a check.',
      execution: { session: tool, log: '/synthetic/check.log', model: 'synthetic', minutes: 1 },
    }
    t.api.patchRecord(run, { dataPatch: { theCheck: asked } }, inspection.THE_OFFICE)
    const ended = inspection.recordCheckToolEnded(run, tool, 'Synthetic: the tool ended without a verdict.', WORKSPACE)
    expect(ended.failed).toBe(true)
    const check = t.api.getRecord(run)!.data['theCheck'] as Record<string, unknown>
    expect(check['landedByHand']).toEqual(landed)
    expect((check['execution'] as Record<string, unknown>)['endedAt']).toEqual(expect.any(String))
  })

  it('lets the person record it too', async () => {
    const { run, onMain } = await aRunLandedByHand('by-the-person')
    const { code, said } = await record(run, onMain, AS_THE_PERSON)
    expect(code, JSON.stringify(said)).toBe(201)
  })

  it('refuses a commit that is not on main', async () => {
    const { run, sealed } = await aRunLandedByHand('not-on-main')
    // The run's own sealed commit is on its branch, not on main (main holds only its cherry-picked copy).
    await expectRefused(run, sealed, 409, asAgent(THE_TEST_OFFICES_SECRETARY.handle), `${sealed} is not on main in`)
  })

  it('refuses a commit on main that does not hold the run\'s commit', async () => {
    const { run, mainOwn } = await aRunLandedByHand('not-held')
    await expectRefused(run, mainOwn, 409, asAgent(THE_TEST_OFFICES_SECRETARY.handle), `${mainOwn} holds no commit with the same patch, or the same changed lines`, 'The run changes a')
  })

  it('refuses a run that is not released', async () => {
    const { run, onMain } = await aRunLandedByHand('not-released', { released: false })
    await expectRefused(run, onMain, 409, asAgent(THE_TEST_OFFICES_SECRETARY.handle), `Run ${run} was not released.`)
  })

  it('refuses a run whose merge entry merged', async () => {
    const { run, onMain } = await aRunLandedByHand('entry-merged', { entry: 'merged' })
    await expectRefused(run, onMain, 409, asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'merged, so its content reached main through the merge queue, not by hand')
  })

  it('reads the project\'s one registered repository for a run never submitted, and refuses while there is none', async () => {
    // Two of the three runs the secretary landed by hand on 26 September were never submitted to the queue.
    const { run, lane, onMain } = await aRunLandedByHand('never-submitted', { entry: null })
    await expectRefused(run, onMain, 409, asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'was never submitted as a git entry to the merge queue, and this project has 0 registered repositories')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-landed-by-hand', root: lane, actor: { type: 'human', id: THE_PERSON } })
    const { code, said } = await record(run, onMain)
    expect(code, JSON.stringify(said)).toBe(201)
    expect((t.api.getRecord(run)!.data['theCheck'] as Record<string, any>)['landedByHand']).toMatchObject({ commit: onMain, lane })
  })

  it('refuses a caller who is neither the person nor a holder of the secretary card', async () => {
    const { run, onMain } = await aRunLandedByHand('not-the-secretary')
    await expectRefused(run, onMain, 403, asAgent('hand-worker'), 'Only the person, or whoever holds the secretary card')
  })
})
