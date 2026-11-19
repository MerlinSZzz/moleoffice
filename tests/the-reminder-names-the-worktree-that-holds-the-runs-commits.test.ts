// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REMINDER BEFORE THE SEAL NAMES ANOTHER WORKTREE THAT HOLDS THE RUN'S OWN COMMITS (wave 13n, item 2x). Twice on
 * 26 October a run sealed from another worktree than the one its record's workingDirectory names. A conversation begun
 * in one round's worktree went on in a new worktree, and the reminder read the old one, judged none of the round's
 * commits and said nothing was wrong. A run adopted with the earlier round's worktree was sealed from its own. The seal
 * reads the record's workingDirectory, so the reminder now says so, by name, before the seal: both paths, the commits
 * found and the fix. It stays a reminder and never refuses, as decided for every reminder item but a migration.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A continued conversation in a new worktree. The record names the old round's worktree, whose HEAD holds only
 *      commits written before the run started. The run commits in a new worktree and sends the write that seals it with
 *      that worktree's HEAD as its tip. The reminder names both paths, the new worktree's branch, its commits and the
 *      fix, and stores nothing. A worker's worktree with commits since the start is not named, because the tip names
 *      one worktree. The same write again is answered by the seal itself, not by the reminder. The write that corrects
 *      the workingDirectory seals, and the seal's record of the reminder says the item is no longer found.
 *   2. An adopted run sealed elsewhere. The record still names the worktree it was filed for. The run commits in its
 *      own worktree and sends a write that names no tip, which the seal reads as the named worktree's HEAD. The
 *      reminder names the worktree that holds the commits written since the start. The same write again seals the
 *      named worktree, as a reminder never refuses, and the seal's record says the item is still found.
 *   3. Two worktrees hold commits written since the start and the write names no tip: both are named, and the reminder
 *      says the office cannot tell which holds this run's work.
 *   4. A write that names the new worktree and the tip together is judged on that worktree: no other worktree is named,
 *      and the new worktree's own test file is.
 *   5. A record that names the worktree holding its commits gets no such item, though a worker's worktree holds
 *      commits written since the start too.
 *   6. When the office could not look at the other worktrees, the reminder says so among what it did not check.
 *
 * Every repository is made here in the system's temporary folder; every key is made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   - the other worktrees never looked at: cases 1, 2 and 3 go red;
 *   - the reminder judging the run as stored rather than as the write would store it: case 4 goes red;
 *   - the write's tip not handed to the look, so it looks by the commits written since the start: case 1 goes red;
 *   - the seal's comparison not looking at the other worktrees: case 2 goes red at the seal's record;
 *   - what could not be looked at left out of what was not checked: case 6 goes red.
 */

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readRemindedBeforeTheSeal } from '../src/shared/before-the-seal.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ALikelyRefusal, TheFactsBeforeTheSeal } from '../src/server/lib/before-the-seal.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-in-another-worktree'
const MINUTE = 60_000

let t: TestDb
let app: FastifyInstance
let judge: typeof import('../src/server/lib/before-the-seal.ts')['whatAnInspectorWouldMostLikelyRefuse']
const directories: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** A commit written at `at` (milliseconds), by author time and commit time, so whose it is does not hang on the clock. */
function commitAt(dir: string, at: number, file: string, text: string, subject: string): string {
  mkdirSync(dirname(join(dir, file)), { recursive: true })
  writeFileSync(join(dir, file), text)
  git(dir, 'add', '.')
  const date = `@${Math.floor(at / 1000)} +0000`
  execFileSync('git', ['-C', dir, 'commit', '-qm', subject], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
  return git(dir, 'rev-parse', 'HEAD')
}

interface AWorktree { path: string; branch: string; head: string; commits: string[] }

/**
 * A made-up repository as a sandbox holds one: its checkout on main, and the earlier round's worktree, whose one commit
 * was written an hour before `start`. `more` names the other worktrees to make, each cut from main, with the commits
 * written in it after `start`.
 */
function aSandbox(start: number, more: { name: string; commits: number }[]): { main: string; old: AWorktree; others: Record<string, AWorktree> } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-another-worktree-')))
  directories.push(root)
  const main = join(root, 'repo')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.name', 'Synthetic worktree test')
  git(main, 'config', 'user.email', 'worktree@example.invalid')
  git(main, 'config', 'commit.gpgsign', 'false')
  commitAt(main, start - 120 * MINUTE, 'work/a.txt', 'main\n', 'Synthetic commit on main')
  const worktree = (name: string, written: number[]): AWorktree => {
    const path = join(root, name)
    const branch = `synthetic-${name}`
    git(main, 'worktree', 'add', '-q', '-b', branch, path, 'main')
    const commits = written.map((at, n) => commitAt(path, at, `work/${name}-${n}.test.ts`, `it("${name} ${n}", () => {})\n`, `Synthetic commit ${n + 1} in ${name}`))
    return { path, branch, head: git(path, 'rev-parse', 'HEAD'), commits }
  }
  const old = worktree('old-round', [start - 60 * MINUTE])
  const others = Object.fromEntries(more.map(({ name, commits }) => [name, worktree(name, Array.from({ length: commits }, (_, n) => start + (5 + n) * MINUTE))]))
  return { main, old, others }
}

/** The run, filed by the office's worker as a launcher files one, naming `directory` and its HEAD, started at `start`. */
async function aRunIn(directory: string, start: number, title: string): Promise<{ id: string; key: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title,
      data: {
        state: 'running',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        servingAgent: HANDLE,
        doing: 'sealing',
        workingDirectory: directory,
        cutFrom: 'main',
        tip: git(directory, 'rev-parse', 'HEAD'),
        startedAt: localStamp(new Date(start)),
      },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  return { id: body.record.id, key }
}

interface TheReminder { sealed: false; items: ALikelyRefusal[]; notChecked: string[] }

async function write(run: { id: string; key: string }, dataPatch: Record<string, unknown>): Promise<{ statusCode: number; body: string; reminder: TheReminder | null }> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key), payload: { dataPatch } })
  const reminder = reply.statusCode === 200 ? ((reply.json() as { beforeTheSeal?: TheReminder }).beforeTheSeal ?? null) : null
  return { statusCode: reply.statusCode, body: reply.body, reminder: reminder !== null && reminder.sealed === false ? reminder : null }
}

/** The reminder's items that name `path`: a worktree is named by its path, wherever the item puts it. */
const theItemsNaming = (reminder: TheReminder, path: string): ALikelyRefusal[] => reminder.items.filter((one) => one.says.includes(path))

const short = (commit: string): string => commit.slice(0, 9)

/** The run as stored: still running and never sealed, so nothing of a reminded write was kept. */
function expectNothingStored(id: string): void {
  const stored = t.api.getRecord(id)!
  expect(stored.data['state']).toBe('running')
  expect(stored.data['sealedTip']).toBeUndefined()
}

function theSealsRecordOf(id: string) {
  const line = readRemindedBeforeTheSeal(t.api.getRecord(id)!.data['remindedBeforeTheSeal'])
  if (line === null || !line.reminded || line.atTheSeal === null) throw new Error(`no seal on the line: ${JSON.stringify(line)}`)
  return line.atTheSeal
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: the reminder reads the chapters against them.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  judge = (await import('../src/server/lib/before-the-seal.ts')).whatAnInspectorWouldMostLikelyRefuse
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('the record names one worktree and the run committed in another', () => {
  it('1: a continued conversation in a new worktree is named by the tip it seals; the fix seals and the item is no longer found', async () => {
    const start = Date.now() - 30 * MINUTE
    const { old, others } = aSandbox(start, [{ name: 'new-round', commits: 2 }, { name: 'a-worker', commits: 1 }])
    const fresh = others['new-round']!
    const worker = others['a-worker']!
    const run = await aRunIn(old.path, start, 'Synthetic conversation continued in a new worktree')
    await aReportInForm(t, run.id, HANDLE)

    const first = await write(run, { state: 'finished', tip: fresh.head })
    expect(first.statusCode, first.body.slice(0, 800)).toBe(200)
    if (first.reminder === null) throw new Error(`the first sealing write was not reminded: ${first.body.slice(0, 800)}`)
    const [item, ...more] = theItemsNaming(first.reminder, fresh.path)
    expect(more, 'one item names the worktree that holds the commits').toEqual([])
    if (item === undefined) throw new Error(`no item names ${fresh.path}: ${JSON.stringify(first.reminder.items)}`)
    expect(item.about).toBe('commit')
    expect(item.mechanical, 'a reminder, never a refusal: the item is likely, so even block does not refuse it').toBe(false)
    for (const fact of [old.path, fresh.path, fresh.branch, 'workingDirectory', ...fresh.commits.map(short)]) expect(item.says).toContain(fact)
    expect(item.says, 'the tip names one worktree, so a worker\'s worktree is not named').not.toContain(worker.path)
    expectNothingStored(run.id)

    // THE SAME WRITE AGAIN IS NOT REMINDED AND NOT REFUSED BY THE REMINDER: the seal reads the named worktree and refuses
    // the tip it does not hold, naming both commits.
    const again = await write(run, { state: 'finished', tip: fresh.head })
    expect(again.statusCode, again.body.slice(0, 800)).toBe(409)
    expect(again.reminder).toBeNull()
    expect(again.body).toContain(fresh.head)
    expect(again.body).toContain(old.commits[0]!)
    expectNothingStored(run.id)

    const fixed = await write(run, { state: 'finished', tip: fresh.head, workingDirectory: fresh.path })
    expect(fixed.statusCode, fixed.body.slice(0, 800)).toBe(200)
    expect(t.api.getRecord(run.id)!.data['sealedTip']).toEqual(expect.any(String))
    expect(theSealsRecordOf(run.id).noLongerFound).toContain(item.key)
  })

  it('2: an adopted run sealed with no tip is named by the commits written since its start; the seal goes ahead and the item is still found', async () => {
    const start = Date.now() - 30 * MINUTE
    const { old, others } = aSandbox(start, [{ name: 'its-own', commits: 2 }])
    const own = others['its-own']!
    const run = await aRunIn(old.path, start, 'Synthetic adopted run sealed from its own worktree')
    await aReportInForm(t, run.id, HANDLE)

    const first = await write(run, { state: 'finished' })
    expect(first.statusCode, first.body.slice(0, 800)).toBe(200)
    if (first.reminder === null) throw new Error(`the first sealing write was not reminded: ${first.body.slice(0, 800)}`)
    const [item, ...more] = theItemsNaming(first.reminder, own.path)
    expect(more).toEqual([])
    if (item === undefined) throw new Error(`no item names ${own.path}: ${JSON.stringify(first.reminder.items)}`)
    expect(item.mechanical).toBe(false)
    for (const fact of [old.path, own.path, own.branch, ...own.commits.map(short)]) expect(item.says).toContain(fact)
    expectNothingStored(run.id)

    // A REMINDER NEVER REFUSES: the same write seals the worktree the record names, with none of the run's commits.
    const again = await write(run, { state: 'finished' })
    expect(again.statusCode, again.body.slice(0, 800)).toBe(200)
    expect(t.api.getRecord(run.id)!.data['sealedTip']).toEqual(expect.any(String))
    expect(theSealsRecordOf(run.id).stillFound).toContain(item.key)
  })

  it('3: two worktrees with commits since the start, and no tip: both are named, and the reminder says it cannot tell which', async () => {
    const start = Date.now() - 30 * MINUTE
    const { old, others } = aSandbox(start, [{ name: 'one', commits: 1 }, { name: 'two', commits: 2 }])
    const run = await aRunIn(old.path, start, 'Synthetic run with two worktrees since its start')
    const first = await write(run, { state: 'finished' })
    if (first.reminder === null) throw new Error(`the first sealing write was not reminded: ${first.body.slice(0, 800)}`)
    const items = theItemsNaming(first.reminder, others['one']!.path)
    expect(items).toHaveLength(1)
    for (const fact of [others['two']!.path, ...others['one']!.commits.map(short), ...others['two']!.commits.map(short)]) expect(items[0]!.says).toContain(fact)
    expect(items[0]!.says).toMatch(/cannot tell/u)
  })
})

describe('no other worktree is named when the record names the one with the commits', () => {
  it('4: a write naming the new worktree and the tip together is judged on that worktree', async () => {
    const start = Date.now() - 30 * MINUTE
    const { old, others } = aSandbox(start, [{ name: 'named-in-the-write', commits: 1 }])
    const fresh = others['named-in-the-write']!
    const run = await aRunIn(old.path, start, 'Synthetic run that names its worktree in the sealing write')
    const first = await write(run, { state: 'finished', tip: fresh.head, workingDirectory: fresh.path })
    if (first.reminder === null) throw new Error(`the first sealing write was not reminded: ${first.body.slice(0, 800)}`)
    expect(theItemsNaming(first.reminder, old.path)).toEqual([])
    expect(theItemsNaming(first.reminder, fresh.path)).toEqual([])
    // THE NEW WORKTREE'S OWN TEST FILE IS JUDGED, which only a reading of that worktree finds.
    expect(first.reminder.items.map((one) => one.says).join('\n')).toContain('work/named-in-the-write-0.test.ts')
  })

  it('5: a record naming the worktree that holds its commits gets no item, though a worker\'s worktree has commits since the start', async () => {
    const start = Date.now() - 30 * MINUTE
    const { others } = aSandbox(start, [{ name: 'its-round', commits: 1 }, { name: 'its-worker', commits: 1 }])
    const round = others['its-round']!
    const run = await aRunIn(round.path, start, 'Synthetic run whose record names its worktree')
    const first = await write(run, { state: 'finished', tip: round.head })
    if (first.reminder === null) throw new Error(`the first sealing write was not reminded: ${first.body.slice(0, 800)}`)
    expect(theItemsNaming(first.reminder, others['its-worker']!.path)).toEqual([])
    expect(theItemsNaming(first.reminder, round.path)).toEqual([])
    // THE RUN'S OWN COMMIT IS JUDGED, so the record's worktree was read.
    expect(first.reminder.items.map((one) => one.says).join('\n')).toContain('work/its-round-0.test.ts')
  })
})

describe('what could not be looked at', () => {
  it('6: the reminder names the look among what it did not check, with the reason', () => {
    const reason = `a made-up reason ${randomBytes(4).toString('hex')}`
    const facts: TheFactsBeforeTheSeal = {
      runTitle: 'Synthetic run',
      testRuns: [],
      git: { commits: [], existedAtTheForkBase: () => false, earlier: 0, messages: [], testLinesAtTheTip: [] },
      reports: [],
      sameTitleElsewhere: {},
      mustRead: [],
      checkAlso: [],
      elsewhere: { couldNotLook: reason },
    }
    const { items, notChecked } = judge(facts)
    expect(notChecked.filter((one) => one.includes(reason))).toHaveLength(1)
    expect(items.filter((one) => one.says.includes(reason))).toEqual([])
  })
})
