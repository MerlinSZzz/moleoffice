// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

// Problem RTw91iQtNHHl: in the light look F a chosen card looked the same as the cards not chosen.
// Wave 13q gave each look its own chosen values in tokens.css, and the secretary held YourCard's picture
// choice back until those were on main. This draws the choice on a person's own page in both looks,
// and measures that the chosen picture differs from the others and that its words read on it.
let app: LiveApp
const shots = process.env.W13K_PN_SHOTS

beforeAll(async () => {
  app = await liveApp({ name: 'your-card-chosen', workspace: 'default', viewport: { width: 990, height: 1000 } })
  await app.page.addInitScript(() => {
    const look = new URL(location.href).searchParams.get('look')
    if (look) localStorage.setItem('mole-office.preset.theme', look)
  })
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await app?.stop() })

it('marks the chosen picture apart from the others, with readable words, in light and in dark', async () => {
  const measured: unknown[] = []
  for (const look of ['light', 'dark'] as const) {
    await app.page.goto(`${app.site}/?lang=en&look=${look}#/who/person/${encodeURIComponent(THE_PERSON)}`)
    await waitForThePage(app.page)
    await app.page.locator('main.page button', { hasText: en['g6b.yourCard.change'] }).click()
    const chosen = app.page.locator('main.page .yc-pic[data-chosen="yes"]')
    await chosen.waitFor({ timeout: 10_000 })
    expect(await app.page.locator('main.page .yc-pic[data-chosen="no"]').count(), 'there is no other picture to compare with').toBeGreaterThan(0)
    const said = await app.page.evaluate(() => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const lum = (value: string) => {
        const [r, g, b] = rgb(value).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
      }
      const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
      const look = (node: Element) => { const s = getComputedStyle(node); return { edge: s.borderTopColor, width: s.borderTopWidth, ground: s.backgroundColor, ink: s.color, shadow: s.boxShadow } }
      const chosen = document.querySelector('main.page .yc-pic[data-chosen="yes"]')!
      const other = document.querySelector('main.page .yc-pic[data-chosen="no"]')!
      const a = look(chosen)
      const b = look(other)
      return { chosen: a, other: b, words: contrast(a.ink, a.ground), apart: Math.max(contrast(a.ground, b.ground), contrast(a.edge, b.edge)) }
    })
    measured.push({ look, ...said })
    if (shots) await app.page.locator('main.page .yc-pics').screenshot({ path: join(shots, `your-card-pictures-${look}.png`) })
    // The chosen one's ground or its edge differs from the others' by at least a contrast of 1.4, which
    // a person sees at a glance (light F fills the ground, dark H lights the edge), and its words read
    // on its ground at the 4.5 the rest of the product keeps for small text.
    expect(said.apart, JSON.stringify(said)).toBeGreaterThanOrEqual(1.4)
    expect(said.words, JSON.stringify(said)).toBeGreaterThanOrEqual(4.5)
  }
  console.log('your card chosen picture', JSON.stringify(measured))
})
