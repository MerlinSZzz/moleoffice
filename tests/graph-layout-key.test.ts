// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH LAYOUT THE POSITIONS ON SCREEN BELONG TO — every fact that changes a box's size.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT THIS FILE HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * `Canvas.tsx` used to key the layout on the drawing and the RUNGS of its cards, and nothing else. A
 * rung is one of nine words, and plenty of things make a card taller or wider without touching it.
 * Round ten wave 11's step 6c names the worst case in its own words: a card going *252px → 448px
 * changes no rung, asks for no new layout, and is drawn 196px over its neighbour.*
 *
 * The cases this file walks are all of that shape. Each one changes a box and, keyed on the rung
 * alone, changes nothing about the key — so the drawing keeps positions ELK worked out for boxes
 * that are no longer the boxes on screen.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE OTHER HALF, WHICH IS WHAT MAKES IT A KEY AND NOT A CLOCK
 * ---------------------------------------------------------------------------------------
 *
 * A key that changed on everything would ask for a new layout on every draw, and a re-layout throws
 * away the positions and re-opens the view — the fault `viewedFor` in `Canvas.tsx` exists to
 * prevent. So the last test asserts the key does NOT move when something changes that cannot change
 * a box's size.
 */
import { beforeAll, describe, expect, it } from 'vitest'

type CardModule = typeof import('../src/web/components/graph/card.ts')
type CardShapeForLayout = CardModule extends { layoutKeyFor: (a: string, b: readonly (infer T)[]) => string }
  ? T
  : never

let card: CardModule
const layoutKeyFor = (drawing: string, cards: readonly CardShapeForLayout[]): string =>
  card.layoutKeyFor(drawing, cards)

// `card.ts` reaches the workspace store on import, which reads `window.localStorage`. The suite's
// other graph files stand one up the same way rather than pulling in a whole DOM.
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  card = await import('../src/web/components/graph/card.ts')
})

/** One card's shape, with only the fields the key reads. */
const aCard = (over: Partial<CardShapeForLayout> = {}): CardShapeForLayout => ({
  plan: {
    rung: 'R4',
    tier: 'ordinary',
    earns: 'in-order',
    says: 'title',
    level: 'title',
    size: 'usual',
    room: 1,
    height: null,
    width: null,
    levelFrom: 'size',
    missing: null,
    identity: { text: 'Pixel segmentation', from: 'title', field: 'title' } as never,
  },
  presence: 0,
  restricted: false,
  room: 1,
  ...over,
})

/** The key for a two-card drawing, with the first card changed. */
const keyWith = (first: Partial<CardShapeForLayout>): string =>
  layoutKeyFor('modules@structure', [aCard(first), aCard({ plan: { ...aCard().plan, identity: null } })])

const asShipped = (): string => keyWith({})

describe('a change that makes a card a different size asks for a new layout', () => {
  it('moves when a reader drags a card wider — the step’s own 252px to 448px case', () => {
    expect(keyWith({ room: 1.3 })).not.toBe(asShipped())
    expect(keyWith({ room: 1.3 })).not.toBe(keyWith({ room: 0.8 }))
  })

  it('moves on a drag that has not yet crossed a size word, because the box has still changed', () => {
    // THE SHARE AND NOT THE WORD, which is what a drag sets — criterion D13, 6 September 2026. A
    // card dragged from 1.00 to 1.12 is still called `usual` and is 35 pixels wider, and a key on
    // the word alone would leave it drawn over its neighbour with no new layout asked for.
    expect(keyWith({ room: 1.12 })).not.toBe(asShipped())
  })

  it('moves when somebody starts working on a card, which adds a row about 17px tall', () => {
    expect(keyWith({ presence: 1 })).not.toBe(asShipped())
    // AND WHEN A SECOND PERSON ARRIVES. Two names on one row is not the same box as one.
    expect(keyWith({ presence: 2 })).not.toBe(keyWith({ presence: 1 }))
  })

  it('moves when a restriction mark appears on a card that had no mark row', () => {
    expect(keyWith({ restricted: true })).not.toBe(asShipped())
  })

  it('moves when the name a card draws changes, at the same rung', () => {
    const other = { ...aCard().plan, identity: { text: 'Point-cloud projection', from: 'title', field: 'title' } as never }
    expect(keyWith({ plan: other })).not.toBe(asShipped())
  })

  it('moves when two names of the same length swap, because they wrap in different places', () => {
    // `Model-to-bench growth check` and `Airflow map bring-up!!!!!!!` are both 27 characters and
    // break differently. A key on the LENGTH of the identity misses every case of this shape.
    const one = { ...aCard().plan, identity: { text: 'Model-to-bench growth check', from: 'title', field: 'title' } as never }
    const two = { ...aCard().plan, identity: { text: 'Airflow map bring-up!!!!!!!', from: 'title', field: 'title' } as never }
    expect((one.identity as { text: string }).text.length).toBe((two.identity as { text: string }).text.length)
    expect(keyWith({ plan: one })).not.toBe(keyWith({ plan: two }))
  })

  it('moves when the rung moves, which is the one case the old key did catch', () => {
    expect(keyWith({ plan: { ...aCard().plan, rung: 'R6' } })).not.toBe(asShipped())
  })

  it('moves when the drawing changes, whatever the cards say', () => {
    expect(layoutKeyFor('pipeline_x@structure', [aCard()])).not.toBe(layoutKeyFor('modules@structure', [aCard()]))
  })

  it('moves when the same cards are drawn in a different order', () => {
    const a = aCard()
    const b = aCard({ plan: { ...aCard().plan, rung: 'R6' } })
    expect(layoutKeyFor('modules@structure', [a, b])).not.toBe(layoutKeyFor('modules@structure', [b, a]))
  })
})

describe('and does not ask for one when nothing about a box changed', () => {
  it('gives the same key for the same drawing drawn again', () => {
    expect(keyWith({})).toBe(asShipped())
  })

  it('does not move when a person arrives whose work the drawing is not drawing', () => {
    // `presence` is the count of people WORTH DRAWING — `presenceWorthDrawing` has already dropped
    // the domains with no sign of work for over a day. A stale domain arriving draws no row, so it
    // must not throw away the reader's positions either.
    expect(keyWith({ presence: 0 })).toBe(asShipped())
  })
})
