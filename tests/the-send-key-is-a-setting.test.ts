// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEND KEY IS A SETTING, AND EVERY MESSAGE BOX OBEYS IT.
 *
 * What the decision asks: Enter sends now; by default Enter should start a new line, and Shift+Enter
 * or Alt+Enter should send. This goes into the settings as the first shortcut setting.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what a real keyboard does in a real box: Enter makes a new line or it does not,
 * Shift+Enter and Alt+Enter send or they do not, and a composing Enter is left to the input method.
 * A test of the stored word, or of the shared rule alone, would pass on a build that stores the
 * choice and never reads it in the box — which is exactly the mutation named below. So the cases
 * press real keys in the chat's composer and in the comment composer, and read what the box holds
 * and what the conversation drew.
 *
 * The one thing a real key press CANNOT carry is `isComposing`, because a browser only sets that
 * while a real input method is running. That case dispatches the keydown the input method fires, on
 * the element it would land on, and reads back whether the box took the key (`defaultPrevented`) and
 * whether anything was sent.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let reportId: string

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-send-key',
}

const REPORT_PROSE =
  'The gripper let go of the part on 37% of runs above fifteen newtons, and nobody has measured why.'
const THE_PARAGRAPH = '[data-target^="reportBlock/"] [data-text-field]'
const THE_COMMENT_BOX = '.px-talk[aria-label="Talk about this"]'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

/** Open the chat panel and step into the one conversation the fixture made. */
async function openTheConversation(): Promise<void> {
  // ALREADY IN THE CONVERSATION IS ALREADY OPEN. The chat panel remembers which conversation was on
  // screen, so a reload can come back straight into it with no contacts list to click.
  if ((await app.page.$('.px-chat-box')) !== null) return
  if ((await app.page.$('.px-chat-contact')) === null) {
    await openTheChat(app.page)
  }
  await app.page.click('.px-chat-contact')
  await app.page.waitForSelector('.px-chat-box', { timeout: 15_000 })
}

/** What the chat's composer holds. */
async function theBox(): Promise<string> {
  return app.page.$eval('.px-chat-box', (el) => (el as HTMLTextAreaElement).value)
}

/** Every message the conversation has drawn, as words. A count races the conversation's first read. */
async function theMessages(): Promise<string[]> {
  return app.page.$$eval('.px-chat-words', (els) => els.map((el) => el.textContent ?? ''))
}

/** Wait until the conversation holds a message with these words, or throw with what it does hold. */
async function waitForTheMessage(words: string): Promise<void> {
  await app.page.waitForFunction(
    (want) => [...document.querySelectorAll('.px-chat-words')].some((el) => (el.textContent ?? '').includes(want)),
    words,
    { timeout: 15_000 },
  )
}

/** Choose one of the two settings on the panel, and wait for the panel to say it took. */
async function chooseOnThePanel(which: 'shift-or-alt-enter' | 'enter'): Promise<void> {
  await app.page.goto(`${app.site}/#/settings/sendkey`)
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector(`.sendk-one[data-key="${which}"]`, { timeout: 15_000 })
  await app.page.click(`.sendk-one[data-key="${which}"]`)
  await app.page.waitForSelector(`.sendk-one[data-key="${which}"][data-chosen="yes"]`, { timeout: 15_000 })
}

/** Read the person's own row, so a refusal can be shown to have written nothing. */
async function theirSendKey(): Promise<string | null> {
  const reply = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const held = (await reply.json()) as { people: { id: string; sendKey?: string | null }[] }
  return held.people.find((one) => one.id === THE_PERSON)?.sendKey ?? null
}

/**
 * DISPATCH THE KEYDOWN AN INPUT METHOD FIRES WHILE IT IS COMPOSING, on the element it would land on,
 * and answer whether the box took the key. The element is found by class each time, so a redraw
 * between the read and the dispatch cannot leave a stale node.
 */
async function aComposingEnterInTheChat(): Promise<boolean> {
  return app.page.$eval('.px-chat-box', (el) => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(event)
    return event.defaultPrevented
  })
}

/** Select the report's paragraph and right-click it, the way the owner opens the comment composer. */
async function openTheCommentBox(): Promise<void> {
  await app.page.waitForSelector(THE_PARAGRAPH, { timeout: 30_000 })
  await app.page.evaluate(() => {
    const el = document.querySelector('[data-target^="reportBlock/"] [data-text-field]')
    if (el === null) throw new Error('the report paragraph is not on the page')
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await sleep(250)
  await app.page.waitForSelector(THE_PARAGRAPH, { timeout: 30_000 })
  await app.page.evaluate(() => {
    const el = document.querySelector('[data-target^="reportBlock/"] [data-text-field]')
    if (el === null) throw new Error('the report paragraph is not on the page')
    const at = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(at.left + 20),
        clientY: Math.round(at.top + 8),
      }),
    )
  })
  await app.page.waitForSelector(THE_COMMENT_BOX, { timeout: 15_000 })
}

async function theCommentBoxHolds(): Promise<string> {
  return app.page.$eval(`${THE_COMMENT_BOX} textarea`, (el) => (el as HTMLTextAreaElement).value)
}

beforeAll(async () => {
  app = await liveApp({ name: 'send-key', viewport: { width: 1440, height: 1000 }, opensAt: 'full', workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Send Key',
      data: { handle: 'builder-send-key', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  await say(AS_THE_AGENT, 'The first thing said, so the conversation has a row to open.', {
    kind: 'person',
    id: THE_PERSON,
  })
  // A REPORT WITH ONE PARAGRAPH, so the comment composer has words to open on.
  const report = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'What the gripper did on Tuesday',
      summary: 'One run in three dropped the part.',
      data: { date: '2026-09-29', blocks: [{ id: 'b-prose', type: 'text', text: REPORT_PROSE }] },
    }),
  })
  expect(report.status, await report.clone().text()).toBe(201)
  reportId = ((await report.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the send key is a setting, and every message box obeys it', () => {
  it('by default, Enter adds a new line and sends nothing, and Shift+Enter or Alt+Enter sends', async () => {
    await app.page.goto(app.site)
    await waitForThePage(app.page, 30_000)
    await openTheConversation()

    // PLAIN ENTER MAKES A NEW LINE. A real press, so the browser's own default action runs.
    await app.page.fill('.px-chat-box', 'the first line')
    await app.page.press('.px-chat-box', 'Enter')
    expect(await theBox(), 'plain Enter added a line rather than sending').toBe('the first line\n')
    expect((await theMessages()).some((one) => one.includes('the first line')), 'plain Enter sent nothing').toBe(false)
    await app.page.fill('.px-chat-box', '')

    // SHIFT+ENTER SENDS.
    await app.page.fill('.px-chat-box', 'sent with shift')
    await app.page.press('.px-chat-box', 'Shift+Enter')
    await waitForTheMessage('sent with shift')
    expect(await theBox(), 'a sent message leaves the box empty').toBe('')

    // ALT+ENTER SENDS TOO.
    await app.page.fill('.px-chat-box', 'sent with alt')
    await app.page.press('.px-chat-box', 'Alt+Enter')
    await waitForTheMessage('sent with alt')

    // PUT THE BOX BACK, so the next case starts from nothing written.
    await app.page.fill('.px-chat-box', '')
  }, 120_000)

  it('at ?lang=zh, a composing Enter is never taken, in both settings', async () => {
    await app.page.goto(`${app.site}/?lang=zh`)
    await waitForThePage(app.page, 30_000)
    await openTheConversation()

    // THE DEFAULT SETTING. Type something so a line break would be visible if the box took the key.
    await app.page.fill('.px-chat-box', '正在打字')
    const tookItByDefault = await aComposingEnterInTheChat()
    expect(tookItByDefault, 'the input method owns Enter, so the box must not preventDefault it').toBe(false)
    expect(await theBox(), 'a composing Enter added no line').toBe('正在打字')
    expect((await theMessages()).some((one) => one.includes('正在打字')), 'a composing Enter sent nothing').toBe(false)

    // AND THE SAME ONE KEY PRESS UNDER "Enter sends".
    await chooseOnThePanel('enter')
    await app.page.goto(`${app.site}/?lang=zh`)
    await waitForThePage(app.page, 30_000)
    await openTheConversation()
    await app.page.fill('.px-chat-box', '正在打字')
    const tookItUnderEnter = await aComposingEnterInTheChat()
    expect(tookItUnderEnter, 'the input method owns Enter in both settings').toBe(false)
    expect(await theBox(), 'a composing Enter added no line under Enter sends').toBe('正在打字')
    expect((await theMessages()).some((one) => one.includes('正在打字')), 'a composing Enter sent nothing under Enter sends').toBe(false)
    await app.page.fill('.px-chat-box', '')
  }, 180_000)

  it('after choosing Enter sends, Enter sends and Shift+Enter adds a line', async () => {
    // The setting is "enter" from the case above.
    await app.page.goto(app.site)
    await waitForThePage(app.page, 30_000)
    await openTheConversation()

    await app.page.fill('.px-chat-box', 'sent with plain enter')
    await app.page.press('.px-chat-box', 'Enter')
    await waitForTheMessage('sent with plain enter')

    // SHIFT+ENTER MAKES A NEW LINE INSTEAD, and sends nothing.
    await app.page.fill('.px-chat-box', 'a second line')
    await app.page.press('.px-chat-box', 'Shift+Enter')
    expect(await theBox(), 'Shift+Enter added a line').toBe('a second line\n')
    expect((await theMessages()).some((one) => one.includes('a second line')), 'Shift+Enter sent nothing').toBe(false)
    await app.page.fill('.px-chat-box', '')
  }, 120_000)

  it('reads the choice back from the account in a fresh browser context', async () => {
    // The setting is "enter". A new context has none of this one's storage, so Enter sending can
    // only come from the person's own row on the server.
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    try {
      const page = await context.newPage()
      await page.goto(app.site)
      await waitForThePage(page, 30_000)
      const already = await page.$('.px-chat')
      await openTheChat(page)
      await page.waitForSelector('.px-chat', { timeout: 15_000 })
      await page.click('.px-chat-contact')
      await page.waitForSelector('.px-chat-box', { timeout: 15_000 })
      await page.fill('.px-chat-box', 'read back from the account')
      await page.press('.px-chat-box', 'Enter')
      await page.waitForFunction(
        () => [...document.querySelectorAll('.px-chat-words')].some((el) => (el.textContent ?? '').includes('read back from the account')),
        undefined,
        { timeout: 15_000 },
      )
    } finally {
      await context.close()
    }
  }, 120_000)

  it('one comment box follows the same setting', async () => {
    // The setting is "enter" from the cases above, proved on the person's own row first.
    expect(await theirSendKey()).toBe('enter')
    // Under "enter", a plain Enter is taken by the box and Shift+Enter is the new line.
    await app.page.goto(`${app.site}/#/r/${reportId}`)
    await waitForThePage(app.page, 30_000)
    await openTheCommentBox()
    // THE BOX READS THE SETTING FROM THE OFFICE, so let the page's own read of the person finish
    // before a press decides anything. The composer is opened by a gesture well after the page
    // loads, and this is the margin that keeps the two apart on a slow machine.
    await sleep(600)
    await app.page.fill(`${THE_COMMENT_BOX} textarea`, 'a comment')
    await app.page.press(`${THE_COMMENT_BOX} textarea`, 'Enter')
    expect(await theCommentBoxHolds(), 'under Enter sends, plain Enter is taken and adds no line').toBe('a comment')
    await app.page.press(`${THE_COMMENT_BOX} textarea`, 'Shift+Enter')
    expect(await theCommentBoxHolds(), 'under Enter sends, Shift+Enter makes the new line').toBe('a comment\n')

    // AND UNDER THE DEFAULT, a plain Enter makes the new line instead.
    await chooseOnThePanel('shift-or-alt-enter')
    await app.page.goto(`${app.site}/#/r/${reportId}`)
    await waitForThePage(app.page, 30_000)
    await openTheCommentBox()
    await sleep(600)
    await app.page.fill(`${THE_COMMENT_BOX} textarea`, 'another comment')
    await app.page.press(`${THE_COMMENT_BOX} textarea`, 'Enter')
    expect(await theCommentBoxHolds(), 'under the default, plain Enter makes the new line').toBe('another comment\n')
  }, 180_000)

  it('refuses a third word with 400 and writes nothing', async () => {
    const before = await theirSendKey()
    const refused = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ sendKey: 'command-enter' }),
    })
    expect(refused.status, await refused.clone().text()).toBe(400)
    const said = await refused.text()
    expect(said).toContain('shift-or-alt-enter')
    expect(said).toContain('enter')
    expect(await theirSendKey(), 'the refusal wrote nothing').toBe(before)
  }, 60_000)
})
