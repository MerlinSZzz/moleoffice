// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PARKED IDEA KEEPS ITS REASON IN `parked_because`, AND THAT IS THE DECISION, NOT THE MESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * When `parked` was classified as `paused`, three ideas moved into the paused group and the reading
 * surface said this about each of them: *its state word says paused and no reason and no resume
 * condition were ever written*. Every one of the three had a reason, written by hand, sitting in
 * `data.parked_because` — on a kind whose own schema declares that field with the sentence "Without
 * this, a parked idea reads as a forgotten one". The reader was looking in exactly one place.
 *
 * The decision is that `parked_because` is CANONICAL for an idea, and the reason it is not simply
 * tidied into the `Pause` shape every other kind uses is `Pause.since`: the date it was put down is
 * required, because that is what makes an old pause visible as an old one, and an idea that was
 * never picked up has no such date. Inventing one is the guess this product refuses; making `since`
 * optional would weaken the field on the eight kinds where it is doing real work.
 *
 * So this is a deliberate per-kind distinction, with one reader that knows about it and a one-entry
 * exception table. This file is what stops the next reader "tidying" it into a duplicate — and what
 * stops the exception quietly growing a second entry.
 *
 * NO DATABASE. A pure read of two declaration files.
 */

import { describe, expect, it } from 'vitest'
import { validateData } from '../src/shared/kinds.ts'
import { putDownReason, readPause } from '../src/shared/work.ts'

const PARKED = {
  state: 'parked',
  parked_because: 'there are 240 replays of two people. That is not a demonstration set, it is an anecdote.',
}

describe('an idea keeps its reason where the kind declares it', () => {
  it('needs no date, because a parked idea has none to give', () => {
    const result = validateData('idea', PARKED)
    expect(result.ok, result.ok ? '' : result.errors.map((e) => e.message).join(' | ')).toBe(true)
  })
})

describe('the one reader that knows where each kind keeps it', () => {
  it('finds a parked idea\'s reason, and says which field it came from', () => {
    expect(putDownReason('idea', PARKED)).toEqual({ why: PARKED.parked_because, from: 'parked_because' })
  })

  it('finds every other kind\'s reason in the standard pause block', () => {
    const problem = { state: 'open', paused: { since: '2026-08-01', why: 'the force gauge went back to the metrology lab' } }
    expect(putDownReason('problem', problem)).toEqual({
      why: 'the force gauge went back to the metrology lab',
      from: 'paused.why',
    })
  })

  it('answers null rather than inventing a reason nobody wrote', () => {
    expect(putDownReason('idea', { state: 'parked' })).toBeNull()
    expect(putDownReason('problem', { state: 'open' })).toBeNull()
    expect(putDownReason('idea', { state: 'parked', parked_because: '   ' })).toBeNull()
  })

  it('leaves `readPause` reading exactly one field, on every kind', () => {
    // `readPause` is not taught the exception, and that is deliberate: it answers "is there a
    // pause block on this record", which is a different question with a different answer, and the
    // sentence about a pause not being recorded is true of a parked idea. What was false was
    // concluding from it that no REASON existed. Two readers, two questions.
    expect(readPause(PARKED)).toBeNull()
    expect(readPause({ paused: { since: '2026-08-01', why: 'no rig' } })?.why).toBe('no rig')
  })
})

