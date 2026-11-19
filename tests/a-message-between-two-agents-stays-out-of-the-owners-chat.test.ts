// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE BETWEEN TWO AGENTS STAYS OUT OF THE OWNER'S OWN CHAT WITH ITS SENDER. Problem TOoUy7fMbg1P.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * A decision sends the owner's page every message between two agents, so that a conversation between agents the owner
 * has open redraws itself. That push must not put the message into their own conversation with the sender. The owner's
 * chat with agent Lark is open; Lark sends a message to agent Wren; then Lark sends a message to the owner. When the
 * second message appears in the open chat, the first one has reached the page too, because one stream carries both
 * in order.
 *
 *   1. Live: the message to Wren is not in the owner's chat with Lark.
 *   2. After a reload: it is still not there.
 *   3. It is in the conversation between Lark and Wren, on the "between agents" tab.
 *
 * BOTH AGENTS CAN BE REACHED, AND THAT IS ON PURPOSE. When an addressee cannot be reached and the
 * chain of starters above it ends at the owner, the office also gives the owner
 * the message. That copy is theirs, and it is drawn in their chat with the sender with a line
 * saying why (tests/a-routed-letter-says-why-it-is-here.test.ts). This file checks the send made no such
 * copy, so what it measures is a message that never reached the owner.
 *
 * MUTATION: in `talkWithANewMessage` in src/web/lib/chatdeltas.ts, place a pushed message in the
 * open conversation when its sender is the other side, without asking the conversation rule. Case 1
 * goes red.
 */

import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat as openTheChatFromTheShell } from './open-the-chat.ts'

let app: LiveApp
/** Every real child this file started, stopped by its own group afterwards. */
const started: ChildProcess[] = []

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** Each registered agent's registry id, by its handle. */
const idOf = new Map<string, string>()

const TO_LARK = 'Lark, the owner says hello before anything else'
const LARK_TO_WREN = 'Wren, the kettle readings for the east shed are in'
const LARK_TO_OWNER = 'Owner, one note for you after that'

async function register(handle: string, name: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle, name, runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string } }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  idOf.set(handle, said.agent!.id)
  return said.agent!.id
}

/** A running session serving this agent, and a real process of this test's own against it. */
async function makeReachable(agentId: string): Promise<void> {
  const session = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({
      kind: 'session',
      title: `A run answering as ${agentId}`,
      data: { state: 'running', runtime: 'claude-code', servingAgent: agentId },
    }),
  })
  expect(session.status, await session.clone().text()).toBe(201)
  const sessionRecordId = ((await session.json()) as { record: { id: string } }).record.id
  const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start').toBeDefined()
  const registered = await fetch(`${app.api}/api/resources`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      type: 'process',
      key: String(child.pid),
      sessionRecordId,
      detail: `A live process of this test, so ${agentId} reads as one somebody is answering as.`,
    }),
  })
  expect(registered.status, await registered.clone().text()).toBe(201)
}

/** Send one message to one participant; the reply's `routed` list says whether the office made a copy. */
async function send(from: Record<string, string>, to: { kind: string; id: string }, body: string): Promise<{ routed: unknown[] }> {
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: from,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 40), data: { body, to: [to] } }),
  })
  const said = (await reply.json()) as { record?: { id: string }; routed?: unknown[] }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  return { routed: said.routed ?? [] }
}

beforeAll(async () => {
  app = await liveApp({ name: 'between-agents-stays-out', viewport: { width: 1440, height: 1000 } })
  await makeReachable(await register('lark', 'Lark'))
  await makeReachable(await register('wren', 'Wren'))
  // THE OWNER'S CONVERSATION WITH LARK HAS SOMETHING IN IT, so its row is in their contacts to open.
  await send(AS_THE_OWNER, { kind: 'agent', id: idOf.get('lark')! }, TO_LARK)
}, 240_000)

afterAll(async () => {
  // BY THE GROUP ID THIS TEST WROTE DOWN, never by a command-line pattern (chapter 2, rule 1).
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file measures.
    }
  }
  await app.stop()
})

/** The chat panel open on one tab, with no conversation open. */
async function openTheChat(tab: 'contacts' | 'between'): Promise<void> {
  await openTheChatFromTheShell(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-tab', { timeout: 20_000 })
  await app.page.click(`.px-chat-tab[data-tab="${tab}"]`)
  if (tab === 'between') await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"]', { timeout: 20_000 })
}

/** Open the owner's own conversation with Lark and wait until its first message is drawn. */
async function openTheirChatWithLark(): Promise<void> {
  await openTheChat('contacts')
  const row = `.px-chat-contact[data-contact="agent:${idOf.get('lark')!}"]`
  await app.page.waitForSelector(row, { timeout: 20_000 })
  await app.page.click(row)
  await app.page.locator('.px-chat-one').filter({ hasText: TO_LARK }).first().waitFor({ state: 'visible', timeout: 20_000 })
}

const drawnWith = (body: string) => app.page.locator('.px-chat-one').filter({ hasText: body })

describe('a message between two agents stays out of the owner’s chat with its sender', () => {
  it('is not placed in the person\'s chat with the sender when it arrives live', async () => {
    await app.page.goto(`${app.site}/#/`)
    await openTheirChatWithLark()

    const toWren = await send(asAgent('lark'), { kind: 'agent', id: idOf.get('wren')! }, LARK_TO_WREN)
    // NO COPY WAS MADE FOR THE OWNER. A routed copy would be theirs to see, and this file would measure nothing.
    expect(toWren.routed, 'the office routed the message, so the owner was given it').toEqual([])
    await send(asAgent('lark'), { kind: 'person', id: THE_PERSON }, LARK_TO_OWNER)

    // THE LATER MESSAGE IS DRAWN LIVE, so the earlier one has reached this page as well.
    await drawnWith(LARK_TO_OWNER).first().waitFor({ state: 'visible', timeout: 20_000 })
    expect(await drawnWith(LARK_TO_WREN).count(), 'the message to Wren was drawn in the person\'s chat with Lark').toBe(0)
  }, 120_000)

  it('is still not in the person\'s chat with the sender after a reload', async () => {
    await app.page.goto(`${app.site}/#/`)
    await app.page.reload()
    await openTheirChatWithLark()
    await drawnWith(LARK_TO_OWNER).first().waitFor({ state: 'visible', timeout: 20_000 })
    expect(await drawnWith(LARK_TO_WREN).count(), 'after a reload, the message to Wren is in the person\'s chat with Lark').toBe(0)
  }, 120_000)

  it('is in the conversation between the two agents', async () => {
    await app.page.goto(`${app.site}/#/`)
    await openTheChat('between')
    const pair = app.page.locator('.px-chat-contact').filter({ hasText: 'Lark' }).filter({ hasText: 'Wren' }).first()
    await pair.waitFor({ state: 'visible', timeout: 20_000 })
    await pair.click()
    await drawnWith(LARK_TO_WREN).first().waitFor({ state: 'visible', timeout: 20_000 })
    expect(await drawnWith(LARK_TO_OWNER).count(), 'a message to the owner was drawn between Lark and Wren').toBe(0)
  }, 120_000)
})
