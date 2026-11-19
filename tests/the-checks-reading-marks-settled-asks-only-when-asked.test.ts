// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Synthetic settled asks in this file's throwaway office; every mark uses the real queue door.
 *
 * The mark case proves the reason, the answer, removal from both readings and no second event. Dropping the mark
 * turns it red. The hand-call case compares whole-queue rows and unchanged deliveries; marking plain reads breaks it.
 * The flag-alone case proves a useful refusal before reading. The held case keeps live-session, asleep, inherited,
 * unreadable and current-check rows queued; collecting settled asks before the hold decision breaks it.
 * The registry case counts one full registry read for twelve asks; removing the shared loader breaks it.
 * The fresh-judgment case changes the stored ask after the yielding reading; using the earlier reason breaks it.
 * The rollback case fails the second write, checks the open transaction and checks that no event was sent; separate
 * transactions for each row break it. The gate case uses a message id as a session header, which plain reads permit
 * and writes refuse; removing the marking form's needs-no-run gate breaks it. The neighbouring worker test proves
 * both query keys and report.held; restoring its old URL breaks that case.
 *
 * HEAD behavior was measured once and kept in a log. It is not a rule this criterion decides.
 */
import { writeFileSync, rmSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let worker: typeof import('../src/server/lib/worker.ts')
let participants: typeof import('../src/server/db/list-participants.ts')
let events: typeof import('../src/server/lib/events.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
let inheritedFile = ''
let next = 0
const agents = new Map<string, string>()
const at = localStamp(new Date())
const owner = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const as = (id: string) => ({ ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const caller = as('mole-office/the-message-worker')
const flagged = '/api/worker/queue?only=checks&markDelivered=1'
interface Named { messageId: string; to: { kind: 'agent'; id: string }; because: string }
interface Answer { queue: { messageId: string; needsNoRun: string; askOfASettledRun?: true; inheritedFromCopy?: true }[]; markedDelivered?: Named[]; error?: string }

function record(id: string, kind: string, data: object, workspace = 'default'): void {
  t.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
    VALUES (?, ?, ?, ?, ?, ?, 'Synthetic settled ask', ?, 'fixture')`).run(id, workspace, THE_PERSON, at, at, kind, JSON.stringify(data))
}

function askOf(handle = 'mark-inspector', options: { notice?: string; inherited?: boolean; current?: boolean; addressedTo?: string } = {}): string {
  const id = `settled-ask-${String(next++)}`
  const run = `run-${id}`
  const recipient = agents.get(options.addressedTo ?? handle)!
  record(id, 'message', { body: 'Synthetic check ask.', sentBy: { kind: 'agent', id: theOfficesOwnId(t) }, to: [{ kind: 'agent', id: recipient }], aboutRun: run, writtenIn: { project: 'default' }, ...(options.notice ? { notice: options.notice } : {}) }, 'message-centre')
  record(run, 'session', { state: 'finished', servingAgent: 'mark-builder', theCheck: { message: id, askedOf: handle, askedAt: at, checkout: {}, says: 'Synthetic check request.' }, ...(options.current ? {} : { closedUnchecked: { by: { kind: 'person', id: THE_PERSON }, at, because: 'Synthetic closure.' } }) })
  t.client.sqlite.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)").run(options.inherited ? 'delivery-inherited' : `delivery-${id}`, id, recipient, at)
  return id
}

function deliveries() {
  return t.client.sqlite.prepare("SELECT * FROM message_delivery WHERE message_id LIKE 'settled-ask-%' ORDER BY id").all() as { message_id: string; mark: string; because: string | null }[]
}

async function read(url: string, headers = caller) {
  const reply = await app.inject({ method: 'GET', url, headers })
  return { status: reply.statusCode, body: reply.json() as Answer, raw: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  inheritedFile = `${t.file}.inherited.json`
  writeFileSync(inheritedFile, JSON.stringify(['delivery-inherited']))
  vi.stubEnv('MOLE_OFFICE_WORLD_INHERITED_DELIVERIES', inheritedFile)
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  participants = await import('../src/server/db/list-participants.ts')
  events = await import('../src/server/lib/events.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  for (const handle of ['mark-inspector', 'mark-builder', 'held-inspector', 'sleep-inspector', 'hidden-inspector']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner, payload: { handle, name: `Synthetic ${handle}`, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
    agents.set(handle, (made.json() as { agent: { id: string } }).agent.id)
  }
}, 60_000)
beforeEach(() => {
  t.client.sqlite.prepare("UPDATE message_delivery SET mark = 'delivered' WHERE mark = 'queued'").run()
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => { await app?.close(); t?.close(); rmSync(inheritedFile, { force: true }); vi.unstubAllEnvs() })

it('marks each settled ask once with its fresh reason, and announces only the committed marks', async () => {
  const ids = [askOf(), askOf(), askOf()]
  const reasons = ids.map(id => inspection.whyAnAskNeedsNoCheck(id, 'mark-inspector', 'default'))
  const announced = vi.spyOn(events, 'announce')
  const reply = await read(flagged)
  expect(reply.status, reply.raw).toBe(200)
  expect(reply.body.queue).toEqual([])
  expect(reply.body.markedDelivered).toEqual(ids.map((messageId, i) => ({ messageId, to: { kind: 'agent', id: agents.get('mark-inspector')! }, because: reasons[i] })))
  for (const [i, id] of ids.entries()) expect(deliveries().find(row => row.message_id === id)).toMatchObject({ mark: 'delivered', because: reasons[i] })
  const changes = announced.mock.calls.filter(([event]) => String(event.name) === 'delivery.changed')
  expect(changes).toHaveLength(ids.length)
  const stored = deliveries()
  announced.mockClear()
  expect((await read(flagged)).body.markedDelivered).toEqual([])
  expect(deliveries()).toEqual(stored)
  expect(announced.mock.calls.filter(([event]) => String(event.name) === 'delivery.changed')).toEqual([])
  expect((await read('/api/worker/queue')).body.queue).toEqual([])
  expect((await read('/api/worker/queue?only=checks')).body.queue).toEqual([])
})

it('a hand call keeps the same whole-queue rows field for field and writes nothing', async () => {
  const ids = [askOf(), askOf()]
  const before = deliveries()
  const whole = await read('/api/worker/queue')
  const announced = vi.spyOn(events, 'announce')
  for (let i = 0; i < 2; i++) {
    const reply = await read('/api/worker/queue?only=checks')
    expect(reply.status, reply.raw).toBe(200)
    expect(reply.body.queue).toEqual(whole.body.queue.filter(row => ids.includes(row.messageId)))
    expect(reply.body.markedDelivered).toBeUndefined()
    expect(deliveries()).toEqual(before)
  }
  expect(announced.mock.calls.filter(([event]) => String(event.name) === 'delivery.changed')).toEqual([])
  // The explicit form must still work, so this case proves the difference between the two calls.
  expect((await read(flagged)).status).toBe(200)
})

it('refuses markDelivered without only=checks before reading or marking any delivery', async () => {
  askOf()
  const before = deliveries()
  const reading = vi.spyOn(worker, 'theQueueWithoutHoldingTheServer')
  const reply = await read('/api/worker/queue?markDelivered=1')
  expect(reply.status).toBe(400)
  expect(reply.body.error).toContain('only=checks')
  expect(reading).not.toHaveBeenCalled()
  expect(deliveries()).toEqual(before)
})

it('keeps live-session, sleep, inherited and unreadable asks queued, and keeps a current check', async () => {
  record('synthetic-live-hold', 'session', { state: 'running', runtime: 'claude-code', doing: 'Synthetic terminal hold.' })
  const hold = await app.inject({ method: 'POST', url: '/api/handles/held-inspector/hold', headers: owner, payload: { session: 'synthetic-live-hold', machine: 'synthetic-machine', runtime: 'claude-code' } })
  expect(hold.statusCode, hold.body).toBe(201)
  t.client.sqlite.prepare("INSERT INTO resident_sleeps (id, agent_id, what, began_at, by_kind, by_id) VALUES ('synthetic-sleep', ?, 'slept', ?, 'person', ?)").run(agents.get('sleep-inspector')!, at, THE_PERSON)
  const held = askOf('held-inspector', { notice: 'aCheckWasQueued' })
  const asleep = askOf('sleep-inspector')
  const inherited = askOf('mark-inspector', { inherited: true })
  const hidden = askOf('hidden-inspector')
  const current = askOf('mark-inspector', { current: true })
  const visible = askOf()
  const reply = await read(flagged, as(agents.get('mark-inspector')!))
  expect(reply.status, reply.raw).toBe(200)
  expect(reply.body.markedDelivered?.map(row => row.messageId)).toEqual([visible])
  expect(reply.body.queue.map(row => row.messageId).sort()).toEqual([inherited, current].sort())
  const all = await read(flagged)
  expect(all.status, all.raw).toBe(200)
  expect(all.body.markedDelivered?.map(row => row.messageId)).toEqual([hidden])
  for (const id of [held, asleep, inherited, current]) expect(deliveries().find(row => row.message_id === id)).toMatchObject({ mark: 'queued', because: null })
  expect(deliveries().find(row => row.message_id === hidden)?.mark).toBe('delivered')
})

it('reads the whole registry once per reading for any number of settled asks', () => {
  for (let i = 0; i < 12; i++) askOf()
  const registry = vi.spyOn(participants, 'listParticipants')
  expect(worker.theQueue('default', { only: 'checks' })).toHaveLength(12)
  expect(registry).toHaveBeenCalledTimes(1)
  registry.mockClear()
  expect(worker.theQueue('default', { only: 'checks' })).toHaveLength(12)
  expect(registry).toHaveBeenCalledTimes(1)
})

it('judges stored records again after the yielding reading and before writing', async () => {
  const id = askOf()
  const original = worker.theQueueWithoutHoldingTheServer
  vi.spyOn(worker, 'theQueueWithoutHoldingTheServer').mockImplementation(async (...args) => {
    const answer = await original(...args)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.theCheck.execution', json('{\"session\":\"synthetic-started\"}')) WHERE id = ?").run(`run-${id}`)
    return answer
  })
  const reply = await read(flagged)
  expect(reply.status, reply.raw).toBe(200)
  expect(reply.body.markedDelivered).toEqual([])
  expect(deliveries().find(row => row.message_id === id)).toMatchObject({ mark: 'queued', because: null })
})

it('rolls back the whole batch and announces nothing when its second write fails', async () => {
  const ids = [askOf(), askOf()]
  const messages = await import('../src/server/lib/messages.ts')
  const original = messages.sayWhereADeliveryStands
  let writes = 0
  vi.spyOn(messages, 'sayWhereADeliveryStands').mockImplementation((...args) => {
    expect(t.client.sqlite.inTransaction).toBe(true)
    if (++writes === 2) throw new Error('Synthetic second write failure.')
    return original(...args)
  })
  const before = events.since(0, 'message-centre')
  const reply = await read(flagged)
  expect(reply.status).toBe(500)
  expect(writes).toBe(2)
  for (const id of ids) expect(deliveries().find(row => row.message_id === id)).toMatchObject({ mark: 'queued', because: null })
  expect(events.since(0, 'message-centre')).toEqual(before)
})

it('applies the needs-no-run write gates only to the marking form', async () => {
  const id = askOf()
  // This header names a message record, which a read permits and the existing write gate refuses.
  const headers = { ...caller, 'x-mole-office-session': id }
  expect((await read('/api/worker/queue?only=checks', headers)).status).toBe(200)
  const refused = await read(flagged, headers)
  expect(refused.status, refused.raw).toBe(400)
  expect(refused.body.error).toContain('not a run')
  expect(deliveries().find(row => row.message_id === id)).toMatchObject({ mark: 'queued', because: null })
  const accepted = await read(flagged)
  expect(accepted.status, accepted.raw).toBe(200)
  expect(accepted.body.markedDelivered?.map(row => row.messageId)).toEqual([id])
})
