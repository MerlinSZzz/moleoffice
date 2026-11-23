// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUOTE PRESS QUOTES THE WORDS SELECTED ON ANY PAGE (wave 13y, the owner's writing row).
 *
 * The person selected words on Home and pressed the quote press, and nothing happened. On a report the same press
 * worked. The press kept a selection only when its words lay inside one stored text. Home draws Mole Office's own
 * words, which no record stores, so the press dropped them and said nothing. The person also asked for a shorter tip,
 * with no sentence about what the press does with nothing selected, and for the press to be drawn as design D draws it.
 * Design D's square marks read as "ss", and the plain mark drawn after them was not what he first agreed either: he
 * asked for the pair of big quotation marks the press first drew, and for a press that looks pressable. That pair is
 * two small square brackets, and the review of its pictures read them as a pause sign. So the press draws a curly
 * opening quotation mark, as two closed shapes.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office, with the chat beside the page at 1440:
 *   1. THE TIP is the word list's own tip, in English and in Chinese, and the English tip is one short sentence. The
 *      press draws a curly opening quotation mark: a picture of two closed shapes, and no character. While
 *      it is not pressed its background is clear and it has an edge, under the pointer it has a ground, and on
 *      keyboard focus it has an outline.
 *   2. WORDS SELECTED ON HOME are quoted: the chip in the writing box holds exactly those words.
 *   3. WORDS SELECTED ON A PLAN, ON A RECORD AND ON THE CHAT'S OWN PAGE are quoted in the same way.
 *   4. SEVERAL QUOTES GO IN ONE MESSAGE: words from Home and then words from a report are both stored on the message
 *      that is sent, in that order, each with the words that were selected.
 *
 *   MUTATION A: the press keeps only words inside one stored text again. Red on 2, on the plan in 3, and on 4. The
 *               record's and the chat page's words are each inside one stored text, so they stay green.
 *   MUTATION B: the second quote replaces the first instead of following it. Red on 4.
 *   MUTATION C: the Chinese tip taken out of the word list. Red on 1.
 *   MUTATION D: the press is given a resting background again. Red on 1.
 *   MUTATION E: the press draws the plain quotation mark again, or design D's two open lines. Red on 1.
 *   MUTATION F: the press loses its edge, or its ground under the pointer. Red on 1.
 *
 * Everything here is made up: the agent, the report, the note and the message. The servers come from `liveApp` in
 * tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { TARGET_ATTRIBUTE, targetAttributeValue, wordsNamedBy, type Context } from '../src/shared/targets.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { zhWave13y } from '../src/shared/words/zh-wave-13y.ts'
import { pathFor, planTodayPath, recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, openRecordPagesAt, waitForThePage } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-quoter' }

/** The tip's key, and the two word lists read as plain lists, since a list may hold more than strings. */
const THE_TIP = 'chat.quote.press'
const EN: Readonly<Record<string, unknown>> = enWave13y
const ZH: Readonly<Record<string, unknown>> = zhWave13y

const ON_THE_NOTE = 'the glaze held on every made-up tile'
const ON_THE_REPORT = 'kiln for part 2 ran for six hours'
const IN_THE_CHAT = 'about the second made-up firing'

let app: LiveApp
let agentKey = ''
let report = ''
let note = ''
const pictures = process.env.QUOTE_PICKING_PICTURES

/** File one record, and say the answer when it is not 201. */
async function file(headers: Record<string, string>, body: { kind: string; title: string; data: Record<string, unknown> }): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'quote-on-any-page', viewport: { width: 1440, height: 900 }, workspace: 'default', opensAt: 'full' })
  await file(AS_THE_OWNER, { kind: 'agent', title: 'Made-up Quoter', data: { handle: 'made-up-quoter', runtime: 'claude-code', state: 'active' } })
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  const agentId = agents.find((one) => one.handle === 'made-up-quoter')?.id ?? ''
  expect(agentId, 'made-up-quoter has no registry row').not.toBe('')
  agentKey = participantKey({ kind: 'agent', id: agentId })
  // THE AGENT'S MESSAGE, whose words are selected on the chat's own page.
  await file(AS_THE_AGENT, {
    kind: 'message',
    title: 'Made-up message',
    data: { body: `A made-up question ${IN_THE_CHAT}.`, to: [{ kind: 'person', id: THE_PERSON }] },
  })
  const blocks = [1, 2, 3].map((n) => ({
    id: `b-${String(n)}`,
    type: 'text',
    heading: `Made-up part ${String(n)}`,
    text: `Made-up paragraph ${String(n)}. The kiln for part ${String(n)} ran for six hours.`,
  }))
  report = await file(AS_THE_OWNER, { kind: 'report', title: 'Made-up kiln report', data: { for: 'Made-up reader', date: '2026-11-10', blocks } })
  note = await file(AS_THE_OWNER, { kind: 'note', title: 'Made-up note about the glaze', data: { body: `In the made-up batch ${ON_THE_NOTE}.` } })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A browser window of its own, light, with the chat beside the page and open at the made-up agent. */
async function aWindow(lang: 'en' | 'zh', width = 1440, theme: 'light' | 'dark' = 'light'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript(
    ([language, chatWith, look]) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.language', language)
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'split')
      localStorage.setItem('mole-office.chat.split-side', 'right')
      localStorage.setItem('mole-office.chat.with', chatWith)
    },
    [lang, agentKey, theme] as const,
  )
  const page = await context.newPage()
  return { context, page }
}

/** Go to a page by its address and wait until the page and the chat's writing box are both drawn. */
async function goTo(page: Page, path: string, lang: 'en' | 'zh' = 'en'): Promise<void> {
  await page.goto(`${app.site}/?lang=${lang}#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.px-chat-write .px-chat-box', { timeout: 30_000 })
  await page.mouse.move(1, 1)
}

/**
 * SELECT WORDS INSIDE THE PAGE'S OWN TREE, as a person drags across them, and say which words they are. The wanted
 * words when they are given; otherwise the first three words the page draws as plain text, which on Home and on a plan
 * are Mole Office's own words.
 */
async function select(page: Page, wanted: string | null): Promise<string> {
  return page.locator('#main').evaluate((within, words) => {
    const notPlainText = 'button, a, input, textarea, select, label, svg, style, script, .sr-only, [contenteditable], .px-chat-write, .px-chat-quote-chips'
    const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      const holder = node.parentElement
      if (holder === null || holder.closest(notPlainText) !== null || holder.getClientRects().length === 0) continue
      let from = -1
      let to = -1
      if (words !== null) {
        from = text.indexOf(words)
        to = from + words.length
      } else {
        const three = /[A-Za-z]+(?: [A-Za-z]+){2}/.exec(text)
        if (three !== null) {
          from = three.index
          to = from + three[0].length
        }
      }
      if (from < 0) continue
      const range = document.createRange()
      range.setStart(node, from)
      range.setEnd(node, to)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return text.slice(from, to)
    }
    throw new Error(`no words to select${words === null ? '' : `: ${words}`}`)
  }, wanted)
}

/** The words each chip in the writing box holds, in order. */
async function theChips(page: Page): Promise<string[]> {
  return page.locator('.px-chat-write .px-chat-quote-chip-words').evaluateAll((all) => all.map((one) => one.textContent ?? ''))
}

/** Press the quote press, and wait for the chips to be what the case expects. */
async function quote(page: Page, chips: string[]): Promise<void> {
  await page.click('.px-chat-quote-press')
  await expect.poll(() => theChips(page), { timeout: 5_000 }).toEqual(chips)
}

describe('the quote press itself', () => {
  it('1. says a short tip and draws a curly opening quotation mark as two closed shapes, clear with an edge at rest, a ground under the pointer and an outline on focus', async () => {
    const tip = EN[THE_TIP]
    expect(typeof tip, 'the English tip is not a string').toBe('string')
    // ONE SHORT SENTENCE: five words or fewer, and nothing after its first full stop.
    expect(String(tip).split(/\s+/).length, `the English tip is long: ${String(tip)}`).toBeLessThanOrEqual(5)
    expect(String(tip).replace(/\.$/, ''), `the English tip is more than one sentence: ${String(tip)}`).not.toMatch(/[.!?]/)
    expect(typeof ZH[THE_TIP], 'the Chinese list has no tip for the quote press').toBe('string')

    for (const lang of ['en', 'zh'] as const) {
      const { context, page } = await aWindow(lang)
      try {
        await goTo(page, '/', lang)
        const press = page.locator('.px-chat-quote-press')
        expect(await press.getAttribute('title'), `the tip in ${lang}`).toBe(lang === 'en' ? EN[THE_TIP] : ZH[THE_TIP])
        if (lang === 'zh') continue
        // Compare the background with a clear element, rather than a colour from a particular theme.
        const clear = await page.evaluate(() => {
          const probe = document.createElement('div')
          probe.style.cssText = 'position:absolute;visibility:hidden;background:transparent'
          document.body.append(probe)
          const ground = getComputedStyle(probe).backgroundColor
          probe.remove()
          return ground
        })
        const drawn = await press.evaluate((one, ground) => {
          const style = getComputedStyle(one)
          // THE CURLY OPENING QUOTATION MARK is two closed shapes in one picture. The plain mark was a character, and
          // design D's square marks were two open lines.
          const marks = [...one.querySelectorAll('svg[aria-hidden="true"] path')].map((path) => path.getAttribute('d') ?? '')
          return {
            clear: style.backgroundColor === ground,
            edge: style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) >= 1,
            marks: marks.length,
            closed: marks.every((d) => /z\s*$/i.test(d)),
            character: one.querySelector('span[aria-hidden="true"]')?.textContent ?? null,
          }
        }, clear)
        expect(drawn).toEqual({ clear: true, edge: true, marks: 2, closed: true, character: null })
        await press.hover()
        await expect.poll(() => press.evaluate((one) => getComputedStyle(one).backgroundColor), { message: 'the press has no ground under the pointer' }).not.toBe(clear)
        await page.mouse.move(-1, -1)
        // KEYBOARD FOCUS: Tab from the attach press, which stands just before it in the row.
        await page.locator('.px-chat-write .px-chat-attach-add').focus()
        await page.keyboard.press('Tab')
        const focused = await press.evaluate((one) => ({
          here: document.activeElement === one,
          outline: one.matches(':focus-visible') && getComputedStyle(one).outlineStyle !== 'none',
        }))
        expect(focused, 'the press has no outline on keyboard focus').toEqual({ here: true, outline: true })
      } finally {
        await context.close()
      }
    }
  }, 180_000)
})

it.runIf(pictures)('records the quote press and picking in both themes at each width', async () => {
  if (pictures === undefined) throw new Error('The picture directory is missing')
  mkdirSync(pictures, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      const { context, page } = await aWindow('en', width, theme)
      try {
        await goTo(page, '/')
        const labelAbove = () => width < 1024
          ? page.locator('.px-chat .px-chat-them-top')
          : page.locator('#main > *:not([data-made-up-label]):not(style)').first()
        await putTheMadeUpLabelIn(page, 'Made-up data — quote picking', labelAbove(), 'quote picking')
        expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
        const measure = async (stage: string): Promise<void> => {
          if (process.env.QUOTE_PICKING_MEASUREMENTS === undefined) return
          for (let take = 1; take <= 3; take += 1) {
            const values = await page.locator('.px-chat-quote-press').evaluate((press) => {
              const box = press.getBoundingClientRect()
              return {
                width: box.width,
                height: box.height,
                background: getComputedStyle(press).backgroundColor,
                pointing: document.documentElement.getAttribute('data-pointing'),
              }
            })
            console.info('quote measurement', JSON.stringify({ viewportWidth: width, theme, stage, take, ...values }))
          }
        }
        await page.mouse.move(-1, -1)
        await measure('rest')
        expect(await page.locator('[data-made-up-label]').isVisible()).toBe(true)
        await page.screenshot({ path: join(pictures, `rest-${String(width)}-${theme}.png`) })
        await page.locator('.px-chat-quote-press').click()
        await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
        if (width < 1024) {
          // The hidden chat's SVGs retain rectangles although they cannot be seen. Give those
          // invisible shapes no rectangle so the label helper can check the visible page.
          await page.addStyleTag({ content: `.px-chat[data-quote-picking='yes'] svg { display: none }
            .px-chat[data-quote-picking='yes'] .px-chat-quote-press svg { display: initial }` })
          await putTheMadeUpLabelIn(page, 'Made-up data — quote picking', page.locator('#main > *:not([data-made-up-label]):not(style)').first(), 'quote picking')
        }
        expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
        await page.mouse.move(-1, -1)
        await measure('picking')
        expect(await page.locator('[data-made-up-label]').isVisible()).toBe(true)
        await page.screenshot({ path: join(pictures, `picking-${String(width)}-${theme}.png`) })
        if (width === 1440) await page.locator('.px-chat-seam-swap').click()
        else {
          await page.evaluate((path) => { location.hash = `#${path}` }, recordPath(report))
          await page.locator(`[${TARGET_ATTRIBUTE}="${targetAttributeValue({ kind: 'reportBlock', recordId: report, blockId: 'b-2' })}"]`).waitFor({ timeout: 30_000 })
          await putTheMadeUpLabelIn(page, 'Made-up data — quote picking', labelAbove(), 'quote picking')
        }
        await page.waitForTimeout(500)
        await page.mouse.move(-1, -1)
        await measure('switched')
        expect(await page.locator('[data-made-up-label]').isVisible()).toBe(true)
        await page.screenshot({ path: join(pictures, `switched-${String(width)}-${theme}.png`) })
      } finally {
        await context.close()
      }
    }
  }
}, 300_000)

describe('picking a place to quote', () => {
  it('keeps the corner button and the quote press reachable in a narrow window', async () => {
    const person = `${app.api}/api/participants/person/${THE_PERSON}`
    const choice = await fetch(person, {
      method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'always' }),
    })
    expect(choice.status).toBe(200)
    const { context, page } = await aWindow('en')
    try {
      await goTo(page, '/')
      await page.locator('.px-chat-seam-window').click()
      await page.locator('aside.px-chat[data-where="corner"]').waitFor({ timeout: 20_000 })
      await page.setViewportSize({ width: 390, height: 844 })
      const press = page.locator('.px-chat-quote-press')
      const circle = page.locator('.px-chat-circle')
      await press.click()
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
      await expect.poll(() => circle.isVisible()).toBe(true)
      for (const control of [press, circle]) {
        expect(await control.evaluate((one) => {
          const box = one.getBoundingClientRect()
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          return top === one || one.contains(top)
        })).toBe(true)
      }
      await press.click()
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBeNull()
      await circle.click()
      await expect.poll(() => page.locator('aside.px-chat').count()).toBe(0)
    } finally {
      await context.close()
      await fetch(person, { method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: '' }) })
    }
  }, 120_000)

  it('ends when selected words are quoted with the press while picking', async () => {
    const { context, page } = await aWindow('en')
    try {
      await goTo(page, '/')
      await page.locator('.px-chat-quote-press').click()
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
      const words = await select(page, null)
      await page.locator('.px-chat-quote-press').click()
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBeNull()
      expect(await theChips(page)).toEqual([words])
    } finally {
      await context.close()
    }
  }, 120_000)

  it('ends when the press is used again or Escape is pressed', async () => {
    const { context, page } = await aWindow('en')
    try {
      await goTo(page, '/')
      for (const end of ['press', 'escape'] as const) {
        await page.locator('.px-chat-quote-press').click()
        await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
        if (end === 'press') await page.locator('.px-chat-quote-press').click()
        else await page.keyboard.press('Escape')
        await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBeNull()
      }
    } finally {
      await context.close()
    }
  }, 120_000)

  it.each(['page', 'side', 'window'] as const)('ends when the %s changes', async (change) => {
    const { context, page } = await aWindow('en')
    try {
      await goTo(page, '/')
      await page.locator('.px-chat-quote-press').click()
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBe('1')
      if (change === 'page') await page.evaluate((path) => { location.hash = `#${path}` }, recordPath(report))
      else await page.locator(change === 'side' ? '.px-chat-seam-swap' : '.px-chat-seam-window').click()
      await expect.poll(() => page.locator('html').getAttribute('data-pointing')).toBeNull()
    } finally {
      await context.close()
    }
  }, 120_000)
})

describe('words selected on a page', () => {
  it('2. on Home are quoted', async () => {
    const { context, page } = await aWindow('en')
    try {
      await goTo(page, '/')
      const words = await select(page, null)
      await quote(page, [words])
    } finally {
      await context.close()
    }
  }, 120_000)

  const pages: [string, () => string, string | null][] = [
    ['a plan', () => planTodayPath(), null],
    ['a record', () => recordPath(note), ON_THE_NOTE],
    ["the chat's own page", () => pathFor('chat'), IN_THE_CHAT],
  ]
  it.each(pages)('3. on %s are quoted', async (_, path, wanted) => {
    const { context, page } = await aWindow('en')
    try {
      await goTo(page, path())
      if (wanted !== null) await page.locator('#main').getByText(wanted, { exact: false }).first().waitFor({ timeout: 30_000 })
      const words = await select(page, wanted)
      await quote(page, [words])
    } finally {
      await context.close()
    }
  }, 120_000)
})

describe('several quotes', () => {
  it('4. from Home and from a report go in one message, in the order they were taken', async () => {
    const { context, page } = await aWindow('en')
    try {
      await goTo(page, '/')
      const fromHome = await select(page, null)
      await quote(page, [fromHome])

      // TO THE REPORT INSIDE THE SAME PAGE, so the chat beside it keeps the quote it holds.
      await page.evaluate((path) => {
        location.hash = `#${path}`
      }, recordPath(report))
      const part = `[${TARGET_ATTRIBUTE}="${targetAttributeValue({ kind: 'reportBlock', recordId: report, blockId: 'b-2' })}"]`
      await page.waitForSelector(part, { timeout: 30_000 })
      const fromTheReport = await select(page, ON_THE_REPORT)
      await quote(page, [fromHome, fromTheReport])

      const body = 'Made-up question about Home and part two.'
      await page.locator('.px-chat-write .px-chat-box').focus()
      await page.locator('.px-chat-write .px-chat-box').press('End')
      await page.locator('.px-chat-write .px-chat-box').pressSequentially(body)
      await page.click('.px-chat-send')
      await page.waitForSelector('.px-chat-write .px-chat-quote-chip', { state: 'detached', timeout: 10_000 })

      let quotes: Context[] = []
      await expect
        .poll(
          async () => {
            const listed = await fetch(`${app.api}/api/records?kind=message&shape=full`, { headers: AS_THE_OWNER })
            const { records } = (await listed.json()) as { records: { data: { body?: unknown; quotes?: Context[] } }[] }
            quotes = records.find((one) => one.data.body === body)?.data.quotes ?? []
            return quotes.length
          },
          { timeout: 20_000 },
        )
        .toBe(2)
      expect(quotes.map(wordsNamedBy)).toEqual([fromHome, fromTheReport])
      expect(quotes[1]?.target).toMatchObject({ kind: 'region', recordId: report })
    } finally {
      await context.close()
    }
  }, 120_000)
})
