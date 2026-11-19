// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLUGIN'S PEOPLE AND WORK VIEWS, ASKED FOR A LIST OF AGENTS (?agents=), READ ONLY WHAT COULD BE THOSE AGENTS' OWN
 * (wave 13y round 51).
 *
 * MEASURED FIRST, on the made-up offices of round 50's report, at the commit before this round's change: a list of one
 * agent cost 60 ms of the people view and 36 ms of the work view on an office of 5,000 agents, and 170 ms and 139 ms
 * on the made-up office of 4,999. A list was the whole view read and then filtered, so it read every agent's runs, holds,
 * claims and records to answer for one.
 *
 * WHAT THIS FILE PROVES, on an office written straight into a fresh test database by SQL, as in
 * tests/the-plugin-views-read-many-agents-at-once.test.ts. Every row it writes is invented for the test. The office holds
 * the facts that belong to one agent but are found from another: a claim one agent holds on another agent's run, the
 * tasks a claim names, a check on another agent's run that names a run still in flight, a supervisor started by a
 * supervisor, retired agents that bear the handle of a live one, a run naming its agent by a padded id, a run naming its
 * agent only by `ranAs`, and a run naming a handle two agents bear.
 * 2. A LIST ANSWERS WHAT THE WHOLE VIEW ANSWERS for the agents it names: every agent alone, lists of several, and the
 *    whole roster backwards, on both views. The office read under the views says who each of them is as the whole
 *    reading does, though the views say of an agent's zone only whether it is a visitor.
 * 3. THE COUNTS. For a list of one and a list of several, on both views, when the agents double (with their waits, holds,
 *    claims, tasks, checks and process rows), no statement runs more often and no statement hands back more rows, except
 *    the reads this file names as whole, each with why. Those still run no more often.
 * 4. THE ROSTER ORDER. Agents bearing one handle come in the order they were written into the registry, in the whole
 *    view, in a list and in the roster. The order is written down as `handle, rowid`; it was already the order given.
 * 5. THE SESSION READ OF A LIST (wave 13y round 67). It asks whether a run could be one of the agents named only of the
 *    runs its fallback bucket finds, and it is prepared once and kept. MEASURED FIRST, on round 67's made-up office of
 *    the live shape: the people view of 20 agents of one starter took 57 ms, and most of it went on that read. The
 *    check walked `ranAs` in every candidate row, though a row found by one of the other three buckets already names one
 *    of the agents, and the statement was built and prepared again on every call.
 *
 * The statements are counted where SQLite runs them, as tests/the-plugin-views-read-many-agents-at-once.test.ts counts
 * them, and not through a mock. The rows counted are the rows SQLite hands back, not the rows it reads to find them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Actor } from '../src/server/lib/records.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { generateCWholeAppearance } from '../src/shared/pixel-office.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const TEMPLATE = 'list-seed-template'
// ONE INSTANT FOR THE WHOLE FILE, so a wait, a hold and "minutes since" read the same on every run of it.
const NOW = new Date(2026, 9, 20, 9, 0, 0)
/** How many agents of the kind that grows the office starts with. The counts double it. */
const GROUPS = 6
/** The agents bearing the handle `list-shared`, in the order they are written into the registry. */
const SHARED = ['list-shared-old-z', 'list-shared-live', 'list-shared-old-a']

type Row = Record<string, unknown>

/** THIS PROCESS, as the machine reads it: the runs in flight below are its own process, so the machine reads them alive. */
let live: { pid: number; pgid: number; command: string; startedAt: string }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { osProbe } = await import('../src/server/lib/resources.ts')
  const read = osProbe().processById(process.pid)
  if (read === null) throw new Error('this test process could not be read, so the runs in flight would prove nothing')
  live = read
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

/** A session record, written and last changed at `at` seconds from NOW. */
function aRun(id: string, at: number, title: string, data: Row): void {
  insertRecord().run(id, stamp(at), stamp(at), 'session', title, JSON.stringify(data))
}

/** One agent row copied from the template's, with `own` written over it, and an agent record naming its runtime. */
function addAgent(id: string, own: Row, runtime: string, at: number): void {
  const sqlite = t.client.sqlite
  const template = sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(TEMPLATE) as Row
  const columns = Object.keys(template)
  const row: Row = {
    id, handle: id, name: `Invented ${id}`, retired: 0, created_at: stamp(at), role: 'worker',
    pixel_appearance: JSON.stringify(generateCWholeAppearance('list-seed', 'registration')),
    pixel_scale: JSON.stringify(generatePixelScale('list-seed', 'worker')),
    resident_since: null, credential: null, ...own,
  }
  sqlite.prepare(`INSERT INTO agents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => (c in row ? row[c] : template[c])))
  insertRecord().run(`${id}-record`, stamp(at), stamp(at), 'agent', id, JSON.stringify({ handle: id, runtime }))
  sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`${id}-record`, id)
}

/** A run the message worker started, carrying a conversation, and waiting until `until` seconds from NOW. `serving` names its agent. */
function aMessageRun(run: string, serving: Row, until: number, at: number): void {
  aRun(run, at, `Waiting run ${run}`, {
    state: 'finished', ...serving, runtime: 'claude-code', providerSession: `${run}-conversation`,
    deliveringMessage: `${run}-message`, waitsUntil: stamp(until), lastOutputAt: stamp(at), startedByMoleOffice: true,
  })
}

/** A hold on `id`'s handle by `session`, last heard `heard` seconds from NOW. */
function aHold(id: string, session: string, heard: number): void {
  t.client.sqlite
    .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
    .run(`${id}-hold`, id, session, 'list-machine', 'claude-code', stamp(-7_200), stamp(heard))
}

/**
 * A PROCESS ROW OF `session`, with a pid no machine can have: Linux numbers pids up to 4,194,304 at most, so the row is
 * read as gone on any machine this runs on, and nothing is signalled.
 */
function aGoneProcessRow(id: string, session: string, pid: number, registeredBy: string): void {
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, detail, registered_at, registered_by) VALUES (?, 'default', ?, 'process', ?, ?, ?, ?, ?)")
    .run(id, session, String(pid), pid, `Invented process ${String(pid)} for this test`, stamp(-3_000), registeredBy)
}

/**
 * THE RUN'S OWN PROCESS, AS THE OFFICE WRITES IT FOR A RUN IT STARTED: this test's own process, with the start time the
 * machine reads for it, so the run is in flight. Nothing reads it but the presence and the work readers, and they signal
 * nothing.
 */
function itsOwnLiveProcess(id: string, session: string): void {
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, started_by_the_product) VALUES (?, 'default', ?, 'process', ?, ?, ?, ?, ?, 'agent:list-message-worker', 1)")
    .run(id, session, String(live.pid), live.pgid, live.startedAt, `Invented: the run ${session} is this test's own process`, stamp(-3_000))
}

/** A live claim by `claimant` on the run `run`, naming the records `things`. */
function aClaim(id: string, claimant: string, run: string, things: string[]): void {
  t.client.sqlite
    .prepare("INSERT INTO work_claims (id, workspace_id, claimant_kind, claimant_id, run, things, opened_at, renewed_at, released_at, released_because) VALUES (?, 'default', 'agent', ?, ?, ?, ?, NULL, NULL, NULL)")
    .run(id, claimant, run, JSON.stringify(things.map((one) => ({ what: 'record', id: one }))), stamp(-2_500))
}

/**
 * THE AGENTS EVERY SIZE OF THE OFFICE HAS. Each is there for one way a fact of one agent is found, and the comment above
 * it says which.
 */
function seedTheFixedAgents(): void {
  const sqlite = t.client.sqlite
  sqlite.transaction(() => {
    addAgent('list-secretary', { role: 'secretary' }, 'claude-code', -80_000)
    aMessageRun('list-secretary-run', { servingAgent: 'list-secretary', servingAgentId: 'list-secretary' }, -300, -900)
    // A SUPERVISOR STARTED BY A SUPERVISOR: the first is drawn among the leadership, which is read from the second's row.
    // The first has a run in flight: a run the message worker started, carrying a message, whose own process is running.
    addAgent('list-boss', { role: 'supervisor' }, 'codex', -79_999)
    aRun('list-boss-run', -3_600, 'Run of list-boss', { state: 'running', servingAgent: 'list-boss', servingAgentId: 'list-boss', runtime: 'codex', startedByMoleOffice: true, providerSession: 'list-boss-conversation', deliveringMessage: 'list-boss-message' })
    itsOwnLiveProcess('list-boss-process', 'list-boss-run')
    addAgent('list-lead', { role: 'supervisor', started_by_kind: 'agent', started_by_id: 'list-boss' }, 'codex', -79_998)
    aMessageRun('list-lead-run', { servingAgent: 'list-lead', servingAgentId: 'list-lead' }, 1_200, -800)
    addAgent('list-resident', { resident_since: stamp(-40_000) }, 'claude-code', -79_997)
    sqlite.prepare("INSERT INTO resident_sleeps (id, agent_id, what, began_at, ended_at, by_kind, by_id) VALUES ('list-sleep', 'list-resident', 'slept', ?, ?, 'agent', 'list-resident')").run(stamp(-30_000), stamp(-20_000))
    addAgent('list-terminal', {}, 'claude-code', -79_996)
    aRun('list-terminal-session', -7_200, 'Terminal of list-terminal', { state: 'running', servingAgentId: 'list-terminal', runtime: 'claude-code' })
    aHold('list-terminal', 'list-terminal-session', -60)
    // A RUN IN FLIGHT, HELD, WHICH ANOTHER AGENT'S RUN IS CHECKING: the check is on list-claimer's run.
    addAgent('list-runner', {}, 'codex', -79_995)
    aRun('list-runner-run', -7_200, 'Run of list-runner', { state: 'running', servingAgent: 'list-runner', servingAgentId: 'list-runner', runtime: 'codex', startedByMoleOffice: true, providerSession: 'list-runner-conversation', deliveringMessage: 'list-runner-message' })
    itsOwnLiveProcess('list-runner-process', 'list-runner-run')
    aHold('list-runner', 'list-runner-run', -30)
    addAgent('list-lapsed', {}, 'claude-code', -79_994)
    aRun('list-lapsed-session', -300_000, 'Terminal of list-lapsed', { state: 'running', servingAgentId: 'list-lapsed', runtime: 'claude-code' })
    aHold('list-lapsed', 'list-lapsed-session', -250_000)
    addAgent('list-visitor', { credential: 'list-credential' }, 'codex', -79_993)
    // THREE AGENTS BEARING ONE HANDLE, two of them retired, written in an order that is not the order of their ids. A run
    // of the first is still in its wait. A run naming only the handle names nobody, because two agents bear it, and a run
    // naming the live one by its id in `servingAgent` is the live one's.
    addAgent('list-shared-old-z', { handle: 'list-shared', retired: 1, retired_at: stamp(-60_000) }, 'claude-code', -79_992)
    aMessageRun('list-shared-old-z-run', { servingAgentId: 'list-shared-old-z' }, 1_200, -780)
    addAgent('list-shared-live', { handle: 'list-shared' }, 'claude-code', -79_991)
    aMessageRun('list-shared-live-run', { servingAgent: 'list-shared-live' }, 1_200, -770)
    addAgent('list-shared-old-a', { handle: 'list-shared', retired: 1, retired_at: stamp(-55_000) }, 'codex', -79_990)
    aMessageRun('list-shared-bare-run', { servingAgent: 'list-shared' }, 1_200, -760)
    // A RUN NAMING ITS AGENT BY A PADDED ID, which the office reads as the id without the spaces.
    addAgent('list-padded', {}, 'claude-code', -79_989)
    aMessageRun('list-padded-run', { servingAgentId: ' list-padded ' }, 1_200, -750)
    // A RUN WHOSE `servingAgentId` IS A NUMBER, which names nobody, so its `servingAgent` decides.
    addAgent('list-numbered', {}, 'codex', -79_988)
    aMessageRun('list-numbered-run', { servingAgentId: 7, servingAgent: 'list-numbered' }, 1_200, -740)
    // A RUN BOUND TO ITS AGENT ONLY BY `ranAs`, and claimed by another agent, so it is the first agent's work by the claim.
    addAgent('list-bound', {}, 'claude-code', -79_987)
    aRun('list-bound-run', -2_600, 'Run bound to list-bound', { state: 'running', ranAs: [{ workspaceId: 'default', agentId: 'list-bound-record' }], runtime: 'claude-code' })
    // THE CLAIMER: its claim is on list-bound's run and names a task and a block, and a run of its own checks list-runner's run.
    addAgent('list-claimer', {}, 'codex', -79_986)
    insertRecord().run('list-task', stamp(-5_000), stamp(-4_000), 'task', 'A task list-claimer claims', JSON.stringify({ state: 'doing' }))
    insertRecord().run('list-block', stamp(-5_000), stamp(-3_900), 'block', 'A block list-claimer claims', JSON.stringify({ state: 'todo' }))
    insertRecord().run('list-unclaimed-task', stamp(-5_000), stamp(-3_800), 'task', 'A task nobody claims', JSON.stringify({ state: 'doing' }))
    aClaim('list-claim', 'list-claimer', 'list-bound-run', ['list-task', 'list-block'])
    aRun('list-claimer-checks', -1_000, 'The check of a run, by list-claimer', {
      state: 'finished', servingAgent: 'list-claimer', servingAgentId: 'list-claimer', runtime: 'codex',
      theCheck: { execution: { session: 'list-runner-run' } },
    })
    addAgent('list-retired', { retired: 1, retired_at: stamp(-50_000) }, 'claude-code', -79_985)
    aRun('list-finished-run', -6_000, 'A finished run of list-lead', { state: 'finished', servingAgent: 'list-lead', servingAgentId: 'list-lead', runtime: 'codex' })
    aGoneProcessRow('list-finished-process', 'list-finished-run', 4_194_390, 'agent:list-lead')
    // ONE MOMENT OF REGISTRATION for the agents the door and the migrations wrote on the real clock, and for what the door
    // wrote then, so a digest does not move with the clock.
    sqlite.prepare("UPDATE agents SET created_at = ? WHERE id NOT LIKE 'list-%'").run(stamp(-86_000))
    sqlite.prepare("UPDATE records SET created_at = ?, updated_at = ? WHERE id NOT LIKE 'list-%'").run(stamp(-86_000), stamp(-86_000))
    sqlite.prepare("UPDATE agents SET pixel_appearance = ?, pixel_scale = ? WHERE id NOT LIKE 'list-%'")
      .run(JSON.stringify(generateCWholeAppearance('list-seed', 'registration')), JSON.stringify(generatePixelScale('list-seed', 'worker')))
    // THE TEMPLATE IS RETIRED, because the forest seats agents in the order of their ids and the template's is drawn at random.
    sqlite.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE handle = ?').run(stamp(-85_000), TEMPLATE)
  })()
}

let groupsSeeded = 0
/**
 * `count` MORE AGENTS OF THE KIND THAT GROWS: each a worker list-lead started, with a run inside its wait, a running run
 * with a process row that is gone, a run bound to it by `ranAs` alone, a hold, a live claim on a run of its own naming a
 * task of its own, and a run of its own whose check names its running run.
 */
function seedGroups(count: number): void {
  t.client.sqlite.transaction(() => {
    for (let n = groupsSeeded; n < groupsSeeded + count; n++) {
      const id = `list-agent-${String(n).padStart(3, '0')}`
      addAgent(id, { started_by_kind: 'agent', started_by_id: 'list-lead' }, n % 2 === 0 ? 'claude-code' : 'codex', -70_000 + n)
      aMessageRun(`${id}-waiting`, { servingAgent: id, servingAgentId: id }, 1_200, -700 - n)
      aRun(`${id}-running`, -3_000, `Running run of ${id}`, { state: 'running', servingAgent: id, servingAgentId: id, runtime: 'claude-code' })
      aGoneProcessRow(`${id}-process`, `${id}-running`, 4_194_400 + n, `agent:${id}`)
      aRun(`${id}-bound`, -2_000, `Run bound to ${id}`, { state: 'finished', ranAs: [{ workspaceId: 'default', agentId: `${id}-record` }], runtime: 'claude-code' })
      aHold(id, `${id}-running`, -45)
      aRun(`${id}-claiming`, -2_400, `Claiming run of ${id}`, { state: 'running', servingAgent: id, servingAgentId: id, runtime: 'claude-code' })
      insertRecord().run(`${id}-task`, stamp(-5_000), stamp(-4_000 + n), 'task', `A task ${id} claims`, JSON.stringify({ state: 'doing' }))
      aClaim(`${id}-claim`, id, `${id}-claiming`, [`${id}-task`])
      aRun(`${id}-checks`, -1_500, `The check of a run, by ${id}`, {
        state: 'finished', servingAgent: id, servingAgentId: id, runtime: 'claude-code', theCheck: { execution: { session: `${id}-running` } },
      })
    }
  })()
  groupsSeeded += count
}

/**
 * EVERY STATEMENT RUN while `act` ran: its SQL and how many rows it handed back. A statement is seen each time it is run,
 * not each time it is prepared, because most of them are prepared once and kept.
 */
async function statementsRunDuring(act: () => Promise<unknown>): Promise<{ sql: string; rows: number }[]> {
  type Run = (this: { source: string }, ...args: unknown[]) => unknown
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', Run>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate }
  const seen: { sql: string; rows: number }[] = []
  proto.all = function (...args) {
    const rows = originals.all.apply(this, args) as unknown[]
    seen.push({ sql: this.source, rows: rows.length })
    return rows
  }
  proto.get = function (...args) {
    const row = originals.get.apply(this, args)
    seen.push({ sql: this.source, rows: row === undefined ? 0 : 1 })
    return row
  }
  proto.iterate = function* (this: { source: string }, ...args: unknown[]) {
    const one = { sql: this.source, rows: 0 }
    seen.push(one)
    for (const row of originals.iterate.apply(this, args) as Iterable<unknown>) {
      one.rows++
      yield row
    }
  } as Run
  try {
    await act()
  } finally {
    Object.assign(proto, originals)
  }
  return seen
}

/** How often each statement ran and the rows it handed back, its list of `?` written as one. */
function howOften(statements: readonly { sql: string; rows: number }[]): Map<string, { runs: number; rows: number }> {
  const out = new Map<string, { runs: number; rows: number }>()
  for (const one of statements) {
    const sql = one.sql.replace(/\?(\s*,\s*\?)+/g, '?…').replace(/\s+/g, ' ').trim()
    const held = out.get(sql) ?? { runs: 0, rows: 0 }
    out.set(sql, { runs: held.runs + 1, rows: held.rows + one.rows })
  }
  return out
}

type Counts = Map<string, { runs: number; rows: number }>

/** Every statement that ran more often, or handed back more rows, in `larger` than in `smaller`, with both counts. */
function grown(smaller: Counts, larger: Counts, of: 'runs' | 'rows'): string[] {
  return [...larger]
    .filter(([sql, n]) => n[of] > (smaller.get(sql)?.[of] ?? 0))
    .map(([sql, n]) => `${String(smaller.get(sql)?.[of] ?? 0)} -> ${String(n[of])} ${of}: ${sql.slice(0, 260)}`)
}

/**
 * THE READS A LIST STILL MAKES WHOLE, and why each is not narrowed to the agents named. Each still runs no more often for
 * more agents; only its rows grow.
 */
const WHOLE_READS: { what: string; why: string; sql: RegExp }[] = [
  {
    what: 'the process rows nobody released, with their session records joined',
    why:
      'An agent owns a process row when the row was registered under its id or handle, or when the run it belongs to ' +
      'serves the agent, and the second can be known only from the session record joined to each row. It is one ' +
      'statement for the whole reading, and the rows are the processes the ledger holds open, not the agents.',
    // The line is cut at 260 characters, before its FROM; this beginning is the one statement's alone.
    sql: /^\d+ -> \d+ rows: SELECT r\.id AS id, r\.registered_by AS registeredBy, s\.data AS data, CASE WHEN s\.kind = 'session' AND json_valid\(s\.data\) THEN 1 ELSE 0 END AS isRun, /,
  },
  {
    what: "the machine's process rows of a project",
    why:
      'Whether a process is alive is asked of the machine for every process row of the project at once (`listResources`), ' +
      'and only when an agent has a process row of its own; a row is not looked at agent by agent.',
    sql: /^\d+ -> \d+ rows: SELECT \* FROM session_resources WHERE workspace_id = \? AND type = \? AND released_at IS NULL ORDER BY registered_at DESC, id DESC$/,
  },
  {
    what: 'the session records of those process rows',
    why: '`listResources` reads the session record of every row it reports, in one statement for every 500 rows.',
    sql: /^\d+ -> \d+ rows: select "id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at", "origin" from "records" where "records"\."id" in \(\?…\)$/,
  },
]

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




interface PeopleView { interface: string; view: string; people: Row[]; agents: (Row & { id: string; handle: string })[]; notAgents?: string[]; narrowedByPermission: unknown }
interface WorkView { interface: string; view: string; work: (Row & { id: string; agent: string })[]; notAgents?: string[]; narrowedByPermission: unknown }


describe('2. a list answers what the whole view answers for the agents it names', () => {
  const several = [
    ['list-bound', 'list-claimer'],
    ['list-runner', 'list-boss', 'list-lead', 'no-such-agent'],
    ['list-shared-old-a', 'list-shared-live', 'list-shared-old-z', 'list-padded', 'list-numbered'],
    ['list-resident', 'list-visitor', 'list-retired', 'list-secretary', 'list-terminal', 'list-lapsed', 'list-agent-002'],
  ]

  it('on the people view: every agent alone, lists of several, and the whole roster backwards', async () => {
    const whole = (await view('people')) as unknown as PeopleView
    const lists = [...whole.agents.map((one) => [one.id]), ...several, whole.agents.map((one) => one.id).reverse()]
    for (const asked of lists) {
      const listed = (await view('people', `?agents=${asked.join(',')}`)) as unknown as PeopleView
      const named = new Set(asked)
      const known = new Set(whole.agents.map((one) => one.id))
      expect(listed, asked.join(',')).toEqual({ ...whole, agents: whole.agents.filter((agent) => named.has(agent.id)), notAgents: asked.filter((id) => !known.has(id)) })
    }
  })

  it('on the work view: every agent alone, lists of several, and the whole roster backwards', async () => {
    const whole = (await view('work')) as unknown as WorkView
    const roster = ((await view('people')) as unknown as PeopleView).agents.map((one) => one.id)
    const lists = [...roster.map((one) => [one]), ...several, [...roster].reverse()]
    for (const asked of lists) {
      const listed = (await view('work', `?agents=${asked.join(',')}`)) as unknown as WorkView
      const named = new Set(asked)
      expect(listed, asked.join(',')).toEqual({ ...whole, work: whole.work.filter((row) => named.has(row.agent)), notAgents: asked.filter((id) => !roster.includes(id)) })
    }
  })

  it('in the office read under the views: each agent named is who the whole reading says it is', async () => {
    // THE VIEWS SAY OF AN AGENT'S ZONE ONLY WHETHER IT IS A VISITOR, so a list that drew list-boss in the team, having read
    // none of the agents it started, would pass the two cases above.
    const { readTheOffice } = await import('../src/server/lib/pixel-office.ts')
    const actor: Actor = { type: 'human', id: THE_PERSON }
    const whole = readTheOffice('default', actor, 'office')
    const who = new Map(whole.agents().map((agent) => [agent.id, whole.whoOf(agent)]))
    expect(who.get('list-boss')?.zone, 'a supervisor that started a supervisor, in the whole reading').toBe('leadership')
    const roster = [...who.keys()]
    for (const asked of [...roster.map((one) => [one]), ...several, [...roster].reverse()]) {
      const listed = readTheOffice('default', actor, 'office', asked)
      const named = new Set(asked)
      expect(listed.agents().filter((agent) => named.has(agent.id)).map((agent) => listed.whoOf(agent)), asked.join(',')).toEqual(roster.filter((one) => named.has(one)).map((one) => who.get(one)))
    }
  })
})

describe('3. the counts', () => {
  const lists = {
    'one agent with a run in flight, a hold and a check on its run': ['list-runner'],
    'one agent of those that grow': ['list-agent-001'],
    'several agents whose facts are found from others': ['list-boss', 'list-bound', 'list-claimer', 'list-padded', 'list-shared-live', 'list-resident'],
  } as const
  const doors = Object.entries(lists).flatMap(([name, ids]) => [
    { name: `people, ${name}`, url: `/api/plugin-read/v1/people?agents=${ids.join(',')}` },
    { name: `work, ${name}`, url: `/api/plugin-read/v1/work?agents=${ids.join(',')}` },
  ])
  const smaller = new Map<string, Counts>()
  const larger = new Map<string, Counts>()
  const answers = new Map<string, string>()

  beforeAll(async () => {
    // ONCE EACH TO PREPARE AND KEEP WHAT IS KEPT, so both counts below are made alike.
    for (const { url } of doors) await ask(url)
    for (const { name, url } of doors) {
      let answer = ''
      smaller.set(name, howOften(await statementsRunDuring(async () => (answer = JSON.stringify(await ask(url))))))
      answers.set(name, answer)
    }
    seedGroups(GROUPS)
    for (const { name, url } of doors) larger.set(name, howOften(await statementsRunDuring(() => ask(url))))
    // THE COUNTS MEAN SOMETHING ONLY IF THE LARGER OFFICE DREW THE AGENTS ADDED, with their work.
    const work = (await view('work')) as unknown as WorkView
    expect(new Set(work.work.filter((row) => row.agent.startsWith('list-agent-')).map((row) => row.agent)).size).toBe(2 * GROUPS)
  })

  for (const { name } of doors) {
    it(`${name}: not one statement runs more often for twice the agents`, () => {
      expect(grown(smaller.get(name)!, larger.get(name)!, 'runs'), `the statements of ${name} that ran more often`).toEqual([])
    })
    it(`${name}: not one statement hands back more rows for twice the agents, but the reads named as whole`, () => {
      const more = grown(smaller.get(name)!, larger.get(name)!, 'rows').filter((one) => !WHOLE_READS.some((read) => read.sql.test(one)))
      expect(more, `the statements of ${name} that handed back more rows`).toEqual([])
    })
  }

  it('the lists drew work and presence, so the counts are of a reading that did something', () => {
    expect(answers.get('work, one agent with a run in flight, a hold and a check on its run')).toContain('"checking"')
    expect(answers.get('work, one agent of those that grow')).toContain('list-agent-001-task')
    expect(answers.get('people, one agent of those that grow')).toContain('"presence":[{')
  })
})

describe('4. the roster order', () => {
  it('puts the agents bearing one handle in the order they were written into the registry, whole, in a list and in the roster', async () => {
    const shared = (agents: readonly { id: string; handle: string }[]) => agents.filter((one) => one.handle === 'list-shared').map((one) => one.id)
    const whole = (await view('people')) as unknown as PeopleView
    expect(shared(whole.agents), 'the whole people view').toEqual(SHARED)
    const listed = (await view('people', `?agents=${[...SHARED].sort().join(',')}`)) as unknown as PeopleView
    expect(shared(listed.agents), 'a list naming them in the order of their ids').toEqual(SHARED)
    const roster = (await view('roster')) as unknown as PeopleView
    expect(shared(roster.agents), 'the roster').toEqual(SHARED)
    // NOT THE ORDER OF THEIR IDS, so a read that ordered by the id would fail here.
    expect([...SHARED].sort()).not.toEqual(SHARED)
  })
})

describe('5. the session read of a list', () => {
  /** THE STATEMENT THAT READS A LIST'S SESSION RECORDS, the one that names the fallback bucket's index. */
  const theSessionRead = (sql: string) => sql.includes('records_session_reference_fallback_idx')
  /** One reading of `url`: each time the session read ran, with its values, and each time its text was prepared. */
  async function theSessionReadDuring(url: string): Promise<{ ran: { sql: string; values: unknown[] }[]; prepared: number }> {
    type Run = (this: { source: string }, ...args: unknown[]) => unknown
    const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all', Run>
    const handle = t.client.sqlite as unknown as { prepare: (text: string) => unknown }
    const originals = { all: proto.all, prepare: handle.prepare }
    const ran: { sql: string; values: unknown[] }[] = []
    let prepared = 0
    proto.all = function (...args) {
      if (theSessionRead(this.source)) ran.push({ sql: this.source, values: args })
      return originals.all.apply(this, args)
    }
    handle.prepare = function (this: unknown, text: string) {
      if (theSessionRead(text)) prepared++
      return originals.prepare.call(this, text)
    }
    try {
      await ask(url)
    } finally {
      proto.all = originals.all
      handle.prepare = originals.prepare
    }
    return { ran, prepared }
  }

  it('asks whether a run could be one of the agents only of the runs found through the fallback bucket', async () => {
    const { ran } = await theSessionReadDuring('/api/plugin-read/v1/people?agents=list-agent-001,list-padded')
    expect(ran.length, 'the session read of the list did not run').toBeGreaterThan(0)
    type Line = { id: number; parent: number; detail: string }
    const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${ran[0]!.sql}`).all(...(ran[0]!.values as never[])) as Line[]
    const parentOf = new Map(plan.map((line) => [line.id, line.parent]))
    // THE ARM OF THE UNION THAT READS THE FALLBACK BUCKET: the line its search of that index hangs from.
    const fallback = plan.find((line) => line.detail.includes('USING INDEX records_session_reference_fallback_idx'))
    expect(fallback, plan.map((line) => line.detail).join('\n')).toBeDefined()
    expect(fallback!.parent, 'the fallback bucket is not an arm of the union').not.toBe(0)
    // EVERY WALK OF `ranAs`, and where it hangs: in that arm, or over every candidate the four buckets found.
    const where = plan.filter((line) => line.detail.startsWith('SCAN json_tree')).map((line) => {
      for (let at = line.parent; at !== 0; at = parentOf.get(at) ?? 0) if (at === fallback!.parent) return 'in the fallback bucket'
      return 'over every candidate'
    })
    expect(where, plan.map((line) => `${String(line.id)} ${String(line.parent)} ${line.detail}`).join('\n')).toEqual(['in the fallback bucket'])
  })

  it('is prepared once and kept, so a second list prepares it no more', async () => {
    // A FIRST LIST, so whatever is kept is kept before the second is counted.
    await ask('/api/plugin-read/v1/work?agents=list-agent-002')
    const second = await theSessionReadDuring('/api/plugin-read/v1/people?agents=list-agent-003,list-boss')
    expect(second.ran.length, 'the session read of the second list did not run').toBeGreaterThan(0)
    expect(second.prepared, 'the times the session read was prepared for the second list').toBe(0)
  })
})
