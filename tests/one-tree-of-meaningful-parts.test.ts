// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT HAS ONE TREE OF MEANINGFUL PARTS, AND NO TWO OF THEM SHARE A NAME.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A report's layout, what a right-click means, and what an annotation points at are decided by
 * three separate mechanisms that share no structure. `src/shared/regions.ts` is the one tree all
 * three are meant to read. If two parts of one report can carry the same name, an annotation left
 * on the second is drawn on the first, silently, and nothing fails.
 *
 * It is not a hypothetical. Naming every derived region by where it STARTS gives 18 collisions
 * across the eight stored reports, because a bullet group and its first bullet begin at the same
 * character and so do a markdown table and its first row. The grammar's answer is that a derived
 * CONTAINER is named by the half-open range it covers and a derived LEAF by where it starts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND THE CONTROL THAT STOPS A TEST THAT MEASURED NOTHING PASSING
 * ---------------------------------------------------------------------------------------
 *
 * The fixture below is not a tidy example. It holds the two shapes that collide — a one-item bullet
 * group and a one-row table, each inside prose — plus every one of the twenty stored block types,
 * so a walk that quietly skipped a type cannot pass. The first `it` asserts the tree is big enough
 * to be worth counting, which is the control: a derivation that returned nothing would fail there
 * rather than passing the uniqueness check for free.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES NOT ASSERT
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here says a region is DRAWN. This file proves the derivation. Whether the browser emits
 * an element per region, and whether a right-click resolves to one, is a different step and has no
 * test in this wave — said here so nobody reads a green run as proof of a screen.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import {
  DERIVED_BLOCK_TYPES,
  LEASTS,
  REGION_ROLES,
  ROLE_OF,
  ROLE_OF_BLOCK,
  flatten,
  leastNeededByBlocks,
  regionsOf,
  roleOfBlock,
  stabilityOf,
  widthNeededBy,
  type Region,
} from '../src/shared/regions.ts'
import { SUMMARY_BLOCK_TYPES, type SummaryBlock } from '../src/shared/types.ts'

/**
 * A report holding every stored block type, and holding the two shapes that collide.
 *
 * `b-collide` is the whole point of the file: one paragraph, then a one-item bullet group, then a
 * one-row table. Each of the two containers begins at the same character as its only child.
 */
const EVERY_TYPE: SummaryBlock[] = [
  {
    id: 'b-collide',
    type: 'text',
    heading: 'A heading, so this is a section',
    text: 'An opening paragraph.\n\n- the only bullet\n\n| head a | head b |\n|---|---|\n| one | two |\n',
  },
  { id: 'b-passage', type: 'text', text: 'A run of prose nobody put a heading on.' },
  { id: 'b-heading', type: 'heading', text: 'A stored heading block' },
  { id: 'b-finding', type: 'finding', text: 'The one sentence.', detail: 'The evidence.\n\n- a bullet under it\n' },
  { id: 'b-callout', type: 'callout', tone: 'warning', title: 'Mind this', text: 'The caveat.' },
  { id: 'b-metrics', type: 'metrics', items: [{ id: 'm-1', label: 'Grip', value: '0.4', unit: 'N' }] },
  { id: 'b-kv', type: 'keyvalue', items: [{ id: 'k-1', label: 'Machine', value: 'thor' }] },
  { id: 'b-list', type: 'list', items: ['first', 'second'] },
  { id: 'b-check', type: 'checklist', items: [{ id: 'i-1', text: 'done thing', state: 'done' }] },
  { id: 'b-code', type: 'code', code: 'const x = 1\n', language: 'typescript', caption: 'A caption' },
  { id: 'b-quote', type: 'quote', text: 'Somebody else’s words.', source: THE_TEST_OFFICES_OWNER.name },
  { id: 'b-path', type: 'path', label: 'The report', path: `${THE_TEST_FIXTURE_ROOT}/report.md` },
  { id: 'b-chart', type: 'chart', spec: { kind: 'line', series: [] } as never, caption: 'A plot' },
  { id: 'b-math', type: 'math', tex: 'e^{i\\pi}+1=0', caption: 'Euler' },
  {
    id: 'b-table',
    type: 'table',
    columns: [{ label: 'a' }, { label: 'b' }],
    rows: [{ cells: ['one', 'two'] }, { cells: ['three', 4] }],
    caption: 'A stored table',
  },
  { id: 'b-time', type: 'timeline', items: [{ id: 't-1', when: '14 August', text: 'It happened.', detail: 'At length.' }] },
  { id: 'b-image', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/p.png`, alt: 'A picture', caption: 'What it shows' },
  {
    id: 'b-section',
    type: 'section',
    title: 'A container with a title',
    blocks: [{ id: 'b-inner', type: 'text', text: 'A block inside a section.' }],
  },
  {
    id: 'b-columns',
    type: 'columns',
    columns: [[{ id: 'b-col-1', type: 'text', text: 'Left.' }], [{ id: 'b-col-2', type: 'text', text: 'Right.' }]],
  },
  { id: 'b-grid', type: 'grid', blocks: [{ id: 'b-cell-1', type: 'text', text: 'One of many.' }] },
  {
    id: 'b-tabs',
    type: 'tabs',
    tabs: [{ id: 'tab-1', label: 'First', blocks: [{ id: 'b-under-tab', type: 'text', text: 'Under a tab.' }] }],
  },
  {
    id: 'b-beside',
    type: 'beside',
    parts: [
      // NEITHER PART HOLDS A PICTURE, and that is a choice about this fixture rather than about
      // compositions: `figure` is one of the three roles the census below names, and a second
      // picture anywhere in this tree would change that list without changing any rule.
      { id: 'part-1', blocks: [{ id: 'b-in-part', type: 'text', text: 'Beside a table.' }] },
      {
        id: 'part-2',
        blocks: [{ id: 'b-part-table', type: 'table', columns: [{ label: 'run' }], rows: [{ cells: [1] }] }],
      },
    ],
  },
]

const tree = (blocks: SummaryBlock[] = EVERY_TYPE): Region =>
  regionsOf({ field: 'blocks', blocks })

describe('one tree of meaningful parts', () => {
  it('derives enough of a tree to be worth counting, which is this file’s control', () => {
    const all = flatten(tree())
    expect(all.length).toBeGreaterThan(60)
    // Every top-level stored block reaches the tree, so a walk that dropped a type fails here.
    for (const block of EVERY_TYPE) {
      expect(
        all.some((region) => region.id === `data.blocks[#${block.id}]`),
        `nothing was derived for the stored ${block.type} block ${block.id}`,
      ).toBe(true)
    }
  })

  it('gives no two parts of one report the same name', () => {
    const all = flatten(tree())
    const seen = new Map<string, string[]>()
    for (const region of all) {
      const roles = seen.get(region.id)
      if (roles === undefined) seen.set(region.id, [region.role])
      else roles.push(region.role)
    }
    const shared = [...seen.entries()].filter(([, roles]) => roles.length > 1)
    expect(shared.map(([id, roles]) => `${id} is ${roles.join(' and ')}`)).toEqual([])
  })

  it('names a derived container by the range it covers and a derived leaf by where it starts', () => {
    const all = flatten(tree())
    // The one-item bullet group and its only bullet begin at the same character. Naming both by
    // where they start is the 18-collision mistake; the group carries a range and the bullet does
    // not, so the two names differ.
    const group = all.find((region) => region.role === 'bulletGroup' && region.id.includes('@'))
    const bullet = all.find((region) => region.role === 'bullet' && region.id.includes('@'))
    expect(group, 'the fixture’s prose bullet group was not derived').toBeDefined()
    expect(bullet, 'the fixture’s prose bullet was not derived').toBeDefined()
    expect(group?.id).toMatch(/@\d+:\d+$/)
    expect(bullet?.id).toMatch(/@\d+$/)
    expect(group?.id).not.toBe(bullet?.id)
    expect(bullet?.parentId).toBe(group?.id)

    // The same for a table typed into prose and its only row.
    const table = all.find((region) => region.role === 'table' && region.id.includes('@'))
    const row = all.find((region) => region.role === 'tableRow' && region.id.includes('@'))
    expect(table?.id).toMatch(/@\d+:\d+$/)
    expect(table?.id).not.toBe(row?.id)
    expect(row?.parentId).toBe(table?.id)
  })

  it('reads a table typed into prose as a table, with rows and cells, exactly as a stored one', () => {
    const all = flatten(tree())
    const typed = all.filter((region) => region.id.includes('@'))
    // TWO ROWS, NOT ONE: the head row is a row. It holds words somebody wrote and a reader points
    // at them, and a walk that dropped it would make the first column heading unpointable.
    expect(typed.filter((region) => region.role === 'tableRow').length).toBe(2)
    expect(typed.filter((region) => region.role === 'tableCell').length).toBe(4)
    // The rule under the head is punctuation and is not a row.
    expect(typed.some((region) => region.role === 'tableRow' && region.text.includes('---'))).toBe(false)
    // And the cells hold the characters that were stored, cut from the field the walk named.
    expect(typed.filter((region) => region.role === 'tableCell').map((region) => region.text.trim())).toEqual([
      'head a',
      'head b',
      'one',
      'two',
    ])
  })

  it('handles every stored block type, so a twenty-first cannot arrive unnoticed', () => {
    expect([...DERIVED_BLOCK_TYPES].sort()).toEqual([...SUMMARY_BLOCK_TYPES].sort())
    const all = flatten(tree())
    // Nothing in a report written by this build may fall through to `refused`.
    expect(all.filter((region) => region.role === 'refused').map((region) => region.id)).toEqual([])
  })

  it('says what every role means, with no role left undeclared', () => {
    for (const role of REGION_ROLES) {
      expect(ROLE_OF[role], `${role} has no facts`).toBeDefined()
    }
    // Every role the derivation actually produced is in the closed list.
    for (const region of flatten(tree())) {
      expect(REGION_ROLES.includes(region.role), `${region.role} is not a declared role`).toBe(true)
    }
  })

  it('lets a wrapper be passed straight through, because it is not meaningful', () => {
    // The three wrappers the design names. A person points at what is inside them, never at them.
    expect(ROLE_OF.reportBody.meaningful).toBe(false)
    expect(ROLE_OF.tab.meaningful).toBe(false)
    expect(ROLE_OF.figure.meaningful).toBe(false)
    const all = flatten(tree())
    expect(all.filter((region) => !ROLE_OF[region.role].meaningful).map((region) => region.role).sort()).toEqual([
      'figure',
      'reportBody',
      'tab',
    ])
  })

  it('says whether a name is a thing or a position, from its last step alone', () => {
    expect(stabilityOf('data.blocks[#b-2]')).toBe('identity')
    expect(stabilityOf('data.blocks[#b-2].heading')).toBe('identity')
    expect(stabilityOf('data.blocks[#b-gates].items[#i-3]')).toBe('identity')
    expect(stabilityOf('data.blocks[#b-2].text@530')).toBe('position')
    expect(stabilityOf('data.blocks[#b-5].text@337:1204')).toBe('position')
    expect(stabilityOf('data.blocks[#b-af-table].rows[2]')).toBe('position')
    expect(stabilityOf('data.blocks[#b-af-table].rows[2].cells[1]')).toBe('position')
  })

  it('cuts every region’s characters once, from the field it named', () => {
    const all = flatten(tree())
    const holdsCharacters = all.filter((region) => region.field !== null)
    expect(holdsCharacters.length).toBeGreaterThan(20)
    for (const region of holdsCharacters) {
      expect(region.range, `${region.id} names a field and no range`).not.toBeNull()
    }
    // A paragraph's characters are the paragraph's, not the whole block's.
    const paragraph = all.find((region) => region.role === 'paragraph')
    expect(paragraph?.text.trim()).toBe('An opening paragraph.')
  })

  it('never caps a region that holds other regions at the reading measure', () => {
    // THIS IS THE RULE THAT FIXES THE EMPTY BAND. A container capped at the reading measure leaves
    // the band beside it belonging to nobody, so the walk up from a right-click there passes the
    // container and reaches the whole record. A container either spans its parent's box or
    // measures its own content; neither of those stops at the reading column.
    const all = flatten(tree())
    const containers = all.filter((region) => region.children.length > 0)
    expect(containers.length).toBeGreaterThan(10)
    for (const region of containers) {
      expect(region.fit, `${region.role} holds regions and stops at the reading measure`).not.toBe('read')
    }
    // A LEAF OF PROSE TAKES THE READING MEASURE, which is what puts it in the reading column.
    expect(ROLE_OF.paragraph.fit).toBe('read')
    expect(ROLE_OF.bullet.fit).toBe('read')
    expect(ROLE_OF.table.fit).toBe('measured')
    // And a region's width is never worked out anywhere but the role table.
    for (const region of all) expect(region.fit).toBe(ROLE_OF[region.role].fit)
  })

  /**
   * HOW MUCH WIDTH A PART OF A REPORT NEEDS IS WORKED OUT FROM WHAT IT HOLDS.
   *
   * THE DEFECT THIS EXISTS FOR: the Semantic Region spans the wide report
   * body, prose is capped at 544px, and selecting the empty right-hand side shows a Semantic Region
   * box with nothing in it. Measured on report OOOt4Kouc5dT at a 1440 window on 27 August 2026:
   * every one of its 24 passages and every one of its 8 sections drew at 1164px, with 544px of
   * writing in each and nothing in the rest.
   *
   * `widthNeededBy` is the answer. A part that stacks other parts needs what its widest child needs;
   * a part that lays its own insides out needs the width whatever it holds. So a passage of
   * sentences needs a reading line and is drawn one reading line wide, and nothing claims the space
   * beside it.
   */
  it('says a part of a report holding nothing but sentences needs only a reading line', () => {
    const prose = tree([{ id: 'b-1', type: 'text', text: 'One sentence.\n\nAnd another one.' }])
    const passage = prose.children[0]
    expect(passage?.role, 'the fixture is not a passage, so this test measured the wrong thing').toBe('passage')
    expect(widthNeededBy(passage as Region)).toBe('reading')

    // A SECTION OF PASSAGES IS THE SAME ANSWER ONE LEVEL UP, which is what makes a whole report of
    // prose draw at the reading measure rather than claiming the page.
    const section = tree([
      {
        id: 'b-2',
        type: 'section',
        title: 'Only words',
        blocks: [{ id: 'b-2a', type: 'text', text: 'A sentence.' }],
      },
    ]).children[0]
    expect(section?.role).toBe('section')
    expect(widthNeededBy(section as Region)).toBe('reading')
  })

  it('says the same part needs the whole width as soon as something wide is inside it', () => {
    // A TABLE TYPED INTO THE PROSE, which is the case the owner's own report is full of.
    const withTable = tree([
      { id: 'b-1', type: 'text', text: 'One sentence.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n' },
    ]).children[0]
    expect(withTable?.children.some((child) => child.role === 'table'), 'no table was derived').toBe(true)
    expect(widthNeededBy(withTable as Region)).toBe('wide')

    // AND ONE LEVEL UP. A section is only as narrow as the widest thing in it.
    const section = tree([
      {
        id: 'b-2',
        type: 'section',
        blocks: [
          { id: 'b-2a', type: 'text', text: 'A sentence.' },
          { id: 'b-2b', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/p.png`, alt: 'A picture' },
        ],
      },
    ]).children[0]
    expect(widthNeededBy(section as Region)).toBe('wide')
  })

  it('says a columns block needs the whole width even when every column is plain sentences', () => {
    // TWO 260px COLUMNS ARE NOT A COMPARISON. A columns block lays its children out ACROSS, so how
    // much width it needs is not what its children need. This is the one case the recursion above
    // would get wrong, and it is why a role says whether it stacks its parts or lays them out.
    const columns = tree([
      {
        id: 'b-1',
        type: 'columns',
        columns: [[{ id: 'c-1', type: 'text', text: 'Left.' }], [{ id: 'c-2', type: 'text', text: 'Right.' }]],
      },
    ]).children[0]
    expect(columns?.role).toBe('columns')
    expect(widthNeededBy(columns as Region)).toBe('wide')
    expect(ROLE_OF.columns.stacksParts, 'a columns block was made to inherit its children’s needs').toBe(false)
    expect(ROLE_OF.grid.stacksParts).toBe(false)
  })

  /**
   * HOW NARROW A PART OF A COMPOSITION MAY BE DRAWN IS READ FROM WHAT THE PART IS FOR.
   *
   * A composition puts parts beside each other, and each part has a smallest width it is still
   * worth drawing at. `leastNeededBy` answers that from the region tree: writing needs the most
   * room, a table or a code block less, a picture least.
   *
   * THE TRAP IT IS WRITTEN AROUND IS THE CAPTION. A caption is prose — `ROLE_OF.caption.isProse` is
   * true — so a version of this that walked every descendant looking for prose would call a
   * captioned picture writing, and then hold it open to the width of a line of text. It does not
   * walk every descendant: it stops at any region that lays its own insides out, exactly as
   * `widthNeededBy` above does. The first assertion in each pair below is the control that the
   * fixture really holds what the test says it holds.
   */
  it('reads what a part of a composition is for, and a caption does not turn a picture into writing', () => {
    // CONTROL: this really is a picture with a caption, and a caption really is prose.
    const figure = tree([
      { id: 'b-1', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/p.png`, alt: 'A picture', caption: 'What it shows' },
    ]).children[0]
    expect(figure?.role).toBe('figure')
    expect(figure?.children.map((child) => child.role)).toContain('caption')
    expect(ROLE_OF.caption.isProse, 'the trap this test is written around has gone away').toBe(true)
    expect(
      leastNeededByBlocks([
        { id: 'b-1', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/p.png`, alt: 'A picture', caption: 'What it shows' },
      ]),
    ).toBe('figure')

    // A CHART IS A PICTURE TOO, and its caption is the same trap.
    expect(leastNeededByBlocks([{ id: 'b-1', type: 'chart', spec: { kind: 'line', series: [] } as never, caption: 'A plot' }])).toBe('figure')

    // A TABLE AND A CODE BLOCK ARE NEITHER WRITING NOR PICTURES. They need the middle answer.
    expect(
      leastNeededByBlocks([
        { id: 'b-1', type: 'table', columns: [{ label: 'a' }], rows: [{ cells: ['one'] }], caption: 'A stored table' },
      ]),
    ).toBe('panel')
    expect(leastNeededByBlocks([{ id: 'b-1', type: 'code', code: 'const x = 1\n', language: 'typescript', caption: 'A caption' }])).toBe('panel')

    // WRITING NEEDS THE MOST ROOM, and one paragraph in a part is enough to say so.
    expect(leastNeededByBlocks([{ id: 'b-1', type: 'text', text: 'A sentence.' }])).toBe('sentence')
    expect(
      leastNeededByBlocks([
        { id: 'b-1', type: 'text', text: 'A sentence.' },
        { id: 'b-2', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/p.png`, alt: 'A picture' },
      ]),
    ).toBe('sentence')

    // A CONTAINER ANSWERS WITH THE WIDEST THING IN IT, one level down and two.
    expect(
      leastNeededByBlocks([
        {
          id: 'b-1',
          type: 'section',
          blocks: [{ id: 'b-1a', type: 'table', columns: [{ label: 'a' }], rows: [{ cells: ['one'] }] }],
        },
      ]),
    ).toBe('panel')

    // AND A TITLE ON THAT SECTION CHANGES THE ANSWER TO `sentence`. MEASURED, NOT EXPECTED: the
    // design for this function said a section holding a table answers `panel` full stop. A section
    // title derives a `heading` region, and a heading is prose, so a titled section asks for room
    // to read. That is the model working rather than an accident — a heading is writing — and the
    // cost is that such a part is kept 20rem wide rather than 15rem. It is asserted here so that
    // anyone who decides a heading should not count sees this go red instead of finding out later.
    expect(
      leastNeededByBlocks([
        {
          id: 'b-1',
          type: 'section',
          title: 'A table in a section',
          blocks: [{ id: 'b-1a', type: 'table', columns: [{ label: 'a' }], rows: [{ cells: ['one'] }] }],
        },
      ]),
    ).toBe('sentence')

    // A PART HOLDING NOTHING ASKS FOR THE LEAST. There is nothing in it to keep open.
    expect(leastNeededByBlocks([])).toBe('figure')

    // AND THE THREE ANSWERS ARE DECLARED NARROWEST TO WIDEST, which is the order the walk above
    // compares them in rather than writing the ladder out a second time.
    expect([...LEASTS]).toEqual(['figure', 'panel', 'sentence'])
  })

  it('answers for every role, so a new one cannot arrive without saying what it needs', () => {
    for (const role of REGION_ROLES) {
      expect(typeof ROLE_OF[role].stacksParts, `${role} does not say whether it stacks its parts`).toBe('boolean')
    }
  })

  /**
   * WHAT A BLOCK MEANS IS DECIDED IN ONE PLACE, AND THE RENDERER READS IT.
   *
   * Until 27 August 2026 src/web/components/SummaryBlocks.tsx carried a width map of its own, four
   * words wide, beside this file's three, and the two disagreed about nine of the twenty block types
   * with nothing failing. `tests/report-document.test.ts` holds the half of this that watches the
   * renderer; this half watches the map.
   */
  it('names one region role for every stored block type, and the derivation uses that map', () => {
    expect(Object.keys(ROLE_OF_BLOCK).sort()).toEqual([...SUMMARY_BLOCK_TYPES].sort())
    for (const type of SUMMARY_BLOCK_TYPES) {
      expect(REGION_ROLES.includes(ROLE_OF_BLOCK[type]), `${type} names a role nothing declares`).toBe(true)
    }
    // Every block in the fixture is derived as the role the map names, except the one rule that
    // reads the block rather than its type: a paragraph block with a heading is a small section.
    const all = flatten(tree())
    for (const block of EVERY_TYPE) {
      const region = all.find((one) => one.id === `data.blocks[#${block.id}]`)
      expect(region?.role, `${block.id} was derived as something the one map does not name`).toBe(roleOfBlock(block))
    }
    expect(roleOfBlock({ id: 'x', type: 'text', heading: 'A heading', text: 'words' })).toBe('section')
    expect(roleOfBlock({ id: 'x', type: 'text', text: 'words' })).toBe('passage')
  })
})
