// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROSTER READS EVERY AGENT'S OWN RECORD IN ONE QUERY, AND ANSWERS WHAT IT ANSWERED BEFORE.
 *
 * MEASURED, 22 September 2026 (acceptance finding 26). `GET /api/participants` built each row with
 * `recordForAgentIn`, which is one query per agent. On the live office that is 388 agents, 388
 * queries and 2.46 seconds for the one request; a CPU profile of the office while ten dsh agents
 * worked put 54% of its whole time inside that walk, and the office serves on one thread, so while
 * it walks nobody else is answered. The dsh Stop hook asks for this roster once per task.
 *
 * `recordsForAgentsIn` reads them all in one query and the roster hands the same map to every row.
 * The answer must not change, and that is what this file pins:
 *   1. the map is what `recordForAgentIn` answers, agent by agent;
 *   2. the newest record in the project wins, which is the older reader's own rule;
 *   3. a record in another project is not this project's answer;
 *   4. a deleted record is nobody's answer, and an agent with no record answers null;
 *   5. the roster's `record` field carries exactly that.
 *
 * MUTATION PROOF, named. In src/server/lib/participants.ts, `recordsForAgentsIn` orders the rows
 * `ORDER BY r.created_at ASC, r.rowid ASC` so the last row written wins. Turn both to DESC — the
 * oldest then wins — and case 2 goes red. Take the `r.workspace_id = ?` out of its WHERE and case 3
 * goes red. The file is restored byte for byte after each.
 *
 * The records here are synthetic: they are made for this file and stand for nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type Participants = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let app: FastifyInstance
let participants: Participants

const HERE = 'default'
const THERE = 'elsewhere'
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/**
 * The registry id of the agent with this handle. A registration gives an agent an id of its own,
 * and the id is not the handle, so the records below are joined to the id.
 */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id?: unknown } | undefined
  expect(typeof row?.id, `no registry row has the handle ${handle}`).toBe('string')
  return String(row!.id)
}

/** A record of this agent in that project, filed as the agent's own, the way a registration files one. */
function aRecordFor(handle: string, workspaceId: string, title: string): string {
  const agent = idOf(handle)
  const id = t.api.createRecord({ workspaceId, kind: 'note', title, data: { body: `Synthetic record for ${handle}` }, actor: { type: 'agent', id: agent } }).id
  t.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?) ON CONFLICT(record_id) DO NOTHING').run(id, agent)
  return id
}

/** The roster's own word for one agent's record. */
async function recordOnTheRoster(agent: string): Promise<string | null | undefined> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { agents: { handle: string; record: string | null }[] }
  return body.agents.find((one) => one.handle === agent)?.record
}

const OLDEST = 'roster-a'
const OTHER_PROJECT = 'roster-b'
const NO_RECORD = 'roster-c'
let newest = ''
let older = ''
let elsewhere = ''
let deleted = ''

beforeAll(async () => {
  t = await freshDb()
  participants = await import('../src/server/lib/participants.ts')
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: THERE, title: 'Another project' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of [OLDEST, OTHER_PROJECT, NO_RECORD]) {
    const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, role: 'worker' } })
    expect(started.statusCode, started.body).toBe(201)
  }
  // THE REGISTRATION ALREADY FILED ONE RECORD PER AGENT HERE. These are the rest of the cases.
  older = aRecordFor(OLDEST, HERE, 'An older record of roster-a')
  newest = aRecordFor(OLDEST, HERE, 'The newest record of roster-a')
  elsewhere = aRecordFor(OTHER_PROJECT, THERE, 'A record of roster-b in the other project')
  deleted = aRecordFor(NO_RECORD, HERE, 'A record of roster-c that is then deleted')
  t.api.deleteRecord(deleted, { type: 'human', id: THE_PERSON })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('every agent’s own record, read once for the whole roster (acceptance finding 26)', () => {
  it('answers agent by agent what the one-agent reader answers', () => {
    const map = participants.recordsForAgentsIn(HERE)
    for (const handle of [OLDEST, OTHER_PROJECT, NO_RECORD]) {
      expect(map.get(idOf(handle)) ?? null, handle).toBe(participants.recordForAgentIn(idOf(handle), HERE))
    }
  })

  it('takes the newest record in the project, not an older one', () => {
    expect(participants.recordsForAgentsIn(HERE).get(idOf(OLDEST))).toBe(newest)
    expect(newest).not.toBe(older)
  })

  it('does not answer with a record filed in another project', () => {
    const here = participants.recordsForAgentsIn(HERE).get(idOf(OTHER_PROJECT))
    expect(here, 'the other project’s record is this project’s answer').not.toBe(elsewhere)
    expect(participants.recordsForAgentsIn(THERE).get(idOf(OTHER_PROJECT))).toBe(elsewhere)
  })

  it('answers nothing for an agent whose only extra record is deleted, and the roster says the same', async () => {
    expect(participants.recordsForAgentsIn(HERE).get(idOf(NO_RECORD))).not.toBe(deleted)
    for (const handle of [OLDEST, OTHER_PROJECT, NO_RECORD]) {
      expect(await recordOnTheRoster(handle), `the roster's record for ${handle}`).toBe(participants.recordForAgentIn(idOf(handle), HERE))
    }
  })
})
