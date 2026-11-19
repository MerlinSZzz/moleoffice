// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE WIDTH RULE FOR A PAGE WHOSE SECTIONS DIFFER IN KIND.
 *
 * Above 1180 pixels, a page whose sections differ in kind sets them side by side, as item 2 of a
 * decision says. At 1180 and below they stand one above the other. This
 * file is the one place that says where the switch is and what the two columns are. A page that
 * follows the rule draws its sections inside the element this file gives it, and never writes the
 * width itself.
 * tests/every-mixed-page-sets-its-sections-side-by-side.test.ts checks both halves of that.
 *
 * WHERE THE SWITCH IS: 75rem, which is 1200 pixels at the browser's own text size. The decision
 * says above 1180. The review widths are 1440, 1180, 990, 660 and 390, so 1180 stacks and 1440 sets
 * two columns under either number. 75rem was already the width Home, the band of blocks
 * (PanelGrid.tsx), the attention panel and the role cards switch at, so the product had one number
 * for a wide screen before this file. Moving the switch to 1181 would have made a second one.
 * A window between 1181 and 1199 pixels wide still stacks. That gap is known and is said here.
 *
 * WHY THE WINDOW AND NOT THE PAGE'S OWN WIDTH. Two pages used to ask their own width (a container
 * query at 56rem), and two asked the window. One rule has to pick one. The decision names a window
 * width, and tools/review.mjs photographs window widths, so the rule asks the window.
 *
 * WHAT A PAGE WRITES. The element carries the class below. Each child says which column it takes:
 *   data-column="start"  the first column, which is the wider one unless the page says otherwise;
 *   data-column="end"    the second column;
 *   data-column="across" the whole width, under the two.
 * Stacked, the children stand in the order they are written. A page may give its two columns other
 * widths through --sbs-columns, and its own gaps through its own class. It may not change the switch.
 *
 * AN EMPTY COLUMN IS NO COLUMN. When either column is missing or holds nothing, the page is one
 * column at every width, because an empty second track is a stranded band, which is not allowed
 * (the note on --reading-in-container in tokens.css says where). A page that has nothing to put
 * beside its main content leaves the end column empty rather than filling it with a quiet line.
 */
import type { HTMLAttributes, ReactNode } from 'react'

/** The media query for a window wide enough for two columns. */
export const WIDE_SCREEN = '(min-width: 75rem)'
/** Every other window: the stacked one. */
export const NARROW_SCREEN = `not all and ${WIDE_SCREEN}`

/** The class of the element whose children are set side by side. */
export const SIDE_BY_SIDE = 'sbs'

/** Which column a child takes. */
export type SideBySideColumn = 'start' | 'end' | 'across'

/**
 * The rule's own sheet. NO BACKTICK ANYWHERE IN THIS STRING, including in a comment.
 *
 * The stacked rules are written with :where, so they weigh nothing and a page's own class may set
 * the gaps. The rule that hides an empty column and the two-column rules carry the weight of the
 * class and the child selector, so no page rule of one class can undo them.
 */
const BOTH = `.${SIDE_BY_SIDE}:has(> [data-column="start"]:not(:empty)):has(> [data-column="end"]:not(:empty))`
export const SIDE_BY_SIDE_CSS = `
:where(.${SIDE_BY_SIDE}) { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--pad-lg); align-items: start; min-width: 0; }
:where(.${SIDE_BY_SIDE}) > * { min-width: 0; }
.${SIDE_BY_SIDE} > [data-column]:empty { display: none; }
@media ${WIDE_SCREEN} {
  ${BOTH} { grid-template-columns: var(--sbs-columns, minmax(0, 5fr) minmax(0, 3fr)); }
  ${BOTH} > [data-column="start"] { grid-column: 1; grid-row: 1; }
  ${BOTH} > [data-column="end"] { grid-column: 2; grid-row: 1; }
  ${BOTH} > [data-column="across"] { grid-column: 1 / -1; }
}
`

/** The sheet, drawn once however many pages use it. */
export function SideBySideStyle() {
  return (
    <style href="mole-office-side-by-side" precedence="default">
      {SIDE_BY_SIDE_CSS}
    </style>
  )
}

/**
 * The element whose children are set side by side, with the sheet beside it.
 *
 * `as` picks the element, because one page's pair of columns is a labelled section.
 */
export function SideBySide({
  as = 'div',
  className,
  children,
  ...rest
}: { as?: 'div' | 'section'; className: string; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & Record<`data-${string}`, string | boolean | undefined>) {
  const Tag = as
  return (
    <Tag className={`${SIDE_BY_SIDE} ${className}`} {...rest}>
      <SideBySideStyle />
      {children}
    </Tag>
  )
}
