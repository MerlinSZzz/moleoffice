// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE OF 35,000 MESSAGES STILL OPENS A GROUP, A CONVERSATION AND THE MESSAGES PAGE.
 *
 * Round 48h of wave 13k. From 11 October 2026 the live office answered 500 on every group and on the
 * Messages page, with "too many SQL variables". The message pool read the delivery rows of every
 * message in one statement, which binds one value for each message, and SQLite takes at most 32,766
 * values in one statement. The office then held about 34,400 messages.
 *
 * WHAT IS PROVED HERE.
 *   1. The whole pool is read, and every message in it carries the delivery rows that one read of
 *      the table gives it. Lists of ids are read in pieces (src/server/db/in-pieces.ts).
 *   2. Opening one group takes that group's messages out of the database, and not every message of
 *      the office. The same holds for a conversation between two agents.
 *
 * THE OFFICE IS MADE UP by tests/the-chat-office-of-the-live-shape.ts, in this file's own database:
 * the live mix of messages, with more messages between agents, so the office holds 35,000. Every row
 * is marked `fixture`, and nothing is read from the live office.
 *
 * THE TIMES ARE PRINTED AND NOT ASSERTED. They depend on what else this machine is doing. The report
 * of round 48h quotes them, with the machine's load beside them.
 *
 * THREE-RUN PROOF, in the report of round 48h with the commands and log paths. CONTROL green.
 * MUTATION 1: `deliveriesOfMany` reads every id in one statement again. The pool case is red with
 * "too many SQL variables". The Messages page case stays green: since round 89 of wave 13y, a page of
 * it with no narrowing builds only its own messages. MUTATION 2: the group door reads every
 * message of every project again, and the group case is red on the rows it took. RESTORE green.
 *
 * NOT REPRODUCED HERE: the live office's 500 on the messages forced on the person. In this made-up
 * office that door answers 200 on the code from before the fix as well, so its case is a control only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { buildTheChatOffice, LIVE_SHAPE, type Shape } from './the-chat-office-of-the-live-shape.ts'

/** The most values SQLite binds in one statement. An office with more messages than this broke the pool read. */
const SQLITE_MOST_VALUES = 32_766

/**
 * THE LIVE MIX, WITH 28,500 MESSAGES BETWEEN AGENTS, which brings the office to 35,000 messages:
 * 3,000 in the measured conversation, 1,500 with other contacts, 1,500 in groups and 500 lines of
 * the office. Fewer records of other kinds than the live shape, because no read here looks at them.
 */
const SHAPE: Shape = { ...LIVE_SHAPE, betweenAgents: 28_500, otherRecords: 2_000 }

/**
 * TWO MINUTES FOR THE BUILD AND FOR EACH READ OF THE WHOLE POOL. The build writes about 80,000 rows
 * in one transaction. A read of the pool builds 35,000 messages, and the queue test of this size took
 * tens of seconds on a loaded machine (tests/no-read-of-the-queue-holds-the-office.test.ts).
 */
const A_READ_OF_THE_WHOLE_OFFICE = 120_000

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let M: typeof import('../src/server/lib/messages.ts')
let messagesInTheOffice = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(t.client.sqlite, THE_PERSON, SHAPE)
  M = await import('../src/server/lib/messages.ts')
  messagesInTheOffice = (
    t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL`).get() as { n: number }
  ).n
}, A_READ_OF_THE_WHOLE_OFFICE)

afterAll(async () => {
  await app.close()
  t.close()
})

interface WhatARequestTook {
  /** Rows taken out of `records`, by every statement whose first table is `records`. */
  records: number
  ms: number
  body: Record<string, unknown>
}

/**
 * Runs one request as the person, and counts the rows every statement prepared during it took from
 * `records`. The statements are wrapped where they are prepared, as in
 * tests/the-chat-reads-only-what-it-needs.test.ts, so no reader can be missed.
 */
async function whatARequestTook(url: string): Promise<WhatARequestTook> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const original = sqlite.prepare
  let records = 0
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    if (/\bfrom\s+"?([a-z_]+)"?/i.exec(text)?.[1] === 'records') {
      for (const method of ['all', 'get'] as const) {
        const read = statement[method] as (...args: unknown[]) => unknown
        statement[method] = function (this: unknown, ...args: unknown[]) {
          const out = read.apply(this, args)
          if (method === 'get') records += out === undefined ? 0 : 1
          else records += (out as unknown[]).length
          return out
        }
      }
    }
    return statement
  }
  const started = performance.now()
  let reply
  try {
    reply = await app.inject({ method: 'GET', url, headers: PERSON })
  } finally {
    sqlite.prepare = original
  }
  const ms = Math.round(performance.now() - started)
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  process.stdout.write(`${url.split('?')[0]!.padEnd(28)} ${String(ms).padStart(6)} ms, ${String(records)} rows from records\n`)
  return { records, ms, body: reply.json() as Record<string, unknown> }
}

describe('an office with more messages than one statement may name', () => {
  it('holds more messages than SQLite binds in one statement', () => {
    expect(messagesInTheOffice, 'the made-up office has to be large enough to break a read of every id at once').toBeGreaterThan(SQLITE_MOST_VALUES)
  })

  it('reads the first page of the Messages page', async () => {
    const read = await whatARequestTook('/api/messages?limit=50&offset=0')
    expect(read.body['returned']).toBe(50)
    expect(read.body['total'] as number, 'the page is cut from the whole pool').toBeGreaterThan(SQLITE_MOST_VALUES)
  }, A_READ_OF_THE_WHOLE_OFFICE)

  it('reads the messages forced on the person', async () => {
    await whatARequestTook('/api/messages/forced')
  }, A_READ_OF_THE_WHOLE_OFFICE)

  it('gives every message of the pool the delivery rows one read of the table gives it, in the same order', () => {
    // ONE READ OF THE TABLE, which binds nothing, grouped by message as the pool groups them.
    const once = new Map<string, string[]>()
    for (const row of t.client.sqlite
      .prepare('SELECT message_id AS message, recipient_kind AS kind, recipient_id AS who, mark, at FROM message_delivery ORDER BY at, id')
      .all() as { message: string; kind: string; who: string; mark: string; at: string }[]) {
      once.set(row.message, [...(once.get(row.message) ?? []), `${row.kind}:${row.who} ${row.mark} ${row.at}`])
    }
    const pool = M.messagePool('default')
    expect(pool.length).toBeGreaterThan(SQLITE_MOST_VALUES)
    let compared = 0
    for (const entry of pool) {
      const said = entry.deliveries.map((one) => `${one.to.kind}:${one.to.id} ${one.mark} ${one.at}`)
      expect(said, `the delivery rows of ${entry.id}`).toEqual(once.get(entry.id) ?? [])
      compared += said.length
    }
    expect(compared, 'every delivery row of the office was compared').toBe(
      (t.client.sqlite.prepare('SELECT count(*) AS n FROM message_delivery').get() as { n: number }).n,
    )
  }, A_READ_OF_THE_WHOLE_OFFICE)
})

describe('opening one conversation reads that conversation, and not the office', () => {
  it('opens a group and takes only that group\'s messages and what they name out of the database', async () => {
    const group = (t.client.sqlite.prepare(`SELECT id FROM groups WHERE name = 'made-up group 0'`).get() as { id: string }).id
    const sent = (
      t.client.sqlite
        .prepare(`SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.toGroup') = ?`)
        .get(group) as { n: number }
    ).n
    const read = await whatARequestTook(`/api/groups/${group}`)
    expect((read.body['messages'] as unknown[]).length, 'the person reads every message of a group it is in').toBe(sent)
    // A READ OF EVERY MESSAGE TAKES 35,000 ROWS. The group's messages, the runs they name and the
    // group's few other reads are a few hundred at most.
    expect(read.records, `rows taken from records, for a group of ${String(sent)} messages`).toBeLessThan(messagesInTheOffice / 10)
  }, A_READ_OF_THE_WHOLE_OFFICE)

  it('opens a conversation between two agents and takes only theirs out of the database', async () => {
    const pair = t.client.sqlite
      .prepare(
        `SELECT json_extract(data, '$.sentBy.id') AS a, json_extract(data, '$.to[0].id') AS b, count(*) AS n FROM records
         WHERE kind = 'message' AND json_extract(data, '$.sentBy.kind') = 'agent' AND json_extract(data, '$.to[0].kind') = 'agent'
           AND json_extract(data, '$.sentBy.id') <> 'mole-office'
         GROUP BY a, b ORDER BY n DESC LIMIT 1`,
      )
      .get() as { a: string; b: string; n: number }
    const read = await whatARequestTook(`/api/messages/between/${pair.a}~${pair.b}`)
    expect((read.body['messages'] as unknown[]).length, 'the conversation holds at least the messages one way').toBeGreaterThanOrEqual(pair.n)
    expect(read.records, `rows taken from records, for a conversation of about ${String(pair.n * 2)} messages`).toBeLessThan(messagesInTheOffice / 10)
  }, A_READ_OF_THE_WHOLE_OFFICE)
})
