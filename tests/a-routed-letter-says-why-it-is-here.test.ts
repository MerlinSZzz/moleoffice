// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUTED LETTER SAYS WHY IT IS HERE, AND WHO IT IS FOR, ON EVERY SCREEN THAT DRAWS IT.
 *
 * A decision, the secretary's decision `J1Qge4JH87bv` (point 13 names this piece) and
 * `-itqp2gPiHHe`. When a message cannot be reached, the office also gives it to the first reachable
 * participant up the addressee's chain of starters, and writes `data.routed` on the message. Each
 * entry carries the finished `line`, built once at send time in `src/shared/messages.ts`.
 *
 * WHAT THIS FILE MEASURES, and the mutation that turns each red
 *
 *  1. The owner's own conversation with the sender of a routed letter draws the short not-delivered mark
 *     under the words and no long routed paragraph. With Developer detail chosen, pressing the mark
 *     opens the routed line, and the drawn words are the builder's line, word for word.
 *     MUTATION (a): the mark and its words not placed at the owner's conversation site — this case goes red.
 *  2. The between-agents view of the two agents draws the same mark and opens the same line for a
 *     reader outside it.
 *     MUTATION (b): the mark drawn only in the routed recipient's own conversation, not in the
 *     between-agents view — this case goes red.
 *  3. An entry the office wrote TO THE SENDER (its `to` is null) is drawn only when the viewer is the
 *     sender. This case has two halves, because the brief's test 3 as written cannot be built: the
 *     person can never be one side of a between-agents pair (`pairFrom` builds both sides as agents
 *     and the door refuses a pair that is not two agent ids), and only a person's own send produces
 *     the owner no-copy line. So:
 *       A. the owner's own letter to an agent whose chain ends at the owner opens the owner no-copy
 *          line, word for word the builder's line;
 *       B. an agent's letter whose walk reaches the sender itself carries the sender-only line, and
 *          the owner reading that pair under Between agents does NOT see it — no mark and no words, in
 *          both readings, with no side at all and with `as=` naming the sender. The rule is on who is
 *          reading, never on the `as=` the conversation was opened with.
 *     The wave-8 supervisor ruled on 24 September 2026 that A and B replace the brief's test 3.
 *     MUTATION (c): draw every entry for every viewer — B goes red, in both readings.
 *  4. The message's own page still draws the long routed line above the words. This round's decision
 *     changes the chat only; the message's own page is not changed.
 *     MUTATION (d): the component removed from MessagePage — this case goes red.
 *
 * A REACHABLE AGENT IS A RUNNING SESSION RECORD SERVING IT PLUS A REAL CHILD PROCESS REGISTERED AS
 * ITS RESOURCE, the way tests/a-sandbox-run-counts-as-going.test.ts builds one. The children are
 * killed by their group in afterAll.
 *
 * THE LETTERS ARE SENT OVER A REAL SOCKET against the live server this test starts, and every agent
 * is registered through POST /api/agents/started. The fixtures live in `beforeAll`.
 */

import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { Locator } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RoutedAddressee } from '../src/shared/messages.ts'
import { openTheChat as openTheChatFromTheShell } from './open-the-chat.ts'

let app: LiveApp
/** Every real child this file started, stopped by its own group afterwards. */
const started: ChildProcess[] = []

const WORKSPACE = 'default'

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** A registered agent's registry id, from the registration door's own reply. */
async function register(starter: Record<string, string>, handle: string, name: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: starter,
    body: JSON.stringify({ handle, name, runtime: 'claude-code' }),
  })
  const said = (await reply.json()) as { agent?: { id: string }; error?: string }
  expect(reply.status, JSON.stringify(said)).toBe(201)
  expect(said.agent?.id, `the registration of ${handle} named no registry id`).toBeTruthy()
  idOf.set(handle, said.agent!.id)
  return said.agent!.id
}

/** Each registered agent's registry id, by its handle. The id is not the handle. */
const idOf = new Map<string, string>()

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
  expect(child.pid, 'the child did not start, so nothing below would be measuring anything').toBeDefined()
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

/** One letter sent over the socket, and the record id the reply names. */
async function send(
  from: Record<string, string>,
  to: string,
  body: string,
  status = 409,
): Promise<{ id: string; routed: readonly RoutedAddressee[] }> {
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: from,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 40), data: { body, to: [{ kind: 'agent', id: to }] } }),
  })
  const said = (await reply.json()) as { record?: { id: string }; routed?: RoutedAddressee[]; error?: string }
  // Both people and agents get an error while the addressed message stays filed.
  expect(reply.status, JSON.stringify(said)).toBe(status)
  expect(said.record?.id, 'the send named no record').toBeTruthy()
  expect(said.routed?.[0]?.line, 'the send carried no routed line').toBeTruthy()
  return { id: said.record!.id, routed: said.routed ?? [] }
}

/** The stored routed line of one message, read back through the message door. */
async function theStoredLine(id: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/messages/${id}`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const said = (await reply.json()) as { message: { routed?: RoutedAddressee[] } }
  const line = said.message.routed?.[0]?.line
  expect(line, 'the stored message carries no routed line').toBeTruthy()
  return line!
}

// ============================================================ the fixtures

/** The owner's own letter to an agent whose chain ends at them. */
let ownersLetter = ''
/** An agent's letter whose first reachable rung is the sender itself. */
let sendersOwnLetter = ''
/** The first routed letter: an agent to an agent, and the copy reaches the owner. */
let theRoutedLetter = ''
let theRoutedLetterId = ''
/** The pair of the first routed letter, and the pair of the sender-only letter. */
const PAIR_ONE = ['Sender A', 'Quiet B'] as const
const PAIR_TWO = ['Sender D', 'Quiet E'] as const

beforeAll(async () => {
  app = await liveApp({ name: 'routed-line', viewport: { width: 1440, height: 1000 } })

  // The quiet addressee has a reachable agent owner.
  await register(AS_THE_OWNER, 'sender-a', 'Sender A')
  const recipientOwner = await register(AS_THE_OWNER, 'recipient-owner', 'Recipient Owner')
  await makeReachable(recipientOwner)
  await register(asAgent('recipient-owner'), 'quiet-b', 'Quiet B')
  const first = await send(asAgent('sender-a'), 'quiet-b', 'A note nobody can take')
  theRoutedLetterId = first.id
  theRoutedLetter = await theStoredLine(first.id)

  // 2. THE OWNER'S OWN LETTER TO AN AGENT WHOSE CHAIN ENDS AT THEM. The owner IS the first reachable
  // one, so the office makes no copy and the entry is written to the sender.
  await register(AS_THE_OWNER, 'quiet-c', 'Quiet C')
  // THE UNHELD 409: the person's own letter is still stored and routed, and the no-copy entry is what case 3A draws.
  const second = await send(AS_THE_OWNER, 'quiet-c', 'A letter from the owner to their own agent', 409)
  ownersLetter = await theStoredLine(second.id)

  // 3. AN AGENT'S LETTER WHOSE FIRST REACHABLE RUNG IS THE SENDER ITSELF. Sender D is reachable, so
  // the walk stops at it; it is also the sender, so no copy is made and the entry is written to the
  // sender.
  const senderD = await register(AS_THE_OWNER, 'sender-d', 'Sender D')
  await makeReachable(senderD)
  await register(asAgent('sender-d'), 'quiet-e', 'Quiet E')
  const third = await send(asAgent('sender-d'), 'quiet-e', 'A note whose sender is the first one up')
  sendersOwnLetter = await theStoredLine(third.id)
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

// ============================================================ opening the panel

/** The chat panel, on the tab given, with any open conversation closed. */
async function openTheChat(tab: 'contacts' | 'between' = 'contacts', query = ''): Promise<void> {
  await app.page.goto(`${app.site}/${query}#/`)
  await openTheChatFromTheShell(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-tab', { timeout: 20_000 })
  if (tab === 'between') {
    await app.page.click('.px-chat-tab[data-tab="between"]')
    await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"]', { timeout: 20_000 })
  } else {
    await app.page.click('.px-chat-tab[data-tab="contacts"]')
  }
}

/** Open one agent's conversation from the contact list. A contact row is keyed by the registry id. */
async function openTheConversationWith(handle: string, query = ''): Promise<void> {
  await openTheChat('contacts', query)
  const id = idOf.get(handle)
  expect(id, `${handle} was never registered by this file`).toBeTruthy()
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${id}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${id}"]`)
  await app.page.waitForSelector('.px-chat-words', { timeout: 20_000 })
}

/** Open the between-agents view of one pair, waiting for both names to be drawn. */
async function openThePair(first: string, second: string, query = ''): Promise<void> {
  await openTheChat('between', query)
  await app.page.waitForFunction(
    (names: readonly string[]) =>
      [...document.querySelectorAll('.px-chat-contact')].some(
        (row) => names.every((name) => row.textContent?.includes(name) === true),
      ),
    [first, second],
    { timeout: 20_000 },
  )
  await app.page
    .locator('.px-chat-contact')
    .filter({ hasText: first })
    .filter({ hasText: second })
    .first()
    .click()
  await app.page.waitForSelector('.px-chat-side', { timeout: 20_000 })
}

/** The bubble of one message, found by the words it carries. */
function theBubbleCarrying(body: string) {
  return app.page.locator('.px-chat-one').filter({ hasText: body }).first()
}

/**
 * With Developer detail chosen, press the short mark and return the long words it opened.
 *
 * Outside Developer detail the mark is a plain span, so this wait is also what proves the page was
 * opened in the mode the case means.
 */
async function openTheMark(bubble: Locator): Promise<Locator> {
  const mark = bubble.locator('button.px-chat-not-delivered-mark').first()
  await mark.waitFor({ state: 'visible', timeout: 20_000 })
  expect(await mark.getAttribute('aria-expanded'), 'the mark reads as open before it is pressed').toBe('false')
  await mark.click()
  expect(await mark.getAttribute('aria-expanded'), 'the mark did not open').toBe('true')
  const words = bubble.locator('.px-chat-not-delivered-words')
  await words.waitFor({ state: 'visible', timeout: 20_000 })
  return words
}

// ============================================================ the cases

describe('a routed letter says why it is here', () => {
  it('draws the short mark under the words, and Developer detail opens the line word for word', async () => {
    await openThePair(PAIR_ONE[0], PAIR_ONE[1], '?mode=inspect')
    const bubble = theBubbleCarrying('A note nobody can take')
    await bubble.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await bubble.locator('.px-chat-not-delivered').count(), 'the short mark is not drawn').toBe(1)
    expect(await bubble.locator('.px-chat-routed-line').count(), 'the long line is drawn outside Developer detail').toBe(0)
    // UNDER THE WORDS, not above them.
    const markBox = await bubble.locator('.px-chat-not-delivered').boundingBox()
    const wordsBox = await bubble.locator('.px-chat-words').first().boundingBox()
    expect(markBox, 'the mark is not drawn').toBeTruthy()
    expect(wordsBox, 'the words are not drawn').toBeTruthy()
    expect(markBox!.y, 'the mark is not under the words').toBeGreaterThan(wordsBox!.y)
    const words = await openTheMark(bubble)
    const drawn = await words.locator('.px-chat-routed-line').first().textContent()
    expect(drawn, 'the opened words are not the builder’s line').toBe(theRoutedLetter)
    expect(await bubble.locator('.px-chat-not-delivered').count(), 'the mark multiplied when it opened').toBe(1)
  }, 120_000)

  it('draws the same mark and line for a reader outside the between-agents conversation', async () => {
    await openThePair(PAIR_ONE[0], PAIR_ONE[1], '?mode=inspect')
    const bubble = theBubbleCarrying('A note nobody can take')
    await bubble.waitFor({ state: 'visible', timeout: 20_000 })
    // THE VIEWER IS OUTSIDE THIS CONVERSATION, and the line is still true for them because it is
    // written in the third person.
    expect(await bubble.locator('.px-chat-not-delivered').count(), 'the short mark is not drawn').toBe(1)
    const words = await openTheMark(bubble)
    expect(await words.locator('.px-chat-routed-line').first().textContent()).toBe(theRoutedLetter)
  }, 120_000)

  it('draws the owner no-copy line in their own conversation and never for an outside reader', async () => {
    // THE OWNER'S OWN LETTER. The owner is the sender the office wrote the entry to, so their own
    // conversation with the addressee draws its short mark.
    await openTheConversationWith('quiet-c', '?mode=inspect')
    const mine = theBubbleCarrying('A letter from the owner to their own agent')
    await mine.waitFor({ state: 'visible', timeout: 20_000 })
    const mineWords = await openTheMark(mine)
    expect(await mineWords.locator('.px-chat-routed-line').first().textContent()).toBe(ownersLetter)

    // AN AGENT'S LETTER WHOSE ENTRY IS WRITTEN TO THE SENDER, READ FROM OUTSIDE. The viewer is the
    // owner, not the sender, so the sender-only line is not drawn. THE RULE IS ON WHO IS READING,
    // never on the `as=` the conversation was opened with: the owner reading as the sender is still
    // the owner, so neither the mark nor the line is drawn in either reading — with no side at all,
    // and with `as=` naming the sender.
    await openThePair(PAIR_TWO[0], PAIR_TWO[1])

    const inNeitherReading = await theirsIsNotDrawn()
    expect(inNeitherReading, 'the neutral between-agents reading drew the sender-only line').toBe(0)

    await app.page.locator('.px-chat-side').filter({ hasText: PAIR_TWO[0] }).first().click()
    await app.page.waitForSelector('.px-chat-side[data-chosen="yes"]', { timeout: 20_000 })
    const readAsTheSender = await theirsIsNotDrawn()
    expect(readAsTheSender, 'reading as the sender drew the sender-only line for the owner').toBe(0)

    /** The sender-only letter is drawn, and neither a mark nor a routed line is drawn with it. */
    async function theirsIsNotDrawn(): Promise<number> {
      const theirs = theBubbleCarrying('A note whose sender is the first one up')
      await theirs.waitFor({ state: 'visible', timeout: 20_000 })
      expect(await theirs.locator('.px-chat-words').textContent()).toContain('A note whose sender is the first one up')
      expect(sendersOwnLetter).toBeTruthy()
      expect(await theirs.locator('.px-chat-not-delivered').count(), 'a mark is drawn for an entry this reader may not see').toBe(0)
      return theirs.locator('.px-chat-routed-line').count()
    }
  }, 120_000)

  it('draws the line on the message’s own page', async () => {
    await app.page.goto(`${app.site}/#/message/${theRoutedLetterId}`)
    await app.page.waitForSelector('.mp-body', { timeout: 20_000 })
    expect(await app.page.locator('.px-chat-routed-line').first().textContent()).toBe(theRoutedLetter)
    const lineBox = await app.page.locator('.px-chat-routed-line').first().boundingBox()
    const wordsBox = await app.page.locator('.mp-body').first().boundingBox()
    expect(lineBox, 'the routed line is not drawn').toBeTruthy()
    expect(wordsBox, 'the message words are not drawn').toBeTruthy()
    expect(lineBox!.y, 'the routed line is not above the words').toBeLessThan(wordsBox!.y)
  }, 120_000)
})

/**
 * THE LINE, LOOKED AT — chapter 6: four widths and both themes.
 *
 * A long routed line that wraps cleanly at 1440 is where a phone shows the reader something broken.
 * The three screens are photographed at 1440, 990, 660 and 390 in light and dark. The chat screens are
 * opened in Developer detail with the short mark pressed, so the line the person can reach is in the
 * picture; the message's own page draws the line without a press. The case is gated: a suite that is
 * not asked for pictures runs no screenshot.
 *
 * AND THE SENDER'S CONVERSATION AT 1440 IN CHINESE, in both looks, because the routed line is drawn in the page language
 * since problem t_ox8XMOvu7a (check 06uOvyWNB10M asked for these pictures). The line must hold Chinese before it is shot.
 */
describe('the routed line is looked at', () => {
  it.skipIf(!process.env['SF_ROUTING_LINE_SHOTS'])(
    'photographs the three screens at 1440, 990, 660 and 390 in both themes',
    async () => {
      const shots = process.env['SF_ROUTING_LINE_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })

      const photograph = async (name: string): Promise<void> => {
        // THE LINE IS REALLY THERE, so a picture of an empty panel cannot pass for a look at it.
        await app.page.waitForSelector('.px-chat-routed-line', { timeout: 20_000 })
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            await app.page.waitForTimeout(150)
            await app.page.screenshot({ path: `${shots}/${name}-${String(width)}-${theme}.png`, fullPage: false })
          }
        }
      }

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })

      await openTheConversationWith('sender-a', '?mode=inspect')
      await app.page.locator('button.px-chat-not-delivered-mark').first().click()
      await photograph('their-conversation')

      await openThePair(PAIR_ONE[0], PAIR_ONE[1], '?mode=inspect')
      await app.page.locator('button.px-chat-not-delivered-mark').first().click()
      await photograph('between-agents')

      await app.page.goto(`${app.site}/#/message/${theRoutedLetterId}`)
      await app.page.waitForSelector('.mp-body', { timeout: 20_000 })
      await photograph('message-page')

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await openTheConversationWith('sender-a', '?lang=zh&mode=inspect')
      await app.page.locator('button.px-chat-not-delivered-mark').first().click()
      await app.page.waitForSelector('.px-chat-not-delivered-words .px-chat-routed-line', { timeout: 20_000 })
      const drawn = await app.page.locator('.px-chat-not-delivered-words .px-chat-routed-line').first().innerText()
      expect(drawn, 'the routed line on a Chinese page holds no Chinese').toMatch(/[\u4e00-\u9fff]/u)
      for (const theme of ['light', 'dark'] as const) {
        await app.page.emulateMedia({ colorScheme: theme })
        await app.page.waitForTimeout(150)
        await app.page.screenshot({ path: `${shots}/their-conversation-1440-${theme}-zh.png`, fullPage: false })
      }

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
