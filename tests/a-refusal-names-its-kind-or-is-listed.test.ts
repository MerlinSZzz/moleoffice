// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK REFUSES ONLY ONE OF THE FOUR KINDS, and lists every other fault instead.
 *
 * A refusal is for a change that stops the
 * office starting or the build passing, loses or overwrites data, lets somebody do what only the
 * person may do, or breaks another line's work. A fault of form in a record, and a test that copies
 * a value the code defines, are listed to patch after the landing. Anything else in code, proof or
 * design is listed for the line's next round.
 *
 * The conversion is read from src/config/verdict-kinds.mjs, the one declaration the check's prompt
 * and the inspector tool take the kinds from. This test reads the kinds from there too, so adding a
 * kind cannot leave this file checking a second, older list.
 */

import { describe, expect, it } from 'vitest'

import {
  THE_FOUR_KINDS,
  THE_LENGTH_AN_UNREAD_PART_KEEPS,
  WHAT_A_KIND_IS,
  onlyTheRealFaults,
  theListedFaultsSay,
  theUnreadPartsSay,
} from '../src/config/verdict-kinds.mjs'

describe('the four kinds a check refuses for', () => {
  it('declares four kinds, each with its own sentence', () => {
    expect(THE_FOUR_KINDS).toHaveLength(4)
    for (const kind of THE_FOUR_KINDS) expect(WHAT_A_KIND_IS[kind as keyof typeof WHAT_A_KIND_IS]).toBeTruthy()
  })

  it('keeps a refusal whose item names one of the four kinds', () => {
    const { answer, listed, changed } = onlyTheRealFaults({
      verdict: 'refused',
      check: 'Test: the office could not start.',
      missing: [{ what: 'The office does not start with this change.', kind: 'start-or-build' }],
      says: { chapter: 1 },
      chaptersRead: [{ chapter: 9, level: 'outline' }],
    })
    expect(changed).toBe(true)
    expect(answer).toMatchObject({ verdict: 'refused', missing: ['The office does not start with this change.'] })
    expect(listed).toEqual({ nextRound: [], afterLanding: [] })
  })

  it('reads a single item written as one object, and keeps the real fault it names', () => {
    const { answer, listed, changed } = onlyTheRealFaults({
      verdict: 'refused',
      check: 'Test: one item written as an object, not a list.',
      missing: { what: 'The build does not pass.', kind: 'start-or-build' },
    })
    expect(changed).toBe(true)
    expect(answer).toMatchObject({ verdict: 'refused', missing: ['The build does not pass.'] })
    expect(listed).toEqual({ nextRound: [], afterLanding: [] })
  })

  it('reads a single object as one item, and lists a form fault the same way', () => {
    const { answer, listed } = onlyTheRealFaults({
      verdict: 'refused',
      check: 'Test: one form fault, not a list.',
      missing: { what: 'The record has no label.', kind: 'form' },
    })
    expect(answer).toMatchObject({ verdict: 'released' })
    expect(listed.afterLanding).toEqual(['The record has no label.'])
  })

  it('never releases a refusal that read no item, whether its missing is empty or absent', () => {
    for (const missing of [[], undefined]) {
      const answer = { verdict: 'refused', check: 'Test: refused with nothing to read.', ...(missing === undefined ? {} : { missing }) }
      expect(onlyTheRealFaults(answer)).toEqual({ answer, listed: { nextRound: [], afterLanding: [] }, unread: [], changed: false })
    }
  })

  it('turns a refusal about a record title alone into a release, with the fault listed after the landing', () => {
    const { answer, listed, changed } = onlyTheRealFaults({
      verdict: 'refused',
      check: 'Test: the report title is not in form.',
      missing: [{ what: 'The record has no short form.', kind: 'form' }],
      says: { chapter: 4 },
      chaptersRead: [{ chapter: 4, level: 'outline' }],
    })
    expect(changed).toBe(true)
    expect(answer).toMatchObject({
      verdict: 'released',
      check: 'Test: the report title is not in form.\n\nTo patch after the landing:\n- The record has no short form.',
    })
    expect((answer as Record<string, unknown>)['missing']).toBeUndefined()
    expect((answer as Record<string, unknown>)['says']).toBeUndefined()
    expect(listed.afterLanding).toEqual(['The record has no short form.'])
    expect(listed.nextRound).toEqual([])
  })

  it('lists an item that names no kind rather than refusing on it', () => {
    const { answer, listed } = onlyTheRealFaults({
      verdict: 'refused',
      check: 'Test: the doing line is absent.',
      missing: ['The run wrote no doing line.'],
    })
    expect(answer).toMatchObject({ verdict: 'released' })
    expect(listed.afterLanding).toEqual(['The run wrote no doing line.'])
  })

  it('lists a copied test value for the next round when nothing names a record', () => {
    const { answer, listed } = onlyTheRealFaults({
      verdict: 'refused',
      check: 'Test: the test copies a sentence.',
      missing: ['The test copies the sentence the code defines.'],
    })
    expect(answer).toMatchObject({ verdict: 'released' })
    expect(listed.nextRound).toEqual(['The test copies the sentence the code defines.'])
    expect(listed.afterLanding).toEqual([])
  })

  it('keeps the real faults of a mixed refusal and lists the rest', () => {
    const { answer, listed } = onlyTheRealFaults({
      verdict: 'refused',
      check: 'Test: two things.',
      missing: [
        { what: 'The change overwrote another row.', kind: 'data' },
        { what: 'The report has no label.', kind: 'form' },
      ],
      says: { chapter: 4 },
    })
    expect(answer).toMatchObject({ verdict: 'refused', missing: ['The change overwrote another row.'] })
    expect((answer as Record<string, unknown>)['says']).toEqual({ chapter: 4 })
    expect(listed.afterLanding).toEqual(['The report has no label.'])
  })

  it('takes the place a listed fault names, and writes the two headings only when they have items', () => {
    expect(theListedFaultsSay(['A test must read its value.'], [])).toBe(
      "To fix in the line's next round:\n- A test must read its value.",
    )
    expect(theListedFaultsSay([], ['A record needs its label.'])).toBe(
      'To patch after the landing:\n- A record needs its label.',
    )
    const { listed } = onlyTheRealFaults({
      verdict: 'released',
      check: 'Test: released with a list.',
      listed: [{ what: 'A test must read its value.', where: 'next-round' }],
    })
    expect(listed.nextRound).toEqual(['A test must read its value.'])
  })

  it('leaves a release that lists nothing alone', () => {
    const answer = { verdict: 'released', check: 'Test: nothing to fix.' }
    expect(onlyTheRealFaults(answer)).toEqual({ answer, listed: { nextRound: [], afterLanding: [] }, unread: [], changed: false })
  })

  it("reads the door's own two sides, and a side decides where its item is fixed", () => {
    const { answer, listed, unread, changed } = onlyTheRealFaults({
      verdict: 'released',
      check: "Test: the model wrote the door's own two sides.",
      listed: {
        nextRound: ['A test must read its value.'],
        afterLanding: [{ what: 'The record has no label.', kind: 'code' }],
      },
    })
    expect(changed).toBe(true)
    expect(listed).toEqual({
      nextRound: ['A test must read its value.'],
      afterLanding: ['The record has no label.'],
    })
    expect(answer).not.toHaveProperty('listed')
    const check = (answer as Record<string, unknown>)['check']
    expect(check).toContain(theListedFaultsSay(['A test must read its value.'], ['The record has no label.']))
    expect(unread).toEqual([])
  })

  it('reads one listed item as a list of one, on the side its kind gives', () => {
    const oneString = onlyTheRealFaults({
      verdict: 'released',
      check: 'Test: a listed written as one string.',
      listed: 'A test must read its value.',
    })
    expect(oneString.listed).toEqual({ nextRound: ['A test must read its value.'], afterLanding: [] })
    expect(oneString.unread).toEqual([])

    const oneObject = onlyTheRealFaults({
      verdict: 'released',
      check: 'Test: a listed written as one object.',
      listed: { what: 'The record has no label.', kind: 'form' },
    })
    expect(oneObject.listed).toEqual({ nextRound: [], afterLanding: ['The record has no label.'] })
    expect(oneObject.unread).toEqual([])
  })

  it('says each part it could not read, lists the readable item and ends the check with the words', () => {
    const whole = onlyTheRealFaults({
      verdict: 'released',
      check: 'Test: a listed that is one number.',
      listed: 42,
    })
    expect(whole.listed).toEqual({ nextRound: [], afterLanding: [] })
    expect(whole.unread).toEqual(['42'])
    expect(whole.changed).toBe(true)
    expect(whole.answer).not.toHaveProperty('listed')
    expect((whole.answer as Record<string, unknown>)['check']).toBe(
      `Test: a listed that is one number.\n\n${theUnreadPartsSay(whole.unread)}`,
    )

    const mixed = onlyTheRealFaults({
      verdict: 'released',
      check: 'Test: a list holding parts it could not read.',
      listed: ['A test must read its value.', 7, { kind: 'form' }],
    })
    expect(mixed.listed).toEqual({ nextRound: ['A test must read its value.'], afterLanding: [] })
    expect(mixed.unread).toEqual(['7', JSON.stringify({ kind: 'form' })])
    expect(mixed.changed).toBe(true)
    expect(mixed.answer).not.toHaveProperty('listed')
    expect((mixed.answer as Record<string, unknown>)['check']).toBe(
      `Test: a list holding parts it could not read.\n\n${theListedFaultsSay(mixed.listed.nextRound, mixed.listed.afterLanding)}\n\n${theUnreadPartsSay(mixed.unread)}`,
    )
  })

  it('reads every empty shape as nothing, leaving the check alone', () => {
    const shapes: unknown[] = [undefined, null, '   ', [], {}, { nextRound: [], afterLanding: [] }]
    for (const listed of shapes) {
      const check = 'Test: the check lists nothing.'
      const answer = { verdict: 'released', check, ...(listed === undefined ? {} : { listed }) }
      const read = onlyTheRealFaults(answer)
      expect(read.unread, JSON.stringify(listed)).toEqual([])
      expect((read.answer as Record<string, unknown>)['check'], JSON.stringify(listed)).toBe(check)
      expect(read.changed, JSON.stringify(listed)).toBe(false)
    }
  })

  it('cuts a part it could not read at the length the code exports, and marks the cut', () => {
    const written = JSON.stringify({ note: 'x'.repeat(THE_LENGTH_AN_UNREAD_PART_KEEPS + 25) })
    expect(written.length).toBeGreaterThan(THE_LENGTH_AN_UNREAD_PART_KEEPS)
    const { unread } = onlyTheRealFaults({
      verdict: 'released',
      check: 'Test: a part too long to write whole.',
      listed: { note: 'x'.repeat(THE_LENGTH_AN_UNREAD_PART_KEEPS + 25) },
    })
    expect(unread).toEqual([`${written.slice(0, THE_LENGTH_AN_UNREAD_PART_KEEPS)}…`])
  })
})
