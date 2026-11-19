#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TURN THE DRAWN AVATARS INTO PNG FILES, BECAUSE THE AVATAR ROUTE WILL NOT TAKE AN SVG.
 *
 * `POST /api/participants/:kind/:id/avatar` accepts png, jpeg and webp and nothing else. An SVG is
 * a document the browser executes, and this product hands an uploaded file back to a page, so it is
 * refused there on purpose (see src/server/lib/avatars.ts). The drawings in design/avatars are SVG
 * because that is what a person can edit; this writes the PNG each one is uploaded as.
 *
 * HOW: the SVG is put inline into a blank page at 512 by 512 and the page is photographed by the
 * Playwright already in this checkout. Nothing is fetched and no other program is needed. The
 * corners outside the disc stay transparent, so an avatar sits on a light page and a dark one alike.
 *
 * Run it after changing any file in design/avatars: `node tools/avatars-to-png.mjs`.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium } from 'playwright'

const HERE = fileURLToPath(new URL('../public/avatars/', import.meta.url))
const OUT = join(HERE, 'png')
const SIDE = 512

const drawings = readdirSync(HERE)
  .filter((name) => name.endsWith('.svg'))
  .sort()

if (drawings.length === 0) {
  console.error(`No SVG files in ${HERE}. Nothing was written.`)
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: SIDE, height: SIDE }, deviceScaleFactor: 1 })

for (const name of drawings) {
  const svg = readFileSync(join(HERE, name), 'utf8')
  await page.setContent(
    `<!doctype html><meta charset="utf-8">` +
      `<style>html,body{margin:0;padding:0;background:transparent}` +
      `#a{width:${String(SIDE)}px;height:${String(SIDE)}px}` +
      `#a svg{width:100%;height:100%;display:block}</style>` +
      `<div id="a">${svg}</div>`,
  )
  const shot = await page.locator('#a').screenshot({ omitBackground: true })
  const to = join(OUT, name.replace(/\.svg$/, '.png'))
  writeFileSync(to, shot)
  console.log(`${name} -> ${to} (${String(shot.length)} bytes)`)
}

await browser.close()
