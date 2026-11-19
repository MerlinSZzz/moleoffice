// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT PART OF A SEMANTIC REGION IS OWNED BY NOTHING, HOW A COMPOSITION DIVIDED ITS ROW, AND WHERE
 * ENGLISH IS WRAPPING MID-WORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's problem 1 has two acceptance tests and neither is answerable by reading CSS:
 *
 *   "There must be no obvious large dead band caused by a component-local hard width"
 *   "no semantic column should collapse into unreadable vertical text"
 *
 * A width in a stylesheet does not tell you either one. IT MEASURES THE DRAWN PAGE, NOT THE
 * STYLESHEET. Both faults are properties of what the browser actually laid out at a given width in
 * a given theme, which is why prior campaigns kept declaring this fixed while the screen disagreed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPORTS, AND WHAT IT USED TO REPORT
 * ---------------------------------------------------------------------------------------
 *
 * It used to headline `regionWidth - typicalProse`: the width of the region minus the width most
 * paragraphs draw at. THAT NUMBER IS NOW MEANINGLESS AND IT IS GONE. Under the model the owner set
 * on 28 August 2026, a Semantic Region owns all of its space, a composition of one part is one
 * column at 100% of it, and prose SHOULD be as wide as its column. So the old headline scored the
 * intended result as the fault: a correct 60/40 composition would have reported a 40% dead band
 * with 100% of the prose "capped". `cappedShare` (prose under 0.8 x the region) is gone with it,
 * for the same reason. Both are in `design/problem-01/OWNER-ANSWER-COMPOSITION.md`.
 *
 * WHAT REPLACES IT IS COVERAGE. For every box in the region whose children lay out as blocks, the
 * children are grouped into rows by vertical overlap, and each row's children are compared with the
 * box's content edges. A run of the row that no child covers is a STRIP: space inside the box that
 * nothing owns. A strip at the left or right content edge is what the owner is describing as a dead
 * band. A strip between two siblings is a gutter, and is reported separately rather than hidden,
 * because hiding it would be this instrument deciding what counts.
 *
 * A STRIP ONLY MATTERS IF SOMETHING WANTED IT, so every strip is asked that question and the answer
 * comes from the layout: each child in the row is given `width: max-content` with its cap removed,
 * measured again, and put back. A paragraph capped at 908px answers with the width of one unbroken
 * line, so it wanted the space beside it -- that strip is STRANDED, and it is the dead band the
 * owner's sentence is about. A chip answers with the width it already has, so the space beside it is
 * SLACK. Without this the headline on report OOOt4Kouc5dT was a 71px label with 94% of its row empty
 * beside it, which is a true number about nothing.
 *
 * AND A STRIP SOMEBODY ASKED FOR IS AUTHORED, not stranded. A prose child may state its own reading
 * measure inside its full-width column -- layer 4 of the owner's model -- and the writing it narrows
 * still answers "I wanted more". `data-measure` on the box or on a child of the row says an author
 * asked for that whitespace, and the strip is counted separately and never in the stranded headline.
 * All three counts are on every line; stranded and authored are printed in detail.
 *
 * This subsumes the per-paragraph `proseBands` the previous version also carried: a paragraph
 * drawing at 908px inside a 1164px block IS a 256px right-edge strip in that block. One fact, one
 * place. The width most prose draws at is still reported, as a width and never as a band.
 *
 * FOR EACH COMPOSITION it reports the parts, the width each was drawn at, the share the report
 * asked for (`data-asked`, absent when nobody asked), the share the renderer resolved
 * (`data-share`), and the share actually drawn, worked out from the drawn widths. Asked and drawn
 * are printed side by side because the layout is allowed to refuse the ask and the whole question
 * is whether the refusal is visible. It also says whether the parts are side by side or stacked.
 * A `columns` block resolves its shares but writes no `data-share` on a column, so those rows print
 * `no data-share` rather than an assumed 1. That is the markup being reported as it is.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE HAS NOW BEEN WRONG IN THREE DIFFERENT DIRECTIONS, AND SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Twice it flattered its author. A headline that took the widest paragraph in the region and
 * reported a 0% dead band, and a Context Bundle measured on a page that did not contain the table
 * being measured — both printed a clean number about a page that was not clean.
 *
 * Once it was too harsh, and that is the 29 August 2026 correction below. It was taught to FAIL a
 * "cramped column" — a column whose average line holds fewer than three words. Twenty flagged cases
 * were then photographed and classified against the owner's own eye. NINETEEN WERE ORDINARY
 * WRAPPING, sixteen of them flagged by that rule alone: table cells and card captions at 105 to
 * 222px with every word whole and every row intact, on Reports they had resized themselves and called
 * acceptable. And the same shape of rule read 0 for twenty consecutive runs on the 94px Context
 * Bundle column that WAS the fault they named, because that column's words happened to be short.
 *
 * A rule that is silent on the real fault and loud on approved layouts has no agreement with the
 * owner's eye, so it is gone. Criteria 7 and 20 of design/problem-01/ACCEPTANCE.md were replaced the
 * same day and this file follows them rather than the other way round.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS A FAULT NOW: ONE RULE, FOUR DEFINITIONS
 * ---------------------------------------------------------------------------------------
 *
 * No plain English word is drawn in more than one piece, and none is drawn outside the content box
 * of the element that holds it. That is the whole pass-or-fail gate. Four definitions make it
 * decidable and EACH ONE EXISTS BECAUSE A MEASURED FALSE RESULT FORCED IT:
 *
 *   1. A WORD IS A WHOLE WHITESPACE-DELIMITED TOKEN. A token holding a digit, a dot, a slash, a
 *      backslash, an at sign, a colon, a hash, an underscore or a lower-to-upper letter change is an
 *      identifier or a path and is not judged — nor is any letter run inside it. The old code ran its
 *      regex over letter runs INSIDE a token, so "test_cla|ude" and "ro|und-" breaking inside a file
 *      path were five failures on the gate report at 1440 and eight at 390. Criterion 7's own text
 *      exempted paths and this file's own comment claimed it did: one fact in two places, inside the
 *      instrument that judges this repository for exactly that defect.
 *   2. A HYPHEN IS A LEGAL BREAK, so each hyphen-free letter run of four or more letters is judged
 *      on its own. This part was already right and is kept.
 *   3. IN MORE THAN ONE PIECE MEANS TWO OR MORE DISTINCT RECTANGLE TOPS. Counting rectangles is
 *      wrong: a line truncated with text-overflow:ellipsis returns the SAME rectangle twice, which
 *      was 21 false failures on Home at 1440 and 27 at 390.
 *   4. NOT DRAWN IS NOT JUDGED, AND THE REASON IS PRINTED. A box 2px or smaller either way or
 *      clipped by clip / clip-path:inset(50%); display:none, visibility:hidden or opacity 0; a line
 *      truncated with an ellipsis; and any subtree inside a CLOSED <details>, where Chromium still
 *      answers getBoundingClientRect and where 12 more false failures came from. Every skipped word
 *      is counted and printed by its reason, so nothing is thrown away quietly.
 *
 * A NARROW COLUMN IS MEASURED AND LISTED, AND IS NOT A FAULT. The owner's definitions "loss of
 * semantic structure" and "another responsive representation would clearly be better" are
 * comparative judgements about a design that does not exist yet, and no threshold tried has
 * separated them from ordinary wrapping. Two were tried and measured; ACCEPTANCE.md has both. So
 * this file prints the ten narrowest columns holding three or more English words, per surface per
 * width, with the drawn width, the share of the box holding it, the line count, the text — and A
 * CROPPED SCREENSHOT of each written to .logs/dead-band/narrow/. A person reads the list. Nothing
 * is discarded; the pass-or-fail authority moves to the one thing a machine can decide.
 *
 * IT MEASURES COLUMNS, NOT BOXES. A column is the set of text boxes drawn between the same two
 * vertical edges — which is what a table column is, and also what a stack of paragraphs in a part
 * is, so one rule covers both and nothing has to know it is looking at a table.
 *
 * SIDEWAYS SCROLL is asked of the page and of every box, not only the document.
 *
 * HOME IS AUDITED FROM 29 AUGUST 2026, AND IT IS WHERE THE ONLY REAL FAULT WAS. The surface list
 * held six Reports and Modules and no Home, and the one word in this whole corpus that a browser
 * genuinely drew in two pieces — "migrations", in a 76px row title at 1440 in both themes — was on
 * Home. The criterion could not see the only case it exists to catch. C19 of ACCEPTANCE.md names it
 * now.
 *
 * IT WORKS ON A SURFACE WITH NO COMPOSITIONS, AND FOR TWENTY RUNS THAT WAS ALL IT EVER SAW. Until 29
 * August 2026 the surface list below held no report containing a `beside` or a `columns` block, so
 * every run printed `compositions 0` and the composition half of this file was exercised only by
 * `--self-check`, against boxes built by hand in this file. `GxfE29Cp69fz` is in the list now and
 * the count is ten.
 *
 * `--self-check` builds one box whose answers can be worked out on paper and prints the arithmetic
 * beside what the instrument said. It exists because this instrument has been wrong in its author's
 * favour three times: a headline that took the widest paragraph and reported 0%, a canvas estimate
 * that disagreed with the layout by a sub-pixel, and a Context Bundle measured on a page that did
 * not contain the table being measured. It checks THIS FILE'S arithmetic, not the product.
 *
 *   node tools/dead-band.mjs                       # every surface, 1440 and 390, light and dark
 *   node tools/dead-band.mjs --only home           # the surface the one real fault was on
 *   node tools/dead-band.mjs --json out.json       # also write every measurement
 *   node tools/dead-band.mjs --only report-prose   # one surface
 *   node tools/dead-band.mjs --self-check          # the arithmetic, against a box built by hand
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { whereIsTheWebApp } from './where-is-the-api.mjs'

const BASE = whereIsTheWebApp()

/** The surfaces the owner named, each with the container their complaint is about. */
const SURFACES = [
  /* THE PAGE A READER LANDS ON, AND IT WAS NOT IN THIS LIST UNTIL 29 AUGUST 2026. Every surface
     below it is a record being read. Home is the one that draws lists of records, and a list draws a
     title beside other things in a narrow row, which is the shape that broke. */
  { key: 'home', what: 'the page a reader lands on', route: '#/', region: '.page' },
  { key: 'report-prose', what: 'a long prose Report', route: '#/r/OOOt4Kouc5dT', region: '.sb-reads' },
  { key: 'report-table', what: 'a Report containing a table', route: '#/r/aNblDVkNB8DR', region: '.sb-reads' },
  { key: 'module', what: 'a Module', route: '#/r/cegP4HnIk9nd', region: '.page' },
  /* THE PREVIEW, NOT THE RESTING PAGE, AND THAT DISTINCTION WAS A REAL FAULT IN THIS FILE.
     The bundle's parts table renders only when a preview exists -- BundlePanel.tsx renders it behind
     `preview !== null` -- which takes two presses. This entry used to load `#/bundles` and measure
     whatever was there, which is a heading and one button. It then reported "0 mid-word breaks" for
     the Context Bundle, and that number was quoted as evidence that the bundle fault was fixed. It
     was measured on a page that does not contain the table. The fault was real, the fix is real, and
     the evidence was not evidence. */
  {
    key: 'bundle',
    what: 'a Context Bundle preview',
    route: '#/bundles',
    region: '.page',
    press: ['Choose a reading', 'Read what it would say'],
  },
  { key: 'decision', what: 'a mixed prose + structured surface', route: '#/r/ZcS5cMMmMCLr', region: '.sb-reads' },
  /* THE ONLY SURFACE IN THIS LIST THAT HOLDS A COMPOSITION, AND WITHOUT IT THE COMPOSITION HALF OF
     THIS INSTRUMENT REPORTED NOTHING. From the day the composition reader was written (4fb394b, 28
     August 2026) until 29 August, every one of the twenty runs printed `compositions 0`, because
     the five surfaces above hold no `beside` block and no `columns` block and this list is the only
     thing that decides what gets loaded. The composition branch had been exercised only by
     `--self-check`, which builds its boxes by hand in this file, so it had never met the product's
     own markup. Five build steps set "the count stops being zero" as an exit condition and none of
     them added a surface.

     `GxfE29Cp69fz` is the report written for the problem-1 gate, holding every arrangement the owner
     listed; `design/problem-01/shots/README.md` photographs the same record. It is a permanent
     record and not one of the THROWAWAY fixtures, so this entry does not rot when those are removed. */
  { key: 'compositions', what: 'a Report holding compositions', route: '#/r/GxfE29Cp69fz', region: '.sb-reads' },
]

const WIDTHS = [1440, 390]
const THEMES = ['light', 'dark']

/* WHERE THE CROPS GO. A picture of every narrow column, so the list is read from what was drawn and
   not from a number about it. One directory, rewritten every run, named after the run's surfaces. */
const SHOTS = '.logs/dead-band/narrow'

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const jsonAt = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
const selfCheck = args.includes('--self-check')

/** Runs inside the page. Returns the measurements plus enough context to argue about them. */
const MEASURE = (regionSel) => {
  /* A gap this narrow is layout rounding rather than a band. Written once, used everywhere a
     distance is compared with nothing. Measured reason: sibling rects in this app routinely differ
     from their parent's content edge by a few hundredths of a pixel. */
  const NOISE_PX = 1
  /* How many strips of each kind are kept for `--json`. The console prints the worst three of them;
     the rest are there for somebody arguing with the headline. */
  const KEEP = 12

  /* THE ONE NUMBER LEFT IN THE COLUMN MEASUREMENT, AND IT DECIDES NOTHING.

     There used to be four — a words-per-line bound, an English fraction, a line depth and a share —
     and together they FAILED a surface. Three of them are gone with the rule they served; see the
     header. ENGLISH_ENOUGH_TO_LIST is the only one left and all it decides is whether a column is
     worth putting in front of a person: a column with fewer than three English words in it has
     nothing to read, and widening "gQy_g6iFREbh" would not make it read better either way.

     NO COLUMN FAILS THIS RUN BECAUSE OF ITS WIDTH. The list is sorted narrowest first, cropped to
     ten, photographed, and read by somebody. */
  const ENGLISH_ENOUGH_TO_LIST = 3
  const COLUMNS_LISTED = 10

  const rect = (el) => el.getBoundingClientRect()
  const round = (n) => Math.round(n)
  const one = (n) => Math.round(n * 10) / 10
  const size = (v) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  /* `el.className` is an object on an SVG element, and printing one gives "[object Object]". */
  const naming = (el) => (typeof el.className === 'string' && el.className !== '' ? el.className : el.tagName.toLowerCase())

  const region = document.querySelector(regionSel) ?? document.querySelector('.page') ?? document.body
  const regionWidth = round(rect(region).width)

  // A screen-reader-only element is not on screen and must not be measured. They are 1px clipped
  // boxes; counting one as a column produced "Nobody needs 48px in a 1px column", which is a
  // measurement fault dressed as a layout fault.
  const isHidden = (el) => {
    const r = rect(el)
    if (r.width <= 2 || r.height <= 2) return true
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return true
    if (cs.clipPath !== 'none' && cs.clipPath.includes('inset(50%)')) return true
    if (cs.clip !== 'auto' && cs.clip !== '') return true
    return false
  }

  /* An absolutely positioned child is taken out of the flow: it neither fills its parent nor leaves
     a hole in it, so it is not evidence either way about who owns the space. */
  const laidOut = (el) => {
    if (isHidden(el)) return false
    const cs = getComputedStyle(el)
    return cs.position !== 'absolute' && cs.position !== 'fixed'
  }

  // ---- 1. the strips: space inside a box that no child of it covers ----------------------
  /* WHICH BOXES CAN BE ASKED THIS QUESTION AT ALL. Only ones whose children are block-level, so
     that a child failing to reach the content edge is a real hole rather than the ordinary shape of
     a line of text. A box holding its own words is skipped: a short last line is not a dead band,
     and an inline child never fills its parent. Anything skipped here is still descended into. */
  const INLINE_LEVEL = /^(inline|inline-block|inline-flex|inline-grid|inline-table|contents|none|ruby.*)$/
  const blockKidsOf = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return null
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && (node.textContent ?? '').trim() !== '') return null
    }
    const kids = [...el.children].filter(laidOut)
    if (kids.length === 0) return null
    // Flex and grid blockify their children, so a child's own `display` says nothing there.
    const blockified = cs.display.includes('flex') || cs.display.includes('grid')
    for (const kid of kids) {
      const d = getComputedStyle(kid).display
      if (d === 'contents') return null
      if (!blockified && INLINE_LEVEL.test(d)) return null
    }
    return kids
  }

  /** The box's own content edges: inside its border and its padding. Padding is not a dead band. */
  const contentEdges = (el) => {
    const b = rect(el)
    const cs = getComputedStyle(el)
    const l = b.left + size(cs.borderLeftWidth) + size(cs.paddingLeft)
    const r = b.right - size(cs.borderRightWidth) - size(cs.paddingRight)
    return { l, r, w: r - l }
  }

  /* A COLUMN OF BLOCKS IS NOT ONE ROW, AND THAT DISTINCTION IS THE MEASUREMENT. Union the widths of
     everything in a stacked box and one full-width block hides the narrow one under it -- which is
     exactly the mistake the old headline made in reverse. Children are therefore grouped by
     vertical overlap first, and each group is compared with the content edges on its own. */
  const rowsOf = (kids) => {
    const boxes = kids.map((el) => ({ el, b: rect(el) })).sort((a, b) => a.b.top - b.b.top)
    const rows = []
    for (const item of boxes) {
      const last = rows[rows.length - 1]
      if (last !== undefined && item.b.top < last.bottom - NOISE_PX) {
        last.items.push(item)
        last.bottom = Math.max(last.bottom, item.b.bottom)
      } else {
        rows.push({ items: [item], bottom: item.b.bottom })
      }
    }
    return rows
  }

  const stripsInRow = (edges, row) => {
    const spans = row.items
      .map(({ b }) => [Math.max(edges.l, b.left), Math.min(edges.r, b.right)])
      .filter(([from, to]) => to - from > 0)
      .sort((a, b) => a[0] - b[0])
    const covered = []
    for (const span of spans) {
      const last = covered[covered.length - 1]
      if (last !== undefined && span[0] <= last[1] + NOISE_PX) last[1] = Math.max(last[1], span[1])
      else covered.push([...span])
    }
    const out = []
    let at = edges.l
    for (const [from, to] of covered) {
      if (from - at > NOISE_PX) out.push({ width: from - at, side: at === edges.l ? 'left edge' : 'between' })
      at = Math.max(at, to)
    }
    if (edges.r - at > NOISE_PX) {
      out.push({ width: edges.r - at, side: covered.length === 0 ? 'the whole box' : 'right edge' })
    }
    return out
  }

  const found = []
  const walk = (el) => {
    const kids = blockKidsOf(el)
    if (kids !== null) {
      const edges = contentEdges(el)
      if (edges.w > 0) {
        for (const row of rowsOf(kids)) {
          const strips = stripsInRow(edges, row)
          if (strips.length > 0) found.push({ el, edges, row, strips })
        }
      }
    }
    for (const kid of el.children) if (laidOut(kid)) walk(kid)
  }
  walk(region)

  /* DID ANYTHING IN THAT ROW WANT THE SPACE? This is the difference between a dead band and the
     ordinary slack beside a small control, and without it the instrument is useless in the noisy
     direction: measured on report OOOt4Kouc5dT at 1440, 87 of its 133 edge strips are the space
     beside a chip, a count or a button, and the widest of those -- 1073.7px, 94% of its box -- sits
     beside a 71px label on a line of its own.

     The question is asked of the layout, not guessed from class names. Each child is given
     `width: max-content` with its cap removed, its drawn width is read again, and its own style is
     put back. A paragraph capped at 908px answers with the width of one unbroken line, so it wanted
     the strip beside it. A chip answers with the width it already has, so it did not. A row where
     nothing wanted more is SLACK; a row where something did is STRANDED, and stranded is the number
     the owner's sentence about a dead band is about.

     IT CHANGES THE PAGE AND PUTS IT BACK. That is why it runs after every rect above has already
     been read: nothing else in this file can be disturbed by it, and the inline style it saves is
     the exact string it restores. */
  const wants = new Map()
  const wantedBy = (el) => {
    const had = wants.get(el)
    if (had !== undefined) return had
    const was = { width: el.style.width, maxWidth: el.style.maxWidth, flexBasis: el.style.flexBasis }
    el.style.width = 'max-content'
    el.style.maxWidth = 'none'
    el.style.flexBasis = 'auto'
    const want = rect(el).width
    el.style.width = was.width
    el.style.maxWidth = was.maxWidth
    el.style.flexBasis = was.flexBasis
    wants.set(el, want)
    return want
  }

  /* SPACE SOMEBODY ASKED FOR IS NOT SPACE NOBODY OWNS, AND WITHOUT THIS THE INSTRUMENT REPORTS THE
     OWNER'S OWN FEATURE AS THE FAULT IT EXISTS TO FIND.

     Layer 4 of their model lets a prose child state its own reading measure inside its full-width
     column. A `narrowest` measure in a 573px part draws the writing at 416px and leaves 157px beside
     it -- and the writing, asked with `max-content`, says it wanted that space, so every test above
     calls the strip STRANDED. It is not stranded. It is whitespace an author asked for, in a column
     the part still owns, which is exactly the distinction their clarification draws.

     MEASURED, on report GxfE29Cp69fz at 1440 on 29 August 2026, the day this surface was first put
     in the list above: all three of that page's stranded strips were measure demonstrations --
     573 - 544 = 29px for `readable`, 573 - 416 = 157px for `narrow`, 573 x 0.5 = 286.5px for the
     ratio 0.5. Those were the preset names that day; `readable` is `narrow` now, and `narrow` is
     `narrowest`. The headline read "widest stranded strip 286.5px = 50% of its box", and it was
     describing the feature working.

     WHO ASKED IS READ OFF THE MARKUP, never guessed. `data-measure` is written in exactly two
     places in SummaryBlocks.tsx: on a `.sb-beside-part` whose part stated one, and on a block that
     stated one directly. So the box carrying it, or a child of the row carrying it, is the whole
     question, and no ancestor is consulted -- a nested part resets the measure, so an ancestor's
     attribute says nothing about this box.

     WHAT THIS GIVES UP, SAID OUT LOUD. Inside a box that states a measure, this instrument stops
     calling the strip at its edge a dead band, so a genuine stranding in the same row is now
     counted as authored. That is the price of not reporting the feature as the fault, and the
     `askedFor` field on every such strip names the preset so the trade is visible in `--json`. */
  const askedIn = (el, row) =>
    el.getAttribute('data-measure') ??
    row.items.map(({ el: kid }) => kid.getAttribute('data-measure')).find((v) => v !== null) ??
    null

  const strips = []
  for (const { el, edges, row, strips: rowStrips } of found) {
    const holds = row.items.map(({ el: kid }) => naming(kid))
    let wanted = 0
    for (const { el: kid, b } of row.items) {
      const want = wantedBy(kid)
      if (want > b.width + NOISE_PX) wanted = Math.max(wanted, want - b.width)
    }
    const askedFor = askedIn(el, row)
    for (const strip of rowStrips) {
      strips.push({
        width: one(strip.width),
        pct: Math.round((strip.width / edges.w) * 100),
        side: strip.side,
        stranded: wanted > 0 && askedFor === null,
        authored: wanted > 0 && askedFor !== null,
        askedFor,
        wantedMore: one(wanted),
        boxWidth: one(edges.w),
        box: naming(el),
        holds: holds.slice(0, 3).join(' + ') + (holds.length > 3 ? ` +${String(holds.length - 3)} more` : ''),
      })
    }
  }

  const byWidth = (a, b) => b.width - a.width
  const edgeStrips = strips.filter((s) => s.side !== 'between')
  const stranded = edgeStrips.filter((s) => s.stranded).sort(byWidth)
  const authored = edgeStrips.filter((s) => s.authored).sort(byWidth)
  const slack = edgeStrips.filter((s) => !s.stranded && !s.authored).sort(byWidth)
  const gutters = strips.filter((s) => s.side === 'between').sort(byWidth)

  // ---- 2. the compositions ---------------------------------------------------------------
  /* `.sb-beside` is the composition; `.sb-columns` is the older equal-share arrangement folded onto
     the same engine. A part carries `data-share` always and `data-asked` only when the report asked
     for one, so "nobody asked" is READ here rather than inferred. Nothing is filled in when an
     attribute is missing: it is reported as missing. */
  const compositions = [...region.querySelectorAll('.sb-beside, .sb-columns')].map((el) => {
    const kids = [...el.children].filter(laidOut)
    const widths = kids.map((kid) => rect(kid).width)
    const total = widths.reduce((a, b) => a + b, 0)
    const asked = kids.map((kid) => kid.getAttribute('data-asked'))
    const askedNums = asked.map((a) => (a === null ? null : Number(a)))
    const askedTotal = askedNums.every((a) => a !== null && Number.isFinite(a)) ? askedNums.reduce((a, b) => a + b, 0) : null
    return {
      what: naming(el),
      parts: kids.length,
      stacked: rowsOf(kids).length === kids.length && kids.length > 1,
      width: one(rect(el).width),
      chosenBy: el.getAttribute('data-share-by'),
      part: kids.map((kid, i) => ({
        what: naming(kid),
        width: one(widths[i]),
        drawnPct: total === 0 ? null : Math.round((widths[i] / total) * 100),
        asked: asked[i],
        askedPct: askedTotal === null || askedTotal === 0 ? null : Math.round((askedNums[i] / askedTotal) * 100),
        resolved: kid.getAttribute('data-share'),
      })),
    }
  })

  // ---- 3. the width most prose draws at, as a width and never as a band -------------------
  /* Kept because the corpus is being photographed before and after, and "the paragraphs went from
     893px to 1164px in the same 1164px region" is the sentence that says what changed. */
  const proseSel = [
    '.sb-p', '.sb-bullet', '.sb-quote p', '.sb-callout p', '.sb-finding p',
    '.prose p', '.prose-measure', '[data-fit="read"]', '.px-prose', 'p',
  ].join(',')
  const prose = [...region.querySelectorAll(proseSel)].filter((el) => {
    const t = (el.innerText ?? '').trim()
    return t.length > 60 && !isHidden(el)
  })
  const tally = new Map()
  for (const el of prose) {
    const w = round(rect(el).width)
    tally.set(w, (tally.get(w) ?? 0) + 1)
  }
  const byCount = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const typicalProse = byCount.length ? byCount[0][0] : null

  /* ---- 4. mid-word wrapping, ASKED OF THE LAYOUT RATHER THAN ESTIMATED ------------------
     The first version measured each word with canvas measureText in the element's resolved font and
     compared it with the column. That is an approximation of what the layout engine does, and it
     reported "unresolved needs 89px in an 89px column" on a word the browser had put on one line --
     a sub-pixel disagreement between two different measurements of the same text.

     A Range around the word answers the question directly: a word broken across lines returns MORE
     THAN ONE client rectangle, and a word on one line returns exactly one. No font metrics, no
     tolerance to argue about, and it is the same thing the owner sees.

     Identifiers and paths are excluded, not because breaking them is fine to hide, but because they
     have nowhere to break between characters and `.wrap-anywhere` breaks them on purpose. Their fault
     is English "wrapping vertically a few characters at a time". */
  /* A HYPHEN IS A PLACE A LINE MAY BREAK, so "composed-title" going to "composed-" / "title" is
     correct typesetting and not the fault. Each alphabetic run between hyphens is therefore checked
     on its own, which flags a break INSIDE "composed" and accepts a break after it. */
  /* NOT DRAWN IS NOT JUDGED, AND THE REASON IS KEPT. Four ways, each one measured on this corpus
     rather than imagined. `isHidden` above answers the first; the other three are here because they
     are what produced 81 false failures between them on Home alone. */
  const notDrawn = (el) => {
    if (isHidden(el)) return 'a screen-reader-only or hidden box'
    const cs = getComputedStyle(el)
    // An ellipsis-truncated line returns its ONE rectangle twice, which reads as two lines.
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) return 'truncated with an ellipsis'
    // Chromium still answers getBoundingClientRect inside a closed disclosure. The reader cannot.
    let up = el
    while (up !== null && up !== region) {
      if (up.tagName === 'DETAILS' && !up.open) return 'inside a closed disclosure'
      up = up.parentElement
    }
    return null
  }
  /* A WHOLE TOKEN HOLDING ANY OF THESE IS AN IDENTIFIER OR A PATH AND IS NOT JUDGED, and neither is
     any letter run inside it. The test is on the WHOLE whitespace-delimited token; testing the run
     is the defect this replaces. */
  const isIdentifier = (token) => /[0-9._/\\@:#]/.test(token) || /[a-z][A-Z]/.test(token)

  const broken = []
  const skipped = []
  const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const text = node.textContent ?? ''
    if (text.trim() === '') continue
    const parent = node.parentElement
    if (parent === null) continue
    const why = notDrawn(parent)
    const box = rect(parent)
    const style = getComputedStyle(parent)
    const insetL = box.left + size(style.paddingLeft) - 0.5
    const insetR = box.right - size(style.paddingRight) + 0.5
    for (const token of text.matchAll(/\S+/g)) {
      if (isIdentifier(token[0])) continue
      for (const run of token[0].matchAll(/[A-Za-z]{4,}/g)) {
        const at = token.index + run.index
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + run[0].length)
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5)
        if (rects.length === 0) continue
        const tops = new Set(rects.map((r) => Math.round(r.top)))
        const spills = rects.some((r) => r.left < insetL || r.right > insetR)
        if (tops.size <= 1 && !spills) continue
        const found = {
          word: run[0],
          token: token[0],
          pieces: tops.size,
          spills,
          columnWidth: round(box.width - size(style.paddingLeft) - size(style.paddingRight)),
          where: naming(parent),
        }
        if (why === null) broken.push(found)
        else skipped.push({ ...found, why })
      }
    }
  }
  /* EVERY SKIPPED WORD IS COUNTED BY ITS REASON. A skip nobody can see is a skip nobody can argue
     with, and three of the four reasons here were invented to make a false failure go away. */
  const skippedWhy = {}
  for (const one of skipped) skippedWhy[one.why] = (skippedWhy[one.why] ?? 0) + 1

  /* ---- 5. A COLUMN THAT READS DOWN THE PAGE, BY WORDS INSTEAD OF BY LETTERS --------------
     Section 4 above answers "did a word come apart". This answers "did the column stay wide enough
     for the words to sit beside each other", which is the same complaint one step earlier and the
     one that survives a fix aimed only at section 4. The bundle preview passed section 4 with zero
     while drawing "The / campaign / and where / it has got / to"; both facts were true.

     WHAT COUNTS AS A WORD IS THE SAME POPULATION SECTION 4 CHECKS, for the same reason. An
     identifier or a path has nowhere to break between characters and nowhere to be widened to, so
     "listRecords (src/server/lib/records.ts)" drawn on two lines in a 258px column is a path in a
     column and not a cramped column. Punctuation at either end of a token is dropped; a token with
     an inner capital, a digit, a dot, a slash or an underscore left in it is not counted.

     LINES ARE ASKED OF THE LAYOUT, NOT DIVIDED OUT OF THE HEIGHT. A Range over the box's contents
     returns one client rectangle per line box, exactly as it does for one word in section 4, so
     padding, a border, an image beside the text and a line-height nobody wrote down all stay out of
     it. Rectangles sharing a top are one line. */
  /* A TOKEN THAT IS NOT ENGLISH STILL TAKES UP A LINE, and the ratio would lie if it did not count.
     Measured on report OOOt4Kouc5dT at 1440 before this was fixed: a table column reading
     "proposal gQy_g6iFREbh" on two lines counted one word and two lines, so eleven such cells
     reported 1.6 words a line in a column where an opaque id is half of every entry. Both numbers
     are therefore kept -- every token for the ratio, English tokens for whether the column may be
     judged at all -- and a column that is mostly not English is left alone, because widening it
     would not make an id or a path read any better. */
  const tokensIn = (text) => text.split(/\s+/).filter((t) => t !== '')
  const englishIn = (tokens) =>
    tokens
      .map((tok) => tok.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
      .filter((w) => w !== '' && /^[A-Za-z]+$/.test(w) && !/[A-Z]/.test(w.slice(1)))

  const linesOf = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const tops = new Set()
    for (const r of range.getClientRects()) {
      if (r.width > 0.5 && r.height > 0.5) tops.add(Math.round(r.top))
    }
    return tops.size
  }

  /* A box holding block children is measured through those children, never as itself: its own
     width says nothing about the lines inside it. Inline children -- `em`, `a`, `code` -- are part
     of the same run of text and stay. */
  const BLOCKISH = /^(block|flow-root|list-item|table-cell|flex|grid)$/
  const INLINE_KID = /^(inline|inline-block|none|contents)$/
  const textBoxes = []
  for (const el of region.querySelectorAll('*')) {
    if (!laidOut(el)) continue
    if (!BLOCKISH.test(getComputedStyle(el).display)) continue
    if ([...el.children].some((kid) => !INLINE_KID.test(getComputedStyle(kid).display))) continue
    const text = (el.innerText ?? '').trim()
    if (text === '') continue
    const tokens = tokensIn(text)
    const english = englishIn(tokens)
    if (english.length === 0) continue
    textBoxes.push({ el, b: rect(el), text, tokens: tokens.length, english: english.length, lines: linesOf(el) })
  }

  /* A COLUMN IS THE SET OF TEXT BOXES DRAWN BETWEEN THE SAME TWO VERTICAL EDGES. Nothing here knows
     what a table is; a table column and a stack of paragraphs in a part answer the same question
     the same way. The container the share is measured against is the box's own parent, so a table
     cell is compared with its row and a paragraph with the block it sits in. */
  const columns = new Map()
  for (const box of textBoxes) {
    const key = `${String(Math.round(box.b.left))}:${String(Math.round(box.b.right))}`
    const had = columns.get(key)
    if (had === undefined) {
      const parent = box.el.parentElement
      columns.set(key, {
        width: one(box.b.width),
        holder: parent === null ? 0 : one(contentEdges(parent).w),
        where: naming(box.el),
        holds: naming(parent ?? box.el),
        boxes: 1,
        words: box.tokens,
        english: box.english,
        lines: box.lines,
        tallest: box.lines,
        worst: box,
      })
    } else {
      had.boxes += 1
      had.words += box.tokens
      had.english += box.english
      had.lines += box.lines
      had.tallest = Math.max(had.tallest, box.lines)
      if (box.lines > 1 && box.tokens / box.lines < had.worst.tokens / Math.max(had.worst.lines, 1)) had.worst = box
    }
  }

  /* THE REVIEW LIST. NOT A VERDICT. Every column holding enough English to read, narrowest first,
     cropped to ten. It carries what a person needs to judge it — the width, the share of the box
     that holds it, how many lines the deepest box in it drew, and its words — plus the rectangle the
     runner photographs so the judgement can be made from a picture rather than from numbers. */
  const narrow = []
  for (const col of columns.values()) {
    if (col.english < ENGLISH_ENOUGH_TO_LIST || col.lines === 0) continue
    const worstBox = col.worst.el.getBoundingClientRect()
    narrow.push({
      width: col.width,
      holder: col.holder,
      pct: col.holder > 0 ? Math.round((col.width / col.holder) * 100) : null,
      boxes: col.boxes,
      words: col.words,
      english: col.english,
      lines: col.lines,
      tallest: col.tallest,
      wordsPerLine: one(col.words / col.lines),
      where: col.where,
      inside: col.holds,
      reads: col.worst.text.slice(0, 80),
      readsLines: col.worst.lines,
      worstEl: col.worst.el,
      /* WHAT TO PHOTOGRAPH. Not the column's own box: cropping a 33px column produced a sliver of
         nothing that a person could not judge, and a picture that shows nothing is worse than no
         picture. The box that HOLDS the column is photographed instead, which puts the column back
         among the things it is drawn beside. The element is marked below and the runner takes the
         picture through the mark, so Chromium scrolls it into view first -- including sideways,
         inside a box that scrolls, which a page-coordinate crop could never reach. */
      holderIs: naming(col.worst.el.parentElement ?? col.worst.el),
      /* WHETHER THE PICTURE CAN SHOW IT AT ALL. A column drawn off the edge of a box that scrolls
         sideways is on the page but not in a page screenshot, and a blank crop that says nothing
         about that is the fabricated evidence rule broken by an instrument. Named, not hidden. */
      insideASidewaysBox: (() => {
        let up = col.worst.el.parentElement
        while (up !== null && up !== region) {
          const flow = getComputedStyle(up).overflowX
          if (flow !== 'visible' && up.scrollWidth > up.clientWidth + NOISE_PX) return naming(up)
          up = up.parentElement
        }
        return null
      })(),
    })
  }
  narrow.sort((a, b) => a.width - b.width)
  /* THE MARK THE PICTURE IS TAKEN THROUGH. Only the columns that will be listed are marked, so the
     runner cannot photograph something the list does not mention. It is an attribute on the page
     under test and it is removed by the page being thrown away when the run ends. */
  /* THE MARK GOES ON THE COLUMN'S OWN BOX AND NOT ON THE BOX THAT HOLDS IT. Two columns of one
     table share a row, so marking the holder gave both marks to the same element and the second one
     overwrote the first: three columns of the decision report reported "its box is no longer on the
     page" and got no picture. The runner reads the holder from the mark instead. */
  for (const [i, col] of narrow.slice(0, COLUMNS_LISTED).entries()) {
    col.worstEl.setAttribute('data-dead-band-narrow', String(i))
  }
  for (const col of narrow) delete col.worstEl

  // ---- 6. sideways scroll, of the page and of every box -----------------------------------
  /* A box wider than its own content box is either scrolling sideways or spilling out of itself.
     Its `overflow-x` says which, and both are reported: a table the reader can drag sideways is a
     decision somebody made, and prose spilling out of a card is not. */
  const sideways = []
  for (const el of [region, ...region.querySelectorAll('*')]) {
    if (el.clientWidth === 0 || !laidOut(el)) continue
    const over = el.scrollWidth - el.clientWidth
    if (over > NOISE_PX) {
      sideways.push({ where: naming(el), by: over, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: getComputedStyle(el).overflowX })
    }
  }
  sideways.sort((a, b) => b.by - a.by)

  return {
    regionWidth,
    stranded: stranded.length,
    widestStrip: stranded[0] ?? null,
    worstStranded: stranded.slice(0, KEEP),
    authored: authored.length,
    worstAuthored: authored.slice(0, KEEP),
    slack: slack.length,
    worstSlack: slack.slice(0, KEEP),
    gutters: gutters.length,
    widestGutter: gutters[0] ?? null,
    compositions,
    proseBlocks: prose.length,
    proseWidths: byCount.slice(0, 6).map(([w, n]) => `${String(w)}px x${String(n)}`),
    typicalProse,
    brokenWords: broken.length,
    worstWraps: broken.sort((a, b) => a.columnWidth - b.columnWidth).slice(0, KEEP),
    notJudged: skipped.length,
    notJudgedWhy: skippedWhy,
    narrowColumns: narrow.length,
    narrowest: narrow.slice(0, COLUMNS_LISTED),
    pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    sidewaysBoxes: sideways.length,
    worstSideways: sideways.slice(0, 5),
  }
}

/** One line for the run, then the detail somebody would need to disagree with it. */
const report = (label, seen) => {
  const widest =
    seen.widestStrip === null
      ? 'nothing was stranded'
      : `widest stranded strip ${String(seen.widestStrip.width)}px = ${String(seen.widestStrip.pct)}% of its box`
  console.log(
    `${label}  region ${String(seen.regionWidth).padStart(4)}px  ${widest}  ` +
      `(${String(seen.stranded)} stranded, ${String(seen.authored)} authored, ${String(seen.slack)} slack, ${String(seen.gutters)} gutters)  ` +
      `compositions ${String(seen.compositions.length)}  ` +
      `typical prose ${String(seen.typicalProse ?? '-')}px  ` +
      `${seen.brokenWords === 0 ? 'no English word came apart' : `${String(seen.brokenWords)} ENGLISH WORD${seen.brokenWords === 1 ? '' : 'S'} CAME APART`}` +
      ` (${String(seen.notJudged)} not judged: ${Object.entries(seen.notJudgedWhy).map(([why, n]) => `${String(n)} ${why}`).join(', ') || 'none'})` +
      `  ${String(seen.narrowColumns)} narrow columns to read` +
      `${seen.pageScrollsSideways ? '  PAGE SCROLLS SIDEWAYS' : ''}${seen.sidewaysBoxes > 0 ? `  ${String(seen.sidewaysBoxes)} boxes scroll or spill sideways` : ''}`,
  )
  for (const s of seen.worstStranded.slice(0, 3)) {
    console.log(
      `      ${String(s.width)}px = ${String(s.pct)}% at the ${s.side} of a ${String(s.boxWidth)}px "${s.box}" holding "${s.holds}"` +
        ` — it wanted ${String(s.wantedMore)}px more`,
    )
  }
  for (const s of seen.worstAuthored.slice(0, 3)) {
    console.log(
      `      asked for: ${String(s.width)}px = ${String(s.pct)}% at the ${s.side} of a ${String(s.boxWidth)}px "${s.box}"` +
        ` holding "${s.holds}" — measure "${String(s.askedFor)}"`,
    )
  }
  for (const c of seen.compositions) {
    console.log(
      `      "${c.what}" ${String(c.parts)} parts, ${c.stacked ? 'STACKED' : 'side by side'}, ${String(c.width)}px, shares chosen by ${c.chosenBy ?? 'nothing said'}`,
    )
    for (const p of c.part) {
      console.log(
        `        "${p.what}" drawn ${String(p.width)}px = ${String(p.drawnPct ?? '-')}%  asked ${p.asked === null ? 'nothing' : `${p.asked} = ${String(p.askedPct ?? '-')}%`}  resolved share ${p.resolved ?? 'no data-share'}`,
      )
    }
  }
  for (const w of seen.worstWraps) {
    console.log(
      `      FAULT: "${w.word}" in the token "${w.token}" was drawn ` +
        `${w.spills ? 'outside its own content box' : `in ${String(w.pieces)} pieces`}` +
        ` in a ${String(w.columnWidth)}px column — ${w.where}`,
    )
  }
  /* THE THREE NARROWEST GO ON SCREEN AND ALL TEN GO TO DISK, because this is a list to be read and
     not a verdict. Nothing here is a failure and the wording must not let it read as one. */
  for (const c of seen.narrowest.slice(0, 3)) {
    console.log(
      `      to read: a ${String(c.width)}px "${c.where}" column` +
        ` = ${String(c.pct ?? '-')}% of the ${String(c.holder)}px "${c.inside}" holding it` +
        ` (${String(c.boxes)} boxes, ${String(c.english)} English words of ${String(c.words)} on ${String(c.lines)} lines,` +
        ` deepest ${String(c.tallest)}, ${String(c.wordsPerLine)} words a line)`,
    )
    console.log(
      `        reads "${c.reads}" down ${String(c.readsLines)} lines` +
        `${c.insideASidewaysBox === null ? '' : ` — inside "${c.insideASidewaysBox}", which scrolls sideways, so the picture may not reach it`}`,
    )
  }
  for (const s of seen.worstSideways.slice(0, 3)) {
    console.log(`      "${s.where}" is ${String(s.by)}px wider than itself (${String(s.scrollWidth)} in ${String(s.clientWidth)}, overflow-x ${s.overflowX})`)
  }
}

const browser = await chromium.launch()
const out = []

/* THE INSTRUMENT CHECKED AGAINST ARITHMETIC A PERSON CAN DO ON PAPER, because it has been wrong in
   its author's favour three times. It builds one box whose answers are known before it runs: a
   1000px block holding a 600px child leaves a 400px right-edge strip, and a 980px flex row asked
   for 3:2 with a 20px gap draws 588 and 392. This checks THIS FILE'S arithmetic, not the product. */
if (selfCheck) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } })
  const page = await ctx.newPage()
  await page.setContent(`<!doctype html><style>body{margin:0}</style>
    <div class="sb-reads" style="width:1000px">
      <div class="sb-block"><p style="width:600px">${'word '.repeat(40)}</p></div>
      <div class="sb-block"><span style="display:block;width:80px">chip</span></div>
      <div class="sb-block"><div style="width:40px;overflow-wrap:anywhere">extraordinary</div></div>
      <!-- THREE CONTROLS FOR THE THINGS THAT USED TO BE COUNTED AS FAILURES AND ARE NOT WORDS.
           A file path in a 40px box breaks the same way "extraordinary" does and must be SILENT, not
           skipped -- it is not a word at all. A closed disclosure and an ellipsis-truncated line must
           each be counted as not judged, under their own reason. -->
      <div class="sb-block"><div class="a-path" style="width:40px;overflow-wrap:anywhere">test_claude/round-2</div></div>
      <details class="shut"><summary>shut</summary><div style="width:40px;overflow-wrap:anywhere">indistinguishable</div></details>
      <div class="clipped" style="width:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">extraordinary sentences</div>
      <div class="sb-beside" data-share-by="the report" style="display:flex;gap:20px;height:50px">
        <div class="sb-beside-part" data-asked="3" data-share="3" style="flex:3 1 0"></div>
        <div class="sb-beside-part" data-asked="2" data-share="2" style="flex:2 1 0"></div>
      </div>
      <div class="sb-beside" data-share-by="the report" style="display:flex;gap:20px;height:50px">
        <div class="sb-beside-part" data-asked="9" data-share="9" style="flex:9 1 0"></div>
        <div class="sb-beside-part" data-asked="1" data-share="1" style="flex:1 1 0;min-width:160px"></div>
      </div>
      <div class="sb-beside" style="display:flex;flex-wrap:wrap;gap:20px">
        <div class="sb-beside-part" data-share="1" style="flex:1 1 100%;height:30px"></div>
        <div class="sb-beside-part" data-share="1" style="flex:1 1 100%;height:30px"></div>
      </div>
      <div class="asked-part" data-measure="narrow" style="width:1000px">
        <p style="width:400px">${'word '.repeat(40)}</p>
      </div>
      <table class="starved" style="table-layout:fixed;width:1000px;font:16px/20px sans-serif">
        <tr><td class="label" style="width:94px">The campaign and where it has got to</td>
            <td class="says" style="width:650px">A sentence with plenty of room to lie down flat on one line.</td>
            <td class="path" style="width:256px">listRecords (src/server/lib/records.ts)</td></tr>
        <tr><td class="label">Temporary values and methods that ran instead</td>
            <td class="says">Another sentence with plenty of room to lie down flat.</td>
            <td class="path">writeTheBundle (src/server/lib/bundles.ts)</td></tr>
        <tr><td class="label">The plan</td>
            <td class="says">A third sentence, also with room to lie flat on one line.</td>
            <td class="path">readTheParts (src/web/components/BundlePanel.tsx)</td></tr>
      </table>
    </div>`)
  const seen = await page.evaluate(MEASURE, '.sb-reads')
  console.log('SELF-CHECK — what the arithmetic says, then what the instrument said\n')
  const held = (list, what) => list.find((s) => s.holds === what)
  const para = held(seen.worstStranded, 'p')
  console.log('  a 600px paragraph in a 1000px block, holding more words than fit on one 600px line,')
  console.log('  leaves a 400px right-edge strip = 40%, and it is stranded because the words wanted it')
  console.log(
    `    instrument: ${String(para?.width)}px = ${String(para?.pct)}% at the ${String(para?.side)}` +
      ` of a ${String(para?.boxWidth)}px box, stranded ${String(para?.stranded)}`,
  )
  /* A CONTROL FOR THE THIRD BUCKET, because "authored" is a way for a real dead band to stop being
     counted and a bucket like that has to be shown working rather than trusted. Same paragraph,
     same want, one attribute different. */
  const asked = seen.worstAuthored.find((s) => s.box === 'asked-part')
  console.log('  the same 400px paragraph in a 1000px box that STATES a measure leaves the same 600px = 60%,')
  console.log('  and it is authored rather than stranded, because somebody asked for that whitespace')
  console.log(
    `    instrument: ${String(asked?.width)}px = ${String(asked?.pct)}% of a ${String(asked?.boxWidth)}px box,` +
      ` measure "${String(asked?.askedFor)}", stranded ${String(asked?.stranded)}, authored ${String(asked?.authored)};` +
      ` stranded strips in all ${String(seen.stranded)}, authored ${String(seen.authored)}`,
  )
  const chip = held(seen.worstSlack, 'span')
  console.log('  the 80px chip below it wanted nothing, so its 920px of company is slack and not a band')
  console.log(`    instrument: ${String(chip?.width)}px beside "${String(chip?.holds)}", stranded ${String(chip?.stranded)}; slack strips in all ${String(seen.slack)}`)
  console.log('  a 1000px row with one 20px gap has 980px to divide; 3:2 is 588px and 392px, 60% and 40%')
  for (const p of seen.compositions[0]?.part ?? []) {
    console.log(`    instrument: drawn ${String(p.width)}px = ${String(p.drawnPct)}%, asked ${String(p.asked)} = ${String(p.askedPct)}%, resolved ${String(p.resolved)}`)
  }
  console.log('  the same row asked 9:1 with the second part held at 160px draws 820px and 160px, 84% and 16%,')
  console.log('  and the instrument has to show the ask and the drawing disagreeing')
  for (const part of seen.compositions[1]?.part ?? []) {
    console.log(`    instrument: drawn ${String(part.width)}px = ${String(part.drawnPct)}%, asked ${String(part.asked)} = ${String(part.askedPct)}%`)
  }
  const stack = seen.compositions[2]
  console.log('  two parts that have wrapped onto their own lines are stacked, not side by side,')
  console.log('  and nobody asked for a share in that one')
  console.log(
    `    instrument: stacked ${String(stack?.stacked)}, parts ${String(stack?.parts)}, ` +
      `first part asked ${stack?.part[0]?.asked ?? 'nothing'}, chosen by ${stack?.chosenBy ?? 'nothing said'}`,
  )
  console.log(`  the 20px gap is a gutter and not a dead band: gutters ${String(seen.gutters)}, widest ${String(seen.widestGutter?.width)}px`)
  /* THE CONTROLS FOR THE ONE RULE THAT STILL FAILS A RUN. Every real surface reports zero today, and
     a counter that had stopped working would report zero too — so one real break, one path that must
     not count, and two kinds of undrawn text that must be skipped under their own names. */
  console.log('  "extraordinary" cannot fit in a 40px box, so it is one English word drawn in two pieces')
  console.log('  and the ONLY one: "test_claude/round-2" breaks in the same 40px box and is a path, so it')
  console.log('  is not judged and is not skipped either, because it was never a word')
  console.log(
    `    instrument: ${String(seen.brokenWords)} English word came apart, and it is ` +
      `"${String(seen.worstWraps[0]?.word)}" in ${String(seen.worstWraps[0]?.columnWidth)}px; ` +
      `the path column reported ${String(seen.worstWraps.filter((w) => w.where === 'a-path').length)}`,
  )
  console.log('  "indistinguishable" inside a CLOSED disclosure and "extraordinary" on a line truncated with')
  console.log('  an ellipsis are both undrawn, so each is counted under its own reason and neither fails')
  console.log(`    instrument: ${String(seen.notJudged)} not judged — ${JSON.stringify(seen.notJudgedWhy)}`)
  /* THE REVIEW-LIST CONTROL. The table above is the bundle preview's shape written by hand: a 94px
     label column of short English phrases, a 650px column of sentences, and a 256px column of paths.
     THIS USED TO BE A PASS-OR-FAIL CONTROL and it is not one now — the check is that the list is
     ordered narrowest first, that the path column is left out for holding no English, and that
     NOTHING here is called a fault. */
  const labelCol = seen.narrowest.find((c) => c.where === 'label')
  console.log('  the label column holds 17 English words in 94px, the sentence column holds far more in 650px,')
  console.log('  and the 256px path column holds no English at all — so the path column is left out, every')
  console.log('  other column of English on this page is listed narrowest first, and none of them is a failure')
  console.log(
    `    instrument: ${String(seen.narrowColumns)} columns to read, in order ` +
      `${seen.narrowest.map((c) => `"${c.where}" at ${String(c.width)}px`).join(', ') || 'none'}`,
  )
  console.log(
    `    instrument: the label column is ${String(labelCol?.width)}px = ${String(labelCol?.pct)}% of its row,` +
      ` ${String(labelCol?.words)} words on ${String(labelCol?.lines)} lines, ${String(labelCol?.wordsPerLine)} a line,` +
      ` and it is listed rather than failed`,
  )
  console.log(`  nothing scrolls sideways: page ${String(seen.pageScrollsSideways)}, boxes ${String(seen.sidewaysBoxes)}`)
  await ctx.close()
  await browser.close()
  process.exit(0)
}

for (const surface of SURFACES) {
  if (only !== null && surface.key !== only) continue
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme })
      await ctx.addInitScript(() => {
        window.localStorage.setItem('mole-office.workspace', 'panelx')
        window.localStorage.setItem('mole-office.mode', 'normal')
      })
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      try {
        await page.goto(`${BASE}/${surface.route}`, { waitUntil: 'load', timeout: 30_000 })
        await page.waitForTimeout(1_500)
        for (const label of surface.press ?? []) {
          await page.getByRole('button', { name: label }).click({ timeout: 20_000 })
          await page.waitForTimeout(1_200)
        }
        await page.waitForTimeout(2_500)
        const seen = await page.evaluate(MEASURE, surface.region)
        /* A CROPPED PICTURE OF EVERY COLUMN ON THE REVIEW LIST. The rectangles came back in page
           coordinates, so the shot is taken of the whole page and clipped; a viewport shot cannot
           reach a column below the fold, which is where most of them are. Chromium refuses a clip
           of zero area, so a column with no height is skipped and said to be skipped. */
        mkdirSync(SHOTS, { recursive: true })
        /* EACH PICTURE IS TAKEN AFTER THE COLUMN HAS BEEN SCROLLED INTO VIEW, THEN MEASURED AGAIN.
           Two things forced this. A crop taken from the first measurement is blank for any column
           drawn off the edge of a box that scrolls sideways, and a blank picture is a claim about a
           screen nobody looked at. And a Playwright element screenshot of the holder times out when
           the holder is a table row. So the marked element is scrolled into view -- which scrolls
           every box above it, sideways included -- its rectangle is read again where it now is, and
           the page is clipped to that. A picture that still cannot be taken loses the picture, never
           the measurement, and says why. */
        let drew = 0
        for (const [i, col] of seen.narrowest.entries()) {
          const at = join(SHOTS, `${surface.key}-${String(width)}-${theme}-${String(i)}-${String(col.width)}px.png`)
          const where = await page.evaluate((mark) => {
            const marked = document.querySelector(`[data-dead-band-narrow="${mark}"]`)
            if (marked === null) return null
            marked.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            // The holder, so the column is photographed among the things it is drawn beside.
            const el = marked.parentElement ?? marked
            const r = el.getBoundingClientRect()
            return {
              x: r.left + window.scrollX,
              y: r.top + window.scrollY,
              w: r.width,
              h: r.height,
              paperW: document.documentElement.scrollWidth,
              paperH: document.documentElement.scrollHeight,
            }
          }, String(i))
          if (where === null) {
            console.log(`      no picture of the ${String(col.width)}px "${col.where}" column: its box is no longer on the page`)
            col.picture = null
            continue
          }
          const x = Math.max(0, Math.min(where.x - 12, where.paperW - 1))
          const y = Math.max(0, Math.min(where.y - 12, where.paperH - 1))
          const w = Math.min(where.w + 24, where.paperW - x)
          const h = Math.min(where.h + 24, where.paperH - y)
          if (w < 1 || h < 1) {
            console.log(`      no picture of the ${String(col.width)}px "${col.where}" column: it has no area on the page to photograph`)
            col.picture = null
            continue
          }
          try {
            await page.screenshot({ path: at, fullPage: true, clip: { x, y, width: w, height: h } })
            col.picture = at
            drew += 1
          } catch (shot) {
            col.picture = null
            console.log(`      no picture of the ${String(col.width)}px "${col.where}" column: ${shot.message.split('\n')[0].slice(0, 90)}`)
          }
        }
        out.push({ ...surface, width, theme, ...seen, errors })
        report(`${surface.key.padEnd(13)} ${String(width).padStart(4)} ${theme.padEnd(5)}`, seen)
        console.log(`      ${String(drew)} pictures of ${String(seen.narrowest.length)} narrow columns in ${SHOTS}/`)
      } catch (err) {
        console.log(`${surface.key} @${String(width)} ${theme}: FAILED — ${err.message.slice(0, 120)}`)
        out.push({ ...surface, width, theme, failed: err.message })
      }
      await ctx.close()
    }
  }
}
await browser.close()
if (jsonAt !== null) {
  writeFileSync(jsonAt, JSON.stringify(out, null, 2))
  console.log(`\nwrote ${jsonAt}`)
}
