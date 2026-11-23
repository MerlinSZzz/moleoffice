// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The home page draws the server's answer, whole — and says so on every row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The rule that decides what needs a person lives in src/shared/attention.ts and the server runs
 * it. The home page's whole job is to draw that answer without narrowing it, without re-deriving
 * it and without quietly dropping the parts that are questions rather than verdicts.
 *
 * So the fixture below is NOT a hand-typed reply. It is built by running the REAL rule over
 * hand-made records, and then adding exactly the fields the route adds. That matters: a
 * hand-typed reply would let this file and the page agree with each other while both disagreed
 * with the rule, which is the failure this codebase keeps finding.
 *
 * The five things checked here are the five the redesign exists for:
 *
 *   1. the safety row is FIRST, above rows that score higher, and its recorded consequence is on
 *      the screen — that is the whole reason `isSafety` is a separate sort key;
 *   2. every visible row carries its reason IN WORDS, before any control, so it can be read
 *      without opening anything and without a hover a phone does not have;
 *   3. the remainder is counted exactly and named by group, never "54 more";
 *   4. an unclassified state word is drawn as a QUESTION and a record with no state at all is
 *      drawn as a different question again;
 *   5. a sum that does not balance SAYS SO, rather than being tidied into one that does.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`: no DOM, and adding one would be a new dependency this
 * project has ruled out. So, as tests/sessions-ui.test.ts and tests/panels-follow.test.ts do it,
 * components are rendered to static markup and the pure functions are called directly.
 * src/web/api.ts reads window.localStorage at module scope, so the smallest stand-in for a window
 * is installed before anything that reaches it is loaded.
 *
 * THE LAST BLOCK IN THIS FILE USES A SECOND INSTRUMENT. Questions about colour and about which
 * column narrows cannot be answered by reading markup or by reading a stylesheet, so that block
 * puts the same markup and the same stylesheets into headless Chromium and measures what is drawn.
 * Nothing is served and no port is held; its own header says what it replaced and why.
 * (That block measured the "by reason" groups and their rows, and wave 13k's round 22 removed it
 * with them; see the last section of this header.)
 *
 * ---------------------------------------------------------------------------------------
 * WAVE 13K ROUND 19: THE RANKED LIST IS GONE, AND WHAT THIS FILE DRAWS NOW
 * ---------------------------------------------------------------------------------------
 *
 * Item 6 of a decision removed the attention panel's ranked list, on problem EHvqbFQy1jY7. It
 * removed `AttentionPanel`, `RankedRow`, the verdict, the arithmetic above the list, the update offer and the
 * passed-over buckets. No page had drawn it since wave 13k's round 16. The tests that proved only that list went with
 * it. What is kept is drawn directly here: one row as `QuietRow` draws it (the row a "by reason" group builds when it
 * opens, which shares every part of a row with the old ranked row except the rank arithmetic), the groups as
 * `RemainderByGroup` draws them, and the questions.
 * Of the five things above, 1 and 5 now stand on the fixture test and on the groups' own sum check.
 *
 * MUTATIONS, ROUND 19: delete the stylesheet line in `RemainderByGroup` and the browser block goes
 * red, because nothing else mounts the sheet now; drop the sum check in `RemainderByGroup` and "reports
 * a breakdown that does not balance" goes red. In `QuietRow`: no lead, no facts, no age cell, the
 * fold named "ranked", no reason sentence in developer mode, a chip never told the date passed, or
 * the safety fact not passed to the row each turn the cases about that part red. In the groups: no
 * check of rows against group names, or a bar a screen reader reads, each turn its case red; and a
 * row with no kind before its title turns the two kind cases red.
 *
 * ---------------------------------------------------------------------------------------
 * WAVE 13K ROUND 22: THE "BY REASON" GROUPS ARE GONE TOO, AND THE ROW THEY DREW
 * ---------------------------------------------------------------------------------------
 *
 * Item 3 of a decision took round 19's recommendation: the "by reason" groups go on no page, Work to do
 * included. So `RemainderByGroup` and `QuietRow`, the row only those groups drew, were removed
 * from AttentionPanel.tsx, and with them every case here that proved only them: one row, the remainder, the red budget
 * on a row, the number beside a row's state word, the three kinds of tag, a row in no named group, a late row's
 * drawing, and the browser block that measured the groups and their rows. The mutations above that name those two parts
 * went with them. Of the five things at the top of this file, 1 stands on the fixture test and 4 on the questions; 2, 3
 * and 5 were about the rows and the groups, and no page draws either. What is left proves the fixture, the questions
 * (`QuestionsPanel`), the band (`PanelGrid`) and the panel file's own bytes.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { at } from './helpers.ts'
import { computeAttention, type AttentionResult } from '../src/shared/attention.ts'
import { ATTENTION_PART_ROWS, attentionPartOf, questionsOf } from '../src/shared/attention-first-page.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { Link, PanelRecord, RecordKind } from '../src/shared/types.ts'
import { unclassifiedNote } from '../src/shared/work.ts'

import type { AttentionReply } from '../src/web/api.ts'
type AP = typeof import('../src/web/components/AttentionPanel.tsx')
type PG = typeof import('../src/web/components/PanelGrid.tsx')
type WebApi = typeof import('../src/web/api.ts')

let ap: AP
let pg: PG

/** The moment every fixture below is dated against. Local, like every stamp in this product. */
const NOW = new Date(2026, 7, 9, 12, 0, 0).getTime()

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
  // Loaded for its side effect of being loadable at all: ui.tsx imports it for `errorMessage`,
  // and it is what makes the window stub above necessary.
  const webApi: WebApi = await import('../src/web/api.ts')
  expect(typeof webApi.errorMessage).toBe('function')

  ap = await import('../src/web/components/AttentionPanel.tsx')
  pg = await import('../src/web/components/PanelGrid.tsx')
})

// ---------------------------------------------------------------------------- the fixture

function stamp(daysAgo: number): string {
  const d = new Date(NOW - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

function record(id: string, kind: RecordKind, title: string, data: Record<string, unknown>, agedDays = 3): PanelRecord {
  return {
    id,
    kind,
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: stamp(agedDays),
    updatedAt: stamp(agedDays),
    deletedAt: null,
  }
}

/**
 * Seven records that between them exercise every branch the page has to draw.
 *
 * The safety problem is filed TODAY and the obligation is three weeks old and six days late, so
 * the obligation scores higher. That is the whole point of the pair: if the page ever draws them
 * in score order, the safety item drops and this file fails.
 */
const RECORDS: PanelRecord[] = [
  record(
    'rec-estop',
    'problem',
    'The E-stop path in the demo launcher is a no-op',
    {
      state: 'open',
      consequence: {
        bearer: 'person',
        what: 'The rig keeps moving after the stop button is pressed, and somebody stands next to it.',
      },
    },
    0,
  ),
  record(
    'rec-esa',
    'obligation',
    'Trial report: clamp holding-force section',
    {
      state: 'open',
      owedTo: 'the ESA grant review',
      due: '2026-08-03',
      consequence: { bearer: 'outside', what: 'The review has nothing to assess and the payment is held.' },
    },
    21,
  ),
  // Six crashed sessions, because seven visible rows and one dominant reason is the exact failure
  // the group cap exists to prevent. With these the fixture has more selected rows than fit, so
  // the remainder is real rather than empty — an empty remainder would let the tests below pass
  // by drawing nothing.
  ...Array.from({ length: 6 }, (_, i) =>
    record(`rec-crash-${i}`, 'session', `agent run ${i + 1} — handover replay sweep`, { state: 'crashed' }, 4 + i),
  ),
  // Blocks the ESA report, so the promise reaches it through a link nobody wrote it on. That is
  // the one thing this page works out for itself, and decision 8 says it has to look different.
  record('rec-reprint', 'task', '重印 v3 #4 (setting 13, 壁厚 2.0 mm)', { state: 'blocked' }, 2),
  record('rec-ik', 'problem', 'Placement runs through the recipe planner solver, which cannot hold jaw pose precisely', { state: 'open' }, 8),
  record('rec-queue', 'problem', '打印机排队，重印排在两个作业后面', { state: 'open' }, 2),
  record(
    'rec-paused',
    'task',
    'Buy our own 50 N force gauge',
    {
      state: 'todo',
      paused: {
        since: '2026-08-03',
        why: 'The consumables budget for this quarter is spent.',
        until: { date: '2026-08-18', recordId: 'rec-esa' },
      },
    },
    6,
  ),
  record('rec-chasing', 'purchase', '夹具标定 fixture, 重印 v3 #4', { state: 'chasing' }, 5),
  record(
    'rec-mod',
    'module',
    'SoilPen Mini 湿度读取',
    {
      parts: [
        {
          id: 'p1',
          name: 'On the bench',
          items: [
            { id: 'i1', text: 'Run the Mini and the ZED 2i on the same GPU', state: 'failed' },
            { id: 'i2', text: 'Mount the sensor', state: 'done' },
          ],
        },
      ],
    },
    11,
  ),
]

/** One `blocks` link, written down by a person: the reprint holds the ESA report up. */
const LINKS: Link[] = [
  {
    id: 'link-1',
    fromId: 'rec-reprint',
    toId: 'rec-esa',
    type: 'blocks',
    inferred: false,
    createdAt: stamp(2),
    createdBy: THE_TEST_OFFICES_OWNER.id,
    createdByType: null,
  },
]

/** A bare date is due at the END of that day. The one reader, borrowed rather than re-written. */
async function dueMs(): Promise<(s: string) => number | null> {
  const lib = await import('../src/web/lib/attention.ts')
  return lib.parseDueStamp
}

let RULE: AttentionResult

beforeAll(async () => {
  RULE = computeAttention({
    now: NOW,
    records: RECORDS,
    links: LINKS,
    changes: [],
    resources: [],
    dueMs: await dueMs(),
  })
})

/** The rule's answer plus exactly what the route adds. Nothing here is hand-typed. */
function reply(over: Partial<Record<string, unknown>> = {}): AttentionReply {
  return {
    ...RULE,
    at: stamp(0),
    read: { records: RECORDS.length, links: 0, changes: 0, changesCapped: false },
    machineSweep: {
      swept: false,
      searched: [],
      unchecked: [],
      note: 'This machine was NOT swept, so `machine` is empty because nobody looked.',
    },
    ...over,
  } as unknown as AttentionReply
}

const titleOf = (id: string) => RECORDS.find((r) => r.id === id)?.title ?? null

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/**
 * A sentence as it appears in HTML.
 *
 * Every reason in this product quotes the stored state word — `its state word is "open"` — and
 * React escapes those quotes on the way out. Comparing the raw sentence against the markup would
 * fail for a reason that has nothing to do with what is on the screen.
 */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * What a reader sees WITHOUT pressing anything.
 *
 * Every fold on this page is a native `<details>`. A row's body is in the markup whether it is open
 * or shut, and `toContain` cannot tell the two apart, so the scan line is the `<summary>` and that
 * is what these tests measure. A remainder group is different since L6: its rows are not built until
 * the group is first opened, so a test that needs one renders it with `QuietRow` (`rows` above).
 *
 * Summaries do not nest, so one non-greedy match per summary is exact.
 */
function scanLines(html: string): string[] {
  return [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((match) => match[1] ?? '')
}

/** The same thing as one string, for "is this word anywhere a reader can see it unopened". */
const scanned = (html: string): string => scanLines(html).join('\n')

/** The markup with every `<summary>` removed: what is ONLY reachable by opening something. */
function behindAFold(html: string): string {
  return html.replace(/<summary[^>]*>[\s\S]*?<\/summary>/g, '')
}

/** The English words, read from the word list by their keys. */
const en = createI18n('en').t

/** The text of some markup, for words that `Counted` splits round their numbers. */
const textOf = (html: string): string => html.replace(/<[^>]+>/g, '')

/** The line under the strip that names the paused records on the attention list, or null when there is none. */
function listedLine(html: string): string | null {
  return /<p class="att-questions-listed">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? null
}

// ============================================================================ the fixture itself

describe('the fixture exercises what the page has to draw', () => {
  it('puts the safety item above an obligation that scores higher', () => {
    const first = RULE.visible[0]
    const esa = [...RULE.visible, ...RULE.remainder].find((row) => row.recordId === 'rec-esa')
    expect(first?.recordId).toBe('rec-estop')
    expect(esa).toBeDefined()
    // The whole reason the floor is a separate sort key: the row below it scores MORE.
    expect((esa?.score ?? 0) > (first?.score ?? 0)).toBe(true)
    expect(first?.reason.safetyFloor).toBe(true)
  })

  it('produces one of each question: unclassified, no state, and paused', () => {
    expect(RULE.unclassified.map((row) => row.state)).toContain('chasing')
    expect(RULE.noState.length).toBeGreaterThan(0)
    expect(RULE.paused.map((row) => row.recordId)).toContain('rec-paused')
  })
})

// ============================================================================ the three questions

describe('the questions the record leaves open', () => {
  // THE PANEL IS HANDED THE COUNTS THE SERVER WORKS OUT (`questionsOf`), as Home is since round 19 of wave 13w.
  const questions = (over: Partial<Pick<AttentionResult, 'paused' | 'unclassified' | 'noState'>> = {}) =>
    body(h(ap.QuestionsPanel, { questions: questionsOf({ ...RULE, ...over }) }))
  // THE ROWS BEHIND THE PAUSED FOLD, as drawn once the fold is opened and its page has come.
  const pausedRows = () => body(h(ap.PausedRows, { rows: RULE.paused, titleOf }))

  // THE ROWS BEHIND THE UNCLASSIFIED FOLD, as drawn once the fold is opened and its page has come.
  const unclassifiedRows = () => body(h(ap.UnclassifiedRows, { rows: RULE.unclassified }))

  it('draws an unclassified word as a question and not as a verdict', () => {
    const html = unclassifiedRows()
    expect(html).toContain('Not classified')
    expect(html).toContain(esc(unclassifiedNote('chasing')))
    // The word is printed as stored, and the page never calls it a failure.
    expect(html).toContain('chasing')
    expect(html).not.toContain('Failed')
  })

  it('names every distinct unclassified word with its count, so the decision can be made once', () => {
    expect(questions()).toContain('× “chasing”')
  })

  it('keeps “no state at all” apart from “a word nobody has classified”', () => {
    const html = questions()
    const { noState } = questionsOf(RULE)
    expect(html).toContain('with no state word at all')
    // The three ways it splits are three counts, each with its own words.
    expect(html).toContain(esc(en('home.noStateSplit', { written: noState.written, noField: noState.noField, unknown: noState.unknownKind })))
  })

  it('shows a pause with its reason and what should bring it back', () => {
    const html = pausedRows()
    expect(html).toContain('The consumables budget for this quarter is spent')
    expect(html).toContain('2026-08-18')
    // And the record the pause waits on is named, not left as an id.
    expect(html).toContain('Trial report: clamp holding-force section')
  })

  /**
   * The strip says one sentence about itself, from `DATA_HEALTH_LEAD`: "None of these is on the
   * attention list." That has to stay true, and since a pause can now BE on the list, the only
   * honest way is to take those out of the count and say so where the count is read.
   */
  it('takes a paused record that is on the attention list out of the count, and names it', () => {
    const owedAndPaused = [{ ...at(RULE.paused, 0, 'paused row'), onList: true }]
    const html = questions({ paused: owedAndPaused })
    // The group is empty, because the one pause on file is not a question any more.
    expect(html).toContain('>0</span>')
    // And the line under the strip counts it against the pauses on file, with the record named and openable.
    const listed = listedLine(html)
    expect(listed).not.toBeNull()
    expect(textOf(listed ?? '')).toContain(en('home.pausesListed', { n: 1, total: 1 }))
    expect(listed).toContain(esc(at(RULE.paused, 0, 'paused row').title))
  })

  /**
   * THE PAUSED RECORDS ON THE ATTENTION LIST ARE NAMED IN THE OPEN, and nothing about them is folded.
   *
   * The line is a count and the records' names. There is no sentence about why a pause stops being a
   * question, so there is nothing to put behind a press: the only folds are the two groups with members.
   */
  it('names the paused records on the attention list in the open, behind no press', () => {
    const owedAndPaused = [{ ...at(RULE.paused, 0, 'paused row'), onList: true }]
    const html = questions({ paused: owedAndPaused })
    expect(listedLine(html)).toContain(esc(at(RULE.paused, 0, 'paused row').title))
    // The unclassified and no-state groups fold onto their rows; the paused group is empty and the line is open.
    expect(html.match(/<details/g) ?? []).toHaveLength(2)
  })

  it('draws no line about records on the list when none of the pauses is on it', () => {
    // The line only appears when there is something to count. "0 of 6 on the attention list" is
    // furniture that reads like a warning.
    expect(listedLine(questions())).toBeNull()
  })

  it('shows on each paused row the standing of its pause, as a word', () => {
    const html = pausedRows()
    const row = at(RULE.paused, 0, 'paused row')
    // The fixture's pause has a date that is still ahead on the fixture's clock.
    expect(row.standing).toBe('waiting-for-date')
    expect(html).toContain(esc(en('home.pauseStanding.dateAhead')))
  })

  /**
   * THE WHOLE BLOCK IS NOW A STRIP OF COUNTS, and these three tests are the bargain that allows it.
   *
   * On the seed these three groups were 6, 21 and 97 records drawn as open lists directly under the
   * ranked rows — about half of the home page, answering "what is untidy about my database" before
   * "what will go wrong today". Folding them is only honest if the count is exact, the group is
   * named in words, and every record behind it is still there.
   */
  it('reports each group as an exact count with a name, not as a list taking half the page', () => {
    const scan = scanned(questions())
    expect(scan).toContain('put down on purpose')
    expect(scan).toContain('state words nobody has classified')
    expect(scan).toContain('records with no state word at all')
    expect(scan).toContain(`>${RULE.paused.length}</span>`)
    expect(scan).toContain(`>${RULE.unclassified.length}</span>`)
    expect(scan).toContain(`>${RULE.noState.length}</span>`)
  })

  /**
   * SINCE ROUND 19 OF WAVE 13W THE ROWS ARE READ WHEN A FOLD IS OPENED, a page at a time, and not with Home.
   * So "none of them dropped" is held where the rows now come from: the pages of each list, read one after
   * another, give back every row of it once and in order. And on load the folds hold no rows at all.
   */
  it('keeps every record behind the counts, one press away and none of them dropped', () => {
    const html = behindAFold(questions())
    for (const row of [...RULE.paused, ...RULE.unclassified, ...RULE.noState]) expect(html, `"${row.title}" was drawn on load`).not.toContain(esc(row.title))
    const lists = { paused: RULE.paused.filter((row) => !row.onList), unclassified: RULE.unclassified, noState: RULE.noState } as const
    for (const [part, whole] of Object.entries(lists) as [keyof typeof lists, readonly { key: string }[]][]) {
      const read: string[] = []
      for (let from = 0; ; from += ATTENTION_PART_ROWS) {
        const page = attentionPartOf(RULE, part, from)
        expect(page.total).toBe(whole.length)
        read.push(...page.rows.map((row) => row.key))
        if (page.rows.length < ATTENTION_PART_ROWS) break
      }
      expect(read, `${part} was not read whole`).toEqual(whole.map((row) => row.key))
    }
  })

  it('says an empty group is empty rather than opening onto nothing', () => {
    const html = questions({ paused: [], unclassified: [], noState: [] })
    // Three zeros and three names, and no fold on any of them: a disclosure onto nothing is a
    // dead end. The three sentences under them explained groups with nothing in them to explain,
    // which on Home was about forty-five words under a "0" — they are read where a group has
    // members and opens onto them, and every one of them is checked in the tests above.
    expect(html).toContain('put down on purpose')
    expect(html).toContain('state words nobody has classified')
    expect(html).toContain('records with no state word at all')
    expect(html.match(/<details/g) ?? []).toHaveLength(0)
    expect(html).not.toContain('Mole Office has read a word it has never been told the meaning of')
  })
})


// ============================================================================ the band

describe('the band of smaller blocks', () => {
  it('renders blocks in the order it was given, which is the order a screen reader hears', () => {
    const html = body(
      h(pg.PanelGrid, {
        id: 'home',
        items: [
          { id: 'a', title: 'First', node: h('p', null, 'first block') },
          { id: 'b', title: 'Second', node: h('p', null, 'second block') },
        ],
      }),
    )
    expect(html.indexOf('first block')).toBeLessThan(html.indexOf('second block'))
    expect(html).toContain('data-pg-block="a"')
  })

  it('refuses two blocks with one id, rather than giving React two identical keys', () => {
    expect(() =>
      body(
        h(pg.PanelGrid, {
          id: 'home',
          items: [
            { id: 'a', title: 'First', node: null },
            { id: 'a', title: 'Also first', node: null },
          ],
        }),
      ),
    ).toThrow(/duplicate block ids/)
  })
})


// ============================================================================ the file itself

