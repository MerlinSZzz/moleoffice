// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONFLICT NO RULE JOINS GOES TO THE ENTRY'S OWN SUPERVISOR, in tier 2 of the owner's decision
 * , round A, xqGNR20SQ9vO. Nothing of it is live: the setting
 * MOLE_OFFICE_CONFLICT_RESOLVING is off by default.
 *
 * Part 1, the state and the setting. `resolving` is a merge state after `integrating`. An entry in it has left its
 * lane, so the queue goes on; it waits on its own supervisor for one hour; it may still be withdrawn, by the
 * waiting-only withdrawal too; and the merge tool does not move it.
 *
 * Part 2, the four places. With the setting on, a conflict no rule joins sends a git entry to resolving, out of its
 * lane, wherever the queue finds it: at the pin (`cannotJoin`, and `rebaseStopped`), after another entry lands
 * (`earlyConflicts`, by its lines or by the rebase tried early), and at the entry's turn (the `conflict` step). The
 * entry holds the conflict in the words its bounce would have used, and the moment its supervisor's hour started. With
 * the setting off, each place bounces as before. A files entry has no commits to resolve, so it bounces either way.
 * The entry also holds whom the office asked, `asked` (round B, part 7): the author here holds a worker's card, so no
 * agent may hand a resolution over, no brief is written, and the one message that asks goes to the author alone.
 * tests/the-office-asks-a-supervisor-to-resolve.test.ts proves the brief and the message. The hour is counted by
 * `theHourAfter`, the one rule 13q's main-suite fix round counts its own hour by.
 *
 * Part 4, the hand-over: door (a), `POST /api/merge-queue/<id>/resolution` with `{"workingDirectory"}`. The entry's
 * own line knocks: the run's agent, that agent's starter, the run's own starter, or the person, and never a worker. The
 * office reads the folder's HEAD itself, and records the hashes of the files that commit changes against the main the
 * conflict met. It accepts only while the entry is resolving and inside its hour, and writes the field `resolution`
 * with the mark that asks for the merge tool, whose check of it round B builds (tests/the-merge-tool-checks-a-resolution.test.ts
 * and tests/the-office-moves-a-checked-resolution.test.ts). Each refusal has its own case. The hand-over may declare
 * the supervisor's own test run as `tests`; only an agent of the line with its own key declares one, it is recorded as
 * declared with who and when, and a later hand-over without one drops it (XHY2fVFG3Qq8, answer 3). Its last case
 * is the merge queue page's (XHY2fVFG3Qq8, answer 7; N9xbH7cM6HPB and EVF_Cbdy1FKV): GET /api/merge-queue, asked
 * for the page's own list of states, sends a resolving entry last in its lane, and the page draws its row from that
 * reply waiting, then with a resolution handed over, then refused, with no status number on it. A page that does not
 * ask for resolving entries turns it red, and so does a row that says nothing of them. The page's pictures draw a reply
 * made up for them, and this case is what proves the server sends that row.
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout and removed
 * after, a files entry's folder is made under the temporary directory and removed after, the records are filed as
 * fixtures, and nothing reaches the live server. Part 1's database case puts a submitted entry into resolving by
 * writing its stored state directly, because what it reads does not depend on how the entry got there. Part 4's
 * entries reach resolving by the conflict step. Its clean copies are clones made under `.logs/` and removed after; its
 * folder that is no git checkout is made under the temporary directory, outside every checkout. Its broken entry is
 * broken by a direct write of the stored field, because no door writes one, and its hour's end is reached by setting
 * the test's clock, not by waiting.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { SETTINGS } from '../src/config/settings.mjs'
import { mainSuiteFixDeadline } from '../src/shared/main-suite-fix.ts'
import { ABSENT, MERGE_STATES, MERGE_STATE_SPECS, theMoveAStepMakes } from '../src/shared/merge-queue.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import { clockStamp, localStamp, momentOfAnInstant, theClockZone, theHourAfter } from '../src/shared/time.ts'
import { STATE_MEANING } from '../src/shared/work.ts'
import { englishWords } from '../src/shared/words/joined.ts'

const THE_SETTING = 'MOLE_OFFICE_CONFLICT_RESOLVING'

describe('part 1: the resolving state and its setting', () => {
  it("comes after integrating, has left its lane, is not final, may be withdrawn, and is not the merge tool's to move", () => {
    expect(MERGE_STATES.indexOf('resolving' as never)).toBe(MERGE_STATES.indexOf('integrating') + 1)
    expect(MERGE_STATE_SPECS['resolving' as never]).toEqual({
      means: 'Resolving. Its commits conflict with the main world in a way no rule joins, or a test is red only with it, and its own supervisor is asked to resolve the conflict or fix the test. It has left its lane, so the queue goes on.',
      waitsOn: 'its own supervisor, who resolves the conflict or fixes the red test within the time set for resolving a conflict on the Gates panel',
      occupiesTheLane: false,
      final: false,
      mayBeWithdrawn: true,
      theMergeToolActs: false,
    })
    // The office is carrying it through a bounded hour, as it carries every live entry, so nobody is reminded of it.
    expect(STATE_MEANING['resolving']).toBe('in_flight')
  })

  it('has a setting that is off unless it says 1, and is kept out of .env.example with its reason', async () => {
    const setting = SETTINGS.find((one) => one.name === THE_SETTING)
    expect(setting).toMatchObject({ kind: 'flag', fallback: '0', inTemplate: false })
    expect(setting?.notInTemplateBecause).toBe('Dormant queue wiring; nothing goes live without the owner.')
    const { conflictResolvingIsOn } = await import('../src/config/conflict-resolving.mjs')
    expect(conflictResolvingIsOn({})).toBe(false)
    expect(conflictResolvingIsOn({ [THE_SETTING]: '0' })).toBe(false)
    expect(conflictResolvingIsOn({ [THE_SETTING]: '1' })).toBe(true)
  })
})

describe('part 1: a resolving entry in the office', () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let base: string
  const made: string[] = []
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
    const r = await app.inject({ method, url, headers: asPerson, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any> }
  }
  function git(...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, HOME: root } }).trim() }
  function rawData(id: string, data: Record<string, unknown>) { t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id) }
  function sealedRun() {
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run whose entry conflicts', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgent: 'resolve-author', workingDirectory: root, cutFrom: base } })
    t.api.patchRecord(run.id, { dataPatch: { state: 'finished' } }, person)
    const sealId = t.api.getRecord(run.id)!.data['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string } }
    writeAVerdictAsItsDoorWould(t, run.id, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-17 00:40:00', how: 'an inspector', check: 'synthetic-check', read: { sealId, sealHash: seal.hash, worktree: root, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
    return run.id
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    mkdirSync('.logs', { recursive: true })
    root = mkdtempSync(join(process.cwd(), '.logs', 'resolving-'))
    made.push(root)
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic resolving fixture')
    mkdirSync(join(root, 'work')); writeFileSync(join(root, 'work', 'a.txt'), 'before\n'); git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline')
    base = git('rev-parse', 'HEAD')
    git('switch', '-q', '-c', 'work')
    writeFileSync(join(root, 'work', 'a.txt'), 'after\n')
    mkdirSync(join(root, 'drizzle')); writeFileSync(join(root, 'drizzle', '9999_synthetic.sql'), '-- Synthetic migration, so the entry needs a press.\n')
    mkdirSync(join(root, 'drizzle', 'meta'))
    writeFileSync(join(root, 'drizzle', 'meta', '_journal.json'), JSON.stringify({
      version: '7', dialect: 'sqlite',
      entries: [{ idx: 9999, version: '6', when: 200, tag: '9999_synthetic', breakpoints: true }],
    }, null, 2) + '\n')
    git('add', '.'); git('commit', '-q', '-m', 'Synthetic work that conflicts')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: 'resolve-fixture', root, actor: { ...person, provedBy: 'the-person-key' } })
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'resolve-author', name: 'Synthetic author whose entry conflicts', workArea: ['work', 'drizzle'] } })
    expect(registered.statusCode, registered.body).toBe(201)
  })
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it('is read outside its lane, says the press it still needs, and is taken by the waiting-only withdrawal', async () => {
    const queued = await call('POST', '/api/merge-queue', { run: sealedRun(), changeset: { adapter: 'git', repository: 'resolve-fixture' } })
    expect(queued.status, JSON.stringify(queued.body)).toBe(201)
    const id = queued.body.entry.id as string
    const { toolWanted: _asked, ...stored } = t.api.getRecord(id)!.data
    rawData(id, { ...stored, state: 'resolving' })

    const read = await call('GET', `/api/merge-queue/${id}`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.entry).toMatchObject({ state: 'resolving', occupies: null })
    expect(read.body.entry.waitsOn).toBe(
      `its own supervisor, who resolves the conflict or fixes the red test within the time set for resolving a conflict on the Gates panel; and before it can land, one press of POST /api/merge-queue/${id}/press-to-land ` +
        'by whoever holds the secretary card or by the person, because it touches 2 paths that land only after a press: drizzle/9999_synthetic.sql, drizzle/meta/_journal.json',
    )

    const withdrew = await call('POST', `/api/merge-queue/${id}/withdraw`, { because: 'Synthetic: the hour is not built yet.', waitingOnly: true })
    expect(withdrew.status, JSON.stringify(withdrew.body)).toBe(200)
    expect(t.api.getRecord(id)!.data['state']).toBe('withdrawn')
  })
})

describe('part 2: the hour after a moment, worked out in one place', () => {
  const NO_HOUR = { fromMs: null, untilMs: null, until: null }
  const CASES: [string | null, string][] = [
    ['2026-10-17T00:40:00.000+01:00', 'Europe/London'],
    ['2026-10-25T01:30:00+01:00', 'Europe/London'],
    ['2026-10-17T00:40:00.000+02:00', 'Europe/London'],
    ['2026-10-25 01:30:00', 'Europe/London'],
    ['2026-10-15 09:20:00', 'UTC'],
    [null, 'Europe/London'],
  ]

  it('is one hour on from a moment the zone can name once, and unknown otherwise', () => {
    expect(theHourAfter('2026-10-17T00:40:00.000+01:00', 'Europe/London', 60)).toEqual({
      fromMs: Date.parse('2026-10-16T23:40:00.000Z'),
      untilMs: Date.parse('2026-10-17T00:40:00.000Z'),
      until: '2026-10-17 01:40:00',
    })
    // ACROSS THE AUTUMN CHANGE an hour on from 01:30 in summer time is 01:30 again, in winter time.
    expect(theHourAfter('2026-10-25T01:30:00+01:00', 'Europe/London', 60).until).toBe('2026-10-25 01:30:00')
    // An offset the zone did not have at that moment names no moment on its clock.
    expect(theHourAfter('2026-10-17T00:40:00.000+02:00', 'Europe/London', 60)).toEqual(NO_HOUR)
    // A stamp with no offset, in the hour the zone has twice, could be either of two moments.
    expect(theHourAfter('2026-10-25 01:30:00', 'Europe/London', 60)).toEqual(NO_HOUR)
    expect(theHourAfter(null, 'Europe/London', 60)).toEqual(NO_HOUR)
  })

  it("is the hour 13q's main-suite fix round counts, so the two cannot drift apart", () => {
    for (const [stamp, zone] of CASES) {
      const hour = theHourAfter(stamp, zone, 60)
      expect(mainSuiteFixDeadline(stamp, zone), `${String(stamp)} in ${zone}`).toEqual({ endedAtMs: hour.fromMs, deadlineMs: hour.untilMs, deadline: hour.until })
    }
  })

  it('moves a conflict to resolving only when the server says it hands the conflict on', () => {
    expect(theMoveAStepMakes('integrating', { step: 'conflict', handsOnTheConflict: true })).toEqual({ move: 'to', state: 'resolving' })
    expect(theMoveAStepMakes('integrating', { step: 'conflict', handsOnTheConflict: false })).toEqual({ move: 'bounce', reason: 'conflict' })
    expect(theMoveAStepMakes('integrating', { step: 'conflict' })).toEqual({ move: 'bounce', reason: 'conflict' })
  })
})

describe('part 2: the four places hand the conflict on when the setting is on, and bounce as now when it is off', () => {
  let t: TestDb
  let app: FastifyInstance
  let main: string
  let filesArea: string
  let authorId: string
  const made: string[] = []
  const A = 'work/a.txt'
  const AUTHOR = 'resolve-two-author'
  const REPOSITORY = 'resolve-two'
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  const asTheOffice = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
  async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } }).trim() }
  function scratch(prefix: string) {
    mkdirSync('.logs', { recursive: true })
    const dir = mkdtempSync(join(process.cwd(), '.logs', `resolving-${prefix}-`))
    made.push(dir)
    return dir
  }
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

  /** A synthetic tree whose `work` branch changes work/a.txt with a line of its own, so two trees are two works. */
  function tree(): string {
    const dir = scratch('tree')
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic resolving fixture')
    mkdirSync(join(dir, 'work')); writeFileSync(join(dir, A), 'before\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, A), `before\nafter, from ${basename(dir)}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work that conflicts')
    return dir
  }

  interface Seal { id: string; commit: string; forkBase: string; files: { path: string; hash: string | null }[] }
  /** A finished run of the author in `dir`, sealed at its tip and released before its pin, as part 1's run is. */
  function aReleasedRun(dir: string): { run: string; seal: Seal } {
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run whose entry conflicts', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgent: AUTHOR, workingDirectory: dir, cutFrom: 'main' } })
    t.api.patchRecord(run.id, { dataPatch: { state: 'finished' } }, person)
    const sealId = t.api.getRecord(run.id)!.data['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: Seal['files'] } }
    writeAVerdictAsItsDoorWould(t, run.id, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-17 01:00:00', how: 'an inspector', check: 'synthetic-check', read: { sealId, sealHash: seal.hash, worktree: dir, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
    return { run: run.id, seal: { id: sealId, commit: seal.git.commit, forkBase: seal.git.forkBase, files: seal.git.files } }
  }
  const contentOf = (seal: Seal) => Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))

  /** A submitted git entry of a fresh released run. */
  async function aGitEntry(): Promise<{ id: string; run: string; seal: Seal }> {
    const released = aReleasedRun(tree())
    const queued = await call('POST', '/api/merge-queue', asPerson, { run: released.run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    return { id: String(queued.body.entry.id), ...released }
  }
  const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  async function entry(id: string): Promise<Record<string, any>> {
    const read = await call('GET', `/api/merge-queue/${id}`, asPerson)
    expect(read.status, read.raw).toBe(200)
    return read.body.entry
  }
  async function judged(id: string, seal: Seal) {
    const pinned = await step(id, 'pinned', { files: contentOf(seal) })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('judged')
  }
  function bouncesAbout(run: string): string[] {
    const rows = t.client.sqlite.prepare("SELECT title FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").all(run) as { title: string }[]
    return rows.map((row) => row.title).filter((title) => title.startsWith('Bounced'))
  }
  async function withTheSetting<T>(value: '0' | '1', run: () => Promise<T>): Promise<T> {
    const before = process.env[THE_SETTING]
    process.env[THE_SETTING] = value
    try { return await run() } finally { if (before === undefined) delete process.env[THE_SETTING]; else process.env[THE_SETTING] = before }
  }

  // THE WORDS EACH PLACE USES, as its bounce has used them: the handed-on entry keeps the same words.
  const ITS_TURN = `It could not be put on top of the main world: a conflict the tool does not resolve. Files: ${A}.`
  const LOG = '/synthetic/early-trial/conflict.log'
  const REBASE_SAYS = (mainAt: string) => `git rebase ${mainAt.slice(0, 12)} stopped on a conflict it does not resolve in ${A}. Synthetic.`
  const cannotJoin = (mainAt: string, commit: string) =>
    `Its commits were replayed onto main ${mainAt.slice(0, 12)} the way the queue's rebase puts them there, and commit ${commit.slice(0, 12)} stopped on a conflict: ` +
    `${A} at lines 1-5. The lines are those of the conflict markers git wrote in the replayed file. The entry was never tested: no suite ran on it.`
  const foundEarly = (mainAt: string) =>
    `${REBASE_SAYS(mainAt)} This was found early, while the entry waited: the queue's rebase, with its joins, was run on a scratch copy against main ` +
    `${mainAt.slice(0, 12)} before the entry's turn. The entry was never tested: no suite ran on it.`
  /** Why no brief is written for this author: it holds a worker's card, so it may not hand a resolution over. */
  const noAgent = () => `No agent told of this entry's end (${authorId}) may hand a resolution over: each is retired or holds a worker's card. No brief was written.`
  /** What the office says when it hands a conflict on: the moment the hour started, and whom it asked and how. */
  const itWaits = (since: string, message: string) =>
    `It now waits for its own supervisor to resolve the conflict, within 60 minutes of ${since.slice(0, 19).replace('T', ' ')}. ` +
    `${noAgent()} It asked in message ${message}.`

  /**
   * THE ENTRY WAS HANDED ON: resolving, out of its lane, never bounced and nobody told of a bounce, holding the conflict
   * in its bounce's words and the moment its hour started, read between `before` and `after`, and whom the office asked:
   * no agent by name, and the author in one message the office wrote. Answers what the office said of its wait.
   */
  async function handedOn(one: { id: string; run: string }, conflict: Record<string, unknown>, says: string, before: number, after: number): Promise<string> {
    const read = await entry(one.id)
    expect(read).toMatchObject({ state: 'resolving', occupies: null })
    expect(read.machine.bounced).toBeUndefined()
    expect(bouncesAbout(one.run)).toEqual([])
    const { since, asked, ...held } = read.machine.resolving as { since: string; timeZone: string; asked: { message: string } }
    expect(held).toEqual({ ...conflict, says, timeZone: theClockZone(), minutes: 60 })
    const at = momentOfAnInstant(since)
    expect(at).not.toBeNull()
    expect(at!).toBeGreaterThanOrEqual(before)
    expect(at!).toBeLessThanOrEqual(after)
    expect(asked).toEqual({ noBrief: noAgent(), message: expect.any(String) })
    const message = t.api.getRecord(asked.message)!
    expect(message.kind).toBe('message')
    expect(message.data).toMatchObject({
      notice: 'askedToResolve',
      to: [{ kind: 'agent', id: authorId }],
      aboutRun: one.run,
      askedToResolve: { entry: one.id, files: conflict['files'], brief: null, agent: null, until: new Date(theHourAfter(since, theClockZone(), 60).untilMs!).toISOString() },
    })
    return itWaits(since, asked.message)
  }
  /** The entry bounced as it always has, with the same words, and holds nothing of a hand-on. */
  async function bounced(id: string, conflict: Record<string, unknown>, says: string) {
    const read = await entry(id)
    expect(read).toMatchObject({ state: 'bounced', occupies: null })
    expect(read.machine.bounced).toMatchObject({ reason: 'conflict', ...conflict, says })
    expect(read.machine.resolving).toBeUndefined()
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    main = realpathSync(scratch('main'))
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root: main, actor: { ...person, provedBy: 'the-person-key' } })
    const registered = await call('POST', '/api/agents/started', asPerson, { handle: AUTHOR, name: 'Synthetic author whose entries conflict', workArea: ['work'] })
    expect(registered.status, registered.raw).toBe(201)
    authorId = String(registered.body['agent'].id)
    // A FILES ENTRY LANDS ONLY INSIDE ITS AGENT'S FILES AREA, and never inside a git working tree such as this checkout.
    filesArea = realpathSync(mkdtempSync(join(tmpdir(), 'resolving-files-area-')))
    made.push(filesArea)
    const area = await call('POST', `/api/participants/agent/${AUTHOR}/files-area`, asPerson, { filesArea: [filesArea], because: 'the files entry of this test lands here' })
    expect(area.status, area.raw).toBe(200)
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE FOR THE NEXT ONE. A landing entry cannot be withdrawn, so main moves first.
  afterEach(async () => {
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(main)}`, asPerson)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder === null || holder === undefined) return
    if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
    await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })
  })
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  const countedConflicts = () => (t.client.sqlite.prepare("SELECT sum(would_stop) AS n FROM gate_counts WHERE gate = 'conflict-resolving'").get() as {n: number | null}).n ?? 0
  const theConflictsCountedToday = () => {
    const row = t.client.sqlite.prepare("SELECT would_stop AS n FROM gate_counts WHERE gate = 'conflict-resolving' AND day = ?").get(localStamp(new Date()).slice(0, 10)) as {n: number} | undefined
    return row?.n ?? 0
  }
  /**
   * A CONFLICT MET AFTER A RESOLUTION THE CHECK PASSED, with a stored hour whose start cannot be read: 01:30 in the
   * hour Europe/London has twice. The helper reads the earlier conflict's start instead of taking the clock, so the
   * hour it would count cannot be read.
   */
  function withAnHourThatCannotBeRead(id: string) {
    const data = t.api.getRecord(id)!.data
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({
      ...data,
      resolving: { files: [A], says: ITS_TURN, since: '2026-10-25 01:30:00', timeZone: 'Europe/London' },
      resolution: { checked: {} },
    }), id)
  }

  it('at the pin, a commit that cannot join main', async () => {
    const mainAt = 'a1'.repeat(20)
    const facts = (one: { seal: Seal }) => ({ files: contentOf(one.seal), cannotJoin: { mainAt, commit: one.seal.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] } })
    const on = await aGitEntry()
    const before = Date.now()
    const countBeforeOn = countedConflicts()
    const pinned = await withTheSetting('1', () => step(on.id, 'pinned', facts(on)))
    expect(countedConflicts()).toBe(countBeforeOn + 1)
    const after = Date.now()
    expect(pinned.status, pinned.raw).toBe(200)
    const waits = await handedOn(on, { files: [A], mainAt }, `${ITS_TURN} ${cannotJoin(mainAt, on.seal.commit)}`, before, after)
    expect(pinned.body.decided).toBe(`${cannotJoin(mainAt, on.seal.commit)} ${waits}`)

    const off = await aGitEntry()
    const countBeforeOff = countedConflicts()
    const refused = await withTheSetting('0', () => step(off.id, 'pinned', facts(off)))
    expect(countedConflicts()).toBe(countBeforeOff + 1)
    expect(refused.status, refused.raw).toBe(200)
    await bounced(off.id, { files: [A], mainAt }, `${ITS_TURN} ${cannotJoin(mainAt, off.seal.commit)}`)
  })

  it("at the pin, the queue's rebase stopped early", async () => {
    const mainAt = 'b2'.repeat(20)
    const facts = (one: { seal: Seal }) => ({ files: contentOf(one.seal), rebaseStopped: { mainAt, files: [A], log: LOG, says: REBASE_SAYS(mainAt) } })
    const on = await aGitEntry()
    const before = Date.now()
    const countBeforeOn = countedConflicts()
    const pinned = await withTheSetting('1', () => step(on.id, 'pinned', facts(on)))
    expect(countedConflicts()).toBe(countBeforeOn + 1)
    const after = Date.now()
    expect(pinned.status, pinned.raw).toBe(200)
    const waits = await handedOn(on, { files: [A], log: LOG, mainAt }, `${ITS_TURN} ${foundEarly(mainAt)}`, before, after)
    expect(pinned.body.decided).toBe(`${foundEarly(mainAt)} ${waits}`)

    const off = await aGitEntry()
    const countBeforeOff = countedConflicts()
    expect((await withTheSetting('0', () => step(off.id, 'pinned', facts(off)))).status).toBe(200)
    expect(countedConflicts()).toBe(countBeforeOff + 1)
    await bounced(off.id, { files: [A], log: LOG, mainAt }, `${ITS_TURN} ${foundEarly(mainAt)}`)
  })

  it('at the pin, a conflict whose hour cannot be read is refused, and the count is kept', async () => {
    const one = await aGitEntry()
    withAnHourThatCannotBeRead(one.id)
    const mainAt = 'd4'.repeat(20)
    const countBefore = theConflictsCountedToday()
    const refused = await withTheSetting('1', () => step(one.id, 'pinned', {
      files: contentOf(one.seal),
      cannotJoin: { mainAt, commit: one.seal.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] },
    }))
    expect(refused.status, refused.raw).toBe(500)
    expect(theConflictsCountedToday()).toBe(countBefore + 1)
    expect(refused.body['error']).toBe(`Merge entry ${one.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken. The conflict was counted, and the count is kept. The office wrote no brief and sent no asking message, and the entry did not move.`)
    expect(t.api.getRecord(one.id)!.data['state']).toBe('submitted')
  })

  it('after another entry lands, a waiting entry that cannot join the new main, by its lines or by the rebase tried early', async () => {
    async function aLanding(setting: '0' | '1') {
      const byLines = await aGitEntry()
      await judged(byLines.id, byLines.seal)
      const early = await aGitEntry()
      await judged(early.id, early.seal)
      const lander = await aGitEntry()
      await judged(lander.id, lander.seal)
      for (const [name, facts] of [
        ['integrating', {}],
        ['integrated', { result: lander.seal.commit, mainAt: lander.seal.forkBase, files: contentOf(lander.seal) }],
        ['tested', { green: true, log: '/synthetic/suite.log', ran: 1, passed: 1 }],
        ['landing', { mainAt: lander.seal.forkBase }],
      ] as const) expect((await step(lander.id, name, facts)).status, name).toBe(200)
      const mainAfter = lander.seal.commit
      const before = Date.now()
      const countBefore = countedConflicts()
      const landed = await withTheSetting(setting, () => step(lander.id, 'landed', {
        mainAfter,
        earlyConflicts: [
          { entry: byLines.id, tip: byLines.seal.commit, files: [A], commit: byLines.seal.commit, lines: [{ path: A, ranges: '1-5' }] },
          { entry: early.id, tip: early.seal.commit, files: [A], rebaseStopped: { files: [A], log: LOG, says: REBASE_SAYS(mainAfter) } },
        ],
      }))
      const after = Date.now()
      expect(landed.status, landed.raw).toBe(200)
      expect(landed.body.entry.state).toBe('merged')
      expect(countedConflicts()).toBe(countBefore + 2)
      return { byLines, early, mainAfter, told: String(landed.body.entry.machine.told.says), before, after }
    }

    const on = await aLanding('1')
    const byLines = await handedOn(on.byLines, { files: [A], mainAt: on.mainAfter }, `${ITS_TURN} ${cannotJoin(on.mainAfter, on.byLines.seal.commit)}`, on.before, on.after)
    expect(on.told).toContain(`Merge entry ${on.byLines.id} cannot join the new main in ${A}, and was never tested. ${byLines}`)
    const early = await handedOn(on.early, { files: [A], log: LOG, mainAt: on.mainAfter }, `${ITS_TURN} ${foundEarly(on.mainAfter)}`, on.before, on.after)
    expect(on.told).toContain(`Merge entry ${on.early.id}: the queue's rebase, tried early on a scratch copy, stopped in ${A}, and it was never tested. ${early}`)

    const off = await aLanding('0')
    await bounced(off.byLines.id, { files: [A], mainAt: off.mainAfter }, `${ITS_TURN} ${cannotJoin(off.mainAfter, off.byLines.seal.commit)}`)
    expect(off.told).toContain(`Merge entry ${off.byLines.id} was sent back: it cannot join the new main in ${A}, and was never tested.`)
    await bounced(off.early.id, { files: [A], log: LOG, mainAt: off.mainAfter }, `${ITS_TURN} ${foundEarly(off.mainAfter)}`)
    expect(off.told).toContain(`Merge entry ${off.early.id} was sent back: the queue's rebase, tried early on a scratch copy, stopped in ${A}, and it was never tested.`)
  })

  it("at the entry's turn, the conflict step, which keeps only what the step said", async () => {
    const mainAt = 'c3'.repeat(20)
    async function atItsTurn(setting: '0' | '1', facts: Record<string, unknown>) {
      const one = await aGitEntry()
      await judged(one.id, one.seal)
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const before = Date.now()
      const countBefore = countedConflicts()
      const stepped = await withTheSetting(setting, () => step(one.id, 'conflict', facts))
      expect(countedConflicts()).toBe(countBefore + 1)
      const after = Date.now()
      expect(stepped.status, stepped.raw).toBe(200)
      return { one, decided: String(stepped.body.decided), before, after }
    }

    const told = await atItsTurn('1', { files: [A], mainAt, log: LOG, says: REBASE_SAYS(mainAt) })
    const waits = await handedOn(told.one, { files: [A], mainAt, log: LOG }, `${ITS_TURN} ${REBASE_SAYS(mainAt)}`, told.before, told.after)
    expect(told.decided).toBe(`Conflict in ${A}. ${waits}`)
    // NOTHING SAID BUT THE FILES: the bounce's "Resolve it in your sandbox and submit again" is a bounce's remedy, so it is not kept.
    const bare = await atItsTurn('1', { files: [A] })
    await handedOn(bare.one, { files: [A] }, ITS_TURN, bare.before, bare.after)

    const off = await atItsTurn('0', { files: [A] })
    await bounced(off.one.id, { files: [A] }, `${ITS_TURN} Resolve it in your sandbox and submit again.`)
  })

  it("at the entry's turn, a conflict whose hour cannot be read is refused, and the count is kept", async () => {
    const one = await aGitEntry()
    await judged(one.id, one.seal)
    expect((await step(one.id, 'integrating', {})).status).toBe(200)
    withAnHourThatCannotBeRead(one.id)
    const countBefore = theConflictsCountedToday()
    const refused = await withTheSetting('1', () => step(one.id, 'conflict', { files: [A], mainAt: 'e5'.repeat(20) }))
    const countAtRefusal = theConflictsCountedToday()
    const stateAtRefusal = t.api.getRecord(one.id)!.data['state']
    // THE ENTRY STILL HOLDS THE LANE, so it is taken back before the words are judged, and a wrong word cannot
    // hold the lane for the next case.
    expect((await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })).status).toBe(200)
    expect(refused.status, refused.raw).toBe(500)
    expect(countAtRefusal).toBe(countBefore + 1)
    expect(refused.body['error']).toBe(`Merge entry ${one.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken. The conflict was counted, and the count is kept. The office wrote no brief and sent no asking message, and the entry did not move.`)
    expect(stateAtRefusal).toBe('integrating')
  })

  it('bounces the conflict of a files entry with the setting on: it has no commits to resolve', async () => {
    const BYTES = 'Synthetic: the bytes a files entry lands.\n'
    const dir = tree()
    mkdirSync(join(dir, 'work', 'out', 'report-files'), { recursive: true })
    writeFileSync(join(dir, 'work', 'out', 'report-files', 'a.txt'), BYTES)
    git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic staged files')
    const released = aReleasedRun(dir)
    const root = realpathSync(mkdtempSync(join(filesArea, 'files-root-')))
    const operations = [{ op: 'add', path: 'report-files/a.txt', before: ABSENT, after: sha256(BYTES), source: 'synthetic: tests/a-conflict-no-rule-joins-goes-to-its-supervisor.test.ts' }]
    const queued = await call('POST', '/api/merge-queue', asPerson, { run: released.run, changeset: { adapter: 'files', root, stagedAt: realpathSync(join(dir, 'work', 'out')), operations } })
    expect(queued.status, queued.raw).toBe(201)
    const id = String(queued.body.entry.id)
    const content = { 'report-files/a.txt': sha256(BYTES) }
    const pinned = await step(id, 'pinned', { files: content, checker: { tool: 'tools/checks/files-changeset.mjs', decided: [{ path: 'report-files/a.txt', check: 'sha256', ok: true }], needsJudgment: [] } })
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('judged')
    expect((await step(id, 'integrating', {})).status).toBe(200)
    // The words the merge tool's files adapter sends when the folder does not hold what the entry expected.
    const says = 'The main world does not hold what the entry expected at report-files/a.txt. Synthetic.'
    const countBefore = countedConflicts()
    const stepped = await withTheSetting('1', () => step(id, 'conflict', { files: ['report-files/a.txt'], says }))
    expect(countedConflicts()).toBe(countBefore)
    expect(stepped.status, stepped.raw).toBe(200)
    const read = await entry(id)
    expect(read).toMatchObject({ state: 'bounced', occupies: null })
    expect(read.machine.bounced).toMatchObject({ reason: 'conflict', files: ['report-files/a.txt'] })
    expect(read.machine.resolving).toBeUndefined()
  })
})

describe('part 4: door (a), the hand-over of a resolution', () => {
  let t: TestDb
  let app: FastifyInstance
  let main: string
  const made: string[] = []
  const A = 'work/a.txt'
  const REPOSITORY = 'resolve-four'
  const ids: Record<string, string> = {}
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  const asTheOffice = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
  const asAgent = (handle: string) => ({ ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
  async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } }).trim() }
  function scratch(prefix: string) {
    mkdirSync('.logs', { recursive: true })
    const dir = mkdtempSync(join(process.cwd(), '.logs', `resolving-${prefix}-`))
    made.push(dir)
    return dir
  }
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
  const stored = (id: string) => t.api.getRecord(id)!.data
  function rawData(id: string, data: Record<string, unknown>) { t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id) }
  const knock = (id: string, headers: Record<string, string>, body: unknown) => call('POST', `/api/merge-queue/${id}/resolution`, headers, body)
  const unstarted = (id: string, headers: Record<string, string>, body: unknown) => call('POST', `/api/merge-queue/${id}/nobody-started`, headers, body)

  /** A synthetic tree whose `work` branch changes work/a.txt with a line of its own, so two trees are two works. */
  function tree(): { dir: string; mainAt: string } {
    const dir = scratch('tree')
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic resolving fixture')
    mkdirSync(join(dir, 'work')); writeFileSync(join(dir, A), 'before\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
    const mainAt = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, A), `before\nafter, from ${basename(dir)}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work that conflicts')
    return { dir, mainAt }
  }

  /**
   * A RESOLVING ENTRY: a finished run of `servedBy` in a fresh tree, sealed, released, submitted by the person, pinned,
   * integrating, and handed on by the conflict step with the setting on, at the tree's main when `withMainAt`.
   */
  async function aResolvingEntry(servedBy: string, more: { parentAttachment?: string; withMainAt?: false } = {}): Promise<{ id: string; dir: string; mainAt: string }> {
    const { dir, mainAt } = tree()
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run whose entry conflicts', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgent: servedBy, workingDirectory: dir, cutFrom: 'main', ...(more.parentAttachment === undefined ? {} : { parentAttachment: more.parentAttachment }) } })
    t.api.patchRecord(run.id, { dataPatch: { state: 'finished' } }, person)
    const sealId = t.api.getRecord(run.id)!.data['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; files: { path: string; hash: string | null }[] } }
    writeAVerdictAsItsDoorWould(t, run.id, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-17 01:30:00', how: 'an inspector', check: 'synthetic-check', read: { sealId, sealHash: seal.hash, worktree: dir, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
    const queued = await call('POST', '/api/merge-queue', asPerson, { run: run.id, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    const id = String(queued.body.entry.id)
    const step = (name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
    expect((await step('pinned', { files: Object.fromEntries(seal.git.files.map((one) => [one.path, one.hash ?? ABSENT])) })).status).toBe(200)
    expect((await step('integrating', {})).status).toBe(200)
    const before = process.env[THE_SETTING]
    process.env[THE_SETTING] = '1'
    try {
      const stepped = await step('conflict', { files: [A], ...(more.withMainAt === false ? {} : { mainAt }) })
      expect(stepped.status, stepped.raw).toBe(200)
    } finally { if (before === undefined) delete process.env[THE_SETTING]; else process.env[THE_SETTING] = before }
    expect(stored(id)['state']).toBe('resolving')
    return { id, dir, mainAt }
  }

  /** A CLEAN COPY: a clone of the entry's tree at the main the conflict met, with `content` committed in work/a.txt. */
  function aCleanCopy(dir: string, mainAt: string, content: string): { folder: string; commit: string } {
    const folder = realpathSync(scratch('clean-copy'))
    git(folder, 'clone', '-q', dir, '.'); git(folder, 'config', 'user.email', 'fixture@example.invalid'); git(folder, 'config', 'user.name', 'Synthetic resolving fixture')
    git(folder, 'switch', '-q', '--detach', mainAt)
    return { folder, commit: commitIn(folder, content) }
  }
  function commitIn(folder: string, content: string): string {
    mkdirSync(join(folder, 'work'), { recursive: true })
    writeFileSync(join(folder, A), content); git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic work that conflicts')
    return git(folder, 'rev-parse', 'HEAD')
  }

  /** A refusal writes nothing: the entry's stored data is what it was before the knock. */
  async function refused(id: string, headers: Record<string, string>, body: unknown, status: number, says: string) {
    const before = stored(id)
    const r = await knock(id, headers, body)
    expect(r.status, r.raw).toBe(status)
    expect(r.body['error']).toBe(says)
    expect(stored(id)).toEqual(before)
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    main = realpathSync(scratch('main'))
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root: main, actor: { ...person, provedBy: 'the-person-key' } })
    // THE LINE, as the secretary registers a supervisor and a supervisor registers its worker. A row that names no role reads as a worker.
    const started = async (by: Record<string, string>, handle: string, role?: string) => {
      // A SECRETARY REGISTERS NO WORK AREA: its card's rule refuses one, so this call leaves `workArea` out.
      const r = await call('POST', '/api/agents/started', by, { handle, name: `Synthetic ${handle}`, ...(role === 'secretary' ? {} : { workArea: ['work'] }), ...(role === undefined ? {} : { role }) })
      expect(r.status, r.raw).toBe(201)
      ids[handle] = String(r.body['agent'].id)
    }
    await started(asPerson, 'res4-starter', 'supervisor')
    await started(asAgent('res4-starter'), 'res4-supervisor', 'supervisor')
    await started(asAgent('res4-supervisor'), 'res4-worker')
    await started(asPerson, 'res4-parent', 'supervisor')
    await started(asPerson, 'res4-stranger', 'supervisor')
    await started(asPerson, 'res4-secretary', 'secretary')
  }, 60_000)
  afterAll(async () => { vi.useRealTimers(); await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it("is taken from the entry's own line, and writes one field with what the office read itself", async () => {
    const parentRun = t.api.createRecord({ kind: 'session', title: 'Synthetic run that started the work', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgent: 'res4-parent' } }).id
    const one = await aResolvingEntry('res4-supervisor', { parentAttachment: parentRun })
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved by the supervisor\n')
    const before = stored(one.id)
    const r = await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })
    expect(r.status, r.raw).toBe(200)
    const written = stored(one.id)
    // THE ONE FIELD, AND THE MARK THAT ASKS THE MERGE TOOL TO CHECK IT: the state writer sets the mark on every resolution that waits for its check.
    const { resolution, toolWanted, ...rest } = written
    expect(rest).toEqual(before)
    expect(toolWanted).toEqual({ since: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/) })
    expect(resolution).toEqual({
      commit: copy.commit,
      workingDirectory: copy.folder,
      mainAt: one.mainAt,
      files: [{ path: A, hash: sha256('before\nresolved by the supervisor\n'), mode: '100644' }],
      by: { kind: 'agent', id: ids['res4-supervisor'] },
      at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
    })
    expect(r.body['entry']).toMatchObject({ state: 'resolving', machine: { resolution } })
    expect(r.body['says']).toBe(
      `agent ${ids['res4-supervisor']} handed over the resolution of merge entry ${one.id}: commit ${copy.commit} in ${copy.folder}, which changes 1 file ` +
        `against main ${one.mainAt.slice(0, 12)}. The office read the commit itself and recorded each changed file's hash. ` +
        'The entry stays resolving, and the merge tool checks the resolution next.',
    )

    // THE AGENT'S STARTER, THE RUN'S OWN STARTER AND THE PERSON each hand over a newer commit, and each replaces the last.
    let last = resolution as { commit: string; at: string }
    for (const [headers, by] of [
      [asAgent('res4-starter'), { kind: 'agent', id: ids['res4-starter'] }],
      [asAgent('res4-parent'), { kind: 'agent', id: ids['res4-parent'] }],
      [asPerson, { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }],
    ] as const) {
      const commit = commitIn(copy.folder, `before\nresolved again by ${by.id}\n`)
      const again = await knock(one.id, headers, { workingDirectory: copy.folder })
      expect(again.status, again.raw).toBe(200)
      const now = stored(one.id)['resolution'] as { commit: string; at: string; by: unknown; files: unknown }
      expect(now).toMatchObject({ commit, by, files: [{ path: A, hash: sha256(`before\nresolved again by ${by.id}\n`), mode: '100644' }] })
      expect(again.body['says']).toContain(`It replaces the hand-over of commit ${last.commit.slice(0, 12)} at ${last.at}. `)
      last = now
    }
    expect(stored(one.id)['state']).toBe('resolving')
  })

  it('refuses anybody outside the line with 403, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved by a stranger\n')
    const run = stored(one.id)['run'] as string
    await refused(one.id, asAgent('res4-stranger'), { workingDirectory: copy.folder }, 403,
      `Only the agent run ${run} served, the agent that started it, the run's own starter, or the person may hand over the resolution of merge entry ${one.id}, and ${ids['res4-stranger']} is none of them. Nothing was written.`)
    await refused(one.id, asAgent('res4-nobody'), { workingDirectory: copy.folder }, 403,
      'Nothing is registered as "res4-nobody", so a resolution would name nobody as who handed it over. Nothing was written.')
  })

  it('refuses a worker with 403 even when the work is its own, and takes the same hand-over from its supervisor', async () => {
    const one = await aResolvingEntry('res4-worker')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    await refused(one.id, asAgent('res4-worker'), { workingDirectory: copy.folder }, 403,
      `Agent ${ids['res4-worker']} is a worker by its card, and a worker never hands over a resolution: the entry's own supervisor does, after it has judged the worker's work. Nothing was written.`)
    const bySupervisor = await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })
    expect(bySupervisor.status, bySupervisor.raw).toBe(200)
  })

  it('refuses a body that is not one absolute folder with 400, a typed commit too, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const asked = asAgent('res4-supervisor')
    for (const body of [{}, { workingDirectory: '' }, { workingDirectory: copy.folder, commit: copy.commit }]) {
      const before = stored(one.id)
      const r = await knock(one.id, asked, body)
      expect(r.status, r.raw).toBe(400)
      expect(stored(one.id)).toEqual(before)
    }
    await refused(one.id, asked, { workingDirectory: 'work/clean-copy' }, 400, 'The folder the resolution is in must be an absolute path, and "work/clean-copy" is not. Nothing was written.')
    await refused(one.id, asked, { workingDirectory: join(copy.folder, 'not-there') }, 400, `The folder the resolution is in, ${join(copy.folder, 'not-there')}, is not there on this machine. Nothing was written.`)
    await refused(one.id, asked, { workingDirectory: join(copy.folder, A) }, 400, `The folder the resolution is in, ${join(copy.folder, A)}, is not a directory. Nothing was written.`)
  })

  it('refuses an entry that is not resolving with 409, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const withdrew = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'Synthetic: the entry is taken back before its hand-over.' })
    expect(withdrew.status, withdrew.raw).toBe(200)
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 409,
      `Merge entry ${one.id} is withdrawn, and a resolution is handed over only while an entry is resolving. Nothing was written.`)
  })

  // ANSWER 5 OF MESSAGE XHY2fVFG3Qq8: the queue also records that nobody started a resolving entry's resolve brief, as the
  // secretary's watcher or the person tells it through POST /api/merge-queue/<id>/nobody-started. The six cases below prove
  // who may record it and for which entry, that a later record replaces the earlier and leaves the rest of `resolving` as it
  // was, that every other caller is refused before the body is read, that another project's entry is not found before the
  // caller is asked who it is, that the body must be one status from 400 to 599 with its words, and that nothing is
  // written on any refusal. Each was proved by mutation: A, the card check lets everybody
  // through; B, the route parses the body before who is knocking; C, the resolving state is not asked; D, the write really
  // drops the rest of `resolving` (nulling its other keys: dropping the spread alone cannot show up, because `write`
  // deep-merges the data patch); E, the replacement sentence is never said; F, the status's least value is 100; G, the
  // route does not look the entry up in the caller's project first (IzZNbA9s2v1M). Each mutation made its case
  // red, and the file was green again after each restore.
  it('records that nobody started the resolve brief, from the secretary or the person, and a later record replaces the earlier', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const before = stored(one.id)
    const first = await unstarted(one.id, asAgent('res4-secretary'), { status: 409, said: 'Synthetic: the next-round door refused the brief.' })
    expect(first.status, first.raw).toBe(200)
    const { resolving, ...rest } = stored(one.id)
    const { resolving: beforeResolving, ...beforeRest } = before
    expect(rest).toEqual(beforeRest)
    expect(resolving).toEqual({
      ...(beforeResolving as Record<string, unknown>),
      nobodyStarted: {
        by: { kind: 'agent', id: ids['res4-secretary'] },
        at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
        status: 409,
        said: 'Synthetic: the next-round door refused the brief.',
      },
    })
    expect(first.body['says']).toBe(
      `agent ${ids['res4-secretary']} recorded that nobody started the resolve brief of merge entry ${one.id}. ` +
        'The next-round door answered 409: Synthetic: the next-round door refused the brief.',
    )

    // THE PERSON REPLACES IT, and the rest of `resolving` is still what the conflict step wrote.
    const firstAt = (resolving as { nobodyStarted: { at: string } }).nobodyStarted.at
    const second = await unstarted(one.id, asPerson, { status: 503, said: 'Synthetic: the next-round door was not answering.' })
    expect(second.status, second.raw).toBe(200)
    const after = stored(one.id)['resolving'] as { since: string; nobodyStarted: { at: string; by: unknown; status: number; said: string } }
    expect(after.nobodyStarted).toEqual({
      by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
      status: 503,
      said: 'Synthetic: the next-round door was not answering.',
    })
    expect(after.since).toBe((beforeResolving as { since: string }).since)
    expect(second.body['says']).toBe(
      `person ${THE_TEST_OFFICES_OWNER.id} recorded that nobody started the resolve brief of merge entry ${one.id}. ` +
        'The next-round door answered 503: Synthetic: the next-round door was not answering. ' +
        `It replaces the record of ${firstAt}.`,
    )
    expect(stored(one.id)['state']).toBe('resolving')
  })

  it("refuses anybody else with 403 before it reads the body, the entry's own supervisor too, and writes nothing", async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const before = stored(one.id)
    const says = `Only whoever holds the secretary card, or the person, records that nobody started the resolve brief of merge entry ${one.id}. Nothing was written.`
    const good = { status: 409, said: 'Synthetic: the next-round door refused the brief.' }
    for (const [headers, body] of [
      [asAgent('res4-supervisor'), good],
      [asAgent('res4-stranger'), {}],
      [asAgent('res4-nobody'), good],
    ] as const) {
      const r = await unstarted(one.id, headers, body)
      expect(r.status, r.raw).toBe(403)
      expect(r.body['error']).toBe(says)
      expect(stored(one.id)).toEqual(before)
    }
  })

  it("refuses a stranger naming another project's entry with 404 before it asks who is knocking, and writes nothing", async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const before = stored(one.id)
    const elsewhere = await call('POST', '/api/workspaces', asPerson, { id: 'res4-elsewhere', title: 'Synthetic project of nobody here' })
    expect(elsewhere.status, elsewhere.raw).toBe(201)
    const r = await unstarted(one.id, { ...asAgent('res4-stranger'), 'x-mole-office-workspace': 'res4-elsewhere' }, { status: 409, said: 'Synthetic: the next-round door refused the brief.' })
    expect(r.status, r.raw).toBe(404)
    expect(r.body['error']).toBe(`"${t.api.getRecord(one.id)!.title}" is in another project.`)
    expect(stored(one.id)).toEqual(before)
  })

  it('refuses a body that is not one status from 400 to 599 and its words with 400, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const before = stored(one.id)
    for (const body of [
      {},
      { status: 409 },
      { said: 'Synthetic.' },
      { status: 200, said: 'Synthetic.' },
      { status: 600, said: 'Synthetic.' },
      { status: 409.5, said: 'Synthetic.' },
      { status: '409', said: 'Synthetic.' },
      { status: 409, said: '   ' },
      { status: 409, said: 'Synthetic.', more: 1 },
    ]) {
      const r = await unstarted(one.id, asPerson, body)
      expect(r.status, r.raw).toBe(400)
      expect(stored(one.id)).toEqual(before)
    }
  })

  it('refuses to record it for an entry that is not resolving, with 409', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const withdrew = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'Synthetic: the entry is taken back before the record of nobody starting its resolve brief.' })
    expect(withdrew.status, withdrew.raw).toBe(200)
    const before = stored(one.id)
    const r = await unstarted(one.id, asPerson, { status: 409, said: 'Synthetic: the next-round door refused the brief.' })
    expect(r.status, r.raw).toBe(409)
    expect(r.body['error']).toBe(`Merge entry ${one.id} is withdrawn, and that nobody started its resolve brief is recorded only while an entry is resolving. Nothing was written.`)
    expect(stored(one.id)).toEqual(before)
  })

  it('answers 500 with words for a resolving entry without its conflict, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const { resolving, ...withNone } = stored(one.id)
    rawData(one.id, withNone)
    const before = stored(one.id)
    const r = await unstarted(one.id, asPerson, { status: 409, said: 'Synthetic: the next-round door refused the brief.' })
    expect(r.status, r.raw).toBe(500)
    expect(r.body['error']).toBe(`Merge entry ${one.id} is resolving without the conflict it is resolving, which the merge queue writes before an entry can be resolving. The entry's record is broken, so nothing was written.`)
    expect(stored(one.id)).toEqual(before)
  })

  it("refuses once the entry's hour is over, from the hour's own end, and takes it until then", async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const { since, timeZone } = stored(one.id)['resolving'] as { since: string; timeZone: string }
    const hour = theHourAfter(since, timeZone, 60)
    expect(hour.untilMs).not.toBeNull()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(hour.untilMs!)
      await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 409,
        `The 60 minutes for merge entry ${one.id} ended at ${hour.until!}: a resolution is handed over within 60 minutes of the conflict, and that time is never started again. Nothing was written.`)
      vi.setSystemTime(hour.untilMs! - 1)
      const inTime = await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })
      expect(inTime.status, inTime.raw).toBe(200)
    } finally { vi.useRealTimers() }
  })

  it('answers 500 with words for a resolving entry whose hour cannot be read, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const says = `Merge entry ${one.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken, so nothing was written.`
    const { resolving, ...withNone } = stored(one.id)
    rawData(one.id, withNone)
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 500, says)
    // A STAMP WITH NO OFFSET IN THE HOUR THE ZONE HAS TWICE names two moments, so its hour has no one end.
    rawData(one.id, { ...withNone, resolving: { ...(resolving as object), since: '2026-10-25 01:30:00', timeZone: 'Europe/London' } })
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 500, says)
  })

  it('refuses when the conflict did not say which main it met, with 409', async () => {
    const one = await aResolvingEntry('res4-supervisor', { withMainAt: false })
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 409,
      `The conflict that sent merge entry ${one.id} to resolving did not say which main it met, so the office cannot tell which files a resolution changes. Nothing was written.`)
  })

  it('refuses a folder whose HEAD git cannot read, with 409', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const folder = realpathSync(mkdtempSync(join(tmpdir(), 'resolving-not-a-checkout-')))
    made.push(folder)
    const before = stored(one.id)
    const r = await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: folder })
    expect(r.status, r.raw).toBe(409)
    expect(String(r.body['error'])).toMatch(new RegExp(`^The office could not read the HEAD of ${folder} as a git commit: .+ Nothing was written\\.$`, 's'))
    expect(stored(one.id)).toEqual(before)
  })

  it('refuses a HEAD that does not stand on the main the conflict met, with 409', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    git(copy.folder, 'switch', '-q', '--orphan', 'elsewhere')
    const elsewhere = commitIn(copy.folder, 'resolved on nothing\n')
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 409,
      `Commit ${elsewhere} in ${copy.folder} does not stand on main ${one.mainAt}, where merge entry ${one.id} met its conflict, so it is not a resolution of that conflict. Nothing was written.`)
  })

  it('refuses a folder that does not hold the main the conflict met, with 409 and git\'s words', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const { resolving, ...rest } = stored(one.id)
    const unknown = 'd4'.repeat(20)
    rawData(one.id, { ...rest, resolving: { ...(resolving as object), mainAt: unknown } })
    const before = stored(one.id)
    const r = await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })
    expect(r.status, r.raw).toBe(409)
    expect(String(r.body['error'])).toMatch(new RegExp(`^The office could not tell whether commit ${copy.commit} in ${copy.folder} stands on main ${unknown}: .+ Nothing was written\\.$`, 's'))
    expect(stored(one.id)).toEqual(before)
  })

  /**
   * THREE DOOR CASES: a commit the office's git reader refuses is refused in the hand-over's own words, naming the
   * commit, the folder and the entry, and says nothing was written; who is knocking is asked before the body is read,
   * so a body the door refuses with 400 is a 403 from outside the line; and an entry whose run is not a record here
   * answers 500 with words. Proved by mutation: making the catch in `handOverAResolution` throw the reader's error
   * turns the first red; moving the body read above `whoHandsOverAResolution` in the route turns the second red;
   * answering 409 instead of 500 in `whoHandsOverAResolution` turns the third red.
   */
  it("refuses a commit the office's git reader refuses, in the hand-over's words, with 409", async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    git(copy.folder, 'update-index', '--add', '--cacheinfo', `160000,${one.mainAt},work/sub`)
    git(copy.folder, 'commit', '-q', '-m', 'Synthetic submodule')
    const commit = git(copy.folder, 'rev-parse', 'HEAD')
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 409,
      `The office could not read the files commit ${commit} in ${copy.folder} changes against main ${one.mainAt}, so the resolution of merge entry ${one.id} was not handed over: work/sub is a submodule, which this reader does not read. Nothing was written.`)
  })

  it('asks who knocks before it reads the body, so a broken body from outside the line is 403, not 400', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const run = stored(one.id)['run'] as string
    await refused(one.id, asAgent('res4-stranger'), {}, 403,
      `Only the agent run ${run} served, the agent that started it, the run's own starter, or the person may hand over the resolution of merge entry ${one.id}, and ${ids['res4-stranger']} is none of them. Nothing was written.`)
    const workers = await aResolvingEntry('res4-worker')
    await refused(workers.id, asAgent('res4-worker'), { workingDirectory: 'work/clean-copy' }, 403,
      `Agent ${ids['res4-worker']} is a worker by its card, and a worker never hands over a resolution: the entry's own supervisor does, after it has judged the worker's work. Nothing was written.`)
  })

  it("answers 500 with words when the entry's run is not a record here, and writes nothing", async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    rawData(one.id, { ...stored(one.id), run: 'NoSuchRun000' })
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder }, 500,
      `Merge entry ${one.id} names run NoSuchRun000, which is not a record here, so the office cannot tell who the entry's line is. Nothing was written.`)
  })

  // ANSWER 3 OF MESSAGE XHY2fVFG3Qq8: the hand-over may declare the supervisor's own run of the related tests, as
  // `tests` {commit, exit, counts {passed, failed}, log}, the shape resolve-a-conflict.mjs prints. Only an agent of the
  // line whose own key proved its name declares one, and the queue records it as declared, with who and when. The door
  // judges nothing of it: a run at another commit is recorded, and the merge tool's check refuses it
  // (tests/the-merge-tool-checks-a-resolution.test.ts). The scoped check shows it to the inspector
  // (tests/the-office-moves-a-checked-resolution.test.ts).
  const withItsKey = async (handle: string) => {
    const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
    return { ...asAgent(handle), 'x-mole-office-key': makeAnAgentKey(ids[handle]!, null) }
  }
  const theRunOf = (copy: { folder: string; commit: string }) => ({ commit: copy.commit, exit: 0, counts: { passed: 4, failed: 0 }, log: `${copy.folder}.tests.log` })

  it("records the supervisor's own test run as declared, with who and when, from an agent of the line with its own key, and a later hand-over without one drops it", async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved, with a test run\n')
    // A RUN AT ANOTHER COMMIT, WITH A FAILURE, IS RECORDED AS DECLARED: the door judges none of it.
    const declared = { ...theRunOf(copy), commit: one.mainAt, exit: 1, counts: { passed: 4, failed: 1 } }
    const r = await knock(one.id, await withItsKey('res4-supervisor'), { workingDirectory: copy.folder, tests: declared })
    expect(r.status, r.raw).toBe(200)
    const resolution = stored(one.id)['resolution'] as Record<string, unknown>
    expect(resolution['commit']).toBe(copy.commit)
    expect(resolution['tests']).toEqual({ ...declared, by: { kind: 'agent', id: ids['res4-supervisor'] }, at: resolution['at'] })
    expect(r.body['says']).toContain(
      `It recorded the test run agent ${ids['res4-supervisor']} declared, at commit ${one.mainAt.slice(0, 12)}, as declared: the office did not run it, and it passes or fails nothing. ` +
        'The entry stays resolving, and the merge tool checks the resolution next.',
    )
    // A LATER HAND-OVER WITHOUT ONE, from the person, drops it.
    commitIn(copy.folder, 'before\nresolved again, with no test run\n')
    const again = await knock(one.id, asPerson, { workingDirectory: copy.folder })
    expect(again.status, again.raw).toBe(200)
    expect(stored(one.id)['resolution']).not.toHaveProperty('tests')
    expect(again.body['says']).not.toContain('test run')
  })

  it('refuses a test run declared without the agent\'s own key, by the person too, with 403 before it reads the body, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const noKey = `Only an agent of merge entry ${one.id}'s own line whose own key proved its name declares the supervisor's own test run with a hand-over, and the request of agent ${ids['res4-supervisor']} did not carry that agent's own key. Hand over without "tests", or send the agent's own key. Nothing was written.`
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder, tests: theRunOf(copy) }, 403, noKey)
    await refused(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder, tests: {} }, 403, noKey)
    await refused(one.id, asPerson, { workingDirectory: copy.folder, tests: theRunOf(copy) }, 403,
      `Only an agent of merge entry ${one.id}'s own line whose own key proved its name declares the supervisor's own test run with a hand-over, and the person is not an agent. Hand over without "tests", or send the agent's own key. Nothing was written.`)
    // THE SAME HAND-OVER WITHOUT `tests` IS TAKEN from the same caller.
    const without = await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })
    expect(without.status, without.raw).toBe(200)
  })

  it('refuses a declared run that is not a commit, an exit code, two counts and an absolute log, with 400, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const keyed = await withItsKey('res4-supervisor')
    const good = theRunOf(copy)
    for (const tests of [
      {},
      { ...good, commit: copy.commit.slice(0, 12) },
      { ...good, exit: 256 },
      { ...good, exit: 0.5 },
      { ...good, counts: { passed: 4 } },
      { ...good, counts: { ...good.counts, skipped: 1 } },
      { ...good, said: 'Synthetic: a key a declared run does not have.' },
    ]) {
      const before = stored(one.id)
      const r = await knock(one.id, keyed, { workingDirectory: copy.folder, tests })
      expect(r.status, `${JSON.stringify(tests)}: ${r.raw}`).toBe(400)
      expect(stored(one.id)).toEqual(before)
    }
    await refused(one.id, keyed, { workingDirectory: copy.folder, tests: { ...good, log: 'work/tests.log' } }, 400, 'The resolution tests.log: a declared test run names the absolute path of its log.')
    // AND THE SAME RUN, WELL MADE, IS TAKEN.
    const taken = await knock(one.id, keyed, { workingDirectory: copy.folder, tests: good })
    expect(taken.status, taken.raw).toBe(200)
  })

  const SAID = 'Synthetic: keeping both lines would change what main meant.'

  // ANSWER 4 OF MESSAGE XHY2fVFG3Qq8: the same door takes a second body, {"cannot":"<one sentence>"}, from the same
  // askers. By default the bounce states the speaker's sentence first and keeps no resolution word, because the
  // conflict may not be resolvable for a changed meaning at all. When the body adds {"changesWhatOneSideMeant": true},
  // the bounce also says keeping both sides would change what one side meant and records that resolution word. Both
  // keep who said it and the sentence as `cannot`. The cases below prove the bounce and its words, that it keeps the
  // sentence and takes the tool's mark off, that it is refused to anybody outside the line or a worker, that a body
  // which is not one sentence is a 400, that an entry not resolving or an hour that is over is a 409, and that an
  // hour which cannot be read is a 500.
  // Each was proved by mutation, alone and then put back: A, the entry's state is not asked; B, the hour is not asked;
  // C, `bounce` does not store `cannot`; D, `whyItBounced` always says "The check refused to release it."; E, the
  // released branch has no line for `cannot`; F, the route's `cannot` branch comes before who is knocking; G,
  // `theCannot` has no `.trim()`. Each mutation made a case red, and the file was green again after each restore.
  it('bounces at once as "changes what one side meant" when its own line says the conflict cannot be resolved, and keeps the sentence', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const knocked = await knock(one.id, asAgent('res4-supervisor'), { cannot: `  ${SAID}  `, changesWhatOneSideMeant: true })
    expect(knocked.status, knocked.raw).toBe(200)
    const says =
      `agent ${ids['res4-supervisor']} said its conflict cannot be resolved: "${SAID}" ` +
      `It was handed back from resolving: keeping both sides of its conflict would change what one side meant. Files: ${A}.`
    const written = stored(one.id)
    expect(written['state']).toBe('bounced')
    expect(written['bounced']).toEqual({
      reason: 'refused',
      at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
      files: [A],
      mainAt: one.mainAt,
      resolution: 'changes what one side meant',
      cannot: { by: { kind: 'agent', id: ids['res4-supervisor'] }, said: SAID },
      says,
    })
    expect(knocked.body['says']).toBe(says)
    expect(knocked.body['entry']).toMatchObject({ state: 'bounced' })
    // THE SUBMITTER'S BOUNCE MESSAGE EXISTS, on the entry's own record of who was told, and says what the bounce says.
    const told = written['told'] as { submitter: string[] }
    expect(told.submitter).toHaveLength(1)
    const message = t.api.getRecord(told.submitter[0]!)!
    expect(message.kind).toBe('message')
    expect(message.title).toBe(`Bounced (refused): merge entry ${one.id}`)
    expect(String(message.data['body'])).toContain(says)
    expect(String(message.data['body'])).toContain('Next: keeping both sides of the conflict changes what one side meant, so somebody must decide which meaning stands.')
    expect(String(message.data['body'])).not.toContain("read the check's refusal")

    // A RESOLUTION THAT WAITS FOR ITS CHECK DOES NOT STOP IT, AND THE BOUNCE TAKES THE TOOL'S MARK OFF WITH THE STATE.
    const two = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(two.dir, two.mainAt, 'before\nresolved\n')
    expect((await knock(two.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })).status).toBe(200)
    expect(stored(two.id)['toolWanted']).not.toBeNull()
    const byThePerson = await knock(two.id, asPerson, { cannot: SAID })
    expect(byThePerson.status, byThePerson.raw).toBe(200)
    const after = stored(two.id)
    expect(after['state']).toBe('bounced')
    expect((after['bounced'] as { cannot: unknown }).cannot).toMatchObject({ by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
    // A NULL IN A DATA PATCH REMOVES THE KEY, so the mark is gone from what is stored rather than kept as a null.
    expect(after['toolWanted'] ?? null).toBeNull()
  })

  // A CONFLICT THAT CANNOT BE RESOLVED FOR ANOTHER REASON: with no `changesWhatOneSideMeant`, the bounce states the
  // speaker's own sentence first, keeps no resolution word, and asks somebody to decide what happens to the change.
  it('bounces on the speaker\'s own sentence when the conflict cannot be resolved for another reason', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const knocked = await knock(one.id, asAgent('res4-supervisor'), { cannot: SAID })
    expect(knocked.status, knocked.raw).toBe(200)
    const says =
      `agent ${ids['res4-supervisor']} said its conflict cannot be resolved: "${SAID}" ` +
      `It was handed back from resolving. Files: ${A}.`
    expect(says.startsWith(`agent ${ids['res4-supervisor']} said its conflict cannot be resolved: "${SAID}"`)).toBe(true)
    expect(says).not.toContain('would change what one side meant')
    const written = stored(one.id)
    expect(written['state']).toBe('bounced')
    expect(written['bounced']).toEqual({
      reason: 'refused',
      at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
      files: [A],
      mainAt: one.mainAt,
      cannot: { by: { kind: 'agent', id: ids['res4-supervisor'] }, said: SAID },
      says,
    })
    expect((written['bounced'] as Record<string, unknown>)['resolution']).toBeUndefined()
    expect(knocked.body['says']).toBe(says)
    const told = written['told'] as { submitter: string[] }
    expect(told.submitter).toHaveLength(1)
    const message = t.api.getRecord(told.submitter[0]!)!
    expect(String(message.data['body'])).toContain('Next: the conflict cannot be resolved, for the reason given above, so somebody must decide what happens to the change.')
    expect(String(message.data['body'])).not.toContain('Next: keeping both sides of the conflict changes what one side meant, so somebody must decide which meaning stands.')
  })

  it('refuses anybody outside the line or a worker with 403, before it reads the body, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const run = stored(one.id)['run'] as string
    const outside = `Only the agent run ${run} served, the agent that started it, the run's own starter, or the person may hand over the resolution of merge entry ${one.id}, and ${ids['res4-stranger']} is none of them. Nothing was written.`
    await refused(one.id, asAgent('res4-stranger'), { cannot: SAID }, 403, outside)
    await refused(one.id, asAgent('res4-stranger'), { cannot: '' }, 403, outside)
    const workers = await aResolvingEntry('res4-worker')
    await refused(workers.id, asAgent('res4-worker'), { cannot: SAID }, 403,
      `Agent ${ids['res4-worker']} is a worker by its card, and a worker never hands over a resolution: the entry's own supervisor does, after it has judged the worker's work. Nothing was written.`)
  })

  it('refuses a body that is not one sentence with 400, a body with both keys too, a bad "changesWhatOneSideMeant" and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    const before = stored(one.id)
    for (const body of [
      { cannot: '' },
      { cannot: '   ' },
      { cannot: 5 },
      { cannot: null },
      { cannot: 'x'.repeat(601) },
      { cannot: SAID, workingDirectory: copy.folder },
      { cannot: SAID, more: 1 },
      { cannot: SAID, changesWhatOneSideMeant: false },
      { cannot: SAID, changesWhatOneSideMeant: 'yes' },
      { changesWhatOneSideMeant: true },
    ]) {
      const r = await knock(one.id, asAgent('res4-supervisor'), body)
      expect(r.status, r.raw).toBe(400)
      expect(stored(one.id)).toEqual(before)
    }
  })

  it('refuses an entry that is not resolving, and an hour that is over from its own end, with 409, and takes it until then', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const withdrew = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'Synthetic: the entry is taken back before its hand-over.' })
    expect(withdrew.status, withdrew.raw).toBe(200)
    await refused(one.id, asAgent('res4-supervisor'), { cannot: SAID }, 409,
      `Merge entry ${one.id} is withdrawn, and a conflict is said to be one that cannot be resolved only while an entry is resolving. Nothing was written.`)

    const two = await aResolvingEntry('res4-supervisor')
    const { since, timeZone } = stored(two.id)['resolving'] as { since: string; timeZone: string }
    const hour = theHourAfter(since, timeZone, 60)
    expect(hour.untilMs).not.toBeNull()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(hour.untilMs!)
      await refused(two.id, asAgent('res4-supervisor'), { cannot: SAID }, 409,
        `The 60 minutes for merge entry ${two.id} ended at ${hour.until!}: a conflict is said to be one that cannot be resolved within 60 minutes of it, as a resolution is handed over, and that time is never started again. Nothing was written.`)
      vi.setSystemTime(hour.untilMs! - 1)
      const inTime = await knock(two.id, asAgent('res4-supervisor'), { cannot: SAID })
      expect(inTime.status, inTime.raw).toBe(200)
      expect(stored(two.id)['state']).toBe('bounced')
    } finally { vi.useRealTimers() }
  })

  it('answers 500 with words when it is said for a resolving entry whose hour cannot be read', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const { resolving, ...withNone } = stored(one.id)
    rawData(one.id, withNone)
    await refused(one.id, asAgent('res4-supervisor'), { cannot: SAID }, 500,
      `Merge entry ${one.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken, so nothing was written.`)
  })

  // THE END OF THE HOUR (XHY2fVFG3Qq8, answer 2; point 5 of design 8AJQD_oExaVt). The office's message worker
  // reads which resolving entries are over the hour their own supervisor had, and asks the queue to bounce each one at
  // POST /api/worker/merges/<entry>/hour-over. The queue decides from what it stores, so the caller proves nothing.
  // The bounce keeps the reason `conflict` and one of two closed words: "the hour ran out" when nothing was handed
  // over, and "could not be read" when the merge tool's check refused the last resolution. A resolution handed over
  // inside the hour that waits for the check is never bounced by the hour. An hour that cannot be read is named, not
  // bounced. Proved by mutation, each alone and then put back: dropping the waits branch turns the fourth case red;
  // always choosing "the hour ran out" turns the third red; the door not checking that the hour is over turns the
  // fifth red; the door's caller check taken out turns the fifth red; the rule keeping a cannotTell entry in hourOver
  // turns the sixth red.
  const over = (id: string, headers: Record<string, string>, body?: unknown) => call('POST', `/api/worker/merges/${id}/hour-over`, headers, body ?? {})
  const listed = () => call('GET', '/api/worker/merges', asTheOffice)

  /** The hour of a resolving entry, as the rule and the door count it. */
  function theHourOf(id: string) {
    const { since, timeZone } = stored(id)['resolving'] as { since: string; timeZone: string }
    const hour = theHourAfter(since, timeZone, 60)
    expect(hour.untilMs, `the hour of merge entry ${id} cannot be read`).not.toBeNull()
    return hour
  }

  /** An over-the-hour knock that writes nothing: the stored data is what it was before the knock. */
  async function refusedOver(id: string, headers: Record<string, string>, body: unknown, status: number, says: string) {
    const before = stored(id)
    const r = await over(id, headers, body)
    expect(r.status, r.raw).toBe(status)
    expect(r.body['error']).toBe(says)
    expect(stored(id)).toEqual(before)
  }

  it('lists an entry whose hour is over, and leaves off one whose hour is not', async () => {
    const first = await aResolvingEntry('res4-supervisor')
    const second = await aResolvingEntry('res4-supervisor')
    const hour = theHourOf(first.id)
    // THE SECOND'S HOUR MOVED ONE HOUR ON, so the clock at the first's end is inside the second's hour.
    const held = stored(second.id)['resolving'] as Record<string, unknown>
    const movedOn = clockStamp(() => new Date(momentOfAnInstant(String(held['since']))! + 3_600_000)).instant
    rawData(second.id, { ...stored(second.id), resolving: { ...held, since: movedOn } })

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(hour.untilMs!)
      const beforeFirst = stored(first.id)
      const beforeSecond = stored(second.id)
      const read = await listed()
      expect(read.status, read.raw).toBe(200)
      const hourOver = read.body['hourOver'] as { entry: string; until: string; resolution: string }[]
      expect(hourOver).toContainEqual({ entry: first.id, until: hour.until, resolution: 'the hour ran out' })
      expect(hourOver.map((one) => one.entry)).not.toContain(second.id)
      // AND THE READING WROTE NOTHING.
      expect(stored(first.id)).toEqual(beforeFirst)
      expect(stored(second.id)).toEqual(beforeSecond)
    } finally { vi.useRealTimers() }
  })

  it('bounces an entry whose hour ran out with nothing handed over, as conflict and "the hour ran out"', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const hour = theHourOf(one.id)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(hour.untilMs!)
      const r = await over(one.id, asTheOffice)
      expect(r.status, r.raw).toBe(200)
      const written = stored(one.id)
      const says =
        `It could not be put on top of the main world: a conflict the tool does not resolve. Files: ${A}. ` +
        `The 60 minutes its own supervisor had to resolve the conflict ended at ${hour.until}, and no resolution was handed over in it.`
      expect(written['state']).toBe('bounced')
      expect(written['bounced']).toEqual({
        reason: 'conflict',
        at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
        files: [A],
        mainAt: one.mainAt,
        resolution: 'the hour ran out',
        says,
      })
      expect(r.body['entry']).toMatchObject({ state: 'bounced' })
      expect(r.body['says']).toBe(says)
      // THE SUBMITTER'S BOUNCE MESSAGE EXISTS, on the entry's own record of who was told.
      const told = written['told'] as { submitter: string[] }
      expect(told.submitter).toHaveLength(1)
      const message = t.api.getRecord(told.submitter[0]!)!
      expect(message.kind).toBe('message')
      expect(message.title).toBe(`Bounced (conflict): merge entry ${one.id}`)
      expect(String(message.data['body'])).toContain(says)
    } finally { vi.useRealTimers() }
  })

  it('bounces an entry whose last resolution the check refused, as conflict and "could not be read"', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    expect((await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })).status).toBe(200)
    const handed = stored(one.id)['resolution'] as { commit: string; at: string }
    // THE CHECK REFUSES IT BY ITS OWN STEP, which takes the tool's mark off as the state writer does.
    const checked = await call('POST', `/api/merge-queue/${one.id}/step`, asTheOffice, { step: 'resolution-checked', facts: { commit: handed.commit, ok: false, says: 'Synthetic: the check refused it.' } })
    expect(checked.status, checked.raw).toBe(200)
    const hour = theHourOf(one.id)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(hour.untilMs!)
      const read = await listed()
      expect(read.status, read.raw).toBe(200)
      expect(read.body['hourOver']).toContainEqual({ entry: one.id, until: hour.until, resolution: 'could not be read' })
      const r = await over(one.id, asTheOffice)
      expect(r.status, r.raw).toBe(200)
      const says =
        `It could not be put on top of the main world: a conflict the tool does not resolve. Files: ${A}. ` +
        `The 60 minutes its own supervisor had to resolve the conflict ended at ${hour.until}. ` +
        `The merge tool's check refused the last resolution handed over, commit ${handed.commit.slice(0, 12)} at ${handed.at}: Synthetic: the check refused it.`
      expect(stored(one.id)['bounced']).toEqual({
        reason: 'conflict',
        at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
        files: [A],
        mainAt: one.mainAt,
        resolution: 'could not be read',
        says,
      })
      expect(r.body['says']).toBe(says)
    } finally { vi.useRealTimers() }
  })

  it('never bounces a resolution handed over inside the hour that waits for its check', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved\n')
    expect((await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })).status).toBe(200)
    const handedOverAt = (stored(one.id)['resolution'] as { at: string }).at
    const hour = theHourOf(one.id)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(hour.untilMs! + 60_000)
      const read = await listed()
      expect(read.status, read.raw).toBe(200)
      expect((read.body['hourOver'] as { entry: string }[]).map((one) => one.entry)).not.toContain(one.id)
      await refusedOver(one.id, asTheOffice, {}, 409,
        `Merge entry ${one.id} holds a resolution handed over at ${handedOverAt}, inside its 60 minutes, which waits for the merge tool's check, so the end of that time does not bounce it. Nothing was written.`)
    } finally { vi.useRealTimers() }
  })

  it('refuses an hour that is not over, an entry that is not resolving, and anybody but the message worker, and writes nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const hour = theHourOf(one.id)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(hour.untilMs! - 1)
      await refusedOver(one.id, asTheOffice, {}, 409, `The 60 minutes for merge entry ${one.id} end at ${hour.until}, so it is not over. Nothing was written.`)
    } finally { vi.useRealTimers() }

    // AN ENTRY THAT IS NOT RESOLVING AT ALL.
    const two = await aResolvingEntry('res4-supervisor')
    const withdrew = await call('POST', `/api/merge-queue/${two.id}/withdraw`, asPerson, { because: 'Synthetic: the entry is taken back before its hour can be over.' })
    expect(withdrew.status, withdrew.raw).toBe(200)
    await refusedOver(two.id, asTheOffice, {}, 409, `Merge entry ${two.id} is withdrawn, and only a resolving entry's time to resolve can be over. Nothing was written.`)

    // ANYBODY BUT THE OFFICE'S MESSAGE WORKER: the person, a supervisor with a good body, and a stranger whose body
    // would be a 400 for the worker. The caller is asked before the body is read, so the last of those is a 403.
    const notTheWorker = `Only the office's message worker says that a resolving merge entry's time to resolve is over. Nothing was written.`
    await refusedOver(one.id, asPerson, {}, 403, notTheWorker)
    await refusedOver(one.id, asAgent('res4-supervisor'), {}, 403, notTheWorker)
    const before400 = stored(one.id)
    const wrongBody = await over(one.id, asTheOffice, { more: 1 })
    expect(wrongBody.status, wrongBody.raw).toBe(400)
    expect(stored(one.id)).toEqual(before400)
    await refusedOver(one.id, asAgent('res4-stranger'), { more: 1 }, 403, notTheWorker)
  })

  it('names an entry whose hour cannot be read and bounces nothing', async () => {
    const one = await aResolvingEntry('res4-supervisor')
    const held = { ...(stored(one.id)['resolving'] as Record<string, unknown>) }
    delete held['since']
    rawData(one.id, { ...stored(one.id), resolving: held })
    const says = `Merge entry ${one.id} is resolving without an end of its time to resolve that can be read, which the merge queue writes before an entry can be resolving. The entry's record is broken, so nothing was written.`
    const read = await listed()
    expect(read.status, read.raw).toBe(200)
    expect(read.body['hourCannotBeRead']).toContainEqual({ entry: one.id, says })
    expect((read.body['hourOver'] as { entry: string }[]).map((entry) => entry.entry)).not.toContain(one.id)
    await refusedOver(one.id, asTheOffice, {}, 500, says)
  })

  // ---- THE MERGE QUEUE PAGE: the server sends the row, and the page draws it (XHY2fVFG3Qq8, answer 7) ----

  /** The queue page's module, in English, under a stand-in window it reads who is looking from. */
  async function theQueuePage(): Promise<typeof import('../src/web/pages/MergeQueuePage.tsx')> {
    const kept = new Map<string, string>()
    const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) }
    ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} }
    ;(await import('../src/shared/i18n.ts')).setWordLanguage('en')
    return import('../src/web/pages/MergeQueuePage.tsx')
  }
  /** One row of the drawn page, by entry id, as a reader reads it, the small ids beside titles left out. */
  function theRowsWords(html: string, entry: string): string {
    const found = html.match(new RegExp(`<li class="mq-row" data-entry="${entry}"[^>]*>[\\s\\S]*?</li>`, 'u'))
    expect(found, `the page draws no row for ${entry}`).not.toBeNull()
    return found![0].replace(/<code class="mq-id">[^<]*<\/code>/gu, ' ').replace(/<[^>]+>/gu, ' ').replace(/&#x27;/gu, "'").replace(/\s+/gu, ' ')
  }

  it('is sent to the merge queue page last in its lane, and the page draws it waiting, then handed over, then refused, with no status number', async () => {
    const page = await theQueuePage()
    try {
      const one = await aResolvingEntry('res4-supervisor')
      // THIS AUTHOR HAS NO SANDBOXED RUN, so the office wrote no brief (writeTheResolveBrief), and the row says so.
      expect((stored(one.id)['resolving'] as { asked: { brief?: string; noBrief?: string } }).asked).toMatchObject({ noBrief: expect.any(String) })
      expect((stored(one.id)['resolving'] as { asked: { brief?: string } }).asked.brief).toBeUndefined()
      // AN ENTRY STILL BEING CHECKED IN THE SAME LANE, so "last" is a place among others. Synthetic, written as the queue writes it.
      const door = await import('../src/server/lib/merge-entry-door.ts')
      const checking = door.asTheMergeQueue(() =>
        t.api.createRecord({
          kind: 'merge_entry',
          title: 'Synthetic merge entry still being checked',
          workspaceId: 'default',
          actor: { type: 'agent', id: 'mole-office/the-message-worker' },
          origin: 'fixture',
          data: {
            run: 'synthetic-run-still-being-checked',
            seal: { id: 'synthetic-seal-still-being-checked', hash: 'synthetic-hash-still-being-checked' },
            changeset: stored(one.id)['changeset'],
            state: 'submitted',
            submittedBy: { kind: 'agent', id: 'synthetic-worker' },
          },
        }),
      ).id
      // THE PAGE'S OWN LIST OF STATES, so a page that does not ask for resolving entries is sent none.
      const read = async (): Promise<MergeQueueReply> => {
        const r = await call('GET', `/api/merge-queue?state=${page.LIVE_STATES.join(',')}`, asPerson)
        expect(r.status, r.raw).toBe(200)
        return r.body as unknown as MergeQueueReply
      }
      const drawn = (reply: MergeQueueReply, now: Date) => theRowsWords(renderToStaticMarkup(h(page.TheMergeQueue, { reply, now })), one.id)

      // SENT, AND LAST IN ITS LANE: every entry after the first resolving one is resolving too, and the one still being checked is ahead.
      const first = await read()
      const lane = first.lanes.find((each) => each.entries.some((row) => row.id === one.id))
      expect(lane, `GET /api/merge-queue sent no row for ${one.id}`).toBeDefined()
      const row = lane!.entries.find((each) => each.id === one.id)!
      expect(row.state).toBe('resolving')
      expect(row.machine['resolving']).toMatchObject({ files: [A], mainAt: one.mainAt })
      const order = first.page.lanes.find((each) => each.lane === lane!.lane)!.order
      const states = new Map(lane!.entries.map((each) => [each.id, each.state]))
      expect(order.slice(order.findIndex((id) => states.get(id) === 'resolving')).every((id) => states.get(id) === 'resolving'), order.join(' ')).toBe(true)
      expect(order).toContain(checking)
      expect(order.indexOf(checking)).toBeLessThan(order.indexOf(one.id))

      // WAITING: the end of the hour on the reader's clock, no brief, and nobody started it, with no status number.
      expect((await unstarted(one.id, asPerson, { status: 409, said: 'Synthetic: the next-round door refused the brief.' })).status).toBe(200)
      const until = new Date(momentOfAnInstant((stored(one.id)['resolving'] as { since: string }).since)! + 3_600_000)
      const waiting = drawn(await read(), until)
      expect(waiting).toContain('with its supervisor')
      expect(waiting).toContain(`Waits for its own supervisor to resolve a conflict in ${A}, until ${localStamp(until).slice(11, 16)}.`)
      expect(waiting).toContain('No resolve brief was written.')
      expect(waiting).toContain(englishWords()['mergeQueuePage.why.nobodyStarted'])
      expect(waiting).not.toContain('409')
      expect(waiting).not.toContain('Synthetic: the next-round door refused the brief.')
      expect(waiting).not.toContain((stored(one.id)['resolving'] as { asked: { noBrief: string } }).asked.noBrief)

      // HANDED OVER, then REFUSED by the merge tool's check through its own step.
      const copy = aCleanCopy(one.dir, one.mainAt, 'before\nresolved for the queue page\n')
      expect((await knock(one.id, asAgent('res4-supervisor'), { workingDirectory: copy.folder })).status).toBe(200)
      const handed = stored(one.id)['resolution'] as { commit: string; at: string }
      const then = new Date(handed.at.replace(' ', 'T'))
      expect(drawn(await read(), then)).toContain(`A resolution was handed over at ${handed.at.slice(11, 16)}, and the merge tool checks it next.`)
      const checked = await call('POST', `/api/merge-queue/${one.id}/step`, asTheOffice, { step: 'resolution-checked', facts: { commit: handed.commit, ok: false, says: 'Synthetic: the check refused it.' } })
      expect(checked.status, checked.raw).toBe(200)
      const refusedRow = drawn(await read(), then)
      expect(refusedRow).toContain(`The merge tool refused the resolution handed over at ${handed.at.slice(11, 16)}.`)
      expect(refusedRow).not.toContain('checks it next')
      expect(refusedRow).not.toContain('Synthetic: the check refused it.')
    } finally {
      delete (globalThis as { window?: unknown }).window
    }
  })
})
