// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RESTORE'S "CHANGED SINCE" READS FOUR FIELDS OF THE RECORDS THAT CHANGED, AND GIVES THE SAME ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/restore` counts the records of the project changed since the agent's last session
 * ended. It read every record of the project whole to keep a few, so the door parsed the data of
 * the whole project for an answer that names four fields of each. This file checks the whole
 * changed-since answer, and checks that no statement the restore runs hands back the data of a
 * record it did not need.
 *
 * WHY IT FAILS BEFORE THE FIX: the changed records were read through `listRecords`, which hands
 * back every record of the project with its data, so a statement hands back every marker below and
 * the ids of the purchases that did not change. The answer itself is the same before and after.
 *
 * ---------------------------------------------------------------------------------------
 * THE MARKER
 * ---------------------------------------------------------------------------------------
 *
 * Each purchase carries a marker in `vendor`. A purchase is not an open loop, a session or an
 * agent, so the open work, the last session and the agent's own row do not read it. The attention
 * rule ranks the open work on a thread of its own, with its own connection, and keeps none of
 * `vendor`, so nothing it reads is watched here.
 *
 * ---------------------------------------------------------------------------------------
 * THE STAMPS
 * ---------------------------------------------------------------------------------------
 *
 * The restore keeps a record when `localeCompare` puts its `updatedAt` after the end. SQLite
 * compares the bytes, and the two agree only when both stamps are in the stored form. So one
 * changed purchase and one unchanged one carry a control character after the day, which
 * `localeCompare` reads past and the bytes do not. The second agent's last session ended at a stamp
 * with a byte-order mark before it, which the date check reads past because it trims the value.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS IT IS WRITTEN TO GO RED ON
 * ---------------------------------------------------------------------------------------
 *
 *   · the time condition taken out of the SQL: a statement hands back the unchanged purchases;
 *   · the session left in: the first agent's own session is counted;
 *   · the sort in JavaScript taken out: the odd stamp sorts last in bytes, so the order is wrong;
 *   · the order taken out of the SQL: the two notes changed in the same second come in the order
 *     they were filed, and the second has the smaller id;
 *   · the comparison in JavaScript taken out: the odd unchanged purchase is counted;
 *   · the SQL keeping only stamps after the end, and not the ones in another form: the odd changed
 *     purchase is left out;
 *   · deleted records read too: the deleted note is counted;
 *   · the SQL narrowed when the end is not in the stored form: the second agent is told of one
 *     change and not six.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { SYSTEM_LINE_TITLE } from '../src/shared/groups.ts'
import type { RecordKind } from '@shared/types.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'

/** The person, so registering an agent is an ordinary act and not the thing under test. */
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const DAY = '2026-09-15'
/** Every record the registrations wrote, moved off the real clock to before the story. */
const BEFORE_THE_STORY = `${DAY} 08:45:00`
const FIRST_OPENED = `${DAY} 09:00:00`
const SECOND_OPENED = `${DAY} 09:01:00`
const DURING = `${DAY} 09:05:00`
const SECOND_WRITTEN = `${DAY} 09:08:00`
const FIRST_ENDED = `${DAY} 09:10:00`
/** The second agent's end, with a byte-order mark before it. */
const SECOND_ENDED = `﻿${DAY} 09:12:00`
const TIED = `${DAY} 09:20:00`
const THE_MESSAGE_CHANGED = `${DAY} 09:25:00`
/** After the end by `localeCompare`, and before it by the bytes. */
const ODD_AFTER = `${DAY}\u0001 09:27:00`
/** Before the end both ways, and in another form, so the SQL cannot leave it out. */
const ODD_BEFORE = `${DAY}\u0001 09:05:00`
const LATE = `${DAY} 09:30:00`
const DELETED = `${DAY} 09:35:00`
const FIRST_WRITTEN_AGAIN = `${DAY} 09:40:00`

const MARKER = 'a-vendor-marker-'

interface Made {
  key: string
  record: string
}
const made = new Map<string, Made>()

/** The rows the restore is expected to list, in its order. */
interface Row {
  id: string
  kind: string
  title: string
  updatedAt: string
}
let firstSession: Row
let problemLate: Row
let purchaseOddAfter: Row
let message: Row
let tieFirstFiled: Row
let tieSecondFiled: Row
/** The purchases that did not change and whose stamps are in the stored form. */
const unchangedPurchases: string[] = []

function keyOf(handle: string): string {
  const one = made.get(handle)
  if (one === undefined) throw new Error(`no agent ${handle} was made`)
  return one.key
}

function file(kind: RecordKind, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind, title, data, actor: { type: 'agent', id: 'agent-one' } }).id
}

function at(id: string, stamp: string): string {
  t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(stamp, stamp, id)
  return id
}

function row(id: string, kind: string, title: string, updatedAt: string): Row {
  return { id, kind, title, updatedAt }
}

/** A finished session of one agent, opened and written at the stamps given, its flow run with it. */
function aSession(handle: string, title: string, closedAt: string, opened: string, written: string): string {
  const id = historicalSession(t, {
    workspaceId: WORKSPACE,
    kind: 'session',
    title,
    actor: { type: 'agent', id: handle },
    data: {
      state: 'finished',
      ranAs: [{ workspaceId: WORKSPACE, agentId: made.get(handle)?.record ?? '' }],
      doing: 'filing the records of this story',
      closedAt,
      closedHow: 'provider-event',
      closedBecause: 'the story was filed',
    },
  }).id
  const flowRuns = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").all(id) as { id: string }[]).map((one) => one.id)
  for (const each of [id, ...flowRuns]) {
    t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(opened, written, each)
  }
  return id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, name] of [
    ['agent-one', 'Agent One'],
    ['agent-two', 'Agent Two'],
  ] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name, role: 'worker' } })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
    const body = reply.json() as { record: string; whatToGiveIt: { key: string } }
    made.set(handle, { key: body.whatToGiveIt.key, record: body.record })
  }
  // EVERYTHING WRITTEN SO FAR IS MOVED TO BEFORE THE STORY. A sealed tip may not be changed, and none is listed here.
  t.client.sqlite.prepare("UPDATE records SET created_at = ?, updated_at = ? WHERE kind <> 'sealed_tip'").run(BEFORE_THE_STORY, BEFORE_THE_STORY)

  // A MESSAGE IN THE PROJECT'S VIEW, CHANGED AFTER THE END. The registration wrote it, so it was filed first.
  const cardMessage = t.client.sqlite
    .prepare(
      "SELECT id FROM records WHERE workspace_id = 'message-centre' AND kind = 'message' AND title = ? " +
        "AND json_extract(data, '$.writtenIn.project') = ? ORDER BY rowid LIMIT 1",
    )
    .get(SYSTEM_LINE_TITLE, WORKSPACE) as { id: string } | undefined
  if (cardMessage === undefined) throw new Error('the registrations wrote no message in the project')
  message = row(at(cardMessage.id, THE_MESSAGE_CHANGED), 'message', SYSTEM_LINE_TITLE, THE_MESSAGE_CHANGED)

  // THE CHANGED RECORDS, FILED IN AN ORDER THAT IS NOT THEIR ORDER IN THE ANSWER.
  const tieTitle = 'A note changed in the same second as another'
  tieFirstFiled = row(at(file('note', tieTitle, { body: 'Made up.' }), TIED), 'note', tieTitle, TIED)
  const lateTitle = 'A problem changed last'
  problemLate = row(at(file('problem', lateTitle, { state: 'open' }), LATE), 'problem', lateTitle, LATE)
  const oddTitle = 'A purchase changed after the end, stamped in another form'
  purchaseOddAfter = row(at(file('purchase', oddTitle, { state: 'wanted', vendor: `${MARKER}changed` }), ODD_AFTER), 'purchase', oddTitle, ODD_AFTER)
  // THE SECOND NOTE OF THE SAME SECOND HAS THE SMALLER ID, so the id ends the tie the other way from the filing.
  let smaller: string | undefined
  for (let tries = 0; smaller === undefined && tries < 64; tries += 1) {
    const one = file('note', tieTitle, { body: 'Made up.' })
    if (one < tieFirstFiled.id) smaller = one
    else {
      at(one, DURING)
      t.client.sqlite.prepare("UPDATE records SET title = 'A note filed while a smaller id was looked for' WHERE id = ?").run(one)
    }
  }
  if (smaller === undefined) throw new Error('no note was given an id that sorts before the first')
  tieSecondFiled = row(at(smaller, TIED), 'note', tieTitle, TIED)

  // THE UNCHANGED PURCHASES, each with a marker.
  for (const n of [1, 2, 3]) {
    unchangedPurchases.push(at(file('purchase', `A purchase written while the session ran, ${String(n)}`, { state: 'wanted', vendor: `${MARKER}${String(n)}` }), DURING))
  }
  at(file('purchase', 'A purchase written while the session ran, stamped in another form', { state: 'wanted', vendor: `${MARKER}odd` }), ODD_BEFORE)
  at(file('problem', 'A problem filed while the session ran', { state: 'open' }), DURING)
  // A DELETED RECORD CHANGED AFTER THE END, which is not listed.
  const deleted = file('note', 'A note deleted after the end', { body: 'Made up.' })
  t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?').run(DURING, DELETED, DELETED, deleted)

  // THE FIRST AGENT'S SESSION, WRITTEN AGAIN AFTER IT ENDED, so only leaving it out keeps it out.
  const firstTitle = 'The first agent’s last session'
  const first = aSession('agent-one', firstTitle, FIRST_ENDED, FIRST_OPENED, FIRST_ENDED)
  t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(FIRST_WRITTEN_AGAIN, first)
  firstSession = row(first, 'session', firstTitle, FIRST_WRITTEN_AGAIN)

  // THE SECOND AGENT'S SESSION. Its end is written straight into the row, because what this checks is how the
  // restore compares two stamps, not how one is filed.
  const second = aSession('agent-two', 'The second agent’s last session', `${DAY} 09:12:00`, SECOND_OPENED, SECOND_WRITTEN)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.closedAt', ?) WHERE id = ?").run(SECOND_ENDED, second)
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** What one statement handed back: its text, whether a marker was in it, and which watched ids. */
interface Handed {
  source: string
  marker: boolean
  ids: string[]
}

/** True when `value`, or anything inside it, holds `needle`. */
function holds(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8').includes(needle)
  if (Array.isArray(value)) return value.some((one) => holds(one, needle))
  if (value !== null && typeof value === 'object') return Object.values(value).some((one) => holds(one, needle))
  return false
}

/** Every statement `work` ran, with what it handed back, read as each one returned. */
async function whatTheStatementsHandBackDuring<T>(work: () => Promise<T>, watched: readonly string[]): Promise<{ result: T; handed: Handed[] }> {
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const handed: Handed[] = []
  const look = (source: string, rows: unknown): void => {
    handed.push({ source, marker: holds(rows, MARKER), ids: watched.filter((id) => holds(rows, id)) })
  }
  for (const name of ['get', 'all']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      const rows = original.apply(this, args)
      look(this.source, rows)
      return rows
    }
  }
  const iterate = prototype['iterate']!
  originals.set('iterate', iterate)
  prototype['iterate'] = function* (this: { source: string }, ...args: unknown[]) {
    for (const one of iterate.apply(this, args) as Iterable<unknown>) {
      look(this.source, one)
      yield one
    }
  }
  try {
    return { result: await work(), handed }
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
}

async function restoreAs(handle: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: '/api/restore', headers: { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': keyOf(handle) } })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

const says = (count: number, since: string): string =>
  `${String(count)} records have changed in "${WORKSPACE}" since ${since}, when your last session ended.`

describe('the restore lists what changed since the last session by four fields, and the same records as before', () => {
  it('gives the whole changed-since answer, and no statement hands back a record it did not need', async () => {
    const { result: reply, handed } = await whatTheStatementsHandBackDuring(() => restoreAs('agent-one'), unchangedPurchases)
    expect(reply.status, JSON.stringify(reply.body).slice(0, 400)).toBe(200)
    expect(reply.body['changedSince']).toEqual({
      since: FIRST_ENDED,
      count: 5,
      records: [problemLate, purchaseOddAfter, message, tieSecondFiled, tieFirstFiled],
      shown: 5,
      says: says(5, FIRST_ENDED),
    })
    const withAMarker = handed.filter((one) => one.marker).map((one) => one.source)
    expect(withAMarker, 'a statement of the restore handed back the data of a purchase').toEqual([])
    const withAnUnchangedPurchase = handed.filter((one) => /\bfrom\s+"?records\b/i.test(one.source) && one.ids.length > 0).map((one) => one.source)
    expect(withAnUnchangedPurchase, 'a statement of the restore handed back a purchase that did not change').toEqual([])
  })

  it('counts by `localeCompare` when the end is not in the stored form, and still reads no data', async () => {
    const { result: reply, handed } = await whatTheStatementsHandBackDuring(() => restoreAs('agent-two'), [])
    expect(reply.status, JSON.stringify(reply.body).slice(0, 400)).toBe(200)
    expect(reply.body['changedSince']).toEqual({
      since: SECOND_ENDED,
      count: 6,
      records: [firstSession, problemLate, purchaseOddAfter, message, tieSecondFiled],
      shown: 5,
      says: says(6, SECOND_ENDED),
    })
    const withAMarker = handed.filter((one) => one.marker).map((one) => one.source)
    expect(withAMarker, 'a statement of the restore handed back the data of a purchase').toEqual([])
  })
})
