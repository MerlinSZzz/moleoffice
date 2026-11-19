// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ABSENCE IS A WORD, NOT A PARAGRAPH — AND THE ONE COMPONENT IS HOW IT REACHES A SCREEN.
 *
 * ---------------------------------------------------------------------------------------------
 * THE REGRESSION THIS FILE EXISTS FOR, AND WHY IT IS THE SECOND TIME
 * ---------------------------------------------------------------------------------------------
 *
 * Round four measured 211 places where Mole Office stated an emptiness in a full sentence, routed them
 * through ONE component — `Absence` in src/web/components/ui.tsx — and gave it three tiers, so that
 * the type checker refuses a sentence where an ordinary emptiness is meant. The owner accepted it.
 *
 * By 16 August 2026 it had come back. Measured in Chromium at 1440 on the owner's own corpus, in normal
 * mode, with nothing pressed: TWELVE SURFACES DREW 141 ABSENCE PHRASES, 44 of them full sentences
 * of eight words or more, 990 words in all, every one of them at 13px or 14px — the same size as
 * the prose beside them. Nothing was de-emphasised. Two of them were the owner's:
 *
 *   HOME drew, twice, inside a bordered box on a second background, a 39-word paragraph beginning
 *   "Nobody has said whether it has been read, which is not the same as saying it is unread" — with
 *   the button that resolves it on the line above. The box gave the absence more weight than the
 *   report's title.
 *
 *   THE REPORT'S OWN PAGE repeated "Nobody has said whether it has been read." and carried NO WAY
 *   TO SAY YOU HAD READ IT. It stated an absence the reader could not act on.
 *
 * The new sentences did not come through `Absence`. They were written beside it, in components the
 * type checker was happy with, because nothing measures whether a NEW absence sentence went through
 * the component. So the third test below measures exactly that, and it is the half of this pass
 * meant to outlive it.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS PINNED AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------------
 *
 * Nothing here asserts a pixel or a colour; `tools/review.mjs` photographs the screens. What is
 * asserted is what a reader is given: a word rather than a sentence, a way to act where the absence
 * asks for one, and the whole sentence still reachable in Developer mode and to a screen reader. A
 * report's own page is the exception: its header draws the read rule's sentence in neither mode.
 *
 * THE THIRD TEST IS AN INVENTORY WITH A CEILING PER FILE, not a ban. 156 absence sentences in 34
 * files do not go through the component today, most of them older than this pass and in files this
 * pass does not own. Pinning the count per file is what makes a NEW one fail while leaving the
 * existing ones visible and countable. A file may always go DOWN.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportNoteOnAPage, reportReading } from '../src/shared/attention.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type AP = typeof import('../src/web/components/AttentionPanel.tsx')
type UI = typeof import('../src/web/components/ui.tsx')
type Page = typeof import('../src/web/pages/RecordPage.tsx')

/**
 * A window, then the modules, in that order and freshly each time.
 *
 * src/web/lib/mode.ts reads the mode ONCE while it loads, so a test that wants Developer mode has
 * to write the stored word before importing anything that reads it. The same reason and the same
 * shape as tests/record-body.test.ts.
 */
async function boot(mode: 'normal' | 'inspect') {
  const store = new Map<string, string>([['mole-office.mode', mode]])
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
  vi.resetModules()
  return {
    ap: (await import('../src/web/components/AttentionPanel.tsx')) as AP,
    ui: (await import('../src/web/components/ui.tsx')) as UI,
    page: (await import('../src/web/pages/RecordPage.tsx')) as Page,
  }
}

beforeEach(() => {
  vi.resetModules()
})

const NOW = '2026-08-16 09:00:00'
const en = createI18n('en').t

function report(data: Record<string, unknown>, over: Record<string, unknown> = {}): PanelRecord {
  return {
    id: 'rep-1',
    workspaceId: 'panelx',
    kind: 'report',
    title: 'Round five: the Table as an editing surface',
    summary: null,
    data,
    origin: 'authored',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
    ...over,
  } as unknown as PanelRecord
}

/** The markup without the stylesheets, which carry every sentence in the product as CSS comments. */
const strip = (markup: string): string => markup.replace(/<style[\s\S]*?<\/style>/g, '')

/** What a reader sees: the markup with the tags taken out and the entities put back. */
function words(element: ReactElement): string {
  return strip(renderToStaticMarkup(element))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x2019;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * THE SAME READING THE BROWSER MEASUREMENT USES, so a number in the report and a number in a test
 * mean the same thing: a phrase whose SUBJECT is the emptiness, of eight words or more.
 */
const ABSENCE_START =
  /^(nobody\b|no one\b|nothing\b|none\b|not \w+|never\b|no \w+ (yet|written|recorded|stored|said)|there (is|are) no\b)/i
const ABSENCE_IDIOM =
  /\b(nobody has|nobody wrote|nobody could|nobody knows|nothing has|nothing says|cannot say|cannot tell|has not been (said|recorded|written)|it holds nothing)\b/i

export function absenceSentences(text: string): string[] {
  const found: string[] = []
  for (const piece of text.split(/(?<=[.!?])(?=\s)|\n\s*\n/)) {
    const t = piece.replace(/\s+/g, ' ').replace(/\$\{[^}]*\}/g, 'X').trim()
    if (t === '') continue
    if (t.split(/\s+/).filter(Boolean).length < 8) continue
    if (!(ABSENCE_START.test(t) || ABSENCE_IDIOM.test(t))) continue
    found.push(t)
  }
  return found
}

// ============================================================ 1. the report card on Home

/**
 * THE ROW SAYS WHERE THE REPORT STANDS IN A WORD, AND THE PRESS IS BESIDE IT.
 *
 * The three read answers stay three. What changes is how much ink each one costs. On Home a report nobody has
 * marked draws no mark at all, because "I have read this" beside it already says it; a module's page, which
 * draws the same row, keeps the mark.
 */
describe('a report waiting to be read', () => {
  const row = (data: Record<string, unknown>) => reportReading(report(data), [])

  it('draws a small mark instead of the paragraph, in normal mode', async () => {
    const { ap } = await boot('normal')
    const text = words(
      h(ap.ReportLine, { row: row({ for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] }), onMarkedRead: () => {} }),
    )

    expect(text, 'the read state is not said at all').toContain('not marked read')
    expect(
      text,
      'the rejected paragraph is back on the row',
    ).not.toContain('which is not the same as saying it is unread')
    expect(
      absenceSentences(text),
      'this row states an emptiness in a full sentence again, which is the regression this file exists for',
    ).toEqual([])
  })

  it('on Home, draws no mark for a report nobody has marked, and keeps the press that says it', async () => {
    const { ap } = await boot('normal')
    const reply = { reports: [row({ for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] })], reportCounts: { waiting: 1, read: 0 } }
    const html = strip(renderToStaticMarkup(h(ap.ReportsForYou, { reply, onMarkedRead: () => {} })))
    expect(html, 'Home drew no report row').toContain('<li class="att-rep"')
    const line = html.slice(html.indexOf('<li class="att-rep"'), html.indexOf('</li>') + '</li>'.length)
    const text = words(h(ap.ReportsForYou, { reply, onMarkedRead: () => {} }))

    expect(text, 'Home still marks the report as nobody having said').not.toContain('not marked read')
    expect(line, 'the row still draws the dashed edge of a gap').not.toContain('data-edge="dashed"')
    expect(text, 'the press that says it is gone from the row').toContain('I have read this')
    expect(absenceSentences(text), 'Home states an emptiness in a full sentence').toEqual([])
  })

  it('keeps the way to act on it — the press is on the same row', async () => {
    const { ap } = await boot('normal')
    const html = strip(
      renderToStaticMarkup(
        h(ap.ReportLine, { row: row({ for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] }), onMarkedRead: () => {} }),
      ),
    )
    expect(html, 'an absence with no way forward is a dead end').toContain('I have read this')
  })

  it('tells "nobody has said" from "somebody said unread", because they are two different facts', async () => {
    const { ap } = await boot('normal')
    const said = strip(
      renderToStaticMarkup(
        h(ap.ReportLine, { row: row({ read: 'unread', date: '2026-08-16' }), onMarkedRead: () => {} }),
      ),
    )
    const nobody = strip(
      renderToStaticMarkup(h(ap.ReportLine, { row: row({ date: '2026-08-16' }), onMarkedRead: () => {} })),
    )

    expect(said, 'a stated "unread" is not drawn as a stated unread').toContain('marked unread')
    expect(
      said,
      'somebody DID say, so this may not take the dashed edge that means nobody looked',
    ).not.toContain('data-edge="dashed"')
    expect(nobody, 'nobody has said, and that is the edge which says so').toContain('data-edge="dashed"')
  })

  it('still says the whole of it in Developer mode, so nothing is destroyed', async () => {
    const { ap } = await boot('inspect')
    const text = words(
      h(ap.ReportLine, { row: row({ for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] }), onMarkedRead: () => {} }),
    )
    expect(text, 'the rule’s own sentence is not reachable anywhere').toContain(
      'Not marked read or unread',
    )
  })
})

// ============================================================ 2. the report's own page

/**
 * A REPORT'S PAGE MAY NOT STATE AN ABSENCE THE READER CANNOT CLOSE.
 *
 * It stated one and offered nothing: marking a report read was only drawn while the address said
 * edit. Both halves are asserted here, because fixing either one alone leaves the defect.
 */
describe('the report page', () => {
  const rendered = async (mode: 'normal' | 'inspect', data: Record<string, unknown>, editable = false) => {
    const { page } = await boot(mode)
    const rec = report(data)
    const props = {
      record: rec,
      editable,
      deleted: false,
      records: [rec],
      detailLinks: [],
      relations: [],
      evolutionLinks: [],
      log: { changes: [], sessions: [] },
      titles: [rec.title],
      titleById: new Map([[rec.id, rec.title]]),
      unfilledByRecord: new Map<string, number>(),
      body: page.bodySections(rec),
      onChanged: () => {},
    }
    return strip(renderToStaticMarkup(h(page.RecordDetail, props as never)))
  }

  it('offers the press that says you have read it, without going into edit', async () => {
    const html = await rendered('normal', { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] })
    expect(
      html,
      'the page states that nobody has said whether it was read and gives no way to say it',
    ).toContain('I have read this')
  })

  it('does not state the absence of a read mark in normal mode', async () => {
    // THE OWNER NAMED THE UNMARKED-READ MARK AMONG THE LINES THAT SAY NOTHING. Normal mode
    // keeps the press that closes the gap and no words about the gap. Developer mode draws no words about it
    // either (the case after the next one).
    const html = await rendered('normal', { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] })
    const byline = /<p class="rd-byline">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
    const text = byline
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    expect(text, 'the absence about reading is back').not.toContain('not marked read')
    expect(text, 'the sentence is back').not.toContain('Not marked read or unread.')
  })

  it('draws nothing about reading it once it has been read, and no press', async () => {
    const html = await rendered('normal', { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', read: 'read', blocks: [] })
    const byline = /<p class="rd-byline">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
    expect(byline).toContain('Marked read.')
    expect(byline, 'a report already read still asks to be read').not.toContain('I have read this')
  })

  it('draws neither the read rule’s sentence nor the unmarked word in Developer mode', async () => {
    // THE HEADER DRAWS NO LINE THAT ONLY EXPLAINS THE RULE (decision 8SkQQo1x69IV, revision 3), in either mode.
    // The press is what is left of the read mark's absence.
    const data = { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] }
    const html = await rendered('inspect', data)
    const { formatDue } = await import('../src/web/lib/attention.ts')
    const byline = (/<p class="rd-byline">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
    expect(byline, 'the byline is not on the page at all, so this test is measuring nothing').not.toBe('')
    expect(byline, 'the line that carried the rule’s sentence is back').not.toContain('rd-byline-said')
    expect(byline, 'the rule’s sentence is back').not.toContain(reportNoteOnAPage(reportReading(report(data), []), en, formatDue))
    expect(byline, 'the absence about reading is back').not.toContain(en('g2b.report.notMarkedRead'))
    expect(byline, 'the press that closes the gap is gone').toContain(en('home.iHaveRead'))
  })

  /**
   * ONE CONTROL PER FIELD PER SCREEN. While the record is being changed, the panel below the byline
   * puts a box on this same `read` field, and two controls for one field is how somebody comes to
   * write into the one that is not saving — which is the reason written on that panel already.
   */
  it('leaves the press off while the record is being changed, where the field has a box', async () => {
    const html = await rendered('normal', { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-16', blocks: [] }, true)
    const byline = /<p class="rd-byline">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
    expect(byline, 'the byline is not on the page at all, so this test is measuring nothing').not.toBe('')
    expect(byline, 'the press and the field box are both offered at once').not.toContain('I have read this')
    expect(html, 'the field box is not there either, so nothing can record this').toContain(
      'whether the person it is for has read it',
    )
  })
})

// ============================================================ 3. the removed unmarked-row sentence

describe('the removed unmarked-row sentence', () => {
  for (const mode of ['normal', 'inspect'] as const) for (const full of [false, true]) {
    it(`does not show or hide the sentence in ${mode}, full=${full}`, async () => {
      const { ui } = await boot(mode)
      const { createI18n } = await import('../src/shared/i18n.ts')
      const html = renderToStaticMarkup(h(ui.UnmarkedRowsNote, { what: 'row', full }))
      expect(html).not.toContain(createI18n('en').t('sheet.origin.unmarked', { what: 'row' }))
      if (mode === 'inspect' && !full) expect(html).toContain(createI18n('en').t('sheet.origin.otherMarks', { what: 'row' }))
      else expect(html).toBe('')
    })
  }
})

// ============================================================ 4. the guard that outlives this pass

/**
 * A NEW ABSENCE SENTENCE MUST GO THROUGH THE COMPONENT.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW IT READS THE SOURCE, AND WHY IT IS NOT A PARSER
 * ---------------------------------------------------------------------------------------------
 *
 * The type checker cannot catch this: writing a paragraph into a `<p>` is legal TypeScript. So this
 * reads what a component WRITES — its string literals and its JSX text — and asks of each absence
 * sentence whether it sits inside an `<Absence …/>`.
 *
 * COMMENTS ARE CUT FIRST, and they have to be: this repository's comments are longer than its code
 * and are full of the very sentences being counted. They are cut by shape rather than by parsing,
 * because every comment here is either a whole line, a block that begins a line, or a JSX comment —
 * and the control below proves the cut on a fixture that contains all three, plus the two things it
 * must NOT cut: a URL, and a regular expression with a slash in it.
 *
 * WHAT IT CANNOT SEE, said rather than implied: a sentence built by joining variables, one imported
 * from src/shared, and one that a component receives as a prop from elsewhere. This measures the
 * text a component writes down, which is where all four of the regressions in this pass were.
 */

export function withoutComments(src: string): string {
  return src
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/([ \t])\/\/[^\n]*$/gm, '$1')
}

/** A quoted string or a run of JSX text: the two shapes a component writes words in. */
const WRITTEN = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|>(?:[^<>{}`])+</g

/** Where an `<Absence …/>` element starts and ends, so a sentence inside one can be told apart. */
function absenceSpans(code: string): [number, number][] {
  const spans: [number, number][] = []
  let at = 0
  for (;;) {
    const start = code.indexOf('<Absence', at)
    if (start === -1) break
    const end = code.indexOf('/>', start)
    spans.push([start, end === -1 ? start + 600 : end + 2])
    at = start + 8
  }
  return spans
}

function bypassesIn(source: string): string[] {
  const code = withoutComments(source)
  const spans = absenceSpans(code)
  const out: string[] = []
  for (const match of code.matchAll(WRITTEN)) {
    const at = match.index
    if (spans.some(([a, b]) => at >= a && at <= b)) continue
    out.push(...absenceSentences(match[0].slice(1, -1)))
  }
  return out
}

describe('an absence sentence goes through the one component', () => {
  it('sees a sentence handed to the component as routed, and the same sentence beside it as not', () => {
    const routed = '<Absence tier="told-apart" looked={false} title="Nobody has said whether it has been read, and that is the truth." />'
    const beside = '<p className="x">Nobody has said whether it has been read, and that is the truth.</p>'
    expect(bypassesIn(routed), 'a sentence inside <Absence> is being counted as a bypass').toEqual([])
    expect(bypassesIn(beside), 'a sentence written straight into the markup is not being counted').toHaveLength(1)
  })
})
