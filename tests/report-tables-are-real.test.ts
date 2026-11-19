// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG REPORT WITH SIX TABLES TYPED INTO ITS WORDS, DRAWN, AND EVERY TABLE IN IT A REAL TABLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Two faults: report tables were not drawn as real tables, and selecting text inside a report
 * selected the whole report rather than the passage.
 * Both faults have one cause. What a report draws is rendered Markdown; what it stores is
 * Markdown source. They are not the same characters, so a quote taken off the screen could not be
 * found in the source, and a pipe table could not be drawn without a second reader of pipe syntax.
 * Round seven printed the pipe characters under a note and refused to quote a report at all.
 *
 * This file holds both halves to a whole report rather than to a two-line example:
 *
 *   1. every one of the six tables in the report draws as a table;
 *   2. every run of text on that page that says where it came from is TELLING THE TRUTH — the
 *      stored string really does hold those characters at that offset — and the server's own reader
 *      confirms it by answering "still there, in the same place".
 *
 * The second is the one that could rot quietly. An element marked with the wrong offset stores a
 * comment that reads back later as *the text has changed* about a paragraph nobody touched. Nothing
 * fails; no type is wrong; the lie appears weeks later in a sentence a person would believe.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE REPORT COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * `tests/fixtures/an-invented-report-with-six-tables.json`, an invented report about a tool library.
 * Nothing in it happened. Until October 2026 this file read a real report exported from the owner's
 * corpus (design/round-seven-report.json); the public copy of this repository is to carry no design/
 * folder, so the invented one keeps the shapes the real one was chosen for:
 *
 *   - six pipe tables spread over four blocks, so the count is a count of tables and not of blocks;
 *   - a block that ends in a heading and a block that starts with a table, so a table is found
 *     where a block begins and not only after a paragraph;
 *   - two tables in block b3, which is the block the cases about quoting a table cell read;
 *   - cells that begin with bold ("**Done.**"), cells with code, italics, an em dash, a "·", an
 *     apostrophe, double quotes and an "&" in them, so the offsets are checked across every
 *     character React escapes and every mark a cell may carry;
 *   - a header row "You asked | State", read by the case about header rows;
 *   - a table whose header cells are empty (block b9), as a "where everything is" table has;
 *   - columns of prose only, so no column may be drawn right-aligned as a number;
 *   - a quote block, a list, headings at two levels and section breaks, so the offsets are checked
 *     outside tables as well, and there are more than 200 marked runs in all.
 *
 * NOTHING HERE OPENS data/panelx.db: that file is the person's work, a test that opened it would open
 * it writable, and four junk records were written into it by a test during round seven. The record
 * is written into a throwaway database through the ordinary write path, so this also proves the
 * report still validates.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PanelRecord, SummaryBlock } from '../src/shared/types.ts'
import type { Context } from '../src/shared/targets.ts'
import type { RecordRegionSource } from '../src/shared/regions.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type Targets = typeof import('../src/server/lib/targets.ts')
type Agents = typeof import('../src/server/lib/agents.ts')

let db: TestDb
let sb: SummaryBlocksModule
let targets: Targets
let agents: Agents
let written: PanelRecord

/** The invented report, read from tests/fixtures. What each part of it is for is said at the top. */
const EXPORTED = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/an-invented-report-with-six-tables.json', import.meta.url)), 'utf8'),
) as {
  record: { id: string; workspaceId: string; kind: string; title: string; summary: string | null; data: Record<string, unknown> }
}

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

  db = await freshDb()
  sb = await import('../src/web/components/SummaryBlocks.tsx')
  targets = await import('../src/server/lib/targets.ts')
  agents = await import('../src/server/lib/agents.ts')

  written = db.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: EXPORTED.record.title,
    summary: EXPORTED.record.summary,
    data: EXPORTED.record.data,
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  // A LINK ON THE REPORT, so the relation phrases the drawing is handed come from the record itself
  // rather than being empty whatever the fixture does. See `wholeRecordOf` below.
  const related = db.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'A report the exported one relates to',
    summary: null,
    data: { blocks: [] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  db.api.createLink({ fromId: written.id, toId: related.id, type: 'relates_to', actor: db.api.HUMAN })
})

afterAll(() => {
  db.close()
})

// ---------------------------------------------------------------------------- reading the markup

const blocks = () => EXPORTED.record.data['blocks'] as SummaryBlock[]

/**
 * The record's world as the product derives it: its stored fields, and the relation phrases off the
 * one reader of its links.
 *
 * IT IS A FUNCTION AND EVERY DRAWING HERE USES IT, so a fixture cannot hand the component a list the
 * product would not derive. The case below asserts the two agree.
 */
function wholeRecordOf(id: string): RecordRegionSource {
  const record = db.api.getRecord(id)
  if (record === null) throw new Error(`no record ${id}`)
  return {
    kind: record.kind,
    data: record.data,
    title: record.title,
    summary: record.summary,
    relations: db.api.resolveLinks(id).map((link) => link.label),
  }
}

describe('the fixture hands the drawing the record the product would derive', () => {
  it('takes its relation phrases from the record’s own links', () => {
    const world = wholeRecordOf(written.id)
    expect(world.relations).toEqual(db.api.resolveLinks(written.id).map((link) => link.label))
    expect(world.relations.length, 'the fixture links the report to nothing, so this check is vacuous').toBeGreaterThan(0)
  })
})

/** The report drawn, told which record it is, with the hoisted stylesheets taken out. */
function drawn(): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: blocks(),
      layout: 'page',
      // THE WHOLE RECORD, so this render is handed the world the product really draws in, and
      // not a page with no sections above the report body. See `BlocksInRecord.wholeRecord`.
      inRecord: {
        recordId: written.id,
        kind: written.kind,
        wholeRecord: wholeRecordOf(written.id),
      },
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** What React escaped on its way out, turned back into the characters a person selects. */
function asWritten(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Every element that says where its text came from, with the words in it.
 *
 * ONE TEXT NODE PER MARKED ELEMENT IS THE RULE THIS READS BY, and it is the same rule the feature
 * needs: an element carrying an offset has to hold exactly the stored characters that offset names.
 * An element with a tag inside it would not match here — which is the right answer, because it
 * would also be an element Mole Office could not honestly quote from.
 */
function marks(markup: string): { field: string; at: number; text: string }[] {
  return [
    ...markup.matchAll(/data-text-field="([^"]*)" data-text-offset="(\d+)"[^>]*>([^<]*)</g),
  ].map((m) => ({ field: asWritten(m[1] ?? ''), at: Number(m[2]), text: asWritten(m[3] ?? '') }))
}

/**
 * Every stored string of the record, as THE SERVER names them.
 *
 * Read through `resolveTarget` rather than walked here, so the field names this test checks against
 * are the ones a comment will really be looked up in. A second walk written in this file could
 * agree with the screen and disagree with the server, which is the failure it exists to catch.
 */
function storedStrings(): { field: string; text: string }[] {
  const found = targets.resolveTarget({ kind: 'record', recordId: written.id, workspaceId: written.workspaceId })
  if (found.answer !== 'found') throw new Error('the record written above cannot be read back')
  return found.text.strings
}

/** How many pipe tables the stored report contains, counted from the report rather than typed. */
function pipeTablesInTheSource(): number {
  let runs = 0
  for (const block of blocks()) {
    if (block.type !== 'text') continue
    let inside = false
    for (const line of block.text.replace(/\r\n?/g, '\n').split('\n')) {
      const isPipe = line.trimStart().startsWith('|')
      if (isPipe && !inside) runs += 1
      inside = isPipe
    }
  }
  return runs
}

// ---------------------------------------------------------------------------- the tables

describe('a long report with six tables in its words, drawn', () => {
  it('is still a report Mole Office will store, written through the ordinary write path', () => {
    expect(written.kind).toBe('report')
    expect(blocks().length).toBeGreaterThan(0)
  })

  it('draws every table typed into its words as a real table', () => {
    // Six, counted from the report itself so the number cannot go stale if the fixture is edited.
    const expected = pipeTablesInTheSource()
    expect(expected, 'the invented report should still hold the tables this test is about').toBe(6)

    const out = drawn()
    expect(out.split('<table').length - 1).toBe(expected)
    expect(out, 'the note telling the owner to use a table block is gone, because there is now somewhere to put one')
      .not.toContain('Not rendered')
  })

  it('draws their cells as cells, with the markdown inside them read', () => {
    const out = drawn()
    // A cell from the middle of one of its tables, with bold inside it. It was a line of a code
    // block before this pass.
    expect(out).toMatch(/<td[^>]*><strong[^>]*>Done\.<\/strong>/)
    expect(out).toContain('<th')
    // A heading of one of them, so the header row is a header row and not the first body row.
    expect(asWritten(out)).toContain('You asked')
  })

  it('right-aligns nothing it should not, and offers to sort what it drew', () => {
    const out = drawn()
    // Every column of its tables is prose, so none of them is dragged to the right.
    expect(out).not.toContain('class="sb-num"')
    // The sort control is drawn at rest, not on hover.
    expect(out).toContain('class="sb-sort"')
    expect(out).toContain('aria-sort="none"')
  })
})

// ---------------------------------------------------------------------------- the provenance

describe('every run of text on that page says truthfully where it came from', () => {
  it('marks a great many of them, rather than a handful', () => {
    // A number would go stale; what matters is that this is the whole report and not one paragraph.
    expect(marks(drawn()).length).toBeGreaterThan(200)
  })

  it('names only fields the server can find in the record it just wrote', () => {
    const known = new Set(storedStrings().map((s) => s.field))
    const unknownFields = [...new Set(marks(drawn()).map((m) => m.field))].filter((f) => !known.has(f))
    expect(unknownFields, 'a field name the server cannot find is a comment Mole Office can never read again').toEqual([])
  })

  it('puts every one of them at an offset the stored string really holds', () => {
    const stored = new Map(storedStrings().map((s) => [s.field, s.text]))
    const wrong = marks(drawn()).filter((mark) => {
      const source = stored.get(mark.field)
      return source === undefined || source.slice(mark.at, mark.at + mark.text.length) !== mark.text
    })
    expect(
      wrong.slice(0, 5),
      'an offset the stored string does not hold makes Mole Office report untouched text as changed',
    ).toEqual([])
  })

  /**
   * THE WHOLE POINT, CLOSED THROUGH THE SERVER.
   *
   * A person selects some words inside one drawn run. The browser builds the span by arithmetic —
   * the element's offset plus the characters before the selection inside it — and the server's own
   * reader is asked whether those words are still where the screen said they were. "Still there, in
   * the same place" is the only answer that means the two ends agree.
   */
  it('lets the server confirm a quote taken off a table cell, in the same place', () => {
    const cellMarks = marks(drawn()).filter((m) => m.text.trim().length > 12)
    expect(cellMarks.length).toBeGreaterThan(20)

    for (const mark of cellMarks.slice(0, 40)) {
      const from = mark.at + 3
      const quote = mark.text.slice(3, 3 + 9)
      if (quote.trim() === '') continue
      const context: Context = {
        target: { kind: 'record', recordId: written.id, workspaceId: written.workspaceId },
        span: { quote, from, to: from + quote.length, field: mark.field },
      }
      const reading = agents.readContext(context)
      expect(reading.state, `${mark.field} at ${String(from)}: ${reading.says}`).toBe('there')
    }
  })

  it('marks the words inside a table cell, so a passage of a table can be quoted', () => {
    const inTables = marks(drawn()).filter((m) => m.field.includes('blocks[#b3]'))
    expect(inTables.length).toBeGreaterThan(5)
    // And the words are read out of the paragraph the table was typed into, which is where they
    // really are — a table typed into prose has no stored rows of its own, so nothing names one.
    expect(inTables.filter((m) => m.field.includes('.rows['))).toEqual([])
    expect(inTables.some((m) => m.field === 'data.blocks[#b3].text')).toBe(true)
  })
})

// ---------------------------------------------------------------------------- what it points at

describe('what a person can point at on that page', () => {
  it('marks every block of the report as the block it is', () => {
    const out = drawn()
    const targeted = [...out.matchAll(/data-target="([^"]+)"/g)].map((m) => m[1] ?? '')
    for (const block of blocks()) {
      expect(targeted, `block ${block.id} is not something anybody can point at`).toContain(
        `reportBlock/${written.id}/${block.id}`,
      )
    }
  })

  it('does not claim a table row or cell for a table typed into a paragraph', () => {
    // `tableRow` is looked up in a stored `table` block's rows, and a table typed into prose has
    // none. Claiming one would store a comment that reads back as "that block is not a table".
    const out = drawn()
    expect(out).not.toContain('data-target="tableRow/')
    expect(out).not.toContain('data-target="tableCell/')
  })

  it('does claim a row and a cell for a stored table block, and the server can find them', () => {
    const stored: SummaryBlock[] = [
      {
        id: 't1',
        type: 'table',
        columns: [{ label: 'run' }, { label: 'error', align: 'right' }],
        rows: [{ cells: ['before the knock', 0.4] }, { cells: ['after the knock', 1.9] }],
      },
    ]
    const record = db.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A report with a real table block in it',
      summary: null,
      data: { blocks: stored, for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-18' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    const out = renderToStaticMarkup(
      h(sb.SummaryBlocks, {
        blocks: stored,
        layout: 'page',
        inRecord: {
          recordId: record.id,
          kind: 'report',
          wholeRecord: wholeRecordOf(record.id),
        },
      }),
    )
    expect(out).toContain(`data-target="tableRow/${record.id}/t1/2"`)
    expect(out).toContain(`data-target="tableCell/${record.id}/t1/2/1"`)

    // The row the screen named is the row the server finds, counted the same way from 1.
    const row = targets.resolveTarget({ kind: 'tableRow', recordId: record.id, blockId: 't1', rowKey: '2' })
    expect(row.answer).toBe('found')
    if (row.answer !== 'found') return
    expect(row.text.strings.map((s) => s.text)).toContain('after the knock')
  })
})
