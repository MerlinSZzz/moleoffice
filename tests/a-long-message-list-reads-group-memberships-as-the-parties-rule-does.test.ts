// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG MESSAGE LIST READS A GROUP MEMBERSHIP AS THE PARTIES RULE DOES, AND READS IT BY SEEKS OF THE MEMBER INDEX.
 *
 * WHAT WENT WRONG. Whether a reader may read a message is decided by the parties rule, thePartiesOfMany in
 * src/server/lib/messages.ts. It reads a group membership stored under any kind but `person` as an agent's. A list of
 * more than A_SHORT_LIST messages is first narrowed to the messages the reader could be a party to, and that narrowing
 * read the reader's groups only where the membership's kind was the reader's own kind. So an agent whose membership of a
 * group was stored under another kind could read that group's messages in a list of 50 or fewer, and not in a longer
 * list. Nothing failed: the messages were just left out.
 *
 * WHAT THIS FILE HOLDS. Three cases.
 *
 *   1. An agent is a member of a group, and its membership is stored under the kind `helper`. Its group has one message
 *      more than A_SHORT_LIST, and nothing else makes the agent a party to them: no delivery row names it. The parties
 *      rule counts it as a party. Asked one message at a time, the agent may read each one. Asked all of them in one
 *      list, it may read every one too.
 *   2. The same, with the membership stored under the kind `watcher`, which sorts after `person`. The narrowing reads the
 *      stored kinds first, from the lowest up, so this case holds only if that walk goes past `person`.
 *   3. The plan. For the reader of the first case, every statement the narrowing runs is recorded with its values while
 *      the long list is asked. Each one that names group_members is planned by EXPLAIN QUERY PLAN with those values.
 *      Every step on group_members must be a SEARCH. In the statement that reads the stored kinds, a step may seek the
 *      member index with no condition or by the kind alone, above the last kind read. Every other step must seek the
 *      member index by the kind and the member id.
 *
 * Cases 1 and 2 fail on main's code, where the list of all of them comes back empty. They pass on a narrowing that reads
 * every membership of every kind but `person` whole: they are here for the narrowing that seeks each kind. Case 3 fails
 * on such a narrowing, because the whole read of the member ids walks the member index, and the read of the groups by
 * any kind but `person` walks the group index.
 *
 * MADE UP. The agents, the groups and the messages are made up for this test, in a fresh test database. No live office
 * is read. No write door is known to store the kind `helper` or `watcher`, so the reader's membership is stored by SQL,
 * as an older row could be. It is stored after the messages are sent, so that no delivery row names the reader.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
beforeAll(async () => {
  t = await freshDb()
})
afterAll(() => t.close())

interface ALongList { reader: { kind: 'agent'; id: string }; ids: string[] }

/**
 * A group of the person and a sender, and one message more than A_SHORT_LIST from the sender to it. Then the reader's
 * membership of the group is stored under this kind by SQL. It is stored after the messages are sent, so no delivery
 * row names the reader. It copies the person's joined_at, so it was a membership when each message was sent.
 */
async function aLongListToAGroupWithTheReaderStoredAs(kind: string, agents: string, name: string): Promise<ALongList> {
  const { openAGroup } = await import('../src/server/lib/groups.ts')
  const { A_SHORT_LIST } = await import('../src/server/lib/messages.ts')
  const { nowStamp } = await import('../src/shared/time.ts')
  const person = { kind: 'person' as const, id: THE_PERSON }
  const reader = { kind: 'agent' as const, id: `${agents}-reader` }
  const sender = { kind: 'agent' as const, id: `${agents}-sender` }
  const addAgent = (id: string) => t.client.sqlite
    .prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
    .run(id, id, id, nowStamp())
  addAgent(reader.id)
  addAgent(sender.id)
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
  const stored = t.client.sqlite
    .prepare("INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because) SELECT ?, group_id, ?, ?, joined_at, 'Works on the firing.' FROM group_members WHERE group_id = ? AND member_kind = 'person'")
    .run(`${agents}-membership`, kind, reader.id, group.id)
  expect(stored.changes, 'the reader\'s membership is stored').toBe(1)
  return { reader, ids }
}

/** The first case's group and messages, made once, so the third case reads the same reader. */
let theFirst: Promise<ALongList> | undefined
const theFirstCase = (): Promise<ALongList> => (theFirst ??= aLongListToAGroupWithTheReaderStoredAs('helper', 'another-kind', 'The kiln group'))

/** Only the group makes the reader a party, the parties rule counts it, and it may read each one alone and every one together. */
async function theReaderMayReadEveryOne({ reader, ids }: ALongList): Promise<void> {
  const { onlyTheMessagesThisReaderMayRead, thePartiesOf } = await import('../src/server/lib/messages.ts')
  // ONLY THE GROUP MAKES THE READER A PARTY, so the long list can keep these messages only by reading the group.
  expect(t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM message_delivery WHERE recipient_id = ?').get(reader.id)).toEqual({ n: 0 })
  expect(thePartiesOf(ids[0]!), 'the parties rule counts the membership of another kind as the agent\'s').toContainEqual(reader)

  const rows = ids.map((id) => ({ id, entry: 'message' as const }))
  const messageReader = { readsEveryMessage: false as const, who: reader }
  expect(rows.filter((row) => onlyTheMessagesThisReaderMayRead(messageReader, [row]).length === 1), 'one message at a time').toEqual(rows)
  expect(onlyTheMessagesThisReaderMayRead(messageReader, rows), 'a list longer than the short-list limit leaves out the group\'s messages').toEqual(rows)
}

it('keeps every message of a group the reader is in under another kind, in a long list as in a short one', async () => {
  await theReaderMayReadEveryOne(await theFirstCase())
})

it('keeps every message of a group the reader is in under a kind that sorts after person, in a long list as in a short one', async () => {
  const kind = 'watcher'
  // THE KIND SORTS AFTER `person`, so a walk of the stored kinds that stopped at `person` would not find it.
  expect(kind > 'person', 'the kind sorts after person').toBe(true)
  const list = await aLongListToAGroupWithTheReaderStoredAs(kind, 'later-kind', 'The glaze kiln group')
  expect(t.client.sqlite.prepare('SELECT member_kind AS kind FROM group_members WHERE member_id = ?').all(list.reader.id), 'the reader\'s one membership').toEqual([{ kind }])
  await theReaderMayReadEveryOne(list)
})

it('reads the narrowing\'s group memberships by seeks of the member index, by the kind and the member id', async () => {
  const { onlyTheMessagesThisReaderMayRead } = await import('../src/server/lib/messages.ts')
  const { reader, ids } = await theFirstCase()
  const rows = ids.map((id) => ({ id, entry: 'message' as const }))

  // EVERY STATEMENT THE NARROWING RUNS, with its values: a statement run while theMessagesAReaderCouldBeAPartyTo is on the
  // call stack.
  const kept: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((sql: string) => {
    const statement = prepare(sql)
    const all = statement.all.bind(statement) as (...values: unknown[]) => unknown
    ;(statement as unknown as { all: (...values: unknown[]) => unknown }).all = (...values: unknown[]) => {
      if (new Error().stack?.includes('theMessagesAReaderCouldBeAPartyTo')) kept.push({ sql, values })
      return all(...values)
    }
    return statement
  }) as never)
  // EVERY FRAME OF THE CALL STACK, so a statement run a few calls below the narrowing is still seen to be its own.
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = Infinity
  let read: unknown
  try {
    read = onlyTheMessagesThisReaderMayRead({ readsEveryMessage: false, who: reader }, rows)
  } finally {
    Error.stackTraceLimit = limit
    spy.mockRestore()
  }
  expect(read, 'the long list').toEqual(rows)

  const memberships = kept.filter((one) => /\bgroup_members\b/.test(one.sql))
  expect(memberships.length, 'the narrowing reads group memberships').toBeGreaterThan(0)
  for (const one of memberships) {
    const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[]).map((step) => step.detail)
    const steps = plan.filter((detail) => detail.includes('group_members'))
    expect(steps.length, `a step on group_members, in the plan of ${one.sql}`).toBeGreaterThan(0)
    // THE STATEMENT THAT READS THE STORED KINDS walks the member index from the lowest kind up, one seek for each kind.
    const readsTheKinds = /\bWITH RECURSIVE\b/i.test(one.sql)
    for (const detail of steps) {
      const said = `${detail}\n\nin the plan of ${one.sql}`
      expect(detail, said).toMatch(/^SEARCH /)
      const byTheKindAndTheId = /USING (COVERING )?INDEX group_members_member_idx \(member_kind=\? AND member_id/.test(detail)
      const byTheKindAlone = readsTheKinds && /USING (COVERING )?INDEX group_members_member_idx( \(member_kind>\?\))?$/.test(detail)
      expect(byTheKindAndTheId || byTheKindAlone, said).toBe(true)
    }
  }
})
