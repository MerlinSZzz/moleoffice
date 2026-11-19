// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PEOPLE AND WORK VIEWS COST WHAT IS ASKED, round 63 of wave 13y.
 * Every agent, run and word below is made up for this test. Nothing is a live observation.
 *
 * A keeps every field of the whole answer for one agent, several and all agents. Its sessions include a handle hold,
 * a running process (this test's own), a conversation wait, a claim, finished runs, padded serving text and ranAs
 * bindings in two projects. Created and updated orders disagree, including ties. Deleted rows stay out.
 * B doubles other agents' history. Statements and returned rows cannot grow. EXPLAIN QUERY PLAN also must search
 * session candidates by a value or row id, rather than walk the project's or kind's sessions. Returned-row counts
 * alone cannot detect a JSON predicate visiting every other run; the plan detects that work before filtering.
 * C holds one read of each candidate session, shared with presence. B's plan and C are red before the code change.
 * The statements and rows are counted where SQLite executes them, without mocking a reader.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { localStamp } from '../src/shared/time.ts'

type Row = Record<string, unknown>
type Agent = { id: string; handle: string; record: string }
type Answer = { agents?: (Row & { id: string })[]; work?: (Row & { agent: string })[]; [key: string]: unknown }
type Read = { sql: string; rows: number; ids: string[]; session: boolean; plan: string[]; notes: number }
let t: TestDb
let app: FastifyInstance
const NOW = new Date(2026, 9, 22, 12, 0, 0)
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const ACTOR = { type: 'human', id: THE_PERSON } as const
const agents: Agent[] = []
const projects = ['default', 'panelx']
const stamp = (seconds: number) => localStamp(new Date(NOW.getTime() + seconds * 1000))

function agent(handle: string, project = 'default'): Agent {
  const record = t.api.createRecord({ workspaceId: project, actor: ACTOR, kind: 'agent', title: `Made-up ${handle}`, data: { handle, runtime: 'claude-code', state: 'active' } }).id
  const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  const made = { id, handle, record }
  agents.push(made)
  return made
}

function run(id: string, project: string, data: Row, created = -300, updated = created): void {
  t.client.sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, project, THE_TEST_OFFICES_OWNER.id, stamp(created), stamp(updated), 'session', `Made-up run ${id}`, JSON.stringify(data), 'authored')
}
const serves = (who: Agent) => ({ servingAgentId: who.id, servingAgent: who.handle })
const binding = (who: Agent, project: string) => ({ ranAs: [{ workspaceId: project, agentId: who.record }] })
function hold(who: Agent, session: string): void {
  t.client.sqlite.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`${session}-hold`, who.id, session, 'made-up-machine', 'claude-code', stamp(-600), stamp(-10))
}
function claim(who: Agent, session: string): void {
  t.client.sqlite.prepare('INSERT INTO work_claims (id, workspace_id, claimant_kind, claimant_id, run, things, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`${session}-claim`, 'default', 'agent', who.id, session, '[]', stamp(-100))
}
let others = 0
function otherHistory(count: number): void {
  const who = agents.at(-1)!
  t.client.sqlite.transaction(() => {
    for (let i = 0; i < count; i++) {
      const n = others++
      run(`made-up-other-${n}`, projects[n % 2]!, { state: 'finished', ...serves(who), ...binding(who, projects[n % 2]!) }, -10000 - n)
    }
  })()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const project = await app.inject({ method: 'POST', url: '/api/workspaces', headers: PERSON, payload: { id: 'panelx', title: 'Made-up second project' } })
  expect(project.statusCode, project.body).toBe(201)
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  const held = agent('made-up-held')
  const running = agent('made-up-running')
  const waiting = agent('made-up-waiting')
  const claimed = agent('made-up-claimed')
  const odd = agent('made-up-odd')
  const bound = agent('made-up-bound', 'panelx')
  run('made-up-held', 'default', { state: 'running', ...serves(held) }, -100, -500)
  hold(held, 'made-up-held')
  run('made-up-running', 'default', { state: 'running', ...serves(running), startedByMoleOffice: true, runtime: 'claude-code', providerSession: 'made-up-conversation', deliveringMessage: 'made-up-message' }, -500, -100)
  const { osProbe } = await import('../src/server/lib/resources.ts')
  const live = osProbe().processById(process.pid)
  if (live === null) throw new Error('The test could not read its own process')
  t.client.sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, started_by_the_product) VALUES (?, ?, ?, 'process', ?, ?, ?, ?, ?, ?, 1)")
    .run('made-up-process', 'default', 'made-up-running', String(live.pid), live.pgid, live.startedAt, 'Made-up run using this test process', stamp(-300), `agent:${running.id}`)
  run('made-up-waiting', 'default', { state: 'finished', ...serves(waiting), runtime: 'claude-code', providerSession: 'made-up-wait-conversation', deliveringMessage: 'made-up-wait-message', waitsUntil: stamp(1200), lastOutputAt: stamp(-30), startedByMoleOffice: true })
  run('made-up-claimed', 'default', { state: 'finished', ...serves(claimed) })
  claim(claimed, 'made-up-claimed')
  run('made-up-odd', 'default', { state: 'finished', servingAgentId: ` ${odd.id} ` })
  claim(odd, 'made-up-odd')
  run('made-up-bound', 'default', { state: 'finished', ...binding(bound, 'default') })
  claim(bound, 'made-up-bound')
  run('made-up-bound-there', 'panelx', { state: 'finished', ...binding(bound, 'panelx') })
  run('made-up-bound-multiple', 'default', { state: 'finished', ranAs: [{ workspaceId: 'panelx', agentId: held.record }, { workspaceId: 'default', agentId: bound.record }] })
  // Two held runs with tied creation time: presence must keep the rowid tie, work the id tie.
  for (const id of ['made-up-tie-z', 'made-up-tie-a']) {
    run(id, 'default', { state: 'finished', ...serves(claimed) }, -800, -200)
    claim(claimed, id)
  }
  run('made-up-finished', 'panelx', { state: 'finished', ...serves(held) })
  run('made-up-deleted', 'panelx', { state: 'running', ...serves(held) })
  t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(stamp(-10), 'made-up-deleted')
  agent('made-up-other')
  otherHistory(30)
}, 120000)
afterAll(async () => { vi.useRealTimers(); await app?.close(); t?.close() })

async function view(name: string, asked?: string[]): Promise<Answer> {
  const query = asked === undefined ? '' : `?agents=${asked.join(',')}`
  const reply = await app.inject({ method: 'GET', url: `/api/plugin-read/v1/${name}${query}`, headers: PERSON })
  expect(reply.statusCode, reply.body.slice(0, 500)).toBe(200)
  return reply.json() as Answer
}

/** Count calls rather than preparation, including prepared statements that survive between asks. */
async function readsDuring(act: () => Promise<unknown>): Promise<Read[]> {
  type Statement = { source: string; readonly: boolean; columns: () => { name: string }[] }
  type Call = (this: Statement, ...args: unknown[]) => unknown
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', Call>
  const original = { all: proto.all, get: proto.get, iterate: proto.iterate }
  const reads: Read[] = []
  function record(statement: Statement, args: unknown[], rows: unknown[]): void {
    const sql = statement.source
    const session = /from ["`]?records["`]? where/i.test(sql) && /["`]data["`]/.test(sql) && (args.flat().includes('session') || /kind["`]? = 'session'/.test(sql))
    const plan = session ? original.all.apply(t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`), args) as { detail: string }[] : []
    const notes = session ? rows.filter(row => {
      // A computed data projection need not name its output column. Observe the returned JSON itself.
      return (Array.isArray(row) ? row : [(row as Row)['data']]).some(value => {
        if (typeof value !== 'string' || !value.startsWith('{')) return false
        try { return Object.hasOwn(JSON.parse(value), 'notes') } catch { return false }
      })
    }).length : 0
    reads.push({ sql, rows: rows.length, session, notes, ids: rows.map(r => Array.isArray(r) ? String(r[0]) : String((r as Row)['id'])), plan: plan.map(p => p.detail) })
  }
  proto.all = function (...args) { const rows = original.all.apply(this, args) as unknown[]; record(this, args, rows); return rows }
  proto.get = function (...args) { const row = original.get.apply(this, args); record(this, args, row === undefined ? [] : [row]); return row }
  proto.iterate = function* (this: Statement, ...args: unknown[]) {
    const rows = [...original.iterate.apply(this, args) as Iterable<unknown>]
    record(this, args, rows)
    yield* rows
  } as Call
  try { await act() } finally { Object.assign(proto, original) }
  return reads
}
function counts(reads: Read[]): Map<string, { runs: number; rows: number }> {
  const out = new Map<string, { runs: number; rows: number }>()
  for (const read of reads) {
    const n = out.get(read.sql) ?? { runs: 0, rows: 0 }
    n.runs++; n.rows += read.rows; out.set(read.sql, n)
  }
  return out
}
function summary(reads: Read[]) {
  return { statements: reads.length, rows: reads.reduce((n, r) => n + r.rows, 0), sessionReads: reads.filter(r => r.session).length, sessionRows: reads.filter(r => r.session).reduce((n, r) => n + r.rows, 0) }
}

it('A. every answer equals the whole view field by field, for one agent, several, all and no list', async () => {
  const roster = (await view('people')).agents!.map(a => a.id)
  const lists = [...agents.map(a => [a.id]), [agents[0]!.id, agents[2]!.id, agents[5]!.id], [...roster].reverse()]
  for (const name of ['people', 'work']) {
    const whole = await view(name)
    expect(await view(name), 'no list').toEqual(whole)
    for (const asked of lists) {
      const named = new Set(asked)
      const field = name === 'people' ? 'agents' : 'work'
      const rows = name === 'people' ? whole.agents!.filter(a => named.has(a.id)) : whole.work!.filter(w => named.has(w.agent))
      expect(await view(name, asked), `${name}: ${asked.join(',')}`).toEqual({ ...whole, [field]: rows, notAgents: [] })
    }
  }
  const work = (await view('work')).work!
  for (const [id, association] of [['made-up-held', 'handle'], ['made-up-running', 'process'], ['made-up-waiting', 'conversation wait'], ['made-up-claimed', 'work claim'], ['made-up-odd', 'work claim'], ['made-up-bound', 'work claim']]) {
    expect(work.find(w => w['id'] === id)?.['association'], id).toBe(association)
  }
  expect(work.some(w => w['id'] === 'made-up-deleted')).toBe(false)
  expect((await view('people', [agents[5]!.id])).agents![0]!['projects']).toEqual(projects)
})

it('A. malformed session JSON is refused by the existing expression indexes before any reader can see it', () => {
  // The database already indexes unguarded run-key JSON. This schema cannot hold a malformed session; do not weaken it
  // to make a fixture. The narrowed condition must still keep malformed JSON if a future schema lets it reach a reader.
  expect(() => t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('made-up invalid JSON', 'made-up-finished')).toThrow(/malformed JSON/)
})

it('B. doubling other agents’ history adds no calls or returned rows and never walks their sessions to filter them', async () => {
  const asked = [agents[0]!.id, agents[2]!.id, agents[5]!.id]
  const before = new Map<string, Read[]>()
  for (const name of ['people', 'work']) { await view(name, asked); before.set(name, await readsDuring(() => view(name, asked))) }
  otherHistory(30)
  for (const name of ['people', 'work']) {
    const after = await readsDuring(() => view(name, asked))
    const smaller = counts(before.get(name)!)
    const larger = counts(after)
    console.log(JSON.stringify({ case: 'B', view: name, before: summary(before.get(name)!), after: summary(after) }))
    for (const [sql, n] of larger) {
      expect(n.runs, sql).toBeLessThanOrEqual(smaller.get(sql)?.runs ?? 0)
      expect(n.rows, sql).toBeLessThanOrEqual(smaller.get(sql)?.rows ?? 0)
    }
    const sessions = after.filter(r => r.session)
    expect(sessions.length, 'the session reads were observed').toBeGreaterThan(0)
    for (const read of sessions) {
      const visits = read.plan.filter(line => /(?:SCAN|SEARCH) (?:records|candidate)\b/.test(line))
      expect(visits.length, read.sql).toBeGreaterThan(0)
      // A lookup on workspace or kind alone still visits other agents' history. A value expression or a row id must
      // constrain each records access, including any candidate subquery. Sorting the selected rows is allowed.
      expect(visits.filter(line => !/SEARCH .* (?:USING .*(?:<expr>|id|rowid)=\?|USING INTEGER PRIMARY KEY)/.test(line)), read.plan.join('\n')).toEqual([])
    }
  }
})

it('C. a listed people reading fetches each candidate session once for the scene and every project’s presence', async () => {
  const asked = agents.slice(0, 6).map(a => a.id)
  const reads = (await readsDuring(() => view('people', asked))).filter(r => r.session)
  console.log(JSON.stringify({ case: 'C', ...summary(reads) }))
  const seen = new Map<string, number>()
  for (const read of reads) for (const id of read.ids) seen.set(id, (seen.get(id) ?? 0) + 1)
  expect(seen.has('made-up-odd'), 'the odd serving value was kept').toBe(true)
  expect([...seen].filter(([, n]) => n !== 1), 'a session fetched twice').toEqual([])
  expect(reads.length, 'one candidate read for each project').toBe(projects.length)
})


it('D. reading several agents groups the grey signs rather than judging every candidate for every agent', async () => {
  const asked = Array.from({ length: 12 }, (_, i) => agent(`made-up-batch-${i}`))
  for (const [i, who] of asked.entries()) for (let n = 0; n < 8; n++) {
    const project = projects[n % projects.length]!
    run(`made-up-batch-${i}-${n}`, project, { state: 'finished', ...serves(who), ranAs: [{ workspaceId: project, agentId: who.id }] }, -1000 - n)
  }
  const fields = await import('../src/shared/ran-as.ts')
  const calls = vi.spyOn(fields, 'ranAsIn')
  try {
    const singles = []
    let separate = 0
    for (const who of asked) {
      calls.mockClear()
      singles.push((await view('people', [who.id])).agents![0]!)
      separate += calls.mock.calls.length
    }
    calls.mockClear()
    const together = (await view('people', asked.map(who => who.id))).agents!
    const combined = calls.mock.calls.length
    expect(together).toEqual([...singles].sort((a, b) => String(a['handle']).localeCompare(String(b['handle']))))
    expect(separate, 'the binding reader was observed').toBeGreaterThan(0)
    expect(combined, `combined ${combined}; separate ${separate}`).toBeLessThanOrEqual(separate * 2)
  } finally { calls.mockRestore() }
})

it('E. candidate buckets are collected without sorting each bucket before the final session order', async () => {
  const reads = (await readsDuring(() => view('people', agents.slice(0, 6).map(a => a.id)))).filter(r => r.session)
  expect(reads.length).toBeGreaterThan(0)
  for (const read of reads) {
    expect(read.plan.filter(line => /USE TEMP B-TREE FOR ORDER BY/.test(line)).length, read.plan.join('\n')).toBeLessThanOrEqual(1)
  }
})


it('F. listed people and work leave session notes in storage and keep absent serving values distinct from null', async () => {
  const who = agents[5]!
  for (const [suffix, fields] of [['absent', {}], ['null', { servingAgent: null }]] as const) {
    run(`made-up-note-${suffix}`, 'default', { state: 'finished', ...fields, ...binding(who, 'default'), notes: 'Made-up notes that neither view reads. '.repeat(1000) })
    claim(who, `made-up-note-${suffix}`)
  }
  for (const name of ['people', 'work']) {
    const whole = await view(name)
    const field = name === 'people' ? 'agents' : 'work'
    const expected = (whole[field] as Row[]).filter(row => row[name === 'people' ? 'id' : 'agent'] === who.id)
    const reads = await readsDuring(async () => { expect((await view(name, [who.id]))[field]).toEqual(expected) })
    expect(reads.filter(read => read.session).length).toBeGreaterThan(0)
    expect(reads.reduce((n, read) => n + read.notes, 0), 'unused note fields crossed the database boundary').toBe(0)
  }
})
