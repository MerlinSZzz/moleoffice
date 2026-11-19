// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD PAGE IS A TREE OF DECLARED SECTIONS, AND THE REPORT BODY IS ONE SECTION OF IT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS BEING WATCHED
 * ---------------------------------------------------------------------------------------------
 *
 * A person right-clicks a paragraph on a record page and the browser walks UP until it finds
 * something that says what it is. Measured on 29 August 2026, on four of the five records the owner
 * named that walk found one answer and one only: the record itself. `recordRegionsOf` in
 * src/shared/regions.ts is the tree between a paragraph and the record.
 *
 * ---------------------------------------------------------------------------------------------
 * THE HARDEST THING HERE IS THE ONE THAT WOULD FAIL SILENTLY
 * ---------------------------------------------------------------------------------------------
 *
 * A REGION ID IS STORED. A comment's target holds one, so an id that changed its spelling is a
 * comment that quietly stopped pointing at anything — no error, no failing route, nothing on a
 * screen. The report body is put under its section by COPYING the root object with a new parent, so
 * that no id beneath it is ever rewritten, and the first test below compares the two id lists
 * character for character.
 *
 * `design/problem-03/baseline/record-regions.mts` makes the same comparison over the whole live
 * database — 750 records — and `design/problem-03/baseline/region-ids.mts` diffs the ids `regionsOf`
 * derives against a file committed before the build. This file is the part of that proof that ships
 * with the code and fails on a laptop with no database.
 *
 * ---------------------------------------------------------------------------------------------
 * AND THE SECOND: PROBLEM 1 IS ACCEPTED AND MUST NOT MOVE
 * ---------------------------------------------------------------------------------------------
 *
 * How wide a part of a report is drawn is `widthNeededBy` and `leastNeededBy`, and both walk a tree
 * derived by `regionsOf`. The new root role `recordRoot` must be unreachable from either. It is
 * unreachable because `regionsOf` cannot produce it — there is no block type that derives it and no
 * arm that writes it — and that is what the tests here assert, one from the block table and one by
 * walking a report holding every declared block type.
 */

import { describe, expect, it } from 'vitest'
import {
  carriesTarget,
  DERIVED_BLOCK_TYPES,
  flatten,
  RECORD_ROOT_ID,
  recordRegionsOf,
  regionsOf,
  ROLE_OF,
  ROLE_OF_BLOCK,
  roleOfBlock,
  sectionRegionId,
  type Region,
} from '../src/shared/regions.ts'
import { READING_MATTER_KEY, SECTIONS_OF, TITLE_LINE_KEY } from '../src/shared/sections.ts'
import { RECORD_KINDS, type RecordKind, type SummaryBlock } from '../src/shared/types.ts'

/**
 * A REPORT WITH SOMETHING OF EVERY SHAPE THAT NAMES A REGION BY POSITION rather than by a stored
 * id: prose cut into paragraphs, a bullet group, a markdown table, a fenced code block, a nested
 * section and a table block with rows and cells. Those are the ids a re-parenting mistake would
 * change, because they are built from character offsets and array indices rather than from ids.
 */
const REPORT: SummaryBlock[] = [
  {
    id: 'b-1',
    type: 'text',
    heading: 'The short answer',
    text: 'The first paragraph runs to here.\n\nThe second one starts here and is longer than the first.\n\n- one bullet\n- and another\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nsome code\n```\n',
  } as SummaryBlock,
  {
    id: 'b-2',
    type: 'section',
    title: 'A section holding two things',
    blocks: [
      { id: 'b-3', type: 'text', text: 'A paragraph inside the section.' },
      { id: 'b-4', type: 'table', caption: 'A caption', rows: [{ cells: ['head', 'also'] }, { cells: ['one', 'two'] }] },
    ],
  } as unknown as SummaryBlock,
  { id: 'b-5', type: 'list', items: ['first item', 'second item'] } as unknown as SummaryBlock,
]

/** One record's stored data, as `recordRegionsOf` wants it. */
const moduleData = {
  summary: 'The curated paragraph above the blocks.\n\nAnd a second paragraph of it.',
  summaryBlocks: REPORT,
  context: 'Why any of this exists, written as one paragraph.',
  consequence: { bearer: 'dependent', what: 'The ranked list is computed from these words.' },
}

const ids = (region: Region): string[] => flatten(region).map((one) => one.id)

/** The report body inside a record tree: the one region whose role says it is a report body. */
function bodyOf(root: Region): Region {
  const found = flatten(root).find((one) => one.role === 'reportBody')
  if (found === undefined) throw new Error('the record tree holds no report body')
  return found
}

describe('the report body is re-parented and never rewritten', () => {
  it('gives every id under the body the same characters it had on its own', () => {
    const alone = regionsOf({ field: 'summaryBlocks', blocks: REPORT })
    const inside = bodyOf(recordRegionsOf({ relations: [], title: 'The ranked list', summary: null, kind: 'module', data: moduleData }))

    // THE CONTROL. If the fixture derived one region the comparison would pass and say nothing.
    expect(ids(alone).length).toBeGreaterThan(20)
    expect(ids(inside)).toEqual(ids(alone))
  })

  it('changes the body root parent and nothing else about it', () => {
    const alone = regionsOf({ field: 'summaryBlocks', blocks: REPORT })
    const inside = bodyOf(recordRegionsOf({ relations: [], title: 'The ranked list', summary: null, kind: 'module', data: moduleData }))

    expect(alone.parentId).toBe(null)
    expect(inside.parentId).toBe(sectionRegionId(READING_MATTER_KEY))
    // THE ROOT'S OWN ID DOES NOT MOVE EITHER. It is still the stored block field, which is what
    // every id underneath is built from.
    expect(inside.id).toBe('data.summaryBlocks')
    expect(inside.role).toBe('reportBody')

    // NOTHING UNDERNEATH WAS RE-PARENTED. A cascade would have rewritten these to the section.
    for (const child of inside.children) expect(child.parentId).toBe('data.summaryBlocks')
    for (const one of flatten(inside)) {
      if (one.id === inside.id) continue
      expect(one.parentId?.startsWith('data.'), `${one.id} hangs off ${String(one.parentId)}`).toBe(true)
    }
  })

  it('leaves the tree it copied from untouched', () => {
    const alone = regionsOf({ field: 'summaryBlocks', blocks: REPORT })
    const before = JSON.stringify(alone)
    recordRegionsOf({ relations: [], title: 'The ranked list', summary: null, kind: 'module', data: moduleData })
    expect(JSON.stringify(regionsOf({ field: 'summaryBlocks', blocks: REPORT }))).toBe(before)
  })

  it('puts the body after the curated paragraph and before the sections under it', () => {
    const reading = flatten(recordRegionsOf({ relations: [], title: 'The ranked list', summary: null, kind: 'module', data: moduleData })).find(
      (one) => one.id === sectionRegionId(READING_MATTER_KEY),
    )
    expect(reading).toBeDefined()
    const order = (reading as Region).children.map((one) => one.id)
    expect(order[0]).toBe('data.summary@0')
    expect(order).toContain('data.summaryBlocks')
    expect(order.indexOf('data.summaryBlocks')).toBeLessThan(order.indexOf(sectionRegionId('context')))
  })
})

describe('problem 1 cannot move: the record root is unreachable from every width path', () => {
  it('is not a role any stored block derives', () => {
    for (const type of DERIVED_BLOCK_TYPES) {
      expect(ROLE_OF_BLOCK[type], `${type} derives the record root`).not.toBe('recordRoot')
    }
    for (const block of REPORT) expect(roleOfBlock(block)).not.toBe('recordRoot')
  })

  it('is nowhere in a derived report, which is the only tree a width is asked about', () => {
    const roles = new Set(flatten(regionsOf({ field: 'blocks', blocks: REPORT })).map((one) => one.role))
    expect(roles.has('recordRoot')).toBe(false)
    // THE CONTROL: the walk really did visit a tree with several roles in it.
    expect(roles.size).toBeGreaterThan(5)
  })

  it('says the same six facts as the report body, so a role added above it changed nothing', () => {
    expect(ROLE_OF.recordRoot).toEqual(ROLE_OF.reportBody)
  })
})

describe('what carries a target', () => {
  it('refuses the record root, which is the record and already has a name of its own', () => {
    const root = recordRegionsOf({ relations: [], title: 'The ranked list', summary: null, kind: 'module', data: moduleData })
    expect(root.id).toBe(RECORD_ROOT_ID)
    expect(root.declared).toBe(false)
    expect(carriesTarget(root)).toBe(false)
  })

  it('allows a declared section holding nothing, because its heading is on the screen', () => {
    const root = recordRegionsOf({ relations: [], title: 'A note somebody left', summary: null, kind: 'note', data: { body: 'a note' } })
    const history = flatten(root).find((one) => one.id === sectionRegionId('history'))
    expect(history).toBeDefined()
    expect((history as Region).text).toBe('')
    expect((history as Region).children).toEqual([])
    expect((history as Region).declared).toBe(true)
    expect(carriesTarget(history as Region)).toBe(true)
  })

  it('still refuses an empty region nobody declared', () => {
    const cell = flatten(regionsOf({ field: 'blocks', blocks: [
      { id: 'b-9', type: 'table', rows: [{ cells: ['', 'here'] }] } as unknown as SummaryBlock,
    ] })).find((one) => one.id === 'data.blocks[#b-9].rows[0].cells[0]')
    expect(cell).toBeDefined()
    expect((cell as Region).declared).toBe(false)
    expect(carriesTarget(cell as Region)).toBe(false)
  })

  it('marks nothing in a report as declared', () => {
    for (const one of flatten(regionsOf({ field: 'blocks', blocks: REPORT }))) {
      expect(one.declared, `${one.id} claims to be a declared section`).toBe(false)
    }
  })
})

describe('the text is carried out of the record and not looked up again', () => {
  it('cuts a record field into the paragraphs inside it, with the record’s own characters', () => {
    const root = recordRegionsOf({
      relations: [],
      title: 'A problem with two paragraphs of cause',
      summary: null,
      kind: 'problem',
      data: { cause: 'The first cause paragraph.\n\nThe second cause paragraph.' },
    })
    const cut = flatten(root).filter((one) => one.field === 'data.cause')
    expect(cut.map((one) => one.id)).toEqual(['data.cause@0', 'data.cause@28'])
    expect(cut[0]?.text).toBe('The first cause paragraph.\n')
    expect(cut[1]?.text).toBe('The second cause paragraph.')
  })

  it('gives one region per entry of a stored list, named the way the record page names one', () => {
    const root = recordRegionsOf({
      relations: [],
      title: 'A problem seen in two places',
      summary: null,
      kind: 'problem',
      data: { seen_in: ['one place', 'another place'] },
    })
    const lines = flatten(root).filter((one) => one.role === 'bullet')
    expect(lines.map((one) => one.id)).toEqual(['data.seen_in[0]', 'data.seen_in[1]'])
    expect(lines.map((one) => one.text)).toEqual(['one place', 'another place'])
  })

  it('cuts nothing out of a shape the page draws as a panel, and still declares the section', () => {
    const root = recordRegionsOf({
      relations: [],
      title: 'A module with one part',
      summary: null,
      kind: 'module',
      data: { parts: [{ id: 'p-1', name: 'A part', items: [{ id: 'i-1', text: 'an item' }] }] },
    })
    const parts = flatten(root).find((one) => one.id === sectionRegionId('parts'))
    expect(parts, 'a module’s Parts panel has no section').toBeDefined()
    expect((parts as Region).children).toEqual([])
    expect(carriesTarget(parts as Region)).toBe(true)
    // AND NOTHING ANYWHERE IN THE TREE HOLDS THE WORDS A `String(object)` WOULD HAVE MADE.
    for (const one of flatten(root)) expect(one.text).not.toContain('[object Object]')
  })
})

describe('a section is derived when it is on this record’s page', () => {
  it('leaves out a field this record has not written', () => {
    const written = flatten(recordRegionsOf({ relations: [], title: 'A problem with a cause', summary: null, kind: 'problem', data: { cause: 'a cause' } })).map((one) => one.id)
    expect(written).toContain(sectionRegionId('cause'))
    expect(written).not.toContain(sectionRegionId('fix'))
  })

  it('leaves out the consequence panel when nobody is behind the consequence', () => {
    const none = recordRegionsOf({
      relations: [],
      title: 'A problem nobody is behind',
      summary: null,
      kind: 'problem',
      data: { consequence: { bearer: 'none', what: 'nothing' } },
    })
    expect(flatten(none).map((one) => one.id)).not.toContain(sectionRegionId('consequence'))

    const someone = recordRegionsOf({
      relations: [],
      title: 'A problem somebody waits on',
      summary: null,
      kind: 'problem',
      data: { consequence: { bearer: 'person', what: 'somebody waits' } },
    })
    const panel = flatten(someone).find((one) => one.id === sectionRegionId('consequence'))
    expect(panel).toBeDefined()
    expect((panel as Region).children.map((one) => one.text)).toEqual(['somebody waits'])
  })

  /**
   * CHANGED ON 3 SEPTEMBER 2026, criterion A14b. It asserted TWO regions here — one for a stored
   * `label` and one for a stored `gist`, in ladder order — because both were forms somebody wrote
   * beside the record. Reading length 3 is the record's own `summary` column now, so a stored
   * `gist` is a retired key: it stays on disk and nothing reads it back, which is what makes
   * "nothing draws it" true rather than a rule every surface has to remember. The label is the one
   * whole-record form still stored, so it is the one region here — and the gist written beside it
   * in this fixture is what proves the retired key is passed over rather than simply absent.
   */
  it('gives one region for the label, and none for a retired key still on disk', () => {
    const root = recordRegionsOf({
      relations: [],
      title: 'A report with a label written and a retired gist on disk',
      summary: null,
      kind: 'report',
      data: {
        blocks: REPORT,
        shortForms: {
          gist: { text: 'The gist of it, in one line.', madeFrom: { seq: 3, contentHash: 'abc' }, writtenBy: 'agent' },
          label: { text: 'A little of it.', madeFrom: { seq: 3, contentHash: 'abc' }, writtenBy: 'human' },
        },
      },
    })
    const forms = flatten(root).find((one) => one.id === sectionRegionId('shortForms'))
    expect(forms).toBeDefined()
    expect((forms as Region).children.map((one) => one.id)).toEqual(['data.shortForms.label.text'])
    expect((forms as Region).children.map((one) => one.text)).toEqual(['A little of it.'])
  })

  /**
   * THE RECORD'S OWN TITLE IS A PLACE ON THE PAGE, added 3 September 2026 with criterion A14b. It
   * is reading length 2 of a report, drawn in the report's own body, so a person right-clicking it
   * has to reach a part the server can find. It is declared on a report and on no other kind,
   * because nothing else draws a title as a length.
   *
   * A MODULE HOLDS BLOCKS AND GETS NO TITLE SECTION, since 30 September 2026 (problem
   * 41hWb2rbLJSU). Its panel draws the blocks without the record's stored words, so it never draws
   * the title as a length, and a section for it was a place no press could reach. Mutation: put
   * back `blocksFieldOf(kind) !== null` as the condition in `sectionsDeclaredBy` in
   * src/shared/sections.ts, and the module expectation below fails with section.titleLine present.
   */
  it('gives the record’s own title a section on a report, and none on a module or a note', () => {
    const report = flatten(
      recordRegionsOf({ relations: [], title: 'What the bench said', summary: null, kind: 'report', data: { blocks: REPORT } }),
    )
    const titleHere = report.find((one) => one.id === sectionRegionId(TITLE_LINE_KEY))
    expect(titleHere).toBeDefined()
    expect((titleHere as Region).text).toBe('What the bench said')

    const note = flatten(
      recordRegionsOf({ relations: [], title: 'A note about the bench', summary: null, kind: 'note', data: { body: 'Some writing.' } }),
    ).map((one) => one.id)
    expect(note).not.toContain(sectionRegionId(TITLE_LINE_KEY))

    const module = flatten(
      recordRegionsOf({ relations: [], title: 'The bench rig', summary: null, kind: 'module', data: moduleData }),
    ).map((one) => one.id)
    expect(module).toContain('data.summaryBlocks')
    expect(module).not.toContain(sectionRegionId(TITLE_LINE_KEY))
  })
})

describe('the tree hangs together for every kind', () => {
  it('reaches every region from the root, on every kind, with nothing orphaned', () => {
    for (const kind of RECORD_KINDS) {
      const root = recordRegionsOf({ kind, data: {}, title: 'A record of this kind', summary: null, relations: [] })
      const all = flatten(root)
      const known = new Set(all.map((one) => one.id))
      for (const one of all) {
        if (one.parentId === null) continue
        expect(known.has(one.parentId), `${one.id} on ${kind} hangs off ${one.parentId}, which is not here`).toBe(true)
      }
    }
  })

  it('names a parent every kind actually declares, so no section can fall out of the tree', () => {
    for (const kind of RECORD_KINDS) {
      const keys = new Set(SECTIONS_OF[kind].map((one) => one.key))
      for (const spec of SECTIONS_OF[kind]) {
        if (spec.inside === null) continue
        expect(keys.has(spec.inside), `${kind}.${spec.key} sits inside ${spec.inside}, which ${kind} does not declare`).toBe(true)
      }
    }
  })

  it('gives a kind it does not know a root and no sections, rather than throwing a page away', () => {
    const root = recordRegionsOf({
      relations: [],
      title: 'A record from a newer build',
      summary: null,
      kind: 'a_kind_from_a_newer_build' as RecordKind,
      data: { cause: 'words' },
    })
    expect(root.id).toBe(RECORD_ROOT_ID)
    expect(root.role).toBe('recordRoot')
    expect(root.children).toEqual([])
  })
})
