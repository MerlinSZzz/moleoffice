// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FINDINGS LIST LOCATES A FINDING. IT DOES NOT EXPLAIN ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY EACH TEST BELOW EXISTS
 * ---------------------------------------------------------------------------------------
 * Every claim and every direction in the `panelx` workspace was rendered through
 * `src/web/pages/family/FindingsPage.tsx` on 16 August 2026 and the text on each row counted.
 *
 *   BEFORE   the worst row drew 14 separate pieces of text and 2,095 characters of stored prose.
 *            Six of those pieces were the same six labels on every row: `numbers`,
 *            `How it was measured`, `measured on`, `method`, `confidence`, `what it is`.
 *            Eight pieces were on the screen before a fold was pressed; 18 rows carried a fold.
 *   AFTER    the worst row draws 4 pieces of text and 238 characters, which is a direction's
 *            question — the row's own title. No labels, no folds.
 *
 * The owner set the rule the day before: **lists locate, detail pages explain.** It is in
 * docs/UX-CONTRACT.md, and the test it gives is one sentence — read one row, could you pick this
 * item out of twenty. This file is that rule with numbers on it.
 *
 * WHAT THIS FILE DOES NOT CHECK. The two marks every list row carries, the row grid and the page
 * heading are checked in tests/family-rows.test.ts and tests/family-pages.test.ts, which own them.
 *
 * Each test below was proved by reverting the behaviour and watching it go red, after a control
 * run of this same file with nothing reverted.
 *
 * HOW EACH ONE READS. The row-content half renders the page and reads the text on the rows, which
 * is what a person meets. The last block is about how much room a row is given, which no reading of
 * a stylesheet answers, so it lays the boxes out in a real browser and measures them. Its own
 * comment says what it replaced and why.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import type { RecordListItem } from '../src/web/api.ts'
import { drawInABrowser, type Drawn } from './what-the-browser-draws.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type Findings = typeof import('../src/web/pages/family/FindingsPage.tsx')
type Ui = typeof import('../src/web/components/ui.tsx')

let findings: Findings
let ui: Ui

beforeAll(async () => {
  // The page reaches src/web/api.ts and src/web/lib/mode.ts, both of which touch `window` at module
  // scope. This is the smallest stand-in that lets them load; nothing here is under test.
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
  findings = await import('../src/web/pages/family/FindingsPage.tsx')
  ui = await import('../src/web/components/ui.tsx')
})

// ============================================================================ the instrument

/** Markup with the hoisted style blocks removed, so a class name in the CSS is never evidence. */
function page(records: readonly RecordListItem[]): string {
  return renderToStaticMarkup(h(findings.FindingsPage, { records, onFiled: () => {} })).replace(
    /<style[^>]*>[\s\S]*?<\/style>/g,
    '',
  )
}

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
])

/**
 * Every list row in the markup, as its own subtree.
 *
 * A tag-depth scan rather than a regular expression: a row holds nested elements, and a lazy match
 * would stop at the first closing tag inside one and report a row that is missing most of itself.
 */
function rowsOf(markup: string): string[] {
  const out: string[] = []
  const tag = /<(\/?)([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g
  let m: RegExpExecArray | null
  let depth = 0
  let start = -1
  while ((m = tag.exec(markup)) !== null) {
    const closing = m[1] === '/'
    const selfClosing = m[4] === '/' || VOID.has(m[2]!.toLowerCase())
    if (start === -1) {
      // A ROW OF THE FAMILY LISTS. Criterion change, wave 13j round 11: the page draws its rows as
      // the family lists' plain rows (report n9Mjk3c_sJRu block b-17), `li.flst-row`, not `px-row`.
      if (!closing && !selfClosing && /class="flst-row[ "]/.test(m[3]!)) {
        start = m.index
        depth = 1
      }
      continue
    }
    if (selfClosing) continue
    if (closing) {
      depth -= 1
      if (depth === 0) {
        out.push(markup.slice(start, m.index + m[0].length))
        start = -1
      }
    } else depth += 1
  }
  return out
}

/** Every run of text a row draws, in order, trimmed, with entities turned back into characters. */
function textsOf(markup: string): string[] {
  const out: string[] = []
  const piece = />([^<]+)</g
  let m: RegExpExecArray | null
  while ((m = piece.exec(markup)) !== null) {
    const text = m[1]!
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x2F;/g, '/')
      .trim()
    if (text !== '') out.push(text)
  }
  return out
}

// ============================================================================ the corpus, in miniature

let seq = 0
function record(over: Partial<RecordListItem> = {}): RecordListItem {
  seq += 1
  return {
    id: `rec-${seq}`,
    kind: 'claim' as PanelRecord['kind'],
    workspaceId: 'w1',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: `Record ${seq}`,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-02 09:00:00',
    deletedAt: null,
    incompleteCount: 0,
    ...over,
  }
}

/** The prose a claim really carries. Every string here is one this page used to print on the row. */
const PROSE = {
  method: 'a checkerboard sweep across nine poses, repeated on three days',
  measuredOn: 'the chest camera on the live rig, 2026-07-30',
  confidence: 'high for the mean, low for the tail: 240 trials is not many at the edges',
  summary: 'The chest camera is accurate enough in depth for the handover reach to be planned from it.',
}

function claim(over: Partial<RecordListItem> = {}): RecordListItem {
  return record({
    kind: 'claim' as PanelRecord['kind'],
    title: 'Depth error on the chest camera is under 6mm at one metre',
    summary: PROSE.summary,
    data: {
      state: 'measured',
      method: PROSE.method,
      measured_on: PROSE.measuredOn,
      numbers: { sigma_z_mm: 5.8, trials: 240 },
      confidence: PROSE.confidence,
    },
    ...over,
  })
}

const DIRECTION_PROSE = {
  next: 'Ask the same thirteen questions of the browser and compare the two sets of answers.',
  blockedOn:
    'GET /api/source and GET /api/source/coverage are 404 in this workspace, so the index has ' +
    'never been built and neither question can be asked here at all.',
  summary: 'How much of a working week Mole Office can answer for on its own.',
  question:
    'With the repository, the git history and every previous transcript closed off, which of the ' +
    'questions a person asks at the start of a week can Mole Office answer on its own, and where does ' +
    'it send the reader back to the code?',
}

function direction(over: Partial<RecordListItem> = {}): RecordListItem {
  return record({
    kind: 'direction' as PanelRecord['kind'],
    title: 'Can a cold agent run the week off Mole Office alone',
    summary: DIRECTION_PROSE.summary,
    data: { depth: 'measured', next: DIRECTION_PROSE.next },
    ...over,
  })
}

/** The six labels this page printed on every row. Named here exactly as a reader saw them. */
const SIX_LABELS = ['numbers', 'How it was measured', 'measured on', 'method', 'confidence', 'what it is']

// ============================================================================ what a row draws

describe('a Findings row draws a title, small state, and nothing that merely informs', () => {
  it('draws at most six pieces of text, where the worst row used to draw fourteen', () => {
    // MEASURED ON THE LIVE CORPUS, 16 August 2026: 14 pieces of text on the worst claim row, of
    // which six were labels repeated on every row. The budget is six rather than four because a row
    // may also carry the made-up-example mark and the unfilled-field count, which USER.md invariant 3
    // says may never be folded away.
    const rows = rowsOf(page([claim({ origin: 'fixture', incompleteCount: 2 }), direction()]))
    expect(rows.length, 'the page drew no rows at all').toBe(2)
    for (const row of rows) {
      const texts = textsOf(row)
      expect(
        texts.length,
        `a row drew ${texts.length} pieces of text: ${JSON.stringify(texts)}`,
      ).toBeLessThanOrEqual(6)
    }
  })

  it('prints none of the six labels it used to print on every row', () => {
    const rows = rowsOf(page([claim(), direction({ data: { depth: 'measured', next: DIRECTION_PROSE.next } })]))
    for (const row of rows) {
      const texts = textsOf(row)
      for (const label of SIX_LABELS) {
        expect(texts, `the label "${label}" is back on a row`).not.toContain(label)
      }
    }
    // AND THE COMPONENT THAT DRAWS A LABELLED FACT IS NOT ON A ROW EITHER. Checking the words alone
    // would pass the day somebody kept the labelled-fact line and renamed the labels.
    const html = page([claim(), direction()])
    expect(html, 'a row draws a labelled fact line again').not.toContain('fam-fact-label')
  })

  it('has no fold on a row, because a fold on a list row is the list trying to be a detail page', () => {
    const html = page([claim({ origin: 'fixture', incompleteCount: 2 }), direction()])
    for (const row of rowsOf(html)) {
      expect(row, 'a row folds something away again').not.toContain('<details')
    }
  })

  it('leaves the measurement, the method and the summary to the page behind the row', () => {
    const rows = rowsOf(page([claim(), direction()]))
    const all = rows.join('\n')
    for (const [what, value] of Object.entries(PROSE)) {
      expect(all, `a row still prints the claim's ${what}`).not.toContain(value)
    }
    for (const [what, value] of Object.entries(DIRECTION_PROSE)) {
      expect(all, `a row still prints the direction's ${what}`).not.toContain(value)
    }
    // The named figures went with them. They are a measurement, and a measurement informs.
    expect(all, 'a row still prints the stored figures').not.toContain('sigma_z_mm')
  })

  it('draws the title, and the title is the way to everything that was taken off the row', () => {
    const rows = rowsOf(page([claim()]))
    expect(rows[0], 'the claim row lost its title').toContain(
      'Depth error on the chest camera is under 6mm at one metre',
    )
    expect(rows[0], 'the claim row does not link to the record it is about').toMatch(/href="#\/r\/rec-\d+"/)
  })

  it('titles a direction with its name, not with the paragraph-long question stored on it', () => {
    // MEASURED ON THE LIVE CORPUS: the one direction that carries a `question` carries 218
    // characters of it, which wraps to three lines. Its own title says the same thing in sixty.
    const rows = rowsOf(page([direction({ data: { depth: 'measured', question: DIRECTION_PROSE.question } })]))
    expect(rows[0], 'the direction row lost its name').toContain('Can a cold agent run the week off Mole Office alone')
    expect(rows[0], 'a paragraph is being used as the row title again').not.toContain(DIRECTION_PROSE.question)
  })
})

// ============================================================================ state, where it helps

describe('the stored state word is drawn where it separates two rows, and said once where it does not', () => {
  it('draws the word on every row when the claims do not all carry the same one', () => {
    // SIXTEEN OF THE SEVENTEEN CLAIMS in the live workspace read `measured` and one reads
    // `proposed`, which Mole Office shows to a reader as "not measured". The chip is what finds that one.
    const html = page([claim(), claim({ data: { state: 'proposed' } })])
    const rows = rowsOf(html)
    expect(rows.length).toBe(2)
    for (const row of rows) {
      expect(row, 'a claim row lost its state word while the rows still differ').toContain('px-chip-stored')
    }
    expect(html).toContain('measured')
    expect(html).toContain('not measured')
  })

  it('says the word once beside the heading when every claim carries it, instead of once per row', () => {
    // A mark on everything marks nothing. docs/UX-CONTRACT.md says so, and rule R11 of report
    // n9Mjk3c_sJRu says a label every row carries is said once at the heading. CRITERION CHANGE,
    // wave 13j round 11: it was the sentence "All 3 of these are measured." above the rows; the
    // count sentences go (block b-17), so the word is the shared chip, once, beside the heading.
    const html = page([claim(), claim(), claim()])
    for (const row of rowsOf(html)) {
      expect(row, 'a row still draws its own chip when all three say the same thing').not.toContain('px-chip-stored')
    }
    expect((html.match(/px-chip-stored/g) ?? []).length, 'the page dropped the word instead of saying it once').toBe(1)
    expect(html).toMatch(/<span class="flst-shared"><span class="px-chip px-chip-stored"/)
    expect(html).not.toMatch(/All \d+ of these are/)
  })

  it('keeps the word on the rows when one claim has none, because that is a real difference', () => {
    // USER.md invariant 5. A record nobody finished is exactly the row a reader should be able to find,
    // and `StoredState` says "no state" for itself rather than drawing nothing.
    // CRITERION CHANGE, wave 13j round 11: the claim with none draws the short mark, with the reason
    // on hover, and no longer a "no state" chip (report n9Mjk3c_sJRu block b-17).
    const html = page([claim(), claim({ data: {} })])
    const rows = rowsOf(html)
    expect(rows.some((row) => row.includes('px-chip-stored'))).toBe(true)
    expect(rows.some((row) => row.includes('class="px-absent" title="No state word is stored"'))).toBe(true)
    expect(html, 'the page claimed every claim shares a word when one has none').not.toContain('flst-shared')
  })

  it('uses the word the rest of the product uses, never one of its own', () => {
    // A claim stored as `proposed` reads "not measured" everywhere else in Mole Office.
    // Criterion change, wave 13j round 11: said by the shared chip beside the heading, not a sentence.
    const html = page([claim({ data: { state: 'proposed' } }), claim({ data: { state: 'proposed' } })])
    expect(html).toMatch(/<span class="flst-shared">[\s\S]*not measured/)
  })
})

// ============================================================================ the one warning

describe('a warning is drawn only where somebody has to act', () => {
  it('says a direction is blocked, without printing the paragraph that says why', () => {
    const rows = rowsOf(
      page([direction({ data: { depth: 'measured', blocked_on: DIRECTION_PROSE.blockedOn } })]),
    )
    expect(rows[0], 'a blocked direction no longer says it is blocked').toContain('Blocked')
    expect(rows[0], 'the warning drags the whole stored reason onto the row with it').not.toContain(
      DIRECTION_PROSE.blockedOn,
    )
  })

  it('says nothing at all on a direction nobody is blocked on', () => {
    const rows = rowsOf(page([direction({ data: { depth: 'measured' } })]))
    expect(rows[0], 'every direction row carries the warning, so the warning marks nothing').not.toContain(
      'Blocked',
    )
  })
})

// ============================================================================ the whitespace

/**
 * MEASURED IN A BROWSER, BECAUSE WHAT IS WANTED IS SOMETHING A PERSON CAN SEE.
 *
 * > "more whitespace between items"
 *
 * The shared row is built for a dense table of work. This page is an archive somebody scans slowly,
 * so its rows get more room. That is a fact about boxes on a screen, and the only honest way to
 * check it is to lay the boxes out.
 *
 * WHAT THIS REPLACED, AND WHY. Three cases read the stylesheets as text: one matched the selector
 * string, one pulled a padding token out of tokens.css and resolved it by hand, and one matched an
 * exact declaration character for character. All three broke on a restyle that kept the rule, and —
 * worse — all three stayed green when the rule stopped applying. A second declaration further down
 * the sheet, a missing ancestor class, a tie the cascade resolves on file order: the text is
 * unchanged in every one of those and the rows are the same height as everybody else's. The
 * specificity case was written to catch exactly that tie and could not, because it was itself a
 * string match. A browser resolves the cascade, so a tie now shows up as two equal numbers.
 */
describe('a Findings row gets more room than an ordinary row', () => {
  let drawn: Drawn

  beforeAll(async () => {
    /**
     * The page as the shell mounts it, and one ordinary row outside it as the control.
     *
     * `.fam` is the family shell's own wrapper, in pages/family/FamilyPage.tsx, and the Findings
     * rule is written under it. Leaving it out would measure a rule that never applies and call the
     * result a failure.
     */
    const findingsPage = renderToStaticMarkup(
      h(findings.FindingsPage, { records: [claim(), claim({ id: 'rec-2' })], onFiled: () => {} }),
    )
    const ordinary = renderToStaticMarkup(
      h(ui.Row, { title: 'An ordinary row', href: '#/r/m1', meta: 'Somewhere else in the product.' }),
    )
    // `UI_CSS` IS ADDED BY HAND because a page in the app loads it once, from ui.tsx, and a Row
    // rendered on its own does not carry it. Leaving it out would give every row no padding at all
    // and make the comparison meaningless in the direction that passes.
    drawn = await drawInABrowser(
      `<style>${ui.UI_CSS}</style>` +
        `<div class="fam" style="width: 900px">${findingsPage}</div>` +
        `<div id="control" style="width: 900px">${ordinary}</div>`,
    )
  }, 60_000)

  afterAll(async () => {
    await drawn?.close()
  })

  /** The room above and below one row, as the browser worked it out, in pixels. */
  const roomAround = (selector: string): Promise<{ top: number; bottom: number } | null> =>
    drawn.page.evaluate((css) => {
      const row = document.querySelector(css as string)
      if (row === null) return null
      const style = getComputedStyle(row)
      return { top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) }
    }, selector)

  it('is given more room above and below than any other row in the product', async () => {
    // Criterion change, wave 13j round 11: a Findings row is a row of the family lists, `.flst-row`.
    const mine = await roomAround('.fam-findings .flst-row')
    const other = await roomAround('#control .px-row')
    expect(mine, 'no Findings row was drawn, so this measures nothing').not.toBe(null)
    expect(other, 'no ordinary row was drawn, so there is nothing to compare against').not.toBe(null)
    expect(other!.top, 'an ordinary row has no room above it at all, so this comparison means nothing').toBeGreaterThan(
      0,
    )
    // A TIE IS A LOSS AND IT IS SILENT. Two rules of equal weight are resolved by which came later
    // in the sheet, and this project has read a tie as a win and measured it as a loss twice. The
    // comparison is therefore strict in both directions.
    expect(mine!.top, `a Findings row has ${mine!.top}px above it and an ordinary row has ${other!.top}px`).toBeGreaterThan(
      other!.top,
    )
    expect(
      mine!.bottom,
      `a Findings row has ${mine!.bottom}px below it and an ordinary row has ${other!.bottom}px`,
    ).toBeGreaterThan(other!.bottom)
  })

  it('adds no box of its own, so the page still sits in the column the family shell sets', () => {
    // The wrapper exists to be a name a stylesheet can say and nothing else. Anything that drew a
    // box here would be the page's own copy of the shell's column, free to disagree with it.
    return expect(drawn.styleOf('.fam-findings', 'display')).resolves.toBe('contents')
  })
})
