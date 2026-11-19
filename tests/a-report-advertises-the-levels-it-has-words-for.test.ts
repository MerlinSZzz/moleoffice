// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT ADVERTISES THE LEVELS IT HAS WORDS FOR, AND NO AGENT BACKFILLS THE REST.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE GUARDS, IN THE OWNER'S ACT
 * ---------------------------------------------------------------------------------------
 *
 * The owner's act of 15 September 2026 amended
 * criterion A14a of `design/pointing-reopened/ACCEPTANCE.md`: a level that nobody wrote is NOT
 * advertised on that report. The control does not offer the position, and no agent backfills a
 * paraphrase to fill it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE NARROWING LIVES, AND WHY NOT IN `rungsFor`
 * ---------------------------------------------------------------------------------------
 *
 * `rungsFor` answers WHICH POSITIONS EXIST for a record. The drawing, the bundle, the short-form
 * doors and `continuation.ts` all ask it that, and its answer has to keep saying a report has levels
 * 4 to 6 even where nobody wrote the parts, because a position that exists is a place the write door
 * will accept words for. "Has anybody written this one" is a different question. So `rungsFor` is
 * asserted here to be UNCHANGED, and the narrowing is asserted on `readerRungsFor`, which is the one
 * place the reader's control asks.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THESE RED
 * ---------------------------------------------------------------------------------------
 *
 *   in `readerRungsFor` in src/shared/detail.ts, drop the `why[rung] !== 'notWritten'` clause → the
 *   hole report's controls list every position again.
 *
 *   move the same clause into `rungsFor` → the `rungsFor` assertions here fail, and the drawing,
 *   the bundle and the write door lose the positions this act did not touch.
 *
 *   in the same function, narrow `title`, `gist` or `full` as well → the level-3 and Full cases go
 *   red.
 *
 *   make `readerRungsFor` narrow for a module too → the module case goes red.
 *
 *   make `stepWithin` return null in both directions for a rung that is not in the list → the
 *   no-trap case goes red.
 */

import { describe, expect, it } from 'vitest'
import {
  READER_FLOOR,
  RUNGS,
  readerRungsFor,
  rungsFor,
  stepWithin,
  whyEachLevelIsMissing,
  type DetailSource,
  type Rung,
} from '../src/shared/detail.ts'
import { formsWrittenIn } from '../src/shared/reportrungs.ts'

/** A label, in the shape `readStoredShortForms` reads back. */
const LABEL = { label: { text: 'Wrist mounts broke', madeFrom: { seq: 1, contentHash: 'aaaa' }, writtenBy: 'agent' } }

/** A by-part structure covering two blocks, in the shape `readStoredParts` reads back. */
const PARTS = {
  parts: {
    madeFrom: { seq: 1, contentHash: 'aaaa' },
    writtenBy: 'agent',
    parts: [
      {
        id: 'p-1',
        heading: 'What the pull test showed',
        text30: 'Three of four printed mounts broke below the load the trials need.',
        text120: 'Three of four printed clamp mounts broke at the thin section behind the bolt circle.',
        covers: ['b-1'],
      },
      {
        id: 'p-2',
        heading: 'The aluminium mount is next',
        text30: 'Nobody has pulled it yet; the blanks are not bought.',
        text120: 'Nobody has pulled the aluminium mount because the blanks are not bought.',
        covers: ['b-2'],
      },
    ],
  },
}

/** One record as the resolver sees it. */
function source(over: Partial<DetailSource> = {}): DetailSource {
  return {
    title: 'Wrist mount pull test, round eight',
    summary: 'Three of four printed mounts broke below the trial load, so only the aluminium one is worth another run.',
    shortForms: LABEL,
    declaresShortForms: true,
    body: { field: 'data.blocks', written: true },
    // NO `ownWords`: nothing measured this record, so `rungsFor` takes no rung away for length and
    // the only thing that can narrow the list is the act this file is about.
    ...over,
  }
}

const REPORT = 'report'
const MODULE = 'module'

/** The rungs one record advertises to a reader on the report-content surface. */
function advertised(record: DetailSource, kind: string): Rung[] {
  return [...readerRungsFor(record, 'reportContent', kind, new Set(formsWrittenIn(record).map((one) => one.rung)))]
}

/** The same list from a written set stated directly, for a record with no stored forms at all. */
function advertisedWithNothingWritten(record: DetailSource): Rung[] {
  return [...readerRungsFor(record, 'reportContent', REPORT, new Set())]
}

// ============================================================ 1. what exists is not what is advertised

describe('a position nobody wrote exists, and is not advertised', () => {
  it('keeps the whole ladder in `rungsFor`, which answers what positions exist', () => {
    expect([...rungsFor(source())]).toEqual([...RUNGS])
  })

  it('offers a report only the levels it has words for', () => {
    expect(advertised(source(), REPORT)).toEqual(['gist', 'full'])
  })

  it('offers the by-part levels again once somebody writes the parts', () => {
    const withParts = source({ shortForms: { ...LABEL, ...PARTS } })
    expect(advertised(withParts, REPORT)).toEqual(['gist', 'outline', 'sketch', 'digest', 'full'])
  })

  it('still answers, for the drawing, WHY a level is missing', () => {
    // The narrowing does not delete the reason; it reads it. A drawing that says *nobody has written
    // this record by part* still gets that answer, and so does a worklist.
    const why = whyEachLevelIsMissing(source(), new Set(formsWrittenIn(source()).map((one) => one.rung)))
    expect(why).toMatchObject({ outline: 'notWritten', sketch: 'notWritten', digest: 'notWritten' })
  })
})

// ============================================================ 2. the three that are never narrowed away

describe('levels 2 and 3 and Full are never narrowed away', () => {
  it('keeps level 3 even where the record has no summary, because another rule advertises it', () => {
    const noSummary = source({ summary: null })
    expect(advertised(noSummary, REPORT)).toEqual(['gist', 'full'])
  })

  it('keeps Full even where every shorter level is missing, because Full is the record itself', () => {
    const bare = source({ summary: null, shortForms: undefined })
    expect(advertisedWithNothingWritten(bare)).toEqual(['gist', 'full'])
  })

  /**
   * LEVEL 2 IS BELOW THE READER FLOOR FOR A REPORT, so for a report it is the floor that keeps it
   * off the list and not this act. On a module — where neither the floor nor the narrowing applies —
   * every position stands, level 2 among them.
   */
  it('keeps level 2 on the kinds the act does not name, and every position with it', () => {
    expect(advertised(source(), MODULE)).toEqual([...RUNGS])
    expect(advertised(source({ summary: null }), MODULE)).toEqual([...RUNGS])
  })
})

// ============================================================ 3. a reader is never trapped

describe('a reader standing on a list with a hole in it can always move', () => {
  const WITH_A_HOLE = ['gist', 'full'] as const

  it('answers from the nearest rung below for a rung that is not in the list', () => {
    for (const rung of ['label', 'title', 'outline', 'sketch', 'digest'] as const) {
      const shorter = stepWithin(WITH_A_HOLE, rung, -1)
      const longer = stepWithin(WITH_A_HOLE, rung, 1)
      expect(shorter === null && longer === null, `${rung} is a trap`).toBe(false)
    }
  })

  it('never leaves both directions null except at the ends of the list', () => {
    for (const rung of RUNGS) {
      const shorter = stepWithin(WITH_A_HOLE, rung, -1)
      const longer = stepWithin(WITH_A_HOLE, rung, 1)
      const atTheEnds = rung === 'gist' || rung === 'full'
      if (!atTheEnds) expect(shorter === null && longer === null, `${rung} is a trap`).toBe(false)
    }
  })

  it('moves off a hole and reaches both offered positions from it', () => {
    // A stored Level 4 on a report whose parts nobody wrote. The nearest rung below is the
    // conclusion, and the conclusion can reach Full, so no reader is stuck on the hole.
    expect(stepWithin(WITH_A_HOLE, 'outline', 1)).toBe(READER_FLOOR)
    expect(stepWithin(WITH_A_HOLE, READER_FLOOR, 1)).toBe('full')
  })
})
