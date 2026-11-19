// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MARKDOWN LINK TO A PAGE OF THE OFFICE IS A REAL LINK, IN A REPORT AND IN THE CHAT. Wave 13k round 35, piece 4.
 *
 * Every record a report names is a link the reader can open.
 * `[the flow proposal](#/r/<id>)` was drawn as grey "dead" text with its target beside it, because
 * src/shared/inline.ts linked only http, https and mailto. A target that starts with `#/` is an address inside the
 * office, and is now drawn as a live link to it, in the same window. Everything else is as it was: javascript:,
 * file:// and any other target stay dead, and a web address opens in a new tab. In the chat, a link's words are not
 * turned into a second press inside it.
 *
 * MADE-UP RECORDS: a note, a report naming it, and an agent "Ledger Agent" whose message names it.
 *
 * PICTURES: only when TEST_SHOTS names a folder, at 1440, 990, 660 and 390, light and dark, English and Chinese.
 *
 * MUTATIONS, proved on 4 October 2026 after a control run (3 passed), each red for the reason its case states, then
 * restored green (3 passed):
 *   - src/shared/inline.ts: isOfficeAddress always false. Cases 1 and 2 go red: the links are dead again.
 *   - src/web/components/Chat.tsx: pressesInside walks into a link again. Case 2 goes red: a press inside a link.
 *   - src/shared/inline.ts: the office link given target _blank. Cases 1 and 2 go red.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'

const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('office-links')

const OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_AGENT = { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'ledger-agent' }

let app: LiveApp
let noteId = ''
let reportId = ''
/** The message's first sentence, plain, so the bubble is found whatever the links in it draw. */
const FIRST_WORDS = 'The glaze line moves on Monday.'

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

async function openReport(lang = 'en', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#${recordPath(reportId)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.sb-block').first().waitFor({ timeout: 30_000 })
}

const BUBBLE = `.px-chat-said .px-chat-bubble:has-text("${FIRST_WORDS}")`

async function openChat(lang = 'en', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/chat`)
  await waitForThePage(app.page, 60_000)
  // BELOW 40REM THE PAGE DRAWS ONE PANE AT A TIME, and it may reopen the conversation it last showed.
  const contact = app.page.locator('.px-chat-contact:has(.px-chat-name:text-is("Ledger Agent"))')
  if (!(await contact.isVisible())) {
    const back = app.page.locator('.px-chat-back')
    if (await back.isVisible()) await back.click()
  }
  if (await contact.isVisible()) await contact.click()
  await app.page.waitForSelector(BUBBLE, { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'office-links', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE PAGE TAKES ITS LOOK FROM THE ADDRESS'S look, which the office itself does not read: it keeps the theme in
  // local storage. Without this every dark picture was the light one.
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  noteId = await file(OWNER, { kind: 'note', title: 'The flow proposal', data: { body: 'Move the glaze line before the kiln.' } })
  reportId = await file(OWNER, {
    kind: 'report',
    title: 'The glaze line, this week',
    summary: 'One proposal to read.',
    data: {
      date: '2026-10-04',
      blocks: [
        { id: 'b-one', type: 'text', text: `Read [the flow proposal](#/r/${noteId}) first. Not [a trap](javascript:alert(1)), and [the supplier's page](https://example.org/glaze) opens elsewhere.` },
      ],
    },
  })
  await file(OWNER, { kind: 'agent', title: 'Ledger Agent', data: { handle: 'ledger-agent', runtime: 'claude-code', state: 'active' } })
  await file(THE_AGENT, {
    kind: 'message',
    title: 'The flow proposal',
    data: {
      body: `${FIRST_WORDS} Read [the flow proposal](#/r/${noteId}) first. Not [a trap](javascript:alert(1)). Or [open ${noteId}](#/r/${noteId}).`,
      to: [{ kind: 'person', id: THE_PERSON }],
    },
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a link to a page of the office', () => {
  it('1. is a live link in a report, opening in the same window, while javascript stays dead and the web opens elsewhere', async () => {
    await openReport()
    const link = app.page.locator(`.sb-block a.px-in-link[href="#/r/${noteId}"]`)
    expect(await link.count(), 'the office link is not a link').toBe(1)
    expect(await link.innerText()).toBe('the flow proposal')
    expect(await link.getAttribute('target'), 'the office link opens another window').toBeNull()
    expect(await app.page.locator('.sb-block a[href^="javascript"]').count(), 'a javascript target became a link').toBe(0)
    expect(await app.page.locator('.sb-block .px-in-dead').innerText()).toContain('a trap')
    expect(await app.page.locator('.sb-block a[href="https://example.org/glaze"]').getAttribute('target')).toBe('_blank')
    const windows = app.context.pages().length
    await link.click()
    await app.page.waitForURL(`**#/r/${noteId}`, { timeout: 20_000 })
    expect(app.context.pages().length, 'the office link opened a new window').toBe(windows)
  }, 120_000)

  it('2. is a live link in a chat message, with no second press inside it, while javascript stays dead', async () => {
    await openChat()
    const bubble = app.page.locator(BUBBLE)
    const links = bubble.locator(`a.px-in-link[href="#/r/${noteId}"]`)
    expect(await links.count(), 'the chat message holds two office links').toBe(2)
    for (const one of await links.all()) expect(await one.getAttribute('target')).toBeNull()
    expect(await links.nth(0).innerText()).toBe('the flow proposal')
    expect(await bubble.locator('a.px-in-link a, a.px-in-link button').count(), 'a press drawn inside a link').toBe(0)
    expect(await bubble.locator('a[href^="javascript"]').count(), 'a javascript target became a link').toBe(0)
  }, 120_000)

  it('3. photographs the report and the chat at four widths', async () => {
    if (!KEEP) return
    for (const lang of ['en', 'zh']) {
      for (const look of ['light', 'dark']) {
        for (const width of [1440, 990, 660, 390]) {
          await openReport(lang, width, look)
          await app.page.screenshot({ path: join(SHOTS, `report-${lang}-${width}-${look}.png`), fullPage: true })
          await openChat(lang, width, look)
          await app.page.screenshot({ path: join(SHOTS, `chat-${lang}-${width}-${look}.png`), fullPage: false })
        }
      }
    }
  }, 1_200_000)
})
