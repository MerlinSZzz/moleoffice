// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN AGENT FILED IS FOUND THROUGH AN INDEX, NOT BY READING THE WHOLE CHANGE LOG.
 *
 * A check lists the records the run's agent filed (`everythingThisAgentWrote` in src/server/lib/inspection.ts). It
 * reads the change log's create rows written as an agent, under the agent's stamps, and joins each to its record. No
 * index of `changes` started with the actor, so SQLite read every row of the log: on the live office about a million
 * rows in about 2 GB, and up to 8.7 s each time, while the office answered nothing else. Migration 0335 adds
 * `changes_agent_create_idx`, a partial index of the create rows written as an agent, keyed by the stamp, the order
 * written, the record and the project. The read's SQL does not change: its terms on `op` and `actor_type` are the
 * index's WHERE word for word, so SQLite searches the index by the actor instead of scanning the log, and takes the
 * other three columns from the index itself.
 *
 * WHAT THIS FILE PROVES. On a made-up office that has 50,000 made-up change rows besides what the agents wrote,
 * `whatTheInspectorReads(run, 'default').wrote` lists the run's agent's 30 notes newest first in the order they were
 * filed and nothing else. The one statement that reads them is caught as it runs, planned by SQLite itself with the
 * values bound to it, and its plan must name `changes_agent_create_idx` by the actor as a covering search and must have
 * no SCAN step. So the plan is of the read that gave the answer.
 *
 * WHAT IT DOES NOT PROVE. The plan is the bound on rows touched, because better-sqlite3 has no statement counters. The
 * time on the live office is not measured here. With ANALYZE statistics SQLite could choose another plan, though the
 * live office keeps none.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agents, their handles,
 * the notes, the run and the 50,000 change rows are made up.
 *
 * MUTATIONS, after a control run: in the migration, make the index's WHERE `op = 'update'` instead of `'create'`, or take
 * `append_order` out of its column list; or in the read, ask `c.actor_type IN ('agent', 'human')` instead of
 * `c.actor_type = 'agent'`. The first and third leave the read a SCAN of the log; the second leaves a search of the
 * index that is not covering. Case 1 stays green because the answer does not change.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')

/** The project every record and change row here is filed in. */
const WORKSPACE = 'default'
/** The three made-up agents: the secretary that starts the other two, both workers. */
const SECRETARY = 'made-up-secretary'
const WRITER = 'made-up-writer'
const OTHER = 'made-up-other'
/** How many notes each worker files, and how many made-up rows go into the change log. */
const THE_WRITERS_NOTES = 30
const THE_OTHER_AGENTS_NOTES = 5
const THE_LARGE_LOG_ROWS = 50_000
/** The moment every made-up change row carries. */
const THE_MADE_UP_AT = '2026-11-01 00:00:00'

const made = mkdtempSync(join(tmpdir(), 'mole-office-agent-writings-'))
const home = join(made, 'home')
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const asThePerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const as = (handle: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

let theHomeBefore: string | undefined
let theWritersNoteIds: string[] = []
let theOtherAgentsNoteIds: string[] = []
let theRunOfTheWriter = ''

/** Register an agent through the product's door, as the person or its starter. */
async function register(handle: string, role: string, starter?: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starter === undefined ? asThePerson : as(starter),
    payload: { handle, name: `Made-up ${handle}`, role, ...(role === 'secretary' ? {} : { workArea: ['work'] }) } })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A note an agent files, through the records door, in the order this is called. Synthetic. */
function aNoteFiledBy(handle: string, title: string): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE, kind: 'note', title, origin: 'fixture', actor: { type: 'agent', id: handle }, data: {},
  }).id
}

/**
 * THE LARGE CHANGE LOG: rows written straight into the table, in one statement, every fifth an update by the writer on
 * its first note and the rest a create by one of 500 other made-up agents on a record that does not exist. `append_order`
 * is left out, so the trigger of drizzle/0194_the_change_log_keeps_its_append_order.sql gives each row the next place.
 */
function theLargeChangeLog(theWritersFirstNote: string): void {
  t.client.sqlite
    .prepare(
      `WITH RECURSIVE n(k) AS (SELECT 1 UNION ALL SELECT k + 1 FROM n WHERE k < ?)
       INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, at)
       SELECT printf('made-up-change-%05d', k),
              CASE WHEN k % 5 = 0 THEN ? ELSE 'made-up-record-' || k END,
              'default',
              CASE WHEN k % 5 = 0 THEN 'update' ELSE 'create' END,
              'agent',
              CASE WHEN k % 5 = 0 THEN ? ELSE 'made-up-agent-' || (k % 500) END,
              ?
       FROM n`,
    )
    .run(THE_LARGE_LOG_ROWS, theWritersFirstNote, WRITER, THE_MADE_UP_AT)
}


beforeAll(async () => {
  theHomeBefore = process.env.HOME
  mkdirSync(home)
  process.env.HOME = home
  t = await freshDb()
  app = (await apiApp()).app
  inspection = await import('../src/server/lib/inspection.ts')
  await app.ready()
  await register(SECRETARY, 'secretary')
  await register(WRITER, 'worker', SECRETARY)
  await register(OTHER, 'worker', SECRETARY)
  for (let i = 1; i <= THE_WRITERS_NOTES; i += 1) {
    theWritersNoteIds.push(aNoteFiledBy(WRITER, `Made-up note ${String(i)} of the writer`))
  }
  for (let i = 1; i <= THE_OTHER_AGENTS_NOTES; i += 1) {
    theOtherAgentsNoteIds.push(aNoteFiledBy(OTHER, `Made-up note ${String(i)} of the other agent`))
  }
  theRunOfTheWriter = t.api.createRecord({
    workspaceId: WORKSPACE, kind: 'session', title: 'Made-up run of the writer', origin: 'fixture', actor: person,
    data: { state: 'running', servingAgent: WRITER },
  }).id
  theLargeChangeLog(theWritersNoteIds[0]!)
}, 120_000)
afterAll(async () => {
  await app?.close()
  t?.close()
  rmSync(made, { recursive: true, force: true })
  if (theHomeBefore === undefined) delete process.env.HOME
  else process.env.HOME = theHomeBefore
})

describe('what the run’s agent filed', () => {
  it('1. is its 30 notes, newest first in the order they were filed, and nothing else', () => {
    const wrote = inspection.whatTheInspectorReads(theRunOfTheWriter, WORKSPACE).wrote
    expect(wrote.map((one) => one.id), 'the records the writer filed').toEqual([...theWritersNoteIds].reverse())
    for (const other of theOtherAgentsNoteIds) expect(wrote.map((one) => one.id), 'the other agent’s note').not.toContain(other)
  })

})
