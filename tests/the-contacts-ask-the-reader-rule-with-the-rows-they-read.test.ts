// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S CONTACT ROWS ASK THE READER'S RULE WITH THE MESSAGE ROWS AND DELIVERY ROWS THEY HAVE JUST READ.
 *
 * MEASURED FIRST, 28 October 2026, on the made-up office at the scale of 22 October 2026: GET
 * /api/messages/contact-list for an agent with 19,384 messages ran 5,040 statements, the median of nine reads
 * 650 ms. The contact read reads the agent's messages whole with their delivery rows, and then asks the reader's
 * rule which of them it may read. The rule read three fields of 17,140 of those messages again in 35 statements,
 * and their delivery rows again in 35 more.
 *
 * HOW IT IS PROVED. The answer is compared with the reads it stands for: the reader's messages, kept by
 * `onlyTheMessagesThisReaderMayRead` asked on its own, and the contact rows `contactsFor` makes of them. The work is
 * counted at the statement, with each statement's SQL taken from a lone read: the records read the rule runs for an
 * id that names nothing, and the delivery read `theDeliveryRowsOf` runs. The first is not run at all, and the
 * second runs as often as it runs for the reader's messages alone. Both counts are soft, so code that does more
 * work is still checked for its answer. The fixture holds a message in the reader's part that it may not read, and
 * one message it may read for each of three reasons: it sent it, it was handed it, and a summary told it about it.
 *
 * CONTROL: on the code before this change the two counts were red and the answer green.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { nowStamp } from '../src/shared/time.ts'

let t: TestDb
beforeAll(async () => {
  t = await freshDb()
})
afterAll(() => t.close())

/** Every statement run while `work` runs, by its SQL. */
function traced<T>(work: () => T): { answer: T; ran: string[] } {
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
    return { answer: work(), ran }
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
}

/** A statement's SQL with each list of `?` written as one, so a read of one id and a read of many are the same read. */
const asOneRead = (sql: string): string => sql.replace(/\?(\s*,\s*\?)*/g, '?')

it("answers an agent's contacts as the reader's rule asked alone does, reading no message row or delivery row twice", async () => {
  const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
  const { contactsFor, everyAgentById, everybodyRegistered, onlyTheMessagesThisReaderMayRead, theContactsOfOneReader, theDeliveryRowsOf, theMessagesOfOneReader, thePartiesOfMany } =
    await import('../src/server/lib/messages.ts')

  const agent = (id: string) => ({ kind: 'agent' as const, id })
  const me = agent('contacts-reader')
  const other = agent('contacts-other')
  const third = agent('contacts-third')
  for (const one of [me, other, third]) {
    t.client.sqlite
      .prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
      .run(one.id, `${one.id}-handle`, one.id, nowStamp())
  }
  const say = (from: { id: string }, to: { kind: 'agent'; id: string }, title: string) =>
    t.api.createRecord({ workspaceId: 'default', kind: 'message', title, data: { body: `${title}.`, to: [to] }, actor: { type: 'agent', id: from.id } }).id
  // A LETTER A SUMMARY TOLD `told` ABOUT, as the dead-letter sweep stores it: one routed entry with the summary's id.
  const routed = (id: string, told: { kind: 'agent'; id: string }) =>
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.routed', json(?)) WHERE id = ?")
      .run(JSON.stringify([{ for: third, because: 'Nobody answered.', line: 'Told in a summary.', to: told, passedOver: [], inSummary: 'a-summary' }]), id)
  const sent = say(me, other, 'The seed trays')
  const handed = say(other, me, 'The watering can')
  const toldMe = say(other, third, 'The cold frame')
  routed(toldMe, me)
  const notMine = say(other, third, 'The potting shed')
  routed(notMine, third)

  const reader = { readsEveryMessage: false as const, who: me }
  const registered = everybodyRegistered()
  const whole = theMessagesOfOneReader(me, registered, EVERY_PROJECT)
  const mayRead = onlyTheMessagesThisReaderMayRead(reader, whole)
  expect(whole.map((one) => one.id), 'the fixture holds what it means to').toEqual(expect.arrayContaining([sent, handed, toldMe, notMine]))
  expect(mayRead.map((one) => one.id)).toEqual(expect.arrayContaining([sent, handed, toldMe]))
  expect(mayRead.map((one) => one.id)).not.toContain(notMine)

  const contacts = traced(() => theContactsOfOneReader(me, reader))
  // EACH POOL ENTRY HOLDS ONLY THE FIELDS THE CONTACTS READ, so after the ids in order it is compared with the same whole
  // entry cut to its own keys, a routed entry's symbol among them.
  const cutTo = (entry: object, keysOf: object): object => Object.fromEntries(Reflect.ownKeys(keysOf).map((key) => [key, Reflect.get(entry, key)]))
  const pool = contacts.answer.pool
  expect(pool.map((one) => one.id)).toEqual(mayRead.map((one) => one.id))
  expect(pool).toEqual(mayRead.map((one, i) => cutTo(one, pool[i] ?? {})))
  expect(contacts.answer.contacts).toEqual(contactsFor(me, registered, EVERY_PROJECT, mayRead, everyAgentById()))
  const withNoReader = theContactsOfOneReader(me).pool
  expect(withNoReader.map((one) => one.id), 'with no reader every message of the part is used').toEqual(whole.map((one) => one.id))
  expect(withNoReader).toEqual(whole.map((one, i) => cutTo(one, withNoReader[i] ?? {})))

  const theRulesOwnRead = new Set(traced(() => thePartiesOfMany(['no record has this id'])).ran.map(asOneRead))
  const theDeliveryRead = new Set(traced(() => theDeliveryRowsOf([sent], me)).ran.map(asOneRead))
  expect(theRulesOwnRead.size, 'one statement each, taken from the code').toBe(1)
  expect(theDeliveryRead.size).toBe(1)
  const runsOf = (ran: string[], read: Set<string>): number => ran.filter((sql) => read.has(asOneRead(sql))).length
  const alone = traced(() => theMessagesOfOneReader(me, registered, EVERY_PROJECT)).ran
  expect(runsOf(alone, theDeliveryRead), "the reader's messages read their delivery rows").toBeGreaterThan(0)
  expect.soft(runsOf(contacts.ran, theRulesOwnRead), "the reader's rule reads no message row again").toBe(0)
  expect.soft(runsOf(contacts.ran, theDeliveryRead), 'the delivery rows are read once').toBe(runsOf(alone, theDeliveryRead))
})
