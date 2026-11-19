// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

// Wave 13q's pictures (report h3Rjf86iBrO5, block b-8; problem wgMS3adgQNTO): on Ideas at 660 the
// title and its facts were squeezed until "would need" wrapped one word a line. This measures the
// real pages at 660 with made-up records whose facts are long enough to wrap.
//
// THE REPORTS PAGE (#/notes) IS MEASURED BY ITS OWN ROWS. Since wave 13j's round 10 it is no longer a
// family list. It draws plain rows of its own, `.rpts-row` with the title in
// `.rpts-title`, and at 660 its facts go to a second line under the title. What this file holds it to is
// the same as for the family lists: the title keeps at least half the row.
//
// THE FAMILY LISTS (Ideas, Findings, Modules) ARE MEASURED BY THEIR OWN ROWS TOO. Since wave 13j's
// round 11 they are the plain lists of src/web/components/family/list.tsx: `.flst-row`, whose title
// and one second line are the link `.flst-open`, with the facts beside it or, at 660, under it.
let app: LiveApp
const shots = process.env.W13K_PN_SHOTS
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const long = 'a second bench with the same fan, three weeks of readings from the quiet room, and a person who can read the gauge'

beforeAll(async () => {
  app = await liveApp({ name: 'family-columns-660', workspace: 'default', viewport: { width: 660, height: 900 } })
  for (const [kind, title, data] of [
    ['idea', 'Try the slower fan on the seed tray', { state: 'new', would_need: [long] }],
    ['idea', 'Weigh the pots before and after watering', { state: 'active', would_need: [long] }],
    ['note', 'What the quiet room taught us about the fan', { body: long, date: '2026-09-27' }],
    ['claim', 'The slower fan keeps the seed tray cooler', { state: 'proposed', method: long }],
    ['direction', 'Whether the quiet room needs a second fan', { depth: 'noticed', question: long }],
    ['module', 'Seed tray cooling', { state: 'active', context: long, parts: [{ id: 'part-1', name: 'Fan', items: [{ id: 'item-1', text: long, state: 'todo' }] }] }],
  ] as const) {
    const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, summary: long, data }) })
    expect(reply.status, await reply.clone().text()).toBeLessThan(300)
  }
  // The rows carry the made-up mark, as the demo corpus's rows do, because that mark is the widest
  // thing the right-hand cell holds and it is what squeezed the title in the pictures.
  await app.page.route('**/api/records**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (Array.isArray(body.records)) for (const record of body.records) record.origin = 'fixture'
    // THE REPORTS PAGE'S REPLY CARRIES `rows`, not `records` (its own door, /api/records/reports-and-notes),
    // so its rows are marked too; before, they never were, and the widest thing in its row was never drawn.
    if (Array.isArray(body.rows)) for (const row of body.rows) row.origin = 'fixture'
    await route.fulfill({ response, json: body })
  })
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await app?.stop() })

it('leaves the title and its facts a readable width on Ideas, Notes, Findings and Modules at 660', async () => {
  const measured: unknown[] = []
  const faults: string[] = []
  for (const name of ['ideas', 'notes', 'findings', 'modules']) {
    // The Reports page's own row and title; every other page here is a row of the family lists
    // (criterion change, wave 13j round 11: report n9Mjk3c_sJRu block b-17 draws Ideas, Findings and
    // Modules as plain lists, `.flst-row`, whose title and second line are the link `.flst-open`).
    const at = name === 'notes' ? { row: '.rpts-row', main: '.rpts-title', title: '.rpts-title' } : { row: '.flst-row', main: '.flst-open', title: '.flst-title' }
    await app.page.goto(`${app.site}/?lang=en#/${name}`)
    await waitForThePage(app.page)
    await app.page.locator(`main.page ${at.row}`).first().waitFor({ timeout: 10_000 })
    const rows = await app.page.locator(`main.page ${at.row}`).evaluateAll((nodes, at) => nodes.map((row) => {
      const main = row.querySelector(at.main)
      // A fact's words wrap inside the width the row leaves them, so a value that wraps shows that width.
      // The Reports rows carry no fact value or body: their words are the title and the project, which
      // are read too, so the rule finds something on every page.
      const values = [...row.querySelectorAll<HTMLElement>('.fam-fact-value, .fam-body, .flst-title, .flst-text, .rpts-title, .rpts-project')].filter((one) => one.getClientRects().length > 1 || one.getBoundingClientRect().height > 30)
      return {
        title: row.querySelector(at.title)?.textContent ?? '',
        row: row.getBoundingClientRect().width,
        main: main?.getBoundingClientRect().width ?? 0,
        narrowestWrappedText: values.length === 0 ? null : Math.min(...values.map((one) => one.getBoundingClientRect().width)),
        // Every word the wrapped-words rule could read, wrapped or not, so the rule is known to reach the row.
        readable: row.querySelectorAll('.fam-fact-value, .fam-body, .flst-title, .flst-text, .rpts-title, .rpts-project').length,
        madeUp: row.querySelectorAll('[data-origin="fixture"]').length,
      }
    }), at)
    measured.push({ name, rows })
    if (shots) await app.page.screenshot({ path: join(shots, `columns-${name}-660.png`), fullPage: true })
    for (const one of rows) {
      // The title's column is at least half the row, and wrapped words are at least 200px wide.
      if (one.main < one.row / 2) faults.push(`${name}: "${one.title}" has ${one.main.toFixed(0)}px of a ${one.row.toFixed(0)}px row`)
      if (one.narrowestWrappedText !== null && one.narrowestWrappedText < 200) faults.push(`${name}: "${one.title}" wraps its words in ${one.narrowestWrappedText.toFixed(0)}px`)
      if (one.readable === 0) faults.push(`${name}: "${one.title}" has no words the wrapped-words rule can read`)
      // The Reports page says "Made-up example" on each row, so its rows are measured with the mark
      // drawn. The family lists say it once beside the heading, which is checked below.
      if (name === 'notes' && one.madeUp === 0) faults.push(`${name}: "${one.title}" is measured without its made-up mark`)
    }
    if (name !== 'notes' && (await app.page.locator('main.page .flst-head [data-origin="fixture"]').count()) === 0) faults.push(`${name}: the made-up mark is not beside a heading`)
  }
  console.log('family columns at 660', JSON.stringify(measured))
  expect(measured.length).toBe(4)
  expect(faults).toEqual([])
})
