// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REPLY REMINDER KEYS ON DELIVERY AND CATCHES UP IN A BOUNDED WINDOW AFTER A RESTART.
 *
 * The source of the reply rules remains wave 13y round 11. Wave 13u round 30 adds hook deliveries,
 * and one reminder for an unanswered delivery just before a restart.
 * The letters and sessions here are made up in a throwaway office. Every message, delivery, reply
 * and seen mark uses the real doors. Only Date moves; nobody waits for the reminder minutes.
 * The restart cases capture the real startTheReminders interval and call its real callback, and wait for the
 * pass it starts, which may give the thread back between its steps (wave 13y round 166).
 * No server process or browser is started by this helper.
 *
 * Each of these mutations turns its case red: restore the sentence filter; remove catch-up; narrow
 * already-said to startup; make catch-up unbounded; remove the run filter; stop retaining delivery
 * time on seen. The seen-only case records a known gap, not a rule.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { deliveryReading, deliveryWord } from '../src/shared/messages.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const HOOK_SENTENCE = 'This message was handed over when the agent asked for its messages.'
const PERSON = {
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
}
const worlds = mkdtempSync(join(tmpdir(), 'reply-catch-up-'))
let t: TestDb
let app: FastifyInstance
let reminders: typeof import('../src/server/lib/reminders.ts')
let clock = new Date('2030-01-01T12:00:00Z').getTime()
let started: Date
let handle: string
let agent: string
let session: string
let serial = 0

function at(ms: number): void { vi.setSystemTime(ms) }
function asAgent(): Record<string, string> {
  return { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': session }
}
async function ask(method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = PERSON) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  expect(reply.statusCode, reply.body).toBe(method === 'POST' && url === '/api/records' ? 201 : url.endsWith('/hold') ? 201 : 200)
  return reply.json() as Record<string, any>
}
async function letter(): Promise<string> {
  return (await ask('POST', '/api/records', {
    kind: 'message', title: 'Made-up question', data: { to: [{ kind: 'agent', id: agent }], body: 'A made-up question awaiting a reply.' },
  }))['record'].id as string
}
async function answer(): Promise<void> {
  await ask('POST', '/api/records', {
    kind: 'message', title: 'Made-up answer', data: { to: [{ kind: 'person', id: THE_PERSON }], body: 'The made-up answer.' },
  }, asAgent())
}
async function take(id: string): Promise<void> {
  await ask('POST', `/api/handles/${handle}/took`, { session, message: id })
}
async function hook(id: string): Promise<void> {
  const read = await ask('GET', '/api/messages?only=waiting-for-me&markDelivered=1&limit=25', undefined, asAgent())
  expect(read['markedDelivered']).toContain(id)
  expect(read['messages'].find((one: { id: string }) => one.id === id)?.deliveries.find((one: { to: { id: string } }) => one.to.id === agent)?.mark).toBe('delivered')
  const delivered = await row(id)
  expect.soft(delivered.because).toBe(HOOK_SENTENCE)
  expect.soft(deliveryReading(delivered).sentence).toBe(HOOK_SENTENCE)
}
async function seen(id: string): Promise<void> {
  await ask('POST', `/api/messages/${id}/mark`, { mark: 'seen' }, asAgent())
}
async function row(id: string): Promise<{ mark: string; at: string; because: string | null; run: string | null }> {
  const read = await ask('GET', `/api/messages/${id}`)
  return read['message'].deliveries.find((one: { to: { id: string } }) => one.to.id === agent)
}
function count(label: string): number {
  const n = (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.notice') = 'aPersonWaitsForAReply' AND json_extract(data, '$.to[0].id') = ?").get(agent) as { n: number }).n
  console.info(`reply-reminder measurement: ${handle} ${label}: ${String(n)} line(s)`)
  return n
}
function tick(ms: number): string[] {
  at(ms)
  const pass = reminders.sendTheRemindersThatAreDue('default', new Date(ms), started, worlds)
  expect(pass.replyReminderProblem).toBeNull()
  return pass.repliesReminded
}
/** Capture the actual watcher's callback without creating timers or changing its startup work. */
function restart(ms: number): () => Promise<void> {
  at(ms)
  let callback: (() => void) | undefined
  const timer = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
    callback ??= fn
    return { unref() {} } as NodeJS.Timeout
  }) as typeof setInterval)
  const logs: string[] = []
  try { reminders.startTheReminders('default', (line) => logs.push(line)) } finally { timer.mockRestore() }
  expect(callback).toBeTypeOf('function')
  return async () => {
    await (callback as () => unknown)()
    expect(logs.filter((line) => line.includes('could not finish a tick') || line.includes('reply reminder could not run'))).toEqual([])
  }
}
async function stopAt(ms: number): Promise<void> {
  at(ms)
  await ask('GET', '/api/health')
  expect((t.client.sqlite.prepare('SELECT max(at_ms) AS at FROM api_calls').get() as { at: number }).at).toBe(ms)
}

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_REPLY_REMINDER_MINUTES', '3')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  reminders = await import('../src/server/lib/reminders.ts')
  vi.useFakeTimers({ toFake: ['Date'] })
}, 60_000)
beforeEach(async () => {
  clock += 2 * DAY
  at(clock)
  started = new Date(clock - 1000)
  handle = `catch-up-${String(++serial)}`
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' }, actor: t.api.HUMAN })
  agent = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  session = (await ask('POST', '/api/records', { kind: 'session', title: 'Made-up live session', data: { state: 'running', runtime: 'claude-code' } }))['record'].id as string
  await ask('POST', `/api/handles/${handle}/hold`, { session, machine: 'made-up-machine', runtime: 'claude-code' })
})
afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  rmSync(worlds, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('a hook delivery in a live session', () => {
  it('unanswered: zero before the minutes, one at the minutes, one on every later tick', async () => {
    const id = await letter()
    await hook(id)
    tick(clock + 3 * MINUTE - 1000)
    expect(count('before due')).toBe(0)
    tick(clock + 3 * MINUTE)
    expect.soft(count('due')).toBe(1)
    for (const minutes of [4, 10, 60]) { tick(clock + minutes * MINUTE); expect.soft(count(`minute ${String(minutes)}`)).toBe(1) }
  })
  it('answered: zero lines', async () => {
    const id = await letter()
    await hook(id)
    at(clock + MINUTE)
    await answer()
    tick(clock + 10 * MINUTE)
    expect(count('answered')).toBe(0)
  })
  it('answered then seen: zero lines, with delivery time kept before the answer', async () => {
    const id = await letter()
    await hook(id)
    at(clock + MINUTE)
    await answer()
    at(clock + 2 * MINUTE)
    await seen(id)
    const read = await row(id)
    expect.soft(read.at).toBe(localStamp(new Date(clock)))
    expect.soft(read.because).toBe(HOOK_SENTENCE)
    expect.soft(deliveryReading(read).sentence).toBe(`${deliveryWord('seen').sentence} ${HOOK_SENTENCE}`)
    tick(clock + 10 * MINUTE)
    expect(count('answered then seen')).toBe(0)
  })
  it('seen without an answer: one line measured from delivery, never from the seen mark', async () => {
    const id = await letter()
    await hook(id)
    at(clock + 2 * MINUTE)
    await seen(id)
    expect.soft((await row(id)).at).toBe(localStamp(new Date(clock)))
    tick(clock + 3 * MINUTE - 1000)
    expect(count('seen before due')).toBe(0)
    tick(clock + 3 * MINUTE)
    expect.soft(count('seen due from delivery')).toBe(1)
    tick(clock + 10 * MINUTE)
    expect(count('seen later')).toBe(1)
  })
})

describe('a bounded catch-up after a restart', () => {
  it('the catch-up line names the minimum minutes, without claiming an hour-old delivery was three minutes ago', async () => {
    const id = await letter()
    await take(id)
    await stopAt(clock + 2 * MINUTE)
    const runTick = restart(clock + 62 * MINUTE)
    at(clock + 63 * MINUTE)
    await runTick()
    expect(count('catch-up words')).toBe(1)
    const said = t.client.sqlite.prepare("SELECT json_extract(data, '$.saidInFull') AS words FROM records WHERE json_extract(data, '$.notice') = 'aPersonWaitsForAReply' AND json_extract(data, '$.aboutMessage') = ?").get(id) as { words: string }
    expect(said.words).toContain('At least 3 minutes have passed, and you have written nothing to them in that conversation.')
    expect(said.words).not.toContain('In the 3 minutes since,')
  })
  it('two minutes before stop, down for an hour: one line after start, still one on later ticks', async () => {
    const id = await letter()
    await take(id)
    const stop = clock + 2 * MINUTE
    await stopAt(stop)
    const start = stop + 60 * MINUTE
    const runTick = restart(start)
    for (const minutes of [1, 2, 10]) {
      at(start + minutes * MINUTE)
      await runTick()
      expect.soft(count(`restart minute ${String(minutes)}`)).toBe(1)
    }
    // A second restart also reads the office's earlier notice.
    await stopAt(start + 11 * MINUTE)
    const again = restart(start + 71 * MINUTE)
    at(start + 72 * MINUTE)
    await again()
    expect(count('second restart')).toBe(1)
  })
  it('already reminded before stop: no second line after start', async () => {
    const id = await letter()
    await take(id)
    tick(clock + 3 * MINUTE)
    expect(count('before stop')).toBe(1)
    const stop = clock + 4 * MINUTE
    await stopAt(stop)
    const runTick = restart(stop + 60 * MINUTE)
    for (const minutes of [61, 70]) { at(stop + minutes * MINUTE); await runTick(); expect.soft(count('already reminded after restart')).toBe(1) }
  })
  it('answered before stop: zero lines after start', async () => {
    const id = await letter()
    await take(id)
    at(clock + MINUTE)
    await answer()
    const stop = clock + 2 * MINUTE
    await stopAt(stop)
    const runTick = restart(stop + 60 * MINUTE)
    at(stop + 61 * MINUTE)
    await runTick()
    expect(count('answered before restart')).toBe(0)
  })
  it('a delivery the day before stop stays outside the window, using the last call rather than last delivery', async () => {
    const id = await letter()
    await take(id)
    const stop = clock + DAY
    await stopAt(stop)
    const runTick = restart(stop + 60 * MINUTE)
    at(stop + 61 * MINUTE)
    await runTick()
    expect(count('day before stop')).toBe(0)
  })
  it('a recent delivery is used when the call log has no row before start', async () => {
    const id = await letter()
    await take(id)
    t.client.sqlite.prepare('DELETE FROM api_calls').run() // Made-up office: the retained log is empty.
    const runTick = restart(clock + 62 * MINUTE)
    at(clock + 63 * MINUTE)
    await runTick()
    expect(count('delivery fallback')).toBe(1)
  })
  it('a short restart keeps a not-yet-due delivery eligible on later ticks', async () => {
    const id = await letter()
    await take(id)
    await stopAt(clock + 10_000)
    const runTick = restart(clock + 20_000)
    at(clock + MINUTE)
    await runTick()
    expect(count('short restart before due')).toBe(0)
    at(clock + 3 * MINUTE)
    await runTick()
    expect(count('short restart due')).toBe(1)
  })
})

describe('deliveries by office-started runs stay out', () => {
  async function officeRun(): Promise<void> {
    session = (await ask('POST', '/api/records', { kind: 'session', title: 'Made-up office-started run',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: handle } }))['record'].id as string
  }
  it('a run take writes its run on the delivery and gets zero reply reminders', async () => {
    const id = await letter()
    await officeRun()
    await ask('POST', `/api/worker/messages/${id}/taken`, {
      to: { kind: 'agent', id: agent }, session, runtime: 'claude-code', because: 'The made-up office-started run took this message.',
    }, asAgent())
    expect((await row(id)).run).toBe(session)
    tick(clock + 10 * MINUTE)
    expect(count('office run take')).toBe(0)
  })
  it('a hook read inside an office-started run records the run and gets zero reply reminders', async () => {
    const id = await letter()
    await officeRun()
    await hook(id)
    expect.soft((await row(id)).run).toBe(session)
    tick(clock + 10 * MINUTE)
    expect(count('office run hook')).toBe(0)
  })
})

it('known gap: a person sees no reminder when the agent only marks seen, without any delivery or reply', async () => {
  const id = await letter()
  await seen(id)
  expect((await row(id)).mark).toBe('seen')
  tick(clock + 10 * MINUTE)
  expect(count('known seen-only gap')).toBe(0)
})
