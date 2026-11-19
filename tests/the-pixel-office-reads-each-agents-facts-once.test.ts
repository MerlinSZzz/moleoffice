// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIXEL OFFICE READS EACH AGENT'S FACTS ONCE PER BUILD, NOT ONCE PER AGENT AND PROJECT OR ONCE PER RUN, AND ITS
 * ANSWER IS THE SAME (wave 13y round 46).
 *
 * MEASURED FIRST, on the made-up office tools/build-a-made-up-office.ts builds, at the commit before this round's change:
 * one pixelOffice() build ran 1,940 statements at 97 agents, 19,208 at 972 and 42,285 at 5,000. The plugin's people and
 * work views each build the whole pixel office, and so ran as many. The office map's own measurement found 161,323 queries
 * at 1,000 agents and 3,121,043 at 5,000 on its generated worlds. Three walks over every run found each run's agent again
 * with a statement of its own, and in every project each agent's registry row, its runtime, its resident mark, its hold,
 * its card and the two presence settings were read again.
 *
 * THREE TESTS.
 * 1. THE COUNTS. For the same agents, an office of three projects and twice the runs runs each of the statements below as
 *    often as an office of one project. A statement read once per run, or once per agent and project, runs more often.
 * 2. THE ANSWER. Both plugin views, on a seeded office with a supervisor, a secretary, a resident, a hold, runs inside
 *    and past their wait, running runs and runs bound by `ranAs` alone, digest to what they digested at the commit before
 *    the change (d2f02801f). A change that reads less and answers differently fails here.
 * 3. THE PLUGIN'S VIEWS READ WHAT THEY CARRY. The work view reads no presence and no message; the people view reads no
 *    message and no work claim.
 *
 * UNTIL WAVE 13Y ROUND 119 the first two tests also read the scene, GET /api/office/scene. That door was deleted with the
 * older built-in map, so the counts are now taken over the two plugin views, which read the same office through
 * `readTheOffice` in lib/pixel-office.ts, and the answer is now theirs alone.
 *
 * The office is written straight into a fresh test database by SQL. Every row it writes is invented for the test.
 */
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { generateCWholeAppearance } from '../src/shared/pixel-office.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const TEMPLATE = 'facts-seed-template'
// ONE INSTANT FOR THE WHOLE FILE, so a wait, a hold and "minutes since" read the same on every run of it.
const NOW = new Date(2026, 8, 20, 9, 0, 0)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // ONE AGENT THROUGH THE DOOR, so every other one can be a copy of a row the registration wrote.
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: TEMPLATE, name: TEMPLATE, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})
afterAll(async () => {
  vi.useRealTimers()
  await app.close()
  t.close()
})

type Row = Record<string, unknown>
const AGENTS = 8

/** A local wall-clock stamp, whole seconds, `n` seconds from NOW. */
function stamp(n: number): string {
  const at = new Date(NOW.getTime() + n * 1000)
  const two = (v: number) => String(v).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

function seedProjects(ids: readonly string[]): void {
  const insert = t.client.sqlite.prepare('INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
  for (const id of ids) insert.run(id, id, stamp(-86_400), stamp(-86_400))
}

const insertRecord = () =>
  t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, ?, 'authored')`,
  )

/**
 * AGENTS EACH WITH AN AGENT RECORD IN `default`. Agent 0 is a supervisor that started agents 2 and 3, agent 1 is the
 * secretary, agent 4 is a permanent resident, agent 5 holds its handle from a terminal session, agent 7 is retired, and
 * the rest are workers.
 */
function seedAgents(): void {
  const sqlite = t.client.sqlite
  const template = sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(TEMPLATE) as Row
  const columns = Object.keys(template)
  const insertAgent = sqlite.prepare(`INSERT INTO agents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
  const mapRecord = sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)')
  const record = insertRecord()
  sqlite.transaction(() => {
    for (let n = 0; n < AGENTS; n++) {
      const id = `facts-agent-${String(n)}`
      const own: Row = {
        id, handle: id, name: `Facts agent ${String(n)}`, retired: n === 7 ? 1 : 0, created_at: stamp(-80_000 + n),
        role: n === 0 ? 'supervisor' : n === 1 ? 'secretary' : 'worker',
        started_by_kind: n === 2 || n === 3 ? 'agent' : template['started_by_kind'], started_by_id: n === 2 || n === 3 ? 'facts-agent-0' : template['started_by_id'],
        resident_since: n === 4 ? stamp(-40_000) : null,
      }
      insertAgent.run(...columns.map((c) => (c in own ? own[c] : template[c])))
      record.run(`facts-agent-record-${String(n)}`, stamp(-80_000 + n), stamp(-80_000 + n), 'agent', id, JSON.stringify({ handle: id, runtime: n % 2 === 0 ? 'claude-code' : 'codex' }))
      mapRecord.run(`facts-agent-record-${String(n)}`, id)
    }
    // ONE APPEARANCE AND ONE SCALE FOR EVERY AGENT. The door draws both at random on registration, and the copies carry
    // the template's, so a digest of the answer would move with them.
    sqlite
      .prepare('UPDATE agents SET pixel_appearance = ?, pixel_scale = ?')
      .run(
        JSON.stringify(generateCWholeAppearance('facts-seed', 'registration')),
        JSON.stringify(generatePixelScale('facts-seed', 'worker')),
      )
    // AND ONE MOMENT OF REGISTRATION for the two agents the door wrote on the real clock, and for what the door wrote then.
    sqlite.prepare("UPDATE agents SET created_at = ? WHERE id NOT LIKE 'facts-agent-%'").run(stamp(-86_000))
    sqlite.prepare("UPDATE records SET created_at = ?, updated_at = ? WHERE id NOT LIKE 'facts-%'").run(stamp(-86_000), stamp(-86_000))
    // THE TEMPLATE IS RETIRED, because the forest seats the agents it seats in the order of their ids and the template's id
    // is drawn at random; a retired agent is given no seat.
    sqlite.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE handle = ?').run(stamp(-85_000), TEMPLATE)
    // A TERMINAL SESSION HOLDING AGENT 5'S HANDLE, heard from a minute ago.
    record.run('facts-terminal-5', stamp(-3_600), stamp(-60), 'session', 'Terminal of agent 5', JSON.stringify({ state: 'running', servingAgentId: 'facts-agent-5', runtime: 'claude-code' }))
    sqlite
      .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
      .run('facts-hold-5', 'facts-agent-5', 'facts-terminal-5', 'facts-machine', 'claude-code', stamp(-3_600), stamp(-60))
  })()
}

let runsSeeded = 0
/**
 * `each` MORE RUNS FOR EVERY AGENT, older than every run seeded before, and one message about each. Of each agent's runs,
 * the first of a batch is still inside its wait, the second is past it, the third says it is running with no process
 * behind it, and the fourth is bound to the agent by `ranAs` alone. A batch after the first is older, so the runs that
 * decide what is drawn stay the first batch's.
 */
function seedRuns(each: number): void {
  const sqlite = t.client.sqlite
  const record = insertRecord()
  const batch = runsSeeded++
  sqlite.transaction(() => {
    for (let n = 0; n < AGENTS; n++) {
      const id = `facts-agent-${String(n)}`
      for (let s = 0; s < each; s++) {
        const at = stamp(-batch * 20_000 - n * 100 - s * 10 - 600)
        const run = `facts-run-${String(batch)}-${String(n)}-${String(s)}`
        const kind = s % 4
        const data: Row =
          kind === 3
            ? { state: 'finished', ranAs: [{ workspaceId: 'default', agentId: `facts-agent-record-${String(n)}` }], runtime: 'claude-code' }
            : {
                state: kind === 2 ? 'running' : 'finished', servingAgent: id, servingAgentId: id, runtime: 'claude-code',
                providerSession: `facts-conversation-${String(batch)}-${String(n)}-${String(s)}`, deliveringMessage: `facts-message-${String(batch)}-${String(n)}-${String(s)}`,
                waitsUntil: kind === 0 ? stamp(1_200 - batch * 20_000) : stamp(-300 - batch * 20_000), lastOutputAt: at,
              }
        record.run(run, at, at, 'session', `Run ${String(s)} of ${id}`, JSON.stringify(data))
        record.run(`facts-message-${String(batch)}-${String(n)}-${String(s)}`, at, at, 'message', `Message about run ${String(s)}`,
          JSON.stringify({ body: `Message ${String(s)} from ${id}.`, sentBy: { kind: 'agent', id }, to: [{ kind: 'person', id: THE_PERSON }] }))
      }
    }
  })()
}

/**
 * EVERY STATEMENT RUN while `act` ran: its SQL and the values it was handed. A statement is seen each time it is run,
 * not each time it is prepared, because most of them are prepared once and kept.
 */
async function statementsRunDuring(act: () => Promise<unknown>): Promise<{ sql: string; values: string }[]> {
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', (...args: unknown[]) => unknown>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate }
  const seen: { sql: string; values: string }[] = []
  for (const name of ['all', 'get', 'iterate'] as const) {
    const original = originals[name]
    proto[name] = function (this: { source: string }, ...args: unknown[]) {
      seen.push({ sql: this.source, values: JSON.stringify(args) })
      return original.apply(this, args)
    }
  }
  try {
    await act()
  } finally {
    Object.assign(proto, originals)
  }
  return seen
}

async function ask(url: string): Promise<Row> {
  const reply = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(reply.statusCode, reply.body.slice(0, 500)).toBe(200)
  return reply.json() as Row
}
const peopleView = () => ask('/api/plugin-read/v1/people')
const workView = () => ask('/api/plugin-read/v1/work')
/** Both views, one after the other: the office map asks both every few seconds. */
const bothViews = async () => ({ people: await peopleView(), work: await workView() })

/** The statements that read one agent's facts, or one run's agent, and what each one is. */
const COUNTED: { name: string; is: (one: { sql: string; values: string }) => boolean }[] = [
  // THE READ OF ONE AGENT'S IDENTITY is `theAgentWithThisId` in lib/agent-references.ts. It is the one statement
  // `theRegistryRowNamedBy` in lib/registry-aliases/index.ts runs for the identity columns, which reads the alias that may
  // own the id and the agents row together. A change to that statement's text must change this matcher, or the entry
  // counts nothing on either side.
  {
    name: "the read of one agent's identity by its id",
    is: (one) =>
      one.sql.endsWith('FROM registry_aliases WHERE alias_id = @id) AS o LEFT JOIN agents ON agents.id = coalesce(o.canonicalId, @id)') &&
      one.sql.includes('retired_at AS retiredAt'),
  },
  { name: "the read of one agent's whole registry row by its id", is: (one) => one.sql.trim() === 'SELECT * FROM agents WHERE id = ?' },
  { name: "the read of one agent's runtime from its records", is: (one) => /FROM agent_records m JOIN records r ON r\.id = m\.record_id WHERE m\.agent_id = \? AND r\.deleted_at IS NULL/.test(one.sql) },
  { name: 'the read of the agent one agent record is', is: (one) => one.sql === 'SELECT a.* FROM agent_records m JOIN agents a ON a.id = m.agent_id WHERE m.record_id = ?' },
  { name: "the read of one agent's resident mark", is: (one) => one.sql === 'SELECT resident_since FROM agents WHERE id = ?' },
  { name: "the read of one agent's live hold", is: (one) => /from "handle_holds"/.test(one.sql) && /"agent_id" = \?/.test(one.sql) && /"released_at" is null/.test(one.sql) },
  { name: 'the read of the two presence settings', is: (one) => /runtime_settings/.test(one.sql) && /MOLE_OFFICE_(ALIVE_WITHIN_MINUTES|PERSON_ALIVE_WITHIN_SECONDS)/.test(one.values) },
]

function countsOf(statements: readonly { sql: string; values: string }[]): Record<string, number> {
  return Object.fromEntries(COUNTED.map((one) => [one.name, statements.filter(one.is).length]))
}

interface AnAgent { id: string; presence: { project: string; colour: string; word: string }[] }

describe("the pixel office reads each agent's facts once per build", () => {
  it('runs these statements as often for three projects and twice the runs as for one project', async () => {
    seedProjects(['default'])
    seedAgents()
    seedRuns(4)
    await bothViews() // once to prepare and keep what is kept, so both counts below are made alike
    const smaller = countsOf(await statementsRunDuring(bothViews))
    seedProjects(['facts-two', 'facts-three'])
    seedRuns(4)
    let people: Row = {}
    const larger = countsOf(await statementsRunDuring(async () => (people = (await bothViews()).people)))
    // THE COUNTS MEAN SOMETHING ONLY IF THE VIEWS READ EVERY AGENT IN EVERY PROJECT.
    const agents = (people['agents'] as AnAgent[]).filter((one) => one.id.startsWith('facts-agent-'))
    expect(agents.length).toBe(AGENTS)
    for (const agent of agents) expect(agent.presence.length, `${agent.id} is read in three projects`).toBe(3)
    expect(larger, 'the same agents in three projects with twice the runs, and not one of these statements runs more often').toEqual(smaller)
  })
})

/** The value with every object's keys in order, so two answers that hold the same are written the same. */
function inOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inOrder)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, inOrder((value as Row)[key])]))
}

/**
 * THE IDS THE DOOR MADE AT RANDOM when it registered the template agent: the agent's, its avatar's, and every record the
 * door wrote then (its agent record and its welcome message), so a digest does not move with them.
 */
function theTemplatesOwnIds(): string[] {
  const sqlite = t.client.sqlite
  const row = sqlite.prepare('SELECT id, avatar_asset_id AS avatar FROM agents WHERE handle = ?').get(TEMPLATE) as { id: string; avatar: string }
  const records = (sqlite.prepare("SELECT id FROM records WHERE id NOT LIKE 'facts-%' ORDER BY kind, title").all() as { id: string }[]).map((one) => one.id)
  return [row.id, row.avatar, ...records].filter((one) => one !== TEMPLATE)
}

/**
 * The digest of the value, its random ids replaced first and its keys put in order after, so a key that held one is placed alike.
 *
 * THE OFFICE'S OWN ID IS RANDOM TOO. A fresh office draws it new each time, where the commit before the change gave the
 * office's row its handle as its id. So the id is put back to that handle before the digest is taken, and the avatar id
 * made from it comes back with it. Every other byte is hashed as it came.
 */
function digest(value: unknown): string {
  let text = JSON.stringify(value).replaceAll(theOfficesOwnId(t), MOLE_OFFICE_HANDLE)
  for (const [n, id] of theTemplatesOwnIds().entries()) text = text.replaceAll(id, `template-id-${String(n)}`)
  text = JSON.stringify(inOrder(JSON.parse(text)))
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

/**
 * WHAT THE COMMIT BEFORE THE CHANGE (d2f02801f) ANSWERED on this seeded office: the two plugin views. Worked out by
 * running this file there.
 */
const BEFORE = {
  peopleView: 'fa693e5d9870fd29a86eee43',
  workView: '446cd381ad9793f62f337148',
}

describe("the plugin's views answer as they did before", () => {
  it('answer both plugin views as the commit before the change did', async () => {
    const { people, work } = await bothViews()
    // THE SEED DREW WHAT IT IS FOR: work, and green, grey and red dots, so a change to any of them shows here.
    expect((work['work'] as unknown[]).length, 'some agent has work').toBeGreaterThan(0)
    const colours = new Set((people['agents'] as AnAgent[]).flatMap((agent) => agent.presence.map((p) => p.colour)))
    expect([...colours].sort()).toEqual(['green', 'grey', 'red'])
    // THE OFFICE IS IN THE PEOPLE VIEW UNDER THE ID ITS ROW HOLDS, before the digest puts that id back to the old one.
    expect(JSON.stringify(people), 'the people view does not name the office by its own id').toContain(JSON.stringify(theOfficesOwnId(t)))
    expect({ peopleView: digest(people), workView: digest(work) }).toEqual(BEFORE)
  })
})

describe("the plugin's views read only what they carry", () => {
  it('the work view reads no presence and no message, and the people view reads no message and no work claim', async () => {
    // THE PRESENCE STATEMENTS ARE THE RESIDENT MARK AND THE TWO PRESENCE SETTINGS: the work view reads the holds itself.
    const presence = (one: { sql: string; values: string }) => COUNTED.slice(4).some((counted) => counted.is(one)) && !/"handle_holds"/.test(one.sql)
    // THE MESSAGE POOL'S READ OF ONE PROJECT'S MESSAGES (messagePool in lib/messages.ts).
    const message = (one: { sql: string }) => /\$\.writtenIn\.project/.test(one.sql)
    const claims = (one: { sql: string }) => /from "work_claims"/.test(one.sql)
    const work = await statementsRunDuring(workView)
    const people = await statementsRunDuring(peopleView)
    expect(work.filter(presence).length, 'presence statements the work view ran').toBe(0)
    expect(work.filter(message).length, 'message reads the work view ran').toBe(0)
    expect(people.filter(message).length, 'message reads the people view ran').toBe(0)
    expect(people.filter(claims).length, 'work claim reads the people view ran').toBe(0)
  })
})
