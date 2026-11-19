// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS PAGE IS ABOUT, AND STARTING ITS REVIEW: one place, read by the review column and by the comment box.
 *
 * Moved out of ReviewBar.tsx in wave 13r round 15, because the comment box's Start review starts the same review the
 * column's press starts, and two copies of "what this page is about" would come to disagree.
 */
import { api } from '../../api.ts'
import { namesNoPlace, TARGET_ATTRIBUTE, targetFromAttributeValue, type Target } from '@shared/targets.ts'
import { thePage } from './pointing.ts'

/**
 * THE ONE ITEM THAT CONTAINS EVERY OTHER, or null when no single item does.
 *
 * Exported so a test can decide this without a browser. `contains` is the caller's, because in the
 * browser it is `Node.contains` and in a test it is whatever stands in for a tree.
 */
export function theOneInside<T>(items: readonly T[], contains: (outer: T, inner: T) => boolean): T | null {
  const outermost = items.filter((item) => !items.some((other) => contains(other, item)))
  return outermost.length === 1 ? (outermost[0] ?? null) : null
}

/**
 * WHAT THIS PAGE IS ABOUT, which is what a review started here collects.
 *
 * Phase 4 says scope is DERIVED from where somebody was standing and is never chosen from a menu.
 * The pane used to hand Mole Office the page's address every time, and a page derives the widest scope
 * there is — the whole project — so a review started while reading one report collected every
 * comment written anywhere in the project. Five of the six scopes had no path through the
 * interface at all.
 *
 * THE RULE IS THE DOCUMENT'S OWN TREE, not a list anybody maintains: the thing this page is about
 * is the one addressable element that contains all the others. A page about several things — Home,
 * the records list — has no such element, and then the page is the honest answer and the project is
 * the scope. Which of the two happened is on screen either way, under *What this review collects*.
 *
 * THE TREE IT WALKS IS THE PAGE'S OWN, AND THAT IS THE WHOLE OF `#main`. It used to be the whole
 * document, which stopped being right the moment the frame began to declare itself: step 16 gave
 * every row of the rail a name, so a record page held seventeen outermost addressable elements
 * instead of one, no single element contained the others, and a review started while reading one
 * report silently widened to the whole project. The rail is not what a page is about. If `#main`
 * is not there — the shell has not rendered — nothing is claimed, and the page is the answer.
 */
export function whatThisPageIsAbout(): Target {
  if (typeof document === 'undefined') return thePage()
  const content = document.getElementById('main')
  if (content === null) return thePage()
  const marked = [...content.querySelectorAll<HTMLElement>(`[${TARGET_ATTRIBUTE}]`)]
  const outer = theOneInside(marked, (a, b) => a !== b && a.contains(b))
  if (outer === null) return thePage()
  const read = targetFromAttributeValue(outer.getAttribute(TARGET_ATTRIBUTE) ?? '')
  return 'problem' in read ? thePage() : read.target
}

/**
 * START THIS PAGE'S REVIEW, or come back to the one already collecting here. The server says which in `started`.
 *
 * HOW WIDE IT IS IS SAID RATHER THAN ARRIVED AT: a page whose outermost thing names no place in the project asks for
 * the whole project by name (see the note on the column's start in ReviewBar.tsx). Comments kept on this page before
 * it, unsent and in no review, join it in the same write (src/server/lib/reviews.ts, `startReview`).
 */
export function startThisPagesReview(): ReturnType<typeof api.startCollecting> {
  const about = whatThisPageIsAbout()
  return api.startCollecting({ target: about }, namesNoPlace(about.kind) ? { reach: 'global' } : {})
}
