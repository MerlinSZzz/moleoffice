// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE GROUPS A READER IS IN GAINED SINCE ITS READ POINT IN EACH, WORKED OUT IN THIS ONE PLACE.
 *
 * An agent reads its groups' new messages when it wakes, as item 5, step 3 of a decision
 * says. Two doors hand that over, and both call `whatYourGroupsGained` below: GET
 * /api/brief, read at every start, and GET /api/messages/groups, read by the waiter and the dsh hook.
 * src/shared/group-news.ts holds the summary's shape and the one formatter that prints it.
 *
 * IT IS ONE READ. `whatTheGroupsGained` reads the groups this reader is in now, from its own read
 * point in each, and moves the point only when `move` is true. A group the reader is not in is never
 * read. The messages are kept to the ones this reader may read.
 *
 * THE SUMMARY LEAVES OUT LINES MOLE OFFICE WROTE, the same rule every unread count keeps (criterion
 * M33): they say who was added or that a group was opened. The full read, which a door may also hand
 * over, keeps them.
 */

import {
  GROUP_MESSAGE_CHARACTERS,
  GROUPS_CARRIED,
  MESSAGES_CARRIED_PER_GROUP,
  whereToReadThem,
  type NewInOneGroup,
  type NewInYourGroups,
} from '@shared/group-news.ts'
import { sameParticipant, type PoolEntry } from '@shared/messages.ts'
import { theMoleOfficeTest } from '@shared/participants.ts'
import {
  A_SHORT_LIST,
  onlyTheMessagesThisReaderMayRead,
  whatTheGroupsGained,
  type AMessageReader,
  type ParticipantRef,
  type WhatAGroupGained,
} from './messages.ts'
import { whoSentItInWords } from './who-sent-it.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'

/** One group as it was read, with every message this reader may read and who sent each one in words. */
export interface AGroupAsRead extends Omit<WhatAGroupGained, 'messages'> {
  messages: (PoolEntry & { whoSentIt: string })[]
}

/** The summary, and the whole read it was worked out from. */
export interface WhatYourGroupsGained {
  news: NewInYourGroups
  read: AGroupAsRead[]
}

/**
 * The summary for one reader, and the whole read it came from.
 *
 * `readFor` is the name the reader was asked for by. `me` is the registry row that name answers to,
 * or null because none does; then nothing is read and the summary says so. `move` moves the read
 * point in every group the reader is in to now, after the answer is worked out.
 *
 * `onlyTheUndelivered` LEAVES OUT OF THE SUMMARY every message the reader sent and every one with a delivery to it, so
 * the summary carries only what did not reach the reader one by one (message RFv1V8oxkYGF). A group message that
 * @s members reaches only them (whoAGroupMessageReaches in lib/groups.ts), and a waiter hands every delivery over
 * whole, so at a hand-over this is the news the agent has not had. The full read keeps every message.
 */
export function whatYourGroupsGained(
  readFor: string,
  me: ParticipantRef | null,
  reader: AMessageReader,
  move: boolean,
  onlyTheUndelivered = false,
): WhatYourGroupsGained {
  if (me === null) {
    return {
      news: {
        readFor,
        registered: false,
        readPointMoved: false,
        onlyTheUndelivered,
        groupsYouAreIn: 0,
        groups: [],
        moreGroups: 0,
        note: `No registry row answers to the agent "${readFor}", so no group was read.`,
      },
      read: [],
    }
  }
  // WHO SENT IT, read once per sender for the whole answer.
  const words = new Map<string, string>()
  // WHO EACH STORED NAME IS, worked out once for the whole answer. Nothing here writes an identity.
  const named = new Map<string, ParticipantRef | null>()
  const inWords = (sentBy: unknown): string => {
    const key = JSON.stringify(sentBy ?? null)
    let found = words.get(key)
    if (found === undefined) {
      found = whoSentItInWords(sentBy)
      words.set(key, found)
    }
    return found
  }
  const gained = whatTheGroupsGained(me, EVERY_PROJECT, move)
  // THE SHORT GROUPS ARE ASKED TOGETHER, with the narrowing off: none of them is narrowed when asked alone, and
  // together they may pass the limit that none of them passes. A longer group is asked alone, as before.
  const short = gained.filter((one) => one.messages.length <= A_SHORT_LIST).flatMap((one) => one.messages)
  const visible = new Set(onlyTheMessagesThisReaderMayRead(reader, short, named, undefined, false).map((one) => one.id))
  for (const one of gained) {
    if (one.messages.length > A_SHORT_LIST) {
      for (const message of onlyTheMessagesThisReaderMayRead(reader, one.messages, named)) visible.add(message.id)
    }
  }
  const read: AGroupAsRead[] = gained.map((one) => ({
    ...one,
    messages: one.messages.filter((message) => visible.has(message.id)).map((message) => ({
      ...message,
      whoSentIt: inWords(message.sentBy),
    })),
  }))
  // MOLE OFFICE'S OWN ROW IS READ ONCE FOR THIS ANSWER, and only once an agent's message is asked about.
  let officeTest: ((who: ParticipantRef) => boolean) | undefined
  const isOffice = (who: ParticipantRef): boolean => who.kind === 'agent' && (officeTest ??= theMoleOfficeTest())(who)
  const withNews = read
    .map((one) => ({
      group: one.group,
      since: one.since,
      said: one.messages.filter(
        (message) =>
          (message.sentBy === null || !isOffice(message.sentBy)) &&
          (!onlyTheUndelivered || !reachedTheReaderOneByOne(message, me)),
      ),
    }))
    .filter((one) => one.said.length > 0)
    .sort((a, b) => (a.said[a.said.length - 1]!.sentAt < b.said[b.said.length - 1]!.sentAt ? 1 : -1))
  const groups = withNews.slice(0, GROUPS_CARRIED).map(
    (one): NewInOneGroup => ({
      id: one.group.id,
      name: one.group.name,
      since: one.since,
      count: one.said.length,
      newest: one.said
        .slice(-MESSAGES_CARRIED_PER_GROUP)
        .reverse()
        .map((message) => ({
          id: message.id,
          sentAt: message.sentAt,
          from: message.whoSentIt,
          body: message.body.length > GROUP_MESSAGE_CHARACTERS ? message.body.slice(0, GROUP_MESSAGE_CHARACTERS) : message.body,
          wasCut: message.body.length > GROUP_MESSAGE_CHARACTERS,
        })),
    }),
  )
  // THE POINT MOVED ONLY WHERE THERE WAS A GROUP TO MOVE IT IN.
  const moved = move && read.length > 0
  return {
    news: {
      readFor,
      registered: true,
      readPointMoved: moved,
      onlyTheUndelivered,
      groupsYouAreIn: read.length,
      groups,
      moreGroups: withNews.length - groups.length,
      note:
        'The new messages in the groups you are in, since your read point in each, from members only: lines ' +
        'Mole Office wrote are not counted' +
        (onlyTheUndelivered ? ', and neither are your own messages or any message handed to you one by one' : '') +
        `. A group message is answered in its group, not privately. ${whereToReadThem(moved)}`,
    },
    read,
  }
}

/** Whether a group message reached the reader one by one: the reader sent it, or it carries a delivery to the reader. */
function reachedTheReaderOneByOne(message: PoolEntry, me: ParticipantRef): boolean {
  if (message.sentBy !== null && sameParticipant(message.sentBy, me)) return true
  return message.deliveries.some((delivery) => sameParticipant(delivery.to, me))
}
