// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PANEL THAT DRAWS ONE SECTION OF A RECORD SAYS SO, AND SAYS IT WITH THE TREE'S OWN ID.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS BEING WATCHED
 * ---------------------------------------------------------------------------------------------
 *
 * `sectionsOf` in src/web/components/sections.ts is what a panel on a record page puts in its
 * `declares` prop. It has exactly two honest answers and one failure, and all three are here:
 *
 *   · the record HAS this section  → a `region` target carrying `section.<key>`;
 *   · the record has NOT filled it → see-through, and the walk carries on to the record;
 *   · the kind declares no such key → it throws, because that is a mistyped string in this
 *     repository and not a state any record is in.
 *
 * ---------------------------------------------------------------------------------------------
 * THE ONE THAT WOULD FAIL SILENTLY IS THE SECOND
 * ---------------------------------------------------------------------------------------------
 *
 * A module with no paths still draws its Paths panel, saying "none linked" inside it. If that panel
 * declared `section.paths` anyway, the press would name a region the tree does not hold, the server
 * would answer `gone`, and the person would be told the part they are looking at is not there. So
 * the browser asks the SAME function the tree is built from — `sectionsOnThisRecord` — and this
 * file checks that the two agree over every kind rather than trusting that they do.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE CANNOT SEE
 * ---------------------------------------------------------------------------------------------
 *
 * Whether the panel a person presses is the panel that declares the section. That is a browser
 * question, and `design/problem-03/baseline/five-sections.mjs` answers it by right-clicking five
 * sections of a real module at real coordinates and reading the composer.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { sectionsOf, theRegion } from '../src/web/components/sections.ts'
import { flatten, recordRegionsOf, sectionRegionId, sectionsOnThisRecord } from '../src/shared/regions.ts'
import { READING_MATTER_KEY, SECTIONS_OF } from '../src/shared/sections.ts'
import { RECORD_KINDS, type RecordKind } from '../src/shared/types.ts'
import { TARGET_ATTRIBUTE } from '../src/shared/targets.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: 'owner' } as const

let t: TestDb
let targets: typeof import('../src/server/lib/targets.ts')

beforeAll(async () => {
  t = await freshDb()
  targets = await import('../src/server/lib/targets.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

/** A module with a context and a curated paragraph written, and no paths, no parts and no links. */
const MODULE = {
  id: 'mod00000000a',
  kind: 'module' as const,
  data: {
    context: 'Why this module exists, in one paragraph.',
    summary: 'What it does now.',
  },
  // THE ENVELOPE TITLE, the column beside the one-liner below.
  title: 'Wrist mount',
  // THE ENVELOPE ONE-LINER, WHICH IS NOT `data.summary` ABOVE. This fixture has none, and `null`
  // says so: a module with no envelope summary draws "No summary was written for this record" and
  // has no `section.summaryLine`.
  summary: null,
  // NOTHING IS JOINED TO IT. `[]` is a statement about this module and not a gap in the fixture:
  // a record with no links has no relation section, and the panels below ask for none.
  relations: [],
}

describe('a panel declares the section it draws, with the id the tree holds', () => {
  it('gives a written section the region id `recordRegionsOf` put in the tree', () => {
    const says = sectionsOf(MODULE)('context')
    expect(says).toEqual({
      about: { kind: 'region', recordId: MODULE.id, regionId: 'section.context' },
    })
    // AND IT IS NOT A SECOND SPELLING OF THAT ID. The tree is derived and the id is looked for in
    // it, so a change to how a section id is written fails here rather than leaving the screen
    // pointing at a name the server cannot find.
    const inTheTree = flatten(recordRegionsOf(MODULE)).map((one) => one.id)
    expect(inTheTree).toContain('section.context')
  })

  it('gives the reading matter its section, on the one kind that stores prose and blocks both', () => {
    expect(sectionsOf(MODULE)(READING_MATTER_KEY)).toEqual({
      about: { kind: 'region', recordId: MODULE.id, regionId: sectionRegionId(READING_MATTER_KEY) },
    })
  })

  it('is see-through for a section this record has not filled, so the walk reaches the record', () => {
    // `paths` is a declared field of a module. This module has not written one, and the panel is
    // still drawn — with "none linked" in it — so the panel must say nothing rather than name a
    // region that is not in the tree.
    expect(sectionsOf(MODULE)('paths')).toEqual({ surface: null })
    expect(flatten(recordRegionsOf(MODULE)).map((one) => one.id)).not.toContain('section.paths')
  })

  it('throws on a key the kind does not declare, and names the ones it does', () => {
    expect(() => sectionsOf(MODULE)('nonesuch')).toThrow(/declares no such section/)
    expect(() => sectionsOf(MODULE)('nonesuch')).toThrow(/context/)
    // THE KIND IS NAMED IN THE READER'S WORD. The machine-word gate refuses a stored word written
    // into a sentence somebody reads, and this sentence is one.
    expect(() => sectionsOf(MODULE)('nonesuch')).toThrow(/section of a module/)
  })

  it('agrees with the region tree about every section of every kind', () => {
    // ONE RULE, ASKED TWICE, COMPARED. If `sectionsOf` grew a rule of its own about which sections
    // a record has, this is where the two answers part company.
    for (const kind of RECORD_KINDS) {
      const data = { context: 'x', summary: 'y', cause: 'z' }
      // AN ENVELOPE SUMMARY AS WELL AS A `data.summary`, so the two are told apart on every kind:
      // `section.summaryLine` is the first and `section.summary` is the second, and a build that
      // folded them into one id would fail here on all twenty-six.
      const record = {
        id: 'rec000000001',
        kind: kind as RecordKind,
        data,
        title: 'One title.',
        summary: 'One line.',
        relations: [],
      }
      const asks = sectionsOf(record)
      const inTheTree = new Set(
        flatten(recordRegionsOf(record))
          .filter((one) => one.declared)
          .map((one) => one.id),
      )
      for (const spec of SECTIONS_OF[kind as RecordKind]) {
        const says = asks(spec.key)
        const named = 'about' in says
        expect(named, `${kind}.${spec.key}`).toBe(inTheTree.has(sectionRegionId(spec.key)))
      }
      // And the same list, counted the other way round, so a section the tree holds and the browser
      // would never declare shows up too.
      const here = sectionsOnThisRecord(record).map((spec) => spec.key)
      expect(new Set(here.map(sectionRegionId)), kind).toEqual(inTheTree)
    }
  })
})

describe('a line inside a section carries its own region', () => {
  it('writes one target attribute, through the one function that writes them', () => {
    expect(theRegion('rep000000001', 'data.shortForms.gist.text')).toEqual({
      [TARGET_ATTRIBUTE]: 'region/rep000000001/data.shortForms.gist.text',
    })
  })
})

// =========================================================================== and the server agrees

/**
 * THE SERVER LOOKS UP A SECTION IN THE SAME TREE THE BROWSER DREW FROM.
 *
 * Step B3 left this open in as many words: `TARGET_READERS.region` built its tree with `regionsOf`,
 * which derives the parts of a REPORT BODY and nothing else, so `checkTarget` accepted the name
 * `section.cause` and then answered 404 — *there is no part to point at* — about a fold a reader is
 * looking at. Two faults, both here:
 *
 *   · a section id resolved to nothing on a record that has that section;
 *   · a record of any kind but `report` or `module` had no region tree at all, so EVERY region
 *     target on the other 24 kinds answered `gone`.
 */
describe('a section a person pressed is a section the server can find', () => {
  it('resolves a section of a kind that holds no blocks, where it used to say the part is not there', () => {
    const problem = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'Two dev stacks trade the ports between them',
      data: { symptom: 'The API answers on one port and then on another.', cause: 'Two stacks, one tree.' },
      actor: HUMAN,
    })
    expect(() =>
      targets.checkTarget({ kind: 'region', recordId: problem.id, regionId: 'section.cause' }, WORKSPACE),
    ).not.toThrow()
    const held = targets.resolveTarget({ kind: 'region', recordId: problem.id, regionId: 'section.cause' })
    expect(held.answer).toBe('found')
    // AND IT HOLDS THE WORDS THAT SECTION HOLDS, so the composer names the right thing.
    expect(JSON.stringify(held)).toContain('Two stacks, one tree.')
  })

  it('still refuses a section this record has not filled, because that is true', () => {
    const problem = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'A problem with no fix written',
      data: { symptom: 'It stops.' },
      actor: HUMAN,
    })
    expectPanelError(
      t,
      () => targets.checkTarget({ kind: 'region', recordId: problem.id, regionId: 'section.fix' }, WORKSPACE),
      404,
    )
  })

  it('still resolves every part of a report body, at the id it always had', () => {
    const report = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'report',
      title: 'What the review found',
      data: { blocks: [{ id: 'b-1', type: 'text', text: 'The mount holds calibration through a full handover.' }] },
      actor: HUMAN,
    })
    for (const id of ['data.blocks[#b-1]', 'data.blocks[#b-1].text@0', 'section.summary']) {
      expect(() =>
        targets.checkTarget({ kind: 'region', recordId: report.id, regionId: id }, WORKSPACE),
      ).not.toThrow()
    }
  })
})
