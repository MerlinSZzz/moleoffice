// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN UNDELIVERED MESSAGE CARRIES ONE SHORT MARK, NOT A LONG PARAGRAPH. Round 168 worker mn.
 *
 * The owner's decision: in the chat, under a message whose addressee could not be reached, the two
 * long notes the chat used to draw -- the routed line and the nobody-answering sentence -- are
 * replaced by one short grey mark, "Not delivered". The mark is under the message, not above it.
 * The Cannot reach bar with Start a new agent? stays. With Developer detail chosen, the mark can be
 * pressed and the long words are drawn word for word, from the same builder the chat used before.
 * The stored records are not changed: the mark is drawn from the same `routed` entries and the same
 * conversation reading the long notes were drawn from.
 *
 * WHAT THIS FILE MEASURES, and the mutation that turns each red
 *
 *  1. Normal mode draws exactly one short mark under the person's message, no long routed line, no
 *     long nobody-answering paragraph, and the Cannot reach bar and its press are still there. The
 *     agent's delivered answer carries no mark.
 *     MUTATION (a): NotDeliveredLine not drawn after the main conversation's foot -- case 1 goes red.
 *  2. Developer detail draws the mark as a press. Pressing it draws the routed line and the
 *     nobody-answering sentence, word for word, under the mark.
 *     MUTATION (b): the mark never opens its words -- case 2 goes red.
 *
 * The office is a real server with one registered agent nothing answers as, one sent message that is
 * stored and routed (409 for a person's send, decision `60sbc5I-bwKx`), and one answer from the agent.
 * No message worker runs. Every record here is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CANNOT_REACH_WORDS, theRoutedLineInTheChat, type RoutedAddressee } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asTheAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const HANDLE = 'made-up-quiet-kiln'
const NAME = 'Made-up Quiet Kiln'
const BODY = 'Made-up message: the kiln log I never sent'
const ANSWER = 'Made-up answer: the log is in the shed.'

let agentId = ''
let messageId = ''
/** Every routed line the sender may read, as the chat draws them today. */
let theLongLines: string[] = []
/** The mark's words, read from their key and never copied. */
const THE_MARK = t('chat.notDelivered')
let theWaitingSentence = ''

async function post(path: string, headers: Record<string, string>, body: unknown, status: number): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${path} answered ${String(reply.status)}: ${text}`).toBe(status)
  return JSON.parse(text) as Record<string, unknown>
}

/** The bubble of one message, found by the words it carries. */
function theBubbleCarrying(body: string) {
  return app.page.locator('.px-chat-one').filter({ hasText: body }).first()
}

/** Open the chat and the person's conversation with the quiet agent, from whatever page is current. */
async function openTheConversation(): Promise<void> {
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
  if ((await app.page.locator('.px-chat-words').count()) === 0) {
    const contact = app.page.locator(`.px-chat-contact[data-contact="agent:${agentId}"]`).first()
    await contact.waitFor({ state: 'visible', timeout: 30_000 })
    await contact.click()
  }
  await app.page.waitForSelector('.px-chat-words', { timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'an-undelivered-mark', viewport: { width: 1440, height: 1000 } })

  // THE AGENT NOTHING ANSWERS AS. A registered agent with no session and no run.
  const started = await post('/api/agents/started', AS_THE_PERSON, { handle: HANDLE, name: NAME, runtime: 'claude-code' }, 201)
  agentId = (started['agent'] as { id: string }).id

  // THE PERSON'S MESSAGE. A person's send to an agent nothing is answering as answers 409 and is
  // stored and routed anyway.
  const sent = await post('/api/records', AS_THE_PERSON, {
    kind: 'message',
    title: BODY,
    data: { body: BODY, to: [{ kind: 'agent', id: agentId }] },
  }, 409)
  messageId = (sent['record'] as { id: string }).id
  const routed = (sent['routed'] as RoutedAddressee[] | undefined) ?? []

  // THE STORED ENTRIES, read back through the message door, are what the chat draws its long words from.
  const stored = await fetch(`${app.api}/api/messages/${messageId}`, { headers: AS_THE_PERSON })
  expect(stored.status, await stored.clone().text()).toBe(200)
  const storedRouted = ((await stored.json()) as { message: { routed?: RoutedAddressee[] } }).message.routed ?? []
  expect(storedRouted.length, 'the stored message carries no routed entry').toBeGreaterThan(0)
  expect(storedRouted.map((one) => one.line), 'the reply and the stored message disagree about the routed entry').toEqual(
    routed.map((one) => one.line),
  )
  // THE SENDER IS THE VIEWER HERE, so every entry on the message is one the chat draws.
  theLongLines = storedRouted.map((one) => theRoutedLineInTheChat(one, storedRouted))

  // THE NOBODY-ANSWERING SENTENCE, from the conversation reading the chat used to draw under the message.
  const conversation = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${agentId}`, { headers: AS_THE_PERSON })
  expect(conversation.status, await conversation.clone().text()).toBe(200)
  const talk = (await conversation.json()) as {
    answering: { how: string }
    whatHappensToAWaitingMessage: string | null
  }
  expect(talk.answering.how, 'the fixture does not have nobody answering').toBe('nobody')
  theWaitingSentence = talk.whatHappensToAWaitingMessage ?? ''
  expect(theWaitingSentence, 'the conversation says nothing about the waiting message').not.toBe('')

  // THE ANSWER, so the conversation has a delivered message that must carry no mark.
  await post('/api/records', asTheAgent(HANDLE), {
    kind: 'message',
    title: ANSWER,
    data: { body: ANSWER, to: [{ kind: 'person', id: THE_PERSON }] },
  }, 201)

  await app.page.goto(app.site, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await openTheConversation()
}, 300_000)

afterAll(async () => {
  await app.stop()
})

describe('an undelivered message carries a short mark', () => {
  it('draws one short mark under the message, no long paragraph, and keeps the Start a new agent bar', async () => {
    const bubble = theBubbleCarrying(BODY)
    await bubble.waitFor({ state: 'visible', timeout: 30_000 })

    expect(await bubble.locator('.px-chat-not-delivered').count(), 'the short mark is not drawn under the message').toBe(1)
    expect((await bubble.locator('.px-chat-not-delivered').innerText()).trim()).toBe(THE_MARK)

    // THE LONG WORDS ARE NOT DRAWN IN NORMAL MODE, neither the routed line nor the nobody sentence.
    expect(await app.page.locator('.px-chat-routed-line').count(), 'a long routed line is still drawn').toBe(0)
    expect(await bubble.locator('.px-chat-next').count(), 'the long nobody-answering line is still drawn').toBe(0)
    const said = await app.page.locator('.px-chat-said').innerText()
    for (const line of theLongLines) expect(said, 'the routed line is still drawn').not.toContain(line)
    expect(said, 'the nobody-answering sentence is still drawn').not.toContain(theWaitingSentence)

    // THE BAR AND ITS PRESS STAY.
    const bar = app.page.locator('.px-chat-cannot-reach')
    await bar.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await bar.innerText()).toContain(CANNOT_REACH_WORDS.cannotReach(NAME))
    expect((await bar.locator('.px-start-agent').first().innerText()).trim()).toBe(CANNOT_REACH_WORDS.startANewAgent)

    // THE DELIVERED ANSWER IS NOT A MESSAGE WHOSE ADDRESSEE COULD NOT BE REACHED, so it carries no mark.
    const answer = theBubbleCarrying(ANSWER)
    await answer.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await answer.locator('.px-chat-not-delivered').count(), 'the delivered answer carries a not-delivered mark').toBe(0)
  }, 120_000)

  it('opens the long words word for word when Developer detail is chosen', async () => {
    await app.page.goto(`${app.site}/?mode=inspect`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await openTheConversation()

    const bubble = theBubbleCarrying(BODY)
    await bubble.waitFor({ state: 'visible', timeout: 30_000 })
    const mark = bubble.locator('button.px-chat-not-delivered-mark').first()
    await mark.waitFor({ state: 'visible', timeout: 20_000 })
    expect((await mark.innerText()).trim()).toBe(THE_MARK)
    expect(await mark.getAttribute('aria-expanded'), 'the mark reads as open before it is pressed').toBe('false')

    await mark.click()
    expect(await mark.getAttribute('aria-expanded'), 'the mark did not open').toBe('true')
    const words = bubble.locator('.px-chat-not-delivered-words .px-chat-routed-line')
    await words.first().waitFor({ state: 'visible', timeout: 20_000 })
    expect(await words.allTextContents(), 'the opened words are not the long words, word for word').toEqual([
      ...theLongLines,
      theWaitingSentence,
    ])

    // STILL ONE MARK, and the bar is still there under the opened words.
    expect(await bubble.locator('.px-chat-not-delivered').count(), 'the mark multiplied when it opened').toBe(1)
    await app.page.locator('.px-chat-cannot-reach').waitFor({ state: 'visible', timeout: 20_000 })
  }, 120_000)
})
