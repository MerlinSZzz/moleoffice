// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/brief TAKES OUT OF THE DATABASE ONLY THE STORED TEXT ITS ANSWER NEEDS.
 *
 * Round 34 of wave 13n, problem M19dPeiWMmJq: after a compaction the session hook said Mole Office did
 * not answer the brief, so the run was told nothing about the project. The hook gives each request
 * 3,000 ms, and the brief measured about 3.5 s on the live office. Measured on a made-up
 * office of the live shape (tests/the-chat-office-of-the-live-shape.ts), the brief read every record
 * of the project whole twice (for the open loops and for the attention rule), every message of the
 * project whole for the person's words, and every proposal of the office three times.
 *
 * WHAT THIS FILE COUNTS. Every character of stored text a statement on `records` hands back while the
 * brief is worked out: ids, titles, stamps and, above all, `data`. It is counted at the database, so
 * no reader can be missed, and it does not depend on how fast the machine is.
 *
 * THE BOUND. What the brief needs whole is the records of the kinds it reads whole: the six kinds of
 * open loop, modules, decisions and proposals, the person's messages and the messages of the reader's
 * groups. The test works that out with its own query, and allows twice it and a hundred and fifty
 * characters for each record, because the attention rule reads a few short fields of every record.
 * A read of every record whole, or of every message whole, is far over it.
 *
 * AND THE ATTENTION RULE GIVES THE SAME ANSWER FROM WHAT IT READS. The rule now reads only the fields
 * of `data` it uses (`listRecordsForTheAttentionRule`). On a fixture holding a promise owed outside
 * with a date, a pause whose date has passed, a consequence, a checklist item, a report, a direction
 * and a blocks link, its answer from those fields is compared, as JSON, with its answer from the
 * whole records.
 *
 * THE FIRST BRIEF OF A PROCESS IS READ IN THE HOOK. It took about 1.4 s alone and a later one under
 * 60 ms, and on 1 Nov, under a load of 44 on 20 CPUs, the first one ran past the agent's case's 5 s. So
 * the hook reads it, counted, and the agent's case says that its own read, a warm one, counts the same
 * characters. The hook has the sixty seconds tests/how-long-a-test-may-take.ts gives a hook in a file
 * that names `apiApp`. The count is taken on the statement type, not on each statement as it is made,
 * because the server makes a statement once and runs it again on a later request; counted as they were
 * made, a warm read missed 71,856 of the 577,602 characters.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION
 * of one line for each part red; RESTORE green, checked with cmp against a saved copy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
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

/**
 * A MARGIN FOR WHAT THE BRIEF READS OF EVERY RECORD: the attention rule ranks every record of the
 * project, so it reads each one's id, title and stamps and the few fields it uses. That is about a
 * hundred characters a record; this allows a hundred and fifty.
 */
const CHARACTERS_A_RECORD = 150

/** The margin for this office: what the brief reads of every record. */
function aMargin(): number {
  return CHARACTERS_A_RECORD * (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
}

let t: TestDb
let app: FastifyInstance
let office: TheChatOffice
let handle = ''
let session = ''
/** What the first brief of this process read, for the agent. */
let coldRead: { characters: number; status: number }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  office = buildTheChatOffice(t.client.sqlite, THE_PERSON, SHAPE)
  handle = (t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(office.theAgent) as { handle: string }).handle
  session = (t.client.sqlite.prepare(`SELECT id FROM records WHERE kind = 'session' ORDER BY created_at DESC LIMIT 1`).get() as { id: string }).id
  coldRead = await textReadBy(theAgent())
})
afterAll(async () => {
  await app.close()
  t.close()
})

/** The characters of stored text every statement on `records` handed back while one request ran. */
async function textReadBy(headers: Record<string, string>): Promise<{ characters: number; status: number }> {
  type Read = (this: { source: string }, ...args: unknown[]) => unknown
  const statements = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as { all: Read; get: Read }
  const original = { all: statements.all, get: statements.get }
  let characters = 0
  const count = (value: unknown): void => {
    if (typeof value === 'string') characters += value.length
    else if (Array.isArray(value)) value.forEach(count)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(count)
  }
  for (const method of ['all', 'get'] as const) {
    const read = original[method]
    statements[method] = function (this: { source: string }, ...args: unknown[]) {
      const out = read.apply(this, args)
      if (/\bfrom\s+"?records"?/i.test(this.source)) count(out)
      return out
    }
  }
  try {
    const reply = await app.inject({ method: 'GET', url: '/api/brief', headers })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    return { characters, status: reply.statusCode }
  } finally {
    statements.all = original.all
    statements.get = original.get
  }
}

/** The headers of the made-up office's agent, in its latest session. */
function theAgent(): Record<string, string> {
  return {
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-session': session,
  }
}

/**
 * WHAT THE BRIEF NEEDS WHOLE, in characters of stored data, worked out with this file's own query:
 * the records of the kinds it reads whole, the person's messages and the messages sent to groups.
 */
function whatTheBriefNeeds(): number {
  const db = t.client.sqlite
  const sum = (sql: string): number => (db.prepare(sql).get() as { n: number | null }).n ?? 0
  return (
    sum(`SELECT sum(length(data)) AS n FROM records WHERE kind IN ('task', 'problem', 'idea', 'direction', 'obligation', 'proposal', 'module', 'decision')`) +
    sum(`SELECT sum(length(data)) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.sentBy.id') = '${THE_PERSON}'`) +
    sum(`SELECT sum(length(data)) AS n FROM records WHERE kind = 'message' AND json_type(data, '$.toGroup') = 'text'`)
  )
}

/** Every character of stored data the office holds, for the sentence that says what a whole read is. */
function everything(): number {
  return (t.client.sqlite.prepare('SELECT sum(length(data)) AS n FROM records').get() as { n: number }).n
}

describe('GET /api/brief on an office whose stored text is mostly runs, reports and messages', () => {
  it('reads for an agent no more than twice what it needs whole, and far less than one copy of everything', async () => {
    const needs = whatTheBriefNeeds()
    const bound = 2 * needs + aMargin()
    expect(bound, 'the office is built so that one whole read of it is over the bound').toBeLessThan(everything())
    const read = await textReadBy(theAgent())
    expect(read.characters, 'a warm read counts what the first, cold read counted').toBe(coldRead.characters)
    expect(read.characters, `characters read; the bound is ${String(bound)} of ${String(everything())} stored`).toBeLessThanOrEqual(bound)
  })

  it('reads for the person no more than twice what it needs whole', async () => {
    const bound = 2 * whatTheBriefNeeds() + aMargin()
    const read = await textReadBy({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })
    expect(read.characters, `characters read; the bound is ${String(bound)} of ${String(everything())} stored`).toBeLessThanOrEqual(bound)
  })
})

describe('the attention rule, read from the fields it uses', () => {
  it('gives the same answer as from the whole records, on records that use every part of the rule', async () => {
    const db = t.client.sqlite
    const R = await import('../src/server/lib/records.ts')
    const A = await import('../src/shared/attention.ts')
    const add = db.prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       VALUES (?, 'attention', 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
    )
    db.prepare(`INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('attention', 'Attention', '2026-09-01 09:00:00', '2026-09-01 09:00:00')`).run()
    const long = 'Words the attention rule never reads. '.repeat(40)
    add.run('at-owed', 'task', 'A promise to somebody outside', JSON.stringify({ state: 'doing', owed_to: 'the printer shop', due: '2026-09-10', body: long }))
    add.run('at-blocker', 'task', 'The thing holding the promise up', JSON.stringify({ state: 'todo', body: long }))
    add.run('at-paused', 'task', 'Put down until a date that has passed', JSON.stringify({ state: 'blocked', paused: { since: '2026-09-01', why: 'waiting for parts', until: { date: '2026-09-05' } }, body: long }))
    add.run('at-stopped', 'problem', 'Stopped short with a consequence', JSON.stringify({ state: 'blocked', consequence: { bearer: 'person', what: 'the rig may move' }, symptom: long }))
    add.run('at-module', 'module', 'A module with a checklist', JSON.stringify({ state: 'active', parts: [{ id: 'p-1', name: 'Part', items: [{ id: 'i-1', text: 'An item that stopped', state: 'blocked' }] }], context: long }))
    add.run('at-report', 'report', 'A report for the person', JSON.stringify({ for: 'the owner', date: '2026-09-01', blocks: [{ id: 'b-1', type: 'text', heading: 'Words', text: long }] }))
    add.run('at-direction', 'direction', 'A direction taken some way', JSON.stringify({ depth: 'ran', body: long }))
    add.run('at-true', 'task', 'A record holding a true and a false', JSON.stringify({ state: 'done', done: true, read: false, body: long }))
    db.prepare(
      `INSERT INTO links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
       VALUES ('at-link', 'attention', 'owner', 'at-blocker', 'at-owed', 'blocks', 0, 'made-up', 'agent', '2026-09-01 09:00:00', '2026-09-01 09:00:00')`,
    ).run()
    const links = R.allLinks('attention')
    const input = (records: unknown[]) => ({
      now: new Date(2026, 8, 20, 12, 0, 0).getTime(),
      records: records as Parameters<typeof A.computeAttention>[0]['records'],
      links,
      changes: [],
      resources: [],
      dueMs: (stamp: string) => new Date(`${stamp}T00:00:00`).getTime(),
    })
    const whole = A.computeAttention(input(R.listRecords({ workspaceId: 'attention', includeDeleted: true })))
    const narrow = A.computeAttention(input(R.listRecordsForTheAttentionRule('attention')))
    expect(whole.visible.length, 'the fixture puts rows on the list').toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(narrow)).toBe(JSON.stringify(whole))
  })
})
