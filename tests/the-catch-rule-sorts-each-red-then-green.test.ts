// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CATCH RULE SORTS EACH RED THEN GREEN (wave 13n round C, agreed in pkVr6rS5xZe-).
 *
 * GET /api/toolset/named-tests/files reads the file rows of named test runs over a window of local dates. On one run,
 * a green closes the reds since the previous green and pairs with the last of them. The checks run in the secretary's order:
 * the same tree is flaky; a changed test file hash is a test change; a green of the file on the green's tree before
 * the red is a mutation proof; anything else is a catch, kept with both commits. A row whose hash, commit or change
 * is null is neither side of a pair, and a row with no result counts only as a run.
 *
 * Every row here is made up: the trees are runs of one digit and the hashes are made-up hex.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { NO_UNCOMMITTED_CHANGE, THE_TEST_FILES_TOOL, TEST_FILES_WINDOW_MOST_DAYS, type TestFileResult } from '../src/shared/toolset.ts'

const ACTOR = { type: 'agent', id: 'catch-rule-tester' } as const
const HEADERS = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ACTOR.id, 'x-mole-office-workspace': 'default' }
interface Tree { commit: string | null; change: string | null }
const T0: Tree = { commit: '0'.repeat(40), change: NO_UNCOMMITTED_CHANGE }
const T1: Tree = { commit: '1'.repeat(40), change: NO_UNCOMMITTED_CHANGE }
/** T1's commit with an uncommitted change: a different tree. */
const T2: Tree = { commit: '1'.repeat(40), change: 'abcdef0123456789' }
const H1 = '1111111111111111'
const H2 = '2222222222222222'
const FILE = 'tests/synthetic-one.test.ts'
const FROM = '2026-10-19'
const TO = '2026-10-26'

interface Side { seq: number; at: string; commit: string; change: string }
interface FileAnswer {
  file: string; runs: number; reds: number; catches: number; flaky: number; testChanged: number; mutationProofs: number
  notComparable: number; medianSeconds: number | null; secondsKnown: number; caught: { run: string; red: Side; green: Side }[]
}
interface Answer { workspaceId: string; from: string; to: string; linesStoredSince: string | null; read: { runs: number; uses: number; rows: number }; files: FileAnswer[] }

let t: TestDb
let app: FastifyInstance
let runA: string
let runB: string

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  runA = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic run A', data: { state: 'running' }, actor: ACTOR }).id
  runB = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic run B', data: { state: 'running' }, actor: ACTOR }).id
  const category = t.api.createRecord({ workspaceId: 'default', kind: 'tool_category', title: 'Synthetic tools', data: { says: 'Test fixtures.' }, actor: ACTOR }).id
  for (const slug of [THE_TEST_FILES_TOOL, 'another-tool']) {
    t.api.createRecord({ workspaceId: 'default', kind: 'tool', title: slug, data: { entry: 'tool', slug, forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' }, actor: ACTOR })
  }
})
afterEach(async () => {
  await app.close()
  t.close()
})

interface Row { file?: string; result: TestFileResult; seconds?: number | null; hash?: string | null }
/** One use of the named tests on a run, then its time set to `at`, because the door stamps the office's clock. */
async function use(run: string, at: string, tree: Tree, rows: Row[]): Promise<number> {
  const files = rows.map(r => ({ file: r.file ?? FILE, result: r.result, seconds: r.seconds === undefined ? 1 : r.seconds, testFileHash: r.hash === undefined ? H1 : r.hash }))
  const res = await app.inject({ method: 'POST', url: '/api/toolset/uses', headers: { ...HEADERS, 'x-mole-office-session': run }, payload: { tool: THE_TEST_FILES_TOOL, said: 'A synthetic named run', files, tree } })
  expect(res.statusCode, res.body).toBe(201)
  const seq = (res.json() as { uses: number }).uses
  t.client.sqlite.prepare('UPDATE tool_uses SET at = ? WHERE run_id = ? AND seq = ?').run(at, run, seq)
  return seq
}
interface More { run?: string; file?: string; hash?: string | null; seconds?: number | null }
const step = (result: TestFileResult) => (at: string, tree: Tree, more: More = {}): Promise<number> =>
  use(more.run ?? runA, at, tree, [{ result, ...(more.file === undefined ? {} : { file: more.file }), ...(more.hash === undefined ? {} : { hash: more.hash }), ...(more.seconds === undefined ? {} : { seconds: more.seconds }) }])
const red = step('failed')
const green = step('passed')
const noResult = step('no result')
/** The n-th second of the window's second day, so the order of time follows the order of writing. */
const at = (n: number): string => `2026-10-20 10:00:${String(n).padStart(2, '0')}`

async function ask(from: string, to: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: `/api/toolset/named-tests/files?from=${from}&to=${to}`, headers: HEADERS })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}
async function read(from = FROM, to = TO): Promise<Answer> {
  const answer = await ask(from, to)
  expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  return answer.body as unknown as Answer
}
const fileOf = (answer: Answer, file = FILE): FileAnswer => {
  const found = answer.files.find(f => f.file === file)
  expect(found, `${file} is in the answer`).toBeDefined()
  return found as FileAnswer
}
const counts = (f: FileAnswer) => ({ runs: f.runs, reds: f.reds, catches: f.catches, flaky: f.flaky, testChanged: f.testChanged, mutationProofs: f.mutationProofs, notComparable: f.notComparable })
const NONE = { runs: 0, reds: 0, catches: 0, flaky: 0, testChanged: 0, mutationProofs: 0, notComparable: 0 }
const sideOf = (seq: number, when: string, tree: Tree): Side => ({ seq, at: when, commit: tree.commit as string, change: tree.change as string })

describe('the catch rule sorts each red then green', () => {
  it('1. a red and a green on the same tree are flaky', async () => {
    await red(at(1), T1)
    await green(at(2), T1)
    const f = fileOf(await read())
    expect(counts(f)).toEqual({ ...NONE, runs: 2, reds: 1, flaky: 1 })
    expect(f.caught).toEqual([])
  })

  it('2. a green whose test file hash differs from the red is a test change', async () => {
    await red(at(1), T1, { hash: H1 })
    await green(at(2), T2, { hash: H2 })
    expect(counts(fileOf(await read()))).toEqual({ ...NONE, runs: 2, reds: 1, testChanged: 1 })
  })

  it('3. a green on a tree the file was already green on before the red is a mutation proof', async () => {
    await green(at(1), T0)
    await red(at(2), T1)
    await green(at(3), T0)
    const f = fileOf(await read())
    expect(counts(f)).toEqual({ ...NONE, runs: 3, reds: 1, mutationProofs: 1 })
    expect(f.caught).toEqual([])
  })

  it('4. any other red then green is a catch, kept with both commits; the change hash alone makes another tree', async () => {
    const r1 = await red(at(1), T0)
    const g1 = await green(at(2), T1)
    const r2 = await red(at(3), T1, { run: runB })
    const g2 = await green(at(4), T2, { run: runB })
    const f = fileOf(await read())
    expect(counts(f)).toEqual({ ...NONE, runs: 4, reds: 2, catches: 2 })
    expect(f.caught).toEqual([
      { run: runA, red: sideOf(r1, at(1), T0), green: sideOf(g1, at(2), T1) },
      { run: runB, red: sideOf(r2, at(3), T1), green: sideOf(g2, at(4), T2) },
    ])
  })

  it('5. a green pairs with the last red since the previous green, and closes them all', async () => {
    await red(at(1), T0)
    await red(at(2), T1)
    await green(at(3), T1)
    await green(at(4), T2)
    // Paired with the first red this would be a catch; with the last it is flaky. The second green finds no red open.
    expect(counts(fileOf(await read()))).toEqual({ ...NONE, runs: 4, reds: 2, flaky: 1 })
  })

  it('6. the checks run in order: flaky before test changed, test changed before mutation proof', async () => {
    await red(at(1), T1, { hash: H1 })
    await green(at(2), T1, { hash: H2 })
    const later = 'tests/synthetic-two.test.ts'
    await green(at(3), T0, { file: later, hash: H1 })
    await red(at(4), T1, { file: later, hash: H2 })
    await green(at(5), T0, { file: later, hash: H1 })
    const answer = await read()
    expect(counts(fileOf(answer))).toEqual({ ...NONE, runs: 2, reds: 1, flaky: 1 })
    expect(counts(fileOf(answer, later))).toEqual({ ...NONE, runs: 3, reds: 1, testChanged: 1 })
  })

  it('7. a row with a null hash, commit or change is neither side of a pair; a row with no result counts only as a run', async () => {
    const files = { nullRed: 'tests/a-null-hash-red.test.ts', nullGreen: 'tests/b-null-commit-green.test.ts', nullChange: 'tests/c-null-change-green.test.ts', noResult: 'tests/d-no-result.test.ts', lastComparable: 'tests/e-last-comparable-red.test.ts' }
    // A red with no hash, then a green: nothing to pair. Its seconds still count.
    await red(at(1), T0, { file: files.nullRed, hash: null, seconds: 4 })
    await green(at(2), T1, { file: files.nullRed, seconds: 2 })
    // A green with no commit is passed over, and the next comparable green pairs with the red.
    await red(at(3), T0, { file: files.nullGreen })
    await green(at(4), { commit: null, change: NO_UNCOMMITTED_CHANGE }, { file: files.nullGreen })
    const pairedGreen = await green(at(5), T2, { file: files.nullGreen })
    // A green with no change hash is passed over, and nothing comes after it.
    await red(at(6), T0, { file: files.nullChange })
    await green(at(7), { commit: T1.commit, change: null }, { file: files.nullChange })
    // A row with no result, even with seconds and no hash, is passed over and counts only as a run.
    const firstRed = await red(at(8), T0, { file: files.noResult, seconds: 1 })
    await noResult(at(9), T1, { file: files.noResult, hash: null, seconds: 5 })
    const thenGreen = await green(at(10), T2, { file: files.noResult, seconds: 3 })
    // The last comparable red pairs, not a later red with no hash: T0 to T1 is a catch, T1 to T1 would be flaky.
    await red(at(11), T0, { file: files.lastComparable })
    await red(at(12), T1, { file: files.lastComparable, hash: null })
    await green(at(13), T1, { file: files.lastComparable })

    const answer = await read()
    expect(answer.files.map(f => f.file)).toEqual(Object.values(files))
    const nullRed = fileOf(answer, files.nullRed)
    expect(counts(nullRed)).toEqual({ ...NONE, runs: 2, reds: 1, notComparable: 1 })
    expect([nullRed.medianSeconds, nullRed.secondsKnown]).toEqual([3, 2])
    const nullGreen = fileOf(answer, files.nullGreen)
    expect(counts(nullGreen)).toEqual({ ...NONE, runs: 3, reds: 1, catches: 1, notComparable: 1 })
    expect(nullGreen.caught.map(c => c.green.seq)).toEqual([pairedGreen])
    expect(counts(fileOf(answer, files.nullChange))).toEqual({ ...NONE, runs: 2, reds: 1, notComparable: 1 })
    const withNoResult = fileOf(answer, files.noResult)
    expect(counts(withNoResult)).toEqual({ ...NONE, runs: 3, reds: 1, catches: 1 })
    expect(withNoResult.caught.map(c => [c.red.seq, c.green.seq])).toEqual([[firstRed, thenGreen]])
    expect([withNoResult.medianSeconds, withNoResult.secondsKnown]).toEqual([2, 2])
    expect(counts(fileOf(answer, files.lastComparable))).toEqual({ ...NONE, runs: 3, reds: 2, catches: 1, notComparable: 1 })
  })

  it('8. a red and a green on different runs are not paired, and a green on another run proves no mutation', async () => {
    await red(at(1), T0, { run: runA })
    await green(at(2), T1, { run: runB })
    const other = 'tests/synthetic-two.test.ts'
    await green(at(3), T0, { run: runB, file: other })
    await red(at(4), T1, { run: runA, file: other })
    await green(at(5), T0, { run: runA, file: other })
    const answer = await read()
    expect(counts(fileOf(answer))).toEqual({ ...NONE, runs: 2, reds: 1 })
    expect(counts(fileOf(answer, other))).toEqual({ ...NONE, runs: 3, reds: 1, catches: 1 })
  })

  it('9. rows before the window are context, a pair counts in the window of its green, and to is not included', async () => {
    const proof = 'tests/a-mutation-proof-across-from.test.ts'
    await green('2026-10-18 10:00:00', T0, { file: proof })
    await red('2026-10-18 11:00:00', T1, { file: proof })
    await green(`${FROM} 00:00:00`, T0, { file: proof })
    const catchAcross = 'tests/b-catch-across-from.test.ts'
    await red('2026-10-18 12:00:00', T0, { file: catchAcross })
    await green(`${FROM} 01:00:00`, T1, { file: catchAcross })
    const atTo = 'tests/c-green-at-to.test.ts'
    await red('2026-10-25 23:59:59', T0, { file: atTo })
    await green(`${TO} 00:00:00`, T1, { file: atTo })
    const onlyBefore = 'tests/d-only-before.test.ts'
    await red('2026-10-18 13:00:00', T0, { file: onlyBefore })

    const week = await read()
    expect(week.files.map(f => f.file)).toEqual([proof, catchAcross, atTo])
    expect(counts(fileOf(week, proof))).toEqual({ ...NONE, runs: 1, mutationProofs: 1 })
    expect(counts(fileOf(week, catchAcross))).toEqual({ ...NONE, runs: 1, catches: 1 })
    expect(counts(fileOf(week, atTo))).toEqual({ ...NONE, runs: 1, reds: 1 })

    const next = await read(TO, '2026-10-27')
    expect(next.files.map(f => f.file)).toEqual([atTo])
    expect(counts(fileOf(next, atTo))).toEqual({ ...NONE, runs: 1, catches: 1 })
  })

  it('10. the median takes every timed red and green, and the mean of the middle two when the count is even', async () => {
    const odd = 'tests/a-odd.test.ts'
    for (const [i, seconds] of [3, 1, null, 2].entries()) await green(at(i + 1), T0, { file: odd, seconds })
    const even = 'tests/b-even.test.ts'
    for (const [i, seconds] of [1, 2, 3, 10].entries()) await red(at(i + 10), T0, { file: even, seconds })
    const untimed = 'tests/c-untimed.test.ts'
    await green(at(20), T0, { file: untimed, seconds: null })
    const answer = await read()
    expect([fileOf(answer, odd).medianSeconds, fileOf(answer, odd).secondsKnown]).toEqual([2, 3])
    expect([fileOf(answer, even).medianSeconds, fileOf(answer, even).secondsKnown]).toEqual([2.5, 4])
    expect([fileOf(answer, untimed).medianSeconds, fileOf(answer, untimed).secondsKnown]).toEqual([null, 0])
  })

  it('11. the answer names its window, when lines were first stored and how much it read', async () => {
    const empty = await read()
    // narrowedByPermission is added to every object answer by the office (sayWhetherPermissionNarrowedIt).
    expect(empty).toEqual({ workspaceId: 'default', from: FROM, to: TO, linesStoredSince: null, read: { runs: 0, uses: 0, rows: 0 }, files: [], narrowedByPermission: null })

    const plain = await app.inject({ method: 'POST', url: '/api/toolset/uses', headers: { ...HEADERS, 'x-mole-office-session': runA }, payload: { tool: 'another-tool', said: 'A use with no files' } })
    expect(plain.statusCode, plain.body).toBe(201)
    t.client.sqlite.prepare('UPDATE tool_uses SET at = ? WHERE run_id = ? AND seq = ?').run('2026-10-01 08:00:00', runA, (plain.json() as { uses: number }).uses)
    await use(runA, '2026-10-18 08:00:00', T0, [{ result: 'passed', file: 'tests/a.test.ts' }, { result: 'passed', file: 'tests/b.test.ts' }])
    await use(runA, at(1), T0, [{ result: 'passed', file: 'tests/a.test.ts' }, { result: 'failed', file: 'tests/b.test.ts' }])
    await use(runB, at(2), T0, [{ result: 'no result', file: 'tests/c.test.ts', seconds: null, hash: null }])

    const answer = await read()
    expect(Object.keys(answer).sort()).toEqual(['files', 'from', 'linesStoredSince', 'narrowedByPermission', 'read', 'to', 'workspaceId'])
    expect(answer.linesStoredSince).toBe('2026-10-18 08:00:00')
    expect(answer.read).toEqual({ runs: 2, uses: 2, rows: 3 })
    expect(answer.files.map(f => f.file)).toEqual(['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts'])
    expect(Object.keys(fileOf(answer, 'tests/a.test.ts')).sort()).toEqual(['catches', 'caught', 'file', 'flaky', 'medianSeconds', 'mutationProofs', 'notComparable', 'reds', 'runs', 'secondsKnown', 'testChanged'])
  })

  it('12. reads only the rows of the caller\'s project', async () => {
    await red(at(1), T0)
    await green(at(2), T1)
    const project = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: 'catches-project', title: 'Synthetic catches project' } })
    expect(project.statusCode, project.body).toBe(201)
    const moved = await app.inject({ method: 'POST', url: `/api/records/${runA}/workspace`, headers: HEADERS, payload: { to: 'catches-project' } })
    expect(moved.statusCode, moved.body).toBe(200)
    const answer = await read()
    expect([answer.files, answer.linesStoredSince, answer.read]).toEqual([[], null, { runs: 0, uses: 0, rows: 0 }])
  })

  it('13. refuses a window it cannot read and names the place; 31 days is the most', async () => {
    expect(TEST_FILES_WINDOW_MOST_DAYS).toBe(31)
    expect((await ask('2026-10-01', '2026-11-01')).status).toBe(200)
    const refusals: { what: string; query: string; place: string }[] = [
      { what: 'no from', query: `to=${TO}`, place: 'from' },
      { what: 'no to', query: `from=${FROM}`, place: 'to' },
      { what: 'a day the calendar does not have', query: `from=2026-02-30&to=${TO}`, place: 'from' },
      { what: 'a word for a date', query: `from=${FROM}&to=tomorrow`, place: 'to' },
      { what: 'a time with the date', query: `from=${FROM}T00:00:00&to=${TO}`, place: 'from' },
      { what: 'to equal to from', query: `from=${FROM}&to=${FROM}`, place: 'to' },
      { what: 'to before from', query: `from=${TO}&to=${FROM}`, place: 'to' },
      { what: 'one day over the most', query: 'from=2026-10-01&to=2026-11-02', place: 'to' },
      { what: 'an unknown key', query: `from=${FROM}&to=${TO}&tree=all`, place: 'tree' },
    ]
    for (const refusal of refusals) {
      const res = await app.inject({ method: 'GET', url: `/api/toolset/named-tests/files?${refusal.query}`, headers: HEADERS })
      expect(res.statusCode, `${refusal.what}: ${res.body}`).toBe(400)
      // A place is named as zod names it, `to: …`, or quoted as an unknown key; a bare "to" is in many sentences.
      expect((res.json() as { error: string }).error, refusal.what).toMatch(new RegExp(`(?:^|[^A-Za-z])${refusal.place}:|"${refusal.place}"`))
    }
  })
})
