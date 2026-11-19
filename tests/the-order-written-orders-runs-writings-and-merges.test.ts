// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S LAST SANDBOX RUN, WHAT IT WROTE, AND WHETHER A LATER RUN MERGED AFTER A RUN ENDED ARE READ IN THE ORDER
 * THEY WERE WRITTEN, NOT BY THEIR TIMES IN WORDS (wave 13n round AB, item 2s).
 *
 * A record's `created_at`, a seal's `sealedAt` and a merge receipt's `at` are the office's local time in words, with no
 * offset. On the night the clocks go back in Europe/London (25 October 2026), the hour from 01:00 comes twice, and
 * words written at 01:10 winter time sort before words written twenty minutes earlier, at 01:50 summer time. The change
 * log numbers each row it appends (`append_order`). A record's create row holds the place it was written in, and an
 * update row the place a field was written in. These three readers now use those places, as the seal does since round Z:
 *
 *   - the next-round door's agent's newest sandbox run (src/server/lib/next-round.ts `theLastSandboxRunOf`), which the
 *     merge queue writes a resolve brief into;
 *   - the inspector's list of what an agent wrote (src/server/lib/inspection.ts `everythingThisAgentWrote`);
 *   - the settlement reading of an owed run (src/server/lib/inspection.ts `howARunWouldSettle`), which takes as a
 *     candidate only a later run merged after this run ended.
 *
 * WHAT IS PROVED, against a throwaway database, with this process's zone set to Europe/London and its clock set here:
 *
 *   1. An agent's sandbox runs filed at 01:50 summer time and at 01:10 winter time: the newest is the one filed second.
 *   2. An agent's sandbox run with no create row has no place in that order. The door answers 500 and names the run; it
 *      does not take the newest by its time in words.
 *   3. Two notes an agent wrote at those two moments are listed newest first in the order written.
 *   4. A run sealed at 01:50 summer time, and a later run holding its work merged at 01:10 winter time: the later run
 *      merged after the seal, and the earlier run settles as superseded by it.
 *   5. The reverse: a later run merged at 01:50 summer time, before a run sealed at 01:10 winter time. It did not merge
 *      after that run ended, so it is no candidate, and the run settles as closed unchecked.
 *   6. A seal with no create row: the end of the run has no place, and the reading says it could not be read and names
 *      the seal. It does not compare the time in words instead.
 *   7. A later run's merge receipt with no write of it in the change log: the reading says it could not be read and
 *      names that later run.
 *   8. A run with no seal, whose legacy `finishedAt` has no write in the change log: the reading says it could not be
 *      read.
 *   9. Control, green before and after: on 28 March 2027 the hour from 01:00 is skipped, and runs, notes and a merge
 *      written either side of it keep their order in all three readers.
 *  10. No query in the next-round door's file or the inspection file orders by `created_at`.
 *
 * MUTATION PROOF (each after a red control at the code before; each turns the cases named red, and restoring it turns
 * them green):
 *
 *   - In src/server/lib/next-round.ts, `theLastSandboxRunOf` orders by `created_at DESC` again. Cases 1, 2 and 10 go
 *     red: case 2's run with no place no longer comes first.
 *   - In src/server/lib/inspection.ts, `everythingThisAgentWrote` orders by `r.created_at DESC` again. Cases 3 and 10 go
 *     red.
 *   - In src/server/lib/inspection.ts, `howARunWouldSettle` compares the receipt's `at` with the seal's `sealedAt` as
 *     words again. Cases 4 and 5 go red.
 *   - In src/server/lib/next-round.ts, a run with no place is taken as it comes. Case 2 goes red.
 *   - In src/server/lib/inspection.ts, `howARunWouldSettle` names no end with no place. Cases 6 and 8 go red.
 *   - In src/server/lib/inspection.ts, `howARunWouldSettle` passes over a merge with no place without naming it. Case 7
 *     goes red.
 *
 * Every record, agent and repository here is a synthetic fixture in a throwaway database and a scratch folder, written
 * through the records door, except the change-log rows cases 2, 6 and 7 delete to leave a write with no place, the legacy
 * finish case 8 writes into the data with no change row, and the release and merge of a later run, which are written as
 * their doors would write them.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { clockStamp } from '../src/shared/time.ts'
import type { HowARunWouldSettle } from '../src/server/lib/inspection.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = 'default'
const SECRETARY = 'order-settle-secretary'
const STARTER = 'order-settle-starter'
const WORKER = 'order-settle-worker'
const WAVE = 'order-settle-wave'
const UNPLACED = 'order-settle-unplaced'
const WRITER = 'order-settle-writer'

/** 01:50 summer time, 25 October 2026, in the first pass of the repeated hour. */
const FIRST_PASS = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 01:10 winter time, twenty minutes later, in the second pass. */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:59:59 winter time, 28 March 2027, the last second before the skipped hour. */
const BEFORE_THE_GAP = Date.UTC(2027, 2, 28, 0, 59, 59)
/** 02:00:00 summer time, one second later. */
const AFTER_THE_GAP = Date.UTC(2027, 2, 28, 1, 0, 0)
const A_MINUTE = 60_000

const made = mkdtempSync(join(tmpdir(), 'mole-office-order-settle-'))
const home = join(made, 'home')
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const asThePerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const as = (handle: string, key?: string) => ({
  'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

let t: TestDb
let app: FastifyInstance
let theZoneBefore: string | undefined
let theHomeBefore: string | undefined
let nextRound: typeof import('../src/server/lib/next-round.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
let mergeDoor: typeof import('../src/server/lib/merge-entry-door.ts')
const agents = new Map<string, { id: string; key: string }>()
let n = 0

const A_SANDBOX = { sandbox: { template: 'synthetic-template', container: 'synthetic-row', folder: '/synthetic/sandbox-folder' } }

async function register(handle: string, role: string, starter?: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starter === undefined ? asThePerson : as(starter),
    payload: { handle, name: `Synthetic ${handle}`, role, ...(role === 'secretary' ? {} : { workArea: ['work'] }) } })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  agents.set(handle, { id, key: reply.json<{ whatToGiveIt: { key: string } }>().whatToGiveIt.key })
}

/** A sandbox run of this agent, filed by the person at this moment. Synthetic. */
function aSandboxRunAt(at: number, handle: string, title: string): string {
  vi.setSystemTime(at)
  return t.api.createRecord({
    workspaceId: WORKSPACE, kind: 'session', title, origin: 'fixture', actor: person,
    data: { state: 'running', servingAgent: handle, cutFrom: 'main', ...A_SANDBOX },
  }).id
}

/** A run of the writer, filed by the person at this moment, outside a sandbox. Synthetic. */
function aRunOfTheWriterAt(at: number, title: string): string {
  vi.setSystemTime(at)
  return t.api.createRecord({
    workspaceId: WORKSPACE, kind: 'session', title, origin: 'fixture', actor: person, data: { state: 'running', servingAgent: WRITER },
  }).id
}

/** A note the writer files at this moment. Synthetic. */
function aNoteAt(at: number, title: string): string {
  vi.setSystemTime(at)
  return t.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title, origin: 'fixture', actor: { type: 'agent', id: WRITER }, data: {} }).id
}

/** Take a record's create row out of the change log, so the place it was written in is not recorded. */
function forgetThePlaceOf(id: string): void {
  const gone = t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(id)
  expect(gone.changes, `the create row of ${id}`).toBe(1)
}

/** Take every write of one key of a record's data out of the change log. */
function forgetTheWritesOf(id: string, key: string): void {
  const gone = t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'update' AND (field = ? OR field LIKE ?)").run(id, `data.${key}`, `data.${key}.%`)
  expect(gone.changes, `the writes of ${key} on ${id}`).toBeGreaterThan(0)
}

/** What `call` threw, or null. */
function whatIsThrownBy(call: () => unknown): { status?: number; message?: string } | null {
  try {
    call()
    return null
  } catch (error) {
    return error as { status?: number; message?: string }
  }
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}
function commit(dir: string, text: string, message: string): string {
  writeFileSync(join(dir, 'work', 'a.txt'), text)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', message)
  return git(dir, 'rev-parse', 'HEAD')
}

/**
 * A scratch repository with one worker commit on a worker branch, and a wave branch made at that commit, so the wave's
 * tip holds the worker's work (the superseded door's `ancestor` proof).
 */
function aLane(): { dir: string; worker: string; wave: string } {
  const dir = join(made, `lane-${String(++n)}`)
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-qb', 'main')
  git(dir, 'config', 'user.name', 'Synthetic order-settle fixture')
  git(dir, 'config', 'user.email', 'order-settle@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  commit(dir, 'line before\n', 'Synthetic base')
  const worker = join(made, `worker-${String(n)}`)
  git(dir, 'worktree', 'add', '-qb', `worker-${String(n)}`, worker, 'main')
  const first = commit(worker, 'line from worker\n', 'Synthetic worker change')
  const wave = join(made, `wave-${String(n)}`)
  git(dir, 'worktree', 'add', '-qb', `wave-${String(n)}`, wave, first)
  return { dir, worker, wave }
}

/** A run of this agent in this folder, filed and sealed through the records door at this moment. Synthetic. */
async function aSealedRunAt(at: number, handle: string, directory: string): Promise<string> {
  vi.setSystemTime(at)
  const created = await app.inject({ method: 'POST', url: '/api/records', headers: as(handle), payload: {
    kind: 'session', title: `Synthetic sealed run ${String(++n)}`,
    data: { state: 'running', servingAgent: handle, workingDirectory: directory, cutFrom: 'main' },
  } })
  expect(created.statusCode, created.body).toBe(201)
  const id = created.json<{ record: { id: string } }>().record.id
  const ended = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: as(handle), payload: { dataPatch: { state: 'finished' } } })
  expect(ended.statusCode, ended.body).toBe(200)
  return id
}

/** The later run released, confirmed and merged, its receipt written at this moment as the merge queue writes it. */
function mergedAt(at: number, id: string, lane: string): void {
  const seal = String(t.api.getRecord(id)!.data['sealedTip'])
  const hash = (t.api.getRecord(seal)!.data['seal'] as { hash: string }).hash
  const secretary = { kind: 'agent' as const, id: agents.get(SECRETARY)!.id }
  writeAVerdictAsItsDoorWould(t, id, {
    released: { by: secretary, at: '2090-01-01 12:00:00', how: 'an inspector',
      read: { sealId: seal, sealHash: hash, worktree: made, ofItsOwn: true, says: 'Synthetic release of this seal.' } },
    confirmed: { by: secretary, at: '2090-01-01 12:00:00', because: 'Synthetic confirmation.' },
  })
  vi.setSystemTime(at)
  const entry = mergeDoor.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', origin: 'fixture', workspaceId: WORKSPACE,
    title: `Synthetic merge of ${id}`, data: { run: id, seal: { id: seal, hash: 'fixture' },
      changeset: { adapter: 'git', root: lane, repository: lane, branch: 'wave', commit: 'c', base: 'b' },
      state: 'merged', submittedBy: secretary }, actor: inspection.THE_OFFICE,
  })).id
  t.api.patchRecord(id, { dataPatch: { integrated: { entry, mainBefore: 'b', mainAfter: 'c', rebasedTip: null, sealId: seal, at: clockStamp().stamp } } }, inspection.THE_OFFICE)
}

/** Move the lane's main to the wave's tip, as the merge did. */
function landTheWave(lane: { dir: string; wave: string }): void {
  git(lane.dir, 'merge', '-q', '--ff-only', git(lane.wave, 'rev-parse', 'HEAD'))
}

async function howItWouldSettle(id: string): Promise<HowARunWouldSettle> {
  const secretary = agents.get(SECRETARY)!
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${id}/how-it-would-settle`, headers: as(SECRETARY, secretary.key) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json<HowARunWouldSettle>()
}

const sealedAtOf = (run: string): string => (t.api.getRecord(String(t.api.getRecord(run)!.data['sealedTip']))!.data['seal'] as { sealedAt: string }).sealedAt
const mergedAtOf = (run: string): string => (t.api.getRecord(run)!.data['integrated'] as { at: string }).at

beforeAll(async () => {
  theZoneBefore = process.env.TZ
  theHomeBefore = process.env.HOME
  process.env.TZ = 'Europe/London'
  mkdirSync(home)
  process.env.HOME = home
  t = await freshDb()
  app = (await apiApp()).app
  nextRound = await import('../src/server/lib/next-round.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  mergeDoor = await import('../src/server/lib/merge-entry-door.ts')
  await register(SECRETARY, 'secretary')
  await register(STARTER, 'supervisor')
  await register(WORKER, 'worker', STARTER)
  await register(WAVE, 'supervisor', SECRETARY)
  await register(UNPLACED, 'worker', SECRETARY)
  await register(WRITER, 'worker', SECRETARY)
  vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS })
}, 60_000)

afterEach(() => {
  vi.setSystemTime(FIRST_PASS)
})

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  rmSync(made, { recursive: true, force: true })
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
  if (theHomeBefore === undefined) delete process.env.HOME
  else process.env.HOME = theHomeBefore
})

describe('in the hour the clocks go back', () => {
  it("1: takes as an agent's newest sandbox run the one filed second, at 01:10 winter time", () => {
    const first = aSandboxRunAt(FIRST_PASS, WORKER, 'Synthetic sandbox run filed at 01:50 summer time')
    const second = aSandboxRunAt(SECOND_PASS, WORKER, 'Synthetic sandbox run filed at 01:10 winter time')
    // THE CASE MEANS SOMETHING ONLY IF THE SECOND RUN'S WORDS SORT BEFORE THE FIRST'S.
    expect(t.api.getRecord(second)!.createdAt < t.api.getRecord(first)!.createdAt).toBe(true)
    expect(nextRound.theLastSandboxRunOf(agents.get(WORKER)!.id, WORKER, WORKSPACE)?.id).toBe(second)
  })

  it('2: answers 500 naming a sandbox run with no create row, rather than take the newest by its time in words', () => {
    aSandboxRunAt(FIRST_PASS, UNPLACED, 'Synthetic placed sandbox run')
    const unplaced = aSandboxRunAt(SECOND_PASS, UNPLACED, 'Synthetic sandbox run with no place')
    forgetThePlaceOf(unplaced)
    const thrown = whatIsThrownBy(() => nextRound.theLastSandboxRunOf(agents.get(UNPLACED)!.id, UNPLACED, WORKSPACE))
    expect(thrown?.status, JSON.stringify(thrown)).toBe(500)
    expect(thrown?.message).toContain(unplaced)
  })

  it('3: lists what an agent wrote newest first in the order written', () => {
    const first = aNoteAt(FIRST_PASS, 'Synthetic note written at 01:50 summer time')
    const second = aNoteAt(SECOND_PASS, 'Synthetic note written at 01:10 winter time')
    expect(t.api.getRecord(second)!.createdAt < t.api.getRecord(first)!.createdAt).toBe(true)
    const run = aRunOfTheWriterAt(SECOND_PASS, 'Synthetic run of the writer')
    const wrote = inspection.whatTheInspectorReads(run, WORKSPACE).wrote.map((one) => one.id).filter((id) => id === first || id === second)
    expect(wrote).toEqual([second, first])
  })

  it('4: a later run merged at 01:10 winter time, after a seal at 01:50 summer time, supersedes the sealed run', async () => {
    const lane = aLane()
    const earlier = await aSealedRunAt(FIRST_PASS, WORKER, lane.worker)
    const later = await aSealedRunAt(FIRST_PASS + A_MINUTE, WAVE, lane.wave)
    landTheWave(lane)
    mergedAt(SECOND_PASS, later, lane.dir)
    // THE CASE MEANS SOMETHING ONLY IF THE MERGE'S WORDS SORT BEFORE THE SEAL'S.
    expect(mergedAtOf(later) < sealedAtOf(earlier), `${sealedAtOf(earlier)} then ${mergedAtOf(later)}`).toBe(true)
    expect((await howItWouldSettle(earlier)).settlement).toMatchObject({ way: 'superseded', by: later })
  })

  it('5: a later run merged at 01:50 summer time, before a seal at 01:10 winter time, is no candidate', async () => {
    const lane = aLane()
    const later = await aSealedRunAt(FIRST_PASS - A_MINUTE, WAVE, lane.wave)
    mergedAt(FIRST_PASS, later, lane.dir)
    const earlier = await aSealedRunAt(SECOND_PASS, WORKER, lane.worker)
    landTheWave(lane)
    // THE CASE MEANS SOMETHING ONLY IF THE MERGE'S WORDS SORT AFTER THE SEAL'S.
    expect(mergedAtOf(later) > sealedAtOf(earlier), `${mergedAtOf(later)} then ${sealedAtOf(earlier)}`).toBe(true)
    expect((await howItWouldSettle(earlier)).settlement).toMatchObject({ way: 'closed unchecked' })
  })

  it('6: a seal with no create row leaves the run unsettled, and the reading names the seal', async () => {
    const lane = aLane()
    const earlier = await aSealedRunAt(FIRST_PASS, WORKER, lane.worker)
    const later = await aSealedRunAt(FIRST_PASS + A_MINUTE, WAVE, lane.wave)
    landTheWave(lane)
    mergedAt(FIRST_PASS + 2 * A_MINUTE, later, lane.dir)
    const seal = String(t.api.getRecord(earlier)!.data['sealedTip'])
    forgetThePlaceOf(seal)
    const settlement = (await howItWouldSettle(earlier)).settlement
    expect(settlement).toMatchObject({ way: 'could not be read' })
    expect(settlement && 'candidates' in settlement ? settlement.candidates : null).toEqual([{ by: null, because: expect.stringContaining(seal) as unknown }])
  })

  it("7: a later run's merge receipt with no write in the change log leaves the run unsettled, and the reading names the later run", async () => {
    const lane = aLane()
    const earlier = await aSealedRunAt(FIRST_PASS, WORKER, lane.worker)
    const later = await aSealedRunAt(FIRST_PASS + A_MINUTE, WAVE, lane.wave)
    landTheWave(lane)
    mergedAt(FIRST_PASS + 2 * A_MINUTE, later, lane.dir)
    forgetTheWritesOf(later, 'integrated')
    const settlement = (await howItWouldSettle(earlier)).settlement
    expect(settlement).toMatchObject({ way: 'could not be read' })
    expect(settlement && 'candidates' in settlement ? settlement.candidates.map((one) => one.by) : null).toEqual([later])
  })

  it('8: a run with no seal whose finish has no write in the change log is left unsettled', async () => {
    vi.setSystemTime(FIRST_PASS)
    const created = await app.inject({ method: 'POST', url: '/api/records', headers: as(WORKER), payload: {
      kind: 'session', title: 'Synthetic run with no seal', data: { state: 'running', servingAgent: WORKER },
    } })
    expect(created.statusCode, created.body).toBe(201)
    const run = created.json<{ record: { id: string } }>().record.id
    // A LEGACY UNSEALED RUN, written as historical fixture data without asking for a new seal. A session no longer takes
    // a `finishedAt` through the records door, so the old finish is written here as the data holds it, with no change row.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished', '$.finishedAt', ?) WHERE id = ?").run(clockStamp().stamp, run)
    const settlement = (await howItWouldSettle(run)).settlement
    expect(settlement).toMatchObject({ way: 'could not be read' })
    expect(settlement && 'candidates' in settlement ? settlement.candidates : null).toEqual([{ by: null, because: expect.stringContaining('finishedAt') as unknown }])
  })
})

describe('either side of the hour the clocks skip', () => {
  it('9: control: runs, notes and a merge written either side of it keep their order', async () => {
    const before = aSandboxRunAt(BEFORE_THE_GAP, WORKER, 'Synthetic sandbox run filed before the skipped hour')
    const after = aSandboxRunAt(AFTER_THE_GAP, WORKER, 'Synthetic sandbox run filed after the skipped hour')
    expect(before).not.toBe(after)
    expect(nextRound.theLastSandboxRunOf(agents.get(WORKER)!.id, WORKER, WORKSPACE)?.id).toBe(after)

    const first = aNoteAt(BEFORE_THE_GAP, 'Synthetic note written before the skipped hour')
    const second = aNoteAt(AFTER_THE_GAP, 'Synthetic note written after the skipped hour')
    const run = aRunOfTheWriterAt(AFTER_THE_GAP, 'Synthetic later run of the writer')
    expect(inspection.whatTheInspectorReads(run, WORKSPACE).wrote.map((one) => one.id).filter((id) => id === first || id === second)).toEqual([second, first])

    const lane = aLane()
    const earlier = await aSealedRunAt(BEFORE_THE_GAP, WORKER, lane.worker)
    const later = await aSealedRunAt(BEFORE_THE_GAP, WAVE, lane.wave)
    landTheWave(lane)
    mergedAt(AFTER_THE_GAP, later, lane.dir)
    expect((await howItWouldSettle(earlier)).settlement).toMatchObject({ way: 'superseded', by: later })
  })

  it('10: no query in the next-round door or the inspection file orders by created_at', () => {
    for (const file of ['src/server/lib/next-round.ts', 'src/server/lib/inspection.ts']) {
      const source = readFileSync(join(REPO, file), 'utf8')
      expect(source.match(/ORDER BY[^'"`;]*created_at/g) ?? [], file).toEqual([])
    }
  })
})
