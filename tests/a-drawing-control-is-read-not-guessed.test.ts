// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY CONTROL ON A DRAWING IS READABLE, AT PHONE WIDTH AND IN BOTH THEMES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The drawing's own Graph control was invisible. It is `primary` because it is the view you are
 * looking at, and `aria-disabled` at the same time because pressing it would do nothing — and the
 * two states were styled by two rules that each did half the pair. The primary rule set the accent
 * surface; the disabled rule set the disabled text. Which of them won which property came out of
 * the order the stylesheets happened to be hoisted in, and what a reader got was --text-3 on
 * --accent: 1.11 to 1 in light and 1.19 to 1 in dark, measured on the pipeline drawing at 390 on
 * 6 September 2026. Builder DG's note in report j9Dxd-8bu68E is where it was first seen.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST AND NOT A TOKEN TEST
 * ---------------------------------------------------------------------------------------
 *
 * tests/legibility.test.ts computes ratios from the tokens, which is the right test for a pair
 * somebody declared. This defect was in no declared pair: both halves were correct on their own and
 * the wrong two met on one element. Nothing but a rendered page can see that, so this asks the
 * browser what it actually painted.
 *
 * THE FLOOR IS 4.5, which is this project's floor for text a person reads.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let pipelineId = ''

/** What a control has to reach for its words to be read rather than guessed at. */
const FLOOR = 4.5

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const said = await res.text()
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${said}`)
  return JSON.parse(said) as Record<string, unknown>
}

beforeAll(async () => {
  // PHONE WIDTH, because that is where it was found and because the drawing's controls wrap there.
  app = await liveApp({ name: 'drawing-control-contrast', viewport: { width: 390, height: 844 } })
  const made = (await post('/api/records', { kind: 'pipeline', title: 'Handover v2', data: { blockIds: [] } }))[
    'record'
  ] as { id: string }
  pipelineId = made.id
  for (const name of ['Sense the pot', 'Plan the approach', 'Close and hold']) {
    await post(`/api/records/${pipelineId}/blocks`, { name, state: 'todo' })
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * WHAT THE BROWSER PAINTED, for every control on the page that draws words.
 *
 * A background is composited down the ancestors rather than taken from the first element that
 * declares one: a half-transparent fill over a dark panel is neither of the two colours, and
 * reading the declared one would report a ratio nobody sees.
 */
async function controlsOnScreen(): Promise<{ words: string; ratio: number; fg: string; bg: string }[]> {
  return app.page.evaluate(() => {
    const channels = (colour: string): [number, number, number, number] => {
      const inside = /rgba?\(([^)]+)\)/.exec(colour)
      if (inside === null) return [0, 0, 0, 0]
      const parts = inside[1]!.split(',').map((one) => Number(one.trim()))
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
    }
    const over = (top: [number, number, number, number], under: [number, number, number, number]): [number, number, number, number] => {
      const a = top[3]
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]
    }
    const painted = (el: Element): [number, number, number, number] => {
      const stack: [number, number, number, number][] = []
      let at: Element | null = el
      while (at !== null) {
        const here = channels(getComputedStyle(at).backgroundColor)
        if (here[3] > 0) stack.push(here)
        if (here[3] >= 1) break
        at = at.parentElement
      }
      let out: [number, number, number, number] = stack.pop() ?? [255, 255, 255, 1]
      while (stack.length > 0) out = over(stack.pop()!, out)
      return out
    }
    const luminance = ([r, g, b]: [number, number, number, number]): number => {
      const one = (v: number): number => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * one(r) + 0.7152 * one(g) + 0.0722 * one(b)
    }
    const said = (c: [number, number, number, number]): string => `rgb(${String(Math.round(c[0]))}, ${String(Math.round(c[1]))}, ${String(Math.round(c[2]))})`
    const out: { words: string; ratio: number; fg: string; bg: string }[] = []
    // THE CONTROLS, and nothing else. A card is not a control and its own readability is measured
    // where cards are measured; this is about the things a reader presses.
    for (const el of document.querySelectorAll('.px-btn, .gx-scope, .gx-canvas-bar button')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const words = (el.textContent ?? '').trim()
      if (words === '') continue
      const fg = channels(getComputedStyle(el).color)
      const bg = painted(el)
      const a = luminance(fg.length === 4 && fg[3] < 1 ? over(fg, bg) : fg)
      const b = luminance(bg)
      out.push({
        words: words.slice(0, 40),
        ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100,
        fg: said(fg),
        bg: said(bg),
      })
    }
    return out
  })
}

describe('every control on the drawing can be read, at 390 and in both themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`holds every control at ${String(FLOOR)} to 1 or better in ${theme}`, async () => {
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.goto(`${app.site}/#/pipeline/${pipelineId}`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.waitForSelector('.gx-switch .px-btn', { timeout: 30_000 })
      // THE DRAWING HAS TO BE ON SCREEN, because that is what makes the Graph control BOTH the
      // view you are in and a press that would do nothing — primary and aria-disabled at once,
      // which is the pair this test is about. At 390 the page opens on the printed list, so
      // pressing Graph is part of the measurement rather than a convenience.
      // ALREADY THERE IS A REAL ANSWER. The view a reader chose is kept, so the second theme opens
      // on the drawing and the press it would make is the one this control refuses.
      const graphControl = app.page.locator('.gx-switch .px-btn', { hasText: 'Graph' }).first()
      if ((await graphControl.getAttribute('aria-disabled')) !== 'true') await graphControl.click()
      await app.page.waitForFunction(
        () =>
          [...document.querySelectorAll('.gx-switch .px-btn')].some(
            (one) => (one.textContent ?? '').trim() === 'Graph' && one.getAttribute('aria-disabled') === 'true',
          ),
        undefined,
        { timeout: 30_000 },
      )

      const controls = await controlsOnScreen()
      // THE CONTROL THIS TEST WAS WRITTEN FOR HAS TO BE ONE OF THEM, or the test would pass on a
      // page that drew no drawing at all.
      const graph = controls.find((one) => one.words === 'Graph')
      expect(graph, 'the drawing has no Graph control to measure').toBeDefined()

      const tooFaint = controls.filter((one) => one.ratio < FLOOR)
      expect(
        tooFaint,
        `these controls are below ${String(FLOOR)} to 1 in ${theme}: ${tooFaint
          .map((one) => `"${one.words}" ${String(one.ratio)} (${one.fg} on ${one.bg})`)
          .join('; ')}`,
      ).toEqual([])
    }, 240_000)
  }
})
