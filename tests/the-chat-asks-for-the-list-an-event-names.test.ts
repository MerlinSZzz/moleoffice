// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH LIST ONE EVENT NAMES, AND WHAT A BURST OF EVENTS GATHERS INTO.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The chat's channel handler used to read all six of its lists on five of the six event names. The
 * narrowing in `src/web/lib/chatlists.ts` decides, for each event, the lists it can change. A
 * narrowing here is SILENT when it goes too far: the chat simply stops updating and no other test
 * goes red. So this file names, for every list, an event that MUST still read it and the events that
 * must not — and the mutation named in each describe below breaks one line of the mapping, so a
 * narrowing that goes too far has a red waiting for it.
 *
 * Every case is a plain function call with no browser and no server: `listsAnEventChanges` is written
 * so that it can be asked here, without a page open.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  aSeenMarkTouchesThisPool,
  listsAnEventChanges,
  makeTheBurstReader,
  theReaderIs,
  whoIsReading,
  type ChatList,
} from '../src/web/lib/chatlists.ts'
import type { ChannelEvent } from '../src/shared/events.ts'

const ME = { kind: 'person' as const, id: THE_TEST_OFFICES_OWNER.id }
const THEM = { kind: 'agent' as const, id: 'builder-x' }
const ANOTHER_AGENT = { kind: 'agent' as const, id: 'other-y' }

/** One delivery mark moved, in the project the message is in. */
const markMoved = (to: typeof ME | typeof THEM, mark: 'delivered' | 'seen'): ChannelEvent => ({
  name: 'delivery.changed',
  workspaceId: 'default',
  messageIds: ['mQn1a2B3cD4e'],
  to,
  mark,
})

/** A new message, from `sentBy`, addressed to `to`. */
const said = (sentBy: typeof ME | typeof THEM | null, to: (typeof ME | typeof THEM)[]): ChannelEvent => ({
  name: 'message.new',
  workspaceId: 'default',
  messageId: 'mQn1a2B3cD4e',
  sentBy,
  to,
  hasTarget: false,
})

/** Somebody left a comment. */
const commentPlaced = (to: (typeof ME | typeof THEM)[]): ChannelEvent => ({
  name: 'comment.placed',
  workspaceId: 'default',
  messageId: 'mQn1a2B3cD4e',
  sentBy: THEM,
  recordId: null,
  targetKey: 'record:somebody',
  to,
})

/** A dot changed colour. */
const presence = (): ChannelEvent => ({ name: 'presence.changed', who: THEM, colour: 'green' })

const names = (event: ChannelEvent, me: typeof ME | null = ME, open: Parameters<typeof listsAnEventChanges>[2] = null): Set<ChatList> =>
  new Set(listsAnEventChanges(event, me, open))

beforeEach(() => {
  theReaderIs(null)
})

describe('which list an event can change', () => {
  it('reads the presence alone when a dot changes colour, and nothing else', () => {
    // THE ONLY EVENT WITH ONE LIST. A dot turning green or grey is announced when a page opens or
    // closes; no message is involved, so no other list can have moved.
    expect(names(presence())).toEqual(new Set(['presence']))
  }, 20_000)

  it('reads the registries and the between-agents counts on any new message, whoever it is for', () => {
    // A message may be the first this page has heard of its writer: the NAME lives nowhere else.
    // The grey count on the Between agents tab is counted across every project, and whether a new
    // message belongs to one of those conversations is a fact only the server has worked out, so the
    // list is read even when the reader is not a party to the message.
    expect(names(said(THEM, [ANOTHER_AGENT]))).toEqual(new Set(['participants', 'betweenAgents']))
  }, 20_000)

  it('reads the waiting-for-me lists when the message is addressed to the reader, and not when they sent it', () => {
    // The pools hold messages ADDRESSED to the reader: a message they sent cannot enter their own
    // pool. The contacts and the groups still move either way, because the reader's own row's last
    // line is the message they just sent.
    expect(names(said(THEM, [ME])).has('forced')).toBe(true)
    expect(names(said(THEM, [ME])).has('waitingForMe')).toBe(true)
    expect(names(said(ME, [THEM])).has('forced')).toBe(false)
    expect(names(said(ME, [THEM])).has('waitingForMe')).toBe(false)
    expect(names(said(ME, [THEM])).has('contacts')).toBe(true)
    expect(names(commentPlaced([ME])).has('forced')).toBe(true)
  }, 20_000)

  it('does not read the waiting-for-me lists on a mark that has not reached seen', () => {
    // Every one of the four lists counts rows that are NOT seen. queued to delivered moves nothing
    // in any of them: the message is unread before the move and unread after it. This is the event a
    // run announces once per progress note, so this line is where most of the storm was.
    const deliveredToMe = markMoved(ME, 'delivered')
    const lists = names(deliveredToMe)
    expect(lists.has('contacts')).toBe(false)
    expect(lists.has('groups')).toBe(false)
    expect(lists.has('forced')).toBe(false)
    expect(lists.has('waitingForMe')).toBe(false)
    expect(lists.size).toBe(0)
  }, 20_000)

  it('reads the badge lists when the reader\'s own mark reaches seen, wherever the reading window is', () => {
    // Reading a conversation in one window marks its messages seen; the badge on every OTHER window
    // this person has open must fall. The event names the reader and says `seen`, so the lists that
    // count "not seen" are read.
    expect(names(markMoved(ME, 'seen'))).toEqual(new Set(['contacts', 'groups', 'forced', 'waitingForMe']))
  }, 20_000)

  it('reads none of the reader\'s lists when the mark is somebody else\'s', () => {
    // A run marking its own queue delivered or seen: the person reading is nobody in the event, so
    // no list that counts what waits for them can have moved.
    expect(names(markMoved(THEM, 'delivered'))).toEqual(new Set())
    expect(names(markMoved(THEM, 'seen'))).toEqual(new Set())
  }, 20_000)

  it('reads the open conversation when the other side is a party, and not when only the reader is', () => {
    // The mark the panel draws sits under the reader's OWN messages and names the other side's mark.
    // So a mark moving for the reader changes nothing in the view, and a mark moving for `them` is
    // the clock becoming a tick.
    const open = { what: 'contact', them: THEM } as const
    expect(names(said(THEM, [ME]), ME, open).has('theOpenConversation')).toBe(true)
    expect(names(markMoved(THEM, 'delivered'), ME, open).has('theOpenConversation')).toBe(true)
    expect(names(markMoved(ME, 'seen'), ME, open).has('theOpenConversation')).toBe(false)
    // A message involving neither side cannot be in this conversation.
    expect(names(said(ANOTHER_AGENT, [ANOTHER_AGENT]), ME, open).has('theOpenConversation')).toBe(false)
  }, 20_000)

  it('reads the open group on any new message, because the event cannot name a group', () => {
    // A message to a group announces one recipient per member and no group at all, so while a group
    // view is open any new message in the project could be one of its messages.
    const open = { what: 'group', id: 'g1' } as const
    expect(names(said(THEM, [ANOTHER_AGENT]), ME, open).has('theOpenConversation')).toBe(true)
    expect(names(commentPlaced([ANOTHER_AGENT]), ME, open).has('theOpenConversation')).toBe(true)
  }, 20_000)

  it('reads the open unregistered conversation when a message from nobody registered arrives', () => {
    // A writer nobody registered is named by no registry row, so their message arrives with sentBy
    // null — which is also how a system line arrives. While such a writer's conversation is open,
    // a message naming nobody could be from them.
    const open = { what: 'unregistered' } as const
    expect(names(said(null, [ME]), ME, open).has('theOpenConversation')).toBe(true)
    expect(names(said(THEM, [ME]), ME, open).has('theOpenConversation')).toBe(false)
    expect(names(markMoved(ME, 'seen'), ME, open).has('theOpenConversation')).toBe(false)
  }, 20_000)

  it('reads the presence alone on a presence change even with a conversation open', () => {
    const open = { what: 'contact', them: THEM } as const
    expect(names(presence(), ME, open)).toEqual(new Set(['presence']))
  }, 20_000)
})

describe('one read per burst, for the union of the lists the burst named', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the union of two bursts that arrive together, and not only the last event\'s lists', () => {
    // A presence change and a new message inside the same quarter of a second are ONE read, and it
    // must cover both: a single `act` with no memory would read whatever arrived last and quietly
    // drop the first event's lists.
    const acts: ReadonlySet<ChatList>[] = []
    const burst = makeTheBurstReader((lists) => acts.push(lists))
    burst.add(new Set<ChatList>(['presence']))
    burst.add(new Set<ChatList>(['contacts']))
    vi.advanceTimersByTime(300)
    expect(acts).toEqual([new Set<ChatList>(['presence', 'contacts'])])
  }, 20_000)

  it('reads once for a burst and once again for the next one, so nothing is carried over stale', () => {
    const acts: ReadonlySet<ChatList>[] = []
    const burst = makeTheBurstReader((lists) => acts.push(lists))
    burst.add(new Set<ChatList>(['presence']))
    vi.advanceTimersByTime(300)
    burst.add(new Set<ChatList>(['contacts']))
    vi.advanceTimersByTime(300)
    expect(acts).toEqual([new Set<ChatList>(['presence']), new Set<ChatList>(['contacts'])])
  }, 20_000)

  it('does not read after it has been stopped', () => {
    const acts: ReadonlySet<ChatList>[] = []
    const burst = makeTheBurstReader((lists) => acts.push(lists))
    burst.add(new Set<ChatList>(['presence']))
    burst.stop()
    vi.advanceTimersByTime(300)
    expect(acts).toEqual([])
  }, 20_000)
})

/**
 * The burst reader from chatlists.ts, driven without React.
 *
 * The hook `useAfterTheBurst` is the same reader with a cleanup effect around it, which this file
 * cannot run — so the union and the trailing edge are tested here, on the plain reader, and the
 * browser test proves the hook is wired to the channel.
 */

describe('whether a seen mark really touches what a panel draws', () => {
  it('is true when the marked message is one of the panel\'s entries', () => {
    expect(aSeenMarkTouchesThisPool(markMoved(ME, 'seen'), ['mQn1a2B3cD4e'])).toBe(true)
  }, 20_000)

  it('is false when the marked message is not among the entries the panel draws from', () => {
    // The panel draws only some of the pool: Forced draws the emergencies, Leading draws the offers.
    // A message with no lead leaving the waiting pool changes nothing that pane shows.
    expect(aSeenMarkTouchesThisPool(markMoved(ME, 'seen'), ['aDifferentMessage'])).toBe(false)
  }, 20_000)

  it('is false on a mark that did not reach seen, and true on every other event name', () => {
    expect(aSeenMarkTouchesThisPool(markMoved(ME, 'delivered'), ['mQn1a2B3cD4e'])).toBe(false)
    expect(aSeenMarkTouchesThisPool(said(THEM, [ME]), [])).toBe(true)
  }, 20_000)
})

describe('who is reading', () => {
  it('starts as not known in a page that has read no contacts yet, becomes the contacts answer, and says so rather than guessing', async () => {
    // A FRESH MODULE, because the state lives at module level and another file may have already read
    // contacts through it. What a page starts with is what an untouched copy answers.
    vi.resetModules()
    const fresh = await import('../src/web/lib/chatlists.ts')
    expect(fresh.whoIsReading()).toBe('notKnownYet')
    fresh.theReaderIs(ME)
    expect(fresh.whoIsReading()).toEqual(ME)
    fresh.theReaderIs(null)
    expect(fresh.whoIsReading()).toBe(null)
  }, 20_000)
})