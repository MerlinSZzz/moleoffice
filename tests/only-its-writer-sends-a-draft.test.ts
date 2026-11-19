// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONLY ITS WRITER SENDS A DRAFT, ONCE, AND THE DRAFT STAYS AS IT WAS SENT.
 * A decision, at points 1, 2 and 6, says: a draft is its own kind that becomes a message, a report
 * or a note; it names whom it is for; a sent draft is kept, never deleted, and linked to what it
 * became.
 *
 * Every case goes through the HTTP doors a caller uses: POST /api/records and PATCH /api/records/:id
 * to write the draft, POST /api/drafts/:id/send to send it. The agents are registered through
 * POST /api/agents/started, so the writer stamp is compared with the live caller by `sameAgent`, the
 * way every other guard compares one.
 *
 * THE THREE-RUN PROOF is in the commit that adds this file: a control run, a mutation of one line of
 * the code each case guards, and a run after the line was put back.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let writerRun = ''

const as = (type: 'agent' | 'human', id: string, session?: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asStranger = as('agent', 'draft-stranger')
const asWriter = (): Record<string, string> => as('agent', 'draft-writer', writerRun)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  for (const handle of ['draft-writer', 'draft-stranger', 'draft-reader']) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle, name: `Synthetic ${handle}` } })
    expect(r.statusCode, r.body).toBe(201)
  }
  writerRun = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run of draft-writer',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'draft-writer' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'draft-writer' },
  }).id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The registry id of one agent, by its handle. */
function agentId(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A draft written by draft-writer, through POST /api/records. */
async function aDraft(data: Record<string, unknown>, title = 'Synthetic draft'): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/records', headers: asWriter(), payload: { kind: 'draft', title, data } })
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { record: { id: string } }).record.id
}

const forTheReader = (): Record<string, unknown> => ({
  body: 'Synthetic words for the reader.',
  for: [{ kind: 'agent', id: agentId('draft-reader') }],
  becomes: 'message',
})

function draftData(id: string): Record<string, unknown> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
}

function messageCount(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
}

describe('POST /api/drafts/:id/send', () => {
  it("refuses another agent's send, and writes nothing", async () => {
    const id = await aDraft(forTheReader())
    const before = messageCount()
    const r = await app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asStranger })
    expect(r.statusCode, r.body).toBe(403)
    expect(JSON.parse(r.body).error).toContain('Only a draft\'s writer may send it')
    expect(messageCount()).toBe(before)
    expect(draftData(id)['sentAs']).toBeUndefined()
  })

  it('refuses the person too, because only the writer sends a draft', async () => {
    const id = await aDraft(forTheReader())
    const r = await app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asPerson })
    expect(r.statusCode, r.body).toBe(403)
    expect(draftData(id)['sentAs']).toBeUndefined()
  })

  it('makes a message with its delivery rows, a derived_from link to the draft, and the draft sentAs', async () => {
    const id = await aDraft(forTheReader())
    const r = await app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asWriter() })
    expect(r.statusCode, r.body).toBe(201)
    const became = (JSON.parse(r.body) as { became: { id: string; kind: string; data: Record<string, unknown> } }).became
    expect(became.kind).toBe('message')
    expect(became.data['body']).toBe('Synthetic words for the reader.')
    // THE SAME DELIVERY ROWS AS A MESSAGE SENT THROUGH POST /api/records WITH THE SAME ADDRESSEE, because
    // the send door files it through the same code. The addressee is among them.
    const direct = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asWriter(),
      payload: { kind: 'message', title: 'Synthetic direct message', data: { body: 'Synthetic direct words.', to: forTheReader()['for'] } },
    })
    // NOTHING HOLDS THE READER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
    // message is stored all the same.
    expect(direct.statusCode, direct.body).toBe(409)
    const directId = (JSON.parse(direct.body) as { record: { id: string } }).record.id
    const deliveredTo = (message: string): string[] =>
      (
        t.client.sqlite
          .prepare('SELECT recipient_kind AS kind, recipient_id AS id FROM message_delivery WHERE message_id = ? ORDER BY 1, 2')
          .all(message) as { kind: string; id: string }[]
      ).map((row) => `${row.kind}:${row.id}`)
    expect(deliveredTo(became.id)).toContain(`agent:${agentId('draft-reader')}`)
    expect(deliveredTo(became.id)).toEqual(deliveredTo(directId))
    const links = t.client.sqlite
      .prepare("SELECT from_id AS fromId, to_id AS toId FROM links WHERE type = 'derived_from' AND to_id = ?")
      .all(id) as { fromId: string; toId: string }[]
    expect(links).toEqual([{ fromId: became.id, toId: id }])
    const stored = draftData(id)
    expect(stored['sentAs']).toBe(became.id)
    expect(typeof stored['sentAt']).toBe('string')
  })

  it('refuses a second send, and makes no second message', async () => {
    const id = await aDraft(forTheReader())
    const first = await app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asWriter() })
    expect(first.statusCode, first.body).toBe(201)
    const before = messageCount()
    const second = await app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asWriter() })
    expect(second.statusCode, second.body).toBe(409)
    expect(JSON.parse(second.body).error).toContain('was already sent')
    expect(messageCount()).toBe(before)
  })

  it('refuses a draft that becomes a message and names nobody in for', async () => {
    const id = await aDraft({ body: 'Synthetic words for nobody.', for: [], becomes: 'message' })
    const before = messageCount()
    const r = await app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asWriter() })
    expect(r.statusCode, r.body).toBe(409)
    expect(messageCount()).toBe(before)
    expect(draftData(id)['sentAs']).toBeUndefined()
  })

  it('makes a report whose body is one text block, and a note whose body is the words', async () => {
    const report = await aDraft({ ...forTheReader(), becomes: 'report' }, 'Synthetic report draft')
    const r1 = await app.inject({ method: 'POST', url: `/api/drafts/${report}/send`, headers: asWriter() })
    expect(r1.statusCode, r1.body).toBe(201)
    const rep = (JSON.parse(r1.body) as { became: { kind: string; data: Record<string, unknown> } }).became
    expect(rep.kind).toBe('report')
    expect(rep.data['blocks']).toEqual([{ id: 'b-1', type: 'text', text: 'Synthetic words for the reader.' }])
    expect(rep.data['for']).toBe('agent draft-reader')

    const note = await aDraft({ body: 'Synthetic note words.', for: [], becomes: 'note' }, 'Synthetic note draft')
    const r2 = await app.inject({ method: 'POST', url: `/api/drafts/${note}/send`, headers: asWriter() })
    expect(r2.statusCode, r2.body).toBe(201)
    const made = (JSON.parse(r2.body) as { became: { kind: string; data: Record<string, unknown> } }).became
    expect(made.kind).toBe('note')
    expect(made.data['body']).toBe('Synthetic note words.')
  })
})

describe('a sent draft stays as it was sent', () => {
  it('refuses a change, a delete and a kind change, and still takes its short forms', async () => {
    const id = await aDraft(forTheReader(), 'Synthetic draft kept after it was sent')
    const sent = await app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asWriter() })
    expect(sent.statusCode, sent.body).toBe(201)
    const change = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asWriter(), payload: { dataPatch: { body: 'Changed afterwards.' } } })
    expect(change.statusCode, change.body).toBe(409)
    expect(JSON.parse(change.body).error).toContain('stays exactly as it was sent')
    const retitle = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asPerson, payload: { title: 'Renamed afterwards' } })
    expect(retitle.statusCode, retitle.body).toBe(409)
    const rekind = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asWriter(), payload: { kind: 'note' } })
    expect(rekind.statusCode, rekind.body).toBe(409)
    const del = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asPerson })
    expect(del.statusCode, del.body).toBe(409)
    expect(draftData(id)['body']).toBe('Synthetic words for the reader.')

    const revisions = JSON.parse((await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: asWriter() })).body) as {
      revisions: { seq: number; contentHash: string }[]
    }
    const newest = revisions.revisions.reduce((a, b) => (a.seq > b.seq ? a : b))
    const forms = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/short-forms`,
      headers: asWriter(),
      payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Sent draft' } },
    })
    expect(forms.statusCode, forms.body).toBeLessThan(300)
  })
})

describe('sentAs and sentAt are written by the send door alone', () => {
  it('refuses sentAs written by hand on a change and on a new draft', async () => {
    const id = await aDraft(forTheReader())
    const byPatch = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asWriter(), payload: { dataPatch: { sentAs: 'Xq3vB7yT2kLm', sentAt: '2026-09-25 21:10:00' } } })
    expect(byPatch.statusCode, byPatch.body).toBe(403)
    expect(JSON.parse(byPatch.body).error).toContain('Only the send door writes sentAs and sentAt')
    expect(draftData(id)['sentAs']).toBeUndefined()

    const byPerson = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asPerson, payload: { dataPatch: { sentAt: '2026-09-25 21:10:00' } } })
    expect(byPerson.statusCode, byPerson.body).toBe(403)

    const byCreate = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asWriter(),
      payload: { kind: 'draft', title: 'Synthetic draft filed as sent', data: { ...forTheReader(), sentAs: 'Xq3vB7yT2kLm', sentAt: '2026-09-25 21:10:00' } },
    })
    expect(byCreate.statusCode, byCreate.body).toBe(403)
  })
})

describe('GET /api/drafts', () => {
  it("lists the caller's own drafts, not sent first, each with when its reminder is due; the person sees every one", async () => {
    const unsent = await aDraft(forTheReader(), 'Synthetic draft still unsent')
    const theStrangers = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asStranger,
      payload: { kind: 'draft', title: "Synthetic stranger's draft", data: forTheReader() },
    })
    expect(theStrangers.statusCode, theStrangers.body).toBe(201)
    const strangersId = (JSON.parse(theStrangers.body) as { record: { id: string } }).record.id

    type Row = { id: string; sent: boolean; lastChangedAt: string | null; reminderDueAt: string | null; remindAfterMinutes: number }
    const read = async (headers: Record<string, string>): Promise<{ drafts: Row[]; note: string }> => {
      const r = await app.inject({ method: 'GET', url: '/api/drafts', headers })
      expect(r.statusCode, r.body).toBe(200)
      return JSON.parse(r.body) as { drafts: Row[]; note: string }
    }

    const mine = await read(asWriter())
    const ids = mine.drafts.map((one) => one.id)
    expect(ids).toContain(unsent)
    expect(ids).not.toContain(strangersId)
    expect(mine.note).toContain('no rule limits who may read one')
    const firstSent = mine.drafts.findIndex((one) => one.sent)
    expect(firstSent).toBeGreaterThan(-1)
    expect(mine.drafts.slice(firstSent).every((one) => one.sent)).toBe(true)
    const row = mine.drafts.find((one) => one.id === unsent)!
    expect(row.remindAfterMinutes).toBe(60)
    const { parseAnyStamp } = await import('../src/shared/time.ts')
    expect(parseAnyStamp(row.reminderDueAt!)!.getTime() - parseAnyStamp(row.lastChangedAt!)!.getTime()).toBe(60 * 60_000)
    expect(mine.drafts.filter((one) => one.sent).every((one) => one.reminderDueAt === null)).toBe(true)

    const everyOne = (await read(asPerson)).drafts.map((one) => one.id)
    expect(everyOne).toContain(unsent)
    expect(everyOne).toContain(strangersId)
  })
})
