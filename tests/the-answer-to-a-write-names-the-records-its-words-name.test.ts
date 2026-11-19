// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ANSWER TO A WRITE NAMES THE RECORDS ITS WORDS NAME, each with its kind and title, so a wrong id in a message or a
 * report shows at once. Nothing is refused for what the list shows (src/server/lib/message-keys.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · an agent's message lists, in the order they are first named, a note named inside a path and named again later
 *     (once, where it is first named), a deleted note marked deleted, a note in another project and an agent's record
 *     named in the title. It does not list a 12-letter word that names nothing, an agent's registry id, or a message the
 *     writer may not read; the owner, who reads every message, is shown that message. The owner's message to a retired
 *     agent, which is stored and answered 409, has the list too.
 *     MUTATIONS: in theRecordsTheseWordsName, split each part only at white space; leave out the reader's check; leave
 *     out `deleted`. In the POST answer (src/server/api/records.ts), do not put the list on it.
 *   · a message whose words name no record has an empty list, and an edit in its two minutes lists what the words name
 *     after the edit.
 *     MUTATION: in the PATCH answer, do not put the list on it.
 *   · a report lists the ids in its title, its summary and at any depth in its blocks, by path, and none outside its
 *     blocks; a PATCH of the report lists what it names after the write.
 *     MUTATION: in theWordsOfAReport (src/shared/message-keys.ts), read only the strings directly in a block.
 *   · a note's answer, the 200 answer to a message already sent and the answer to a check have no list.
 *   · when the read of the named records fails after the write is stored, the list is null with the reason, and the
 *     message is stored.
 *     MUTATION: in theRecordsAWriteNames, do not catch the failure.
 *   · the ids of one write are read in pieces of at most IDS_AT_ONCE ids. No record is filed for it: the words are made
 *     up, and they name one record at the end.
 *     MUTATION: read every id in one statement.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { ARecordNamed } from '../src/server/lib/message-keys.ts'
import { apiApp, freshDb, one, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'writer' }

/** A word of 12 letters that names no record. */
const A_WORD_OF_AN_IDS_LENGTH = 'Measurements'

interface Answer {
  status: number
  reply: { record?: { id: string; title: string; kind: string }; recordsNamed?: ARecordNamed[] | null; recordsNamedNotRead?: string } & Record<string, unknown>
}

async function inject(method: 'POST' | 'PATCH' | 'DELETE' | 'GET', url: string, headers: Record<string, string>, payload?: unknown): Promise<Answer> {
  const sent = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: sent.statusCode, reply: sent.json() as Answer['reply'] }
}

/** A record filed here, as the office stored it. */
async function file(headers: Record<string, string>, payload: Record<string, unknown>): Promise<{ id: string; kind: string; title: string }> {
  const { status, reply } = await inject('POST', '/api/records', headers, payload)
  expect(status, JSON.stringify(reply)).toBe(theAnswerToAWriteInATestOffice(headers, payload))
  const record = reply.record!
  return { id: record.id, kind: record.kind, title: record.title }
}

/** One entry as the answer lists it. */
const named = (record: { id: string; kind: string; title: string }, where: string, deleted = false): ARecordNamed => ({
  id: record.id,
  kind: record.kind,
  title: record.title,
  where,
  ...(deleted ? { deleted: true as const } : {}),
})

let readerId = ''
let readersRecord = { id: '', kind: '', title: '' }
let note = { id: '', kind: '', title: '' }
let deleted = { id: '', kind: '', title: '' }
let elsewhere = { id: '', kind: '', title: '' }
let hidden = { id: '', kind: '', title: '' }

/**
 * WHAT THE WRITER'S MESSAGE TO THE READER ANSWERS. Nothing holds the reader in this test office, so the office stores the
 * message, routes it and answers 409. The message is stored all the same, and the answer carries the list as before.
 */
const THE_WRITERS_SEND_TO_THE_READER = 409

/** A message from the agent that writes, to the agent that reads. */
const aMessage =(body: string, title = body.slice(0, 40), more: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'message',
  title,
  data: { body, to: [{ kind: 'agent', id: readerId }], ...more },
})

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['reader', 'writer']) {
    const made = await file(AS_THE_OWNER, { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
    if (handle === 'reader') readersRecord = made
  }
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })).json() as { agents?: { id: string; handle: string }[] }
  readerId = one((listed.agents ?? []).filter((a) => a.handle === 'reader'), 'the registry row for reader').id
  note = await file(AS_THE_OWNER, { kind: 'note', title: 'A note the words name' })
  deleted = await file(AS_THE_OWNER, { kind: 'note', title: 'A note deleted before it is named' })
  expect((await inject('DELETE', `/api/records/${deleted.id}`, AS_THE_OWNER)).status).toBe(200)
  expect((await inject('POST', '/api/workspaces', AS_THE_OWNER, { id: 'elsewhere', title: 'Another project' })).status).toBe(201)
  elsewhere = await file({ ...AS_THE_OWNER, 'x-mole-office-workspace': 'elsewhere' }, { kind: 'note', title: 'A note in another project' })
  // A MESSAGE BETWEEN THE OWNER AND THE READER, which the writer is no party to.
  hidden = await file(AS_THE_OWNER, aMessage('A message between two others.'))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the answer to a message', () => {
  const words = (): string =>
    `See /api/records/${note.id}/revisions, then ${deleted.id} and ${elsewhere.id}. ` +
    `${A_WORD_OF_AN_IDS_LENGTH}, ${readerId}, (${hidden.id}). Again: ${note.id}.`

  it("lists each record its words name once, where it is first named, and none the writer may not read", async () => {
    const { status, reply } = await inject('POST', '/api/records', AS_AN_AGENT, aMessage(words(), `For ${readersRecord.id}`))
    expect(status, JSON.stringify(reply)).toBe(THE_WRITERS_SEND_TO_THE_READER)
    expect(reply.recordsNamed).toEqual([named(note, 'body'), named(deleted, 'body', true), named(elsewhere, 'body'), named(readersRecord, 'title')])
  })

  it('lists the message the owner may read, from the same words', async () => {
    const sent = aMessage(words())
    const { status, reply } = await inject('POST', '/api/records', AS_THE_OWNER, sent)
    expect(status, JSON.stringify(reply)).toBe(theAnswerToAWriteInATestOffice(AS_THE_OWNER, sent))
    expect(reply.recordsNamed).toEqual([named(note, 'body'), named(deleted, 'body', true), named(elsewhere, 'body'), named(hidden, 'body')])
  })

  it('has an empty list when its words name no record, and an edit lists what the words name after it', async () => {
    const sent = await inject('POST', '/api/records', AS_AN_AGENT, aMessage(`Nothing is named here but ${A_WORD_OF_AN_IDS_LENGTH}.`))
    expect(sent.status, JSON.stringify(sent.reply)).toBe(THE_WRITERS_SEND_TO_THE_READER)
    expect(sent.reply.recordsNamed).toEqual([])
    const edited = await inject('PATCH', `/api/records/${sent.reply.record!.id}`, AS_AN_AGENT, { dataPatch: { body: `Now it is about #/record/${note.id}.` } })
    expect(edited.status, JSON.stringify(edited.reply)).toBe(200)
    expect(edited.reply.recordsNamed).toEqual([named(note, 'body')])
  })

  it("is on the 409 answer to the owner's message to a retired agent, which is stored all the same", async () => {
    const started = await inject('POST', '/api/agents/started', AS_THE_OWNER, { handle: 'retiree', name: 'retiree', runtime: 'claude-code', role: 'worker' })
    expect(started.status, JSON.stringify(started.reply)).toBe(201)
    const retireeId = (started.reply['agent'] as { id: string }).id
    expect((await inject('POST', `/api/participants/agent/${retireeId}/retire`, AS_THE_OWNER, { because: 'the work is done' })).status).toBe(200)
    const sent = await inject('POST', '/api/records', AS_THE_OWNER, {
      kind: 'message',
      title: 'To an agent that is retired',
      data: { body: `About ${note.id}.`, to: [{ kind: 'agent', id: retireeId }] },
    })
    expect(sent.status, JSON.stringify(sent.reply)).toBe(409)
    expect(sent.reply.record?.kind).toBe('message')
    expect(sent.reply.recordsNamed).toEqual([named(note, 'body')])
  })
})

describe('the answer to a report', () => {
  it('lists the ids in its title, its summary and its blocks at any depth, by path, and none outside its blocks', async () => {
    const payload = {
      kind: 'report',
      title: `A report on ${note.id}`,
      summary: `It reads ${readersRecord.id} too.`,
      data: {
        for: `Read ${elsewhere.id}`,
        date: '2026-11-07',
        blocks: [
          { id: 'b-1', type: 'text', text: `See #/record/${readersRecord.id} first.` },
          { id: 'b-2', type: 'table', columns: [{ label: 'Record' }], rows: [{ cells: ['first'] }, { cells: [`${deleted.id}'s`] }] },
        ],
      },
    }
    const filed = await inject('POST', '/api/records', AS_THE_OWNER, payload)
    expect(filed.status, JSON.stringify(filed.reply)).toBe(201)
    expect(filed.reply.recordsNamed).toEqual([named(note, 'title'), named(readersRecord, 'summary'), named(deleted, 'data.blocks[1].rows[1].cells[0]', true)])
    const changed = await inject('PATCH', `/api/records/${filed.reply.record!.id}`, AS_THE_OWNER, {
      dataPatch: { blocks: [{ id: 'b-1', type: 'text', text: `Only ${hidden.id} now.` }] },
    })
    expect(changed.status, JSON.stringify(changed.reply)).toBe(200)
    expect(changed.reply.recordsNamed).toEqual([named(note, 'title'), named(readersRecord, 'summary'), named(hidden, 'data.blocks[0].text')])
  })
})

describe('the answers that are not among the four', () => {
  it("are a note's, a message already sent and a check, which have no list", async () => {
    const noted = await inject('POST', '/api/records', AS_THE_OWNER, { kind: 'note', title: `A note on ${note.id}` })
    expect(noted.status, JSON.stringify(noted.reply)).toBe(201)
    expect(noted.reply).not.toHaveProperty('recordsNamed')
    const press = aMessage(`Sent once about ${note.id}.`, undefined, { sendId: 'one-press' })
    expect((await inject('POST', '/api/records', AS_AN_AGENT, press)).status).toBe(THE_WRITERS_SEND_TO_THE_READER)
    const again = await inject('POST', '/api/records', AS_AN_AGENT, press)
    expect(again.status, JSON.stringify(again.reply)).toBe(200)
    expect(again.reply).toHaveProperty('alreadySent')
    expect(again.reply).not.toHaveProperty('recordsNamed')
    const checked = await inject('POST', '/api/records/check', AS_AN_AGENT, aMessage(`Checked about ${note.id}.`))
    expect(checked.status, JSON.stringify(checked.reply)).toBe(200)
    expect(checked.reply).toHaveProperty('wouldBeAccepted', true)
    expect(checked.reply).not.toHaveProperty('recordsNamed')
  })
})

describe('a read of the named records that fails', () => {
  it('leaves the message stored, and the answer says the list could not be read', async () => {
    const { THE_READ_OF_THE_RECORDS_NAMED, theRecordsNamedWereNotRead } = await import('../src/server/lib/message-keys.ts')
    const failure = new Error('This test made the read fail.')
    const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
    const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
      if (source.startsWith(THE_READ_OF_THE_RECORDS_NAMED)) throw failure
      return prepare(source)
    }) as never)
    let sent: Answer
    try {
      sent = await inject('POST', '/api/records', AS_AN_AGENT, aMessage(`About ${note.id}, written while the read fails.`))
    } finally {
      spy.mockRestore()
    }
    expect(sent.status, JSON.stringify(sent.reply)).toBe(THE_WRITERS_SEND_TO_THE_READER)
    expect(sent.reply.recordsNamed).toBeNull()
    expect(sent.reply.recordsNamedNotRead).toBe(theRecordsNamedWereNotRead('message', failure))
    const read = await inject('GET', `/api/records/${sent.reply.record!.id}`, AS_AN_AGENT)
    expect(read.status, JSON.stringify(read.reply)).toBe(200)
  })
})

describe('the ids of one write', () => {
  it('are read in pieces of at most IDS_AT_ONCE ids', async () => {
    const { THE_READ_OF_THE_RECORDS_NAMED, theRecordsTheseWordsName } = await import('../src/server/lib/message-keys.ts')
    const { IDS_AT_ONCE } = await import('../src/server/db/in-pieces.ts')
    const { theMessageReader } = await import('../src/server/lib/messages.ts')
    const madeUp = Array.from({ length: IDS_AT_ONCE + 1 }, (_, i) => `Fixture${String(i).padStart(5, '0')}`)
    const bound: number[] = []
    const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
    const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
      const statement = prepare(source)
      if (!source.startsWith(THE_READ_OF_THE_RECORDS_NAMED)) return statement
      const all = statement.all.bind(statement) as (...values: unknown[]) => unknown[]
      ;(statement as unknown as { all: (...values: unknown[]) => unknown[] }).all = (...values: unknown[]) => {
        bound.push(values.length)
        return all(...values)
      }
      return statement
    }) as never)
    let found: ARecordNamed[]
    try {
      found = theRecordsTheseWordsName([{ where: 'body', text: `${madeUp.join(' ')} ${note.id}` }], theMessageReader({ type: 'human', id: THE_PERSON }))
    } finally {
      spy.mockRestore()
    }
    expect(found).toEqual([named(note, 'body')])
    expect(bound).toEqual([IDS_AT_ONCE, madeUp.length + 1 - IDS_AT_ONCE])
  })
})
