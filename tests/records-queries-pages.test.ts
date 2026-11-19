// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change: plan 7FEOshq3mBGG replaces ordinary empty sentences and hides machine details in normal mode.
/**
 * Tests for the two list pages: RecordsPage.tsx and QueriesPage.tsx.
 *
 * WHY THEY LOOK LIKE THIS. The runner's environment is `node` — there is no DOM, and adding one
 * would be a new dependency this project has ruled out. So there are two kinds of test here:
 *
 *   - the pure functions (`countLine`, `filterRecords`, `groupRecords`, `unmetMeta`) are called
 *     directly. They carry the claims these pages make in words, and a wrong word here is a lie
 *     on screen that no screenshot review would reliably catch.
 *   - the presentational components are rendered to static markup with react-dom/server, which
 *     is enough to check what must be IN the markup: a record title that is an anchor carrying
 *     `px-nav` (underlined at rest, the app's whole "this navigates" signal), the words in each
 *     empty state, the scope sentences on the query panels, and the fact that a record of an
 *     unknown kind is listed rather than dropped.
 *
 * What these do NOT cover: how it looks. Whether the panels tile at 1440 and stack at 390, and
 * whether the alarm tint reads in dark, are screenshot questions and were checked that way.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { LINK_TYPES, RECORD_KINDS, type PanelRecord, type RecordKind } from '../src/shared/types.ts'
import { KIND_FAMILIES, unclassifiedNote } from '../src/shared/work.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { familyWord, kindWord } from '../src/shared/words.ts'
import type { RecordListItem } from '../src/web/api.ts'
import { parseRoute, recordPath } from '../src/web/components/router.tsx'
import type { GraphLink } from '../src/web/components/graph/model.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/**
 * WHAT THESE RENDERS PASS FOR `declares`: see-through, because none of them reads a target.
 *
 * The panels below now take the answer from their caller's own `sectionsOf`. These tests read what
 * is INSIDE each panel — the words, the fold, the absence — so the see-through answer is the one
 * that leaves the markup they read exactly as it was.
 */
const SEE_THROUGH = { surface: null } as const


type RecordsPage = typeof import('../src/web/pages/RecordsPage.tsx')
type QueriesPage = typeof import('../src/web/pages/QueriesPage.tsx')
type LinkPanelModule = typeof import('../src/web/components/LinkPanel.tsx')
type GraphModel = typeof import('../src/web/components/graph/model.ts')
type OutlineModule = typeof import('../src/web/components/graph/Outline.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')
/** The one declaration of the grid every list of records is laid on. See `famCols`. */
type RowsModule = typeof import('../src/web/pages/family/rows.tsx')
let rp: RecordsPage
let qp: QueriesPage
let lp: LinkPanelModule
let gm: GraphModel
let outline: OutlineModule
/**
 * The Normal/Developer switch, so one test can read the catalogue both ways.
 *
 * Imported here rather than at the top of the file for the same reason the pages are: it reads
 * `window` at import time, and the stand-in below has to exist first.
 */
let mode: ModeModule
let rows: RowsModule

beforeAll(async () => {
  // Both pages reach src/web/api.ts, which reads window.localStorage at module scope to restore
  // who you are acting as. This is the smallest stand-in that lets the modules load; nothing
  // here is under test. `location` and the two listener methods are here for the four modules the
  // cross-surface navigation tests load — the home rows, the link panel and the graph's reading
  // layer — which reach further into the window than these two pages do.
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
  rp = await import('../src/web/pages/RecordsPage.tsx')
  qp = await import('../src/web/pages/QueriesPage.tsx')
  lp = await import('../src/web/components/LinkPanel.tsx')
  gm = await import('../src/web/components/graph/model.ts')
  outline = await import('../src/web/components/graph/Outline.tsx')
  mode = await import('../src/web/lib/mode.ts')
  rows = await import('../src/web/pages/family/rows.tsx')
})

/** Markup with the hoisted <style> blocks removed, so a class name mentioned in the CSS cannot
 *  be mistaken for evidence that something rendered it. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

let seq = 0
/**
 * A record as the LIST endpoint serves it: the record plus its own `incompleteCount`.
 *
 * The count is part of every row the server sends and the page draws it, so a fixture without one
 * would be testing a shape the app never receives.
 */
function record(over: Partial<RecordListItem> = {}): RecordListItem {
  seq += 1
  return {
    id: `rec-${seq}`,
    kind: 'module',
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

const noop = () => {}

/**
 * Everything a reader sees BEFORE pressing anything, and nothing else.
 *
 * The runner has no DOM, so a `<details>` cannot be opened and clicked. What CAN be checked, and
 * what the fold contract is actually about, is which words are inside a `<summary>` and which are
 * only behind one — so a test that a paragraph is folded is a test that its sentence is in the
 * markup and not in this string.
 */
function shownAtRest(html: string): string {
  return (
    [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)]
      .map((match) => match[1] ?? '')
      .join(' ')
      .replace(/<[^>]+>/g, '')
      // React escapes the two quote characters in text; a test comparing against the sentence a
      // person actually reads has to put them back, or it is asserting against the encoding.
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
  )
}

// ============================================================================ the count line

describe('the records count line always says what is being excluded', () => {
  it('names the one exclusion that is always in force, even with no filter set', () => {
    const line = rp.countLine({ loaded: 14, shown: 14, kind: '', query: '' })
    // NOT "fetched", which is what the browser did rather than what the reader has. Nit 40 of the
    // language audit, 19 August 2026.
    expect(line).toContain('14 records.')
    expect(line).not.toContain('fetched')
    // A page whose lede says "everything" is quietly wrong about this on every render: the list
    // endpoint never returns soft-deleted records, whatever the two controls say. The clause used
    // to arrive under the label "Excluded right now:", which was wrong about this one — it is the
    // clause that is NOT "right now" and does not depend on either control.
    expect(line).not.toContain('Deleted records are never in this list')
    expect(line).not.toContain('right now')
  })

  it('says the server was only asked for one kind, and how many kinds that leaves out', () => {
    const line = rp.countLine({ loaded: 4, shown: 4, kind: 'module', query: '' })
    expect(line).toContain('4 records')
    expect(line).toContain('“module”')
    expect(line).toContain(t('g7a.records.kindFilter', { kind: kindWord('module').text }))
  })

  it('reads as whole sentences with every filter and count the page can show', async () => {
    // EACH PART OF THE LINE IS A SENTENCE OF ITS OWN: a capital or a numeral at the front and a full stop at the end.
    // Round 166's pictures found "1 record. showing only “report” Counted in Default." at 390: a filter clause made
    // for the middle of a sentence, stood between two whole ones.
    const { withCountedOver } = await import('../src/web/components/ProjectChoice.tsx')
    const wholeSentences = /^[\p{Lu}\p{N}][^.]*\.(?: [\p{Lu}\p{N}][^.]*\.)*$/u
    const kinds = ['', 'report'] as const
    const groups = ['', 'ideas'] as const
    const queries = ['', 'grip'] as const
    const modes = ['normal', 'inspect'] as const
    let lines = 0
    for (const kind of kinds) for (const facet of groups) for (const query of queries) for (const mode of modes) for (const locked of [false, true]) for (const shown of [1, 4]) {
      const line = rp.countLine({ loaded: shown, shown, kind, query, facet, mode, locked })
      if (line === '') continue
      lines += 1
      const said = JSON.stringify({ kind, facet, query, mode, locked, shown })
      expect(line, said).toMatch(wholeSentences)
      expect(withCountedOver(line, 'default', new Map([['default', 'Default']])), said).toMatch(wholeSentences)
      // EVERY FILTER THAT IS ON IS NAMED in the line, with the words it is chosen by.
      if (kind !== '' && !locked) expect(line, said).toContain(`“${kindWord(kind, mode).text}”`)
      if (facet !== '') expect(line, said).toContain(`“${familyWord(facet).text}”`)
      const alone = rp.filterState({ loaded: shown, shown, kind, query, facet, mode, locked }).sentence
      if (alone !== '') expect(alone, said).toMatch(wholeSentences)
    }
    expect(lines).toBe(64)
  })

  it('says how many records say the word, and that the server read all of them', () => {
    // THE BOX ASKS THE SERVER NOW. It used to narrow what had already arrived, by title and
    // one-line summary, and the line said so — truthfully, and about a search that missed most of
    // what a person was looking for: of the 20 records in the live corpus that mention "gripper",
    // 9 have it in a title or a summary.
    //
    // So there is no local remainder any more. `loaded` and `shown` are the same number, and "3 of
    // 3 loaded records shown" would be arithmetic about a set that does not exist.
    const line = rp.countLine({ loaded: 3, shown: 3, kind: '', query: 'grip' })
    expect(line).toContain('3 records match “grip”')
    // WHAT WAS SEARCHED IS SAID ONCE, AND IT IS SAID WHERE THE ROWS WOULD HAVE BEEN. It used to be
    // here as well, so a search that matched nothing stated the result twice and the method twice,
    // in different words, on one screen — finding 18 of the language audit, 19 August 2026. The
    // sentence survives, in the empty state; the assertion for it is on `RecordResults` below.
    expect(line).not.toContain('Every record in this project was read')
  })

  it('ends the count with the page language\'s own full stop', () => {
    // THE STOP WAS TYPED IN THE CODE, so a Chinese page read "14 条记录." with an English full stop
    // (wave 13q's pictures, report sq0pkKHJvUm1). The sentence and its stop are one word-list entry.
    try {
      setWordLanguage('zh')
      const line = rp.countLine({ loaded: 14, shown: 14, kind: '', query: '' })
      expect(line).toContain('14 条记录。')
      expect(line).not.toContain('条记录.')
    } finally {
      setWordLanguage('en')
    }
    expect(rp.countLine({ loaded: 1, shown: 1, kind: '', query: '' })).toContain('1 record.')
  })

  it('says nothing at all when a search matched nothing, because the empty state says it', () => {
    // The three-times-over screen: this line, the empty state, and "deleted records are never in
    // this list" under the box. One screen, one answer.
    expect(rp.countLine({ loaded: 0, shown: 0, kind: '', query: 'zzzznothingmatches' })).toBe('')
  })

  it('keeps every clause when both filters are on', () => {
    const line = rp.countLine({ loaded: 1, shown: 1, kind: 'claim', query: 'force' })
    expect(line).toContain('1 record matches “force”')
    expect(line).toContain('“claim”')
    expect(line).toContain('“force”')
    expect(line).not.toContain('deleted records')
  })

  it('says "record" in the singular', () => {
    expect(rp.countLine({ loaded: 1, shown: 1, kind: '', query: '' })).toContain('1 record.')
  })
})

describe('filterState is the one place that says what is excluded', () => {
  it('reports nothing filtered when neither control is set, and still names deleted records', () => {
    const state = rp.filterState({ loaded: 9, shown: 9, kind: '', query: '' })
    expect(state.filtered).toBe(false)
    expect(state.clauses).toHaveLength(0)
    expect(state.sentence).toBe('')
  })

  it('reports one clause per cause', () => {
    const state = rp.filterState({ loaded: 9, shown: 2, kind: 'task', query: 'grip' })
    expect(state.filtered).toBe(true)
    // TWO CLAUSES, NOT THREE. The search no longer excludes anything this page is holding — the
    // server returns what matched — so there is no remainder clause to write, and what the search
    // DID read is said in the head sentence instead. Three clauses joined with "and" put a long one
    // in the middle and the whole line ran on.
    expect(state.clauses).toHaveLength(1)
    // Every clause ends in what it excludes — "were never fetched", "are not drawn", "are never in
    // this list" — so the sentence needs no label in front of it saying that it is a list of
    // exclusions. It reads as one sentence: capital at the front, full stop at the end.
    expect(state.sentence).toBe(t('g7a.records.kindFilter', { kind: kindWord('task').text }))
    expect(state.sentence).not.toContain('server')
  })
})

// ============================================================================ filtering, grouping

describe('filterRecords', () => {
  it('matches the title and the summary, ignoring case', () => {
    const records = [
      record({ title: 'Tray clamp mount' }),
      record({ title: 'Close-up camera', summary: 'measures the CLAMP pose' }),
      record({ title: 'Vane array driver' }),
    ]
    const kept = rp.filterRecords(records, 'clamp')
    expect(kept.map((r) => r.title)).toEqual(['Tray clamp mount', 'Close-up camera'])
  })

  it('returns everything for an empty or blank query rather than nothing', () => {
    const records = [record(), record()]
    expect(rp.filterRecords(records, '')).toHaveLength(2)
    expect(rp.filterRecords(records, '   ')).toHaveLength(2)
  })
})

describe('groupByFamily', () => {
  it('returns the five families in the order KIND_FAMILIES declares, always all five', () => {
    const { families } = rp.groupByFamily([record({ kind: 'task' })])
    expect(families.map((f) => f.family)).toEqual(Object.keys(KIND_FAMILIES))
  })

  it('files every record under the family its kind belongs to', () => {
    const { families } = rp.groupByFamily([
      record({ kind: 'task', title: 'a task' }),
      record({ kind: 'module', title: 'a module' }),
      record({ kind: 'claim', title: 'a claim' }),
    ])
    const of = (name: string) => families.find((f) => f.family === name)?.records.map((r) => r.title)
    expect(of('work')).toEqual(['a task'])
    expect(of('structure')).toEqual(['a module'])
    expect(of('findings')).toEqual(['a claim'])
  })

  it('KEEPS a family with nothing in it, and names every kind in it with a zero', () => {
    // The old page dropped its empty groups, so a reader could not tell "I have recorded no
    // purchases" from "this product has no notion of a purchase".
    const { families } = rp.groupByFamily([record({ kind: 'idea' })])
    const work = families.find((f) => f.family === 'work')
    expect(work?.records).toHaveLength(0)
    expect(work?.kinds.map((k) => k.kind)).toEqual([...KIND_FAMILIES.work.kinds])
    expect(work?.kinds.every((k) => k.count === 0)).toBe(true)
  })

  it('orders a family newest first, so it reads as what has moved lately', () => {
    const { families } = rp.groupByFamily([
      record({ kind: 'task', title: 'older', updatedAt: '2026-08-01 09:00:00' }),
      record({ kind: 'problem', title: 'newer', updatedAt: '2026-08-06 09:00:00' }),
    ])
    expect(families.find((f) => f.family === 'work')?.records.map((r) => r.title)).toEqual([
      'newer',
      'older',
    ])
  })

  it('lists a kind that is not in the contract instead of dropping it, and says which problem it is', () => {
    const stray = record({ kind: 'gadget' as PanelRecord['kind'], title: 'Something odd' })
    const { unfiled } = rp.groupByFamily([record({ kind: 'module' }), stray])
    expect(unfiled.map((u) => u.record.title)).toEqual(['Something odd'])
    expect(unfiled[0]?.problem).toBe('This record has an unrecognised kind.')
  })
})

describe('every kind reaches a family, so nothing can silently fall off the page', () => {
  it('files every kind the contract declares, however many that is', () => {
    const { families, unfiled } = rp.groupByFamily(RECORD_KINDS.map((kind) => record({ kind })))
    // `message` IS NOT UNFILED AND IS NOT IN A FAMILY. Criterion E1 took it out of `notes` on
    // 15 September 2026 and it is read on `#/messages`; `KINDS_READ_ON_THEIR_OWN_PAGE` stops this
    // page from reporting it as a gap. So it is the one declared kind the families do not hold, and
    // that absence is asserted rather than left as a count that happens to be one short.
    // `role_card` IS THE SECOND SINCE 1 OCTOBER 2026: item 3 of a decision made a role card
    // a kind of its own and not a report, read on the Role cards page at `#/roles`. So the
    // count is two short, and both absences are named.
    // `role_request` IS THE THIRD SINCE 4 NOVEMBER 2026: an agent asking to come in, or for a card or a new key, is
    // read on the Embassy at `#/embassy`. So the count is three short.
    // `quick_note` IS THE FOURTH SINCE 14 NOVEMBER 2026: a note the person writes and draws in is not a report, and it
    // is read on its own note page at `#/quick-note`. So the count is four short.
    expect(unfiled).toEqual([])
    const filed = families.reduce((n, f) => n + f.records.length, 0)
    expect(filed).toBe(RECORD_KINDS.length - 4)
    expect(RECORD_KINDS).toContain('message')
    expect(RECORD_KINDS).toContain('role_card')
    expect(RECORD_KINDS).toContain('role_request')
    expect(RECORD_KINDS).toContain('quick_note')
    const filedKinds = families.flatMap((f) => f.records.map((r) => r.kind))
    expect(filedKinds).not.toContain('message')
    expect(filedKinds).not.toContain('role_card')
    expect(filedKinds).not.toContain('role_request')
    expect(filedKinds).not.toContain('quick_note')
  })
})

// ============================================================================ the records list

describe('RecordResults', () => {
  const results = (records: RecordListItem[], kind: '' | PanelRecord['kind'] = '', query = '', now?: number) =>
    body(
      h(rp.RecordResults, {
        records,
        kind,
        query,
        onClearKind: noop,
        onClearQuery: noop,
        onNew: noop,
        ...(now === undefined ? {} : { now }),
      }),
    )

  it('draws every record title as a link that is underlined at rest', () => {
    const html = results([record({ id: 'abc', title: 'Tray clamp mount' })])
    // px-nav is the class that carries the resting underline. A title without it would only
    // look clickable on hover, which on a phone means never.
    //
    // THE ATTRIBUTES AFTER THE ADDRESS ARE LET THROUGH, ADDED 18 AUGUST 2026. The link also carries
    // `data-talk-field`, which is how a comment on a few of these words says which stored string to
    // look them up in. What this test is about is the class and the address, so it reads those and
    // stops naming everything else the element may hold.
    expect(html).toMatch(/<a class="px-nav rec-cell-title" href="#\/r\/abc"[^>]*>Tray clamp mount<\/a>/)
  })

  it('gives the table one sortable head per column, and says which one it is sorted by', () => {
    const html = results([record({ title: 'Tray clamp mount' })])
    // `columnsFor` and not CATALOGUE_COLUMNS: the id column is Developer-only, and these renders
    // are in Normal mode. Reading the same function the table reads is what stops this test
    // pinning a set of columns the page no longer draws.
    for (const column of rp.columnsFor('normal')) expect(html, column).toContain('data-col="' + column + '"')
    // It opens on the newest write, and the head says so to a screen reader as well as visually.
    expect(html).toContain('aria-sort="descending"')
  })

  it('still says in NORMAL mode that a record is made up or incomplete, on its row', () => {
    // CRITERION CHANGE, wave 13j round 12, in report n9Mjk3c_sJRu block b-17.
    // It said the Source and Missing COLUMNS are drawn in normal mode. Normal mode now draws four
    // columns, Title, Kind, State and Updated, and the two marks move to the title line, so a
    // made-up or incomplete record is still marked on its row. The two columns are developer mode's.
    const html = results([record({ id: 'abc123', kind: 'claim', origin: 'fixture', incompleteCount: 3 })])
    expect(html).toContain('data-origin="fixture"')
    expect(html).toContain('px-inc-mark')
  })

  it('keeps catalogue ids in the developer view', () => {
    const row = record({ id: 'Vb7Qk2Ln9Xz1', kind: 'claim' })
    const normal = results([row])
    expect(normal).not.toContain('data-col="id"')
    expect(normal).not.toContain('>Vb7Qk2Ln9Xz1</code>')

    mode.setMode('inspect')
    try {
      const developer = results([row])
      expect(developer).toContain('data-col="id"')
      expect(developer).toContain('>Vb7Qk2Ln9Xz1</code>')
    } finally {
      mode.setMode('normal')
    }
  })

  it('draws the five families as facets carrying their own counts, not as five headings', () => {
    const rows = [record({ kind: 'claim' }), record({ kind: 'task' })]
    const html = body(
      h(rp.RecordResults, {
        records: rows,
        kind: '' as const,
        query: '',
        onClearKind: noop,
        onClearQuery: noop,
        onNew: noop,
        facets: rp.groupByFamily(rows).families,
        onFacet: noop,
      }),
    )
    for (const family of Object.values(KIND_FAMILIES)) expect(html).toContain(family.label)
    // A facet is a control, not a caption: it is pressable and it says whether it is pressed.
    expect(html).toContain('aria-pressed')
    // Every family keeps its count INCLUDING the ones holding nothing — dropping a zero leaves a
    // reader unable to tell "I have recorded no purchases" from "there is no such thing". The
    // extra one is "Every family", which is the denominator all five are read against.
    expect((html.match(/class="rec-facet-n num"/g) ?? []).length).toBe(Object.keys(KIND_FAMILIES).length + 1)
  })

  it('shows a record’s stored state word, drawn by what the shared table says it means', () => {
    const html = results([record({ kind: 'problem', data: { state: 'open' } })])
    expect(html).toContain('open')
    // `stopped_short` is what `progressOf` says "open" means, and it is what inks the chip.
    expect(html).toContain('data-progress="stopped_short"')
  })

  it('draws every row at one strength, because a table is read by comparing rows', () => {
    // THE LISTS FADE AND THIS DOES NOT, and the difference is deliberate rather than an oversight.
    // On #/work an old stop recedes so that today's is the loud one, which is right for a page read
    // to decide what to do next. The catalogue is read to COMPARE — the same eight facts about
    // every record, sorted — and a column of dates drawn at four different strengths is a column
    // nobody can scan. The age is in the Updated column, in words, and it is what that column sorts
    // on, so nothing about it is lost.
    const now = Date.parse('2026-08-09T12:00:00')
    const fresh = results([record({ kind: 'problem', data: { state: 'open' }, updatedAt: '2026-08-09 08:00:00' })], '', '', now)
    const old = results([record({ kind: 'problem', data: { state: 'open' }, updatedAt: '2026-06-20 08:00:00' })], '', '', now)
    expect(fresh).not.toContain('data-alarm=')
    expect(old).not.toContain('data-alarm=')
    // The stored word is unchanged at both ends, and it still carries its classification.
    expect(old).toContain('open')
    expect(old).toContain('data-progress="stopped_short"')
  })

  it('never shouts on this page, because it cannot see a consequence or a date', () => {
    // `urgent` means somebody could be hurt or a date somebody agreed has passed. This list has
    // neither fact in hand, and inventing one to shout with is the silent default this product
    // bans. What is genuinely urgent is ranked on Today, which does have them.
    const now = Date.parse('2026-08-09T12:00:00')
    for (const state of ['open', 'blocked', 'failed', 'crashed', 'orphaned']) {
      const html = results([record({ kind: 'problem', data: { state }, updatedAt: '2026-08-09 11:59:00' })], '', '', now)
      expect(html, state).not.toContain('data-alarm="urgent"')
    }
  })

  it('draws an unclassified word as a question and explains its stored value in developer mode', async () => {
    const rows = [record({ kind: 'purchase', data: { state: 'chasing' } })]
    const html = results(rows)
    expect(html).toContain('chasing')
    expect(html).toContain('data-progress="unclassified"')
    const mode = await import('../src/web/lib/mode.ts')
    mode.setMode('inspect')
    try {
      expect(results(rows)).toContain(unclassifiedNote('chasing').replaceAll('"', '&quot;'))
    } finally {
      mode.setMode('normal')
    }
  })

  it('tells the three different nothings apart when a record has no state word', () => {
    // A kind that declares a state and never had one written.
    expect(results([record({ kind: 'session', data: {} })])).toContain('No state written')
    // A kind with no state field at all. That is an answer, not a gap, so it is the short mark with
    // its reason on hover (rule R4 of report n9Mjk3c_sJRu). CRITERION CHANGE, wave 13j round 12: it
    // was the words "No state field" on the row.
    const noField = /<td data-col="state"[^>]*>([\s\S]*?)<\/td>/.exec(results([record({ kind: 'note', data: {} })]))?.[1] ?? ''
    expect(noField).toContain('class="px-absent"')
    expect(noField).toContain('title="Records of this kind have no state field, so there is no word to read. This is an answer, not a gap."')
    expect(noField.replace(/<span class="px-sr">[\s\S]*?<\/span>/g, '')).not.toContain('No state field')
  })

  it('draws the incomplete count the server sends on every row', () => {
    const html = results([record({ kind: 'obligation', incompleteCount: 2 })])
    expect(html).toContain('2')
    expect(html).toContain('px-inc-mark')
  })

  it('labels both dates by their column head, so neither reads as an obligation’s due date', () => {
    // CRITERION CHANGE, wave 13j round 12: Created is a developer-mode column now (normal mode draws
    // Title, Kind, State and Updated), so normal mode is read for Updated and developer mode for both.
    const html = results([record({ kind: 'obligation' })])
    expect(html).toContain('Updated')
    expect(html).not.toContain('data-col="created"')
    // On a phone the table becomes one card per record, and each cell carries its own label.
    // Neither width leaves a bare date on a row about a promise.
    expect(html).toContain('data-label="Updated"')
    mode.setMode('inspect')
    try {
      const developer = results([record({ kind: 'obligation' })])
      expect(developer).toContain('data-label="Updated"')
      expect(developer).toContain('data-label="Created"')
    } finally {
      mode.setMode('normal')
    }
  })

  it('labels a phone card with the SAME string the column head uses', () => {
    // Two places that must agree, with nothing making them agree. The eight card labels were
    // written out by hand beside the eight heads: renaming the origin column to "Source" changed
    // the desk and left the phone saying "Origin", with no type error and nothing failing.
    const html = results([record({ kind: 'note' })])
    for (const column of rp.columnsFor('normal')) {
      const head = rp.COLUMN_WORDS[column].head
      expect(html, `${column} head`).toContain(`>${head}<`)
      expect(html, `${column} card label`).toContain(`data-label="${head}"`)
    }
  })

  it('tells an empty project apart from an empty kind filter', () => {
    // IT SAYS THE PROJECT, NOT THE PRODUCT. This used to read "Mole Office is empty", which is a claim
    // about every project at once made by a page that fetched one of them — the same mistake, one
    // level up, as the family-page bug this file's neighbour pins.
    const empty = results([], '')
    expect(empty).toContain('class=\"px-absent\"')
    expect(empty).not.toContain('Mole Office is empty')

    const noneOfThatKind = results([], 'purchase')
    expect(noneOfThatKind).toContain('class=\"px-absent\"')
    expect(noneOfThatKind).toContain('Show every kind')
  })

  it('blames the search, not the database, when a search finds nothing', () => {
    // THE SERVER RETURNS WHAT MATCHED, so a search that finds nothing hands this page an EMPTY
    // list — which used to be the "nothing has been recorded" case. Answering that to somebody who
    // typed a word that is not here would be a straight lie about the corpus, and it is the branch
    // this change had to add rather than move.
    const html = results([], '', 'velodyne')
    expect(html).toContain('class=\"px-absent\"')
    expect(html).toContain('Clear the search')
    // And it says what WAS read, so the reader can tell "not in this project" from "not searched".
    // One sentence with one verb: "Files a record points at were not." was a fragment — were not
    // what. Finding 18 of the language audit, 19 August 2026.
    expect(html).not.toContain('were searched; files a record points at were not')
    expect(html).not.toContain('Nothing has been recorded in this project yet')
  })

  it('still says the project is empty when it is, and no search is running', () => {
    const html = results([], '', '')
    expect(html).toContain('class=\"px-absent\"')
    expect(html).not.toContain('Nothing here says')
  })

  it('lists a record of an unknown kind in an alarm panel instead of dropping it', () => {
    const html = results([record({ kind: 'gadget' as PanelRecord['kind'], title: 'Odd one' })])
    expect(html).toContain('Odd one')
    expect(html).toContain('cannot file')
    // The unrecognised value itself, quoted, in BOTH modes — words.ts's third rule. What left this
    // sentence is the list of all sixteen STORED kinds that used to follow it, which put
    // `wanna_try` on a Normal screen inside an alarm panel.
    expect(html).toContain('This record has an unrecognised kind.')
    expect(html).not.toContain('wanna_try')
    // data-rank="0" is the library's alarm panel: tinted, spined and heavier.
    expect(html).toContain('data-rank="0"')
  })

  it('folds nothing at all, because the whole count is what this page is for', () => {
    // THE CATALOGUE IS THE ONE PAGE WITH NO FOLD. Its sentence of arithmetic — "151 records
    // fetched. Deleted records are never in this list." — is only true if every one of them is on
    // the screen, and a fold would turn it into a claim about a list the reader cannot see. The
    // family pages fold, and every one of their folds states its exact count.
    const many = Array.from({ length: 40 }, (_, i) =>
      record({ kind: i % 2 === 0 ? 'task' : 'problem', title: `work ${i}` }),
    )
    const html = results(many)
    expect(html).not.toContain('Show all')
    for (let i = 0; i < 40; i += 1) expect(html, `work ${i}`).toContain(`work ${i}`)
  })
})

// ============================================================================ sorting the catalogue

/**
 * SORTING IS A PURE FUNCTION AND IS DRIVEN DIRECTLY, because a press has no DOM here to happen in.
 *
 * What is worth pinning is not that a column sorts. It is that every column sorts on the value it
 * SHOWS, and that two rows which tie do not swap places between two draws — a table that reorders
 * itself under a reader for reasons nobody can point at is a table they stop trusting, and that is
 * exactly what a comparator with no final tie-break does to 49 rows of one kind.
 */
describe('the catalogue sorts on what each column shows, and never ties at random', () => {
  const rows = () => [
    record({ id: 'b', kind: 'task', title: 'Zebra', updatedAt: '2026-08-01 09:00:00', incompleteCount: 5 }),
    record({ id: 'a', kind: 'task', title: 'apple', updatedAt: '2026-08-09 09:00:00', incompleteCount: 0 }),
    record({ id: 'c', kind: 'claim', title: 'Middle', updatedAt: '2026-08-05 09:00:00', incompleteCount: 2 }),
  ]

  it('opens each column the useful way round: newest first for a date, A to Z for a word', () => {
    // A column whose first press produces the least useful order is one people press twice, every
    // time. `nextSort` is where that decision lives, so it is asserted rather than assumed.
    expect(rp.nextSort({ column: 'title', direction: 'asc' }, 'updated').direction).toBe('desc')
    expect(rp.nextSort({ column: 'updated', direction: 'desc' }, 'title').direction).toBe('asc')
    expect(rp.nextSort({ column: 'title', direction: 'asc' }, 'incomplete').direction).toBe('desc')
  })

  it('turns a second press on the same column round, and does not wander to another column', () => {
    expect(rp.nextSort({ column: 'title', direction: 'asc' }, 'title')).toEqual({ column: 'title', direction: 'desc' })
    expect(rp.nextSort({ column: 'title', direction: 'desc' }, 'title')).toEqual({ column: 'title', direction: 'asc' })
  })

  it('sorts titles case-insensitively, so "apple" is not filed under the punctuation', () => {
    expect(rp.sortRecords(rows(), 'title', 'asc').map((r) => r.title)).toEqual(['apple', 'Middle', 'Zebra'])
  })

  it('sorts the missing-field count as a number rather than as text', () => {
    // "10" sorts before "5" as text, which is the classic way a count column lies.
    const many = [record({ id: 'x', incompleteCount: 10 }), record({ id: 'y', incompleteCount: 5 })]
    expect(rp.sortRecords(many, 'incomplete', 'desc').map((r) => r.incompleteCount)).toEqual([10, 5])
  })

  it('breaks a tie on the id, in BOTH directions, so the order cannot change between two draws', () => {
    const tied = [record({ id: 'z', kind: 'task' }), record({ id: 'a', kind: 'task' }), record({ id: 'm', kind: 'task' })]
    expect(rp.sortRecords(tied, 'kind', 'asc').map((r) => r.id)).toEqual(['a', 'm', 'z'])
    expect(rp.sortRecords(tied, 'kind', 'desc').map((r) => r.id)).toEqual(['a', 'm', 'z'])
  })

  it('files every record with no state word together rather than scattering them by kind', () => {
    const mixed = [
      record({ id: '1', kind: 'note', data: {} }),
      record({ id: '2', kind: 'problem', data: { state: 'open' } }),
      record({ id: '3', kind: 'message', data: {} }),
    ]
    expect(rp.sortRecords(mixed, 'state', 'asc').map((r) => r.id)).toEqual(['1', '3', '2'])
  })

  it('never loses or duplicates a row, whichever column it is asked for', () => {
    for (const column of rp.CATALOGUE_COLUMNS) {
      const out = rp.sortRecords(rows(), column, 'asc')
      expect(new Set(out.map((r) => r.id)), column).toEqual(new Set(['a', 'b', 'c']))
      expect(out.length, column).toBe(3)
    }
  })
})

// ============================================================ what a row costs, and what it keeps

/**
 * A CATALOGUE ROW IS A ROW OF A TABLE, NOT A SMALL RECORD PAGE.
 *
 * It carries the eight comparable facts and nothing else: kind, state, title, when it was written,
 * when it was created, how much of it is unfilled, how it got here, and its id. The whole summary
 * is under the title — not cut, not clamped — because on a table the reader is choosing which row
 * to open and the summary is what tells two similar titles apart.
 *
 * WHAT IS PINNED HERE AND WHY IT NEEDS A TEST AT ALL: the table must never make the PAGE scroll
 * sideways. `docs/UX-CONTRACT.md` forbids it at 1440 and at 390, and eight columns cannot fit a
 * phone — so the wrapper scrolls rather than the body, and at 64rem of table or less it stops being a
 * table altogether and becomes one card per record with every cell labelled. Both halves of that
 * are checked against each other here: the `data-label` the cell renders and the rule that draws it.
 * Whether Chromium really lays it out that way is a screenshot question and was answered that way.
 */
describe('the catalogue row keeps every fact, and cannot make the page scroll sideways', () => {
  const LONG =
    'The same 200 reach targets in Isaac and on the real arm, then compared. Two branches that do ' +
    'not wait on each other and rejoin at step 10, which is the shape the twin was built to check.'

  it('keeps the whole summary in the markup, uncut', () => {
    const html = body(
      h(rp.RecordResults, {
        records: [record({ id: 'abc', kind: 'pipeline', title: 'Model-to-bench growth check', summary: LONG })],
        kind: '' as const,
        query: '',
        onClearKind: noop,
        onClearQuery: noop,
        onNew: noop,
      }),
    )
    // Nothing is shortened on the way to the browser: find-in-page and a screen reader still reach
    // the end of the sentence. A server-side cut would be a truncation with no count beside it.
    expect(html).toContain('which is the shape the twin was built to check')
    expect(html).toContain('class="rec-cell-summary"')
  })

  it('scrolls the wrapper and never the body, and collapses to cards before a phone reaches it', () => {
    // The page renders its <style> itself, so the rule and the markup are checked against each
    // other rather than against a copy of the rule typed into this file.
    const page = renderToStaticMarkup(h(rp.RecordsPage))
    const css = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '').join('\n')
    expect(css).toMatch(/\.rec-tablewrap\s*\{[^}]*overflow-x:\s*auto/)
    // When the table has 64rem or less there is no table left to scroll: every cell becomes a
    // labelled line. It asks the table's own width, so an open sidebar counts.
    expect(css).toMatch(/\.rec-tablewrap\s*\{[^}]*container-name:\s*rectable/)
    expect(css).toContain('@container rectable (max-width: 64rem)')
    expect(css).toMatch(/content:\s*attr\(data-label\)/)
    const rows = body(
      h(rp.RecordResults, {
        records: [record({ kind: 'obligation' })],
        kind: '' as const,
        query: '',
        onClearKind: noop,
        onClearQuery: noop,
        onNew: noop,
      }),
    )
    // The other half of the pairing: a rule reading `data-label` off cells that do not carry one
    // would draw eight blank labels, and nothing would fail.
    for (const column of rp.columnsFor('normal')) expect(rows, column).toMatch(new RegExp(`data-col="${column}" data-label="`))
  })

  it('still says both of the things a row may never hide about a record', () => {
    const html = body(
      h(rp.RecordResults, {
        records: [
          record({ id: 'abc', kind: 'obligation', origin: 'fixture', incompleteCount: 2, summary: LONG }),
        ],
        kind: '' as const,
        query: '',
        onClearKind: noop,
        onClearQuery: noop,
        onNew: noop,
      }),
    )
    // Generated content, said on the row where it appears — decision 17, and USER.md invariant 3.
    expect(html.toLowerCase()).toContain('fixture')
    // And how much of the record is not filled in, with the count the server sent.
    expect(html).toContain('px-inc-mark')
    expect(html).toContain('2')
  })
})

// ============================================================ the navigation contract

/**
 * ONE RECORD, ONE ADDRESS, FROM EVERY SURFACE THAT OFFERS A WAY TO IT.
 *
 * A record page is reached from six places — the records list, both query lists, the ranked list on
 * Home, the link panel on a record, and the graph's reading layer — and each of them writes its own
 * anchor. Nothing made them agree: every one of them says `#${recordPath(id)}` today because six
 * authors each typed the same expression, which is this repository's recurring defect standing
 * upright and not yet fallen over. The test below is what makes them agree: it renders the same
 * record on all six surfaces and fails if any one of them produces a different address.
 *
 * FIVE SINCE WAVE 13K'S ROUND 19, which removed the ranked list on Home, as item 6 of a decision
 * says. The rows that list drew, and its entry below, went with it. Mutation: make the link
 * panel write its address as `#/r/` and the id by hand, and the address checks go red for the link panel.
 *
 * IT IS RUN TWICE, and the second run is the one that would catch a hand-written link. An id
 * carrying a space, a slash or a hash is unchanged by string interpolation and encoded by
 * `recordPath`, so `#/r/${id}` and `#${recordPath(id)}` are the same string for `rec-1` and two
 * different addresses for `重印/v3` — and only one of them survives the round trip back through
 * `parseRoute`.
 *
 * WHAT THIS DOES NOT REACH, said here rather than left to look like coverage: the graph's CANVAS.
 * A card title there is a `<button>` calling `navigate(recordPath(id))`, so it writes no anchor for
 * these assertions to read, and Canvas.tsx cannot be loaded in this runner at all — it needs a DOM,
 * which is stated in its own header and is why tests/graph-projection.test.ts checks its wiring by
 * reading the source. The graph surface below is the READING layer, which is the composition a
 * phone gets and the one that writes anchors.
 *
 * CHANGED OPENLY IN THE COMMIT THAT GIVES A REPORT ITS OWN ADDRESS (criterion E2): `recordPath` now takes the
 * record's KIND as its second parameter, and a surface
 * that holds the record passes it, so the six surfaces build the kind's word from one place instead
 * of each writing a generic address. A fixture kind with no page of its own — `problem` — produces
 * the same address it always did, which is what the two tests below had pinned, so they keep their
 * sense unchanged. The test added under the six asserts the report's own word: the surfaces that
 * hold the record — the graph is only the reading layer of structure, where a report's wall carries
 * no kind and keeps the generic address — build `#/report/<id>` together.
 */
describe('the same record arrives at the same address from every surface that links to it', () => {
  const NOW = Date.parse('2026-08-09T12:00:00')
  const STAMP = '2026-08-06 09:00:00'

  /**
   * Every record address in a fragment of markup, deduplicated, in the order they appear.
   *
   * WAS `#/r/…` ONLY; criterion E2 gave a report the address `#/report/<id>`, then a message the
   * address `#/message/<id>`, a problem the address `#/problem/<id>`, and a
   * run the address `#/session/<id>`, and the surfaces now build each, so a record page's first
   * segment is the record kinds with their own word — `r`, `report`, `message`, `problem` and
   * `session` — and anything else a surface links (`#/who/...`,
   * `#/missing`) is not a record address and must not be counted here, or a list that also links
   * elsewhere would claim two addresses.
   */
  function addresses(html: string): string[] {
    return [...new Set([...html.matchAll(/href="(#\/(?:r|report|message|problem|session)\/[^"]*)"/g)].map((m) => m[1] ?? ''))]
  }

  /**
   * The fixture record. ITS DEFAULT KIND IS ONE WITH NO WORD OF ITS OWN IN THE ADDRESS — `task` —
   * because this file's first check is about the ENCODING and the generic address, and a kind with
   * its own address (`report`, `message`, `problem`) would make that check about the kind instead.
   * The kind is passed explicitly where a kind's own address is what is being tested.
   */
  function panelRecord(id: string, kind: RecordKind = 'task'): PanelRecord {
    return {
      id,
      kind,
      workspaceId: 'default',
      ownerId: THE_TEST_OFFICES_OWNER.id,
      title: 'The E-stop path in the demo launcher is a no-op',
      summary: 'The button is wired and the callback body does nothing.',
      data: { state: 'open' },
      createdAt: STAMP,
      updatedAt: STAMP,
      deletedAt: null,
    }
  }

  /** The records list. */
  const fromRecords = (id: string, kind: RecordKind = 'task') =>
    body(
      h(rp.RecordResults, {
        records: [record({ ...panelRecord(id, kind), incompleteCount: 0 })],
        kind: '' as const,
        query: '',
        onClearKind: noop,
        onClearQuery: noop,
        onNew: noop,
        now: NOW,
      }),
    )

  /** Both query lists. */
  const fromUnconsumed = (id: string, kind: RecordKind = 'task') => body(h(qp.UnconsumedPanel, { records: [panelRecord(id, kind)] }))
  const fromUnmet = (id: string, kind: RecordKind = 'task') =>
    body(h(qp.UnmetPanel, { items: [{ consumer: panelRecord(id, kind), missingTitle: 'a deleted claim' }] }))

  /** The link panel on some other record, pointing at this one. */
  const fromLinkPanel = (id: string, kind?: RecordKind) =>
    body(
      h(lp.LinkPanel, {
        declares: SEE_THROUGH,
        // THE KIND THE PANEL NAMES ITS HEADING FROM. `Links` is declared once, on the section.
        kind: 'report' as const,
        recordId: 'the-record-being-read',
        links: [
          {
            linkId: 'l1',
            type: 'consumes' as const,
            label: 'consumes',
            isBacklink: false,
            inferred: false,
            other: { id, kind: kind ?? 'task', title: 'The E-stop path', summary: null },
            broken: false,
            gate: null,
            gateLabel: null,
            gateProblem: null,
            gateStage: null,
          },
        ],
        knownTitles: [],
        editable: false,
        onChanged: noop,
      }),
    )

  /** The graph's reading layer, which is handed the complete graph and prints every node. */
  function fromGraph(id: string): string {
    const graph = gm.buildStructureGraph({
      records: [{ ...panelRecord(id), kind: 'module', data: { context: 'why', parts: [] } }],
      links: [] as readonly GraphLink[],
      attention: { visible: [], remainder: [], total: 0 } as never,
      scope: { at: 'modules' },
      now: NOW,
    })
    return body(h(outline.Outline, { graph }))
  }

  const SURFACES: readonly { name: string; render: (id: string, kind?: RecordKind) => string }[] = [
    { name: 'the records list', render: fromRecords },
    { name: 'the unconsumed query', render: fromUnconsumed },
    { name: 'the unmet query', render: fromUnmet },
    { name: 'a link panel', render: fromLinkPanel },
    { name: 'the graph', render: fromGraph },
  ]

  it('writes one address per surface, and it is the address the router builds', () => {
    const id = 'NS6wp_rmduzo'
    for (const surface of SURFACES) {
      expect(addresses(surface.render(id)), surface.name).toEqual([`#${recordPath(id)}`])
    }
  })

  /**
   * THE OTHER HALF OF THE CONTRACT, AND THE DEFECT THIS PASS FIXED.
   *
   * An address is a contract with two ends: what the surfaces build, and what the router accepts.
   * The record address was the only one in the app whose second end had no rule. Two symptoms, both
   * reproduced below before the fix:
   *
   *   "#/r/abc/extra"  opened record abc. Every other address in this app sends a typo to the
   *                    not-found page — "#/records/extra" and "#/pipeline/a/b" are both checked in
   *                    tests/app-routes.test.ts — so one record had unlimited addresses and a link
   *                    with junk on the end went on working.
   *   "#/r/%E4%B8"     THREW a URIError out of parseRoute. It is called from a useState initialiser
   *                    and from the hashchange handler and the shell has no error boundary, so a
   *                    truncated escape — what a wrapped chat message does to a link — was a blank
   *                    page on load, or an address bar that moved while the page did not.
   */
  it('refuses an address with junk after the id instead of opening the record anyway', () => {
    expect(parseRoute('#/r/abc/extra')).toEqual({ name: 'unknown', path: '/r/abc/extra' })
    // A trailing slash is not junk: the segment filter drops the empty piece, exactly as it does
    // for "#/records/" and "#/pipeline/".
    expect(parseRoute('#/r/abc/')).toEqual({ name: 'record', id: 'abc' })
  })

  it('answers a malformed id with the not-found page rather than by throwing out of the router', () => {
    for (const bad of ['#/r/%E4%B8', '#/r/%zz', '#/pipeline/%E4%B8']) {
      // The assertion is the shape of the answer; that it does not throw is what would have failed
      // before, and vitest reports a throw here as the failure it is.
      expect(parseRoute(bad).name, bad).toBe('unknown')
    }
  })

  it('encodes an id the same way everywhere, so a stray hand-written link cannot pass', () => {
    // Ids in this workspace are opaque and one kind of them already carries a colon — a session
    // that was never filed is written down as `claude-code:6af5…`. A title-shaped id is not
    // hypothetical either: `#/r/重印/v3` reads as a record called 重印 with junk after it.
    for (const id of ['a b', '重印/v3', 'x#y', 'claude-code:6af5']) {
      const want = `#${recordPath(id)}`
      for (const surface of SURFACES) {
        expect(addresses(surface.render(id)), `${surface.name} with id "${id}"`).toEqual([want])
      }
      // And the address every surface agreed on reads back as the record it was built from.
      expect(parseRoute(want)).toEqual({ name: 'record', id })
    }
  })

  /**
   * THE KIND'S OWN WORD, APPLIED ACROSS THE SURFACES THAT HOLD THE RECORD. Criterion E2.
   *
   * A report is the kind the decision names: a press on it from a list opens `#/report/<id>`, the
   * same record page with the kind's word in front of it. Every surface here holds the record with
   * its kind, so the surfaces agree. ONE SURFACE IS SKIPPED HERE, and saying which is the reason
   * rather than the silence it would read as otherwise:
   *
   *   the graph   — the reading layer draws structure, and the one record it names without a kind
   *                 in its model is a wall, so its address stays the generic one. That is what "a
   *                 caller that holds only an id keeps #/r/<id>" means, not a fixture pretending.
   *
   * The ranked list on Home was skipped here too, until wave 13k's round 19 removed it, as item 6 of a decision
   * says.
   */
  it('builds a report at its own word from every surface that holds the record', () => {
    const id = 'NS6wp_rmduzo'
    const want = `#${recordPath(id, 'report')}`
    expect(want).toBe(`#/report/${id}`)
    for (const surface of SURFACES.filter(
      (one) => one.name !== 'the graph',
    )) {
      expect(addresses(surface.render(id, 'report')), surface.name).toEqual([want])
    }
    // And the address reads back as the record it names, with the kind in it, so the rail can mark
    // the row the report belongs to from the address alone.
    expect(parseRoute(want)).toEqual({ name: 'record', id, kind: 'report' })
  })

  /**
   * THE KIND WITH A PAGE OF ITS OWN, APPLIED ACROSS THE SURFACES THAT HOLD THE RECORD. Criterion E2
   * .
   *
   * A message is the second kind the decision names. It is the one place this differs from the
   * report above: `#/message/<id>` is a route of its own and not a record route carrying a kind,
   * so the parser's answer is checked for its own name, not for `record`. Every list that holds the
   * record passes its kind, so every one of them builds the message's own address, and a caller
   * that holds only the id keeps `#/r/<id>`, which the record page still opens.
   */
  it('builds a message at its own address from every surface that holds the record', () => {
    const id = 'NS6wp_rmduzo'
    const want = `#${recordPath(id, 'message')}`
    expect(want).toBe(`#/message/${id}`)
    for (const surface of SURFACES.filter(
      (one) => one.name !== 'the graph',
    )) {
      expect(addresses(surface.render(id, 'message')), surface.name).toEqual([want])
    }
    // AND A CALLER THAT HOLDS ONLY AN ID KEEPS THE GENERIC ADDRESS, unchanged.
    expect(recordPath(id)).toBe(`/r/${id}`)
    expect(parseRoute(want)).toEqual({ name: 'message', id })
  })

  /**
   * THE THIRD KIND WITH A PAGE OF ITS OWN, APPLIED ACROSS THE SURFACES THAT HOLD THE RECORD.
   * Criterion E2.
   *
   * A problem is the third kind the decision names. The ranked list on Home was the one place it differed from the
   * message above, because a problem really was on that list; wave 13k's round 19 removed that list, as item 6 of a
   * decision says. So it is checked on the same surfaces as the others. The graph is still
   * skipped: it draws structure, and its one record named without a kind has no problem in its model, so its address
   * stays the generic one.
   */
  it('builds a problem at its own address from every surface that holds the record', () => {
    const id = 'NS6wp_rmduzo'
    const want = `#${recordPath(id, 'problem')}`
    expect(want).toBe(`#/problem/${id}`)
    for (const surface of SURFACES.filter((one) => one.name !== 'the graph')) {
      expect(addresses(surface.render(id, 'problem')), surface.name).toEqual([want])
    }
    // AND A CALLER THAT HOLDS ONLY AN ID KEEPS THE GENERIC ADDRESS, unchanged.
    expect(recordPath(id)).toBe(`/r/${id}`)
    expect(parseRoute(want)).toEqual({ name: 'problem', id })
  })

  /**
   * THE THIRD KIND THE DECISION NAMES, APPLIED ACROSS THE SURFACES. Criterion E2
   * .
   *
   * A run is the second kind whose page is a route of its own rather than a record route carrying a
   * kind, so the parser's answer is checked for its own name, not for `record`. Every list that
   * holds the record passes its kind, so every one of them builds the run's own address, and a
   * caller that holds only the id keeps `#/r/<id>`, which the record page still opens.
   */
  it('builds a run at its own address from every surface that holds the record', () => {
    const id = 'NS6wp_rmduzo'
    const want = `#${recordPath(id, 'session')}`
    expect(want).toBe(`#/session/${id}`)
    for (const surface of SURFACES.filter(
      (one) => one.name !== 'the graph',
    )) {
      expect(addresses(surface.render(id, 'session')), surface.name).toEqual([want])
    }
    // AND A CALLER THAT HOLDS ONLY AN ID KEEPS THE GENERIC ADDRESS, unchanged.
    expect(recordPath(id)).toBe(`/r/${id}`)
    expect(parseRoute(want)).toEqual({ name: 'session', id })
  })

  /**
   * THE KIND WITH A PAGE OF ITS OWN BY AN ADDRESS BUILT BEFORE THIS TABLE. Criterion E2 names
   * report; the pipeline, incident and citizen pages already existed and their addresses are built
   * by the same switch in recordPath, so a press on a list row reaches the page that record has.
   * Each of these is one address, the parser's own varchar branch accepts it, and the same page the
   * record previously opened is what fills the bell.
   */
  it('builds the kinds whose pages already exist through the same switch', () => {
    const id = 'NS6wp_rmduzo'
    expect(recordPath(id, 'pipeline')).toBe(`/pipeline/${id}`)
    expect(recordPath(id, 'incident')).toBe(`/incident/${id}`)
    expect(recordPath(id, 'agent')).toBe(`/who/agent/${id}`)
    for (const [kind, hash] of [
      ['pipeline', `#/pipeline/${id}`],
      ['incident', `#/incident/${id}`],
      ['agent', `#/who/agent/${id}`],
    ] as const) {
      expect(parseRoute(hash).name).toBe(kind === 'agent' ? 'who' : kind)
    }
    // A kind with no word of its own keeps the generic record address, which is still everything
    // it ever opened, exactly as a first read should expect.
    expect(recordPath(id, 'note')).toBe(`/r/${id}`)
  })
})

// ============================================================ how many kinds, how many link types

/**
 * A VOCABULARY SIZE TYPED INTO A SENTENCE IS A SECOND COPY OF AN ARRAY'S LENGTH.
 *
 * This page's own docstring said FOURTEEN, the component sheet says FOURTEEN, the sidebar says
 * FIFTEEN, and `RECORD_KINDS` holds sixteen. Nothing failed — not the type checker, not a test and
 * not the screen — because a sentence is never checked against an array. So the rule is not "the
 * number must be right": a right number drifts on the day a kind is added. The number may not be
 * typed at all.
 *
 * The list below is the files this pass owns. `ui.tsx` (the family note and the unknown-kind note)
 * and `Sidebar.tsx` (its docstring, `what:` and the modules line) carry the same defect and belong
 * on this list the moment their strings are derived.
 */
describe('a vocabulary size is counted, never typed out', () => {

  it('reads the number of link types off the table it is describing', () => {
    const total = Object.keys(LINK_TYPES).length
    const html = body(h(qp.QueriesPage))
    // The visible line: "…and the 13 types". It said eleven for as long as it took somebody to add
    // `resolves` and `about` to LINK_TYPES and not to notice this page.
    // The visible line ends "and all 13 of them". It said "types" — the schema's word — until
    // finding 29 of the language audit, 19 August 2026, and it may not say "kinds" either: that is
    // Mole Office's word for a record kind and the guard above rightly rejects it. It said eleven for as
    // long as it took somebody to add `resolves` and `about` to LINK_TYPES and not notice this
    // page, which is what counting rather than typing the number is for.
    expect(shownAtRest(html)).toContain(`and all ${total} of them`)
    // The paragraph behind it names four and counts the rest, and both halves come off the table.
    for (const named of ['consumes', 'produces', 'blocks', 'measures']) {
      expect(html).toContain(`<code>${named}</code>`)
    }
    expect(html).toContain(`and ${total - 4} more`)
  })
})

// ============================================================================ the query pages

/**
 * THE REASON IS THE PANEL'S LINE, NOT TWENTY COPIES OF IT.
 *
 * Every row on this list is here for the identical reason and the kind is already a tag on the same
 * row, so "— no `consumes` link points at this module" was the panel's own visible line printed
 * again once per row with one word changing. It has not gone anywhere: the assertions below check
 * that the row spends its line on what DIFFERS between rows, and that the rule is still read once,
 * above them, before anything is pressed.
 */
describe('unconsumedMeta', () => {
  it('is the record’s own summary, and nothing this list already said', () => {
    const meta = qp.unconsumedMeta(record({ kind: 'claim', summary: 'grip force is 12N' }))
    expect(meta).toBe('grip force is 12N')
  })

  it('says the summary is absent rather than leaving the line blank', () => {
    const html = renderToStaticMarkup(
      h('p', null, qp.unconsumedMeta(record({ kind: 'idea', summary: null }))),
    )
    expect(html).toContain('no one-line summary stored')
  })

  /**
   * THIS ASSERTION MOVED WITH THE LINE IT WAS ABOUT, AND THE RULE IT PINS DID NOT CHANGE.
   *
   * It used to read `shownAtRest(html)` for "No consumes link points at these", because that was the
   * panel's one visible line. That sentence is HOW THE QUERY IS IMPLEMENTED, and the density pass of
   * 2026-08-12 moved it behind the fold with the rest of `the question` — the visible line is now
   * the limit on the count and nothing else. The rule this test exists for is the other one and it
   * still holds exactly: the reason is stated ONCE for the whole list, and no row repeats it.
   */
  it('leaves the rule to the one place that states it, and no row repeats it', () => {
    const html = body(
      h(qp.UnconsumedPanel, {
        records: [
          record({ id: 'a', kind: 'claim', summary: 'grip force is 12N' }),
          record({ id: 'b', kind: 'module', summary: 'the gripper driver' }),
          record({ id: 'c', kind: 'idea', summary: 'try a softer pad' }),
        ],
      }),
    )
    // Stated for the list, in the notes, where it says what the check does. The visible line no
    // longer sets the stored link type in monospace — finding 29, 19 August 2026 — so the fold is
    // where the type is named, and this asserts the rule is stated once and not per row.
    expect(html).toContain('nothing else says it uses it')
    // AND NOT ONCE PER ROW, which is the whole rule. Three rows, and the rule appears in none of
    // them: each spends its line on what DIFFERS — its own summary.
    const rows = html.slice(html.indexOf('px-row-title'))
    expect(rows).not.toContain('consumes')
    for (const summary of ['grip force is 12N', 'the gripper driver', 'try a softer pad']) {
      expect(rows).toContain(summary)
    }
  })
})

describe('unmetMeta tells a deleted record apart from one that was never there', () => {
  it('names the deleted record, and leaves the way out to the panel’s own "what to do"', () => {
    const meta = qp.unmetMeta({ consumer: record(), missingTitle: 'grip force claim' })
    expect(meta).toContain('“grip force claim”')
    expect(meta).toContain('deleted')
    // The instruction is identical on every row, so it is not on any row. It is in the panel's
    // "what to do" note, where it is fuller and names the Restore button — checked below.
    expect(meta.toLowerCase()).not.toContain('restore')
    expect(body(h(qp.UnmetPanel, { items: [] }))).toContain(
      'Restore the missing record from the consumer',
    )
  })

  it('does not print "(unknown)" as if it were a title', () => {
    const meta = qp.unmetMeta({ consumer: record(), missingTitle: '(unknown)' })
    expect(meta).not.toContain('(unknown)')
    expect(meta).toContain('not in the database at all')
  })
})

describe('UnconsumedPanel', () => {
  it('explains the question, the stakes, the fix and the scope before any row', () => {
    const html = body(h(qp.UnconsumedPanel, { records: [] }))
    expect(html).toContain('the question')
    expect(html).toContain('why it matters')
    expect(html).toContain('what to do')
    expect(html).toContain('what it does not cover')
    // The scope is the sentence that stops "0" being read as "nothing is wrong anywhere".
    expect(html).toContain('claim')
    expect(html).toContain('module')
    expect(html).toContain('idea')
  })

  it('writes a designed empty state, not a blank region', () => {
    // WITH RECORDS OF THESE KINDS ON FILE, the sentence is a real answer and keeps its words. In a
    // project with nothing in it, it was drawn in bold as if it were good news about a corpus that
    // does not exist — finding 29, 19 August 2026 — so that case says "Nothing here yet." instead.
    const html = body(h(qp.UnconsumedPanel, { records: [], counted: 3 }))
    expect(html).toContain('something else does build on')
    expect(html).toContain('px-empty')

    const empty = body(h(qp.UnconsumedPanel, { records: [], counted: 0 }))
    expect(empty).toContain('Nothing here yet.')
    expect(empty).not.toContain('is consumed')
  })

  it('links each row, tags its kind, and spends the meta line on the record itself', () => {
    const html = body(
      h(qp.UnconsumedPanel, {
        records: [record({ id: 'zz', kind: 'claim', title: 'Grip force', summary: 'measured at 12N' })],
      }),
    )
    // The attributes are matched loosely, for the reason the comment below already gives about
    // the family channel: a row now also says which element holds what it is called, so a pattern
    // pinned to the exact attribute text fails on a change that alters nothing a person sees.
    expect(html).toMatch(/<a class="px-row-title px-nav"[^>]*href="#\/r\/zz"[^>]*>Grip force<\/a>/)
    // The kind is a tag on the row, which is why the reason clause did not need to name it again.
    // The tag carries the kind word and, before it, the glyph for the family that kind belongs to.
    // Matched as a pattern rather than as exact markup: the assertion is about what is DRAWN, and
    // pinning the attribute order made this test fail the day the family channel was added.
    expect(html).toMatch(/class="px-tag"[^>]*>(?:<svg[\s\S]*?<\/svg>)?claim</)
    expect(html).toContain('data-family="findings"')
    expect(html).toContain('measured at 12N')
  })
})

describe('UnmetPanel', () => {
  it('is a quiet panel with nothing in it and an alarm panel with something in it', () => {
    expect(body(h(qp.UnmetPanel, { items: [] }))).not.toContain('data-rank="0"')
    const withRow = body(
      h(qp.UnmetPanel, { items: [{ consumer: record({ title: 'Handover demo' }), missingTitle: 'grip force claim' }] }),
    )
    expect(withRow).toContain('data-rank="0"')
  })

  it('gives a broken row the broken state, as a word and not only a colour', () => {
    const html = body(
      h(qp.UnmetPanel, { items: [{ consumer: record({ id: 'q1', title: 'Handover demo' }), missingTitle: 'grip force claim' }] }),
    )
    expect(html).toContain('data-state="broken"')
    expect(html).toContain('Broken')
    expect(html).toMatch(/<a class="px-row-title px-nav"[^>]*href="#\/r\/q1"[^>]*>Handover demo<\/a>/)
  })

  it('states that only consumes links are checked, so an empty list is not an all-clear', () => {
    const html = body(h(qp.UnmetPanel, { items: [] }))
    expect(html).toContain('Nothing is waiting on a missing record')
    expect(html).toContain('consumes')
    expect(html).toContain('blocks')
  })
})

// ============================================================ two queries, two kinds of answer

/**
 * ONE SECOND, NO WORDS READ: WHICH OF THESE TWO IS A FAULT?
 *
 * Both panels hold rows about records, with the same header shape, the same count tag and the same
 * row shape. One of them says a dependency that used to resolve no longer does; the other asks a
 * question that is usually fine and is worth thinking about. Drawn at rank 0 and rank 1 those two
 * were an alarm and the ordinary panel every list in the product gets, differing by an edge.
 *
 * They are now the loudest and the quietest drawings a panel has. Nothing about either QUERY moved:
 * the same rows, the same counts, the same scope sentences, and the unmet panel is still quiet when
 * it is empty, because "no broken links" is not an alarm about anything.
 */
describe('a broken dependency and an open question are not drawn as the same kind of answer', () => {
  const unmetWithRows = () =>
    body(
      h(qp.UnmetPanel, {
        items: [{ consumer: record({ title: 'Run the rig_60mm wizard' }), missingTitle: 'grip force claim' }],
      }),
    )
  const unconsumedWithRows = () => body(h(qp.UnconsumedPanel, { records: [record({ kind: 'claim' })] }))

  it('draws the broken one at the alarm rank and the open question at the quiet one', () => {
    expect(unmetWithRows()).toContain('data-rank="0"')
    expect(unconsumedWithRows()).toContain('data-rank="2"')
    // The two ranks are the ends of the scale, not neighbours on it. A page where both were rank 1
    // and rank 0 is the page this replaced.
    expect(unconsumedWithRows()).not.toContain('data-rank="0"')
    expect(unmetWithRows()).not.toContain('data-rank="2"')
  })

  it('keeps every row, count and scope sentence on the quiet panel', () => {
    // Quieter is never "gone". This is the whole check that the rank change is a drawing and not a
    // deletion: the count, the split by kind, the visible rule and the row are all still here.
    const html = unconsumedWithRows()
    expect(html).toContain('1 record')
    expect(html).toContain('qp-kinds')
    // The visible line is the scope — which record kinds the count was taken over. It used to be
    // the scope with the query's implementation in front of it; the implementation is one press
    // away now, and what a count of 0 means is still readable without pressing anything.
    expect(shownAtRest(html)).toContain('Counted over')
    expect(html).toContain('px-row-title')
  })

  it('does not raise an alarm about an empty unmet list', () => {
    expect(body(h(qp.UnmetPanel, { items: [] }))).not.toContain('data-rank="0"')
  })
})

/**
 * WHICH QUESTION EACH SURFACE ANSWERS, DECLARED WHERE THE STYLESHEET READS IT.
 *
 * `surfaceEmphasis` is the one mechanism for this and both pages use it rather than restyling a
 * chip by hand — the state word means the same thing on Home, and only how loudly it is drawn is
 * the surface's business. Both of these lists are read to tell states apart, so both are
 * analytical; Home declares nothing and is untouched by either of them.
 */
describe('Records and Queries declare what they are for, in the one place that says it', () => {
  it('marks both pages analytical, on the element the page hangs off', () => {
    for (const [name, page] of [['records', rp.RecordsPage], ['queries', qp.QueriesPage]] as const) {
      const html = renderToStaticMarkup(h(page))
      expect(html, name).toContain('data-px-emphasis="analytical"')
      // Once. The stylesheet reads it with descendant selectors, so a second one inside the first
      // would be a surface arguing with itself about what it is.
      expect((html.match(/data-px-emphasis=/g) ?? []).length, name).toBe(1)
    }
  })
})

// ============================================================================ scan first, explain on demand

/**
 * THE FOUR NOTES ARE ONE PRESS AWAY AND NOT ONE WORD OF THEM IS GONE.
 *
 * Photographed at 1440 each query opened with about 330px of prose above its rows — on the unmet
 * panel, above two rows. The prose is good and the fourth note in particular is the kind of thing
 * most products never write down, so nothing is deleted: it goes behind `Explain`, which folds at
 * every width, and one line of what the list MEANS stays out in the open.
 *
 * These tests pin the bargain rather than the wording: what is visible before a press, what is
 * only behind one, and that the number on the fold is the number of things behind it.
 */
describe('a query opens on its title, its count and one line — the four notes are behind a press', () => {
  const unconsumed = () => body(h(qp.UnconsumedPanel, { records: [record({ kind: 'claim' })] }))
  const unmet = () =>
    body(h(qp.UnmetPanel, { items: [{ consumer: record({ title: 'Handover demo' }), missingTitle: 'grip force claim' }] }))

  /**
   * THE ONE VISIBLE LINE IS THE LIMIT ON THE COUNT — narrowed on 2026-08-12, and this test with it.
   *
   * It used to assert the whole sentence each panel opened with: "No consumes link points at these,
   * counted over claim, module and idea records only" and "One row is one consumes link that no
   * longer lands on a record". The first half of each is the query's own implementation, read once
   * and furniture ever after, and standing it in front of the first result is what the UX-8 pass
   * removed. So this pins what SURVIVES the shortening rather than the old wording: the qualifier
   * that stops a count being read as an all-clear is still readable without pressing anything.
   */
  it('shows the limit on the count, before anything is pressed', () => {
    // Which record kinds the count was taken over. Without it, "0" reads as "nothing is wrong".
    for (const kind of ['claim', 'module', 'idea']) expect(shownAtRest(unconsumed())).toContain(kind)
    // Which link type was checked. Without it, "0 broken links" reads as a clean graph.
    // NOT the stored link type in monospace: "Only what a record says it uses is checked."
    expect(shownAtRest(unmet())).toContain('Only what a record says it uses is checked')
  })

  /**
   * WHAT THE ONE VISIBLE LINE MAY NOT BE. Two answers, and the second is new.
   *
   * Both panels used to open by restating themselves — "Nothing is built on these" under a heading
   * reading "Results nothing is using". A reader who has read the title has read that clause.
   *
   * Then they opened by explaining themselves instead, which is the same failure one step over: how
   * the query runs is read once and is worth a press, not a permanent line above the answer. Both
   * sentences are still on the page, in `the question`, whole.
   */
  it('spends the one visible line on neither the panel’s title nor the query’s implementation', () => {
    expect(shownAtRest(unconsumed())).not.toContain('Nothing is built on these')
    // The implementation, in the words each panel used to open with.
    expect(shownAtRest(unconsumed())).not.toContain('link points at these')
    expect(shownAtRest(unmet())).not.toContain('no longer lands on a record')
    // And it is not deleted — it is one press away, where it says the same thing at length.
    expect(unconsumed()).toContain('nothing else says it uses it')
    expect(unmet()).toContain('One row is one such LINK, not one record')
  })

  /**
   * The scope is the sentence that stops a count of 0 being read as "nothing is wrong anywhere",
   * and it was only in the fold. On the unconsumed list it covers claim, module and idea and no
   * other kind, so a reader who never opens the notes is otherwise looking at a number over an
   * unstated denominator. It is now on the visible line as well as in full inside the notes.
   */
  it('names the three kinds the unconsumed count is taken over, without opening anything', () => {
    const shown = shownAtRest(unconsumed())
    for (const kind of ['claim', 'module', 'idea']) expect(shown, `"${kind}" is not on the visible line`).toContain(kind)
  })

  it('keeps the count of rows visible beside the title, so the fold hides no arithmetic', () => {
    expect(unconsumed()).toContain('1 record')
    expect(unmet()).toContain('1 broken link')
  })

  it('does not print the four notes until the fold is opened', () => {
    const shown = shownAtRest(unconsumed())
    expect(shown).not.toContain('A result that nothing consumes is a finding')
    expect(shown).not.toContain('Deleted records are not counted')
    // The key/value block itself is behind the fold, not merely restyled.
    expect(shown).not.toContain('qp-explain-key')
  })

  it('keeps every word of all four, so nothing is deleted — only moved one press away', () => {
    const html = unconsumed()
    expect(html).toContain('A result that nothing consumes is a finding that never reached the work')
    expect(html).toContain('Deleted records are not counted')
    expect(html).toContain('what it does not cover')

    const broken = unmet()
    expect(broken).toContain('This is the broken-link case seen from the side of the work that is stuck')
    expect(broken).toContain('that is the one whole-graph link')
  })

  it('names what is behind the fold and never says the bare word "more"', () => {
    const shown = shownAtRest(unconsumed())
    expect(shown).toContain('what this checks, why it matters, and what it does not cover')
    // The failure has a shape: an optional count, an optional verb, then a word that names
    // nothing. `Explain` rejects it outright; this checks the words this page actually passes.
    expect(shown).not.toMatch(/(?:^|\s)(?:\d+\s+)?(?:show|see|read|view|open)?\s*more\s*(?:…|\.\.\.)?(?:\s|$)/i)
  })

  it('counts what is behind the fold, and the count is the number of notes there are', () => {
    const html = unconsumed()
    const notes = (html.match(/class="qp-explain-row"/g) ?? []).length
    expect(notes).toBe(4)
    // "on this check", not "on this query": `query` is how the page is computed, and the address
    // was renamed away from it for that reason. Finding 29, 19 August 2026.
    expect(shownAtRest(html)).toContain(`${notes} notes on this check`)
  })

  it('is closed at rest on both panels, because that is the whole point of folding it', () => {
    expect(unconsumed()).toContain('<details class="px-explain"')
    expect(unconsumed()).not.toContain('<details class="px-explain" open')
    expect(unmet()).not.toContain('<details class="px-explain" open')
  })

  it('says the same thing about both queries, because they hold the same four notes', () => {
    // Two panels written by hand would drift; both read one pair of constants, and a reader who
    // learns the control on one panel has learned it on the other.
    const a = shownAtRest(unconsumed())
    const b = shownAtRest(unmet())
    expect(a).toContain('what this checks, why it matters, and what it does not cover')
    expect(b).toContain('what this checks, why it matters, and what it does not cover')
    expect(b).toContain('4 notes on this check')
  })
})

// ============================================================================ the page's own lede

/**
 * Run a render with the window answering a chosen width.
 *
 * `useNarrow` asks `matchMedia`, and there is none in this runner — it FAILS to the wide answer,
 * which is the one that hides nothing. So the two states are reached by lending the window a
 * matchMedia for the duration of one render, and put back afterwards.
 */
function atWidth<T>(narrow: boolean, run: () => T): T {
  const win = globalThis.window as unknown as { matchMedia?: unknown }
  const before = 'matchMedia' in win ? win.matchMedia : undefined
  win.matchMedia = () => ({ matches: narrow, addEventListener: () => {}, removeEventListener: () => {} })
  try {
    return run()
  } finally {
    if (before === undefined) delete win.matchMedia
    else win.matchMedia = before
  }
}

/**
 * THE PAGE'S LEDE IS BEHIND A CONTROL AT EVERY WIDTH, AND IT IS NO LONGER THE FIRST THING ON THE
 * PAGE. THIS BLOCK ASSERTED THE FIRST HALF AND HAS BEEN REWRITTEN AROUND ITS RULE FOR THE SECOND.
 *
 * The lede was once `StandingNote` — rendered whole above 480px, on the argument that four lines
 * beside a 1440px screen earn their space. That was wrong for the reason `Explain` exists: a
 * paragraph is read carefully once and skipped for the next two hundred visits. So it folded at
 * every width, and this block pinned the bargain: one visible line, every word one press away.
 *
 * WHAT THE UX-8 PASS FOUND IS THAT THE VISIBLE LINE ITSELF WAS THE PROBLEM. "Both lists are derived
 * from links, not stored" is a sentence about how Mole Office works, standing above both answers, in
 * front of the first result — and a summary line is not exempt from the rule that default-visible
 * text has to earn its space. There is no line of this fold worth showing, so the fold shows none:
 * it is a plain quiet `<details>` at the FOOT of the page, after the two lists, named by what it
 * holds and by a count of the link types read off `LINK_TYPES`.
 *
 * These tests pin the surviving rules: every word is still on the page at both widths, none of it
 * is in front of the reader at either, the control names what it opens, and the number in that name
 * is counted rather than typed.
 */
describe("the page's lede is behind a control at every width, and stands after the answer", () => {
  it('names what it opens, and counts the link types rather than typing the number', () => {
    for (const narrow of [false, true]) {
      const shown = shownAtRest(atWidth(narrow, () => body(h(qp.QueriesPage))))
      expect(shown, `at narrow=${narrow}`).toContain(
        // "a typed link" is the schema's word and "types" is too. Finding 29, 19 August 2026.
        `What links are for, and all ${Object.keys(LINK_TYPES).length} of them`,
      )
    }
  })

  it('keeps every word of the lede one press away, at both widths', () => {
    for (const narrow of [false, true]) {
      const html = atWidth(narrow, () => body(h(qp.QueriesPage)))
      expect(html, `at narrow=${narrow}`).toContain('Typing them costs something every time one is made')
      expect(html, `at narrow=${narrow}`).toContain('the only two questions')
      // Derived-not-stored is a fact and is not deleted. It is inside the fold now, with the rest.
      expect(html, `at narrow=${narrow}`).toContain('Neither list is stored. Both are derived from links')
      expect(shownAtRest(html), `at narrow=${narrow}`).not.toContain('Typing them costs something')
      expect(shownAtRest(html), `at narrow=${narrow}`).not.toContain('Neither list is stored.')
    }
  })

  it('opens on the page title and nothing else — no commentary above the first result', () => {
    const html = atWidth(false, () => body(h(qp.QueriesPage)))
    // `StandingNote` renders no wrapper at all above 480px, so its absence is what proves the
    // paragraph is not simply sitting in the flow the way it used to.
    expect(html).not.toContain('px-standing')
    expect(html).toContain('<details class="qp-about"')
    expect(html).not.toContain('<details class="qp-about" open')
    // The header is the heading and the provenance note, and the fold is after the panels: the
    // whole of UX-8 for this page in one comparison of two offsets.
    const head = html.slice(0, html.indexOf('</header>'))
    expect(head).not.toContain('qp-about')
    expect(html.indexOf('qp-about')).toBeGreaterThan(html.indexOf('</header>'))
  })
})

// ============================================================================ what the list is made of

/**
 * A COUNT IS A NUMBER; A SPLIT BY KIND IS A SHAPE.
 *
 * "20 records" says how long the unconsumed list is. It does not say whether twelve of them are
 * modules or twelve of them are claims, and those are two different situations with two different
 * things to do. The split is counted over the rows that are already on the page, so it can be
 * checked against the list under it and invents nothing.
 */
describe('the unconsumed list says what it is made of, by kind', () => {
  it('counts every kind on the list, biggest first, and drops none of them', () => {
    const records = [
      record({ id: 'a', kind: 'module' }),
      record({ id: 'b', kind: 'claim' }),
      record({ id: 'c', kind: 'module' }),
      record({ id: 'd', kind: 'idea' }),
      record({ id: 'e', kind: 'module' }),
    ]
    expect(qp.kindTally(records)).toEqual([
      { kind: 'module', count: 3 },
      { kind: 'claim', count: 1 },
      { kind: 'idea', count: 1 },
    ])
    // The split adds up to the count beside the title. A tally that does not is a second number
    // saying something different about the same rows.
    expect(qp.kindTally(records).reduce((sum, entry) => sum + entry.count, 0)).toBe(records.length)
  })

  it('breaks a tie by the kind’s name, so two runs cannot disagree about the order', () => {
    const tally = qp.kindTally([record({ id: 'a', kind: 'module' }), record({ id: 'b', kind: 'claim' })])
    expect(tally.map((entry) => entry.kind)).toEqual(['claim', 'module'])
  })

  it('says nothing at all about an empty list, rather than drawing an empty strip', () => {
    expect(qp.kindTally([])).toEqual([])
    expect(body(h(qp.UnconsumedPanel, { records: [] }))).not.toContain('qp-kinds')
  })

  it('draws the split beside the title, where it costs no line of its own', () => {
    const html = body(h(qp.UnconsumedPanel, { records: [record({ id: 'a', kind: 'module' })] }))
    expect(html).toContain('qp-kinds')
    expect(html).toContain('1 record')
  })
})

// ============================================================ the geometry of a query row

/**
 * WHERE A TITLE STARTS, AND THE FOUR NUMBERS THAT MADE THIS BLOCK NECESSARY.
 *
 * Measured in Chromium at 1440 on 14 August, on the live `panelx` project, before the repair:
 *
 *   eight left edges for the row titles   x = 551.8, 599.6, 613.5, 617.2, 635.3, 640.2, 648.6, 687
 *   a visible page heading                43.2px tall, saying what the rail row beside it says
 *   two widths for the first column       112px on a broken row, 0px on an unconsumed one
 *   the first panel                       y = 111.8, where Home puts its first panel at y = 14
 *
 * After: one title edge per panel (441 on the quiet list, 447 on the alarm list, which is the 6px
 * spine every severe row in the product carries), one column width of 152px on both lists, a
 * heading 1px tall in the accessibility tree, and the first panel at y = 14.
 *
 * NONE OF THAT CAN BE MEASURED IN THIS RUNNER — there is no DOM. What can be checked is the
 * MECHANISM behind each number, and each test below fails if the mechanism is undone: the shared
 * grid is read from `famCols()` rather than typed, nothing is drawn in the cell before the title,
 * the stamp is last in the right-hand cell so its edge is the straight one, and the page's name is
 * in the document with the rule that takes it off the screen.
 */
describe('a query row is laid on the one grid every list of records shares', () => {
  // WITH A STORED STATE WORD, so the right-hand cell holds all three of the things it can hold.
  // A fixture with no state draws no chip, and the ordering test below would then be checking a
  // cell with one item in it — which is a test that cannot fail.
  const unconsumedRow = () =>
    body(h(qp.UnconsumedPanel, { records: [record({ id: 'u1', kind: 'claim', data: { state: 'measured' }, summary: 'measured at 12N' })] }))
  const unmetRow = () =>
    body(h(qp.UnmetPanel, { items: [{ consumer: record({ id: 'm1', kind: 'task' }), missingTitle: 'grip force claim' }] }))

  it('takes its columns from famCols, so this page cannot drift from the family pages', () => {
    // READ FROM THE DECLARATION, never typed here. A literal in this test would be a second copy
    // of the width, which is the defect `famCols` was created to end — and it would go on passing
    // on the day somebody changed the shared column and left this page behind.
    // NOT anchored to the start of the style attribute: a severe row carries its tone variables
    // in the same attribute, before this one, and pinning the order would make this test fail on
    // a change to how a broken row is tinted rather than on a change to the grid.
    const want = `--cols:${rows.famCols('fit-content(40%)')}`
    expect(unconsumedRow(), 'the unconsumed list is not on the shared grid').toContain(want)
    expect(unmetRow(), 'the unmet list is not on the shared grid').toContain(want)
  })

  it('draws nothing in front of the title, which is what makes the titles share one edge', () => {
    // `px-row-lead` is the cell Row puts `leading` in, and its width is whatever that row's marks
    // happen to be — which is how this page came to have eight left edges.
    for (const [name, html] of [['unconsumed', unconsumedRow()], ['unmet', unmetRow()]] as const) {
      expect(html, `${name} still draws something before its title`).not.toContain('px-row-lead')
      // The positive half: the title is the first and only thing on the row's first line. Without
      // this the test would pass on a page that had stopped drawing rows at all.
      expect(html, `${name} draws no row title`).toContain('<div class="px-row-line"><a class="px-row-title px-nav"')
    }
  })

  it('spends the fixed column on the kind, on the list whose state word is usually not there', () => {
    // Measured on the live corpus: 15 of the 21 unconsumed records are modules, and no module in
    // either project carries a state word. A column that is empty on three rows in four is the
    // non-answer column components/family/parts.tsx records; the kind is on every record.
    expect(unconsumedRow()).toContain('<div class="px-row-sev"><span class="px-tag"')
    // And on the list whose rows are faults, the fixed column is the fault.
    expect(unmetRow()).toContain('data-state="broken"')
  })

  it('puts the stamp last in the right-hand cell, so its edge is the straight column', () => {
    // The cell is right-aligned by the component sheet, so the LAST thing in it is the one whose
    // edge lines up down the page. src/web/pages/family/rows.tsx measured the cost of getting this
    // backwards: the mark on every row started at x=1140 on some rows and x=1245 on the rest.
    for (const [name, html] of [['unconsumed', unconsumedRow()], ['unmet', unmetRow()]] as const) {
      const cell = html.slice(html.indexOf('<div class="px-row-right">'))
      const stamp = cell.indexOf('px-stamp')
      expect(stamp, `${name} draws no stamp`).toBeGreaterThan(-1)
      // The other three things this cell can hold. Counted as well as compared, because a cell
      // with one item in it satisfies "the stamp is last" without saying anything.
      const others = ['px-origin', 'px-tag', 'px-chip-stored'].map((cls) => [cls, cell.indexOf(cls)] as const)
      expect(others.filter(([, at]) => at >= 0).length, `${name} has nothing else in its right-hand cell`).toBeGreaterThan(1)
      for (const [cls, at] of others) {
        if (at < 0) continue
        expect(at, `${name} draws ${cls} after the stamp, so the stamp is not the straight edge`).toBeLessThan(stamp)
      }
    }
  })
})

/**
 * THE PAGE DRAWS ITS NAME, AND THIS IS A REVERSAL WORTH READING BEFORE CHANGING IT BACK.
 *
 * It used to be clipped to one pixel. The reasoning was good: the rail row that opens this page
 * already says "Missing and unused", the heading said it again at 43px directly beside it, and that
 * repeat put the first panel at y=111.8 where Home puts its first panel at y=14.
 *
 * A first-time reader, given the running product and no documents, went through six pages drawn
 * that way and reported the missing name on every one of them. The rail is a LIST OF PLACES, read
 * once on the way in; the content area then named itself nowhere, and there was no way to tell what
 * you were looking at without going back to check which row was lit.
 *
 * So the name is drawn, at the size every other page uses. The repeat is real and it is the cheaper
 * of the two costs. What is NOT allowed is deleting the heading: a page with no heading cannot be
 * announced or jumped to.
 */
describe('the page opens on the answer, and says which page it is', () => {
  const page = () => renderToStaticMarkup(h(qp.QueriesPage))
  const sheet = () => /<style[^>]*>([\s\S]*?)<\/style>/.exec(page())?.[1] ?? ''

  it('keeps the heading in the document', () => {
    expect(page()).toContain('<h1 class="qp-title">Missing and unused</h1>')
  })

  it('draws the name, at the size every other page draws its own', () => {
    const css = sheet()
    expect(css, 'the page ships no stylesheet at all').not.toBe('')
    const rule = /\.qp-title\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    // Not clipped. A reader has to be able to see which page they are on.
    expect(rule, 'the page heading is hidden again, so the page names itself nowhere').not.toContain(
      'clip-path',
    )
    // The same size as Plans, Everything, Pipelines, Agent runs and the six family pages. Decisions
    // was the last page at a different size and it was brought into line in the same pass.
    expect(rule, 'this page names itself at a different size from every other page').toContain(
      'var(--fs-6)',
    )
  })

  it('does not show the removed unmarked-row sentence or its hover', () => {
    expect(page()).not.toContain('px-origin-note')
  })
})

/**
 * EVERY STORED WORD THIS PAGE PRINTS GOES THROUGH THE WORDS LAYER.
 *
 * It printed `part_of` in the unmet panel's "what it does not cover" — a spelling a reader has
 * never been shown anywhere else in the product, on one of the pages a first-time reader hits
 * hardest. The normal-mode test carried it as a known exception naming this file; that entry
 * was deleted, and the test itself on 12 November 2026. These tests pin the two halves of the
 * bargain from this side: the reader's word in Normal, the stored word in Developer, and both read
 * off `LINK_TYPES` so neither can be typed wrong here.
 */
describe('the stored spellings on this page are the reader’s words in Normal', () => {
  const drawn = (which: 'normal' | 'inspect', el: React.ReactElement) => {
    mode.setMode(which)
    try {
      return body(el)
    } finally {
      mode.setMode('normal')
    }
  }
  const unmet = () => h(qp.UnmetPanel, { items: [] })
  const unconsumed = () => h(qp.UnconsumedPanel, { records: [] })

  it('says "part of" to a reader and part_of to a developer', () => {
    // Both spellings come from the one declaration, so this test cannot disagree with the product
    // about what either of them is.
    expect(drawn('normal', unmet())).toContain(LINK_TYPES.part_of.forward)
    expect(drawn('normal', unmet())).not.toContain('part_of')
    expect(drawn('inspect', unmet())).toContain('part_of')
  })

  it('keeps the query’s own name for Developer mode, where it is the way to the code', () => {
    // "unconsumed" and "unmet dependencies" are the names of two functions in
    // src/server/lib/records.ts. They were drawn as an eyebrow above a title that says the same
    // thing in English, to every reader.
    expect(drawn('normal', unconsumed()), 'the query name is still shown to a Normal reader').not.toContain('px-panel-kind')
    expect(drawn('normal', unmet())).not.toContain('px-panel-kind')
    expect(drawn('inspect', unconsumed())).toContain('unconsumed')
    expect(drawn('inspect', unmet())).toContain('unmet dependencies')
  })

  it('names the same kinds on the visible line as in the note behind it', () => {
    // THREE SENTENCES USED TO TYPE THE SAME THREE KINDS: the visible line, `the question` and
    // `what it does not cover`. They read one list now. NOTHING IS TYPED IN THIS TEST EITHER —
    // it pulls the kinds off the visible line and asks whether the note behind the fold names the
    // same ones, so it fails when the two drift and passes on the day a fourth kind is added.
    //
    // There is still a fourth copy and it is the one that matters: `unconsumed()` in
    // src/server/lib/records.ts filters on the same literals. That is reported to its owner
    // rather than reached into from a browser test.
    const html = drawn('normal', unconsumed())
    const named = /Counted over (.+?) records only/.exec(shownAtRest(html))?.[1] ?? ''
    expect(named, 'the visible line no longer says which kinds were counted').not.toBe('')
    const scope = (/class="qp-explain-val qp-scope">([\s\S]*?)<\/dd>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '')
    expect(scope, 'the notes hold no scope sentence').not.toBe('')
    expect(scope, `the visible line counted over "${named}" and the scope note names a different set`).toContain(named)
  })
})

// ============================================================================ ordinary emptiness

/**
 * A COLUMN THAT IS EMPTY ON ALMOST EVERY ROW SAYS SO WITH A DASH, NOT WITH A WORD.
 *
 * Measured in Chromium at 1440 on 15 August, on the live corpus: the Missing column read "none" on
 * 192 of Everything's 194 rows. design/ROUND-FOUR.md calls that ordinary emptiness — an empty list
 * that is normally empty — and gives it a dimmed dash, never a sentence and never a word repeated
 * down a screen.
 *
 * IT IS NOT ALLOWED TO BECOME A BLANK, AND THAT IS THE HALF THIS TEST IS REALLY FOR. USER.md
 * invariant 5 separates "there is none" from "nobody looked", and a blank cell says the second.
 * `incompleteCount` is counted by the server on every read, so zero means Mole Office looked and
 * found nothing unfilled — and the cell says exactly that, in full, for anybody who asks it.
 */
describe('the Missing column is quiet without going blank', () => {
  // CRITERION CHANGE, wave 13j round 12: the Missing column is drawn in developer mode only, so it is
  // read there. In normal mode an incomplete record is marked on its title line instead.
  const results = (records: RecordListItem[]) => {
    mode.setMode('inspect')
    try {
      return body(h(rp.RecordResults, { records, kind: '' as const, query: '', onClearKind: noop, onClearQuery: noop, onNew: noop }))
    } finally {
      mode.setMode('normal')
    }
  }

  it('draws a dash rather than the word "none" on a record with nothing unfilled', () => {
    const html = results([record({ incompleteCount: 0 })])
    // Drawn by `Absence` in ui.tsx, the one component that draws an absence, and at its quietest
    // tier. This page must not grow a second way of saying nothing is here.
    expect(html).toContain('px-absent')
    expect(html).toContain('—')
    expect(html, 'the word is back, once per row, down the whole page').not.toMatch(/>none</)
  })

  it('never draws the cell empty, because an empty cell reads as nobody looked', () => {
    const cell = /<td data-col="incomplete"[^>]*>([\s\S]*?)<\/td>/.exec(results([record({ incompleteCount: 0 })]))?.[1] ?? ''
    expect(cell.replace(/<[^>]+>/g, '').trim(), 'the cell is blank, which claims nobody counted').not.toBe('')
    // And the sentence is on the mark itself, so the dash is readable rather than merely quiet.
    // "Mole Office counted this record's fields and none is unfilled" — a double negative narrating the
    // mechanism, read aloud on roughly two hundred rows. Nit 38, 19 August 2026.
    expect(cell).toContain('Nothing missing.')
    expect(cell).not.toContain('none is unfilled')
  })

  it('still draws the count when something IS unfilled', () => {
    expect(results([record({ incompleteCount: 3 })])).toContain('px-inc-mark')
  })
})

