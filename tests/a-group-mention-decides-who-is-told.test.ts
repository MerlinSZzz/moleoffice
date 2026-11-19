// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN @ IN A GROUP DECIDES WHO IS TOLD.
 *
 * Criteria GM1, GM3 and GM4 of a decision of 23 September 2026:
 *
 *   GM1. A group message that @s members is delivered — queued, and so notified — only to them.
 *        The sender is never delivered its own message.
 *   GM3. A group message that @s nobody reaches every member, as every group message did until
 *        this decision. @所有人 and @all reach every member on purpose.
 *   GM4. An agent can read what its groups gained since its own read point, and move that point.
 *
 * The rule that reads an @ is one function in src/shared/groups.ts, so the delivery here and the
 * page's drawing cannot come to different answers about who was addressed. Its own reading is
 * measured in tests/who-a-message-mentions.test.ts; this file measures the delivery that rests on it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import { localStamp, parseLocalStamp } from '../src/shared/time.ts'

type GroupsLib = typeof import('../src/server/lib/groups.ts')
type MessagesLib = typeof import('../src/server/lib/messages.ts')

let t: TestDb
let team: GroupsLib
let pool: MessagesLib

const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
// THE TWO AGENTS AS THE LIBRARIES TAKE THEM: by the registry id each was given when it registered,
// which is not its handle. Set in beforeEach, once they are registered.
let BUILDER: ParticipantRef
let CHECKER: ParticipantRef
// THE HANDLES ARE MADE FRESH FOR EACH CASE, because a handle is unique among live agents across the
// installation and the registry rows of earlier cases stay live.
let BUILDER_HANDLE = 'builder-x'
let CHECKER_HANDLE = 'checker-y'
let caseNumber = 0

const HUMAN = { type: 'human', id: THE_PERSON } as const
let AS_BUILDER: { type: 'agent'; id: string } = { type: 'agent', id: 'builder-x' }

beforeAll(async () => {
  t = await freshDb()
  team = await import('../src/server/lib/groups.ts')
  pool = await import('../src/server/lib/messages.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Mole Office' })
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  BUILDER_HANDLE = `builder-x-${String(caseNumber)}`
  CHECKER_HANDLE = `checker-y-${String(caseNumber)}`
  for (const [handle, title] of [
    [BUILDER_HANDLE, 'Builder X'],
    [CHECKER_HANDLE, 'Checker Y'],
  ] as const) {
    t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active' },
      actor: HUMAN,
    })
  }
  const idOf = (handle: string): string =>
    (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  BUILDER = { kind: 'agent', id: idOf(BUILDER_HANDLE) }
  CHECKER = { kind: 'agent', id: idOf(CHECKER_HANDLE) }
  AS_BUILDER = { type: 'agent', id: BUILDER_HANDLE }
  CHECKER_KEY = participantKey(CHECKER)
  BUILDER_KEY = participantKey(BUILDER)
})

/** A group with the owner and the two agents in it, opened by the builder. */
function aGroupOfThree() {
  return team.openAGroupAndSayWhy(
    {
      workspaceId: 'panelx',
      name: 'The gripper module',
      openedBy: BUILDER,
      because: 'Two of us are changing the same file and the owner should see it.',
      members: [
        { who: BUILDER, because: 'It opened the group.' },
        { who: CHECKER, because: 'It is working on the same file.' },
        { who: OWNER, because: 'A conflict between two agents is the owner’s to see.' },
      ],
    },
    AS_BUILDER,
  )
}

/** One message into a group, written the way anything writes one: as a record. */
function sayInTheGroup(groupId: string, body: string, actor: typeof HUMAN | typeof AS_BUILDER) {
  return t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, toGroup: groupId },
    actor,
  })
}

/** Who one message was delivered to, as sorted participant keys. */
function whoWasTold(messageId: string): string[] {
  return pool
    .deliveriesOf(messageId)
    .map((one) => participantKey(one.to))
    .sort()
}

const OWNER_KEY = participantKey(OWNER)
let CHECKER_KEY = ''
let BUILDER_KEY = ''

// ============================================================ GM1 and GM3: who an @ tells

describe('an @ decides who in a group is told', () => {
  it('queues one named member and nobody else when one member is @d by handle', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, `The clamp reading is wrong, @${CHECKER_HANDLE}.`, AS_BUILDER)
    expect(whoWasTold(said.id)).toEqual([CHECKER_KEY])
    // AND THE SENDER IS NOT TOLD ITS OWN MESSAGE, even though it named itself.
    const mine = sayInTheGroup(group.id, `A note to myself, @${BUILDER_HANDLE}.`, AS_BUILDER)
    expect(whoWasTold(mine.id)).toEqual([])
  })

  it('queues both named members and nobody else when two are @d', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, `@${CHECKER_HANDLE} and @${THE_TEST_OFFICES_OWNER.name}, please look.`, AS_BUILDER)
    expect(whoWasTold(said.id)).toEqual([CHECKER_KEY, OWNER_KEY].sort())
    expect(whoWasTold(said.id)).not.toContain(BUILDER_KEY)
  })

  it('matches the name the chat draws, without regard to case', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, 'Over to you, @Checker Y.', AS_BUILDER)
    expect(whoWasTold(said.id)).toEqual([CHECKER_KEY])
    const upper = sayInTheGroup(group.id, `And you, @${THE_TEST_OFFICES_OWNER.name.toUpperCase()}.`, AS_BUILDER)
    expect(whoWasTold(upper.id)).toEqual([OWNER_KEY])
  })

  it('queues every member when the message @s nobody, exactly as before', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, 'No address at all here.', AS_BUILDER)
    expect(whoWasTold(said.id)).toEqual([CHECKER_KEY, OWNER_KEY].sort())
  })

  it('queues every member for @所有人 and for @all', () => {
    const group = aGroupOfThree()
    const all = sayInTheGroup(group.id, '@所有人 the sweep is frozen.', AS_BUILDER)
    expect(whoWasTold(all.id)).toEqual([CHECKER_KEY, OWNER_KEY].sort())
    const english = sayInTheGroup(group.id, '@all the sweep is frozen.', AS_BUILDER)
    expect(whoWasTold(english.id)).toEqual([CHECKER_KEY, OWNER_KEY].sort())
  })

  it('treats an @ that matches nobody as words, so the message reaches everybody', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, 'Ask @nobody in particular about it.', AS_BUILDER)
    expect(whoWasTold(said.id)).toEqual([CHECKER_KEY, OWNER_KEY].sort())
  })

  it('leaves a member with no row able to read the message in the group', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, `Only @${CHECKER_HANDLE} is told.`, AS_BUILDER)
    // THE OWNER WAS NOT TOLD, and the words are still in the group for the owner to read.
    expect(whoWasTold(said.id)).not.toContain(OWNER_KEY)
    const inTheGroup = pool.messagesInAGroup(group.id, pool.EVERY_PROJECT)
    expect(inTheGroup.some((one) => one.id === said.id && one.body === `Only @${CHECKER_HANDLE} is told.`)).toBe(true)
  })
})

// ============================================================ GM2: the person's own chat

describe('a group reply that @s the person is in their own chat with its sender', () => {
  it('is the same one record in the group and in the chat', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, `@${THE_TEST_OFFICES_OWNER.name} the mount is printed.`, AS_BUILDER)
    const chat = pool.conversationBetween(OWNER, BUILDER, pool.EVERY_PROJECT)
    expect(chat.messages.map((one) => one.id)).toContain(said.id)
    // AND IT DID NOT MOVE OUT OF THE GROUP: one record, drawn in two places.
    expect(pool.messagesInAGroup(group.id, pool.EVERY_PROJECT).some((one) => one.id === said.id)).toBe(true)
  })

  it('does not put a group message that @s nobody into their chat', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, 'No address at all here.', AS_BUILDER)
    const chat = pool.conversationBetween(OWNER, BUILDER, pool.EVERY_PROJECT)
    expect(chat.messages.map((one) => one.id)).not.toContain(said.id)
  })

  it('does not forward @所有人, because it did not @ the person themselves', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, '@所有人 the sweep is frozen.', AS_BUILDER)
    const chat = pool.conversationBetween(OWNER, BUILDER, pool.EVERY_PROJECT)
    expect(chat.messages.map((one) => one.id)).not.toContain(said.id)
  })
})

// ============================================================ an office line shows without counting

describe('a line Mole Office wrote into a group', () => {
  it('keeps the group bold and the circle empty for the person, their rule of 4 September', () => {
    const group = aGroupOfThree()
    const forTheOwner = pool.anythingUnreadInAGroup(group.id, OWNER, pool.EVERY_PROJECT)
    const counted = pool.unreadInAGroup(group.id, OWNER, pool.EVERY_PROJECT)
    expect(forTheOwner, 'the office line is not shown to the person').toBe(true)
    expect(counted, 'the office line entered the count').toBe(0)
  })
})

// ============================================================ the backfill leaves a group alone

describe('the start-up backfill and a group message that reached nobody', () => {
  it('leaves a group message with no rows alone, because a group names its own membership', async () => {
    const { planMessageDelivery, migrateMessageDelivery } = await import(
      '../src/server/db/message-delivery-migration.ts'
    )
    const group = aGroupOfThree()
    // A GROUP MESSAGE THAT REACHES NOBODY: the agent @s only itself, and the sender is never delivered
    // its own message. This is a real state under GM1 and not a message written before delivery rows.
    const selfAddressed = sayInTheGroup(group.id, `A note to myself, @${BUILDER_HANDLE}.`, AS_BUILDER)
    expect(whoWasTold(selfAddressed.id)).toEqual([])

    // THE BACKFILL DECLINES IT. Before the group message was excluded, the plan held it and the
    // migration would have written an owner row, so the start guard would refuse to serve the
    // database. That is the defect this case holds.
    const plan = planMessageDelivery(t.client.sqlite)
    expect(plan.messages.map((one) => one.recordId)).not.toContain(selfAddressed.id)
    const report = migrateMessageDelivery(t.client.sqlite)
    expect(report.deliveriesWritten, 'the backfill gave the owner a row it was never sent').toBe(0)
    expect(whoWasTold(selfAddressed.id)).toEqual([])
  })
})

// ============================================================ GM4: what a member missed

describe('what a member reads since its own read point', () => {
  /** Point one group message's stamp at a chosen moment, so time is measured and not waited for. */
  function stampTheMessage(messageId: string, at: string): void {
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(at, messageId)
  }

  it("returns exactly what came after the reader's own point, and moves it when asked", () => {
    const group = aGroupOfThree()
    // THE OPENING LINE IS STAMPED INTO THE PAST TOO, so the only thing after the checker's point is
    // the message this case is about.
    const opening = pool.messagesInAGroup(group.id, pool.EVERY_PROJECT)[0]
    if (opening === undefined) throw new Error('the group holds no opening line')
    stampTheMessage(opening.id, '2026-09-23 08:00:00')
    const early = sayInTheGroup(group.id, 'Said before the checker looked.', AS_BUILDER)
    stampTheMessage(early.id, '2026-09-23 09:00:00')
    // THE CHECKER'S OWN POINT, set by hand so the answer is exact and not a race with the clock.
    pool.recordThatSomebodyRead(CHECKER, group.id, CHECKER, 'panelx', '2026-09-23 10:00:00')

    const after = sayInTheGroup(group.id, 'Said after the checker looked.', AS_BUILDER)
    stampTheMessage(after.id, '2026-09-23 11:00:00')

    const gained = pool.whatTheGroupsGained(CHECKER, pool.EVERY_PROJECT, false)
    const mine = gained.find((one) => one.group.id === group.id)
    expect(mine, 'the checker belongs to no group in the answer').toBeDefined()
    expect(mine?.since).toBe('2026-09-23 10:00:00')
    expect(mine?.messages.map((one) => one.body)).toEqual(['Said after the checker looked.'])

    // AND A READER THAT NEVER LOOKED GETS EVERYTHING, which is the honest answer and not none.
    const fresh = pool.whatTheGroupsGained(BUILDER, pool.EVERY_PROJECT, false)
    const all = fresh.find((one) => one.group.id === group.id)
    expect(all?.since).toBeNull()
    expect(all?.messages.length).toBeGreaterThanOrEqual(2)

    // IT MOVES THE POINT WHEN ASKED, so the next read starts from the moment of this one.
    pool.whatTheGroupsGained(CHECKER, pool.EVERY_PROJECT, true)
    const again = pool.whatTheGroupsGained(CHECKER, pool.EVERY_PROJECT, false)
    expect(again.find((one) => one.group.id === group.id)?.messages).toEqual([])

    // AND A MESSAGE AFTER THE MOVED POINT IS STILL NEW. It is stamped an hour after the point the case has just moved,
    // read back from the record, never at a fixed date (acceptance finding 60): the point is the real clock, and the
    // fixed '2026-09-24 00:00:00' this case used became the past at midnight and turned it red for everyone.
    const moved = pool.whenTheyLastRead(CHECKER, group.id, pool.EVERY_PROJECT)
    const movedAt = moved === null ? null : parseLocalStamp(moved.at)
    if (movedAt === null) throw new Error('the checker has no read point after moving it')
    const later = sayInTheGroup(group.id, 'Said after the checker moved its point.', AS_BUILDER)
    stampTheMessage(later.id, localStamp(new Date(movedAt + 60 * 60 * 1000)))
    const yetAgain = pool.whatTheGroupsGained(CHECKER, pool.EVERY_PROJECT, false)
    expect(yetAgain.find((one) => one.group.id === group.id)?.messages.map((one) => one.body)).toEqual([
      'Said after the checker moved its point.',
    ])
  })
})
