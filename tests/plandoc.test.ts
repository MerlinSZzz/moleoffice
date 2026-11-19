// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING A PLAN'S LINES, AND THE PROMISE THAT NOTHING IS EVER LOST.
 *
 * `src/shared/plandoc.ts` decides how a line is DRAWN and nothing else. It reads no database and
 * makes no decision about what a line MEANS, so everything here is a pure function called directly.
 *
 * The load-bearing test is the round trip. A plan's whole point is that what somebody typed comes
 * back exactly as they typed it: migration 0010 stores a document as lines, and the day the split
 * and the join disagree is the day somebody's writing changes underneath them with nothing failing.
 * So the round trip is checked against bodies with blank lines, trailing whitespace, tables, a
 * Windows line ending and no trailing newline — the shapes that get quietly normalised.
 */

import { describe, expect, it } from 'vitest'
import {
  blocksOf,
  bodyOfLines,
  isPlanState,
  linesOfBody,
  PLAN_STATES,
  type PlanDocLine,
} from '../src/shared/plandoc.ts'

/** Lines as a plan stores them, with ids, from a document. */
function linesOf(body: string): PlanDocLine[] {
  return linesOfBody(body).map((text, index) => ({ id: `l${index}`, text }))
}

/**
 * The documents the round trip is proved on.
 *
 * Each one is here for a shape that gets normalised by accident: a blank line between paragraphs,
 * a line of nothing but spaces, trailing spaces on a real line, a Markdown table, a body that does
 * not end in a newline, a body that ends in two, and a Windows line ending.
 */
const DOCUMENTS: Record<string, string> = {
  'blank lines, trailing spaces and a table': [
    '# Greenhouse sample log',
    '',
    'target: first week of April   ',
    '   ',
    '## Supplies',
    '- [ ] fill seed trays',
    '- [x] label four pots',
    '',
    '| Sample | How many | Checked by |',
    '|---|---|---|',
    '| basil | 3 | Rowan |',
    '| mint | ? | — |',
    '',
    'Maybe: record soil color.  ',
  ].join('\n'),
  'no trailing newline': 'one line and nothing after it',
  'ends in a newline': 'a line\n',
  'ends in two newlines': 'a line\n\n',
  'nothing but blank lines': '\n\n\n',
  'the empty document': '',
  'a Windows line ending': 'first\r\nsecond\r\n',
  'a line that is only a pipe': '|',
  // A made-up nested outline catches indentation being normalized when lines are drawn.
  'a made-up outline nested with leading spaces and no bullet markers': [
    'start seed samples',
    '  label each tray',
    '    use a marker',
    '    record the date',
    '    check the soil',
    '  water each tray',
    '    note the amount',
    '    wipe the bench',
    '  write a short update',
    '    list the samples',
    '    add a photo',
    '    save the notes',
  ].join('\n'),
  'a tab used as indentation': 'parent\n\tchild\n\t\tgrandchild',
}

describe('a document survives being stored as lines', () => {
  it.each(Object.keys(DOCUMENTS))('%s — the lines joined back are the document, character for character', (name) => {
    const body = DOCUMENTS[name]!
    expect(bodyOfLines(linesOfBody(body))).toBe(body)
  })

  it('keeps a blank line as a line rather than dropping it', () => {
    expect(linesOfBody('a\n\nb')).toEqual(['a', '', 'b'])
  })

  it('keeps trailing spaces, because they are what somebody typed', () => {
    expect(linesOfBody('a  \nb')).toEqual(['a  ', 'b'])
  })

  it('does not remove a carriage return, so a Windows paste comes back as it went in', () => {
    expect(linesOfBody('a\r\nb')).toEqual(['a\r', 'b'])
  })

  /**
   * INDENTATION MUST NOT GROW ON ITS OWN.
   *
   * The document is one text box, so a split and join must preserve every space in its lines.
   */
  it('keeps an outline nested with spaces at exactly the depths it was typed at', () => {
    const lines = linesOfBody(DOCUMENTS['a made-up outline nested with leading spaces and no bullet markers']!)
    const depths = lines.map((line) => /^ */.exec(line)![0].length)
    expect(depths).toEqual([0, 2, 4, 4, 4, 2, 4, 4, 2, 4, 4, 4])
  })

  it.each(Object.keys(DOCUMENTS))('%s — the round trip adds and removes no whitespace at all', (name) => {
    const body = DOCUMENTS[name]!
    const blanks = (text: string) => [...text].filter((one) => one === ' ' || one === '\t').length
    expect(blanks(bodyOfLines(linesOfBody(body)))).toBe(blanks(body))
  })
})

describe('every line comes back in exactly one block, in order, unchanged', () => {
  it.each(Object.keys(DOCUMENTS))('%s', (name) => {
    const lines = linesOf(DOCUMENTS[name]!)
    const back = blocksOf(lines).flatMap((block) => block.lines)
    expect(back).toEqual(lines)
  })

  it('holds for a table Mole Office cannot read, which is the case that matters most', () => {
    const lines = linesOf(['| a | b |', '|---|---|', '| 1 | 2 | 3 |'].join('\n'))
    const blocks = blocksOf(lines)
    expect(blocks.flatMap((block) => block.lines)).toEqual(lines)
  })
})

describe('what a line is drawn as', () => {
  it('reads a heading and takes the hashes off', () => {
    const [block] = blocksOf(linesOf('## Must'))
    expect(block).toMatchObject({ kind: 'heading', level: 2, text: 'Must' })
  })

  it('reads a bullet and keeps how far it was indented', () => {
    const [block] = blocksOf(linesOf('  - gaze'))
    expect(block).toMatchObject({ kind: 'bullet', indent: 2, text: 'gaze' })
  })

  it('tells a ticked box from an empty one', () => {
    const blocks = blocksOf(linesOf('- [x] done it\n- [ ] not yet'))
    expect(blocks[0]).toMatchObject({ kind: 'tickbox', done: true, text: 'done it' })
    expect(blocks[1]).toMatchObject({ kind: 'tickbox', done: false, text: 'not yet' })
  })

  it('reads a blank line as blank rather than as empty prose', () => {
    expect(blocksOf(linesOf('   '))[0]).toMatchObject({ kind: 'blank' })
  })

  it('draws anything else as the words themselves', () => {
    const [block] = blocksOf(linesOf('target: September'))
    expect(block).toMatchObject({ kind: 'paragraph', text: 'target: September' })
  })

  /**
   * NUMBERED ITEMS KEEP THEIR WRITTEN MARKERS.
   *
   * A numbered line is a distinct block, with its marker available to the reader and its source
   * line unchanged.
   */
  it('reads a numbered item and keeps the number as it was written', () => {
    const [block] = blocksOf(linesOf('1. test with the pipeline'))
    expect(block).toMatchObject({
      kind: 'numbered',
      indent: 0,
      number: '1',
      text: 'test with the pipeline',
    })
  })

  it('does not renumber anything: a list starting at 3, and a padded number, come back as typed', () => {
    const blocks = blocksOf(linesOf('3. third\n07. seventh'))
    expect(blocks[0]).toMatchObject({ kind: 'numbered', number: '3', text: 'third' })
    expect(blocks[1]).toMatchObject({ kind: 'numbered', number: '07', text: 'seventh' })
  })

  it('keeps how far a numbered item was indented', () => {
    const [block] = blocksOf(linesOf('    2. tune gains'))
    expect(block).toMatchObject({ kind: 'numbered', indent: 4, number: '2', text: 'tune gains' })
  })

  it('leaves the marker in the stored line, so the document is unchanged', () => {
    const lines = linesOf('1. test with the pipeline')
    const [block] = blocksOf(lines)
    expect(block!.lines[0]!.text).toBe('1. test with the pipeline')
  })

  it('reads a numbered list written with brackets as prose, rather than guessing at it', () => {
    // A bracket list is not read. It is drawn as the words themselves, which is honest and loses
    // nothing; a reader sees exactly what they typed.
    expect(blocksOf(linesOf('1) test'))[0]).toMatchObject({ kind: 'paragraph', text: '1) test' })
    expect(blocksOf(linesOf('1.no space'))[0]).toMatchObject({ kind: 'paragraph', text: '1.no space' })
  })

  it('reads a box after a number as words, because only a bullet carries a tick box', () => {
    const [block] = blocksOf(linesOf('1. [x] done it'))
    expect(block).toMatchObject({ kind: 'numbered', number: '1', text: '[x] done it' })
  })

  it('reads a whole pipe table as one table', () => {
    const blocks = blocksOf(linesOf(['| What | How big |', '|---|---|', '| baseline | 20h |'].join('\n')))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      kind: 'table',
      heading: ['What', 'How big'],
      rows: [['baseline', '20h']],
    })
  })
})

describe('what Mole Office cannot read, it prints as typed and says why', () => {
  it('refuses to guess when a row has more cells than there are headings', () => {
    const blocks = blocksOf(linesOf(['| a | b |', '|---|---|', '| 1 | 2 | 3 |'].join('\n')))
    const block = blocks[0]!
    expect(block.kind).toBe('notUnderstood')
    if (block.kind !== 'notUnderstood') throw new Error('the table was read as something else')
    expect(block.why).toContain('heading row has 2')
    expect(block.why).toContain('3 cells')
    // The words a person sees, in plain language, and the lines exactly as they typed them.
    expect(block.why).toContain('printed exactly as you typed it')
    expect(block.lines.map((line) => line.text)).toEqual(['| a | b |', '|---|---|', '| 1 | 2 | 3 |'])
  })

  it('refuses to guess which line is the heading when there is no row of dashes', () => {
    const blocks = blocksOf(linesOf(['| a | b |', '| 1 | 2 |'].join('\n')))
    const block = blocks[0]!
    expect(block.kind).toBe('notUnderstood')
    if (block.kind !== 'notUnderstood') throw new Error('the table was read as something else')
    expect(block.why).toContain('no row of dashes')
  })

  it('does not drop the rest of the document when one table cannot be read', () => {
    const blocks = blocksOf(linesOf(['| a |', 'after the table'].join('\n')))
    expect(blocks[0]!.kind).toBe('notUnderstood')
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', text: 'after the table' })
  })
})

describe('what a plan can be', () => {
  it('is open, done or dropped and nothing else', () => {
    expect([...PLAN_STATES]).toEqual(['open', 'done', 'dropped'])
    expect(isPlanState('done')).toBe(true)
    expect(isPlanState('closed')).toBe(false)
    expect(isPlanState(undefined)).toBe(false)
  })
})
