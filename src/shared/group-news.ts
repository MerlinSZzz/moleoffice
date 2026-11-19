// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEWS OF THE GROUPS A READER IS IN, AS ONE SUMMARY, AND THE ONE WAY IT IS PRINTED.
 *
 * The office works the summary out in src/server/lib/group-news.ts (`whatYourGroupsGained`). Two doors
 * carry it: GET /api/brief, as `newInYourGroups` and in its opening, and GET /api/messages/groups, as
 * `summary` and `text`. Both print it with `groupNewsLines` below, so an agent reads the same words
 * at its start and when its waiter wakes it. This file holds no server code, so a tool may print a
 * summary with the same function.
 */

/** How many groups, and how many messages of each, the summary carries. The rest are counted. */
export const GROUPS_CARRIED = 5
export const MESSAGES_CARRIED_PER_GROUP = 3
/** Where a carried message's words are cut, so one long message cannot fill the summary. */
export const GROUP_MESSAGE_CHARACTERS = 300

/**
 * THE READ A HAND-OVER MAKES: the waiter's and dsh's. It moves the agent's read point to now in each group that had
 * something new or had no point, and its summary leaves out what reached the agent one by one, which the hand-over
 * gives whole. Its answer carries no `groups`, the full read, unless it adds `&groups=1`. A hand-over prints the
 * answer's `text` only when the summary carries a group.
 */
export const THE_GROUPS_NEWS_AT_A_HAND_OVER = '/api/messages/groups?move=1&undelivered=1'

/** One new message in a group, as the summary carries it. */
export interface NewGroupMessage {
  id: string
  sentAt: string
  /** Who sent it, in the words every hand-over prints. */
  from: string
  body: string
  /** True when `body` was cut at `GROUP_MESSAGE_CHARACTERS`. The whole message is its record. */
  wasCut: boolean
}

/** One group the reader is in that has new messages from its members. */
export interface NewInOneGroup {
  id: string
  name: string
  /** The reader's read point in this group, or null because it has never moved it. */
  since: string | null
  /** How many new messages its members wrote. Lines Mole Office wrote are not counted. */
  count: number
  /** The newest of them, newest first, at most `MESSAGES_CARRIED_PER_GROUP`. */
  newest: NewGroupMessage[]
}

/** What the groups a reader is in gained since its read point in each. */
export interface NewInYourGroups {
  /** The reader this was read for, or null because it was not read for anybody. */
  readFor: string | null
  /** Whether a registry row answers to that reader. Nothing was read when none does. */
  registered: boolean
  /**
   * True when this read moved the reader's point to now, after working this out, in each group that had something new
   * or had no point. A group with nothing new keeps its point.
   */
  readPointMoved: boolean
  /**
   * True when the summary leaves out every message the reader sent and every one with a delivery to it, so it carries
   * only what did not reach the reader one by one: a message that @s other members reaches only them. A waiter hands
   * every delivery over whole, so it asks for this at a hand-over (message RFv1V8oxkYGF). False for the brief.
   */
  onlyTheUndelivered: boolean
  /** How many groups the reader is in now. */
  groupsYouAreIn: number
  /** The groups with new messages, the one with the newest message first, at most `GROUPS_CARRIED`. */
  groups: NewInOneGroup[]
  /** How many more groups have new messages than `groups` carries. */
  moreGroups: number
  note: string
}

/** Where every new message is read, and whether this read moved the read point. */
export function whereToReadThem(readPointMoved: boolean): string {
  return readPointMoved
    ? 'GET /api/messages/groups reads every new message. This read moved your read point to now in each group that ' +
        'had something new or no read point, so the next read starts from this one.'
    : 'GET /api/messages/groups reads every new message, and GET /api/messages/groups?move=1 also moves your read ' +
        'point to now in each group that has something new or no read point. This read did not move it.'
}

/** The lines that print a summary. None when it was not read for anybody. */
export function groupNewsLines(news: NewInYourGroups): string[] {
  if (news.readFor === null) return []
  if (!news.registered) return [news.note]
  if (news.groupsYouAreIn === 0) return ['You are in no group.']
  if (news.groups.length === 0) {
    return [
      `No member wrote anything new in the ${String(news.groupsYouAreIn)} group${news.groupsYouAreIn === 1 ? '' : 's'} ` +
        (news.onlyTheUndelivered ? 'you are in that did not reach you one by one, ' : 'you are in, ') +
        'since your read point in each.',
    ]
  }
  const lines = [
    (news.onlyTheUndelivered
      ? 'NEW IN YOUR GROUPS that did not reach you one by one, since your read point in each (lines Mole Office wrote, ' +
        'your own messages and every message handed to you are not counted). Answer a group '
      : 'NEW IN YOUR GROUPS since your read point in each (lines Mole Office wrote are not counted). Answer a group ') +
      `message in its group, not privately. ${whereToReadThem(news.readPointMoved)}`,
  ]
  for (const group of news.groups) {
    lines.push(
      `  The group "${group.name}" (group id ${group.id}): ${String(group.count)} new ` +
        (group.since === null ? 'since you never moved your read point in it:' : `since ${group.since}:`),
    )
    for (const message of group.newest) {
      lines.push(
        `    ${message.sentAt}, ${message.from}, message ${message.id}: ${message.body.replace(/\s+/g, ' ')}` +
          (message.wasCut ? ` [cut at ${String(GROUP_MESSAGE_CHARACTERS)} characters]` : ''),
      )
    }
    if (group.count > group.newest.length) {
      lines.push(`    and ${String(group.count - group.newest.length)} older, not shown here.`)
    }
  }
  if (news.moreGroups > 0) {
    lines.push(`  and ${String(news.moreGroups)} more group${news.moreGroups === 1 ? '' : 's'} with new messages.`)
  }
  return lines
}

/** A summary printed as one text, the lines joined. Empty when it was not read for anybody. */
export function groupNewsText(news: NewInYourGroups): string {
  return groupNewsLines(news).join('\n')
}
