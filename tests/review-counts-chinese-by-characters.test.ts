// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR-WORD FLOOR COUNTS CHINESE BY CHARACTERS, NOT BY SPACES.
 *
 * tools/review.mjs decides a page "drew something" partly by counting the words its content area
 * holds (tools/the-content-floor.mjs, CONTENT_FLOOR.words). English marks the space between one
 * word and the next, so splitting on whitespace counts it correctly. Chinese marks no such space: a
 * whole sentence written only in Chinese characters is one unbroken run, so splitting on whitespace
 * counted it as a single "word" whatever it said — the not-found page's own Chinese sentence, eight
 * characters long, counted as one word against a floor of four, and the floor called a page that had
 * plainly drawn something empty.
 *
 * `wordsIn`, nested inside `contentCensusInPage` in tools/review.mjs, is read out of that file's own
 * text here, the way tests/review-goes-on-past-a-failed-picture.test.ts reads another helper out of
 * it. That is the one function the browser's own count and this test both run: there is no second
 * copy of the counting rule for a test to agree with by accident.
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { CONTENT_FLOOR } from '../tools/the-content-floor.mjs'

const source = readFileSync(new URL('../tools/review.mjs', import.meta.url), 'utf8')

function readWordsIn(): (text: string) => number {
  const helper = /const wordsIn = (\([^]*?\n  \})/.exec(source)?.[1]
  expect(helper, 'wordsIn is missing from tools/review.mjs').toBeDefined()
  return runInNewContext(`(${helper})`, {}) as (text: string) => number
}

it('counts a run of Chinese characters by characters, so a short Chinese sentence is not read as an empty page', () => {
  const wordsIn = readWordsIn()

  // A Chinese sentence of eight characters, the shape of the not-found page's own sentence, passes
  // the floor: two characters to a word gives four words, and the floor is four.
  expect(wordsIn('没有找到这个地址')).toBeGreaterThanOrEqual(CONTENT_FLOOR.words)

  // English still counts by spaces. Four words pass, three do not.
  expect(wordsIn('one two three four')).toBeGreaterThanOrEqual(CONTENT_FLOOR.words)
  expect(wordsIn('one two three')).toBeLessThan(CONTENT_FLOOR.words)

  // An empty page has no text at all, so it counts no words and fails the floor.
  expect(wordsIn('')).toBeLessThan(CONTENT_FLOOR.words)
})
