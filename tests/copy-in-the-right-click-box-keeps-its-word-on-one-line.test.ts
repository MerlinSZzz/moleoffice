// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COPY, IN THE HEAD OF THE BOX A RIGHT-CLICK OPENS, KEEPS ITS WORD ON ONE LINE, and the quote beside it wraps narrower.
 *
 * The head of the box is one row: the quote of what was right-clicked, then Copy, then the pin and the close mark.
 * Every press in the box may wrap its words, so that a long run title is never drawn wider than the box. In the head
 * row that let Copy shrink as well, and with a quote of about eight words its word broke into "Co" and "py" at 1440.
 * The picture of the whole box for the getting-started report showed it.
 *
 * The case files a made-up report as a made-up agent, selects the same made-up sentence that picture selects,
 * right-clicks it at 1440, and reads the lines Copy's word is drawn on. It holds that the word is on one line, and
 * that nothing in the head row runs past the box.
 *
 * How to tell it is back: right-click a sentence of about eight words, and Copy's word is drawn on two lines.
 *
 * Test change (wave 13y round 175): a new case. It fails on main's code, where Copy's word breaks into two lines.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const SELECTED = 'the made-up kiln held its heat through the night'
const HELPER = 'a-made-up-helper'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let page: Page
let report = ''

async function write(headers: Record<string, string>, body: object): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, text).toBe(201)
  return (JSON.parse(text) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'copy-keeps-its-word-on-one-line', viewport: { width: 1440, height: 900 }, opensAt: 'full' })
  page = app.page
  // ONE MADE-UP AGENT FILES THE MADE-UP REPORT, as in the picture of the whole box.
  await write(AS_THE_PERSON, { kind: 'agent', title: 'A made-up helper', data: { handle: HELPER, runtime: 'claude-code', state: 'active' } })
  report = await write(
    { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HELPER },
    {
      kind: 'report',
      title: 'A made-up report about a made-up kiln',
      data: {
        for: 'A made-up reader',
        date: '2026-11-22',
        blocks: [{ id: 'b-1', type: 'text', heading: 'What the made-up log says', text: `The made-up log says ${SELECTED}.` }],
      },
    },
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('Copy in the head of the box a right-click opens', () => {
  it('keeps its word on one line at 1440, with the quote of a made-up sentence of about eight words beside it', async () => {
    await page.goto('about:blank')
    await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const run = '[data-text-field="data.blocks[#b-1].text"]'
    await page.locator(run).waitFor({ timeout: 30_000 })
    await page.locator(run).evaluate((el) => el.scrollIntoView({ block: 'center' }))
    // THE MADE-UP SENTENCE IS SELECTED AS A PERSON SELECTS IT, and the right-click lands on the middle of it.
    const at = await page.evaluate(
      ([where, words]) => {
        const el = document.querySelector<HTMLElement>(where)
        if (el === null) throw new Error('the made-up paragraph is not drawn')
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let node = walk.nextNode() as Text | null; node !== null; node = walk.nextNode() as Text | null) {
          const from = node.data.indexOf(words)
          if (from === -1) continue
          const range = document.createRange()
          range.setStart(node, from)
          range.setEnd(node, from + words.length)
          const chosen = window.getSelection()
          chosen?.removeAllRanges()
          chosen?.addRange(range)
          const box = range.getBoundingClientRect()
          return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
        }
        throw new Error('no one run of the made-up paragraph holds the made-up sentence')
      },
      [run, SELECTED] as const,
    )
    await page.mouse.click(at.x, at.y, { button: 'right' })
    const talk = page.locator('.px-talk')
    await talk.waitFor({ timeout: 20_000 })
    await page.locator('.px-talk .px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
    expect(await talk.locator('.px-talk-quote').innerText(), 'the quote is of the made-up sentence').toContain(SELECTED)

    const copy = talk.locator('.px-talk-head').getByRole('button', { name: sayInEnglish('talk.copy'), exact: true })
    await copy.waitFor({ timeout: 20_000 })
    // THE LINES THE WORD IS DRAWN ON, by the top of each piece of its text the browser lays out.
    const lines = await copy.evaluate((button) => {
      const tops = new Set<number>()
      const walk = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
      for (let node = walk.nextNode() as Text | null; node !== null; node = walk.nextNode() as Text | null) {
        if (node.data.trim() === '') continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of Array.from(range.getClientRects())) if (rect.width > 0) tops.add(Math.round(rect.top))
      }
      return tops.size
    })
    expect(lines, "Copy's word is drawn on one line").toBe(1)

    // NOTHING IN THE HEAD ROW RUNS PAST THE BOX: the quote wraps narrower instead.
    const head = await talk.locator('.px-talk-head').evaluate((row) => ({ scroll: row.scrollWidth, client: row.clientWidth }))
    expect(head.scroll, 'the head row is no wider than the box').toBeLessThanOrEqual(head.client)
  }, 120_000)
})
