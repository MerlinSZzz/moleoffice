// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READING-MEASURE WORDS ARE WIDTHS, WIDEST FIRST, AND THE STORED WORDS MOVE ONCE.
 *
 * Criterion E6 of design/entries/ACCEPTANCE.md (note c1QOUFaNMiWz): `readable` was misleading and should be named
 * narrow. Answer SSmnHqX7CuL_ settled the list: full, wide, narrow, narrowest. The old
 * `readable` (var(--read)) is `narrow` now, and the old `narrow` (26rem) is `narrowest`.
 *
 * Three things are held here:
 *
 *   1. The migration. A stored `narrow` reads `narrowest` afterwards and a stored `readable` reads
 *      `narrow`, on a block and on a part of a composition, and the newest revision still hashes
 *      what the record holds. A second run changes nothing, including a `narrow` written after the
 *      first run.
 *   2. The four names read as widths from widest to narrowest, and none of them is `readable`.
 *   3. A block written with `narrow` now is drawn at var(--read), and `narrowest` at 26rem.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { migrateMeasureWords } from '../src/server/db/measure-words.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { MEASURE_PRESETS, measureDrawn, measureMaxWidth } from '../src/shared/beside.ts'
import { KIND_SPECS, SHAPE_SPECS } from '../src/shared/kinds.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const PROSE = 'The mast moved four millimetres under the full load, and settled back when it was taken off.'

interface Row {
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
}

describe('the stored measure words move once, narrow to narrowest and then readable to narrow', () => {
  let t: TestDb
  let sqlite: Database.Database

  beforeEach(async () => {
    t = await freshDb()
    sqlite = t.client.sqlite as unknown as Database.Database
    // A FRESH DATABASE HAS ALREADY BEEN THROUGH THE STEP, because `freshDb` migrates it. Taking the
    // marker row out of this test's own scratch file puts it back where a database written before
    // migration 0173 is.
    sqlite.prepare('DELETE FROM measure_words_renamed').run()
  })

  afterEach(() => t.close())

  function rowOf(id: string): Row {
    return sqlite.prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?').get(id) as Row
  }

  function versionOfRow(row: Row): string {
    return versionOf(
      contentOf({
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data: JSON.parse(row.data) as Record<string, unknown>,
        deletedAt: row.deleted_at,
      }),
    )
  }

  function newestRevision(id: string): { content_hash: string; data: string } {
    return sqlite
      .prepare('SELECT content_hash, data FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
      .get(id) as { content_hash: string; data: string }
  }

  /**
   * A REPORT HOLDING THE OLD WORDS, a block and a composition part of each.
   *
   * The write door refuses `readable` now, so the report goes through the door with widths it
   * accepts and the old words go in with SQL, into the record and into its newest revision with
   * its hash. That is where a report written before the rename holds them.
   */
  function aReportWithTheOldWords(): string {
    const id = t.api.createRecord({
      kind: 'report',
      title: 'Written before the rename',
      workspaceId: WORKSPACE,
      data: {
        blocks: [
          { id: 'b-old-narrow', type: 'text', text: PROSE, measure: 'wide' },
          { id: 'b-old-readable', type: 'text', text: PROSE, measure: 'wide' },
          {
            id: 'b-beside',
            type: 'beside',
            parts: [
              { id: 'p-old-narrow', measure: 'wide', blocks: [{ id: 'pn', type: 'text', text: PROSE }] },
              { id: 'p-old-readable', measure: 'wide', blocks: [{ id: 'pr', type: 'text', text: PROSE }] },
            ],
          },
        ],
      },
      actor: HUMAN,
    }).id
    const data = JSON.parse(rowOf(id).data) as { blocks: Record<string, unknown>[] }
    const [oldNarrow, oldReadable, beside] = data.blocks as [
      Record<string, unknown>,
      Record<string, unknown>,
      { parts: Record<string, unknown>[] },
    ]
    oldNarrow['measure'] = 'narrow'
    oldReadable['measure'] = 'readable'
    ;(beside.parts[0] as Record<string, unknown>)['measure'] = 'narrow'
    ;(beside.parts[1] as Record<string, unknown>)['measure'] = 'readable'
    sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
    const row = rowOf(id)
    sqlite
      .prepare(
        'UPDATE revisions SET data = ?, content_hash = ? WHERE id = ' +
          '(SELECT id FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1)',
      )
      .run(row.data, versionOfRow(row), id)
    return id
  }

  /** Every stored measure in the report, keyed by the id of the block or part that holds it. */
  function measuresOf(id: string): Record<string, unknown> {
    const data = JSON.parse(rowOf(id).data) as { blocks: Record<string, unknown>[] }
    const out: Record<string, unknown> = {}
    for (const block of data.blocks) {
      if (block['measure'] !== undefined) out[String(block['id'])] = block['measure']
      for (const part of (block['parts'] as Record<string, unknown>[] | undefined) ?? []) {
        out[String(part['id'])] = part['measure']
      }
    }
    return out
  }

  it('reads narrowest where it said narrow and narrow where it said readable, on blocks and on parts', () => {
    const id = aReportWithTheOldWords()
    expect(measuresOf(id), 'the fixture does not hold the old words').toEqual({
      'b-old-narrow': 'narrow',
      'b-old-readable': 'readable',
      'p-old-narrow': 'narrow',
      'p-old-readable': 'readable',
    })

    const report = migrateMeasureWords(sqlite)

    expect(measuresOf(id)).toEqual({
      'b-old-narrow': 'narrowest',
      'b-old-readable': 'narrow',
      'p-old-narrow': 'narrowest',
      'p-old-readable': 'narrow',
    })
    expect(report.moved).toEqual({ narrow: 2, readable: 2 })
    expect(report.records).toBe(1)

    // THE LEDGER STILL DESCRIBES THE RECORD, or every write to it would be refused as stale.
    const row = rowOf(id)
    expect(newestRevision(id).content_hash).toBe(versionOfRow(row))
    expect(JSON.parse(newestRevision(id).data)).toEqual(JSON.parse(row.data))
    expect(report.ledgerRestamped).toBe(1)

    // AND THE MARKER IS WRITTEN IN THE SAME RUN.
    expect(sqlite.prepare('SELECT count(*) AS n FROM measure_words_renamed').get()).toEqual({ n: 1 })
  })

  it('changes nothing when it runs a second time, including a narrow written after the first run', () => {
    const id = aReportWithTheOldWords()
    migrateMeasureWords(sqlite)

    // A block written through the door after the rename, meaning the new `narrow`.
    const later = t.api.createRecord({
      kind: 'report',
      title: 'Written after the rename',
      workspaceId: WORKSPACE,
      data: { blocks: [{ id: 'b-new-narrow', type: 'text', text: PROSE, measure: 'narrow' }] },
      actor: HUMAN,
    }).id

    const before = { old: rowOf(id).data, later: rowOf(later).data, oldHash: newestRevision(id).content_hash }

    const second = migrateMeasureWords(sqlite)
    expect(second.alreadyDone).toBe(true)
    // AND THROUGH THE COMMAND ITSELF, which is how the step really runs again: on every migrate.
    migrateInPlace(sqlite)

    expect(rowOf(id).data).toBe(before.old)
    expect(rowOf(later).data).toBe(before.later)
    expect(measuresOf(later)).toEqual({ 'b-new-narrow': 'narrow' })
    expect(newestRevision(id).content_hash).toBe(before.oldHash)
  })
})

describe('the four measure names are widths, from widest to narrowest', () => {
  it('lists full, wide, narrow and narrowest, and none of them is readable', () => {
    expect([...MEASURE_PRESETS]).toEqual(['full', 'wide', 'narrow', 'narrowest'])
    expect(MEASURE_PRESETS as readonly string[]).not.toContain('readable')
  })

  it('asks for a smaller width at each step down the list', () => {
    // A column far wider than any preset, so every maximum binds and `askedPx` is the preset itself.
    // `read` is 544, which is 34rem at a 16px root, the value tokens.css gives --read.
    const asked = MEASURE_PRESETS.map((preset) => measureDrawn(preset, 100_000, 16, 544).askedPx)
    for (let i = 1; i < asked.length; i += 1) {
      expect(asked[i], `${String(MEASURE_PRESETS[i])} is not narrower than ${String(MEASURE_PRESETS[i - 1])}`)
        .toBeLessThan(asked[i - 1] as number)
    }
  })

  it('is what the kinds door tells an agent, with narrow as the example', () => {
    // Every field called `measure` GET /api/kinds publishes, in the kinds and the shapes: on a block and
    // on a part.
    const found: { type: string; example: unknown; description: string }[] = []
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk)
      else if (typeof value === 'object' && value !== null) {
        const field = value as Record<string, unknown>
        if (field['key'] === 'measure' && typeof field['type'] === 'string') {
          found.push({ type: field['type'], example: field['example'], description: String(field['description']) })
        }
        Object.values(field).forEach(walk)
      }
    }
    walk([KIND_SPECS, SHAPE_SPECS])
    expect(found.length, 'the kinds door publishes no measure field at all').toBeGreaterThan(0)
    for (const field of found) {
      for (const word of MEASURE_PRESETS) expect(field.type).toContain(word)
      expect(field.type).not.toContain('readable')
      expect(field.example).toBe('narrow')
      expect(field.description).toContain('full, wide, narrow, narrowest')
    }
  })
})

describe('a block written with narrow is drawn at var(--read), and narrowest at 26rem', () => {
  let draw: (blocks: SummaryBlock[]) => string

  beforeAll(async () => {
    // The smallest stand-in that lets the browser modules load, as tests/blocks-profiles.test.ts uses.
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
    const sb = await import('../src/web/components/SummaryBlocks.tsx')
    draw = (blocks) =>
      renderToStaticMarkup(h(sb.SummaryBlocks, { blocks, inRecord: { recordId: 'rec-1', kind: 'report' } } as never))
  })

  it('writes var(--read) for narrow and 26rem for narrowest into the markup the browser draws', () => {
    const html = draw([
      { id: 'b-narrow', type: 'text', text: PROSE, measure: 'narrow' },
      { id: 'b-narrowest', type: 'text', text: PROSE, measure: 'narrowest' },
    ] as SummaryBlock[])
    expect(html).toMatch(/data-measure="narrow"[^>]*--sb-measure:var\(--read\)/)
    expect(html).toMatch(/data-measure="narrowest"[^>]*--sb-measure:26rem/)
  })

  it('reports the same two widths without a browser', () => {
    expect(measureMaxWidth('narrow')).toBe('var(--read)')
    expect(measureMaxWidth('narrowest')).toBe('26rem')
    expect(measureDrawn('narrow', 1164, 16, 544).drawnPx).toBe(544)
    expect(measureDrawn('narrowest', 1164, 16, 544).drawnPx).toBe(416)
  })
})
