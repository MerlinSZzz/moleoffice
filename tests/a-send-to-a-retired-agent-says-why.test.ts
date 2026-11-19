// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEND TO A RETIRED AGENT SAYS WHY, AND ONE LETTER STAYS ONE BUBBLE.
 *
 * Criterion M113a and M113's amendment of 24 September 2026 stand on two decisions, one keeping the
 * other. A person's send to a retired agent still answers with
 * an error; the error now carries the routed line it already stored and a short reason in a few
 * words, and the chat draws the stored letter once, with that reason on its red mark and the whole
 * line on hover, and no press to send again — a second press stores a second letter and gets the
 * same answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS EACH RED
 * ---------------------------------------------------------------------------------------
 *
 *   · the 409 carries `error`, the whole routed line, and `reason`, "<name> is retired."; both are
 *     the stored line read back through the message door, and `data.to` and `data.routed` are stored
 *     unchanged. MUTATION (1): do not set `reason` — the reason case goes red.
 *   · a person's send to a registered agent nothing answers as is the unheld case: it answers 409
 *     with the routing and a reason in the presence dot's own word, not "retired". MUTATION (2):
 *     answer 201 as before — the unheld case goes red.
 *   · `readFault` reads that body as `refused`, with the short reason and the stored record id.
 *     MUTATION (3): do not read `stored` — the readFault case goes red.
 *   · in the browser, a send to a retired agent draws exactly one bubble, reading
 *     `CHAT_WORDS.sendError(reason)`, with the whole routed line as the red mark's title and no
 *     send-again press. MUTATION (4a): draw `fault.message` instead of the short reason — the words
 *     go red. MUTATION (4b): always draw send-again — the press goes red. MUTATION (4c): leave
 *     `recordId` null — the stored letter is drawn beside the error, two bubbles, and the one-bubble
 *     case goes red.
 *
 * THE BROWSER HALF IS A REAL STACK. `liveApp` starts an API and a page; the agent is registered and
 * retired through the real doors, and the send is a real press with a real 409. The `readFault` half
 * imports the browser module by hand because `src/web/api.ts` reads `window.localStorage` the moment
 * it is evaluated; the same stand-in the other component tests install is used here.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS, type RoutedAddressee } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

type API = typeof import('../src/web/api.ts')

let app: LiveApp
let api: API

const WORKSPACE = 'default'

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The reply of one record write, as this file reads it. */
interface Said {
  status: number
  said: Record<string, unknown>
}

/** Register an agent through the real door and give back its registry id. */
async function register(handle: string, name: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle, name, runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string }; error?: string }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  expect(said.agent?.id, `the registration of ${handle} named no registry id`).toBeTruthy()
  return said.agent!.id
}

/** Retire one agent through the door the owner presses, which is local-only. */
async function retire(agentId: string, because: string): Promise<void> {
  const reply = await fetch(`${app.api}/api/participants/agent/${encodeURIComponent(agentId)}/retire`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ because }),
  })
  expect(reply.status, await reply.clone().text()).toBe(200)
}

/** A person's send over the one door every message write arrives at. */
async function sendAsThePerson(to: string, body: string): Promise<Said> {
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } }),
  })
  return { status: reply.status, said: (await reply.json()) as Record<string, unknown> }
}

/** The routed line of one stored message, read back through the message door. */
async function theStoredLine(id: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/messages/${encodeURIComponent(id)}`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const said = (await reply.json()) as { message: { routed?: RoutedAddressee[] } }
  const line = said.message.routed?.[0]?.line
  expect(line, 'the stored message carries no routed line').toBeTruthy()
  return line!
}

/** The routed line the office stored for one body in a conversation. */
async function theLineStoredInTheConversation(agentId: string, body: string): Promise<string> {
  const reply = await fetch(
    `${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`,
    { headers: AS_THE_OWNER },
  )
  expect(reply.status, await reply.clone().text()).toBe(200)
  const said = (await reply.json()) as { messages: { body: string; routed?: RoutedAddressee[] }[] }
  const found = said.messages.find((one) => one.body === body)
  expect(found, 'the stored letter is not in the conversation').toBeDefined()
  const line = found!.routed?.[0]?.line
  expect(line, 'the stored letter carries no routed line').toBeTruthy()
  return line!
}

/** The record a reply named, or null. */
function theRecord(reply: Record<string, unknown>): { id: string; data: Record<string, unknown> } | null {
  const record = reply['record']
  return typeof record === 'object' && record !== null
    ? (record as { id: string; data: Record<string, unknown> })
    : null
}

// ============================================================ the fixtures

/** The server case: a person's send to a retired agent. */
const SERVER_NAME = 'Pike（派克）'
let serverAgentId = ''
let the409: Said = { status: 0, said: {} }
let the409RecordId = ''
let the409Line = ''
/** The unheld case: a person's send to a registered agent nothing is answering as. */
let theUnheld409: Said = { status: 0, said: {} }
let unheldAgentId = ''
/** The browser case: an agent opened while live, then retired before the press. */
const BROWSER_NAME = 'Fern（蕨）'
let browserAgentId = ''
/** The picture case's own agent, opened while live and retired before its press. */
let shotAgentId = ''

beforeAll(async () => {
  // api.ts reads window.localStorage as it loads. Same stand-in the component tests install.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  app = await liveApp({ name: 'retired-send', viewport: { width: 1440, height: 1000 } })
  api = await import('../src/web/api.ts')

  serverAgentId = await register('server-retired', SERVER_NAME)
  await retire(serverAgentId, 'the piece of work is done')
  the409 = await sendAsThePerson(serverAgentId, 'A note a retired agent cannot take')
  the409RecordId = theRecord(the409.said)?.id ?? ''
  the409Line = await theStoredLine(the409RecordId)

  unheldAgentId = await register('server-quiet', 'Quiet Fern')
  theUnheld409 = await sendAsThePerson(unheldAgentId, 'A note to an agent nothing is answering as')

  browserAgentId = await register('browser-retired', BROWSER_NAME)
  shotAgentId = await register('shot-agent', 'Cedar（杉）')
}, 240_000)

afterAll(async () => {
  await app.stop()
})

// ============================================================ the reply

describe('the reply to a person’s send to a retired agent says why', () => {
  it('answers 409 with the stored routed line as error and the name as reason', () => {
    expect(the409.status, JSON.stringify(the409.said)).toBe(409)
    expect(the409.said['error']).toBe(the409Line)
    expect(the409.said['reason']).toBe(`${SERVER_NAME} is retired.`)
    // THE ROUTING IS IN THE REPLY AND IN THE RECORD, unchanged by this change.
    const routed = the409.said['routed'] as RoutedAddressee[]
    expect(routed).toHaveLength(1)
    expect(routed[0]!.line).toBe(the409Line)
    const record = theRecord(the409.said)!
    expect(record.data['to']).toEqual([{ kind: 'agent', id: serverAgentId }])
    expect((record.data['routed'] as RoutedAddressee[])[0]!.line).toBe(the409Line)
  })

  it('answers 409 for a send to a registered agent nothing answers as, with the routing and its own reason', async () => {
    // THE 409 IS THE UNHELD CASE'S. It carries the routing as before, and a reason in the dot's own
    // word — read from the profile the running app draws, not copied here, because a test reads a
    // value that can change.
    expect(theUnheld409.status, JSON.stringify(theUnheld409.said)).toBe(409)
    expect(theUnheld409.said['routed']).toBeDefined()
    expect(theUnheld409.said['error']).toBe((theUnheld409.said['routed'] as RoutedAddressee[])[0]!.line)
    const profile = await fetch(
      `${app.api}/api/participants/agent/${encodeURIComponent(unheldAgentId)}/profile`,
      { headers: AS_THE_OWNER },
    )
    expect(profile.status, await profile.clone().text()).toBe(200)
    const word = ((await profile.json()) as { presence: { word: string } }).presence.word
    const reason = String(theUnheld409.said['reason'] ?? '')
    expect(reason.toLowerCase(), `the reason does not name ${word}`).toContain(word.toLowerCase())
    expect(reason.toLowerCase(), 'the reason calls an unheld agent retired').not.toContain('retired')
  })
})

// ============================================================ the browser's reading of it

describe('the browser reads that answer as a refusal with a short reason and a stored record', () => {
  it('gives refused, the short reason and the stored record id', () => {
    const fault = api.readFault(409, '/api/records', the409.said)
    expect(fault.kind).toBe('refused')
    // THE WHOLE LINE IS THE MESSAGE, and the short sentence is the same one the reply carried.
    expect(fault.message).toBe(the409Line)
    expect(fault.reason).toBe(`${SERVER_NAME} is retired.`)
    expect(fault.stored).toBe(the409RecordId)
  })

  it('gives no stored record on a fault that stored nothing', () => {
    const fault = api.readFault(400, '/api/records', { error: 'A session name must not be blank.' })
    expect(fault.reason).toBeNull()
    expect(fault.stored).toBeNull()
  })
})

// ============================================================ the drawing

/** The chat panel with the contacts tab open. */
async function openTheContacts(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  // THE CHAT KEEPS THE READER'S PLACE ACROSS A RELOAD, so a second case in this file finds the
  // conversation the first one opened, and a conversation draws no tabs. Press back to the list
  // first when there is a back press to make, exactly as the other chat test files do.
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
}

/** Open one agent's conversation from the contact list. */
async function openTheConversationWith(agentId: string): Promise<void> {
  await openTheContacts()
  // THE ROW IS KEYED BY THE REGISTRY ID, which the office gives the agent and which is not its handle.
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agentId}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agentId}"]`)
  // THE COMPOSER, NOT A MESSAGE: a conversation with this agent may hold no words yet.
  await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
}

/** Type one body and press Send in the open conversation. */
async function pressSend(body: string): Promise<void> {
  await app.page.fill('.px-chat-box', body)
  await app.page.click('.px-chat-send')
  await expect.poll(() => app.page.inputValue('.px-chat-box')).toBe('')
}

/** Every bubble carrying one body's words, so a duplicated letter shows up as a count. */
function bubblesCarrying(body: string) {
  return app.page.locator('.px-chat-one').filter({ hasText: body })
}

/** The first bubble of one message, found by the words it carries. */
function theBubbleCarrying(body: string) {
  return bubblesCarrying(body).first()
}

describe('a send to a retired agent is one bubble that says why', () => {
  it('draws the stored letter once with the short reason and no Send again', async () => {
    const body = 'A note the retired agent cannot take'
    await openTheConversationWith(browserAgentId)
    // RETIRED AFTER THE CONVERSATION IS OPEN, which is the only way to reach this press: M114 keeps
    // a retired agent out of the contacts list, and the open conversation stays readable.
    await retire(browserAgentId, 'the piece of work is done')
    await pressSend(body)

    // THE STORED LETTER ARRIVES, carrying the short not-delivered mark this round puts on a routed
    // message. Until it does, the press's own bubble stands in for it; after it, the stored row is the
    // one bubble.
    await app.page.waitForSelector('.px-chat-not-delivered', { timeout: 20_000 })
    const storedLine = await theLineStoredInTheConversation(browserAgentId, body)

    await expect.poll(async () => bubblesCarrying(body).count()).toBe(1)
    const bubble = theBubbleCarrying(body)
    // THE WORDS ARE EXACTLY THE SHORT SENTENCE, not the whole line.
    await expect.poll(async () => bubble.locator('.px-chat-send-failed-why').textContent()).toBe(
      CHAT_WORDS.sendError(`${BROWSER_NAME} is retired.`),
    )
    // AND THE WHOLE ROUTED LINE IS THE RED MARK'S HOVER AND ITS SCREEN-READER TEXT.
    const mark = bubble.locator('.px-chat-mark[data-shape="failed"]')
    expect(await mark.getAttribute('title')).toBe(storedLine)
    expect(await mark.getAttribute('aria-label')).toBe(storedLine)
    // AND NO SECOND PRESS, because a second press would store a second letter.
    expect(await bubble.locator('.px-chat-send-again').count()).toBe(0)
    // AND THE WORDS ARE STILL THERE.
    expect(await bubble.locator('.px-chat-words').textContent()).toContain(body)
  }, 120_000)
})

// ============================================================ the look

/**
 * THE FAILED STORED LETTER, LOOKED AT — chapter 6: four widths and both themes.
 *
 * A red mark and a sentence that reads cleanly at 1440 is where a phone shows the reader something
 * broken. The conversation is photographed at 1440, 990, 660 and 390 in light and dark. The case is
 * gated: a suite that is not asked for pictures runs no screenshot.
 */
describe('the failed stored letter is looked at', () => {
  it.skipIf(!process.env['SF_RETIRED_SEND_SHOTS'])(
    'photographs the conversation at 1440, 990, 660 and 390 in both themes',
    async () => {
      const shots = process.env['SF_RETIRED_SEND_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })

      const body = 'A note the retired agent cannot take'
      await openTheConversationWith('shot-agent')
      await retire(shotAgentId, 'the piece of work is done')
      await pressSend(body)
      // THE MARK IS REALLY THERE, so a picture of an empty panel cannot pass for a look at it.
      await app.page.waitForSelector('.px-chat-mark[data-shape="failed"]', { timeout: 20_000 })
      await app.page.waitForSelector('.px-chat-not-delivered', { timeout: 20_000 })

      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/retired-send-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})

