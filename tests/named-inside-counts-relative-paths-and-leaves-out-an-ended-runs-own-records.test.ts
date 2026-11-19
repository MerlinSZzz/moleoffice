// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMED-INSIDE DOOR COUNTS RELATIVE PATHS, AND LEAVES OUT ONLY WHAT AN ENDED RUN WROTE ABOUT ITS OWN WORKTREE.
 * Wave 13s round 62, item 3b; problem feAR8XE6ERK0, with round 57's item 1.
 *
 * GET /api/report-files/named-inside gates the removal of a worktree or a scratch folder
 * (tools/remove-a-worktree.mjs, tools/sweep-run-scratch.mjs), so every case here fails closed: what the door cannot
 * show to be set aside counts.
 *
 * WHAT IS MEASURED. Every record here is synthetic. The git cases run on real repositories this file makes in a
 * temporary folder; one of them, the LANE, is the project's one registered repository until the last case.
 *
 *   · a relative path in prose counts, in another project and in the message centre: out/run-one/log.txt, run-one/log,
 *     ./out/run-one, ../out/run-one, ~/w13s/out/run-one, w13s/out/run-one. Not counted: another sandbox's out/run-one,
 *     the last segment alone, another absolute folder, a longer segment, a neighbour;
 *   · a run whose session gives the folder as its working directory: its session is left out once the run has ended,
 *     and counts while it runs; a session that names the folder in other words counts; a report's file block inside
 *     the folder is listed beside it;
 *   · that run's session also names the folder in data.theCheck.checkout.directory, the checkout its check was told to
 *     read. It is set aside only when no check can read that folder again: no check was asked of the run (theCheck has
 *     no askedOf), or its check is confirmed, closed unchecked or superseded. It counts when the check was asked and
 *     not started, is running, ended with no verdict (a crash, which may be queued again), was released and not
 *     confirmed, or was refused. These cases write the check and its verdicts as their doors store them;
 *   · that run's seal is left out while a branch of the lane contains the sealed commit, and the answer names the
 *     branch. It counts when no branch contains it, when git cannot answer (the lane does not hold the commit), and
 *     when no repository is chosen (two are registered). These runs finish through the real finish door. Nobody
 *     holds the inspector card here, so the door asks no check, and their sessions are left out by the rule above.
 *     The other cases write a run's ended state directly, with no check;
 *   · the start lines about that run (starting.cutSays and launcher.says of a worker entry, launcher.says of a next
 *     round) are left out once it has ended. The same lines count while it runs; a line about another run counts;
 *     another field of the same entry counts;
 *   · every record left out is named in leftOut with each place set aside and its rule, and says counts them.
 *
 * MUTATIONS, each run once against this file and then restored (src/server/api/reportfiles.ts and
 * src/server/lib/sealed-tip.ts):
 *   (a) the door's walker reads absolute paths only, as before: the relative case goes red.
 *   (b) a "/" after any segment leads a relative path: the not-counted case goes red (another sandbox's out).
 *   (c) the last segment alone names the folder whatever follows it: the not-counted case goes red.
 *   (d) the run's ended state is not asked: the running-session case and the running start-line case go red.
 *   (e) the whole session of an ended run is left out, not its working directory: the other-words case goes red.
 *   (f) a start line about any run is set aside: the other-run case goes red.
 *   (g) the whole worker entry is set aside: the other-field case goes red.
 *   (h) a sealed commit no branch contains is taken as kept: the detached case goes red.
 *   (i) git failing is taken as kept: the not-fetched case goes red.
 *   (j) the repository is the first registered one when there are two: the two-repository case goes red.
 *   (k) a check with no askedOf is not taken as settled: the no-check case goes red.
 *   (l) a confirmation is not read: the confirmed case goes red.
 *   (m) a closure unchecked is not read: the closed-unchecked case goes red.
 *   (n) the superseded mark is not read: the superseded case goes red.
 *   (o) a check whose execution ended is taken as settled: the crashed case goes red.
 *   (p) a release is taken as settled: the released case goes red.
 *   (q) a refusal is taken as settled: the refused case goes red.
 *   (r) every check is taken as settled: the asked and running cases go red.
 *   (s) the check's checkout is set aside on any session: the other-run's-check case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let recipient: string

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

// A FOLDER THIS FILE MAKES, AND A HOME INSIDE IT, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'named-inside-ended-run-'))
const home = join(made, 'home')
const homeBefore = process.env['HOME']
const lane = join(made, 'lane')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}
function commit(dir: string, content: string): string {
  writeFileSync(join(dir, 'work', 'a.txt'), content)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic run work')
  return git(dir, 'rev-parse', 'HEAD')
}
function aRepository(dir: string): void {
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic named-inside fixture')
  writeFileSync(join(dir, 'work', 'a.txt'), 'a before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
}

let worktrees = 0
/** A worktree of `repository` cut from main, on a new branch, or detached so no branch holds what is committed there. */
function aWorktree(repository: string, name: string, detached = false): { at: string; branch: string } {
  worktrees += 1
  const branch = `${name}-${String(worktrees)}`
  const at = join(made, branch)
  if (detached) git(repository, 'worktree', 'add', '-q', '--detach', at, 'main')
  else git(repository, 'worktree', 'add', '-q', '-b', branch, at, 'main')
  return { at, branch }
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** A run of the worker's, filed as a run files itself, working in `directory`. */
async function aRun(directory: string, more: Record<string, unknown> = {}): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('gone-worker'),
    payload: { kind: 'session', title: 'Synthetic run', data: { state: 'running', servingAgent: 'gone-worker', workingDirectory: directory, cutFrom: 'main', ...more } },
  })
  expect(created.statusCode, created.body).toBe(201)
  return (created.json() as { record: { id: string } }).record.id
}
/** The run's state, written as the office's own stop would leave it. */
function endedAs(run: string, state: string): void {
  writeDataBypassingTheGate(t, run, { ...t.api.getRecord(run)!.data, state })
}
/** Finished through the real finish door, which seals the worktree's tip. */
async function finished(run: string): Promise<string> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent('gone-worker'), payload: { dataPatch: { state: 'finished' } } })
  expect(reply.statusCode, reply.body).toBe(200)
  return String(t.api.getRecord(run)!.data['sealedTip'])
}

function aRecord(title: string, data: Record<string, unknown>, workspaceId = WORKSPACE): string {
  const row = t.api.createRecord({ workspaceId, kind: 'report', title, actor: t.api.HUMAN })
  writeDataBypassingTheGate(t, row.id, data)
  return row.id
}

interface Answer {
  records: { id: string; paths: { where: string; path: string }[] }[]
  hiddenCount: number
  leftOut: { id: string; kind: string; title: string; setAside: { where: string; rule: string }[] }[]
  says: string
}
async function ask(folder: string): Promise<Answer> {
  const reply = await app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Answer
}
const leftOutIds = (answer: Answer): string[] => answer.leftOut.map((one) => one.id).sort()

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
  aRepository(lane)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'gone-worker', name: 'Gone worker', role: 'worker', workArea: ['work'] })
  recipient = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'citing-recipient', name: 'Citing recipient', role: 'worker' })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-lane', root: lane, actor: { type: 'human', id: THE_PERSON } })
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'elsewhere', title: 'Another synthetic project' })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('a relative path in prose', () => {
  const folder = `${THE_TEST_FIXTURE_ROOT}/sandboxes/w13s/out/run-one`
  /** How many more records the door counts while one record in another project says `text`, which is then deleted. */
  async function countedWith(text: string): Promise<number> {
    const before = (await ask(folder)).hiddenCount
    const id = aRecord('Synthetic citation', { blocks: [{ type: 'text', text }] }, 'elsewhere')
    const { hiddenCount } = await ask(folder)
    t.api.deleteRecord(id, t.api.HUMAN)
    return hiddenCount - before
  }

  it('counts in another project and in the message centre', async () => {
    expect((await ask(folder)).hiddenCount).toBe(0)
    aRecord('Synthetic other-project citation', { blocks: [{ type: 'text', text: 'The log is out/run-one/start.log.' }] }, 'elsewhere')
    const message = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'message', title: 'Synthetic cited log', actor: { type: 'agent', id: 'gone-worker' },
      data: { body: 'Read run-one/start.log first.', to: [{ kind: 'agent', id: recipient }] } })
    expect(message.workspaceId).toBe('message-centre')
    expect((await ask(folder)).hiddenCount).toBe(2)
  })

  it.each([
    'Kept in ./out/run-one',
    'Kept in ../out/run-one/start.log',
    'Kept in ~/w13s/out/run-one.',
    'Kept in w13s/out/run-one, with nothing else.',
    `Kept in "${THE_TEST_FIXTURE_ROOT}/sandboxes/w13s/out/run-one"`,
  ])('counts %j', async (text) => {
    expect(await countedWith(text)).toBe(1)
  })

  it.each([
    'Another sandbox keeps w14x/out/run-one/start.log.',
    'The round run-one ended.',
    'It was run-one.',
    `Another folder is ${THE_TEST_FIXTURE_ROOT}/other/out/run-one/start.log.`,
    'A longer name: rerun-one/start.log.',
    'A neighbour: out/run-one-two/start.log.',
    `A neighbour: ${THE_TEST_FIXTURE_ROOT}/sandboxes/w13s/out/run-one-two`,
  ])('does not count %j', async (text) => {
    expect(await countedWith(text)).toBe(0)
  })
})

describe('an ended run that worked in the folder', () => {
  it('has its own session left out once it ended, and named with its rule; a file block inside is listed beside it', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/session-one`
    const run = await aRun(folder)
    const running = await ask(folder)
    expect(running).toMatchObject({ records: [], hiddenCount: 1, leftOut: [] })
    endedAs(run, 'crashed')
    const ended = await ask(folder)
    expect(ended).toMatchObject({ records: [], hiddenCount: 0 })
    expect(ended.leftOut).toEqual([{ id: run, kind: 'session', title: 'Synthetic run',
      setAside: [{ where: 'data.workingDirectory', rule: `run ${run} has ended (crashed) and this folder is its working directory` }] }])
    expect(ended.says).toContain('leftOut lists 1 readable record that names it only in places a rule sets aside.')
    const report = aRecord('Synthetic evidence', { blocks: [{ id: 'evidence', type: 'file', path: `${folder}/evidence.txt` }] })
    const withTheFile = await ask(folder)
    expect(withTheFile.records.map((one) => one.id)).toEqual([report])
    expect(leftOutIds(withTheFile)).toEqual([run])
    expect(withTheFile.hiddenCount).toBe(0)
  })

  it('counts its session when the session names the folder in other words too', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/session-two`
    const run = await aRun(folder, { doing: `Notes are kept in ${folder}/notes.txt.` })
    endedAs(run, 'crashed')
    expect(await ask(folder)).toMatchObject({ records: [], hiddenCount: 1, leftOut: [] })
  })

  it('has the start lines about it left out once it ended; the same lines count while it runs', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/started-one`
    const run = await aRun(folder)
    const before = await aRun(folder)
    endedAs(before, 'paused')
    const starter = await aRun(`${THE_TEST_FIXTURE_ROOT}/worktrees/the-starter`)
    writeDataBypassingTheGate(t, starter, { ...t.api.getRecord(starter)!.data, workerRuns: { 'gone-worker': {
      state: 'started', handle: 'gone-worker', started: { at: '2026-10-17 15:00:00', run, runKeyId: 'synthetic-key' },
      starting: { at: '2026-10-17 14:59:00', cutSays: `The worktree ${folder} was there already, so it is used as it stands.` },
      launcher: { at: '2026-10-17 15:30:00', ok: true, says: `The launcher started a run in ${folder}.` },
    } } })
    writeDataBypassingTheGate(t, before, { ...t.api.getRecord(before)!.data, nextRound: {
      state: 'started', started: { at: '2026-10-17 15:00:00', run, runKeyId: 'synthetic-key' },
      launcher: { at: '2026-10-17 15:30:00', ok: true, says: `The round launcher started the next round in ${folder}.` },
    } })
    const running = await ask(folder)
    expect(leftOutIds(running)).toEqual([])
    expect(running.hiddenCount).toBe(3)
    endedAs(run, 'crashed')
    const ended = await ask(folder)
    expect(ended.hiddenCount).toBe(0)
    expect(leftOutIds(ended)).toEqual([run, before, starter].sort())
    const why = (id: string) => ended.leftOut.find((one) => one.id === id)!.setAside
    const aboutTheRun = `a start line about run ${run}, which has ended (crashed) and worked in this folder`
    expect(why(starter)).toEqual([
      { where: 'data.workerRuns.gone-worker.starting.cutSays', rule: aboutTheRun },
      { where: 'data.workerRuns.gone-worker.launcher.says', rule: aboutTheRun },
    ])
    expect(why(before)).toEqual([
      { where: 'data.workingDirectory', rule: `run ${before} has ended (paused) and this folder is its working directory` },
      { where: 'data.nextRound.launcher.says', rule: aboutTheRun },
    ])
  })

  it('counts a start line about another run, and another field of the same entry', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/started-two`
    const run = await aRun(folder)
    endedAs(run, 'crashed')
    const other = await aRun(`${THE_TEST_FIXTURE_ROOT}/worktrees/another-run`)
    endedAs(other, 'crashed')
    const aboutAnother = await aRun(`${THE_TEST_FIXTURE_ROOT}/worktrees/starter-two`)
    writeDataBypassingTheGate(t, aboutAnother, { ...t.api.getRecord(aboutAnother)!.data, workerRuns: { 'gone-worker': {
      state: 'started', handle: 'gone-worker', started: { at: '2026-10-17 15:00:00', run: other, runKeyId: 'synthetic-key' },
      launcher: { at: '2026-10-17 15:30:00', ok: true, says: `The launcher started a run in ${folder}.` },
    } } })
    const anotherField = await aRun(`${THE_TEST_FIXTURE_ROOT}/worktrees/starter-three`)
    writeDataBypassingTheGate(t, anotherField, { ...t.api.getRecord(anotherField)!.data, workerRuns: { 'gone-worker': {
      state: 'started', handle: 'gone-worker', started: { at: '2026-10-17 15:00:00', run, runKeyId: 'synthetic-key' },
      launcher: { at: '2026-10-17 15:30:00', ok: true, says: `The launcher started a run in ${folder}.` },
      process: { row: null, says: `No open process row was found for the run in ${folder}.` },
    } } })
    const answer = await ask(folder)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(2)
  })
})

describe('an ended run\'s check checkout', () => {
  const ASKED = { askedOf: 'synthetic-inspector' }
  const BY = { kind: 'agent', id: 'synthetic-inspector' }
  const THE_SECRETARY = { kind: 'agent', id: 'synthetic-secretary' }
  const EXECUTION = { session: 'synthetic-check-session', log: 'synthetic-check.log', model: 'synthetic-model', minutes: 30 }
  const ENDED = { ...EXECUTION, endedAt: '2026-10-17 16:30:00' }
  const RELEASED = { by: BY, how: 'an inspector', at: '2026-10-17 16:31:00' }
  let runs = 0

  /** A run that ended finished in its own folder, with `check` in theCheck and `verdicts` on the run, as their doors store them. */
  async function aCheckedRun(check: Record<string, unknown>, verdicts: Record<string, unknown> = {}): Promise<{ folder: string; run: string }> {
    runs += 1
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/checked-${String(runs)}`
    const run = await aRun(folder)
    writeDataBypassingTheGate(t, run, { ...t.api.getRecord(run)!.data, state: 'finished', ...verdicts,
      theCheck: { askedAt: '2026-10-17 16:00:00', ...check, checkout: { directory: folder, cutFrom: 'main' } } })
    return { folder, run }
  }

  it.each([
    ['no check was asked of it', {}, {}, 'no check was asked of it (its theCheck has no askedOf)'],
    ['its check is confirmed', { ...ASKED, execution: ENDED }, { released: RELEASED,
      confirmed: { by: { kind: 'person', id: THE_PERSON }, at: '2026-10-17 16:40:00', because: 'Synthetic confirmation.' } }, 'its check is settled: confirmed'],
    ['its crashed check was closed unchecked', { ...ASKED, execution: { ...ENDED, ending: 'no-verdict' } }, {
      closedUnchecked: { by: THE_SECRETARY, at: '2026-10-17 16:40:00', because: 'Synthetic closure.' } }, 'its check is settled: closed unchecked'],
    ['the run was superseded', { ...ASKED, execution: ENDED, superseded: { by: 'synthetic-later-run', byWhom: THE_SECRETARY,
      at: '2026-10-17 16:40:00', because: 'Synthetic later run.' } }, {}, 'its check is settled: the run was superseded'],
  ] as const)('is set aside with its session when %s, and the answer names the settlement', async (_case, check, verdicts, settled) => {
    const { folder, run } = await aCheckedRun(check, verdicts)
    const answer = await ask(folder)
    expect(answer).toMatchObject({ records: [], hiddenCount: 0 })
    expect(answer.leftOut).toEqual([{ id: run, kind: 'session', title: 'Synthetic run', setAside: [
      { where: 'data.workingDirectory', rule: `run ${run} has ended (finished) and this folder is its working directory` },
      { where: 'data.theCheck.checkout.directory', rule: `run ${run} has ended (finished) and this folder is its working directory; ${settled}` },
    ] }])
  })

  it.each([
    ['its check was asked and has not started', { ...ASKED }, {}],
    ['its check is running', { ...ASKED, execution: EXECUTION }, {}],
    ['its check crashed: the execution ended with no verdict', { ...ASKED, execution: { ...ENDED, ending: 'no-verdict', failed: 'Synthetic crash.' } }, {}],
    ['its check was released and not confirmed', { ...ASKED, execution: ENDED }, { released: RELEASED }],
    ['its check was refused', { ...ASKED, execution: ENDED }, { refused: { by: BY, at: '2026-10-17 16:31:00', missing: ['Synthetic missing proof.'], chapter: 5 } }],
  ] as const)('counts its session when %s', async (_case, check, verdicts) => {
    const { folder } = await aCheckedRun(check, verdicts)
    expect(await ask(folder)).toMatchObject({ records: [], hiddenCount: 1, leftOut: [] })
  })

  it('counts another run\'s session whose check names the folder as its checkout', async () => {
    const { folder, run } = await aCheckedRun({})
    const other = await aRun(`${THE_TEST_FIXTURE_ROOT}/worktrees/another-checked-run`)
    writeDataBypassingTheGate(t, other, { ...t.api.getRecord(other)!.data, state: 'finished',
      theCheck: { askedAt: '2026-10-17 16:00:00', checkout: { directory: folder, cutFrom: 'main' } } })
    const answer = await ask(folder)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(1)
  })
})

describe('an ended run\'s own seal', () => {
  it('is left out while a branch of the lane contains the sealed commit, and the answer names the branch', async () => {
    const { at, branch } = aWorktree(lane, 'on-a-branch')
    const sealed = commit(at, 'a from the run\n')
    const run = await aRun(at)
    const seal = await finished(run)
    const check = t.api.getRecord(run)!.data['theCheck'] as { askedOf?: string; checkout: { directory: string } }
    expect(check.checkout.directory).toBe(at)
    expect(check.askedOf).toBeUndefined()
    const answer = await ask(at)
    expect(answer).toMatchObject({ records: [], hiddenCount: 0 })
    expect(leftOutIds(answer)).toEqual([run, seal].sort())
    expect(answer.leftOut.find((one) => one.id === seal)).toEqual({ id: seal, kind: 'sealed_tip', title: `Submitted work for ${run}`, setAside: [{
      where: 'data.seal.git.directory',
      rule: `the seal of run ${run}, which has ended (finished) and worked in this folder; branch ${branch} of ${lane} contains its sealed commit ${sealed}`,
    }] })
    expect(answer.says).toContain('leftOut lists 2 readable records that name it only in places a rule sets aside.')
  })

  it('counts when no branch contains the sealed commit', async () => {
    const { at } = aWorktree(lane, 'detached', true)
    commit(at, 'a from a detached run\n')
    const run = await aRun(at)
    await finished(run)
    const answer = await ask(at)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(1)
  })

  it('counts when git cannot answer, because the lane does not hold the sealed commit', async () => {
    const clone = join(made, 'never-fetched')
    git(made, 'clone', '-q', lane, clone)
    git(clone, 'config', 'user.email', 'fixture@example.invalid')
    git(clone, 'config', 'user.name', 'Synthetic named-inside fixture')
    const { at } = aWorktree(clone, 'not-fetched')
    commit(at, 'a that never reached the lane\n')
    const run = await aRun(at)
    await finished(run)
    const answer = await ask(at)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(1)
  })

  // LAST: it registers a second repository, so no seal after it is read anywhere.
  it('counts when no repository is chosen, because the project has two', async () => {
    const { at } = aWorktree(lane, 'two-repositories')
    commit(at, 'a from a run while two repositories are registered\n')
    const run = await aRun(at)
    await finished(run)
    const other = join(made, 'other-repository')
    aRepository(other)
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-other', root: other, actor: { type: 'human', id: THE_PERSON } })
    const answer = await ask(at)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(1)
  })
})
