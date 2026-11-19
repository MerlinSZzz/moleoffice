// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO DIFFERENT WIDTHS, AND NEITHER OF THEM IS GUESSED AT.
 *
 * The owner settled the width vocabulary on 29 August 2026:
 *
 *   "On width semantics: I distinguish composition share from prose measure. Agents should be
 *    allowed to naturally request proportions such as 60/40, 50/50, or 3:2 between sibling regions.
 *    Those are layout intent, not raw CSS authority. Canonical storage may normalize percentages
 *    into relative shares and the renderer may adjust them for minimum readable sizes. measure is
 *    separate and controls only the writing width inside a prose region. An ambiguous input like
 *    width: 600 should not silently become either concept; make the interpretation explicit or
 *    require the Agent to distinguish share from measure before canonical storage."
 *
 * SO THERE ARE THREE THINGS TO HOLD AND THIS FILE HOLDS THEM.
 *
 *   1. THE THREE SPELLINGS ARE ACCEPTED AND REDUCED. `share: 60`/`40`, `share: "60%"`/`"40%"` and
 *      `proportions: "3:2"` all store shares of 3 and 2. The reduction is LOSSLESS in the sense the owner
 *      asked for: the row keeps the spelling that was written, so the answer can say what was asked
 *      and what is drawn in one sentence.
 *   2. NOTHING IS RESCALED. Percentages that do not add up to 100 are refused, not stretched. A
 *      ratio with no common factor left and a term over the bound is refused, not rounded.
 *   3. AN AMBIGUOUS WIDTH IS REFUSED WITH THE QUESTION. `width: 600` names neither concept, so the
 *      refusal names both and asks which was meant. It used to answer "did you mean measure?",
 *      which sends an author who meant the column to the layer that cannot give it to them.
 *
 * WHAT WOULD MAKE THIS FILE PASS WITH THE FEATURE DELETED: nothing. Every assertion is about a
 * value the store did not hold before, or a sentence it did not say before. The pair to watch is
 * `stores 60/40 as 3 and 2` together with `remembers 60/40 after reducing it`: the first alone
 * would pass a build that threw the spelling away, and the second alone would pass one that stored
 * 60 and 40 unreduced.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { SHARE_MAX, canonicalRow, drawnAs, isShareProblem } from '../src/shared/beside.ts'
import { validateData } from '../src/shared/kinds.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

const words = (id: string): SummaryBlock[] => [
  { id, type: 'text', text: 'The mast moved 4mm under load, every time, across forty runs.' },
]
const picture = (id: string): SummaryBlock[] => [
  { id, type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/mast.png`, alt: 'the mast under load' },
]

/** One composition, written the way an agent writes one, with whatever proportions are under test. */
const row = (parts: unknown[], proportions?: string): Record<string, unknown> => ({
  id: 'b-beside',
  type: 'beside',
  ...(proportions === undefined ? {} : { proportions }),
  parts,
})

const twoParts = (a?: unknown, b?: unknown): unknown[] => [
  { id: 'p-words', ...(a === undefined ? {} : { share: a }), blocks: words('pw') },
  { id: 'p-shot', ...(b === undefined ? {} : { share: b }), blocks: picture('ps') },
]

let t: TestDb
let s: typeof import('../src/server/lib/summary.ts')

beforeAll(async () => {
  t = await freshDb()
  s = await import('../src/server/lib/summary.ts')
}, 60_000)

afterAll(() => t.close())

// ------------------------------------------------------- the three spellings, and what is stored

describe('the spellings a report may ask for proportions in', () => {
  /** What `canonicalise` made of one composition: the shares on the parts and the row's spelling. */
  const stored = (block: unknown): { shares: unknown[]; proportions: unknown } => {
    const data = s.canonicalise('report', { blocks: [block] }) as { blocks: Record<string, unknown>[] }
    const one = data.blocks[0] ?? {}
    return {
      shares: (one['parts'] as Record<string, unknown>[]).map((p) => p['share']),
      proportions: one['proportions'],
    }
  }

  it('stores whole numbers, percentages and a ratio on the row as the same two shares', () => {
    const cases: { what: string; block: unknown; askedAs: string }[] = [
      { what: 'whole numbers', block: row(twoParts(60, 40)), askedAs: '60/40' },
      { what: 'percentages', block: row(twoParts('60%', '40%')), askedAs: '60%/40%' },
      { what: 'a ratio with a colon', block: row(twoParts(), '3:2'), askedAs: '3:2' },
      { what: 'a ratio with a slash', block: row(twoParts(), '60/40'), askedAs: '60/40' },
    ]
    for (const one of cases) {
      const back = stored(one.block)
      expect(back.shares, `${one.what} stores 3 and 2`).toEqual([3, 2])
      expect(back.proportions, `${one.what} keeps what was asked`).toBe(one.askedAs)
    }
  })

  it('stores 50/50 as one and one, and remembers that it was asked as 50/50', () => {
    expect(stored(row(twoParts(), '50/50'))).toEqual({ shares: [1, 1], proportions: '50/50' })
    expect(stored(row(twoParts('50%', '50%')))).toEqual({ shares: [1, 1], proportions: '50%/50%' })
  })

  /**
   * THE HALF OF LOSSLESSNESS THE SHARES CANNOT CARRY. 60/40, 6/4 and 3:2 all reduce to 3 and 2, so
   * the stored shares alone cannot say which of the three was written. The row's own spelling is
   * what tells them apart, and it is why the answer for a write can quote the author.
   */
  it('tells three spellings of one ratio apart after reducing all three to 3 and 2', () => {
    const spellings = ['60/40', '6/4', '3:2']
    const back = spellings.map((one) => stored(row(twoParts(), one)))
    expect(back.map((one) => one.shares)).toEqual([[3, 2], [3, 2], [3, 2]])
    expect(back.map((one) => one.proportions)).toEqual(spellings)
  })

  it('leaves a composition nobody asked anything of completely alone', () => {
    const written = row(twoParts())
    const data = s.canonicalise('report', { blocks: [written] }) as { blocks: unknown[] }
    expect(data.blocks[0], 'an untouched row comes back as the very object that was sent').toBe(written)
  })

  /**
   * A STORED ROW SENT BACK THROUGH THE DOOR IS THE ORDINARY CASE, because that is what a PATCH of a
   * record that already holds a composition looks like: it carries both the spelling and the shares.
   */
  it('changes nothing when it is given what it already wrote', () => {
    const once = s.canonicalise('report', { blocks: [row(twoParts(60, 40))] })
    const twice = s.canonicalise('report', once)
    expect(twice).toEqual(once)
    expect(stored((once as { blocks: unknown[] }).blocks[0])).toEqual({ shares: [3, 2], proportions: '60/40' })
  })

  it('reduces three parts as readily as two', () => {
    const three = [
      { id: 'p-words', blocks: words('pw') },
      { id: 'p-table', blocks: words('pt') },
      { id: 'p-shot', blocks: picture('ps') },
    ]
    expect(stored(row(three, '6:4:4'))).toEqual({ shares: [3, 2, 2], proportions: '6:4:4' })
  })
})

// ------------------------------------------------------------- what is refused, and never rescaled

describe('a proportion Mole Office will not make up its mind about', () => {
  const refusal = (block: unknown): string => {
    try {
      s.canonicalise('report', { blocks: [block] })
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
    throw new Error('expected this composition to be refused, but it was accepted')
  }

  /**
   * THE ONE ASKED FOR BY NAME. A percentage is a share of the whole row, so a pair adding up to
   * 90 describes a row that does not exist. Stretching it to 100 would be Mole Office deciding what
   * somebody meant and then storing the decision as though they had written it.
   */
  it('refuses percentages that do not add up to 100, and says what to do instead', () => {
    const message = refusal(row(twoParts('60%', '30%')))
    expect(message).toContain('90')
    expect(message).toContain('add up to 100')
    expect(message, 'it offers the plain ratio, which needs no total').toContain('60:30')
    expect(message).not.toContain('rescaled for you')
  })

  it('refuses percentages mixed with plain numbers, because half of each is neither', () => {
    expect(refusal(row(twoParts('60%', 40)))).toContain('mixes percentages with plain numbers')
  })

  it('refuses a ratio that cannot be written as whole numbers in range', () => {
    const message = refusal(row(twoParts(), `${String(SHARE_MAX + 1)}:2`))
    expect(message).toContain(`shares of ${String(SHARE_MAX)} or less`)
    expect(message).toContain('"3:2"')
  })

  it('refuses a decimal, and sends the author to the whole numbers that say the same thing', () => {
    const message = refusal(row(twoParts(), '1.5:1'))
    expect(message).toContain('is not a proportion')
    expect(message).toContain('no decimals')
  })

  it('refuses a width dressed up as a proportion, in either place it can be written', () => {
    expect(refusal(row(twoParts(), '600px/400px'))).toContain('no "px"')
    const onAPart = refusal(row(twoParts('600px', '400px')))
    expect(onAPart).toContain('It is never a width')
    expect(onAPart, 'and it names the key that IS about the writing').toContain('measure')
  })

  it('refuses a row and its parts asking for two different things, and names both', () => {
    const message = refusal(row(twoParts(1, 1), '3:2'))
    expect(message).toContain('do not agree')
    expect(message).toContain('3:2')
    expect(message).toContain('Write the proportion once')
  })

  it('refuses proportions that name a different number of parts than the row has', () => {
    expect(refusal(row(twoParts(), '3:2:1'))).toContain('2 parts but proportions "3:2:1", which names 3')
  })

  it('refuses a ratio written with both separators, rather than reading one of them', () => {
    expect(refusal(row(twoParts(), '3:2/1'))).toContain('uses both')
  })

  /**
   * A REFUSAL IS NOT A WRITE. Nothing may be stored when a proportion is refused, which is the
   * difference between refusing an input and correcting it.
   */
  it('stores nothing at all when it refuses', () => {
    const written = { blocks: [row(twoParts('60%', '30%'))] }
    const before = JSON.stringify(written)
    expect(() => s.canonicalise('report', written)).toThrow()
    expect(JSON.stringify(written), 'the object it was handed is untouched').toBe(before)
  })
})

// ------------------------------------------------------- the key that means neither and both

describe('a width that does not say which width', () => {
  /** What the published schema refuses `data` for, which is the same check POST /api/records runs. */
  const problems = (block: unknown): string => {
    const answer = validateData('report', { for: 'the owner', date: '2026-08-29', blocks: [block] })
    return answer.ok ? '' : answer.errors.map((one) => one.message).join('\n')
  }

  /**
   * MEASURED BEFORE THIS CHANGE, at commit fd3cb00, over HTTP: POST /api/records with `width: 600`
   * on a part answered *unknown key "width" — did you mean "measure"?*. An agent that meant the
   * column follows that and narrows its text instead, leaving the column exactly as it was — which
   * is the silent no-op this product refuses to ship.
   */
  it('refuses width on a part by naming both concepts and asking which one was meant', () => {
    const message = problems(row([{ id: 'p1', width: 600, blocks: words('pw') }, { id: 'p2', blocks: picture('ps') }]))
    expect(message).toContain('unknown key "width"')
    expect(message, 'it names the share concept').toContain('next to its siblings')
    expect(message, 'it names the measure concept').toContain('the writing inside a prose region reads')
    expect(message, 'and it asks').toContain('WHICH DID YOU MEAN?')
    expect(message, 'it does not guess').not.toContain('did you mean "measure"?')
  })

  it('refuses width on a block that holds writing, and still names both', () => {
    const message = problems({ id: 'b1', type: 'text', width: 600, text: 'The mast moved 4mm.' })
    expect(message).toContain('unknown key "width"')
    expect(message).toContain('WHICH DID YOU MEAN?')
    expect(message, 'a block has no share, so it is told where a share is written').toContain(
      'written on the parts of a "beside" composition',
    )
  })

  it('refuses every one of the eight words that name a width without saying whose', () => {
    for (const key of ['width', 'maxWidth', 'minWidth', 'size', 'span', 'colspan', 'columns', 'px']) {
      const message = problems(row([{ id: 'p1', [key]: 600, blocks: words('pw') }, { id: 'p2', blocks: picture('ps') }]))
      expect(message, `${key} is refused`).toContain(`unknown key "${key}"`)
      expect(message, `${key} asks which concept`).toContain('WHICH DID YOU MEAN?')
    }
  })

  /**
   * `columns` IS IN THAT LIST AND IS ALSO A REAL KEY. A comparison block's own field is `columns`,
   * and an exact match is tried before the ambiguous table, so a comparison is never refused for
   * writing the key it is made of.
   */
  it('does not refuse columns on the block whose own field is columns', () => {
    expect(problems({ id: 'b1', type: 'columns', columns: [words('a'), picture('b')] })).toBe('')
  })

  /**
   * THE PROPORTION WORDS ARE NOT AMBIGUOUS AND ARE STILL REDIRECTED. A weight, a ratio, a flex
   * factor, a percentage and a grid fraction all say "beside its siblings" outright, so sending
   * them to `share` is not a guess.
   */
  it('still sends the proportion words to share rather than asking a question about them', () => {
    for (const key of ['weights', 'ratio', 'flex', 'percent', 'fr']) {
      const message = problems(row([{ id: 'p1', [key]: 3, blocks: words('pw') }, { id: 'p2', blocks: picture('ps') }]))
      expect(message, `${key} goes to share`).toContain('did you mean "share"?')
    }
  })
})

// --------------------------------------------------------------- what was asked against what is drawn

describe('what was asked and what is drawn, said as one pair', () => {
  it('reads a stored row back as the spelling that was written and the shares it became', () => {
    const asked = canonicalRow({ proportions: '60/40', shares: [undefined, undefined] }, 'the composition "b"')
    expect(asked).not.toBeNull()
    if (asked === null || isShareProblem(asked)) throw new Error('expected 60/40 to be readable')
    expect(asked.askedAs).toBe('60/40')
    expect(asked.shares).toEqual([3, 2])
  })

  /**
   * THE SENTENCE A READER MUST BE ABLE TO READ. A picture held at its floor takes more of the row
   * than 40 of it, and the pair of numbers is what shows that at a glance.
   */
  it('says what is drawn as proportions of the row, adding up to 100', () => {
    expect(drawnAs([{ id: 'a', px: 858 }, { id: 'b', px: 288 }])).toBe('75/25')
    expect(drawnAs([{ id: 'a', px: 600 }, { id: 'b', px: 400 }])).toBe('60/40')
    expect(drawnAs([{ id: 'a', px: 1 }, { id: 'b', px: 1 }, { id: 'c', px: 1 }]), 'no percent goes missing').toBe(
      '34/33/33',
    )
  })
})
