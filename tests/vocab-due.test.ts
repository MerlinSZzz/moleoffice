// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OBLIGATION CAN COME DUE ON SOMETHING OTHER THAN A DATE — AND STILL NOBODY INVENTS A DEADLINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `Pause.until` has always accepted a date, a condition in words, or the record whose finishing ends
 * it. `obligation.due` accepted a date and nothing else, so "owed when the reprint lands" — a thing
 * this lab says constantly — could be recorded on a pause and not on the obligation it was about.
 *
 * The two are one idea: what has to happen before this matters again. So `due` takes the same shape,
 * checked by the same `PauseUntil` spec, and there is no second representation to keep in step.
 *
 * THE HALF THAT MATTERS MORE IS THE RANKING. Overdue is the strongest thing the attention rule ranks
 * on, and only a date can make something overdue. An obligation due on a condition is WAITING: its
 * trigger has not fired, nobody is late. The tempting middle — turning a written condition into a
 * date so the ranking has a number — is the silent substitution this product bans, and it would be
 * invisible afterwards, because an invented date looks exactly like one somebody wrote.
 *
 * So `latenessMs` answers null, and null is not zero and not "on time".
 *
 * NO DATABASE. A pure read of the declarations and the readers.
 */

import { describe, expect, it } from 'vitest'
import { KIND_SPECS, validateData } from '../src/shared/kinds.ts'
import {
  DUE_STANDINGS,
  DUE_STANDING_SENTENCES,
  dueStandingOf,
  latenessMs,
  readDue,
} from '../src/shared/work.ts'

/** A stamp reader like the one the product uses: readable dates only, null for anything else. */
const dueMs = (stamp: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stamp.trim())
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime()
}

const NOW = new Date(2026, 7, 20, 12, 0, 0).getTime()

describe('the three ways an obligation can come due', () => {
  it('takes the bare date every stored obligation already holds', () => {
    const result = validateData('obligation', { due: '2026-08-14' })
    expect(result.ok, result.ok ? '' : result.errors.map((e) => e.message).join(' | ')).toBe(true)
    expect(readDue({ due: '2026-08-14' })).toEqual({ when: 'date', date: '2026-08-14' })
  })

  it('takes a condition in words', () => {
    const data = { due: { condition: 'the replacement 50 N gauge is on the bench' } }
    const result = validateData('obligation', data)
    expect(result.ok, result.ok ? '' : result.errors.map((e) => e.message).join(' | ')).toBe(true)
    expect(readDue(data)).toEqual({ when: 'condition', condition: 'the replacement 50 N gauge is on the bench' })
  })

  it('takes the record whose finishing makes it due', () => {
    const data = { due: { recordId: 'rec_01J9ZQ8N6R7T2X4V' } }
    const result = validateData('obligation', data)
    expect(result.ok, result.ok ? '' : result.errors.map((e) => e.message).join(' | ')).toBe(true)
    expect(readDue(data)).toEqual({ when: 'record', recordId: 'rec_01J9ZQ8N6R7T2X4V' })
  })

  it('reuses the shape a pause already uses rather than declaring a second one', () => {
    // One shape, one check, one set of rules. Two shapes saying the same three things is the defect
    // this codebase keeps producing, and it would have been invisible: both would have worked.
    const due = KIND_SPECS.obligation.fields.find((f) => f.key === 'due')
    expect(due?.type).toBe('date | PauseUntil')
    const pause = KIND_SPECS.problem.fields.find((f) => f.key === 'paused')
    expect(pause?.type).toBe('Pause')
  })

  it('keeps the shape\'s own rule: an empty object says nothing and is refused', () => {
    const result = validateData('obligation', { due: {} })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((e) => e.message).join(' ')).toContain('what should end this pause')
  })

  it('keeps the date check inside the object form too', () => {
    const result = validateData('obligation', { due: { date: '2026-02-31' } })
    expect(result.ok, 'a date that does not exist was accepted inside the object form').toBe(false)
  })

  it('names both forms when the value is neither', () => {
    const result = validateData('obligation', { due: 12 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const message = result.errors.map((e) => e.message).join(' ')
    expect(message).toContain('a date like')
    expect(message).toContain('PauseUntil')
  })
})

describe('what each form means for being late', () => {
  it('makes a date-due obligation late, and says how late', () => {
    const late = latenessMs(readDue({ due: '2026-08-14' }), NOW, dueMs)
    expect(late).not.toBeNull()
    expect(late ?? 0).toBeGreaterThan(0)
  })

  it('says how much time is left, as a negative, when the date is still ahead', () => {
    const early = latenessMs(readDue({ due: '2026-09-01' }), NOW, dueMs)
    expect(early).not.toBeNull()
    expect(early ?? 0).toBeLessThan(0)
  })

  it('ANSWERS NULL FOR A CONDITION, AND NULL IS NOT ZERO', () => {
    // The one that matters. A condition-due obligation is waiting, not late, and there is no
    // truthful number of milliseconds to report about it. Returning 0 would put it exactly on time
    // — a number nobody wrote — and every ranking downstream would treat it as a real reading.
    const late = latenessMs(readDue({ due: { condition: 'the reprint is on the bench' } }), NOW, dueMs)
    expect(late).toBeNull()
    expect(late).not.toBe(0)
  })

  it('answers null for a record trigger and for an obligation with nothing written', () => {
    expect(latenessMs(readDue({ due: { recordId: 'rec_1' } }), NOW, dueMs)).toBeNull()
    expect(latenessMs(readDue({}), NOW, dueMs)).toBeNull()
  })

  it('answers null rather than guessing when the stored date cannot be read', () => {
    expect(latenessMs(readDue({ due: 'next Tuesday' }), NOW, dueMs)).toBeNull()
  })
})

describe('where an obligation stands on coming due', () => {
  it('has a standing and a sentence for each of the five situations', () => {
    for (const standing of DUE_STANDINGS) {
      expect(DUE_STANDING_SENTENCES[standing], `no sentence is published for "${standing}"`).toBeTruthy()
    }
  })

  it('tells the five apart', () => {
    expect(dueStandingOf(readDue({ due: '2026-08-14' }), dueMs)).toBe('dated')
    expect(dueStandingOf(readDue({ due: 'next Tuesday' }), dueMs)).toBe('date-unreadable')
    expect(dueStandingOf(readDue({ due: { condition: 'the reprint lands' } }), dueMs)).toBe('waiting-on-a-condition')
    expect(dueStandingOf(readDue({ due: { recordId: 'rec_1' } }), dueMs)).toBe('waiting-on-a-record')
    expect(dueStandingOf(readDue({}), dueMs)).toBe('no-due-recorded')
  })

  it('says out loud that Mole Office will not turn a condition into a date', () => {
    expect(DUE_STANDING_SENTENCES['waiting-on-a-condition']).toContain('waiting')
    expect(DUE_STANDING_SENTENCES['waiting-on-a-condition']).toContain('will not invent one')
  })

  it('keeps everything the author wrote, and says which one decides', () => {
    // An obligation carrying both a date and a condition has said two things, and a reader should
    // show both. `when` says which one answers "is this late" — the date, because it is the only
    // one Mole Office can decide for itself.
    const due = readDue({ due: { date: '2026-08-14', condition: 'the reprint lands' } })
    expect(due.when).toBe('date')
    expect(due.condition).toBe('the reprint lands')
  })
})
