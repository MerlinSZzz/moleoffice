// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIAGRAM INSIDE A TEXT BLOCK DOES NOT MAKE THE SENTENCE GATE REFUSE AN HONEST REPORT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT, AND WHY IT IS NOT OBVIOUS
 * ---------------------------------------------------------------------------------------
 *
 * `proseFieldsOfBlocks` (src/shared/waitingclaims.ts:124) hands a text block's WHOLE `text` field
 * to the gate, fence and all — a stored `code` block's body is dropped, a fence inside prose is
 * not. `checkShortFormsAgainstBody` (src/server/lib/summary.ts:1240) then cuts that prose into
 * sentences and refuses a heading, a 30-word text or a 120-word text that repeats one of them.
 *
 * So a mermaid fence is already prose to that gate, today, before anything in this round was
 * built. `sentencesOfProse` ends a sentence at `.`, `?` or `!` followed by a space, and mermaid
 * syntax has almost none of those — so a whole diagram plus the writing around it becomes one very
 * long "sentence" that the gate is comparing part texts against. The critic's objection 4 asked
 * whether that refuses anything real. This file is that measurement turned into a standing check.
 *
 * MEASURED, 8 September 2026, on one real report: 12 prose fields, 5 of them holding a fence, the
 * longest 3,798 characters, 3 written parts. Nothing was refused. Since 2 October 2026 this file
 * reads an invented report instead, tests/fixtures/an-invented-report-for-the-sentence-gate.ts,
 * which keeps the four places that real report put a fence: between two sentences, at the start of
 * a block, left open to the end of its block, and a stray closing fence. Five prose fields, four of
 * them holding a fence, two written parts.
 *
 * ---------------------------------------------------------------------------------------
 * A TEST THAT THROWS BEFORE IT ASSERTS LOOKS EXACTLY LIKE A PASS
 * ---------------------------------------------------------------------------------------
 *
 * "Nothing was refused" is the weakest shape a test can have: it also holds when the gate was never
 * reached, when the parts were not loaded, and when the report has no parts at all. So this file
 * proves the gate is live IN THE SAME RUN, by handing it a part text that really is a cut and
 * watching it refuse, before it says anything about the report.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT DECIDED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Whether a fence should be dropped from `proseFieldsOfBlocks` the way a `code` block's body
 * already is. That is a change to a refusal rule, so it is the owner's decision and not a builder's. What
 * this file does is make the day it starts refusing something a red test rather than a surprise.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import { proseFieldsOfBlocks, proseOfBlocks } from '../src/shared/waitingclaims.ts'
import * as report from './fixtures/an-invented-report-for-the-sentence-gate.ts'

type Summary = typeof import('../src/server/lib/summary.ts')

let db: TestDb
let summary: Summary

/** The invented report. Its label is what the gate reads; its parts are counted below. */
const blocks = (): SummaryBlock[] => report.blocks
const shortForms = (): unknown => report.shortForms

beforeAll(async () => {
  // The gate lives beside the write path, and that module opens a database when it is imported.
  db = await freshDb()
  summary = await import('../src/server/lib/summary.ts')
})

afterAll(() => {
  db.close()
})

/** What the gate said, or the empty string when it said nothing. */
function whatTheGateSaid(stored: unknown, body: readonly SummaryBlock[]): string {
  try {
    summary.checkShortFormsAgainstBody(stored, body)
    return ''
  } catch (refusal) {
    return refusal instanceof Error ? refusal.message : String(refusal)
  }
}

describe('the sentence gate, on a report with diagrams in its prose', () => {
  it('is reading a report that still holds the diagrams and the parts this is about', () => {
    const prose = proseFieldsOfBlocks(blocks())
    expect(prose.length, 'five prose fields').toBe(5)
    expect(prose.filter((one) => one.text.includes('```')).length, 'four of them hold a fence').toBe(4)
    // The four places a fence sits, each in a block of its own.
    const textOf = (id: string): string => prose.find((one) => one.blockId === id)?.text ?? ''
    expect(textOf('t2'), 'a diagram between two sentences').toMatch(/[.|]\n+```mermaid[\s\S]*```\n+A stopped/)
    expect(textOf('t3').startsWith('```mermaid'), 'a block that opens with a fence').toBe(true)
    expect(textOf('t4').match(/```/g)?.length, 'a fence never closed').toBe(1)
    expect(textOf('t5').endsWith('```'), 'a stray closing fence').toBe(true)
    const parts = (shortForms() as { parts?: { parts?: unknown[] } }).parts?.parts ?? []
    expect(parts.length, 'the two parts written for it').toBe(2)
  })

  it('is a live gate in this run, proved by a label that really is a cut', () => {
    // THE OPENING OF THE REPORT ITSELF, word for word, offered as its label. That is exactly what the
    // gate exists to refuse, and it is built from the same prose the gate reads rather than from a
    // guess at where the report starts.
    const cut = proseOfBlocks(blocks()).split(/\s+/).slice(0, 9).join(' ')
    expect(cut.length, 'an opening to cut from could not be found in the report').toBeGreaterThan(20)
    const label = { ...(shortForms() as { label: Record<string, unknown> }).label, text: cut }
    const said = whatTheGateSaid({ label }, blocks())
    expect(said, 'the gate let a straight cut through, so it is not doing anything in this run').not.toBe('')
    expect(said).toContain('cutting rather than written')
  })

  it('refuses nothing that was written', () => {
    expect(whatTheGateSaid(shortForms(), blocks()), 'a written label is refused by the sentence gate').toBe('')
  })

  it('refuses nothing when the diagrams are gone either, so the fences are not what is carrying it', () => {
    // The same parts against the same report with every fence taken out. If the report passed only
    // because a diagram happened to sit between two sentences, the two answers would differ.
    const withoutFences = blocks().map((block) =>
      block.type === 'text' ? { ...block, text: block.text.replace(/```[\s\S]*?```/g, '') } : block,
    )
    expect(whatTheGateSaid(shortForms(), withoutFences)).toBe('')
  })
})
