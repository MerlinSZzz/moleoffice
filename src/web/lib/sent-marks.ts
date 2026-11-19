// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A COMMENT'S MARK DOES ONCE THE COMMENT IS SENT (wave 13y round 146, item 73a).
 *
 * There is one Settings choice for it, whether the comment went on its own or in a review: keep showing the
 * mark on the page, or hide it completely. Hiding is the default, after a reader's
 * feedback: a sent comment's mark is not shown unless the person turns it on. It is this browser's, like
 * every other choice on the Review marks panel.
 *
 * HIDDEN MEANS NOTHING OF IT IS DRAWN. A sent comment then adds nothing to a circle and lights no words, and a circle
 * that held only sent comments is not drawn. The comment itself is untouched: the review and the list of comments
 * still hold it.
 *
 * READ AT IMPORT, as `store.ts` says a remembered setting is, so the first drawing of a page already obeys it.
 */
import { useSyncExternalStore } from 'react'
import { makeBroadcast, readChoice, writeChoice, type StoreFault } from './store.ts'

export const SENT_MARKS = ['show', 'hide'] as const
export type SentMarks = (typeof SENT_MARKS)[number]

const KEY = 'mole-office.review.sentMarks'

/** The choice, and the sentence when this browser would not keep it, or null because it did. One object per change. */
interface SentMarksNow {
  choice: SentMarks
  fault: string | null
}

const firstRead: StoreFault[] = []
let now: SentMarksNow = { choice: readChoice(KEY, SENT_MARKS, 'hide', firstRead), fault: firstRead[0]?.message ?? null }
const broadcast = makeBroadcast()

/** Store a new choice, and redraw every mark layer and control that reads it. */
export function chooseSentMarks(choice: SentMarks): void {
  const written: StoreFault[] = []
  writeChoice(KEY, choice, written)
  now = { choice, fault: written[0]?.message ?? null }
  broadcast.announce()
}

/** The choice as it is now, redrawing the component when it changes. */
export function useSentMarks(): SentMarksNow {
  return useSyncExternalStore(broadcast.subscribe, () => now, () => now)
}
