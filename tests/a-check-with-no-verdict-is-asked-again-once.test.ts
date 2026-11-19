// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A completed second answer with no verdict asks for one more whole check through the office queue.
 * The database, server, worker passes and process ledger are real. The check tool, git tree and model
 * answers are labelled synthetic fixtures. No model runs and nothing reaches the live office.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { readFileSync } from 'node:fs'
import { inspectionUsageIn, inspectionUsageReceipt } from '../src/config/usage.mjs'
import { outputOf } from '../src/worker/runtimes/common.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let tree: string
const made: string[] = []
const queuedAtEnding = new Map<string, ReturnType<typeof delivery>>()
const watching: Parameters<typeof onePass>[1] = []
const TOOL = join(process.cwd(), 'tests/fake-inspection-tool.mjs')
const LIMIT = join(process.cwd(), 'tests/fake-check-that-hit-the-5-hour-limit.mjs')
const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const person = as('human', THE_PERSON)
const worker = as('agent', 'worker-w')
const officeWorker = as('agent', 'mole-office/the-message-worker')
const SWITCH = '/api/office/checks-in-merges-only'
interface Check {
  message: string
  askedAgainFrom?: { message: string; session: string }
  execution?: { session: string; endedAt?: string; failed?: string; ending?: string }
  says: string
}
function scratch(what: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `no-verdict-${what}-`)))
  made.push(dir)
  return dir
}
function git(...args: string[]): string { return execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim() }
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = person) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}
function check(run: string): Check { return t.api.getRecord(run)!.data['theCheck'] as Check }
function delivery(message: string): { mark: string; because: string; run: string } {
  return t.client.sqlite.prepare("SELECT mark, because, run FROM message_delivery WHERE message_id = ? AND recipient_id = (SELECT id FROM agents WHERE handle = 'inspector-one')").get(message) as ReturnType<typeof delivery>
}
function asks(run: string): string[] {
  return (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aCheckWasQueued' ORDER BY rowid").all(run) as { id: string }[]).map(r => r.id)
}
function notices(run: string): Record<string, any>[] {
  return (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid").all(run) as { data: string }[]).map(r => JSON.parse(r.data))
}
async function sealed(title = 'Synthetic no verdict twice'): Promise<{ run: string; message: string }> {
  const run = t.api.createRecord({ kind: 'session', title, workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'worker-w' },
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
function hold(): string {
  const sample = readFileSync(join(process.cwd(), 'tests/fixtures/a-check-that-hit-the-5-hour-limit.txt'), 'utf8')
  const reset = clock(Date.now() + 2 * 3_600_000)
  return t.api.createRecord({ kind: 'session', title: 'Synthetic earlier check at its 5-hour limit', workspaceId: 'default', origin: 'fixture',
    actor: { type: 'agent', id: 'mole-office/the-api-server' }, data: { state: 'crashed', runtime: 'inspection-tool', servingAgent: 'inspector-one',
      usageReceipt: inspectionUsageReceipt(inspectionUsageIn(sample)!),
      stopCause: { kind: 'session-limit', at: new Date().toISOString(), said: `You've hit your session limit · resets ${reset}`, resetsAt: reset } } }).id
}
async function firstEnd(keepHold = false): Promise<{ run: string; old: string; first: string; next: string; limitedSession: string }> {
  const { run, message: old } = await sealed()
  const processRun = await start(run)
  await dead(processRun)
  // A real queue hold gives the test a stable point at which to read the new, unstarted ask.
  const limitedSession = hold()
  const pass = await onePass(settings, watching)
  const next = check(run).message
  expect(next, 'the office filed no new ask').not.toBe(old)
  expect(check(run).execution, 'the queue did not honor the 5-hour hold').toBeUndefined()
  expect(pass.started.some(r => r.messageId === next)).toBe(false)
  if (!keepHold) t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.stopCause') WHERE id = ?").run(limitedSession)
  return { run, old, first: processRun.session, next, limitedSession }
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
  app.addHook('onResponse', async req => {
    const run = /^\/api\/checks\/([^/]+)\/tool-ended$/.exec(req.url)?.[1]
    if (run !== undefined && check(run).askedAgainFrom !== undefined) {
      const message = check(run).message
      if (!queuedAtEnding.has(message)) queuedAtEnding.set(message, delivery(message))
    }
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'second', title: 'Synthetic other project' })
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
    checkout: process.cwd(), runs: 9, hops: 3, outputRoot: scratch('output'), env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: TOOL,
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'), MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' } }
}, 60_000)
afterEach(async () => {
  await call('PATCH', '/api/workspaces/default', { reviewLevel: 'full' })
  settings.mergesOnly = false
  await call('POST', SWITCH, { on: false, because: 'Synthetic case ended.' })
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.stopCause') WHERE json_extract(data, '$.runtime') = 'inspection-tool'").run()
  settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: TOOL, MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' }
  await finishWatching()
}, 60_000)
afterAll(async () => {
  for (const r of watching) if (r.adapter.alive(r.handle)) r.adapter.stop(r.handle, 'Synthetic no-verdict test ended.')
  await app?.close(); t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('one more whole check after a completed second answer with no verdict', () => {
  it('1 and 2: files a linked ask through the usual office door, rewrites the old reason, and starts a new session through the queue', async () => {
    const { run, old, first, next } = await firstEnd()
    expect(asks(run)).toEqual([old, next])
    expect(check(run).askedAgainFrom).toEqual({ message: old, session: first })
    expect(delivery(old)).toMatchObject({ mark: 'delivered', because: `answered with no verdict; asked again as ${next}` })
    expect(queuedAtEnding.get(next)).toMatchObject({ mark: 'queued', because: `asked again after ${old} answered with no verdict` })
    expect(t.api.getRecord(next)!.data).toMatchObject({ notice: 'aCheckWasQueued', aboutRun: run })
    expect(t.api.getRecord(next)!.data['body']).toContain(old)
    const second = await start(run)
    expect(second.session).not.toBe(first)
    expect(second.messageId).toBe(next)
    expect(second.handle.runtime).toBe('inspection-tool')
    expect(delivery(next)).toMatchObject({ mark: 'delivered', run: second.session })
    const argv = outputOf(second.handle).said
    expect(argv).not.toContain('--resume')
  })

  it('3: stops after the second whole run, remains failed and inspecting, and sends one quiet line naming both sessions', async () => {
    const { run, old, first, next } = await firstEnd()
    const second = await start(run)
    await dead(second)
    await onePass(settings, watching)
    expect(asks(run)).toEqual([old, next])
    expect(check(run).execution).toMatchObject({ session: second.session, ending: 'no-verdict', failed: expect.any(String), endedAt: expect.any(String) })
    expect((await call('GET', `/api/checks/${run}`)).body['stands']['standing']).toBe('inspecting')
    expect(notices(run).filter(n => n['notice'] === 'theCheckFailed')).toHaveLength(1)
    const lines = notices(run).filter(n => n['notice'] === 'aCheckGaveNoVerdictTwice')
    expect(lines).toHaveLength(1)
    const secretary = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(THE_TEST_OFFICES_SECRETARY.handle) as { id: string }
    expect(lines[0]!['to']).toEqual([{ kind: 'agent', id: secretary.id }])
    expect(lines[0]!['saidInFull']).toBe(`Check sessions ${first} and ${second.session} gave no verdict. Run ${run} stays inspecting. Nothing starts again by itself. Its starter or a person can ask for the check again.`)
    const { NOTICES } = await import('../src/server/lib/notices.ts')
    expect(NOTICES['aCheckGaveNoVerdictTwice' as keyof typeof NOTICES]).toMatchObject({ wakes: false })
    const repeated = await call('POST', `/api/checks/${run}/tool-ended`, { session: second.session, reason: 'Synthetic repeated end.', ending: 'no-verdict' }, officeWorker)
    expect(repeated.status, repeated.raw).toBe(200)
    for (let n = 0; n < 3; n++) expect((await onePass(settings, watching)).started).toEqual([])
    expect(asks(run)).toEqual([old, next])
    expect(notices(run).filter(n => n['notice'] === 'aCheckGaveNoVerdictTwice')).toHaveLength(1)
  })

  it('4: the new ask waits under the 5-hour hold and starts after its reset', async () => {
    const { run, next, limitedSession } = await firstEnd(true)
    const held = await onePass(settings, watching)
    expect(held.held.find(r => r.messageId === next)?.because).toContain('5-hour limit')
    expect(check(run).execution).toBeUndefined()
    // The fixture moves the same reset into the past; the hold is still read by its real reader.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.stopCause.at', ?, '$.stopCause.resetsAt', ?) WHERE id = ?")
      .run(new Date(Date.now() - 3 * 3_600_000).toISOString(), clock(Date.now() - 3_600_000), limitedSession)
    settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: TOOL }
    expect((await onePass(settings, watching)).started.some(r => r.messageId === next)).toBe(true)
  })

  it('5: merges-only mode leaves the new ask queued for a project the switch does not name', async () => {
    const { run, next } = await firstEnd()
    settings.mergesOnly = true
    const on = await call('POST', SWITCH, { on: true, projects: ['second'], because: 'Synthetic: only the other project.' })
    expect(on.status, on.raw).toBe(200)
    const pass = await onePass(settings, watching)
    expect(pass.started).toEqual([])
    expect(check(run).execution).toBeUndefined()
    expect(delivery(next).mark).toBe('queued')
    await call('POST', SWITCH, { on: true, projects: ['default'], because: 'Synthetic: allow this project.' })
    expect((await onePass(settings, watching)).started.some(r => r.messageId === next)).toBe(true)
  })

  it.each(['Synthetic clock', 'Synthetic no session', 'Synthetic unfinished'])('6: %s files no new ask', async title => {
    const { run, message } = await sealed(title)
    const processRun = await start(run)
    await dead(processRun)
    await onePass(settings, watching)
    expect(asks(run)).toEqual([message])
    expect(check(run).execution?.failed).toBeTruthy()
    expect(check(run).askedAgainFrom).toBeUndefined()
  })

  it('6: a 5-hour limit files no new ask', async () => {
    settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: LIMIT }
    const { run, message } = await sealed('Synthetic limit')
    const processRun = await start(run)
    await dead(processRun)
    await onePass(settings, watching)
    expect(t.api.getRecord(processRun.session)!.data['stopCause']).toMatchObject({ kind: 'session-limit' })
    expect(asks(run)).toEqual([message])
  })

  it('6: a failed tool startup files no new ask', async () => {
    settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(tree, 'not-present.mjs') }
    const { run, message } = await sealed()
    const processRun = await start(run)
    await dead(processRun)
    await onePass(settings, watching)
    expect(asks(run)).toEqual([message])
    expect(check(run).execution?.failed).toContain('Cannot find module')
    expect(check(run).askedAgainFrom).toBeUndefined()
  })

  it('6: the worker clock stops an unfinished process without asking again', async () => {
    const { run, message } = await sealed('Synthetic interrupted')
    const processRun = await start(run)
    const until = Date.now() + 10_000
    while (!outputOf(processRun.handle).problems.includes('Synthetic check interrupted') && Date.now() < until) await new Promise(r => setTimeout(r, 25))
    // Move the check's clock, keeping the process identity used by alive() intact.
    ;(processRun.adapter as import('../src/worker/runtimes/inspection.ts').InspectionAdapter).target.minutes = 0
    await onePass(settings, watching)
    await dead(processRun)
    await onePass(settings, watching)
    expect(asks(run)).toEqual([message])
    expect(check(run).execution?.failed).toContain('clock')
  })

  it('6: a stopped check process files no new ask', async () => {
    const { run, message } = await sealed('Synthetic interrupted')
    const processRun = await start(run)
    const until = Date.now() + 10_000
    while (!outputOf(processRun.handle).problems.includes('Synthetic check interrupted') && Date.now() < until) await new Promise(r => setTimeout(r, 25))
    processRun.adapter.stop(processRun.handle, 'Synthetic: a person stopped the check.')
    await dead(processRun)
    await onePass(settings, watching)
    expect(asks(run)).toEqual([message])
    expect(check(run).askedAgainFrom).toBeUndefined()
  })

  it('6: a run closed unchecked meanwhile keeps its failed check and starts nothing', async () => {
    const { run, message } = await sealed()
    const processRun = await start(run)
    await dead(processRun)
    t.doors.asTheDoorOf('closedUnchecked', () => t.api.patchRecord(run, { dataPatch: { closedUnchecked: {
      by: { kind: 'person', id: THE_PERSON }, at: '2026-10-16 00:00:00', because: 'Synthetic: the person closed this run unchecked.' },
    } }, { type: 'human', id: THE_PERSON }))
    await onePass(settings, watching)
    expect(asks(run)).toEqual([message])
    expect(check(run).execution?.failed).toBeTruthy()
    expect(notices(run).filter(n => n['notice'] === 'theCheckFailed')).toHaveLength(1)
    expect(delivery(message).because).not.toContain('asked again as')
  })

  it('6: an ask whose run was settled meanwhile files no new ask', async () => {
    const { run, message } = await sealed()
    const processRun = await start(run)
    await dead(processRun)
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-10-16 00:00:00', how: 'an inspector', check: 'synthetic-other-check' } })
    await onePass(settings, watching)
    expect(asks(run)).toEqual([message])
    expect(check(run).execution?.failed).toBeTruthy()
    expect(check(run).askedAgainFrom).toBeUndefined()
    expect(delivery(message).because).not.toContain('asked again as')
  })

  it('6: when the ordinary office door files no check ask, it keeps the failed check and sends today’s failure notice', async () => {
    const { run, message } = await sealed()
    const processRun = await start(run)
    await dead(processRun)
    const changed = await call('PATCH', '/api/workspaces/default', { reviewLevel: 'none' })
    expect(changed.status, changed.raw).toBe(200)
    await onePass(settings, watching)
    expect(asks(run)).toEqual([message])
    expect(check(run).message).toBe(message)
    expect(check(run).execution?.failed).toBeTruthy()
    expect(delivery(message).because).not.toContain('asked again as')
    expect(notices(run).filter(n => n['notice'] === 'theCheckFailed')).toHaveLength(1)
    expect(notices(run).filter(n => n['notice'] === 'noInspectorTellTheSecretary')).toEqual([])
  })

  it('7: a person can explicitly ask again after the automatic chain stops', async () => {
    const { run } = await firstEnd()
    const second = await start(run); await dead(second); await onePass(settings, watching)
    const requested = await call('POST', `/api/checks/${run}/ask-again`)
    expect(requested.status, requested.raw).toBe(200)
    expect(asks(run)).toHaveLength(3)
    expect(check(run).askedAgainFrom).toBeUndefined()
    expect((await start(run)).session).not.toBe(second.session)
  })

  it('8: after the first no-verdict end no notice says somebody has to start the check again', async () => {
    const { run } = await firstEnd()
    const said = notices(run).map(n => JSON.stringify(n)).join('\n')
    expect(said).not.toContain('somebody has to start it again')
    expect(said).not.toContain('Its starter can ask again')
    expect(notices(run).filter(n => n['notice'] === 'theCheckFailed')).toEqual([])
  })
})
