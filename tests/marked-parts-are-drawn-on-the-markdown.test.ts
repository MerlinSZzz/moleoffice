// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENT MESSAGE'S MARKED PARTS ARE PAINTED ON ITS MARKDOWN, WHERE THEIR WORDS ARE DRAWN.
 *
 * A part names characters of the stored body. The bubble draws the body as Markdown, so a part is painted only on the
 * drawn characters whose place in the body is known. A formula, a record name drawn in place of its id, or a page
 * press is one drawn element: it is painted whole when a part covers all of its source, and otherwise not at all. A
 * part that cannot be painted where its words are drawn is not painted on a guess, and the bubble says beside its count
 * how many parts are not shown in the words.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office:
 *   (a) a part inside a table cell, and one on a heading cell, are painted in their cells.
 *   (b) the same words twice, with only the second marked, paint the second and not the first.
 *   (c) a part across a line join is painted on both lines.
 *   (d) a part on a link's words is painted on them, and so is a part over a whole link with its address.
 *   (e) a part on inline code is painted inside the code, with or without its back ticks.
 *   (f) a message with a quote in the middle paints a part on each side, in its own run of words.
 *   (g) a part over a whole formula paints the formula; one over half of it is not shown, and the bubble says so.
 *   (h) a part over a record id drawn as its name paints the name; one over half of the id is not shown.
 *   (i) a part only on Markdown syntax or only on a link's address is not shown, and the sentence counts them.
 *   (j) a part whose quote no longer matches the words is counted as not shown.
 *   (k) the message's own page draws the parts in the reader's flags, with the same count and sentence.
 *
 * The words are read from the word lists, never copied. Everything here is made up: the agent, the record, the
 * messages and the person's flags. In (j) the office's answer is changed in the browser, to stand for a stored part
 * whose words were changed; that answer is made up for this test and is never stored. The servers come from `liveApp`
 * in tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { enWave14d } from '../src/shared/words/en-wave-14d.ts'
import { messagePath } from '../src/web/components/router.tsx'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, theAnswerToAWriteInATestOffice, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The person's own colours for the two shipped flags, so a part drawn in them is drawn in the reader's flags. */
const SETTINGS = {
  'just-ask': { colour: 'purple', wordsColour: 'green' },
  'proposal-first': { colour: 'amber', wordsColour: 'red' },
}

type Plural = { one: string; other: string }
const plural = (words: Plural, n: number): string => (n === 1 ? words.one : words.other).replace('{n}', String(n))
const COUNT = (n: number): string => plural(enWave14d['chat.markedPartsCount'] as Plural, n)
const NOT_SHOWN = (n: number): string => plural((enWave13y as Record<string, unknown>)['chat.markedPartsNotShown'] as Plural, n)

let app: LiveApp
let agentId = ''
let sourceId = ''

interface APart {
  from: number
  to: number
  quote: string
  intent: 'just-ask' | 'proposal-first'
}

/** The part on the `nth` copy of `quote` in `body`, counted from 0. */
function partOn(body: string, quote: string, nth = 0, intent: APart['intent'] = 'just-ask'): APart {
  let from = -1
  for (let n = 0; n <= nth; n += 1) from = body.indexOf(quote, from + 1)
  expect(from, `"${quote}" is not in the words ${String(nth + 1)} times`).toBeGreaterThanOrEqual(0)
  return { from, to: from + quote.length, quote, intent }
}

async function send(body: string, parts: readonly APart[], extra: Record<string, unknown> = {}): Promise<string> {
  const data = { body, to: [{ kind: 'agent', id: agentId }], markedParts: parts, ...extra }
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ kind: 'message', title: 'Made-up marked message', data }),
  })
  const text = await filed.text()
  expect(filed.status, text).toBe(theAnswerToAWriteInATestOffice(AS_THE_OWNER, { kind: 'message', data }))
  return (JSON.parse(text) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'marked-parts-on-markdown', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ shippedFlags: SETTINGS }),
  })
  expect(changed.status, await changed.clone().text()).toBe(200)
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Painter', data: { handle: 'made-up-painter', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-painter')?.id ?? ''
  expect(agentId, 'made-up-painter has no registry row').not.toBe('')
  const source = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ kind: 'problem', title: 'Made-up source', data: {} }),
  })
  expect(source.status, await source.clone().text()).toBe(201)
  sourceId = ((await source.json()) as { record: { id: string } }).record.id
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-painter' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(line.status, await line.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function aWindow(before?: (context: BrowserContext) => Promise<void>): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
  })
  if (before !== undefined) await before(context)
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
  return { context, page }
}

/** The person's own bubble that draws `word`, once it is drawn. */
async function theBubble(page: Page, word: string): Promise<Locator> {
  const bubble = page.locator('.px-chat-one[data-mine="yes"]', { hasText: word })
  await bubble.first().waitFor({ timeout: 30_000 })
  expect(await bubble.count(), `more than one bubble draws "${word}"`).toBe(1)
  return bubble
}

interface APaint {
  words: string
  from: number
  to: number
  whole: boolean
  wordsColour: string | null
  flagColour: string | null
  /** The nearest of a cell, a heading cell, a link, a piece of code or a formula around or inside the paint. */
  on: string | null
}

/** Every painted run in `within`, in the order it is drawn. */
async function thePaint(within: Locator): Promise<APaint[]> {
  return within.locator('.px-chat-marked').evaluateAll((spans) => spans.map((span) => {
    const around = span.parentElement?.closest('td, th, a, code') ?? null
    const inside = span.querySelector('.mt, a, button')
    return {
      words: span.textContent ?? '',
      from: Number(span.getAttribute('data-from')),
      to: Number(span.getAttribute('data-to')),
      whole: span.getAttribute('data-whole') === 'yes',
      wordsColour: span.getAttribute('data-words-colour'),
      flagColour: span.getAttribute('data-flag-colour'),
      on: around !== null ? around.tagName.toLowerCase() : inside !== null ? (inside.classList.contains('mt') ? 'formula' : inside.tagName.toLowerCase()) : null,
    }
  }))
}

/** A painted run without its drawn words, for an element whose drawn words are not its stored ones: a formula or a name. */
function withoutTheWords(one: APaint): Omit<APaint, 'words'> {
  return { from: one.from, to: one.to, whole: one.whole, wordsColour: one.wordsColour, flagColour: one.flagColour, on: one.on }
}

/** What the foot says: the count, and the sentence beside it or null when every part is shown. */
async function theFoot(within: Locator): Promise<{ count: string | null; notShown: string | null }> {
  const count = within.locator('.px-chat-marked-count')
  const notShown = within.locator('.px-chat-marked-not-shown')
  return {
    count: (await count.count()) === 0 ? null : await count.first().textContent(),
    notShown: (await notShown.count()) === 0 ? null : await notShown.first().textContent(),
  }
}

const PAINTED = { wordsColour: 'green', flagColour: 'purple' }

describe('marked parts on the Markdown of a sent message', () => {
  it('(a) a part in a table cell and one on a heading cell are painted in their cells', async () => {
    const body = 'Cell test kumquat.\n\n| Fruit | Colour |\n| --- | --- |\n| apple | red |\n| pear | green |'
    const heading = partOn(body, 'Fruit')
    const cell = partOn(body, 'pear')
    await send(body, [heading, cell])
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'kumquat')
      await bubble.locator('.px-chat-words td').first().waitFor({ timeout: 30_000 })
      expect(await thePaint(bubble)).toEqual([
        { words: 'Fruit', from: heading.from, to: heading.to, whole: false, ...PAINTED, on: 'th' },
        { words: 'pear', from: cell.from, to: cell.to, whole: false, ...PAINTED, on: 'td' },
      ])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(2), notShown: null })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(b) the same words twice, with only the second marked, paint only the second', async () => {
    const body = 'Say plum once. Say plum twice.'
    const second = partOn(body, 'plum', 1)
    await send(body, [second])
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'plum twice')
      expect(second.from).toBeGreaterThan(body.indexOf('plum'))
      expect(await thePaint(bubble)).toEqual([{ words: 'plum', from: second.from, to: second.to, whole: false, ...PAINTED, on: null }])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(1), notShown: null })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(c) a part across a line join is painted on both lines', async () => {
    const body = 'First line of quince\nsecond line of quince'
    const across = partOn(body, 'of quince\nsecond')
    await send(body, [across])
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'second line of quince')
      expect(await bubble.locator('.px-chat-words br').count()).toBe(1)
      const joinAt = body.indexOf('\n')
      expect(await thePaint(bubble)).toEqual([
        { words: 'of quince', from: across.from, to: joinAt, whole: false, ...PAINTED, on: null },
        { words: 'second', from: joinAt + 1, to: across.to, whole: false, ...PAINTED, on: null },
      ])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(1), notShown: null })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(d) a part on a link\'s words, and one over a whole link with its address, paint the link\'s words', async () => {
    const body = 'Read [the guava notes](https://example.com/guava) and [the lime notes](https://example.com/lime) today.'
    const words = partOn(body, 'the guava notes')
    const whole = partOn(body, '[the lime notes](https://example.com/lime)')
    await send(body, [words, whole])
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'the lime notes')
      const lime = body.indexOf('the lime notes')
      expect(await thePaint(bubble)).toEqual([
        { words: 'the guava notes', from: words.from, to: words.to, whole: false, ...PAINTED, on: 'a' },
        { words: 'the lime notes', from: lime, to: lime + 'the lime notes'.length, whole: false, ...PAINTED, on: 'a' },
      ])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(2), notShown: null })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(e) a part on inline code is painted inside the code, with or without its back ticks', async () => {
    const body = 'Run `make mango` now and `make melon` later.'
    const inside = partOn(body, 'make mango')
    const withTicks = partOn(body, '`make melon`')
    await send(body, [inside, withTicks])
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'make melon')
      expect(await thePaint(bubble)).toEqual([
        { words: 'make mango', from: inside.from, to: inside.to, whole: false, ...PAINTED, on: 'code' },
        { words: 'make melon', from: withTicks.from + 1, to: withTicks.to - 1, whole: false, ...PAINTED, on: 'code' },
      ])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(2), notShown: null })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(f) a quote in the middle leaves a part on each side painted in its own run of words', async () => {
    const body = 'Before the quote, fig words.\nAfter the quote, date words.'
    const before = partOn(body, 'fig words')
    const after = partOn(body, 'date words')
    const quote = { target: { kind: 'record', recordId: sourceId, workspaceId: 'default' } }
    await send(body, [before, after], { quotes: [quote], quotePositions: [body.indexOf('After')] })
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'date words')
      const order = await bubble.locator('.px-chat-bubble > .px-chat-words, .px-chat-bubble > .px-chat-quotes').evaluateAll((all) => all.map((one) => one.className))
      expect(order).toEqual(['px-chat-words', 'px-chat-quotes', 'px-chat-words'])
      const runs = bubble.locator('.px-chat-bubble > .px-chat-words')
      expect(await thePaint(runs.nth(0))).toEqual([{ words: 'fig words', from: before.from, to: before.to, whole: false, ...PAINTED, on: null }])
      expect(await thePaint(runs.nth(1))).toEqual([{ words: 'date words', from: after.from, to: after.to, whole: false, ...PAINTED, on: null }])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(2), notShown: null })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(g) a part over a whole formula paints the formula, and one over half of it is not shown', async () => {
    const wholeBody = 'The area is $x^2+y^2$ for the walnut.'
    const whole = partOn(wholeBody, 'x^2+y^2')
    await send(wholeBody, [whole])
    const halfBody = 'The area is $a^2+b^2$ for the pecan.'
    await send(halfBody, [partOn(halfBody, 'a^2')])
    const { context, page } = await aWindow()
    try {
      const walnut = await theBubble(page, 'walnut')
      await walnut.locator('.px-chat-words .mt').first().waitFor({ timeout: 30_000 })
      const painted = await thePaint(walnut)
      expect(painted.map(withoutTheWords)).toEqual([{ from: whole.from, to: whole.to, whole: true, ...PAINTED, on: 'formula' }])
      expect(await theFoot(walnut)).toEqual({ count: COUNT(1), notShown: null })

      const pecan = await theBubble(page, 'pecan')
      await pecan.locator('.px-chat-words .mt').first().waitFor({ timeout: 30_000 })
      expect(await thePaint(pecan)).toEqual([])
      expect(await theFoot(pecan)).toEqual({ count: COUNT(1), notShown: NOT_SHOWN(1) })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(h) a part over a record id drawn as its name paints the name, and one over half of the id is not shown', async () => {
    const wholeBody = `See ${sourceId} for the hazelnut.`
    const whole = partOn(wholeBody, sourceId)
    await send(wholeBody, [whole])
    const halfBody = `See ${sourceId} for the filbert.`
    await send(halfBody, [partOn(halfBody, sourceId.slice(0, 6))])
    const { context, page } = await aWindow()
    try {
      const hazelnut = await theBubble(page, 'hazelnut')
      await hazelnut.locator('.px-chat-words a.px-in-link[data-named]').first().waitFor({ timeout: 30_000 })
      const painted = await thePaint(hazelnut)
      expect(painted.map(withoutTheWords)).toEqual([{ from: whole.from, to: whole.to, whole: true, ...PAINTED, on: 'a' }])
      expect(await theFoot(hazelnut)).toEqual({ count: COUNT(1), notShown: null })

      const filbert = await theBubble(page, 'filbert')
      await filbert.locator('.px-chat-words a.px-in-link[data-named]').first().waitFor({ timeout: 30_000 })
      expect(await thePaint(filbert)).toEqual([])
      expect(await theFoot(filbert)).toEqual({ count: COUNT(1), notShown: NOT_SHOWN(1) })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(i) a part only on Markdown syntax, or only on a link\'s address, is not shown, and the sentence counts them', async () => {
    const body = 'Only **stars** here, and [a link](https://example.com/cashew) to cashew.'
    const syntax = partOn(body, '**')
    const stars = partOn(body, 'stars')
    const address = partOn(body, 'https://example.com/cashew')
    await send(body, [syntax, stars, address])
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'to cashew')
      expect(await thePaint(bubble)).toEqual([{ words: 'stars', from: stars.from, to: stars.to, whole: false, ...PAINTED, on: null }])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(3), notShown: NOT_SHOWN(2) })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(j) a part whose quote no longer matches the words is counted as not shown', async () => {
    const body = 'A dropped part on the olive words.'
    await send(body, [partOn(body, 'olive words')])
    // THE OFFICE'S ANSWER, CHANGED IN THIS BROWSER ONLY: the part's quote no longer matches the words it names.
    const changeTheQuote = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(changeTheQuote)
      else if (typeof value === 'object' && value !== null) {
        const one = value as Record<string, unknown>
        if (one['body'] === body && Array.isArray(one['markedParts'])) {
          for (const part of one['markedParts'] as Record<string, unknown>[]) part['quote'] = 'olive wordz'
        }
        Object.values(one).forEach(changeTheQuote)
      }
    }
    const { context, page } = await aWindow(async (one) => {
      await one.route('**/api/messages**', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue()
          return
        }
        const response = await route.fetch()
        const text = await response.text()
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          await route.fulfill({ response, body: text })
          return
        }
        changeTheQuote(json)
        await route.fulfill({ response, body: JSON.stringify(json) })
      })
    })
    try {
      const bubble = await theBubble(page, 'olive words')
      expect(await thePaint(bubble)).toEqual([])
      expect(await theFoot(bubble)).toEqual({ count: COUNT(1), notShown: NOT_SHOWN(1) })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(k) the message\'s own page paints the parts in the reader\'s flags, with the same count and sentence', async () => {
    const body = 'Page words: **bold apricot** and $p^2$ apricot.'
    const bold = partOn(body, 'bold apricot')
    const half = { from: body.indexOf('p^2'), to: body.indexOf('p^2') + 1, quote: 'p', intent: 'just-ask' as const }
    const id = await send(body, [bold, half])
    const { context, page } = await aWindow()
    try {
      const bubble = await theBubble(page, 'Page words')
      const inTheChat = await theFoot(bubble)
      expect(inTheChat).toEqual({ count: COUNT(2), notShown: NOT_SHOWN(1) })

      await page.goto(`${app.site}/?lang=en#${messagePath(id)}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const words = page.locator('.mp-body')
      await words.locator('.px-chat-marked').first().waitFor({ timeout: 30_000 })
      expect(await thePaint(words)).toEqual([{ words: 'bold apricot', from: bold.from, to: bold.to, whole: false, ...PAINTED, on: null }])
      expect(await theFoot(page.locator('.mp'))).toEqual(inTheChat)
    } finally {
      await context.close()
    }
  }, 180_000)
})
