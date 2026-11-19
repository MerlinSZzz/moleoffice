// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT LEFT AT ONE READING LENGTH IS STILL ABOUT THE SAME PART AT ANOTHER.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FAULTS THESE CASES HOLD SHUT, BOTH MEASURED BEFORE THEY WERE FIXED
 * ---------------------------------------------------------------------------------------
 *
 * FIRST, AN ANCHOR THAT SILENTLY BECAME NARROWER THAN WHAT THE PERSON POINTED AT. At "The
 * conclusion" the outline draws one line per part of a report, and each line carries the region of
 * the whole block it stands for. At "All of it" that block used to be drawn with no target of its
 * own: only the paragraphs inside it were pointable. So an anchor filed on the outline line found,
 * at Full, nothing but its own children. Measured on report OOOt4Kouc5dT at commit 3bf359f: of
 * forty region targets drawn at gist, twenty-three resolved at Full only to a DESCENDANT and two to
 * nothing at all. `design/problem-03/baseline/ancestry.json` holds every row. The owner's problem 4
 * asks for the opposite — an anchor lands on itself or on something that CONTAINS it.
 *
 * SECOND, ONE ATTRIBUTE CARRYING TWO VOCABULARIES. `data-rung` held the six reading words on a
 * report and the nine card positions R0..R8 on the pipeline graph, and the reader accepted only the
 * six. Twenty right-clickable cards wrote `R4`, so every comment left on one was stored with no
 * record of which drawing it was written on, silently, because absence is not an error.
 * `design/problem-03/baseline/rung-vocabulary.json` holds the count.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT ASSERT
 * ---------------------------------------------------------------------------------------
 *
 * Anything about pixels. The drawing is rendered to markup and the addresses in it are read back;
 * whether a mark is visible on a screen is a browser question and is answered in a browser.
 *
 * AND ANYTHING ABOUT A REAL DOCUMENT. The runner's environment is `node` and this project has ruled
 * out jsdom, so the reader of the attribute is asked with a stand-in element that answers the two
 * questions the reader asks it. That proves which attribute the reader looks for and what it does
 * with a word it cannot place; it does not prove the shape of a page, and the browser does that.
 *
 * Every failing case below was proved by mutation, with a control run of this file first.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { flatten, recordRegionsOf, type Region, type RegionId } from '../src/shared/regions.ts'
import { targetFromAttributeValue, type Context, type Target } from '../src/shared/targets.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import type { DetailSource } from '../src/shared/detail.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type Pointing = typeof import('../src/web/components/agent/pointing.ts')
type Marks = typeof import('../src/web/components/agent/marks.ts')
type DrawnAt = typeof import('../src/web/lib/drawnat.ts')

let sb: SummaryBlocksModule
let pointing: Pointing
let marks: Marks
let drawnat: DrawnAt

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, so the smallest stand-in goes in
  // before anything is imported. Nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  sb = await import('../src/web/components/SummaryBlocks.tsx')
  pointing = await import('../src/web/components/agent/pointing.ts')
  marks = await import('../src/web/components/agent/marks.ts')
  drawnat = await import('../src/web/lib/drawnat.ts')
})

const RECORD = 'OOOt4Kouc5dT'

/**
 * A REPORT SHAPED LIKE THE ONE THE FAULT WAS MEASURED ON: a section holding findings that each
 * carry a detail, and a callout with a title. Those are the two block shapes whose gist anchors had
 * nowhere to land at Full — the twenty-three descendant-only rows were findings inside sections,
 * and the two gone rows were callout titles.
 */
const BLOCKS: SummaryBlock[] = [
  {
    id: 'b-open',
    type: 'text',
    text: 'Each of these I did myself in a browser, with a mouse, on a copy of the corpus taken today.',
  },
  {
    id: 'b-note',
    type: 'callout',
    tone: 'note',
    title: 'How to read the words below',
    text: 'Five states are kept apart rather than collapsed into done, and each part says which it reports.',
  },
  {
    id: 'b-quote',
    type: 'quote',
    text: 'The anchor should preserve the ancestor chain, not narrow to a fragment of what was pointed at.',
    source: 'The owner, 29 August 2026',
  } as unknown as SummaryBlock,
  {
    id: 'b-list',
    type: 'checklist',
    items: [
      { id: 'ck-1', state: 'done', text: 'A section heading can be pointed at in every drawing of the report.' },
      { id: 'ck-2', state: 'open', text: 'A caption under a figure can be pointed at in every drawing of the report.' },
    ],
  } as unknown as SummaryBlock,
  {
    id: 'b-table',
    type: 'table',
    caption: 'What each reading length drew',
    columns: [{ label: 'Length' }, { label: 'Regions', align: 'right' }],
    rows: [{ cells: ['The conclusion', 43] }, { cells: ['All of it', 105] }],
  } as unknown as SummaryBlock,
  {
    id: 'b-section',
    type: 'section',
    title: 'What you can now do that you could not',
    blocks: [
      {
        id: 'b-find-1',
        type: 'finding',
        state: 'done',
        text: 'Settle a decision from the queue, in three presses, without committing anything by accident.',
        detail:
          'I opened the queue, pressed Decide it, pressed the second option and checked the API: nothing was ' +
          'written. Then I pressed Record this decision and the number went from 32 to 31.',
      },
      {
        id: 'b-find-2',
        type: 'finding',
        state: 'done',
        text: 'Read a report at five reading lengths and see something written at each of them.',
        detail:
          'I stepped the control through every position on the owner own report. Nothing was blank at any of ' +
          'them, and the shortest drew the label somebody wrote.',
      },
    ],
  } as unknown as SummaryBlock,
]

const STORED: DetailSource = {
  title: 'Round ten, half built and checked',
  summary: 'What was built, what was measured, and what is still open.',
  declaresShortForms: true,
  shortForms: { gist: 'The queue can be settled and a report can be read at five lengths.' },
}

/** The report drawn at one reading length, with the hoisted stylesheets taken out. */
function drawnAt(rung: 'gist' | 'outline' | 'full'): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: BLOCKS,
      layout: 'page',
      drawAt: rung,
      // THE WHOLE RECORD, so this render is handed the world the product really draws in, and
      // not a page with no sections above the report body. See `BlocksInRecord.wholeRecord`.
      inRecord: {
        recordId: RECORD,
        kind: 'report',
        stored: STORED,
        wholeRecord: {
          kind: 'report',
          data: { blocks: BLOCKS },
          title: STORED.title,
          summary: STORED.summary ?? null,
          // THIS RECORD IS WRITTEN IN THIS FILE AND STORED IN NO DATABASE, so it has no link rows
          // and the product's own reader of links has nothing to read. An empty list is the true
          // answer here, not a convenience.
          relations: [],
        },
      },
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** What React escaped on its way out, turned back into the characters an attribute holds. */
function asWritten(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Every region id the drawing put on an element, read back through the one reader of a target. */
function regionIdsIn(markup: string): RegionId[] {
  const out: RegionId[] = []
  for (const found of markup.matchAll(/data-target="(region\/[^"]*)"/g)) {
    const read = targetFromAttributeValue(asWritten(found[1] ?? ''))
    if ('problem' in read) throw new Error(`the drawing emitted an unreadable target: ${read.problem}`)
    const target: Target = read.target
    if (target.kind !== 'region') throw new Error('a region value read back as something else')
    out.push(target.regionId)
  }
  return out
}

/**
 * "Under" in this product's grammar, and the same rule the server uses: the child id starts with the
 * parent id and the next character is a dot or a bracket. `isUnder` in src/shared/regions.ts.
 */
function isUnder(child: string, parent: string): boolean {
  return (
    child.length > parent.length &&
    child.startsWith(parent) &&
    (child[parent.length] === '.' || child[parent.length] === '[')
  )
}

describe('an anchor taken at a short reading length still lands on itself at Full', () => {
  /**
   * CHANGED TWICE ON 2 SEPTEMBER 2026, and the second change is why this case now measures Full.
   *
   * In the afternoon the shorter length measured here moved from `gist` to reading length 4, because the
   * derived outline's ranks moved up. In the evening everything under the written
   * form was removed at every length, with no excerpt kept, so a length below Full draws no part
   * of the report and therefore no region of it. There is no short-length anchor left to be
   * narrowed, and this case says so rather than being deleted: an anchor filed against a block
   * before that change is still a comment somebody left, and what it lands on is decided at Full.
   *
   * SO THE RULE IS ASSERTED WHERE IT NOW LIVES: every block of the report carries its own target at
   * Full, so an anchor on a block lands on that block and not on a fragment of it.
   */
  it('draws no region of the report at a length below Full, so no anchor is taken from one', () => {
    for (const rung of ['gist', 'outline'] as const) {
      const short = regionIdsIn(drawnAt(rung))
      const ofTheReport = short.filter((id) => id.startsWith('data.blocks'))
      expect(ofTheReport, `${rung} drew part of the report under its written form`).toEqual([])
    }
  })

  it('gives every block of the report its own target at Full, and not only its children', () => {
    const full = regionIdsIn(drawnAt('full'))
    const drawn = new Set(full)
    // A FLOOR FIRST, because a drawing that emitted nothing would pass the check below for free.
    expect(full.length, 'Full drew no region targets at all').toBeGreaterThan(3)
    // EVERY ID THAT HAS A CHILD ON THE PAGE IS ON THE PAGE ITSELF. That is the fault this file was
    // written for, stated over whatever the drawing holds rather than over a list typed here.
    const parents = new Set<string>()
    for (const id of full) {
      for (const other of full) if (isUnder(id, other)) parents.add(other)
    }
    const onlyChildren = [...parents].filter((id) => !drawn.has(id))
    expect(onlyChildren, 'a part of the report whose only targets at Full are fragments of it').toEqual([])
  })

  it('gives a block inside another block a region of its own, and leaves the top-level word alone', () => {
    const full = drawnAt('full')
    const ids = new Set(regionIdsIn(full))
    // THE FINDING INSIDE THE SECTION. It carried `data-drawn-from` and no target until 30 August
    // 2026, which is what made the gist anchor on it land on its own detail paragraph.
    expect(ids.has('data.blocks[#b-section].blocks[#b-find-1]')).toBe(true)
    // A CALLOUT'S TITLE IS THE REGION IT WAS CUT FROM. The two `gone` rows of the baseline were
    // callout titles the outline draws at gist and nothing carried at Full.
    expect(ids.has('data.blocks[#b-note].title')).toBe(true)
    // AND A TOP-LEVEL BLOCK STILL SAYS `reportBlock`, because an element carries one target and the
    // comments already written against that word are found by it. `regionIdOfLegacyTarget` is what
    // the server converts with.
    expect(full).toContain(`data-target="reportBlock/${RECORD}/b-note"`)
    expect(ids.has('data.blocks[#b-note]')).toBe(false)
  })

  /**
   * THE FIVE PARTS THAT WERE DRAWN AT "ALL OF IT" AND CARRIED NOTHING.
   *
   * Each of these is drawn on the screen, is a region of the derivation, and was reachable at a
   * shorter reading length — where the outline draws one line per part and each line carries its
   * region — and unreachable in the long drawing. Measured in a browser over the eighteen reports in
   * the corpus on 30 August 2026: 34 section headings, 96 checklist items, 11 captions and 10
   * quotations, 151 in all, against 6 left afterwards.
   *
   * THEY ARE ASSERTED ONE BY ONE AND NOT AS A COUNT, because a count passes for the wrong reason the
   * day a sixth kind of part loses its target.
   */
  it('gives a section heading, a checklist item, a caption and a quotation their own regions at Full', () => {
    const ids = new Set(regionIdsIn(drawnAt('full')))
    expect(ids.has('data.blocks[#b-section].title'), 'a section heading').toBe(true)
    expect(ids.has('data.blocks[#b-list].items[#ck-1]'), 'a checklist item').toBe(true)
    expect(ids.has('data.blocks[#b-table].caption'), 'a caption above a table').toBe(true)
    expect(ids.has('data.blocks[#b-quote].text@0'), 'the words of a quotation').toBe(true)
    expect(ids.has('data.blocks[#b-quote].source'), 'who the quotation is from').toBe(true)
  })
})

describe('the attribute a drawing writes its reading length onto carries one vocabulary', () => {
  /**
   * A THING ON A PAGE, UNDER ONE ELEMENT THAT SAYS ONE THING ABOUT ITSELF.
   *
   * It answers the two questions the reader asks a document and no others: which is the nearest
   * element carrying this attribute, and what does it say. A reader that looked for a different
   * attribute would be handed nothing by this, which is the point of writing it this way.
   */
  const under = (attribute: string, value: string): HTMLElement => {
    const holder = { getAttribute: (asked: string) => (asked === attribute ? value : null) }
    return {
      closest: (selector: string) => (selector === `[${attribute}]` ? holder : null),
    } as unknown as HTMLElement
  }

  it('reads the six reading words back off the drawing', () => {
    expect(pointing.theViewThisWasWrittenIn(under('data-rung', 'gist'))).toEqual({ detail: 'gist' })
  })

  it('records nothing, and says nothing false, for a drawing that has no reading length', () => {
    // A CARD ON THE PIPELINE GRAPH. It says which of its own nine positions it was drawn at, on its
    // own attribute, and that is not a reading length. Before the split this element carried
    // `data-rung="R4"` and the answer below was the same `undefined` — with the difference that
    // nothing could tell it from this one, which is the silent fallback the split removes.
    expect(pointing.theViewThisWasWrittenIn(under('data-card-rung', 'R4'))).toBeUndefined()
  })

  it('says out loud when the reading attribute carries a word it cannot place', () => {
    const heard = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(pointing.theViewThisWasWrittenIn(under('data-rung', 'R4'))).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(String(heard.mock.calls[0]?.[0])).toContain('R4')
    heard.mockRestore()
  })
})

describe('a place drawn inside something larger is not called gone', () => {
  /** One text block whose prose holds a bullet list: a group region with bullets under it. */
  const PROSE: SummaryBlock[] = [
    {
      id: 'b-1',
      type: 'text',
      text: 'What the wave delivered:\n\n- The queue can be settled in three presses.\n- A report reads at five lengths.\n',
    } as SummaryBlock,
  ]
  // THE TREE THE PAGE ANNOUNCES, WHICH IS THE RECORD'S. `howItDrawsHere` is handed
  // `theReportDrawnHere().root` by the mark layer, and that is `recordRegionsOf` — rooted at `data`,
  // with the report body as one section of it — not the body alone. Building the body here would be
  // this file agreeing with the code about a page the browser does not draw; see
  // `BlocksInRecord.wholeRecord` in src/web/components/SummaryBlocks.tsx.
  const tree = (): Region =>
    recordRegionsOf({
      kind: 'report',
      // THIS REPORT IS WRITTEN IN THIS FILE AND STORED IN NO DATABASE, so it has no link rows and
      // the product's own reader of links has nothing to read. An empty list is the true answer.
      relations: [],
      title: STORED.title,
      summary: STORED.summary ?? null,
      data: { blocks: PROSE },
    })
  /**
   * One region of the prose, by what it MEANS and by the characters it starts at.
   *
   * BOTH, BECAUSE THE CHARACTERS ALONE ARE AMBIGUOUS: a bullet and the list holding it start at the
   * same character, so asking for the first region whose text starts with a line hands back the
   * list. The role is what tells the two apart, and the two of them are the case below.
   */
  const regionAt = (role: string, words: string): Region => {
    const found = flatten(tree()).find((one) => one.role === role && one.text.startsWith(words))
    expect(found, `no ${role} starts with ${words}`).toBeDefined()
    return found as Region
  }
  const comment = (regionId: RegionId, view?: Context['view']): Context => ({
    target: { kind: 'region', recordId: RECORD, regionId },
    place: { at: 'quote', words: 'The queue can be settled' },
    ...(view === undefined ? {} : { view }),
  })

  it('says the place is drawn inside the larger part that carries its characters', () => {
    const bullet = regionAt('bullet', '- The queue can be settled')
    const group = regionAt('bulletGroup', '- The queue can be settled')
    // A DRAWING THAT PUT THE LIST ON THE PAGE AND NOT EACH LINE OF IT.
    // `data.blocks` AND NOT `blocks`. The bare word is a region id no tree has ever held — the body
    // root is `data.blocks` — and a fixture holding one is a page the product cannot draw.
    const drawn = new Set<RegionId>(['data.blocks', 'data.blocks[#b-1]', group.id])
    const how = marks.howItDrawsHere(comment(bullet.id, { detail: 'gist' }), tree(), drawn)
    expect(how.drawing).toBe('inside')
    expect(how.on).toBe(group.id)
    // REDUCED, because the mark is not on the thing the comment is about.
    expect(how.reduced).toBe(true)
    expect(how.restoreTo).toEqual({ detail: 'gist' })
    // AND THE SENTENCE SAYS THE WORDS ARE HERE, which is the whole difference from `heldBy`.
    expect(how.says).toContain('drawn inside a larger part of the report here')
    expect(how.says).not.toContain('is not drawn here')
  })

  it('still says held-by when the larger part does not carry those characters', () => {
    const bullet = regionAt('bullet', '- The queue can be settled')
    // THE BLOCK IS DRAWN AND ITS PROSE IS NOT. A block region has no characters of its own, so the
    // words the comment was written on are not on this page and the sentence must not say they are.
    const drawn = new Set<RegionId>(['data.blocks', 'data.blocks[#b-1]'])
    const how = marks.howItDrawsHere(comment(bullet.id, { detail: 'gist' }), tree(), drawn)
    expect(how.drawing).toBe('heldBy')
    expect(how.on).toBe('data.blocks[#b-1]')
    expect(how.says).toContain('This place is not drawn here')
  })
})
