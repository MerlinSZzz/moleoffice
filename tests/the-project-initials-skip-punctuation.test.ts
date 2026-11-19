// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT'S SQUARE TAKES LETTERS AND DIGITS ONLY.
 *
 * The square's letters come from the first two words of a project's name; a name of one word gives its first two
 * letters. A character that is not a letter or a digit is skipped when a letter is picked, in every language the
 * office draws, so "Greenhouse (made-up)" gives GM and not G(. A name made only of punctuation gives nothing,
 * because no letter or digit is left to pick.
 */
import { describe, expect, it } from 'vitest'
import { projectInitials } from '../src/web/components/Sidebar.tsx'

describe('the project square skips punctuation and keeps letters and digits in every language', () => {
  it('takes the first letter of the first two words that hold a letter or a digit', () => {
    expect(projectInitials('Greenhouse (made-up)')).toBe('GM')
    expect(projectInitials('A & B')).toBe('AB')
    expect(projectInitials('Made-up office')).toBe('MO')
  })

  it('takes the first two letters or digits of a one-word name', () => {
    expect(projectInitials('Greenhouse')).toBe('GR')
    expect(projectInitials('42 lab')).toBe('4L')
    expect(projectInitials('...greenhouse!')).toBe('GR')
  })

  it('keeps the letters and digits of every language the office draws', () => {
    expect(projectInitials('Équipe (test)')).toBe('ÉT')
    expect(projectInitials('日本 語')).toBe('日語')
  })

  it('gives nothing for a name of punctuation alone, because no letter or digit is left to pick', () => {
    expect(projectInitials('— (…) !')).toBe('')
  })
})
