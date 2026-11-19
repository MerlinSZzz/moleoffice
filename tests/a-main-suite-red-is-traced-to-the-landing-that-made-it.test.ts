// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic commit/file table only. No real runner, starter, cloud box or test subprocess is used.
 * Mutations independently remove confirmation, gap rejection, each eligibility/baseline check,
 * monotonicity, file/run limits, grouping, and refusal continuation.
 *
 * A RED FILE A PUSH CHANGED IS ASKED OF THE EMERGENCY PUSHES (item 16, part d). A push moves main with no landing, so a
 * range that holds one has a gap. The cases for it are here, beside the gap rule they extend. The landed-between page
 * lists the pushes in the range, each with the files it changed. A red file a listed push changed is asked of the push
 * door once, wherever it sits: in a gap, on a page with no gap, or past the five-file limit. It becomes traced to the
 * push only when that door hands it back. A red file no listed push changed is not asked and stays unknown, as every
 * gap's file was before; nor is a file already red in the earlier receipt. When the range cannot be read, nothing is
 * asked, and the reason says so. The push door's own rules are in tests/an-emergency-push-to-main.test.ts.
 *
 * OLD (item 16, part d, as first built): every file the trace reached on a page with a gap was asked of the push door.
 * NEW (the second answer about item 16's leftovers): only a red file a push the page lists changed is asked. */
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { traceMainSuiteReds } from '../tools/main-suite-red-trace.mjs'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
const hash = (n: number) => n.toString(16).padStart(40, '0')
const file = 'tests/synthetic.test.ts'
const PUSH_DOOR = '/api/merge-queue/emergency-pushes/hand-back-from-the-main-suite'
function setup(count = 4, files = [file]) {
  const workdir = mkdtempSync(join(tmpdir(), 'main-suite-trace-synthetic-')); folders.push(workdir)
  const repository = '/synthetic/repository', calls: any[] = [], runs: any[] = []
  const receipt = { id: randomUUID(), data: { version: 2, repository, commit: hash(count), failedFiles: files, aloneRuns: files.map(file => ({ file, outcome: 'red' })) } }
  const previousReceipt = { id: randomUUID(), data: { version: 1, repository, commit: hash(0), failedFiles: [] as string[] } }
  const landings = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), title: 'Synthetic landing', run: randomUUID(), line: { agent: null, starter: null }, mainBefore: hash(i), mainAfter: hash(i + 1), landedAt: '2026-10-22 09:00:00' }))
  const problem = randomUUID()
  const page = { repository, from: hash(0), to: hash(count), landings, tiled: true, gaps: [] as any[], pushes: [] as any[] }
  const officeRequest = async (asked: any) => {
    calls.push(asked)
    return { status: 200, cut: false, location: null, body: JSON.stringify(asked.method === 'GET' ? page : { problem, filed: true, unnamedFiles: [] }) }
  }
  const runAlone = async ({ commit, file }: any) => {
    runs.push({ commit, file })
    const outcome = Number.parseInt(commit, 16) >= 3 ? 'red' : 'green'
    return { outcome, exit: outcome === 'red' ? 1 : 0, log: `/synthetic/${runs.length}.log` }
  }
  return { receipt, previousReceipt, repository, workdir, calls, runs, landings, page, problem, officeRequest, runAlone }
}
it('halves four landing boundaries, confirms both sides again and hands back once', async () => {
  const one = setup(), result = await traceMainSuiteReds(one)
  expect(result.files).toEqual([expect.objectContaining({ file, status: 'traced', landing: one.landings[2]!.id, problem: one.problem })])
  const writes = one.calls.filter(c => c.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ path: `/api/merge-queue/${one.landings[2]!.id}/hand-back-from-the-main-suite`, body: { receipt: one.receipt.id, files: [file], with: { commit: hash(3), exit: 1 }, without: { commit: hash(2), exit: 0 } } })
  expect(one.runs.filter(r => r.commit === hash(2)).length).toBeGreaterThanOrEqual(2)
  expect(one.runs.filter(r => r.commit === hash(3)).length).toBeGreaterThanOrEqual(2)
  expect(one.runs.length).toBeLessThanOrEqual(8)
  expect(result.files[0]!.runs.length).toBeGreaterThan(0)
  expect(Array.isArray(result.files[0]!.unvisited)).toBe(true)
  expect(JSON.parse(readFileSync(writes[0].body.with.log, 'utf8')).files[0]).toMatchObject({ file, runs: expect.any(Array), unvisited: expect.any(Array) })
  expect(one.calls[0].path).toBe(`/api/merge-queue/landed-between?repository=${encodeURIComponent(one.repository)}&from=${hash(0)}&to=${hash(4)}`)
})
it.each(['green', 'no result', 'not run'])('does not trace a version 2 file that was %s alone', async outcome => {
  const one = setup(); one.receipt.data.aloneRuns[0]!.outcome = outcome
  const result = await traceMainSuiteReds(one)
  expect(result.files[0]!).toMatchObject({ file, status: 'not traced', reason: expect.stringContaining(outcome) })
  expect(one.calls).toEqual([]); expect(one.runs).toEqual([])
})
it('says no earlier receipt without guessing a baseline', async () => {
  const one = setup(), result = await traceMainSuiteReds({ ...one, previousReceipt: null })
  expect(result.files[0]!).toMatchObject({ status: 'not traced', reason: expect.stringContaining('no earlier receipt') })
  expect(one.calls).toEqual([])
})
it('says red since at least the earlier receipt', async () => {
  const one = setup(); one.previousReceipt.data.failedFiles = [file]
  const result = await traceMainSuiteReds(one)
  expect(result.files[0]!).toMatchObject({ status: 'not traced', reason: expect.stringContaining(`red since at least ${one.previousReceipt.id}`) })
  expect(one.calls).toEqual([])
})
it('does not borrow a baseline from another repository or unobserved failures', async () => {
  for (const data of [{ repository: '/other', failedFiles: [] }, { repository: '/synthetic/repository', failedFiles: undefined }]) {
    const one = setup(), result = await traceMainSuiteReds({ ...one, previousReceipt: { ...one.previousReceipt, data: { ...one.previousReceipt.data, ...data } } })
    expect(result.files[0]!.status).toBe('not traced'); expect(one.calls).toEqual([])
  }
})
it('a gap is unknown and never assigned to a landing', async () => {
  const one = setup(); one.page.tiled = false; one.page.gaps = [{ from: hash(1), to: hash(2) }]
  const result = await traceMainSuiteReds(one)
  expect(result.files[0]!).toMatchObject({ status: 'unknown', reason: expect.stringContaining('gap') })
  // The push door may be asked about the gap; no landing's door is.
  expect(one.runs).toEqual([]); expect(one.calls.filter(c => c.method === 'POST' && c.path !== PUSH_DOOR)).toEqual([])
  expect(result.files[0]).not.toHaveProperty('landing')
})
it.each(['between two landings', 'with no landing in the range'])('a gap %s asks the push door once about the file a listed push changed, and a file it hands back is traced to the push', async where => {
  const other = 'tests/another.test.ts', one = setup(4, [file, other]), push = randomUUID(), pushProblem = randomUUID()
  one.page.tiled = false; one.page.gaps = [{ from: hash(1), to: hash(2) }]
  one.page.pushes = [{ id: push, mainBefore: hash(1), commit: hash(2), files: [file] }]
  if (where === 'with no landing in the range') { one.page.landings = []; one.page.gaps = [{ from: hash(0), to: hash(4) }] }
  const result = await traceMainSuiteReds({ ...one, officeRequest: async (asked: any) => {
    if (asked.path !== PUSH_DOOR) return one.officeRequest(asked)
    one.calls.push(asked)
    return { status: 200, cut: false, location: null, body: JSON.stringify({ handedBack: [{ push, problem: pushProblem, filed: true, files: [file], unnamedFiles: [] }], notThePushes: [] }) }
  } })
  expect(result.files[0]!).toMatchObject({ file, status: 'traced', push, problem: pushProblem, reason: expect.stringContaining(push) })
  expect(result.files[0]!).not.toHaveProperty('landing')
  // NO LISTED PUSH CHANGED `other`, so it is not asked, and stays unknown with the gap's reason.
  expect(result.files[1]!).toMatchObject({ file: other, status: 'unknown', reason: expect.stringContaining('gap') })
  expect(result.files[1]!).not.toHaveProperty('push')
  expect(one.calls.filter(c => c.method === 'POST')).toEqual([{ method: 'POST', path: PUSH_DOOR, body: { receipt: one.receipt.id, files: [file] } }])
  expect(one.runs).toEqual([])
})
it('a file the push door holds in an older problem is not held, and a refusal leaves every file unknown with the reason', async () => {
  const push = randomUUID(), pushProblem = randomUUID()
  const answers = [
    { status: 200, cut: false, location: null, body: JSON.stringify({ handedBack: [{ push, problem: pushProblem, filed: false, files: [file], unnamedFiles: [file] }], notThePushes: [] }) },
    { status: 409, cut: false, location: null, body: JSON.stringify({ error: 'Synthetic push refusal' }) },
  ]
  for (const answer of answers) {
    const one = setup(); one.page.tiled = false; one.page.gaps = [{ from: hash(1), to: hash(2) }]
    one.page.pushes = [{ id: push, mainBefore: hash(1), commit: hash(2), files: [file] }]
    const result = await traceMainSuiteReds({ ...one, officeRequest: async (asked: any) => asked.path === PUSH_DOOR ? answer : one.officeRequest(asked) })
    if (answer.status === 200) expect(result.files[0]!).toMatchObject({ status: 'not held', push, problem: pushProblem, reason: expect.stringContaining('does not name') })
    else expect(result.files[0]!).toMatchObject({ status: 'unknown', reason: expect.stringMatching(/gap.*Synthetic push refusal/s) })
  }
})
/** The office, answering the push door as `handedBack` says and every other path as the setup's office does. */
function aPushDoor(one: ReturnType<typeof setup>, handedBack: unknown[]) {
  return async (asked: any) => {
    if (asked.path !== PUSH_DOOR) return one.officeRequest(asked)
    one.calls.push(asked)
    return { status: 200, cut: false, location: null, body: JSON.stringify({ handedBack, notThePushes: [] }) }
  }
}
it.each(['past the five-file limit', 'on a page with no gap'])('a red file a listed push changed is asked of the push door %s', async where => {
  const push = randomUUID(), pushProblem = randomUUID()
  const files = where === 'past the five-file limit' ? Array.from({ length: 6 }, (_, n) => `tests/synthetic-${n}.test.ts`) : [file]
  const one = setup(4, files), changed = files.at(-1)!
  if (where === 'past the five-file limit') { one.page.tiled = false; one.page.gaps = [{ from: hash(1), to: hash(2) }] }
  one.page.pushes = [{ id: push, mainBefore: hash(1), commit: hash(2), files: [changed] }]
  const result = await traceMainSuiteReds({ ...one, officeRequest: aPushDoor(one, [{ push, problem: pushProblem, filed: true, files: [changed], unnamedFiles: [] }]) })
  expect(one.calls.filter(c => c.path === PUSH_DOOR)).toEqual([{ method: 'POST', path: PUSH_DOOR, body: { receipt: one.receipt.id, files: [changed] } }])
  const traced = result.files.find((one: any) => one.file === changed)
  if (where === 'past the five-file limit') {
    expect(traced).toMatchObject({ status: 'traced', push, problem: pushProblem, reason: expect.stringContaining(push) })
    // THE FIVE FILES BEFORE IT are in the gap, and no listed push changed them, so none is asked.
    for (const other of result.files.slice(0, 5)) expect(other).toMatchObject({ status: 'unknown', reason: expect.stringContaining('gap') })
  } else {
    // A PAGE WITH NO GAP traces the file to its landing; the push the page lists is asked as well and named beside it.
    expect(traced).toMatchObject({ status: 'traced', landing: one.landings[2]!.id, problem: one.problem, reason: expect.stringContaining(push) })
  }
})
it('a red file no listed push changed is not asked of the push door, nor a file already red in the earlier receipt', async () => {
  const other = 'tests/another.test.ts', third = 'tests/a-third.test.ts', one = setup(4, [file, other, third]), push = randomUUID()
  one.page.tiled = false; one.page.gaps = [{ from: hash(1), to: hash(2) }]
  one.previousReceipt.data.failedFiles = [third]
  one.page.pushes = [{ id: push, mainBefore: hash(1), commit: hash(2), files: [other, third] }]
  const result = await traceMainSuiteReds({ ...one, officeRequest: aPushDoor(one, [{ push, problem: randomUUID(), filed: true, files: [other], unnamedFiles: [] }]) })
  expect(one.calls.filter(c => c.method === 'POST')).toEqual([{ method: 'POST', path: PUSH_DOOR, body: { receipt: one.receipt.id, files: [other] } }])
  expect(result.files[0]!).toMatchObject({ file, status: 'unknown', reason: expect.stringContaining('gap') })
  expect(result.files[2]!).toMatchObject({ file: third, status: 'not traced', reason: expect.stringContaining('red since at least') })
  for (const unasked of [result.files[0]!, result.files[2]!]) expect(unasked).not.toHaveProperty('push')
})
it.each(['refused', 'read with no list of pushes'])('a landing range %s asks no push, and the reason says so', async how => {
  const files = Array.from({ length: 6 }, (_, n) => `tests/synthetic-${n}.test.ts`), one = setup(4, files)
  const { pushes: _left, ...withNoList } = { ...one.page, tiled: false, gaps: [{ from: hash(1), to: hash(2) }] }
  const result = await traceMainSuiteReds({ ...one, officeRequest: async (asked: any) => {
    one.calls.push(asked)
    if (asked.method !== 'GET') return { status: 200, cut: false, location: null, body: JSON.stringify({ handedBack: [], notThePushes: [] }) }
    return how === 'refused' ? { status: 409, cut: false, location: null, body: JSON.stringify({ error: 'Synthetic range refusal' }) } : { status: 200, cut: false, location: null, body: JSON.stringify(withNoList) }
  } })
  expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
  for (const each of result.files) expect(each).toMatchObject({ reason: expect.stringMatching(/no emergency push was asked/i) })
  expect(result.files[5]!).toMatchObject({ reason: expect.stringContaining('the 5 file limit was reached') })
  if (how === 'refused') expect(result.files[5]!).toMatchObject({ reason: expect.stringContaining('Synthetic range refusal') })
})
it('a page that says tiled but does not chain is not asked of the push door', async () => {
  const one = setup(); one.landings[1]!.mainBefore = hash(0)
  const result = await traceMainSuiteReds(one)
  expect(result.files[0]!.status).toBe('unknown')
  expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
})
it('a no result is unknown, never a red answer', async () => {
  const one = setup(), result = await traceMainSuiteReds({ ...one, runAlone: async () => ({ outcome: 'no result', exit: 124, log: '/synthetic/no-result.log' }) })
  expect(result.files[0]!).toMatchObject({ status: 'unknown', reason: expect.stringContaining('no result') })
  expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
})
it('a changed answer on confirming with is unknown', async () => {
  const one = setup(), seen = new Set<string>()
  const result = await traceMainSuiteReds({ ...one, runAlone: async (asked: any) => {
    const ran = await one.runAlone(asked)
    if (asked.commit === hash(3) && seen.has(asked.commit)) return { ...ran, outcome: 'green', exit: 0 }
    seen.add(asked.commit); return ran
  } })
  expect(result.files[0]!).toMatchObject({ status: 'unknown', reason: expect.stringMatching(/monotone|changed/) })
  expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
})
it('a changed answer on confirming without is unknown', async () => {
  const one = setup(), seen = new Set<string>()
  const result = await traceMainSuiteReds({ ...one, runAlone: async (asked: any) => {
    const ran = await one.runAlone(asked)
    if (asked.commit === hash(2) && seen.has(asked.commit)) return { ...ran, outcome: 'red', exit: 1 }
    seen.add(asked.commit); return ran
  } })
  expect(result.files[0]!.status).toBe('unknown'); expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
})
it('caps traced files at five even when a caller raises the limit', async () => {
  const files = Array.from({ length: 6 }, (_, n) => `tests/synthetic-${n}.test.ts`), one = setup(4, files)
  const result = await traceMainSuiteReds({ ...one, limits: { files: 99, runs: 99 } })
  expect(result.files[5]!).toMatchObject({ status: 'not traced', reason: expect.stringContaining('5') })
  expect(one.runs.some(r => r.file === files[5])).toBe(false)
  expect(one.calls.filter(c => c.method === 'POST')).toHaveLength(1)
  expect(one.calls.find(c => c.method === 'POST').body.files).toEqual(files.slice(0, 5))
})
it('stops as unknown at the run limit, reserving runs for both confirmations', async () => {
  const one = setup(), result = await traceMainSuiteReds({ ...one, limits: { runs: 2 } })
  expect(result.files[0]!).toMatchObject({ status: 'unknown', reason: expect.stringContaining('limit') })
  expect(one.runs.length).toBeLessThanOrEqual(2); expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
})
it('version 1 traces every failed file and groups all files at one landing', async () => {
  const one = setup(4, [file, 'tests/another.test.ts'])
  const result = await traceMainSuiteReds({ ...one, receipt: { ...one.receipt, data: { ...one.receipt.data, version: 1, aloneRuns: undefined } } })
  expect(result.files.every((f: any) => f.status === 'traced')).toBe(true)
  expect(one.calls.filter(c => c.method === 'POST')).toHaveLength(1)
  expect(one.calls.find(c => c.method === 'POST').body.files).toEqual(one.receipt.data.failedFiles)
})
it('says a write refusal for its files and landing, and continues with another landing', async () => {
  const other = 'tests/another.test.ts', one = setup(4, [file, other])
  let writes = 0
  const result = await traceMainSuiteReds({ ...one, runAlone: async (asked: any) => asked.file === file ? one.runAlone(asked) : { outcome: Number.parseInt(asked.commit, 16) >= 2 ? 'red' : 'green', exit: Number.parseInt(asked.commit, 16) >= 2 ? 1 : 0, log: '/synthetic/other.log' }, officeRequest: async (asked: any) => {
    if (asked.method === 'POST' && ++writes === 1) return { status: 409, cut: false, location: null, body: JSON.stringify({ error: 'Synthetic closed round', code: 'mainSuiteHandBackRound' }) }
    return one.officeRequest(asked)
  } })
  expect(result.files[0]!).toMatchObject({ file, status: 'refused', landing: one.landings[2]!.id, reason: expect.stringContaining('Synthetic closed round') })
  expect(result.files[1]!).toMatchObject({ file: other, status: 'traced', landing: one.landings[1]!.id })
  expect(writes).toBe(2)
})
it('an unbounded, cut or refused read is unknown', async () => {
  for (const reply of [{ status: 200, cut: true, body: '{}' }, { status: 409, cut: false, body: JSON.stringify({ error: 'Synthetic range refusal' }) }, { status: 200, cut: false, body: JSON.stringify({ landings: [], tiled: true, gaps: [] }) }]) {
    const one = setup(), result = await traceMainSuiteReds({ ...one, officeRequest: async () => reply })
    expect(result.files[0]!.status).toBe('unknown'); expect(one.runs).toEqual([])
  }
})

it.each(['flag', 'gaps', 'chain', 'tail'])('rejects a gap in the %s independently', async defect => {
    const one = setup()
    if (defect === 'flag') one.page.tiled = false
    if (defect === 'gaps') one.page.gaps = [{ from: hash(1), to: hash(2) }]
    if (defect === 'chain') one.landings[1]!.mainBefore = hash(0)
    if (defect === 'tail') one.landings[3]!.mainAfter = hash(5)
    const result = await traceMainSuiteReds(one)
    expect(result.files[0]!).toMatchObject({ status: 'unknown', reason: expect.stringContaining('gap') })
    expect(one.runs).toEqual([])
})
it('confirmation with no result never hands back either side', async () => {
  for (const end of [2, 3]) {
    const one = setup(), seen = new Set<string>()
    const result = await traceMainSuiteReds({ ...one, runAlone: async (asked: any) => {
      const first = !seen.has(asked.commit); seen.add(asked.commit)
      return !first && asked.commit === hash(end) ? { outcome: 'no result', exit: 124, log: '/synthetic/no-confirmation.log' } : one.runAlone(asked)
    } })
    expect(result.files[0]!).toMatchObject({ status: 'unknown', reason: expect.stringContaining('no result') })
    expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
  }
})
it('caps the run budget at eight even when raised, and leaves long searches unknown', async () => {
  const one = setup(200), result = await traceMainSuiteReds({ ...one, limits: { runs: 99 } })
  expect(result.files[0]!.status).toBe('unknown'); expect(one.runs.length).toBe(8)
  expect(one.calls.filter(c => c.method === 'POST')).toEqual([])
})
it('an existing problem that omits a file is said as not held', async () => {
  const one = setup(), result = await traceMainSuiteReds({ ...one, officeRequest: async (asked: any) => asked.method === 'GET' ? one.officeRequest(asked) : { status: 200, cut: false, location: null, body: JSON.stringify({ problem: one.problem, filed: false, unnamedFiles: [file] }) } })
  expect(result.files[0]!).toMatchObject({ status: 'not held', problem: one.problem, reason: expect.stringContaining('does not name') })
})
it('keeps the eight-run budget through repeated tracing of the same firing receipt', async () => {
  const one = setup()
  expect((await traceMainSuiteReds(one)).files[0]!.status).toBe('traced')
  expect((await traceMainSuiteReds(one)).files[0]!.status).toBe('traced')
  const result = await traceMainSuiteReds(one)
  expect(result.files[0]).toMatchObject({ status: 'unknown', reason: expect.stringContaining('limit') })
  expect(one.runs).toHaveLength(8)
  expect(one.calls.filter(c => c.method === 'POST')).toHaveLength(2)
})
