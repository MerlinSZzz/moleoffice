// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0310 MAKES ONE INDEX, SO THE MESSAGE THAT CARRIED A CARD'S HANDBOOK IS FOUND WITHOUT READING EVERY MESSAGE.
 *
 * Wave 13s round 144, item 39 (c). Each time a card message is written to an agent, `theHandbookWasSentIn`
 * (src/server/lib/cardmessage.ts) asks whether a message already carried that card's handbook to that agent. It read
 * every message, through records_kind_idx, and read each one's data: 72 ms a call on the made-up office of 22 October,
 * and once in each agent's start. Migration 0310 makes an index of the messages that carry the mark, by the card the
 * mark names, and the read now names that index's WHERE in the words src/server/db/schema.ts holds. The answers stay as
 * they were.
 *
 * WHAT IS HELD HERE, in a fresh test database:
 *   A. the index is in the database, on the mark's card, and its WHERE is the message kind and the words of
 *      `STORED_FIELDS.messageHandbookSentCard`, so the migration's SQL and the read cannot drift apart;
 *   B. the read holds those words, and SQLite's plan for it starts from the index and reads no message by its kind;
 *   C. the read answers what the messages planted here say it must: the earliest message from Mole Office to that agent
 *      that carried that card's handbook, a tie in time broken by the order of writing, a deleted one too; never one
 *      from somebody else, of another kind, to a person of the same id, or for another card; null where none did; and
 *      a message whose data is not JSON stops nothing;
 *   D. the words are the writer's own: they name `HANDBOOK_SENT_MARK`, and the message the starter door writes to a new
 *      secretary is in the index and is the one the read finds;
 *   E. the way back passes the migration: `theWayBackCheck` in tools/stable/the-way-back.mjs finds that it only adds.
 *
 * Cases A, B, D and E fail before the migration and the changed read. Case C holds before and after.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `theHandbookWasSentIn`, ask the mark's card in plain `json_extract` words, not the shared ones. Cases B, C and
 *      D go red: the plain words are read before `json_valid` is asked, and stop on the message whose data is not JSON.
 *   2. In the migration, take `kind = 'message'` out of the index's WHERE. Case A goes red.
 *   3. In `STORED_FIELDS.messageHandbookSentCard`, name the path `$.extra.handbookSent.cards`. Cases A, B, C and D go
 *      red: the index and the read no longer name the mark the writer wrote.
 *   4. In the migration, add a second statement, `DELETE FROM records WHERE 0`, after a statement breakpoint. Case E
 *      goes red: a statement that deletes rows does more than add, though this one deletes none.
 *   5. In the read, order by `r.created_at DESC`. Case C goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The planted messages are
 * written straight into the table and are made up; every title begins with "Made-up".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The index, under the name schema.ts and the migration give it. */
const INDEX = 'records_message_handbook_sent_card_idx'
/** The migration's tag without its number, which the merge queue may change. */
const TAG = '_the_handbook_message_is_found_by_index'
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let schema: typeof import('../src/server/db/schema.ts')
let card: typeof import('../src/server/lib/cardmessage.ts')
let wayBack: typeof import('../tools/stable/the-way-back.mjs')
let migrations: string

/** The words of the stored field, read from `column`, or a failure naming what is missing. */
function theWords(column: string): string {
  const field = (schema.STORED_FIELDS as Record<string, unknown>)['messageHandbookSentCard']
  if (typeof field !== 'function') throw new Error('STORED_FIELDS in src/server/db/schema.ts has no messageHandbookSentCard, so the index and its read share no words.')
  return schema.theWordsOfAStoredField(field as Parameters<typeof schema.theWordsOfAStoredField>[0], column)
}
/** The SQL of this migration, found in the journal by its tag. */
function theMigration(): { tag: string; sql: string } {
  const journal = JSON.parse(readFileSync(join(migrations, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  const entry = journal.entries.find((one) => one.tag.endsWith(TAG))
  if (entry === undefined) throw new Error(`The migration journal holds no migration ending ${TAG}.`)
  return { tag: entry.tag, sql: readFileSync(join(migrations, `${entry.tag}.sql`), 'utf8') }
}

let planted = 0
/** A made-up message written straight into the table: from Mole Office unless `from` says, to the agents named. */
function aMessage(id: string, opts: { at: string; to?: { kind: string; id: string }[]; card?: string; from?: { kind: string; id: string }; kind?: string; deleted?: boolean; data?: string }): void {
  planted += 1
  const data =
    opts.data ??
    JSON.stringify({
      body: 'Made up for this test.',
      sentBy: opts.from ?? moleOffice(),
      to: opts.to ?? [],
      ...(opts.card === undefined ? {} : { extra: { handbookSent: { card: opts.card, languages: ['en'] } } }),
    })
  t.client.sqlite
    .prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, 'default', 'owner', ?, ?, ?, ?, null, ?, ?, 'fixture')`,
    )
    .run(id, opts.at, opts.at, opts.kind ?? 'message', `Made-up message ${id}`, data, opts.deleted === true ? opts.at : null)
}
const agent = (id: string) => ({ kind: 'agent', id })

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

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  schema = await import('../src/server/db/schema.ts')
  card = await import('../src/server/lib/cardmessage.ts')
  wayBack = await import('../tools/stable/the-way-back.mjs')
  migrations = (await import('../src/config/settings.mjs')).THE_MIGRATIONS_FOLDER

  // FIRST BY TIME, then by the order of writing: the later one is written first.
  aMessage('m-g1-later', { at: '2026-10-21 11:00:00', to: [agent('g1')], card: 'secretary' })
  aMessage('m-g1-first', { at: '2026-10-21 10:00:00', to: [agent('g1')], card: 'secretary' })
  aMessage('m-g1-worker', { at: '2026-10-21 09:00:00', to: [agent('g1')], card: 'worker' })
  aMessage('m-g2-tie-z', { at: '2026-10-21 10:00:00', to: [agent('g2')], card: 'secretary' })
  aMessage('m-g2-tie-a', { at: '2026-10-21 10:00:00', to: [agent('g2')], card: 'secretary' })
  // A DELETED MESSAGE STILL COUNTS, because it was sent.
  aMessage('m-g3-deleted', { at: '2026-10-21 10:00:00', to: [agent('g3')], card: 'secretary', deleted: true })
  // NOT FROM MOLE OFFICE, NOT A MESSAGE, TO A PERSON, AND WITH NO MARK: none of these counts.
  aMessage('m-g4-from-a-person', { at: '2026-10-21 10:00:00', to: [agent('g4')], card: 'secretary', from: { kind: 'human', id: THE_PERSON } })
  aMessage('m-g5-a-note', { at: '2026-10-21 10:00:00', to: [agent('g5')], card: 'secretary', kind: 'note' })
  aMessage('m-g6-to-a-person', { at: '2026-10-21 10:00:00', to: [{ kind: 'human', id: 'g6' }], card: 'secretary' })
  aMessage('m-g7-no-mark', { at: '2026-10-21 10:00:00', to: [agent('g7')] })
  // TO TWO AGENTS AT ONCE: each finds it.
  aMessage('m-g8-g9', { at: '2026-10-21 10:00:00', to: [agent('g8'), agent('g9')], card: 'secretary' })
  // DATA THAT IS NOT JSON, and data whose mark is not text.
  aMessage('m-unreadable', { at: '2026-10-21 08:00:00', data: '{"sentBy": not json' })
  aMessage('m-g10-number', { at: '2026-10-21 10:00:00', to: [agent('g10')], card: 7 as unknown as string })
}, 60_000)
afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('A. the index', () => {
  it('holds the messages that carry the mark, by the card it names, with the shared words as its WHERE', () => {
    const row = t.client.sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(INDEX) as { sql: string } | undefined
    expect(row, `the index ${INDEX}`).toBeDefined()
    const sql = row!.sql.replaceAll('`', '').replace(/\s+/g, ' ')
    expect(sql).toBe(`CREATE INDEX ${INDEX} ON records (${theWords('data')}) WHERE kind = 'message' AND ${theWords('data')} IS NOT NULL`)
  })
})

describe('B. the read', () => {
  it('asks in the shared words, and SQLite starts from the index and reads no message by its kind', () => {
    // ONLY THE READ OF THE MARK: the reads that find who Mole Office is are not this migration's.
    const reads = theReadsDuring(() => card.theHandbookWasSentIn('g1', 'secretary')).filter((one) => one.sql.includes('handbookSent'))
    expect(reads.map((one) => one.sql), 'theHandbookWasSentIn reads the mark in one statement').toHaveLength(1)
    const [one] = reads
    expect(one!.sql).toContain(`${theWords('r.data')} IS NOT NULL`)
    expect(one!.sql).toContain(`${theWords('r.data')} = ?`)
    const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one!.sql}`).all(...one!.values) as { detail: string }[]).map((step) => step.detail)
    expect(plan[0], plan.join(' | ')).toMatch(new RegExp(`^SEARCH r USING INDEX ${INDEX} \\(<expr>=\\?\\)`))
    expect(plan.join(' | ')).not.toContain('records_kind_idx')
    expect(plan.filter((step) => /\bSCAN\b/.test(step) && !/VIRTUAL TABLE/.test(step)), plan.join(' | ')).toEqual([])
  })
})

describe('C. what the read answers', () => {
  it('is the earliest message from Mole Office to that agent that carried that card, and null where none did', () => {
    const asked = (agentId: string, cardName = 'secretary') => card.theHandbookWasSentIn(agentId, cardName)
    expect(asked('g1')).toBe('m-g1-first')
    expect(asked('g1', 'worker')).toBe('m-g1-worker')
    expect(asked('g1', 'supervisor')).toBeNull()
    expect(asked('g2'), 'a tie in time, by the order of writing').toBe('m-g2-tie-z')
    expect(asked('g3'), 'a deleted message').toBe('m-g3-deleted')
    expect(asked('g4'), 'from a person').toBeNull()
    expect(asked('g5'), 'a note').toBeNull()
    expect(asked('g6'), 'to a person of that id').toBeNull()
    expect(asked('g7'), 'with no mark').toBeNull()
    expect([asked('g8'), asked('g9')]).toEqual(['m-g8-g9', 'm-g8-g9'])
    expect(asked('g10'), 'a mark whose card is a number').toBeNull()
    expect(asked('g10', '7'), 'nor the same number as text').toBeNull()
    expect(asked('no-such-agent')).toBeNull()
  })
})

describe('D. the words are the writer’s', () => {
  it('name the mark the writer puts on, and hold the message the starter door wrote to a new secretary', async () => {
    expect(theWords('data')).toContain(`'$.extra.${card.HANDBOOK_SENT_MARK}.card'`)
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: 'made-up-r144-secretary', name: 'Made-up secretary', role: 'secretary' } })
    expect(made.statusCode, made.body).toBe(201)
    const id = (made.json() as { agent: { id: string } }).agent.id
    const written = (
      t.client.sqlite
        .prepare("SELECT id FROM records WHERE kind = 'message' AND json_valid(data) AND json_extract(data, '$.extra.handbookSent.card') = 'secretary' AND EXISTS (SELECT 1 FROM json_each(data, '$.to') t WHERE json_extract(t.value, '$.id') = ?)")
        .all(id) as { id: string }[]
    ).map((one) => one.id)
    expect(written, 'the starter door wrote one handbook message').toHaveLength(1)
    const inTheIndex = (t.client.sqlite.prepare(`SELECT id FROM records INDEXED BY ${INDEX} WHERE kind = 'message' AND ${theWords('data')} IS NOT NULL ORDER BY id`).all() as { id: string }[]).map((one) => one.id)
    expect(inTheIndex).toContain(written[0])
    expect(card.theHandbookWasSentIn(id, 'secretary')).toBe(written[0])
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
