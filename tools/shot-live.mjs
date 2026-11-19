// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PHOTOGRAPH THE RUNNING APP AGAINST THE REAL DATABASE.
 *
 *   node tools/shot-live.mjs '#/records' records-real light 1440 panelx
 *   node tools/shot-live.mjs '#/' home-real dark 390
 *
 * WHY THIS EXISTS BESIDE tools/review.mjs, WHICH ALREADY TAKES 47 PICTURES. That one seeds a
 * THROWAWAY database and photographs it, which is what makes it repeatable and what lets it prove
 * things by writing and deleting links. But every record in that corpus is `fixture`, so anything
 * about the BALANCE between authored and fixture content is invisible in its pictures: the records
 * list came back with a fixture mark on every single row and looked repetitive, when on the real
 * corpus — 95 authored beside 290 fixture — the same treatment is what tells the project's own
 * record apart from the seeded one at a glance.
 *
 * That was measured on 2026-08-12 and it is the reason this file is here rather than a flag on the
 * other one: the two answer different questions. review.mjs asks "does the product draw its own
 * fixtures correctly, and can it prove its invariants". This asks "what does the operator actually
 * see tonight".
 *
 * IT TAKES A PICTURE AND NOTHING ELSE. It starts no server, seeds nothing, and writes nothing but a
 * PNG: it attaches to whatever is already serving on MOLE_OFFICE_WEB_PORT, so the thing photographed is
 * the thing running. If nothing is there it fails saying so, rather than starting a second server
 * against the real database — two processes on one SQLite file is the hazard this project has
 * already paid for once.
 */

import { chromium } from 'playwright'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
import { waitForThePage } from './the-page-is-ready.mjs'

const [address, name, theme = 'light', width = '1440', workspaceArg] = process.argv.slice(2)
const workspace = workspaceArg ?? null
if (address === undefined || name === undefined) {
  console.error('usage: node tools/shot-live.mjs <#/address> <name> [light|dark] [width] [workspace]')
  process.exit(2)
}

const url = `${whereIsTheWebApp()}/${address}`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: Number(width), height: 1000 }, colorScheme: theme })
  // WHICH PROJECT. The app keeps the chosen one in localStorage, exactly as it keeps the actor, so
  // a picture taken without setting it is a picture of the default workspace — which since the
  // corpus migration holds nothing. That is a photograph of an empty product, and it was taken once
  // before this line existed.
  if (workspace !== null) {
    await page.addInitScript(
      ([key, id]) => window.localStorage.setItem(key, id),
      ['mole-office.workspace', workspace],
    )
  }

  const response = await page.goto(url, { timeout: 30_000 }).catch((err) => {
    throw new Error(
      `Nothing answered at ${url} (${err instanceof Error ? err.message : String(err)}). Start the app ` +
        `first — this script deliberately will not start one, because a second process against the real ` +
        `database is the hazard it exists to avoid.`,
    )
  })
  if (response !== null && !response.ok()) throw new Error(`${url} answered ${response.status()}`)
  // AND THE PAGE ITSELF SAYS WHEN IT HAS FINISHED DRAWING. The panels that read the machine settle
  // after their first paint, and a picture taken before that is a picture of a skeleton — which
  // this repository has already published once by accident.
  await waitForThePage(page, 30_000)
  const out = `tools/review/live-${name}.png`
  await page.screenshot({ path: out, fullPage: true })
  console.log(`shot ${out} — ${address} at ${width} ${theme}`)
} finally {
  await browser.close()
}
