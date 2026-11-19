// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERIOD READ OUT OF ORDINARY WORDS, OR NOTHING, AND NEVER A GUESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS READER IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Today, this week and this month were the whole of the time input. A person must be able to
 * name another day, another week, a month or a range without learning an internal date shape.
 *
 * So `readPeriodWords` reads a short list of shapes and refuses everything else. `parsePeriod` is
 * untouched beside it and stays the only thing that reads the three canonical keys — a reader of
 * loose words inside the parser would let a guess through the door that is meant to be strict.
 *
 * ---------------------------------------------------------------------------------------
 * THE HALF THAT MATTERS MOST IS THE REFUSALS
 * ---------------------------------------------------------------------------------------
 *
 * `Tuesday afternoon` has a defensible reading. `sometime next week` does not, and a product that
 * read the second one to be consistent with the first would have invented a fact. Each of those is
 * tested by name, because the temptation to "improve" the reader by handling them is exactly what
 * this file exists to catch.
 *
 * ---------------------------------------------------------------------------------------
 * A WINDOW IS NOT A PERIOD, AND THAT IS THE CHANGE OF 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * `aug 24-28` and `before friday` used to read as nothing at all. They are not periods — Mole Office
 * plans by the month, the week and the day, and five days is none of those — but they are not
 * nothing either. They are WINDOWS: a first day and a last day, which is when somebody means to work
 * on something. `readWindowWords` reads them, `readPeriodWords` still answers "no period" for them,
 * and the refusal now says which window it read instead of implying nothing was understood.
 *
 * Both functions read the same words through one parser, so the second group below checks that they
 * cannot disagree: whatever the window reader answers, the period reader answers the period that
 * covers exactly those days, or none.
 *
 * EVERY TEST USES A FIXED DAY — Wednesday 12 August 2026 — so that "next Friday" is a date this
 * file can state rather than a moving answer nobody can check.
 */

import { describe, expect, it } from 'vitest'
import {
  parsePeriod,
  readHoursWords,
  readPeriodWords,
  readTimeWords,
  readWindowWords,
} from '../src/shared/planning.ts'

/** Wednesday, 12 August 2026. Local wall clock, like every other date in Mole Office. */
const WEDNESDAY = new Date(2026, 7, 12)

/** The period key these words read as, or null when they read as nothing. */
function keyOf(words: string, now: Date = WEDNESDAY): string | null {
  const read = readPeriodWords(words, now)
  return read.read ? read.period.key : null
}

/** The sentence a reader gives when it read nothing. Fails loudly if it read something. */
function whyNot(words: string, now: Date = WEDNESDAY): string {
  const read = readPeriodWords(words, now)
  if (read.read) throw new Error(`expected "${words}" to read as nothing, and it read as ${read.period.key}`)
  return read.why
}

/** The span these words read as, written `from..to`, or null when they read as no window. */
function spanOf(words: string, now: Date = WEDNESDAY): string | null {
  const read = readWindowWords(words, now)
  return read.read ? `${read.window.startsOn}..${read.window.endsOn}` : null
}

/** The sentence the window reader gives when it read nothing. Fails loudly if it read something. */
function noSpanWhy(words: string, now: Date = WEDNESDAY): string {
  const read = readWindowWords(words, now)
  if (read.read) throw new Error(`expected "${words}" to read as no window, and it read as ${read.window.startsOn}`)
  return read.why
}

// ============================================================ what it reads

describe('the shapes it reads', () => {
  it('reads today, this week, next week, this month and next month', () => {
    expect(keyOf('today')).toBe('2026-08-12')
    expect(keyOf('this week')).toBe('2026-W33')
    expect(keyOf('next week')).toBe('2026-W34')
    expect(keyOf('this month')).toBe('2026-08')
    expect(keyOf('next month')).toBe('2026-09')
  })

  it('reads tomorrow', () => {
    expect(keyOf('tomorrow')).toBe('2026-08-13')
    const read = readPeriodWords('tomorrow', WEDNESDAY)
    expect(read.read && read.how).toContain('2026-08-13')
  })

  it('reads a month name with a day, and takes the next month of that name', () => {
    // The same convention a bare month name already follows, kept identical so there are not two
    // rules about the same words. `aug 24` in August 2026 is this August.
    expect(keyOf('aug 24')).toBe('2026-08-24')
    expect(keyOf('august 24')).toBe('2026-08-24')
    expect(keyOf('sept 3')).toBe('2026-09-03')
    expect(keyOf('january 6')).toBe('2027-01-06')
  })

  it('reads all twelve three-letter months, and refuses a shorter form that names two', () => {
    // THREE LETTERS IS THE SHORTEST THAT IS EVER ALLOWED, and it works because no two months share
    // one. This checks all twelve rather than only the one a person happened to type, so a short form that started
    // naming the wrong month would fail here and not on a screen.
    const shortForms = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    for (const [index, short] of shortForms.entries()) {
      const key = keyOf(`${short} 4`)
      expect(key, short).not.toBeNull()
      expect(String(key).slice(5, 7), `"${short} 4" read as ${String(key)}`).toBe(String(index + 1).padStart(2, '0'))
    }
    // `ma` is March and May. Picking one would be the guess this whole layer exists to avoid.
    expect(keyOf('ma 4')).toBeNull()
    expect(keyOf('ju 4')).toBeNull()
  })

  it('reads no day from a date that does not exist', () => {
    // `february 30` must never come back as 2 March, which is what building the date and not
    // checking it would do.
    expect(keyOf('february 30')).toBeNull()
    expect(keyOf('aug 0')).toBeNull()
    expect(keyOf('sep 31')).toBeNull()
  })

  it('reads a weekday as the next one, and says which date that is', () => {
    // A STATED CONVENTION, NOT A GUESS, and the interpretation is shown before anything is
    // committed. Friday is this week; Monday has gone, so it is the one coming.
    expect(keyOf('friday')).toBe('2026-08-14')
    expect(keyOf('monday')).toBe('2026-08-17')
    const read = readPeriodWords('friday', WEDNESDAY)
    expect(read.read && read.how).toContain('2026-08-14')
  })

  it('reads a weekday written on that same day as that day', () => {
    expect(keyOf('wednesday')).toBe('2026-08-12')
  })

  it('reads a part of a day as the day, and says so', () => {
    // Mole Office plans by the day. The afternoon stays in the words, and the reply says that rather
    // than dropping it in silence.
    expect(keyOf('tuesday afternoon')).toBe('2026-08-18')
    const read = readPeriodWords('tuesday afternoon', WEDNESDAY)
    expect(read.read && read.how).toContain('afternoon')
  })

  it('reads a month by name, and takes the next one when no year is given', () => {
    expect(keyOf('september')).toBe('2026-09')
    expect(keyOf('january')).toBe('2027-01')
    expect(keyOf('september 2027')).toBe('2027-09')
  })

  it('reads the canonical keys, which parsePeriod still owns', () => {
    expect(keyOf('2026-09-07')).toBe('2026-09-07')
    expect(keyOf('2026-W36')).toBe('2026-W36')
    expect(keyOf('2026-w36')).toBe('2026-W36')
    expect(keyOf('2026-09')).toBe('2026-09')
  })

  it('reads a range only when it covers exactly one period', () => {
    expect(keyOf('monday to sunday')).toBe('2026-W34')
    expect(keyOf('2026-09-01 to 2026-09-30')).toBe('2026-09')
    expect(keyOf('2026-09-07 to 2026-09-07')).toBe('2026-09-07')
  })

  it('never answers with a period parsePeriod would refuse', () => {
    // The two readers cannot drift: whatever this one answers, the strict parser reads back as the
    // same period. A key that only this reader believed in would reach the database and stop there.
    for (const words of ['today', 'next week', 'friday', 'september', '2026-w36', 'monday to sunday']) {
      const read = readPeriodWords(words, WEDNESDAY)
      expect(read.read, words).toBe(true)
      if (!read.read) continue
      expect(parsePeriod(read.period.key)).toEqual(read.period)
    }
  })
})

// ============================================================ what it refuses

describe('what it will not read, however plausible a reading would look', () => {
  it('reads nothing from "sometime next week", and names the word that stopped it', () => {
    // THE CASE THE WHOLE LAYER EXISTS FOR. "next week" on its own reads cleanly. "sometime" says
    // the person has not decided, and scheduling their week from it would invent the decision.
    expect(keyOf('sometime next week')).toBeNull()
    expect(whyNot('sometime next week')).toContain('sometime')
    expect(whyNot('sometime next week')).toContain('not settled')
  })

  it('reads no PERIOD from "before Friday", and says it read a window instead', () => {
    // A deadline names an end, not a month, a week or a day. What changed on 17 August 2026 is what
    // the refusal says: it names the window it read rather than implying nothing was understood.
    expect(keyOf('before friday')).toBeNull()
    expect(keyOf('Before Friday')).toBeNull()
    expect(whyNot('before friday')).toContain('before')
    expect(whyNot('before friday')).toContain('window')
  })

  it('reads nothing from the other hedged phrases the owner writes', () => {
    for (const words of ['maybe tuesday', 'around next week', 'probably this week', 'early september']) {
      expect(keyOf(words), words).toBeNull()
    }
  })

  it('reads nothing from "next monday", which English does not settle', () => {
    // It means the Monday of next week to some people and the coming Monday to others. There is no
    // reading to defend, so there is no reading.
    expect(keyOf('next monday')).toBeNull()
  })

  it('reads nothing from a date whose order is not stated', () => {
    // 3 April or 4 March, depending on where the writer learnt to write dates.
    expect(keyOf('03/04/2026')).toBeNull()
    expect(keyOf('3 april')).toBeNull()
  })

  it('reads nothing from a range that is not exactly a period, and says how long it is', () => {
    expect(keyOf('2026-09-07 to 2026-09-09')).toBeNull()
    expect(whyNot('2026-09-07 to 2026-09-09')).toContain('3 days')
    expect(keyOf('monday to friday')).toBeNull()
  })

  it('reads nothing from a range that ends before it starts', () => {
    expect(keyOf('2026-09-09 to 2026-09-07')).toBeNull()
    expect(whyNot('2026-09-09 to 2026-09-07')).toContain('before they start')
  })

  it('reads nothing from empty words, and from words that name no time at all', () => {
    expect(keyOf('')).toBeNull()
    expect(keyOf('   ')).toBeNull()
    expect(keyOf('when the gripper is fixed')).toBeNull()
    expect(whyNot('when the gripper is fixed')).toContain('a weekday')
  })

  it('reads nothing from a period key that is not a real period', () => {
    expect(keyOf('2026-W99')).toBeNull()
    expect(keyOf('2026-13')).toBeNull()
    expect(keyOf('2026-02-30')).toBeNull()
  })
})

// ============================================================ a window: a first day and a last day

describe('a span of days reads as a window, which is not a period and carries no hours', () => {
  it('reads a date range written with a hyphen, an en dash, or the word to', () => {
    // The owner's own examples. All four say the same five days and all four read the same.
    expect(spanOf('aug 24-28')).toBe('2026-08-24..2026-08-28')
    expect(spanOf('Aug 24 to 28')).toBe('2026-08-24..2026-08-28')
    expect(spanOf('aug 24 – 28')).toBe('2026-08-24..2026-08-28')
    expect(spanOf('aug 24 — 28')).toBe('2026-08-24..2026-08-28')
    expect(spanOf('aug 24 to aug 28')).toBe('2026-08-24..2026-08-28')
  })

  it('reads a range of full dates, and one written in weekdays', () => {
    expect(spanOf('2026-09-07 to 2026-09-09')).toBe('2026-09-07..2026-09-09')
    expect(spanOf('monday to friday')).toBe('2026-08-17..2026-08-21')
  })

  it('reads "before friday" as a window ending on that day, and says where it starts', () => {
    // A DEADLINE-SHAPED PHRASE. It names an end. The start is today, and the sentence says so
    // rather than leaving a person to work out which days Mole Office decided on.
    expect(spanOf('before friday')).toBe('2026-08-12..2026-08-14')
    expect(spanOf('before aug 24')).toBe('2026-08-12..2026-08-24')
    const read = readWindowWords('before friday', WEDNESDAY)
    expect(read.read && read.how).toContain('2026-08-14')
    expect(read.read && read.how).toContain('starts today, 2026-08-12')
  })

  it('reads the owner’s span across a week boundary, which no period key can name', () => {
    // Thursday to the following Wednesday. This is the case the whole table exists for.
    expect(spanOf('thursday to wednesday')).toBe('2026-08-13..2026-08-19')
  })

  it('never disagrees with the period reader about the same words', () => {
    // ONE PARSER, TWO ANSWERS. Where a span is exactly a day, a week or a month, the period reader
    // answers that period and its days are the window's days. Where it is not, it answers none.
    for (const words of ['monday to sunday', '2026-09-01 to 2026-09-30', 'aug 24-28', 'before friday']) {
      const span = spanOf(words)
      expect(span, words).not.toBeNull()
      const [from, to] = (span ?? '').split('..')
      const period = readPeriodWords(words, WEDNESDAY)
      if (period.read) {
        expect(period.period.from, words).toBe(from)
        expect(period.period.to, words).toBe(to)
      } else {
        expect(period.why, words).toContain('window')
      }
    }
  })

  it('reads no window from a single day, a week or a month, because those are periods', () => {
    // A caller that wants one of those as a span takes `from` and `to` off the period. Two readers
    // answering for the same words is the defect this repository keeps finding.
    for (const words of ['today', 'tomorrow', 'next week', 'september', '2026-09-07']) {
      expect(spanOf(words), words).toBeNull()
    }
  })

  it('reads no window from hedged words, and names the word that stopped it', () => {
    expect(spanOf('sometime before friday')).toBeNull()
    expect(noSpanWhy('sometime before friday')).toContain('sometime')
    expect(spanOf('maybe aug 24-28')).toBeNull()
    expect(noSpanWhy('maybe aug 24-28')).toContain('maybe')
  })

  it('reads no window from a range that runs backwards, or a day number that month has not got', () => {
    expect(spanOf('2026-09-09 to 2026-09-07')).toBeNull()
    expect(noSpanWhy('2026-09-09 to 2026-09-07')).toContain('before they start')
    expect(spanOf('aug 24-40')).toBeNull()
    expect(spanOf('feb 1-30')).toBeNull()
  })

  it('reads no window from words that name no time at all', () => {
    expect(spanOf('')).toBeNull()
    expect(spanOf('when the gripper is fixed')).toBeNull()
    expect(noSpanWhy('when the gripper is fixed')).toContain('aug 24-28')
  })

  it('never turns a window into hours', () => {
    // A WINDOW ANSWERS WHEN, NOT HOW MUCH. Reading five days must not produce a number of hours,
    // here or anywhere: nothing in the reply says how long the work takes.
    const read = readTimeWords('aug 24-28', WEDNESDAY)
    expect(read.window.read && read.window.window.startsOn).toBe('2026-08-24')
    expect(read.hours.read).toBe(false)
  })

  it('reads hours and a window out of one sentence, each answering for itself', () => {
    const read = readTimeWords('5h aug 24-28', WEDNESDAY)
    expect(read.hours.read && read.hours.hours).toBe(5)
    expect(read.window.read && read.window.window.endsOn).toBe('2026-08-28')
    expect(read.period.read).toBe(false)
  })
})

// ============================================================ it reads what it says it reads

describe('the vocabulary it advertises is the vocabulary it has', () => {
  it('reads every example named in its own refusal sentence', () => {
    // A PROMISE ABOUT WHAT THE READER TAKES. The sentence a person sees when nothing was read lists
    // the shapes that would have worked; a shape listed there and not read is the product lying
    // about itself, which is the defect this pairing exists to catch.
    const advertised = whyNot('when the gripper is fixed')
    for (const phrase of [
      'today',
      'tomorrow',
      'this week',
      'next week',
      'this month',
      'next month',
      '2026-09-07',
      'aug 24',
      '2026-W36',
      '2026-09',
    ]) {
      expect(advertised, `"${phrase}" is read and the sentence does not name it`).toContain(phrase)
      expect(keyOf(phrase), `"${phrase}" is named in the sentence and reads as nothing`).not.toBeNull()
    }
    // The two shapes it says are windows rather than periods really are both.
    expect(advertised).toContain('window')
    expect(advertised).toContain('before friday')
    expect(spanOf('before friday')).not.toBeNull()
    expect(keyOf('before friday')).toBeNull()
  })

  it('reads every example the window reader’s own refusal names', () => {
    const advertised = noSpanWhy('when the gripper is fixed')
    for (const phrase of ['aug 24-28', 'aug 24 to 28', 'monday to friday', 'before friday']) {
      expect(advertised, `"${phrase}" is read and the sentence does not name it`).toContain(phrase)
      expect(spanOf(phrase), `"${phrase}" is named in the sentence and reads as no window`).not.toBeNull()
    }
  })
})

// ============================================================ hours, and both halves together

describe('hours read the same way: a number with a unit, or nothing', () => {
  it('reads 5h, 5 hours and 2.5 hrs', () => {
    const five = readHoursWords('5h')
    expect(five.read && five.hours).toBe(5)
    const spelt = readHoursWords('5 hours')
    expect(spelt.read && spelt.hours).toBe(5)
    const half = readHoursWords('2.5 hrs')
    expect(half.read && half.hours).toBe(2.5)
  })

  it('reads nothing from a bare number, because a number is not a unit', () => {
    const bare = readHoursWords('5')
    expect(bare.read).toBe(false)
    expect(bare.read === false && bare.why).toContain('5h')
  })

  it('reads nothing from "around 5h", because the person said it was not settled', () => {
    const hedged = readHoursWords('around 5h')
    expect(hedged.read).toBe(false)
    expect(hedged.read === false && hedged.why).toContain('around')
  })

  it('reads nothing when one sentence names hours twice', () => {
    const twice = readHoursWords('3h and 4h')
    expect(twice.read).toBe(false)
    expect(twice.read === false && twice.why).toContain('more than once')
  })

  it('reads both halves of "15h this week", and each half answers for itself', () => {
    const both = readTimeWords('15h this week', WEDNESDAY)
    expect(both.hours.read && both.hours.hours).toBe(15)
    expect(both.period.read && both.period.period.key).toBe('2026-W33')

    const onlyHours = readTimeWords('15h', WEDNESDAY)
    expect(onlyHours.hours.read && onlyHours.hours.hours).toBe(15)
    expect(onlyHours.period.read).toBe(false)

    const onlyPeriod = readTimeWords('next week', WEDNESDAY)
    expect(onlyPeriod.hours.read).toBe(false)
    expect(onlyPeriod.period.read && onlyPeriod.period.period.key).toBe('2026-W34')

    const neither = readTimeWords('probably 15h this week', WEDNESDAY)
    expect(neither.hours.read).toBe(false)
    expect(neither.period.read).toBe(false)
  })
})
