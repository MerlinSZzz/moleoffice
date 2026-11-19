// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S CHAT WITH AN AGENT DRAWS A SENT REVIEW AS THE PERSON'S MESSAGE, THE SAME AFTER A RELOAD.
 * Problem `eCrK1atZOrvA` (wave 13u round 19), answer `yMYX20nfBuep`.
 *
 * The person found that what they send from the review pane did not show in their chat with the agent.
 * The send now writes one message per recipient, from the person to the agent, holding the numbered
 * comments and every comment's quote. tests/a-sent-review-hands-each-agent-one-message.test.ts holds the
 * records; this file opens the chat in a real browser against a real server and checks that the
 * conversation draws that message on the person's side, with the comments' words and both quotes, and
 * draws it the same way after the page is loaded again.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-chat-draws-a-sent-review-as-the-persons-message.test.ts
 * After a green control, copy src/server/lib/reviews.ts, and in sendReview replace the line that maps
 * each recipient to writeTheMessageTo with `const messages: { id: string; to: string }[] = []`. The send still
 * succeeds and nothing is drawn in the chat, so every case goes red. Then, in src/web/components/Chat.tsx,
 * make the row of a conversation with one contact say `data-mine="no"` for every message: the message is
 * drawn as somebody else's, and the first case goes red. Then, in src/web/components/ContactChooser.tsx, make
 * the row of one contact return null before it draws its button: after its ninety seconds the first case goes
 * red saying the page drew no row for the agent, with the rows its contact list held instead. Then, in
 * src/server/api/participants.ts, make the list door throw when it is asked for the page's shape: after its ninety
 * seconds the first case goes red with the agent's row drawn with no name, the row's key, the page's notice, and
 * every read of the participants the page made, each with its status. Restore each file with cp, check it with cmp,
 * and run the command again for green.
 *
 * THE PICTURES. With `TEST_SHOTS` set, the last case keeps the open conversation on the chat page at 1440,
 * 990, 660 and 390 pixels wide, light and dark, in English. Without it, that case is skipped and the others run.
 * Every name and word here is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'


const HANDLE = 'kiln-notes-agent'
const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT: Record<string, string> = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE }

const TEXT = 'The second shelf was fired for six hours. The glaze on the lid crazed after cooling.'
const QUOTED = 'The glaze on the lid crazed after cooling.'
const FIRST = 'Was the lid on the top shelf or the bottom one?'
const SECOND = 'The table below gives eight hours for the same shelf.'

let app: LiveApp
/** How many messages the send says it wrote. The first case reads it, so that setup itself proves nothing. */
let messagesSent = 0
/**
 * The comments' words in the order the review pane's preview numbers them. Stamps are kept to the second, and two
 * comments written in the same second are put in the order of their ids, so this file reads the order from the
 * preview rather than assuming the order it wrote them in.
 */
let inThePreviewsOrder: string[] = []

async function post(path: string, headers: Record<string, string>, body: unknown, status = 201): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text.slice(0, 300)).toBe(status)
  return JSON.parse(text) as Record<string, unknown>
}

const idOf = (made: Record<string, unknown>, key: string): string => String((made[key] as { id: string }).id)

beforeAll(async () => {
  app = await liveApp({ name: 'chat-sent-review', viewport: { width: 1440, height: 1000 } })
  watchTheParticipantReads()
  await post('/api/agents/started', AS_THE_PERSON, { handle: HANDLE, name: HANDLE, workArea: ['src'] })
  const report = idOf(await post('/api/records', AS_THE_AGENT, {
    kind: 'report',
    title: 'Firing notes for the second shelf',
    data: { for: 'Robin', date: '2026-10-01', blocks: [{ id: 'b-1', type: 'text', text: TEXT }] },
  }), 'record')
  const target = { kind: 'record', recordId: report, workspaceId: 'default' }
  const review = idOf(await post('/api/reviews', AS_THE_PERSON, { entry: { target, place: { at: 'surface' } } }), 'review')
  await post('/api/records', AS_THE_PERSON, {
    kind: 'message', title: 'Which shelf', data: { body: FIRST, target: { target, place: { at: 'quote', words: QUOTED } } },
  })
  await post('/api/records', AS_THE_PERSON, {
    kind: 'message', title: 'Two firing times', data: { body: SECOND, target: { target, place: { at: 'surface' } } },
  })
  await post(`/api/reviews/${review}/finish-collecting`, AS_THE_PERSON, {}, 200)
  const preview = await fetch(`${app.api}/api/reviews/${review}/send`, { headers: AS_THE_PERSON })
  expect(preview.status).toBe(200)
  const previewed = await preview.json() as { messages: { comments: { words: string }[] }[] }
  inThePreviewsOrder = (previewed.messages[0]?.comments ?? []).map((one) => one.words)
  const sent = await post(`/api/reviews/${review}/send`, { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, {}, 200)
  messagesSent = (sent['messages'] as unknown[]).length
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Load the chat page in one theme at one width, and open the agent's conversation. */
async function openTheConversation(width: number, theme: 'light' | 'dark'): Promise<void> {
  const page = app.page
  participantReads.length = 0
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/chat`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // A NARROW CHAT PAGE REOPENS THE LAST CONVERSATION ON ITS OWN and draws no contacts beside it; its back press
  // shows them again, so every width opens the conversation by the same press on the agent's row.
  const back = page.locator('.px-chat-back').first()
  if (await back.isVisible()) await back.click()
  await waitForTheAgentsRow()
  await theAgentsRow().click()
  await page.waitForSelector('.px-chat-write textarea', { timeout: 20_000 })
  await theSentMessage().waitFor({ timeout: 20_000 })
}

/**
 * EVERY READ OF THE PARTICIPANTS THE PAGE MADE since the conversation was last opened, each as its answer's status or
 * as why it failed. The page names a contact from that read, so when the agent's row is drawn with no name, these say
 * whether the read failed, was never made, or answered without the agent.
 */
const participantReads: string[] = []
const isAParticipantsRead = (url: string): boolean => new URL(url).pathname === '/api/participants'

/** Write down each read of the participants the page makes, from here on. */
function watchTheParticipantReads(): void {
  app.page.on('response', (answer) => {
    if (!isAParticipantsRead(answer.url())) return
    const asked = `${new URL(answer.url()).search || 'no query'}: ${String(answer.status())}`
    if (answer.status() !== 200) {
      participantReads.push(asked)
      return
    }
    void answer.json().then(
      (body: { agents?: { handle?: string }[] }) =>
        participantReads.push(`${asked}, ${(body.agents ?? []).some((one) => one.handle === HANDLE) ? 'with' : 'without'} ${HANDLE}`),
      () => participantReads.push(`${asked}, its answer could not be read`),
    )
  })
  app.page.on('requestfailed', (asked) => {
    if (isAParticipantsRead(asked.url())) participantReads.push(`${new URL(asked.url()).search || 'no query'}: failed, ${asked.failure()?.errorText ?? 'no reason given'}`)
  })
}

/** The agent's row in the chat page's list of contacts. */
const theAgentsRow = () => app.page.locator('.px-chat-page-lists .px-chat-contact', { hasText: HANDLE }).first()

/**
 * How long the agent's row may take to be drawn. The page draws its contacts only after its own read of them, and
 * once, in a loaded run, the press's own thirty seconds ran out with nothing saying whether the list was slow or
 * the row was missing.
 */
const ROW_WAIT_MS = 90_000

/** Wait for the agent's row, and when it never comes, fail saying what the page drew in its place. */
async function waitForTheAgentsRow(): Promise<void> {
  try {
    await theAgentsRow().waitFor({ state: 'visible', timeout: ROW_WAIT_MS })
  } catch (error) {
    const lists = await app.page.locator('.px-chat-page-lists').count()
    const rows = await app.page.locator('.px-chat-page-lists .px-chat-contact').allInnerTexts()
    const keys = await app.page.locator('.px-chat-page-lists .px-chat-contact').evaluateAll((all) => all.map((one) => one.getAttribute('data-contact')))
    const notices = await app.page.locator('.px-chat-notice').allInnerTexts()
    throw new Error(
      `The chat page drew no row for ${HANDLE} within ${String(ROW_WAIT_MS / 1000)} seconds. ` +
        `Contact lists on the page: ${String(lists)}. Rows in them: ${String(rows.length)}, reading ${JSON.stringify(rows)}, ` +
        `with the keys ${JSON.stringify(keys)}. Notices on the page: ${JSON.stringify(notices)}. The page's reads of the ` +
        `participants since it was opened: ${participantReads.length === 0 ? 'none' : JSON.stringify(participantReads)}.`,
      { cause: error },
    )
  }
}

/**
 * The row that holds the first comment's words. A comment from the review pane names nobody and is drawn in
 * no conversation, so exactly one row holds these words: the sent message. The first case counts it.
 */
const theSentMessage = () => app.page.locator('.px-chat-one', { hasText: FIRST })

/** What the conversation draws for the sent message: whose side, its words, and its quotes. */
async function whatIsDrawn(): Promise<{ mine: string | null; words: string; quotes: number; quotedAs: string[] }> {
  const one = theSentMessage()
  return {
    mine: await one.getAttribute('data-mine'),
    words: await one.locator('.px-chat-words').innerText(),
    quotes: await one.locator('.px-chat-quote').count(),
    quotedAs: await one.locator('.px-chat-quote', { hasText: QUOTED }).locator('.px-chat-quote-number').allInnerTexts(),
  }
}

describe('the person’s chat with the agent, after a review of two comments is sent', () => {
  it('draws the sent review once, as the person’s, with both comments and their quotes numbered as the preview numbers them', async () => {
    expect(messagesSent).toBe(1)
    await openTheConversation(1440, 'light')
    expect(await theSentMessage().count()).toBe(1)
    const drawn = await whatIsDrawn()
    expect(drawn.mine).toBe('yes')
    expect([...inThePreviewsOrder].sort()).toEqual([FIRST, SECOND].sort())
    const places = inThePreviewsOrder.map((words) => drawn.words.indexOf(words))
    expect(places[0]).toBeGreaterThanOrEqual(0)
    expect(places[0]).toBeLessThan(places[1] ?? -1)
    expect(drawn.quotes).toBe(2)
    // THE QUOTE OF THE WORDS THE FIRST COMMENT WAS LEFT ON CARRIES THAT COMMENT'S NUMBER.
    expect(drawn.quotedAs).toEqual([String(inThePreviewsOrder.indexOf(FIRST) + 1)])
  }, 240_000)

  it('draws it the same way after the page is loaded again', async () => {
    await openTheConversation(1440, 'light')
    const before = await whatIsDrawn()
    await openTheConversation(1440, 'light')
    expect(await theSentMessage().count()).toBe(1)
    expect(await whatIsDrawn()).toEqual(before)
  }, 360_000)

})
