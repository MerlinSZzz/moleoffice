// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE'S LEAD AND TARGET ARE CHECKED ON A PATCH AS THEY ARE ON A CREATE.
 *
 * Problem QRdau9OJSPtE. A create checks where a message offers to take somebody (`lead`, criteria M8
 * and M60) and what on a page it is about (`target`). The patch path checked only `quotes`.
 *
 * What was still open on 30 September 2026. A PATCH that changes the lead or the target of a record that
 * is ALREADY a message is refused, because its writer may change only its words (`messageFieldNotAWord`).
 * The hole left is a record that BECOMES a message: a note carrying a `lead` or a `target` in its `extra` naming a
 * record nobody holds, turned into a message by one PATCH, was stored as a message with that lead.
 *
 * WHAT IS PROVED
 *   1. A PATCH adding a lead to a message is refused, and the message keeps no lead.
 *   2. A note whose lead names a record nobody holds cannot become a message; the refusal names the id,
 *      and the note stays a note.
 *   3. The same for a target.
 *   4. A note whose lead names a record that is there becomes a message, with the lead kept.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the patch path stops checking a changed lead    → case 2
 *   the patch path stops checking a changed target  → case 3
 *   the message's writer may change its lead        → case 1 (it is then refused by the lead check, as a 404)
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function inject(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers: AS_THE_PERSON }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await inject('POST', '/api/records', { kind, title, data })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['record'] as { id: string }).id
}

async function read(id: string): Promise<{ kind: string; data: Record<string, unknown> }> {
  const reply = await inject('GET', `/api/records/${id}`)
  expect(reply.status, reply.text).toBe(200)
  return reply.json['record'] as { kind: string; data: Record<string, unknown> }
}

const at = (recordId: string): Record<string, unknown> => ({ target: { kind: 'record', recordId, workspaceId: WS } })
const MISSING = 'NoSuchRecord'

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a patch checks a message lead and target as a create does', () => {
  it('refuses a patch that adds a lead to a message', async () => {
    const message = await file('message', 'A word', { body: 'Look at this.', to: [{ kind: 'person', id: THE_PERSON }] })
    const patched = await inject('PATCH', `/api/records/${message}`, { dataPatch: { lead: at(MISSING) } })
    expect(patched.status, patched.text).toBe(403)
    expect(patched.json['code']).toBe('messageFieldNotAWord')
    expect((await read(message)).data['lead']).toBeUndefined()
  })

  it('refuses to turn a note into a message whose lead names a record nobody holds', async () => {
    const note = await file('note', 'Somewhere to go', { body: 'Take me there.', extra: { lead: at(MISSING) } })
    const patched = await inject('PATCH', `/api/records/${note}`, { kind: 'message' })
    expect(patched.status, patched.text).toBe(404)
    expect(patched.text).toContain(MISSING)
    expect((await read(note)).kind).toBe('note')
  })

  it('refuses to turn a note into a message whose target names a record nobody holds', async () => {
    const note = await file('note', 'About something', { body: 'About this.', extra: { target: at(MISSING) } })
    const patched = await inject('PATCH', `/api/records/${note}`, { kind: 'message' })
    expect(patched.status, patched.text).toBe(404)
    expect(patched.text).toContain(MISSING)
    expect((await read(note)).kind).toBe('note')
  })

  it('turns a note into a message when its lead names a record that is there', async () => {
    const there = await file('problem', 'The kiln ran hot', {})
    const note = await file('note', 'Somewhere to go', { body: 'Take me there.', extra: { lead: at(there) } })
    const patched = await inject('PATCH', `/api/records/${note}`, { kind: 'message' })
    expect(patched.status, patched.text).toBe(200)
    const stored = await read(note)
    expect(stored.kind).toBe('message')
    expect((stored.data['lead'] as { target: { recordId: string } }).target.recordId).toBe(there)
  })
})
