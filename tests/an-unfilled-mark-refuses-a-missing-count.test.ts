// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARK FOR UNFILLED FIELDS REFUSES A MISSING COUNT, AND DRAWS NOTHING AT ZERO. Problem vAGzVnazwE2p.
 *
 * `IncompleteMark` in src/web/components/ui.tsx drew "{n} to fill in" with whatever it was given, so
 * a row whose record lacked `incompleteCount` drew the words "undefined to fill in". All records
 * (src/web/pages/RecordsPage.tsx) passes the count straight through. The server always sends it, so
 * nobody meets this today; a test fixture with the wrong field name did. A missing count is a broken
 * assumption, so the mark now fails with a sentence, and zero is still the quiet case.
 *
 * MUTATION: remove the whole-number check in IncompleteMark; the first case goes red, because the
 * markup says "undefined to fill in" instead of failing.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { IncompleteMark } from '../src/web/components/ui.tsx'

it('fails with a sentence when the count is missing, rather than drawing "undefined"', () => {
  const draw = () => renderToStaticMarkup(h(IncompleteMark, { count: undefined as unknown as number }))
  expect(draw).toThrow(/needs a whole number/)
})

it('draws nothing at zero, and the count when there is one', () => {
  expect(renderToStaticMarkup(h(IncompleteMark, { count: 0 }))).toBe('')
  expect(renderToStaticMarkup(h(IncompleteMark, { count: 2 }))).toContain('2 details missing')
})
