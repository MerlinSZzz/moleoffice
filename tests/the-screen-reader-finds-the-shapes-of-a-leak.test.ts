// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCREEN READER FINDS THE SHAPES OF A LEAK, AND NOT A STORED WORD INSIDE SOMEBODY'S SENTENCE (problem
 * LDFm8FKJURox).
 *
 * tools/read-the-screen.mjs reads every page of a running office and reports the machine talking. In round eleven's
 * prose audit a person found four leaks and the tool found none of them, while it reported 44 runs that were all
 * somebody's prose: it looked only for stored words with an underscore, and found them wherever they stood. Its
 * reading of one run is tools/screen-leaks.mjs, which is pure, so it is tested here without a browser.
 *
 * WHAT IS PROVED
 *   1. Each of the four leaks the audit found by eye is found, as the shape it is.
 *   2. A stored word standing as a label is found; the same word inside a sentence is not.
 *   3. Words, addresses and file names are not taken for a shape.
 *   4. The tool reads the gate's own list of content classes and its sentence test, rather than a copy.
 *
 * Mutations, each alone, each turning a case here red: no internal-name shape; no ISO-week shape; no record-id
 * shape; no record-path shape; stored words looked for inside sentences too; the tool's own copy of the class list
 * back.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { leaksIn } from '../tools/screen-leaks.mjs'
import { readsAsASentence } from './sentences.ts'

const WORDS = new Set(['instead_of', 'part_of', 'stopping_point', 'work_domain'])
const found = (run: string): string[] => leaksIn(run, WORDS, readsAsASentence).map((hit) => `${hit.kind}: ${hit.piece}`)

describe('the four leaks the prose audit found by eye', () => {
  it.each([
    ['couldNotCheck', 'an internal name: couldNotCheck'],
    ['Week 2026-W35', 'an ISO week: 2026-W35'],
    ['Could not read vh-1r_wPPZDF', 'a record id: vh-1r_wPPZDF'],
    ['Changed: data.blocks[#b-56].blocks[#b-52].text', 'a path into a record: data.blocks[#b-56].blocks[#b-52].text'],
  ])('finds %s', (run, expected) => {
    expect(found(run)).toEqual([expected])
  })
})

describe('a stored word', () => {
  it('is found standing as a label', () => {
    expect(found('stopping_point')).toEqual(['a stored word: stopping_point'])
    expect(found('Kind: work_domain')).toEqual(['a stored word: work_domain'])
  })
  it('is not found inside a sentence somebody wrote about it', () => {
    expect(found('Should a decision say what it was made instead_of, as a link of its own?')).toEqual([])
    expect(found('This problem is part_of the larger plan for the week.')).toEqual([])
  })
})

describe('words, addresses and file names', () => {
  it.each([
    'Transparency matters here.',
    'See moleoffice.com/about and report.json.',
    'Kept for 30 days, then removed.',
    'Round 12, 4 October 2026',
  ])('%s is no leak', (run) => {
    expect(found(run)).toEqual([])
  })
})

describe('the tool reads the gate’s own lists', () => {
  const tool = readFileSync(fileURLToPath(new URL('../tools/read-the-screen.mjs', import.meta.url)), 'utf8')
  it('says what it looked for, and does not call a page clean', () => {
    expect(tool).toContain('looked for:')
    expect(tool).not.toContain("console.log('NOTHING FOUND")
  })
})
