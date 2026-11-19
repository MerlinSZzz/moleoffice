// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S MESSAGES KEPT UNDER ITS OLD REGISTRY ID ARE ITS OWN (item 30c, part 2b-2). A message's sender, its delivery
 * rows and a read of a conversation name an agent by registry id. A row written before an alias was filed may hold the
 * agent's old id, and it keeps those bytes. So the agent's conversation holds a message sent or handed under the old id;
 * its waiting list, its unseen messages and the messages it may read hold one queued under it; and the hand-over marks
 * that row, where it answered before that the message was not addressed to the agent. A new delivery and a new read
 * name the canonical id, and a delivery under the old id counts as already there. With no alias filed each statement
 * is asked as before; with one filed it is asked by the same index.
 *
 * Every agent, alias, message and read here is made up, in a throwaway office. The old rows are put in place by a
 * direct write, because the office writes the canonical id.
 *
 * MUTATIONS, after a control run: give the participant list no old ids, and the first case goes red. Read an agent's
 * waiting list by its canonical id alone, and the second and fifth cases go red. Store a delivery under the id it was
 * handed, and the third case goes red. Read a conversation's read point by the pair as asked, and the fourth case goes
 * red. Take every id filed for an agent as its own, and the fifth case goes red. Make a second alias reader in the
 * conversation door, in the list of conversations between agents or in the door to one of them, and the sixth case goes
 * red. Ask the reads by `IN` with no alias filed, and the statements go red. Ask the session's hand-over search in the
 * old words when an alias is filed, and the last case goes red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { inventedRegistry } from './registry-alias-fixture.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

// The fixture's live agent, and an old id of it that this file files as an alias. The fixture's other agent is retired,
// and its own filed alias is the live agent's handle, so that alias is not the other agent's alone.
const live = { kind: 'agent' as const, id: 'CanonicalB2' }
const liveOldId = 'old-id-of-the-live-agent'
const other = { kind: 'agent' as const, id: 'CanonicalA1' }
const otherOldId = 'old-id-of-the-other-agent'
const person = { kind: 'person' as const, id: THE_TEST_OFFICES_OWNER.id }
const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

const messages = () => import('../src/server/lib/messages.ts')
const handles = () => import('../src/server/lib/handles.ts')
async function file(aliasId: string, canonicalId: string): Promise<void> {
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId, canonicalId }])
}
const fileTheOldId = () => file(liveOldId, live.id)

let serial = 0
/** A message written through the office, from the person or from the live agent. */
function aMessage(from: 'the person' | 'the agent', to: readonly { kind: string; id: string }[]): string {
  serial += 1
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: `Made-up message ${serial}`,
    data: { body: `Made-up words ${serial}.`, to },
    actor: from === 'the person' ? t.api.HUMAN : { type: 'agent', id: live.id },
  }).id
}
/** The message's sender, its addressees and its delivery rows, rewritten from one agent id to another, as an old row holds them. */
function storedUnder(messageId: string, from: string, to: string): void {
  const sqlite = t.client.sqlite
  const row = sqlite.prepare('SELECT data FROM records WHERE id = ?').get(messageId) as { data: string }
  const data = JSON.parse(row.data) as { sentBy?: { kind: string; id: string }; to?: { kind: string; id: string }[] }
  if (data.sentBy?.kind === 'agent' && data.sentBy.id === from) data.sentBy = { kind: 'agent', id: to }
  data.to = (data.to ?? []).map(one => (one.kind === 'agent' && one.id === from ? { kind: 'agent', id: to } : one))
  sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), messageId)
  sqlite.prepare("UPDATE message_delivery SET recipient_id = ? WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id = ?").run(to, messageId, from)
}
const deliveries = (messageId: string) =>
  t.client.sqlite.prepare('SELECT recipient_kind AS kind, recipient_id AS id, mark FROM message_delivery WHERE message_id = ? ORDER BY rowid').all(messageId) as { kind: string; id: string; mark: string }[]
const reads = () => t.client.sqlite.prepare('SELECT reader_kind AS kind, reader_id AS reader, pair, as_side AS side, at FROM conversation_reads ORDER BY rowid').all()
function anOldRead(reader: { kind: string; id: string }, pair: string, side: string, at: string): void {
  t.client.sqlite
    .prepare('INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`made-up-read-${++serial}`, 'default', reader.kind, reader.id, pair, side, at)
}
const ids = (list: readonly { id: string }[]) => list.map(one => one.id)

describe('the messages of an agent with an old registry id', () => {
  it('draws a message sent and one handed under the old id in the agent\'s conversation, whole and by page', async () => {
    const sent = aMessage('the agent', [person])
    const handed = aMessage('the person', [live])
    const control = aMessage('the person', [live])
    storedUnder(sent, live.id, liveOldId)
    storedUnder(handed, live.id, liveOldId)
    await fileTheOldId()
    const app = (await apiApp()).app
    try {
      for (const page of ['', '&limit=10']) {
        const reply = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${live.id}${page}`, headers: AS_THE_PERSON })
        expect(reply.statusCode, reply.body).toBe(200)
        expect(ids((reply.json() as { messages: { id: string }[] }).messages).sort(), page).toEqual([sent, handed, control].sort())
      }
    } finally {
      await app.close()
    }
  })

  it('holds a message queued under the old id among the agent\'s waiting, unseen and readable ones, and hands it over and marks it', async () => {
    const handed = aMessage('the person', [live])
    storedUnder(handed, live.id, liveOldId)
    await fileTheOldId()
    const { messagesWaitingFor, thePoolCountedFor, theMessagesThisReaderMayRead, sayWhereADeliveryStands, markDelivery } = await messages()
    const { everythingWaitingFor } = await handles()
    expect(everythingWaitingFor(live.id).map(one => one.messageId)).toEqual([handed])
    expect(ids(messagesWaitingFor('default', live))).toEqual([handed])
    expect(thePoolCountedFor(live).find(one => one.id === handed)?.deliveries.map(one => one.mark)).toEqual(['queued'])
    // More than fifty ids, so the reader's messages are narrowed first, as a long list is.
    const many = [handed, ...Array.from({ length: 60 }, (_, n) => `made-up-not-a-message-${n}`)]
    expect([...theMessagesThisReaderMayRead({ readsEveryMessage: false, who: live }, many)]).toEqual([handed])
    // The hand-over: the waiter's run says where the delivery stands, and the agent marks it seen.
    expect(sayWhereADeliveryStands(handed, live, { because: 'Made-up hand-over.', mark: 'delivered' }).mark).toBe('delivered')
    expect(markDelivery(handed, live, 'seen').changed).toBe(true)
    expect(deliveries(handed)).toEqual([{ kind: 'agent', id: liveOldId, mark: 'seen' }])
    expect(everythingWaitingFor(live.id)).toEqual([])
    expect(messagesWaitingFor('default', live)).toEqual([])
  })

  it('writes a new delivery under the canonical id, and counts a delivery under the old id as there', async () => {
    const old = aMessage('the person', [live])
    storedUnder(old, live.id, liveOldId)
    await fileTheOldId()
    const { writeTheDeliveries } = await messages()
    // A message whose addressees are written again, as a patch to it writes them, is not queued again.
    expect(writeTheDeliveries(old, [{ kind: 'agent', id: liveOldId }], null)).toBe(0)
    expect(writeTheDeliveries(old, [live], null)).toBe(0)
    expect(deliveries(old)).toEqual([{ kind: 'agent', id: liveOldId, mark: 'queued' }])
    // A delivery handed the old id is written under the canonical id.
    const fresh = aMessage('the person', [person])
    expect(writeTheDeliveries(fresh, [{ kind: 'agent', id: liveOldId }], null)).toBe(1)
    expect(deliveries(fresh).filter(one => one.kind === 'agent')).toEqual([{ kind: 'agent', id: live.id, mark: 'queued' }])
    expect(writeTheDeliveries(fresh, [live, { kind: 'agent', id: liveOldId }], null)).toBe(0)
  })

  it('reads an old read point of a conversation and a group, and writes a new one under the canonical ids', async () => {
    await fileTheOldId()
    const { pairKey, whenTheyLastRead, recordThatSomebodyRead } = await messages()
    const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
    const thePair = pairKey(live, other)
    anOldRead(person, [liveOldId, other.id].sort().join('~'), liveOldId, '2026-01-01 10:00:00')
    anOldRead({ kind: 'agent', id: liveOldId }, 'made-up-group', liveOldId, '2026-01-01 11:00:00')
    expect(whenTheyLastRead(person, thePair, EVERY_PROJECT)).toMatchObject({ asSide: liveOldId, at: '2026-01-01 10:00:00' })
    expect(whenTheyLastRead(live, 'made-up-group', EVERY_PROJECT)).toMatchObject({ at: '2026-01-01 11:00:00' })
    recordThatSomebodyRead(person, thePair, { kind: 'agent', id: liveOldId }, 'default', '2026-01-02 10:00:00')
    recordThatSomebodyRead({ kind: 'agent', id: liveOldId }, 'made-up-group', { kind: 'agent', id: liveOldId }, 'default', '2026-01-02 11:00:00')
    // One row for each reader in each conversation, as before, now under the canonical ids.
    expect(reads()).toEqual([
      { kind: 'person', reader: THE_TEST_OFFICES_OWNER.id, pair: thePair, side: live.id, at: '2026-01-02 10:00:00' },
      { kind: 'agent', reader: live.id, pair: 'made-up-group', side: live.id, at: '2026-01-02 11:00:00' },
    ])
  })

  it('does not take another agent\'s messages, or an old id that another agent bears as its handle', async () => {
    await file(otherOldId, other.id)
    // The fixture's alias: the other agent's old id, which is the live agent's handle.
    await file('archived-cobalt', other.id)
    const toTheOther = aMessage('the person', [live])
    storedUnder(toTheOther, live.id, otherOldId)
    const toTheHandle = aMessage('the person', [live])
    storedUnder(toTheHandle, live.id, 'archived-cobalt')
    const { messagesWaitingFor } = await messages()
    const { everythingWaitingFor } = await handles()
    expect(everythingWaitingFor(live.id)).toEqual([])
    expect(ids(messagesWaitingFor('default', live))).toEqual([])
    expect(everythingWaitingFor(other.id).map(one => one.messageId)).toEqual([toTheOther])
    expect(ids(messagesWaitingFor('default', other))).toEqual([toTheOther])
  })

  it('reads the filed aliases once for a read of a conversation, of the conversations between agents and of one of them', async () => {
    const handed = aMessage('the person', [live])
    storedUnder(handed, live.id, liveOldId)
    await fileTheOldId()
    const { pairKey } = await messages()
    const app = (await apiApp()).app
    try {
      const sqlite = t.client.sqlite
      const prepare = sqlite.prepare.bind(sqlite)
      const conversation = `/api/messages/conversation?kind=agent&id=${live.id}`
      // The door to one pair runs first. It writes the person's read point, which the list of conversations then reads.
      for (const url of [conversation, `${conversation}&limit=10`, `/api/messages/between/${encodeURIComponent(pairKey(live, other))}`, '/api/messages/between-agents']) {
        let listReads = 0
        ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
          if (/FROM registry_aliases a ORDER BY/.test(text)) listReads += 1
          return prepare(text)
        }
        try {
          const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
          expect(reply.statusCode, reply.body).toBe(200)
        } finally {
          delete (sqlite as unknown as { prepare?: unknown }).prepare
        }
        expect(listReads, url).toBe(1)
      }
    } finally {
      await app.close()
    }
  })
})

describe('the statements', () => {
  /** Each statement prepared while `act` runs that `which` matches, with the plan SQLite makes for it. */
  function planned(act: () => unknown, which: RegExp): { text: string; plan: string[] }[] {
    const sqlite = t.client.sqlite
    const prepare = sqlite.prepare.bind(sqlite)
    const seen: string[] = []
    ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
      if (which.test(text)) seen.push(text)
      return prepare(text)
    }
    try { act() } finally { delete (sqlite as unknown as { prepare?: unknown }).prepare }
    return [...new Set(seen)].map(text => ({
      text,
      plan: (prepare(`EXPLAIN QUERY PLAN ${text}`).all(...Array((text.match(/\?/g) ?? []).length).fill('made-up')) as { detail: string }[]).map(row => row.detail),
    }))
  }
  // A test of one id against a list: what an added old id changes in a statement's words, and nothing else.
  const asOneId = (text: string) => text.replace(/ in \(\?(?:, \?)*\)/gi, ' = ?').replace(/ = \?(?:, \?)*/g, ' = ?')

  it('asks by one id with no alias filed, and by the same index with one filed', async () => {
    const handed = aMessage('the person', [live])
    const sent = aMessage('the agent', [person])
    const { messagesWaitingFor, thePoolCountedFor, theMessagesThisReaderMayRead, whenTheyLastRead, pairKey, theQueuedOnesOfTheConversation, everybodyRegistered } = await messages()
    const { everythingWaitingFor } = await handles()
    const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
    const many = [handed, sent, ...Array.from({ length: 60 }, (_, n) => `made-up-not-a-message-${n}`)]
    const readers = (): void => {
      everythingWaitingFor(live.id)
      messagesWaitingFor('default', live)
      thePoolCountedFor(live)
      theMessagesThisReaderMayRead({ readsEveryMessage: false, who: live }, many)
      whenTheyLastRead(person, pairKey(live, other), EVERY_PROJECT)
      whenTheyLastRead(live, 'made-up-group', EVERY_PROJECT)
      theQueuedOnesOfTheConversation(live, person, everybodyRegistered(), EVERY_PROJECT)
    }
    const theirRows = /message_delivery|conversation_reads|records_message_sent_by_idx/
    const before = planned(readers, theirRows)
    expect(before.length, before.map(one => one.text).join('\n')).toBeGreaterThanOrEqual(8)
    // With no alias filed, one id is asked as it was, by `= ?`, and not as a list of one.
    for (const one of before) expect(one.text, one.text).not.toMatch(/(recipient_id"?|reader_id"?|pair"?) (in|IN) \(\?\)/)
    await fileTheOldId()
    const after = planned(readers, theirRows)
    // Each statement as it was asked with no alias, by its words with every list of ids read as one id. Two reads of
    // a conversation's read point asked in the same words before may differ now, one by the reader's ids and one by
    // the pair's.
    const was = new Map(before.map(one => [asOneId(one.text), one]))
    expect([...new Set(after.map(one => asOneId(one.text)))]).toEqual([...was.keys()])
    expect(after.filter(one => !was.has(one.text)).length, 'the statements an old id changes').toBeGreaterThanOrEqual(6)
    const withoutTheSort = (plan: string[]) => plan.filter(line => !/TEMP B-TREE FOR ORDER BY/.test(line))
    for (const one of after) {
      // The same indexes, searched for each id. Where rows are asked newest first, SQLite sorts the rows of the ids
      // together, which is the one step added.
      expect(withoutTheSort(one.plan), one.text).toEqual(withoutTheSort(was.get(asOneId(one.text))!.plan))
      expect(one.plan.join('\n'), one.text).not.toMatch(/SCAN (message_delivery|conversation_reads)\b/)
    }
  })

  it('finds a hand-over to a session under every id of its agent, by the recipient index', async () => {
    const { theLiveSessionTookIt } = await import('../src/shared/handles.ts')
    const { nowStamp } = await import('../src/shared/time.ts')
    const session = 'made-up-session'
    const handed = aMessage('the person', [live])
    storedUnder(handed, live.id, liveOldId)
    t.client.sqlite.prepare("UPDATE message_delivery SET mark = 'delivered', because = ?, at = '2026-01-02 10:00:00' WHERE message_id = ?").run(theLiveSessionTookIt(session), handed)
    // A hold heard from now, so it has not lapsed when the hand-over is asked.
    t.client.sqlite
      .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
      .run('made-up-hold', live.id, session, 'made-up-machine', 'claude-code', nowStamp(), nowStamp())
    const { theFirstMessageHandedToThisSessionAfter } = await handles()
    const handedOver = /handle_holds|message_delivery d WHERE/
    const act = () => theFirstMessageHandedToThisSessionAfter(session, new Date('2026-01-01T00:00:00Z'))
    const before = planned(act, handedOver)
    expect(before.map(one => one.text).join('\n')).toMatch(/CROSS JOIN message_delivery d ON d\.recipient_kind = 'agent' AND d\.recipient_id = h\.agent_id/)
    await fileTheOldId()
    expect(act()).not.toBeNull()
    const after = planned(act, handedOver)
    for (const one of after) expect(one.plan.join('\n'), one.text).not.toMatch(/SCAN (d|message_delivery)\b/)
    expect(after.map(one => one.plan.join('\n')).join('\n')).toMatch(/message_delivery_recipient_idx/)
  })
})
