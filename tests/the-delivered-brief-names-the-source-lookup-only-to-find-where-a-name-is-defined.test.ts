// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DELIVERED ROUND BRIEF IS THE ORIGINAL, A SEPARATOR, ONE PARAGRAPH AND THE RULES THE ROUND IS GIVEN.
 *
 * Between the original brief and those rules there is one paragraph. The original brief is read from the fixture's
 * file and the rules from roundChaptersGivenText, so neither is copied here.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { madeUpRound } from './round-chapters-fixture.ts'
import { prepareRoundChapters } from '../src/shared/round-chapters/delivery.ts'
import { roundChaptersGivenText } from '../src/shared/round-chapters/manifest.ts'

/** The delivered brief, cut into the original brief, what comes between and the rules. */
function theDeliveredBrief(): { text: string; original: string; rules: string; paragraph: string } {
  const f = madeUpRound()
  const { manifest, brief } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
  const text = readFileSync(brief, 'utf8')
  const original = readFileSync(f.brief, 'utf8')
  const rules = roundChaptersGivenText(manifest)
  const between = text.slice(original.length, text.length - rules.length)
  return { text, original, rules, paragraph: between.replace(/^\s*---\s*/, '').trim() }
}

describe('the delivered round brief', () => {
  it('is the original brief, a separator, one paragraph and the rules the round is given', () => {
    const { text, original, rules, paragraph } = theDeliveredBrief()
    expect(text.startsWith(original)).toBe(true)
    expect(text.endsWith(rules)).toBe(true)
    expect(text.slice(original.length, text.length - rules.length)).toMatch(/^\s*---\s*\S/)
    expect(paragraph).not.toBe('')
    expect(paragraph).not.toMatch(/\n/)
  })

})
