// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * PUTTING ONE CHOSEN SETTING BACK TO NOBODY HAVING CHOSEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A CONTROL AND NOT A TIDY-UP
 * ---------------------------------------------------------------------------------------
 *
 * Six of a person's settings keep *nobody has chosen* apart from *chose the usual thing*, and the
 * two are different stored facts everywhere in this product: the row holds NULL rather than the
 * default word, and every reader says so. Sending an empty string is what puts a row back, and the
 * door has accepted that since each setting was built.
 *
 * Only one of the six had a way to do it on a screen — the status line, because emptying its box
 * sends an empty string. For the other five a person could choose but never unchoose, so the state
 * the product is careful to keep was one a person could leave and not return to. The settings
 * survey of 6 September 2026 counted it. The decision is to build it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A THIRD BUTTON IN THE GROUP
 * ---------------------------------------------------------------------------------------
 *
 * Drawing *not chosen* beside *merged* and *two* would put it among the answers, and it is not one:
 * it is the absence of an answer. It would also stand there on a panel where nothing has been
 * chosen, offering to undo something that never happened. So it is a separate press, and it appears
 * only when there is a choice to put back.
 */
import type React from 'react'

/** Every word this control draws, in one place, so a screen and a test read the same words. */
export const NOT_CHOSEN_WORDS = {
  /** What the press says. */
  get press() { return t('pageWords.BackToNotChosen.001') },
  /**
   * What it does, for somebody who wants to know before pressing it.
   *
   * It names the usual answer twice on purpose: what Mole Office will read the row as, and the fact
   * that reading it that way is not the same as having chosen it.
   */
  what: (setting: string, usual: string): string =>
    `Puts ${setting} back to not chosen. Mole Office reads it as ${usual} again, which is not ` +
    `the same thing as choosing ${usual}.`,
} as const

export function BackToNotChosen({
  chosen,
  setting,
  usual,
  onPut,
  label = NOT_CHOSEN_WORDS.press,
  explanation,
}: {
  /** Whether there is a choice to put back. Nothing is drawn when there is not. */
  chosen: boolean
  /** What this setting is, in the words the panel above calls it, for the sentence. */
  setting: string
  /** The answer a person who has never chosen is read as, in the words the panel draws it. */
  usual: string
  onPut: () => void
  /** A panel may name its own return when it is not another stored answer. */
  label?: string
  explanation?: string
}): React.ReactElement | null {
  if (!chosen) return null
  return (
    <>
      <style href="mole-office-back-to-not-chosen" precedence="default">
        {BACK_CSS}
      </style>
      <button
        type="button"
        className="btnc"
        title={explanation ?? NOT_CHOSEN_WORDS.what(setting, usual)}
        onClick={onPut}
      >
        {label}
      </button>
    </>
  )
}

const BACK_CSS = `
/* QUIETER THAN THE CHOICES IT UNDOES. It is the least likely thing on the panel to be pressed and
   the only one that takes something away, so it takes secondary ink and no border weight. */
.btnc {
  align-self: flex-start;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: none;
  padding: 2px var(--pad);
  color: var(--text-2);
  font: inherit;
  font-size: var(--fs-1);
  cursor: pointer;
}
.btnc:hover { background: var(--hover); color: var(--text); }
`
