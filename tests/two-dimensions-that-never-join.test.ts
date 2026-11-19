// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PRESENCE AND WORK STATE ARE TWO DIMENSIONS, AND NOTHING JOINS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The owner's brief, section 14: *"Presence and Work State are orthogonal."* `src/shared/lifecycle.ts`
 * declares the two vocabularies and deliberately holds no function joining them. That is a promise
 * a comment cannot keep, so it is checked here.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST is the one a builder will reach for first: make the work
 * state a function of presence, so that an agent nobody can reach reads `Finished`. It arrives in
 * one of two shapes and both are caught below — a FUNCTION that takes one word and hands back the
 * other, and a TABLE keyed by one vocabulary whose values are words of the other.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. All fifteen pairs of the two vocabularies occur, and the pair
 * a builder will want to call impossible — Offline · Working — is what a provider dying mid-work
 * looks like. A product that derived work state from presence would report every API death as a
 * finished job, silently, and `design/round-eleven/design/agent-lifecycle.md` section 2.5 measures
 * that this is not hypothetical: 193 uncommitted lines were lost that way on 25 August 2026,
 * problem `PO8ISFj3mDhM`.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE CHECK WORKS, AND WHAT IT CANNOT SEE
 * ---------------------------------------------------------------------------------------
 *
 * It walks the module's own exports rather than reading its text, so a join written through a
 * helper, a spread or a computed key is still caught. It cannot see a join built at run time from
 * a string, and it cannot see one written in a DIFFERENT file — the second is on purpose: the two
 * words meet in exactly one place in the product, and that place is a drawing that puts them side
 * by side rather than deriving either.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as lifecycle from '../src/shared/lifecycle.ts'
import {
  PRESENCE,
  PRESENCE_WORDS,
  STALE_AFTER_MINUTES,
  WORK_STATE,
  WORK_STATES,
  isPresence,
  isWorkState,
} from '../src/shared/lifecycle.ts'

const SOURCE = fileURLToPath(new URL('../src/shared/lifecycle.ts', import.meta.url))

const PRESENCE_SET = new Set<string>(PRESENCE_WORDS)
const WORK_SET = new Set<string>(WORK_STATES)

/** Which vocabulary a string belongs to, or null when it belongs to neither. */
function vocabularyOf(value: string): 'presence' | 'work' | null {
  if (PRESENCE_SET.has(value)) return 'presence'
  if (WORK_SET.has(value)) return 'work'
  return null
}

/** Every string leaf under a value, however deeply nested, with no order promised. */
function stringLeaves(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  return Object.values(value as Record<string, unknown>).flatMap((one) => stringLeaves(one, seen))
}

describe('the two vocabularies are two', () => {
  it('shares no word between them', () => {
    const shared = [...PRESENCE_WORDS].filter((one) => (WORK_STATES as readonly string[]).includes(one))
    expect(shared, 'a word in both lists is a word that means two things').toEqual([])
  })

  it('has four presence words and five work-state words, each with a sentence a person reads', () => {
    // The counts are written out rather than derived, so a fifth presence word or a sixth work state
    // has to be typed here on purpose by somebody who has decided what it means and what it does to
    // the watchdog. `inactive` joined presence on 11 September 2026, under grey and never as a
    // fourth colour.
    expect([...PRESENCE_WORDS]).toEqual(['online', 'stale', 'offline', 'inactive'])
    expect([...WORK_STATES]).toEqual(['working', 'reporting', 'standing-by', 'blocked', 'finished'])
    for (const word of PRESENCE_WORDS) {
      expect(PRESENCE[word].sentence.length, `${word} has no sentence`).toBeGreaterThan(20)
      expect(PRESENCE[word].word, `${word} has no word a person reads`).not.toBe('')
    }
    for (const word of WORK_STATES) {
      expect(WORK_STATE[word].sentence.length, `${word} has no sentence`).toBeGreaterThan(20)
      expect(WORK_STATE[word].word, `${word} has no word a person reads`).not.toBe('')
    }
  })

  it('keeps each reader to its own vocabulary', () => {
    for (const word of PRESENCE_WORDS) {
      expect(isPresence(word)).toBe(true)
      expect(isWorkState(word), `${word} is being read as a work state`).toBe(false)
    }
    for (const word of WORK_STATES) {
      expect(isWorkState(word)).toBe(true)
      expect(isPresence(word), `${word} is being read as presence`).toBe(false)
    }
  })
})

describe('no exported thing maps one dimension onto the other', () => {
  it('has no function that takes a word of one vocabulary and hands back a word of the other', () => {
    const offences: string[] = []
    for (const [name, value] of Object.entries(lifecycle)) {
      if (typeof value !== 'function') continue
      for (const word of [...PRESENCE_WORDS, ...WORK_STATES]) {
        const from = vocabularyOf(word)
        let answer: unknown
        try {
          answer = (value as (input: unknown) => unknown)(word)
        } catch {
          // A function that refuses this input has not mapped anything, which is the whole point.
          continue
        }
        for (const leaf of stringLeaves(answer)) {
          const to = vocabularyOf(leaf)
          if (to !== null && to !== from) offences.push(`${name}(${word}) answered ${leaf}`)
        }
      }
    }
    expect(
      offences,
      'a function in src/shared/lifecycle.ts turns one dimension into the other. Presence is a measurement and ' +
        'work state is a claim somebody made; deriving either from the other is what makes a dead runtime read ' +
        'as a finished job.',
    ).toEqual([])
  })

  it('has no table keyed by one vocabulary that holds words of the other', () => {
    const offences: string[] = []
    for (const [name, value] of Object.entries(lifecycle)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
      for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
        const from = vocabularyOf(key)
        if (from === null) continue
        for (const leaf of stringLeaves(held)) {
          const to = vocabularyOf(leaf)
          if (to !== null && to !== from) offences.push(`${name}.${key} holds ${leaf}`)
        }
      }
    }
    expect(
      offences,
      'a table in src/shared/lifecycle.ts is keyed by one dimension and holds the other. That is the same join ' +
        'as a function, written as data.',
    ).toEqual([])
  })
})

describe('the stale threshold is declared once', () => {
  it('is drawn into the sentences a person reads rather than typed into them', () => {
    expect(PRESENCE.online.sentence).toContain(String(STALE_AFTER_MINUTES))
    expect(PRESENCE.stale.sentence).toContain(String(STALE_AFTER_MINUTES))
    expect(lifecycle.STALE_THRESHOLD_IS_UNMEASURED).toContain(String(STALE_AFTER_MINUTES))
  })

  it('appears exactly once in the code, so changing it changes every place it is read', () => {
    // Comments are stripped first: the paragraphs above the constant argue about the number and
    // name it several times, which is prose doing its job rather than a second declaration.
    const code = readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*\/\/.*$/gm, ' ')
    const written = code.match(new RegExp(`\\b${STALE_AFTER_MINUTES}\\b`, 'g')) ?? []
    expect(
      written.length,
      'the number is written more than once in the code of src/shared/lifecycle.ts. One of them will be changed ' +
        'and the other will not, and the sentence on the screen will then disagree with the comparison.',
    ).toBe(1)
  })

  it('says, wherever it is drawn, that it is not yet measured', () => {
    expect(lifecycle.STALE_THRESHOLD_IS_UNMEASURED).toMatch(/not yet measured/i)
  })
})
