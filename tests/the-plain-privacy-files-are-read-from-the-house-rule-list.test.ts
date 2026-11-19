// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAIN PRIVACY FILES ARE READ FROM THE HOUSE-RULE LIST, IN ONE PLACE.
 *
 * src/shared/the-plain-privacy-files.ts names the files each publishing path runs: the rows of tests/house-rules.mjs
 * with class P and no mark. It reads the list's text with the parser the merge tool classes with.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   1. On the real list, the files are exactly the rows the list's own module declares with class P and no mark,
 *      in path order, and each is a file. A marked P row is not among them.
 *   2. On a made-up list, a plain P row is named and a marked P row, an H row and an S row are not.
 *   3. No list (null) is refused, naming tests/house-rules.mjs.
 *   4. A list with no plain P row is refused, so running nothing never looks like passing.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   · drop `rule.mark === undefined` from the filter → cases 1, 2 and 4 go red (case 4's marked row is then named).
 *   · answer [] for null instead of refusing → case 3 goes red.
 *   · answer the empty list instead of refusing it → case 4 goes red.
 *
 * The module was restored byte for byte after each mutation.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { thePlainPrivacyFiles } from '../src/shared/the-plain-privacy-files.ts'
import { HOUSE_RULES } from './house-rules.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

const A_LIST = (rows: string[]) => ["export const CLASSES = ['H', 'P', 'S', 'Q', 'F']", 'export const HOUSE_RULES = {', ...rows, '}', ''].join('\n')

describe('the plain privacy files are read from the house-rule list', () => {
  it('1: on the real list, they are the rows with class P and no mark, in path order, and each is a file', () => {
    const declared = Object.entries(HOUSE_RULES as Record<string, { class: string; mark?: string }>)
    const plain = declared.filter(([, rule]) => rule.class === 'P' && rule.mark === undefined).map(([path]) => path).sort()
    const marked = declared.filter(([, rule]) => rule.class === 'P' && rule.mark !== undefined).map(([path]) => path)
    const files = thePlainPrivacyFiles(readFileSync(join(REPO, 'tests', 'house-rules.mjs'), 'utf8'))
    expect(files).toEqual(plain)
    expect(marked.length, 'the real list holds a marked P row, so case 1 can see one left out').toBeGreaterThan(0)
    expect(files.filter((file) => marked.includes(file))).toEqual([])
    expect(files.filter((file) => !existsSync(join(REPO, file)))).toEqual([])
  })

  it('2: on a made-up list, a plain P row is named, and a marked P row, an H row and an S row are not', () => {
    const text = A_LIST([
      "  'tests/b-plain.test.ts': { class: 'P', kind: 'owner-content' },",
      "  'tests/a-plain.test.ts': { class: 'P', kind: 'naming' },",
      "  'tests/c-marked.test.ts': { class: 'P', kind: 'privacy-marker', mark: 'borderline' },",
      "  'tests/d-house.test.ts': { class: 'H', kind: 'wording' },",
      "  'tests/e-safe.test.ts': { class: 'S', kind: 'other' },",
    ])
    expect(thePlainPrivacyFiles(text)).toEqual(['tests/a-plain.test.ts', 'tests/b-plain.test.ts'])
  })

  it('3: no list is refused, naming tests/house-rules.mjs', () => {
    expect(() => thePlainPrivacyFiles(null)).toThrow(/tests\/house-rules\.mjs is not there/)
  })

  it('4: a list with no plain P row is refused, so running nothing never looks like passing', () => {
    const text = A_LIST([
      "  'tests/c-marked.test.ts': { class: 'P', kind: 'privacy-marker', mark: 'mixed' },",
      "  'tests/d-house.test.ts': { class: 'H', kind: 'wording' },",
    ])
    expect(() => thePlainPrivacyFiles(text)).toThrow(/names no plain privacy file/)
  })
})
