// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TAKE-BACK, END TO END, WITH NOBODY PRESSING ANYTHING (merge class 2 of the approved design).
 *
 * A few feature test files red, with the build passing, may land. They are handed back to the line that caused them,
 * and the change is taken back if they are not fixed by the deadline. This file runs that whole path in the merge
 * tool's fixture office, with the real tool, and prints one DRILL line for each step with the record it made and the
 * time it took. Its second case is the other way: a repair that lands before the deadline means no take-back.
 *
 * WHAT STANDS IN FOR WHAT. The office, the merge tool and git are real. The message worker is not run: this file reads
 * GET /api/worker/merges as the worker does, and starts what it lists with the same arguments the worker gives, plus
 * the fixture's sandbox folder. tests/the-worker-runs-the-merge-tool-in-its-own-slot.test.ts proves that the worker
 * starts a listed take-back by itself. The original entry is ordinary work, so an inspector releases it before it
 * lands; nobody releases or presses anything after that.
 *
 * THE CLOCK. MOLE_OFFICE_HAND_BACK_HOURS is at its least, 1. The office's own clock, in this process, is set past the
 * deadline only while the worker's list is read and while the take-back is filed. The records filed then carry stamps
 * about an hour ahead of the ones after them. Nothing after the submission reads the deadline again.
 *
 * THE MACHINE'S LIMITS. The take-back runs each file alone on main in a test-batches seat, and an office gives no new
 * seat while this machine's load or its free space is past that pool's limits. Here the two limits are set past
 * anything this machine reaches, so a busy machine, such as one running the whole suite, does not hold the take-back.
 *
 * Mutations: the list reads a deadline a day later (red at step 3); a take-back owes an inspector (step 5); the line
 * is not told of the take-back (step 6); a repair does not close its problem (the second case, step 3); the tool
 * reverts no commit (step 4, and the second case's refusal); the line is not told of the hand-back (step 2 of both);
 * the free-space limit is set above this machine's disk (the take-back waits for a seat, red at the case's time limit).
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { latestMomentOfStampInZone } from '../src/shared/time.ts'
import { LANDED_KEEP_PREFIX, retainedLandings } from '../src/shared/merge/landed-history.mjs'
import {
  aRealOfficeForTheMerger, app, t, office, as, asPerson, asWorker, git, write, PASSING_TEST, mainCheckout, workerClone,
  sealedRun, submitGit, repositoryOf, stateOf, readingOf, runTheTool, runTheTakeBack, factsOf,
} from './the-merger-fixture.ts'
import { suitesOf, filesNamed, leftOutOf, judged } from './related-only-merger-fixture.ts'

aRealOfficeForTheMerger('tests/a-late-hand-back-is-taken-back-with-nobody-pressing.test.ts')

/** A main whose one feature test reads src/thing.ts, beside ten plain files, and an empty house-rules inventory. */
const MAIN: Record<string, string> = {
  'tests/the-test-lists.ts': "if (process.argv[2] === 'whole-tree') console.log('tests/one.test.ts')\n",
  'src/thing.ts': 'export const answer = 1\n',
  'tests/thing.test.ts': "import { expect, it } from 'vitest'\nimport { answer } from '../src/thing.ts'\nit('answers', () => { expect(answer).toBe(1) })\n",
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`tests/plain-${String(i + 1)}.test.ts`, PASSING_TEST])),
  'tests/house-rules.mjs': 'export const HOUSE_RULES = {\n}\n',
}
const breaksTheThing = (dir: string) => write(dir, { 'src/thing.ts': 'export const answer = 2\n' })
const person = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }
const SETTINGS = {
  MOLE_OFFICE_GATE_FEW_FEATURE_REDS: 'remind', MOLE_OFFICE_HAND_BACK_HOURS: '1',
  MOLE_OFFICE_TEST_BATCH_LOAD_LIMIT: '1000', MOLE_OFFICE_TEST_BATCH_FREE_GB_LIMIT: '1',
}
const saved = new Map(Object.keys(SETTINGS).map(name => [name, process.env[name]]))
let secretary: string

beforeAll(async () => {
  Object.assign(process.env, SETTINGS)
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: randomUUID(), name: 'A synthetic secretary', role: 'secretary' } })
  expect(r.statusCode, r.body).toBe(201)
  secretary = String(r.json().agent.id)
  const on = await app.inject({ method: 'POST', url: '/api/office/related-tests-first', headers: asPerson, payload: { on: true } })
  expect(on.statusCode, on.body).toBe(200)
})
afterAll(() => {
  for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
})

/** The line has a round open: its starter serves a running round with a live process, as class 2 asks. */
async function aRoundIsOpen(entry: string) {
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { theAgentOfARun } = await import('../src/server/lib/inspection.ts')
  const { registerResource } = await import('../src/server/lib/resources.ts')
  const author = theAgentOfARun(t.api.getRecord(readingOf(entry).run)!)!
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: randomUUID(), name: 'A synthetic round starter', role: 'supervisor', workArea: ['tests'] } })
  expect(started.statusCode, started.body).toBe(201)
  const starter = agentByHandle(started.json().agent.handle)!
  const round = t.api.createRecord({ kind: 'session', title: 'A synthetic live round', workspaceId: 'default', actor: person, data: { state: 'running', servingAgentId: starter.id } }).id
  registerResource({ workspaceId: 'default', sessionRecordId: round, type: 'process', key: String(process.pid), actor: person })
  t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(starter.id, author.id)
  return {
    author: author.id, starter: starter.id,
    close: () => {
      t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(author.startedBy?.kind ?? null, author.startedBy?.id ?? null, author.id)
      t.api.patchRecord(round, { dataPatch: { state: 'crashed' } }, person)
    },
  }
}

/** One line per step: what happened, the record it made, and how long it took. */
function aDrill(name: string) {
  const lines: string[] = []
  let since = performance.now()
  return {
    step(n: number, says: string) {
      const now = performance.now()
      lines.push(`DRILL ${name}${String(n)} (${((now - since) / 1000).toFixed(1)} s): ${says}`)
      since = now
    },
    print: () => { process.stdout.write(`${lines.join('\n')}\n`) },
  }
}

const theWorkersList = async () => {
  const r = await app.inject({ method: 'GET', url: '/api/worker/merges', headers: as('agent', office.id) })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as { wanted: { entry: string }[]; takeBacksDue: { problem: string }[]; takeBacksForAPerson: { problem: string }[]; takeBacksCannotBeRead: { problem: string }[] }
}
const named = (list: { problem: string }[], problem: string) => list.filter(one => one.problem === problem)
const messagesTitled = (title: string) => t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(one => one.title === title)
const recipients = (message: { data: Record<string, unknown> }) => (message.data['to'] as { id: string }[]).map(one => one.id)
const takeBacksOf = (problem: string) => t.api.listRecords({ workspaceId: 'default', kind: 'merge_entry' })
  .filter(one => (one.data['fixRound'] as { problem?: string; kind?: string } | undefined)?.problem === problem && (one.data['fixRound'] as { kind?: string }).kind === 'takeout')

/** Steps 1 and 2: a few-feature-red entry lands handed back, and its problem and notice are filed. */
async function landsHandedBack(name: string, drill: ReturnType<typeof aDrill>) {
  const main = mainCheckout(name, MAIN)
  const { entry, worker } = await submitGit(main, name, breaksTheThing)
  const line = await aRoundIsOpen(entry)
  await judged(entry)
  const landed = await runTheTool(entry)
  expect(landed.code, landed.err + landed.out).toBe(0)
  expect(stateOf(entry)).toBe('merged')
  expect(factsOf(landed, 'tested')).toMatchObject({ green: false, build: { passed: true } })
  expect(readingOf(entry).machine.tested.mergeClass).toMatchObject({ class: 2 })
  const integrated = readingOf(entry).machine.integrated as { mainBefore: string; mainAfter: string }
  expect(git(main, 'rev-parse', 'HEAD')).toBe(integrated.mainAfter)
  // An entry lands as one commit on the main it was tested on. That commit names the handed-back commit, which the
  // entry's own ref keeps, because main's history no longer holds it.
  const handedBack = git(worker, 'rev-parse', 'HEAD')
  expect(retainedLandings((args: string[]) => git(main, ...args), 'HEAD')).toEqual([
    expect.objectContaining({ entry, tip: handedBack, landed: integrated.mainAfter, parent: integrated.mainBefore }),
  ])
  expect(git(main, 'rev-parse', `${LANDED_KEEP_PREFIX}${entry}`)).toBe(handedBack)
  drill.step(1, `entry ${entry} landed at ${integrated.mainAfter} with tests/thing.test.ts red and the build passed; class 2 at remind.`)

  const problems = t.api.listRecords({ workspaceId: 'default', kind: 'problem' }).filter(one => one.title === `Handed back: merge entry ${entry}`)
  expect(problems).toHaveLength(1)
  const problem = problems[0]!
  const hand = (problem.data['extra'] as { handBack: { deadline: string; timeZone: string; hours: number; files: string[]; entry: string } }).handBack
  expect(problem.data['state']).toBe('open')
  expect(hand).toMatchObject({ entry, files: ['tests/thing.test.ts'], hours: 1 })
  const deadline = latestMomentOfStampInZone(hand.deadline, hand.timeZone)!
  expect(deadline).toBeGreaterThan(Date.now())
  const told = messagesTitled(problem.title)
  expect(told).toHaveLength(1)
  expect(told[0]!.data['notice']).toBe('handedBack')
  expect(recipients(told[0]!)).toEqual(expect.arrayContaining([line.author, line.starter, secretary]))
  const early = await theWorkersList()
  expect(named(early.takeBacksDue, problem.id)).toEqual([])
  drill.step(2, `problem ${problem.id} filed, due ${hand.deadline} (${hand.timeZone}); message ${told[0]!.id} told the line's agent, its starter and the secretary; the worker's list names no take-back yet.`)
  return { main, entry, line, problem: problem.id, hand, deadline, integrated }
}

it('lands a few feature reds handed back, and takes them back after the deadline with nobody pressing', async () => {
  const drill = aDrill('A')
  let line: { close: () => void } | undefined
  try {
    const landed = await landsHandedBack('taken-back', drill)
    line = landed.line
    const { main, entry, problem, hand, deadline, integrated } = landed

    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    let taken: string, takeBackRun: string
    try {
      vi.setSystemTime(deadline + 60_000)
      expect(t.api.getRecord(problem)!.data['state']).toBe('open')
      expect(git(main, 'rev-parse', 'HEAD')).toBe(integrated.mainAfter)
      expect(git(main, 'show', 'HEAD:src/thing.ts')).toBe('export const answer = 2')
      const due = await theWorkersList()
      expect(named(due.takeBacksDue, problem)).toEqual([{ problem, entry, deadline: hand.deadline, timeZone: hand.timeZone, hours: 1 }])
      expect(named(due.takeBacksForAPerson, problem)).toEqual([])
      expect(named(due.takeBacksCannotBeRead, problem)).toEqual([])
      drill.step(3, `the clock passed ${hand.deadline}; problem ${problem} is still open and main is still the tree tested red, ${integrated.mainAfter}; the worker's list names it due.`)

      const made = await runTheTakeBack(problem)
      expect(made.code, made.err + made.out).toBe(0)
      const evidence = (t.api.getRecord(problem)!.data.extra as { takeBack: { stillRed: { at: string; mainAt: string; files: { file: string; result: string; log: string }[] } } }).takeBack.stillRed
      expect(evidence).toMatchObject({ at: expect.any(String), mainAt: integrated.mainAfter, files: [{ file: 'tests/thing.test.ts', result: 'red', log: expect.any(String) }] })
      expect(readFileSync(evidence.files[0]!.log, 'utf8')).toContain('tests/thing.test.ts')
      expect(made.out).toContain(`main ${integrated.mainAfter}; tests/thing.test.ts: red`)
      const filed = takeBacksOf(problem)
      expect(filed).toHaveLength(1)
      taken = filed[0]!.id
      const run = t.api.getRecord(String(filed[0]!.data['run']))!
      takeBackRun = run.id
      expect(run.data).toMatchObject({ state: 'finished', extra: { purpose: 'take-back', problem }, needsNoCheck: { rule: 'a-take-back-returns-main-to-a-checked-state' } })
      expect(run.data['sealedTip']).toBe((filed[0]!.data['seal'] as { id: string }).id)
      expect(made.out).toContain(`office accepted entry ${taken}, run ${run.id}`)
      expect(readingOf(taken).takeBackOf).toMatchObject({ problem, entry })
      drill.step(4, `the take-back was filed as run ${run.id}, sealed as ${String(run.data['sealedTip'])} and queued as entry ${taken}.`)
    } finally {
      vi.useRealTimers()
    }

    const listed = await theWorkersList()
    expect(listed.wanted.map(one => one.entry)).toContain(taken)
    const done = await runTheTool(taken)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(taken)).toBe('merged')
    expect(factsOf(done, 'tested')).toMatchObject({ green: true, build: { passed: true } })
    expect(suitesOf(taken).length).toBeGreaterThan(0)
    const verdict = readingOf(taken).machine.verdict as { by: { kind: string; id: string }; how: string }
    const { THE_OFFICE } = await import('../src/server/lib/inspection.ts')
    expect(verdict.by).toEqual({ kind: 'agent', id: THE_OFFICE.id })
    const writers = t.client.sqlite.prepare('SELECT DISTINCT actor_type, actor_id FROM revisions WHERE record_id IN (?, ?, ?) ORDER BY actor_id').all(taken, takeBackRun, problem) as { actor_type: string; actor_id: string }[]
    expect(writers.filter(one => one.actor_type !== 'agent')).toEqual([])
    const runs = suitesOf(taken).map(call => filesNamed(call).length > 0 ? `${String(filesNamed(call).length)} related files` : `the whole suite less ${String(leftOutOf(call).length)} files already run`)
    drill.step(5, `the worker's list named entry ${taken} wanted, and one tool run landed it; the build passed, and test runs of ${runs.join(', then ')} were green; the entry, its run and the problem were written only by ${writers.map(one => one.actor_id).join(', ')}; its verdict is by ${verdict.by.id} and says "${verdict.how}".`)

    const receipt = readingOf(taken).machine.integrated as { mainAfter: string }
    expect(git(main, 'rev-parse', 'HEAD')).toBe(receipt.mainAfter)
    expect(git(main, 'show', 'HEAD:src/thing.ts')).toBe('export const answer = 1')
    expect(git(main, 'merge-base', '--is-ancestor', integrated.mainAfter, 'HEAD')).toBe('')
    expect(t.api.getRecord(problem)!.data).toMatchObject({ state: 'fixed', fix: `Taken back by merge entry ${taken}, landed commit ${receipt.mainAfter}.` })
    const told = messagesTitled(`Taken back: hand-back ${problem}`)
    expect(told).toHaveLength(1)
    expect(told[0]!.data['notice']).toBe('takenBack')
    expect(recipients(told[0]!)).toEqual(expect.arrayContaining([landed.line.author, landed.line.starter, secretary]))
    drill.step(6, `main is ${receipt.mainAfter} and no longer holds the change; problem ${problem} is fixed; message ${told[0]!.id} told the line's agent, its starter and the secretary.`)
  } finally {
    line?.close()
    drill.print()
  }
}, 590_000)

it('takes nothing back when a repair lands before the deadline', async () => {
  const drill = aDrill('B')
  let line: { close: () => void } | undefined
  try {
    const landed = await landsHandedBack('repaired', drill)
    line = landed.line
    const { main, problem, hand, deadline } = landed

    const worker = workerClone(main, 'the-repair', dir => write(dir, { 'tests/thing.test.ts': "import { expect, it } from 'vitest'\nimport { answer } from '../src/thing.ts'\nit('answers', () => { expect(answer).toBe(2) })\n" }))
    const run = await sealedRun(worker)
    const submitted = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'git', repository: repositoryOf.get(main)!, branch: 'work' }, fixRound: { problem, kind: 'repair' } } })
    expect(submitted.statusCode, submitted.body).toBe(201)
    const repair = String(submitted.json().entry.id)
    expect(readingOf(repair).repairOf).toEqual({ problem, files: ['tests/thing.test.ts'] })
    await judged(repair)
    const done = await runTheTool(repair)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(repair)).toBe('merged')
    const receipt = readingOf(repair).machine.integrated as { mainAfter: string }
    expect(t.api.getRecord(problem)!.data).toMatchObject({ state: 'fixed', fix: `Repair merge entry ${repair}, landed commit ${receipt.mainAfter}.` })
    const told = messagesTitled(`Hand-back problem ${problem} is fixed by merge entry ${repair} at ${receipt.mainAfter}.`)
    expect(told).toHaveLength(1)
    expect(recipients(told[0]!)).toEqual([secretary])
    expect(Date.now()).toBeLessThan(deadline)
    drill.step(3, `repair entry ${repair} landed at ${receipt.mainAfter} before ${hand.deadline}; problem ${problem} is fixed; message ${told[0]!.id} told the secretary.`)

    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    try {
      vi.setSystemTime(deadline + 60_000)
      const after = await theWorkersList()
      expect(named(after.takeBacksDue, problem)).toEqual([])
      expect(named(after.takeBacksForAPerson, problem)).toEqual([])
      expect(named(after.takeBacksCannotBeRead, problem)).toEqual([])
      const asked = await runTheTakeBack(problem)
      expect(asked.code, asked.err + asked.out).toBe(1)
      expect(asked.out).toContain('office refused (409)')
      expect(takeBacksOf(problem)).toEqual([])
      drill.step(4, `the clock passed ${hand.deadline}; the worker's list names no take-back for problem ${problem}, and a take-back asked for anyway was refused with nothing filed.`)
    } finally {
      vi.useRealTimers()
    }
  } finally {
    line?.close()
    drill.print()
  }
}, 590_000)

it('closes an unnamed fix green on main after the deadline without filing a take-back', async () => {
  const drill = aDrill('C')
  let line: { close: () => void } | undefined
  try {
    const landed = await landsHandedBack('unnamed-fix', drill)
    line = landed.line
    const { main, problem, hand, deadline, entry } = landed
    const fix = await submitGit(main, 'ordinary-fix', dir => write(dir, { 'tests/thing.test.ts': "import { expect, it } from 'vitest'\nimport { answer } from '../src/thing.ts'\nit('answers', () => { expect(answer).toBe(2) })\n" }))
    expect(readingOf(fix.entry).fixRound).toBeUndefined()
    await judged(fix.entry)
    const done = await runTheTool(fix.entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(fix.entry)).toBe('merged')
    const mainAt = git(main, 'rev-parse', 'HEAD')
    expect(git(main, 'diff-tree', '--no-commit-id', '--name-only', '-r', mainAt)).toBe('tests/thing.test.ts')
    expect(git(main, 'show', 'HEAD:src/thing.ts')).toBe('export const answer = 2')
    expect(t.api.getRecord(problem)!.data.state).toBe('open')
    expect(Date.now()).toBeLessThan(deadline)
    drill.step(3, `ordinary entry ${fix.entry} landed at ${mainAt} before ${hand.deadline}, changed only the test, named no problem and left ${problem} open.`)
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    try {
      vi.setSystemTime(deadline + 60_000)
      expect(named((await theWorkersList()).takeBacksDue, problem)).toEqual([{ problem, entry, deadline: hand.deadline, timeZone: hand.timeZone, hours: 1 }])
      drill.step(4, `the deadline passed; the worker lists ${problem} due on main ${mainAt}.`)
      const before = t.client.sqlite.prepare("SELECT (SELECT count(*) FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.purpose') = 'take-back') AS runs, (SELECT count(*) FROM records WHERE kind = 'sealed_tip') AS seals").get()
      const checked = await runTheTakeBack(problem)
      expect(checked.code, checked.err + checked.out).toBe(0)
      expect(checked.out).toContain(`main ${mainAt}; tests/thing.test.ts: passed`)
      expect(checked.out).toContain('office fixed on main')
      expect(takeBacksOf(problem)).toEqual([])
      expect(t.client.sqlite.prepare("SELECT (SELECT count(*) FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.purpose') = 'take-back') AS runs, (SELECT count(*) FROM records WHERE kind = 'sealed_tip') AS seals").get()).toEqual(before)
      expect(git(main, 'rev-parse', 'HEAD')).toBe(mainAt)
      const closed = t.api.getRecord(problem)!
      expect(closed.data).toMatchObject({ state: 'fixed', fix: expect.stringContaining(mainAt), extra: { takeBack: { fixedOnMain: { at: expect.any(String), mainAt, files: [{ file: 'tests/thing.test.ts', log: expect.any(String) }] } } } })
      const proof = (closed.data.extra as { takeBack: { fixedOnMain: { files: { log: string }[] } } }).takeBack.fixedOnMain
      expect(readFileSync(proof.files[0]!.log, 'utf8')).toContain('tests/thing.test.ts')
      drill.step(5, `the tool ran tests/thing.test.ts alone on ${mainAt}, green; the office fixed ${problem} with fixedOnMain evidence and filed no entry, run or seal; main is unchanged.`)
      const told = t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => m.data.notice === 'handedBack' && String(m.data.body).includes('ran green by name') && String(m.data.body).includes(problem))
      expect(told).toHaveLength(1)
      expect(recipients(told[0]!)).toEqual(expect.arrayContaining([landed.line.author, secretary]))
      expect(recipients(told[0]!).filter(id => id === landed.line.author)).toHaveLength(1)
      expect(recipients(told[0]!).filter(id => id === secretary)).toHaveLength(1)
      expect(named((await theWorkersList()).takeBacksDue, problem)).toEqual([])
      drill.step(6, `message ${told[0]!.id} told the line and secretary once; the worker no longer lists ${problem} due.`)
    } finally { vi.useRealTimers() }
  } finally { line?.close(); drill.print() }
}, 590_000)
