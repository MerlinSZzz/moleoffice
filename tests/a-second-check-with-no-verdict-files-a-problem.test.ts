// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECOND CHECK OF A RUN THAT ENDS WITH NO VERDICT FILES A PROBLEM FOR THE RUN'S STARTER, QUOTING WHAT EACH CHECK SESSION
 * KEPT.
 *
 * Round BL, item 2ao. A check tool that refuses its own verdict before posting it, and again after asking the model once,
 * ends with no verdict and keeps the verdict and both refusals on its check session (tools/the-inspector.mjs). The office
 * asks once more after a first such ending (askOnceMoreAfterNoVerdict). After a second one it asked nothing and told only
 * the secretary, in one quiet line, so the starter heard nothing and the kept words sat on two session records nobody was
 * pointed at. Now the office also files a problem about the run, quoting what each session kept or saying it kept none,
 * and sends it to the run's starter.
 *
 * WHAT IS REAL AND WHAT IS NOT. The database, server, worker passes and process ledger are real. The check tools are
 * labelled stand-ins that run no model and judge no work: tests/fake-inspection-tool-that-keeps-its-words.mjs keeps made-up
 * words on its session as the real tool does, and tests/fake-inspection-tool.mjs keeps none. The git tree, the agents and
 * the earlier check at its 5-hour limit are made up. Nothing reaches the live office.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - recordCheckToolEnded files no problem after the second ending: both cases go red on the count of problems.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { inspectionUsageIn, inspectionUsageReceipt } from '../src/config/usage.mjs'
import * as ending from '../src/config/inspection-ending.mjs'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let tree: string
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []
const KEEPS_NONE = join(process.cwd(), 'tests/fake-inspection-tool.mjs')
const KEEPS_ITS_WORDS = join(process.cwd(), 'tests/fake-inspection-tool-that-keeps-its-words.mjs')
const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const person = as('human', THE_PERSON)
const worker = as('agent', 'worker-w')
const officeWorker = as('agent', 'mole-office/the-message-worker')
interface Check { message: string; execution?: { session: string; ending?: string } }
interface Kept { verdict: string; answer: string | null; refusals: string[] }
function scratch(what: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `no-verdict-problem-${what}-`)))
  made.push(dir)
  return dir
}
function git(...args: string[]): string { return execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim() }
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = person) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}
function check(run: string): Check { return t.api.getRecord(run)!.data['theCheck'] as Check }
function asks(run: string): string[] {
  return (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aCheckWasQueued' ORDER BY rowid").all(run) as { id: string }[]).map(r => r.id)
}
function notices(run: string): Record<string, any>[] {
  return (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid").all(run) as { data: string }[]).map(r => JSON.parse(r.data))
}
/** Every problem linked "about" the run, in the order filed. */
function problems(run: string): { id: string; title: string; data: Record<string, any> }[] {
  return (t.client.sqlite.prepare("SELECT r.id, r.title, r.data FROM records r JOIN links l ON l.from_id = r.id WHERE r.kind = 'problem' AND l.type = 'about' AND l.to_id = ? ORDER BY r.rowid").all(run) as { id: string; title: string; data: string }[])
    .map(r => ({ id: r.id, title: r.title, data: JSON.parse(r.data) as Record<string, any> }))
}
/** Every message whose body begins with the problem's id, to whom it went, and the row of its notice kind. */
function theMessagesOf(problem: string): Record<string, any>[] {
  return (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' ORDER BY rowid").all() as { data: string }[])
    .map(r => JSON.parse(r.data) as Record<string, any>)
    .filter(m => String(m['body'] ?? '').startsWith(`Problem ${problem}.`))
}
/** What a check session kept under the key the office reads, or undefined. */
function keptOn(session: string): Kept | undefined {
  const key = (ending as unknown as Record<string, unknown>)['THE_UNPOSTED_VERDICT']
  if (typeof key !== 'string') return undefined
  return (t.api.getRecord(session)!.data['extra'] as Record<string, any> | undefined)?.[key] as Kept | undefined
}
async function sealed(): Promise<{ run: string; message: string }> {
  const run = t.api.createRecord({ kind: 'session', title: 'Synthetic no verdict twice', workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'worker-w' },
    data: { state: 'running', servingAgent: 'worker-w', workingDirectory: tree, cutFrom: 'main', doing: 'Synthetic fixture changes work/a.txt.' } }).id
  const ended = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, worker)
  expect(ended.status, ended.raw).toBe(200)
  // This fixture needs a real check. A worker seal may leave its round note, so the person asks explicitly.
  if (!check(run).message) {
    const asked = await call('POST', `/api/checks/${run}/ask-again`, {}, person)
    expect(asked.status, asked.raw).toBe(200)
  }
  expect(check(run).message).toBeTruthy()
  return { run, message: check(run).message }
}
async function start(run: string): Promise<Parameters<typeof onePass>[1][number]> {
  const pass = await onePass(settings, watching)
  const session = check(run).execution?.session
  expect(pass.started.some(r => r.session === session), JSON.stringify(pass)).toBe(true)
  return watching.find(r => r.session === session)!
}
async function dead(processRun: Parameters<typeof onePass>[1][number]): Promise<void> {
  const until = Date.now() + 15_000
  while (processRun.adapter.alive(processRun.handle) && Date.now() < until) await new Promise(r => setTimeout(r, 25))
  expect(processRun.adapter.alive(processRun.handle), 'synthetic tool did not end').toBe(false)
}
function clock(ms: number): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(ms))
  const part = (kind: string) => p.find(one => one.type === kind)?.value ?? ''
  return `${part('hour')}:${part('minute')}${part('dayPeriod').toLowerCase()} (Europe/London)`
}
/** A real queue hold, so the test reads the new ask before the worker starts it. */
function hold(): string {
  const sample = readFileSync(join(process.cwd(), 'tests/fixtures/a-check-that-hit-the-5-hour-limit.txt'), 'utf8')
  const reset = clock(Date.now() + 2 * 3_600_000)
  return t.api.createRecord({ kind: 'session', title: 'Synthetic earlier check at its 5-hour limit', workspaceId: 'default', origin: 'fixture',
    actor: { type: 'agent', id: 'mole-office/the-api-server' }, data: { state: 'crashed', runtime: 'inspection-tool', servingAgent: 'inspector-one',
      usageReceipt: inspectionUsageReceipt(inspectionUsageIn(sample)!),
      stopCause: { kind: 'session-limit', at: new Date().toISOString(), said: `You've hit your session limit · resets ${reset}`, resetsAt: reset } } }).id
}
/** TWO WHOLE CHECKS OF ONE RUN, each ending with no verdict, run by `tool`: the run, its two asks and its two check sessions. */
async function twoEndings(tool: string): Promise<{ run: string; old: string; next: string; first: string; second: string }> {
  settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: tool }
  const { run, message: old } = await sealed()
  const one = await start(run)
  await dead(one)
  const limitedSession = hold()
  await onePass(settings, watching)
  const next = check(run).message
  expect(next, 'the office filed no new ask after the first ending').not.toBe(old)
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.stopCause') WHERE id = ?").run(limitedSession)
  const two = await start(run)
  expect(two.session).not.toBe(one.session)
  await dead(two)
  await onePass(settings, watching)
  expect(check(run).execution).toMatchObject({ session: two.session, ending: 'no-verdict' })
  return { run, old, next, first: one.session, second: two.session }
}
async function finishWatching(): Promise<void> {
  const until = Date.now() + 20_000
  do {
    await new Promise(r => setTimeout(r, 25))
    const pass = await onePass(settings, watching)
    if (watching.length === 0 && pass.started.length === 0) return
  } while (Date.now() < until)
  expect(watching).toEqual([])
}
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const [headers, data] of [
    [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [person, { handle: 'inspector-one', name: 'Synthetic Inspector', role: 'inspector' }],
    [person, { handle: 'super-r', name: 'Synthetic Supervisor', role: 'supervisor' }],
    [as('agent', 'super-r'), { handle: 'worker-w', name: 'Synthetic Worker', role: 'worker', workArea: ['work'] }],
  ] as const) {
    const registered = await call('POST', '/api/agents/started', data, headers)
    expect(registered.status, registered.raw).toBe(201)
  }
  tree = scratch('tree')
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic no-verdict fixture')
  mkdirSync(join(tree, 'work')); writeFileSync(join(tree, 'work/a.txt'), 'Synthetic before.\n')
  git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline'); git('switch', '-q', '-c', 'work')
  writeFileSync(join(tree, 'work/a.txt'), 'Synthetic after.\n'); git('commit', '-q', '-am', 'Synthetic work')
  settings = { api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`, workspace: 'default', session: null, stopWithPid: null,
    checkout: aCheckoutForATestRun(), runs: 9, hops: 3, outputRoot: scratch('output'), env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: KEEPS_NONE,
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'), MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' } }
}, 60_000)
afterEach(async () => {
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.stopCause') WHERE json_extract(data, '$.runtime') = 'inspection-tool'").run()
  settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: KEEPS_NONE }
  await finishWatching()
}, 60_000)
afterAll(async () => {
  for (const r of watching) if (r.adapter.alive(r.handle)) r.adapter.stop(r.handle, 'Synthetic no-verdict problem test ended.')
  await app?.close(); t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('a second check of a run that ends with no verdict', () => {
  // MUTATION: recordCheckToolEnded's second ending files no problem; this goes red on the count of problems.
  it("files one problem about the run, quoting the words each check session kept, sends it to the run's starter, and asks nothing more", async () => {
    const { run, old, next, first, second } = await twoEndings(KEEPS_ITS_WORDS)

    // THE WORDS ARE KEPT WHERE THE OFFICE READS THEM: on each check session, under the one key.
    const kept = [first, second].map((session) => keptOn(session))
    for (const [n, one] of kept.entries()) expect(one, `what check session ${[first, second][n]!} kept`).toMatchObject({ verdict: expect.any(String), refusals: [expect.any(String), expect.any(String)] })

    // ONE PROBLEM, about the run, open and the agent's to move, naming both sessions and quoting each one's words.
    const filed = problems(run)
    expect(filed).toHaveLength(1)
    const problem = filed[0]!
    expect(problem.data).toMatchObject({ state: 'open', whose_move: 'agent' })
    const symptom = String(problem.data['symptom'])
    for (const session of [first, second]) expect(symptom).toContain(session)
    for (const one of kept) for (const words of [one!.verdict, one!.answer!, ...one!.refusals]) expect(symptom).toContain(words)
    expect(symptom).not.toContain('kept no verdict words')

    // IT REACHES THE STARTER, ONCE, BY A MESSAGE THAT WAKES, and nobody else is sent it.
    const superR = t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'super-r'").get() as { id: string }
    const sent = theMessagesOf(problem.id)
    expect(sent).toHaveLength(1)
    expect(sent[0]!['to']).toEqual([{ kind: 'agent', id: superR.id }])
    expect(sent[0]!['aboutRun']).toBe(run)
    const { NOTICES } = await import('../src/server/lib/notices.ts')
    expect(NOTICES[sent[0]!['notice'] as keyof typeof NOTICES], `the row of notice ${String(sent[0]!['notice'])}`).toMatchObject({ wakes: true })

    // NOTHING MORE IS ASKED, AND THE SECRETARY'S ONE QUIET LINE IS STILL SENT ONCE.
    expect(asks(run)).toEqual([old, next])
    expect(notices(run).filter(n => n['notice'] === 'aCheckGaveNoVerdictTwice')).toHaveLength(1)
    expect((await call('GET', `/api/checks/${run}`)).body['stands']['standing']).toBe('inspecting')

    // A REPEATED ENDING FILES NOTHING MORE.
    const repeated = await call('POST', `/api/checks/${run}/tool-ended`, { session: second, reason: 'Synthetic repeated end.', ending: 'no-verdict' }, officeWorker)
    expect(repeated.status, repeated.raw).toBe(200)
    for (let n = 0; n < 3; n++) expect((await onePass(settings, watching)).started).toEqual([])
    expect(problems(run)).toHaveLength(1)
    expect(theMessagesOf(problem.id)).toHaveLength(1)
    expect(asks(run)).toEqual([old, next])
    expect(notices(run).filter(n => n['notice'] === 'aCheckGaveNoVerdictTwice')).toHaveLength(1)
  })

  // MUTATION: as above; this goes red on the count of problems.
  it('says of each check session that kept no words that it kept none', async () => {
    const { run, first, second } = await twoEndings(KEEPS_NONE)
    for (const session of [first, second]) expect(keptOn(session)).toBeUndefined()
    const filed = problems(run)
    expect(filed).toHaveLength(1)
    const symptom = String(filed[0]!.data['symptom'])
    for (const session of [first, second]) expect(symptom).toContain(`Check session ${session} kept no verdict words.`)
    expect(theMessagesOf(filed[0]!.id)).toHaveLength(1)
  })
})
