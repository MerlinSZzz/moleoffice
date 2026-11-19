// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * The band of smaller blocks under the attention list.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS USED TO BE, AND WHY IT IS NOT THAT ANY MORE
 * ---------------------------------------------------------------------------------------
 *
 * This was a draggable panel grid: five panels of equal standing that the reader could reorder
 * and resize with the mouse or the keyboard, with the arrangement saved per screen width. It was
 * 659 lines, it carried a reducer of its own, and it had a control bar at the top of the home
 * page that said things like "5 panels · 12 columns · default arrangement".
 *
 * It was built for a home page that WAS five panels. That page is gone. The attention list is now
 * the page: it is ranked, it says why every row is on it, and it is not a panel among others — a
 * list that answers "what needs me now" is not something to be dragged to the bottom right. What
 * is left for a grid is four small blocks that share one job: what changed while you were away,
 * what is running, what the machine is holding, and where the pipelines stand.
 *
 * Two measured problems went with the old version, and both are fixed by removing it rather than
 * by tuning it:
 *
 *   1. TWO PANELS SHARED A ROW AND THE ROW WAS AS TALL AS THE TALLER ONE. At 1440 the shorter one
 *      left roughly 1,200px of dead space, because a CSS grid quantises into rows. The blocks now
 *      flow into columns (`columns: 2`), which is the only layout that has no rows to quantise:
 *      a short block is followed immediately by the next one, in the same column.
 *
 *   2. THE MACHINE PANEL SET ITS OWN HEIGHT. The number of unclaimed processes is decided by the
 *      operating system, not by the research, and it took about 43% of the page. The machine now
 *      gets a compact summary here and its full grouped list on the sessions page, which is
 *      approved decision 3.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROMISE THE OLD HEADER MADE, AND WHAT NOW KEEPS IT
 * ---------------------------------------------------------------------------------------
 *
 * The old comment promised that DOM order matches visual order, and that the order a screen
 * reader announces depends on that. THE PROMISE STILL HOLDS, and it holds more simply than
 * before: there is no reordering left, so the blocks are rendered in the order the caller wrote
 * them, and nothing moves them afterwards.
 *
 * A multi-column flow fills the first column top to bottom and then the second, so reading down
 * one column and then the next IS the DOM order — the same order a screen reader announces, and
 * the same order the phone stacks them in when there is only one column. Nothing here uses
 * `order`, `grid-area`, `row-reverse` or absolute positioning, which are the four ways a layout
 * can make the eye and the reader disagree.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING WAS LEFT BEHIND
 * ---------------------------------------------------------------------------------------
 *
 * The reducer that used to sit in ../lib/layout.ts is gone, its tests in tests/panel-grid.test.ts
 * are gone, and so are GET and PUT /api/layout/:id, which stored the browser's layout blob. They
 * were deleted on 2026-08-10, after being reported as dead for a phase: nothing imported the
 * reducer, and no part of the browser app ever called the route.
 *
 * If dragging is ever wanted back, read it out of git rather than expecting to find it here.
 *
 * ONE THING SURVIVED THE DELETION ON PURPOSE: the `panel_layouts` table. It is still declared in
 * src/server/db/schema.ts and still created by migration 0003. No backup and no export has carried it since a decision,
 * and an import writes none of its rows. It is RETIRED, because the only route that could write
 * a row into it has been deleted. It was kept because dropping a table is a destructive migration and this project's
 * migrations are additive only, and because an empty table costs nothing.
 */

import { useId } from 'react'
import { WIDE_SCREEN } from './SideBySide.tsx'

// ---------------------------------------------------------------------------- props

export interface PanelGridItem {
  /** Stable, and unique within one band. Used for the React key and for the error below. */
  id: string
  /**
   * What the block is, in two or three words.
   *
   * Required, and not decoration: it is the accessible name of the block's region, which is how
   * somebody navigating by region hears "Since you last looked" rather than "region".
   */
  title: string
  /** The block itself. The band never looks inside it. */
  node: React.ReactNode
}

export interface PanelGridProps {
  /** Names this band, for the region label and for the duplicate-id message. */
  id: string
  items: PanelGridItem[]
}

/**
 * Lay out a band of blocks in reading order.
 *
 * No drag, no widths, no stored arrangement, and nothing to configure. If a block needs to be
 * somewhere else, move it in the caller — the order on the page is the order in the array, which
 * is the only arrangement a reader and a screen reader can both be promised.
 */
export function PanelGrid({ id, items }: PanelGridProps) {
  const labelId = useId()
  const ids = items.map((item) => item.id)
  // Two blocks with one id would give React two identical keys and make the message below the
  // only way anybody would ever find out.
  if (new Set(ids).size !== ids.length) {
    throw new Error(`PanelGrid "${id}" was given duplicate block ids: ${ids.join(', ')}`)
  }

  return (
    <>
      <style href="mole-office-band" precedence="default">
        {BAND_CSS}
      </style>
      <section className="pg-band" aria-labelledby={labelId}>
        <h2 className="pg-sr" id={labelId}>{t('pageWords.PanelGrid.001')}</h2>
        {items.map((item) => (
          <div className="pg-block" key={item.id} data-pg-block={item.id} aria-label={item.title}>
            {item.node}
          </div>
        ))}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------- styles

/**
 * Two columns on a desk, one on a phone, and no rows anywhere.
 *
 * `columns` rather than `grid` is the whole fix for the dead space: a grid puts both blocks of a
 * pair on one row and makes the row as tall as the taller, so a short block leaves a hole under
 * it. A column flow has no rows, so the next block starts where the last one ended.
 *
 * `break-inside: avoid` keeps one block whole. Without it a panel can be cut in half across the
 * column boundary, which is worse than any amount of dead space.
 */
const BAND_CSS = `
.pg-band {
  columns: 1;
  column-gap: var(--gut);
}
.pg-block {
  break-inside: avoid;
  /* Safari still reads the old name for the same thing. */
  -webkit-column-break-inside: avoid;
  margin-bottom: var(--gut);
  /* A column box is not a flex or grid item, so it needs to be told not to overflow its column. */
  min-width: 0;
}
.pg-block > * { width: 100%; }

/* The two-column line is the product's one number for a wide screen, WIDE_SCREEN in
   components/SideBySide.tsx, which the rest of the app treats as a desk. Below it the band
   is one column, which is also exactly what the phone gets — one information model, composed
   responsively, rather than two products. */
@media ${WIDE_SCREEN} {
  .pg-band { columns: 2; }
}

.pg-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}
`
