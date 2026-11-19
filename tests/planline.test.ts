// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING VALUES IN A LINE OF A PLAN: ONE PARSER, ONE WRITER, AND AN EXACT ROUND TRIP.
 *
 * What these tests are about, in one sentence each:
 *
 *   - A trailing run of `{key: value}` groups is read, and nothing else in the line is.
 *   - Curly brackets anywhere else in a line are prose and come back exactly as typed.
 *   - A key this file does not know stops the reading rather than being swallowed, because
 *     swallowing it would delete something a person wrote.
 *   - Reading a line and writing it back gives the same bytes, for every case here.
 *   - The note is part of the words, so writing one changes the line's own text.
 */

import { describe, expect, it } from 'vitest'
import {
  lineWithNote,
  noteOf,
  parsePlanLine,
  PLANNING_KEYS,
  valuesFor,
  whyNoteCannotBeWritten,
  writePlanLine,
} from '../src/shared/planline.ts'

/** Every line these tests use, so the round trip can be asserted over all of them at once. */
const LINES = [
  '- Build the controller {size: 15h} {time: 15h this week} {project: robotics} {note: ask Sam}',
  '- Build the controller',
  '',
  '   ',
  '# A heading {size: 3h}',
  '- [x] fix the mount {note: the arm is free from the 17th}',
  '- spacing { size : 15h }',
  '- no space{size: 15h}',
  '- two together {size: 2h}{note: hi}',
  '- trailing spaces {size: 2h}   ',
  '- tabs\t{size: 2h}',
  'use the {gripper} mount {size: 2h}',
  'the {x} in {y}',
  'prose with {braces} and nothing else',
  '{note: a note is the whole line}',
  '- fix it {size: 2h} {owner: sam}',
  '- fix it {owner: sam}',
  '- broken {size: 2h',
  '- broken size: 2h}',
  '- no colon {size}',
  '- empty {size: }',
  '- a note with a bracket {note: a} b}',
  '- 数据采集 {project: robotics}',
  '| baseline | 20h |',
  '- said twice {size: 2h} {size: 4h}',
]

describe('reading the trailing run', () => {
  it('reads the four keys off the end of a line, in the order they are written', () => {
    const parsed = parsePlanLine(LINES[0]!)
    expect(parsed.text).toBe('- Build the controller')
    expect(parsed.values.map((v) => [v.key, v.value])).toEqual([
      ['size', '15h'],
      ['time', '15h this week'],
      ['project', 'robotics'],
      ['note', 'ask Sam'],
    ])
  })

  it('knows exactly four keys, and they are the four the design names', () => {
    expect([...PLANNING_KEYS]).toEqual(['size', 'time', 'project', 'note'])
  })

  it('takes the spaces off a value and leaves the group as typed', () => {
    const parsed = parsePlanLine('- spacing { size : 15h }')
    expect(parsed.values.map((v) => [v.key, v.value])).toEqual([['size', '15h']])
    expect(parsed.values[0]!.source).toBe('{ size : 15h }')
  })

  it('reads a group with no space in front of it', () => {
    const parsed = parsePlanLine('- no space{size: 15h}')
    expect(parsed.text).toBe('- no space')
    expect(parsed.values.map((v) => v.value)).toEqual(['15h'])
  })

  it('keeps the spaces typed after the last group', () => {
    const parsed = parsePlanLine('- trailing spaces {size: 2h}   ')
    expect(parsed.text).toBe('- trailing spaces')
    expect(parsed.after).toBe('   ')
  })

  it('reads a line that is nothing but a group', () => {
    const parsed = parsePlanLine('{note: a note is the whole line}')
    expect(parsed.text).toBe('')
    expect(parsed.values.map((v) => [v.key, v.value])).toEqual([['note', 'a note is the whole line']])
  })

  it('reads a value that is empty, rather than pretending the group is not there', () => {
    const parsed = parsePlanLine('- empty {size: }')
    expect(parsed.values.map((v) => [v.key, v.value])).toEqual([['size', '']])
  })

  it('hands back both groups when a key is written twice, and picks neither', () => {
    const parsed = parsePlanLine('- said twice {size: 2h} {size: 4h}')
    expect(valuesFor(parsed, 'size').map((v) => v.value)).toEqual(['2h', '4h'])
  })
})

describe('brackets that are prose stay prose', () => {
  it('leaves brackets in the middle of a line alone', () => {
    const parsed = parsePlanLine('use the {gripper} mount {size: 2h}')
    expect(parsed.text).toBe('use the {gripper} mount')
    expect(parsed.values.map((v) => v.value)).toEqual(['2h'])
  })

  it('reads nothing at all out of a line that is only prose with brackets in it', () => {
    for (const line of ['the {x} in {y}', 'prose with {braces} and nothing else']) {
      const parsed = parsePlanLine(line)
      expect(parsed.values, line).toEqual([])
      expect(parsed.text, line).toBe(line)
    }
  })

  it('stops at a key it does not know, and does not swallow it', () => {
    const parsed = parsePlanLine('- fix it {owner: sam}')
    expect(parsed.values).toEqual([])
    expect(parsed.text).toBe('- fix it {owner: sam}')
  })

  it('reads nothing when an unknown key ends the line, even behind a key it knows', () => {
    // The size group is no longer at the end of the line, and only a trailing run counts. Leaving
    // the unknown group alone matters more than reading the known one: `{owner: sam}` is something
    // somebody wrote, and dropping it to reach the group behind it would delete their words.
    const parsed = parsePlanLine('- fix it {size: 2h} {owner: sam}')
    expect(parsed.values).toEqual([])
    expect(parsed.text).toBe('- fix it {size: 2h} {owner: sam}')
  })

  it('reads nothing from a group that is not closed, or not opened, or has no colon', () => {
    for (const line of ['- broken {size: 2h', '- broken size: 2h}', '- no colon {size}']) {
      expect(parsePlanLine(line).values, line).toEqual([])
    }
  })

  it('reads nothing from a note that holds a closing bracket of its own', () => {
    // `{note: a} b}` is not a note whose words are `a} b` — the group ended at the first bracket,
    // and reading it the other way would put words in somebody's note that they did not write there.
    const parsed = parsePlanLine('- a note with a bracket {note: a} b}')
    expect(parsed.values).toEqual([])
  })
})

describe('the round trip is exact', () => {
  it('gives back every line byte for byte', () => {
    for (const line of LINES) {
      expect(writePlanLine(parsePlanLine(line)), JSON.stringify(line)).toBe(line)
    }
  })

  it('gives back a line whose text is not ASCII', () => {
    const line = '- 数据采集 {project: robotics} {note: 用夹爪}'
    expect(writePlanLine(parsePlanLine(line))).toBe(line)
  })

  it('drops the group and the space in front of it when a value is taken off', () => {
    const parsed = parsePlanLine(LINES[0]!)
    const left = writePlanLine({ ...parsed, values: parsed.values.filter((v) => v.key === 'note') })
    expect(left).toBe('- Build the controller {note: ask Sam}')
    const none = writePlanLine({ ...parsed, values: [] })
    expect(none).toBe('- Build the controller')
  })
})

describe('the note lives in the words', () => {
  it('reads the note off a line', () => {
    expect(noteOf('- [x] fix the mount {note: the arm is free from the 17th}')).toBe(
      'the arm is free from the 17th',
    )
    expect(noteOf('- fix the mount')).toBeNull()
  })

  it('answers null when a line holds two notes, rather than picking one', () => {
    expect(noteOf('- fix it {note: one} {note: two}')).toBeNull()
  })

  it('adds a note to a line, and replaces the one already there', () => {
    expect(lineWithNote('- fix the mount', 'ask Sam')).toBe('- fix the mount {note: ask Sam}')
    expect(lineWithNote('- fix the mount {note: ask Sam}', 'ask Jo')).toBe('- fix the mount {note: ask Jo}')
    expect(lineWithNote('- fix it {note: one} {note: two}', 'just this')).toBe('- fix it {note: just this}')
  })

  it('keeps the other values where they are when the note changes', () => {
    expect(lineWithNote('- fix it {size: 2h} {note: old}', 'new')).toBe('- fix it {size: 2h} {note: new}')
  })

  it('takes the note off when there is none to write', () => {
    expect(lineWithNote('- fix it {size: 2h} {note: old}', null)).toBe('- fix it {size: 2h}')
    expect(lineWithNote('- fix it {note: old}', '   ')).toBe('- fix it')
  })

  it('refuses a note that cannot go in a line, naming what is wrong with it', () => {
    expect(whyNoteCannotBeWritten('ask Sam')).toBeNull()
    expect(whyNoteCannotBeWritten('use the {gripper}')).toMatch(/curly bracket/)
    expect(whyNoteCannotBeWritten('two\nlines')).toMatch(/line ending/)
  })
})
