// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { t } from '@shared/i18n.ts'
/**
 * HOW THE WAITING-ON-YOU PAGE DRAWS EACH THING: as a card, or as a row in a list.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, AND WHY IT LOOKED LIKE A SETTING HAD CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * The Waiting-on-you page turned into a list with no reason shown. It looked as though a setting had
 * once controlled this, and a setting for it could go in Settings.
 *
 * Nothing had changed. The page drew a CARD for a fork and a ROW for everything else, so which of
 * the two the owner saw depended on what happened to be waiting. The owner settled the sorted forks; what was
 * left was rows. That is a page deciding its own shape from its contents, which is exactly what a
 * reader reads as a setting having moved.
 *
 * Criterion P54: the choice is the person's, it is made once in Settings, and this browser remembers it.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THIS BROWSER'S, LIKE THE TWO ORDERS BESIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * The same store, the same failure behaviour and the same fault sentence as `lib/queueorder.ts`,
 * for the same reason: how a page is drawn is a fact about the machine somebody is reading on, not
 * about the project or the person. A browser that will not remember it says so where the control
 * is, and the choice still applies for as long as the page is open.
 */

import { readChoice, writeChoice, type StoreFault } from './store.ts'

/** The two ways the page draws what is waiting. The first is what it does when nobody has chosen. */
export const QUEUE_VIEWS = ['cards', 'list'] as const

/** One of the two. */
export type QueueView = (typeof QUEUE_VIEWS)[number]

/**
 * WHAT IT DOES WHEN NOBODY HAS CHOSEN: cards.
 *
 * It is the richer of the two and it is the one that can be acted on without opening anything — a
 * fork's card carries the form that settles it. A person who has never opened Settings should meet
 * the page that lets them answer, not the page that only lists.
 */
export const QUEUE_VIEW_BY_DEFAULT: QueueView = 'cards'

/** Where the choice is kept in this browser. */
export const QUEUE_VIEW_KEY = 'mole-office.governance.view'

/**
 * WHAT EACH ANSWER IS CALLED. Two names, and neither is a sentence.
 *
 * "Cards" and "A list" are the two shapes on the screen, in the words somebody would use pointing
 * at them. Not "card view" and "list view": a view is a word about the mechanism.
 */
export const QUEUE_VIEW_WORDS: Readonly<Record<QueueView, string>> = {
  get cards() { return t(settingsControlWord('settings.queueview', 'decisions.cards')) },
  get list() { return t(settingsControlWord('settings.queueview', 'decisions.list')) },
}

/** How this browser last asked for the page to be drawn, and anything that went wrong reading it. */
export function rememberedQueueView(): { view: QueueView; fault: string | null } {
  const faults: StoreFault[] = []
  const view = readChoice(QUEUE_VIEW_KEY, QUEUE_VIEWS, QUEUE_VIEW_BY_DEFAULT, faults)
  return { view, fault: faults[0]?.message ?? null }
}

/**
 * Remember it for next time, and say when the browser would not.
 *
 * Null when it was written. When it was refused, the sentence is `store.ts`'s own, because it is
 * the same fact a refused read reports and a second wording here would be that fact written twice.
 */
export function rememberQueueView(view: QueueView): string | null {
  const faults: StoreFault[] = []
  writeChoice(QUEUE_VIEW_KEY, view, faults)
  return faults[0]?.message ?? null
}
