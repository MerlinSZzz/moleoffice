// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY CARD OF THE DRAWING IN AREAS SAYS ITS STATE IN WORDS, AND A CARD IS SELECTED BY POINTER AND BY KEYBOARD. Wave 13u
 * round 230, PV-2, criteria 3 and 4. The drawing is the one that PV-2's page decision puts on a pipeline's page; the
 * made-up office and the reading of the drawing are in tests/a-made-up-office-drawn-in-lanes.ts.
 *
 * THE WORDS ARE THE WORD FILES' OWN. Each chip's expected text is stateWord in src/shared/words.ts, given the card's
 * stored state and the record's kind, as the cards of today's canvas call it. A card with no stored state carries
 * data-state "unrecorded" on its chip and says stateWord(null), "not recorded". The wave's supervisor settled both for round
 * 230. The modules of this office are stored with no state, so each module's card is one with none.
 *
 * WHAT IS PROVED, case by case:
 *   1-4. criterion 3, at 1440 and at 390, in the light theme and in the dark one: on the pipeline drawn in areas and on
 *      the master at its Boxes level, every card holds exactly one chip; the chip's data-state is the record's stored
 *      state, or "unrecorded" when none is stored; the card's own data-state is the stored state and is absent when
 *      none is stored; the chip's text is the word stateWord gives; and the pipeline drawn in areas shows each of the
 *      five step states and "unrecorded", with every one of its steps and modules a card.
 *   5. criterion 4, by pointer: pressing a card away from its title selects it: aria-pressed "true", data-selected on
 *      the card and on the drawing, data-lit on each card one of its drawn lines reaches, data-dim on every other card,
 *      and aria-pressed "false" on each card not selected; pressing another card moves the selection; Escape clears it,
 *      leaving no data-selected, data-lit or data-dim anywhere in the drawing.
 *   6. criterion 4, by keyboard: every card has role "button" and tabindex 0, and Tab reaches every card in the order
 *      the document holds them; Enter on a card selects it as in case 5, Escape clears it, and Space selects too.
 *   7. criterion 4: pressing a card's title, by pointer and by Enter, opens the title's page and selects no card on
 *      the way: nothing in the page gains data-selected or aria-pressed "true" between the press and the new address.
 *
 * MUTATIONS, wave 13u round 230, each run after a control run of this file at 12cd2330e in which all seven cases were
 * green, each file copied first and restored with cp and checked with cmp, each in
 * src/web/components/graph/lanes/engine.ts, line numbers as at 12cd2330e:
 *   - line 144, the card's chip says record.state instead of stateWord's word: cases 1-4 red ("todo" where the word is
 *     "to do"), 5-7 green;
 *   - line 1729, the card's click handler selects nothing: case 5 red, the rest green;
 *   - line 1729, the click handler's closest("a") test taken out, so a press on a title selects its card: case 7 red,
 *     the rest green;
 *   - line 1734, the card's keydown handler selects nothing, keeping its preventDefault: case 6 red, the rest green.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { stateWord } from '../src/shared/words.ts'
import { pipelinePath, recordPath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import {
  DRAWING,
  MODULES,
  PROJECT,
  STEPS,
  aPlaceOnTheCard,
  buildTheMadeUpOffice,
  cardOf,
  openThePage,
  prepareThePage,
  readTheCards,
  readTheDrawing,
  theAreasWereStored,
  theDrawingHoldsStill,
  theDrawingIsDrawn,
  writerFor,
  type DrawnCard,
  type MadeUpOffice,
  type TheDrawing,
} from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let office: MadeUpOffice

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-cards', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

// ====================================================================================== criterion 3: the state chips

function eachCardSaysItsState(cards: DrawnCard[], where: string): void {
  expect(cards.length, `${where}: cards to read`).toBeGreaterThan(0)
  for (const card of cards) {
    const kind = office.kindOf[card.id]
    expect(kind, `${where}: card ${card.id} is a record this office made`).toBeDefined()
    const stored = office.stateOf[card.id] ?? null
    const what = `${where}: the card of a ${kind!} stored ${stored === null ? 'with no state' : `as ${stored}`}`
    expect(card.chips.length, `${what} holds one state chip (.e-chip)`).toBe(1)
    expect(card.state, `${what}: the card's data-state`).toBe(stored)
    expect(card.chips[0]!.state, `${what}: the chip's data-state`).toBe(stored ?? 'unrecorded')
    expect(card.chips[0]!.text, `${what}: the chip's words`).toBe(stateWord(stored, 'normal', kind).text)
  }
}

const WIDTHS = [
  { width: 1440, height: 1000, outline: false },
  { width: 390, height: 844, outline: true },
] as const

for (const size of WIDTHS) {
  for (const theme of ['light', 'dark'] as const) {
    it(`criterion 3: every card holds a chip that says its state in the word files' words, at ${String(size.width)}, ${theme}`, async () => {
      theAreasWereStored(office.areas, 'the pipeline drawn in areas')
      await app.page.setViewportSize({ width: size.width, height: size.height })
      try {
        await openThePage(app, pipelinePath(office.id['drawn']!), theme)
        await theDrawingIsDrawn(app.page, { outline: size.outline })
        const drawn = await readTheCards(app.page)
        eachCardSaysItsState(drawn, `the pipeline drawn in areas at ${String(size.width)}, ${theme}`)
        const ids = drawn.map((card) => card.id)
        for (const key of [...STEPS.map((step) => step.name), ...MODULES]) expect(ids, `${key} is a card`).toContain(office.id[key])
        const states = new Set(drawn.map((card) => card.chips[0]!.state))
        for (const state of ['todo', 'doing', 'done', 'failed', 'blocked', 'unrecorded']) expect([...states], `a chip says ${state}`).toContain(state)

        await openThePage(app, pipelinePath(office.id['master']!), theme)
        await theDrawingIsDrawn(app.page, { outline: size.outline })
        eachCardSaysItsState(await readTheCards(app.page), `the master at ${String(size.width)}, ${theme}`)
      } finally {
        await app.page.setViewportSize({ width: 1440, height: 1000 })
      }
    }, 120_000)
  }
}

// ======================================================================================== criterion 4: selecting

/** The cards one card's lines reach while it is selected: its links drawn at rest or named for its selection. */
function theCardsItReaches(drawing: TheDrawing, selected: string): Set<string> {
  const drawn = new Set([...drawing.drawnLinks, ...(drawing.onSelection[selected] ?? [])])
  const cards = new Set(drawing.cards.map((card) => card.id))
  const reached = new Set<string>()
  for (const [key, ends] of Object.entries(office.ends)) {
    if (!drawn.has(office.link[key]!)) continue
    const [from, to] = [office.id[ends.from]!, office.id[ends.to]!]
    if (from === selected && cards.has(to)) reached.add(to)
    if (to === selected && cards.has(from)) reached.add(from)
  }
  return reached
}

async function theSelectionIs(key: string, how: string): Promise<void> {
  const selected = office.id[key]!
  await app.page.locator(`${DRAWING}[data-selected="${selected}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined)
  await theDrawingHoldsStill(app.page)
  const drawing = await readTheDrawing(app.page)
  expect(drawing.selected, `${how}: the drawing's data-selected names ${key}`).toBe(selected)
  const lit = theCardsItReaches(drawing, selected)
  expect(lit.size, `${how}: a line of ${key} reaches another card`).toBeGreaterThan(0)
  for (const card of drawing.cards) {
    const is = card.id === selected
    expect(card.pressed, `${how}: aria-pressed of card ${card.id}`).toBe(is ? 'true' : 'false')
    expect(card.selected, `${how}: data-selected on card ${card.id}`).toBe(is)
    expect(card.lit, `${how}: data-lit on card ${card.id}`).toBe(!is && lit.has(card.id))
    expect(card.dim, `${how}: data-dim on card ${card.id}`).toBe(!is && !lit.has(card.id))
  }
}

async function nothingIsSelected(how: string): Promise<void> {
  await app.page.locator(`${DRAWING}:not([data-selected])`).waitFor({ timeout: 10_000 }).catch(() => undefined)
  await theDrawingHoldsStill(app.page)
  const marked = await app.page.evaluate(
    (selector) => [...document.querySelectorAll(`${selector}, ${selector} [data-selected], ${selector} [data-lit], ${selector} [data-dim]`)]
      .filter((el) => el.matches('[data-selected], [data-lit], [data-dim]'))
      .map((el) => el.getAttribute('data-id') ?? el.tagName),
    DRAWING,
  )
  expect(marked, `${how}: nothing in the drawing is selected, lit or dimmed`).toEqual([])
  for (const card of (await readTheDrawing(app.page)).cards) expect(card.pressed, `${how}: aria-pressed of card ${card.id}`).toBe('false')
}

async function pressTheCard(key: string): Promise<void> {
  const place = await aPlaceOnTheCard(app.page, office.id[key]!)
  await app.page.mouse.click(place.x, place.y)
}

async function openTheDrawnPipeline(): Promise<void> {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
}

it('criterion 4: a pointer press selects a card and lights its neighbours, another press moves the selection, and Escape clears it', async () => {
  await openTheDrawnPipeline()
  await pressTheCard('next')
  await theSelectionIs('next', 'a press on the card next')
  await pressTheCard('counter')
  await theSelectionIs('counter', 'a press on the card counter, after next')
  await app.page.keyboard.press('Escape')
  await nothingIsSelected('Escape after a pointer press')
}, 120_000)

it('criterion 4: Tab reaches every card in order, Enter and Space select a card, and Escape clears it', async () => {
  await openTheDrawnPipeline()
  const cards = (await readTheDrawing(app.page)).cards
  for (const card of cards) {
    expect(card.buttonRole, `card ${card.id} has role "button"`).toBe('button')
    expect(card.tabIndex, `card ${card.id} has tabindex 0`).toBe('0')
  }
  const order = cards.map((card) => card.id)
  const focused = (): Promise<string> =>
    app.page.evaluate((selector) => {
      const now = document.activeElement
      const root = document.querySelector(selector)
      if (now === null || root === null || !root.contains(now)) return 'outside'
      const card = now.closest('.e-card')
      return card === now ? `card ${card.getAttribute('data-id') ?? ''}` : 'inside'
    }, DRAWING)
  await app.page.locator(cardOf(order[0]!)).focus()
  await app.page.keyboard.press('Shift+Tab')
  const reached: string[] = []
  let entered = false
  for (let press = 0; press < order.length * 3 + 20; press += 1) {
    await app.page.keyboard.press('Tab')
    const now = await focused()
    if (now === 'outside' && entered) break
    if (now !== 'outside') entered = true
    if (now.startsWith('card ')) reached.push(now.slice('card '.length))
  }
  expect(reached, 'the cards Tab reaches, in the order it reaches them').toEqual(order)

  await app.page.locator(cardOf(office.id['start']!)).focus()
  await app.page.keyboard.press('Enter')
  await theSelectionIs('start', 'Enter on the card start')
  await app.page.keyboard.press('Escape')
  await nothingIsSelected('Escape after Enter')
  await app.page.locator(cardOf(office.id['partly']!)).focus()
  await app.page.keyboard.press('Space')
  await theSelectionIs('partly', 'Space on the card partly')
  await app.page.keyboard.press('Escape')
  await nothingIsSelected('Escape after Space')
}, 120_000)

it('criterion 4: pressing a card’s title opens its page and selects no card, by pointer and by Enter', async () => {
  for (const [key, how] of [['reader', 'pointer'], ['writer', 'Enter']] as const) {
    await openTheDrawnPipeline()
    await app.page.evaluate(() => {
      const seen: string[] = []
      Reflect.set(window, '__aSelectionWasSeen', seen)
      new MutationObserver((changes) => {
        for (const change of changes) {
          const element = change.target as Element
          const value = element.getAttribute(change.attributeName ?? '')
          const selects = (change.attributeName === 'data-selected' && value !== null) || (change.attributeName === 'aria-pressed' && value === 'true')
          if (selects) seen.push(`${change.attributeName ?? ''}="${value ?? ''}" on ${element.getAttribute('data-id') ?? element.tagName}`)
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-selected', 'aria-pressed'] })
    })
    const title = app.page.locator(`${cardOf(office.id[key]!)} .e-title`)
    if (how === 'pointer') await title.click()
    else {
      await title.focus()
      await app.page.keyboard.press('Enter')
    }
    await app.page.waitForURL(`**#${recordPath(office.id[key]!, 'module')}`, { timeout: 30_000 })
    const seen = await app.page.evaluate(() => Reflect.get(window, '__aSelectionWasSeen') as string[])
    expect(seen, `a ${how} press on the title of module ${key} selected nothing`).toEqual([])
  }
}, 120_000)
