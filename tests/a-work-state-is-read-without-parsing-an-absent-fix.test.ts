// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD'S WORK STATE IS READ WITHOUT PARSING A MAIN-SUITE FIX IT DOES NOT HAVE, AND THE ANSWERS ARE THE SAME.
 *
 * Wave 13y round 114, item 47. `readWorkState` in src/shared/work.ts gives a record's stored `data.state`, or a state
 * derived from a valid `data.mainSuiteFix`. For a record with neither, it asked `mainSuiteFixSchema.safeParse` of
 * undefined. The schema is an object, so that parse always fails, and the answer was no state and no source. The
 * owner's attention page asks this of every record it reads that is not deleted, of 47,866 records in one reading on
 * the made-up office shaped to the live counts of the second-largest project on 31 October 2026. There a profile put
 * about 203 ms of each reading in readWorkState, at load about 48, and for such a record it does nothing but the parse.
 * The function now gives that same answer before the parse when `data.mainSuiteFix` is absent.
 *
 * WHAT THIS FILE HOLDS:
 *   1. no parse. For data with no `mainSuiteFix`, or with one whose value is undefined, the answer is no state and no
 *      source, and the schema's `safeParse` is not called.
 *   2. the same answers. Data that is not an object, a stored state (a value, null, undefined, and beside a valid
 *      fix), a fix that does not parse (an empty object, null, a word), and each valid fix (open, fixed, worked
 *      around) give the answers they gave before the change. A fix that is there is still parsed.
 *
 * CONTROL: case 1 is red before the change, for every data: `safeParse` is called once. Case 2 passes before and
 * after.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `readWorkState`, take the new line out again. Case 1 goes red.
 *   2. In it, return the source `stored` from the new line. Case 1 goes red.
 *   3. In it, return from the new line when `mainSuiteFix` is anything but an object. Case 2 goes red: a fix stored
 *      as a word is no longer parsed.
 *
 * WHAT IT DOES NOT HOLD. How long a reading takes; the times are in the round's report and the commit. How a derived
 * state is drawn, which tests/a-derived-state-is-never-called-stored.test.ts holds.
 *
 * WHAT IS REAL: nothing. Every fix is the shared example, `MAIN_SUITE_FIX_EXAMPLE`, with made-up outcomes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAIN_SUITE_FIX_EXAMPLE, mainSuiteFixSchema, type MainSuiteFix } from '../src/shared/main-suite-fix.ts'
import { readWorkState } from '../src/shared/work.ts'

function repair(extra: Partial<MainSuiteFix> = {}): MainSuiteFix {
  return mainSuiteFixSchema.parse({ ...structuredClone(MAIN_SUITE_FIX_EXAMPLE), ...extra })
}
const OPEN = repair({ pending: { phase: 'takeout', says: 'Made-up take-out has not landed.' } })
const FIXED = repair({ outcome: { fixed: 'c'.repeat(40) }, fixedReceipt: { recordId: 'made-up-original-green', seq: 1, contentHash: '1'.repeat(16) } })
const WORKED_AROUND = repair({ outcome: { returned: 'made-up-returned-change' } })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("a record's work state", () => {
  it.each([
    ['an empty object', {}],
    ['a title and no fix', { title: 'Made-up', body: 'made up' }],
    ['a fix whose value is undefined', { mainSuiteFix: undefined }],
  ] as const)('1. is read without a parse, from %s', (_what, data) => {
    const parse = vi.spyOn(mainSuiteFixSchema, 'safeParse')
    expect(readWorkState(data)).toEqual({ state: undefined, source: null })
    expect(parse).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null, { state: undefined, source: null }, 0],
    ['a list', [{ state: 'doing' }], { state: undefined, source: null }, 0],
    ['a word', 'doing', { state: undefined, source: null }, 0],
    ['a stored state', { state: 'doing' }, { state: 'doing', source: 'stored' }, 0],
    ['a stored null', { state: null }, { state: null, source: 'stored' }, 0],
    ['a stored undefined', { state: undefined }, { state: undefined, source: 'stored' }, 0],
    ['a stored state beside a valid fix', { state: 'blocked', mainSuiteFix: FIXED }, { state: 'blocked', source: 'stored' }, 0],
    ['a fix that is an empty object', { mainSuiteFix: {} }, { state: undefined, source: null }, 1],
    ['a fix that is null', { mainSuiteFix: null }, { state: undefined, source: null }, 1],
    ['a fix that is a word', { mainSuiteFix: 'fixed' }, { state: undefined, source: null }, 1],
    ['an open fix', { mainSuiteFix: OPEN }, { state: 'open', source: 'derived from mainSuiteFix' }, 1],
    ['a fixed fix', { mainSuiteFix: FIXED }, { state: 'fixed', source: 'derived from mainSuiteFix' }, 1],
    ['a fix worked around', { mainSuiteFix: WORKED_AROUND }, { state: 'worked_around', source: 'derived from mainSuiteFix' }, 1],
  ] as const)('2. is the same answer, from %s', (_what, data, answer, parses) => {
    const parse = vi.spyOn(mainSuiteFixSchema, 'safeParse')
    expect(readWorkState(data)).toEqual(answer)
    expect(parse).toHaveBeenCalledTimes(parses)
  })
})
