// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WAITING ROW WHOSE PROJECT NOBODY COULD NAME DRAWS THE SHORT MARK, AND DOES NOT QUOTE ANYTHING AS A NAME.
 *
 * Seen in the round-3 pictures of #/governance (plan 7FEOshq3mBGG, row G3): a visiting run read
 * `in "Project name unavailable"`, a placeholder drawn as if it were the project's name. Then in
 * wave 13k's round-13 pictures the row said "Project name unavailable" in normal mode, where the
 * plan's short mark belongs (problem Ab1IFMIvEYAf). The one reading is `whereItWaits` in
 * src/web/components/Governance.tsx, used by the queue's cards and by both kinds of row on the
 * Decisions page. In normal mode an unnamed project is the short mark, and the sentence is its
 * tooltip and what a screen reader reads.
 *
 * MUTATION PROOF: make the unnamed branch return t('decisions.unnamedProject') again, and the first
 * expectation fails.
 */
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'

it('names the project, draws the short mark when nobody could name it, and keeps the id for developer mode', async () => {
  const gov = await import('../src/web/components/Governance.tsx')
  const unnamed = { workspaceId: 'lake-books', workspaceTitle: null }
  const drawn = renderToStaticMarkup(createElement(Fragment, null, gov.whereItWaits(unnamed, false)))
  // What is drawn to see: the mark, with the screen reader's copy of the sentence taken out.
  const seen = drawn.replace(/<span class="px-sr">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '')
  expect(seen).toBe(en['absence.mark'])
  expect(drawn).toContain(`title="${en['decisions.unnamedProject']}"`)
  expect(gov.whereItWaits({ workspaceId: 'lake-books', workspaceTitle: 'Lake Books' }, false)).toBe('in “Lake Books”')
  expect(gov.whereItWaits(unnamed, true)).toBe('in “lake-books”')
})
