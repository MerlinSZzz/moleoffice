// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW TOOL HAS TO PHOTOGRAPH EVERY WIDTH THE LAYOUT ACTUALLY CHANGES AT.
 *
 * `tools/review.mjs` is the tool this project's "every screen is looked at before it is called done"
 * rule is discharged with. Its widths are a hard-coded const, `VIEWPORTS`, and not a flag — so a
 * width nobody added is a width nobody ever looks at, silently and for ever.
 *
 * WHY FOUR WIDTHS AND NOT TWO. The app's responsive layout is cut by exactly two `rem` breakpoints,
 * `max-width: 40rem` and `max-width: 60rem` (seven rules between them, counted in `src/web`). Those
 * two lines cut the width range into three bands with different layouts:
 *
 *     |------- 40rem -------|------- 60rem -------|
 *      both rules apply      only 60rem applies    neither applies
 *      one column, cards     table becomes cards   the wide desk
 *
 * The tool's standing pair, 1440 and 390, photographs the outer two bands and nothing else. The
 * middle band — where the records table turns into cards while the planning board is still a board —
 * had never been photographed at all. 660 and 990 are the two widths that fix that: 660 sits just
 * inside the middle band and 990 just past its top edge, which is also the narrowest desk the
 * `min-width: 960px` two-column rule fires at, and the tightest one the wide layout ever gets.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT. Six places in the round-ten build plan promise photographs
 * at 1440, 990, 660 and 390, and comparisons against the set taken before the build. A promise like
 * that kept in a comment is kept by whoever remembers. This file reads the const out of the source
 * — it is a .mjs script this .ts test cannot import — and names the width that is missing.
 *
 * WHAT IT DOES NOT CLAIM. It says nothing about whether the pictures are any good; that is the
 * blank-content floor inside review.mjs and tests/looked-at-every-screen.test.ts. It says only that
 * every band of the layout gets photographed by somebody.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const reviewFile = join(root, 'tools', 'review.mjs')
const webDir = join(root, 'src', 'web')

/**
 * The widths `VIEWPORTS` holds, read out of the source.
 *
 * PARSED, NOT IMPORTED, and it stops with the file named rather than guessing. review.mjs is a .mjs
 * script that starts a browser and two servers at import time's mercy, so importing it from a unit
 * test is not on offer. If the const is ever moved or renamed, the failure below says which file to
 * look in — a parse that quietly returned an empty list would report the tool as photographing
 * nothing, which is a different and much more alarming fault than the one that happened.
 */
function widthsInReviewTool(): number[] {
  const source = readFileSync(reviewFile, 'utf8')
  const block = /const VIEWPORTS = \[([\s\S]*?)\n\]/.exec(source)
  const inside = block?.[1] ?? null
  if (inside === null) {
    throw new Error(
      `Could not find "const VIEWPORTS = [ … ]" in ${reviewFile}. If it was renamed or moved, this test has to be pointed at wherever the widths now live.`,
    )
  }
  return [...inside.matchAll(/width:\s*(\d+)/g)].map((m) => Number(m[1]))
}

/**
 * Every `rem` breakpoint the interface is cut at, in px, read out of the stylesheets and the CSS
 * held in .ts/.tsx modules.
 *
 * `rem` in a media query is the INITIAL font size — 16px — and not whatever `html` computes to, so
 * this multiplication is the real one the browser does. `src/web/styles.css` sets no `font-size` on
 * `html`, so nothing here is even close to the edge of that rule.
 *
 * WHY THE PRELUDE IS MATCHED AND NOT JUST THE WIDTH, and it is the whole reason this function is
 * eight lines rather than one. `@container panel (max-width: 30rem)` is written eleven times in
 * `src/web` and it is NOT a viewport width — it asks how wide the PANEL is, which has nothing to do
 * with the size of the window a picture is taken at. The first draft of this test matched
 * `@media[^{]*\(max-width: …rem\)`, a negated class that happily crosses newlines, and it reported a
 * viewport breakpoint at 480px that does not exist and that no width could ever have covered. So the
 * prelude is matched whole and may hold no `@`, `{`, `}` or `;` — which is what stops one at-rule
 * reading a different at-rule's parentheses.
 */
function remBreakpointsInPx(): number[] {
  const found = new Set<number>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!/\.(css|ts|tsx)$/.test(entry)) continue
      const source = readFileSync(path, 'utf8')
      for (const rule of source.matchAll(/@media[^{}@;]*\{/g)) {
        for (const width of rule[0].matchAll(/\(m(?:ax|in)-width:\s*([\d.]+)rem\)/g)) {
          found.add(Number(width[1]) * 16)
        }
      }
    }
  }
  walk(webDir)
  return [...found].sort((a, b) => a - b)
}

describe('the review tool photographs every width the layout changes at', () => {
  it('takes all four widths the round-ten plan compares against: 1440, 990, 660 and 390', () => {
    const widths = widthsInReviewTool()
    const promised = [1440, 990, 660, 390]
    const missing = promised.filter((w) => !widths.includes(w))
    expect(
      missing,
      `tools/review.mjs VIEWPORTS takes ${widths.join(', ')}. It never photographs ${missing.join(' or ')}, so every comparison against design/round-ten/before/ at ${missing.join('px and ')}px is a promise nothing can keep.`,
    ).toEqual([])
  })

  it('leaves no band between the rem breakpoints unphotographed', () => {
    const widths = widthsInReviewTool()
    const cuts = remBreakpointsInPx()
    expect(cuts.length, `No rem breakpoints found under ${webDir}; this test would then prove nothing.`).toBeGreaterThan(0)

    // The cuts divide the width range into cuts.length + 1 bands. A band with no width in it is a
    // layout nobody has ever looked at.
    const edges: number[] = [0, ...cuts, Infinity]
    const empty: string[] = []
    for (let i = 0; i < edges.length - 1; i += 1) {
      const low = edges[i] ?? 0
      const high = edges[i + 1] ?? Infinity
      // `max-width: 40rem` fires AT 640px, so the band a cut opens starts one pixel above it.
      if (!widths.some((w) => w > low && w <= high)) {
        empty.push(high === Infinity ? `wider than ${low}px` : `between ${low}px and ${high}px`)
      }
    }
    expect(
      empty,
      `tools/review.mjs takes ${widths.join(', ')}, which photographs no page ${empty.join(', nor any ')}. The interface draws differently there — the rem breakpoints are at ${cuts.join('px, ')}px — and nothing is looking at it.`,
    ).toEqual([])
  })
})
