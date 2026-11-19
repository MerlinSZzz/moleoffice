// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH VIEW OF THE PLUGIN READ INTERFACE ANSWERS WITHIN ITS BUDGET, IN THE TIMING GROUP. Wave 13x round 14, step 2 of
 * the plugin pipeline udGnc-Bsr15R (block 1DP8abzhUpNb). The budgets are PLUGIN_READ_BUDGET_MS in
 * src/shared/plugins.ts, and this file is the only test that holds them.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine. The
 * repository's timing agreements (tests/the-timing-tests.ts) keep absolute times out of the merge gates, because a
 * busy machine cannot judge them. The shapes, and that nothing writes, are held in the merge gates by
 * tests/the-plugin-read-interface-v1.test.ts.
 *
 * THE OFFICE IS MADE UP: 300 agents in 4 projects, copied from one agent the door registered, as
 * tests/the-plugin-views-read-many-agents-at-once.test.ts does; 4 runs each, one of them running and claiming a file for 30 of the agents; and 2,000
 * messages from the person, written through the product's own createRecord. Every name and word is made up.
 *
 * Each view is asked once to warm it, then five times, and the median is held against its budget. Every time is
 * written to the timing results file when the group names one.
 *
 * THE STATUS VIEW READS ONLY THE AGENTS IT IS ASKED FOR, and asked for none it works out nothing. So it is asked for
 * one agent, as the chat asks it for the agent it opens: an agent of the project asked, not retired, whose running
 * run claims a file. The answer must name that agent, so the time is of its reading.
 */
import { appendFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { PLUGIN_READ_BUDGET_MS, PLUGIN_READ_VIEWS } from '../src/shared/plugins.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const SIZE = { projects: ['default', 'budget-one', 'budget-two', 'budget-three'], agents: 300, runsEach: 4, claims: 30, messages: 2_000 }
const TEMPLATE = 'budget-template'
const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

let t: TestDb
let app: FastifyInstance
/** The agent the status view is asked about, found in the made-up office once it is made. */
let working = ''

/** A local wall-clock stamp, whole seconds, `n` seconds after a fixed morning. */
function stamp(n: number): string {
  const at = new Date(2026, 9, 1, 8, 0, 0)
  at.setSeconds(at.getSeconds() + n)
  const two = (v: number) => String(v).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

function seedTheOffice(): void {
  const sqlite = t.client.sqlite
  const project = sqlite.prepare('INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
  for (const id of SIZE.projects) project.run(id, id, stamp(0), stamp(0))
  const template = sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(TEMPLATE) as Record<string, unknown>
  const columns = Object.keys(template)
  const agent = sqlite.prepare(`INSERT INTO agents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
  const record = sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', ?, ?, 'session', ?, ?, 'authored')`,
  )
  const claim = sqlite.prepare("INSERT INTO work_claims (id, workspace_id, claimant_kind, claimant_id, run, things, opened_at) VALUES (?, ?, 'agent', ?, ?, ?, ?)")
  sqlite.transaction(() => {
    for (let n = 0; n < SIZE.agents; n++) {
      const id = `budget-agent-id-${String(n)}`
      const handle = `budget-agent-${String(n)}`
      agent.run(...columns.map((c) => (c === 'id' ? id : c === 'handle' || c === 'name' ? handle : c === 'retired' ? (n % 5 < 3 ? 1 : 0) : template[c])))
      for (let r = 0; r < SIZE.runsEach; r++) {
        const at = stamp(n * 100 + r)
        const state = n < SIZE.claims && r === 0 ? 'running' : 'finished'
        const data = { state, servingAgent: handle, servingAgentId: id, runtime: 'claude-code' }
        const runId = `budget-run-${String(n)}-${String(r)}`
        const where = SIZE.projects[(n + r) % SIZE.projects.length]!
        record.run(runId, where, at, at, `Run ${String(r)} of ${handle}`, JSON.stringify(data))
        if (state === 'running') claim.run(`budget-claim-${String(n)}`, where, id, runId, JSON.stringify([{ what: 'path', id: `src/budget-${String(n)}.ts` }]), at)
      }
    }
  })()
  for (let m = 0; m < SIZE.messages; m++) {
    const body = `Made-up message ${String(m + 1)}: read the bench again.`
    t.api.createRecord({
      kind: 'message',
      title: body.slice(0, 40),
      workspaceId: SIZE.projects[m % SIZE.projects.length]!,
      data: { body, to: [{ kind: 'agent', id: `budget-agent-id-${String(m % SIZE.agents)}` }] },
      actor: t.api.HUMAN,
    })
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: TEMPLATE, name: TEMPLATE, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  seedTheOffice()
  const found = t.client.sqlite
    .prepare('SELECT a.id FROM work_claims c JOIN agents a ON a.id = c.claimant_id WHERE c.workspace_id = ? AND a.retired = 0 ORDER BY a.id LIMIT 1')
    .get(PERSON['x-mole-office-workspace']) as { id: string } | undefined
  expect(found, 'a made-up agent of the project asked, not retired, with a running run that claims a file').toBeDefined()
  working = found!.id
}, 180_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('each plugin read view answers within its budget', () => {
  for (const view of PLUGIN_READ_VIEWS) {
    it(`answers ${view} within ${String(PLUGIN_READ_BUDGET_MS[view])} ms`, async () => {
      const ask = async (): Promise<{ ms: number; bytes: number }> => {
        const started = performance.now()
        const reply = await app.inject({ method: 'GET', url: `/api/plugin-read/v1/${view}${view === 'status' ? `?agents=${working}` : ''}`, headers: PERSON })
        const ms = performance.now() - started
        expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
        if (view === 'status') expect((reply.json() as { agents: { id: string }[] }).agents.map((one) => one.id)).toEqual([working])
        return { ms, bytes: reply.body.length }
      }
      await ask()
      const times: number[] = []
      let bytes = 0
      for (let i = 0; i < 5; i++) {
        const one = await ask()
        times.push(one.ms)
        bytes = one.bytes
      }
      const median = [...times].sort((a, b) => a - b)[2]!
      const said = `[plugin read timing] ${view}: median ${String(Math.round(median))} ms of ${times.map((ms) => String(Math.round(ms))).join(', ')}; ${String(bytes)} bytes; budget ${String(PLUGIN_READ_BUDGET_MS[view])} ms`
      console.log(said)
      if (OUT !== '') appendFileSync(`${OUT}.plugin-read.log`, `${said}\n`)
      expect(median, `the median time of ${view}`).toBeLessThan(PLUGIN_READ_BUDGET_MS[view])
    }, 60_000)
  }
})
