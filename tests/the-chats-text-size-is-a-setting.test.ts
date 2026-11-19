// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S TEXT SIZE IS A SETTING, KEPT PER PERSON. Criterion M112.
 *
 * The chat's text size is set in Settings.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what the chat DRAWS: a computed font-size on the words inside a real bubble,
 * read out of the running page, before and after a press and again after a reload. A render test
 * or a check of the stored word alone would pass on a build that stores the choice correctly and
 * never applies it to the screen — which is exactly the mutation named below.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
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
  'x-mole-office-actor-id': 'builder-chat-text-size',
}

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

async function openThePanel(): Promise<void> {
  const already = await app.page.$('.px-chat')
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
}

/** The computed font-size, in pixels, of the message words inside the open conversation. */
async function bubbleFontSize(): Promise<number> {
  return app.page.$eval('.px-chat-words', (el) => parseFloat(getComputedStyle(el).fontSize))
}

/** The computed font-size, in pixels, of the contact row's own name in the list. */
async function listFontSize(): Promise<number> {
  return app.page.$eval('.px-chat-name', (el) => parseFloat(getComputedStyle(el).fontSize))
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-text-size', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Chat Text Size',
      data: { handle: 'builder-chat-text-size', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  await say(AS_THE_AGENT, 'The first thing said, for the row and the bubble to both draw something.', {
    kind: 'person',
    id: THE_PERSON,
  })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe("the chat's text size is a setting, kept per person", () => {
  it('changes the drawn size and survives a reload', async () => {
    // THE CONTROL: read what the chat draws today, with nobody having chosen. This is what M112
    // asks the default to equal, so the case starts by proving there is a real number to compare
    // against rather than an empty panel.
    await app.page.goto(app.site)
    await waitForThePage(app.page, 30_000)
    await openThePanel()
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-words', { timeout: 15_000 })
    const normalBubble = await bubbleFontSize()
    const normalList = await listFontSize()
    expect(normalBubble).toBeGreaterThan(0)
    expect(normalList).toBeGreaterThan(0)

    // THE CHAT PANEL IS MOUNTED ON THE SETTINGS PAGE TOO, so the same open conversation is still
    // on screen while the setting is changed: this proves the live-update path (readTheChatAgain)
    // and not only what a fresh load draws.
    await app.page.goto(`${app.site}/#/settings/chattextsize`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.ctsz-one[data-size="large"]', { timeout: 15_000 })
    await app.page.click('.ctsz-one[data-size="large"]')
    // THE CONTROL ITSELF SAYS IT TOOK: the label carries data-chosen="yes" once the write answers.
    await app.page.waitForSelector('.ctsz-one[data-size="large"][data-chosen="yes"]', { timeout: 15_000 })

    await app.page.waitForFunction(
      (before) => {
        const el = document.querySelector('.px-chat-words')
        if (el === null) return false
        return parseFloat(getComputedStyle(el).fontSize) > before
      },
      normalBubble,
      { timeout: 15_000 },
    )
    const largeBubble = await bubbleFontSize()
    const largeList = await listFontSize()
    expect(largeBubble).toBeGreaterThan(normalBubble)
    expect(largeList).toBeGreaterThan(normalList)

    // AND IT SURVIVES A RELOAD: a fresh page, reading the person's own row from the server rather
    // than anything remembered in this browser. THE PANEL REMEMBERS WHICH CONVERSATION WAS OPEN (it
    // stores that itself, for a reason unrelated to this criterion), so it comes back showing the
    // same conversation directly rather than the contacts list — the row is not clicked again.
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    await openThePanel()
    await app.page.waitForSelector('.px-chat-words', { timeout: 15_000 })
    const afterReload = await bubbleFontSize()
    expect(afterReload).toBe(largeBubble)

    // PUT IT BACK, so a run of this file twice starts from the same place.
    await app.page.goto(`${app.site}/#/settings/chattextsize`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.ctsz-one[data-size="normal"]', { timeout: 15_000 })
    await app.page.click('.ctsz-one[data-size="normal"]')
    await app.page.waitForSelector('.ctsz-one[data-size="normal"][data-chosen="yes"]', { timeout: 15_000 })
  }, 120_000)
})
