// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT READS A CONVERSATION ONE PAGE AT A TIME, AND KEEPS WHAT IT READ.
 *
 * The person's report of 3 October 2026 (problem 8_cP0E-745e5): entering a conversation again loaded
 * the whole of it again, so leaving and coming back was slow. So:
 *
 *   - A FIRST ENTRY reads the newest page only: `PAGE` messages.
 *   - WHAT WAS READ IS KEPT here, by conversation, for as long as the page is open, and in the page
 *     cache, so after a reload too (`heldConversation`). Coming back draws what is kept at once and asks
 *     the server only for what came after the newest message kept, and for what changed among the kept
 *     ones since the last read (a mark, an edit, a deletion).
 *   - SCROLLING UP reads the page just older than the oldest message kept.
 *   - A MESSAGE THAT JOINED AMONG THE KEPT ONES, such as a review comment whose recipient was chosen
 *     later, makes the chat read the newest page again (`aMessageJoinedTheHeldOnes`).
 *
 * WHY FIFTY. One screen of the chat shows ten to fifteen messages at 1440 and fewer at 390, so fifty
 * is three or more screens to scroll back through before the next page is asked for. On the office
 * of the live shape measured in round 33 of wave 13n, a message is about 1.7 KB on the wire, so a
 * page is about 85 KB where the whole conversation of 3,125 messages was 5.2 MB.
 *
 * The functions below are pure: they take what is held and an answer, and give what to hold next.
 * Chat.tsx asks the server and draws.
 */
import type { APageToAskFor, ConversationReply, PoolEntry } from '../api.ts'
import { keepAnswer, keptAnswer } from './pagecache.ts'

/** How many messages one page holds. The header says why fifty. */
export const PAGE = 50

/**
 * HOW CLOSE TO THE TOP OF THE LIST, IN PIXELS, A READER SCROLLS BEFORE THE PAGE BEFORE IS READ. About
 * two messages' height, so the older page is usually drawn before the reader reaches the top.
 */
export const NEAR_THE_TOP = 120

/** What the chat holds of one conversation: the reply, and whether older messages remain unread. */
export interface AConversationHeld {
  reply: ConversationReply
  /** True when the server holds older messages than the oldest one here. */
  olderRemain: boolean
  /** When the read the newest messages came from began, to be sent back as `since`. */
  readAt: string | null
}

/** Every conversation read since the page was opened, by the other side's key. */
const HELD = new Map<string, AConversationHeld>()

/**
 * THE NAME EACH CONVERSATION HELD IS ALSO KEPT UNDER in the page cache (src/web/lib/pagecache.ts), for the person or
 * agent reading, in the project on screen. The cache copies it into IndexedDB, so a conversation read before a reload
 * is drawn at once after it. Measured on 14 November 2026 in Chromium: a page of fifty messages of the live size is
 * about 88 KB, its copy is written in 7 to 11 ms, 400 ms after the change, and a hundred such pages are read back in
 * 28 ms before the app draws.
 */
const keptName = (key: string): string => `chat.conversation:${key}`

/** False once events were lost. From then on only what this page has read since is held. */
let theKeptOnesStand = true

/**
 * What is held of one conversation: what this page has read, or else what was kept before the page was loaded. Null when
 * neither holds it. A kept one is read again behind its drawing as a held one is (`whatToAskFor`), and the server
 * answers that read from its own records, so what changed while the page was closed comes in too.
 */
export function heldConversation(key: string): AConversationHeld | null {
  const held = HELD.get(key)
  if (held !== undefined) return held
  return theKeptOnesStand ? (keptAnswer<AConversationHeld>(keptName(key))?.value ?? null) : null
}

/** Keep what is held of one conversation, here and in the page cache. */
export function holdConversation(key: string, held: AConversationHeld): void {
  HELD.set(key, held)
  keepAnswer(keptName(key), held)
}

/**
 * Forget every conversation held, when events were lost and nothing held can be trusted. What was kept before the page
 * was loaded is not used again either, until the next load.
 */
export function forgetEveryConversation(): void {
  HELD.clear()
  theKeptOnesStand = false
}

/** What to ask for to open a conversation: the newest page, or what came after what is held. */
export function whatToAskFor(held: AConversationHeld | null): APageToAskFor {
  const newest = held?.reply.messages.at(-1)
  const oldest = held?.reply.messages[0]
  if (held === null || newest === undefined || oldest === undefined || held.readAt === null) return { limit: PAGE }
  // WHILE OLDER MESSAGES REMAIN, THE OLDEST ONE HELD IS NAMED, so only the changed ones from it on are named back
  // (`aMessageJoinedTheHeldOnes`).
  return { limit: PAGE, after: newest.id, since: held.readAt, ...(held.olderRemain ? { from: oldest.id } : {}) }
}

/** What to ask for to read the page before what is held, or null when nothing older remains. */
export function whatToAskForOlder(held: AConversationHeld | null): APageToAskFor | null {
  const oldest = held?.reply.messages[0]
  if (held === null || !held.olderRemain || oldest === undefined) return null
  return { limit: PAGE, before: oldest.id }
}

/**
 * WHAT TO HOLD AFTER A READ OF THE NEWEST PAGE OR OF WHAT CAME AFTER, given what was held.
 *
 * A reply that carries on from what was held adds its messages after the held ones, puts each
 * changed message in the place of the held one, and drops each one deleted. A changed message that is
 * not held is not added here (see `aMessageJoinedTheHeldOnes`). Any other reply is the newest page,
 * and replaces what was held: there may be messages between the two that neither holds.
 */
export function afterANewerRead(held: AConversationHeld | null, reply: ConversationReply): AConversationHeld {
  const page = reply.page ?? null
  if (held === null || page === null || page.continuesFromTheCursor !== true) {
    return { reply, olderRemain: page === null ? false : page.olderRemain, readAt: page === null ? null : page.readAt }
  }
  const gone = new Set(page.gone)
  const changed = new Map(page.changed.map((one) => [one.id, one]))
  const kept: PoolEntry[] = []
  for (const one of held.reply.messages) {
    if (gone.has(one.id)) continue
    kept.push(changed.get(one.id) ?? one)
  }
  const there = new Set(kept.map((one) => one.id))
  for (const one of reply.messages) if (!there.has(one.id)) kept.push(one)
  return { reply: { ...reply, messages: kept }, olderRemain: held.olderRemain, readAt: page.readAt }
}

/**
 * WHETHER A REPLY THAT CARRIES ON FROM WHAT WAS HELD NAMES A MESSAGE THAT JOINED AMONG THE HELD ONES
 * (wave 13y round 145). A message can join a conversation after newer ones were read: a review
 * comment saved for nobody joins the conversation with its recipient when the recipient is chosen,
 * in the place its stamp gives it. The server names it among the changed ones, and `afterANewerRead`
 * has no place for it, because the order of two messages stamped in the same second is known only
 * to the server. So the chat reads the newest page instead, and that page replaces what was held, as
 * on a first entry.
 *
 * WHICH CHANGED MESSAGES ARE AMONG THE HELD ONES IS THE SERVER'S TO SAY (wave 13y round 146). While
 * older messages remain, the chat names the oldest one it holds as `from` (`whatToAskFor`), and the
 * server names as changed only that one and those after it, in the order of the conversation. With
 * the whole conversation held, every changed message is among the held ones. So any changed message
 * not held has joined. Before, the chat compared stamps, which are to the second. A message written in
 * the second of the oldest one held, but before it, then counted as joined, and a second entry read
 * the newest page again whenever older messages had changed in that second.
 */
export function aMessageJoinedTheHeldOnes(held: AConversationHeld | null, reply: ConversationReply): boolean {
  const page = reply.page ?? null
  if (held === null || held.reply.messages.length === 0 || page === null || page.continuesFromTheCursor !== true) return false
  const there = new Set(held.reply.messages.map((one) => one.id))
  return page.changed.some((one) => !there.has(one.id))
}

/**
 * WHAT TO HOLD AFTER A READ OF THE PAGE BEFORE, given what was held. The older messages go before the
 * held ones. A reply that does not carry on from the oldest one held changes nothing, because the
 * message it was asked about has gone; the next read of the newest page settles it.
 */
export function afterAnOlderRead(held: AConversationHeld, reply: ConversationReply): AConversationHeld {
  const page = reply.page ?? null
  if (page === null || page.continuesFromTheCursor !== true) return held
  const there = new Set(held.reply.messages.map((one) => one.id))
  const older = reply.messages.filter((one) => !there.has(one.id))
  return { ...held, reply: { ...held.reply, messages: [...older, ...held.reply.messages] }, olderRemain: page.olderRemain }
}
