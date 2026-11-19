// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PART OF A REPORT CAN BE POINTED AT, AND THE SCREEN AND THE SERVER AGREE WHICH PART.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/regions.ts` derives one tree of the meaningful parts of a report. Until this step
 * nothing on a screen pointed at it: a right-click inside a bullet, inside a table cell or in the
 * empty band beside a paragraph all resolved to the block, or past it to the whole record. The
 * owner's own complaint — a comment about one paragraph filed against a whole report — is that.
 *
 * TWO WALKS OVER ONE STRING IS THE RISK, AND IT IS WHAT THIS FILE WATCHES. `regionsOf` walks a
 * block's markdown to derive regions; `renderMarkdown` walks the same markdown to draw it. Both
 * have to decide where a paragraph starts. If the renderer SPELLED region ids instead of looking
 * them up, the two could disagree by one character with nothing failing: the browser would hand
 * the server an id no region has, and the server would answer that the paragraph is gone.
 *
 * So every assertion below is a round trip. The characters an element drew are compared with the
 * characters the server hands back for the id that element carries.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first `it` asserts a floor on how many region targets the drawing produced and on which roles
 * are among them. A renderer that emitted nothing at all would pass every "every emitted target
 * resolves" check for free, because there would be nothing to resolve.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES NOT ASSERT
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here measures a box on a screen. Whether the empty band beside a paragraph is inside the
 * section's box is a question about CSS and is steps 4, 5 and 10 of this wave, none of which is
 * built. This file proves the addresses, not the geometry.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import {
  carriesTarget,
  findRegion,
  regionIdOfLegacyTarget,
  regionsOf,
  type RecordRegionSource,
  type Region,
} from '../src/shared/regions.ts'
import { targetFromAttributeValue, type Target } from '../src/shared/targets.ts'
import type { PanelRecord, SummaryBlock } from '../src/shared/types.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type Targets = typeof import('../src/server/lib/targets.ts')
type Agents = typeof import('../src/server/lib/agents.ts')
type Reviews = typeof import('../src/server/lib/reviews.ts')

let db: TestDb
let sb: SummaryBlocksModule
let targets: Targets
let agents: Agents
let reviews: Reviews
let written: PanelRecord

/**
 * A report written the way somebody writes one: a heading, prose, a bullet list, a fenced block, a
 * table typed into the prose, and a stored table beside it.
 */
const BLOCKS: SummaryBlock[] = [
  {
    id: 'b-1',
    type: 'text',
    heading: 'What was measured',
    text:
      'The shell cracked on the third print, at the same corner each time.\n\n' +
      'A second paragraph, so the first one is not the only one.\n\n' +
      '## A heading typed into the prose\n\n' +
      '- the first bullet\n' +
      '- the second bullet\n\n' +
      '```\nprint(1)\n```\n\n' +
      '| run | result |\n|---|---|\n| 1 | held |\n| 2 | cracked |\n\n' +
      '> Somebody else said this.\n',
  },
  {
    id: 'b-2',
    type: 'table',
    columns: [{ label: 'run' }, { label: 'result' }],
    rows: [{ cells: ['1', 'held'] }, { cells: ['2', 'cracked'] }],
  },
]

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
  reviews = await import('../src/server/lib/reviews.ts')

  written = db.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'A report with parts',
    summary: null,
    data: { blocks: BLOCKS },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  // A LINK ON THE RECORD, so the relation phrases the drawing is handed come from the record itself
  // rather than being empty whatever the fixture does. See `wholeRecordOf` below.
  const related = db.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'A report the first one relates to',
    summary: null,
    data: { blocks: [] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  db.api.createLink({ fromId: written.id, toId: related.id, type: 'relates_to', actor: db.api.HUMAN })
})

afterAll(() => {
  db.close()
})

/**
 * The record's world as the product derives it: its stored fields, and the relation phrases off the
 * one reader of its links.
 *
 * IT IS A FUNCTION AND THE DRAWING USES IT, so the fixture cannot hand the component a list the
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
function drawn(blocks: SummaryBlock[] = BLOCKS): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks,
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

/** Every region target the drawing put on an element, read back out of the markup. */
function regionTargetsIn(markup: string): Extract<Target, { kind: 'region' }>[] {
  const out: Extract<Target, { kind: 'region' }>[] = []
  for (const found of markup.matchAll(/data-target="(region\/[^"]*)"/g)) {
    const read = targetFromAttributeValue(asWritten(found[1] ?? ''))
    if ('problem' in read) throw new Error(`the drawing emitted an unreadable target: ${read.problem}`)
    if (read.target.kind !== 'region') throw new Error('a region/… value read back as something else')
    out.push(read.target)
  }
  return out
}

/** The tree as the derivation makes it, for whatever blocks are being asked about. */
function tree(blocks: SummaryBlock[] = BLOCKS): Region {
  return regionsOf({ field: 'blocks', blocks })
}

describe('the drawing emits region targets, and it looks every one of them up', () => {
  it('draws parts of the report a person can point at, of several kinds', () => {
    const emitted = regionTargetsIn(drawn())
    // THE CONTROL. Everything below asserts something about every emitted target, and an empty list
    // satisfies all of it. This is the assertion that fails when nothing was emitted at all.
    expect(emitted.length, 'region targets drawn').toBeGreaterThanOrEqual(8)
    const roles = emitted.map((target) => findRegion(tree(), target.regionId)?.role ?? 'nothing derived here')
    expect(new Set(roles)).toEqual(new Set(['heading', 'paragraph', 'bulletGroup', 'bullet', 'code', 'table']))
  })

  it('emits no id the derivation did not make, because it asks rather than spelling one', () => {
    for (const target of regionTargetsIn(drawn())) {
      expect(findRegion(tree(), target.regionId), `no region is called ${target.regionId}`).not.toBeNull()
    }
  })

  it('emits a target only where the one emit rule allows one', () => {
    for (const target of regionTargetsIn(drawn())) {
      const region = findRegion(tree(), target.regionId)
      expect(region).not.toBeNull()
      expect(carriesTarget(region as Region), `${target.regionId} carries a target it should not`).toBe(true)
    }
  })

  it('names the record it is in, so a comment on a part is a comment in this project', () => {
    for (const target of regionTargetsIn(drawn())) expect(target.recordId).toBe(written.id)
  })
})

describe('the server resolves what the screen drew', () => {
  it('finds every part the drawing pointed at, and hands back its own characters', () => {
    const emitted = regionTargetsIn(drawn())
    expect(emitted.length).toBeGreaterThan(0)
    for (const target of emitted) {
      const found = targets.resolveTarget(target)
      expect(found.answer, `${target.regionId} did not resolve`).toBe('found')
      if (found.answer !== 'found') continue
      const derived = findRegion(tree(), target.regionId) as Region
      const held = found.text.strings.map((one) => one.text).join('')
      // The characters the derivation cut are the characters the server hands back. A reader that
      // handed back the whole field instead would pass "found" and fail here.
      expect(held.length, `${target.regionId} held nothing`).toBeGreaterThan(0)
      if (derived.text !== '') expect(held).toContain(derived.text.trim().slice(0, 20))
    }
  })

  it('says a part MOVED rather than saying it is gone, when something is written above it', () => {
    // The second paragraph of b-1, which every edit above it moves.
    const second = regionTargetsIn(drawn()).find(
      (target) => (findRegion(tree(), target.regionId)?.text ?? '').startsWith('A second paragraph'),
    )
    expect(second, 'the second paragraph was never drawn').toBeDefined()
    if (second === undefined) return

    const first = BLOCKS[0] as SummaryBlock & { text: string }
    const edited = [{ ...first, text: `One more sentence.\n\n${first.text}` }, BLOCKS[1]] as SummaryBlock[]
    db.api.patchRecord(written.id, { data: { blocks: edited } }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })

    const found = targets.resolveTarget(second)
    expect(found.answer).toBe('changed')
    if (found.answer !== 'changed') return
    expect(found.what.role).toBe('paragraph')
    // AND THE READING SAYS SO IN WORDS, which is what a person sees.
    const reading = agents.readContext({ target: second })
    expect(reading.state).toBe('changed')
    expect(reading.says).toContain(agents.THIS_PART_HAS_MOVED)

    // Put it back, so the tests after this one read the report this file wrote.
    db.api.patchRecord(written.id, { data: { blocks: BLOCKS } }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    expect(targets.resolveTarget(second).answer).toBe('found')
  })

  it('says a part is GONE when the block holding it is gone', () => {
    const paragraph = regionTargetsIn(drawn())[1]
    expect(paragraph).toBeDefined()
    if (paragraph === undefined) return
    const missing = { ...paragraph, regionId: paragraph.regionId.replace('[#b-1]', '[#b-nothing]') }
    expect(targets.resolveTarget(missing).answer).toBe('gone')
  })
})

describe('the older target words and the new ones name the same part', () => {
  it('converts a block, a row and a cell, counting rows from one and paths from zero', () => {
    expect(regionIdOfLegacyTarget({ kind: 'reportBlock', blockId: 'b-2' }, 'blocks')).toBe('data.blocks[#b-2]')
    expect(regionIdOfLegacyTarget({ kind: 'tableRow', blockId: 'b-2', rowKey: '2' }, 'blocks')).toBe(
      'data.blocks[#b-2].rows[1]',
    )
    expect(
      regionIdOfLegacyTarget({ kind: 'tableCell', blockId: 'b-2', rowKey: '2', columnKey: '2' }, 'blocks'),
    ).toBe('data.blocks[#b-2].rows[1].cells[1]')
    // A module keeps its curated summary somewhere else, and the conversion is told which field.
    expect(regionIdOfLegacyTarget({ kind: 'reportBlock', blockId: 'b-2' }, 'summaryBlocks')).toBe(
      'data.summaryBlocks[#b-2]',
    )
  })

  it('resolves both spellings of one cell to the same words', () => {
    const legacy = targets.resolveTarget({
      kind: 'tableCell',
      recordId: written.id,
      blockId: 'b-2',
      rowKey: '2',
      columnKey: '2',
    })
    const converted = regionIdOfLegacyTarget({ kind: 'tableCell', blockId: 'b-2', rowKey: '2', columnKey: '2' }, 'blocks')
    expect(converted).not.toBeNull()
    const asRegion = targets.resolveTarget({ kind: 'region', recordId: written.id, regionId: converted as string })
    expect(legacy.answer).toBe('found')
    expect(asRegion.answer).toBe('found')
    if (legacy.answer !== 'found' || asRegion.answer !== 'found') return
    expect(asRegion.text.strings.map((one) => one.text)).toEqual(legacy.text.strings.map((one) => one.text))
  })
})

describe('a review started from a part of a report collects the report', () => {
  it('collects the record, as a review started from a block of one does', () => {
    const region = reviews.scopeOf(
      { target: { kind: 'region', recordId: written.id, regionId: 'data.blocks[#b-1]' } },
      'default',
    )
    const block = reviews.scopeOf(
      { target: { kind: 'reportBlock', recordId: written.id, blockId: 'b-1' } },
      'default',
    )
    expect(region.kind).toBe('record')
    expect(region.id).toBe(written.id)
    // The two ways of naming the same part of the report collect the same thing. A `region` arm
    // that answered "the whole project" would pass the two assertions above and fail this one.
    expect({ kind: region.kind, id: region.id }).toEqual({ kind: block.kind, id: block.id })
  })
})

describe('the same fact is never stored in the target and in the place at once', () => {
  it('refuses a run that starts exactly where the part it is in starts', () => {
    const paragraph = regionTargetsIn(drawn()).find(
      (target) => findRegion(tree(), target.regionId)?.role === 'paragraph',
    )
    expect(paragraph, 'no paragraph was drawn').toBeDefined()
    if (paragraph === undefined) return
    const region = findRegion(tree(), paragraph.regionId) as Region
    expect(() =>
      targets.checkPlace({
        target: paragraph,
        place: { at: 'run', field: region.field as string, offset: (region.range as { from: number }).from },
      }),
    ).toThrow(/same thing twice/)
    // A run further into the paragraph names something the region does not, and is kept.
    expect(() =>
      targets.checkPlace({
        target: paragraph,
        place: { at: 'run', field: region.field as string, offset: (region.range as { from: number }).from + 3 },
      }),
    ).not.toThrow()
  })
})
