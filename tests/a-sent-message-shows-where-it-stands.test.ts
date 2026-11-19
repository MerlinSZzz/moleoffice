// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENT MESSAGE SHOWS WHERE IT STANDS, FROM THE MOMENT OF THE PRESS. Criterion M113.
 *
 * A sent message used to show nothing until the server had it, and between the press and the server's answer
 * it seemed to vanish, and it could be lost to the network unseen. So it shows where it stands: a clock until
 * the server has it, one tick once the server has it, two ticks once it is read, and a red exclamation
 * mark if it failed, that is ◷ → ✓ → ✓✓, or ◷ → !.
 * A decision extends that sequence: queued ✓, delivered muted ✓✓, read green ✓✓.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST, AND WHY THE NETWORK IS INTERCEPTED
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what is drawn between a real press and a real answer, at a moment nothing else
 * in this suite controls: whether the server is slow, refuses, or never answers at all. Playwright's
 * own request interception is what holds the server still long enough to read the in-between state,
 * the way tests/plan-writing.test.ts already does for a save.
 *
 * The filter on `postDataJSON()?.kind === 'message'` matters: other requests reach `/api/records`
 * while this suite's own setup runs (registering the agent, for one), and delaying or aborting one
 * of those would be a different, unrelated test failure wearing this one's name.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import { liveApp, waitForThePage, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-send-states',
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function openThePanel(): Promise<void> {
  const already = await app.page.$('.px-chat')
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
}

/** Every data-shape currently drawn on the reader's own last bubble (real or still-pending). */
async function lastShapes(): Promise<string[]> {
  return app.page.$$eval('.px-chat-one[data-mine="yes"]:last-child .px-chat-mark', (all) =>
    all.map((one) => one.getAttribute('data-shape') ?? ''),
  )
}

/**
 * WAIT FOR THE LAST BUBBLE ITSELF TO CARRY THIS SHAPE, not for any bubble anywhere in the
 * conversation to. `page.waitForSelector('[data-shape="tick"]')` alone is satisfied by an EARLIER
 * message that already ticked, which is exactly wrong once more than one message is on screen —
 * measured here: it let a wait pass while the message actually being watched was still pending.
 */
async function waitForLastShape(shape: string): Promise<void> {
  await app.page.waitForFunction(
    (want) => {
      const rows = document.querySelectorAll('.px-chat-one[data-mine="yes"]')
      const last = rows[rows.length - 1]
      if (last === undefined) return false
      const mark = last.querySelector('.px-chat-mark')
      return mark?.getAttribute('data-shape') === want
    },
    shape,
    { timeout: 15_000 },
  )
}

/** Whether a message is a message the browser is trying to send, by its own body kind. */
function isMessagePost(route: Route): boolean {
  if (route.request().method() !== 'POST') return false
  if (!route.request().url().includes('/api/records')) return false
  const body = route.request().postDataJSON() as { kind?: string } | null
  return body?.kind === 'message'
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-send-states', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Send States',
      data: { handle: 'builder-send-states', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  // THE FILE TESTS THE TICK SEQUENCE ON A SEND THE SERVER ACCEPTS, and a person's send to an agent nothing holds now
  // answers 409. A session holds this agent's handle for the three cases, so their sends are accepted.
  const session = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({ kind: 'session', title: 'Builder Send States answering', data: { state: 'running', runtime: 'claude-code', servingAgent: 'builder-send-states' } }),
  })
  expect(session.status, await session.clone().text()).toBe(201)
  const sessionId = ((await session.json()) as { record: { id: string } }).record.id
  const held = await fetch(`${app.api}/api/handles/builder-send-states/hold`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({ session: sessionId, machine: 'a-made-up-machine', runtime: 'claude-code' }),
  })
  expect(held.status, await held.clone().text()).toBe(201)
  // ONE MESSAGE ALREADY IN THE CONVERSATION, so there is a contact row to open before any of the
  // cases below press Send for themselves.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'message',
      title: 'first',
      data: { body: 'Starting the conversation.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.text()).toBe(201)
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openThePanel()
  await app.page.click('.px-chat-contact')
  await app.page.waitForSelector('.px-chat-words', { timeout: 15_000 })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe("a sent message shows where it stands, from the press", () => {
  it('shows the clock, then a tick, when the server is slow to answer', async () => {
    await app.page.route('**/api/records', async (route) => {
      if (!isMessagePost(route)) {
        await route.continue()
        return
      }
      await sleep(1_500)
      await route.continue()
    })
    try {
      await app.page.fill('.px-chat-box', 'Slow to arrive, but never gone.')
      await app.page.click('.px-chat-send')
      // THE BOX IS CLEAR AT ONCE, criterion M113: the words now live on the bubble.
      await expect.poll(() => app.page.inputValue('.px-chat-box')).toBe('')
      // AND THE CLOCK IS THERE BEFORE THE SERVER HAS ANSWERED — this is the state that did
      // not exist at all before this criterion: nothing was drawn here, and the message looked gone.
      await waitForLastShape('pending')
      await expect
        .poll(async () => app.page.textContent('.px-chat-one[data-mine="yes"]:last-child .px-chat-words'))
        .toContain('Slow to arrive')
      // THEN THE TICK, once the delayed answer lands.
      await waitForLastShape('tick')
      expect(await lastShapes()).toEqual(['tick'])
    } finally {
      await app.page.unroute('**/api/records')
    }
  }, 60_000)

  it('shows a red mark and keeps the words when the send is refused, and Send again works', async () => {
    // A GENUINE REFUSAL FROM THE REAL SERVER, rather than a synthetic reply. Chapter 8, rule 1:
    // every write sends the actor type as one of three literal words, and a word outside them is
    // refused. Corrupting it on the way out gets the real 400, in the real server's own words,
    // instead of teaching this test to fake a reply well enough to pass every check a real one
    // would — which is a second copy of the server's own contract, free to drift from it.
    let refuseIt = true
    await app.page.route('**/api/records', async (route) => {
      if (!isMessagePost(route) || !refuseIt) {
        await route.continue()
        return
      }
      await route.continue({ headers: { ...route.request().headers(), 'x-mole-office-actor-type': 'not-a-real-actor-type' } })
    })
    try {
      await app.page.fill('.px-chat-box', 'Words that must not be lost.')
      await app.page.click('.px-chat-send')
      await waitForLastShape('failed')
      expect(await lastShapes()).toEqual(['failed'])
      // THE REASON IS READ, not only hovered, and it is the server's own sentence.
      const why = await app.page.textContent('.px-chat-one[data-mine="yes"]:last-child .px-chat-send-failed-why')
      expect(why).toContain('Could not be sent')
      // AND THE WORDS ARE STILL THERE. A message never disappears between the press and the answer.
      const words = await app.page.textContent('.px-chat-one[data-mine="yes"]:last-child .px-chat-words')
      expect(words).toContain('Words that must not be lost')

      // SEND AGAIN, this time letting it through.
      refuseIt = false
      await app.page.click('.px-chat-one[data-mine="yes"]:last-child .px-chat-send-again')
      await waitForLastShape('tick')
      expect(await lastShapes()).toEqual(['tick'])
      const wordsAfter = await app.page.textContent('.px-chat-one[data-mine="yes"]:last-child .px-chat-words')
      expect(wordsAfter).toContain('Words that must not be lost')
    } finally {
      await app.page.unroute('**/api/records')
    }
  }, 60_000)

  it('shows two ticks once the recipient has said it read the message', async () => {
    await app.page.fill('.px-chat-box', 'Read this one, please.')
    await app.page.click('.px-chat-send')
    await waitForLastShape('tick')

    const read = await fetch(`${app.api}/api/messages/conversation?kind=person&id=${THE_PERSON}`, {
      headers: AS_THE_AGENT,
    })
    expect(read.status, await read.clone().text()).toBe(200)
    const { messages } = (await read.json()) as { messages: { id: string; body: string; sentBy: { kind: string } | null }[] }
    const mine = messages.find((one) => one.sentBy?.kind === 'person' && one.body.includes('Read this one'))
    expect(mine, 'the message just sent should be in the fetched conversation').toBeDefined()
    const marked = await fetch(`${app.api}/api/messages/${mine?.id}/mark`, {
      method: 'POST',
      headers: { ...AS_THE_AGENT, 'content-type': 'application/json' },
      body: JSON.stringify({ mark: 'seen' }),
    })
    expect(marked.status, await marked.clone().text()).toBe(200)

    await waitForLastShape('read')
    expect(await lastShapes()).toEqual(['read'])
  }, 60_000)
})
