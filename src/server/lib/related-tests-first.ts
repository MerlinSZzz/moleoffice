// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE MERGE TOOL RUNS AN ENTRY'S RELATED TESTS FIRST: THE ONE SETTING, READ AND WRITTEN HERE AND NOWHERE ELSE.
 * Part B of a decision, and round 17c of wave 13v.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * With it on, the merge tool runs the test files an entry's change can break before the whole suite, and a file that
 * fails with the entry bounces it without the whole suite. Measured on 10 October 2026 it made a green entry slower, and
 * the owner was told it would not go live until it no longer slows anything (message xTBpZSUFC-Qi). So it is off until
 * somebody switches it on. It is not one of the owner's decided numbers, so a secretary proved by its own key may switch
 * it, with a reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES, AND WHAT EACH VALUE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * One column on the installation row, `related_tests_first`, added by migration 0213. NULL is nobody having chosen,
 * and it reads as off. 1 is on and 0 is off. Any other value is refused with a 500 that names it, so the merge tool
 * stops rather than test an entry on a reading nobody made.
 *
 * THE BOUND IS PART OF THE SETTING. A related file whose longest recorded time is over
 * RELATED_TESTS_SLOWER_THAN_SECONDS is left out of the related run and runs in the whole suite, as every file did
 * before. The merge tool takes the bound from this reading, so the number is written here and nowhere else.
 */

import { sqlite } from '../db/client.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. It is only built when the reader or the writer throws, never at
// import, so the import cycle through records.ts is safe.
import { PanelError } from './panel-error.ts'

/** A related file whose longest recorded time is over this many seconds runs in the whole suite, not first. */
export const RELATED_TESTS_SLOWER_THAN_SECONDS = 120

/** The reading, as the door answers it and the merge tool reads it. */
export interface RelatedTestsFirst {
  /** Whether the merge tool runs the related tests before the whole suite. */
  on: boolean
  /** True when nobody has switched it, and then it is off. */
  nobodyChose: boolean
  /** A related file whose longest recorded time is over this many seconds is left out of the related run. */
  leaveOutSlowerThanSeconds: number
  /** The reading in English, with the bound. */
  says: string
}

const WHAT_ON_MEANS =
  `the merge tool runs the test files an entry's change can break before the whole suite, and leaves out of that run ` +
  `any file whose longest recorded time is over ${String(RELATED_TESTS_SLOWER_THAN_SECONDS)} seconds; such a file runs ` +
  'in the whole suite, as before'

/** The stored value exactly as SQLite hands it over, or null because nobody chose or there is no row. */
function theStoredValue(): unknown {
  const row = sqlite.prepare('SELECT related_tests_first AS first FROM installation WHERE only_row = 1').get() as
    | { first: unknown }
    | undefined
  return row?.first ?? null
}

/** Whether the related tests run first, and who chose. Read from the row on every call, with nothing cached. */
export function whetherTheRelatedTestsRunFirst(): RelatedTestsFirst {
  const stored = theStoredValue()
  const leaveOutSlowerThanSeconds = RELATED_TESTS_SLOWER_THAN_SECONDS
  if (stored === null) {
    return { on: false, nobodyChose: true, leaveOutSlowerThanSeconds, says: `Off: nobody has switched it on. When on, ${WHAT_ON_MEANS}.` }
  }
  if (stored === 1) return { on: true, nobodyChose: false, leaveOutSlowerThanSeconds, says: `On: ${WHAT_ON_MEANS}.` }
  if (stored === 0) {
    return { on: false, nobodyChose: false, leaveOutSlowerThanSeconds, says: `Off: switched off. When on, ${WHAT_ON_MEANS}.` }
  }
  throw new PanelError(
    `Whether the related tests run first is stored as ${JSON.stringify(stored)} in installation.related_tests_first, and ` +
      'this office reads only nothing, 0 or 1 there. Nothing was guessed and nothing was changed.',
    500,
  )
}

/**
 * SWITCH THE RELATED TESTS FIRST ON OR OFF, AND ANSWER WITH THE READING AS IT NOW STANDS. `null` takes the choice away
 * again, which reads as off. The caller has already checked who is asking and what was sent. An update that changed no
 * row means this database has no installation row, and that is said rather than answered as done.
 */
export function setWhetherTheRelatedTestsRunFirst(on: boolean | null): RelatedTestsFirst {
  const written = sqlite
    .prepare('UPDATE installation SET related_tests_first = ? WHERE only_row = 1')
    .run(on === null ? null : on ? 1 : 0)
  if (written.changes !== 1) {
    throw new PanelError(
      'This database has no installation row, so whether the related tests run first could not be stored. Nothing was changed.',
      500,
    )
  }
  return whetherTheRelatedTestsRunFirst()
}
