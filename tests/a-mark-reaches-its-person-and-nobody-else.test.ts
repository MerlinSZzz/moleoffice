// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO A DELIVERY MARK MOVING REACHES, AND WHO A MESSAGE REACHES.
 *
 * ---------------------------------------------------------------------------------------
 * THE BROADCAST, AND WHAT WAS NARROWED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M55: a conversation is the person's, whichever project is open, so a message written in
 * one project and the mark saying it was read belong on every page this person has open. Two events
 * used to skip the project filter for that reason, and one of them took the whole server with it.
 *
 * `message.new` still skips it: a conversation is the person's across every project. Since a decision it
 * reaches only the message's parties and the owner, and so does a mark; that routing has its own file,
 * tests/a-new-message-reaches-only-its-parties.test.ts. Every event below names
 * its parties, and the pages here are parties or the owner unless a case says otherwise.
 *
 * `delivery.changed` is about ONE person — the recipient whose mark moved. It used to reach every
 * window of every project, which is how one agent's progress note redrew every chat panel on the
 * server. It now reaches the pages of the person whose mark moved, wherever they are, and the pages
 * watching the project the message is in — the tick under a message the reader sent is about the
 * message's own project. NOBODY ELSE hears a mark moving in a project they are not reading, which is
 * exactly what the blanket broadcast was.
 *
 * A wrong narrowing here is silent in both directions: a person who stops receiving their own marks
 * holds a badge that never falls, and a reader who stops receiving the other project's marks holds a
 * tick that never becomes a check. The cases below name both.
 *
 * This file asks the channel directly: `pageOpened` takes a `send`, so the tests hold the streams
 * without a browser.
 */

import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'

import { freshDb } from './helpers.ts'
import type { ChannelEvent } from '../src/shared/events.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const OTHER_PROJECT = 'somewhere-else'
const A_THIRD_PROJECT = 'a-third-place'
const ME = { kind: 'person' as const, id: THE_TEST_OFFICES_OWNER.id }
const WHOSE_MARK = { kind: 'agent' as const, id: 'mark-owner' }
const STRANGER = { kind: 'agent' as const, id: 'stranger-y' }
const A_THIRD_PLACE = 'a-third-place'
/** An agent who sent the messages the marks below are on, when no page in the case is the sender. */
const A_SENDER = { kind: 'agent' as const, id: 'sender-z' }

let t: Awaited<ReturnType<typeof freshDb>>
let events: typeof import('../src/server/lib/events.ts')

/** One page of one participant, watching one project, keeping the names of what it was sent. */
function aPage(who: typeof ME | typeof WHOSE_MARK | typeof STRANGER | null, watching: string): {
  names: string[]
  to: (string | null)[]
  id: number
} {
  const got: { names: string[]; to: (string | null)[] } = { names: [], to: [] }
  const id = events.pageOpened({
    workspaceId: watching,
    who,
    send: (one) => {
      const event: ChannelEvent = one.event
      got.names.push(event.name)
      got.to.push('to' in event ? (event.to as { id: string }).id : null)
    },
  })
  return { ...got, id }
}

const markMoving = (to: typeof ME | typeof WHOSE_MARK, inProject: string, mark: 'delivered' | 'seen' = 'delivered') => ({
  name: 'delivery.changed' as const,
  workspaceId: inProject,
  messageIds: ['mOneTwoThree' as const],
  to,
  mark,
})

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // THE CHANNEL IS THE ONLY THING THESE CASES SHARE: each case opens its own pages and reads
  // only the events announced during it.
  events.forgetTheChannel()
})

describe('a mark moving, and who it reaches', () => {
  it('reaches the mark\'s own person and a bystander watching the project it happened in', () => {
    const mine = aPage(ME, WORKSPACE)
    const bystander = aPage(WHOSE_MARK, WORKSPACE)
    // THE BYSTANDER SENT THE MESSAGE, so the tick under it is theirs to see.
    events.announce(markMoving(ME, WORKSPACE), null, [WHOSE_MARK, ME])
    // The person whose mark moved, watching the project it happened in.
    expect(mine.names.includes('delivery.changed')).toBe(true)
    // A page of somebody else watching the SAME project hears it: the tick under a message in an
    // open conversation.
    expect(bystander.names.includes('delivery.changed')).toBe(true)
    events.pageClosed(mine.id)
    events.pageClosed(bystander.id)
  }, 20_000)

  it('reaches the person\'s page watching ANOTHER project, and not a stranger\'s page watching it', () => {
    const mine = aPage(ME, WORKSPACE)
    const stranger = aPage(STRANGER, A_THIRD_PLACE)
    const nobody = aPage(null, WORKSPACE)

    events.announce(markMoving(WHOSE_MARK, OTHER_PROJECT, 'seen'), null, [A_SENDER, WHOSE_MARK])

    // SOMEBODY ELSE'S MARK, IN PROJECTS THE PAGES ARE NOT WATCHING: what the blanket broadcast used
    // to send to every window on the server, one agent's progress note at a time.
    expect(stranger.names, 'a stranger in another project heard a mark that was not theirs').toEqual([])
    expect(nobody.names.includes('delivery.changed')).toBe(false)
    // THE CONTROL: the mark's own person hears their own mark from the other project.
    const owner = aPage(WHOSE_MARK, WORKSPACE)
    events.announce(markMoving(WHOSE_MARK, OTHER_PROJECT, 'seen'), null, [A_SENDER, WHOSE_MARK])
    expect(owner.names.includes('delivery.changed')).toBe(true)
    expect(mine.names.includes('delivery.changed')).toBe(false)
    events.pageClosed(mine.id)
    events.pageClosed(stranger.id)
    events.pageClosed(nobody.id)
    events.pageClosed(owner.id)
  }, 20_000)

  it('reaches the page of a bystander who is WATCHING the project the message is in', () => {
    // The tick under a message the reader sent: the reader watches the project the message is in and
    // must see the mark move, though the mark is not theirs.
    const bystander = aPage(STRANGER, WORKSPACE)
    // THE BYSTANDER SENT THE MESSAGE the mark is on.
    events.announce(markMoving(WHOSE_MARK, WORKSPACE), null, [STRANGER, WHOSE_MARK])
    expect(bystander.names.includes('delivery.changed')).toBe(true)
    // AND IN ANOTHER PROJECT, the same bystander's page hears nothing: the mark is not theirs and
    // they are not watching that project.
    events.announce(markMoving(WHOSE_MARK, OTHER_PROJECT), null, [STRANGER, WHOSE_MARK])
    expect(bystander.names.filter((one) => one === 'delivery.changed').length).toBe(1)
    events.pageClosed(bystander.id)
  }, 20_000)

  it('keeps a message written in another project reaching the person\'s page', () => {
    const mine = aPage(ME, WORKSPACE)
    events.announce({
      name: 'message.new',
      workspaceId: OTHER_PROJECT,
      messageId: 'mTwoThreeFour',
      sentBy: WHOSE_MARK,
      to: [ME],
      hasTarget: false,
    }, null, [WHOSE_MARK, ME])
    expect(mine.names.includes('message.new')).toBe(true)
    events.pageClosed(mine.id)
  }, 20_000)

  it('gives a reconnecting page back the marks about its own reader, and not about somebody else', () => {
    const id = events.pageOpened({ workspaceId: WORKSPACE, who: ME, send: () => undefined })
    events.announce(markMoving(ME, OTHER_PROJECT, 'seen'), null, [A_SENDER, ME])
    events.announce(markMoving(WHOSE_MARK, OTHER_PROJECT), null, [A_SENDER, WHOSE_MARK])
    const caught = events.since(0, WORKSPACE, ME)
    // THEIR OWN MARK COMES BACK, from the project the page is not watching. The other person's does
    // not: it is not theirs and it is not in the project the page watches.
    const delivered = caught.events.filter((one) => one.event.name === 'delivery.changed')
    expect(delivered.some((one) => (one.event as { to: { id: string } }).to.id === THE_TEST_OFFICES_OWNER.id)).toBe(true)
    expect(delivered.some((one) => (one.event as { to: { id: string } }).to.id === 'mark-owner')).toBe(false)
    events.pageClosed(id)
  }, 20_000)
})