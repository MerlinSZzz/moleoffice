// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO WORLDS ARE COMPARED IN ONE PLACE, AND ITS TWO READERS AGREE (invariant 9; check EGmTt_KIlUrz).
 *
 * `factByFact` in src/config/world-header.mjs sets each fact of two worlds side by side. Two readers
 * ask it two questions:
 *   - `worldsDiffer` asks which words differ, for the browser's banner;
 *   - `whatTheFactsShow` in src/config/the-self-check.mjs asks what is shown, and never takes a fact
 *     either side could not say as equal or as different (invariant 5). tools/session-hook.mjs
 *     reads the self-check's answer.
 *
 * Every pair of values below is tried for each of the five facts, and the two readers must agree
 * everywhere but one place, by design: a fact both sides say they do not know, where the words are
 * the same and nothing is shown. Each value is `unknown`, empty, or a known value.
 *
 * MUTATIONS:
 *   - the self-check reads `same` before `unknownTo`, as round 6 first did: a fact unknown on both
 *     sides counts as shown equal, and the agreement case goes red;
 *   - `isAnUnknownFact` stops counting an empty fact as unknown: the self-check then calls an empty
 *     fact against a known one a difference, and the case goes red;
 *   - `worldsDiffer` takes the self-check's rule and drops unknowns: a word that changed from a
 *     value to `unknown` is no longer reported, and the words case goes red.
 */

import { describe, expect, it } from 'vitest'
import { whatTheFactsShow } from '../src/config/the-self-check.mjs'
import { WORLD_FIELDS, factByFact, worldsDiffer, type WorldOnTheWire } from '../src/config/world-header.mjs'

const VALUES = ['abc', 'def', 'unknown', ''] as const

const A_WORLD: WorldOnTheWire = { database: '0123456789abcdef', repository: '/a/checkout', port: '8787', head: 'abc1234', standing: 'scratch' }

/** Every pair of two worlds that differ in at most one fact, with that fact taking every pair of values. */
function everyPair(): { key: (typeof WORLD_FIELDS)[number]['key']; expected: WorldOnTheWire; answered: WorldOnTheWire }[] {
  const pairs = []
  for (const field of WORLD_FIELDS) {
    for (const here of VALUES) {
      for (const there of VALUES) {
        pairs.push({ key: field.key, expected: { ...A_WORLD, [field.key]: here }, answered: { ...A_WORLD, [field.key]: there } })
      }
    }
  }
  return pairs
}

const isUnknownValue = (value: string) => value === 'unknown' || value === ''

describe('two worlds are compared in one place', () => {
  it('worldsDiffer reports exactly the facts whose words differ', () => {
    for (const pair of everyPair()) {
      const words = worldsDiffer(pair.expected, pair.answered).map((one) => one.key)
      const expectedWords = pair.expected[pair.key] === pair.answered[pair.key] ? [] : [pair.key]
      expect(words, `${pair.key}: "${pair.expected[pair.key]}" against "${pair.answered[pair.key]}"`).toEqual(expectedWords)
    }
  })

  it('the self-check agrees with worldsDiffer everywhere but a fact both sides do not know', () => {
    for (const pair of everyPair()) {
      const here = pair.expected[pair.key]
      const there = pair.answered[pair.key]
      const label = `${pair.key}: "${here}" against "${there}"`
      const words = worldsDiffer(pair.expected, pair.answered).map((one) => one.key)
      const shown = whatTheFactsShow(pair.expected, pair.answered)
      const differences = shown.differences.map((one) => one.key as string)
      const unknowns = shown.unknowns.map((one) => one.key as string)
      // Only the three facts the declaration names are the self-check's.
      if (!['database', 'repository', 'port'].includes(pair.key)) {
        expect(differences.concat(unknowns), label).toEqual([])
        continue
      }
      // Every difference the self-check shows is a difference in the words.
      for (const key of differences) expect(words, label).toContain(key)
      // Every difference in the words is shown as a difference or as an unknown, never as the same.
      for (const key of words) expect(differences.concat(unknowns), label).toContain(key)
      // An unknown on either side is never shown as a difference, and is always named as an unknown.
      if (isUnknownValue(here) || isUnknownValue(there)) {
        expect(differences, label).toEqual([])
        expect(unknowns, label).toEqual([pair.key])
      }
      // The one place the two differ, on purpose: both sides do not know, and say so in the same words.
      if (isUnknownValue(here) && isUnknownValue(there) && here === there) {
        expect(words, label).toEqual([])
        expect(shown.unknowns[0]?.unknownTo, label).toBe('both')
      }
    }
  })

  it('names which side could not say a fact', () => {
    const facts = factByFact({ ...A_WORLD, database: 'unknown', port: '' }, { ...A_WORLD, repository: 'unknown', port: '' })
    expect(facts.map((one) => [one.key, one.unknownTo])).toEqual([
      ['database', 'expected'],
      ['repository', 'answered'],
      ['port', 'both'],
      ['head', null],
      ['standing', null],
    ])
  })
})
