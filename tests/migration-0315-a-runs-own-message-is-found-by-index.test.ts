// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0315 MAKES ONE INDEX, SO A RUN'S OWN MESSAGE TO ITS STARTER IS FOUND FROM THE RUN'S OWN CREATE REVISIONS.
 *
 * Wave 13s round 189, item 37. When a run seals, `theRunsOwnMessageTo` (src/server/lib/sealed-tip.ts) finds the newest
 * message the run wrote that was delivered to its starter, and the round's end asks the same
 * (src/server/lib/how-a-round-ended.ts). No index of the revisions was on the session, so the read started from every
 * delivery to the starter: thousands for a secretary. That took a median of 41 ms on the made-up office of 22 October,
 * given a made-up create revision for each record, and up to 5.7 s in the live office's slow record writes. Migration
 * 0315 indexes each create revision by its session, and the read now starts there and names the index. The answers
 * stay as they were.
 *
 * WHAT IS HELD HERE, in a fresh test database:
 *   A. the index is in the database, on the session, with `op = 'create'` as its WHERE, under the name schema.ts gives;
 *   B. the read names the index, and SQLite's plan for it starts from the index and reads no delivery by its recipient;
 *   C. the read answers what the messages written here say it must: the run's message written last that a delivery
 *      gives the starter, and not one written later in time words; never a message the run wrote to somebody else, a
 *      record of another kind, a deleted message, a message another run wrote, or one the run only changed; null where
 *      there is none. The read the code had before gives the same answer to every question asked here;
 *   D. a missing index is an error, not a slow read;
 *   E. the way back passes the migration: `theWayBackCheck` in tools/stable/the-way-back.mjs finds that it only adds.
 *
 * Cases A, B, D and E fail before the migration and the changed read. Case C holds before and after.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `theRunsOwnMessageTo`, put back the read that starts from the deliveries. Cases B and D go red.
 *   2. In the migration, take `WHERE op = 'create'` off the index. Case A goes red.
 *   3. In the read, take out `v.op = 'create'`. Cases B and C go red: SQLite finds no plan that uses the index the read
 *      names. Case D stays green, because the dropped index is named first.
 *   4. In the EXISTS, ask the delivery's kind and not its id: `? IS NOT NULL` for `d.recipient_id = ?`. Case C goes red.
 *   5. In the read, order by `r.created_at DESC`. Case C goes red.
 *   6. In the migration, add a second statement, `DELETE FROM revisions WHERE 0`, after a statement breakpoint. Case E
 *      goes red.
 *   7. In schema.ts, name the index `revisions_session_created_idx`. Cases A, B, C and D go red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every agent, run and
 * message here is made up, written through the records door; every title begins with "Made-up".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** The index, under the name schema.ts and the migration give it. */
const INDEX = 'revisions_session_create_idx'
/** The migration's tag without its number, which the merge queue may change. */
const TAG = '_a_runs_own_message_is_found_by_index'
const WORKSPACE = 'default'
const STARTER = 'made-up-r189-secretary'
const OTHER_STARTER = 'made-up-r189-other-secretary'
const WORKER = 'made-up-r189-worker'
const asThePerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const

/**
 * THE READ AS IT WAS BEFORE MIGRATION 0315, word for word but for the order of writing, which is
 * `theOrderWritten('r')` in src/server/lib/merge-queue.ts. Case C asks it every question it asks the
 * read, so the new read is held to the old one's answers.
 */
const THE_READ_BEFORE =
  "SELECT r.id AS id, (SELECT changes.append_order FROM changes WHERE changes.record_id = r.id AND changes.op = 'create') AS written " +
  'FROM message_delivery d JOIN records r ON r.id = d.message_id ' +
  "JOIN revisions v ON v.record_id = r.id AND v.op = 'create' " +
  "WHERE d.recipient_kind = ? AND d.recipient_id = ? AND v.session_id = ? AND r.kind = 'message' AND r.deleted_at IS NULL " +
  'ORDER BY written DESC NULLS FIRST, r.rowid DESC LIMIT 1'

/** 10:00 on 21 October 2026, and the same hour an hour on, so that time words can be made to disagree with the order. */
const TEN = Date.UTC(2026, 9, 21, 10, 0, 0)
const ELEVEN = Date.UTC(2026, 9, 21, 11, 0, 0)

let t: TestDb
let app: FastifyInstance
let schema: typeof import('../src/server/db/schema.ts')
let sealedTip: typeof import('../src/server/lib/sealed-tip.ts')
let wayBack: typeof import('../tools/stable/the-way-back.mjs')
let migrations: string
const ids: Record<string, string> = {}
const runs: Record<string, string> = {}

/** The SQL of this migration, found in the journal by its tag. */
function theMigration(): { tag: string; sql: string } {
  const journal = JSON.parse(readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  const entry = journal.entries.find((one) => one.tag.endsWith(TAG))
  if (entry === undefined) throw new Error(`The migration journal holds no migration ending ${TAG}.`)
  return { tag: entry.tag, sql: readFileSync(join(migrations, `${entry.tag}.sql`), 'utf8') }
}

/** Each reading statement `work` ran, with its values. */
function theReadsDuring(work: () => unknown): { sql: string; values: unknown[] }[] {
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, (...values: unknown[]) => unknown>
  const ran: { sql: string; values: unknown[] }[] = []
  const kept = { get: proto['get']!, all: proto['all']! }
  for (const method of ['get', 'all'] as const) {
    const real = kept[method]
    proto[method] = function (this: { source: string }, ...values: unknown[]) {
      ran.push({ sql: this.source, values })
      return real.apply(this, values)
    }
  }
  try {
    work()
  } finally {
    proto['get'] = kept.get
    proto['all'] = kept.all
  }
  return ran.filter((one) => /^\s*select/i.test(one.sql))
}

/** A made-up run of the worker, filed by the person. */
function aRun(name: string): string {
  const id = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: `Made-up run ${name}`, origin: 'fixture', actor: person, data: { state: 'running', servingAgent: WORKER } }).id
  runs[name] = id
  return id
}

/** A made-up record the worker writes at this moment in a run's session, to the agents named. */
function written(name: string, opts: { at: number; run: string; to: string[]; kind?: 'message' | 'note' }): string {
  vi.setSystemTime(opts.at)
  const kind = opts.kind ?? 'message'
  const id = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind,
    title: `Made-up ${kind} ${name}`,
    actor: { type: 'agent', id: WORKER, sessionId: opts.run },
    data: kind === 'message' ? { to: opts.to.map((one) => ({ kind: 'agent', id: one })), body: `Made up for this test: ${name}.` } : { body: `Made up for this test: ${name}.` },
  }).id
  ids[name] = id
  return id
}

const agentIds: Record<string, string> = {}
const starter = (handle: string) => ({ kind: 'agent' as const, id: agentIds[handle]! })

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [[STARTER, 'secretary'], [OTHER_STARTER, 'secretary'], [WORKER, 'worker']] as const) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle, name: `Made-up ${role} ${handle}`, role } })
    expect(made.statusCode, made.body).toBe(201)
    agentIds[handle] = (JSON.parse(made.body) as { agent: { id: string } }).agent.id
  }
  schema = await import('../src/server/db/schema.ts')
  sealedTip = await import('../src/server/lib/sealed-tip.ts')
  wayBack = await import('../tools/stable/the-way-back.mjs')
  migrations = (await import('../src/config/settings.mjs')).THE_MIGRATIONS_FOLDER
  vi.useFakeTimers({ toFake: ['Date'], now: TEN })

  const one = aRun('one')
  const two = aRun('two')
  aRun('silent')
  const s = agentIds[STARTER]!
  const other = agentIds[OTHER_STARTER]!
  // WRITTEN FIRST, LATER IN TIME WORDS: the one written after it is the newest, though its words say an hour earlier.
  written('one-first', { at: ELEVEN, run: one, to: [s] })
  written('one-last-to-the-starter', { at: TEN, run: one, to: [s, other] })
  // WRITTEN LATER BY THE SAME RUN, AND NONE OF THEM COUNTS for the starter.
  written('one-to-the-other-only', { at: TEN, run: one, to: [other] })
  written('one-a-note', { at: TEN, run: one, to: [], kind: 'note' })
  const deleted = written('one-deleted', { at: TEN, run: one, to: [s] })
  t.api.deleteRecord(deleted, { type: 'agent', id: WORKER, sessionId: one })
  // ANOTHER RUN'S MESSAGE TO THE STARTER, which run one then changes: a change is not a create.
  const theirs = written('two-to-the-starter', { at: TEN, run: two, to: [s] })
  vi.setSystemTime(TEN)
  t.api.patchRecord(theirs, { title: 'Made-up message two-to-the-starter, changed by run one' }, { type: 'agent', id: WORKER, sessionId: one })
}, 60_000)

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
})

describe('A. the index', () => {
  it("holds each create revision by its session, under the name schema.ts gives", () => {
    expect((schema as Record<string, unknown>)['THE_CREATE_REVISIONS_BY_SESSION_INDEX'], 'the name schema.ts exports').toBe(INDEX)
    const row = t.client.sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(INDEX) as { sql: string } | undefined
    expect(row, `the index ${INDEX}`).toBeDefined()
    expect(row!.sql.replaceAll('`', '').replace(/\s+/g, ' ')).toBe(`CREATE INDEX ${INDEX} ON revisions (session_id) WHERE op = 'create'`)
  })
})

describe('B. the read', () => {
  it('names the index, and SQLite starts from it and reads no delivery by its recipient', () => {
    const reads = theReadsDuring(() => sealedTip.theRunsOwnMessageTo(runs['one']!, starter(STARTER))).filter((one) => /\brevisions\b/.test(one.sql))
    expect(reads.map((one) => one.sql), 'theRunsOwnMessageTo reads the revisions in one statement').toHaveLength(1)
    const [one] = reads
    expect(one!.sql).toContain(`FROM revisions v INDEXED BY ${INDEX} `)
    expect(one!.sql).toContain("v.op = 'create'")
    const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one!.sql}`).all(...one!.values) as { detail: string }[]).map((step) => step.detail)
    expect(plan[0], plan.join(' | ')).toBe(`SEARCH v USING INDEX ${INDEX} (session_id=?)`)
    expect(plan.join(' | ')).not.toContain('message_delivery_recipient_idx')
    expect(plan.filter((step) => /\bSCAN\b/.test(step)), plan.join(' | ')).toEqual([])
  })
})

describe('C. what the read answers', () => {
  it("is the run's message written last that went to the starter, null where there is none, and the old read's answer", () => {
    const asked = (run: string, who: string) => sealedTip.theRunsOwnMessageTo(runs[run]!, starter(who))
    expect(asked('one', STARTER), 'the one written last, not the one whose time words are latest').toBe(ids['one-last-to-the-starter'])
    expect(asked('one', OTHER_STARTER), 'to the other starter, the message to it alone came after').toBe(ids['one-to-the-other-only'])
    expect(asked('two', STARTER), "run two's own").toBe(ids['two-to-the-starter'])
    expect(asked('two', OTHER_STARTER)).toBeNull()
    expect(asked('silent', STARTER)).toBeNull()
    expect(sealedTip.theRunsOwnMessageTo('no-such-run', starter(STARTER))).toBeNull()
    expect(sealedTip.theRunsOwnMessageTo(runs['one']!, { kind: 'person', id: agentIds[STARTER]! }), 'a person of the same id').toBeNull()
    // THE TIME WORDS DISAGREE WITH THE ORDER, or the first answer above would mean nothing.
    expect(t.api.getRecord(ids['one-last-to-the-starter']!)!.createdAt < t.api.getRecord(ids['one-first']!)!.createdAt).toBe(true)
    const before = t.client.sqlite.prepare(THE_READ_BEFORE)
    for (const run of Object.keys(runs)) {
      for (const who of [{ kind: 'agent', id: agentIds[STARTER]! }, { kind: 'agent', id: agentIds[OTHER_STARTER]! }, { kind: 'agent', id: agentIds[WORKER]! }, { kind: 'person', id: agentIds[STARTER]! }] as const) {
        const old = (before.all(who.kind, who.id, runs[run]!) as { id: string }[])[0]?.id ?? null
        expect(sealedTip.theRunsOwnMessageTo(runs[run]!, who), `run ${run}, ${who.kind} ${who.id}`).toBe(old)
      }
    }
  })
})

describe('D. a missing index', () => {
  it('is an error, not a slow read', () => {
    const db = t.client.sqlite
    db.exec(`SAVEPOINT without_the_index; DROP INDEX IF EXISTS ${INDEX};`)
    try {
      expect(() => sealedTip.theRunsOwnMessageTo(runs['one']!, starter(STARTER))).toThrow(`no such index: ${INDEX}`)
    } finally {
      db.exec('ROLLBACK TO without_the_index; RELEASE without_the_index;')
    }
    expect(db.prepare("SELECT 1 AS here FROM sqlite_master WHERE type = 'index' AND name = ?").get(INDEX), 'the index is back').toEqual({ here: 1 })
  })
})

describe('E. the way back', () => {
  it('finds that the migration only adds, so the previous version may run on the database it leaves', async () => {
    const { THE_STATEMENT_BREAKPOINT } = await import('../src/config/migration-look.mjs')
    const { tag } = theMigration()
    const journalPath = `${wayBack.THE_MIGRATIONS_PATH}/meta/_journal.json`
    const journal = JSON.parse(readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
    const without = { ...journal, entries: journal.entries.filter((one) => one.tag !== tag) }
    // A GIT OF TWO VERSIONS MADE OF THIS TREE: the newer is the tree, the older is the tree without this migration.
    const blobs = new Map<string, string>()
    const tree = (version: 'older' | 'newer') => {
      const entries = version === 'newer' ? journal.entries : without.entries
      blobs.set(`${version}:journal`, JSON.stringify(version === 'newer' ? journal : without))
      const lines = [`100644 blob ${version}:journal\t${journalPath}`]
      for (const one of entries) {
        blobs.set(`file:${one.tag}`, readFileSync(join(migrations, `${one.tag}.sql`), 'utf8'))
        lines.push(`100644 blob file:${one.tag}\t${wayBack.THE_MIGRATIONS_PATH}/${one.tag}.sql`)
      }
      return lines.join('\0')
    }
    const steps = readFileSync(new URL(`../${wayBack.THE_STEPS_FILE}`, import.meta.url), 'utf8')
    const theMadeUpGit = (args: string[]): string => {
      if (args[0] === 'ls-tree') return tree(args[3] as 'older' | 'newer')
      if (args[0] === 'cat-file') return blobs.get(args[2]!)!
      if (args[0] === 'show') return steps
      throw new Error(`The made-up git was asked ${args.join(' ')}.`)
    }
    const checked = wayBack.theWayBackCheck(theMadeUpGit, 'older', 'newer', [])
    expect(checked.refusal).toBeNull()
    expect(checked.checked).toEqual([tag])
    for (const statement of theMigration().sql.split(THE_STATEMENT_BREAKPOINT)) {
      expect(wayBack.whatAStatementChanges(statement, new Set(), [])).toBeNull()
    }
  })
})
