// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT KEEPS UP: THE CANNOT-REACH BANNER FOLLOWS THE LATEST READING, AND A SEND WHOSE ANSWER
 * NEVER CAME SAYS IT DOES NOT KNOW, THEN FINDS OUT.
 *
 * Problem msjrx1epgeBt: the "Cannot reach" banner stayed until the page was reloaded, after the
 * agent was answering again. Problem KzLydNEm4HYX: after a send timed out, the chat said "Could not
 * be sent" though the letter may have arrived, and Send again then stored it twice. Criterion M113
 * of design/messages/ACCEPTANCE.md is the send's marks, ◷ → ✓ → ✓✓, or ◷ → !.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server.
 *
 *   1. The banner goes when the agent starts answering, with no reload and no beat: taking the hold
 *      announces `answering.changed`, and the page reads the open conversation on it. The page's
 *      clock is not moved, so no timer of the page can be what read it.
 *   2. The banner comes back when the agent's hold is let go, from the same event.
 *   2b. The open conversation is read again when the window regains focus and when the page
 *      becomes visible again. A change from time alone, a hold that lapses or a wait that ends,
 *      reaches a page only at the server's once-a-minute look, and these two reads draw it at once.
 *   3. A send whose answer is held back past the 20-second timeout, while the server stores the
 *      letter and every read of the conversation is held, draws exactly one bubble carrying the
 *      letter from the event that announced it, with no Send again, no "Could not be sent" and no
 *      "not known". Until 26 September 2026 events did not carry the message, and this case proved
 *      the not-known state instead; case 4 still proves it, for a letter nothing announces.
 *   4. A send that never reaches the server says, after the timeout and a read of the conversation,
 *      that the letter is not in the conversation, and offers Send again; while that read is out it
 *      says it is not known yet and offers nothing.
 *
 * THE PAGE'S CLOCK IS PLAYWRIGHT'S, AND IT RUNS AT THE REAL RATE. The timeout (20 s) is a timer in
 * the page, in src/web/components/Chat.tsx. The page's clock is installed
 * before the first load, and it runs at the real rate, so every timer on the page (the server
 * connection's among them) fires when it would in a real tab. Where a case waits for the timeout,
 * it moves the page's clock on by that much with `page.clock.runFor`. That fires every
 * timer due in that time, in order, rather than skipping any. The server is not on this clock. Each
 * case then gives the page ten real seconds to draw what the timer caused. Until 25 September 2026
 * these waits were real, and the file took about ninety seconds.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE RUNS, recorded in the commit message and the report with their .logs/ paths
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: all cases green. MUTATION 1, the chat not reading the open conversation on
 * `answering.changed` (src/web/lib/chatdeltas.ts): the first case, which proves 1 and 2, red. MUTATION 2, the open
 * conversation's read taken out of the focus and visibility path in Chat.tsx: the two cases of 2b red. MUTATION
 * 3, the message an event carries not added to the open conversation (`talkWithANewMessage` in
 * src/web/lib/chatdeltas.ts returning it unchanged): case 3 red. MUTATION 4, the press's id not
 * sent: case 3 red. MUTATION 5, Send again offered in the not-known state: case 4 red. RESTORE: all
 * green.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'

import { fakeTranscript, liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CANNOT_REACH_WORDS, CHAT_WORDS } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Three agents nothing answers as at the start: two for the banner, one for the sends. */
const WOKEN_BY_FOCUS = { id: 'woken-by-focus', name: 'Woken By Focus' }
const WOKEN_BY_SHOWING = { id: 'woken-by-showing', name: 'Woken By Showing' }
const WOKEN_BY_THE_EVENT = { id: 'woken-by-the-event', name: 'Woken By The Event' }
const LETTERS_TO = { id: 'letters-to', name: 'Letters To' }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Register an agent through the plain records door. Copied from the cannot-reach test. */
async function anAgent(handle: string, title: string): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
}

/** One line the person writes to an agent, so it has a contact row. */
async function thePersonSays(to: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: to }] } }),
  })
  // THE UNHELD 409: nothing holds these agents, so the person's line answers the error with the routing, and the
  // letter is stored and drawn. The contact row this fixture wants is made all the same.
  expect(said.status, await said.clone().text()).toBe(409)
}

/**
 * Make one agent answer: a running session whose transcript grew just now, with a hold taken on it.
 * Copied from tests/the-chat-cannot-reach-notice-and-new-agent.test.ts. Until round 26 of wave 13w
 * taking a hold sent the chat no event, which is why the banner used to stay. Returns what letting
 * the hold go needs.
 */
async function anAgentThatAnswers(agentId: string): Promise<{ session: string; key: string }> {
  const log = fakeTranscript(agentId)
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({
      kind: 'session',
      title: `A run of ${agentId}`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        servingAgent: agentId,
        ranAs: [{ workspaceId: 'default', agentId }],
        extra: {
          discovered: { tool: 'claude-code', externalId: agentId, logPath: log, resumeCommand: null, startedAt: null, entryPoint: null },
        },
      },
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const session = ((await made.json()) as { record: { id: string } }).record.id
  // THE HOLD IS ASKED AS THE WAITER ASKS IT: under the agent's own handle, with the office's key, which is what
  // tools/hold-the-handle.mjs sends for an agent that holds no key of its own. The hold door refuses a request a
  // listener carried with no key (keys wave piece 7). The key is read from this test office's key file and never printed.
  const theOfficesKey = (JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office
  const held = await fetch(`${app.api}/api/handles/${agentId}/hold`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': agentId,
      'x-mole-office-key': theOfficesKey,
    },
    body: JSON.stringify({ session, machine: 'a-machine', runtime: 'claude-code' }),
  })
  expect(held.status, await held.clone().text()).toBe(201)
  return { session, key: theOfficesKey }
}

/** Let the hold `anAgentThatAnswers` took go, as the waiter does when its session ends. */
async function letItGo(agentId: string, hold: { session: string; key: string }): Promise<void> {
  const gone = await fetch(`${app.api}/api/handles/${agentId}/release`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': agentId,
      'x-mole-office-key': hold.key,
    },
    body: JSON.stringify({ session: hold.session, because: 'The made-up session ended.' }),
  })
  expect(gone.status, await gone.clone().text()).toBe(200)
}

/** Resolves with the next read of the open conversation the page sends. */
function theNextConversationRead(): Promise<unknown> {
  return app.page.waitForRequest((request) => request.url().includes('/api/messages/conversation'), { timeout: 10_000 })
}

/** Open the panel at the contacts, then the conversation drawn under one name. */
async function openTheConversationWith(name: string): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  // DESIGN D (wave 13y) DRAWS THE CIRCLE ONLY WHILE A MESSAGE WAITS, so the chat is opened the way the page offers it.
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
  for (const row of await app.page.$$('.px-chat-contact')) {
    if (((await row.textContent()) ?? '').includes(name)) {
      await row.click()
      await app.page.waitForSelector('.px-chat-write textarea', { timeout: 20_000 })
      return
    }
  }
  throw new Error(`no contact row named ${name}`)
}

/** How many banners are drawn now. */
async function banners(): Promise<number> {
  return (await app.page.$$('.px-chat-cannot-reach')).length
}

/** Whether a request is the browser sending a message, by its own body kind. */
function isMessagePost(route: Route): boolean {
  if (route.request().method() !== 'POST' || !route.request().url().includes('/api/records')) return false
  const body = route.request().postDataJSON() as { kind?: string } | null
  return body?.kind === 'message'
}

/** Every row in the open conversation whose words hold these words, pending or stored. */
async function rowsCarrying(words: string): Promise<{ state: string | null; text: string; again: number }[]> {
  return app.page.$$eval(
    '.px-chat-said .px-chat-one',
    (rows, w) =>
      rows
        .filter((row) => (row.querySelector('.px-chat-words')?.textContent ?? '').includes(w))
        .map((row) => ({
          state: row.querySelector('[data-send-state]')?.getAttribute('data-send-state') ?? null,
          text: row.textContent ?? '',
          again: row.querySelectorAll('.px-chat-send-again').length,
        })),
    words,
  )
}

/**
 * WAIT UNTIL THE ONE ROW CARRYING THESE WORDS SAYS THIS, and not any row in the conversation: an
 * earlier case's letter is still on screen in the same conversation.
 */
async function theRowSays(words: string, said: string, timeout: number): Promise<void> {
  await expect
    .poll(async () => (await rowsCarrying(words)).some((one) => one.text.includes(said)), { timeout })
    .toBe(true)
}

/** A promise the test resolves itself, once, when it says so. */
function aGate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined
  const opened = new Promise<void>((r) => {
    open = r
  })
  return { opened, open }
}

/** Wait for a gate, or fail saying what never happened. */
async function until(gate: { opened: Promise<void> }, what: string, ms = 15_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => {
      fail(new Error(`${what} within ${String(ms / 1000)} seconds`))
    }, ms)
  })
  try {
    await Promise.race([gate.opened, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HOLD EVERY READ OF THE CONVERSATION WHILE `held` IS SET, so a state that lasts only until the next
 * read can be read. The reads go through once it is cleared.
 */
function holdTheReads(): { hold: () => void; release: () => void } {
  let held: Promise<void> | null = null
  let letGo: () => void = () => undefined
  void app.page.route('**/api/messages/conversation**', async (route) => {
    if (held !== null) await held
    await route.continue().catch(() => undefined)
  })
  return {
    hold: () => {
      held = new Promise((r) => {
        letGo = r
      })
    },
    release: () => {
      held = null
      letGo()
    },
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-keeps-up', viewport: { width: 1440, height: 1000 } })
  // THE PAGE'S CLOCK, before the first load of the page. See the head of this file.
  await app.page.clock.install()
  for (const one of [WOKEN_BY_FOCUS, WOKEN_BY_SHOWING, WOKEN_BY_THE_EVENT, LETTERS_TO]) {
    await anAgent(one.id, one.name)
    await thePersonSays(one.id, `A first line for ${one.name}.`)
  }
  // THE SEND CASES NEED AN AGENT THAT CAN TAKE THE LETTER, so that the answer they hold back or drop is a 201 and
  // not the unheld 409. That refusal is about another case; here it would turn the letter into a failed press.
  await anAgentThatAnswers(LETTERS_TO.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('problem msjrx1epgeBt: the banner follows the latest reading', () => {
  it('goes when the agent starts answering, from the event, with no reload and no beat', async () => {
    await openTheConversationWith(WOKEN_BY_THE_EVENT.name)
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })
    expect(await app.page.textContent('.px-chat-cannot-reach')).toContain(CANNOT_REACH_WORDS.cannotReach(WOKEN_BY_THE_EVENT.name))

    const hold = await anAgentThatAnswers(WOKEN_BY_THE_EVENT.id)
    // THE PAGE'S CLOCK IS NOT MOVED, and ten real seconds are a third of the beat the chat had, so
    // what takes the banner away is the event.
    await app.page.waitForFunction(() => document.querySelector('.px-chat-cannot-reach') === null, undefined, { timeout: 10_000 })
    expect(await app.page.textContent('.px-chat-answering')).toBe(CHAT_WORDS.answeringNow['a live session'])

    // AND IT COMES BACK WHEN THE HOLD IS LET GO, from the same event.
    await letItGo(WOKEN_BY_THE_EVENT.id, hold)
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 10_000 })
    expect(await app.page.$$('.px-chat-answering')).toHaveLength(0)
  }, 120_000)

  it('reads the open conversation again when the window regains focus', async () => {
    await openTheConversationWith(WOKEN_BY_FOCUS.name)
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })
    const read = theNextConversationRead()
    await app.page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await read
  }, 120_000)

  it('reads the open conversation again when the page becomes visible again', async () => {
    await openTheConversationWith(WOKEN_BY_SHOWING.name)
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })
    const read = theNextConversationRead()
    await app.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await read
  }, 120_000)
})

describe('problem KzLydNEm4HYX: a send whose answer never came', () => {
  it('draws the one stored letter from the event that announced it, when the server stored it and its answer is lost', async () => {
    const words = 'This letter is stored while its answer is lost.'
    await openTheConversationWith(LETTERS_TO.name)
    const reads = holdTheReads()
    const theAnswer = aGate()
    const stored = aGate()
    let answerHeld: Promise<void> = Promise.resolve()
    await app.page.route('**/api/records', async (route) => {
      if (!isMessagePost(route)) {
        await route.continue()
        return
      }
      // THE LETTER REACHES THE SERVER AND IS STORED. From here no read of the conversation goes
      // through until the test lets it, so the not-known state can be read before a read ends it.
      reads.hold()
      const answer = await route.fetch()
      expect(answer.status(), await answer.text()).toBe(201)
      stored.open()
      // AND ITS ANSWER IS HELD PAST THE TIMEOUT, until the test has seen the page give up. So this
      // answer reaches nobody; fulfilling an abandoned request is refused, which is expected.
      answerHeld = theAnswer.opened.then(() => route.fulfill({ response: answer }).catch(() => undefined))
    })
    try {
      await app.page.fill('.px-chat-box', words)
      await app.page.click('.px-chat-send')

      // THE EVENT THAT ANNOUNCED THE LETTER CARRIES IT since 26 September 2026, so the page knows it
      // arrived without reading the conversation: every read of the conversation is still held here, and
      // the answer to the send is lost. Before events carried the
      // change the page could only find out by a read, and said it did not know until then; that state
      // is still what a letter nothing announces gets, which the next case proves.
      await until(stored, 'the letter was not stored')
      // ONE BUBBLE AT ONCE, while the answer to the send is still out: the stored row, not a sending one.
      await expect.poll(async () => (await rowsCarrying(words)).map((one) => one.state), { timeout: 15_000 }).toEqual([null])
      // AND THE TIMEOUT CHANGES NOTHING: the letter is known to be there.
      await app.page.clock.runFor(20_000)
      await sleep(2_000)
      let rows = await rowsCarrying(words)
      expect(rows, 'one letter is drawn as more or fewer than one bubble after the timeout').toHaveLength(1)
      expect(rows[0]?.state, 'the page said it did not know about a letter an event told it of').toBe(null)
      expect(rows[0]?.again, 'Send again is offered for a letter that arrived').toBe(0)
      theAnswer.open()
      reads.release()
      rows = await rowsCarrying(words)
      expect(rows, 'one letter is drawn as more or fewer than one bubble').toHaveLength(1)
      expect(rows[0]?.again).toBe(0)
      expect(rows[0]?.text).not.toContain('Could not be sent')
      expect(rows[0]?.text).not.toContain(CHAT_WORDS.sendNotKnownYet(20))
      // THE STORED ROW'S OWN MARK, which a message the server holds and nobody has read draws.
      const shapes = await app.page.$$eval('.px-chat-said .px-chat-one', (all, w) =>
        all
          .filter((row) => (row.querySelector('.px-chat-words')?.textContent ?? '').includes(w))
          .map((row) => row.querySelector('.px-chat-mark')?.getAttribute('data-shape') ?? null), words)
      expect(shapes).toEqual(['tick'])
    } finally {
      reads.release()
      theAnswer.open()
      await answerHeld
      await app.page.unroute('**/api/records')
      await app.page.unroute('**/api/messages/conversation**')
    }
  }, 120_000)

  it('says it is not in the conversation and offers Send again, when the letter never arrived', async () => {
    const words = 'This letter never reaches the server.'
    await openTheConversationWith(LETTERS_TO.name)
    const reads = holdTheReads()
    const theDrop = aGate()
    const caught = aGate()
    let letThrough = false
    let dropped: Promise<void> = Promise.resolve()
    await app.page.route('**/api/records', async (route) => {
      if (!isMessagePost(route) || letThrough) {
        await route.continue()
        return
      }
      // THE LETTER NEVER REACHES THE SERVER. It is dropped after the page has given up on it.
      reads.hold()
      caught.open()
      dropped = theDrop.opened.then(() => route.abort().catch(() => undefined))
    })
    try {
      await app.page.fill('.px-chat-box', words)
      await app.page.click('.px-chat-send')

      await until(caught, 'the letter never left the page')
      await app.page.clock.runFor(20_000)
      await theRowSays(words, CHAT_WORDS.sendNotKnownYet(20), 10_000)
      let rows = await rowsCarrying(words)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.state).toBe('not-known')
      expect(rows[0]?.again, 'Send again is offered before the read has said anything').toBe(0)
      // THE PAGE HAS GIVEN UP, so the letter is dropped now.
      theDrop.open()

      reads.release()
      await theRowSays(words, CHAT_WORDS.sendNotInTheConversation(20), 15_000)
      rows = await rowsCarrying(words)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.state).toBe('not-in-the-conversation')
      expect(rows[0]?.again, 'Send again is not offered for a letter the conversation does not hold').toBe(1)
      expect(rows[0]?.text).not.toContain(CHAT_WORDS.sendNotKnownYet(20))

      // AND SEND AGAIN STORES IT ONCE.
      letThrough = true
      // THE PRESS ON THIS LETTER'S OWN ROW, not the first one in the conversation.
      await app.page.locator('.px-chat-said .px-chat-one', { hasText: words }).locator('.px-chat-send-again').click()
      await expect.poll(async () => (await rowsCarrying(words)).map((one) => one.state), { timeout: 15_000 }).toEqual([null])
    } finally {
      reads.release()
      theDrop.open()
      await dropped
      await app.page.unroute('**/api/records')
      await app.page.unroute('**/api/messages/conversation**')
    }
  }, 120_000)
})
