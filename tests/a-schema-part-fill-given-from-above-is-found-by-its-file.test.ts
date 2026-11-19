// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SCHEMA PART'S FILL GIVEN FROM ABOVE THE DATABASE FOLDER IS FOUND BY THE FILE THAT GIVES IT.
 *
 * A part whose fill is written by a file above src/server/db says `theFillGivenBy('<that file>')`, and
 * that file calls `giveTheFill` with the same path when it loads (src/server/db/part-tables.ts). So the
 * database folder imports nothing above itself. The part asks when it is declared, before the file has
 * loaded, so the fill is looked up only when the proof calls it.
 *
 *   (a) asked for a file that gave no fill, the fill fails and names the file;
 *   (b) asked before the file gives it, the fill given is the one called.
 *
 * The paths are made up and given nowhere else. tests/a-schema-part-table-is-exported-and-restored.test.ts
 * proves the real parts find their fills, through scripts/restore-check.ts.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. In `theFillGivenBy`, write "a file" for each `${file}` in the first line of the refusal → (a) goes red.
 *   2. In `giveTheFill`, do not set the fill → (b) goes red: the fill fails as never given.
 */
import { describe, expect, it } from 'vitest'

import { giveTheFill, theFillGivenBy } from '../src/server/db/part-tables.ts'

describe('a fill given from above the database folder is found by the file that gives it', () => {
  it('(a) fails and names the file when that file gave no fill', async () => {
    const file = 'tests/a-made-up-file-that-gives-no-fill.ts'
    const asked = theFillGivenBy(file)
    await expect(asked()).rejects.toThrow(file)
  })

  it('(b) calls the fill the file gives, though the part asked for it first', async () => {
    const file = 'tests/a-made-up-file-that-gives-a-fill.ts'
    const asked = theFillGivenBy(file)
    let calls = 0
    giveTheFill(file, async () => {
      calls++
      return 'a made-up row'
    })
    expect(await asked()).toBe('a made-up row')
    expect(calls, 'how many times the fill given was called').toBe(1)
  })
})
