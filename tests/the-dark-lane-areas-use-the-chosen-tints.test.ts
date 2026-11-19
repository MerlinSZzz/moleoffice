// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { AREAS, buildTheMadeUpOffice, DRAWING, PLACES, storeTheAreas, openThePage, prepareThePage, PROJECT, theAreasWereStored, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let office: MadeUpOffice
const dark = ['rgb(55, 48, 57)', 'rgb(48, 54, 64)', 'rgb(52, 55, 59)', 'rgb(48, 58, 53)', 'rgb(54, 51, 62)', 'rgb(59, 57, 48)']

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-chosen-tints', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  const lanes = [
    { ...AREAS[0], head: office.id['alone'] },
    AREAS[1],
    { ...AREAS[2], tint: '--area-3' },
    AREAS[3],
    { name: 'Example nested area (made up)', arrange: 'row', order: 5, in: AREAS[0].name, tint: '--area-5' },
    { name: 'Example sixth area (made up)', arrange: 'row', order: 6, tint: '--area-6' },
  ]
  const nodes = Object.fromEntries(Object.entries(PLACES).filter(([name]) => name !== 'alone').map(([name, [area, order]]) => [office.id[name]!, { lane: name === 'loop-a' ? lanes[4]!.name : name === 'counter' ? lanes[5]!.name : AREAS[area]!.name, order }]))
  office.areas = await storeTheAreas(writerFor(app, PROJECT.id), office.id['drawn']!, { direction: 'down', lanes, nodes })
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() })

for (const mode of ['chosen dark', 'system dark', 'light'] as const) {
  it(`draws area fills in ${mode}`, async () => {
    theAreasWereStored(office.areas, 'the made-up pipeline')
    await openThePage(app, pipelinePath(office.id['drawn']!), mode === 'light' ? 'light' : 'dark')
    await theDrawingIsDrawn(app.page)
    await app.page.emulateMedia({ colorScheme: mode === 'system dark' ? 'dark' : 'light' })
    if (mode === 'system dark') await app.page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('data-boot-theme') })
    const measured = await app.page.evaluate(({ drawing, mode }) => {
      const root = document.querySelector(drawing)!
      const nodes = [...root.querySelectorAll<HTMLElement>('.e-area[data-tint], .e-band[data-tint]')]
      return nodes.map((node) => {
        const actual = getComputedStyle(node).backgroundColor
        const token = node.dataset.tint!
        const all = Array.from({ length: 6 }, (_, index) => {
          node.style.setProperty('--e-tint', `var(--area-${index + 1})`)
          return getComputedStyle(node).backgroundColor
        })
        node.style.setProperty('--e-tint', `var(${token})`)
        return { key: node.dataset.key ?? node.dataset.bandOf, token, actual, all, mode, framed: node.dataset.framed ?? 'band' }
      })
    }, { drawing: DRAWING, mode })
    expect(measured.length, 'the drawing has tinted areas or bands').toBeGreaterThan(0)
    expect(new Set(measured.map((area) => area.token)).size, 'all six tints appear on areas').toBe(6)
    expect(measured.some((area) => area.framed === '1'), 'a framed area is tinted').toBe(true)
    expect(measured.some((area) => area.framed === 'band'), 'a band is tinted').toBe(true)
    for (const area of measured) {
      const index = Number(area.token.slice(-1)) - 1
      const expected = mode === 'light' ? ['rgb(251, 228, 234)', 'rgb(221, 233, 247)', 'rgb(231, 235, 238)', 'rgb(220, 240, 223)', 'rgb(233, 227, 248)', 'rgb(248, 238, 198)'] : dark
      expect(area.actual, `${mode}: ${area.key} ${area.framed} ${area.token}`).toBe(expected[index])
      expect(area.all, `${mode}: all six tints on ${area.key} ${area.framed}`).toEqual(expected)
    }
  }, 120_000)
}
