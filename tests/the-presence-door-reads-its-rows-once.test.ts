// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESENCE DOOR READS ITS SESSION, PROCESS AND REGISTRY ROWS A BOUNDED NUMBER OF TIMES, NOT
 * ONCE PER AGENT.
 *
 * MEASURED FIRST, 11 September 2026, on an idle copy of the owner's database (problem 9UeL9VeVPn33), three
 * costs left behind inside the 76-agent loop `GET /api/presence` walks, all fixed here:
 *
 *   - `minutesSinceARunOfThisAgentSpoke` ran an unprojected `select()` over every session record —
 *     about 1,791 rows — once per agent that reached it, not once for the roster. Fixed the same
 *     way `aProcessIsRunningFor`'s machine reading already was: a lazy reading `everybodysPresence`
 *     makes once and hands down.
 *   - `aProcessIsRunningFor` freshly prepared its two statements — parsed their SQL text again —
 *     once per agent, rather than keeping the statement it had already parsed. Fixed with a
 *     WeakMap-cached statement, the same pattern as `theAgentByHandleStatement` in participants.ts.
 *   - `readParticipant`, called once per participant, did the same. Fixed the same way. So does
 *     `listParticipants`, called once per request rather than once per participant, so its fix only
 *     shows across two requests, not within one — the second assertion below is why this test makes
 *     the door answer twice.
 *
 * SINCE WAVE 13Y ROUND 143 the roster reads the runs the dots read, not every run. Those cannot say
 * whether an agent has any run, so the word Inactive asks each agent's runs by their bindings,
 * through one kept statement (`aRunRanAsOneOf` in lib/presence.ts). That statement is counted apart
 * from the roster's read. It is prepared once, on the first request that asks it, and never again.
 *
 * A READ OF EVERYBODY NOW ASKS THE PROJECT'S BINDINGS FIRST. Once per project, it reads the first
 * bindings of the project's runs and the runs in the fallback bucket (`aRunRanAsOneOfForEveryAgent`
 * in lib/presence.ts). It asks one agent's runs only when those two cannot say. No run is bound to
 * the three agents here, so the read of one agent's runs is not prepared at all. The two reads of
 * the bindings are counted apart from the roster's read. Each is prepared once, on the first
 * request, and never again.
 *
 * HOW IT IS PROVED. The statements are counted at the database, as
 * tests/the-groups-door-reads-the-pool-once.test.ts does. Three agents are registered with nothing
 * else true of them — no live hold, no open connection, no process, no session record — so each one
 * reaches every one of the three costs above inside `participantPresence`. A statement prepared once
 * per agent is prepared three times unfixed and once fixed; a statement prepared once per request
 * (`listParticipants`) is prepared once either way on a single call, and prepared again on a second
 * call only when nothing was kept, which is what the two-call assertion catches.
 *
 * CONTROL: red before the change, for whichever piece is reverted. MUTATION: revert one piece at a
 * time — drop `sessions` from the `minutesSinceARunOfThisAgentSpoke` call, or `machine`-style
 * caching from the process-row statement (one statement since 25 September 2026, in place of
 * `aProcessIsRunningFor`'s two), or the WeakMap from `readParticipant` or
 * `listParticipants`, or `keptStatement` from `ONE_RUN_BOUND_FIRST_TO_EACH_BINDING` — and the matching
 * assertion goes red on its own; the others stay green. Asking `aRunRanAsOneOf` of each agent again,
 * in place of the project's bindings, turns the two counts of the bindings red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

const COLD_AGENTS = ['presence-cold-one', 'presence-cold-two', 'presence-cold-three']
/** The registry id each of them was given. A presence row names an agent by that id, not its handle. */
const coldIds: string[] = []

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // NOTHING BUT THE REGISTRATION ROW: no session, no resource, no held connection. Each of these
  // reaches `aProcessIsRunningFor` and then `minutesSinceARunOfThisAgentSpoke` inside
  // `participantPresence`. THE ONE CACHE REGISTRATION DOES WARM is the participant-by-id statement,
  // because the card message each registration now writes reads its recipient once. A decision brought
  // that message in. The assertion for that statement below is therefore at most one, not
  // exactly one, and a reader that re-prepared it per participant would still fail it.
  for (const handle of COLD_AGENTS) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
    coldIds.push((made.json() as { agent: { id: string } }).agent.id)
  }
})
afterAll(async () => {
  await app.close()
  t.close()
})

/** Every statement prepared while `act` runs, by its SQL. */
async function statementsDuring(act: () => Promise<void>): Promise<string[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare
  const seen: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    seen.push(sql)
    return original.call(this, sql)
  }
  try {
    await act()
  } finally {
    sqlite.prepare = original
  }
  return seen
}

/** The read of one agent's runs by their bindings (`ONE_PROJECTS_RUNS_BOUND_TO_ONE_OF`), which takes the number of rows as a value. */
function isTheBindingRead(sql: string): boolean {
  return /FROM "?records"?/i.test(sql) && sql.includes('records_session_first_binding_agent_idx') && /\blimit \?$/i.test(sql.trim())
}

/** The two reads of one project's bindings for a read of everybody (`aRunRanAsOneOfForEveryAgent`): its first bindings, and its runs in the fallback bucket. */
function isABindingsRead(sql: string): boolean {
  return /FROM "?records"?/i.test(sql) && !isTheBindingRead(sql) && (sql.includes('records_session_first_binding_agent_idx') || sql.includes('records_session_reference_fallback_idx'))
}

async function getPresence(): Promise<void> {
  const reply = await app.inject({ method: 'GET', url: '/api/presence', headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { presence?: { who: { kind: string; id: string }; from: string | null }[] }
  const cold = (body.presence ?? []).filter((one) => one.who.kind === 'agent' && coldIds.includes(one.who.id))
  expect(cold.map((one) => one.who.id).sort()).toEqual([...coldIds].sort())
  // AND NONE OF THEM ANSWERED FROM A PROCESS OR A RUN, which is what makes every one of them reach
  // `minutesSinceARunOfThisAgentSpoke` — the third and weakest of the three inputs. If this were not
  // true the sessions statement would not run for them at all, and the first assertion below would
  // be proving nothing.
  for (const one of cold) expect(one.from, `${one.who.id} has nothing registered for it`).toBeNull()
}

describe('GET /api/presence over three agents with nothing else registered for them', () => {
  it('reads the sessions, the process rows and the registries a bounded number of times', async () => {
    const statements = await statementsDuring(getPresence)

    const sessionReads = statements.filter((sql) => /FROM "?records"?/i.test(sql) && /"?kind"?\s*=/.test(sql) && /"?workspace_id"?\s*=/.test(sql) && !isTheBindingRead(sql) && !isABindingsRead(sql)).length
    expect(sessionReads, 'the session records are read once for the whole roster, not once per agent').toBe(1)

    // THE PROJECT'S BINDINGS, read for the word Inactive of the whole roster, by two kept statements.
    const bindingsReads = statements.filter(isABindingsRead).length
    expect(bindingsReads, "the project's first bindings and its runs in the fallback bucket are read by two statements, prepared once each").toBe(2)

    // THE RUNS BOUND TO ONE AGENT are asked only of an agent a first binding names. No run names these three.
    const bindingReads = statements.filter(isTheBindingRead).length
    expect(bindingReads, 'the runs bound to one agent are not read for an agent no run is bound to').toBe(0)

    // THE PROCESS ROWS ARE ONE STATEMENT NOW, read once for the roster (problem u_yThQczHiZ8). It
    // replaced two statements `liveProcessesFor` ran for each agent, one on `registered_by` and one
    // joining the rows to the runs that name the agent.
    const processRowReads = statements.filter((sql) => /FROM session_resources r LEFT JOIN records s/.test(sql) && /servingAgent/.test(sql)).length
    expect(processRowReads, 'the process-row statement is prepared once, not once per agent').toBe(1)

    const agentByIdReads = statements.filter((sql) => /^SELECT \* FROM agents WHERE id = \?$/.test(sql.trim())).length
    // AT MOST ONE, AND ZERO IS THE ORDINARY ANSWER NOW. The registration writes each new agent its
    // card message, as one decision directs. Writing that message reads its recipient
    // once, so the kept statement is already prepared before this call. A reader that re-prepared per
    // participant would still prepare it three times here and fail, which is what this measures.
    expect(agentByIdReads, 'the agent-by-id statement is prepared once, not once per participant').toBeLessThanOrEqual(1)

    // AND A SECOND CALL DOES NOT PREPARE ANY OF THEM AGAIN, which is the only way
    // `listParticipants`'s fix shows: it is already called once per request either side of that fix,
    // so a single call proves nothing about it.
    const secondCall = await statementsDuring(getPresence)
    const preparedAgainOnSecondCall = secondCall.filter(
      (sql) =>
        /^SELECT \* FROM (people ORDER BY handle|agents ORDER BY handle, rowid)$/.test(sql.trim()) ||
        /^SELECT \* FROM agents WHERE id = \?$/.test(sql.trim()) ||
        (/FROM session_resources r LEFT JOIN records s/.test(sql) && /servingAgent/.test(sql)) ||
        isTheBindingRead(sql) ||
        isABindingsRead(sql),
    ).length
    expect(preparedAgainOnSecondCall, 'a second request reuses every kept statement, preparing none of them again').toBe(0)
  })
})
