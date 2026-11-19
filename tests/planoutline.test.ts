// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TREE A PLAN ALREADY HAS, READ BACK OUT OF THE WORDS.
 *
 * `src/shared/planoutline.ts` works the tree out from the blocks every time it is asked, and nothing
 * stores a level or a parent. So the whole of it is pure functions called directly, with no database
 * and no server.
 *
 * The load-bearing case is the owner's own scratch plan in tests/owner-plan.ts. It was written by hand
 * to test the editor, and every awkward shape in it is a shape a person chose: five heading levels, a
 * numbered list, nested bullets, inline mathematics and a pipe table missing its dashes. If the
 * depths that come out of that document are wrong, the plan table and the schedule are wrong, and
 * they will be wrong in a way that looks tidy.
 *
 * Three questions have an answer in the code rather than by accident, and each has its own test
 * here: what depth a bullet under a level-five heading gets, what depth a bullet gets when there is
 * no heading above it at all, and what a document that jumps from one hash to four means.
 */

import { describe, expect, it } from 'vitest'
import { blocksOf, linesOfBody, type PlanDocLine } from '../src/shared/plandoc.ts'
import { flattenOutline, outlineOf, type OutlineItem } from '../src/shared/planoutline.ts'
import { OWNER_PLAN } from './owner-plan.ts'

function linesOf(body: string): PlanDocLine[] {
  return linesOfBody(body).map((text, index) => ({ id: `l${index}`, text }))
}

/** The tree of a whole document, the way every caller gets it: blocks first, then the outline. */
function outline(body: string): OutlineItem[] {
  return outlineOf(blocksOf(linesOf(body)))
}

/** Every item in reading order as "depth: words", which is the shape a person can read in a diff. */
function depthsAndWords(body: string): string[] {
  return flattenOutline(outline(body)).map(({ item }) => `${item.depth}: ${item.text}`)
}

describe("the owner's own scratch plan", () => {
  it('comes out at the depths the person typed, in the order they typed them', () => {
    expect(depthsAndWords(OWNER_PLAN)).toEqual([
      '0: the panelx plan',
      '1: test with the pipeline',
      '1: try the pipeline',
      '1: find bugs',
      '1: report bugs',
      '0: Robotics',
      '1: Tray clamp',
      '2: replace gripper',
      '3: levle4',
      '4: levle5',
      '1: Object',
      '2: abc',
      '2: def',
      '2: gh',
    ])
  })

  it('has two top-level items, because the person wrote two level-one headings', () => {
    expect(outline(OWNER_PLAN).map((item) => item.text)).toEqual(['the panelx plan', 'Robotics'])
  })

  it('makes the person’s four numbered lines four pieces of the plan, not a paragraph', () => {
    const [first] = outline(OWNER_PLAN)
    expect(first!.children.map((child) => child.kind)).toEqual(['numbered', 'numbered', 'numbered', 'numbered'])
    expect(first!.children.map((child) => child.text)).toEqual([
      'test with the pipeline',
      'try the pipeline',
      'find bugs',
      'report bugs',
    ])
  })

  it('closes the five deep headings when the next level-two heading arrives', () => {
    const robotics = outline(OWNER_PLAN)[1]!
    expect(robotics.children.map((child) => `${child.depth}: ${child.text}`)).toEqual(['1: Tray clamp', '1: Object'])
  })

  it('is not made shorter or longer by the person’s mathematics, their blank lines or their table', () => {
    // The line of mathematics, the blank lines, the word "text" and the pipe table Mole Office cannot
    // read are the writing between the items. Fourteen items, and none of them is one of those.
    const flat = flattenOutline(outline(OWNER_PLAN))
    expect(flat).toHaveLength(14)
    expect(flat.map(({ item }) => item.text)).not.toContain('$H_2 O$')
    expect(flat.map(({ item }) => item.text)).not.toContain('text')
    expect(flat.map(({ item }) => item.text)).not.toContain('column1')
  })

  it('names the line every item was made from, so a press on a row reaches the right line', () => {
    const flat = flattenOutline(outline(OWNER_PLAN))
    const lines = linesOf(OWNER_PLAN)
    const textOf = (id: string) => lines.find((line) => line.id === id)!.text
    // Each item came from exactly one line, and that line still holds its marker.
    expect(flat.map(({ item }) => item.lineIds.length)).toEqual(Array(14).fill(1))
    expect(textOf(flat[1]!.item.lineIds[0]!)).toBe('1. test with the pipeline')
    expect(textOf(flat[9]!.item.lineIds[0]!)).toBe('##### levle5')
    expect(textOf(flat[11]!.item.lineIds[0]!)).toBe('- abc')
  })
})

describe('the three questions that have to be answered rather than happen', () => {
  /**
   * A BULLET UNDER THE DEEPEST HEADING THE OWNER TYPED.
   *
   * Depth follows the writing and there is no cap. A bullet under a level-five heading is at depth
   * five, one deeper than the heading it belongs to. Capping it would put two different pieces of
   * the owner's plan at the same level on screen.
   */
  it('puts a bullet under a level-five heading at depth 5', () => {
    expect(depthsAndWords('##### levle5\n- a bullet under it')).toEqual(['4: levle5', '5: a bullet under it'])
  })

  /**
   * A BULLET WITH NO HEADING ANYWHERE ABOVE IT.
   *
   * It is a top-level item, at depth 0. There is no invented heading over it, because inventing one
   * would put a heading on screen that nobody wrote.
   */
  it('puts a bullet with no heading above it at depth 0', () => {
    expect(depthsAndWords('- abc\n- def')).toEqual(['0: abc', '0: def'])
  })

  it('still nests under a shallower bullet when there is no heading in the document', () => {
    expect(depthsAndWords('- a\n  - b\n    - c\n  - d\n- e')).toEqual(['0: a', '1: b', '2: c', '1: d', '0: e'])
  })

  /**
   * A DOCUMENT THAT JUMPS FROM ONE HASH TO FOUR.
   *
   * The depth is the number of hashes the owner typed: the level-four heading is at depth 3. Its parent is
   * the level-one heading, because that is the nearest shallower heading above it. Those are two
   * different facts and both are kept. Renumbering the jump to depth 1 would hide that the owner skipped
   * two levels, and moving it out from under the level-one heading would break the containment.
   */
  it('keeps a jump from level 1 to level 4 as a jump, and still makes it a child', () => {
    const tree = outline('# top\n#### jumped')
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children.map((child) => `${child.depth}: ${child.text}`)).toEqual(['3: jumped'])

    // Depth is not the same as how many items you are inside. The jumped heading is inside one item
    // and sits at depth 3.
    const jumped = flattenOutline(tree)[1]!
    expect(jumped.item.depth).toBe(3)
    expect(jumped.path.map((one) => one.text)).toEqual(['top'])
  })

  it('carries on from a jumped heading at the depth it was written at', () => {
    expect(depthsAndWords('# top\n#### jumped\n- under it')).toEqual(['0: top', '3: jumped', '4: under it'])
  })
})

describe('what makes one item sit under another', () => {
  it('gives a list item to the nearest heading above it', () => {
    expect(depthsAndWords('# a\n## b\n- x')).toEqual(['0: a', '1: b', '2: x'])
  })

  it('does not let leading spaces alone make a level, because you cannot nest under nothing', () => {
    // The first bullet under the heading is indented four spaces and there is nothing shallower for
    // it to sit under, so it belongs to the heading like any other first bullet.
    expect(depthsAndWords('# a\n    - deep\n    - also deep')).toEqual(['0: a', '1: deep', '1: also deep'])
  })

  it('treats a tick box and a numbered item as items in the same nesting as bullets', () => {
    expect(depthsAndWords('- a\n  - [x] ticked\n  2. numbered')).toEqual(['0: a', '1: ticked', '1: numbered'])
  })

  it('says which kind of line each item was written as', () => {
    const flat = flattenOutline(outline('# a\n- b\n- [ ] c\n1. d'))
    expect(flat.map(({ item }) => item.kind)).toEqual(['heading', 'bullet', 'tickbox', 'numbered'])
  })

  it('closes a list when a heading at the same depth arrives', () => {
    expect(depthsAndWords('# a\n- x\n## b\n- y')).toEqual(['0: a', '1: x', '1: b', '2: y'])
  })

  it('has no items at all in a document of nothing but prose', () => {
    expect(outline('just some words\n\nand more of them')).toEqual([])
  })

  it('has no items in an empty document', () => {
    expect(outline('')).toEqual([])
  })
})

describe('the tree laid flat', () => {
  const body = '# top\n- one\n  - two\n## next\n1. three'

  it('is in the order the plan is written', () => {
    expect(flattenOutline(outline(body)).map(({ item }) => item.text)).toEqual(['top', 'one', 'two', 'next', 'three'])
  })

  it('gives every item the items it sits under, outermost first', () => {
    const paths = flattenOutline(outline(body)).map(({ item, path }) => [
      item.text,
      path.map((one) => one.text).join(' / '),
    ])
    expect(paths).toEqual([
      ['top', ''],
      ['one', 'top'],
      ['two', 'top / one'],
      ['next', 'top'],
      ['three', 'top / next'],
    ])
  })

  it('does not repeat the depth, which lives on the item itself', () => {
    expect(flattenOutline(outline(body)).map(({ item }) => item.depth)).toEqual([0, 1, 2, 1, 2])
  })

  it('hands back the same item objects the tree holds, so nothing is copied', () => {
    const tree = outline(body)
    expect(flattenOutline(tree)[0]!.item).toBe(tree[0])
    expect(flattenOutline(tree)[1]!.item).toBe(tree[0]!.children[0])
  })
})
