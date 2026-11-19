// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING `src/web/tokens.css` OUT OF A REAL BROWSER, AT A CHOSEN DENSITY AND TEXT SIZE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A BROWSER AND NOT A REGULAR EXPRESSION
 * ---------------------------------------------------------------------------------------
 *
 * Two of this stylesheet's claims cannot be checked by reading it.
 *
 * The first is `rem`. `--fs-2` is `max(14px, 0.875rem)` and what that comes to depends on the root
 * font size, which is exactly what the text-size control moves. A source scan reads one string and
 * calls it a size; the question is what three different settings compute to.
 *
 * The second is custom-property substitution. `--row-fit` is declared once, on `:root`, with
 * `var(--pad)` inside it, and every density block redeclares `--pad` on that same element. Whether
 * each density's row therefore fits its own padding is a fact about how a CSS engine substitutes,
 * and it was reasoned rather than measured until this file existed.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HEIGHT IS MEASURED OFF A BOX AND NOT READ OFF THE PROPERTY
 * ---------------------------------------------------------------------------------------
 *
 * `getComputedStyle(html).getPropertyValue('--row-h')` does NOT return a length. An unregistered
 * custom property computes to its token stream with `var()` substituted, so it comes back as
 * `max(28px, calc(max(14px, 0.875rem) * 1.45 + 2 * 6px))` — the expression, not the answer. The
 * only honest way to read the answer is to give a real box `min-height: var(--row-h)` and measure
 * the box. That token stream is still returned beside the number, because it is what says which
 * density's `--pad` was substituted.
 *
 * Only tokens.css is loaded. `--fs-1..6` and `--row-h` are each declared in that file and nowhere
 * else under `src/web` — `tests/legibility.test.ts` holds the `--fs-*` half of that to exactly one
 * declaration apiece, and `tests/a-row-holds-its-own-text.test.ts` holds the `--row-h` half — so a
 * page holding this sheet computes the same values the app does.
 */

import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'

/** The three positions of the text-size control. `default` is the absence of the attribute. */
export const SIZES = ['small', 'default', 'large'] as const
export type SizeUnderTest = (typeof SIZES)[number]

/** The three positions of the density control. */
export const DENSITIES = ['compact', 'default', 'comfortable'] as const
export type DensityUnderTest = (typeof DENSITIES)[number]

/** What one setting of the two controls computes to. Every number is in px. */
export interface Computed {
  /** The root font size, which is the only thing the text-size control moves. */
  root: number
  /** `--fs-1` through `--fs-6`, in that order, as a box set to each one really draws them. */
  fs: number[]
  /** The height of a box whose `min-height` is `var(--row-h)`. */
  rowH: number
  /** The height of a box whose `height` is `var(--pad)`. */
  pad: number
  /** `--lh-body`, which is a bare number and so can be read off the property. */
  lineHeight: number
  /** The computed token stream of `--row-h`, for a failure message that says what was substituted. */
  rowHExpression: string
}

/** A browser holding the real stylesheet, with the two controls settable. */
export interface TokenBrowser {
  /** Set both controls and read every value back. */
  at(density: DensityUnderTest, size: SizeUnderTest): Promise<Computed>
  /** Change the window width, which is what decides whether the phone block applies. */
  widen(width: number): Promise<void>
  close(): Promise<void>
}

const TOKENS = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8')

/**
 * The probe page. One box per thing being measured, each set from the token under test and from
 * nothing else, so a number that moves says which token moved.
 */
const PROBE = `<!doctype html><html><head><style>__TOKENS__</style><style>
  body { margin: 0 }
  .probe { line-height: 1 }
  #row { min-height: var(--row-h) }
  #pad { height: var(--pad) }
  #fs1 { font-size: var(--fs-1) } #fs2 { font-size: var(--fs-2) } #fs3 { font-size: var(--fs-3) }
  #fs4 { font-size: var(--fs-4) } #fs5 { font-size: var(--fs-5) } #fs6 { font-size: var(--fs-6) }
</style></head><body>
  <div id="row"></div><div id="pad"></div>
  <div class="probe" id="fs1">x</div><div class="probe" id="fs2">x</div><div class="probe" id="fs3">x</div>
  <div class="probe" id="fs4">x</div><div class="probe" id="fs5">x</div><div class="probe" id="fs6">x</div>
</body></html>`

/** Open one browser holding the real tokens.css at this window width. */
export async function tokensInABrowser(width: number, height = 900): Promise<TokenBrowser> {
  const browser: Browser = await chromium.launch()
  const page: Page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(PROBE.replace('__TOKENS__', TOKENS), { waitUntil: 'load' })

  /**
   * THE STYLESHEET REALLY PARSED. This is not defensive scaffolding — it caught a real fault the
   * hour it was written. An unclosed comment in tokens.css drops every declaration after it, and
   * a custom property nobody declared computes to the empty string, so a box set from it silently
   * inherits and this file measures the browser's defaults while reporting numbers. Nothing else
   * in the suite parses this stylesheet, so nothing else would have said no.
   */
  const declared = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return ['--fs-1', '--fs-6', '--row-h', '--pad', '--lh-body'].filter(
      (name) => style.getPropertyValue(name).trim() === '',
    )
  })
  if (declared.length > 0) {
    await browser.close()
    throw new Error(
      `src/web/tokens.css loaded into a browser and declared nothing for ${declared.join(', ')}. ` +
        `The usual cause is an unclosed /* comment, which drops every declaration after it.`,
    )
  }

  const at = async (density: DensityUnderTest, size: SizeUnderTest): Promise<Computed> =>
    page.evaluate(
      ([whichDensity, whichSize]) => {
        const html = document.documentElement
        html.setAttribute('data-density', whichDensity as string)
        // The real app writes `default` as the ABSENCE of the attribute — PresetBar.applyPresets
        // is the only function allowed to touch it — so this does the same rather than writing a
        // word no rule in tokens.css matches.
        if (whichSize === 'default') html.removeAttribute('data-size')
        else html.setAttribute('data-size', whichSize as string)

        const box = (id: string): number => {
          const el = document.getElementById(id)
          if (el === null) throw new Error(`the probe page has no #${id}`)
          return Math.round(el.getBoundingClientRect().height * 100) / 100
        }
        const size2 = (id: string): number => {
          const el = document.getElementById(id)
          if (el === null) throw new Error(`the probe page has no #${id}`)
          return Math.round(Number.parseFloat(getComputedStyle(el).fontSize) * 100) / 100
        }
        return {
          root: Math.round(Number.parseFloat(getComputedStyle(html).fontSize) * 100) / 100,
          fs: ['fs1', 'fs2', 'fs3', 'fs4', 'fs5', 'fs6'].map(size2),
          rowH: box('row'),
          pad: box('pad'),
          lineHeight: Number.parseFloat(getComputedStyle(html).getPropertyValue('--lh-body')),
          rowHExpression: getComputedStyle(html).getPropertyValue('--row-h').trim(),
        }
      },
      [density, size] as const,
    )

  return {
    at,
    widen: async (next: number) => {
      await page.setViewportSize({ width: next, height })
    },
    close: async () => {
      await browser.close()
    },
  }
}

/** Every declaration of one token in tokens.css, with its line number, read as text. */
export function declarationsOf(token: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = []
  const lines = TOKENS.split('\n')
  for (const [at, text] of lines.entries()) {
    if (new RegExp(`^\\s*${token}\\s*:`).test(text)) found.push({ line: at + 1, text: text.trim() })
  }
  return found
}
