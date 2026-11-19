// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGES NAME A SENDER STORED UNDER AN AGENT RECORD THE PAGE'S LIST CARRIES (wave 13y round 91;
 * MnSr-70FHCOX).
 *
 * The read rule counts every agent record of an agent as that agent: its newest live record in the reading project, an
 * older record there that was deleted, and its record in another project (round 90,
 * tests/the-read-rule-counts-an-agents-own-agent-record-as-the-agent.test.ts). The pages name a stored sender by the
 * list of participants of the page's project, which carries each agent's newest live record there and no other
 * (`recordsForAgentsIn`), and the server's contacts door reads records the same way (`theOwnRecordsOfTheAgentsHolding`).
 * This file holds what is right today, and it was allowed to land on its own (cFD79rVB1zK-): the record the list carries
 * names the agent, from either project, and an agent's own contacts door counts the message under that record as its
 * own and draws no row under its records.
 *
 * WHAT IS NOT HERE. Three more cases were written and run red before this commit: from 'default', the message stored
 * under bell's older record there, and the one under its record in another project, name "An agent this page has no
 * name for"; and the person's contacts door draws a row for a writer nobody registered under each of those two records.
 * They have one cause: the list carries each agent's newest live record in the page's project and no other. They are
 * not kept as expectations of today's behaviour; they are in round 92's brief, which first measures how often live
 * messages are stored so (cFD79rVB1zK-, Z0iG_boCVIA9).
 *
 * THE CASES. bell has three agent records: `older` in 'default', deleted before `now` was filed there, and `elsewhere`
 * in another project. bell writes three messages to the person, each then stored under one of them.
 *   1. From 'default', the rule every page names a writer by (`theWritersName`), given the list of participants the
 *      page reads, names bell on the message stored under `now`.
 *   2. From the other project, the same rule names bell on the message stored under `elsewhere`.
 *   3. bell's own contacts door, from 'default', ends its row with the person on the message stored under `now`, and
 *      draws no row for a writer nobody registered under one of its records.
 *
 * THE WORLD IS ITS OWN: `freshDb` and `apiApp` make a database and a server for this file, and every request is asked
 * with `inject`. Each message is written in process as bell, checked to store bell's registry id, and then given its
 * stored sender by a write to the file, because the door stores the registry id.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey, theWritersName, type KnownParticipant } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'bells-other-project'
const BELL = { name: 'Bell Ringer', handle: 'bell-ringer' } as const

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function ask(method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  const reply = await app.inject({ method, url, headers: { ...headers, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { payload: payload as never }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, text: reply.body }
}

/** One agent record of bell's in `project`, filed by the person; its id. */
async function aRecordOfBells(project: string): Promise<string> {
  const made = await ask('POST', '/api/records', { ...AS_THE_PERSON, 'x-mole-office-workspace': project }, { kind: 'agent', title: BELL.name, data: { handle: BELL.handle, state: 'active', runtime: 'claude-code' } })
  expect(made.status, made.text).toBe(201)
  return (made.body['record'] as { id: string }).id
}

/** The participants a page of `project` reads, in the shape the chat panel gives the one naming rule. */
async function theListOf(project: string): Promise<KnownParticipant[]> {
  const read = await ask('GET', '/api/participants', { ...AS_THE_PERSON, 'x-mole-office-workspace': project })
  expect(read.status, read.text.slice(0, 400)).toBe(200)
  const listed = read.body as { people?: { id: string; name: string; handle: string }[]; agents?: { id: string; name: string; handle: string; record?: string | null }[] }
  return [
    ...(listed.people ?? []).map((one) => ({ who: { kind: 'person' as const, id: one.id }, name: one.name, handle: one.handle })),
    ...(listed.agents ?? []).map((one) => ({ who: { kind: 'agent' as const, id: one.id }, name: one.name, handle: one.handle, record: one.record ?? null })),
  ]
}

type Under = 'now' | 'older' | 'elsewhere'
const records: Record<Under, string> = { now: '', older: '', elsewhere: '' }
const messages: Record<Under, string> = { now: '', older: '', elsewhere: '' }
let bell = ''

/** The name the one naming rule gives the sender of the message stored under `under`, with the list of `project`. */
async function theNameOn(under: Under, project: string): Promise<string> {
  const read = await ask('GET', `/api/messages/${messages[under]}`, { ...AS_THE_PERSON, 'x-mole-office-workspace': project })
  expect(read.status, read.text.slice(0, 400)).toBe(200)
  const message = (read.body['message'] ?? read.body) as { sentBy: { kind: 'agent'; id: string } | null; from: string | null }
  // THE CONTROL: the message read is the one stored under this record.
  expect(message.sentBy, `the stored sender of the message under ${under}`).toEqual({ kind: 'agent', id: records[under] })
  return theWritersName({ sentBy: message.sentBy, from: message.from ?? null }, await theListOf(project))
}

type Row = { key: string; last: { id: string } | null }

/** The rows of a contacts door from 'default', as the reader with these headers is drawn them. */
async function theContactsDoor(headers: Record<string, string>): Promise<Row[]> {
  const read = await ask('GET', '/api/messages/contacts', headers)
  expect(read.status, read.text.slice(0, 400)).toBe(200)
  return ((read.body['contacts'] ?? []) as Row[]).map(({ key, last }) => ({ key, last: last === null ? null : { id: last.id } }))
}

/** The keys of the rows that name one of bell's records as a writer nobody registered. */
const rowsUnderBellsRecords = (rows: readonly Row[]): string[] => rows.map((row) => row.key).filter((key) => Object.values(records).some((id) => key.includes(id)))

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const db = t.client.sqlite
  const made = await ask('POST', '/api/workspaces', AS_THE_PERSON, { id: ELSEWHERE, title: 'Another project of bell' })
  expect(made.status, made.text).toBe(201)
  // bell'S THREE AGENT RECORDS, ONE AGENT, filed as round 90's read-rule test files them: a project holds one live agent
  // record for a handle, so `older` is deleted before `now` is filed, and `elsewhere` keeps bell live all the while.
  records.older = await aRecordOfBells(HERE)
  records.elsewhere = await aRecordOfBells(ELSEWHERE)
  const deleted = await ask('DELETE', `/api/records/${records.older}`, AS_THE_PERSON)
  expect(deleted.status, deleted.text).toBe(200)
  records.now = await aRecordOfBells(HERE)
  const listed = (await ask('GET', '/api/participants', AS_THE_PERSON)).body as { agents?: { id: string; handle: string; name: string; record?: string | null }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === BELL.handle)
  bell = row?.id ?? ''
  // THE CONTROL: one agent, its name, and its newest live record in 'default' carried by the list.
  expect([row?.name, row?.record], JSON.stringify(row)).toEqual([BELL.name, records.now])
  const mapped = (db.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ? ORDER BY record_id').all(bell) as { id: string }[]).map((one) => one.id)
  expect(mapped, "bell's records, all mapped to bell").toEqual(Object.values(records).sort())
  for (const under of ['older', 'elsewhere', 'now'] as const) {
    messages[under] = t.api.createRecord({
      kind: 'message',
      title: `bell under ${under}`,
      workspaceId: HERE,
      data: { body: `The bell is rung, written under the record ${under}.`, to: [{ kind: 'person', id: THE_PERSON }] },
      actor: { type: 'agent', id: BELL.handle } as never,
    }).id
    const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(messages[under]) as { sentBy: string }
    // THE CONTROL: the door stored the registry id, so the shape below is made here.
    expect(JSON.parse(stored.sentBy), `what the door stored for the message under ${under}`).toEqual({ kind: 'agent', id: bell })
    db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(records[under], messages[under])
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the one naming rule, given the list of the page's project", () => {
  it("1. from 'default', the message stored under bell's newest record there names bell", async () => {
    expect(await theNameOn('now', HERE)).toBe(BELL.name)
  })

  it('2. from the other project, the message stored under its record there names bell', async () => {
    expect(await theNameOn('elsewhere', ELSEWHERE)).toBe(BELL.name)
  })
})

describe("the contacts door, from 'default'", () => {
  it("3. bell's own: its row with the person ends on the message under its newest record, and no row is a writer under one of its records", async () => {
    const rows = await theContactsDoor({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': BELL.handle })
    expect(rows.find((row) => row.key === participantKey({ kind: 'person', id: THE_PERSON }))?.last?.id, JSON.stringify(rows)).toBe(messages.now)
    expect(rowsUnderBellsRecords(rows), JSON.stringify(rows)).toEqual([])
  })
})
