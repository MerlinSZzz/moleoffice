// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0328 MAKES ONE INDEX, SO A TURN DRAFT HELD NOW IS FOUND WITHOUT READING EVERY DRAFT.
 *
 * Wave 13r round BV. An agent's run holds what it writes in a turn as a turn draft, and a sent draft is kept
 * (src/server/lib/turn-drafts.ts). The conversation with an agent asks on every read whom the agent is replying to, for
 * the chat's Replying, and a run's own reads and each pass of the reminders ask for the drafts held now. Each read went
 * through records_kind_idx and the data of every draft: 11.7 ms a read at 10,000 drafts, measured on a made-up table.
 * Migration 0328 makes an index of the drafts held now, by the agent they are held for, and each read names that
 * index's WHERE in the words src/server/db/schema.ts holds.
 *
 * WHAT IS HELD HERE, in a fresh test database:
 *   A. the index is in the database, on the held agent, and its WHERE is the draft kind and the words of
 *      `STORED_FIELDS.heldTurnDraftAgentId`, so the migration's SQL and the reads cannot drift apart;
 *   C. whom an agent is replying to is the readers of its held drafts alone: never a sent draft, a draft refused when
 *      it went, a deleted draft, another agent's, a draft with no turn or a message; and data that is not JSON stops
 *      nothing;
 *   B. the reads hold those words, and SQLite's plan for each starts from the index and reads no draft by its kind:
 *      whom an agent is replying to, and the drafts each pass of the reminders sends;
 *   D. the words are the writer's own: they name `TURN` and `SENT_AS`, and a draft marked sent leaves the index;
 *   E. the way back passes the migration: `theWayBackCheck` in tools/stable/the-way-back.mjs finds that it only adds.
 *
 * C runs before B, because the pass B watches sends the drafts it finds. Before the code the file is red as a whole:
 * src/shared/turn-drafts.ts, which it reads `TURN` from, does not exist yet, so no case runs.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `whomAnAgentIsReplyingTo`, ask the agent in plain `json_extract` words, not the shared ones. B and C go red.
 *   2. In the migration, take `kind = 'draft'` out of the index's WHERE. A goes red.
 *   3. In `STORED_FIELDS.heldTurnDraftAgentId`, leave out the test of `sentAs`. A, B, C and D go red.
 *   4. In the migration, add a second statement, `DELETE FROM records WHERE 0`, after a statement breakpoint. E goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The planted drafts are
 * written straight into the table and are made up; every title begins with "Made-up".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SENT_AS } from '../src/shared/drafts.ts'
import { TURN } from '../src/shared/turn-drafts.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The index, under the name schema.ts and the migration give it. */
const INDEX = 'records_held_turn_draft_agent_idx'
/** The migration's tag without its number, which the merge queue may change. */
const TAG = '_a_held_turn_draft_is_found_by_index'

let t: TestDb
let app: FastifyInstance
let schema: typeof import('../src/server/db/schema.ts')
let turns: typeof import('../src/server/lib/turn-drafts.ts')
let wayBack: typeof import('../tools/stable/the-way-back.mjs')
let migrations: string

/** The words of the stored field, read from `column`, or a failure naming what is missing. */
function theWords(column: string): string {
  const field = (schema.STORED_FIELDS as Record<string, unknown>)['heldTurnDraftAgentId']
  if (typeof field !== 'function') throw new Error('STORED_FIELDS in src/server/db/schema.ts has no heldTurnDraftAgentId, so the index and its reads share no words.')
  return schema.theWordsOfAStoredField(field as Parameters<typeof schema.theWordsOfAStoredField>[0], column)
}
/** The SQL of this migration, found in the journal by its tag. */
function theMigration(): { tag: string; sql: string } {
  const journal = JSON.parse(readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  const entry = journal.entries.find((one) => one.tag.endsWith(TAG))
  if (entry === undefined) throw new Error(`The migration journal holds no migration ending ${TAG}.`)
  return { tag: entry.tag, sql: readFileSync(join(migrations, `${entry.tag}.sql`), 'utf8') }
}

/** A made-up draft written straight into the table. `turn` false is a draft with no turn. */
function aDraft(id: string, opts: { agent?: string; readers?: string; sent?: boolean; notSent?: boolean; deleted?: boolean; turn?: false; kind?: string; data?: string }): void {
  const turn = { run: 'a-made-up-run', agent: { kind: 'agent', id: opts.agent ?? 'g1' }, readers: opts.readers ?? 'person:p', heldAt: '2026-11-07 21:00:00', writes: 1, sendIds: [], fields: {}, toAPerson: false, ...(opts.notSent === true ? { notSent: { at: '2026-11-07 21:01:00', why: 'Made up.' } } : {}) }
  const data = opts.data ?? JSON.stringify({ body: 'Made up for this test.', for: [], becomes: 'message', ...(opts.turn === false ? {} : { turn }), ...(opts.sent === true ? { sentAs: 'a-made-up-message' } : {}) })
  t.client.sqlite
    .prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, 'default', 'owner', '2026-11-07 21:00:00', '2026-11-07 21:00:00', ?, ?, null, ?, ?, 'fixture')`,
    )
    .run(id, opts.kind ?? 'draft', `Made-up draft ${id}`, data, opts.deleted === true ? '2026-11-07 21:00:00' : null)
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

/** SQLite's plan for a statement that ran. */
function thePlanOf(one: { sql: string; values: unknown[] }): string[] {
  return (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[]).map((step) => step.detail)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  schema = await import('../src/server/db/schema.ts')
  turns = await import('../src/server/lib/turn-drafts.ts')
  wayBack = await import('../tools/stable/the-way-back.mjs')
  migrations = (await import('../src/config/settings.mjs')).THE_MIGRATIONS_FOLDER

  aDraft('d-g1-to-the-person', {})
  aDraft('d-g1-to-two-agents', { readers: 'agent:x,agent:y' })
  aDraft('d-g1-again-to-the-person', {})
  // SENT, REFUSED WHEN IT WENT, AND DELETED: none of these is held.
  aDraft('d-g1-sent', { readers: 'agent:sent', sent: true })
  aDraft('d-g1-not-sent', { readers: 'agent:refused', notSent: true })
  aDraft('d-g1-deleted', { readers: 'agent:deleted', deleted: true })
  // ANOTHER AGENT'S, A DRAFT WITH NO TURN, AND A MESSAGE WITH A TURN FIELD.
  aDraft('d-g2', { agent: 'g2', readers: 'agent:g2s' })
  aDraft('d-own', { turn: false })
  aDraft('m-a-message', { kind: 'message', readers: 'agent:message' })
  // DATA THAT IS NOT JSON.
  aDraft('d-unreadable', { data: '{"turn": not json' })
}, 60_000)
afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('A. the index', () => {
  it('holds the drafts held now, by the agent they are held for, with the shared words as its WHERE', () => {
    const row = t.client.sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(INDEX) as { sql: string } | undefined
    expect(row, `the index ${INDEX}`).toBeDefined()
    const sql = row!.sql.replaceAll('`', '').replace(/\s+/g, ' ')
    expect(sql).toBe(`CREATE INDEX ${INDEX} ON records (${theWords('data')}) WHERE kind = 'draft' AND ${theWords('data')} IS NOT NULL`)
  })
})

describe('C. what the reads answer', () => {
  it("is the readers of the agent's held drafts alone", () => {
    expect(turns.whomAnAgentIsReplyingTo('g1')).toEqual(['agent:x,agent:y', 'person:p'])
    expect(turns.whomAnAgentIsReplyingTo('g2')).toEqual(['agent:g2s'])
    expect(turns.whomAnAgentIsReplyingTo('no-such-agent')).toEqual([])
    expect(turns.theAgentIsReplyingTo('g1', { kind: 'agent', id: 'y' })).toBe(true)
    expect(turns.theAgentIsReplyingTo('g1', { kind: 'agent', id: 'sent' }), 'a sent draft').toBe(false)
    expect(turns.theAgentIsReplyingTo('g1', { kind: 'agent', id: 'refused' }), 'a draft refused when it went').toBe(false)
    expect(turns.theAgentIsReplyingTo('g1', { kind: 'agent', id: 'deleted' }), 'a deleted draft').toBe(false)
    expect(turns.theAgentIsReplyingTo('g1', { kind: 'agent', id: 'message' }), 'a message').toBe(false)
  })
})

describe('B. the reads', () => {
  it('ask in the shared words, and SQLite starts from the index and reads no draft by its kind', () => {
    const replying = theReadsDuring(() => turns.whomAnAgentIsReplyingTo('g1'))
    expect(replying.map((one) => one.sql), 'whomAnAgentIsReplyingTo reads in one statement').toHaveLength(1)
    expect(replying[0]!.sql).toContain(`${theWords('data')} IS NOT NULL`)
    expect(replying[0]!.sql).toContain(`${theWords('data')} = ?`)
    const plan = thePlanOf(replying[0]!)
    expect(plan[0], plan.join(' | ')).toMatch(new RegExp(`^SEARCH records USING INDEX ${INDEX} \\(<expr>=\\?\\)`))
    expect(plan.join(' | ')).not.toContain('records_kind_idx')
    expect(plan.filter((step) => /\bSCAN\b/.test(step)), plan.join(' | ')).toEqual([])

    // EACH PASS OF THE REMINDERS: the drafts held now, all of them, through the index.
    const pass = theReadsDuring(() => turns.sendTheTurnDraftsThatAreDue(new Date())).filter((one) => one.sql.includes(theWords('data')))
    expect(pass.length, 'the pass read no held draft in the shared words').toBeGreaterThan(0)
    for (const one of pass) {
      const steps = thePlanOf(one)
      expect(steps.join(' | ')).toContain(`USING INDEX ${INDEX}`)
      expect(steps.join(' | ')).not.toContain('records_kind_idx')
    }
  })
})

describe('D. the words are the writer’s', () => {
  it('name the turn and the sent mark the writers put on, and a draft marked sent leaves the index', () => {
    expect(theWords('data')).toContain(`'$.${TURN}.agent.id'`)
    expect(theWords('data')).toContain(`'$.${TURN}.notSent'`)
    expect(theWords('data')).toContain(`'$.${SENT_AS}'`)
    aDraft('d-g3-held', { agent: 'g3' })
    const inTheIndex = (): string[] =>
      (t.client.sqlite.prepare(`SELECT id FROM records INDEXED BY ${INDEX} WHERE kind = 'draft' AND ${theWords('data')} IS NOT NULL ORDER BY id`).all() as { id: string }[]).map((one) => one.id)
    expect(inTheIndex()).toContain('d-g3-held')
    t.client.sqlite.prepare(`UPDATE records SET data = json_set(data, '$.${SENT_AS}', 'a-made-up-message') WHERE id = ?`).run('d-g3-held')
    expect(inTheIndex()).not.toContain('d-g3-held')
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
