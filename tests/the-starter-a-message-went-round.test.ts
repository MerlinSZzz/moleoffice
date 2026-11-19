// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let db: TestDb
let app: FastifyInstance
let first: string
let second: string
let writer: string
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const register = async (handle: string, headers: Record<string, string>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role: 'worker' } })
    expect(r.statusCode, r.body).toBe(201)
    return (r.json() as { agent: { id: string } }).agent.id
  }
  first = await register('history-first', person)
  second = await register('history-second', person)
  writer = await register('history-writer', { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': first })
})
afterAll(async () => { await app.close(); db.close() })

it('reads the starter in force at the message time, including before and during waits', async () => {
  const sql = db.client.sqlite
  const message = async (at: string, also?: string, expected = 201) => {
    const to = [{ kind: 'person', id: THE_PERSON }, ...(also ? [{ kind: 'agent', id: also }] : [])]
    const r = await app.inject({ method: 'POST', url: '/api/records', headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer }, payload: { kind: 'message', title: 'History', data: { body: 'History', to } } })
    expect(r.statusCode, r.body).toBe(expected)
    const id = (r.json() as { record: { id: string } }).record.id
    sql.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(at, id)
    return id
  }
  const old = await message('2020-01-01 00:00:00')
  const waiting = await message('2020-01-02 12:00:00')
  const after = await message('2020-01-04 00:00:00')
  const boundary = await message('2020-01-03 00:00:00')
  // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
  // message is stored all the same, with both its addressees.
  const told = await message('2020-01-02 12:00:00', first, 409)
  const insert = sql.prepare('INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, applied_at, refused_because, runs_not_ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  insert.run('history-applied', writer, 'agent', first, 'agent', second, 'person', THE_PERSON, 'test', '2020-01-02 00:00:00', 'waiting', null, null, '[]')
  const pendingRead = await app.inject({ method: 'GET', url: '/api/messages?full=1', headers: person })
  expect(pendingRead.statusCode, pendingRead.body).toBe(200)
  const pendingRows = (pendingRead.json() as { messages: { id: string; wentRoundItsStarter: unknown }[] }).messages
  expect(pendingRows.find((row) => row.id === waiting)?.wentRoundItsStarter).toEqual({ kind: 'agent', id: first })
  sql.prepare("UPDATE agent_starter_changes SET state = 'applied', applied_at = ? WHERE id = ?").run('2020-01-03 00:00:00', 'history-applied')
  insert.run('history-withdrawn', writer, 'agent', second, 'agent', first, 'person', THE_PERSON, 'test', '2020-01-04 12:00:00', 'withdrawn', null, null, '[]')
  insert.run('history-refused', writer, 'agent', second, 'agent', first, 'person', THE_PERSON, 'test', '2020-01-05 00:00:00', 'refused', null, 'refused', '[]')
  sql.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run('agent', second, writer)
  const r = await app.inject({ method: 'GET', url: '/api/messages?full=1', headers: person })
  expect(r.statusCode, r.body).toBe(200)
  const rows = (r.json() as { messages: { id: string; wentRoundItsStarter: unknown }[] }).messages
  const mark = (id: string) => rows.find((row) => row.id === id)?.wentRoundItsStarter
  expect(mark(old)).toEqual({ kind: 'agent', id: first })
  expect(mark(waiting)).toEqual({ kind: 'agent', id: first })
  expect(mark(after)).toEqual({ kind: 'agent', id: second })
  expect(mark(boundary)).toBeNull()
  expect(mark(told)).toBeNull()
})
