// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HIGHEST CARD A VISITOR MAY HOLD, AND THE ONE SETTING THAT RAISES IT. Criterion P86.
 *
 * The rule: a visitor's default card is at most supervisor, never inspector or
 * secretary, and the person may change that in the settings. A visitor is an agent that came in through the Embassy
 * on a credential. The card a credential asks for, and the card a confirm gives, is refused above the
 * ceiling with a sentence naming the ceiling and naming the setting.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READER, TWO DOORS
 * ---------------------------------------------------------------------------------------
 *
 * The credential-ask door and the confirm door both ask this file, so the answer cannot be two
 * answers. `theVisitorCardCeiling` reads `MOLE_OFFICE_VISITOR_CARD_CEILING`; absent means supervisor.
 * `whyThisCardIsAboveTheVisitorCeiling` is the refusal both doors throw, with the closing sentence
 * each door's own state needs appended.
 *
 * AN EMPTY SETTING IS REFUSED BY `settingValue` ITSELF, because the declaration says an empty setting
 * is not a card and has no `emptyMeans`. A setting naming a word no card holds is refused here, by
 * name and with the roles that do exist, rather than silently falling back to the default — the
 * second invariant: an unreadable ceiling is a real problem and must not read as supervisor.
 */

import { settingValue, settingWasSet } from '../../config/settings.mjs'
import {
  cardFor,
  cardIsAboveTheCeiling,
  DEFAULT_VISITOR_CARD_CEILING,
  theRoleWordsSaid,
  theVisitorCeilingWasRaised,
  type RoleCard,
} from '@shared/roles.ts'

import { theRoleCards } from './roles.ts'

/** The one setting's name. Written once; the Settings panel and the refusals read it here. */
export const VISITOR_CARD_CEILING_SETTING = 'MOLE_OFFICE_VISITOR_CARD_CEILING'

export interface VisitorCardCeiling {
  setting: string
  /** The card name the setting holds, or the default word because nothing was set. */
  word: string
  /** Whether somebody set it, as opposed to it falling back to the default. */
  setBySomebody: boolean
  /** The card, or null because the setting names a word this declaration does not hold. */
  card: RoleCard | null
  /** A sentence when the setting is unusable, or null when it is. */
  problem: string | null
}

export function theVisitorCardCeiling(): VisitorCardCeiling {
  const raw = settingValue(VISITOR_CARD_CEILING_SETTING)
  const word = raw === null ? DEFAULT_VISITOR_CARD_CEILING : raw
  const card = cardFor(theRoleCards(), word)
  return {
    setting: VISITOR_CARD_CEILING_SETTING,
    word,
    setBySomebody: settingWasSet(VISITOR_CARD_CEILING_SETTING),
    card,
    problem:
      card === null
        ? `${VISITOR_CARD_CEILING_SETTING} is set to "${word}", and that is not a role card here. The roles are ` +
          `${theRoleWordsSaid(theRoleCards())}. Set it to one of those, or remove the line to use the default, ` +
          `${DEFAULT_VISITOR_CARD_CEILING}.`
        : null,
  }
}

/**
 * WHY THIS CARD MAY NOT BE GIVEN TO A VISITOR, or null because it may.
 *
 * `closing` is the sentence the door adds for its own state — what was not written or issued. The
 * refusal names the ceiling card and the setting that holds it, because a reader has to know both
 * which card is too high and what to change.
 */
export function whyThisCardIsAboveTheVisitorCeiling(asked: string, closing: string): string | null {
  const decl = theRoleCards()
  const ceiling = theVisitorCardCeiling()
  if (ceiling.problem !== null) return `${ceiling.problem} ${closing}`

  const card = cardFor(decl, asked)
  if (card === null) return null
  if (!cardIsAboveTheCeiling(decl, card, ceiling.card)) return null
  return (
    `The visitor card ceiling is the ${ceiling.card?.name ?? ceiling.word} card, and ` +
    `${VISITOR_CARD_CEILING_SETTING} sets it. "${asked}" is above that ceiling, so a visitor may not ` +
    `hold it. ${closing}`
  )
}

/**
 * WHETHER THIS CARD IS ABOVE THE DEFAULT CEILING — the inspector or the secretary, today.
 *
 * It is the question a row asks to know whether its card is one only the setting could allow. It does
 * not ask whether the setting is raised: a card above the default that a row holds means it was.
 */
export function aCardIsAboveTheDefaultVisitorCeiling(role: string | null): boolean {
  const decl = theRoleCards()
  return cardIsAboveTheCeiling(decl, cardFor(decl, role), cardFor(decl, DEFAULT_VISITOR_CARD_CEILING))
}

/**
 * THE SENTENCE SAYING THE SETTING RAISED THE CEILING, or null because it is still at the default.
 *
 * It is on the setting and not on one card, so every row that holds a card above the default reads
 * the same sentence. Null while the setting is at the default, or is unusable: a row cannot have a
 * raised ceiling by a setting that is not raised.
 */
export function theVisitorCeilingRaisedSays(): string | null {
  const ceil = theVisitorCardCeiling()
  if (ceil.problem !== null) return null
  return theVisitorCeilingWasRaised(theRoleCards(), ceil.word)
    ? `The visitor card ceiling was raised by ${VISITOR_CARD_CEILING_SETTING}.`
    : null
}
