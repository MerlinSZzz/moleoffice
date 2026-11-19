// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/waiting AND GET /api/sessions TAKE OUT OF THE DATABASE ONLY THE STORED TEXT THEIR ANSWERS NEED.
 *
 * Round 35 of wave 13n. The session hook asks both doors when a run starts and after a compaction.
 * At 02:17 on 4 October 2026 a compaction got "GET /api/waiting answered The operation was aborted
 * due to timeout". Measured on a made-up office of the live shape
 * (tests/the-chat-office-of-the-live-shape.ts):
 *
 *   - GET /api/waiting read every message of the office whole, to keep the few addressed to the
 *     person that the person has not read, and it read every fork of the office twice.
 *   - GET /api/sessions read every record of the project whole, to use the id, kind and title of
 *     most of them, and it read every run's notes twice, to use a few short fields.
 *
 * WHAT THIS FILE COUNTS. A record whose whole stored `data` a statement handed back while the door
 * worked out its answer. A statement's text is compared with every record's stored `data`, so no
 * reader can be missed, and the count does not depend on how fast the machine is. Stored text of
 * fewer than 100 characters is not compared, because short values such as `{}` are not one record's.
 *
 * AND THE ANSWER IS THE ONE THE WHOLE READ GAVE. The rows of messages on the person's waiting list
 * are compared with the rows the old rule picks out of the whole message pool. A run's row is read
 * from the few fields the sweep keeps, so a fixture holds a run with every one of them and its row
 * is checked field by field.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION
 * of one line for each part red; RESTORE green, checked with cmp against a saved copy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { buildTheChatOffice, type Shape, type TheChatOffice } from './the-chat-office-of-the-live-shape.ts'

/** A small office of the live office's mix: most of its stored text is runs, reports and messages. */
const SHAPE: Shape = {
  agents: 60,
  retired: 20,
  theConversation: 200,
  otherContacts: 10,
  otherPersonMessages: 100,
  betweenAgents: 800,
  groups: 6,
  groupsWithThePerson: 3,
  membersPerGroup: 5,
  groupMessages: 100,
  officeLines: 40,
  sessions: 600,
  otherRecords: 300,
  otherKinds: ['note'],
  project: { problems: 150, tasks: 50, decisions: 60, proposals: 20, modules: 8, reports: 150, openShare: 0.25 },
}

/** Stored text shorter than this is not taken to be one record's whole `data`. */
const SHORTEST_COMPARED = 100

let t: TestDb
let app: FastifyInstance
let office: TheChatOffice
let handle = ''

/** The headers the session hook sends: the project and who it asks as, and no session. */
const asTheAgent = (): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})
const asThePerson = (): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

const LONG = 'Words a run wrote down while it worked, which no row of the list reads. '.repeat(30)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  office = buildTheChatOffice(t.client.sqlite, THE_PERSON, SHAPE)
  handle = (t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(office.theAgent) as { handle: string }).handle
  const add = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, 'default', 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
  )
  // A PIPELINE, whose `blockIds` the sweep reads to file runs under it. Its stored text is long enough to be compared.
  const aProblem = (t.client.sqlite.prepare(`SELECT id FROM records WHERE kind = 'problem' LIMIT 1`).get() as { id: string }).id
  add.run('fx-pipeline', 'pipeline', 'A made-up pipeline', JSON.stringify({ blockIds: [aProblem], context: LONG }))
  // THREE RUNS THAT HOLD EVERY FIELD A ROW OF THE LIST IS BUILT FROM, beside a long note no row reads.
  add.run('fx-run-filed', 'session', 'A run filed by hand', JSON.stringify({
    state: 'idle', doing: 'writing the fixture', runtime: 'codex', lastOutputAt: '2026-09-30 10:00:00', workspace: 'the-bench', notes: LONG,
  }))
  add.run('fx-run-agent', 'session', 'A run that names its agent the old way', JSON.stringify({ agent: 'claude-code (opus-5)', notes: LONG }))
  add.run('fx-run-stamped', 'session', 'A run discovery stamped', JSON.stringify({
    state: 'finished',
    extra: { discovered: { tool: 'claude-code', externalId: 'fx-made-up-run', logPath: '/nowhere/fx-made-up-run.jsonl' } },
    notes: LONG,
  }))
})
afterAll(async () => {
  await app.close()
  t.close()
})

/** Every record's stored `data`, by its text, with the record's id and kind. */
function everyStoredText(): Map<string, { id: string; kind: string }[]> {
  const out = new Map<string, { id: string; kind: string }[]>()
  for (const row of t.client.sqlite.prepare('SELECT id, kind, data FROM records').all() as { id: string; kind: string; data: string }[]) {
    if (row.data.length < SHORTEST_COMPARED) continue
    out.set(row.data, [...(out.get(row.data) ?? []), { id: row.id, kind: row.kind }])
  }
  return out
}

/**
 * ONE STORED TEXT A STATEMENT HANDED BACK WHOLE, with every record that stores exactly that text. Two
 * made-up records can store the same text, and then nothing says which of them was read, so a check
 * asks whether any of them is one the door may read.
 */
type Holders = { id: string; kind: string }[]

interface WhatADoorRead {
  /** Every stored `data` some statement handed back whole, by the records that store it. */
  wholly: Holders[]
  /** The statements on `records` that ran, with the values each was given. */
  statements: { sql: string; args: unknown[] }[]
  body: string
}

/** What one request read from `records`, counted at the database. */
async function whatADoorRead(url: string, headers: Record<string, string>): Promise<WhatADoorRead> {
  const stored = everyStoredText()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const wholly = new Map<string, Holders>()
  const statements: { sql: string; args: unknown[] }[] = []
  const look = (value: unknown): void => {
    if (typeof value === 'string') {
      const holders = stored.get(value)
      if (holders !== undefined) wholly.set(value, holders)
    } else if (Array.isArray(value)) value.forEach(look)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(look)
  }
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    if (/\bfrom\s+"?records"?/i.test(text)) {
      for (const method of ['all', 'get'] as const) {
        const read = statement[method] as (...args: unknown[]) => unknown
        statement[method] = function (this: unknown, ...args: unknown[]) {
          statements.push({ sql: text, args })
          const out = read.apply(this, args)
          look(out)
          return out
        }
      }
    }
    return statement
  }
  try {
    const reply = await app.inject({ method: 'GET', url, headers })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    return { wholly: [...wholly.values()], statements, body: reply.body }
  } finally {
    sqlite.prepare = original
  }
}


describe('GET /api/sessions, as the session hook asks it', () => {


  it('builds each run row from the fields it keeps, as it did from the whole record', async () => {
    const read = await whatADoorRead('/api/sessions', asThePerson())
    const rows = (JSON.parse(read.body) as { sessions: Record<string, unknown>[] }).sessions
    const row = (id: string): Record<string, unknown> | undefined => rows.find((one) => one['recordId'] === id)
    expect(row('fx-run-filed'), 'the run filed by hand').toMatchObject({
      state: 'idle',
      doing: 'writing the fixture',
      recordedAgent: 'codex',
      workspace: { name: 'the-bench', from: 'recorded', path: null },
      lastActivityAt: '2026-09-30 10:00:00',
      lastActivityFrom: 'stated',
    })
    expect(row('fx-run-agent')?.['recordedAgent'], 'the agent named the old way').toBe('claude-code (opus-5)')
    // THE STAMP IS READ: the row is the run discovery found, named by its tool and its own id.
    expect(row('fx-run-stamped'), 'the stamped run').toMatchObject({ id: 'claude-code:fx-made-up-run', logPath: '/nowhere/fx-made-up-run.jsonl' })
  })
})

describe('GET /api/waiting, as the session hook asks it', () => {


  it('lists the same messages the whole message pool gave, by the rule it was read with', async () => {
    const { messagePool, unreadAmong } = await import('../src/server/lib/messages.ts')
    const person = { kind: 'person', id: THE_PERSON } as const
    const before = messagePool(MESSAGE_CENTRE)
      .filter((entry) => entry.entry === 'message')
      .filter((entry) => entry.to.some((who) => who.kind === 'person' && who.id === THE_PERSON))
      .filter((entry) => !(entry.sentBy !== null && entry.sentBy.kind === 'person' && entry.sentBy.id === THE_PERSON))
      .filter((entry) => unreadAmong([entry], person) > 0)
      .map((entry) => entry.id)
      .sort()
    const read = await whatADoorRead('/api/waiting', asThePerson())
    const now = (JSON.parse(read.body) as { items: { id: string; act: string }[] }).items
      .filter((item) => item.act === 'read')
      .map((item) => item.id)
      .sort()
    expect(before.length, 'the office holds messages for this list').toBeGreaterThan(0)
    expect(now).toEqual(before)
  })
})
