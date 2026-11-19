// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { buildTheMadeUpOffice, DRAWING, openThePage, prepareThePage, PROJECT, theDrawingHoldsStill, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-faded-chips', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() })

for (const theme of ['light', 'dark'] as const) {
  for (const view of ['drawn', 'master'] as const) it(`every faded card chip is readable in ${theme} on ${view}`, async () => {
    await openThePage(app, pipelinePath(office.id[view]!), theme)
    await theDrawingIsDrawn(app.page)
    const selected = office.id[view === 'master' ? 'start' : 'next']!
    await app.page.locator(`${DRAWING} .e-card[data-id="${selected}"]`).focus()
    await app.page.keyboard.press('Enter')
    await app.page.locator(`${DRAWING}[data-selected="${selected}"]`).waitFor()
    await theDrawingHoldsStill(app.page)
    const count = await app.page.locator(`${DRAWING} .e-card[data-dim="1"]`).count()
    expect(count, 'selection leaves at least one faded card').toBeGreaterThan(0)
    const readings = await app.page.locator(`${DRAWING} .e-card[data-dim="1"] :is(.e-chip,.e-badge,.e-count,.e-title,.e-no), ${DRAWING} .e-card[data-lit="1"] .e-title`).evaluateAll((elements) => {
      type Color = [number, number, number, number]
      const parse = (s: string): Color => {
        const wide = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/)
        if (wide) return [Number(wide[1]) * 255, Number(wide[2]) * 255, Number(wide[3]) * 255, wide[4] === undefined ? 1 : Number(wide[4])]
        const m = s.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/)
        if (!m) throw new Error(`Cannot measure color ${s}`)
        return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
      }
      const over = (front: Color, back: Color): Color => {
        const a = front[3] + back[3] * (1 - front[3])
        if (!a) return [0, 0, 0, 0]
        return [0, 1, 2].map((i) => (front[i]! * front[3] + back[i]! * back[3] * (1 - front[3])) / a).concat(a) as Color
      }
      const layer = (value: Color, node: Element): Color => {
        const css = getComputedStyle(node)
        if (css.filter !== 'none' || css.mixBlendMode !== 'normal' || css.backgroundImage !== 'none') throw new Error(`Unsupported paint on ${node.className}`)
        const next = over(value, parse(css.backgroundColor))
        next[3] *= Number(css.opacity)
        return next
      }
      const luminance = (c: Color): number => c.slice(0, 3).map((n) => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i]!, 0)
      return elements.map((element) => {
        const card = element.closest<HTMLElement>('.e-card')!
        element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
        const box = element.getBoundingClientRect()
        card.style.visibility = 'hidden'
        const behind = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        card.style.removeProperty('visibility')
        if (!behind) throw new Error('No backdrop at the text')
        let foreground = parse(getComputedStyle(element).color)
        let background: Color = [0, 0, 0, 0]
        let under: Color = [0, 0, 0, 0]
        let node: Element | null = element
        while (node && node !== card.parentElement) {
          foreground = layer(foreground, node)
          background = layer(background, node)
          if (node !== element) under = layer(under, node)
          node = node.parentElement
        }
        node = behind
        while (node) {
          foreground = layer(foreground, node)
          background = layer(background, node)
          under = layer(under, node)
          node = node.parentElement
        }
        if (foreground[3] < 0.999 || background[3] < 0.999) throw new Error('Backdrop is not opaque')
        const a = luminance(foreground), b = luminance(background), c = luminance(under)
        return { card: card.dataset.id, dim: card.dataset.dim === '1', kind: element.className, text: element.textContent?.trim(), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), fillAgainstCard: (Math.max(b, c) + 0.05) / (Math.min(b, c) + 0.05) }
      })
    })
    expect(readings.filter((r) => r.dim && /e-chip|e-badge|e-count/.test(String(r.kind))).length, 'at least one chip was measured').toBeGreaterThan(0)
    if (view === 'master') expect(readings.filter((r) => r.dim && r.kind === 'e-badge').length, 'a faded module badge is measured').toBeGreaterThan(0)
    if (view === 'drawn') expect(readings.filter((r) => r.dim && r.kind === 'e-count').length, 'a faded count is measured').toBeGreaterThan(0)
    readings.sort((a, b) => a.ratio - b.ratio)
    console.log(`${theme} ${view} faded text ratios: ${JSON.stringify(readings)}`)
    const faded = readings.filter((r) => r.dim)
    const litTitles = readings.filter((r) => !r.dim && r.kind === 'e-title')
    const fadedTitles = faded.filter((r) => r.kind === 'e-title')
    expect(litTitles.length, 'a lit title is measured').toBeGreaterThan(0)
    expect(fadedTitles.length, 'a faded title is measured').toBeGreaterThan(0)
    expect(Math.max(...fadedTitles.map((r) => r.ratio)), 'faded titles have lower contrast than a lit title').toBeLessThan(Math.min(...litTitles.map((r) => r.ratio)))
    const opacities = await app.page.locator(`${DRAWING} .e-card[data-dim="1"], ${DRAWING} .e-card[data-dim="1"] *`).evaluateAll((nodes) => nodes.filter((node) => Number(getComputedStyle(node).opacity) !== 1).map((node) => `${node.className}: ${getComputedStyle(node).opacity}`))
    const failures = faded.filter((r) => r.ratio < 4.5).map((r) => `${r.card} ${String(r.kind)} ${r.text}: ${r.ratio.toFixed(2)}:1`)
    expect(failures, failures.join('\n')).toEqual([])
    expect(opacities, `faded card elements using opacity: ${opacities.join(', ')}`).toEqual([])
  }, 120_000)
}
