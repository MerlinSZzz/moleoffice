// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST RED ONLY WITH THE ENTRY GOES TO THE ENTRY'S OWN LINE FIRST (wave 13u round 63), the way tier 2 hands back a
 * conflict. Nothing of it is live: the setting MOLE_OFFICE_RED_FIXING is off by default, and these cases turn it on only
 * around the step that hands an entry on.
 *
 * WHAT THIS FILE PROVES:
 *   1. With the setting on, a red run whose tested facts name every red test in `redOnlyWithIt` moves the entry to
 *      resolving instead of bouncing it. The entry keeps the red tests, the main it was tested on and the time to fix,
 *      which is the time set for resolving a conflict on the Gates panel. The office writes a fix brief into the asked
 *      agent's sandbox, whose clean copy is started with `--red`, and sends one asking message whose `askedToResolve`
 *      names the red tests. The gate 'red-fixing' counts it. The supervisor has no run going, so the office also asks
 *      the next-round door for its round itself, on the fix brief, and keeps the door's answer on the ask (wave 13u
 *      round 90). Cases 9 and 10 ask the same way.
 *   2. With the setting off, the entry bounces as red, as before, and the gate counts it all the same.
 *   3. A red run that does not name its tests in `redOnlyWithIt` bounces as before, and the gate does not count it.
 *   4. `redOnlyWithIt` that is not the run's red tests, or that comes with a green run, is refused with 422, and nothing
 *      is written or counted.
 *   5. When the time to fix ends with no fix handed over, or with the last fix refused by the merge tool's check, the
 *      entry bounces as red with the word "not fixed in the hour". A refusal says how long another fix may be handed over.
 *   6. When its line says the tests cannot be fixed, the entry bounces at once as red, with the speaker's sentence and no
 *      resolution word. "changesWhatOneSideMeant" is refused for a red, which has no two sides.
 *   7. A pass of a fix by the merge tool's check names the files the fix changes in `fixed`, and the entry is pinned and
 *      judged as after a resolution. A pass of a fix without `fixed`, or with places, is refused, and so is `fixed` on a
 *      conflict's resolution.
 *   8. At the integrate step each fixed file goes to a scoped check before the suite, with the question a fix asks. A
 *      refusal of that check bounces the entry with no resolution word.
 *   9. A red met again after a fix passed goes back to the line in the minutes of the first hand-on, which are never
 *      started again, and its clean copy replays that fix with the entry's own commits.
 *  10. A conflict met after a fix passed goes back the same way, and its clean copy replays that fix too.
 *
 * MUTATIONS (each after a control run, each restored; the commit message records the runs):
 *   - the tested step hands on whatever the setting says: case 2 red.
 *   - the gate counted only when the setting is on: case 2 red.
 *   - the check of `redOnlyWithIt` against `redTests` removed: case 4 red.
 *   - the hour's end bouncing a red as a conflict with "the hour ran out": case 5 red.
 *   - the door that says the tests cannot be fixed bouncing a red as a conflict's refusal: case 6 red.
 *   - a pass of a fix accepted without `fixed`: case 7 red.
 *   - the fixed files left out of the files its supervisor changed by hand: case 8 red.
 *   - a red after a passed fix bounced as "not green" whatever the setting says: case 9 red.
 *   - a conflict after a passed fix replaying the entry's own commit: case 10 red.
 *   - the office's own ask for the round left out of the hand-on: cases 1, 9 and 10 red (wave 13u round 90).
 *
 * Every fixture here is synthetic and says so. The lane's repository, the runs' trees and the clean copies are git trees
 * made under the temporary directory and removed after; the records are filed as fixtures; nothing reaches the live
 * server. The sandbox folders are made under the temporary directory and removed after; a container row written as
 * `tools/sandbox.mjs up` writes one vouches for each, and a run filed as its launcher files one names it. The merge
 * tool's own work before a pass, fetching the commit and pointing the ref at it, is done here by git in the test, because
 * the check run is tests/a-red-fix-is-checked-on-top-of-the-replay.test.ts's. The hour's end is reached by setting the
 * test's clock, not by waiting. The scoped check's verdict is written on the check-again run by the helper that writes a
 * verdict as its door would, and the queue is told by the function the check door calls.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { ABSENT, pinnedRefOf, resolvedRefOf } from '../src/shared/merge-queue.ts'
import { theHourAfter } from '../src/shared/time.ts'

const RED_FIXING = 'MOLE_OFFICE_RED_FIXING'
const CONFLICT_RESOLVING = 'MOLE_OFFICE_CONFLICT_RESOLVING'
const A = 'work/a.txt'
const FIX = 'work/fix.txt'
const T = 'tests/synthetic-red.test.ts'
const AUTHOR = 'red-author'
const SUPERVISOR = 'red-supervisor'
const REPOSITORY = 'red-fixes'
const STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/
const LOG = '/synthetic/suite.log'
/** The red run of the merge tool, as it reports a test red with this entry on main and green on main without it. */
const RED_ONLY = { green: false, log: LOG, redTests: [T], redOnlyWithIt: [T], ran: 2, passed: 1 }

describe('a test red only with the entry goes to its own line first', () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let mainAt: string
  const made: string[] = []
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  const asTheOffice = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
  async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } }).trim() }
  function scratch(prefix: string) {
    const dir = mkdtempSync(join(tmpdir(), `red-only-${prefix}-`))
    made.push(dir)
    return realpathSync(dir)
  }
  function asTheFixture(dir: string) { git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic red-fix fixture') }
  const stored = (id: string) => t.api.getRecord(id)!.data as Record<string, any>
  const ids: Record<string, string> = {}
  /** Every message of `notice` the office wrote about this run, oldest first. */
  const noticesAbout = (run: string, notice: string) =>
    (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = ? AND json_extract(data, '$.aboutRun') = ? ORDER BY created_at, rowid").all(notice, run) as { id: string }[]).map((row) => row.id)
  /** How many times the gate 'red-fixing' was met, on every day. */
  const counted = () => (t.client.sqlite.prepare("SELECT sum(would_stop) AS n FROM gate_counts WHERE gate = 'red-fixing'").get() as { n: number | null }).n ?? 0
  const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  async function entry(id: string): Promise<Record<string, any>> {
    const read = await call('GET', `/api/merge-queue/${id}`, asPerson)
    expect(read.status, read.raw).toBe(200)
    return read.body.entry
  }
  async function withTheSettings<T>(names: string[], run: () => Promise<T>): Promise<T> {
    const before = names.map((name) => process.env[name])
    for (const name of names) process.env[name] = '1'
    try { return await run() } finally {
      names.forEach((name, n) => { if (before[n] === undefined) delete process.env[name]; else process.env[name] = before[n] })
    }
  }

  interface Seal { id: string; commit: string; files: { path: string; hash: string | null }[] }
  interface One { id: string; run: string; dir: string; seal: Seal }
  interface Copy { folder: string; commit: string }
  const contentOf = (seal: Seal) => Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))

  /**
   * A SUBMITTED GIT ENTRY: a finished run in a clone of the lane's repository whose `work` branch changes work/a.txt with
   * a line of its own, sealed and released by an inspector. The run is `servedBy`'s, the author's unless it says.
   */
  async function anEntry(servedBy: string = AUTHOR): Promise<One> {
    const dir = scratch('tree')
    git(dir, 'clone', '-q', root, '.'); asTheFixture(dir)
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, A), `before\nafter, from ${basename(dir)}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work whose test is red only with it')
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run whose test is red only with it', workspaceId: 'default', actor: { type: 'agent', id: servedBy }, origin: 'fixture', data: { state: 'running', servingAgent: servedBy, workingDirectory: dir, cutFrom: 'main' } }).id
    t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
    const sealId = t.api.getRecord(run)!.data['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; files: Seal['files'] } }
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-24 01:00:00', how: 'an inspector', check: 'synthetic-check', read: { sealId, sealHash: seal.hash, worktree: dir, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
    const queued = await call('POST', '/api/merge-queue', asPerson, { run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    return { id: String(queued.body.entry.id), run, dir, seal: { id: sealId, commit: seal.git.commit, files: seal.git.files } }
  }
  /** A RELEASED ENTRY WALKED TO TESTING: pinned and judged, integrating, and integrated with the content its verdict read. */
  async function aTestingEntry(servedBy?: string): Promise<One> {
    const one = await anEntry(servedBy)
    for (const [name, facts] of [
      ['pinned', { files: contentOf(one.seal) }],
      ['integrating', {}],
      ['integrated', { result: one.seal.commit, mainAt, files: contentOf(one.seal) }],
    ] as const) {
      const r = await step(one.id, name, facts)
      expect(r.status, `${name}: ${r.raw}`).toBe(200)
    }
    expect(stored(one.id)['state']).toBe('testing')
    return one
  }
  /** The red run, with the setting on, hands the entry on. */
  async function handedOn(one: One, facts: Record<string, unknown> = RED_ONLY) {
    const r = await withTheSettings([RED_FIXING], () => step(one.id, 'tested', facts))
    expect(r.status, r.raw).toBe(200)
    expect(stored(one.id)['state']).toBe('resolving')
    return r
  }
  /** A CLEAN COPY of the entry's tree at `at`, with a fix committed on top, handed over by the person. */
  async function aFix(one: One, at: string = one.seal.commit, content = 'Synthetic: the fix of the red test.\n'): Promise<Copy> {
    const folder = scratch('fix-copy')
    git(folder, 'clone', '-q', one.dir, '.'); asTheFixture(folder)
    git(folder, 'switch', '-q', '--detach', at)
    writeFileSync(join(folder, FIX), content); git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic fix of the red test')
    const commit = git(folder, 'rev-parse', 'HEAD')
    const handed = await call('POST', `/api/merge-queue/${one.id}/resolution`, asPerson, { workingDirectory: folder })
    expect(handed.status, handed.raw).toBe(200)
    return { folder, commit }
  }
  /** WHAT THE CHECK RUN DOES BEFORE IT REPORTS A PASS: the commit fetched into the lane's repository, and the ref pointed at it. */
  function heldAtTheRef(one: One, copy: Copy) {
    git(root, 'fetch', '-q', copy.folder, 'HEAD')
    git(root, 'update-ref', resolvedRefOf(one.id), copy.commit)
  }
  const fixPassed = (one: One, copy: Copy) => step(one.id, 'resolution-checked', { commit: copy.commit, ok: true, ref: resolvedRefOf(one.id), places: [], fixed: [FIX] })
  function theHourOf(id: string) {
    const { since, timeZone } = stored(id)['resolving'] as { since: string; timeZone: string }
    const hour = theHourAfter(since, timeZone, 60)
    expect(hour.untilMs, `the hour of merge entry ${id} cannot be read`).not.toBeNull()
    return { since, timeZone, until: hour.until!, untilMs: hour.untilMs! }
  }
  /**
   * THE SANDBOX OF `handle`: its folder, the container row that vouches for it, and the agent's run started in it. It is
   * made once for each handle. The office takes the agent's last run started in a sandbox, and two runs started in the
   * same second would be told apart only by their ids. The run names its runtime and model, as a launcher's run does,
   * because the next-round door refuses at the ask a round whose start could not continue the run.
   */
  const sandboxes: Record<string, string> = {}
  /** The run started in each handle's sandbox, which holds the office's own ask for the handle's next round. */
  const runsIn: Record<string, string> = {}
  function aSandbox(handle: string): string {
    if (sandboxes[handle] !== undefined) return sandboxes[handle]
    const folder = scratch('sandbox')
    sandboxes[handle] = folder
    for (const one of ['briefs', 'worktrees', 'repo']) mkdirSync(join(folder, one))
    const container = `row-${randomBytes(5).toString('hex')}`
    t.client.sqlite
      .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-24 07:00:00', 'agent:fixture')")
      .run(container, `mole-office-sandbox-${basename(folder)}`, `Sandbox ${basename(folder)}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
    runsIn[handle] = t.api.createRecord({
      kind: 'session',
      title: `Synthetic round of ${handle} in its sandbox`,
      workspaceId: 'default',
      actor: person,
      origin: 'fixture',
      data: { state: 'running', servingAgent: handle, servingAgentId: ids[handle], runtime: 'claude-code', model: 'claude-made-up-red-fix-0', workingDirectory: join(folder, 'repo'), cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder } },
    }).id
    return folder
  }
  /**
   * THE OFFICE'S OWN ASK FOR THE ROUND (wave 13u round 90). The supervisor has no run going, so the office asks the
   * next-round door itself, on the brief it wrote. The door takes it and keeps it on the run in the supervisor's sandbox.
   * The door's own words are its line's, so they are read back and not pinned.
   */
  const theOfficesAsk = (handle: string) => ({ at: expect.any(String), status: 202, said: expect.any(String), run: runsIn[handle] })
  const theDoorAnswered = (asked: { round: { said: string } }) => ` It asked for the round itself, and the door answered: ${asked.round.said}`
  const theCleanCopyOf = (folder: string, id: string) => join(folder, 'worktrees', `resolve-${id}`)

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    root = scratch('main')
    git(root, 'init', '-q', '-b', 'main'); asTheFixture(root)
    mkdirSync(join(root, 'work')); writeFileSync(join(root, A), 'before\n'); git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic baseline')
    mainAt = git(root, 'rev-parse', 'HEAD')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root, actor: { ...person, provedBy: 'the-person-key' } })
    const registered = await call('POST', '/api/agents/started', asPerson, { handle: AUTHOR, name: 'Synthetic author whose test is red only with its entry', workArea: ['work'] })
    expect(registered.status, registered.raw).toBe(201)
    ids[AUTHOR] = String(registered.body['agent'].id)
    const supervisor = await call('POST', '/api/agents/started', asPerson, { handle: SUPERVISOR, name: 'Synthetic supervisor who fixes red tests', workArea: ['work'], role: 'supervisor' })
    expect(supervisor.status, supervisor.raw).toBe(201)
    ids[SUPERVISOR] = String(supervisor.body['agent'].id)
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE FOR THE NEXT ONE.
  afterEach(async () => {
    vi.useRealTimers()
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(root)}`, asPerson)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder === null || holder === undefined) return
    await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })
  })
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it('1. hands a red only with the entry to its own supervisor, with a fix brief and one asking message, and counts it', async () => {
    const folder = aSandbox(SUPERVISOR)
    const one = await aTestingEntry(SUPERVISOR)
    const before = counted()
    const r = await handedOn(one)
    expect(counted()).toBe(before + 1)
    const hour = theHourOf(one.id)
    const brief = join(folder, 'briefs', `resolve-${one.id}.md`)
    const held = stored(one.id)
    const asked = held['resolving'].asked as { message: string; round: { said: string } }
    expect(held['resolving']).toEqual({
      files: [],
      red: { tests: [T] },
      log: LOG,
      mainAt,
      says: expect.stringContaining(`The tests stayed red on their own: ${T}.`),
      since: hour.since,
      timeZone: hour.timeZone,
      minutes: 60,
      asked: { agent: ids[SUPERVISOR], brief, message: expect.any(String), round: theOfficesAsk(SUPERVISOR) },
    })
    expect(held['bounced']).toBeUndefined()
    expect(r.body.decided.startsWith(`Red: ${T}.`)).toBe(true)
    expect(r.body.decided.endsWith(
      ` It now waits for its own supervisor to fix the red tests, within 60 minutes of ${hour.since.slice(0, 19).replace('T', ' ')}. The office wrote the fix brief at ${brief}. It asked in message ${asked.message}.${theDoorAnswered(asked)}`,
    )).toBe(true)
    const read = await entry(one.id)
    expect(read).toMatchObject({ state: 'resolving', occupies: null, toolWanted: null })

    // THE FIX BRIEF: the red tests, the clean copy started with --red, the command that runs them, and no conflict's words.
    const text = readFileSync(brief, 'utf8')
    expect(text.startsWith(`# Fix the red tests of merge entry ${one.id}\n`)).toBe(true)
    expect(text).toContain(`- The red tests: ${T}\n`)
    expect(text).toContain(`--ref ${pinnedRefOf(one.id)} --commit ${one.seal.commit} --main-at ${mainAt} --red ${T} --into ${theCleanCopyOf(folder, one.id)}\n`)
    expect(text).toContain(`    node tools/run-named-tests.mjs ${T}\n`)
    expect(text).toContain('the entry bounces as "not fixed in the hour".')
    expect(text).toContain('Do not weaken, skip or delete a test')
    expect(text).not.toContain('--files')
    expect(text).not.toContain('changesWhatOneSideMeant')

    // ONE ASKING MESSAGE, whose program part names the red tests and no files.
    expect(noticesAbout(one.run, 'askedToResolve')).toEqual([asked.message])
    const message = t.api.getRecord(asked.message)!
    expect(message.title).toBe(`Asked to fix red tests: merge entry ${one.id}`)
    expect(message.data['askedToResolve']).toEqual({ entry: one.id, files: [], red: [T], brief, agent: ids[SUPERVISOR], until: new Date(hour.untilMs).toISOString() })
    const body = String(message.data['body'])
    expect(body).toContain(`The red tests: ${T}.\n`)
    expect(body).toContain('the entry bounces as "not fixed in the hour".')
    expect(body).toContain(`${SUPERVISOR} had no run going, so the office asked for its next round itself, on this brief. The door answered: ${asked.round.said}`)
    expect(body).not.toContain('a secretary asks POST')
  })

  it('2. bounces it as red when the setting is off, and counts it all the same', async () => {
    const one = await aTestingEntry()
    const before = counted()
    const r = await step(one.id, 'tested', RED_ONLY)
    expect(r.status, r.raw).toBe(200)
    expect(counted()).toBe(before + 1)
    const read = await entry(one.id)
    expect(read).toMatchObject({ state: 'bounced', occupies: null })
    expect(read.machine.bounced).toMatchObject({ reason: 'red', redTests: [T], files: [] })
    expect(read.machine.bounced.resolution).toBeUndefined()
    expect(read.machine.resolving).toBeUndefined()
    expect(noticesAbout(one.run, 'askedToResolve')).toEqual([])
  })

  it('3. bounces a red run that does not name its tests as red only with the entry, and counts nothing', async () => {
    const one = await aTestingEntry()
    const before = counted()
    const { redOnlyWithIt: _left, ...facts } = RED_ONLY
    const r = await withTheSettings([RED_FIXING], () => step(one.id, 'tested', facts))
    expect(r.status, r.raw).toBe(200)
    expect(counted()).toBe(before)
    expect(stored(one.id)['state']).toBe('bounced')
    expect(stored(one.id)['bounced']).toMatchObject({ reason: 'red', redTests: [T] })
  })

  it('4. refuses `redOnlyWithIt` that is not the run\'s red tests, or that comes with a green run, and writes and counts nothing', async () => {
    const one = await aTestingEntry()
    const before = stored(one.id)
    const count = counted()
    const other = 'tests/synthetic-other.test.ts'
    for (const [facts, error] of [
      [{ ...RED_ONLY, redOnlyWithIt: [other] }, `A red test run names in \`redOnlyWithIt\` the same tests as in \`redTests\`, and this one names ${other} there and ${T} in \`redTests\`. Nothing was written.`],
      [{ ...RED_ONLY, redOnlyWithIt: [T, other], redTests: [T] }, `A red test run names in \`redOnlyWithIt\` the same tests as in \`redTests\`, and this one names ${T}, ${other} there and ${T} in \`redTests\`. Nothing was written.`],
      [{ green: true, log: LOG, ran: 2, passed: 2, redOnlyWithIt: [T] }, 'A green test run has no test that is red only with the entry, so it names none in `redOnlyWithIt`. Nothing was written.'],
    ] as const) {
      const r = await withTheSettings([RED_FIXING], () => step(one.id, 'tested', facts))
      expect(r.status, r.raw).toBe(422)
      expect(r.body.error).toBe(error)
      expect(stored(one.id)).toEqual(before)
    }
    expect(counted()).toBe(count)
  })

  it('5. bounces it as "not fixed in the hour" when the time to fix ends with no fix, or with the last fix refused', async () => {
    const none = await aTestingEntry()
    await handedOn(none)
    const noneHour = theHourOf(none.id)
    const refused = await aTestingEntry()
    await handedOn(refused)
    const refusedHour = theHourOf(refused.id)
    const copy = await aFix(refused)
    const handedAt = stored(refused.id)['resolution'].at as string
    const says = 'Synthetic: the fix changed a replayed commit.'
    const inTime = await step(refused.id, 'resolution-checked', { commit: copy.commit, ok: false, says })
    expect(inTime.status, inTime.raw).toBe(200)
    expect(inTime.body.decided).toBe(
      `The merge tool's check refused the fix of the red tests, commit ${copy.commit.slice(0, 12)}, handed over at ${handedAt}: ${says} The entry stays resolving. ` +
        `Its own supervisor may hand over another fix until its 60 minutes end at ${refusedHour.until}.`,
    )
    // A SECOND FIX, HANDED OVER IN TIME AND REFUSED AFTER THE TIME ENDED, says that no other fix can be handed over.
    const second = await aFix(refused, refused.seal.commit, 'Synthetic: the second fix of the red test.\n')
    const secondAt = stored(refused.id)['resolution'].at as string
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Math.max(noneHour.untilMs, refusedHour.untilMs) + 60_000)
    const late = await step(refused.id, 'resolution-checked', { commit: second.commit, ok: false, says })
    expect(late.status, late.raw).toBe(200)
    expect(late.body.decided.endsWith(`Its 60 minutes ended at ${refusedHour.until}, so no other fix can be handed over, and it bounces as "not fixed in the hour".`)).toBe(true)

    const listed = await call('GET', '/api/worker/merges', asTheOffice)
    expect(listed.status, listed.raw).toBe(200)
    expect(listed.body['hourOver']).toContainEqual({ entry: none.id, until: noneHour.until, resolution: 'not fixed in the hour' })
    expect(listed.body['hourOver']).toContainEqual({ entry: refused.id, until: refusedHour.until, resolution: 'not fixed in the hour' })
    for (const [one, more] of [
      [none, `The 60 minutes its own supervisor had to fix the red tests ended at ${noneHour.until}, and no fix was handed over in it.`],
      [refused, `The 60 minutes its own supervisor had to fix the red tests ended at ${refusedHour.until}. The merge tool's check refused the last fix handed over, commit ${second.commit.slice(0, 12)} at ${secondAt}: ${says}`],
    ] as const) {
      const over = await call('POST', `/api/worker/merges/${one.id}/hour-over`, asTheOffice, {})
      expect(over.status, over.raw).toBe(200)
      expect(over.body.entry.state).toBe('bounced')
      const bounced = stored(one.id)['bounced']
      expect(bounced).toMatchObject({ reason: 'red', files: [], redTests: [T], log: LOG, mainAt, resolution: 'not fixed in the hour' })
      expect(bounced.says).toBe(`The tests stayed red on their own: ${T}. ${more}`)
    }
  })

  it('6. bounces it at once as red when its line says the tests cannot be fixed, and refuses "changesWhatOneSideMeant" for a red', async () => {
    const one = await aTestingEntry()
    await handedOn(one)
    const before = stored(one.id)
    const said = 'Synthetic: the test asks for what the change removes on purpose.'
    const meant = await call('POST', `/api/merge-queue/${one.id}/resolution`, asPerson, { cannot: said, changesWhatOneSideMeant: true })
    expect(meant.status, meant.raw).toBe(422)
    expect(meant.body.error).toBe(`Merge entry ${one.id} was handed on for its red tests, not for a conflict, so there are no two sides whose meaning could change. Say why the tests cannot be fixed without "changesWhatOneSideMeant". Nothing was written.`)
    expect(stored(one.id)).toEqual(before)

    const r = await call('POST', `/api/merge-queue/${one.id}/resolution`, asPerson, { cannot: said })
    expect(r.status, r.raw).toBe(200)
    const bounced = stored(one.id)['bounced']
    expect(bounced).toMatchObject({ reason: 'red', files: [], redTests: [T], log: LOG, mainAt, cannot: { by: { id: THE_TEST_OFFICES_OWNER.id }, said } })
    expect(bounced.resolution).toBeUndefined()
    expect(bounced.says.endsWith(`said its red tests cannot be fixed: "${said}" It was handed back from fixing its red tests: ${T}.`)).toBe(true)
    const [notice] = noticesAbout(one.run, 'anEntryBounced')
    expect(notice, 'the submitter is told').toBeDefined()
    expect(t.api.getRecord(notice!)!.title).toBe(`Bounced (red): merge entry ${one.id}`)
    expect(String(t.api.getRecord(notice!)!.data['body'])).toContain('Next: the red tests cannot be fixed, for the reason given above, so somebody must decide what happens to the change.')
  })

  it('7. pins and judges a fix the check passed, and refuses a pass of a fix without `fixed` or with places, and `fixed` on a conflict', async () => {
    const one = await aTestingEntry()
    await handedOn(one)
    const copy = await aFix(one)
    heldAtTheRef(one, copy)
    const ref = resolvedRefOf(one.id)
    const before = stored(one.id)
    for (const [facts, error] of [
      [{ commit: copy.commit, ok: true, ref, places: [] }, `Merge entry ${one.id} was handed on for its red tests, so a pass of its fix names the files the fix changes on top of the replay, in \`fixed\`. Nothing was written.`],
      [{ commit: copy.commit, ok: true, ref, places: [], morePlaces: 1, fixed: [FIX] }, `Merge entry ${one.id} was handed on for its red tests, and a fix resolves no conflict, so a pass of it lists no places. Nothing was written.`],
    ] as const) {
      const r = await step(one.id, 'resolution-checked', facts)
      expect(r.status, r.raw).toBe(422)
      expect(r.body.error).toBe(error)
      expect(stored(one.id)).toEqual(before)
    }
    const r = await fixPassed(one, copy)
    expect(r.status, r.raw).toBe(200)
    expect(r.body.decided.startsWith(
      `The merge tool's check passed the fix of the red tests, commit ${copy.commit.slice(0, 12)}, which changes 1 file on top of the replay (${FIX}), and ${ref} holds it. ` +
        'The entry is pinned again, to be judged as the pin step judges. ',
    )).toBe(true)
    const read = await entry(one.id)
    expect(read).toMatchObject({ state: 'judged' })
    expect(read.machine.resolution.checked).toEqual({ at: expect.stringMatching(STAMP), ref, places: [], fixed: [FIX] })

    // A CONFLICT'S RESOLUTION REPORTS NO `fixed`.
    const conflicted = await anEntry()
    const pinned = await withTheSettings([CONFLICT_RESOLVING], () => step(conflicted.id, 'pinned', { files: contentOf(conflicted.seal), cannotJoin: { mainAt, commit: conflicted.seal.commit, files: [A], lines: [{ path: A, ranges: '1-5' }] } }))
    expect(pinned.status, pinned.raw).toBe(200)
    expect(stored(conflicted.id)['state']).toBe('resolving')
    const folder = scratch('clean-copy')
    git(folder, 'clone', '-q', conflicted.dir, '.'); asTheFixture(folder)
    git(folder, 'switch', '-q', '--detach', mainAt)
    writeFileSync(join(folder, A), 'before\nresolved, keeping both sides\n'); git(folder, 'add', '.'); git(folder, 'commit', '-q', '-m', 'Synthetic resolution')
    const resolved = { folder, commit: git(folder, 'rev-parse', 'HEAD') }
    expect((await call('POST', `/api/merge-queue/${conflicted.id}/resolution`, asPerson, { workingDirectory: folder })).status).toBe(200)
    heldAtTheRef(conflicted, resolved)
    const beforeConflict = stored(conflicted.id)
    const place = {
      path: A, at: 1, entryCommit: conflicted.seal.commit, resolvedIn: resolved.commit,
      ancestor: { lines: ['before'], more: 0 }, main: { lines: ['before'], more: 0 },
      entry: { lines: ['before', `after, from ${basename(conflicted.dir)}`], more: 0 }, resolution: { lines: ['before', 'resolved, keeping both sides'], more: 0 },
      mainCommits: [], mainBy: 'lines',
    }
    const withFixed = await step(conflicted.id, 'resolution-checked', { commit: resolved.commit, ok: true, ref: resolvedRefOf(conflicted.id), places: [place], fixed: [A] })
    expect(withFixed.status, withFixed.raw).toBe(422)
    expect(withFixed.body.error).toBe(`Merge entry ${conflicted.id} was handed on for a conflict, and \`fixed\` names the files of a fix of red tests, so a pass of its resolution names none. Nothing was written.`)
    expect(stored(conflicted.id)).toEqual(beforeConflict)
    await call('POST', `/api/merge-queue/${conflicted.id}/withdraw`, asPerson, { because: 'Synthetic: the case is over.' })
  })

  describe('after a fix the check passed', () => {
    const INSPECTOR = { kind: 'agent', id: 'synthetic-inspector' } as const
    interface Integrated { clone: string; result: string; files: Record<string, string> }
    const hashAt = (dir: string, path: string) => createHash('sha256').update(execFileSync('git', ['-C', dir, 'cat-file', 'blob', `HEAD:${path}`])).digest('hex')
    /** THE INTEGRATED TREE AS THE ENTRY'S TURN LEAVES IT: a clone of the lane's repository at the fix held at the ref. */
    function integratedAt(one: One, copy: Copy): Integrated {
      const clone = scratch('integrated')
      git(clone, 'clone', '-q', root, '.'); asTheFixture(clone)
      git(clone, 'fetch', '-q', 'origin', resolvedRefOf(one.id))
      git(clone, 'switch', '-q', '--detach', copy.commit)
      const changed = git(clone, 'diff', '--name-only', mainAt, 'HEAD').split('\n').filter((path) => path !== '')
      return { clone, result: git(clone, 'rev-parse', 'HEAD'), files: Object.fromEntries(changed.map((path) => [path, hashAt(clone, path)])) }
    }
    /** THE SCOPED CHECK'S VERDICT, written on the check-again run as the check door writes it, and the queue told as the check door tells it. */
    async function theScopedCheck(asked: { run: string; only: string[] }, at: Integrated, verdict: 'released' | 'refused') {
      const sealId = t.api.getRecord(asked.run)!.data['sealedTip'] as string
      const sealHash = (t.api.getRecord(sealId)!.data['seal'] as { hash: string }).hash
      const read = { sealId, sealHash, worktree: at.clone, tip: at.result, ofItsOwn: true, only: asked.only, says: 'Synthetic scoped check fixture.' }
      writeAVerdictAsItsDoorWould(t, asked.run, verdict === 'released'
        ? { released: { by: INSPECTOR, at: '2026-10-24 08:00:00', how: 'an inspector', check: 'synthetic-check', read } }
        : { refused: { by: INSPECTOR, at: '2026-10-24 08:00:00', missing: ['Synthetic: the fix skips the red test.'], check: 'synthetic-check', read } })
      const { theMergeQueueHearsAVerdict } = await import('../src/server/lib/merge-state-machine.ts')
      return theMergeQueueHearsAVerdict({ runId: asked.run, workspaceId: 'default', actor: { type: 'agent', id: INSPECTOR.id } })
    }
    /** An entry of `servedBy` handed on for its red test, fixed, passed, judged and integrated at the fix: reinspecting. */
    async function reinspectingAfterAFix(servedBy?: string): Promise<{ one: One; copy: Copy; at: Integrated; decided: string; asked: Record<string, any> }> {
      const one = await aTestingEntry(servedBy)
      await handedOn(one)
      const copy = await aFix(one)
      heldAtTheRef(one, copy)
      expect((await fixPassed(one, copy)).body.entry.state).toBe('judged')
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const at = integratedAt(one, copy)
      expect(Object.keys(at.files).sort()).toEqual([A, FIX])
      const r = await step(one.id, 'integrated', { result: at.result, mainAt, clone: at.clone, files: at.files })
      expect(r.status, r.raw).toBe(200)
      expect(r.body.entry.state).toBe('reinspecting')
      return { one, copy, at, decided: r.body.decided, asked: r.body.entry.machine.reinspection }
    }
    const theItemFor = (one: One) => ({
      path: FIX,
      why: [
        `Merge entry ${one.id} was red only with its own change in ${T}, and its own supervisor fixed that by hand in this file, in a commit on top of the entry's own commits. ` +
          "The merge tool's check found that the fix leaves the entry's own commits as they were replayed. " +
          'It cannot tell whether the fix keeps what the entry meant and does not weaken, skip or delete a test: that is the judgment asked here. ' +
          'If it changes what the entry meant, or weakens, skips or deletes a test, refuse, and name what it changed.',
        "Related tests, the supervisor's own run, as declared: none was declared with this hand-over.",
      ].join('\n\n'),
    })

    it('8. asks a scoped check of each fixed file before the suite, with the question a fix asks, and a refusal bounces with no resolution word', async () => {
      const { one, at, decided, asked } = await reinspectingAfterAFix()
      expect(decided).toContain(`1 path keeps the verdict, and 1 path needs judging again (${FIX}). The supervisor fixed ${FIX} by hand, so it is in the scoped check whatever content the verdict read: a hand-over reaches the suite only after one. `)
      expect(asked.only).toEqual([FIX])
      expect(asked.needsJudgment).toEqual([theItemFor(one)])
      const refused = await theScopedCheck(asked as { run: string; only: string[] }, at, 'refused')
      expect(refused.moved).toEqual([{ entry: one.id, state: 'bounced', says: expect.any(String) }])
      const bounced = stored(one.id)['bounced']
      expect(bounced).toMatchObject({ reason: 'refused', files: [FIX], mainAt })
      expect(bounced.resolution).toBeUndefined()
      expect(bounced.says).not.toContain('changes what one side meant')
    })

    it('9. sends a red met again after a fix passed back to its own supervisor in the same minutes, replaying that fix', async () => {
      const folder = aSandbox(SUPERVISOR)
      const { one, copy, at, asked } = await reinspectingAfterAFix(SUPERVISOR)
      const hour = theHourOf(one.id)
      const first = stored(one.id)['resolving'].asked.message as string
      expect((await theScopedCheck(asked as { run: string; only: string[] }, at, 'released')).moved).toEqual([{ entry: one.id, state: 'testing', says: expect.any(String) }])
      const T2 = 'tests/synthetic-red-again.test.ts'
      const r = await handedOn(one, { ...RED_ONLY, redTests: [T2], redOnlyWithIt: [T2] })
      // The first hand-on wrote resolve-<id>.md, so the second brief takes the next free name.
      const brief = join(folder, 'briefs', `resolve-${one.id}-2.md`)
      const held = stored(one.id)
      const second = held['resolving'].asked.message as string
      expect(held['resolution']).toBeUndefined()
      expect(held['resolving']).toEqual({
        files: [],
        red: { tests: [T2] },
        log: LOG,
        mainAt,
        says: expect.stringContaining(`The tests stayed red on their own: ${T2}.`),
        since: hour.since,
        timeZone: hour.timeZone,
        minutes: 60,
        replays: { ref: resolvedRefOf(one.id), commit: copy.commit },
        asked: { agent: ids[SUPERVISOR], brief, message: expect.any(String), round: theOfficesAsk(SUPERVISOR) },
      })
      expect(r.body.decided.endsWith(
        `The fix its check passed, commit ${copy.commit.slice(0, 12)}, was red again, so it goes back to its own supervisor in the 60 minutes of its first hand-on, which are never started again: ` +
          `it ends at ${hour.until}. The clean copy replays that fix with the entry's own commits. The office wrote the fix brief at ${brief}. It asked in message ${second}.${theDoorAnswered(held['resolving'].asked)}`,
      )).toBe(true)
      expect(noticesAbout(one.run, 'askedToResolve')).toEqual([first, second])
      const text = readFileSync(brief, 'utf8')
      expect(text).toContain(`--ref ${resolvedRefOf(one.id)} --commit ${copy.commit} --main-at ${mainAt} --red ${T2} --into ${theCleanCopyOf(folder, `${one.id}-2`)}\n`)
      expect(text).toContain(`## What the clean copy replays\n\nA fix of this entry's red tests, commit ${copy.commit}, passed the merge tool's check, and ${root} holds it at ${resolvedRefOf(one.id)}.`)
    })

    it('10. sends a conflict met after a fix passed back to its own supervisor in the same minutes, replaying that fix', async () => {
      const folder = aSandbox(SUPERVISOR)
      const one = await aTestingEntry(SUPERVISOR)
      await handedOn(one)
      const hour = theHourOf(one.id)
      const copy = await aFix(one)
      heldAtTheRef(one, copy)
      expect((await fixPassed(one, copy)).body.entry.state).toBe('judged')
      expect((await step(one.id, 'integrating', {})).status).toBe(200)
      const elsewhere = 'd4'.repeat(20)
      const r = await withTheSettings([CONFLICT_RESOLVING], () => step(one.id, 'conflict', { files: [A], mainAt: elsewhere }))
      expect(r.status, r.raw).toBe(200)
      // The red's hand-on wrote resolve-<id>.md, so the conflict's brief takes the next free name.
      const brief = join(folder, 'briefs', `resolve-${one.id}-2.md`)
      const held = stored(one.id)
      expect(held['state']).toBe('resolving')
      expect(held['resolution']).toBeUndefined()
      expect(held['resolving']).toEqual({
        files: [A],
        mainAt: elsewhere,
        says: `It could not be put on top of the main world: a conflict the tool does not resolve. Files: ${A}.`,
        since: hour.since,
        timeZone: hour.timeZone,
        minutes: 60,
        replays: { ref: resolvedRefOf(one.id), commit: copy.commit },
        asked: { agent: ids[SUPERVISOR], brief, message: expect.any(String), round: theOfficesAsk(SUPERVISOR) },
      })
      expect(r.body.decided).toBe(
        `Conflict in ${A}. The fix of its red tests its check passed, commit ${copy.commit.slice(0, 12)}, met this conflict, so it goes back to its own supervisor in the 60 minutes of its first hand-on, which are never started again: ` +
          `it ends at ${hour.until}. The clean copy replays that fix with the entry's own commits. The office wrote the resolve brief at ${brief}. It asked in message ${held['resolving'].asked.message}.${theDoorAnswered(held['resolving'].asked)}`,
      )
      const text = readFileSync(brief, 'utf8')
      expect(text.startsWith(`# Resolve the conflict of merge entry ${one.id}\n`)).toBe(true)
      expect(text).toContain(`--ref ${resolvedRefOf(one.id)} --commit ${copy.commit} --main-at ${elsewhere} --files ${A} --into ${theCleanCopyOf(folder, `${one.id}-2`)}\n`)
      expect(text).toContain(`## What the clean copy replays\n\nA fix of this entry's red tests, commit ${copy.commit}, passed the merge tool's check, and ${root} holds it at ${resolvedRefOf(one.id)}.`)
      expect(text).not.toContain('## What was resolved before')
    })
  })
})
