// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE STORE FOR WHETHER A MESSAGE HAS BEEN READ, AND EVERY MESSAGE IN A CONVERSATION.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, AND HOW CRITERION E1 MOVED IT
 * ---------------------------------------------------------------------------------------
 *
 * 1. **The number on the circle moves when a message is actually read.** It did not once: the
 *    Reports and notes page wrote `data.read = true` on the record and the circle counts
 *    `message_delivery`, so the owner cleared their board and the circle showed the same number.
 *    Problem `EGhi5RjLwApr`. The surface that marks a message read is the CHAT, when it puts the
 *    words in front of the owner; this file measured the notes page's board until 15 September 2026, when
 *    criterion E1 took messages off that page and the board left with them. The store did not move,
 *    the surface that presses it did, and this file was moved with it.
 *
 * 2. **Every message is drawn in a conversation, and the circle counts exactly those.** There used
 *    to be a section called "The board" holding every message whose writer answers to no registry
 *    row. A one-time report from an agent belongs in that agent's conversation with the owner, and
 *    every writer is registered. So the board is gone. A writer nobody registered
 *    now has a conversation of its own under the line it typed, marked as unregistered, and its
 *    messages move under the registered contact the day it registers. Criterion M25, problem
 *    `maO7ukONHWdN`. The owner's whole inbox is read at `#/messages` (the pool) and in the chat, which is
 *    what the first describe checks in the browser now that the notes page no longer draws it.
 *
 * ---------------------------------------------------------------------------------------
 * A SENDERLESS MESSAGE IS MADE THE WAY THE CORPUS GOT ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * The door will not write one any more — a message says who sent it, and the writer is looked up in
 * the registries — so `sentBy` is removed from the stored record afterwards, which is exactly the
 * shape the twenty-five in the live corpus are in: written by an actor id that answers to no
 * registry row, with the `from` line its writer typed left untouched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** One message, written the way anything writes one. `expected` is the status the write answers. */
async function say(from: Record<string, string>, title: string, body: string, to: { kind: string; id: string }, expected = 201): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: from,
    body: JSON.stringify({ kind: 'message', title, data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(expected)
  return ((await said.json()) as { record: { id: string } }).record.id
}

/**
 * THE LINE A WRITER NOBODY REGISTERED TYPED, and the id another one claims.
 *
 * The third test registers an agent whose title is the first and whose handle is the second, which
 * is what makes both writers' messages move under one contact.
 */
const TYPED_LINE = 'claude-code · roadmap-audit-recorder'
const NOT_REGISTERED = 'roadmap-audit-recorder'

/** Every contact row this reader has, and the number on the circle, from the reply the panel reads. */
async function contacts(): Promise<{
  /** The circle's two halves since criterion M32: unread messages, and the number of unread groups. */
  unread: { messages: number; groups: number }
  contacts: {
    who: { kind: string; id: string } | null
    unregistered: { typed: string | null; said: { kind: string; id: string } | null } | null
    last: { body: string } | null
    unread: number
  }[]
}> {
  const res = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()) as never
}

/** The number the circle draws, read from the same reply the panel reads. */
async function onTheCircle(): Promise<number> {
  const res = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { unread: { messages: number; groups: number } }).unread.messages
}

/** The circle, polled until it reads what the test expects, because the mark lands after the draw. */
async function waitForCircle(wanted: number): Promise<void> {
  const deadline = Date.now() + 20_000
  for (;;) {
    if ((await onTheCircle()) === wanted) return
    if (Date.now() > deadline) {
      throw new Error(`the circle never reached ${String(wanted)}; it reads ${String(await onTheCircle())}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'read-and-the-board', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }

  // ONE TO THE OWNER, from an agent the registries hold. It is in a conversation.
  await say(asAgent('builder-x'), 'The wrist camera fit is holding', 'The wrist camera fit is holding at 0.4 px.', {
    kind: 'person',
    id: THE_PERSON,
  })
  // ONE BETWEEN TWO AGENTS. Not the owner's, and not on the owner's board. Nothing holds the agent it is written to in
  // the test office, so the office stores the message, routes it and answers 409. The message is stored all the same.
  // checker-y is the person's, since the person registered it, so the message waits and no copy reaches the person.
  await say(asAgent('builder-x'), 'Are you in the same files?', 'I have the mount claimed. Are you?', {
    kind: 'agent',
    id: 'checker-y',
  }, 409)
  // AND ONE TO THE OWNER WITH NO SENDER, the shape the twenty-five already in the corpus are in.
  const senderless = await say(asAgent('builder-x'), 'Two forks are waiting on you', 'Nobody else can answer them.', {
    kind: 'person',
    id: THE_PERSON,
  })
  const held = new Database(join(app.dir, 'panelx.db'))
  try {
    held
      .prepare("UPDATE records SET data = json_set(json_remove(data, '$.sentBy'), '$.from', ?) WHERE id = ?")
      .run('claude-code · roadmap-audit-recorder', senderless)
  } finally {
    held.close()
  }
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the person’s inbox is at #/messages and in the chat, and the read lives in one store', () => {
  it('draws the person’s messages and the ones between agents at #/messages, and moves the circle when the chat opens a conversation', async () => {
    // THE REPORTS AND NOTES PAGE NO LONGER DRAWS ANY OF THIS. Criterion E1 took messages out of
    // that family on 15 September 2026, so the two surfaces that keep the owner's inbox are measured here.
    const before = await onTheCircle()
    // The message between the two agents waits, because the person owns checker-y, so no copy of it reaches the person.
    expect(before, 'two messages were written to the person and both reached them').toBe(2)

    await app.page.goto(`${app.site}/#/messages`)
    await app.page.waitForFunction(
      () => document.body.textContent?.includes('The wrist camera fit is holding') === true,
      undefined,
      { timeout: 20_000 },
    )
    const listed = (await app.page.textContent('body')) ?? ''
    expect(listed, 'one of the person’s messages is missing from the pool page').toContain('The wrist camera fit is holding')
    expect(listed, 'the message between two agents is not on the pool page').toContain('I have the mount claimed')

    // THE CHAT MARKS A MESSAGE SEEN WHEN IT PUTS THE WORDS IN FRONT OF THE OWNER, and the number on the
    // circle is the same store. Open builder-x's conversation and the circle falls by one.
    await app.page.goto(`${app.site}/#/`)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
    await app.page.waitForFunction(
      () => document.body.textContent?.includes('Builder X') === true,
      undefined,
      { timeout: 20_000 },
    )
    await app.page.click('.px-chat-contact:has-text("Builder X")')
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat')?.textContent?.includes('The wrist camera fit is holding') === true,
      undefined,
      { timeout: 20_000 },
    )
    await waitForCircle(1)
  }, 120_000)

  it('names the writer of every message, and counts only what reached the person', async () => {
    await app.page.goto(`${app.site}/#/messages`)
    await app.page.waitForFunction(
      () => document.body.textContent?.includes('I have the mount claimed') === true,
      undefined,
      { timeout: 20_000 },
    )
    // AND WAIT FOR THE ROWS, NOT ONLY THE WORDS. The text below is also in the chat panel the test
    // above left open, so the words alone are satisfied a moment before the pool page has drawn.
    await app.page.waitForSelector('.px-ms-one', { timeout: 20_000 })
    // READ OFF THE ROWS THEMSELVES, not off the whole page. A page-wide search would pass with no
    // writer drawn at all, which is exactly what a mutation of this fix produced when the page was
    // the notes list; the same rule holds on the pool page.
    const writers = await app.page.$$eval('.px-ms-from', (all) => all.map((one) => one.textContent ?? ''))
    expect(writers, 'a message with a registered sender draws no name').toContain('Builder X')
    expect(writers, 'the line a writer nobody registered typed is not drawn').toContain(TYPED_LINE)
    // THE CIRCLE COUNTS WHAT REACHED THE PERSON, AND NOTHING ELSE.
    // Decision murJ5IMWDOXR reads criterion M32, so a conversation between agents does not count.
    // Nothing answers as checker-y and the person owns it, so builder-x's message to it waits with
    // checker-y and no copy reaches the person. The test above opened builder-x's conversation and so
    // marked the wrist camera message read. What is left unread is the message with no registered
    // sender, so the count is 1.
    expect(await onTheCircle(), 'the owner’s unread count must be the message that reached the person and was not read').toBe(1)
  }, 120_000)
})

describe('every message is in a conversation, and a writer nobody registered gets one of its own', () => {
  it('draws a legacy message under the line its writer typed, marked unregistered, and counts it', async () => {
    // A FRESH ONE OF EACH, because the tests above marked everything read.
    await say(asAgent('checker-y'), 'The calibration table is short a row', 'effort 18 is missing.', {
      kind: 'person',
      id: THE_PERSON,
    })
    // AND ONE SHAPED THE WAY THE LEGACY ROWS ARE: no `sentBy` at all, and the line its writer typed
    // left exactly as written. The door will not write one, so it is made the way the corpus got its
    // own — by taking the field away afterwards.
    const senderless = await say(asAgent('builder-x'), 'The audit counts do not match', 'I recorded the file.', {
      kind: 'person',
      id: THE_PERSON,
    })
    const held = new Database(join(app.dir, 'panelx.db'))
    try {
      held
        .prepare("UPDATE records SET data = json_set(json_remove(data, '$.sentBy'), '$.from', ?) WHERE id = ?")
        .run(TYPED_LINE, senderless)
    } finally {
      held.close()
    }

    const reply = await contacts()
    const stranger = reply.contacts.find((one) => one.unregistered?.typed === TYPED_LINE)
    expect(stranger, 'the writer nobody registered has no row of its own').toBeDefined()
    expect(stranger?.who, 'a writer nobody registered was given a registry row it does not have').toBeNull()
    expect(stranger?.unread, 'its message is not counted as unread').toBeGreaterThan(0)

    // THE CIRCLE STILL EQUALS THE ROWS UNDER IT. That is what the board was for, and removing it
    // must not bring back the arithmetic it was built to fix.
    const reachable = reply.contacts.reduce((sum, one) => sum + one.unread, 0)
    expect(reply.unread.messages, 'the circle counts messages nothing in the panel can open').toBe(reachable)

    // AND THE PANEL DRAWS IT, under the line its writer typed, with the word saying nobody
    // registered it — and there is no section called "The board" any more.
    await app.page.goto(`${app.site}/#/`)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
    await app.page.waitForFunction(
      (name: string) => document.body.textContent?.includes(name) === true,
      TYPED_LINE,
      { timeout: 20_000 },
    )
    const listed = (await app.page.textContent('.px-chat')) ?? ''
    expect(listed, 'the panel still draws a section called The board').not.toContain('The board')
    expect(listed, 'nothing beside the name says nobody registered this writer').toContain(CHAT_WORDS.unregistered)

    await app.page.click('.px-chat-contact[data-unregistered="yes"]')
    // WAIT FOR THE MESSAGES, NOT FOR THE LIST. The list is drawn empty while the request is still
    // in flight, so waiting for the element passes before anything has been read back.
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat')?.textContent?.includes('I recorded the file.') === true,
      undefined,
      { timeout: 20_000 },
    )
    const opened = (await app.page.textContent('.px-chat')) ?? ''
    expect(opened, 'the conversation does not draw the message the circle counted').toContain('I recorded the file.')
    expect(opened, 'the conversation does not say why there is nobody to write back to').toContain(
      CHAT_WORDS.unregisteredIs,
    )
  }, 120_000)

  it('draws a message from an actor id no registry holds under that id, and never as a registered contact', async () => {
    const said = await say(asAgent('builder-x'), 'The sweep stopped early', 'Six of twenty ran.', {
      kind: 'person',
      id: THE_PERSON,
    })
    // AN ACTOR ID NOBODY REGISTERED. The write door refuses a message from an unknown participant
    // (M14), so this is written as a registered agent and the sender is then changed to the id that
    // answers to nothing — which is the shape a row from an unregistered actor arrives in.
    const held = new Database(join(app.dir, 'panelx.db'))
    try {
      held
        .prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?")
        .run(JSON.stringify({ kind: 'agent', id: NOT_REGISTERED }), said)
    } finally {
      held.close()
    }

    const reply = await contacts()
    const row = reply.contacts.find((one) => one.unregistered?.said?.id === NOT_REGISTERED)
    expect(row, 'a writer claiming an id no registry holds has no row of its own').toBeDefined()
    expect(row?.who, 'an unregistered actor id was drawn as somebody the registries hold').toBeNull()
    expect(row?.last?.body).toBe('Six of twenty ran.')
    expect(
      reply.contacts.some((one) => one.who?.id === NOT_REGISTERED),
      'an unregistered actor id was offered as somebody to write to',
    ).toBe(false)
  }, 120_000)

  it('moves those messages under the registered contact once somebody registers under that name', async () => {
    // NOTHING REWRITES THE STORED MESSAGES. The move is worked out afresh on every read, so filing
    // the registry row is the whole act.
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'agent',
        title: TYPED_LINE,
        data: { handle: NOT_REGISTERED, runtime: 'claude-code', state: 'active' },
      }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)

    const reply = await contacts()
    expect(
      reply.contacts.some((one) => one.unregistered?.typed === TYPED_LINE),
      'the writer registered and its row is still drawn as unregistered',
    ).toBe(false)
    expect(
      reply.contacts.some((one) => one.unregistered?.said?.id === NOT_REGISTERED),
      'the actor id registered and its row is still drawn as unregistered',
    ).toBe(false)

    // THE CONTACT ROW CARRIES THE REGISTRY ID, which is not the handle it registered under.
    const registry = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
    const agents = ((await registry.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
    const registeredId = agents.find((one) => one.handle === NOT_REGISTERED)?.id
    expect(registeredId, `${NOT_REGISTERED} has no registry row`).toBeTruthy()
    const registered = reply.contacts.find((one) => one.who?.id === registeredId)
    expect(registered, 'the newly registered agent is not a contact').toBeDefined()

    // BOTH ITS MESSAGES ARE NOW IN THAT CONVERSATION: the one that typed the line as its name, and
    // the one that claimed the handle as its actor id.
    const talk = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(NOT_REGISTERED)}`, {
      headers: AS_THE_OWNER,
    })
    expect(talk.status, await talk.clone().text()).toBe(200)
    const said = ((await talk.json()) as { messages: { body: string }[] }).messages.map((one) => one.body)
    expect(said, 'the legacy message did not move under the contact that registered').toContain('I recorded the file.')
    expect(said, 'the message from the unregistered actor id did not move').toContain('Six of twenty ran.')

    // AND THE CIRCLE STILL EQUALS THE ROWS.
    expect(reply.unread.messages).toBe(reply.contacts.reduce((sum, one) => sum + one.unread, 0))
  }, 120_000)
})
