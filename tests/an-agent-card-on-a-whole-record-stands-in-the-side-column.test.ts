// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S CARD ON A WHOLE RECORD STANDS AT THE TOP OF THE SIDE COLUMN ON A WIDE SCREEN, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * When an agent comments on a whole record, its card hangs under the record's head, at the head's
 * right edge, under the comment count. To make room, the head is given a bottom margin as tall as
 * the card, so the record's first column starts one card lower. On a wide screen that leaves a wide
 * empty band across the page, and the record's own words start below it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS CHECKS, ON ONE PAGE, IN THIS ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   at 1440: the card stands at the top of the record's second column, inside it, and covers nothing
 *            in it. The head has no margin, so the first column starts right under the head. The
 *            room is the column's own top padding.
 *   at 1000: the two columns stand one under the other, so the card hangs under the head as before,
 *            the head makes the room, and the column's padding is put back.
 *   at 1440 again: the head's margin is put back, and the card stands in the column again.
 *
 * THE RECORD IS A TASK. A task declares `whose_move`, so the record page always draws who has the next
 * move in the second column. That column therefore holds something, and from the wide-screen width
 * it stands beside the first. A report would not do: its facts stand under it, across the page.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let recordId = ''

/** The window's height, the one the page comment test opens with. No case reads anything that depends on it. */
const TALL = 972

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

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'card-in-the-side-column', viewport: { width: 1440, height: TALL } })

  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Lead Bot',
    data: { handle: 'lead-bot', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)

  const task = await write(AS_THE_OWNER, {
    kind: 'task',
    title: 'A made-up task whose facts stand beside it',
    data: { whose_move: 'person' },
  })
  const written = (await task.json()) as { record?: { id: string } }
  expect(task.status, JSON.stringify(written)).toBe(201)
  recordId = written.record?.id ?? ''

  // THE COMMENT ON THE WHOLE RECORD: a target on the record, at the page's surface, not a region of it.
  const said = await write(AS_AN_AGENT, {
    kind: 'message',
    title: 'A note about the whole task',
    data: {
      body: 'This is my note about the whole of this task. Answer me here.',
      to: [{ kind: 'person', id: THE_PERSON }],
      target: { target: { kind: 'record', recordId, workspaceId: 'default' }, place: { at: 'surface' } },
    },
  })
  expect(said.status, await said.text()).toBe(201)

  await app.page.goto(`${app.site}/#/r/${recordId}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-said', { timeout: 30_000 })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface Drawn {
  card: Box | null
  head: Box | null
  main: Box | null
  side: Box | null
  firstInSide: Box | null
  /** The head's own inline bottom margin, or null when there is no head. */
  headMargin: string | null
  /** The side column's own inline top padding, or null when there is no side column. */
  sidePadding: string | null
}

/**
 * The boxes of the card, the head, the two columns and the side column's first element, all in the
 * window's coordinates and read in one pass after two frames, with the inline room on the head and
 * the column.
 */
async function whatIsDrawn(): Promise<Drawn> {
  return app.page.evaluate(async () => {
    await new Promise<void>((done) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          done()
        })
      })
    })
    const box = (el: Element | null | undefined) => {
      if (el === null || el === undefined) return null
      const at = el.getBoundingClientRect()
      return { left: at.left, top: at.top, right: at.right, bottom: at.bottom, width: at.width, height: at.height }
    }
    const head = document.querySelector('article.rp > header.rp-head')
    const side = document.querySelector('article.rp > .rp-sides > .rp-side')
    return {
      card: box(document.querySelector('.px-said')),
      head: box(head),
      main: box(document.querySelector('article.rp > .rp-sides > .rp-main')),
      side: box(side),
      firstInSide: box(side?.firstElementChild),
      headMargin: head instanceof HTMLElement ? head.style.marginBottom : null,
      sidePadding: side instanceof HTMLElement ? side.style.paddingTop : null,
    }
  })
}

/**
 * THE PAGE ONCE THE CARD HAS STOPPED MOVING. The card is placed twice, once with no width and again
 * after it is drawn, and the room it makes moves the page again. So this reads the page until two
 * readings in a row are the same and the card has a height.
 */
async function theSettledPage(width: number): Promise<Drawn> {
  await app.page.setViewportSize({ width, height: TALL })
  const last: { drawn: Drawn | null; was: string } = { drawn: null, was: '' }
  try {
    await expect
      .poll(
        async () => {
          const drawn = await whatIsDrawn()
          const now = JSON.stringify(drawn)
          const same = now === last.was
          last.was = now
          last.drawn = drawn
          return same && (drawn.card?.height ?? 0) > 0
        },
        { timeout: 30_000 },
      )
      .toBe(true)
  } catch (failed) {
    // THE LAST READING IS ADDED TO THE FAILURE HERE, because a poll's own message is written before its first reading.
    throw new Error(`the card's place at ${String(width)} never settled; the last reading was ${last.was}`, { cause: failed })
  }
  if (last.drawn === null) throw new Error(`nothing was read at ${String(width)}`)
  return last.drawn
}

/** Every box the cases read, or a failure that names the one missing. */
function theBoxes(drawn: Drawn): { card: Box; head: Box; main: Box; side: Box; firstInSide: Box } {
  const { card, head, main, side, firstInSide } = drawn
  if (card === null) throw new Error(`the agent's card is not drawn: ${JSON.stringify(drawn)}`)
  if (head === null) throw new Error(`the record has no head: ${JSON.stringify(drawn)}`)
  if (main === null) throw new Error(`the record has no first column: ${JSON.stringify(drawn)}`)
  if (side === null) throw new Error(`the record has no side column: ${JSON.stringify(drawn)}`)
  if (firstInSide === null) throw new Error(`the side column holds nothing: ${JSON.stringify(drawn)}`)
  return { card, head, main, side, firstInSide }
}

/** Cases 1 and 3: the card stands at the top of the side column and covers nothing. */
function theCardStandsInTheSideColumn(drawn: Drawn): void {
  const { card, main, side, firstInSide } = theBoxes(drawn)
  const words = JSON.stringify(drawn)

  expect(
    side.width > 0 && side.left >= main.right,
    `the record was made so its side column is drawn beside the first, and it is not: ${words}`,
  ).toBe(true)

  expect(card.left, `the card starts left of the side column: ${words}`).toBeGreaterThanOrEqual(side.left - 1)
  expect(card.right, `the card ends right of the side column: ${words}`).toBeLessThanOrEqual(side.right + 1)
  expect(Math.abs(card.top - side.top), `the card is not at the side column's top: ${words}`).toBeLessThanOrEqual(1)
  expect(firstInSide.top, `the card covers the side column's first element: ${words}`).toBeGreaterThanOrEqual(card.bottom - 1)

  const overlaps = card.left < main.right && main.left < card.right && card.top < main.bottom && main.top < card.bottom
  expect(overlaps, `the card covers part of the first column: ${words}`).toBe(false)

  expect(drawn.headMargin, `the head is given a margin: ${words}`).toBe('')
  expect(drawn.sidePadding, `the side column is given no room: ${words}`).not.toBe('')
  expect(
    Number.parseFloat(drawn.sidePadding ?? ''),
    `the side column's room is shorter than the card: ${words}`,
  ).toBeGreaterThanOrEqual(card.height)
}

describe("an agent's card on a whole record", () => {
  it('stands at the top of the side column at 1440, and the first column starts right under the head', async () => {
    theCardStandsInTheSideColumn(await theSettledPage(1440))
  }, 180_000)

  it('hangs under the head at 1000, below the side-by-side width, and the column is put back', async () => {
    const drawn = await theSettledPage(1000)
    const { card, head } = theBoxes(drawn)
    const words = JSON.stringify(drawn)
    expect(card.top, `the card starts above the head's bottom: ${words}`).toBeGreaterThanOrEqual(head.bottom)
    expect(Math.abs(card.right - head.right), `the card is not lined up with the head's right edge: ${words}`).toBeLessThanOrEqual(2)
    expect(drawn.headMargin, `the head makes no room for the card: ${words}`).not.toBe('')
    expect(drawn.sidePadding, `the side column keeps its room: ${words}`).toBe('')
  }, 180_000)

  it('stands in the side column again back at 1440, and the head is put back', async () => {
    const drawn = await theSettledPage(1440)
    expect(drawn.headMargin, `the head keeps its margin: ${JSON.stringify(drawn)}`).toBe('')
    theCardStandsInTheSideColumn(drawn)
  }, 180_000)
})
