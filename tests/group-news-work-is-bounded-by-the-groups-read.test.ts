// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GROUP NEWS READS THE READER'S OWN GROUPS, ITS READ POINTS IN ONE LIST, AND EACH STORED NAME ONCE.
 *
 * MEASURED FIRST, 28 October 2026, on the made-up office at the scale of 22 October 2026: GET
 * /api/messages/groups for an agent in 460 groups ran 7,920 statements, the median of nine reads 114 ms.
 * Every reader first read every group and every member of the office: an agent in no group read 12,174
 * rows, all but 16 of them groups and memberships. Then it read one read point per group, and for each
 * group worked out again who each stored agent name on its messages means.
 *
 * HOW IT IS PROVED. Each answer is compared with the reads it stands for: the groups with the rule
 * `groupsIn` and a member test, each read point with `whenTheyLastRead` for that group alone, and each
 * group's messages with `onlyTheMessagesThisReaderMayRead` asked about that group alone. The work is
 * counted at the statement: another group adds no row to the groups read, the read points are one
 * statement, and the batched stored-id lookup runs once for the whole answer. The three counts are soft, so code that does more work is still checked for its answers.
 * The fixture holds a group the reader left, a membership stored under a kind that is not `person` (read
 * as an agent's), and two groups with different read points.
 *
 * CONTROL: on the code before this change the three counts were red and every answer green: 13 rows for
 * 11, three read-point statements for one, and six name statements for three.
 *
 * THE MOVE, AND THE READ AFTER IT (wave 13y round 114, item 47). MEASURED FIRST, 31 October 2026, on the made-up
 * office shaped to the live counts of the door's busiest caller: 923 groups, a read point in each, all at one
 * moment, and no message newer than it. The hand-over (`?move=1&undelivered=1`) read all 3,063 messages ever sent to
 * those groups and their 10,143 delivery rows, and kept none of them. Then it moved each read point in a transaction
 * of its own, and read the filed aliases again for each one. It ran 6,498 statements, with a median of 353 ms over
 * three takes at a load of 14.3 on 20 cores; the same read without the move ran 37 statements in 62 ms. So three
 * more counts: the read after the move reads no message older than the read point in its group, the move commits
 * once, and the move reads the filed aliases no more often than the same read without the move.
 *
 * CONTROL: on the code before this change the three counts were red and every answer green: two commits for one,
 * five reads of the filed aliases for two, and three message rows for none.
 *
 * EACH GROUP FROM ITS OWN POINT (wave 13y round 126). After the move, the read group keeps its older point, and the
 * others are moved to now. The read took every group with a point from the oldest point, so it read the moved groups'
 * messages again and dropped them only afterwards. The fixture wrote every message in one second, as it nearly always
 * does, so this showed only when a second ended between two writes, in a suite at 20 workers. The read group's
 * messages are now a month older than the rest.
 *
 * CONTROL: on the code before this change that count was red and every answer green: two message rows for none.
 *
 * SIX GROUPS, SIX SENDERS, AND THEN MORE MESSAGES. The parties of twelve messages are read in as many statements as the
 * parties of one, and the answer is the same as one message at a time. Group news then answers as the per-group rule
 * does, once each sender has written eleven messages to its group: no group is past the short-list limit, all of them
 * together are, and one membership is stored under a kind that is not `person`. Two counts are soft: the short groups'
 * parties are read once for all of them, and more messages add no read of Mole Office's own row.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
beforeAll(async () => {
  t = await freshDb()
})
afterAll(() => t.close())

/** Every statement run while `work` runs, by its SQL, with the rows it handed back. */
function traced<T>(work: () => T): { answer: T; ran: { sql: string; rows: number }[] } {
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  // THE STATEMENTS' OWN PROTOTYPE, so a statement prepared before this runs and kept is counted too.
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const ran: { sql: string; rows: number }[] = []
  const originals = new Map<string, Run>()
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const call = prototype[method]!
    originals.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      const got = call.apply(this, params)
      ran.push({ sql: this.source, rows: method === 'all' ? (got as unknown[]).length : method === 'get' ? Number(got !== undefined) : 0 })
      return got
    }
  }
  try {
    return { answer: work(), ran }
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
}

const rowsOf = (ran: { rows: number }[]): number => ran.reduce((sum, one) => sum + one.rows, 0)

it('answers group news as the per-group reads do, with the groups, read points and stored names each read once, no message older than its read point, and every point moved in one transaction', async () => {
  const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
  const { groupsFor, groupsIn, openAGroup, takeOutOfTheGroup } = await import('../src/server/lib/groups.ts')
  const { whatYourGroupsGained } = await import('../src/server/lib/group-news.ts')
  const { messagesSentToGroups, onlyTheMessagesThisReaderMayRead, recordThatSomebodyRead, whenTheyLastRead } = await import('../src/server/lib/messages.ts')
  const { theRegistryRowsNamedBy } = await import('../src/server/db/registry-aliases/index.ts')
  const { whoSentItInWords } = await import('../src/server/lib/who-sent-it.ts')
  const { agents, conversationReads } = await import('../src/server/db/schema.ts')
  const { participantKey } = await import('../src/shared/messages.ts')
  const { nowStamp } = await import('../src/shared/time.ts')

  const person = { kind: 'person' as const, id: THE_PERSON }
  const agent = { kind: 'agent' as const, id: 'group-news-reader' }
  // A HANDLE THAT IS NOT ITS ID, so a stored name is worked out and not just compared.
  t.client.sqlite
    .prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
    .run(agent.id, 'group-news-handle', 'Group news reader', nowStamp())
  const open = (name: string, members: { kind: 'person' | 'agent'; id: string }[]) =>
    openAGroup({ workspaceId: 'default', name, openedBy: person, because: 'To talk about the seedlings.', members: members.map((who) => ({ who, because: 'Works on the seedlings.' })) })
  const say = (groupId: string) =>
    t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Seedlings watered', data: { body: 'The seedlings were watered.', toGroup: groupId }, actor: { type: 'human', id: THE_PERSON } })
  const read = open('Read seedlings', [person, agent])
  const unread = open('Unread seedlings', [person, agent])
  const left = open('Left seedlings', [person, agent])
  takeOutOfTheGroup(left.id, agent, person)
  const otherKind = open('Helper seedlings', [person])
  t.client.sqlite
    .prepare("INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) VALUES (?, ?, 'helper', ?, ?, ?, NULL)")
    .run('group-news-helper-row', otherKind.id, agent.id, nowStamp(), 'Helps with the seedlings.')
  const said = [read, unread, left, otherKind].map((group) => say(group.id))
  // THE READ GROUP'S MESSAGES A MONTH EARLIER, its opening line with them, so every other group's messages are newer
  // than its read point. Written in one second, as they nearly always were, the read after the move could not tell a
  // group read from its own point from one read from the oldest point (wave 13y round 126).
  const readAt = '2026-10-01 09:00:00'
  for (const one of messagesSentToGroups([read.id], EVERY_PROJECT)) t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(readAt, one.id)
  // THE READ POINT IN ONE GROUP ONLY, at its message, so that group has nothing new and the others everything.
  recordThatSomebodyRead(agent, read.id, agent, 'default', readAt)

  const theOldRule = () => groupsIn(EVERY_PROJECT).filter((group) => group.members.some((member) => participantKey(member.who) === participantKey(agent)))
  const first = traced(() => groupsFor(agent, EVERY_PROJECT))
  expect(first.answer).toEqual(theOldRule())
  expect(first.answer.map((group) => group.id), 'the fixture holds what it means to').toEqual(expect.arrayContaining([read.id, unread.id, otherKind.id]))
  expect(first.answer.map((group) => group.id)).not.toContain(left.id)
  open('Other seedlings', [person])
  const second = traced(() => groupsFor(agent, EVERY_PROJECT))
  expect(second.answer).toEqual(first.answer)
  expect.soft(rowsOf(second.ran), 'a group the reader is not in adds no row to its groups read').toBe(rowsOf(first.ran))

  const reader = { readsEveryMessage: false as const, who: agent }
  const expected = theOldRule().map((group) => {
    const since = whenTheyLastRead(agent, group.id, EVERY_PROJECT)?.at ?? null
    const all = messagesSentToGroups([group.id], EVERY_PROJECT)
    const messages = onlyTheMessagesThisReaderMayRead(reader, since === null ? all : all.filter((one) => one.sentAt > since))
    return { group, since, messages: messages.map((message) => ({ ...message, whoSentIt: whoSentItInWords(message.sentBy) })) }
  })
  const byGroup = new Map(expected.map((one) => [one.group.id, one]))
  expect(byGroup.get(read.id)?.since, 'one group has a read point').toBe(readAt)
  expect(byGroup.get(read.id)?.messages).toEqual([])
  expect(byGroup.get(unread.id)?.since, 'another has none').toBeNull()
  expect(byGroup.get(unread.id)?.messages.map((one) => one.id)).toContain(said[1]!.id)

  const fields = ['id', 'handle', 'name', 'retired', 'retiredAt'] as const
  const columns = fields.map((field) => agents[field].name === field ? field : `${agents[field].name} AS ${field}`).join(', ')
  const lookup = traced(() => theRegistryRowsNamedBy(t.client.sqlite, [agent.id], columns)).ran
  const lone = new Set(lookup.map((one) => one.sql))
  expect(lookup).toHaveLength(1)
  const news = traced(() => whatYourGroupsGained(agent.id, agent, reader, false))
  expect(news.answer.read).toEqual(expected)
  const readPoints = new RegExp(`from\\s+"?${getTableName(conversationReads)}"?(\\s|$)`, 'i')
  expect.soft(news.ran.filter((one) => readPoints.test(one.sql)), 'the read points are one statement for every group').toHaveLength(1)
  expect.soft(news.ran.filter((one) => lone.has(one.sql)), 'stored members are worked out once for all groups').toHaveLength(lookup.length)

  const moving = traced(() => whatYourGroupsGained(agent.id, agent, reader, true, true))
  const moved = moving.answer
  expect(moved.read, 'the answer is worked out before the point moves').toEqual(expected)
  expect(moved.news.readPointMoved).toBe(true)
  expect(moved.news.onlyTheUndelivered).toBe(true)
  expect.soft(moving.ran.filter((one) => /^\s*COMMIT\b/i.test(one.sql)), 'the read points move in one transaction').toHaveLength(1)
  const aliasReads = (ran: { sql: string }[]): number => ran.filter((one) => /\bfrom\s+"?registry_aliases"?/i.test(one.sql)).length
  expect.soft(aliasReads(moving.ran), 'the move reads the filed aliases no more often than the read without it').toBe(aliasReads(news.ran))
  const reading = traced(() => whatYourGroupsGained(agent.id, agent, reader, false))
  const after = reading.answer.read
  expect(after.map((one) => one.group.id)).toEqual(expected.map((one) => one.group.id))
  for (const one of after) {
    expect(one.since, 'each group from its own read point').toBe(whenTheyLastRead(agent, one.group.id, EVERY_PROJECT)?.at ?? null)
    expect(one.messages).toEqual([])
  }
  const messageReads = reading.ran.filter((one) => one.sql.includes('records_message_to_group_idx'))
  expect(messageReads.length, 'the fixture reads the groups\' messages').toBeGreaterThan(0)
  expect.soft(rowsOf(messageReads), 'no message older than the read point in its group is read').toBe(0)
})

it('reads the parties of several groups and senders in sets without changing the whole answer', async () => {
  const { openAGroup } = await import('../src/server/lib/groups.ts')
  const { onlyTheMessagesThisReaderMayRead, thePartiesOf, thePartiesOfMany } = await import('../src/server/lib/messages.ts')
  const { nowStamp } = await import('../src/shared/time.ts')
  const { whatYourGroupsGained } = await import('../src/server/lib/group-news.ts')
  const { whatTheGroupsGained } = await import('../src/server/lib/messages.ts')
  const { whoSentItInWords } = await import('../src/server/lib/who-sent-it.ts')
  const { isMoleOffice } = await import('../src/shared/participants.ts')
  const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
  const { GROUP_MESSAGE_CHARACTERS, GROUPS_CARRIED, MESSAGES_CARRIED_PER_GROUP, whereToReadThem } = await import('../src/shared/group-news.ts')
  const person = { kind: 'person' as const, id: THE_PERSON }
  const reader = { kind: 'agent' as const, id: 'set-reader' }
  const addAgent = (id: string) => t.client.sqlite
    .prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
    .run(id, id, id, nowStamp())
  addAgent(reader.id)
  const ids: string[] = []
  const groupIds: string[] = []
  for (let i = 0; i < 6; i++) {
    const sender = { kind: 'agent' as const, id: `set-sender-${i}` }
    addAgent(sender.id)
    const group = openAGroup({
      workspaceId: 'default', name: `Set ${i}`, openedBy: person, because: 'To discuss the seedlings.',
      members: [person, reader, sender].map((who) => ({ who, because: 'Works on the seedlings.' })),
    })
    groupIds.push(group.id)
    for (let j = 0; j < 2; j++) {
      ids.push(t.api.createRecord({
        workspaceId: 'default', kind: 'message', title: 'A note',
        data: { body: `Note ${j}`, toGroup: group.id, sentBy: sender },
        actor: { type: 'agent', id: sender.id },
      }).id)
    }
  }
  const expected = new Map(ids.map((id) => [id, thePartiesOf(id)]))
  for (let i = 0; i < ids.length; i++) {
    expect(expected.get(ids[i]!)).toContainEqual(reader)
    expect(expected.get(ids[i]!)).toContainEqual({ kind: 'agent', id: `set-sender-${Math.floor(i / 2)}` })
  }
  const one = traced(() => thePartiesOfMany(ids.slice(0, 1)))
  const all = traced(() => thePartiesOfMany(ids))
  expect(all.answer).toEqual(expected)
  expect(all.ran.length, 'more groups, messages and senders do not add statements to this small read').toBe(one.ran.length)
  const rows = ids.map((id) => ({ id, entry: 'message' as const }))
  const messageReader = { readsEveryMessage: false as const, who: reader }
  expect(onlyTheMessagesThisReaderMayRead(messageReader, rows)).toEqual(rows)
  const fewer = traced(() => whatYourGroupsGained(reader.id, reader, messageReader, false))
  // Each group stays short, but the combined list crosses the visibility rule's long-list threshold.
  // A historic non-person membership is read as an agent by the party rule.
  t.client.sqlite.prepare("UPDATE group_members SET member_kind = 'helper' WHERE group_id = ? AND member_id = ?").run(groupIds[0], reader.id)
  for (let i = 0; i < groupIds.length; i++) {
    const sender = { kind: 'agent' as const, id: `set-sender-${i}` }
    for (let j = 0; j < 9; j++) t.api.createRecord({
      workspaceId: 'default', kind: 'message', title: 'Another note',
      data: { body: `Extra note ${j}`, toGroup: groupIds[i], sentBy: sender },
      actor: { type: 'agent', id: sender.id },
    })
  }
  // The old per-group rule is an independent oracle for the whole read and summary.
  const expectedRead = whatTheGroupsGained(reader, EVERY_PROJECT, false).map((group) => ({
    ...group,
    messages: onlyTheMessagesThisReaderMayRead(messageReader, group.messages).map((message) => ({
      ...message, whoSentIt: whoSentItInWords(message.sentBy),
    })),
  }))
  expect(expectedRead.find((group) => group.group.id === groupIds[0])?.messages.some((message) => message.body === 'Extra note 0')).toBe(true)
  const said = expectedRead.map((group) => ({ ...group, messages: group.messages.filter((message) => message.sentBy === null || !isMoleOffice(message.sentBy)) }))
    .filter((group) => group.messages.length > 0)
    .sort((a, b) => a.messages[a.messages.length - 1]!.sentAt < b.messages[b.messages.length - 1]!.sentAt ? 1 : -1)
  const groups = said.slice(0, GROUPS_CARRIED).map(({ group, since, messages }) => ({
    id: group.id, name: group.name, since, count: messages.length,
    newest: messages.slice(-MESSAGES_CARRIED_PER_GROUP).reverse().map((message) => ({
      id: message.id, sentAt: message.sentAt, from: message.whoSentIt,
      body: message.body.slice(0, GROUP_MESSAGE_CHARACTERS), wasCut: message.body.length > GROUP_MESSAGE_CHARACTERS,
    })),
  }))
  const more = traced(() => whatYourGroupsGained(reader.id, reader, messageReader, false))
  expect(more.answer).toEqual({
    read: expectedRead,
    news: {
      readFor: reader.id, registered: true, readPointMoved: false, onlyTheUndelivered: false,
      groupsYouAreIn: expectedRead.length, groups, moreGroups: said.length - groups.length,
      note: 'The new messages in the groups you are in, since your read point in each, from members only: lines ' +
        'Mole Office wrote are not counted. A group message is answered in its group, not privately. ' + whereToReadThem(false),
    },
  })
  // THE PARTIES' SET READS of one message: the memberships, the stored ids and the handles.
  const setReads = new Set(one.ran.map((ran) => ran.sql).filter((sql) => sql.includes('json_each')))
  expect(setReads.size, 'the parties of one message are read in sets').toBeGreaterThan(0)
  expect.soft(more.ran.filter((ran) => setReads.has(ran.sql)), 'the short groups\' parties are read once for all of them')
    .toHaveLength(one.ran.filter((ran) => setReads.has(ran.sql)).length)
  const officeRow = new Set(traced(() => isMoleOffice(reader)).ran.map((ran) => ran.sql))
  expect(officeRow.size, 'Mole Office\'s own row is read to tell its lines apart').toBe(1)
  expect.soft(more.ran.filter((ran) => officeRow.has(ran.sql)), 'more messages add no read of Mole Office\'s own row')
    .toHaveLength(fewer.ran.filter((ran) => officeRow.has(ran.sql)).length)
})
