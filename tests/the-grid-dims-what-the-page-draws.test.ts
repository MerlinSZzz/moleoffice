// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A POSITION IS DIMMED WHEN THE PAGE REALLY WOULD DRAW THE SAME THING, AND THE READER DECIDES THAT.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT, IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * The Settings grid dims a position whose drawing matches an earlier one. It worked out what a
 * position draws with ONE of the two filters the page applies — how much the report says — and not
 * the other, which is who each block was written for. So a report holding a block written for
 * developers gave two positions different keys for a normal reader who was drawn exactly the same
 * thing at both: the grid said the two positions differ, and the page drew them identically.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ASKED IN BOTH DIRECTIONS, BECAUSE A KEY THAT COLLAPSED EVERYTHING WOULD PASS HALF OF IT
 * ---------------------------------------------------------------------------------------
 *
 * The same record, the same two positions, read as a developer: the two keys DIFFER, because a
 * developer really is drawn the second block. A repair that dropped every block from the key would
 * satisfy the first assertion below and fail this one.
 *
 * MUTATION: take the `readerSees` filter out of `drawnAt`. The normal reader's two positions stop
 * matching and the first test goes red; the developer's keep differing, so the second stays green,
 * which is what says the two assertions are not the same assertion.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { RUNGS } from '../src/shared/detail.ts'
import type { PanelRecord, SummaryBlock } from '../src/shared/types.ts'

let says: typeof import('../src/web/components/DetailSays.tsx')

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  says = await import('../src/web/components/DetailSays.tsx')
})

/**
 * One heading and one paragraph under it, and the paragraph is written for developers.
 *
 * THE TWO POSITIONS THIS FILE COMPARED WERE READING LENGTHS 4 AND 5, WHICH DREW DIFFERENT SETS OF BLOCKS.
 * Every block has since been removed from every position below Full, with no excerpt kept in its
 * place, so no two positions below Full differ by a block, and Full is
 * the only position that draws one. The audience rule this file is about did not change, and it is
 * now asserted where blocks are drawn: the key for Full carries what THIS READER is shown and
 * nothing else.
 */
const BLOCKS: SummaryBlock[] = [
  { id: 'h', type: 'heading', text: 'How the gripper closes' } as unknown as SummaryBlock,
  {
    id: 'p',
    type: 'text',
    text: 'The controller writes the joint command at 250Hz.',
    audience: 'developers',
  } as unknown as SummaryBlock,
]

const RECORD = {
  id: 'cccccccccccc',
  kind: 'report',
  title: 'A report with one part written for developers',
  summary: 'One heading, one paragraph, and the paragraph is not for everybody.',
  data: { blocks: BLOCKS },
  createdAt: '2026-08-26T09:00:00',
  updatedAt: '2026-08-26T09:00:00',
} as unknown as PanelRecord

/** The same two blocks, with the second one written for everybody rather than for developers. */
const OPEN_TO_EVERYBODY: SummaryBlock[] = [
  BLOCKS[0] as SummaryBlock,
  { id: 'p', type: 'text', text: 'The controller writes the joint command at 250Hz.' } as unknown as SummaryBlock,
]

/**
 * THE SAME RECORD WITH ITS PARTS WRITTEN, so the three by-part positions have something to draw.
 *
 * Both blocks are covered, which is the rule the write door holds; nothing here goes through that
 * door, so the fixture obeys it rather than being checked by it.
 */
const WITH_PARTS = {
  ...RECORD,
  data: {
    blocks: BLOCKS,
    shortForms: {
      parts: {
        madeFrom: { seq: 1, contentHash: 'aaaa' },
        writtenBy: 'agent',
        parts: [
          {
            id: 'p-1',
            heading: 'How the gripper closes, in one sentence',
            text30: 'The controller writes a joint command at 250Hz and that is what closes the gripper.',
            text120: 'The controller writes a joint command at 250Hz, and that rate is what makes the close look smooth rather than stepped.',
            covers: ['h', 'p'],
          },
        ],
      },
    },
  },
} as unknown as PanelRecord

describe('the alias key and the page apply the same two filters', () => {
  it('really has a block a normal reader is not shown, so the checks below are not of nothing', () => {
    // The control: the two readers really do get different drawings of this record at Full, which
    // is what makes the assertions below mean anything.
    expect(RUNGS).toContain('full')
    expect(says.drawnAt(RECORD, BLOCKS, 'full', 'developer')).not.toBe(says.drawnAt(RECORD, BLOCKS, 'full', 'normal'))
  })

  it('leaves the developers-only block out of a normal reader’s key at Full', () => {
    const developer = says.drawnAt(RECORD, BLOCKS, 'full', 'developer').split(' ')
    const normal = says.drawnAt(RECORD, BLOCKS, 'full', 'normal').split(' ')
    // ONE BLOCK FEWER, AND THE ONE THAT IS GONE IS THE SECOND. A key that dropped the heading
    // instead would be the same length and would fail here.
    expect(developer.length - normal.length).toBe(1)
    expect(developer).toContain('1')
    expect(normal).not.toContain('1')
  })

  it('never drops a block the reader really is shown', () => {
    // The same two blocks, open to everybody: both readers get the same key, so nothing was
    // filtered that nobody asked to filter.
    expect(says.drawnAt(RECORD, OPEN_TO_EVERYBODY, 'full', 'normal')).toBe(
      says.drawnAt(RECORD, OPEN_TO_EVERYBODY, 'full', 'developer'),
    )
  })

  it('gives one key to two positions that really do draw the same thing', () => {
    // This record has no form written at any length, so every position below Full draws nothing and
    // the grid dims them — which is the aliasing the page really draws.
    expect(says.drawnAt(RECORD, BLOCKS, 'outline', 'normal')).toBe(says.drawnAt(RECORD, BLOCKS, 'sketch', 'normal'))
    expect(says.drawnAt(RECORD, BLOCKS, 'outline', 'normal')).not.toBe(says.drawnAt(RECORD, BLOCKS, 'full', 'normal'))
  })

  it('gives three keys to the three positions written by part, on a record that has them', () => {
    // THE THREE BY-PART POSITIONS DRAW NO LINE AND NO BLOCK, so a key built from those two alone is
    // the empty string at all three and the grid dims them as one — while the page draws a heading
    // at level 4, that heading with a 30-word text at 5, and with a 120-word text at 6. Found on
    // 3 September 2026 while the by-part levels were being built, and it is exactly the fault this
    // file was written for: the grid saying three positions are alike while the page draws three
    // different things.
    const keys = (['outline', 'sketch', 'digest'] as const).map((rung) =>
      says.drawnAt(WITH_PARTS, BLOCKS, rung, 'developer'),
    )
    expect(new Set(keys).size, keys.join(' | ')).toBe(3)
    for (const key of keys) expect(key).not.toBe('')
  })
})
