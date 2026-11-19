// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURES OF THE SEND-KEY SETTING AND THE COMPOSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SKIPPED CASE IS THE PICTURE-TAKER
 * ---------------------------------------------------------------------------------------
 *
 * A browser test already has the page in front of it, so this is the cheapest honest way to take
 * the handback pictures. The case runs only when `SEND_KEY_SHOTS` names a directory; the ordinary
 * and mutation runs leave it unset and take no picture. It writes nothing into this checkout: every
 * file goes under the directory the variable names.
 *
 * Nine pictures of the open setting, which is what chapter 6 asks for: 1440, 990, 660 and 390 in
 * both looks, and 1440 again in Chinese. One more of the chat's composer with a two-line message
 * made by pressing Enter, which is the setting's whole point.
 */

import { mkdirSync } from 'node:fs'

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
  'x-mole-office-actor-id': 'builder-send-key-shots',
}

beforeAll(async () => {
  app = await liveApp({ name: 'send-key-shots', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Send Key Shots',
      data: { handle: 'builder-send-key-shots', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'message',
      title: 'The first thing said, so the composer has a conversation.',
      data: { body: 'The first thing said, so the composer has a conversation.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

/** Open the chat panel and step into the one conversation the fixture made. */
async function openTheConversation(): Promise<void> {
  const already = await app.page.$('.px-chat')
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
  await app.page.click('.px-chat-contact')
  await app.page.waitForSelector('.px-chat-box', { timeout: 15_000 })
}

describe('the pictures of the send-key setting', () => {
  it.skipIf(!process.env['SEND_KEY_SHOTS'])('photographs the open setting at four widths in both looks, and 1440 in Chinese', async () => {
    const dir = process.env['SEND_KEY_SHOTS'] as string
    mkdirSync(dir, { recursive: true })

    await app.page.goto(`${app.site}/#/settings/sendkey`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.sendk', { timeout: 15_000 })
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: width < 700 ? 1000 : 1100 })
        await app.page.emulateMedia({ colorScheme: theme })
        await app.page.screenshot({ path: `${dir}/send-key-${width}-${theme}.png`, fullPage: true })
      }
    }

    await app.page.setViewportSize({ width: 1440, height: 1100 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    await app.page.goto(`${app.site}/?lang=zh#/settings/sendkey`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.sendk', { timeout: 15_000 })
    await app.page.screenshot({ path: `${dir}/send-key-1440-zh-light.png`, fullPage: true })
  }, 180_000)

  it.skipIf(!process.env['SEND_KEY_SHOTS'])('photographs the chat composer holding a two-line message made with Enter', async () => {
    const dir = process.env['SEND_KEY_SHOTS'] as string
    mkdirSync(dir, { recursive: true })
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    await app.page.goto(app.site)
    await waitForThePage(app.page, 30_000)
    await openTheConversation()
    // THE WORDS ARE MADE WITH ENTER, not with a newline in a string: the pressed key is the thing
    // the setting is about, so the picture is of what Enter actually did.
    await app.page.fill('.px-chat-box', 'The first line of the message')
    await app.page.press('.px-chat-box', 'Enter')
    await app.page.type('.px-chat-box', 'and the second line, made with Enter')
    // THE PICTURE IS OF A TWO-LINE MESSAGE, so the test proves the value really has the line break
    // Enter made rather than a wrapped single line.
    expect(await app.page.$eval('.px-chat-box', (el) => (el as HTMLTextAreaElement).value)).toBe(
      'The first line of the message\nand the second line, made with Enter',
    )
    await app.page.screenshot({ path: `${dir}/send-key-composer-1440-light.png`, fullPage: true })
  }, 180_000)
})
