// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PARTS SEEN BESIDE EACH OTHER: WHAT MAY BE STORED, AND WHAT EACH PART IS WORTH.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE EXISTS TO HOLD
 * ---------------------------------------------------------------------------------------
 *
 * It is the rule an implementation loses first:
 *
 *   Proportions an agent gives are preferences within a valid composition, not absolute
 *   pixel or percentage commands.
 *
 * A design that stores 60/40 and writes `grid-template-columns: 60% 40%` would look right in a
 * screenshot at 1440 and would have built none of that. So the tests below are chosen to be the
 * ones a percentage-based build cannot pass:
 *
 *   · 9:1 and 6:4 on the same two parts in the same box: one is adapted and reported, the other is
 *     given exactly as asked. Same field, same code path, two answers decided by the box.
 *   · 60:40 and 3:2 on the same two parts draw the same pixels at every width. This is the single
 *     assertion that goes red the moment anybody treats a stored share as a percentage.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT HERE, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING IS DRAWN. At this commit a composition has no renderer: it stores, it publishes at
 * GET /api/kinds and it derives into regions, and a reader gets Mole Office's own refusal box
 * instead of a drawing. That box is asserted in tests/blocks-profiles.test.ts, which is where the
 * rule about a stored-but-undrawn type lives. The browser tests that reconcile `drawnAt` with real
 * flexbox pixels arrive with the drawing.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { freshDb, type TestDb } from './helpers.ts'
import {
  LEAST_REM,
  MEASURE_MAX,
  MEASURE_PRESETS,
  PARTS_MAX,
  PARTS_MIN,
  SHARE_MAX,
  SHARE_MIN,
  SHARE_WHEN_UNASKED,
  drawnAt,
  roomFor,
  sayWhatHappens,
  type MeasureAsked,
  type PartAsked,
} from '../src/shared/beside.ts'
import { LEASTS, ROLE_OF, leastNeededByBlocks, regionsOf, type Least, type Region } from '../src/shared/regions.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

/**
 * HOW WIDE THE `narrow` PRESET COMES OUT AT A 16 PIXEL ROOT, READ OUT OF THE STYLESHEET.
 *
 * `drawnAt` is told this rather than working it out, because the width is declared once, as
 * `--read` in src/web/tokens.css. This file reads that declaration instead of writing 34 again --
 * the same thing the two tests at the foot of the file do, and for the same reason.
 */
const READ_REM = Number(
  /--read:\s*([\d.]+)rem/.exec(readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8'))?.[1] ??
    Number.NaN,
)
if (!Number.isFinite(READ_REM)) throw new Error('src/web/tokens.css does not declare --read as a length in rem')
const READ = READ_REM * 16

// ---------------------------------------------------------------------------------------- fixtures

const words = (id: string): SummaryBlock[] => [
  { id, type: 'text', text: 'The mast moved 4mm under load, every time, across forty runs.' },
]
const picture = (id: string): SummaryBlock[] => [
  { id, type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/mast.png`, alt: 'the mast under load' },
]
const table = (id: string): SummaryBlock[] => [
  { id, type: 'table', columns: [{ label: 'run' }], rows: [{ cells: [1] }] },
]

const composition = (parts: { id: string; share?: number; measure?: unknown; blocks: SummaryBlock[] }[]): unknown => ({
  id: 'b-beside',
  type: 'beside',
  parts,
})

const twoParts = (a?: number, b?: number): unknown =>
  composition([
    { id: 'p-words', ...(a === undefined ? {} : { share: a }), blocks: words('pw') },
    { id: 'p-shot', ...(b === undefined ? {} : { share: b }), blocks: picture('ps') },
  ])

/** The two parts of the owner's first example, as the resolver sees them. */
const wordsAndPicture = (a?: number, b?: number): PartAsked[] => [
  { id: 'p-words', least: 'sentence', ...(a === undefined ? {} : { share: a }) },
  { id: 'p-shot', least: 'figure', ...(b === undefined ? {} : { share: b }) },
]

// ------------------------------------------------------------------- what a part holds, and is worth

describe('what each part of a composition is worth', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. Every share below is chosen from what a part HOLDS, so a test
   * that asserted the shares without checking the classification would pass just as well if
   * `leastNeededBy` answered the same thing for everything.
   */
  it('reads what each kind of part holds, which is the control for every share below', () => {
    expect(leastNeededByBlocks(words('a'))).toBe('sentence')
    expect(leastNeededByBlocks(picture('a'))).toBe('figure')
    expect(leastNeededByBlocks(table('a'))).toBe('panel')
    // A CAPTION IS NOT WHAT A PICTURE IS FOR. A captioned picture is still a picture, because the
    // walk stops at a region that lays its own insides out. This is the assertion that goes red if
    // somebody rewrites the walk to look for prose anywhere below.
    expect(
      leastNeededByBlocks([
        { id: 'a', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/x.png`, alt: 'the mast', caption: 'The mast under load' },
      ]),
    ).toBe('figure')
  })

  it('chooses the proportions from what the parts hold when nobody said', () => {
    const cases: { what: string; parts: PartAsked[]; shares: number[] }[] = [
      { what: 'writing beside a picture', parts: wordsAndPicture(), shares: [3, 2] },
      {
        what: 'a picture beside a picture',
        parts: [
          { id: 'a', least: 'figure' },
          { id: 'b', least: 'figure' },
        ],
        shares: [2, 2],
      },
      {
        what: 'writing beside writing',
        parts: [
          { id: 'a', least: 'sentence' },
          { id: 'b', least: 'sentence' },
        ],
        shares: [3, 3],
      },
      {
        what: 'writing beside a table beside a picture',
        parts: [
          { id: 'a', least: 'sentence' },
          { id: 'b', least: 'panel' },
          { id: 'c', least: 'figure' },
        ],
        shares: [3, 2, 2],
      },
    ]
    for (const one of cases) {
      const plan = roomFor('b-beside', one.parts)
      expect(plan.parts.map((p) => p.share), one.what).toEqual(one.shares)
      expect(plan.chosenBy, one.what).toBe('Mole Office')
    }
  })

  it('says the report chose them when every part said what it is worth', () => {
    expect(roomFor('b-beside', wordsAndPicture(9, 1)).chosenBy).toBe('the report')
    // One share and not the other is refused at the write door, so it never reaches here. What
    // reaches here with a gap in it is Mole Office's own answer for the whole composition.
    expect(roomFor('b-beside', wordsAndPicture(9)).chosenBy).toBe('Mole Office')
  })

  it('never puts the width at which the parts stack above the width at which every share is exact', () => {
    // TEN THOUSAND RANDOM COMPOSITIONS. The three bands — exact, adapted, stacked — are only three
    // bands if these two thresholds never cross, and the proof of that is a sentence in the design.
    // A sentence in a design is not a thing that fails when the code stops matching it.
    let seed = 20260828
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let n = 0; n < 10000; n += 1) {
      const count = PARTS_MIN + Math.floor(next() * (PARTS_MAX - PARTS_MIN + 1))
      const parts: PartAsked[] = []
      for (let i = 0; i < count; i += 1) {
        const least = LEASTS[Math.floor(next() * LEASTS.length)] as Least
        parts.push({ id: `p${String(i)}`, least, share: SHARE_MIN + Math.floor(next() * SHARE_MAX) })
      }
      const plan = roomFor('b', parts)
      expect(plan.exactAboveRem, JSON.stringify(parts)).toBeGreaterThanOrEqual(plan.stackBelowRem)
      expect(plan.gaps).toBe(count - 1)
    }
  })
})

// --------------------------------------------------------------------------- what is drawn, and why

describe('a share is a preference the layout may adapt, and never a command', () => {
  /**
   * THE OWNER'S FIRST ACCEPTANCE TEST, WHICH IS THE ONE THAT CANNOT BE FAKED: state a preference
   * the layout must refuse, and check that it refuses it for a stated reason.
   */
  it('holds a part at the smallest size it is worth reading at, and says which part and why', () => {
    const drawn = drawnAt(roomFor('b-beside', wordsAndPicture(9, 1)), 1164, 18, 16, READ)
    // 1164 less one 18px gap is 1146. Nine tenths of it would put the picture at 114.6, under the
    // width a picture is never drawn below, so the picture holds at that floor and the writing
    // takes the rest. Both numbers are read from LEAST_REM rather than typed here: they were typed
    // as 986 and 160 until 29 August 2026 and the pair went red when the floor moved.
    const floor = LEAST_REM.figure * 16
    expect(drawn.across).toEqual([
      { id: 'p-words', px: 1164 - 18 - floor },
      { id: 'p-shot', px: floor },
    ])
    expect(drawn.report.honoured).toEqual([])
    expect(drawn.report.unhonoured).toHaveLength(1)
    const said = drawn.report.unhonoured[0]
    expect(said?.target).toBe('p-shot')
    expect(said?.hint).toBe('1')
    expect(said?.because.length).toBeGreaterThan(40)
    // THE REASON IS IN WORDS A PERSON READS. A reason written in the vocabulary of the mechanism
    // that produced it tells the reader what the code did, not what happened to their report.
    for (const word of ['fit', 'region', 'fr', 'grid', 'container', 'px', 'minmax', 'flex', 'basis', 'share']) {
      expect(said?.because, `the reason uses the word "${word}"`).not.toContain(word)
    }
  })

  it('gives a share that fits exactly what it asked for, and reports nothing', () => {
    const drawn = drawnAt(roomFor('b-beside', wordsAndPicture(6, 4)), 1164, 18, 16, READ)
    expect(drawn.across).toEqual([
      { id: 'p-words', px: 1146 * 0.6 },
      { id: 'p-shot', px: 1146 * 0.4 },
    ])
    expect(drawn.report.unhonoured).toEqual([])
    expect(drawn.report.honoured).toEqual(['b-beside'])
  })

  it('draws 60 and 40 exactly as it draws 3 and 2, at every width', () => {
    for (const width of [1440, 1164, 990, 800, 660, 560]) {
      const asPercentages = drawnAt(roomFor('b', wordsAndPicture(60, 40)), width, 18, 16, READ)
      const asARatio = drawnAt(roomFor('b', wordsAndPicture(3, 2)), width, 18, 16, READ)
      expect(asARatio.across, `at ${String(width)}`).toEqual(asPercentages.across)
    }
  })

  it('draws the parts one under another when there is not room for all of them', () => {
    const stated = drawnAt(roomFor('b-beside', wordsAndPicture(3, 2)), 390, 18, 16, READ)
    expect(stated.across).toBeNull()
    expect(stated.report.unhonoured).toHaveLength(1)
    expect(stated.report.unhonoured[0]?.target).toBe('b-beside')

    // NOTHING WAS PROMISED, SO NOTHING WAS BROKEN. Drawing the parts one under another on a narrow
    // screen is what a composition does; it is only a refusal when somebody asked for something else.
    const chosen = drawnAt(roomFor('b-beside', wordsAndPicture()), 390, 18, 16, READ)
    expect(chosen.across).toBeNull()
    expect(chosen.report.unhonoured).toEqual([])
  })

  it('never draws a part under its floor and never draws more than the box holds', () => {
    let seed = 4321
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let n = 0; n < 4000; n += 1) {
      const count = PARTS_MIN + Math.floor(next() * (PARTS_MAX - PARTS_MIN + 1))
      const parts: PartAsked[] = []
      for (let i = 0; i < count; i += 1) {
        const least = LEASTS[Math.floor(next() * LEASTS.length)] as Least
        parts.push({ id: `p${String(i)}`, least, share: SHARE_MIN + Math.floor(next() * SHARE_MAX) })
      }
      const plan = roomFor('b', parts)
      const width = 200 + Math.floor(next() * 1300)
      const drawn = drawnAt(plan, width, 18, 16, READ)
      if (drawn.across === null) continue
      const avail = width - 18 * plan.gaps
      let total = 0
      drawn.across.forEach((part, i) => {
        const floor = LEAST_REM[plan.parts[i]?.least ?? 'figure'] * 16
        expect(part.px, `${JSON.stringify(parts)} at ${String(width)}`).toBeGreaterThanOrEqual(floor - 1e-6)
        total += part.px
      })
      expect(total).toBeLessThanOrEqual(avail + 1e-6)
    }
  })

  it('says in one plain sentence what will happen to what was asked for', () => {
    const chosen = sayWhatHappens(roomFor('b', wordsAndPicture()))
    expect(chosen).toContain('3 to 2')
    expect(chosen).toContain('Mole Office')
    const stated = sayWhatHappens(roomFor('b', wordsAndPicture(9, 1)))
    expect(stated).toContain('9 to 1')
    // NO WIDTH IS NAMED, and that is the point rather than an omission: a plan knows its thresholds
    // in rem and knows nothing about the reader's text size, so a number of pixels here would be a
    // guess at the root font size.
    expect(stated).not.toMatch(/\d+px/)
  })
})


// ---------------------------------------------------------- a reading measure inside its own column

/**
 * LAYER 4: HOW WIDE THE WRITING INSIDE ONE PART READS.
 *
 * THE TRAP THESE TESTS EXIST TO CATCH: a measure implemented by making the PART narrower. The
 * owner drew that distinction themselves — a measure "affects only the prose measure inside its
 * full-width column; it does not reduce the parent Semantic Region's ownership". So the first
 * assertion here is that `across` does not move when a measure is written, and it is the one that
 * goes red if anybody wires a measure into the share arithmetic.
 */
describe('a reading measure narrows the writing and never the part', () => {
  const twoProseParts = (measure?: MeasureAsked): PartAsked[] => [
    { id: 'p-words', least: 'sentence', share: 1, ...(measure === undefined ? {} : { measure }) },
    { id: 'p-more', least: 'sentence', share: 1 },
  ]

  it('draws the same pixels whether or not a measure was written', () => {
    for (const width of [1600, 1164, 990, 700]) {
      const without = drawnAt(roomFor('b', twoProseParts()), width, 18, 16, READ)
      const with_ = drawnAt(roomFor('b', twoProseParts(0.4)), width, 18, 16, READ)
      expect(with_.across, `at ${String(width)}`).toEqual(without.across)
    }
  })

  /**
   * RULE 2, WHICH IS THE ONLY ONE THAT CAN REFUSE. A ratio is worked out from the column, so the
   * same 0.4 is a reading column in a wide part and a strip in a narrow one. 1600 less an 18px gap
   * is 1582, so each part is 791 and four tenths of it is 316.4 — above the 256 that 16rem is at a
   * 16px root. At 1164 each part is 573 and four tenths is 229.2, which is under it.
   */
  it('refuses a ratio that would make a strip of the writing, and says so about that part', () => {
    const wide = drawnAt(roomFor('b', twoProseParts(0.4)), 1600, 18, 16, READ)
    expect(wide.report.unhonoured).toEqual([])
    expect(wide.report.honoured).toContain('p-words measure 0.4')

    const narrow = drawnAt(roomFor('b', twoProseParts(0.4)), 1164, 18, 16, READ)
    expect(narrow.report.honoured).not.toContain('p-words measure 0.4')
    expect(narrow.report.unhonoured).toHaveLength(1)
    const said = narrow.report.unhonoured[0]
    expect(said?.target).toBe('p-words')
    // THE HINT SAYS WHICH PREFERENCE IT WAS. A part can be named twice in one report — once for its
    // share and once for its measure — and two bare numbers would leave the reader guessing.
    expect(said?.hint).toBe('measure 0.4')
    expect(said?.because.length).toBeGreaterThan(40)
    for (const word of ['fit', 'region', 'fr', 'grid', 'container', 'px', 'minmax', 'flex', 'basis', 'share']) {
      expect(said?.because, `the reason uses the word "${word}"`).not.toContain(word)
    }
  })

  /*
   * WITHDRAWN 29 AUGUST 2026: "never refuses a preset, at any width down to the narrowest".
   *
   * WHAT IT SAID. For each of the four presets, at 1600, 1164, 660, 390 and 240 pixels, no measure
   * entry appeared in `unhonoured` and the preset appeared in `honoured` at every one of them.
   *
   * WHY IT IS WRONG. It made the two words mean two different things. A share was honoured when the
   * part was drawn at the share it asked for; a preset measure was honoured whenever the engine had
   * not overridden it outright, which is every width there is. So `wide` in a 573 pixel column —
   * where the writing fills its column and the stated 60rem maximum does nothing at all — came back
   * honoured, while `0.4` in the same column, where the writing also fills its column, came back
   * unhonoured. Same drawn result, opposite words, and a caller could not learn from either of them
   * whether the stated preference had done anything.
   *
   * WHAT SAYS SO. `design/problem-01/ACCEPTANCE.md` C27 already lists three adaptations and the
   * first is "it is never wider than the column it is in", and then says "every adaptation goes
   * into the same LayoutReport.unhonoured the shares use". A preset in a column narrower than it is
   * that adaptation. C30, added in this commit, states the one meaning both words now carry.
   *
   * THIS COMMIT ONLY WITHDRAWS IT. What replaces it is the two tests below, in the commit that
   * makes them true, because a commit that changes what is being asked for may not also be the
   * commit that claims to answer it.
   */

  /**
   * RULE 1, WHICH IS THE OTHER RULE THAT CAN REFUSE. A preset is a fixed width, so in a column
   * narrower than it the maximum never binds and the writing fills its column — the same drawn
   * result a refused ratio gives, and now the same word for it.
   *
   * TWO WIDTHS, ONE ON EACH SIDE OF THE PRESET. `narrowest` is 26rem, which is 416 at a 16 pixel root.
   * At 1600 each of the two parts is 791 wide, so the maximum binds and the writing reads at 416.
   * At 390 the parts are drawn one under another and each column is the whole 390, which is
   * narrower than 416, so nothing the preset asks for happens.
   */
  it('reports a preset the column is too narrow for, with the width of that column in the reason', () => {
    const wide = drawnAt(roomFor('b', twoProseParts('narrowest')), 1600, 18, 16, READ)
    expect(wide.report.honoured).toContain('p-words measure narrowest')
    expect(wide.report.unhonoured.filter((one) => one.hint.startsWith('measure'))).toEqual([])

    const tight = drawnAt(roomFor('b', twoProseParts('narrowest')), 390, 18, 16, READ)
    expect(tight.report.honoured).not.toContain('p-words measure narrowest')
    const said = tight.report.unhonoured.filter((one) => one.hint === 'measure narrowest')
    expect(said).toHaveLength(1)
    expect(said[0]?.target).toBe('p-words')
    // THE NUMBERS ARE IN THE REASON, so a caller reading it can see which way round the two are.
    expect(said[0]?.because).toContain('390')
    expect(said[0]?.because).toContain('416')
    for (const word of ['fit', 'region', 'fr', 'grid', 'container', 'px', 'minmax', 'flex', 'basis', 'share']) {
      expect(said[0]?.because, `the reason uses the word "${word}"`).not.toContain(word)
    }
  })

  /**
   * `full` ASKS FOR THE WHOLE COLUMN AND ALWAYS GETS IT, at every width, however narrow. It states
   * no maximum, so there is nothing a narrow column can take away from it. Without this the rule
   * above could be implemented as "a preset is honoured only when it binds", which would report the
   * default preference as refused on every screen.
   */
  it('never refuses `full`, at any width down to the narrowest', () => {
    for (const width of [1600, 1164, 660, 390, 240]) {
      const drawn = drawnAt(roomFor('b', twoProseParts('full')), width, 18, 16, READ)
      expect(drawn.report.honoured, `full at ${String(width)}`).toContain('p-words measure full')
      expect(
        drawn.report.unhonoured.filter((one) => one.hint.startsWith('measure')),
        `full at ${String(width)}`,
      ).toEqual([])
    }
  })

  /**
   * RULE 3. Stacking changes how wide the column is and nothing else, so a measure stated on a
   * part still applies when the parts go one under another. At 600 two prose parts cannot stand
   * beside each other — their floors are 20rem each — and each column is the whole 600, which is
   * wider than the 416 that `narrowest` is, so the preset still binds and is still named as applied.
   */
  it('still applies a measure when the parts are drawn one under another', () => {
    const drawn = drawnAt(roomFor('b', twoProseParts('narrowest')), 600, 18, 16, READ)
    expect(drawn.across).toBeNull()
    expect(drawn.report.honoured).toContain('p-words measure narrowest')
  })

})

// ------------------------------------------------------------------------ one fact in one place

describe('every number in the mechanism is written once', () => {
  const source = readFileSync(new URL('../src/shared/beside.ts', import.meta.url), 'utf8')

  it('does not reach for a browser, and does not carry a gutter of its own', () => {
    for (const forbidden of ['document.', 'window.', 'getComputedStyle', "from '../web", "from './web"]) {
      expect(source, `src/shared/beside.ts mentions ${forbidden}`).not.toContain(forbidden)
    }
    // THE GUTTER IS 6, 10, 12, 16 OR 18 PIXELS depending on the reader's density and the profile, so
    // a threshold worked out from one of them is wrong in the other four. `drawnAt` is handed one.
    expect(source).not.toMatch(/gutterPx\s*=/)
  })

  it('has a floor and an automatic share for every answer about what a part holds', () => {
    // Both maps are total over `Least`, so a fourth answer stops the build. Asserted as well as
    // typed, because the type is erased and the answer comes out of a walk over stored data.
    for (const least of LEASTS) {
      expect(LEAST_REM[least], least).toBeGreaterThan(0)
      expect(SHARE_WHEN_UNASKED[least], least).toBeGreaterThanOrEqual(SHARE_MIN)
    }
    expect(Object.keys(LEAST_REM).sort()).toEqual([...LEASTS].sort())
    expect(Object.keys(MEASURE_MAX).sort()).toEqual([...MEASURE_PRESETS].sort())
  })
})

// ------------------------------------------------------------------------------- the write door

describe('what may be stored as a composition', () => {
  let t: TestDb
  let s: typeof import('../src/server/lib/summary.ts')

  beforeAll(async () => {
    t = await freshDb()
    s = await import('../src/server/lib/summary.ts')
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)
  afterAll(() => t.close())

  const refusal = (blocks: unknown): string => {
    try {
      s.validateSummaryBlocks(blocks)
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
    throw new Error('expected these blocks to be refused, but they were accepted')
  }

  it('stores a composition with shares and a reading measure, exactly as written', () => {
    const written = composition([
      { id: 'p-words', share: 3, measure: 'narrow', blocks: words('pw') },
      { id: 'p-shot', share: 2, blocks: picture('ps') },
    ])
    const back = s.validateSummaryBlocks([written])
    expect(JSON.parse(JSON.stringify(back))).toEqual([written])
  })

  /**
   * ABSENCE STAYS ABSENCE. "Nobody said" and "somebody said and it was adapted" are two different
   * facts about a row, and writing the chosen share into storage destroys the first of them for
   * good. Nothing in this file normalises, trims or defaults on the way in.
   */
  it('writes no share at all when nobody said, rather than the one it would choose', () => {
    const back = s.validateSummaryBlocks([twoParts()]) as { parts: Record<string, unknown>[] }[]
    for (const part of back[0]?.parts ?? []) expect('share' in part).toBe(false)
    // And the composition still draws 3 to 2, from what the parts hold.
    expect(roomFor('b', wordsAndPicture()).parts.map((p) => p.share)).toEqual([3, 2])
  })

  /**
   * ONE ASSERTION WAS WITHDRAWN FROM THIS TEST ON 29 August 2026, BEFORE THE FIX. It read
   *
   *     expect(refusal([twoParts(SHARE_MAX + 1, 2)])).toContain('Write 3 and 2 rather than 60 and 40')
   *
   * and it required the refusal for an out-of-range share to teach the author to write 3 and 2
   * INSTEAD OF 60 and 40. The owner has since said a report may write 60/40 and that canonical
   * storage may reduce it, so that sentence teaches the wrong thing. A share out of range is still
   * refused; what the refusal says is rewritten in the next commit, and asserted there.
   */
  it('refuses a share that is not a share, and says what a share is', () => {
    expect(refusal([twoParts(0, 2)])).toContain('a part worth nothing')
    expect(refusal([twoParts(2.5, 2)])).toContain('a share is a whole number')
  })

  it('refuses a half-stated preference, and names the parts that said nothing', () => {
    const message = refusal([twoParts(3)])
    expect(message).toContain('"p-shot"')
    expect(message).toContain('or none does')
  })

  it('refuses one part and refuses five', () => {
    expect(refusal([composition([{ id: 'p1', blocks: words('a') }])])).toContain(
      `at least ${String(PARTS_MIN)} parts`,
    )
    const five = [1, 2, 3, 4, 5].map((n) => ({ id: `p${String(n)}`, blocks: words(`w${String(n)}`) }))
    expect(refusal([composition(five)])).toContain(`more than ${String(PARTS_MAX)} parts`)
  })

  it('refuses two parts with one id, because a comment on a part finds it by that id', () => {
    const message = refusal([
      composition([
        { id: 'twin', blocks: words('a') },
        { id: 'twin', blocks: picture('b') },
      ]),
    ])
    expect(message).toContain('two parts share the id "twin"')
  })

  it('refuses a reading measure on a part that holds no writing', () => {
    const message = refusal([
      composition([
        { id: 'p-words', blocks: words('pw') },
        { id: 'p-shot', measure: 'narrow', blocks: picture('ps') },
      ]),
    ])
    expect(message).toContain('holds no writing')
    expect(message).toContain('share')
  })

  it('refuses a measure that is neither a name nor a ratio in range', () => {
    expect(refusal([composition([{ id: 'p1', measure: 0.2, blocks: words('a') }, { id: 'p2', blocks: picture('b') }])])).toContain(
      'stops being about reading',
    )
    expect(refusal([composition([{ id: 'p1', measure: 1.4, blocks: words('a') }, { id: 'p2', blocks: picture('b') }])])).toContain(
      'all of it',
    )
  })

  it('accepts every preset name', () => {
    for (const preset of MEASURE_PRESETS) {
      expect(() =>
        s.validateSummaryBlocks([
          composition([
            { id: 'p1', measure: preset, blocks: words('a') },
            { id: 'p2', blocks: picture('b') },
          ]),
        ]),
      ).not.toThrow()
    }
  })
})

// ------------------------------------------------------------------------------- pointing at a part

describe('each part of a composition is a region somebody can point at', () => {
  const flatten = (region: Region): Region[] => [region, ...region.children.flatMap(flatten)]

  it('derives one region per part, with that part’s blocks inside it', () => {
    const tree = regionsOf({
      field: 'blocks',
      blocks: [
        {
          id: 'b-beside',
          type: 'beside',
          parts: [
            { id: 'p-1', blocks: words('pw') },
            { id: 'p-2', blocks: picture('ps') },
          ],
        },
      ],
    })
    const all = flatten(tree)
    const parts = all.filter((r) => r.role === 'besidePart')
    expect(parts.map((r) => r.id)).toEqual([
      'data.blocks[#b-beside].parts[#p-1]',
      'data.blocks[#b-beside].parts[#p-2]',
    ])
    // THE `.blocks` STEP. The renderer hands a block inside a part the path `parts[#p-1].blocks`,
    // so the derivation has to spell it the same way or every block inside a part is unfindable in
    // the region index — silently, which is what two of three drafts of the design shipped.
    expect(all.some((r) => r.id === 'data.blocks[#b-beside].parts[#p-1].blocks[#pw]')).toBe(true)
    for (const part of parts) {
      const inside = all.filter((r) => r.parentId === part.id)
      expect(inside.length, `${part.id} has nothing in it`).toBeGreaterThan(0)
    }
    // No two regions in the tree share a name, which is what makes a comment on the second part
    // stay on the second part.
    const ids = all.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('says a composition and its parts both take the whole width they are given', () => {
    expect(ROLE_OF['beside'].fit).toBe('spanning')
    expect(ROLE_OF['besidePart'].fit).toBe('spanning')
    // A part is meaningful, because "the picture beside the text is too narrow" is a sentence
    // somebody has to be able to leave on the picture.
    expect(ROLE_OF['besidePart'].meaningful).toBe(true)
    expect(ROLE_OF['beside'].meaningful).toBe(true)
  })
})
