// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DETAIL OF A RUN ASKS THE READER'S RULE ONLY OF THE MESSAGES ITS CHANGE ROWS NAME. Wave 13y round 103.
 *
 * MEASURED FIRST, 28 October 2026, on the made-up office at the scale of 22 October 2026: GET /api/sessions/<run> for
 * an agent who may not read 37,796 of the office's messages took 331 ms, the median of nine reads. Of that, 255 ms
 * worked out every message in the office the agent may not read (`everyMessageHiddenFrom`), so that no change row
 * naming one was listed. Asked only of the messages the run's change rows name, the same detail took 38 ms, with the
 * same answer.
 *
 * A change row names a message in four ways (`aChangeNamingNoneOf` in lib/records.ts): as the record it is about, as
 * its old value, as its new value, and as a string inside the old or the new value of a row logged under a run's
 * honour reading. For each way, the run here has a row naming a message the reader may not read and a row naming one
 * it may. The first is left out for the reader and the second listed, and the run's work is the same as with every
 * message the reader may not read, at the usual limit and at a limit that cuts the rows.
 *
 * WHAT ELSE IS HELD:
 *   - a string in an honour reading that is no message's id is in the list of what the rows name, and its row is still
 *     listed: such a string costs only time;
 *   - the detail through the route answers the work the whole list gives, for the reader and for the owner, and runs
 *     the statement `everyMessageHiddenFrom` runs besides the reader's rule no times. That statement is taken from the
 *     code. The count is soft, so the answer is still checked when it is red.
 *
 * WHAT IT DOES NOT HOLD. Which messages a reader may read; the who-may-read-which-message tests hold that.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const READER = 'rows-name-reader'
const WRITER = 'rows-name-writer'
const OTHER = 'rows-name-other'

const AS_READER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': READER }
const AS_THE_OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** The four ways a change row names a message. */
const WAYS = ['its record', 'its old value', 'its new value', 'a string in its honour reading'] as const
type Way = (typeof WAYS)[number]

/** A message a change row of the run names, whether the reader may read it, and the row. */
interface Named {
  way: Way
  message: string
  mayRead: boolean
  row: string
}

/** A string that is no message's id, quoted in an honour reading, and a plain word as a value. */
const NO_MESSAGE = 'rows-name-no-such-message'

let t: TestDb
let app: FastifyInstance
let home: string
let previousHome: string | undefined
let sessions: typeof import('../src/server/lib/sessions.ts')
let messages: typeof import('../src/server/lib/messages.ts')
let run = ''
const named: Named[] = []
let noMessageRow = ''
let plainWordRow = ''

beforeAll(async () => {
  // A HOME OF THIS TEST'S OWN, so the sessions door reads no transcript of the machine's.
  previousHome = process.env['HOME']
  home = mkdtempSync(join(tmpdir(), 'mole-office-rows-name-home-'))
  process.env['HOME'] = home
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  sessions = await import('../src/server/lib/sessions.ts')
  messages = await import('../src/server/lib/messages.ts')
  const R = await import('../src/server/lib/records.ts')
  const db = t.client.sqlite

  // THREE AGENTS, each a row of its own, so the reader's rule knows each by its id.
  for (const id of [READER, WRITER, OTHER]) {
    db.prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, '2026-09-01 09:00:00', NULL, NULL, 'generated')",
    ).run(`avatar-default-agent-${id}`)
    db.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, '2026-09-01 09:00:00')").run(id, id, id, `avatar-default-agent-${id}`)
  }
  // A MESSAGE FROM THE WRITER, handed to its addressee alone and routed to nobody: to the reader, or to another agent.
  const say = (to: string, title: string): string => {
    const id = R.createRecord({ kind: 'message', title, workspaceId: HERE, data: { body: 'made-up words', to: [{ kind: 'agent', id: to }] }, actor: { type: 'agent', id: WRITER } as never }).id
    db.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(id, to)
    const said = JSON.parse((db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
    delete said['routed']
    writeDataBypassingTheGate(t, id, said)
    return id
  }

  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...AS_THE_OWNER, 'content-type': 'application/json' },
    payload: { kind: 'session', title: 'A made-up run whose rows name messages', data: { state: 'running', runtime: 'claude-code', doing: 'naming messages' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  run = (filed.json() as { record: { id: string } }).record.id

  // ONE ROW OF THE RUN FOR EACH MESSAGE, naming it in one way, each a second after the last so their order is fixed.
  let n = 0
  const aRow = (recordId: string, field: string, oldValue: string | null, newValue: string | null): string => {
    n += 1
    const id = `rows-name-change-${String(n)}`
    db.prepare(
      'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at) ' +
        "VALUES (?, ?, ?, 'update', 'agent', ?, ?, ?, ?, ?, ?)",
    ).run(id, recordId, HERE, WRITER, run, field, oldValue, newValue, `2026-10-28 12:00:${String(n).padStart(2, '0')}`)
    return id
  }
  const quoting = (id: string): string => JSON.stringify({ signals: [{ evidence: [id] }] })
  const name = (way: Way, mayRead: boolean, row: (message: string) => string): void => {
    const message = say(mayRead ? READER : OTHER, `A made-up message named by ${way}${mayRead ? '' : ', hidden'} ${String(named.length)}`)
    named.push({ way, message, mayRead, row: row(message) })
  }
  for (const mayRead of [false, true]) {
    name('its record', mayRead, (message) => aRow(message, 'title', null, null))
    name('its old value', mayRead, (message) => aRow(run, 'data.about', message, null))
    name('its new value', mayRead, (message) => aRow(run, 'data.about', null, message))
    name('a string in its honour reading', mayRead, (message) => aRow(run, 'data.honour', quoting(message), '{}'))
    name('a string in its honour reading', mayRead, (message) => aRow(run, 'data.honour', '{}', quoting(message)))
  }
  // A HIDDEN MESSAGE SINCE DELETED, named as an old value: the rule leaves out a row naming a deleted message too.
  name('its old value', false, (message) => aRow(run, 'data.about', message, null))
  db.prepare("UPDATE records SET deleted_at = '2026-10-28 12:30:00' WHERE id = ?").run(named.at(-1)!.message)
  noMessageRow = aRow(run, 'data.honour', '{}', quoting(NO_MESSAGE))
  plainWordRow = aRow(run, 'data.about', null, 'a made-up word that is no id')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (previousHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = previousHome
  rmSync(home, { recursive: true, force: true })
})

const theReader = () => messages.theMessageReader({ type: 'agent', id: READER })
const theOwner = () => messages.theMessageReader({ type: 'human', id: THE_PERSON })
const listedIn = (work: { changes: { id: string }[] }): Set<string> => new Set(work.changes.map((one) => one.id))

it('the reader may not read the messages the fixture hides from it, and every row is stored under the run', () => {
  const hidden = messages.everyMessageHiddenFrom(theReader(), HERE)
  for (const one of named) expect(hidden.includes(one.message), `${one.way}: ${one.message} is hidden`).toBe(!one.mayRead)
  expect(messages.everyMessageHiddenFrom(theOwner(), HERE)).toEqual([])
  const every = listedIn(sessions.sessionWork(run, HERE, 200, []))
  for (const row of [...named.map((one) => one.row), noMessageRow, plainWordRow]) expect(every, `the run's rows`).toContain(row)
})

it.each(WAYS)("a row naming a message by %s is left out for a reader who may not read it, and listed where the reader may", (way) => {
  const reader = theReader()
  const theIds = sessions.theIdsTheChangeRowsOfASessionName([run])
  const hidden = sessions.theMessagesASessionsRowsNameHiddenFrom(reader, run, HERE)
  const listed = listedIn(sessions.sessionWork(run, HERE, 200, hidden))
  const ofTheWay = named.filter((one) => one.way === way)
  expect(ofTheWay.some((one) => !one.mayRead) && ofTheWay.some((one) => one.mayRead), 'both kinds of message').toBe(true)
  for (const one of ofTheWay) {
    expect(theIds, `the ids the rows name: ${one.message}`).toContain(one.message)
    expect(hidden.includes(one.message), `hidden: ${one.message}`).toBe(!one.mayRead)
    expect(listed.has(one.row), `listed: ${one.row}`).toBe(one.mayRead)
  }
  const whole = messages.everyMessageHiddenFrom(reader, HERE)
  for (const limit of [200, 2]) {
    expect(JSON.stringify(sessions.sessionWork(run, HERE, limit, hidden)), `the work at a limit of ${String(limit)}`).toBe(
      JSON.stringify(sessions.sessionWork(run, HERE, limit, whole)),
    )
  }
})

it('a row whose honour reading quotes a string that is no message, or whose value is a plain word, is still listed', () => {
  expect(sessions.theIdsTheChangeRowsOfASessionName([run]), 'the ids the rows name').toContain(NO_MESSAGE)
  const hidden = sessions.theMessagesASessionsRowsNameHiddenFrom(theReader(), run, HERE)
  expect(hidden).not.toContain(NO_MESSAGE)
  const listed = listedIn(sessions.sessionWork(run, HERE, 200, hidden))
  expect(listed.has(noMessageRow), 'the row quoting a string that is no message').toBe(true)
  expect(listed.has(plainWordRow), 'the row whose value is a plain word').toBe(true)
})

/** Every statement run while `work` runs, by its SQL. */
async function traced<T>(work: () => T | Promise<T>): Promise<{ answer: T; ran: string[] }> {
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  // THE STATEMENTS' OWN PROTOTYPE, so a statement prepared before this runs and kept is counted too.
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const ran: string[] = []
  const originals = new Map<string, Run>()
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const call = prototype[method]!
    originals.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      ran.push(this.source)
      return call.apply(this, params)
    }
  }
  try {
    return { answer: await work(), ran }
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
}

/** A statement's SQL with each list of `?` written as one, so a read of one id and a read of many are the same read. */
const asOneRead = (sql: string): string => sql.replace(/\?(\s*,\s*\?)*/g, '?')

it("the run's detail answers the work the whole list gives, for the reader and the owner, and works out no whole list", async () => {
  // THE LIST'S OWN READ: what `everyMessageHiddenFrom` runs besides the reader's rule.
  const ids = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message'").all() as { id: string }[]).map((row) => row.id)
  const theRule = new Set((await traced(() => messages.theMessagesThisReaderMayRead(theReader(), ids))).ran.map(asOneRead))
  const theListsOwnRead = new Set((await traced(() => messages.everyMessageHiddenFrom(theReader(), HERE))).ran.map(asOneRead).filter((sql) => !theRule.has(sql)))
  expect(theListsOwnRead.size, 'one statement, taken from the code').toBe(1)

  for (const [who, headers, reader] of [['the reader', AS_READER, theReader()], ['the owner', AS_THE_OWNER, theOwner()]] as const) {
    const { answer: reply, ran } = await traced(() => app.inject({ method: 'GET', url: `/api/sessions/${run}`, headers }))
    expect(reply.statusCode, reply.body).toBe(200)
    const work = (reply.json() as { work: unknown }).work
    expect(JSON.stringify(work), `${who}'s work`).toBe(JSON.stringify(sessions.sessionWork(run, HERE, 200, messages.everyMessageHiddenFrom(reader, HERE))))
    expect.soft(ran.filter((sql) => theListsOwnRead.has(asOneRead(sql))).length, `${who}: the whole list is worked out`).toBe(0)
  }
})
