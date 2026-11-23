// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT SENT WITH SEND IS SENT, EVEN BEFORE ITS AGENT HAS READ IT.
 *
 * What was wrong, on the chat page, 7 November 2026: while a review collected, a comment written with the box's Send
 * went to the agent at once, as Send says, and the chat still drew it *Not sent yet* until the agent read it. The bar
 * counted it among the comments not sent, and its press then sent nothing at all, because that comment is in no
 * review: it said the comments had changed and read the conversation again, every time.
 *
 * In a real browser against a Mole Office of its own, with a made-up agent and no worker to read for it, this file
 * opens the person's conversation with the agent on the chat page and right-clicks two sentences of the agent's
 * message:
 *  1. the first gets a comment with Start review, which starts a review and sends nothing. The agent is then chosen as
 *     its recipient, with the write the review column's Choose a recipient makes, so it is drawn in this conversation
 *     and still held by the review;
 *  2. the second gets a comment with Send, which goes to the agent at once.
 * The agent has read neither, so both deliveries are still waiting. Then, in a new tab of the same browser:
 *  - the second is not *Not sent yet*: not on its row, not in the bar's count, and not in the message's own reading,
 *    which gives it the time until which its words may change, as every message that has gone out has;
 *  - the first is *Not sent yet*, on its row, in the bar's count of one and in its reading, as before;
 *  - the bar's press sends the review: the agent is handed the first comment once, and the second still only once.
 *
 * Everything here is made up.
 */
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { goKeeping, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const AGENT = { name: 'Made-up Loom Keeper', handle: 'made-up-loom-keeper' }
/** The presses' own words, read by their keys. */
const en = createI18n('en')
const START = en.t('talk.startReview')
const SEND = en.t('talk.send')

/** The agent's message, one sentence to a paragraph, so each can be right-clicked on its own. */
const SENTENCES = ['The made-up loom dropped a thread at the third row.', 'The made-up warp was wound too tight on the left.']
/** The comment the review holds, and the comment Send sent. */
const HELD = 'Which row was the first to drop?'
const SENT = 'How tight is too tight for this warp?'

interface Reading {
  id: string
  body: string
  notSentYet: boolean
  wordsMayChangeUntil: string | null
  deliveries: { to: { kind: string }; mark: string }[]
}

let app: LiveApp
let page: Page
let aNewTab: Page | null = null

async function post(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<string> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.ok, text).toBe(true)
  return (JSON.parse(text) as { record: { id: string } }).record.id
}

/** The person's own comment with these words, read by its own door, as the chat's message page reads it. */
async function theComment(words: string): Promise<Reading> {
  const all = await fetch(`${app.api}/api/messages?full=1`, { headers: PERSON })
  const text = await all.text()
  expect(all.status, text).toBe(200)
  const found = (JSON.parse(text) as { messages: { id: string; body: string }[] }).messages.filter((one) => one.body === words)
  expect(found, `the person's messages hold "${words}" ${String(found.length)} times`).toHaveLength(1)
  const reply = await fetch(`${app.api}/api/messages/${found[0]!.id}`, { headers: PERSON })
  const one = await reply.text()
  expect(reply.status, one).toBe(200)
  return (JSON.parse(one) as { message: Reading }).message
}

/** How many messages the agent's waiting list hands it with these words, as a waiter asks for them. */
async function timesTheAgentIsHanded(words: string): Promise<number> {
  const reply = await fetch(`${app.api}/api/messages?only=waiting-for-me&full=1`, { headers: AS(AGENT.handle) })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  return (JSON.parse(text) as { messages: { body: string }[] }).messages.filter((one) => one.body.includes(words)).length
}

/** Right-click one sentence of the agent's message, write a comment in the box and press one of its presses. */
async function comment(sentence: string, words: string, press: string): Promise<void> {
  const said = page.locator('.px-chat-said .px-chat-bubble').locator('p', { hasText: sentence }).first()
  await said.waitFor({ timeout: 30_000 })
  await said.scrollIntoViewIfNeeded()
  await said.click({ button: 'right' })
  const talk = page.locator('.px-talk')
  await talk.waitFor({ timeout: 15_000 })
  await page.waitForSelector('.px-talk .px-talk-do:not([aria-busy="true"])', { timeout: 15_000 })
  // THE BOX CHOOSES THE AGENT WHEN IT HAS READ WHO IS HERE, a moment after it opens.
  await talk.locator('.px-talk-to-btn', { hasText: AGENT.name }).waitFor({ timeout: 15_000 }).catch(() => undefined)
  expect(await talk.locator('.px-talk-to-btn').innerText(), 'the box does not show the agent under To').toContain(AGENT.name)
  await talk.locator('textarea').first().fill(words)
  const answered =
    press === SEND
      ? page.waitForResponse((one) => new URL(one.url()).pathname === '/api/records' && one.request().method() === 'POST')
      : null
  await talk.getByRole('button', { name: press, exact: true }).click()
  if (answered === null) {
    await page.waitForSelector('.px-talk-said', { timeout: 15_000 })
  } else {
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect((await answered).status()).toBe(409)
    // THE BOX DRAWS THE ROUTED LINE IN PLACE OF "SENT", because the letter is stored and the agent is not there.
    await talk.locator('.px-error').waitFor({ timeout: 15_000 })
  }
  await talk.locator('.px-talk-close').first().click()
  await page.waitForSelector('.px-talk', { state: 'detached', timeout: 10_000 })
}

/** Open the chat page on the person's conversation with the agent. */
async function openTheConversation(): Promise<void> {
  await goKeeping(page, `${app.site}/?lang=en#/chat`)
  await waitForThePage(page, 60_000)
  const contact = page.locator(`.px-chat-contact:has(.px-chat-name:text-is("${AGENT.name}"))`)
  if (!(await contact.isVisible())) {
    const back = page.locator('.px-chat-back')
    if (await back.isVisible()) await back.click()
  }
  await contact.first().click()
}

/** The chat's row that shows these words. */
const theRow = (words: string) => page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: words }) })

beforeAll(async () => {
  app = await liveApp({ name: 'a-comment-sent-with-send-is-not-drawn-as-not-sent', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  // THE BAR'S PRESS SENDS A REVIEW, which is the person's act, and the review door asks for the person's proof.
  await page.setExtraHTTPHeaders(thePersonsKeyHeader(join(app.dir, 'keys.json')))
  const agentRecord = await post('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } })
  await post(
    '/api/records',
    { kind: 'message', title: 'Made-up loom notes', data: { body: SENTENCES.join('\n\n'), to: [{ kind: 'person', id: THE_PERSON }] } },
    AS(AGENT.handle),
  )
  await openTheConversation()
  await comment(SENTENCES[0]!, HELD, START)
  // THE AGENT IS CHOSEN FOR THE REVIEW'S COMMENT with the write `api.chooseWhoItIsFor` makes for the column's press.
  const chosen = await fetch(`${app.api}/api/records/${(await theComment(HELD)).id}`, {
    method: 'PATCH',
    headers: PERSON,
    body: JSON.stringify({ dataPatch: { chosenRecipient: { kind: 'agent', agentId: agentRecord } } }),
  })
  expect(chosen.status, await chosen.text()).toBe(200)
  await comment(SENTENCES[1]!, SENT, SEND)
  // THE ROWS ARE DRAWN IN A NEW TAB OF THE SAME BROWSER, whose first read of the conversation is its newest page, and
  // which keeps the same review open. The review's comment joined this conversation when the agent was chosen for it,
  // and the tab that wrote both comments then asks only for messages newer than the newest one it holds, which leaves
  // that comment out.
  aNewTab = await page.context().newPage()
  page = aNewTab
  await page.setExtraHTTPHeaders(thePersonsKeyHeader(join(app.dir, 'keys.json')))
  await openTheConversation()
}, 240_000)

afterAll(async () => {
  await aNewTab?.close()
  await app?.stop()
}, 60_000)

describe('a comment sent with Send while a review collects, which its agent has not read', () => {
  it('is waiting for the agent, which is what this file is about', async () => {
    const sent = await theComment(SENT)
    expect(sent.deliveries.map((row) => [row.to.kind, row.mark]), 'the comment sent with Send is not waiting for the agent').toEqual([['agent', 'queued']])
    expect(await timesTheAgentIsHanded(SENT), 'the agent is not handed the comment sent with Send').toBe(1)
  })

  it('is read as sent, with the time its words may change until, as every message that went out is', async () => {
    const sent = await theComment(SENT)
    expect(sent.notSentYet, 'a comment sent with Send is read as not sent').toBe(false)
    expect(sent.wordsMayChangeUntil, 'a comment sent with Send is given no edit window').not.toBeNull()
  })

  it('carries no "Not sent yet" on its row in the chat', async () => {
    await theRow(SENT).first().waitFor({ timeout: 20_000 })
    // THE TALK IS READ AGAIN ON A BEAT, so the row is asked over a few seconds rather than once.
    await expect.poll(async () => theRow(SENT).locator('.px-chat-unsent').count(), { timeout: 10_000 }).toBe(0)
    await page.waitForTimeout(2_000)
    expect(await theRow(SENT).locator('.px-chat-unsent').count(), 'the comment sent with Send is drawn "Not sent yet"').toBe(0)
  })
})

describe('the review’s comment, which nobody has sent and the agent is chosen for', () => {
  it('is still read as not sent, with no edit window, and the agent is not handed it', async () => {
    const held = await theComment(HELD)
    expect(held.deliveries.map((row) => [row.to.kind, row.mark]), 'the review’s comment is not addressed to the agent').toEqual([['agent', 'queued']])
    expect(held.notSentYet, 'the review’s comment is read as sent').toBe(true)
    expect(held.wordsMayChangeUntil, 'the review’s comment is given an edit window').toBeNull()
    expect(await timesTheAgentIsHanded(HELD), 'the agent is handed a comment of a review not sent').toBe(0)
  })

  it('is still drawn "Not sent yet" on its row', async () => {
    await theRow(HELD).locator('.px-chat-unsent').first().waitFor({ timeout: 20_000 })
    expect(await theRow(HELD).locator('.px-chat-unsent').innerText()).toBe(CHAT_WORDS.notSentYet)
  })
})

describe('the chat’s bar', () => {
  it('counts the review’s comment alone', async () => {
    const count = page.locator('.px-chat-unsent-bar .px-chat-unsent-count')
    await count.waitFor({ timeout: 20_000 })
    expect(await count.innerText(), 'the bar counts a comment that was sent').toBe(CHAT_WORDS.unsentHere(1))
  })

  it('sends the review, so the agent is handed the review’s comment once and the comment sent with Send still once', async () => {
    const bar = page.locator('.px-chat-unsent-bar')
    await bar.locator('.px-chat-send').click()
    // A REVIEW STILL COLLECTING IS FINISHED FIRST, and the bar asks before it does that.
    const finish = bar.locator('.px-chat-send', { hasText: en.t('chat.finishCollecting') })
    await finish.waitFor({ timeout: 15_000 })
    await finish.click()
    await expect.poll(async () => timesTheAgentIsHanded(HELD), { timeout: 20_000 }).toBe(1)
    expect(await page.getByText(en.t('review.b.changedNothingSent')).count(), 'the bar said nothing was sent').toBe(0)
    expect(await timesTheAgentIsHanded(SENT), 'the comment sent with Send is handed to the agent again').toBe(1)
    await expect.poll(async () => page.locator('.px-chat-unsent-bar').count(), { timeout: 20_000 }).toBe(0)
  }, 120_000)
})
