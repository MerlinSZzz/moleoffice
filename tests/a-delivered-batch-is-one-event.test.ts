// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BATCH OF DELIVERED MESSAGES IS ONE EVENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS TO
 * ---------------------------------------------------------------------------------------
 *
 * Opening a conversation marks every still-queued message in it delivered in one act
 * (`markManyDelivered`), and that act used to announce one `delivery.changed` per message: reading a
 * conversation of ten cost ten events, and every open window read its lists ten times — the loop
 * that fed itself, measured at eleven to twelve requests per window per event. The marks were moved
 * by one act and they are announced as one.
 *
 * A batch may span projects — a conversation is the person's across every project — so it is
 * announced once per project it touches, and each event names the project its messages are in.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const OTHER_PROJECT = 'somewhere-else'
const THE_READER = { kind: 'person' as const, id: THE_TEST_OFFICES_OWNER.id }
const ACTOR = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let events: typeof import('../src/server/lib/events.ts')
let messages: typeof import('../src/server/lib/messages.ts')

/** File one unread message to the person, in `where`, and give back its id. */
function anUnreadMessage(body: string, inProject: string = WORKSPACE): string {
  return t.api.createRecord({
    kind: 'message',
    title: body.slice(0, 40),
    workspaceId: inProject,
    data: { body, to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] },
    actor: { type: 'agent', id: 'batch-writer' } as never,
  }).id
}

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
  messages = await import('../src/server/lib/messages.ts')
  // THE WRITER OF EVERYTHING IN THIS FILE, registered so a message to the person is accepted: a
  // message to a person comes from a registered writer.
  t.api.createRecord({
    kind: 'agent',
    title: 'Batch Writer',
    workspaceId: WORKSPACE,
    data: { handle: 'batch-writer', runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as never,
  })
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // THE CHANNEL IS THE ONLY THING THESE CASES SHARE: each case reads the marks its own read moved.
  events.forgetTheChannel()
})

describe('markManyDelivered, on the batch a conversation read finds', () => {
  it('announces one event for a batch of three, carrying all three messages', () => {
    const three = [anUnreadMessage('first'), anUnreadMessage('second'), anUnreadMessage('third')]

    // THE CONTROL IS THE MARK ITSELF: all three really moved.
    const moved = messages.markManyDelivered(three, THE_READER)
    expect(moved).toEqual(three)

    const caught = events.since(0, WORKSPACE, THE_READER)
    const marks = caught.events.filter((one) => one.event.name === 'delivery.changed')
    // ONE EVENT, NOT ONE PER MESSAGE. Per message this used to be three events for one act.
    expect(marks.length).toBe(1)
    const first = marks[0]
    if (first === undefined) throw new Error('the length was asserted above, so this cannot happen')
    const said = first.event as { messageIds: readonly string[]; to: { id: string }; mark: string; workspaceId: string }
    expect([...said.messageIds].sort()).toEqual([...three].sort())
    expect(said.to.id).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(said.mark).toBe('delivered')
    expect(said.workspaceId).toBe(WORKSPACE)
  }, 20_000)

  it('announces once per project a batch spans, and each event names its own project', () => {
    // A conversation is the person's across every project, so a batch can span two. One event naming
    // one project while moving marks in two would draw the wrong project's mark under a message.
    const here = anUnreadMessage('in this project')
    const elsewhere = anUnreadMessage('in the other one', OTHER_PROJECT)
    const moved = messages.markManyDelivered([here, elsewhere], THE_READER)
    expect(moved.length).toBe(2)
    const caught = events.since(0, WORKSPACE, THE_READER)
    const marks = caught.events.filter((one) => one.event.name === 'delivery.changed')
    expect(marks.length).toBe(2)
    // THE FILTER ABOVE ALREADY KEPT ONLY `delivery.changed`, but TypeScript does not narrow a union
    // through `.filter`, so the shape is named here once rather than at each use.
    const said = marks.map((one) => one.event as { workspaceId: string; messageIds: readonly string[] })
    const byProject = new Map(said.map((one) => [one.workspaceId, one.messageIds]))
    expect(byProject.get(WORKSPACE)).toEqual([here])
    expect(byProject.get(OTHER_PROJECT)).toEqual([elsewhere])
  }, 20_000)

  it('says nothing when nothing moved, and moves a mark only forward', () => {
    // A conversation read twice in a row marks nothing the second time, and announcing nothing is
    // what keeps an open page from redrawing for nothing.
    const three = [anUnreadMessage('once'), anUnreadMessage('twice'), anUnreadMessage('again')]
    const first = messages.markManyDelivered(three, THE_READER)
    expect(first).toEqual(three)
    const second = messages.markManyDelivered(three, THE_READER)
    expect(second).toEqual([])
    // THE ONLY EVENT THE SECOND READ RAISED IS THE ONE THE FIRST ONE RAISED: no mark moved twice,
    // so nothing was announced for the second read.
    const marks = events.since(0, WORKSPACE, THE_READER).events.filter((one) => one.event.name === 'delivery.changed')
    expect(marks.length).toBe(1)
  }, 20_000)
})