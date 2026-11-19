// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN KEY PROVES ITS RUN WITHOUT READING THE REVISIONS. Wave 13r.
 *
 * A held message asks whether the run key on the request proves its own run (`theOwnRunThisRequestKeyProves` in
 * src/server/lib/keys.ts). For a key the office minted for a next round or a worker run, that reader used to look
 * through every revision of a session for a system-written `nextRound.started` or `workerRuns[*].started` naming the
 * run and its key. On the live office on 10 November 2026 that statement took 47 to 55 seconds, once per request,
 * while everything else in the request was under half a second. The same correlation is in the parent record's
 * current data, which is one primary-key read.
 *
 * WHAT IS PROVED HERE. A made-up office holds two runs whose keys the office minted, each with the system revision
 * the old scan would find, so that the old code passes the proof too and only the cost differs:
 *   1. a next-round run, whose parent is the launcher run naming the run it continues, and whose previous run's
 *      current data and system revision both carry `nextRound.started`;
 *   2. a worker run, whose parent is the supervisor's run carrying `workerRuns[<agent id>].started`, on its current
 *      data and on a system revision.
 * For each, the proof returns the child run's id and no statement reading the revisions for that pair runs at all.
 *
 * WHAT TURNS EACH RED. Make `theCurrentParentDataNamesThisStart` return false without reading the parent (or delete
 * the call), and the old scan runs once for each shape: the count assertion fails while the id assertion passes.
 *
 * Nothing here runs on a real office: the database is made in a temporary folder and every id, handle and word is
 * made up for it.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const HANDLE = 'a-made-up-run-key-holder'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AT = '2026-11-10 10:00:00'

let t: TestDb
let app: FastifyInstance
let keys: typeof import('../src/server/lib/keys.ts')
let agentId = ''
let officeId = ''
/** How many times the revisions scan ran while the proof last ran. */
let scanRuns = 0
let nextRound = { childId: '', key: '' }
let workerRun = { childId: '', key: '' }

/**
 * WHETHER A STATEMENT IS THE REVISIONS SCAN. It is recognised by the table it reads and the two stored shapes it looks
 * for, after its comments, whitespace, quoting and case are normalised, so a reformat cannot make the counter miss the
 * scan and let the test pass without proving anything. Any read of the revisions table for a
 * `nextRound.started` or `workerRuns[*].started` pair is the archive-wide read this fast path exists to avoid.
 *
 * WHY NOT A BEHAVIOUR COUNT. The made-up office's revisions table is tiny, so the cost of the scan here is a few
 * microseconds and cannot be told from the other revision reads the proof must make (the original mint and the
 * create). The one observable that separates the two paths is whether that archive-wide statement runs, and this is
 * it: normalised words, not one fixed run of text.
 *
 * THE TABLE IS COUNTED WHEREVER IT IS NAMED, QUALIFIED OR NOT. SQLite reads the same table through `revisions`,
 * `main.revisions` or `"main"."revisions"`, so the schema on the name is taken off before the table is looked for. A
 * counter that only knew the unqualified spelling would miss a qualified scan, and the test would pass green while
 * the archive-wide read ran (the check's fault of 10 November 2026).
 */
function readsTheRevisionsScan(text: string): boolean {
  const sql = text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/["`[\]]/g, ' ')
    .replace(/\b[a-z_][a-z0-9_]*\s*\.\s*revisions\b/gi, 'revisions')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return sql.includes('from revisions') && sql.includes('nextround.started') && sql.includes('workerruns')
}
/** What the counter says it counted, so a failure names the read rather than a line of SQL. */
const THE_SCAN_DESCRIPTION = 'a read of the revisions for nextRound.started or workerRuns[*].started'

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE MODULE IS IMPORTED AND THE PROOF RUNS, so the statement cannot be prepared
  // without it. Every way the statement can run is counted, so a later writer using all() or iterate() is counted too.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    if (!readsTheRevisionsScan(text)) return statement
    for (const method of ['get', 'all', 'run', 'iterate', 'values']) {
      const original = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof original !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        scanRuns += 1
        return original.apply(this, args)
      }
    }
    const bind = statement['bind'] as ((...args: unknown[]) => unknown) | undefined
    if (typeof bind === 'function') {
      statement['bind'] = function (this: unknown, ...args: unknown[]) {
        const bound = bind.apply(this, args) as (...inner: unknown[]) => unknown
        return function (this: unknown, ...inner: unknown[]) {
          scanRuns += 1
          return bound.apply(this, inner)
        }
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  keys = await import('../src/server/lib/keys.ts')
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: HANDLE, name: 'A made-up run key holder' },
  })
  expect(started.statusCode, started.body).toBe(201)
  agentId = (JSON.parse(started.body) as { agent: { id: string } }).agent.id
  const office = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('mole-office') as
    | { id: string }
    | undefined
  if (office === undefined) throw new Error('The made-up office has no office row to write its own revisions under.')
  officeId = office.id
  nextRound = buildTheNextRoundShape()
  workerRun = buildTheWorkerRunShape()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** A session record written straight into the made-up office, with no door and no revision of its own yet. */
function anInsertedRun(id: string, title: string, data: Record<string, unknown>): void {
  t.client.sqlite
    .prepare('INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, PROJECT, THE_PERSON, 'session', title, JSON.stringify(data), AT, AT)
}

/** One revision written straight into the made-up office. The office's own writes are the system actor. */
function anInsertedRevision(input: {
  id: string
  recordId: string
  seq: number
  op: 'create' | 'update'
  data: Record<string, unknown>
  provedBy: string | null
}): void {
  const data = JSON.stringify(input.data)
  t.client.sqlite
    .prepare(
      'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, session_id, at, proved_by, proved_holder) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      input.id,
      input.recordId,
      PROJECT,
      input.seq,
      createHash('sha256').update(data).digest('hex'),
      'session',
      'A made-up run',
      data,
      input.op,
      'system',
      officeId,
      null,
      AT,
      input.provedBy,
      null,
    )
}

/** A run key row whose hash is the SHA-256 of the made-up key, as the mint stores it. */
function anInsertedRunKey(id: string, key: string, madeAt: string): void {
  t.client.sqlite
    .prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, revoked_at) VALUES (?, 'agent', ?, ?, ?, NULL)")
    .run(id, agentId, createHash('sha256').update(key).digest('hex'), madeAt)
}

/**
 * The child run and its key, built directly: a running session that names its parent and its key, its create and its
 * mint revision, and the key row the mint's revision is matched against.
 */
function aChildRunAndItsKey(childId: string, keyId: string, key: string, parentId: string): void {
  const created = { state: 'running', servingAgentId: agentId, parentAttachment: parentId, extra: {} }
  const minted = { ...created, extra: { runKeyId: keyId } }
  anInsertedRun(childId, 'A made-up run whose key the office minted', minted)
  anInsertedRevision({ id: `${childId}-create`, recordId: childId, seq: 1, op: 'create', data: created, provedBy: 'the-office-key' })
  anInsertedRevision({ id: `${childId}-mint`, recordId: childId, seq: 2, op: 'update', data: minted, provedBy: 'the-office-key' })
  anInsertedRunKey(keyId, key, AT)
}

/** The launcher run names the run the round continues, and that run's current data and system revision carry the start. */
function buildTheNextRoundShape(): { childId: string; key: string } {
  const previousId = 'made-up-run-before-the-round'
  const wrapperId = 'made-up-round-launcher'
  const childId = 'made-up-next-round-run'
  const keyId = 'made-up-next-round-key'
  const key = '1'.repeat(64)
  const started = { run: childId, runKeyId: keyId }
  anInsertedRun(previousId, 'A made-up run a round continues', { state: 'finished', servingAgentId: agentId, nextRound: { started } })
  anInsertedRun(wrapperId, 'A made-up round launcher', { state: 'running', startedByMoleOffice: true, extra: { purpose: 'round', round: previousId } })
  aChildRunAndItsKey(childId, keyId, key, wrapperId)
  anInsertedRevision({ id: 'made-up-the-round-started', recordId: previousId, seq: 1, op: 'update', data: { nextRound: { started } }, provedBy: null })
  return { childId, key }
}

/** The supervisor's run keeps the worker's entry, on its current data and on a system revision. */
function buildTheWorkerRunShape(): { childId: string; key: string } {
  const parentId = 'made-up-supervisors-run'
  const childId = 'made-up-worker-run'
  const keyId = 'made-up-worker-run-key'
  const key = '2'.repeat(64)
  const workerRuns = { [agentId]: { started: { run: childId, runKeyId: keyId } } }
  anInsertedRun(parentId, 'A made-up supervisor run', { state: 'running', workerRuns })
  aChildRunAndItsKey(childId, keyId, key, parentId)
  anInsertedRevision({ id: 'made-up-the-worker-run-started', recordId: parentId, seq: 1, op: 'update', data: { workerRuns }, provedBy: null })
  return { childId, key }
}

/** The run id the key proves, with the scans of the revisions counted while it ran. */
function theProofForKey(key: string, childId: string): string | undefined {
  scanRuns = 0
  const req = {
    headers: {
      'x-mole-office-key': key,
      'x-mole-office-session': childId,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': HANDLE,
      'x-mole-office-workspace': PROJECT,
    },
  } as unknown as FastifyRequest
  return keys.theOwnRunThisRequestKeyProves(req)
}

describe('a run key proves its run from the parent record, not the revisions', () => {
  it('0. counts the revisions scan however its table is schema-qualified', () => {
    // The check's fault: with the fast path off and the scan written as `FROM main.revisions`, the old counter saw
    // nothing and the test stayed green while the archive-wide read ran. Each spelling below is the same table read.
    const scan = "SELECT 1 FROM %s v WHERE json_extract(v.data, '$.nextRound.started.run') = ? AND EXISTS (SELECT 1 FROM json_each(v.data, '$.workerRuns') w)"
    for (const table of ['revisions', 'main.revisions', 'main . revisions', '"main"."revisions"', 'temp.revisions']) {
      expect(readsTheRevisionsScan(scan.replace('%s', table)), table).toBe(true)
    }
  })

  it('1. a next-round run is proved from the run it continues, with no scan of the revisions', () => {
    expect(theProofForKey(nextRound.key, nextRound.childId)).toBe(nextRound.childId)
    expect(scanRuns, THE_SCAN_DESCRIPTION).toBe(0)
  })

  it('2. a worker run is proved from its supervisor run, with no scan of the revisions', () => {
    expect(theProofForKey(workerRun.key, workerRun.childId)).toBe(workerRun.childId)
    expect(scanRuns, THE_SCAN_DESCRIPTION).toBe(0)
  })
})
