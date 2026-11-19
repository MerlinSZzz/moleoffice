// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WIDTH AT WHICH THE PAGE CHANGES FROM ITS NARROW LAYOUT TO ITS WIDE ONE.
 *
 * Below it the sidebar is a drawer and the top bar is shown; from it up the sidebar stands beside the
 * page and an open chat can sit beside the page too. The number lives here and nowhere else: the
 * chat's query, the frame's matchMedia calls and the five stylesheets that carry a query at this
 * width all read the strings below. src/web/styles.css cannot import a constant, so it keeps its own
 * query at this width, and nothing checks that the two agree: a change to this number is made there too.
 *
 * THE TWO QUERIES MEET WITH NO GAP. A window can be a fractional number of pixels wide, so the narrow
 * query asks for one hundredth of a pixel less than the wide one rather than the pixel below it.
 */
export const THE_SHELL_WIDTH = 1024

/** From this width up the sidebar is in the flow beside the page, and an open chat sits beside it. */
export const THE_WIDE_FROM = `(min-width: ${String(THE_SHELL_WIDTH)}px)`

/** Below this width the sidebar is a drawer and an open chat covers the whole screen. */
export const THE_NARROW_FROM = `(max-width: ${String(THE_SHELL_WIDTH - 0.02)}px)`
