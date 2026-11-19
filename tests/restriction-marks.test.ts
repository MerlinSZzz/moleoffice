// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HARMLESS PLACEHOLDER MAY NOT LOOK LIKE A PRODUCTION-BLOCKING ONE.
 *
 * The owner's product-surfaces section says it in one line: *"Do not make harmless Placeholders
 * visually equivalent to production-blocking ones."* This file is the half of that a machine can
 * hold. The other half is behaviour — a harmless restriction does not travel at all — and it lives
 * in `tests/harmless-does-not-travel.test.ts`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `withoutHue` AND NOT `tellsApart`
 * ---------------------------------------------------------------------------------------
 *
 * `tellsApart` in `src/shared/states.ts` is
 *
 *     one.word !== other.word || withoutHue(one.mark) !== withoutHue(other.mark)
 *
 * so it passes as soon as two WORDS differ. Six severity readings have six distinct words by
 * construction, so `tellsApart` would be green over this table however the marks were drawn — and
 * a mutation that gave a harmless restriction the production-blocking mark would go green with it.
 * A word is a different channel from a mark, and on a small graph card there may be no word at all.
 * So every pair below is compared on `withoutHue` directly, which is what `composition.ts` does for
 * this exact job, and what a test deleted on 13 November 2026 did for its six marks.
 */
import { describe, expect, it } from 'vitest'
import {
  RESTRICTION_MARKS,
  worstSeverity,
} from '../src/shared/restriction.ts'

const keys = () => Object.keys(RESTRICTION_MARKS)

describe('severity is a ranking and the array is it', () => {
  it('answers which of two is worse by reading the order of the array', () => {
    expect(worstSeverity('harmless', 'stops_final')).toBe('stops_final')
    expect(worstSeverity('limits_claims', 'harmless')).toBe('limits_claims')
    expect(worstSeverity('stops_final', 'limits_claims')).toBe('stops_final')
    expect(worstSeverity('harmless', 'harmless')).toBe('harmless')
  })
})
