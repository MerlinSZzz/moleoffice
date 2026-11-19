// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT AT A SHORTER POSITION SHOWS FEWER THINGS. IT DOES NOT SHOW THE SAME THINGS SHORTENED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY A CHARACTER COUNT WOULD NOT HAVE CAUGHT IT
 * ---------------------------------------------------------------------------------------
 *
 * The whole-product dogfood set `Report content` to every one of the six positions the ladder had
 * then and counted the words on the page. It got 8,260 words six times. The report page never passed the record's stored
 * words to the component that draws them, so the setting reached nothing.
 *
 * A test that counted characters would not have caught the repair we did not want either. Prose cut
 * to a quarter of its length at every position gives six different counts and teaches a reader
 * nothing: it is the same report, worse. So this file asserts on the SET OF STORED FIELD PATHS the
 * page draws at each position, read off the drawn markup, and holds it to two rules:
 *
 *   THE SETS ARE ALL DIFFERENT. Two positions that draw the same fields are one position.
 *   EACH SET IS INSIDE THE NEXT. Nothing a reader could see at a shorter position disappears when
 *   they ask for more. That is what makes the control a ladder rather than six unrelated screens.
 *
 * A wrapper element cannot pass this and neither can a shorter sentence, because both draw the same
 * field paths.
 *
 * ---------------------------------------------------------------------------------------
 * THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * `report-round-eight` below is shaped from the owner's own report `m2Q0CybxoGNF` — a written
 * label, a written gist, a summary column, and a run of blocks that is headings, prose and things
 * that are neither. It is the one record in the live corpus with a label and a gist written, which
 * is why the ladder can be six distinct rungs on it and is fewer on records where nobody has
 * written the short forms. Those records are not a failure of the control and the settings grid
 * already dims the positions that coincide.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  detailKeyForSurface,
  READER_FLOOR,
  READER_RUNGS,
  RUNGS,
  type Rung,
} from '../src/shared/detail.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

let sb: SummaryBlocksModule
let store: Map<string, string>

beforeAll(async () => {
  store = new Map<string, string>()
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
})

beforeEach(() => {
  store.clear()
})

// ------------------------------------------------------------------------------- the record

const LABEL = 'Round eight'
const TITLE = 'Round eight: pointing at anything, saying what you mean, and reading the answers back'
/**
 * THE RECORD'S OWN SUMMARY, WHICH IS READING POSITION 3.
 *
 * It was a one-line summary that no position drew, and a separate stored `gist` sat beside it
 * carrying the words position 3 drew. Criterion A14b, which gives a summary of 20 to 60 words,
 * made the column the position, and the stored gist a retired key. So the words
 * that used to be the gist are the summary now, and the one-line summary that used to be here is
 * gone: a record has one summary and it is read at position 3.
 */
const SUMMARY =
  'Point at anything, comment on exactly those words, and have PanelX read the comments back. ' +
  'Six times something was built that nothing could reach, and only a person found it.'
/**
 * THE THREE LENGTHS WRITTEN BY PART, WHICH ARE WHAT SITS AT POSITIONS 4, 5 AND 6.
 *
 * They were three more whole-record texts — `card`, `brief` and `account` — until 2 September 2026,
 * when the owner retired all three and put the report's own parts in those seats: a heading per part
 * at level 4, the same heading with a 30-word text under it at level 5, and with a 120-word text at
 * level 6. The fixture writes them because below Full a position draws the form written for it and
 * nothing else, so a report with those three seats empty would draw the same nearest-shorter form at
 * three positions — true of the product, and it would make "every position draws a different set" a
 * statement about the fixture rather than about the ladder.
 *
 * EVERY BLOCK OF THE REPORT IS COVERED BY EXACTLY ONE PART, which is the rule the write door holds.
 */
const PARTS = [
  {
    id: 'p-standard',
    heading: 'The standard the whole report is measured against, and why',
    text30: 'The first part in thirty words. It sets the standard the rest is measured against.',
    text120:
      'The first part of the report at length. It sets out the three words the campaign is judged ' +
      'by, and says where the gap between the first two of them is widest.',
    covers: ['b-what-this-is', 'b-standard'],
  },
  {
    id: 'p-usable',
    heading: 'The six things a reader can do today, each pressed',
    text30: 'The second part in thirty words. It counts what a person can do now and could not before.',
    text120:
      'The second part of the report at length. It walks what a person can do today, and says that ' +
      'each was pressed in a browser rather than read out of a file.',
    covers: ['b-h-usable', 'b-usable-lead', 'b-usable-list'],
  },
  {
    id: 'p-arch',
    heading: 'Three separate architectural ideas that turned out to be one',
    text30: 'The third part in thirty words. It says the three architectural ideas are really one idea.',
    text120:
      'The third part of the report at length. Anything on the screen can be named, anything named ' +
      'can be commented on, and a comment carries the words it was about.',
    covers: ['b-h-arch', 'b-arch-lead', 'b-arch-table'],
  },
  {
    id: 'p-finding',
    heading: 'One finding that outweighs every separate defect in this report',
    text30: 'The fourth part in thirty words. What was built reached no screen, five separate times.',
    text120:
      'The fourth part of the report at length. Five separate features passed their own tests and ' +
      'then reached no screen a person could open, and the reading control was the sharpest.',
    covers: ['b-h-finding', 'b-finding-lead', 'b-finding-detail'],
  },
] as const

const OPENING =
  'This report is written inside Mole Office, about the campaign that built the thing you are reading ' +
  'it in. Every number in it was counted from the running server on the day it is dated.'

const BLOCKS: SummaryBlock[] = [
  { id: 'b-what-this-is', type: 'text', text: OPENING },
  {
    id: 'b-standard',
    type: 'callout',
    tone: 'warning',
    text:
      'Implemented is not reachable, and reachable is not usable. All three were measured separately ' +
      'and the gap between the first two is where every defect in this report lives.',
  },
  { id: 'b-h-usable', type: 'heading', text: 'What is genuinely usable now' },
  {
    id: 'b-usable-lead',
    type: 'text',
    text:
      'Six things a person can do today that they could not do on 18 August. Each one was pressed ' +
      'in a browser rather than read out of a file, and the ones that failed under a finger are in ' +
      'the next section rather than this one.',
  },
  {
    id: 'b-usable-list',
    type: 'list',
    items: ['Point at a passage', 'Comment on the words', 'Read the comments back'],
  },
  { id: 'b-h-arch', type: 'heading', text: 'What changed architecturally' },
  {
    id: 'b-arch-lead',
    type: 'text',
    text:
      'Three ideas, and they turned out to be one idea. Anything on the screen can be named, ' +
      'anything named can be commented on, and a comment carries the words it was about rather ' +
      'than a coordinate that stops meaning anything the moment the page reflows.',
  },
  {
    id: 'b-arch-table',
    type: 'table',
    columns: [{ label: 'What' }, { label: 'Where' }],
    rows: [{ cells: ['The target model', 'src/shared/targets.ts'] }],
  },
  { id: 'b-h-finding', type: 'heading', text: 'The finding worth more than any single defect' },
  {
    id: 'b-finding-lead',
    type: 'callout',
    tone: 'warning',
    text:
      'What was built was never connected to anything that would use it. Five separate features ' +
      'passed their own tests, shipped, and reached no screen a person could open.',
  },
  {
    id: 'b-finding-detail',
    type: 'text',
    text:
      'The sharpest one is the detail control. The resolver was correct, the settings grid was ' +
      'correct, and the report page never asked either of them anything at all.',
  },
]

/** Exactly what the report page passes, which is the record's other stored words. */
const STORED = {
  title: TITLE,
  summary: SUMMARY,
  shortForms: {
    label: { text: LABEL, writtenBy: 'human', madeFrom: { seq: 1, contentHash: 'aaaa' } },
    // AND NOTHING ELSE WHOLE-RECORD, SINCE 3 SEPTEMBER 2026. A stored `title` form was added here
    // that morning, when criterion A14a made the column stop counting as position 2; criterion
    // A14b the same day made the column BE position 2 and retired both keys, so the two columns
    // above are what positions 2 and 3 draw and the label is the one form written beside them.
    parts: { writtenBy: 'human', madeFrom: { seq: 1, contentHash: 'aaaa' }, parts: PARTS },
  },
  declaresShortForms: true,
  body: { field: 'data.blocks', written: true },
}

const IN_RECORD = {
  recordId: 'report-round-eight',
  kind: 'report',
  stored: STORED,
  // WHICH TREE THIS DRAWING ANNOUNCES, SAID RATHER THAN CAST PAST. `BlocksInRecord.wholeRecord` was
  // made REQUIRED and NULLABLE on 1 September 2026 precisely so a caller cannot silently rejoin the
  // world where the drawing announced the report body and the write door validated against the
  // record — and an `as never` on the props below let this fixture do exactly that. Null is the
  // honest answer here: these blocks are stored nowhere, this fixture has no record's links to
  // derive relation sections from, and announcing a tree missing some of the door's parts is the
  // same fault in smaller clothes. What is measured in this file is how much is drawn, which the
  // tree does not decide.
  wholeRecord: null,
}

// ------------------------------------------------------------------------------- the drawing

/** Draw the report's content with the reader's setting on this position. */
function drawAt(rung: Rung): string {
  store.set(detailKeyForSurface('reportContent'), rung)
  // THE CAST IS GONE, AND SO IS WHAT IT WAS HIDING. Until 3 September 2026 the props here were
  // written `as never`, and taking the cast off made the compiler say what the fixture had been
  // getting away with: `layout: 'editorial'` is not one of the two layouts this component has a
  // case for. `editorial` was renamed `page` when the six reading profiles became two, so the
  // fixture had been asking for a profile the product does not have and quietly getting the panel
  // one. `page` is the profile the record page draws a report in, which is the surface every case
  // in this file is about, so it is what these cases measure at now. The only difference in the
  // drawing is the class that says the writing is the page; no case here reads a class.
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, { blocks: BLOCKS, layout: 'page', inRecord: IN_RECORD }),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/**
 * WHAT THE SETTINGS PAGE'S PREVIEW DRAWS: the same component, told which position to draw at.
 *
 * `drawAt` ABOVE SETS A READER'S OWN CHOICE AND THIS SETS THE PROP, and since 3 September 2026 the
 * two are not the same question. Criterion A19 stops a reader at the conclusion, so `drawAt('label')`
 * now draws the conclusion. The prop is the settings preview's route and it draws any of the seven,
 * which is what a box that exists to show what a position looks like has to do. Every case that is
 * about what levels 1 and 2 DRAW reads this one; every case about what a READER gets reads the other.
 */
function previewAt(rung: Rung): string {
  store.clear()
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: BLOCKS,
      layout: 'page',
      inRecord: IN_RECORD,
      drawAt: rung,
    }),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/**
 * THE STORED PATHS THE DRAWING SAYS IT READ.
 *
 * Every drawn part of a report's content carries the path it came out of. A part with no path is
 * a part nobody can check, so a set built from these is a set of claims each of which the next
 * test byte-compares against the stored value.
 */
function fieldsDrawn(html: string): Set<string> {
  return new Set([...html.matchAll(/data-drawn-from="([^"]+)"/g)].map((m) => m[1] as string))
}

/**
 * THE SAME SET WITHOUT THE ONE ABSTRACT LINE, which is what the nesting cases below are about.
 *
 * ADDED 2 September 2026 with the criterion. A reading length draws ONE abstract — the form written
 * for it, or the nearest shorter one written — and that line is REPLACED as the length changes
 * rather than added to. So the abstract's stored path is not nested and cannot be: reading length 1
 * draws the label's path and reading length 2 draws the title's. What must still nest is everything
 * the report itself supplies, and that is what this reads.
 *
 * WHAT THIS PARAGRAPH SAID UNTIL 3 SEPTEMBER 2026, AND WHY IT WAS WRONG. It said *"nothing is lost
 * from the page by that replacement: the record page's Shorter forms of this report panel draws all
 * six, each with who wrote it and when."* That panel was removed from the record page on
 * 2 September 2026, the day before, on a ruling — criteria A10 and A13 of
 * design/pointing-reopened/ACCEPTANCE.md retired — so the sentence pointed a reader at a box nobody
 * can open.
 *
 * WHERE A SHORTER FORM IS READ NOW: right-clicking a line of the report opens the composer, which
 * says what the form stands for and who wrote it. The forms themselves are unchanged — stored under
 * `data.shortForms`, written and read through `/api/records/:id/short-forms`, checked against the
 * body by the same door — and the report body draws the one written for the length on screen.
 *
 * AND A PART'S HEADING AND TEXT ARE THE ABSTRACT AT LEVELS 4, 5 AND 6, so both are taken out for the
 * same reason. Those three lengths are written by part: level 4 draws each part's heading, level 5
 * adds its 30-word text and level 6 its 120-word text, and each REPLACES the last rather than adding
 * to it, exactly as the one line at levels 1 to 3 is replaced. Full then draws the report itself and
 * none of them, which is the replacement finishing rather than a loss. What a part draws that IS the
 * report — the pictures it covers — keeps its own path and still has to nest, so only the written
 * words are taken out and not the whole part.
 */
function fieldsOfTheReport(html: string): Set<string> {
  return fieldsDrawn(
    html
      .replace(/<p class="sb-open-line"[\s\S]*?<\/p>/g, ' ')
      .replace(/<p class="sb-part-heading"[\s\S]*?<\/p>/g, ' ')
      .replace(/<p class="sb-part-text"[\s\S]*?<\/p>/g, ' '),
  )
}

/** The words a reader sees, with the markup taken out. */
function readable(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The words of the report itself, with the controls that change how it is read taken out.
 *
 * A control is furniture: it says the same thing at every position, so it is not part of what the
 * report says. `.sb-read-as` is the row above the writing and `.sb-howmuch` is the row below it.
 *
 * AND THE LINE SAYING THIS LEVEL HAS NOT BEEN WRITTEN. `.sb-nosummary` is that line. It is the page
 * talking about the report, and `tools/zoom-sweep.mjs` has subtracted it since it was written —
 * this instrument had not, and once each length drew only its own abstract that showed: position 2
 * counted 265 characters against position 3's 198, because position 2's line is longer than
 * position 3's abstract. That is the furniture being measured, not the report.
 *
 * FOUR MORE SELECTORS LEFT THIS LIST. The outline's two labels and the mark saying who wrote the
 * abstract went on 2 September 2026; `.sb-abovehere`, the note that this length's form was drawn
 * above the report, went on 3 September with the fallback that made it reachable. All four left the
 * page, so a rule for them here would be a rule about nothing.
 */
function writing(html: string): string {
  return readable(
    html
      // THE LEVEL CONTROL, DRAWN TWICE: once above the writing and once in the foot. Both are
      // furniture and neither is the report. The second `replace` takes the foot and everything
      // after it, which is what the old `sb-howmuch` rule did.
      .replace(/<div class="sb-level"[\s\S]*?<\/div>\s*(?=<)/g, ' ')
      .replace(/<div class="sb-foot"[\s\S]*?$/g, ' ')
      .replace(/<div class="sb-nosummary"[\s\S]*?<\/div>/g, ' '),
  )
}

/**
 * EVERY POSITION ON THE LADDER, READ FROM THE DECLARATION RATHER THAN TYPED OUT.
 *
 * It was the six words written out. A sixth authored length was declared on 30 August 2026 and this
 * file went green without ever drawing it: the two rules below are the only thing holding the new
 * position to being a position, and a list typed here excludes exactly the position nobody has
 * checked yet.
 */
const SIX: readonly Rung[] = RUNGS

/**
 * AND WHICH OF THEM A READER CAN CHOOSE, WHICH IS FIVE OF THE SEVEN SINCE 3 SEPTEMBER 2026.
 *
 * Criterion A19: a person reads a record's own content no lower than the
 * conclusion. `drawAt` sets a reader's choice and is therefore raised to the floor; `previewAt`
 * sets the prop the settings preview passes and reaches all seven. Every case below says which
 * route it is asking, because the two now answer differently at levels 1 and 2 and that difference
 * is the criterion rather than a fault.
 */

function isInside(smaller: Set<string>, bigger: Set<string>): string[] {
  return [...smaller].filter((f) => !bigger.has(f))
}

// ------------------------------------------------------------------------------- the proof

describe('every position of a report draws a different set of stored fields', () => {
  it('really drew the report, so an empty search cannot pass quietly', () => {
    const html = drawAt('full')
    expect(readable(html)).toContain('This report is written inside Mole Office')
    expect(fieldsDrawn(html).size).toBeGreaterThan(5)
  })

  /**
   * NARROWED 2 September 2026 in the evening, and the reason is on the page rather than here. Below
   * Full a position draws one thing: the form written for it. So the SET a position draws differs
   * from every other position's set by that one stored path, and no longer by the parts of the
   * report underneath it. A position whose form nobody wrote draws no path at all, which is why
   * this is asserted over the six lengths of a report that has all six forms written.
   */
  /**
   * TWO CASES, AND IT WAS ONE UNTIL 3 SEPTEMBER 2026. It read `draws a different set of stored
   * fields at every one of them` over all seven positions through a reader's own choice. Criterion
   * A19 stops a reader at the conclusion, so through that route three of the seven draw the
   * conclusion's fields and the count is five. The seven-way claim is unchanged and is now asked
   * through the settings preview, which is the route that still reaches every position.
   */
  it('draws a different set of stored fields at every position a reader can choose', () => {
    const printed = READER_RUNGS.map((rung) => [...fieldsDrawn(drawAt(rung))].sort().join(' '))
    expect(new Set(printed).size).toBe(READER_RUNGS.length)
  })

  it('draws a different set of stored fields at every one of the seven, in the preview', () => {
    const printed = SIX.map((rung) => [...fieldsDrawn(previewAt(rung))].sort().join(' '))
    expect(new Set(printed).size).toBe(SIX.length)
  })

  /**
   * CHANGED 2 September 2026 with the criterion: it read `fieldsDrawn` and now reads
   * `fieldsOfTheReport`, which is the same set without the one abstract line. The rule that every
   * advertised length is one short abstract makes each length draw ONE abstract,
   * its own, so the abstract's stored path is replaced as the length changes rather than added to.
   * Everything the report itself supplies still nests, and that is what this holds.
   */
  it('never loses a part of the report as the reader asks for more', () => {
    const sets = SIX.map((rung) => fieldsOfTheReport(drawAt(rung)))
    for (let i = 0; i + 1 < sets.length; i += 1) {
      const lost = isInside(sets[i] as Set<string>, sets[i + 1] as Set<string>)
      expect(`${SIX[i]} → ${SIX[i + 1]} lost ${lost.join(', ')}`).toBe(`${SIX[i]} → ${SIX[i + 1]} lost `)
    }
  })

  /**
   * CHANGED 2 September 2026 with the criterion, for the same reason, AND the step it asserts is
   * now no-smaller rather than strictly bigger. Reading lengths 1, 2 and 3 draw no part of the
   * report at all on a report with nothing addressed to the owner — that is the owner's sentence — so the
   * set is empty at all three and cannot grow between them. What may never happen is the set
   * SHRINKING as a reader asks for more, and the case above is what holds that.
   */
  it('never draws fewer parts of the report as the reader asks for more', () => {
    const sizes = SIX.map((rung) => fieldsOfTheReport(drawAt(rung)).size)
    for (let i = 0; i + 1 < sizes.length; i += 1) {
      expect(sizes[i + 1] as number).toBeGreaterThanOrEqual(sizes[i] as number)
    }
    // AND IT REALLY DOES GROW ACROSS THE LADDER, so a set that were empty everywhere would fail.
    expect(sizes[sizes.length - 1] as number).toBeGreaterThan(sizes[0] as number)
    // AND EXACTLY ONE ABSTRACT IS DRAWN AT EVERY POSITION BELOW FULL, which is the other half of
    // the owner's sentence. Full draws none: nobody writes a form of the whole report, so the line there was
    // the sixth length's form, and it left the page with the mark saying which length wrote it.
    for (const rung of SIX) {
      // ONE ABSTRACT, IN WHICHEVER OF ITS TWO SHAPES THIS LENGTH WRITES IT. Levels 1 to 3 draw one
      // line; levels 4, 5 and 6 draw the report's parts, which is one abstract made of parts and is
      // drawn as one block. Counting only the line would have read the three by-part lengths as
      // drawing no abstract at all.
      const html = drawAt(rung)
      const openLines =
        [...html.matchAll(/<p class="sb-open-line"/g)].length + [...html.matchAll(/<div class="sb-parts"/g)].length
      const wanted = rung === 'full' ? 0 : 1
      expect(openLines, `${rung} drew ${String(openLines)} abstracts`).toBe(wanted)
    }
  })

  /**
   * THE ONE-FIFTH THRESHOLD IS WITHDRAWN. THE OWNER OVERRULED IT AND THIS SAYS SO.
   *
   * WHAT IT SAID: *"says less than a fifth as much at the third position as at the sixth"*, as
   * `expect(gist).toBeLessThan(full / 5)`.
   *
   * WHAT IT SAYS NOW: each position says no more than the position above it.
   *
   * WHY. A ruling on how long a reading length may be:
   *
   *   when the report is mostly unfinished work, the level says so.
   *
   * A reading length is as long as the things it has to preserve. A fixed ratio is a word budget
   * under another name, and a word budget is a rule that drops a conclusion, a piece of unfinished
   * work or something addressed to the owner in order to hit a number. `design/problem-02/
   * OWNER-ANSWERS.md` §2 is the ruling; `design/problem-02/ACCEPTANCE.md` C13 is the criterion that
   * replaces this one, and C14 is the shortening that survives it.
   *
   * WHAT REPLACES IT IS NOT NOTHING, and that matters, because withdrawing a check is the cheapest
   * way to make a failure go away. Monotonic shortening is what was kept — a reading generally
   * becomes shorter as detail decreases — and it is what this asserts. A position that said MORE than the
   * one above it would still fail here.
   */
  it('says no more at one position than at the position above it', () => {
    const lengths = SIX.map((rung) => writing(drawAt(rung)).length)
    for (let i = 0; i + 1 < lengths.length; i += 1) {
      const said = `${SIX[i]}=${String(lengths[i])} then ${SIX[i + 1]}=${String(lengths[i + 1])}`
      expect(said, said).toBe(
        (lengths[i] as number) <= (lengths[i + 1] as number) ? said : 'a shorter position said more',
      )
    }
  })
})

describe('what a reader can actually read at each position', () => {
  /**
   * IT READ `drawAt('label')` UNTIL 3 SEPTEMBER 2026. Criterion A19 stops a reader at the
   * conclusion, so that route draws the summary now and the label is not on it. What the label
   * DRAWS is unchanged, and the settings preview is where it is still drawn, so the case reads that
   * route. What a READER gets at the shortest position they reach is the case below, which asserts
   * the conclusion alone.
   */
  it('gives the shortest position the words somebody wrote for it and nothing else', () => {
    const words = readable(previewAt('label'))
    expect(words).toContain(LABEL)
    expect(words).not.toContain(TITLE)
    expect(words).not.toContain('What is genuinely usable now')
  })

  /**
   * CHANGED 2 September 2026 with the criterion. It used to assert `words` contained the TITLE as
   * well, because the third position drew the trail of every shorter form. The owner's sentence that day is
   * that an advertised level is ONE short abstract, so the third position draws the conclusion
   * somebody wrote for it and nothing else.
   *
   * WHERE THE TITLE STILL IS. In the record page's own heading, and at position 2, which is the
   * record's own title column since criterion A14b of 3 September 2026. This comment used to add
   * *"and in the Shorter forms of this report panel"*; that panel was removed on 2 September and
   * naming it here taught a reader about a box that is not on the page.
   */
  it('draws the conclusion at the third position, alone, and still draws no heading', () => {
    const words = readable(drawAt('gist'))
    expect(words).toContain(SUMMARY)
    expect(words).not.toContain(TITLE)
    expect(words).not.toContain('What is genuinely usable now')
  })

  /**
   * THE FOURTH AND FIFTH POSITIONS USED TO DRAW THE REPORT'S HEADINGS, AND THEN ITS HEADINGS PLUS
   * THE OPENING OF EACH PART. Both went on the evening of 2 September 2026, by a ruling
   * that nothing is drawn under the written form at any length, not even an excerpt. So the
   * two cases that asserted those sets now assert what replaced them — the form written for the
   * position, alone — and the report's own names and prose are what Full is for.
   */
  it('draws the form written for the fourth position and no name of a part of the report', () => {
    const words = readable(drawAt('outline'))
    // ONE LINE PER PART, WHICH IS WHAT THE FOURTH POSITION IS. Each is the heading somebody wrote
    // for that part, and none of them is a heading the report itself carries.
    for (const part of PARTS) expect(words).toContain(part.heading)
    expect(words).not.toContain('What is genuinely usable now')
    expect(words).not.toContain('What changed architecturally')
    expect(words).not.toContain('Six things a person can do today')
    // AND NOT THE LONGER TEXT OF ANY PART. The fourth position draws the heading alone.
    for (const part of PARTS) expect(words).not.toContain(part.text30)
  })

  it('draws the form written for the fifth position and none of the report', () => {
    const words = readable(drawAt('sketch'))
    for (const part of PARTS) expect(words).toContain(part.text30)
    expect(words).not.toContain('What is genuinely usable now')
    expect(words).not.toContain('Six things a person can do today')
    expect(words).not.toContain('src/shared/targets.ts')
  })

  it('draws every block at the seventh, which is the report itself', () => {
    const words = readable(drawAt('full'))
    expect(words).toContain('Six things a person can do today')
    expect(words).toContain('src/shared/targets.ts')
  })
})

/**
 * THE THREE LEVEL-CONTROL CASES THAT STOOD HERE WERE CUT ON 3 SEPTEMBER 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THEY WERE
 * ---------------------------------------------------------------------------------------
 *
 * A describe called *a reduced report says which level it is at, and offers the way to more*, with
 * three cases: the level's label is in the words at every position a reader reaches below Full; the
 * two positions below the reader's floor are still named in the settings preview; and the plus
 * button is drawn and not disabled at every position below Full.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH OF THE THREE LIVES NOW, AND WHY IT IS STRONGER THERE
 * ---------------------------------------------------------------------------------------
 *
 * `tests/one-level-control-above-and-below-the-report.test.ts` asserts the same control:
 *
 *   THE LABEL — *draws that same label on the control at every one of the seven positions*. It
 *   walks all seven rather than the four below Full, it reads the label element itself rather than
 *   searching a page of text for the words, and it does it for BOTH instances of the control.
 *   That case covers the second of the three as well: the settings preview's route is the route it
 *   walks, so Level 1 and Level 2 are two of its seven.
 *
 *   THE PLUS — *disables plus at Full and nowhere else*, over all seven positions and both
 *   instances. The case here looked at one instance and only asked whether the button existed.
 *
 * AND THE READER'S OWN ROUTE, which is what `drawAt` sets here, is held by
 * `tests/a-reader-goes-no-lower-than-conclusion.test.ts`: it presses minus in a real browser down
 * to the conclusion and asserts that a stored choice below the floor draws Conclusion.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR, WHICH IS NOT THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * It is for WHAT IS DRAWN at each position: the set of stored field paths, whether the sets nest,
 * and whether each position draws the words somebody wrote for it. The control is furniture, and
 * `writing()` above takes it out of the text before any of that is counted — so three cases about
 * the furniture were the one thing in this file measuring something another file measures better.
 *
 * AND ONE WEAKER GUARANTEE IS RECORDED RATHER THAN LOST. Until 2 September 2026 the foot carried a
 * count reading `N of N blocks are not drawn whole` and a `Full ▸` button, so a reduced report said
 * how much it was not drawing and the whole report was one press away. The owner replaced both with
 * the level control, which says which level it is at and moves one level per press. Problem
 * `GmMV5kyE9joN` in Mole Office holds what was given up.
 */

describe('the preview on the settings page and the report page cannot disagree', () => {
  /**
   * AT EVERY POSITION A READER CAN CHOOSE, AND IT WAS ALL SEVEN UNTIL 3 SEPTEMBER 2026.
   *
   * Criterion A19 stops a reader at the conclusion, so at levels 1 and 2 the two ROUTES draw
   * different things on purpose: the box shows the position asked for and the page shows what a
   * reader would actually get. That is the criterion, not a disagreement, and the case below
   * asserts it in those words so nobody reads this shortened loop as coverage quietly dropped.
   */
  it('draws the same stored fields in the preview as on the page, at every position a reader can choose', () => {
    for (const rung of READER_RUNGS) {
      const onThePage = [...fieldsDrawn(drawAt(rung))].sort().join(' ')
      const inTheBox = [...fieldsDrawn(previewAt(rung))].sort().join(' ')
      expect(`${rung}: ${inTheBox}`).toBe(`${rung}: ${onThePage}`)
    }
  })

  it('draws the two below the floor in the box, and the conclusion on the page', () => {
    for (const rung of ['label', 'title'] as const) {
      const inTheBox = [...fieldsDrawn(previewAt(rung))].sort().join(' ')
      const onThePage = [...fieldsDrawn(drawAt(rung))].sort().join(' ')
      const atTheFloor = [...fieldsDrawn(drawAt(READER_FLOOR))].sort().join(' ')
      expect(inTheBox, `the box stopped drawing ${rung}`).not.toBe('')
      expect(`${rung} in the box: ${inTheBox}`).not.toBe(`${rung} in the box: ${atTheFloor}`)
      expect(`${rung} on the page: ${onThePage}`).toBe(`${rung} on the page: ${atTheFloor}`)
    }
  })
})

describe('every drawn field path names words that are stored under it', () => {
  /**
   * CHANGED TWICE ON 2 SEPTEMBER 2026. It read all four forms at the fifth position, because that
   * position drew the trail of every shorter form; then each length drew ONE form; then, in the
   * evening, the report's own blocks left every length below Full. So each of these is the one
   * stored value that position draws, whole.
   */
  it('draws the stored characters and never a cut of them', () => {
    // Each of these is one whole stored value, byte for byte, drawn at a position shorter than the
    // whole report. A cut would end mid-sentence and fail here.
    // THE FIRST TWO READ `drawAt` UNTIL 3 SEPTEMBER 2026 and read the preview now: criterion A19
    // stops a reader at the conclusion, so a reader's own choice draws the summary at all three.
    // What is asserted is unchanged — the whole stored value, byte for byte, at the position it was
    // written for — and only the route to the first two moved.
    expect(readable(previewAt('label'))).toContain(LABEL)
    expect(readable(previewAt('title'))).toContain(TITLE)
    expect(readable(drawAt('gist'))).toContain(SUMMARY)
    // AND EACH PART'S OWN TEXT AT THE TWO LENGTHS THAT DRAW ONE, whole. Positions 5 and 6 are
    // written by part, so what has to arrive byte for byte is every part's text and not one string.
    for (const part of PARTS) expect(readable(drawAt('sketch'))).toContain(part.text30)
    for (const part of PARTS) expect(readable(drawAt('digest'))).toContain(part.text120)
  })
})
