// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S COMMENT CARD TAKES ITS OWN SPACE AND COVERS NONE OF THE REPORT'S WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, AND WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M7 of design/messages/ACCEPTANCE.md: the agent picks out a region and shows its
 * explanation on it. An explanation that
 * hides the words either side of the one it points at makes the page harder to read than it was
 * before the agent said anything, and a reader who does not know the text is missing cannot tell
 * that anything is hidden.
 *
 * That is what the card did. It was drawn over the page at the bottom edge of the thing it was
 * about, and the space under a block of a report is the next block. Measured on 4 September 2026 at
 * 1440, 990, 660 and 390 in both themes: the card hid the whole of the next heading and the left of
 * three lines under it, between 3,400 and 84,500 square pixels of report text per card. Problem
 * `wj_-d8h0PAOM`.
 *
 * The card is still drawn over the page, because it has to line up with something the report's own
 * components drew. What changed is that the page now MAKES ROOM for it: the element it hangs under
 * is given a bottom margin as tall as the card, so what comes next starts below it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS TEST COMPARES, AND WHY IT IS THE WORDS AND NOT THE BOXES
 * ---------------------------------------------------------------------------------------
 *
 * Every card is inside the box of the record it is on, and inside the box of the page: those two
 * overlaps are not a fault and can never be removed. What must never be covered is a word a reader
 * is trying to read. So the things compared are the elements of the record that DRAW WORDS
 * THEMSELVES — an element with writing directly inside it, not one that merely holds other
 * elements — and only the ones a reader can actually see.
 *
 * The last part matters: a closed fold on a record page leaves its panel laid out and unpainted,
 * with a real rectangle where nothing is drawn. `checkVisibility` is what tells the two apart.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let reportId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'lead-bot',
}

/** Long enough to wrap at every width, so a card that covered it would cover several lines. */
const PARAGRAPH =
  'Without a warrant, on a fork another agent filed, a close from an agent is refused as the rules ' +
  'say it must be, and the refusal names the sentence it wants. The reply carries the whole of the ' +
  'reason, so nobody has to guess which of the four checks it failed.'

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/**
 * WHAT EACH CARD ON THIS PAGE COVERS, IN SQUARE PIXELS, WORST FIRST.
 *
 * Run inside the browser. It is written out here rather than in a helper because the whole of the
 * fault this file is about is a rectangle over another rectangle, and a reader of a failure has to
 * be able to see exactly which two.
 */
/**
 * WAIT UNTIL EVERY CARD HAS BEEN PLACED AGAINST THE PAGE AS IT IS NOW.
 *
 * A width change rewraps the report, which moves the block the card hangs under, and the card is
 * placed from a measurement taken after that. So for a moment after a resize the card is still where
 * the last width put it. This waits for the card to be at the bottom of its own block again, which
 * is where it is placed whether or not the page has made room for it — so a run with the room taken
 * out gets past this wait and fails on what it covers, rather than timing out here.
 */
async function everyCardIsPlaced(page: LiveApp['page']): Promise<void> {
  await page.waitForFunction(
    () => {
      const cards = [...document.querySelectorAll('.px-said')]
      if (cards.length === 0) return false
      return cards.every((card) => {
        const key = card.getAttribute('data-said-on') ?? ''
        const block = key.slice(key.lastIndexOf('%5B%23') + 6).replace('%5D', '')
        const under = document.querySelector(`[data-target$="${block}"]`)
        if (!(under instanceof HTMLElement)) return false
        const box = card.getBoundingClientRect()
        if (box.height === 0) return false
        return Math.abs(box.top - (under.getBoundingClientRect().bottom + 8)) <= 1
      })
    },
    undefined,
    { timeout: 30_000 },
  )
}

async function whatTheCardsCover(page: LiveApp['page']): Promise<{ over: string; px: number }[]> {
  return page.evaluate(() => {
    const overlap = (a: DOMRect, b: DOMRect): number =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    /** True when this element has writing of its own, rather than only holding other elements. */
    const drawsWords = (one: Element): boolean =>
      [...one.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '')
    const cards = [...document.querySelectorAll('.px-said')]
    const words = [...document.querySelectorAll('article.rp *')].filter(
      (one) =>
        one.closest('.px-said') === null &&
        drawsWords(one) &&
        one.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
    )
    const out: { over: string; px: number }[] = []
    for (const card of cards) {
      const cardBox = card.getBoundingClientRect()
      for (const one of words) {
        const px = overlap(cardBox, one.getBoundingClientRect())
        if (px > 0) out.push({ over: `${one.tagName} "${(one.textContent ?? '').trim().slice(0, 40)}"`, px: Math.round(px) })
      }
    }
    return out.sort((a, b) => b.px - a.px)
  })
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'card-covers-nothing', viewport: { width: 1440, height: 972 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Lead Bot',
    data: { handle: 'lead-bot', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  const report = await write(AS_THE_OWNER, {
    kind: 'report',
    title: 'An independent check of the warrant: could an agent forge authority?',
    data: {
      for: `${THE_TEST_OFFICES_OWNER.name}, who asked whether the warrant can be forged`,
      date: '2026-09-04',
      blocks: [
        { id: 'b-what', type: 'text', heading: 'What was checked', text: PARAGRAPH },
        { id: 'b-refusals', type: 'text', heading: 'The refusals', text: PARAGRAPH },
        { id: 'b-forgery', type: 'text', heading: 'Forgery', text: PARAGRAPH },
        { id: 'b-act', type: 'text', heading: 'The human act', text: PARAGRAPH },
      ],
    },
  })
  const written = (await report.json()) as { record?: { id: string } }
  expect(report.status, JSON.stringify(written)).toBe(201)
  reportId = written.record?.id ?? ''

  // A MIDDLE BLOCK, AND TWO TURNS ON IT. The first is where the fault was worst — there is a whole
  // report under it to cover — and the second is what made the card tall enough to reach the card
  // below it as well.
  for (const words of [
    'I found the section about refusals. This is the paragraph I want you to read.',
    'A second turn about the same place, which is what made the card grow.',
  ]) {
    const said = await write(AS_AN_AGENT, {
      kind: 'message',
      title: words.slice(0, 40),
      data: {
        body: words,
        target: { target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-refusals]' } },
      },
    })
    expect(said.status, await said.text()).toBe(201)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe("an agent's comment card is drawn in room the page makes for it", () => {
  it('covers none of the report at 1440, 990, 660 or 390', async () => {
    await app.page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    for (const width of [1440, 990, 660, 390]) {
      await app.page.setViewportSize({ width, height: 972 })
      await waitForThePage(app.page, 60_000)
      await app.page.waitForSelector('.px-said', { timeout: 30_000 })
      await everyCardIsPlaced(app.page)
      const covered = await whatTheCardsCover(app.page)
      expect(covered, `at ${String(width)} the card covers: ${JSON.stringify(covered.slice(0, 4))}`).toEqual([])
    }
  }, 180_000)

  it('makes room as tall as the card, so what comes next starts below it', async () => {
    await app.page.setViewportSize({ width: 1440, height: 972 })
    await waitForThePage(app.page, 60_000)
    await everyCardIsPlaced(app.page)
    const measured = await app.page.evaluate(() => {
      const card = document.querySelector('.px-said')
      const blocks = [...document.querySelectorAll('[data-target^="reportBlock/"]')]
      const at = blocks.findIndex((one) => (one.getAttribute('data-target') ?? '').endsWith('b-refusals'))
      const under = blocks[at]
      const next = blocks[at + 1]
      if (card === null || !(under instanceof HTMLElement) || next === undefined) return null
      return {
        cardHeight: Math.round(card.getBoundingClientRect().height),
        room: Math.round(Number.parseFloat(under.style.marginBottom)),
        cardBottom: Math.round(card.getBoundingClientRect().bottom),
        nextTop: Math.round(next.getBoundingClientRect().top),
      }
    })
    expect(measured).not.toBeNull()
    const held = measured as { cardHeight: number; room: number; cardBottom: number; nextTop: number }
    expect(held.cardHeight).toBeGreaterThan(0)
    // The room is the card and the gap either side of it, so it is always taller than the card.
    expect(held.room).toBeGreaterThan(held.cardHeight)
    // THE BLOCK AFTER IT STARTS BELOW THE CARD, which is the whole point of the room.
    expect(held.nextTop).toBeGreaterThanOrEqual(held.cardBottom)
  }, 120_000)

  it('puts the page back when the card goes, rather than leaving a gap nobody asked for', async () => {
    await app.page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-said', { timeout: 30_000 })
    await everyCardIsPlaced(app.page)
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    // Back on the page, the room is made once and is not made twice: a second visit that added a
    // second card's worth of margin would grow the page a little every time it was opened.
    await app.page.waitForSelector('.px-said', { timeout: 30_000 })
    await everyCardIsPlaced(app.page)
    const again = await whatTheCardsCover(app.page)
    expect(again, `after coming back the card covers: ${JSON.stringify(again.slice(0, 4))}`).toEqual([])
  }, 180_000)
})
