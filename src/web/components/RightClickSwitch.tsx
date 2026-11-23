// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SWITCH THAT CHOOSES WHAT A RIGHT-CLICK INSIDE A VIEW DOES: the view's own, or Mole Office's.
 *
 * A terminal draws it. The terminal's own right-click is the browser's menu over the terminal's hidden box,
 * with the terminal's copy and paste in it. Mole Office's right-click opens the box about the words
 * selected in the view, or with none selected, about the words under the pointer. The page can read
 * neither, so the view hands them over.
 *
 * IT KNOWS NOTHING OF TERMINALS. The view gives it four things: the element the right-click is chosen in,
 * a way to read the words selected there, a way to read the words drawn under a point, and the words for
 * the view's own state. open.ts reads the choice through `chooseTheRightClickIn`, and nothing else decides it.
 *
 * IT STARTS IN THE VIEW'S OWN STATE, AND NOTHING IS STORED. The choice lasts while this view is drawn. A
 * view drawn again starts in its own state again.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { chooseTheRightClickIn, type RightClickIn } from './agent/open.ts'

export interface RightClickSwitchProps {
  /** The element whose right-click the switch chooses. */
  region: React.RefObject<HTMLElement | null>
  /** The words selected in the view now, which the page's selection does not hold. */
  selected: () => string
  /** The words the view draws under a point of the page, by the point's clientX and clientY, which the page cannot read. */
  wordsAt: (x: number, y: number) => string
  /** What the switch shows in the view's own state, such as a terminal's copy and paste. */
  ownWords: string
}

export function RightClickSwitch({ region, selected, wordsAt, ownWords }: RightClickSwitchProps): React.ReactElement {
  useLanguage()
  const [whose, setWhose] = useState<RightClickIn>('its-own')
  const reads = useRef({ selected, wordsAt })
  useLayoutEffect(() => {
    reads.current = { selected, wordsAt }
  })
  // A LAYOUT EFFECT, so a right-click straight after a press already meets the new state. THE REGION GOES AS THE REF,
  // because on the first draw the view may not have attached it yet; open.ts reads it at each right-click.
  useLayoutEffect(
    () =>
      chooseTheRightClickIn(region, {
        whose,
        selected: () => reads.current.selected(),
        wordsAt: (x, y) => reads.current.wordsAt(x, y),
      }),
    [region, whose],
  )

  const office = whose === 'mole-office'
  const box = t('talk.panelName')
  return (
    <>
      <style href="mole-office-right-click-switch" precedence="default">
        {RIGHT_CLICK_SWITCH_CSS}
      </style>
      <button
        type="button"
        role="switch"
        aria-checked={office}
        aria-label={t('rightClick.switch.name', { box })}
        className="rcs-switch"
        onClick={() => setWhose(office ? 'its-own' : 'mole-office')}
      >
        <span className="rcs-knob" aria-hidden="true" />
        <span className="rcs-word">{office ? t('rightClick.switch.office', { box }) : ownWords}</span>
      </button>
    </>
  )
}

/** The switch's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const RIGHT_CLICK_SWITCH_CSS = `
.rcs-switch {
  display: inline-flex; align-items: center; gap: 0.4rem; min-height: 30px; padding: 2px 8px 2px 4px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer;
}
.rcs-switch:hover { background: var(--hover); }
.rcs-switch:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.rcs-knob {
  position: relative; flex: none; width: 30px; height: 18px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-pill);
  background: var(--panel-3); transition: background-color .15s ease, border-color .15s ease;
}
.rcs-knob::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px;
  border-radius: 50%; background: var(--text-3); transition: left .15s ease;
}
.rcs-switch[aria-checked='true'] .rcs-knob { background: var(--accent); border-color: var(--accent); }
.rcs-switch[aria-checked='true'] .rcs-knob::after { left: 14px; background: var(--panel); }
.rcs-word { font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  .rcs-knob, .rcs-knob::after { transition: none; }
}
`
