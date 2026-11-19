#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PHOTOGRAPH ONE PAGE AT THE FOUR WIDTHS AND IN BOTH THEMES.
 *
 *   node tools/shoot-the-press.mjs --base <web address> --route <hash route> [--out <dir>]
 *
 * `tools/review.mjs` photographs every page from a seeded corpus, and that seed holds no agent, so
 * it holds no card waiting on the person. This is the small companion: point it at one route on a
 * running app, and it takes the four widths and the two themes the drawing chapter asks for.
 *
 * The widths are 1440, 990, 660 and 390, which are the three layout bands cut by the 60rem and
 * 40rem breakpoints plus both edges. It writes PNGs only; it starts and stops nothing.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForThePage } from './the-page-is-ready.mjs'
import { whereIsTheWebApp } from './where-is-the-api.mjs'

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}

// THE ADDRESS COMES FROM THE ONE DECLARATION, never from a number typed here. `--base` is how a
// caller points this at an instance it started on a port of its own; with nothing given, the
// declared web address is used. tests/one-configuration-source.test.ts is what holds this.
const base = whereIsTheWebApp(arg('--base') ?? undefined)
const route = arg('--route') ?? ''
const outDir = resolve(arg('--out') ?? 'tools/review/press')
mkdirSync(outDir, { recursive: true })

const viewports = [
  { label: '1440', width: 1440, height: 1000 },
  { label: '990', width: 990, height: 1000 },
  { label: '660', width: 660, height: 1000 },
  { label: '390', width: 390, height: 844 },
]
const themes = ['light', 'dark']

const browser = await chromium.launch()
for (const vp of viewports) {
  for (const theme of themes) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
      deviceScaleFactor: 1,
    })
    const page = await ctx.newPage()
    const url = `${base}/${route}`
    await page.goto(url, { timeout: 20000 })
    await waitForThePage(page, 20000)
    await page.waitForTimeout(700)
    const file = `${outDir}/press-${vp.label}-${theme}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log(file)
    await ctx.close()
  }
}
await browser.close()
