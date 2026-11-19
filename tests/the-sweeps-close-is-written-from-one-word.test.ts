// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SWEEP'S CLOSE WORD IS WRITTEN FROM ONE DECLARATION.
 *
 * The office's sweep closes a row whose process or folder is gone with one close word, and the seal's
 * reader compares a row's close against that same word. Two writers used to spell it out for
 * themselves: the three patch builders in src/config/own-rows.mjs, and the close list in
 * src/shared/lifecycle.ts. If the declaration and a writer were changed apart they could disagree,
 * and a row the sweep closed could be sealed again. These cases read every writer through the
 * declaration, so a second spelling fails here.
 */

import { describe, expect, it } from 'vitest'
import { THE_SWEEPS_CLOSE } from '../src/config/finished.mjs'
import {
  theDeadOwnRowPatch,
  theDirectoryGoneRowPatch,
  theReplacedOwnRowPatch,
} from '../src/config/own-rows.mjs'

describe("the sweep's close word", () => {
  it("each close the sweep writes is the word the seal's reader compares with", () => {
    expect(theDeadOwnRowPatch(424242, '2026-01-02 03:04:05').closedHow, 'theDeadOwnRowPatch').toBe(
      THE_SWEEPS_CLOSE,
    )
    expect(
      theDirectoryGoneRowPatch('/tmp/a-folder-that-is-gone', '2026-01-02 03:04:05').closedHow,
      'theDirectoryGoneRowPatch',
    ).toBe(THE_SWEEPS_CLOSE)
    expect(theReplacedOwnRowPatch('2026-01-02 03:04:05').closedHow, 'theReplacedOwnRowPatch').toBe(
      THE_SWEEPS_CLOSE,
    )
  })
})
