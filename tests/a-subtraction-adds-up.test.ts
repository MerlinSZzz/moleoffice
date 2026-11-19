// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPLY THAT LEAVES SOMETHING OUT SAYS HOW MANY AND OF WHAT KIND.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/disclosure.ts` is the one shape three new callers share — a context bundle, a scoped
 * continuation read, and any reply narrowed by permission — and `checkSubtraction` is the one
 * function each of them calls before it replies. These tests hold what that function refuses.
 *
 * The rule it makes checkable is `design/round-ten/design/projections.md` §7.2: *the reader is
 * never a reason; a reply may be narrowed by what the caller asked for, by a size budget, or by
 * permission, and every narrowing is declared in the same reply, as structure.*
 *
 * ---------------------------------------------------------------------------------------
 * WHY A THROW AND NOT A TEST ASSERTION
 * ---------------------------------------------------------------------------------------
 *
 * A test can be forgotten for a read that did not exist when the test was written. The check is
 * inside the function every subtracting read calls, so a read that builds its reply through it
 * cannot ship a count nothing accounts for.
 *
 * WHAT THAT DOES NOT REACH, SAID HERE SO NOBODY READS THIS FILE AS MORE THAN IT IS: a read that
 * narrows and ships no counts at all never calls this function and is outside every test in this
 * file. That half is forced at route registration — `subtracts` becomes a required key in the route
 * config, and a route that declares none does not start the server. That is a different wave and a
 * different test, and the design says so at §7.2 *Where disclosure is actually forced*.
 */

import { describe, expect, it } from 'vitest'
import {
  LEFT_OUT_CAUSES,
  checkSubtraction,
  type DroppedFields,
  type LeftOutCounts,
  type LeftOutGroup,
} from '../src/shared/disclosure.ts'

/** The buckets a read of this shape would declare for itself. Local, closed, `as const`. */
const BUCKETS = ['finished', 'too_far', 'not_yours'] as const
type Bucket = (typeof BUCKETS)[number]

const counts = (over: Partial<LeftOutCounts> = {}): LeftOutCounts => ({
  candidates: 10,
  carried: 7,
  leftOut: 3,
  shortened: 0,
  ...over,
})

const group = (over: Partial<LeftOutGroup<Bucket>> = {}): LeftOutGroup<Bucket> => ({
  cause: 'budget',
  bucket: 'finished',
  count: 3,
  ids: ['a', 'b', 'c'],
  ...over,
})

// ============================================================================ the honest replies

describe('a reply that declares what it left out', () => {
  it('passes when the arithmetic adds up and every group names its ids', () => {
    expect(() => checkSubtraction('a read', counts(), [group()])).not.toThrow()
  })

  it('passes when nothing was left out at all', () => {
    expect(() =>
      checkSubtraction('a read', counts({ candidates: 4, carried: 4, leftOut: 0 }), []),
    ).not.toThrow()
  })

  it('passes when permission withheld the ids and still said how many', () => {
    expect(() =>
      checkSubtraction('a read', counts(), [
        group({ cause: 'permission', bucket: 'not_yours', ids: null }),
      ]),
    ).not.toThrow()
  })

  it('passes when a carried member was shortened rather than dropped', () => {
    const shortened: DroppedFields[] = [
      { cause: 'budget', ids: ['x', 'y'], droppedFields: ['learned', 'drifted'] },
    ]
    expect(() =>
      checkSubtraction('a read', counts({ shortened: 2 }), [group()], shortened),
    ).not.toThrow()
  })

  it('offers three causes and the reader is not one of them', () => {
    expect([...LEFT_OUT_CAUSES]).toEqual(['selection', 'budget', 'permission'])
    expect(LEFT_OUT_CAUSES as readonly string[]).not.toContain('reader')
  })
})

// ============================================================================ what it refuses

describe('a reply that drops rows without saying so', () => {
  it('refuses a reply whose carried and left out do not reach its candidates', () => {
    // Ten could have been carried, seven were, and only two are accounted for. The tenth is gone
    // and nothing on the reply says where it went.
    expect(() =>
      checkSubtraction('open loops', counts({ leftOut: 2 }), [group({ count: 2, ids: ['a', 'b'] })]),
    ).toThrow(/lost a record: 10 candidates, 7 carried, 2 left out/)
  })

  it('refuses a left-out count that no group explains', () => {
    expect(() =>
      checkSubtraction('open loops', counts(), [group({ count: 2, ids: ['a', 'b'] })]),
    ).toThrow(/says 3 were left out and its groups account for 2/)
  })

  it('refuses a selection or budget group that names no ids', () => {
    expect(() => checkSubtraction('open loops', counts(), [group({ ids: null })])).toThrow(
      /was left out by budget and names no ids/,
    )
    expect(() =>
      checkSubtraction('open loops', counts(), [group({ cause: 'selection', ids: null })]),
    ).toThrow(/was left out by selection and names no ids/)
  })

  it('refuses a group that names fewer ids than it counted', () => {
    expect(() => checkSubtraction('open loops', counts(), [group({ ids: ['a'] })])).toThrow(
      /says 3 were left out and names 1 of them/,
    )
  })

  it('refuses a permission group that hands over the ids it withheld', () => {
    expect(() =>
      checkSubtraction('open loops', counts(), [
        group({ cause: 'permission', bucket: 'not_yours', ids: ['a', 'b', 'c'] }),
      ]),
    ).toThrow(/may not have these records may not have their ids either/)
  })

  it('refuses an empty id list under permission, because that reads as nothing was left out', () => {
    // `[]` and `null` are different answers: one says none were dropped, the other says you are not
    // being told which. The shape refuses the one that lies.
    expect(() =>
      checkSubtraction('open loops', counts({ leftOut: 0, carried: 10 }), [
        group({ cause: 'permission', bucket: 'not_yours', count: 0, ids: [] }),
      ]),
    ).toThrow(/left out by permission and names its ids/)
  })

  it('refuses a count that is not a whole number of things', () => {
    expect(() => checkSubtraction('open loops', counts({ carried: -1, leftOut: 11 }), [])).toThrow(
      /carried is -1/,
    )
  })

  it('refuses a shortening that names no member', () => {
    expect(() =>
      checkSubtraction('a bundle', counts(), [group()], [
        { cause: 'budget', ids: [], droppedFields: ['learned'] },
      ]),
    ).toThrow(/names no member it shortened/)
  })

  it('refuses a shortening that names no field it took off', () => {
    expect(() =>
      checkSubtraction('a bundle', counts({ shortened: 1 }), [group()], [
        { cause: 'budget', ids: ['x'], droppedFields: [] },
      ]),
    ).toThrow(/names no field it took off/)
  })

  it('refuses a shortened count that disagrees with the members named', () => {
    expect(() =>
      checkSubtraction('a bundle', counts({ shortened: 5 }), [group()], [
        { cause: 'budget', ids: ['x', 'y'], droppedFields: ['learned'] },
      ]),
    ).toThrow(/says 5 carried members were shortened and names 2/)
  })
})
