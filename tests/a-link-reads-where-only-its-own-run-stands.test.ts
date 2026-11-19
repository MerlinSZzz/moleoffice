// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A RUN STANDS IS READ FROM ITS OWN LINKS AND WRITES, AND COMES OUT AS IT DID.
 *
 * Round 109 of wave 13y, item 42. POST /api/sessions/:id/link says where the run it links from now stands
 * (`sessionPlacement` in src/server/lib/sessions.ts). To place that one run it read every link of the project and every
 * record at either end of one. A link by `<tool>:<id>` read all of that twice: the sweep that finds the run also worked
 * out where every run stands, and the link used none of it. On a made-up office of the live office's sizes (32,434
 * records, 40,634 links and 542,827 changes in one project), with a made-up home folder of the live server's transcript
 * sizes, a link by record id took 402 ms and a link by `<tool>:<id>` took 909 ms.
 *
 * WHAT IS HELD HERE:
 *   1. `sessionPlacement` gives what the placement rule gives from the reading of the whole project: `placementOf` over
 *      `readSessionEvidence`. The runs cover each answer the rule gives: linked to a module and to a pipeline, linked to
 *      a block, wrote to a block, wrote to a record linked to a module, wrote nothing, linked to something that reaches
 *      nothing, rows that carry the run's title instead of its id, a link to a deleted record, and a write older than the
 *      newest rows the rule reads. The made-up change rows that push that write out of those rows are written into the
 *      table, as the rule reads only their time, their record and their run.
 *   2. A link from a run by its record id reads no record that only the pipeline is linked to, even from a run that wrote
 *      to that pipeline.
 *   3. A link from a run by its tool and conversation reads no such record either.
 *
 * Every run, transcript and record here is made up.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
/** The title of a task that only the pipeline is linked to. Only a read of every link's far end gives it back. */
const ONLY_THE_PIPELINE_LINKS_IT = 'A made-up task that only the pipeline is linked to'
const HUMAN = { type: 'human' as const, id: THE_PERSON }
const AGENT = (sessionId: string) => ({ type: 'agent' as const, id: 'claude-code', sessionId })
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
/** How many made-up change rows are newer than the old write: the most the rule reads. */
const NEWER_ROWS = 100_000

let t: TestDb
let app: FastifyInstance
let S: typeof import('../src/server/lib/sessions.ts')
const home = mkdtempSync(join(tmpdir(), 'mole-office-placement-'))
const projectDir = join(home, '.claude', 'projects', '-made-up-project')
const EXTERNAL_ID = 'eeeeeeee-0000-4000-8000-000000000001'

const env: AdapterEnv = {
  homeDir: home,
  now: new Date(),
  scanProcesses: () => ({ ok: true, processes: [] }),
  runningWithinSeconds: 5 * 60,
  orphanAfterSeconds: 6 * 60 * 60,
}

const THE_RUNS = [
  'a run linked to a module and to the pipeline',
  'a run that wrote to a block',
  'a run that wrote to a record linked to a module',
  'a run that wrote nothing',
  'a run linked to something that reaches nothing',
  'a run linked to a block that wrote to the pipeline and linked a module',
  'a run whose rows carry its title',
  'a run linked to a deleted record that wrote to another',
  'a run whose only write is older than the rows read',
  'a run filed from a transcript',
] as const
type ARun = (typeof THE_RUNS)[number]

/** Where each run stands by the reading of the whole project: the places it reaches, or why it reaches none. */
const WHAT_EACH_RUN_IS: Record<ARun, string[] | string> = {
  'a run linked to a module and to the pipeline': ['A made-up module', 'A made-up pipeline'],
  'a run that wrote to a block': ['A made-up pipeline'],
  'a run that wrote to a record linked to a module': ['A made-up second module'],
  'a run that wrote nothing': 'wrote-nothing',
  'a run linked to something that reaches nothing': 'reaches-nothing',
  'a run linked to a block that wrote to the pipeline and linked a module': ['A made-up module', 'A made-up pipeline'],
  'a run whose rows carry its title': ['A made-up second module'],
  'a run linked to a deleted record that wrote to another': 'reaches-nothing',
  'a run whose only write is older than the rows read': 'wrote-nothing',
  'a run filed from a transcript': ['A made-up pipeline'],
}

const runs = new Map<ARun, string>()
/** A task for each link to point at, so no two links are the same link. */
let targets = 0

async function post(url: string, body: unknown): Promise<string> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: JSON.stringify(body) })
  expect(reply.statusCode, `POST ${url}: ${reply.body}`).toBeLessThan(300)
  return (reply.json() as { record: { id: string } }).record.id
}

const aRecord = (kind: 'task' | 'module' | 'pipeline' | 'problem', title: string) => t.api.createRecord({ workspaceId: HERE, kind, title, actor: HUMAN }).id
const aLink = (fromId: string, toId: string, type: 'part_of' | 'relates_to' | 'discusses') => t.api.createLink({ fromId, toId, type, actor: HUMAN })
const deleted = (id: string) => t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-10-29 11:00:00' WHERE id = ?").run(id)
/** A change row as the log holds it, by what the placement rule reads of one: the record, the run and the time. */
function aRow(recordId: string, sessionId: string | null, at: string): void {
  t.client.sqlite
    .prepare("INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, at) VALUES (?, ?, ?, 'update', 'agent', 'claude-code', ?, 'summary', ?)")
    .run(`made-up-row-${recordId}-${at}`, recordId, HERE, sessionId, at)
}

/** Each statement `run` prepares and runs, with what it gave back. */
function theStatementsOf(run: () => unknown): { sql: string; gave: string }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  const ran: { sql: string; gave: string }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const gave = call.apply(this, args)
        ran.push({ sql: text, gave: JSON.stringify(gave, (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value)) ?? '' })
        return gave
      }
    }
    return statement
  }
  try {
    run()
  } finally {
    sqlite.prepare = prepare
  }
  return ran
}

/** The statements of a link from `id`, which gave back the title only the pipeline's link leads to. */
function whatALinkReadThatOnlyThePipelineLeadsTo(id: string): string[] {
  targets += 1
  const toId = aRecord('task', `A made-up task for link ${targets}`)
  const ran = theStatementsOf(() => S.linkSession(id, { toId, type: 'relates_to' }, HUMAN, HERE, env))
  return ran.filter((one) => one.gave.includes(ONLY_THE_PIPELINE_LINKS_IT)).map((one) => one.sql)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  S = await import('../src/server/lib/sessions.ts')
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(
    join(projectDir, `${EXTERNAL_ID}.jsonl`),
    `${JSON.stringify({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: 'made-up' }, timestamp: new Date(Date.now() - 60 * 60_000).toISOString(), userType: 'external', entrypoint: 'cli', cwd: '/made-up-project', version: '2.1.223' })}\n`,
  )

  const module = aRecord('module', 'A made-up module')
  const secondModule = aRecord('module', 'A made-up second module')
  const pipeline = aRecord('pipeline', 'A made-up pipeline')
  const firstBlock = t.blocks.addBlock(pipeline, { name: 'A made-up first block', state: 'doing' }, HUMAN).block.id
  const secondBlock = t.blocks.addBlock(pipeline, { name: 'A made-up second block', state: 'doing' }, HUMAN).block.id
  aLink(aRecord('task', ONLY_THE_PIPELINE_LINKS_IT), pipeline, 'part_of')

  for (const is of THE_RUNS) {
    const stamp = is === 'a run filed from a transcript'
      ? { extra: { discovered: { tool: 'claude-code', externalId: EXTERNAL_ID, logPath: join(projectDir, `${EXTERNAL_ID}.jsonl`), observedState: 'running', at: '2026-10-29 11:00:00' } } }
      : {}
    runs.set(is, await post('/api/records', { kind: 'session', title: `A made-up title of ${is}`, data: { state: 'running', runtime: 'claude-code', doing: 'made-up', ...stamp } }))
  }
  const run = (is: ARun) => runs.get(is)!

  aLink(run('a run linked to a module and to the pipeline'), module, 'part_of')
  aLink(run('a run linked to a module and to the pipeline'), pipeline, 'relates_to')
  t.api.patchRecord(firstBlock, { summary: 'Made-up words written by a run.' }, AGENT(run('a run that wrote to a block')))
  const written = t.api.createRecord({ workspaceId: HERE, kind: 'task', title: 'A made-up task a run wrote', actor: AGENT(run('a run that wrote to a record linked to a module')) }).id
  aLink(written, secondModule, 'part_of')
  aLink(run('a run linked to something that reaches nothing'), aRecord('problem', 'A made-up problem'), 'discusses')
  aLink(run('a run linked to a block that wrote to the pipeline and linked a module'), secondBlock, 'part_of')
  aLink(run('a run linked to a block that wrote to the pipeline and linked a module'), module, 'relates_to')
  t.api.patchRecord(pipeline, { summary: 'Made-up words written by a run.' }, AGENT(run('a run linked to a block that wrote to the pipeline and linked a module')))
  aRow(secondModule, 'A made-up title of a run whose rows carry its title', '2026-10-29 10:00:00')
  const gone = aRecord('task', 'A made-up task that was deleted')
  aLink(run('a run linked to a deleted record that wrote to another'), gone, 'relates_to')
  const goneWritten = t.api.createRecord({ workspaceId: HERE, kind: 'task', title: 'A made-up task a run wrote that was deleted', actor: AGENT(run('a run linked to a deleted record that wrote to another')) }).id
  aLink(goneWritten, module, 'part_of')
  deleted(gone)
  deleted(goneWritten)
  aLink(run('a run filed from a transcript'), firstBlock, 'relates_to')

  // THE OLD WRITE, AND THE ROWS NEWER THAN IT. The rule reads the newest rows of the log, up to its ceiling, and these
  // made-up rows fill that ceiling, so the old write is not among the rows read.
  aRow(module, run('a run whose only write is older than the rows read'), '2020-01-01 00:00:00')
  t.client.sqlite
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, at, append_order)
       SELECT 'made-up-newer-row-' || i, 'made-up-record-of-the-newer-rows', ?, 'update', 'human', ?, NULL, 'summary', '2021-01-01 00:00:00', 100000000 + i FROM n`,
    )
    .run(NEWER_ROWS, HERE, THE_PERSON)
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(home, { recursive: true, force: true })
})

describe('where a run stands, read for one run', () => {
  for (const is of THE_RUNS) {
    it(`1. is what the reading of the whole project gives: ${is}`, () => {
      const id = runs.get(is)!
      const whole = S.placementOf(id, id, S.readSessionEvidence(HERE))
      // CONTROL: the run is what its name says, by the reading of the whole project.
      const expected = WHAT_EACH_RUN_IS[is]
      if (typeof expected === 'string') expect(whole).toMatchObject({ kind: 'unassigned', reason: { why: expected } })
      else expect(whole.kind === 'in' ? [whole.primary, ...whole.also].map((claim) => claim.project.title).sort() : whole).toEqual(expected)
      expect(S.sessionPlacement(id, id, HERE)).toEqual(whole)
    }, 60_000)
  }

  it('1. is what the reading of the whole project gives: a run nobody filed', () => {
    expect(S.sessionPlacement('claude-code:made-up', null, HERE)).toEqual(S.placementOf('claude-code:made-up', null, S.readSessionEvidence(HERE)))
    // CONTROL: the rows read reach the ceiling, so the old write is outside them.
    expect(S.placementReading(S.readSessionEvidence(HERE))).toMatchObject({ changesCapped: true })
  }, 60_000)

  it('2. a link by the run’s record id reads no record that only the pipeline is linked to', () => {
    // CONTROL: the reading of the whole project gives that record back, so a statement that read it would be seen.
    expect(theStatementsOf(() => S.readSessionEvidence(HERE)).filter((one) => one.gave.includes(ONLY_THE_PIPELINE_LINKS_IT))).not.toEqual([])
    expect(whatALinkReadThatOnlyThePipelineLeadsTo(runs.get('a run linked to a block that wrote to the pipeline and linked a module')!)).toEqual([])
  }, 60_000)

  it('3. a link by the run’s tool and conversation reads no record that only the pipeline is linked to', () => {
    expect(whatALinkReadThatOnlyThePipelineLeadsTo(`claude-code:${EXTERNAL_ID}`)).toEqual([])
  }, 60_000)
})
