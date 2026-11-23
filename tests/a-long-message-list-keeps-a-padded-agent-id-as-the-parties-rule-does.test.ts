// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG MESSAGE LIST KEEPS AN AGENT ID STORED WITH WHITE SPACE AROUND IT, AS THE PARTIES RULE DOES.
 *
 * WHAT WENT WRONG. Whether a reader may read a message is decided by the parties rule, thePartiesOfMany in
 * src/server/lib/messages.ts. It trims a stored agent id with JavaScript's trim() before it looks the agent up
 * (everyAgentAStoredStampCouldName). A list of more than A_SHORT_LIST messages is first narrowed to the messages the
 * reader could be a party to, and that narrowing compared the stored ids exactly. So a message whose stored sender,
 * delivery row or group membership named the reader with white space around it could be read in a list of 50 or
 * fewer, and not in a longer list. Nothing failed: the messages were just left out.
 *
 * WHAT THIS FILE HOLDS. The reader is an agent whose handle is not its id. Each of the eight cases has one message more
 * than A_SHORT_LIST. In cases 1, 2, 3, 5, 6 and 8, one stored name alone makes the reader a party:
 *
 *   1. the stored sender is the reader's id with spaces around it;
 *   2. a delivery row names the reader's id with a tab before it and a line ending after it;
 *   3. a membership of the group the messages went to holds the reader's handle with a no-break space before it and
 *      a tab after it. SQLite's trim() strips neither of those, and JavaScript's trim() strips both;
 *   5. the stored sender is the reader's id with a zero-width no-break space (U+FEFF) and a space after it, and
 *      nothing before it;
 *   6. a delivery row names the reader's handle with an ideographic space (U+3000) before it and a zero-width no-break
 *      space after it. Both characters are at or above U+0080;
 *   8. a membership of the group the messages went to, stored under the kind `helper`, holds the reader's id with a
 *      space after it and nothing before it.
 *
 * For each of these cases, the test shows that nothing else names the reader and that the parties rule counts the
 * reader. Asked one message at a time, the reader may read each one. Asked all of them in one list, it may read every
 * one too.
 *
 * Cases 4 and 7 go the other way. In case 4, the messages name another agent, with white space around it, in all three
 * places. In case 7, the stored sender and a delivery row begin with the reader's id or handle, go on with an x, and
 * end with white space, so each one trims to another agent's name. In both cases the reader may read none of the
 * messages, in a short list or a long one.
 *
 * WHY CASES 5, 6, 7 AND 8. For the sender, the delivery and the group membership, a long list's narrowing reads only the
 * stored ids that could be one of the reader's names with white space around it. These are the ids that begin below
 * '!', the ids that begin at or above U+0080, and the ids that begin with one of the reader's names. A membership's ids
 * are read so for each kind stored in the memberships but `person`. Case 5 is an id found only by the range of the
 * reader's id. Case 6 is an id found only by the range at or above U+0080. Case 7 holds ids in the ranges of the
 * reader's id and handle that trim() does not turn into either. Case 8 is a membership's id found only by the range of
 * the reader's id, under a kind that is not `agent`. The last test checks the two bounds the first two ranges rest on:
 * every code point JavaScript's trim() removes lies outside them, and SQLite compares a stored name that begins with
 * one as the ranges need.
 *
 * Cases 1, 2, 3, 5, 6 and 8 fail on main's code, where the list of all of them comes back empty. Cases 4 and 7 pass
 * there too. Cases 5, 6, 7 and 8 also pass on a narrowing that reads every stored id whole: they are here for the
 * narrowing that reads by ranges.
 *
 * MADE UP. The agents, the groups and the messages are made up for this test, in a fresh test database. No live
 * office is read. No write door is known to store an agent id with white space around it, or a membership under the
 * kind `helper`. Each one is written here by SQL, as an older row could hold it.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const person = { kind: 'person' as const, id: THE_PERSON }
const sender = { kind: 'agent' as const, id: 'padded-sender' }
const reader = { kind: 'agent' as const, id: 'padded-reader' }
const readerHandle = 'reader-of-the-kiln'
const other = { kind: 'agent' as const, id: 'padded-other' }
const otherHandle = 'other-of-the-kiln'
/** An agent whose id begins with the reader's id and whose handle begins with the reader's handle. */
const prefixed = { kind: 'agent' as const, id: `${reader.id}x` }
const prefixedHandle = `${readerHandle}x`

let t: TestDb
beforeAll(async () => {
  t = await freshDb()
  const { nowStamp } = await import('../src/shared/time.ts')
  for (const [id, handle] of [[sender.id, sender.id], [reader.id, readerHandle], [other.id, otherHandle], [prefixed.id, prefixedHandle]] as const) {
    t.client.sqlite
      .prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
      .run(id, handle, handle, nowStamp())
  }
})
afterAll(() => t.close())

/** A group of the person and the sender, and one message more than A_SHORT_LIST from the sender to it. */
async function aGroupWithALongList(name: string): Promise<{ group: string; ids: string[] }> {
  const { openAGroup } = await import('../src/server/lib/groups.ts')
  const { A_SHORT_LIST } = await import('../src/server/lib/messages.ts')
  const group = openAGroup({
    workspaceId: 'default', name, openedBy: person, because: 'To plan the firing.',
    members: [person, sender].map((who) => ({ who, because: 'Works on the firing.' })),
  })
  const ids: string[] = []
  for (let i = 0; i <= A_SHORT_LIST; i++) {
    ids.push(t.api.createRecord({
      workspaceId: 'default', kind: 'message', title: 'A kiln note',
      data: { body: `Kiln note ${String(i)}`, toGroup: group.id, sentBy: sender },
      actor: { type: 'agent', id: sender.id },
    }).id)
  }
  expect(ids.length).toBeGreaterThan(A_SHORT_LIST)
  return { group: group.id, ids }
}

/** Store this sender id on each of these messages, by SQL. */
function storeTheSender(ids: readonly string[], stored: string): void {
  for (const id of ids) t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(stored, id)
}

/** Add one delivery row to each of these messages, naming this stored agent id, by SQL. */
function storeADelivery(ids: readonly string[], stored: string, rowPrefix: string, at: string): void {
  ids.forEach((id, i) => t.client.sqlite
    .prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)")
    .run(`${rowPrefix}-${String(i)}`, id, stored, at))
}

/**
 * Add a membership of this group holding this stored agent id under this kind, by SQL. It is added after the messages,
 * so no delivery row of theirs names it. It is dated as the person's membership, so it was a membership when each
 * message was sent.
 */
function storeAMembership(group: string, stored: string, rowId: string, kind = 'agent'): void {
  t.client.sqlite
    .prepare("INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because) SELECT ?, group_id, ?, ?, joined_at, 'Works on the firing.' FROM group_members WHERE group_id = ? AND member_kind = 'person'")
    .run(rowId, kind, stored, group)
}

/**
 * HOW MANY STORED NAMES OF THESE MESSAGES NAME AN AGENT, in each place the parties rule reads, with each name trimmed
 * as the parties rule trims it. The agents here have no agent records and no older ids, so an agent is named by its id
 * or its handle alone. `routed` counts the messages that hold a sweep's list, which the narrowing keeps for every
 * reader, so it must be 0 for a case to show anything.
 */
function theStoredNamesOf(ids: readonly string[], names: readonly string[]): { sender: number; delivery: number; membership: number; routed: number } {
  const namesIt = (stored: unknown): boolean => typeof stored === 'string' && names.includes(stored.trim())
  const list = JSON.stringify(ids)
  const messages = t.client.sqlite
    .prepare("SELECT json_extract(data, '$.sentBy.id') AS sender, json_extract(data, '$.toGroup') AS toGroup, json_type(data, '$.routed') AS routed FROM records WHERE id IN (SELECT value FROM json_each(?))")
    .all(list) as { sender: unknown; toGroup: unknown; routed: unknown }[]
  expect(messages.length).toBe(ids.length)
  const deliveries = t.client.sqlite
    .prepare('SELECT recipient_id AS id FROM message_delivery WHERE message_id IN (SELECT value FROM json_each(?))')
    .all(list) as { id: unknown }[]
  const memberships = t.client.sqlite
    .prepare('SELECT member_id AS id FROM group_members WHERE group_id IN (SELECT value FROM json_each(?))')
    .all(JSON.stringify([...new Set(messages.map((one) => one.toGroup))])) as { id: unknown }[]
  return {
    sender: messages.filter((one) => namesIt(one.sender)).length,
    delivery: deliveries.filter((one) => namesIt(one.id)).length,
    membership: memberships.filter((one) => namesIt(one.id)).length,
    routed: messages.filter((one) => one.routed !== null).length,
  }
}

const isThe = (who: { kind: string; id: string }) => (one: { kind: string; id: string }): boolean => one.kind === who.kind && one.id === who.id
const messageReader = { readsEveryMessage: false as const, who: reader }

/** The parties rule counts the reader in each message, and the reader may read each one alone and every one together. */
async function theReaderMayReadEveryOne(ids: readonly string[]): Promise<void> {
  const { A_SHORT_LIST, onlyTheMessagesThisReaderMayRead, thePartiesOfMany } = await import('../src/server/lib/messages.ts')
  const parties = thePartiesOfMany(ids)
  expect(ids.filter((id) => parties.get(id)?.some(isThe(reader)) === true), 'the parties rule trims the stored name and finds the reader').toEqual(ids)
  const rows = ids.map((id) => ({ id, entry: 'message' as const }))
  expect(rows.length).toBeGreaterThan(A_SHORT_LIST)
  expect(rows.filter((row) => onlyTheMessagesThisReaderMayRead(messageReader, [row]).length === 1), 'one message at a time').toEqual(rows)
  expect(onlyTheMessagesThisReaderMayRead(messageReader, rows), 'a list longer than the short-list limit leaves out the messages').toEqual(rows)
}

it('keeps every message whose stored sender is the reader\'s id with spaces around it, in a long list as in a short one', async () => {
  const { ids } = await aGroupWithALongList('The glaze group')
  storeTheSender(ids, `  ${reader.id}  `)
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'only the stored sender names the reader').toEqual({ sender: ids.length, delivery: 0, membership: 0, routed: 0 })
  await theReaderMayReadEveryOne(ids)
})

it('keeps every message whose delivery row holds the reader\'s id with a tab and a line ending around it, in a long list as in a short one', async () => {
  const { nowStamp } = await import('../src/shared/time.ts')
  const { ids } = await aGroupWithALongList('The clay group')
  storeADelivery(ids, `\t${reader.id}\r\n`, 'clay-delivery', nowStamp())
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'only a delivery row names the reader').toEqual({ sender: 0, delivery: ids.length, membership: 0, routed: 0 })
  await theReaderMayReadEveryOne(ids)
})

it('keeps every message to a group whose membership holds the reader\'s handle with a no-break space and a tab around it, in a long list as in a short one', async () => {
  const { group, ids } = await aGroupWithALongList('The ash group')
  const stored = `\u00a0${readerHandle}\t`
  storeAMembership(group, stored, 'ash-membership')
  // SQLITE'S OWN trim() LEAVES THIS NAME AS IT IS, so only JavaScript's trim(), the parties rule's, finds the reader in it.
  expect(t.client.sqlite.prepare('SELECT trim(?) AS said').get(stored)).toEqual({ said: stored })
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'only the group membership names the reader').toEqual({ sender: 0, delivery: 0, membership: 1, routed: 0 })
  await theReaderMayReadEveryOne(ids)
})

it('lets no stored name of another agent with white space around it make the reader a party, in a short list or a long one', async () => {
  const { A_SHORT_LIST, onlyTheMessagesThisReaderMayRead, thePartiesOfMany } = await import('../src/server/lib/messages.ts')
  const { nowStamp } = await import('../src/shared/time.ts')
  const { group, ids } = await aGroupWithALongList('The slip group')
  storeTheSender(ids, `  ${other.id}  `)
  storeADelivery(ids, `\t${otherHandle}\n`, 'slip-delivery', nowStamp())
  storeAMembership(group, `\u00a0${other.id}\u00a0`, 'slip-membership')
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'nothing names the reader').toEqual({ sender: 0, delivery: 0, membership: 0, routed: 0 })
  expect(theStoredNamesOf(ids, [other.id, otherHandle]), 'each place names the other agent').toEqual({ sender: ids.length, delivery: ids.length, membership: 1, routed: 0 })

  const parties = thePartiesOfMany(ids)
  expect(ids.filter((id) => parties.get(id)?.some(isThe(other)) === true), 'the parties rule trims each stored name and finds the other agent').toEqual(ids)
  expect(ids.filter((id) => parties.get(id)?.some(isThe(reader)) === true), 'and does not find the reader').toEqual([])

  const rows = ids.map((id) => ({ id, entry: 'message' as const }))
  expect(rows.length).toBeGreaterThan(A_SHORT_LIST)
  expect(rows.filter((row) => onlyTheMessagesThisReaderMayRead(messageReader, [row]).length === 1), 'one message at a time').toEqual([])
  expect(onlyTheMessagesThisReaderMayRead(messageReader, rows.slice(0, A_SHORT_LIST)), 'a list of A_SHORT_LIST messages').toEqual([])
  expect(onlyTheMessagesThisReaderMayRead(messageReader, rows), 'a list longer than the short-list limit').toEqual([])
})

it('keeps every message whose stored sender is the reader\'s id with white space after it and nothing before it, in a long list as in a short one', async () => {
  const { ids } = await aGroupWithALongList('The kiln shelf group')
  // THE STORED SENDER BEGINS WITH THE READER'S ID, so of the narrowing's ranges only the one of the reader's id holds it.
  // The first character after the id is U+FEFF, which trim() removes, so that range must reach past it.
  const stored = `${reader.id}\ufeff `
  expect(stored.trimStart(), 'nothing before the id').toBe(stored)
  storeTheSender(ids, stored)
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'only the stored sender names the reader').toEqual({ sender: ids.length, delivery: 0, membership: 0, routed: 0 })
  await theReaderMayReadEveryOne(ids)
})

it('keeps every message whose delivery row holds the reader\'s handle with an ideographic space before it, in a long list as in a short one', async () => {
  const { nowStamp } = await import('../src/shared/time.ts')
  const { ids } = await aGroupWithALongList('The cone group')
  // THE STORED NAME BEGINS WITH U+3000, so of the narrowing's ranges only the one at or above U+0080 holds it.
  storeADelivery(ids, `\u3000${readerHandle}\ufeff`, 'cone-delivery', nowStamp())
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'only a delivery row names the reader').toEqual({ sender: 0, delivery: ids.length, membership: 0, routed: 0 })
  await theReaderMayReadEveryOne(ids)
})

it('lets no stored sender or delivery row that begins with the reader\'s name and trims to another name make the reader a party, in a short list or a long one', async () => {
  const { A_SHORT_LIST, onlyTheMessagesThisReaderMayRead, thePartiesOfMany } = await import('../src/server/lib/messages.ts')
  const { nowStamp } = await import('../src/shared/time.ts')
  const { ids } = await aGroupWithALongList('The bisque group')
  // EACH STORED NAME BEGINS WITH THE READER'S ID OR HANDLE, so it is in the range of that name. It goes on with an x, so
  // its trim() is the other agent's id or handle, and not the reader's.
  const storedSender = `${prefixed.id} `
  const storedDelivery = `${prefixedHandle}\t`
  expect([storedSender.startsWith(reader.id), storedDelivery.startsWith(readerHandle)], 'each begins with the reader\'s id or handle').toEqual([true, true])
  storeTheSender(ids, storedSender)
  storeADelivery(ids, storedDelivery, 'bisque-delivery', nowStamp())
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'nothing names the reader').toEqual({ sender: 0, delivery: 0, membership: 0, routed: 0 })
  expect(theStoredNamesOf(ids, [prefixed.id, prefixedHandle]), 'the sender and a delivery row name the other agent').toEqual({ sender: ids.length, delivery: ids.length, membership: 0, routed: 0 })

  const parties = thePartiesOfMany(ids)
  expect(ids.filter((id) => parties.get(id)?.some(isThe(prefixed)) === true), 'the parties rule trims each stored name and finds the other agent').toEqual(ids)
  expect(ids.filter((id) => parties.get(id)?.some(isThe(reader)) === true), 'and does not find the reader').toEqual([])

  const rows = ids.map((id) => ({ id, entry: 'message' as const }))
  expect(rows.length).toBeGreaterThan(A_SHORT_LIST)
  expect(rows.filter((row) => onlyTheMessagesThisReaderMayRead(messageReader, [row]).length === 1), 'one message at a time').toEqual([])
  expect(onlyTheMessagesThisReaderMayRead(messageReader, rows.slice(0, A_SHORT_LIST)), 'a list of A_SHORT_LIST messages').toEqual([])
  expect(onlyTheMessagesThisReaderMayRead(messageReader, rows), 'a list longer than the short-list limit').toEqual([])
})

it('keeps every message to a group whose membership under another kind holds the reader\'s id with a space after it and nothing before it, in a long list as in a short one', async () => {
  const { group, ids } = await aGroupWithALongList('The saggar group')
  // THE STORED ID BEGINS WITH THE READER'S ID, so of the narrowing's ranges only the one of the reader's id holds it. It is
  // stored under the kind `helper`, so the narrowing finds it only if it reads that kind's part of the member index.
  const stored = `${reader.id} `
  expect(stored.trimStart(), 'nothing before the id').toBe(stored)
  storeAMembership(group, stored, 'saggar-membership', 'helper')
  expect(t.client.sqlite.prepare('SELECT member_kind AS kind FROM group_members WHERE id = ?').get('saggar-membership'), 'the membership\'s kind').toEqual({ kind: 'helper' })
  expect(theStoredNamesOf(ids, [reader.id, readerHandle]), 'only the group membership names the reader').toEqual({ sender: 0, delivery: 0, membership: 1, routed: 0 })
  await theReaderMayReadEveryOne(ids)
})

it('has two bounds outside which lies every code point JavaScript\'s trim() removes, as SQLite compares stored text', async () => {
  // MESSAGES.TS OPENS THE DATABASE WHEN IT IS IMPORTED, so the bounds are read after the fresh test database is made.
  const { TRIM_KEEPS_EVERY_CODE_POINT_FROM: from, TRIM_KEEPS_EVERY_CODE_POINT_BELOW: below } = await import('../src/server/lib/messages.ts')
  expect([typeof from, typeof below], 'the two bounds are numbers').toEqual(['number', 'number'])
  const removed: number[] = []
  for (let point = 0; point <= 0x10ffff; point++) if (String.fromCodePoint(point).trim() === '') removed.push(point)
  // THE LOOP FINDS WHAT trim() REMOVES, so the checks below are not of an empty list.
  expect(removed, 'some of the code points trim() removes').toEqual(expect.arrayContaining([0x09, 0x0a, 0x20, 0xa0, 0x3000, 0xfeff]))
  expect(removed.filter((point) => point >= from && point < below), 'the code points trim() removes from the first bound up to the second').toEqual([])
  // A STORED NAME THAT BEGINS WITH ONE OF THEM is below the first bound or at or above the second, in SQLite's own
  // comparison of text, which the narrowing's first two ranges use.
  const outside = t.client.sqlite.prepare('SELECT (char(?) || ?) < char(?) OR (char(?) || ?) >= char(?) AS outside')
  const notOutside = removed.filter((point) => (outside.get(point, readerHandle, from, point, readerHandle, below) as { outside: number }).outside !== 1)
  expect(notOutside, 'the stored names, beginning with a code point trim() removes, that SQLite puts between the bounds').toEqual([])
})
