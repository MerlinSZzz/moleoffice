// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { rmSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { measureGitReads } from './measure-git-reads.ts'
import { largePackedCommitFixture } from './large-packed-commit-fixture.ts'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const COUNT = 256
let t: TestDb
let app: FastifyInstance
let fixture: ReturnType<typeof largePackedCommitFixture>
let agent = ''

beforeAll(async () => {
  fixture = largePackedCommitFixture()
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: OWNER,
    payload: { handle: 'synthetic-checker', name: 'Synthetic Checker', workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  agent = made.json().agent.id as string
  // Historical fixtures name stored check requests directly, without starting any process or tool.
  const record = t.client.sqlite.prepare("INSERT INTO records (id, workspace_id, kind, title, data, origin, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'fixture', ?, '2026-10-14 10:00:00', '2026-10-14 10:00:00')")
  const delivery = t.client.sqlite.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', '2026-10-14 10:00:00')")
  t.client.sqlite.transaction(() => {
    for (let i = 0; i < COUNT; i++) {
      const message = `synthetic-check-message-${i}`
      const run = `synthetic-check-run-${i}`
      record.run(run, 'default', 'session', run, JSON.stringify({ state: 'finished', workingDirectory: fixture.directory,
        cutFrom: 'main', theCheck: { message, askedOf: 'synthetic-checker' } }), THE_PERSON)
      record.run(message, 'message-centre', 'message', message, JSON.stringify({ aboutRun: run,
        writtenIn: { project: 'default' }, body: 'Made-up check request.', sentBy: { kind: 'person', id: THE_PERSON } }), THE_PERSON)
      delivery.run(`synthetic-delivery-${i}`, message, agent)
    }
  })()
}, 60_000)

afterAll(async () => { await app?.close(); t?.close(); if (fixture) rmSync(fixture.directory, { recursive: true, force: true }) })



it('the POST press carries only its one ordinary message among 255 pending checks', async () => {
  const sql = t.client.sqlite
  sql.prepare("UPDATE records SET data = json_remove(data, '$.aboutRun') WHERE id = 'synthetic-check-message-0'").run()
  try {
    const measured = await measureGitReads(() => app.inject({ method: 'POST', url: `/api/agents/${agent}/start-a-new-agent`, headers: OWNER, payload: {} }))
    expect(measured.result.statusCode, measured.result.body).toBe(200)
    expect(measured.result.json().moved).toHaveLength(1)
    expect(measured.bytes).toBe(0)
    const left = sql.prepare("SELECT count(*) AS n FROM message_delivery WHERE recipient_id = ? AND mark = 'queued'").get(agent) as { n: number }
    // The registration card stays queued too.
    expect(left.n).toBe(COUNT)
  } finally {
    sql.prepare("UPDATE records SET data = json_set(data, '$.aboutRun', 'synthetic-check-run-0') WHERE id = 'synthetic-check-message-0'").run()
    sql.prepare("UPDATE message_delivery SET mark = 'queued' WHERE id = 'synthetic-delivery-0'").run()
  }
})


it('agrees with the full carry list for stored message, check, sleep and project facts', async () => {
  const worker = await import('../src/server/lib/worker.ts')
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  const sqlite = t.client.sqlite
  sqlite.prepare("UPDATE message_delivery SET mark = 'delivered'").run()
  sqlite.prepare("UPDATE message_delivery SET mark = 'queued' WHERE id = 'synthetic-delivery-0'").run()
  const message = 'synthetic-check-message-0'
  const run = 'synthetic-check-run-0'
  const person = { kind: 'person', id: THE_PERSON }
  const base = { sentBy: person, body: 'Synthetic parity message.', writtenIn: { project: 'default' } }
  const cases: { name: string; data?: Record<string, unknown>; check?: Record<string, unknown>; asleep?: boolean; deleted?: boolean; expected: boolean }[] = [
    { name: 'ordinary', expected: true },
    { name: 'office line', data: { sentBy: { kind: 'agent', id: theOfficesOwnId(t) } }, expected: false },
    { name: 'run already requested', data: { runWasAskedFor: { at: '2026-10-14 10:00:00', by: THE_PERSON } }, expected: false },
    { name: 'incomplete request', data: { runWasAskedFor: { at: '2026-10-14 10:00:00' } }, expected: true },
    { name: 'pending check', data: { aboutRun: run }, check: { message, askedOf: 'synthetic-checker' }, expected: false },
    { name: 'check asked of another agent', data: { aboutRun: run }, check: { message, askedOf: 'somebody-else' }, expected: true },
    { name: 'check execution already recorded', data: { aboutRun: run }, check: { message, askedOf: 'synthetic-checker', execution: {} }, expected: true },
    { name: 'check names another message', data: { aboutRun: run }, check: { message: 'another-message', askedOf: 'synthetic-checker' }, expected: true },
    { name: 'asleep', asleep: true, expected: false },
    { name: 'urgent while asleep', asleep: true, data: { urgent: true }, expected: true },
    { name: 'deleted', deleted: true, expected: false },
    { name: 'no project mark', data: { writtenIn: null }, expected: false },
    { name: 'other project viewed from default', data: { writtenIn: { project: 'other-synthetic' } }, expected: true },
  ]
  for (const scenario of cases) {
    sqlite.prepare('DELETE FROM resident_sleeps WHERE agent_id = ?').run(agent)
    if (scenario.asleep) sqlite.prepare("INSERT INTO resident_sleeps (id, agent_id, what, began_at, by_kind, by_id) VALUES ('synthetic-sleep', ?, 'slept', '2026-10-14 10:00:00', 'person', ?)").run(agent, THE_PERSON)
    sqlite.prepare('UPDATE records SET data = ?, deleted_at = ? WHERE id = ?')
      .run(JSON.stringify({ ...base, ...scenario.data }), scenario.deleted ? '2026-10-14 11:00:00' : null, message)
    sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(JSON.stringify({ state: 'finished', theCheck: scenario.check }), run)
    const projects = new Set(everythingWaitingFor(agent).map((one) => one.writtenIn?.project).filter((one): one is string => one !== undefined))
    const full = [...projects].some((project) => worker.theQueue(project).some((one) => one.to.id === agent && one.nobodyIsAnsweringAsIt !== null))
    expect(worker.whatThePressWouldCarry(agent).length > 0, scenario.name).toBe(full)
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${agent}/start-a-new-agent`, headers: OWNER })
    expect(full, scenario.name).toBe(scenario.expected)
    expect(reply.json().wouldCarry, scenario.name).toBe(full)
  }
})

it('keeps the full queue order and project choice when urgent messages appear in several project views', async () => {
  const worker = await import('../src/server/lib/worker.ts')
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  const sql = t.client.sqlite
  sql.prepare("UPDATE message_delivery SET mark = 'delivered'").run()
  const cases = [
    { writtenIn: { project: 'default' }, aboutProject: 'other-synthetic', sentBy: { kind: 'person', id: THE_PERSON } },
    { writtenIn: { project: 'other-synthetic' }, aboutProject: 'default', urgent: true, sentBy: { kind: 'person', id: THE_PERSON } },
    { writtenIn: { project: 'third-synthetic' }, aboutProject: 'other-synthetic', sentBy: { kind: 'agent', id: agent } },
  ]
  for (const [i, data] of cases.entries()) {
    sql.prepare('UPDATE records SET data = ?, deleted_at = NULL WHERE id = ?')
      .run(JSON.stringify({ ...data, body: 'Synthetic order message.' }), `synthetic-check-message-${i}`)
    sql.prepare("UPDATE message_delivery SET mark = 'queued' WHERE id = ?").run(`synthetic-delivery-${i}`)
  }
  const projects = new Set(everythingWaitingFor(agent).map((one) => one.writtenIn?.project).filter((one): one is string => one !== undefined))
  const met = new Set<string>()
  const full = [...projects].flatMap((project) => worker.theQueue(project).filter((one) => {
    if (one.to.id !== agent || one.nobodyIsAnsweringAsIt === null || met.has(one.messageId)) return false
    met.add(one.messageId)
    return true
  }))
  const facts = (rows: readonly { messageId: string; workspaceId: string; sentAt: string }[]) =>
    rows.map(({ messageId, workspaceId, sentAt }) => ({ messageId, workspaceId, sentAt }))
  expect(full).toHaveLength(3)
  expect(facts(worker.whatThePressWouldCarry(agent))).toEqual(facts(full))
})
