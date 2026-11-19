// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEAL AND THE ROUND'S END READ A RUN'S MESSAGES, REPORTS AND START IN THE ORDER THEY WERE WRITTEN, NOT BY THEIR
 * TIMES IN WORDS (wave 13n round Z, item 2n).
 *
 * A record's `created_at` is the office's local time in words, with no offset. On the night the clocks go back in
 * Europe/London (25 October 2026), the hour from 01:00 comes twice. A message written at 01:50 summer time is followed,
 * twenty minutes later, by one written at 01:10 winter time, and the later one's words sort first. On that night the
 * office read a run's older message as its last word to its starter, and held the run's check, because the older one
 * did not say the run seals. The change log numbers each row it appends (`append_order`), and a record's create row
 * holds the place the record was written in. The seal orders by that place, as the merge queue does.
 *
 * A run's start, `startedAt`, is the same kind of words. Read alone in that hour it names two moments, and the reader
 * took the first, an hour early, so a run started in the second pass counted the commits of the round before it as its
 * own. The start is now read with the instant stored beside it (`startedTime`), and words with none are read as their
 * one moment, or as no moment where they name two or none.
 *
 * The commits are read by git's author time, which git keeps to the whole second, and a start stored with its instant
 * has milliseconds. So the two are compared at the whole second: a commit made in the second the run started is the
 * run's own (wave 13n round AA). Read at the millisecond, such a commit was counted as written before the run, and the
 * round's end said the run had made no commits.
 *
 * WHAT IS PROVED, against a throwaway database, with this process's zone set to Europe/London and its clock set here:
 *
 *   1. A run writes its starter one message at 01:50 summer time, and one that says its feature is ready and it seals
 *      at 01:10 winter time. The second is the run's last message to its starter, the round's end reads it, and the
 *      check of the sealed round is not held.
 *   2. Two reports linked about a run, written at the same two moments, are listed in the order written.
 *   3. Two reports the run wrote and did not link about it are listed newest first, in the order written.
 *   4. A run whose start is stored with its instant, at 01:10 winter time, counts as its own only the commit written
 *      after it, and leaves out the one written at 01:30 summer time, forty minutes before it.
 *   5. A start in words alone at 01:10 on that night names two moments. The run's commits are then all judged as its
 *      own, and the reminder says why, rather than reading the start an hour early.
 *   6. On 28 March 2027 the hour from 01:00 is skipped. A start in words inside it names no moment, and is read as none.
 *   7. Control, green before and after: messages and reports written either side of the skipped hour keep their order,
 *      and a start at 02:00, just after it, is read as its one moment.
 *   8. A run filed at 01:50 summer time and reminded at 01:10 winter time is reminded once, not again at every write:
 *      the reminder finds its own line, though the line's time in words is earlier than the run's.
 *   9. A message or report with no create row has no recorded place. The seal and the round's end then answer 500 and
 *      name it; they do not put it in order by its time in words.
 *  10. No query in the seal's file or the round end's file orders by `created_at`.
 *  11. A run whose start is stored with its instant, at 12:00:00.500, counts as its own the commit written at 12:00:00,
 *      in the same second, and leaves out the one written at 11:59:59, in the second before.
 *
 * The last message in cases 1 and 7 has a FEATURE READY: line, because the office asks for a sandbox round's check only
 * when a whole feature is done (src/server/lib/how-a-round-ended.ts), and those cases read a check that is not held.
 *
 * MUTATION PROOF (each after a red control at the code before; each turns the cases named red, and restoring it turns
 * them green):
 *
 *   - In src/server/lib/sealed-tip.ts, `theRunsOwnMessageTo` orders by `r.created_at DESC` again. Case 1 goes red.
 *   - In src/server/lib/sealed-tip.ts, `theReportsLinkedTo` orders by `r.created_at` again. Case 2 goes red.
 *   - In src/server/lib/how-a-round-ended.ts, `theReportsItFiledElsewhere` orders by `r.created_at DESC` again. Case 3
 *     goes red.
 *   - In src/server/lib/before-the-seal.ts, `whenTheRunStarted` reads `parseStoredStamp` of the words again. Cases 4, 5
 *     and 6 go red.
 *   - In src/server/lib/before-the-seal.ts, `theLineThatReminded` bounds the lines by `run.createdAt` again. Case 8 goes
 *     red.
 *   - In src/server/lib/sealed-tip.ts, `eachWasWrittenInPlace` answers its rows without the check. Case 9 goes red.
 *   - Put `created_at` back into any one ORDER BY of the two files. Case 10 goes red.
 *   - In src/server/lib/before-the-seal-rules.ts, `theCommitsReadWith` compares git's whole second, times 1,000, with
 *     the start's milliseconds again. Case 11 goes red.
 *
 * Every record, agent and commit here is a synthetic fixture in a throwaway database and a scratch repository, written
 * through the records door, except the change-log rows case 9 deletes to leave a record with no place.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FEATURE_READY } from '../src/server/lib/how-a-round-ended-rules.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = 'default'
const SECRETARY = 'order-written-secretary'
const WORKER = 'order-written-worker'

/** 01:50 summer time, 25 October 2026, in the first pass of the repeated hour. */
const FIRST_PASS = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 01:10 winter time, twenty minutes later, in the second pass. */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:59:59 winter time, 28 March 2027, the last second before the skipped hour. */
const BEFORE_THE_GAP = Date.UTC(2027, 2, 28, 0, 59, 59)
/** 02:00:00 summer time, one second later. */
const AFTER_THE_GAP = Date.UTC(2027, 2, 28, 1, 0, 0)
/** 12:00:00.500 winter time, 26 October 2026, half a second into a second. */
const IN_THE_SECOND = Date.UTC(2026, 9, 26, 12, 0, 0, 500)

const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const asThePerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asTheSecretary = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY }

let t: TestDb
let app: FastifyInstance
let secretaryId = ''
let theZoneBefore: string | undefined
let sealedTip: typeof import('../src/server/lib/sealed-tip.ts')
let roundEnd: typeof import('../src/server/lib/how-a-round-ended.ts')
let beforeTheSeal: typeof import('../src/server/lib/before-the-seal.ts')
let rules: typeof import('../src/server/lib/before-the-seal-rules.ts')
const directories: string[] = []

const theStarter = () => ({ kind: 'agent' as const, id: secretaryId })
const createdAtOf = (id: string): string => t.api.getRecord(id)!.createdAt
const read = (id: string): PanelRecord => t.api.getRecord(id)!

/** A run of the worker, filed by the person at this moment. `sandbox` makes it a sandbox round. Synthetic. */
function aRunAt(at: number, title: string, more: Record<string, unknown> = {}): string {
  vi.setSystemTime(at)
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title,
    origin: 'fixture',
    actor: person,
    data: { state: 'running', servingAgent: WORKER, cutFrom: 'main', ...more },
  }).id
}

const A_SANDBOX = { sandbox: { template: 'synthetic-template', container: 'synthetic-row', folder: '/synthetic/sandbox-folder' } }

/** A message the run writes its starter at this moment, in its own session. Synthetic. */
function aMessageAt(at: number, run: string, body: string): string {
  vi.setSystemTime(at)
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'message',
    title: 'Synthetic word to the starter',
    actor: { type: 'agent', id: WORKER, sessionId: run },
    data: { to: [theStarter()], body },
  }).id
}

/** A report written at this moment: by the run in its own session, or by the person and linked about the run. Synthetic. */
function aReportAt(at: number, run: string, title: string, how: 'linked-by-the-person' | 'in-the-runs-session'): string {
  vi.setSystemTime(at)
  const actor = how === 'in-the-runs-session' ? { type: 'agent' as const, id: WORKER, sessionId: run } : person
  const report = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'report', title, actor, data: { blocks: [] } }).id
  if (how === 'linked-by-the-person') t.api.createLink({ fromId: report, toId: run, type: 'about', actor: person })
  return report
}

/** Take a record's create row out of the change log, so the place it was written in is not recorded. */
function forgetThePlaceOf(id: string): void {
  const gone = t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(id)
  expect(gone.changes, `the create row of ${id}`).toBe(1)
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

/**
 * A scratch repository: `main` holds one commit, and the branch `worker` one commit for each subject, authored and
 * committed at the instant beside it.
 */
function aRepository(commits: [subject: string, at: string][]): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-order-written-'))
  directories.push(dir)
  const git = (env: Record<string, string>, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
  git({}, 'init', '-q', '-b', 'main')
  git({}, 'config', 'user.name', 'Synthetic order-written fixture')
  git({}, 'config', 'user.email', 'order-written@example.invalid')
  git({}, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'base.txt'), 'base\n')
  git({}, 'add', '.')
  git({ GIT_AUTHOR_DATE: '2026-10-24T12:00:00Z', GIT_COMMITTER_DATE: '2026-10-24T12:00:00Z' }, 'commit', '-qm', 'Synthetic base')
  git({}, 'switch', '-qc', 'worker')
  commits.forEach(([subject, at], index) => {
    writeFileSync(join(dir, `work-${String(index)}.txt`), `${subject}\n`)
    git({}, 'add', '.')
    git({ GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at }, 'commit', '-qm', subject)
  })
  return dir
}

/** The subjects of the commits the reminder reads as the run's own, and how many before its start it left out. */
function theRunsCommits(run: string): { own: string[]; earlier: number | null | undefined; notChecked: string[] } {
  const facts = beforeTheSeal.theFactsBeforeTheSealOf(read(run))
  expect('commits' in facts.git, JSON.stringify(facts.git)).toBe(true)
  const git = facts.git as { commits: { subject: string }[]; earlier?: number | null }
  return { own: git.commits.map((one) => one.subject), earlier: git.earlier, notChecked: rules.whatAnInspectorWouldMostLikelyRefuse(facts).notChecked }
}

const THE_START_NAMES_NO_MOMENT = 'the run gives no start that names one moment'

beforeAll(async () => {
  theZoneBefore = process.env.TZ
  process.env.TZ = 'Europe/London'
  t = await freshDb()
  app = (await apiApp()).app
  const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: SECRETARY, name: 'Synthetic secretary', role: 'secretary' } })
  expect(secretary.statusCode, secretary.body).toBe(201)
  secretaryId = (JSON.parse(secretary.body) as { agent: { id: string } }).agent.id
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asTheSecretary, payload: { handle: WORKER, name: 'Synthetic worker', role: 'worker', workArea: ['work-0.txt', 'work-1.txt'] } })
  expect(worker.statusCode, worker.body).toBe(201)
  sealedTip = await import('../src/server/lib/sealed-tip.ts')
  roundEnd = await import('../src/server/lib/how-a-round-ended.ts')
  beforeTheSeal = await import('../src/server/lib/before-the-seal.ts')
  rules = await import('../src/server/lib/before-the-seal-rules.ts')
  vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS })
}, 60_000)

afterEach(() => {
  vi.setSystemTime(FIRST_PASS)
})

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

describe('the seal in the hour the clocks go back', () => {
  it("1: reads the message written last as the run's last word to its starter, and does not hold its check", () => {
    const run = aRunAt(FIRST_PASS, 'Synthetic run that sealed in the repeated hour', A_SANDBOX)
    const first = aMessageAt(FIRST_PASS, run, 'The tests are running. More when they end.')
    const last = aMessageAt(SECOND_PASS, run, `The tests are green.\n${FEATURE_READY} the synthetic feature is done.\nI seal next.`)
    // THE CASE MEANS SOMETHING ONLY IF THE LAST MESSAGE'S WORDS SORT BEFORE THE FIRST'S.
    expect(createdAtOf(last) < createdAtOf(first), `${createdAtOf(first)} then ${createdAtOf(last)}`).toBe(true)
    expect(sealedTip.theRunsOwnMessageTo(run, theStarter())).toBe(last)
    expect(roundEnd.theFactsAtTheEndOf(read(run), theStarter()).lastMessage?.id).toBe(last)
    expect(roundEnd.theCheckOfASealedRound(read(run))).toMatchObject({ hold: false, message: last, starter: theStarter() })
  })

  it('2: lists the reports linked about a run in the order written', () => {
    const run = aRunAt(FIRST_PASS, 'Synthetic run with two linked reports')
    const first = aReportAt(FIRST_PASS, run, 'Synthetic report written first', 'linked-by-the-person')
    const second = aReportAt(SECOND_PASS, run, 'Synthetic report written second', 'linked-by-the-person')
    expect(createdAtOf(second) < createdAtOf(first)).toBe(true)
    expect(sealedTip.theReportsLinkedTo(run)).toEqual([first, second])
  })

  it('3: lists the reports a run wrote and did not link about it newest first, in the order written', () => {
    const run = aRunAt(FIRST_PASS, 'Synthetic run with two reports elsewhere')
    const first = aReportAt(FIRST_PASS, run, 'Synthetic report elsewhere written first', 'in-the-runs-session')
    const second = aReportAt(SECOND_PASS, run, 'Synthetic report elsewhere written second', 'in-the-runs-session')
    expect(createdAtOf(second) < createdAtOf(first)).toBe(true)
    expect(roundEnd.theFactsAtTheEndOf(read(run), theStarter()).reportsElsewhere).toEqual([
      { report: second, linkedTo: null },
      { report: first, linkedTo: null },
    ])
  })

  it('4: reads a start stored with its instant as that instant, and leaves out the commit written before it', () => {
    const dir = aRepository([
      ['Synthetic commit of the round before', '2026-10-25T00:30:00Z'],
      ['Synthetic commit of this run', '2026-10-25T01:20:00Z'],
    ])
    const run = aRunAt(SECOND_PASS, 'Synthetic run started in the second pass', {
      workingDirectory: dir,
      startedAt: '2026-10-25 01:10:00',
      startedTime: { stamp: '2026-10-25 01:10:00', instant: '2026-10-25T01:10:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' },
    })
    const commits = theRunsCommits(run)
    expect(commits.own).toEqual(['Synthetic commit of this run'])
    expect(commits.earlier).toBe(1)
  })

  it('5: reads a start in words alone in the repeated hour as no moment, judges every commit, and says why', () => {
    const dir = aRepository([
      ['Synthetic commit of the round before', '2026-10-25T00:30:00Z'],
      ['Synthetic commit of this run', '2026-10-25T01:20:00Z'],
    ])
    const run = aRunAt(SECOND_PASS, 'Synthetic run whose start is words alone', { workingDirectory: dir, startedAt: '2026-10-25 01:10:00' })
    const commits = theRunsCommits(run)
    expect(commits.own).toEqual(['Synthetic commit of the round before', 'Synthetic commit of this run'])
    expect(commits.earlier).toBeNull()
    expect(commits.notChecked.join(' ')).toContain(THE_START_NAMES_NO_MOMENT)
  })
})

describe('the seal across the hour skipped in March', () => {
  it('6: reads a start in words inside the skipped hour as no moment', () => {
    const dir = aRepository([
      ['Synthetic commit before the gap', '2027-03-28T00:30:00Z'],
      ['Synthetic commit after the gap', '2027-03-28T01:30:00Z'],
    ])
    const run = aRunAt(AFTER_THE_GAP, 'Synthetic run whose start is in the gap', { workingDirectory: dir, startedAt: '2027-03-28 01:30:00' })
    const commits = theRunsCommits(run)
    expect(commits.own).toEqual(['Synthetic commit before the gap', 'Synthetic commit after the gap'])
    expect(commits.earlier).toBeNull()
    expect(commits.notChecked.join(' ')).toContain(THE_START_NAMES_NO_MOMENT)
  })

  it('7: keeps messages, reports and a start at 02:00 in their order either side of the gap (control)', () => {
    const run = aRunAt(BEFORE_THE_GAP, 'Synthetic run across the gap', A_SANDBOX)
    const before = aMessageAt(BEFORE_THE_GAP, run, 'The tests are running. More when they end.')
    const after = aMessageAt(AFTER_THE_GAP, run, `The tests are green.\n${FEATURE_READY} the synthetic feature is done.\nI seal next.`)
    expect([createdAtOf(before), createdAtOf(after)]).toEqual(['2027-03-28 00:59:59', '2027-03-28 02:00:00'])
    expect(sealedTip.theRunsOwnMessageTo(run, theStarter())).toBe(after)
    expect(roundEnd.theCheckOfASealedRound(read(run))).toMatchObject({ hold: false, message: after, starter: theStarter() })
    const first = aReportAt(BEFORE_THE_GAP, run, 'Synthetic report before the gap', 'linked-by-the-person')
    const second = aReportAt(AFTER_THE_GAP, run, 'Synthetic report after the gap', 'linked-by-the-person')
    expect(sealedTip.theReportsLinkedTo(run)).toEqual([first, second])

    const dir = aRepository([
      ['Synthetic commit before the start', '2027-03-28T00:30:00Z'],
      ['Synthetic commit after the start', '2027-03-28T01:30:00Z'],
    ])
    const started = aRunAt(AFTER_THE_GAP, 'Synthetic run started just after the gap', { workingDirectory: dir, startedAt: '2027-03-28 02:00:00' })
    const commits = theRunsCommits(started)
    expect(commits.own).toEqual(['Synthetic commit after the start'])
    expect(commits.earlier).toBe(1)
  })
})

describe('the reminder before the seal in the hour the clocks go back', () => {
  it('8: reminds a run filed in the first pass once, though its line is written in the second pass', async () => {
    const run = aRunAt(FIRST_PASS, 'Synthetic run reminded in the repeated hour')
    vi.setSystemTime(SECOND_PASS)
    const first = await beforeTheSeal.theReminderBeforeTheSealOf(read(run))
    expect(first !== null && 'line' in first, JSON.stringify(first)).toBe(true)
    const line = (first as { line: string }).line
    // THE CASE MEANS SOMETHING ONLY IF THE LINE'S WORDS SORT BEFORE THE RUN'S.
    expect(t.api.getRecord(line)!.updatedAt < createdAtOf(run), `${createdAtOf(run)} then ${t.api.getRecord(line)!.updatedAt}`).toBe(true)
    vi.setSystemTime(SECOND_PASS + 60_000)
    expect(await beforeTheSeal.theReminderBeforeTheSealOf(read(run))).toBeNull()
  })
})

describe('a record with no place in the order written', () => {
  it('9: is named in a 500 by the seal and the round end, and nothing is put in order by its time in words', () => {
    const run = aRunAt(FIRST_PASS, 'Synthetic run whose message has no place', A_SANDBOX)
    aMessageAt(FIRST_PASS, run, 'The tests are running. More when they end.')
    const unplaced = aMessageAt(SECOND_PASS, run, 'The tests are green. I seal next.')
    forgetThePlaceOf(unplaced)
    const byTheSeal = whatIsThrownBy(() => sealedTip.theRunsOwnMessageTo(run, theStarter()))
    expect(byTheSeal, 'the message was read').not.toBeNull()
    expect(byTheSeal?.status).toBe(500)
    expect(String(byTheSeal?.message)).toContain(unplaced)

    const linked = aRunAt(FIRST_PASS, 'Synthetic run whose linked report has no place')
    aReportAt(FIRST_PASS, linked, 'Synthetic placed report', 'linked-by-the-person')
    const unplacedLinked = aReportAt(SECOND_PASS, linked, 'Synthetic unplaced report', 'linked-by-the-person')
    forgetThePlaceOf(unplacedLinked)
    const byTheList = whatIsThrownBy(() => sealedTip.theReportsLinkedTo(linked))
    expect(byTheList, 'the reports were listed').not.toBeNull()
    expect(byTheList?.status).toBe(500)
    expect(String(byTheList?.message)).toContain(unplacedLinked)

    const elsewhere = aRunAt(FIRST_PASS, 'Synthetic run whose report elsewhere has no place')
    aReportAt(FIRST_PASS, elsewhere, 'Synthetic placed report elsewhere', 'in-the-runs-session')
    const unplacedElsewhere = aReportAt(SECOND_PASS, elsewhere, 'Synthetic unplaced report elsewhere', 'in-the-runs-session')
    forgetThePlaceOf(unplacedElsewhere)
    const byTheEnd = whatIsThrownBy(() => roundEnd.theFactsAtTheEndOf(read(elsewhere), null))
    expect(byTheEnd, 'the reports elsewhere were listed').not.toBeNull()
    expect(byTheEnd?.status).toBe(500)
    expect(String(byTheEnd?.message)).toContain(unplacedElsewhere)
  })

  it('10: leaves no query in the seal file or the round end file ordering by created_at', () => {
    for (const file of ['src/server/lib/sealed-tip.ts', 'src/server/lib/how-a-round-ended.ts']) {
      const source = readFileSync(join(REPO, file), 'utf8')
      expect(source.match(/ORDER BY[^'"`;]*created_at/g) ?? [], file).toEqual([])
    }
  })
})

describe('the seal in the second a run starts', () => {
  it("11: counts a commit written in the second the run started as the run's own, and leaves out the second before", () => {
    const dir = aRepository([
      ['Synthetic commit of the second before', '2026-10-26T11:59:59Z'],
      ['Synthetic commit in the second of the start', '2026-10-26T12:00:00Z'],
    ])
    const run = aRunAt(IN_THE_SECOND, 'Synthetic run started half a second into a second', {
      workingDirectory: dir,
      startedAt: '2026-10-26 12:00:00',
      startedTime: { stamp: '2026-10-26 12:00:00', instant: '2026-10-26T12:00:00.500+00:00', offset: '+00:00', timeZone: 'Europe/London' },
    })
    const commits = theRunsCommits(run)
    expect(commits.own).toEqual(['Synthetic commit in the second of the start'])
    expect(commits.earlier).toBe(1)
  })
})
