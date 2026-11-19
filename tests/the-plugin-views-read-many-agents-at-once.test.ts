// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLUGIN'S PEOPLE AND WORK, FOR MANY AGENTS: EACH FACT READ IN ONE STATEMENT FOR ALL OF THEM, A LIGHT ROSTER, AND A
 * LIST FORM THAT ANSWERS FOR THE AGENTS NAMED (wave 13y round 50).
 *
 * MEASURED FIRST, on the made-up office tools/build-a-made-up-office.ts builds, at the commit before this round's change
 * (972 agents, one project): the people view ran a statement per agent for its resident mark, for the hold on its handle
 * and for its card, one per agent of a run for that agent's runtime, and one per process row for the row's session
 * record. The work view ran the hold statement once for every agent. The office map asks both views every few seconds.
 *
 * WHAT THIS FILE PROVES, on an office written straight into a fresh test database by SQL, as in
 * tests/the-pixel-office-reads-each-agents-facts-once.test.ts. Every row it writes is invented for the test.
 * 1. THE ANSWERS DO NOT MOVE. The people view, the work view and GET /api/resources are the same text they were at the
 *    commit before the change (3bd20dee7), on an office that draws work, holds, a resident, a visitor, waiting runs and
 *    process rows. A change that reads less and answers differently fails here. Until wave 13y round 119 this case also
 *    read the scene, GET /api/office/scene, which was deleted with the older built-in map.
 * 2. THE ROSTER (GET /api/plugin-read/v1/roster) answers in its pinned shape, every person and agent with the people
 *    view's values and in its order, and reads no presence, no hold, no runtime and no record.
 * 3. THE LIST FORM (?agents=<id>,<id>,... on people and work) answers what the whole view answers for the agents named,
 *    in the whole view's order, and names in notAgents the ids no agent has. A malformed id and more than 500 ids are
 *    refused, saying what was wrong. agents= with nothing after it answers no agent and reads no agent at all. The
 *    plugin's slot puts no length of its own on the agents value. It refuses a read whose path and query are over
 *    8,192 bytes, and tests/the-slot-refuses-a-read-too-long-to-send.test.ts holds that (wave 13y round 52).
 * 4. THE COUNTS. For twice the agents, twice the waiting runs and twice the process rows, not one statement of the people
 *    view, the work view, GET /api/resources, the roster or the empty list runs more often. The work view reads no
 *    resident mark and no agent's row by its id.
 *
 * The statements are counted where SQLite runs them, as tests/the-pixel-office-reads-each-agents-facts-once.test.ts
 * counts them, and not through a mock.
 */
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { generateCWholeAppearance } from '../src/shared/pixel-office.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'
import { pluginAsksTheSlot } from '../src/shared/plugins.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const TEMPLATE = 'many-seed-template'
// ONE INSTANT FOR THE WHOLE FILE, so a wait, a hold and "minutes since" read the same on every run of it.
const NOW = new Date(2026, 9, 20, 9, 0, 0)
/** How many agents of the kind that grows the office starts with. The counts double it. */
const GROUPS = 6

type Row = Record<string, unknown>

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // ONE AGENT THROUGH THE DOOR, so every other one can be a copy of a row the registration wrote.
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: TEMPLATE, name: TEMPLATE, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  seedTheFixedAgents()
  seedGroups(GROUPS)
})
afterAll(async () => {
  vi.useRealTimers()
  await app.close()
  t.close()
})

/** A local wall-clock stamp, whole seconds, `n` seconds from NOW. */
function stamp(n: number): string {
  const at = new Date(NOW.getTime() + n * 1000)
  const two = (v: number) => String(v).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

const insertRecord = () =>
  t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, ?, 'authored')`,
  )

/** One agent row copied from the template's, with `own` written over it, and an agent record naming its runtime. */
function addAgent(id: string, own: Row, runtime: string, at: number): void {
  const sqlite = t.client.sqlite
  const template = sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(TEMPLATE) as Row
  const columns = Object.keys(template)
  const row: Row = {
    id, handle: id, name: `Invented ${id}`, retired: 0, created_at: stamp(at), role: 'worker',
    pixel_appearance: JSON.stringify(generateCWholeAppearance('many-seed', 'registration')),
    pixel_scale: JSON.stringify(generatePixelScale('many-seed', 'worker')),
    resident_since: null, credential: null, ...own,
  }
  sqlite.prepare(`INSERT INTO agents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => (c in row ? row[c] : template[c])))
  insertRecord().run(`${id}-record`, stamp(at), stamp(at), 'agent', id, JSON.stringify({ handle: id, runtime }))
  sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`${id}-record`, id)
}

/** A run of `id`'s that the message worker started, carrying a conversation, and waiting until `until` seconds from NOW. */
function aMessageRun(id: string, run: string, until: number, startedByMoleOffice: boolean, at: number): void {
  insertRecord().run(run, stamp(at), stamp(at), 'session', `Waiting run of ${id}`, JSON.stringify({
    state: 'finished', servingAgent: id, servingAgentId: id, runtime: 'claude-code', providerSession: `${run}-conversation`,
    deliveringMessage: `${run}-message`, waitsUntil: stamp(until), lastOutputAt: stamp(at), ...(startedByMoleOffice ? { startedByMoleOffice: true } : {}),
  }))
}

/** A hold on `id`'s handle by `session`, last heard `heard` seconds from NOW. */
function aHold(id: string, session: string, heard: number): void {
  t.client.sqlite
    .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
    .run(`${id}-hold`, id, session, 'many-machine', 'claude-code', stamp(-7_200), stamp(heard))
}

/**
 * A PROCESS ROW OF `session`, with a pid no machine can have: Linux numbers pids up to 4,194,304 at most, so the row is
 * read as gone on any machine this runs on, and nothing is signalled.
 */
function aProcessRow(id: string, session: string, pid: number, registeredBy: string, released: boolean): void {
  t.client.sqlite
    .prepare('INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, detail, registered_at, registered_by, released_at, released_by, release_note) VALUES (?, \'default\', ?, \'process\', ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, session, String(pid), pid, `Invented process ${String(pid)} for this test`, stamp(-3_000), registeredBy,
      released ? stamp(-1_000) : null, released ? registeredBy : null, released ? 'Invented: released for this test.' : null)
}

/**
 * THE AGENTS EVERY SIZE OF THE OFFICE HAS: a secretary whose run is past its wait, a supervisor whose run is inside it, a
 * permanent resident, an agent held from a terminal, one held by a run the office started, one whose hold has lapsed, a
 * visitor from another office, and a retired agent. A process row of a finished run and a released one are read by
 * GET /api/resources.
 */
function seedTheFixedAgents(): void {
  const sqlite = t.client.sqlite
  const record = insertRecord()
  sqlite.transaction(() => {
    addAgent('many-secretary', { role: 'secretary' }, 'claude-code', -80_000)
    aMessageRun('many-secretary', 'many-secretary-run', -300, true, -900)
    addAgent('many-supervisor', { role: 'supervisor' }, 'codex', -79_999)
    aMessageRun('many-supervisor', 'many-supervisor-run', 1_200, true, -800)
    addAgent('many-resident', { resident_since: stamp(-40_000) }, 'claude-code', -79_998)
    sqlite.prepare("INSERT INTO resident_sleeps (id, agent_id, what, began_at, ended_at, by_kind, by_id) VALUES ('many-sleep', 'many-resident', 'slept', ?, ?, 'agent', 'many-resident')").run(stamp(-30_000), stamp(-20_000))
    addAgent('many-terminal', {}, 'claude-code', -79_997)
    record.run('many-terminal-session', stamp(-7_200), stamp(-60), 'session', 'Terminal of many-terminal', JSON.stringify({ state: 'running', servingAgentId: 'many-terminal', runtime: 'claude-code' }))
    aHold('many-terminal', 'many-terminal-session', -60)
    addAgent('many-runner', {}, 'codex', -79_996)
    record.run('many-runner-run', stamp(-7_200), stamp(-30), 'session', 'Run of many-runner', JSON.stringify({ state: 'running', servingAgent: 'many-runner', servingAgentId: 'many-runner', runtime: 'codex', startedByMoleOffice: true }))
    aHold('many-runner', 'many-runner-run', -30)
    addAgent('many-lapsed', {}, 'claude-code', -79_995)
    record.run('many-lapsed-session', stamp(-300_000), stamp(-250_000), 'session', 'Terminal of many-lapsed', JSON.stringify({ state: 'running', servingAgentId: 'many-lapsed', runtime: 'claude-code' }))
    aHold('many-lapsed', 'many-lapsed-session', -250_000)
    addAgent('many-visitor', { credential: 'many-credential' }, 'codex', -79_994)
    addAgent('many-retired', { retired: 1, retired_at: stamp(-50_000) }, 'claude-code', -79_993)
    record.run('many-finished-run', stamp(-6_000), stamp(-5_000), 'session', 'A finished run of many-supervisor', JSON.stringify({ state: 'finished', servingAgent: 'many-supervisor', servingAgentId: 'many-supervisor', runtime: 'codex' }))
    aProcessRow('many-finished-process', 'many-finished-run', 4_194_390, 'agent:many-supervisor', false)
    aProcessRow('many-released-process', 'many-finished-run', 4_194_391, 'agent:many-supervisor', true)
    // ONE MOMENT OF REGISTRATION for the agents the door and the migrations wrote on the real clock, and for what the door
    // wrote then, so a digest does not move with the clock.
    sqlite.prepare("UPDATE agents SET created_at = ? WHERE id NOT LIKE 'many-%'").run(stamp(-86_000))
    sqlite.prepare("UPDATE records SET created_at = ?, updated_at = ? WHERE id NOT LIKE 'many-%'").run(stamp(-86_000), stamp(-86_000))
    sqlite.prepare("UPDATE agents SET pixel_appearance = ?, pixel_scale = ? WHERE id NOT LIKE 'many-%'")
      .run(JSON.stringify(generateCWholeAppearance('many-seed', 'registration')), JSON.stringify(generatePixelScale('many-seed', 'worker')))
    // THE TEMPLATE IS RETIRED, because the forest seats agents in the order of their ids and the template's is drawn at random.
    sqlite.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE handle = ?').run(stamp(-85_000), TEMPLATE)
  })()
}

let groupsSeeded = 0
/**
 * `count` MORE AGENTS OF THE KIND THAT GROWS: each a worker the supervisor started, with an agent record, a run inside its
 * wait (every other one started by the office), a running run with a process row, and a run bound to it by `ranAs` alone.
 */
function seedGroups(count: number): void {
  const record = insertRecord()
  t.client.sqlite.transaction(() => {
    for (let n = groupsSeeded; n < groupsSeeded + count; n++) {
      const id = `many-agent-${String(n).padStart(3, '0')}`
      addAgent(id, { started_by_kind: 'agent', started_by_id: 'many-supervisor' }, n % 2 === 0 ? 'claude-code' : 'codex', -70_000 + n)
      aMessageRun(id, `${id}-waiting`, 1_200, n % 2 === 0, -700 - n)
      record.run(`${id}-running`, stamp(-3_000), stamp(-600), 'session', `Running run of ${id}`, JSON.stringify({ state: 'running', servingAgent: id, servingAgentId: id, runtime: 'claude-code' }))
      aProcessRow(`${id}-process`, `${id}-running`, 4_194_400 + n, `agent:${id}`, false)
      record.run(`${id}-bound`, stamp(-2_000), stamp(-1_900), 'session', `Run bound to ${id}`, JSON.stringify({ state: 'finished', ranAs: [{ workspaceId: 'default', agentId: `${id}-record` }], runtime: 'claude-code' }))
    }
  })()
  groupsSeeded += count
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

/** How often each statement ran, its list of `?` written as one, so a statement read in one piece is one statement. */
function howOften(statements: readonly { sql: string }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const one of statements) {
    const sql = one.sql.replace(/\?(\s*,\s*\?)+/g, '?…').replace(/\s+/g, ' ').trim()
    out.set(sql, (out.get(sql) ?? 0) + 1)
  }
  return out
}

/** Every statement that ran more often in `larger` than in `smaller`, with both counts. */
function grown(smaller: Map<string, number>, larger: Map<string, number>): string[] {
  return [...larger].filter(([sql, n]) => n > (smaller.get(sql) ?? 0)).map(([sql, n]) => `${String(smaller.get(sql) ?? 0)} -> ${String(n)}: ${sql.slice(0, 220)}`)
}

async function reply(url: string): Promise<{ status: number; body: string }> {
  const answer = await app.inject({ method: 'GET', url, headers: PERSON })
  return { status: answer.statusCode, body: answer.body }
}
async function ask(url: string): Promise<Row> {
  const answer = await reply(url)
  expect(answer.status, answer.body.slice(0, 500)).toBe(200)
  return JSON.parse(answer.body) as Row
}
const view = (name: string, query = '') => ask(`/api/plugin-read/v1/${name}${query}`)

/**
 * THE IDS THE DOOR MADE AT RANDOM when it registered the template agent: the agent's, its avatar's, and every record the
 * door wrote then, so a digest does not move with them.
 */
function theTemplatesOwnIds(): string[] {
  const sqlite = t.client.sqlite
  const row = sqlite.prepare('SELECT id, avatar_asset_id AS avatar FROM agents WHERE handle = ?').get(TEMPLATE) as { id: string; avatar: string }
  const records = (sqlite.prepare("SELECT id FROM records WHERE id NOT LIKE 'many-%' ORDER BY kind, title").all() as { id: string }[]).map((one) => one.id)
  return [row.id, row.avatar, ...records].filter((one) => one !== TEMPLATE)
}

/**
 * The digest of the text exactly as it came, its random ids replaced and nothing else: no key is moved.
 *
 * THE OFFICE'S OWN ID IS RANDOM TOO. A fresh office draws it new each time, where the commit before the change gave the
 * office's row its handle as its id. So the id is put back to that handle before the digest is taken, and the avatar id
 * made from it comes back with it. Every other byte is hashed as it came.
 */
function digest(text: string): string {
  let replaced = text.replaceAll(theOfficesOwnId(t), MOLE_OFFICE_HANDLE)
  for (const [n, id] of theTemplatesOwnIds().entries()) replaced = replaced.replaceAll(id, `template-id-${String(n)}`)
  return createHash('sha256').update(replaced).digest('hex').slice(0, 24)
}

/**
 * WHAT THE COMMIT BEFORE THE CHANGE (3bd20dee7) ANSWERED on this seeded office, before the counts below add agents.
 * Worked out by running this file there.
 */
const BEFORE = {
  peopleView: '19cfb2ff8865bfb36bffb45f',
  workView: 'eba457a60ae7c98f5ba5b0cf',
  resources: 'b13a3b9dc44f9b10504be555',
  resourcesWithTheReleased: 'd2e11ee108bcb35268782a3c',
}

describe('1. the views answer as they did before', () => {
  it('answers the people view, the work view and the resources in the same text as the commit before the change', async () => {
    const people = await reply('/api/plugin-read/v1/people')
    const work = await reply('/api/plugin-read/v1/work')
    const resources = await reply('/api/resources')
    const released = await reply('/api/resources?includeReleased=true')
    for (const one of [people, work, resources, released]) expect(one.status, one.body.slice(0, 500)).toBe(200)
    // THE SEED DREW WHAT IT IS FOR: work, green, grey and red dots, a visitor, and process rows.
    const peopleBody = JSON.parse(people.body) as { agents: { id: string; visitor: boolean; presence: { colour: string }[] }[] }
    expect([...new Set(peopleBody.agents.flatMap((a) => a.presence.map((p) => p.colour)))].sort()).toEqual(['green', 'grey', 'red'])
    expect(peopleBody.agents.filter((a) => a.visitor).map((a) => a.id)).toEqual(['many-visitor'])
    expect((JSON.parse(work.body) as { work: unknown[] }).work.length, 'work is drawn').toBeGreaterThan(GROUPS)
    expect((JSON.parse(released.body) as { resources: unknown[] }).resources.length).toBe(GROUPS + 2)
    // THE OFFICE IS IN THE PEOPLE VIEW UNDER THE ID ITS ROW HOLDS, before the digest puts that id back to the old one.
    expect(people.body, 'the people view does not name the office by its own id').toContain(JSON.stringify(theOfficesOwnId(t)))
    const now = {
      peopleView: digest(people.body),
      workView: digest(work.body),
      resources: digest(resources.body),
      resourcesWithTheReleased: digest(released.body),
    }
    expect(now, `the digests now: ${JSON.stringify(now)}`).toEqual(BEFORE)
  })
})

interface PeopleView { interface: string; view: string; people: Row[]; agents: (Row & { id: string })[]; notAgents?: string[]; narrowedByPermission: unknown }
interface WorkView { interface: string; view: string; work: (Row & { agent: string })[]; notAgents?: string[]; narrowedByPermission: unknown }

describe('2. the roster', () => {
  it('answers in its pinned shape, with the people view’s values for every person and agent, in its order', async () => {
    const roster = (await view('roster')) as { people: Row[]; agents: Row[] }
    const people = (await view('people')) as unknown as PeopleView
    const fields = (value: object) => Object.keys(value).sort()
    expect(fields(roster)).toEqual(['agents', 'interface', 'narrowedByPermission', 'people', 'view'])
    expect(roster).toMatchObject({ interface: 'office-read/1', view: 'roster' })
    const PERSON_FIELDS = ['handle', 'id', 'kind', 'name']
    const AGENT_FIELDS = ['createdAt', 'handle', 'id', 'kind', 'name', 'retired', 'role', 'startedBy', 'visitor']
    for (const one of roster.people) expect(fields(one)).toEqual(PERSON_FIELDS)
    for (const one of roster.agents) expect(fields(one)).toEqual(AGENT_FIELDS)
    const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.map((key) => [key, row[key]]))
    expect(roster.people).toEqual(people.people.map((one) => pick(one, PERSON_FIELDS)))
    expect(roster.agents).toEqual(people.agents.map((one) => pick(one, AGENT_FIELDS)))
    // AND THE SEED HOLDS WHAT THE COMPARISON IS FOR: a visitor, a retired agent, an agent started by another, and every role.
    expect(roster.agents.find((one) => one['id'] === 'many-visitor')).toMatchObject({ visitor: true })
    expect(roster.agents.find((one) => one['id'] === 'many-retired')).toMatchObject({ retired: true })
    expect(roster.agents.find((one) => one['id'] === 'many-agent-000')).toMatchObject({ startedBy: { kind: 'agent', id: 'many-supervisor' } })
    expect([...new Set(roster.agents.map((one) => one['role']))]).toEqual(expect.arrayContaining(['secretary', 'supervisor', 'worker']))
  })

  it('reads the two registries once each and nothing else of any agent: no presence, hold, runtime or record', async () => {
    const statements = await statementsRunDuring(() => view('roster'))
    const ofTheRegistries = statements.filter((one) => /\bFROM\s+"?(people|agents)"?(\s|$)/i.test(one.sql))
    expect(ofTheRegistries.map((one) => one.sql.replace(/\s+/g, ' ')), 'the statements that read the registries').toHaveLength(2)
    const agentFacts = statements.filter((one) => /handle_holds|agent_records|resident_sleeps|resident_since|session_resources|work_claims|\bFROM\s+"?records"?/i.test(one.sql))
    expect(agentFacts.map((one) => one.sql.slice(0, 200)), 'statements that read a hold, a runtime, a resident mark, a process row, a claim or a record').toEqual([])
  })
})

describe('3. the list form', () => {
  it('answers on the people view the whole view’s people and the agents named, in the whole view’s order, and names the ids no agent has', async () => {
    const whole = (await view('people')) as unknown as PeopleView
    const cases: { asked: string[]; named: string[]; notAgents: string[] }[] = [
      { asked: ['many-agent-001'], named: ['many-agent-001'], notAgents: [] },
      // REPEATS ARE COUNTED ONCE, the order asked is not the order answered, and an id nobody has is named back.
      {
        asked: ['many-visitor', 'many-retired', 'no-such-agent', 'many-terminal', 'many-visitor', 'many-secretary', 'another-nobody'],
        named: ['many-secretary', 'many-terminal', 'many-visitor', 'many-retired'],
        notAgents: ['no-such-agent', 'another-nobody'],
      },
      { asked: whole.agents.map((one) => one.id).reverse(), named: whole.agents.map((one) => one.id), notAgents: [] },
    ]
    for (const one of cases) {
      const listed = (await view('people', `?agents=${one.asked.join(',')}`)) as unknown as PeopleView
      const named = new Set(one.named)
      expect(listed, one.asked.join(',')).toEqual({ ...whole, agents: whole.agents.filter((agent) => named.has(agent.id)), notAgents: one.notAgents })
      expect(listed.agents.map((agent) => agent.id).sort()).toEqual([...one.named].sort())
    }
  })

  it('answers on the work view the whole view’s rows of the agents named, in its order, and names the ids no agent has', async () => {
    const whole = (await view('work')) as unknown as WorkView
    const cases: { asked: string[]; notAgents: string[] }[] = [
      { asked: ['many-agent-002'], notAgents: [] },
      { asked: ['many-runner', 'no-such-agent', 'many-supervisor', 'many-agent-003', 'many-runner'], notAgents: ['no-such-agent'] },
      // AN AGENT WITH NO WORK IS ANSWERED WITH NO ROW, and is not among the ids no agent has.
      { asked: ['many-visitor'], notAgents: [] },
    ]
    for (const one of cases) {
      const listed = (await view('work', `?agents=${one.asked.join(',')}`)) as unknown as WorkView
      const asked = new Set(one.asked)
      expect(listed, one.asked.join(',')).toEqual({ ...whole, work: whole.work.filter((row) => asked.has(row.agent)), notAgents: one.notAgents })
    }
    expect(whole.work.filter((row) => row.agent === 'many-agent-002').length, 'the agent asked alone has work').toBeGreaterThan(0)
  })

  it('refuses a malformed id and more than 500, saying which and how many, and takes 500', async () => {
    for (const name of ['people', 'work']) {
      for (const bad of ['many agent', 'many/agent', 'x'.repeat(65), 'many-agent-000,,many-agent-001']) {
        const refused = await reply(`/api/plugin-read/v1/${name}?agents=${encodeURIComponent(bad)}`)
        expect(refused.status, `${name} ?agents=${bad}`).toBe(400)
        const said = (JSON.parse(refused.body) as { error: string }).error
        const theBadOne = bad.includes(',') ? '' : bad
        expect(said, `${name} names the id it could not read`).toContain(`"${theBadOne}"`)
      }
      const ids = Array.from({ length: 501 }, (_, n) => `asked-${String(n)}`)
      const tooMany = await reply(`/api/plugin-read/v1/${name}?agents=${ids.join(',')}`)
      expect(tooMany.status).toBe(400)
      expect((JSON.parse(tooMany.body) as { error: string }).error).toMatch(/\b501\b[^]*\b500\b/)
      // 501 NAMED WITH ONE OF THEM TWICE IS 500 AGENTS, and is answered.
      const fiveHundred = (await view(name, `?agents=${[...ids.slice(0, 500), ids[0]!].join(',')}`)) as { notAgents: string[] }
      expect(fiveHundred.notAgents).toEqual(ids.slice(0, 500))
      // EVERY OTHER KEY IS STILL REFUSED.
      expect((await reply(`/api/plugin-read/v1/${name}?agent=many-agent-000`)).status).toBe(400)
    }
  })

  it('answers agents= with nothing after it with no agent, and reads no agent to do it', async () => {
    const whole = (await view('people')) as unknown as PeopleView
    const people = await statementsRunDuring(async () => {
      expect(await view('people', '?agents=')).toEqual({ ...whole, agents: [], notAgents: [] })
    })
    const work = await statementsRunDuring(async () => {
      expect(await view('work', '?agents=')).toEqual({ interface: 'office-read/1', view: 'work', work: [], notAgents: [], narrowedByPermission: whole.narrowedByPermission })
    })
    const ofAnAgent = (one: { sql: string }) => /\bFROM\s+"?(agents|agent_records|handle_holds|session_resources|work_claims|resident_sleeps|records)"?(\s|$)/i.test(one.sql)
    expect(people.filter(ofAnAgent).map((one) => one.sql.slice(0, 200)), 'what the empty list read on the people view').toEqual([])
    expect(work.filter(ofAnAgent).map((one) => one.sql.slice(0, 200)), 'what the empty list read on the work view').toEqual([])
  })

  it('puts no length on the agents value in the slot’s parse, and keeps every other value to 200', () => {
    const asking = (query: Record<string, string>) => pluginAsksTheSlot.safeParse({ interface: 'office-read/1', ask: 'read', id: 'one', view: 'people', query }).success
    expect(asking({ agents: Array.from({ length: 500 }, () => 'a'.repeat(64)).join(',') })).toBe(true)
    expect(asking({ agents: 'a'.repeat(40_000) })).toBe(true)
    expect(asking({ after: 'a'.repeat(200) })).toBe(true)
    expect(asking({ after: 'a'.repeat(201) })).toBe(false)
  })
})

describe('4. the counts', () => {
  const doors = {
    people: '/api/plugin-read/v1/people',
    work: '/api/plugin-read/v1/work',
    resources: '/api/resources',
    roster: '/api/plugin-read/v1/roster',
    'people, empty list': '/api/plugin-read/v1/people?agents=',
    'work, empty list': '/api/plugin-read/v1/work?agents=',
  } as const
  const smaller = new Map<string, Map<string, number>>()
  const larger = new Map<string, Map<string, number>>()
  let workStatements: { sql: string; values: string }[] = []

  beforeAll(async () => {
    // ONCE EACH TO PREPARE AND KEEP WHAT IS KEPT, so both counts below are made alike.
    for (const url of Object.values(doors)) await ask(url)
    for (const [name, url] of Object.entries(doors)) smaller.set(name, howOften(await statementsRunDuring(() => ask(url))))
    seedGroups(GROUPS)
    for (const [name, url] of Object.entries(doors)) {
      const statements = await statementsRunDuring(() => ask(url))
      if (name === 'work') workStatements = statements
      larger.set(name, howOften(statements))
    }
    // THE COUNTS MEAN SOMETHING ONLY IF THE LARGER OFFICE DREW THE AGENTS ADDED, with their waits and their processes.
    const people = (await view('people')) as unknown as PeopleView
    expect(people.agents.filter((one) => one.id.startsWith('many-agent-')).length).toBe(2 * GROUPS)
    const work = (await view('work')) as unknown as WorkView
    expect(new Set(work.work.filter((row) => row.agent.startsWith('many-agent-')).map((row) => row.agent)).size).toBe(2 * GROUPS)
    expect(((await ask('/api/resources')) as { resources: unknown[] }).resources.length).toBe(2 * GROUPS + 1)
  })

  for (const name of Object.keys(doors)) {
    it(`${name}: not one statement runs more often for twice the agents, waits and process rows`, () => {
      expect(grown(smaller.get(name)!, larger.get(name)!), `the statements of ${name} that ran more often`).toEqual([])
    })
  }

  it('the work view reads no resident mark and no agent’s row by its id, in one statement or in many', () => {
    const resident = workStatements.filter((one) => /resident_since|resident_sleeps/.test(one.sql))
    const oneRow = workStatements.filter((one) => /^\s*SELECT \* FROM agents WHERE id = \?\s*$/.test(one.sql))
    expect(resident.map((one) => one.sql.slice(0, 200)), 'resident marks the work view read').toEqual([])
    expect(oneRow.length, 'agent rows the work view read one at a time').toBe(0)
  })
})
