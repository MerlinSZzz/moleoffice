// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Take screenshots of the running app so they can be looked at.
 *
 * This exists because of a standing rule on this project: every screen is checked visually
 * before it is called done. Layout problems, broken mixed Chinese and English text, and
 * unreadable dark mode all pass a test suite and still look wrong.
 *
 *   node tools/shot.mjs                          # default pages, desktop + phone, light + dark
 *   node tools/shot.mjs '#/record/abc123'        # one specific page
 *
 * Writes PNG files into tools/shots/.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
import { waitForThePage } from './the-page-is-ready.mjs'

const BASE = whereIsTheWebApp()
const OUT = resolve('tools/shots')
mkdirSync(OUT, { recursive: true })

const routes = process.argv.slice(2)
const pages = routes.length ? routes.map((r) => ['custom', r]) : [['home', '']]

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'phone', width: 390, height: 844 },
]
const themes = ['light', 'dark']

const browser = await chromium.launch()
const written = []

for (const [label, route] of pages) {
  for (const vp of viewports) {
    for (const theme of themes) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        deviceScaleFactor: 1,
      })
      const page = await ctx.newPage()
      const errors = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))

      const url = BASE + '/' + route
      try {
        await page.goto(url, { timeout: 20000 })
        await waitForThePage(page, 20000)
      } catch (e) {
        // Do not pretend a failed page load succeeded -- say so and move on.
        console.error(`FAILED to load ${url}: ${e.message}`)
        await ctx.close()
        continue
      }
      await page.waitForTimeout(400)

      const file = `${OUT}/${label}-${vp.name}-${theme}.png`
      await page.screenshot({ path: file, fullPage: vp.name === 'desktop' })
      written.push(file)
      if (errors.length) console.error(`  console errors on ${label}/${theme}:`, errors.slice(0, 5))
      await ctx.close()
    }
  }
}

await browser.close()
console.log(written.join('\n'))
