// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE THAT JOINS A CONVERSATION LATE IS DRAWN IN THE CHAT. Problem 0g59cBc-8Q6D, found by 13r's tests of the
 * review on 7 November 2026, and taken by wave 13y in round 145.
 *
 * A comment written during a review is addressed to nobody until its recipient is chosen, by a later
 * `PATCH /api/records/:id {"dataPatch":{"chosenRecipient":…}}`. That PATCH writes the delivery row then, and the comment
 * joins the conversation with that agent in the place its stamp gives it: before the lines written after it. The chat
 * keeps what it has read of a conversation and asks only for what came after the newest line it holds, with what
 * changed among the older ones (src/web/lib/conversationpages.ts). The comment is among the changed ones, but the chat
 * did not hold it, so it put nothing in its place and the comment was never drawn.
 *
 * What is proved here, in a test office of its own and in a real browser (cases 1 and 2), and without either (case 3):
 *
 *   1. The person's comment is saved for nobody, and then the agent and the person each write a line. The chat is
 *      opened on the agent's conversation and draws the two lines. The comment's recipient is then chosen, and the
 *      agent writes a third line. The chat draws the third line from its event, and then reads what came after what
 *      it holds, which is a read made after the choice. Within ten seconds it must draw the comment too, before the
 *      first line.
 *   2. The chat keeps what it drew for the next load (src/web/lib/pagecache.ts, in the browser's IndexedDB). Once
 *      that copy holds the third line, the page is reloaded. The chat starts from the copy and reads only what came
 *      after it, and it must draw the same four in the same order, as a fresh read of the newest page holds them.
 *   3. THE CHAT'S RULE (`aMessageJoinedTheHeldOnes` in src/web/lib/conversationpages.ts): a reply that carries on
 *      from what is held and names a changed message not held makes the chat read the newest page again. Which
 *      changed messages are among the held ones is the server's to say, since round 146: while older ones remain,
 *      the chat names the oldest one held, and the server names only the changed ones from it on
 *      (tests/a-conversation-is-read-one-page-at-a-time.test.ts). So a changed message stamped before the oldest held
 *      is not named, and the chat does not judge stamps.
 *
 * Set W13Y_LATE_MESSAGE_SHOTS to a folder outside the checkout to photograph the chat in case 1, once the third line is
 * drawn, at 1440, 990, 660 and 390, in the light look and the dark look. The pictures are taken before the order is
 * judged, so the same run on the old code shows the comment missing: the first line is at the top of the list. The test
 * office holds no real office data, and each picture says so above the page, or at 390, where the chat covers the page,
 * in the chat above the agent's name. The words under each line that name the machine it was written from are blurred,
 * because they name the test machine.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Dialog } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ConversationReply, PoolEntry } from '../src/web/api.ts'
import { aMessageJoinedTheHeldOnes, afterANewerRead } from '../src/web/lib/conversationpages.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const shots = process.env['W13Y_LATE_MESSAGE_SHOTS']
const LABEL = 'Made-up data — an invented office, not real office data'
const WIDTHS = [1440, 990, 660, 390] as const
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const HANDLE = 'late-comment-reader'
const AS_THE_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE }

const THE_COMMENT = 'Made-up comment: the second table repeats the first.'
const FIRST_LINE = 'Made-up line: I have read the page.'
const SECOND_LINE = 'Made-up line: thank you, I will look at the tables.'
const THIRD_LINE = 'Made-up line: both tables are fixed now.'

/** The agent's record id, which a choice names, and its registry id, which its conversation and contact row name. */
let agentRecordId = ''
let agentId = ''
/** The ids of the comment and of the three lines, in the order the conversation holds them once the comment joins. */
let commentId = ''
let firstId = ''
let secondId = ''
let thirdId = ''

async function file(headers: Record<string, string>, kind: string, title: string, data: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(made.status, await made.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** The ids of the newest page of the conversation, as the door gives them to the person. */
async function theNewestPage(): Promise<string[]> {
  const read = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}&limit=50`, { headers: AS_THE_PERSON })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { messages: { id: string }[] }).messages.map((one) => one.id)
}

/** The row the open conversation draws for this message: each row names its own record in `data-target`. */
const row = (id: string): string => `.px-chat-said li[data-target^="record/${id}/"]`

/** The messages the open conversation draws, by id, in the order drawn, among the four this file wrote. */
async function theDrawnOnes(): Promise<string[]> {
  const ours = new Set([commentId, firstId, secondId, thirdId])
  const drawn = await app.page.$$eval('.px-chat-said li[data-target^="record/"]', (all) => all.map((one) => (one.getAttribute('data-target') ?? '').split('/')[1] ?? ''))
  return drawn.filter((id) => ours.has(id))
}

/** Open the chat on the conversation with the agent, wherever the panel opens to. */
async function openTheConversation(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  // THE PANEL REMEMBERS WHICH CONTACT WAS OPEN, so after a reload it may come back straight into the conversation.
  if ((await app.page.$(row(firstId))) === null) {
    await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agentId}"]`, { timeout: 20_000 })
    await app.page.click(`.px-chat-contact[data-contact="agent:${agentId}"]`)
  }
  await app.page.waitForSelector(row(firstId), { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-late-message-is-drawn', viewport: { width: 1440, height: 1000 } })
  if (shots !== undefined) mkdirSync(shots, { recursive: true })
  agentRecordId = await file(AS_THE_PERSON, 'agent', 'Late comment reader', { handle: HANDLE, runtime: 'claude-code', state: 'active' })
  const registry = await fetch(`${app.api}/api/participants/agent/${HANDLE}`, { headers: AS_THE_PERSON })
  expect(registry.status, await registry.clone().text()).toBe(200)
  agentId = ((await registry.json()) as { participant: { id: string } }).participant.id
  const page = await file(AS_THE_PERSON, 'note', 'A made-up page to review', { body: 'Made-up: two tables.' })
  commentId = await file(AS_THE_PERSON, 'message', THE_COMMENT, {
    body: THE_COMMENT,
    target: { target: { kind: 'record', recordId: page, workspaceId: 'default' }, place: { at: 'surface' } },
  })
  firstId = await file(AS_THE_AGENT, 'message', FIRST_LINE, { body: FIRST_LINE, to: [{ kind: 'person', id: THE_PERSON }] })
  secondId = await file(AS_THE_PERSON, 'message', SECOND_LINE, { body: SECOND_LINE, to: [{ kind: 'agent', id: agentId }] })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it('draws a comment whose recipient is chosen after newer lines are drawn, in its place before them: the chat drew only the newer lines', async () => {
  // THE CONTROL: before the choice the comment is in no conversation, and the chat draws the two lines.
  expect(await theNewestPage(), 'the conversation before the comment has a recipient').toEqual([firstId, secondId])
  await openTheConversation()
  await app.page.waitForSelector(row(secondId), { timeout: 20_000 })
  expect(await theDrawnOnes(), 'what the chat draws before the comment has a recipient').toEqual([firstId, secondId])

  const chosen = await fetch(`${app.api}/api/records/${commentId}`, {
    method: 'PATCH',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ dataPatch: { chosenRecipient: { kind: 'agent', agentId: agentRecordId } } }),
  })
  expect(chosen.status, await chosen.clone().text()).toBe(200)
  expect(await theNewestPage(), 'the conversation once the comment has a recipient').toEqual([commentId, firstId, secondId])

  // THE THIRD LINE IS DRAWN FROM ITS EVENT, and the chat then reads what came after what it holds, a read made after
  // the choice. So the chat is given ten seconds to draw the comment; the old code never drew it.
  thirdId = await file(AS_THE_AGENT, 'message', THIRD_LINE, { body: THIRD_LINE, to: [{ kind: 'person', id: THE_PERSON }] })
  await app.page.waitForSelector(row(thirdId), { timeout: 30_000 })
  let drawn = await theDrawnOnes()
  for (const until = Date.now() + 10_000; drawn.length < 4 && Date.now() < until; drawn = await theDrawnOnes()) await app.page.waitForTimeout(250)
  if (shots !== undefined) await photographTheConversation(shots)
  expect(drawn, 'what the chat draws once the comment has a recipient and a newer line came').toEqual([commentId, firstId, secondId, thirdId])
}, 240_000)

it('draws the comment in the same place after a reload, as the newest page holds it', async () => {
  expect(thirdId, 'the case before wrote the third line').not.toBe('')
  expect(await theNewestPage(), 'the newest page of the conversation').toEqual([commentId, firstId, secondId, thirdId])
  // THE RELOAD STARTS FROM THE COPY, which is written 400 ms after a change, so it is waited for.
  await expect.poll(() => theKeptCopyHolds(thirdId), { message: 'the copy the chat kept for the next load holds the third line', timeout: 10_000 }).toBe(true)
  // THE REVIEW BAR ASKS BEFORE THE PAGE IS LEFT while a comment is unsent, and Playwright's own answer is to stay, which
  // keeps the page and what the chat holds. So this answers that the page may be left, as a person reloading would,
  // and checks that the page was loaded again.
  await app.page.evaluate(() => Object.assign(window, { beforeTheReload: true }))
  const leave = (dialog: Dialog): void => {
    if (dialog.type() === 'beforeunload') void dialog.accept()
  }
  app.page.on('dialog', leave)
  await app.page.reload()
  app.page.off('dialog', leave)
  expect(await app.page.evaluate(() => 'beforeTheReload' in window), 'the page was loaded again').toBe(false)
  await openTheConversation()
  await app.page.waitForSelector(row(thirdId), { timeout: 20_000 })
  expect(await theDrawnOnes(), 'what the chat draws after a reload').toEqual([commentId, firstId, secondId, thirdId])
}, 120_000)

it('reads the newest page again for a changed message not held only when it joined among the held ones, without a browser', () => {
  const at = (second: number): string => `2026-11-07 12:00:${String(second).padStart(2, '0')}`
  const entry = (id: string, second: number): PoolEntry => ({ id, sentAt: at(second), deliveries: [] }) as unknown as PoolEntry
  const reply = (messages: PoolEntry[], over: Partial<NonNullable<ConversationReply['page']>> = {}): ConversationReply =>
    ({
      me: { kind: 'person', id: THE_PERSON },
      them: { kind: 'agent', id: 'x' },
      messages,
      markedDelivered: [],
      answering: null,
      couldNotTell: null,
      workspaceId: 'default',
      page: { olderRemain: true, continuesFromTheCursor: null, readAt: at(10), changed: [], gone: [], ...over },
    }) as unknown as ConversationReply
  // WHAT IS HELD: two messages stamped at seconds 5 and 7, with or without older ones left unread.
  const held = (olderRemain: boolean) => afterANewerRead(null, reply([entry('b', 5), entry('c', 7)], { olderRemain }))
  const carriesOn = (...changed: PoolEntry[]): ConversationReply => reply([], { continuesFromTheCursor: true, changed })
  const judged = {
    'nothing held': aMessageJoinedTheHeldOnes(null, carriesOn(entry('a', 1))),
    'the newest page, which replaces what is held': aMessageJoinedTheHeldOnes(held(false), reply([entry('a', 1)], { changed: [entry('a', 1)] })),
    'a held message changed': aMessageJoinedTheHeldOnes(held(true), carriesOn(entry('b', 5))),
    'one not held, stamped among the held ones': aMessageJoinedTheHeldOnes(held(true), carriesOn(entry('x', 6))),
    'one not held, stamped in the second of the oldest held': aMessageJoinedTheHeldOnes(held(true), carriesOn(entry('x', 5))),
    'one not held, stamped before the oldest held, with nothing older': aMessageJoinedTheHeldOnes(held(false), carriesOn(entry('a', 1))),
    'one not held, with older ones left, whatever its stamp: the server names only those from the oldest held on':
      aMessageJoinedTheHeldOnes(held(true), carriesOn(entry('a', 1))),
  }
  expect(judged, 'whether the chat reads the newest page again').toEqual({
    'nothing held': false,
    'the newest page, which replaces what is held': false,
    'a held message changed': false,
    'one not held, stamped among the held ones': true,
    'one not held, stamped in the second of the oldest held': true,
    'one not held, stamped before the oldest held, with nothing older': true,
    'one not held, with older ones left, whatever its stamp: the server names only those from the oldest held on': true,
  })
})

/** Whether the copy the chat keeps for the next load (`chat.held` in the page cache) holds this message. */
async function theKeptCopyHolds(id: string): Promise<boolean> {
  return app.page.evaluate(
    async (wanted) =>
      new Promise<boolean>((resolve) => {
        const opened = indexedDB.open('mole-office-page-cache')
        opened.onerror = () => resolve(false)
        opened.onsuccess = () => {
          const db = opened.result
          if (!db.objectStoreNames.contains('answers')) {
            db.close()
            resolve(false)
            return
          }
          const all = db.transaction('answers', 'readonly').objectStore('answers').getAll()
          all.onsuccess = () => {
            db.close()
            const kept = all.result as { key: string; value: unknown }[]
            resolve(kept.some((one) => one.key.split('\n')[2] === 'chat.held' && JSON.stringify(one.value).includes(wanted)))
          }
          all.onerror = () => {
            db.close()
            resolve(false)
          }
        }
      }),
    id,
  )
}

/**
 * Photograph the open conversation at the four widths in the light look and then the dark look, without reading it
 * again: the look is switched by the sidebar's look buttons, as a person would, at 1440 where the sidebar is drawn.
 */
async function photographTheConversation(folder: string): Promise<void> {
  // EACH LINE SAYS WHICH MACHINE IT WAS WRITTEN FROM, and that is the test machine's name, so it is blurred.
  await app.page.addStyleTag({ content: '.px-chat-from { filter: blur(5px); }' })
  for (const [index, look] of (['light', 'dark'] as const).entries()) {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.locator('.sbp-look .sbp-look-press').nth(index).click()
    await app.page.waitForFunction((wanted) => document.documentElement.dataset['theme'] === wanted, look, { timeout: 10_000 })
    for (const width of WIDTHS) {
      await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await app.page.waitForTimeout(300)
      // THE LABEL IS ABOVE THE PAGE, which shows made-up lines as well, and at 390, where the chat covers the whole
      // page, in the chat above the other party's name.
      const name = `late-comment-${look}-${String(width)}`
      const above = width === 390 ? app.page.locator('.px-chat .px-chat-them-top') : app.page.locator(THE_PAGE_TOP).first()
      await putTheMadeUpLabelIn(app.page, LABEL, above, name)
      // THE COMMENT'S PLACE IS SHOWN: the comment at the top of the list, or, where it is not drawn, the first line.
      // ONLY THE LIST IS SCROLLED: scrollIntoView would scroll the panel too, and the label with it out of sight.
      const top = (await app.page.$(row(commentId))) === null ? row(firstId) : row(commentId)
      await app.page.locator(top).evaluate((one) => {
        const list = one.closest('.px-chat-said')
        if (list === null) throw new Error('the line is not in the list of messages')
        list.scrollTop += one.getBoundingClientRect().top - list.getBoundingClientRect().top
      })
      await app.page.screenshot({ path: join(folder, `${name}.png`) })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}
