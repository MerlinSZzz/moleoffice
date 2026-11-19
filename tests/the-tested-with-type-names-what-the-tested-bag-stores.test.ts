// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TestedWith TYPE NAMES WHAT THE TESTED BAG STORES. The suite's facts schema in src/server/lib/merge-state-machine.ts
 * accepts `passedForACheck` and `passedAlone` on `testedWith`, and the tested bag stores them as given: the entries a bus
 * passed over because files their release read would change on its tree, and those it passed over because they are
 * tested alone. TestedWith is the type a reader of that bag binds to, so it names both, as optional lists of entry ids.
 *
 * These cases are type checks. Vitest alone does not reject a key the type lacks; `tsc --noEmit` does, and it reads
 * this file. Every id here is made up.
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { TestedWith } from '../src/server/lib/merge-state-machine.ts'

// A tested bag as a bus's suite stores it: the first rider, the bus, and one entry passed over for each reason.
const STORED: TestedWith = {
  entry: 'a-rider',
  tree: 'a-made-up-tree',
  bus: [{ entry: 'a-rider' }],
  passedForACheck: ['an-entry-passed-over-for-a-check'],
  passedAlone: ['an-entry-tested-alone'],
}

describe('the TestedWith type', () => {
  it('takes a stored tested bag that names the entries a bus passed over, for a check and because they are tested alone', () => {
    expect(STORED.passedForACheck).toEqual(['an-entry-passed-over-for-a-check'])
    expect(STORED.passedAlone).toEqual(['an-entry-tested-alone'])
  })

  it('names each of the two as an optional list of entry ids, as the facts schema accepts it', () => {
    expectTypeOf<TestedWith['passedForACheck']>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<TestedWith['passedAlone']>().toEqualTypeOf<string[] | undefined>()
  })
})
