// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW HANDS THE AGENT EACH COMMENT ONCE, AND NOTHING BEFORE IT IS SENT.
 *
 * What the owner met, 7 November 2026, in Chrome, on a report page of an office of their own: a comment they added to a
 * review with the right-click box's Add to review went to the agent at once, as a message of its own, and the agent
 * read it in its chat. When the owner sent the review, its message carried that comment again. Until wave 13y round 134, Add
 * to review stored the agent the box showed on the comment whenever the review's recipient was not that agent, and the
 * office reads a recipient stored on a comment as an address, so it was handed over at once.
 *
 * In a real browser against a Mole Office of its own, with made-up agents and no worker to read for them:
 *  1. On a Chinese report page filed by an agent, the review is started with the review column's own press, so it goes
 *     to the page's writer and nobody chose. Five comments are written on it by right-clicking the report's words: four
 *     with Add to review and the fifth with the send key, which does what Add to review does while a review collects.
 *     After each, the agent reads its waiting list, every message it may read and its chat with the person, and none
 *     holds a comment. Then the column's Send sends the review, and each of the three holds each comment exactly once,
 *     in one message.
 *  2. On the chat page, in the person's conversation with another agent, three sentences of the agent's message are
 *     right-clicked: the first gets a comment with Start review, the second with Add to review, and the third with the
 *     send key. Before the review is sent, nothing the agent may read holds a comment, read four times over three
 *     seconds. Then the review column's Send sends it, and the agent is handed each comment once, in one message.
 *
 * Everything here is made up.
 */
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { goKeeping, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
interface Agent {
  name: string
  handle: string
}
/** The report's writer, and the agent of the chat page. */
const WRITER: Agent = { name: 'Made-up Tile Reader', handle: 'made-up-tile-reader' }
const TALKER: Agent = { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper' }
/** The presses' own words, read by their keys, in the language each page is drawn in. */
const zh = createI18n('zh')
const en = createI18n('en')

/** The report's paragraphs, one comment to each. */
const PARAGRAPHS = [
  'The made-up kiln held its heat through the second firing.',
  'The made-up glaze ran at the foot of the third tile.',
  'The made-up shelf cracked along its old line.',
  'The made-up cones bent a little later than last week.',
  'The made-up door seal let a thin line of smoke through.',
]
const ON_THE_REPORT = ['Which firing was the first one?', 'How far did the glaze run?', 'Was the crack there before?', 'Which cone bent last?', 'Where did the smoke come out?']
/** The agent's message on the chat page, one sentence to a paragraph, so each can be right-clicked on its own. */
const SENTENCES = [
  'The made-up wheel slowed at the end of the morning.',
  'The made-up clay was wetter than the last bag.',
  'The made-up trimming tool lost its edge.',
]
const IN_THE_CHAT = ['When did the wheel slow?', 'How much wetter was it?', 'Which tool was it?']

let app: LiveApp
let page: Page
let reportId = ''

async function post(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<string> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.ok, text).toBe(true)
  return (JSON.parse(text) as { record: { id: string } }).record.id
}

async function read<T>(path: string, agent: Agent): Promise<T> {
  const reply = await fetch(app.api + path, { headers: AS(agent.handle) })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  return JSON.parse(text) as T
}

/** The words of every message the agent is handed by its waiting list, as a waiter asks for them. */
async function waitingFor(agent: Agent): Promise<string[]> {
  return (await read<{ messages: { body: string }[] }>('/api/messages?only=waiting-for-me&full=1', agent)).messages.map((one) => one.body)
}

/** The words of every message the agent may read that is addressed to an agent. */
async function everythingSentTo(agent: Agent): Promise<string[]> {
  const all = (await read<{ messages: { body: string; deliveries: { to: { kind: string } }[] }[] }>('/api/messages?full=1', agent)).messages
  return all.filter((one) => one.deliveries.some((d) => d.to.kind === 'agent')).map((one) => one.body)
}

/** The words of every message in the agent's chat with the person, as the agent reads it. */
async function theChatOf(agent: Agent): Promise<string[]> {
  return (await read<{ messages: { body: string }[] }>(`/api/messages/conversation?kind=person&id=${encodeURIComponent(THE_PERSON)}`, agent)).messages.map(
    (one) => one.body,
  )
}

/** How many of these bodies hold each comment's words. */
const timesEach = (comments: readonly string[], bodies: readonly string[]): number[] =>
  comments.map((words) => bodies.filter((body) => body.includes(words)).length)

/** What the agent has been given of these comments: by its waiting list, in all it may read, and in its chat. */
async function given(agent: Agent, comments: readonly string[], withTheChat: boolean): Promise<Record<string, number[]>> {
  return {
    waiting: timesEach(comments, await waitingFor(agent)),
    everything: timesEach(comments, await everythingSentTo(agent)),
    ...(withTheChat ? { chat: timesEach(comments, await theChatOf(agent)) } : {}),
  }
}

/** The same count for every one of the three readings. */
const allOf = (count: number, comments: readonly string[], withTheChat: boolean): Record<string, number[]> => {
  const each = comments.map(() => count)
  return { waiting: each, everything: each, ...(withTheChat ? { chat: each } : {}) }
}

/** Close the comment box if one is open. */
async function closeTheBox(): Promise<void> {
  const close = page.locator('.px-talk .px-talk-close')
  if ((await close.count()) > 0) {
    await close.first().click()
    await page.waitForSelector('.px-talk', { state: 'detached', timeout: 10_000 })
  }
}

/** The box is open and its presses are drawn; it shows the agent under To. */
async function theBoxIsReady(agent: Agent): Promise<void> {
  const talk = page.locator('.px-talk')
  await talk.waitFor({ timeout: 20_000 })
  await page.waitForSelector('.px-talk .px-talk-do:not([aria-busy="true"])', { timeout: 30_000 })
  // THE BOX CHOOSES THE AGENT WHEN IT HAS READ WHO IS HERE, a moment after it opens.
  await talk.locator('.px-talk-to-btn', { hasText: agent.name }).waitFor({ timeout: 15_000 }).catch(() => undefined)
  expect(await talk.locator('.px-talk-to-btn').innerText(), 'the box does not show the agent under To').toContain(agent.name)
}

/** Write the comment and press `press`, or the send key when `press` is null, and wait for the box's answer. */
async function writeAndPress(words: string, press: string | null): Promise<void> {
  const talk = page.locator('.px-talk')
  await talk.locator('textarea').first().fill(words)
  if (press === null) await page.keyboard.press('Shift+Enter')
  else await talk.getByRole('button', { name: press, exact: true }).click()
  await page.waitForSelector('.px-talk-said', { timeout: 15_000 })
}

/** Select words of one paragraph of the report and right-click them. */
async function rightClickTheReport(block: string): Promise<void> {
  await closeTheBox()
  const run = `[data-text-field="data.blocks[#${block}].text"]`
  await page.locator(run).waitFor({ timeout: 30_000 })
  const at = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 20)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await page.mouse.click(at.x, at.y, { button: 'right' })
}

/** Right-click one sentence of the agent's message on the chat page. */
async function rightClickTheChat(sentence: string): Promise<void> {
  await closeTheBox()
  const words = page.locator('.px-chat-said .px-chat-bubble').locator('p', { hasText: sentence }).first()
  await words.waitFor({ timeout: 30_000 })
  await words.scrollIntoViewIfNeeded()
  await words.click({ button: 'right' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-review-sends-each-comment-once', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  // THE COLUMN'S SEND IS THE PERSON'S ACT, and the review door asks for the person's proof.
  await page.setExtraHTTPHeaders(thePersonsKeyHeader(join(app.dir, 'keys.json')))
  for (const agent of [WRITER, TALKER]) {
    await post('/api/records', { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })
  }
  reportId = await post(
    '/api/records',
    {
      kind: 'report',
      title: 'Made-up report: the second firing',
      data: { blocks: PARAGRAPHS.map((text, n) => ({ id: `b-${String(n + 1)}`, type: 'text', heading: `Made-up part ${String(n + 1)}`, text })) },
    },
    AS(WRITER.handle),
  )
  await post(
    '/api/records',
    { kind: 'message', title: 'Made-up wheel notes', data: { body: SENTENCES.join('\n\n'), to: [{ kind: 'person', id: THE_PERSON }] } },
    AS(TALKER.handle),
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a review on a Chinese report page, started from the column, with five comments from the right-click box', () => {
  let reviewId = ''

  it('hands the agent none of the comments while it collects, though the agent reads its chat after each', async () => {
    await goKeeping(page, `${app.site}/?lang=zh#/r/${reportId}`)
    await waitForThePage(page, 60_000)
    await page.locator('[data-text-field="data.blocks[#b-1].text"]').waitFor({ timeout: 30_000 })
    // THE COLUMN'S OWN START, so the review goes to the page's writer and nobody chose a recipient for it.
    await page.click('.px-review-switch')
    const started = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/reviews' && r.request().method() === 'POST')
    await page.locator('.px-pane').getByRole('button', { name: zh.t('review.pane.start'), exact: true }).click()
    reviewId = ((await (await started).json()) as { review: { id: string } }).review.id

    for (const [n, words] of ON_THE_REPORT.entries()) {
      await rightClickTheReport(`b-${String(n + 1)}`)
      await theBoxIsReady(WRITER)
      await page.locator('.px-talk').getByRole('button', { name: zh.t('talk.addToReview'), exact: true }).waitFor({ timeout: 30_000 })
      await writeAndPress(words, n === ON_THE_REPORT.length - 1 ? null : zh.t('talk.addToReview'))
      expect(await given(WRITER, ON_THE_REPORT, true), `the agent was given a comment of a review not sent, after comment ${String(n + 1)}`).toEqual(
        allOf(0, ON_THE_REPORT, true),
      )
    }
    // FOUR READS OVER THREE SECONDS, so a hand-over that comes a moment after the write is seen.
    for (let again = 0; again < 4; again++) {
      await page.waitForTimeout(1_000)
      expect(await given(WRITER, ON_THE_REPORT, true), 'the agent was given a comment of a review not sent').toEqual(allOf(0, ON_THE_REPORT, true))
    }
  }, 300_000)

  it('hands the agent each comment once, in one message, when the column sends the review', async () => {
    await closeTheBox()
    const sent = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/reviews/${reviewId}/send` && r.request().method() === 'POST')
    // THE TRAY'S OWN SEND REVIEW (wave 13y round 146, item 73a), once its row says it holds every comment on the
    // report. Send N at the foot of the list is not drawn in the tray.
    const row = page.locator('[data-part="your-review"] [data-part="your-review-bar"]')
    await expect
      .poll(async () => (await row.locator('.px-b-bar-says').textContent()) ?? '', { timeout: 30_000 })
      .toContain(zh.t('review.b.comments', { n: ON_THE_REPORT.length }))
    await row.getByRole('button', { name: zh.t('review.tray.send'), exact: true }).click()
    const answered = await sent
    expect(answered.status(), await answered.text()).toBe(200)
    await expect.poll(async () => (await given(WRITER, ON_THE_REPORT, true)).waiting, { timeout: 20_000 }).toEqual(allOf(1, ON_THE_REPORT, false).waiting)
    expect(await given(WRITER, ON_THE_REPORT, true), 'the agent was given a comment twice').toEqual(allOf(1, ON_THE_REPORT, true))
    const carrying = (await waitingFor(WRITER)).filter((body) => ON_THE_REPORT.some((words) => body.includes(words)))
    expect(carrying, 'the comments came in more than one message').toHaveLength(1)
  }, 120_000)
})

describe('a review on the chat page, with the agent shown under To', () => {
  it('hands the agent none of its comments while it collects', async () => {
    await goKeeping(page, `${app.site}/?lang=en#/chat`)
    await waitForThePage(page, 60_000)
    const contact = page.locator(`.px-chat-contact:has(.px-chat-name:text-is("${TALKER.name}"))`)
    if (!(await contact.isVisible())) {
      const back = page.locator('.px-chat-back')
      if (await back.isVisible()) await back.click()
    }
    await contact.first().click()

    const presses = [en.t('talk.startReview'), en.t('talk.addToReview'), null]
    for (const [n, words] of IN_THE_CHAT.entries()) {
      await rightClickTheChat(SENTENCES[n]!)
      await theBoxIsReady(TALKER)
      await page.locator('.px-talk').getByRole('button', { name: presses[n] ?? en.t('talk.addToReview'), exact: true }).waitFor({ timeout: 30_000 })
      await writeAndPress(words, presses[n]!)
    }
    // FOUR READS OVER THREE SECONDS, so a hand-over that comes a moment after the write is seen.
    for (let again = 0; again < 4; again++) {
      if (again > 0) await page.waitForTimeout(1_000)
      expect(await given(TALKER, IN_THE_CHAT, true), 'the agent was given a comment of a review not sent').toEqual(allOf(0, IN_THE_CHAT, true))
    }
  }, 240_000)

  it('hands the agent each comment once, in one message, when the review column sends it', async () => {
    await closeTheBox()
    const column = page.locator('section.px-b')
    await column.waitFor({ timeout: 20_000 })
    // THE TRAY'S LIST IS SHUT AT FIRST, and its Send review is on its row, once the row says it holds every comment in
    // the chat (wave 13y round 146, item 73a). Send N at the foot of the list is not drawn in the tray.
    await setTheReviewTraysList(page, 'open')
    await column.locator('.px-b-head').waitFor({ timeout: 20_000 })
    const row = column.locator('[data-part="your-review-bar"]')
    await expect
      .poll(async () => (await row.locator('.px-b-bar-says').textContent()) ?? '', { timeout: 30_000 })
      .toContain(en.t('review.b.comments', { n: IN_THE_CHAT.length }))
    await row.getByRole('button', { name: en.t('review.tray.send'), exact: true }).click()
    await expect.poll(async () => (await given(TALKER, IN_THE_CHAT, true)).waiting, { timeout: 20_000 }).toEqual(allOf(1, IN_THE_CHAT, false).waiting)
    expect(await given(TALKER, IN_THE_CHAT, true), 'the agent was given a comment twice').toEqual(allOf(1, IN_THE_CHAT, true))
    const carrying = (await waitingFor(TALKER)).filter((body) => IN_THE_CHAT.some((words) => body.includes(words)))
    expect(carrying, 'the comments came in more than one message').toHaveLength(1)
  }, 240_000)
})
