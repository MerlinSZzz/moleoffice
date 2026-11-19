// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE MINUTE PASS'S LONG SANDBOX RUN STEP PLACES EACH RUN WITH THE SAME AGENT AS BEFORE, AND NO LONGER READS THE WHOLE
 * AGENT REGISTRY TO DO IT. Wave 13y round 44, backlog 9.26.
 *
 * WHY. The step (`sendTheLongSandboxRunRemindersThatAreDue`, src/server/lib/reminders.ts) asks
 * `theAgentOfARunForItsSeal` (src/server/lib/inspection.ts) for the agent of each due run, and that reader built the
 * whole agent registry with `listParticipants` to keep one row of it. A run whose starter cannot be named is never
 * reminded, so it is placed again at every minute's pass. Wave 13u's round 34 found the step reading about 1,962 rows
 * at a time on the live office.
 *
 * WHAT IS COUNTED. Every row of the agents table that a statement hands back while the step is on the stack, through
 * `all`, `get` or `iterate`, whatever function prepared the statement. Wall time is not measured. Before this round one
 * pass over the four due runs below read 164 agent rows, 148 of them from `SELECT * FROM agents ORDER BY handle`.
 *
 * WHAT IS CLAIMED
 *   1. `theAgentOfARunForItsSeal` answers the same agent as before for every way a run names one: the handle, the
 *      registry id and the agent record id in `servingAgent` or `servingAgentId`, and the record id, the handle and the
 *      registry id in `ranAs`; a retired agent too, because the seal reads identity and not being live. The answer is
 *      the whole registry row, as `listParticipants` builds it, runtime included. A run that names nobody, an id no row
 *      holds, or two bindings in its project is placed with nobody.
 *   2. With 37 agents in the registry and four due runs, one pass reads fewer agent rows than the registry holds, and
 *      every statement it reads them with is narrowed by a WHERE. It reminds the same three runs, each to its agent's
 *      starter.
 *   3. A due run whose agent has no recorded starter is never reminded, so the next pass places it again. That pass
 *      also reads fewer agent rows than the registry holds, every one through a WHERE.
 *
 * Every agent, run and folder here is made up.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { SANDBOX_RUN_REMINDER } from '../src/config/launcher-notices.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { parseAnyStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

const asked = { rows: 0, by: new Map<string, number>() }
const IN_THE_STEP = /sendTheLongSandboxRunRemindersThatAreDue/
const FROM_THE_AGENTS_TABLE = /\b(?:from|join)\s+"?agents"?(?!\w)/i

type Statement = { source: string; all: (...args: unknown[]) => unknown[]; get: (...args: unknown[]) => unknown; iterate: (...args: unknown[]) => IterableIterator<unknown> }

/**
 * COUNTS EVERY ROW OF THE AGENTS TABLE A STATEMENT HANDS BACK WHILE THE STEP IS ON THE STACK. It wraps the statement
 * methods every prepared statement shares, so a statement prepared and kept before the step ran is counted as well.
 */
function countTheAgentRowsTheStepReads(): () => void {
  const statement = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Statement
  const { all, get, iterate } = statement
  const counts = (one: Statement, rows: number): void => {
    if (rows === 0 || !FROM_THE_AGENTS_TABLE.test(one.source) || !IN_THE_STEP.test(new Error().stack ?? '')) return
    asked.rows += rows
    asked.by.set(one.source, (asked.by.get(one.source) ?? 0) + rows)
  }
  statement.all = function (this: Statement, ...args: unknown[]) {
    const rows = all.apply(this, args)
    counts(this, rows.length)
    return rows
  }
  statement.get = function (this: Statement, ...args: unknown[]) {
    const row = get.apply(this, args)
    counts(this, row === undefined ? 0 : 1)
    return row
  }
  statement.iterate = function* (this: Statement, ...args: unknown[]) {
    for (const row of iterate.apply(this, args)) {
      counts(this, 1)
      yield row
    }
  }
  return () => Object.assign(statement, { all, get, iterate })
}

let t: TestDb
let app: FastifyInstance
const folders: string[] = []

const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

type Registered = { id: string; recordId: string; handle: string }

async function register(handle: string, runtime = 'codex'): Promise<Registered> {
  const bySecretary = handle !== THE_TEST_OFFICES_SECRETARY.handle
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: bySecretary ? asAgent(THE_TEST_OFFICES_SECRETARY.handle) : AS_THE_PERSON,
    payload: { handle, name: handle, role: bySecretary ? 'worker' : 'secretary', runtime },
  })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }
  const mapped = t.client.sqlite.prepare('SELECT record_id AS recordId FROM agent_records WHERE agent_id = ?').get(row.id) as { recordId: string }
  return { id: row.id, recordId: mapped.recordId, handle }
}

/** The registry row of one agent as `listParticipants` builds it, read outside the step, so it is not counted. */
async function theRowOf(agent: Registered): Promise<unknown> {
  const { listParticipants } = await import('../src/server/lib/participants.ts')
  const row = listParticipants().agents.find((one) => one.id === agent.id)
  expect(row, `${agent.handle} is in the registry`).toBeDefined()
  return row
}

/** Changes a run's stored data in the row itself, for what no door lets a run write about itself. */
function store(run: string, change: (data: Record<string, unknown>) => void): void {
  const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  const data = JSON.parse(stored.data) as Record<string, unknown>
  change(data)
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), run)
}

/**
 * A running sandbox run filed now, naming its agent as `data` says. A run may not name its own sandbox (its launcher
 * writes that), so the sandbox is put into the stored row afterwards.
 */
function aSandboxRun(handle: string, data: Record<string, unknown>): string {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-long-sandbox-run-'))
  folders.push(folder)
  const run = historicalSession(t, {
    workspaceId: 'default',
    kind: 'session',
    title: `${handle}'s sandbox run`,
    actor: { type: 'agent', id: handle },
    data: { state: 'running', doing: 'a made-up round', ...data },
  }).id
  store(run, (stored) => { stored['sandbox'] = { template: 'test-template', container: 'test-row', folder } })
  return run
}

/** The stored `ranAs` of an older run, put into the row as it is held, because the kinds gate no longer writes it. */
function storeRanAs(run: string, agentId: string): void {
  store(run, (data) => {
    delete data['servingAgent']
    data['ranAs'] = [{ workspaceId: 'default', agentId }]
  })
}

/**
 * The office lines that remind a starter of one long run: whom each went to. A line names every run it reminds of in
 * `extra.longRuns`, and its `aboutRun` is the first of them (wave 13y round 141).
 */
const remindedAbout = (run: string): string[] =>
  (t.client.sqlite
    .prepare(
      "SELECT json_extract(data, '$.to[0].id') AS 'to' FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
        "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND json_extract(data, '$.notice') = 'aSandboxRunHasRunLong' " +
        "AND (json_extract(data, '$.aboutRun') = ? OR EXISTS (SELECT 1 FROM json_each(data, '$.extra.longRuns') WHERE value = ?))",
    )
    .all(run, run) as { to: string }[]).map((one) => one.to)

let secretary: Registered
let placed: Registered
let retired: Registered
let unstarted: Registered

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  secretary = await register(THE_TEST_OFFICES_SECRETARY.handle, 'claude-code')
  placed = await register('long-run-placed')
  retired = await register('long-run-retired', 'opencode')
  unstarted = await register('long-run-unstarted')
  // NOBODY RECORDED WHO STARTED IT, the stored state of an agent a person registered by hand (schema.ts, started_by_kind).
  t.client.sqlite.prepare('UPDATE agents SET started_by_kind = NULL, started_by_id = NULL WHERE id = ?').run(unstarted.id)
  const agentColumns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (agentColumns.some((column) => column.name === 'owner_id')) setFixtureOwner(t.client.sqlite, null, unstarted.id, 'id')
  const retire = await app.inject({ method: 'POST', url: `/api/participants/agent/${retired.id}/retire`, headers: AS_THE_PERSON, payload: { because: 'its made-up work is done' } })
  expect(retire.statusCode, retire.body.slice(0, 300)).toBe(200)
  for (let n = 0; n < 32; n++) await register(`long-run-crowd-${String(n)}`)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

describe('theAgentOfARunForItsSeal', () => {
  it('1: answers the same whole registry row for every way a run names its agent, and nobody where none is named', async () => {
    const { theAgentOfARunForItsSeal } = await import('../src/server/lib/inspection.ts')
    const run = (data: Record<string, unknown>) => theAgentOfARunForItsSeal({ workspaceId: 'default', data })
    const ranAs = (agentId: string) => ({ ranAs: [{ workspaceId: 'default', agentId }] })
    const placedRow = await theRowOf(placed)
    const retiredRow = await theRowOf(retired)
    expect((placedRow as { runtime: unknown }).runtime, 'the row carries its runtime, so the whole row is compared').toBe('codex')
    expect((retiredRow as { retired: unknown }).retired).toBe(true)

    const named: [string, Record<string, unknown>, unknown][] = [
      ['servingAgent, the handle', { servingAgent: placed.handle }, placedRow],
      ['servingAgentId, the registry id', { servingAgentId: placed.id }, placedRow],
      ['servingAgent, the agent record id', { servingAgent: placed.recordId }, placedRow],
      ['ranAs, the agent record id', ranAs(placed.recordId), placedRow],
      ['ranAs, the handle', ranAs(placed.handle), placedRow],
      ['ranAs, the registry id', ranAs(placed.id), placedRow],
      ['servingAgentId, a retired agent', { servingAgentId: retired.id }, retiredRow],
      ['ranAs, a retired agent by its handle', ranAs(retired.handle), retiredRow],
      ['nothing named', {}, null],
      ['servingAgentId, an id no row holds', { servingAgentId: 'no-agent-holds-this-id' }, null],
      ['servingAgent, a name nobody bears', { servingAgent: 'nobody-bears-this-name' }, null],
      ['ranAs, two bindings in the project', { ranAs: [{ workspaceId: 'default', agentId: placed.handle }, { workspaceId: 'default', agentId: retired.handle }] }, null],
    ]
    for (const [how, data, expected] of named) expect(run(data), how).toEqual(expected)
  })
})

describe('the long sandbox runs step of the minute pass', () => {
  it('2 and 3: reads fewer agent rows than the registry holds, never the whole table, and reminds the same runs', async () => {
    const reminders = await import('../src/server/lib/reminders.ts')
    const resources = await import('../src/server/lib/resources.ts')
    // THE MADE-UP CONTAINER IS SAID TO BE RUNNING, so the pass's closer of runs whose container stopped leaves these runs as they are.
    resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
      containers: () => ({ available: true, containers: [{ id: 'made-up', name: 'test-row', image: 'made-up', status: 'Up' }] }),
    }))
    onTestFinished(() => resources.useOsProbe(resources.LINUX_PROBE))
    onTestFinished(countTheAgentRowsTheStepReads())

    const byHandle = aSandboxRun(placed.handle, { servingAgent: placed.handle })
    const byId = aSandboxRun(placed.handle, { servingAgentId: placed.id })
    const byRanAsHandle = aSandboxRun(placed.handle, { servingAgent: placed.handle })
    storeRanAs(byRanAsHandle, placed.handle)
    const noStarter = aSandboxRun(unstarted.handle, { servingAgent: unstarted.handle })
    const filedAt = Math.max(...[byHandle, byId, byRanAsHandle, noStarter].map((run) => parseAnyStamp(t.api.getRecord(run)!.createdAt)!.getTime()))
    const agentsInTheRegistry = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents').get() as { n: number }).n
    expect(agentsInTheRegistry).toBe(37)

    const pass = (ms: number): { reminded: string[]; rows: number; withNoWhere: string[] } => {
      asked.rows = 0
      asked.by.clear()
      const at = new Date(filedAt + ms)
      const report = reminders.sendTheRemindersThatAreDue('default', at, new Date(at.getTime() - 60_000))
      const withNoWhere = [...asked.by.keys()].filter((source) => !/\bwhere\b/i.test(source))
      return { reminded: [...report.longSandboxRunsReminded].sort(), rows: asked.rows, withNoWhere }
    }

    const first = pass(SANDBOX_RUN_REMINDER.ms + 60_000)
    expect(first.reminded).toEqual([byHandle, byId, byRanAsHandle].sort())
    for (const run of [byHandle, byId, byRanAsHandle]) expect(remindedAbout(run), run).toEqual([secretary.id])
    expect(remindedAbout(noStarter)).toEqual([])
    expect(first.withNoWhere, `statements that read the whole agents table, with ${String(first.rows)} agent rows read in all`).toEqual([])
    expect(first.rows, `four due runs, ${String(agentsInTheRegistry)} agents in the registry`).toBeLessThan(agentsInTheRegistry)

    const second = pass(SANDBOX_RUN_REMINDER.ms + 120_000)
    // THE TWO COUNTS ARE PRINTED, so a green run's log says what it read and not only that it was under the limit.
    console.info(`The first pass read ${String(first.rows)} agent rows and the second ${String(second.rows)}, with ${String(agentsInTheRegistry)} agents registered.`)
    expect(second.reminded).toEqual([])
    expect(remindedAbout(noStarter)).toEqual([])
    expect(second.withNoWhere, `statements that read the whole agents table, with ${String(second.rows)} agent rows read in all`).toEqual([])
    expect(second.rows, 'only the run never reminded is placed again').toBeLessThan(agentsInTheRegistry)
  })
})
