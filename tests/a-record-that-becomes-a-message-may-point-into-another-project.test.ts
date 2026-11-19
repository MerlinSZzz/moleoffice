// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD THAT BECOMES A MESSAGE IS JUDGED BY THE SAME RULE AS A NEW MESSAGE: IT MAY POINT AT A RECORD IN ANOTHER
 * PROJECT ITS WRITER MAY READ. Wave 13q's round 17 (decision 8zw4lqj3ZNm_) gave the create path the writer's reader, so a
 * message may point into another project; the PATCH path's three checks (checkMessageTarget, checkMessageLead and
 * checkMessageQuotes in src/server/lib/records.ts) were called without it, so a note carrying such a target, lead or
 * quote and turned into a message was refused where a new message saying the same is stored. Wave 13n's round 28, 2b.
 *
 * WHAT IS PROVED. A note in this project carrying, in its extra, a target, a lead or a quote naming a note of another
 * project becomes a message with it kept (cases 1 to 3). One naming a record the other project does not hold is still
 * refused, naming the id (case 4). Case 2 passes on both paths before and after: a lead may already name a record in
 * another project (chapter 7, rule 2), so it is kept here as a guard and has no mutation of its own.
 *
 * MUTATIONS, each red after a green control:
 *   the PATCH path's checkMessageTarget called without the reader → cases 1 and 4
 *   the PATCH path's checkMessageQuotes called without the reader → case 3
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const THERE = 'orchard'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let noteThere = ''

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, headers = AS_THE_PERSON) {
  const res = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: res.statusCode, body: res.json() as Record<string, any>, text: res.body }
}

const there = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: THERE } })

/** A note in this project carrying `extra`, turned into a message by one PATCH. */
async function aNoteBecomesAMessage(extra: Record<string, unknown>) {
  const note = await call('POST', '/api/records', { kind: 'note', title: 'Test: about the pruning log', data: { body: 'Test: look at this one.', extra } })
  expect(note.status, note.text).toBe(201)
  const id = note.body['record'].id as string
  const turned = await call('PATCH', `/api/records/${id}`, { kind: 'message' })
  return { id, turned }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await call('POST', '/api/workspaces', { id: THERE, title: 'Orchard' })
  expect(made.status, made.text).toBe(201)
  const note = await call('POST', '/api/records', { kind: 'note', title: 'Test: the pruning log', data: { body: 'Test: cut back the pear trees.' } }, { ...AS_THE_PERSON, 'x-mole-office-workspace': THERE })
  expect(note.status, note.text).toBe(201)
  noteThere = note.body['record'].id as string
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a record that becomes a message pointing at a record in another project', () => {
  it('(1) keeps a target in another project its writer may read', async () => {
    const { turned } = await aNoteBecomesAMessage({ target: there(noteThere) })
    expect(turned.status, turned.text).toBe(200)
    expect(turned.body['record'].kind).toBe('message')
    expect(turned.body['record'].data.target.target.recordId).toBe(noteThere)
  })

  it('(2) keeps a lead in another project its writer may read', async () => {
    const { turned } = await aNoteBecomesAMessage({ lead: there(noteThere) })
    expect(turned.status, turned.text).toBe(200)
    expect(turned.body['record'].data.lead.target.recordId).toBe(noteThere)
  })

  it('(3) keeps a quote of a record in another project its writer may read', async () => {
    const { turned } = await aNoteBecomesAMessage({ quotes: [there(noteThere)] })
    expect(turned.status, turned.text).toBe(200)
    expect(turned.body['record'].data.quotes[0].target.recordId).toBe(noteThere)
  })

  it('(4) is still refused, naming the id, when the other project holds no such record', async () => {
    const { id, turned } = await aNoteBecomesAMessage({ target: there('no-such-note-7') })
    expect(turned.status, turned.text).toBe(404)
    expect(turned.text).toContain('no-such-note-7')
    expect((await call('GET', `/api/records/${id}`)).body['record'].kind).toBe('note')
  })
})
