// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real throwaway Office/Git. Only fixtures declare tests; no test runner or cloud transport is started.
 * Each refusal and both idempotency/narrow-read sites have separate mutation cases. */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { handBackFacts } from '../src/shared/merge-class.ts'
import { stampInZone } from '../src/shared/time.ts'
let t: TestDb, app: Awaited<ReturnType<typeof apiApp>>['app'], home: string
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let starter: string, author: string, secretary: string, round: string, filer: string, headers: Record<string, string>
let one: ReturnType<typeof ready>, receipt: string
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const human = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id }
const oldHome = process.env.HOME, oldHours = process.env.MOLE_OFFICE_HAND_BACK_HOURS
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'main-suite-hand-back-office-')); process.env.HOME = home
  t = await freshDb(); app = (await apiApp()).app; door = await import('../src/server/lib/merge-entry-door.ts')
  const start = async (role: string, by: Record<string, string> = human) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle: randomUUID(), name: 'Synthetic participant', role, ...(role === 'secretary' ? {} : { workArea: ['tests'] }) } })
    expect(r.statusCode, r.body).toBe(201); return String(r.json().agent.id)
  }
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  starter = await start('supervisor'); secretary = await start('secretary'); filer = await start('worker')
  author = await start('worker', { ...human, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter, 'x-mole-office-key': makeAnAgentKey(starter, null) })
  headers = { ...human, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': filer, 'x-mole-office-key': makeAnAgentKey(filer, null) }
  round = t.api.createRecord({ kind: 'session', title: 'Synthetic open round', workspaceId: 'default', actor: person, data: { state: 'running', servingAgentId: starter } }).id
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: 'default', sessionRecordId: round, type: 'process', key: String(process.pid), actor: person })
}, 60_000)
afterAll(async () => {
  await app?.close(); t?.close(); rmSync(home, { recursive: true, force: true })
  if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome
  if (oldHours === undefined) delete process.env.MOLE_OFFICE_HAND_BACK_HOURS; else process.env.MOLE_OFFICE_HAND_BACK_HOURS = oldHours
})
function ready(repository?: string) {
  const dir = repository ?? mkdtempSync(join(home, 'repository-')), file = 'tests/synthetic.test.ts'
  if (repository === undefined) {
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.name', 'Synthetic'); git(dir, 'config', 'user.email', 'synthetic@example.invalid')
    mkdirSync(join(dir, 'tests')); writeFileSync(join(dir, file), '// Synthetic\n'); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic baseline')
  }
  const mainBefore = git(dir, 'rev-parse', 'HEAD')
  writeFileSync(join(dir, file), randomUUID()); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic landing')
  const mainAfter = git(dir, 'rev-parse', 'HEAD')
  const run = t.api.createRecord({ kind: 'session', title: 'Synthetic entry run', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgentId: author, workingDirectory: dir, submission: { kind: 'git' } } }).id
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
  const seal = t.api.getRecord(run)!.data.sealedTip as string, sealHash = (t.api.getRecord(seal)!.data.seal as { hash: string }).hash
  const landedAt = '2026-10-21 09:00:00'
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'Synthetic merged entry', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'merged', run, seal: { id: seal, hash: sealHash }, submittedBy: { kind: 'agent', id: author }, changeset: { adapter: 'git', root: dir, repository: dir, branch: 'main', base: mainBefore, commit: mainAfter }, integrated: { entry: '', mainBefore, mainAfter, rebasedTip: mainAfter, sealId: seal, carriedVerdict: { run, by: { kind: 'person', id: person.id }, at: landedAt, how: 'Synthetic fixture', paths: 1, says: 'Synthetic release' }, reinspected: [], at: landedAt } } })).id
  return { id, run, dir, file, mainBefore, mainAfter, landedAt }
}
function makeReceipt(more: Record<string, unknown> = {}, actor = { type: 'agent' as const, id: filer }) {
  return t.api.createRecord({ kind: 'whole_suite_receipt', title: 'Synthetic red observation', workspaceId: 'default', origin: 'fixture', actor, data: { version: 1, repository: one.dir, clone: join(one.dir, 'synthetic-clone'), commit: one.mainAfter, tree: git(one.dir, 'rev-parse', 'HEAD^{tree}'), startedAt: one.landedAt, endedAt: one.landedAt, where: 'cloud box', buildExitCode: 0, suiteExitCode: 1, failedFiles: [one.file], artifacts: [], ...more } }).id
}
beforeEach(() => {
  process.env.MOLE_OFFICE_HAND_BACK_HOURS = '24'
  one = ready(); receipt = makeReceipt()
})
const reasons: Record<string, string> = { mainSuiteRangeCommit: 'commit', mainSuiteRangeAncestry: 'ancestor', mainSuiteRangeRepository: 'no merge entry', mainSuiteRangeLimit: '200 commits', mainSuiteHandBackCaller: 'receipt', mainSuiteHandBackMerged: 'merged', mainSuiteHandBackWith: 'mainAfter', mainSuiteHandBackWithout: 'mainBefore', mainSuiteHandBackRed: 'nonzero', mainSuiteHandBackGreen: 'exit zero', mainSuiteHandBackReceipt: 'whole-suite receipt', mainSuiteHandBackRepository: 'repository', mainSuiteHandBackCommit: 'main', mainSuiteHandBackFiles: 'failedFiles', mainSuiteHandBackAlone: 'red alone', mainSuiteHandBackRound: 'starter has no run going' }
const body = () => ({ receipt, files: [one.file], with: { commit: one.mainAfter, exit: 1, log: '/synthetic/with.log' }, without: { commit: one.mainBefore, exit: 0, log: '/synthetic/without.log' } })
const read = (from = one.mainBefore, to = one.mainAfter, repository = one.dir) => app.inject({ method: 'GET', url: `/api/merge-queue/landed-between?repository=${encodeURIComponent(repository)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, headers: human })
const hand = (payload = body(), by = headers) => app.inject({ method: 'POST', url: `/api/merge-queue/${one.id}/hand-back-from-the-main-suite`, payload, headers: by })
function changeEntry(dataPatch: Record<string, unknown>) { door.asTheMergeQueue(() => t.api.patchRecord(one.id, { dataPatch }, person)) }
function writes() { return t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() }
async function refused(payload: any, code: string, by = headers) {
  const before = writes(), r = await hand(payload, by)
  expect(r.statusCode, r.body).toBeGreaterThanOrEqual(400); expect(r.json().error).toContain(reasons[code]); expect(r.json().error).toContain('Nothing was written.'); expect(writes()).toEqual(before)
}
it('reads ordered landings with their line and exact tiling through one narrow entry read', async () => {
  const second = ready(one.dir), spy = vi.spyOn(t.client.sqlite, 'prepare')
  const r = await read(one.mainBefore, second.mainAfter); const queries = spy.mock.calls.map(c => String(c[0])); spy.mockRestore()
  expect(r.statusCode, r.body).toBe(200)
  expect(r.json()).toMatchObject({ tiled: true, gaps: [], landings: [{ id: one.id, title: 'Synthetic merged entry', run: one.run, line: { agent: author, starter }, mainBefore: one.mainBefore, mainAfter: one.mainAfter, landedAt: one.landedAt }, { id: second.id, mainBefore: one.mainAfter, mainAfter: second.mainAfter }] })
  const entryReads = queries.filter(q => !/SELECT 1 FROM/i.test(q) && /select/i.test(q) && /from ["`]?records/i.test(q) && /merge_entry/.test(q))
  expect(entryReads).toHaveLength(1); expect(entryReads[0]).toMatch(/json_extract.*root/i)
})
it('names each uncovered gap without filling it', async () => {
  git(one.dir, 'commit', '--allow-empty', '-qm', 'Synthetic gap')
  const gapEnd = git(one.dir, 'rev-parse', 'HEAD'), second = ready(one.dir)
  const r = await read(one.mainBefore, second.mainAfter)
  expect(r.statusCode, r.body).toBe(200)
  expect(r.json()).toMatchObject({ tiled: false, gaps: [{ from: one.mainAfter, to: gapEnd }] })
})
it.each(['from', 'to'] as const)('refuses a missing %s commit', async end => {
  const r = await read(end === 'from' ? 'f'.repeat(40) : one.mainBefore, end === 'to' ? 'f'.repeat(40) : one.mainAfter)
  expect(r.statusCode).toBe(409); expect(r.json().error).toContain(reasons['mainSuiteRangeCommit'])
})
it('refuses a nonancestor range', async () => { const r = await read(one.mainAfter, one.mainBefore); expect(r.statusCode).toBe(409); expect(r.json().error).toContain(reasons['mainSuiteRangeAncestry']) })
it('refuses an unregistered repository', async () => { const r = await read(one.mainBefore, one.mainAfter, home); expect(r.statusCode).toBe(404); expect(r.json().error).toContain(reasons['mainSuiteRangeRepository']) })
it('refuses more than 200 commits', async () => {
  for (let n = 0; n < 200; n++) git(one.dir, 'commit', '--allow-empty', '-qm', 'Synthetic range commit')
  const r = await read(one.mainBefore, git(one.dir, 'rev-parse', 'HEAD'))
  expect(r.statusCode).toBe(409); expect(r.json().error).toContain(reasons['mainSuiteRangeLimit'])
}, 30_000)
it('files the landing problem shape, valid hand-back facts, trace and notices to line and secretary', async () => {
  const start = Date.now(), payload = body(), r = await hand(payload)
  expect(r.statusCode, r.body).toBe(200); expect(r.json()).toMatchObject({ filed: true, unnamedFiles: [] })
  const problem = t.api.getRecord(r.json().problem)!, facts = (problem.data.extra as any).handBack
  expect(handBackFacts.safeParse(facts).success).toBe(true)
  expect(problem.title).toBe(`Handed back: merge entry ${one.id}`)
  expect(problem.data).toMatchObject({ state: 'open', whose_move: 'agent', seen_in: [one.file], found_by: `the merge queue at landing of ${one.id}`, symptom: expect.stringContaining('Name this problem with fixRound kind repair'), extra: { redOnMainFamily: true, mainSuiteTrace: { receipt, with: payload.with, without: payload.without }, handBack: { entry: one.id, repository: one.dir, files: [one.file], commits: [one.mainAfter], line: { agent: author, starter, run: round }, landedAt: one.landedAt, hours: 24 } } })
  // THE DEADLINE AS STORED: the office's wall clock 24 hours after one of the seconds the call took. It is not read back,
  // because a stamp in the hour the clocks go back names two moments, and the queue alone decides which it reads.
  const due: string[] = []; for (let s = Math.floor(start / 1000) * 1000; s <= Date.now(); s += 1000) due.push(stampInZone(s + 24 * 3_600_000, facts.timeZone))
  expect(due).toContain(facts.deadline)
  const messages = t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => m.data.notice === 'handedBack' && m.data.aboutRun === one.run)
  expect(messages.flatMap(m => m.data.to)).toEqual(expect.arrayContaining([author, starter, secretary].map(id => ({ kind: 'agent', id }))))
  expect(messages.every(m => String(m.data.body).includes(problem.id))).toBe(true)
})
it('a hand-back on the day before the clocks go back is due 24 hours on, not at the same time the next day', async () => {
  // 02:30:23 in London on 24 October 2026. 24 hours on is the second 01:30:23 of 25 October, after the clocks went back.
  const at = Date.parse('2026-10-24T01:30:23.000Z')
  vi.useFakeTimers({ toFake: ['Date'], now: at })
  try {
    const r = await hand(); expect(r.statusCode, r.body).toBe(200)
    const facts = (t.api.getRecord(r.json().problem)!.data.extra as any).handBack
    expect(facts.deadline).toBe(stampInZone(at + 24 * 3_600_000, facts.timeZone))
  } finally { vi.useRealTimers() }
})
it('a hand-back made in the first 01:xx of London the day before the clocks go back is due 24 hours on, not 25 (NHn0l-D7qvys)', async () => {
  // 01:30:23 in London on 24 October 2026, summer time. 24 hours on is the first 01:30:23 of 25 October, and the wall
  // time alone names that and the second one, an hour later. The stored moment is the first.
  const at = Date.parse('2026-10-24T00:30:23.000Z'), due = at + 24 * 3_600_000, zoneBefore = process.env.TZ
  process.env.TZ = 'Europe/London'
  vi.useFakeTimers({ toFake: ['Date'], now: at })
  try {
    const r = await hand(); expect(r.statusCode, r.body).toBe(200)
    const problem = t.api.getRecord(r.json().problem)!
    expect((problem.data.extra as any).handBack).toMatchObject({ deadline: '2026-10-25 01:30:23', timeZone: 'Europe/London', dueAt: '2026-10-25T01:30:23.000+01:00' })
    const { readTakeBack } = await import('../src/server/lib/take-back.ts')
    const saysAt = (ms: number) => { vi.setSystemTime(ms); const reading = readTakeBack(problem); return 'says' in reading ? reading.says : `a take-back is ${reading.kind}` }
    expect(saysAt(due - 1000)).toContain('has not passed')
    expect(saysAt(due + 1000)).not.toContain('has not passed')
  } finally {
    vi.useRealTimers()
    if (zoneBefore === undefined) delete process.env.TZ; else process.env.TZ = zoneBefore
  }
})
it('a second call names the open problem and files nothing, using a narrow problem read', async () => {
  const first = await hand(); expect(first.statusCode, first.body).toBe(200)
  const secondFile = 'tests/another.test.ts'; receipt = makeReceipt({ failedFiles: [one.file, secondFile] })
  const before = writes(), spy = vi.spyOn(t.client.sqlite, 'prepare'), payload = { ...body(), files: [one.file, secondFile] }
  const r = await hand(payload), queries = spy.mock.calls.map(c => String(c[0])); spy.mockRestore()
  expect(r.statusCode, r.body).toBe(200); expect(r.json()).toMatchObject({ filed: false, problem: first.json().problem, unnamedFiles: [secondFile] }); expect(writes()).toEqual(before)
  expect(queries.some(q => /json_extract.*handBack.entry/.test(q))).toBe(true)
})
it('refuses a caller without its own agent key', async () => { await refused(body(), 'mainSuiteHandBackCaller', human) })
it('refuses another proved agent than the original receipt filer', async () => {
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  await refused(body(), 'mainSuiteHandBackCaller', { ...headers, 'x-mole-office-actor-id': author, 'x-mole-office-key': makeAnAgentKey(author, null) })
})
it('reads the original receipt facts even when current facts were edited', async () => {
  receipt = makeReceipt({ failedFiles: ['tests/other.test.ts'] }); t.api.patchRecord(receipt, { dataPatch: { failedFiles: [one.file] } }, person)
  await refused(body(), 'mainSuiteHandBackFiles')
})
it('refuses an entry not merged', async () => { changeEntry({ state: 'withdrawn' }); await refused(body(), 'mainSuiteHandBackMerged') })
it('refuses with at any commit other than mainAfter', async () => { const p = body(); p.with.commit = one.mainBefore; await refused(p, 'mainSuiteHandBackWith') })
it('refuses without at any commit other than mainBefore', async () => { const p = body(); p.without.commit = one.mainAfter; await refused(p, 'mainSuiteHandBackWithout') })
it('refuses with exit zero', async () => { const p = body(); p.with.exit = 0; await refused(p, 'mainSuiteHandBackRed') })
it('refuses without exit nonzero', async () => { const p = body(); p.without.exit = 1; await refused(p, 'mainSuiteHandBackGreen') })
it('refuses a record that is not an original whole-suite receipt', async () => { const p = body(); p.receipt = one.run; await refused(p, 'mainSuiteHandBackReceipt') })
it('refuses a receipt of another repository', async () => { receipt = makeReceipt({ repository: home }); await refused(body(), 'mainSuiteHandBackRepository') })
it('refuses a receipt from before the landing', async () => { receipt = makeReceipt({ commit: one.mainBefore }); await refused(body(), 'mainSuiteHandBackCommit') })
it('refuses a receipt off main', async () => {
  git(one.dir, 'checkout', '-qb', 'synthetic-side'); git(one.dir, 'commit', '--allow-empty', '-qm', 'Synthetic side'); const side = git(one.dir, 'rev-parse', 'HEAD'); git(one.dir, 'checkout', '-q', 'main')
  receipt = makeReceipt({ commit: side }); await refused(body(), 'mainSuiteHandBackCommit')
})
it('accepts a later receipt on main', async () => { git(one.dir, 'commit', '--allow-empty', '-qm', 'Later main'); receipt = makeReceipt({ commit: git(one.dir, 'rev-parse', 'HEAD') }); expect((await hand()).statusCode).toBe(200) })
it('refuses a file absent from failedFiles', async () => { const p = body(); p.files = ['tests/other.test.ts']; await refused(p, 'mainSuiteHandBackFiles') })
it.each(['green', 'no result', 'not run'])('refuses version 2 alone outcome %s', async outcome => {
  const artifacts = outcome === 'green' ? ['log', 'report'] : []
  receipt = makeReceipt({ version: 2, aloneRuns: [{ file: one.file, outcome, ...(outcome === 'not run' ? {} : { exitCode: outcome === 'green' ? 0 : 124 }), ...(outcome === 'green' ? {} : { because: 'Synthetic unavailable result' }), artifacts: artifacts.map(name => ({ name, path: `/synthetic/${name}`, sha256Base64: Buffer.alloc(32).toString('base64') })) }] })
  await refused(body(), 'mainSuiteHandBackAlone')
})
it('refuses no open round, naming the exact reason without a problem for nobody', async () => {
  t.api.patchRecord(round, { dataPatch: { state: 'crashed' } }, person)
  try { const r = await hand(); expect(r.statusCode).toBe(409); expect(r.json()).toMatchObject({ error: expect.stringContaining('starter has no run going') }); await refused(body(), 'mainSuiteHandBackRound') }
  finally { t.api.patchRecord(round, { dataPatch: { state: 'running' } }, person) }
})

it('an attributed version 2 red alone is accepted', async () => {
  receipt = makeReceipt({ version: 2, aloneRuns: [{ file: one.file, outcome: 'red', exitCode: 1, artifacts: [{ name: 'report', path: '/synthetic/report', sha256Base64: Buffer.alloc(32).toString('base64') }] }] })
  const r = await hand(); expect(r.statusCode, r.body).toBe(200); expect(r.json().filed).toBe(true)
})
it('refuses an attributed caller with no key, even in the key window', async () => {
  const { 'x-mole-office-key': ignored, ...unproved } = headers
  void ignored
  await refused(body(), 'mainSuiteHandBackCaller', unproved)
})
it('the read refuses a side branch even when from is its ancestor', async () => {
  git(one.dir, 'checkout', '-qb', 'synthetic-branch'); git(one.dir, 'commit', '--allow-empty', '-qm', 'Synthetic unlanded side'); const side = git(one.dir, 'rev-parse', 'HEAD'); git(one.dir, 'checkout', '-q', 'main')
  const r = await read(one.mainBefore, side); expect(r.statusCode).toBe(409); expect(r.json().error).toContain('ancestor')
})
it('names beginning and ending gaps and gives an empty equal-commit range', async () => {
  const before = ready(one.dir); git(one.dir, 'commit', '--allow-empty', '-qm', 'Synthetic uncovered tail'); const end = git(one.dir, 'rev-parse', 'HEAD')
  const r = await read(one.mainBefore, end); expect(r.statusCode).toBe(200); expect(r.json().gaps).toEqual([{ from: before.mainAfter, to: end }])
  const empty = await read(end, end); expect(empty.statusCode).toBe(200); expect(empty.json()).toMatchObject({ landings: [], tiled: true, gaps: [] })
})
it('the read excludes an entry whose integration receipt exists but it is not merged', async () => {
  changeEntry({ state: 'withdrawn' })
  const r = await read(); expect(r.statusCode, r.body).toBe(200)
  expect(r.json()).toMatchObject({ landings: [], tiled: false, gaps: [{ from: one.mainBefore, to: one.mainAfter }] })
})
it('the read excludes another repository with the same landing commits', async () => {
  const foreign = ready()
  door.asTheMergeQueue(() => t.api.patchRecord(foreign.id, { dataPatch: { integrated: { ...(t.api.getRecord(foreign.id)!.data.integrated as Record<string, unknown>), mainBefore: one.mainBefore, mainAfter: one.mainAfter } } }, person))
  const r = await read(); expect(r.statusCode, r.body).toBe(200); expect(r.json().landings.map((l: any) => l.id)).toEqual([one.id])
})
it('a closed hand-back does not hold a later hand-back of the same entry', async () => {
  const first = await hand(); expect(first.statusCode, first.body).toBe(200)
  t.api.patchRecord(first.json().problem, { dataPatch: { state: 'fixed', fix: 'Synthetic closure of the earlier repair.' } }, person)
  const r = await hand(); expect(r.statusCode, r.body).toBe(200); expect(r.json().filed).toBe(true); expect(r.json().problem).not.toBe(first.json().problem)
})
