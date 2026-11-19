// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONLINE VIEW: WHETHER EACH AGENT IS ONLINE, AND NOTHING ELSE (wave 13y round 66). The Office Map asked for it, for
 * the decision that the map does not draw agents who are offline: the agent's id and an online yes or no, read
 * without the people view's slow presence path. Online, as the coordinator said it in round 66: the people view draws
 * the agent's dot green in at least one project, or draws it grey with the words "In a terminal". Every other agent,
 * and every retired one, is not online.
 *
 * WHAT THIS FILE PROVES, on an office written straight into a fresh test database by SQL, as in
 * tests/the-plugin-views-read-many-agents-at-once.test.ts. Every row it writes is invented for the test.
 * 1. THE SHAPE. GET /api/plugin-read/v1/online answers {interface, view, narrowedByPermission, agents: [{id, online}]},
 *    one row for every agent the roster carries, in the roster's order.
 * 2. THE ANSWER. For every agent, online is what the people view's dots say by that rule. The office has an agent
 *    for each way a dot turns green, one green in a second project only, one in a terminal, one in a terminal under a
 *    lapsed hold, one whose terminal run has ended (and the presence door, which reads every run of that one agent, does
 *    not call it in a terminal either), a retired one whose terminal run is still open, one whose hold has
 *    lapsed and one with nothing at all. Which of them are online is written out here as well, so the rule cannot be
 *    met by both views moving together.
 * 3. NOT THROUGH THE PEOPLE VIEW'S PRESENCE. The online view runs no statement the people view does not run, and it
 *    does not read the machine's process rows, which only the words beside a grey dot read. The people view is seen
 *    reading them on this office, so the statement looked for is still the one they are read with.
 * 4. THE COUNTS. For twice the agents of each kind that grows, one statement of the online view runs more often, and no
 *    other: the read of a run's own process row. The dot is green as "a run" for a run the office started only while
 *    that process is alive, so the dot asks it of each such run that is running, a terminal's run among them, and the
 *    people view asks it as often.
 * 5. THE SESSION ROWS THE DOT READS (round 66, on the cost of the dot). The dot reads the runs that have not ended
 *    and the runs the message worker filed, and nothing else of a project's runs. Every other run is asked only whether
 *    it ran as the agent, which the people view reads off its own read of every run. So for more runs that have ended
 *    and that the message worker did not file, the online view hands back none of them, and the people view hands back
 *    each once; a run the message worker filed is handed back once more by each. No statement of either view runs more
 *    often for twenty-four such runs of each kind than for twelve. The online view finds each session row it reads by its id or through the index of the runs that have not
 *    ended or the index of the message worker's runs, and not by walking every run of a project.
 * 6. THE WORDS THAT END A RUN. The index of the runs that have not ended keeps a row exactly when `theRunHasEnded`
 *    (src/server/lib/keys.ts) does not call its state ended, for every state word and for values that are not one.
 *
 * The statements are counted where SQLite runs them, as tests/the-plugin-views-read-many-agents-at-once.test.ts counts
 * them, and not through a mock.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { PRESENCE } from '../src/shared/lifecycle.ts'
import { generateCWholeAppearance } from '../src/shared/pixel-office.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { IN_A_TERMINAL_WORD } from '../src/shared/terminals.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const TEMPLATE = 'online-seed-template'
const SECOND = 'online-second-project'
// ONE INSTANT FOR THE WHOLE FILE, so a wait, a hold and "minutes since" read the same on every run of it.
const NOW = new Date(2026, 9, 23, 9, 0, 0)
/** How many agents of each kind that grows the office starts with. The counts double it. */
const GROUPS = 4
/** The folder of the one transcript this file writes, removed after it. */
const TRANSCRIPTS = mkdtempSync(join(tmpdir(), 'mole-office-online-'))

type Row = Record<string, unknown>
interface OnlineView { interface: string; view: string; narrowedByPermission: unknown; agents: { id: string; online: boolean }[] }
interface PeopleView { agents: { id: string; presence: { project: string; colour: string; word: string }[] }[] }

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
  rmSync(TRANSCRIPTS, { recursive: true, force: true })
})

/** A local wall-clock stamp, whole seconds, `n` seconds from NOW. */
function stamp(n: number): string {
  const at = new Date(NOW.getTime() + n * 1000)
  const two = (v: number) => String(v).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

/** A record filed in `project`, written straight into the file. */
function aRecord(project: string, id: string, at: number, kind: string, title: string, data: Row): void {
  t.client.sqlite
    .prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, ?, 'authored')`)
    .run(id, project, stamp(at), stamp(at), kind, title, JSON.stringify(data))
}

/** One agent row copied from the template's, with `own` written over it, and an agent record naming its runtime. */
function addAgent(id: string, own: Row, at: number): void {
  const sqlite = t.client.sqlite
  const template = sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(TEMPLATE) as Row
  const columns = Object.keys(template)
  const row: Row = {
    id, handle: id, name: `Invented ${id}`, retired: 0, created_at: stamp(at), role: 'worker',
    pixel_appearance: JSON.stringify(generateCWholeAppearance('online-seed', 'registration')),
    pixel_scale: JSON.stringify(generatePixelScale('online-seed', 'worker')),
    resident_since: null, credential: null, ...own,
  }
  sqlite.prepare(`INSERT INTO agents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => (c in row ? row[c] : template[c])))
  aRecord('default', `${id}-record`, at, 'agent', id, { handle: id, runtime: 'claude-code' })
  sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`${id}-record`, id)
}

/** A run of `id`'s that the message worker started, carrying a conversation, and waiting until `until` seconds from NOW. */
function aMessageRun(project: string, id: string, run: string, until: number, at: number): void {
  aRecord(project, run, at, 'session', `Waiting run of ${id}`, {
    state: 'finished', servingAgent: id, servingAgentId: id, runtime: 'claude-code', providerSession: `${run}-conversation`,
    deliveringMessage: `${run}-message`, waitsUntil: stamp(until), lastOutputAt: stamp(at), startedByMoleOffice: true,
  })
}

/** A run of `id`'s in one of the office's terminals, with the fields lib/terminal-agents.ts files it with, in `state`. */
function aTerminalRun(id: string, run: string, state: string, at: number): void {
  aRecord('default', run, at, 'session', `Terminal run of ${id}`, {
    state, runtime: 'claude-code', startedAt: stamp(at), doing: 'Invented work in a terminal', workingDirectory: '/made-up/folder',
    servingAgent: id, servingAgentId: id, startedByMoleOffice: true,
    extra: { openedBy: { type: 'human', id: THE_PERSON }, inATerminal: { terminal: `${run}-terminal`, holder: { pid: 4_194_380, startedAt: stamp(at) } } },
  })
}

/**
 * A TRANSCRIPT WHOSE LAST LINE WAS WRITTEN `at` SECONDS FROM NOW, as the discovery stamp a session record carries for it.
 * The session behind a hold answers only while its transcript grows (lib/answering.ts).
 */
function aTranscript(name: string, at: number): Row {
  const logPath = join(TRANSCRIPTS, `${name}.jsonl`)
  const line = { type: 'assistant', timestamp: new Date(NOW.getTime() + at * 1000).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Invented words of a session.' }] } }
  writeFileSync(logPath, `${JSON.stringify(line)}\n`)
  return { discovered: { tool: 'claude-code', externalId: `${name}-conversation`, logPath, resumeCommand: null, startedAt: null, entryPoint: null } }
}

/** A hold on `id`'s handle by `session`, last heard `heard` seconds from NOW. */
function aHold(id: string, session: string, heard: number): void {
  t.client.sqlite
    .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
    .run(`${id}-hold`, id, session, 'online-machine', 'claude-code', stamp(-7_200), stamp(heard))
}

/** WHICH OF THE FIXED AGENTS ARE ONLINE, by the rule above, written out. */
const ONLINE = ['online-runner', 'online-held', 'online-waiting', 'online-secretary', 'online-elsewhere', 'online-terminal', 'online-terminal-lapsed']
const NOT_ONLINE = ['online-terminal-ended', 'online-retired-terminal', 'online-lapsed', 'online-nothing']

/**
 * THE AGENTS EVERY SIZE OF THE OFFICE HAS: one for each way a dot turns green, one green in the second project only,
 * and the terminal cases, each beside the case it could be taken for.
 */
function seedTheFixedAgents(): void {
  const sqlite = t.client.sqlite
  sqlite.prepare('INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(SECOND, 'Invented second project', stamp(-90_000), stamp(-90_000))
  sqlite.transaction(() => {
    // GREEN: a run the office started, holding the handle.
    addAgent('online-runner', {}, -80_000)
    aRecord('default', 'online-runner-run', -30, 'session', 'Run of online-runner', { state: 'running', servingAgent: 'online-runner', servingAgentId: 'online-runner', runtime: 'claude-code', startedByMoleOffice: true })
    aHold('online-runner', 'online-runner-run', -30)
    // GREEN: a session holding the handle, heard a minute ago, whose transcript grew a minute ago.
    addAgent('online-held', {}, -79_999)
    aRecord('default', 'online-held-session', -60, 'session', 'Session of online-held', { state: 'running', servingAgentId: 'online-held', runtime: 'claude-code', extra: aTranscript('online-held', -60) })
    aHold('online-held', 'online-held-session', -60)
    // GREEN: a run inside its wait for the next message.
    addAgent('online-waiting', { role: 'supervisor' }, -79_998)
    aMessageRun('default', 'online-waiting', 'online-waiting-run', 1_200, -800)
    // GREEN: a secretary past its run's wait, whose own conversation a message picks up.
    addAgent('online-secretary', { role: 'secretary' }, -79_997)
    aMessageRun('default', 'online-secretary', 'online-secretary-run', -300, -900)
    // GREEN IN THE SECOND PROJECT ONLY.
    addAgent('online-elsewhere', { role: 'supervisor' }, -79_996)
    aMessageRun(SECOND, 'online-elsewhere', 'online-elsewhere-run', 1_200, -700)
    // GREY, "In a terminal": a run open in one of the office's terminals, and nobody answering.
    addAgent('online-terminal', {}, -79_995)
    aTerminalRun('online-terminal', 'online-terminal-run', 'running', -3_000)
    // GREY, "In a terminal", under a hold that has lapsed: the terminal is said before the hold.
    addAgent('online-terminal-lapsed', {}, -79_994)
    aTerminalRun('online-terminal-lapsed', 'online-terminal-lapsed-run', 'running', -300_000)
    aHold('online-terminal-lapsed', 'online-terminal-lapsed-run', -250_000)
    // GREY, NOT IN A TERMINAL: its terminal run has ended.
    addAgent('online-terminal-ended', {}, -79_993)
    aTerminalRun('online-terminal-ended', 'online-terminal-ended-run', 'finished', -5_000)
    // RED: retired, though its terminal run is still open.
    addAgent('online-retired-terminal', { retired: 1, retired_at: stamp(-50_000) }, -79_992)
    aTerminalRun('online-retired-terminal', 'online-retired-terminal-run', 'running', -60_000)
    // GREY: a hold that has lapsed, and no terminal.
    addAgent('online-lapsed', {}, -79_991)
    aRecord('default', 'online-lapsed-session', -250_000, 'session', 'Session of online-lapsed', { state: 'running', servingAgentId: 'online-lapsed', runtime: 'claude-code' })
    aHold('online-lapsed', 'online-lapsed-session', -250_000)
    // GREY: nothing at all.
    addAgent('online-nothing', {}, -79_990)
    // THE TEMPLATE IS RETIRED, so every agent but the fixed ones and the groups is red.
    sqlite.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE handle = ?').run(stamp(-85_000), TEMPLATE)
  })()
}

let groupsSeeded = 0
/** `count` MORE AGENTS OF EACH KIND THAT GROWS: one in a terminal, one inside a run's wait, and one with nothing. */
function seedGroups(count: number): void {
  t.client.sqlite.transaction(() => {
    for (let n = groupsSeeded; n < groupsSeeded + count; n++) {
      const at = -70_000 + 3 * n
      const terminal = `online-group-terminal-${String(n).padStart(3, '0')}`
      addAgent(terminal, {}, at)
      aTerminalRun(terminal, `${terminal}-run`, 'running', -3_000)
      const waiting = `online-group-waiting-${String(n).padStart(3, '0')}`
      addAgent(waiting, { role: 'supervisor' }, at + 1)
      aMessageRun(n % 2 === 0 ? 'default' : SECOND, waiting, `${waiting}-run`, 1_200, -700 - n)
      addAgent(`online-group-nothing-${String(n).padStart(3, '0')}`, {}, at + 2)
    }
  })()
  groupsSeeded += count
}

/** Every statement run while `act` ran, each time it was run. */
async function statementsRunDuring(act: () => Promise<unknown>): Promise<string[]> {
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', (...args: unknown[]) => unknown>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate }
  const seen: string[] = []
  for (const name of ['all', 'get', 'iterate'] as const) {
    const original = originals[name]
    proto[name] = function (this: { source: string }, ...args: unknown[]) {
      seen.push(this.source.replace(/\?(\s*,\s*\?)+/g, '?…').replace(/\s+/g, ' ').trim())
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

/** One statement run while `act` ran: its SQL, the values it was handed, and the first column of each row it handed back. */
interface Handed { sql: string; values: unknown[]; firsts: unknown[] }

/** Every statement run while `act` ran, each time it was run, with the first column of each row it handed back. */
async function rowsHandedBackDuring(act: () => Promise<unknown>): Promise<Handed[]> {
  type Call = (this: { source: string }, ...args: unknown[]) => unknown
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', Call>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate }
  const seen: Handed[] = []
  // A RECORD'S FIRST COLUMN IS ITS ID. A statement drizzle runs hands rows back as lists, and one written out as objects.
  const first = (row: unknown): unknown => (Array.isArray(row) ? row[0] : typeof row === 'object' && row !== null ? Object.values(row)[0] : row)
  const keep = (statement: { source: string }, values: unknown[], rows: unknown[]) => seen.push({ sql: statement.source, values, firsts: rows.map(first) })
  proto.all = function (...values) { const rows = originals.all.apply(this, values) as unknown[]; keep(this, values, rows); return rows }
  proto.get = function (...values) { const row = originals.get.apply(this, values); keep(this, values, row === undefined ? [] : [row]); return row }
  proto.iterate = function* (this: { source: string }, ...values: unknown[]) {
    const rows = [...(originals.iterate.apply(this, values) as Iterable<unknown>)]
    keep(this, values, rows)
    yield* rows
  } as Call
  try {
    await act()
  } finally {
    Object.assign(proto, originals)
  }
  return seen
}

/** How many times each of `ids` was handed back as the first column of a row. */
function timesHandedBack(handed: readonly Handed[], ids: readonly string[]): Map<string, number> {
  const out = new Map(ids.map((id) => [id, 0]))
  for (const one of handed) for (const value of one.firsts) if (typeof value === 'string' && out.has(value)) out.set(value, out.get(value)! + 1)
  return out
}

/** SQLite's plan for one statement with the values it was run with. */
function thePlanOf(one: Handed): string[] {
  const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`)
  return (plan.all(...(one.values as never[])) as { detail: string }[]).map((line) => line.detail)
}

/** How often each statement ran. */
function howOften(statements: readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const sql of statements) out.set(sql, (out.get(sql) ?? 0) + 1)
  return out
}

async function view(name: string): Promise<Row> {
  const answer = await app.inject({ method: 'GET', url: `/api/plugin-read/v1/${name}`, headers: PERSON })
  expect(answer.statusCode, answer.body.slice(0, 500)).toBe(200)
  return JSON.parse(answer.body) as Row
}

/** The rule, read off the people view: green in at least one project, or grey with the words "In a terminal". */
function onlineByThePeopleView(people: PeopleView): Map<string, boolean> {
  return new Map(people.agents.map((agent) => [agent.id, agent.presence.some((p) => p.colour === 'green' || (p.colour === 'grey' && p.word === IN_A_TERMINAL_WORD))]))
}

describe('1. the shape', () => {
  it('answers {interface, view, narrowedByPermission, agents: [{id, online}]}, one row for every agent of the roster, in its order', async () => {
    const online = (await view('online')) as unknown as OnlineView
    expect(Object.keys(online).sort()).toEqual(['agents', 'interface', 'narrowedByPermission', 'view'])
    expect(online).toMatchObject({ interface: 'office-read/1', view: 'online' })
    for (const agent of online.agents) expect(Object.keys(agent).sort()).toEqual(['id', 'online'])
    const roster = (await view('roster')) as { agents: { id: string }[] }
    expect(online.agents.map((agent) => agent.id)).toEqual(roster.agents.map((agent) => agent.id))
  })
})

describe('2. the answer', () => {
  it('says online exactly where the people view draws a dot green in some project, or grey with the words "In a terminal"', async () => {
    const people = (await view('people')) as unknown as PeopleView
    // THE OFFICE DREW WHAT IT IS FOR: green, grey "In a terminal" and red, and one agent green in the second project only.
    const reading = (id: string, project: string) => people.agents.find((agent) => agent.id === id)?.presence.find((p) => p.project === project)
    expect(reading('online-terminal', 'default')).toMatchObject({ colour: 'grey', word: IN_A_TERMINAL_WORD })
    expect(reading('online-terminal-lapsed', 'default')).toMatchObject({ colour: 'grey', word: IN_A_TERMINAL_WORD })
    expect(reading('online-terminal-ended', 'default')?.word).not.toBe(IN_A_TERMINAL_WORD)
    // THE PRESENCE DOOR reads every run of the one agent it is asked about, ended ones among them, and does not take a
    // terminal run that has ended for one at work either. The dot of the views above is not handed that run at all.
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    expect(participantPresence({ kind: 'agent', id: 'online-terminal-ended' }, 'default').word).not.toBe(IN_A_TERMINAL_WORD)
    expect(reading('online-retired-terminal', 'default')?.colour).toBe('red')
    expect(reading('online-elsewhere', 'default')?.colour).toBe('grey')
    expect(reading('online-elsewhere', SECOND)?.colour).toBe('green')
    for (const id of ['online-runner', 'online-held', 'online-waiting', 'online-secretary']) expect(reading(id, 'default')?.colour, id).toBe('green')
    // EVERY AGENT, AS THE PEOPLE VIEW'S DOTS SAY.
    const online = (await view('online')) as unknown as OnlineView
    const byThePeopleView = onlineByThePeopleView(people)
    const disagree = online.agents.filter((agent) => byThePeopleView.get(agent.id) !== agent.online).map((agent) => `${agent.id}: online ${String(agent.online)}`)
    expect(disagree, 'agents whose online the people view’s dots do not say').toEqual([])
    // AND AS WRITTEN OUT HERE.
    const said = new Map(online.agents.map((agent) => [agent.id, agent.online]))
    expect(ONLINE.filter((id) => said.get(id) !== true), 'agents that should be online').toEqual([])
    expect(NOT_ONLINE.filter((id) => said.get(id) !== false), 'agents that should not be online').toEqual([])
    expect(said.get(online.agents.find((agent) => agent.id !== TEMPLATE && !agent.id.startsWith('online-'))?.id ?? TEMPLATE)).toBe(false)
  })
})

describe('3. not through the people view’s presence', () => {
  it('runs no statement the people view does not, and reads not the machine\'s process rows, which only the words beside a grey dot read', async () => {
    // ONCE EACH TO PREPARE AND KEEP WHAT IS KEPT.
    await view('people')
    await view('online')
    const people = howOften(await statementsRunDuring(() => view('people')))
    const online = howOften(await statementsRunDuring(() => view('online')))
    const theProcessRows = (sql: string) => sql.includes('r.registered_by AS registeredBy')
    expect([...people.keys()].filter(theProcessRows).length, 'the people view reads the machine\'s process rows with this statement').toBe(1)
    expect([...online.keys()].filter(theProcessRows), 'the machine\'s process rows, read by the online view').toEqual([])
    expect([...online.keys()].filter((sql) => !people.has(sql)).map((sql) => sql.slice(0, 220)), 'statements the people view does not run').toEqual([])
  })
})

describe('4. the counts', () => {
  it('runs one statement more often for twice the agents of each kind that grows: a run\'s own process row, once for each terminal run added, as the people view does', async () => {
    await view('online')
    const smaller = howOften(await statementsRunDuring(() => view('online')))
    seedGroups(GROUPS)
    const larger = howOften(await statementsRunDuring(() => view('online')))
    const online = (await view('online')) as unknown as OnlineView
    // THE COUNT MEANS SOMETHING ONLY IF THE LARGER OFFICE HOLDS THE AGENTS ADDED, online and not.
    const grew = online.agents.filter((agent) => agent.id.startsWith('online-group-'))
    expect(grew.length).toBe(3 * 2 * GROUPS)
    expect(grew.filter((agent) => agent.online).length).toBe(2 * 2 * GROUPS)
    // ONE MORE READ OF ITS OWN PROCESS ROW FOR EACH TERMINAL RUN ADDED, AND NOTHING ELSE RUNS MORE OFTEN. Each group adds
    // one running terminal run, which the office started.
    const aRunsOwnRows = (sql: string) => sql.startsWith('SELECT * FROM session_resources WHERE workspace_id = ? AND session_record_id = ? ORDER BY')
    const more = [...larger].filter(([sql, n]) => n > (smaller.get(sql) ?? 0)).map(([sql, n]) => `${String(smaller.get(sql) ?? 0)} -> ${String(n)}: ${sql.slice(0, 220)}`)
    const ownRows = [...larger.keys()].filter(aRunsOwnRows)
    expect(ownRows.length, 'the statement a run\'s own process row is read with').toBe(1)
    const [own] = ownRows as [string]
    expect(more, 'the statements of the online view that ran more often').toEqual([`${String(smaller.get(own) ?? 0)} -> ${String((smaller.get(own) ?? 0) + GROUPS)}: ${own.slice(0, 220)}`])
    // THE PEOPLE VIEW ASKS IT AS OFTEN: it is the dot's own step, and not one the online view added.
    const people = howOften(await statementsRunDuring(() => view('people')))
    expect(people.get(own), 'how often the people view reads a run\'s own process row').toBe(larger.get(own))
  })
})

/** The four words a run ends with, as the runs below are filed with them. */
const ENDED_STATES = ['finished', 'crashed', 'paused', 'orphaned']

/**
 * `count` RUNS THAT HAVE ENDED, IN BOTH PROJECTS, that the message worker did not file: a terminal's run, a run bound by
 * `ranAs` alone and a run serving an agent by its id, in turn, each in one of the four words a run ends with. And `count`
 * runs the message worker filed that have ended, with no wait. Their ids, apart. `from` numbers a second batch after the first.
 */
function seedEndedRuns(count: number, from = 0): { notTheWorkers: string[]; theWorkers: string[] } {
  const notTheWorkers: string[] = []
  const theWorkers: string[] = []
  t.client.sqlite.transaction(() => {
    for (let n = from; n < from + count; n++) {
      const state = ENDED_STATES[n % ENDED_STATES.length]!
      const project = n % 2 === 0 ? 'default' : SECOND
      const run = `online-ended-${String(n).padStart(3, '0')}`
      const data: Row =
        n % 3 === 0
          ? { state, servingAgent: 'online-terminal', servingAgentId: 'online-terminal', runtime: 'claude-code', startedByMoleOffice: true, extra: { inATerminal: { terminal: `${run}-terminal` } } }
          : n % 3 === 1
            ? { state, runtime: 'claude-code', ranAs: [{ workspaceId: project, agentId: 'online-lapsed' }], lastOutputAt: stamp(-40) }
            : { state, servingAgentId: 'online-runner', runtime: 'claude-code', lastOutputAt: stamp(-40) }
      aRecord(project, run, -20_000 + n, 'session', `Ended run ${String(n)}`, data)
      notTheWorkers.push(run)
      const workers = `online-ended-message-run-${String(n).padStart(3, '0')}`
      aRecord(project, workers, -20_000 + n, 'session', `Ended message run ${String(n)}`, {
        state, servingAgent: 'online-nothing', servingAgentId: 'online-nothing', runtime: 'claude-code', providerSession: `${workers}-conversation`,
        deliveringMessage: `${workers}-message`, startedByMoleOffice: true,
      })
      theWorkers.push(workers)
    }
  })()
  return { notTheWorkers, theWorkers }
}

describe('5. the session rows the dot reads', () => {
  it('hands back no run that has ended and that the message worker did not file to the online view, and each once to the people view, and runs no statement more often', async () => {
    await view('online')
    // THE PEOPLE VIEW SEES THE RUNS ADDED: a run that has ended, bound by `ranAs` alone, makes an agent with no other run in
    // the second project Offline there, where it was Inactive.
    const lapsedIn = (people: PeopleView) => people.agents.find((agent) => agent.id === 'online-lapsed')?.presence.find((p) => p.project === SECOND)?.word
    expect(lapsedIn((await view('people')) as unknown as PeopleView), 'online-lapsed in the second project, before').toBe(PRESENCE.inactive.word)
    const added = seedEndedRuns(12)
    expect(lapsedIn((await view('people')) as unknown as PeopleView), 'online-lapsed in the second project, with ended runs bound to it').toBe(PRESENCE.offline.word)
    // THE STATEMENTS AT TWELVE RUNS OF EACH KIND ADDED, AGAINST TWENTY-FOUR. A statement asked once for whatever runs are
    // there, such as the people view's one lookup of the agents some runs name, runs at both.
    await view('online')
    const smaller = { online: howOften(await statementsRunDuring(() => view('online'))), people: howOften(await statementsRunDuring(() => view('people'))) }
    const more = seedEndedRuns(12, 12)
    added.notTheWorkers.push(...more.notTheWorkers)
    added.theWorkers.push(...more.theWorkers)
    const online = await rowsHandedBackDuring(() => view('online'))
    const peoples = await rowsHandedBackDuring(() => view('people'))
    const counted = (handed: readonly Handed[], ids: readonly string[]) => [...new Set(timesHandedBack(handed, ids).values())]
    expect(counted(online, added.notTheWorkers), 'times the online view was handed each run that has ended, not the message worker\'s').toEqual([0])
    expect(counted(online, added.theWorkers), 'times the online view was handed each run of the message worker\'s that has ended').toEqual([1])
    expect(counted(peoples, added.notTheWorkers), 'times the people view was handed each run that has ended, not the message worker\'s').toEqual([1])
    expect(counted(peoples, added.theWorkers), 'times the people view was handed each run of the message worker\'s that has ended').toEqual([2])
    // NOT ONE STATEMENT RUNS MORE OFTEN FOR THE RUNS ADDED.
    for (const [name, handed] of [['online', online], ['people', peoples]] as const) {
      const larger = howOften(handed.map((one) => one.sql.replace(/\?(\s*,\s*\?)+/g, '?…').replace(/\s+/g, ' ').trim()))
      const more = [...larger].filter(([sql, n]) => n > (smaller[name].get(sql) ?? 0)).map(([sql, n]) => `${String(smaller[name].get(sql) ?? 0)} -> ${String(n)}: ${sql.slice(0, 220)}`)
      expect(more, `the statements of the ${name} view that ran more often`).toEqual([])
    }
  })

  it('finds each session row the online view reads by its id, or through the index of the runs that have not ended or of the message worker\'s runs', async () => {
    const sessions = new Set((t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'session'").all() as { id: string }[]).map((row) => row.id))
    const reads = (await rowsHandedBackDuring(() => view('online'))).filter((one) => one.firsts.some((id) => typeof id === 'string' && sessions.has(id)))
    expect(reads.length, 'the statements that handed the online view a session row').toBeGreaterThan(0)
    const BY_ID_OR_THE_DOTS_INDEXES = /USING (?:INDEX (?:records_session_not_ended_idx|records_session_delivering_message_idx) |INDEX sqlite_autoindex_records_1 \(id=\?\)|INTEGER PRIMARY KEY)/
    const walks = reads.flatMap((one) => thePlanOf(one).filter((line) => /\b(?:SCAN|SEARCH) (?:records|candidate)\b/.test(line) && !BY_ID_OR_THE_DOTS_INDEXES.test(line)).map((line) => `${line}  <-  ${one.sql.replace(/\s+/g, ' ').slice(0, 200)}`))
    expect(walks, 'a read of session rows that walks a project\'s runs').toEqual([])
    expect(reads.some((one) => thePlanOf(one).some((line) => line.includes('records_session_not_ended_idx'))), 'the index of the runs that have not ended is read').toBe(true)
  })
})

describe('6. the words that end a run', () => {
  it('keeps a row in the index of the runs that have not ended exactly when theRunHasEnded does not call its state ended', async () => {
    // IMPORTED HERE, after the test database is named: keys.ts opens the database when it loads.
    const { RUN_IS_OVER_STATES, theRunHasEnded } = await import('../src/shared/run-has-ended.ts')
    const { STORED_FIELDS, theWordsOfAStoredField } = await import('../src/server/db/schema.ts')
    const { SESSION_STATES } = await import('../src/shared/types.ts')
    const notEnded = t.client.sqlite.prepare(`SELECT ${theWordsOfAStoredField(STORED_FIELDS.sessionHasNotEnded, 'data')} AS kept FROM (SELECT ? AS data)`)
    const kept = (data: string) => (notEnded.get(data) as { kept: number }).kept
    // EVERY WORD THAT ENDS A RUN, EVERY STATE WORD, AND VALUES THAT ARE NOT ONE.
    const states: unknown[] = [...RUN_IS_OVER_STATES, ...SESSION_STATES, null, '', 'Finished', ' finished', 'done', 0, 1, true, false, ['finished'], { word: 'finished' }]
    for (const state of states) expect(kept(JSON.stringify({ state })), JSON.stringify(state)).toBe(theRunHasEnded(state) ? 0 : 1)
    expect(kept(JSON.stringify({})), 'no state').toBe(theRunHasEnded(undefined) ? 0 : 1)
    // THE RUNS CASE 5 FILES AS ENDED ARE ENDED BY THE OFFICE'S OWN WORDS.
    expect([...ENDED_STATES].sort()).toEqual([...RUN_IS_OVER_STATES].sort())
    // DATA THAT IS NOT JSON IS KEPT, so a read of these rows fails on it as a read of every row does.
    expect(kept('made-up words that are not JSON'), 'data that is not JSON').toBe(1)
  })
})

it('7. legacy run references keep identity ambiguity and read each reference kind once for the whole online answer', async () => {
  const sqlite = t.client.sqlite
  sqlite.exec('SAVEPOINT legacy_cases')
  try {
    addAgent('legacy-direct', {}, -90000)
    addAgent('legacy-handle-owner', { handle: 'legacy-handle' }, -90000)
    addAgent('legacy-record-owner', {}, -90000)
    addAgent('legacy-collision', { handle: 'legacy-collision-id-only' }, -90000)
    addAgent('legacy-collision-owner', { handle: 'legacy-collision' }, -90000)
    addAgent('legacy-retired-one', { handle: 'legacy-retired', retired: 1 }, -90000)
    addAgent('legacy-retired-two', { handle: 'legacy-retired', retired: 1 }, -90000)
    const references = ['legacy-direct', 'legacy-handle', 'legacy-record-owner-record', 'legacy-collision', 'legacy-retired', 'legacy-nobody']
    const seed = (suffix: string) => {
      for (const [i, reference] of references.entries()) aRecord('default', `legacy-${suffix}-${i}`, -100, 'session', 'Invented legacy conversation', {
        state: 'finished', servingAgent: i === 2 ? reference : ` ${reference} `, runtime: 'claude-code', providerSession: `legacy-${i}`,
        deliveringMessage: `legacy-message-${i}`, waitsUntil: stamp(1200), startedByMoleOffice: true,
      })
    }
    seed('first')
    const first = await view('online') as unknown as OnlineView
    const flags = new Map(first.agents.map(agent => [agent.id, agent.online]))
    for (const id of ['legacy-direct', 'legacy-handle-owner', 'legacy-record-owner']) expect(flags.get(id), id).toBe(true)
    for (const id of ['legacy-collision', 'legacy-collision-owner', 'legacy-retired-one', 'legacy-retired-two']) expect(flags.get(id), id).toBe(false)
    const smaller = howOften(await statementsRunDuring(() => view('online')))
    for (let i = 0; i < 8; i++) seed(`more-${i}`)
    const larger = howOften(await statementsRunDuring(() => view('online')))
    expect(await view('online')).toEqual(first)
    expect(onlineByThePeopleView(await view('people') as unknown as PeopleView)).toEqual(flags)
    const identities = (sql: string) => /FROM agents WHERE (?:id|handle) = \?/.test(sql) || /FROM agent_records m JOIN agents a/.test(sql) || /json_extract\(r.data, '\$\.runtime'\).*WHERE m.agent_id = \?/.test(sql)
    for (const [sql, n] of larger) if (identities(sql)) {
      expect(n, sql).toBeLessThanOrEqual(smaller.get(sql) ?? 0)
    }
  } finally { sqlite.exec('ROLLBACK TO legacy_cases'); sqlite.exec('RELEASE legacy_cases') }
})
