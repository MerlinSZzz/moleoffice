// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO THINGS A SCREENSHOT CANNOT TELL YOU, PINNED AS NUMBERS.
 *
 * This project photographs every screen before calling it done, and neither of the defects these
 * tests cover was found that way. A picture of 12px prose looks like a picture of prose. A control
 * whose outline measures 1.63:1 against the paper behind it looks, to somebody who can see it, like
 * a control with an outline. Both were found by measuring, so both are kept by measuring.
 *
 * WHAT IS ASSERTED, AND WHY IT IS A RATIO RATHER THAN A HEX
 * ---------------------------------------------------------------------------------------------
 * A test that pins `--border-strong: #81848a` passes for a value nobody can see, as long as the
 * string matches — it defends a spelling. What has to hold is that the line can be SEEN against
 * every surface it is allowed to sit on, so that is what is computed here, per theme, from the
 * palette this file also reads. Retune a theme and this test recomputes; break the guarantee and
 * it fails naming the theme, the surface and the number.
 *
 * THE FORMULA IS PROVED BEFORE IT IS USED. The relative-luminance divisor is 1.055 and not 2.055,
 * and getting it wrong produces a plausible-looking number for every pair — a whole review was
 * once filed off the wrong one. So the first test here is black on white, which is 21:1 by
 * definition, and white on white, which is 1:1.
 *
 * WHERE THE 3:1 COMES FROM. WCAG 2.2 SC 1.4.11 Non-text Contrast: "the visual information required
 * to identify user interface components and states" needs 3:1 against adjacent colour. Body text
 * is a different floor (4.5:1) and it already passes everywhere — the header of tokens.css carries
 * those numbers and this file does not restate them.
 */

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const tokensCss = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8')

// --------------------------------------------------------------------------- colour maths

/** A value the reader was told is there. Absent means this test cannot say anything, so it stops. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`legibility: ${what} — this test cannot measure what it cannot read.`)
  return value
}

/** sRGB channel to linear light. The divisor is 1.055. */
const channel = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

const luminance = (hex: string): number => {
  const found = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (found === null) throw new Error(`Not a six-digit hex colour: "${hex}"`)
  const digits = must(found[1], `"${hex}" matched the hex pattern with no digits captured`)
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(digits.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// --------------------------------------------------------------------------- reading tokens.css

/** Every `--name: value;` in one block of CSS. */
function declarations(body: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const decl of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const name = must(decl[1], 'a declaration matched with no name')
    tokens[name] = must(decl[2], `--${name} matched with no value`).trim()
  }
  return tokens
}

/**
 * Every block in tokens.css that declares a whole palette, by the name of the theme it dresses.
 *
 * The blocks are found by the token they all set rather than by a hand-written list of theme
 * names: a palette is a block that declares --panel and --border-strong, so an eighth theme is
 * picked up by this test the day it is added rather than the day somebody remembers to add it
 * here. The `@media (prefers-color-scheme: dark)` block is one of them — it is a full second copy
 * of the dark palette, the file says so, and it is exactly the copy that could silently drift.
 */
function palettes(): { name: string; tokens: Record<string, string> }[] {
  const out: { name: string; tokens: Record<string, string> }[] = []
  // A block is a selector (or a media query's inner selector) up to its closing brace. Braces do
  // not nest inside a palette block, so the first `}` ends it.
  for (const block of tokensCss.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const body = must(block[2], 'a CSS block matched with no body')
    if (!body.includes('--border-strong:') || !body.includes('--panel:')) continue
    const selector = must(block[1], 'a CSS block matched with no selector').trim().split('\n').pop()?.trim() ?? ''
    const named = /data-theme='([a-z]+)'/.exec(selector)
    out.push({
      name:
        named === null
          ? selector.includes(':not([data-theme])')
            ? 'system dark'
            : 'light'
          : must(named[1], `the selector "${selector}" named a theme with no name in it`),
      tokens: declarations(body),
    })
  }
  return out
}

/** The surfaces a control is allowed to be drawn on. Every one of them is a declared token. */
const SURFACES = ['--bg', '--panel', '--panel-2', '--panel-3'] as const

/** WCAG 2.2 SC 1.4.11. */
const FLOOR = 3

describe('the contrast formula this file measures with', () => {
  it('gives 21:1 for black on white and 1:1 for white on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 2)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 6)
    // The lightest grey that still clears 4.5:1 on white, from the published tables.
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5)
  })
})

describe('the boundary of a control can be seen', () => {
  const found = palettes()

  it.each(found.map((p) => [p.name, p] as const))(
    '%s: --border-strong clears 3:1 on every surface',
    (name, palette) => {
      const edge = must(palette.tokens['--border-strong'], `the ${name} palette declares no --border-strong`)
      for (const surface of SURFACES) {
        const paper = must(palette.tokens[surface], `the ${name} palette declares no ${surface}`)
        const ratio = contrast(edge, paper)
        expect(
          Number(ratio.toFixed(2)),
          `${name}: --border-strong ${edge} on ${surface} ${paper} measures ${ratio.toFixed(2)}:1, ` +
            `below the ${FLOOR}:1 a control boundary needs. Nothing else draws the edge of a button, ` +
            `an input or a select, so at this ratio the control has no visible edge at all.`,
        ).toBeGreaterThanOrEqual(FLOOR)
      }
    },
  )
})

describe('the token controls actually draw their edge with', () => {
  beforeAll(() => {
    // src/web/api.ts and lib/workspace.ts both read window.localStorage at module scope, and the
    // component library imports them. This is the same smallest stand-in tests/ui.test.ts uses to
    // let the module load; nothing about it is under test here.
    const store = new Map<string, string>()
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    }
  })

  /**
   * Every declaration that reaches this class from a rule naming it BARE.
   *
   * Bare, so that `.px-btn` collects `.px-btn { … }` and the grouped reset it appears in, and
   * leaves `.px-btn[data-variant="ghost"]` and `.px-btn:hover` out — those are the variant and the
   * state, and each has its own opinion about the edge. Concatenated in source order, which is the
   * order the cascade applies them in at equal specificity.
   */
  const declarationsFor = (css: string, cls: string): string => {
    const parts: string[] = []
    // Comments come out first. This stylesheet documents itself heavily, and a comment sits
    // between the section header and the rule it introduces — leave it in and the selector reads
    // as "/* ---- button */ .px-btn" and matches nothing.
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const selectors = must(rule[1], 'a CSS rule matched with no selector')
        .split(',')
        .map((s) => s.trim())
      if (selectors.some((s) => s === cls)) parts.push(must(rule[2], 'a CSS rule matched with no body'))
    }
    if (parts.length === 0) throw new Error(`No rule in the stylesheet names \`${cls}\` on its own.`)
    return parts.join('\n')
  }

  it('draws every plain control edge from --border-strong, not from the decorative --border', async () => {
    // WHY THIS TEST EXISTS. The test above pins a RATIO on --border-strong. On its own that
    // guarantees nothing about a button: point .px-btn at --border instead and every ratio above
    // still passes while the control goes back to a 1.26:1 hairline, with no type error and no
    // failing test. This is the join between the two facts, and it is the defect this codebase
    // keeps producing.
    const { UI_CSS } = await import('../src/web/components/ui.tsx')
    // The button, the text box, the picker, the menu and the disclosure that opens a health
    // report: five plain controls whose only boundary is this border.
    for (const cls of ['.px-btn', '.px-input', '.px-select', '.px-menu', '.px-health-sum']) {
      expect(
        declarationsFor(UI_CSS, cls),
        `${cls} does not take its border from --border-strong, so the ratio pinned above does not ` +
          `reach it and the control is drawn with an edge nothing measures.`,
      ).toMatch(/border:[^;]*var\(--border-strong\)/)
    }

    // AND THE CHECK ITSELF IS PROVED, HERE RATHER THAN BY EDITING ui.tsx. Every other test in
    // this file was proved by putting its defect back in the file it guards; this one guards a
    // file another pass is holding open, so the defect is put back in a COPY and the same
    // assertion is run against it. If the reader below ever stops seeing the swap, the
    // `not.toBe` line fails rather than the proof quietly becoming a no-op.
    const doctored = UI_CSS.replace(/(\.px-btn\s*\{[^}]*)var\(--border-strong\)/, '$1var(--border)')
    expect(doctored, 'the doctored copy is identical, so this proof tested nothing').not.toBe(UI_CSS)
    expect(declarationsFor(doctored, '.px-btn')).not.toMatch(/border:[^;]*var\(--border-strong\)/)
  })

  it('draws the box an origin mark keeps from --border-strong, not from the decorative --border', async () => {
    // WHAT WENT WRONG. This rule read var(--border) and tools/legibility.mjs measured the result at
    // 1.16:1 in light and 1.45:1 in dark, over a transparent fill, on 15 August 2026. The three
    // marks it draws are the three cases where Mole Office cannot say how a record got here, and the box
    // is what makes them read as a question instead of an answer. At that ratio there was no box.
    const { UI_CSS } = await import('../src/web/components/ui.tsx')
    expect(
      declarationsFor(UI_CSS, '.px-chip.px-origin'),
      'the origin mark draws its enclosure with an edge nothing measures, so the three marks that ' +
        'say Mole Office cannot name an origin have no visible boundary.',
    ).toMatch(/border-color:\s*var\(--border-strong\)/)

    const doctored = UI_CSS.replace(
      /(\.px-chip\.px-origin\s*\{[^}]*)border-color:\s*var\(--border-strong\)/,
      '$1border-color: var(--border)',
    )
    expect(doctored, 'the doctored copy is identical, so this proof tested nothing').not.toBe(UI_CSS)
    expect(declarationsFor(doctored, '.px-chip.px-origin')).not.toMatch(/border-color:\s*var\(--border-strong\)/)
  })

  it('draws the line between two appearance segments from --border-strong, not the decorative --border', () => {
    // WHAT WENT WRONG. The segmented control in the appearance bar draws one border around the set
    // and a hairline between the positions. The hairline between positions IS the visual boundary
    // of a control in the sense of WCAG 1.4.11 -- it is the only thing saying where one segment
    // ends and the next begins -- and it read var(--border): 1.26:1 in light and 1.33:1 in dark,
    // measured by node tools/legibility.mjs on 15 August 2026. At that ratio six segments are one
    // wide button. The switch one panel below it on the same page already used --border-strong.
    //
    // WHY IT IS PINNED HERE. The failure was first patched by scoping an override onto the one page
    // that draws the bar, which leaves the source wrong and the next surface to render a preset bar
    // failing again with nothing to say so.
    const stylesCss = readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8')
    expect(
      declarationsFor(stylesCss, '.presetbar-seg button'),
      'the line between two segments is drawn with an edge nothing measures, so the appearance ' +
        'control has no visible divisions.',
    ).toMatch(/border-right:[^;]*var\(--border-strong\)/)

    // Proved against a copy, for the same reason the check above is: this is a shared stylesheet
    // and putting the defect back on disk would break every other run in flight against it.
    const doctored = stylesCss.replace(
      /(\.presetbar-seg button\s*\{[^}]*border-right:[^;]*)var\(--border-strong\)/,
      '$1var(--border)',
    )
    expect(doctored, 'the doctored copy is identical, so this proof tested nothing').not.toBe(stylesCss)
    expect(declarationsFor(doctored, '.presetbar-seg button')).not.toMatch(
      /border-right:[^;]*var\(--border-strong\)/,
    )
  })
})

