// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AT LEVELS 4, 5 AND 6 THE PAGE DRAWS THE REPORT'S PARTS, AND NOTHING ELSE OF THE REPORT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * A report read at levels 4 to 6 drew a box of lines copied out of it under the words *Selected from
 * the report, not summarised*. The rule: remove it, do not excerpt, because an excerpt hides which
 * parts are missing and that is deception. What replaces it is a summary written BY PART:
 *
 *   level 4   one line per part: the part's own one-sentence heading, and nothing else.
 *   level 5   that same heading, with the part's 30-word text under it.
 *   level 6   that same heading, with the part's 120-word text under it.
 *
 * THE HEADING IS THE SAME SENTENCE AT ALL THREE, which is what lets a reader move up the ladder and
 * meet the same parts: a heading at a low level leads straight to the same heading and its paragraph at a higher level.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE HAS ONE OF EVERY KIND OF THING THE MEDIA RULE SORTS
 * ---------------------------------------------------------------------------------------
 *
 * Two headings, two findings, a table, a picture and a chart. The picture and the chart are media
 * and never count as words; the table is WORDS, summarised in a part's text and drawn only at Full.
 * That distinction is a judgement somebody made and it is the one a later reader would undo by
 * accident, so it is held here on a fixture that has both.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS RENDERED, NOT ASKED
 * ---------------------------------------------------------------------------------------
 *
 * `reportAt` deciding correctly and the page drawing what it decided are two facts. This file
 * renders the component and reads the markup, so a page that ignored the answer would be red here
 * while every unit test of the answer stayed green.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   make `TEXT_DRAWN_AT.outline` be `'text30'` → section 1 goes red: level 4 gains a text.
 *   make `TEXT_DRAWN_AT.digest` be `'text30'` → section 3 goes red: level 6 draws the short text.
 *   drop the `which === null` arm of the media rule in `oneDrawnPart` → section 4 goes red: a
 *     picture appears at level 4.
 *   drop the `pictures !== 'drawn'` arm → section 4 goes red the other way.
 *   let `isAPicture` count a table → section 5 goes red: the table is drawn at level 5.
 *   sort the parts by their stored order rather than by their first covered block → section 6 goes
 *     red.
 *   have `reportAt` keep drawing blocks below Full → section 7 goes red.
 *   make `partsAt` ignore whether the parts are written → section 8 goes red: a report with none
 *     draws an empty list instead of the line saying the level has not been written.
 *   make `summaryAt` answer `'none'` for a by-part length with no parts → section 8 goes red: the
 *     absence sentence comes back.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { levelLabel, type DetailSource, type Rung } from '../src/shared/detail.ts'
import type { Pictures } from '../src/shared/pictures.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import type { StoredPart } from '../src/shared/zoom.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
let sb: SummaryBlocksModule

const store = new Map<string, string>()

/**
 * A REPORT WITH HEADINGS, FINDINGS, A TABLE, A PICTURE AND A CHART.
 *
 * The words in each are distinctive so that a test can ask whether the page drew the REPORT rather
 * than asking how many elements there are: at levels 4 to 6 none of these strings may be on the
 * page, because the page draws the parts and nothing under them.
 */
const REPORT: SummaryBlock[] = [
  { id: 'b-1', type: 'heading', text: 'Zebra what broke' },
  { id: 'b-2', type: 'finding', text: 'Ostrich three of four printed mounts cracked at fifteen newtons.' },
  { id: 'b-3', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/rig.png`, alt: 'Narwhal the bench jig' },
  { id: 'b-4', type: 'heading', text: 'Puffin what is still open' },
  { id: 'b-5', type: 'finding', text: 'Marmot nobody has pulled the aluminium mount yet.' },
  {
    id: 'b-6',
    type: 'table',
    columns: [{ label: 'Sample' }, { label: 'Newtons' }],
    rows: [{ cells: ['Weasel one', '14.2'] }],
  },
  {
    id: 'b-7',
    type: 'chart',
    spec: {
      kind: 'line',
      x: { label: 'Sample' },
      y: { label: 'Newtons' },
      series: [{ id: 's-1', name: 'Printed', points: [{ x: 1, y: 14.2 }, { x: 2, y: 15.1 }] }],
    },
  },
]

/**
 * TWO PARTS, STORED IN THE WRONG ORDER ON PURPOSE.
 *
 * `p-late` covers the second half of the report and is stored first. The page draws parts in the
 * order of their first covered block, because the reader is reading the report — so a writer that
 * sent them in any order gets the report's order back. Section 6 is that.
 */
const PARTS: StoredPart[] = [
  {
    id: 'p-late',
    heading: 'Kestrel the aluminium mount is still on order',
    text30: 'Aardvark an aluminium mount of the same geometry has been ordered and nothing else is waiting on it.',
    text120: 'Tapir an aluminium mount of the same geometry has been ordered and is expected next week, and nothing else on the handover work is waiting on it.',
    covers: ['b-4', 'b-5', 'b-6', 'b-7'],
  },
  {
    id: 'p-first',
    heading: 'Gannet the printed mount fails below the trial load',
    text30: 'Bittern three of four printed mounts broke between fourteen and sixteen newtons, under the twenty the trials need.',
    text120: 'Caribou four printed mounts were pulled on the bench jig and three broke at the thin section behind the bolt circle, below the twenty newtons the handover trials need.',
    covers: ['b-1', 'b-2', 'b-3'],
  },
]

/**
 * THE WORDS AT READING LENGTH 3, WHICH ARE THE RECORD'S OWN SUMMARY COLUMN.
 *
 * They sat under `data.shortForms.gist` until 3 September 2026. Criterion A14b of
 * `design/pointing-reopened/ACCEPTANCE.md` made length 3 the `summary` column — title at most 15 words,
 * summary 20 to 60 words — and `readStoredShortForms` in src/shared/zoom.ts hands nothing back under the
 * retired key, so a fixture that still stored them here would draw nothing at any length. The name
 * is kept because every question below is the same one: may these words stand at a length nobody
 * wrote a form for?
 */
const GIST =
  'Quokka three of four printed wrist mounts broke below the load the handover trials need, so only the ' +
  'aluminium one is worth another run this week.'

/** A record whose parts are written, and one whose parts are not. */
const WITH_PARTS: DetailSource = {
  title: 'Wrist mount pull test, round eight',
  summary: GIST,
  declaresShortForms: true,
  shortForms: {
    parts: { madeFrom: { seq: 1, contentHash: 'aaaa' }, writtenBy: 'agent', parts: PARTS },
  },
  body: { field: 'data.blocks', written: true },
}

/**
 * THE SAME RECORD WITH ITS PARTS TAKEN AWAY, and its summary left exactly where it is.
 *
 * It held a stored gist and nothing else until 3 September 2026. What it has to be is a report that
 * reaches reading length 3 and stops: the summary is level 3, and levels 4, 5 and 6 have nothing of
 * their own — which is the state section 8 asks about.
 */
const WITHOUT_PARTS: DetailSource = {
  ...WITH_PARTS,
  shortForms: {},
}

beforeAll(async () => {
  // THE SHIM GOES FIRST. `SummaryBlocks.tsx` reads `window` while it is being imported, so a plain
  // import at the top of this file would throw before any test ran.
  const shim = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    // BACKED BY THE SAME MAP AS localStorage ABOVE, and it was a no-op stub until now. It was
    // written when whether a report's pictures are drawn lived in localStorage; criterion U5
    // removed that durable key, because NOTHING WROTE IT, and the per-visit key in sessionStorage
    // is what the toggle really writes and reads. A stub that always answers null would make this
    // file's picture cases pass whatever the product did.
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '', pathname: '/', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  ;(globalThis as unknown as { window: unknown }).window = shim
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = shim.localStorage
  ;(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = shim.sessionStorage
  sb = await import('../src/web/components/SummaryBlocks.tsx')
}, 60_000)

/**
 * THE PICTURE BLOCK, DRAWN: its figure, by the stored block it draws. Until wave 13s round 12 this read
 * the picture's path, which a person no longer sees outside developer mode.
 */
const THE_PICTURE_DRAWN = 'data-drawn-from="data.blocks[#b-3]"'

/** The report as a reader meets it, at one position, with the pictures on or off. */
function page(rung: Rung, source: DetailSource = WITH_PARTS, pictures: Pictures = 'drawn'): string {
  store.set('mole-office.pictures.local', pictures)
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: REPORT,
      layout: 'page',
      drawAt: rung,
      // NULL IS THE HONEST ANSWER HERE: this file has not read the record's links, so it announces
      // no tree rather than a shorter one. See `BlocksInRecord.wholeRecord`.
      inRecord: { recordId: 'rec-1', kind: 'report', stored: source, wholeRecord: null },
    }),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/** Every part heading the page drew, in the order it drew them. */
function headings(html: string): string[] {
  return [...html.matchAll(/<p class="sb-part-heading"[^>]*>(?:<span[^>]*>)?([^<]*)/g)].map((one) => one[1] ?? '')
}

/** The stored path each drawn heading says its words came from. */
function headingFields(html: string): string[] {
  return [...html.matchAll(/<p class="sb-part-heading"[^>]*data-drawn-from="([^"]*)"/g)].map((one) => one[1] ?? '')
}

/** Every part text the page drew, in order. */
function texts(html: string): string[] {
  return [...html.matchAll(/<p class="sb-part-text"[^>]*>([^<]*)/g)].map((one) => one[1] ?? '')
}

/**
 * THE DISTINCTIVE FIRST WORD OF EVERY BLOCK OF THE REPORT THAT IS WORDS.
 *
 * The picture's own alternative text, *Narwhal*, is NOT on this list, and that is the media rule
 * rather than an omission: a part's picture IS drawn under it at levels 5 and 6, so its alternative
 * text is on the page there by design. Section 4 is where the picture is asked about by name.
 */
const REPORT_WORDS = ['Zebra', 'Ostrich', 'Puffin', 'Marmot', 'Weasel']

// ============================================================ 1. level 4 is one line per part

describe('level 4 draws the headings and nothing else', () => {
  it('draws one heading per part and no text at all', () => {
    const html = page('outline')
    expect(headings(html)).toEqual([
      'Gannet the printed mount fails below the trial load',
      'Kestrel the aluminium mount is still on order',
    ])
    expect(texts(html)).toEqual([])
  })

  it('draws none of the report’s own words, its picture’s alternative text included', () => {
    const html = page('outline')
    for (const word of [...REPORT_WORDS, 'Narwhal']) expect(html, word).not.toContain(word)
  })

  it('draws no opening line of its own, because the parts are the form for this length', () => {
    expect(page('outline')).not.toContain('sb-open-line')
  })

  it('says nothing about a summary being missing, because one was written', () => {
    expect(page('outline')).not.toContain('sb-nosummary')
  })

  it('says on each heading which stored words it drew, because at this length that is all there is', () => {
    // WITHOUT THIS, LEVEL 4 CARRIES NO STORED PATH AT ALL. It draws the headings and nothing else,
    // so an instrument that reads which fields a length drew would see this length as drawing
    // nothing. Found by the agent that updated the tests around this change.
    expect(headingFields(page('outline'))).toEqual([
      'data.shortForms.parts[#p-first].heading',
      'data.shortForms.parts[#p-late].heading',
    ])
  })
})

// ============================================================ 2. level 5 adds the short text

describe('level 5 draws the same heading with the part’s 30-word text', () => {
  it('draws the same headings as level 4, word for word', () => {
    expect(headings(page('sketch'))).toEqual(headings(page('outline')))
  })

  it('draws each part’s 30-word text under its heading', () => {
    expect(texts(page('sketch'))).toEqual([
      'Bittern three of four printed mounts broke between fourteen and sixteen newtons, under the twenty the trials need.',
      'Aardvark an aluminium mount of the same geometry has been ordered and nothing else is waiting on it.',
    ])
  })

  it('draws none of the report’s own words', () => {
    const html = page('sketch')
    for (const word of REPORT_WORDS) expect(html, word).not.toContain(word)
  })
})

// ============================================================ 3. level 6 adds the long text

describe('level 6 draws the same heading with the part’s 120-word text', () => {
  it('draws the same headings again', () => {
    expect(headings(page('digest'))).toEqual(headings(page('outline')))
  })

  it('draws each part’s 120-word text and not its 30-word one', () => {
    const drawn = texts(page('digest'))
    expect(drawn[0]).toContain('Caribou')
    expect(drawn[1]).toContain('Tapir')
    expect(drawn.join(' ')).not.toContain('Bittern')
  })

  it('draws none of the report’s own words either', () => {
    const html = page('digest')
    for (const word of REPORT_WORDS) expect(html, word).not.toContain(word)
  })
})

// ============================================================ 4. the media rule

describe('a part’s pictures and charts', () => {
  it('are drawn under it at level 5 when the picture button is on', () => {
    const html = page('sketch', WITH_PARTS, 'drawn')
    expect(html).toContain(THE_PICTURE_DRAWN)
    expect(html).toContain('sb-chart')
  })

  it('are drawn at level 6 too', () => {
    expect(page('digest', WITH_PARTS, 'drawn')).toContain(THE_PICTURE_DRAWN)
  })

  it('are not drawn at level 4, which is one line per part and nothing else', () => {
    const html = page('outline', WITH_PARTS, 'drawn')
    expect(html).not.toContain(THE_PICTURE_DRAWN)
    expect(html).not.toContain('sb-chart')
  })

  it('are not drawn at level 5 when the picture button is off', () => {
    const html = page('sketch', WITH_PARTS, 'left out')
    expect(html).not.toContain(THE_PICTURE_DRAWN)
    expect(html).not.toContain('sb-chart')
    // AND THE TEXT IS STILL THERE. The picture button takes the pictures out; it is not a second
    // reading length.
    expect(texts(html)).toHaveLength(2)
  })
})

// ============================================================ 5. a table is words, not media

describe('a table is words and is drawn only at Full', () => {
  it('is not drawn at any of the three lengths written by part', () => {
    for (const rung of ['outline', 'sketch', 'digest'] as const) {
      expect(page(rung), rung).not.toContain('Weasel')
    }
  })

  it('is drawn at Full', () => {
    expect(page('full')).toContain('Weasel')
  })

  it('is drawn at Full even with the pictures off, because it is not a picture', () => {
    const html = page('full', WITH_PARTS, 'left out')
    expect(html).toContain('Weasel')
    expect(html).not.toContain(THE_PICTURE_DRAWN)
  })
})

// ============================================================ 6. the order is the report’s order

describe('parts are drawn in the order of their first covered block', () => {
  it('draws the part covering the report’s opening first, whatever order it was stored in', () => {
    // `p-late` IS STORED FIRST AND COVERS THE SECOND HALF. A page that drew the stored order would
    // hand the reader the end of the report before its beginning.
    expect(PARTS[0]?.id, 'the fixture stores them the wrong way round on purpose').toBe('p-late')
    expect(headings(page('outline'))[0]).toContain('Gannet')
  })

  it('draws them in that same order at all three lengths', () => {
    expect(headings(page('sketch'))[0]).toContain('Gannet')
    expect(headings(page('digest'))[0]).toContain('Gannet')
  })
})

// ============================================================ 7. Full is the report itself

describe('Full still draws the report and none of the parts', () => {
  it('draws every block of the report', () => {
    const html = page('full')
    for (const word of [...REPORT_WORDS, 'Narwhal']) expect(html, word).toContain(word)
  })

  it('draws no part heading and no part text', () => {
    expect(headings(page('full'))).toEqual([])
    expect(texts(page('full'))).toEqual([])
  })
})

// ============================================================ 8. where nobody wrote the parts

/**
 * WHAT THIS BLOCK ASSERTED UNTIL 3 SEPTEMBER 2026, AND WHY IT IS THE OPPOSITE NOW.
 *
 * It was headed *the fallback where nobody wrote the parts* and asserted that levels 4, 5 and 6
 * drew the report's GIST — *draws its gist at levels 4, 5 and 6, and says nothing is missing*, with
 * a second test reading `data-drawn-from="data.shortForms.gist"` off the drawn line to prove which
 * length the words came from. Criterion A14a ended that fallback: where a report has no form at a
 * level, that level is not shown, and the page writes that it does not exist.
 * A level with no form of its own draws one line saying so, and the gist stays at level 3.
 *
 * AND THE PATH THAT LINE WOULD CARRY CHANGED THE NEXT DAY. Criterion A14b made level 3 the record's
 * own `summary` column, so a line read out of it says `data-drawn-from="summary"` — the bare column
 * name — and `data.shortForms.gist` is on no line anywhere in this product. The third case below
 * names the path a line at level 5 could now wrongly carry.
 */
describe('a report whose parts nobody has written', () => {
  it('draws the line saying the level has not been written, at levels 4, 5 and 6', () => {
    for (const rung of ['outline', 'sketch', 'digest'] as const) {
      const html = page(rung, WITHOUT_PARTS)
      expect(html, `${rung} drew the gist of a length nobody wrote`).not.toContain('Quokka')
      expect(html, `${rung} says nothing about the level nobody wrote`).toContain('sb-nosummary')
      expect(html, `${rung} does not name itself`).toContain(`${levelLabel(rung)} has not been written for this report.`)
    }
  })

  it('draws no parts and none of the report’s own words', () => {
    const html = page('sketch', WITHOUT_PARTS)
    expect(headings(html)).toEqual([])
    for (const word of REPORT_WORDS) expect(html, word).not.toContain(word)
  })

  it('draws no line read out of the words that belong to another length', () => {
    // IT NAMED `data.shortForms.gist` UNTIL 3 SEPTEMBER 2026, which was where those words were
    // stored. Criterion A14b made them the record's own `summary` column, so this is the path a
    // level-5 line would carry if the fallback came back.
    expect(page('sketch', WITHOUT_PARTS)).not.toContain('data-drawn-from="summary"')
  })

  it('still draws the summary at level 3, where somebody wrote it', () => {
    const html = page('gist', WITHOUT_PARTS)
    expect(html).toContain('Quokka')
    // AND IT SAYS WHICH STORED WORDS IT DREW, so a line that lost the fallback but also lost its
    // provenance would not pass here. The path is the bare column name.
    expect(html).toContain('data-drawn-from="summary"')
  })
})
