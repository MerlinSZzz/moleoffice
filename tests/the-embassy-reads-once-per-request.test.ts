// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY DOOR READS THE MACHINE, THE WAITING RUNS AND THE AGENT RECORDS ONCE PER REQUEST, AND
 * ITS ANSWER IS THE ONE THE PER-ROW READINGS GIVE. Problem iZtwtr12RSxw.
 *
 * MEASURED FIRST, 25 September 2026, on a copy of the owner’s office: GET /api/office/embassy took 34 to 41
 * seconds, and a visitor confirm took 34 seconds because its reply is the same table. The CPU profile
 * put most of it in three reads made again for every row: `participantPresence` asked the machine
 * for its processes and read every run for the waiting ones, and `recordForAgentIn` looked up each
 * agent's record on its own. `theEmbassy` now makes each of those reads once per request and hands
 * it to every row, as `everybodysPresence` does for the roster. The same copy then answered in 9 to
 * 12 seconds, with the same answer.
 *
 * HOW IT IS PROVED. Every statement the database runs during one request is counted by its SQL, at
 * the statement and not at its preparation, because the agent-record statement is prepared once and
 * kept. Each agent here reaches all three reads: it has a live process row, so its presence asks the
 * machine; nothing holds its handle, so its presence asks for the waiting runs; and every agent row
 * asks for its record. The door is asked with three such agents and again with six, and each count
 * must be one both times.
 *
 * THE ANSWER IS CHECKED AGAINST THE DOORS THAT READ ONE ROW AT A TIME. `GET /api/presence/:kind/:id`
 * calls `participantPresence` with no shared reading, which is how the Embassy read every row before.
 * One agent has a run waiting for the next message and one has a large idle run, so a shared reading
 * that lost either would change a row.
 *
 * MUTATIONS, one at a time, in `theEmbassy` in src/server/api/office.ts:
 *   - pass `undefined` for `machine` to `participantPresence`: the machine count goes red.
 *   - pass `undefined` for `waiting`: the waiting-runs count goes red.
 *   - read `waiting` from an empty list of rows: the waiting agent's presence goes red.
 *   - look the record up with `recordForAgentIn` per row again: the record count goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The registry id of every agent this file registered, by handle. */
const agentIds = new Map<string, string>()

/**
 * One agent registered through the ordinary door, with one run of its own and a live process row
 * on that run. The run is bound to the agent's record through `ranAs`, as the pick-up cost reads it.
 */
async function anAgentWithAProcess(handle: string, runData: Record<string, unknown> = {}): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['src'] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const made = reply.json() as { agent: { id: string }; record: string }
  agentIds.set(handle, made.agent.id)
  const run = historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'agent', id: handle },
    kind: 'session',
    title: `A run of ${handle}`,
    data: {
      servingAgentId: made.agent.id,
      ranAs: [{ workspaceId: 'default', agentId: made.record }],
      ...runData,
    },
  })
  t.client.sqlite
    .prepare(
      'INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) ' +
        "VALUES (?, 'default', ?, 'process', ?, '{}', ?, ?)",
    )
    .run(`process-of-${handle}`, run.id, `pid:${handle}`, localStamp(new Date()), handle)
}

async function embassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

/** The SQL of every statement the database runs while `act` runs, one entry per run. */
async function statementsRunDuring(act: () => Promise<unknown>): Promise<string[]> {
  const statement = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const seen: string[] = []
  const kept = new Map<string, unknown>()
  for (const name of ['all', 'get', 'iterate', 'run']) {
    const original = statement[name] as (this: { source: string }, ...args: unknown[]) => unknown
    kept.set(name, original)
    statement[name] = function (this: { source: string }, ...args: unknown[]) {
      seen.push(this.source)
      return original.apply(this, args)
    }
  }
  try {
    await act()
  } finally {
    for (const [name, original] of kept) statement[name] = original
  }
  return seen
}

/** How many times each of the three reads ran during one request. */
function theThreeReads(statements: readonly string[]): { machine: number; waitingRuns: number; agentRecords: number } {
  return {
    // `listResources` for the process rows of the whole project, which is what presence reads of the
    // machine (problem FqD2s_8-Ci6A): no session named, released rows left out.
    machine: statements.filter((sql) =>
      /^SELECT \* FROM session_resources WHERE workspace_id = \? AND type = \? AND released_at IS NULL ORDER BY/.test(sql),
    ).length,
    // `theRunsAlreadySaidGoodbyeTo`, which every reading of the waiting runs makes once.
    waitingRuns: statements.filter((sql) => sql.includes('"aboutRun"')).length,
    // `recordForAgentIn` (one agent) or `recordsForAgentsIn` (every agent): the agent's record in
    // this project. Other statements join the same two tables to ask other questions.
    agentRecords: statements.filter((sql) =>
      /^SELECT (r\.id AS id|m\.agent_id AS agent, r\.id AS id) FROM agent_records m (CROSS )?JOIN records r/.test(sql),
    ).length,
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A RUN WAITING FOR THE NEXT MESSAGE, so this agent reads green from the waiting runs.
  await anAgentWithAProcess('embassy-waiting', {
    deliveringMessage: 'a-message-it-answered',
    providerSession: 'provider-session-of-embassy-waiting',
    runtime: 'claude-code',
    waitsUntil: localStamp(new Date(Date.now() + 5 * 60_000)),
  })
  // A LARGE LAST TURN AND A LONG IDLE, so this agent's row carries a pick-up warning.
  await anAgentWithAProcess('embassy-expensive', {
    usageReceipt: { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 250000, inputIncludesCached: true },
    lastOutputAt: '2026-09-01 00:00:00',
  })
  await anAgentWithAProcess('embassy-plain')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/office/embassy', () => {
  it('draws each row as the doors that read one row at a time do', async () => {
    const said = await embassy()
    for (const [handle, id] of agentIds) {
      const row = said.rows.find((one) => one.who.kind === 'agent' && one.who.id === id)
      expect(row, `the Embassy holds a row for ${handle}`).toBeDefined()
      const alone = await app.inject({ method: 'GET', url: `/api/presence/agent/${id}`, headers: AS_THE_PERSON })
      expect(alone.statusCode, alone.body).toBe(200)
      const presence = (alone.json() as { presence: { colour: string; word: string; says: string } }).presence
      expect(row?.presence, `${handle}'s presence on the Embassy is the one its own door gives`).toEqual({
        colour: presence.colour,
        word: presence.word,
        says: presence.says,
      })
    }
    const rowOf = (handle: string) => said.rows.find((one) => one.who.kind === 'agent' && one.who.id === agentIds.get(handle))
    // THE SEEDS DID WHAT THEY ARE FOR, or the comparison above would prove nothing about them.
    expect(rowOf('embassy-waiting')?.presence?.colour, 'the waiting run makes its agent reachable').toBe('green')
    expect(rowOf('embassy-expensive')?.pickUpCost?.lastTurnTokens, 'the idle run is read through the agent record').toBe(250000)
    expect(rowOf('embassy-plain')?.pickUpCost, 'a small run carries no warning').toBeNull()
  })

  it('reads the machine, the waiting runs and the agent records once, however many agents there are', async () => {
    const withThree = theThreeReads(await statementsRunDuring(embassy))
    for (const handle of ['embassy-fourth', 'embassy-fifth', 'embassy-sixth']) await anAgentWithAProcess(handle)
    const withSix = theThreeReads(await statementsRunDuring(embassy))
    expect(withThree, 'with three agents, each read is made once').toEqual({ machine: 1, waitingRuns: 1, agentRecords: 1 })
    expect(withSix, 'with six agents, still once each').toEqual({ machine: 1, waitingRuns: 1, agentRecords: 1 })
  })
})
