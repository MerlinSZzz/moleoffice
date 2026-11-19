// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOXES, SO A READER CAN SEE WHAT A PRESS WOULD MEAN BEFORE THEY MAKE IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUESTION IT EXISTS TO ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * A right-click asks what Mole Office understands the person to mean there. A
 * report is now made of parts a person can point at, one per paragraph, bullet, heading, table and
 * fenced block. Which of them a press lands on is decided by which box the pointer is inside, and
 * until this control there was no way to see the boxes.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ONE DRAWING WITH POINT MODE, AND NOT A SECOND ONE
 * ---------------------------------------------------------------------------------------
 *
 * Point mode already outlines the thing under the pointer, solid, with everything holding it
 * dashed — `agent-css.ts`, under the comment beginning "WHAT CAN BE TALKED ABOUT". This draws the
 * SAME two channels by the SAME rule. The two differences are what the mode does, not what it
 * looks like:
 *
 *   · POINT MODE TAKES THE NEXT PRESS. This takes none. A reader can turn the boxes on and go on
 *     reading, selecting and following links.
 *   · THIS IS ONLY ON THE WRITING. Point mode marks everything on the page; this marks the report
 *     body, because the question it answers is about a report.
 *
 * The two channels are line style and never colour, so they survive greyscale, a forced-colours
 * setting and a photograph. That rule is the contract's, §6.6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT DEVELOPER MODE ADDS, AND WHY IT IS NOT DRAWN IN NORMAL MODE
 * ---------------------------------------------------------------------------------------
 *
 * A developer gets the address beside the box, exactly as the element carries it and exactly as a
 * comment would store it: `region/LKJQbOhAK3kz/data.blocks%5B%23b-5%5D.text@412`. It is
 * percent-encoded because a region id holds brackets and a hash; decoding it for the label would be
 * a second spelling of the same string, and this drawing is for somebody who wants the string.
 *
 * A reader in Normal mode gets the box and no address, which is the whole of what they asked: they
 * can see where the boundary is without being shown a path into a database. `docs/UX-CONTRACT.md`
 * puts machinery in Developer mode and that is the rule being followed.
 */

import { useEffect, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { useInspect } from '../lib/mode.ts'

/**
 * THE ATTRIBUTE THE WHOLE DRAWING HANGS OFF, on the root element.
 *
 * It is on `<html>` rather than in React state passed down, because the elements being outlined are
 * drawn by `SummaryBlocks` and by every component it draws, and threading a boolean through all of
 * them to reach a stylesheet would be a prop nobody uses.
 *
 * Three values and not two: absent, `boxes`, and `named`. The third is the developer's, and having
 * it as a value of this one attribute rather than a second attribute means the two can never be set
 * to disagree.
 */
const REGIONS_ATTRIBUTE = 'data-regions'

export const REGIONS_CSS = `
/* THE TWO CHANNELS, BY THE SAME RULE AS POINT MODE. Solid is the part a press would land on; dashed
   is everything holding it. The pointer is inside every box it is inside, so the innermost one is
   picked out by saying it holds no hovered box of its own. */
html[data-regions] .sb [data-target]:hover:not(:has([data-target]:hover)) {
  outline: 2px solid var(--text-2);
  outline-offset: 1px;
}
html[data-regions] .sb [data-target]:has([data-target]:hover) {
  outline: 1px dashed var(--text-3);
  outline-offset: 1px;
}
/* THE NAME, IN DEVELOPER MODE ONLY. A region id is a stored path and the contract keeps machinery
   out of Normal mode. It is drawn at the top left of the box it names, over everything, and it
   takes no presses -- a reader who turns the boxes on is still reading. */
html[data-regions="named"] .sb [data-target]:hover:not(:has([data-target]:hover))::after {
  content: attr(data-target);
  position: absolute;
  z-index: 3;
  transform: translateY(-100%);
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  white-space: nowrap;
  pointer-events: none;
}
html[data-regions="named"] .sb [data-target] { position: relative; }

.sb-regions {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: var(--row-h);
  padding: 0 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--panel-2);
  color: var(--text-2);
  font-size: var(--fs-1);
  cursor: pointer;
}
.sb-regions:hover { background: var(--hover); }
.sb-regions[aria-pressed="true"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }
.sb-regions-dot {
  width: 10px; height: 10px;
  border: 1px dashed var(--text-3);
  border-radius: 2px;
}
.sb-regions[aria-pressed="true"] .sb-regions-dot { border-style: solid; border-color: var(--text-2); }
`

/**
 * The compact control that turns the boxes on, and the sentence it says when it is on.
 *
 * IT SAYS WHAT IT IS FOR AND NOT WHAT IT DRAWS. "Regions" is a name; the label a screen reader
 * hears is the question, because a name is only useful to somebody who already knows the answer.
 */
export function RegionsControl(): React.ReactElement {
  const [on, setOn] = useState(false)
  const developer = useInspect()

  useEffect(() => {
    const root = document.documentElement
    if (!on) root.removeAttribute(REGIONS_ATTRIBUTE)
    else root.setAttribute(REGIONS_ATTRIBUTE, developer ? 'named' : 'boxes')
    return () => root.removeAttribute(REGIONS_ATTRIBUTE)
  }, [on, developer])

  return (
    <button
      type="button"
      className="sb-regions"
      aria-pressed={on}
      aria-label={
        on
          ? t('g2d.regions.onLabel')
          : t('g2d.regions.offLabel')
      }
      onClick={() => setOn(!on)}
    >
      <span className="sb-regions-dot" aria-hidden="true" />
      {t('g2d.regions.button')}
    </button>
  )
}
