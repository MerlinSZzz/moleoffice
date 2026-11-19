// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKS READING READS THE PROJECT'S MERGE ENTRIES ONCE, NOT TWICE FOR EVERY CHECK ROW.
 *
 * MEASURED FIRST, on a narrow copy of the office: a reading of `GET /api/worker/queue?only=checks` with 5 check rows took
 * about 165 ms, and the profile put about 71 ms of each reading in `theNewestEntryOfARun`. Each check row asked it twice,
 * once for the hold for the run's report and once for the lane of the hourly cap, and each ask read every merge entry of
 * the project (1,152 entries, 11.2 MB) with json_extract, because no index serves `$.run`. Asked alone it took a median
 * of 6.3 ms.
 *
 * WHAT IS PROVED HERE, against a database made only for this file, with three check rows and two checks started in the
 * last hour:
 *
 *   1. THE SAME ANSWER. The run whose newest entry bounced for its report is held, and the sentence names that entry and
 *      not the older one. Each check's lane is the root of its run's newest entry, so a run with an older entry in another
 *      lane is paced in the newer lane. A run with no entry has no lane. Each lane counts the checks started there in the
 *      last hour, by the newest entry of the run each one checked.
 *   2. ONE READING OF THE ENTRIES FOR THE CHECK ROWS, AND ONE FOR THE HOUR'S COUNT. The statements that read merge
 *      entries by `$.run` are counted where they run, not where they are prepared, so a statement prepared once and run
 *      for every row still counts each time. The check rows' runs are read in one, and the runs the last hour's checks
 *      were for in one more, because that count reads every project and this file has one.
 *
 * CONTROL: red before the change, with 8 such statements (twice for each of the three check rows, and once for each of
 * the two checks of the hour). MUTATION: in the commit that adds the code.
 *
 * Every record here is synthetic and filed as a fixture; nothing reaches the live server.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let inspector = ''
let next = 0
const now = new Date()
const at = localStamp(now)
const anHourBefore = localStamp(new Date(now.getTime() - 50 * 60_000))
const aDayBefore = localStamp(new Date(now.getTime() - 24 * 3_600_000))
const asThePerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const LANE_OLD = '/synthetic/lane-old'
const LANE_A = '/synthetic/lane-a'
const LANE_B = '/synthetic/lane-b'
const checks = new Map<string, string>()
const entries = new Map<string, string>()

type Statement = Record<'all' | 'get' | 'run' | 'iterate', (...args: unknown[]) => unknown>
type CountedSqlite = { prepare: (this: unknown, sql: string) => Statement }
type ThePace = { lane?: string; started?: number; most?: number; notPaced?: string; cannotPace?: string }
type Row = { messageId: string; inspection?: { run: string; waits?: string; pace: ThePace } }

function record(id: string, kind: string, data: Record<string, unknown>, workspace = 'default', createdAt = at): void {
  t.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
    VALUES (?, ?, ?, ?, ?, ?, 'Synthetic merge entry reading', ?, 'fixture')`).run(id, workspace, THE_PERSON, createdAt, createdAt, kind, JSON.stringify(data))
  // ITS CREATE ROW, as the records door writes one with every record: the queue reads a merge entry's place in the order
  // written from it (`theOrderWritten` in src/server/lib/merge-queue.ts), and answers 500 for an entry that has none.
  t.client.sqlite.prepare(`INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, new_value, at)
    VALUES (?, ?, ?, 'create', 'human', ?, 'Synthetic merge entry reading', ?)`).run(`create-${id}`, id, workspace, THE_PERSON, createdAt)
}

/** A queued check ask to the inspector, and the finished run it asks a check of. */
function aCheckOf(run: string): void {
  const ask = `merge-reading-ask-${String(next++)}`
  record(ask, 'message', { body: 'Synthetic check ask.', notice: 'aCheckWasQueued', aboutRun: run, sentBy: { kind: 'agent', id: 'mole-office' }, to: [{ kind: 'agent', id: inspector }], writtenIn: { project: 'default' } }, 'message-centre')
  t.client.sqlite.prepare(`INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at)
    VALUES (?, ?, 'agent', ?, 'queued', ?)`).run(`delivery-${ask}`, ask, inspector, at)
  record(run, 'session', { state: 'finished', servingAgent: 'merge-reading-builder', theCheck: { message: ask, askedOf: 'merge-reading-inspector', askedAt: at, checkout: {}, says: 'Synthetic check request.' } })
  checks.set(run, ask)
}

/** A merge entry submitted on a run, landing in a lane; `bounced` makes it the entry that bounced for its report. */
function anEntryOf(run: string, root: string, createdAt: string, bounced = false): string {
  const id = `merge-reading-entry-${String(next++)}`
  record(id, 'merge_entry', {
    run,
    state: bounced ? 'bounced' : 'submitted',
    changeset: { adapter: 'git', root, branch: `synthetic-${run}` },
    ...(bounced ? { bounced: { reason: 'incomplete', at: createdAt } } : {}),
  }, 'default', createdAt)
  return id
}

/** A check the worker started in the last hour, as it files one: a session whose purpose is inspection. */
function aCheckStartedThisHour(run: string): void {
  record(`merge-reading-started-${String(next++)}`, 'session', { state: 'crashed', runtime: 'inspection-tool', extra: { purpose: 'inspection', inspectionRun: run } }, 'default', anHourBefore)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['merge-reading-inspector', 'merge-reading-builder']) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle, name: `Synthetic ${handle}`, workArea: ['src'] } })
    expect(reply.statusCode, reply.body).toBe(201)
    if (handle === 'merge-reading-inspector') inspector = (reply.json() as { agent: { id: string } }).agent.id
  }
  // RUN A: an older entry in another lane, and a newer one that bounced for its report.
  aCheckOf('merge-reading-run-a')
  entries.set('a-older', anEntryOf('merge-reading-run-a', LANE_OLD, aDayBefore))
  entries.set('a-newer', anEntryOf('merge-reading-run-a', LANE_A, anHourBefore, true))
  // RUN B: one entry, not bounced.
  aCheckOf('merge-reading-run-b')
  entries.set('b', anEntryOf('merge-reading-run-b', LANE_B, anHourBefore))
  // RUN C: no entry at all.
  aCheckOf('merge-reading-run-c')
  // TWO CHECKS STARTED IN THE LAST HOUR, of runs whose newest entry is in lane A and lane B. Run E also has an older
  // entry in the old lane, so a reading that took the oldest entry would count it there.
  anEntryOf('merge-reading-run-d', LANE_A, anHourBefore)
  aCheckStartedThisHour('merge-reading-run-d')
  anEntryOf('merge-reading-run-e', LANE_OLD, aDayBefore)
  anEntryOf('merge-reading-run-e', LANE_B, anHourBefore)
  aCheckStartedThisHour('merge-reading-run-e')
  // OTHER RUNS' ENTRIES, which no check here is for.
  for (let i = 0; i < 20; i++) anEntryOf(`merge-reading-other-${String(i)}`, LANE_OLD, aDayBefore)
}, 60_000)

afterAll(async () => { await app?.close(); t?.close() })

/** The queue's checks reading, and every statement that read merge entries by their run, counted each time it ran. */
async function theReading(): Promise<{ rows: Row[]; entryReads: string[] }> {
  const worker = await import('../src/server/lib/worker.ts')
  const sqlite = t.client.sqlite as unknown as CountedSqlite
  const original = sqlite.prepare
  const entryReads: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    const statement = original.call(this, sql)
    if (!sql.includes("'$.run'")) return statement
    for (const name of ['all', 'get', 'run', 'iterate'] as const) {
      const act = statement[name].bind(statement)
      statement[name] = (...args: unknown[]) => {
        entryReads.push(sql)
        return act(...args)
      }
    }
    return statement
  }
  try {
    return { rows: worker.theQueue('default', { only: 'checks' }) as unknown as Row[], entryReads }
  } finally {
    sqlite.prepare = original
  }
}

it('holds, paces and counts each check by its run\'s newest merge entry, and reads the entries once for the check rows', async () => {
  const { rows, entryReads } = await theReading()
  const rowOf = (run: string) => {
    const row = rows.find((one) => one.messageId === checks.get(run))
    expect(row?.inspection, `no check row for ${run}; rows: ${rows.map((one) => one.messageId).join(', ')}`).toBeDefined()
    return row!.inspection!
  }
  const a = rowOf('merge-reading-run-a')
  expect(a.waits, 'run A is held for its report').toContain(`merge entry ${entries.get('a-newer')!} bounced`)
  expect(a.waits).not.toContain(entries.get('a-older')!)
  expect(a.pace).toEqual({ lane: LANE_A, started: 1, most: a.pace.most })
  const b = rowOf('merge-reading-run-b')
  expect(b.waits, 'run B is not held').toBeUndefined()
  expect(b.pace).toEqual({ lane: LANE_B, started: 1, most: b.pace.most })
  const c = rowOf('merge-reading-run-c')
  expect(c.waits, 'run C is not held').toBeUndefined()
  expect(c.pace.notPaced, 'run C has no entry and no lane').toContain('merge-reading-run-c')
  expect(rows).toHaveLength(3)
  expect(entryReads, `the statements that read merge entries by their run:\n${entryReads.join('\n')}`).toHaveLength(2)
}, 60_000)
