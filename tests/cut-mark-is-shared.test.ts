// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUT_MARK } from '../src/shared/shortening.ts'
import {
  spanShownAsCut,
  wordsInNamedSpan,
  wordsNamedBy,
  type Context,
  type Span,
} from '../src/shared/targets.ts'

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * THE MARK'S SHAPE: a space and an ellipsis straight after a word or after a `${…}`, which is how a
 * shortened text is ended. A string that is the mark alone counts too, because it is added to words
 * by a `+` or by JSX. An ellipsis after a comma, a colon or an opening bracket is a list or a
 * placeholder ("a, b, …", `{"name": …}`), not the mark.
 */
const MARK_AFTER_WORDS = new RegExp(`(?:\\}|[^\\s,:;([{"'\`=|.])${CUT_MARK.replace(' ', '[ \\u00a0]')}`)

function carriesTheMark(text: string): boolean {
  return text === CUT_MARK || MARK_AFTER_WORDS.test(text)
}

describe('the mark on a shortened quote', () => {
  it('adds the shared mark and strips only that ending', () => {
    const span: Span = { quote: 'The opening words', from: 7, to: 24, field: 'body' }
    const shown = spanShownAsCut(span)
    expect(shown.quote).toBe(`The opening words${CUT_MARK}`)
    expect(wordsInNamedSpan(shown)).toBe(span.quote)
    expect(wordsInNamedSpan({ ...shown, quote: span.quote })).toBe(span.quote)

    const context = {
      target: { kind: 'page' },
      place: { at: 'quote', words: 'A quote from the screen', cut: true },
    } as unknown as Context
    expect(wordsNamedBy(context)).toBe(`A quote from the screen${CUT_MARK}`)
  })

  it('knows the mark in each shape it can be written in', () => {
    expect(carriesTheMark(CUT_MARK)).toBe(true)
    expect(carriesTheMark('${short.words} …')).toBe(true)
    expect(carriesTheMark('“${quote} …”')).toBe(true)
    expect(carriesTheMark('The opening words …')).toBe(true)
    expect(carriesTheMark('<span>{words} …</span>')).toBe(true)
    expect(carriesTheMark('(a, b, …)')).toBe(false)
    expect(carriesTheMark('{"name"?: …}')).toBe(false)
    expect(carriesTheMark('The opening words')).toBe(false)
  })
})
