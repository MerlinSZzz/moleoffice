// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

// Problem ASIUJf7lYZp_: the mail tool's card stands beside the power
// tree, and the Role cards page marked every card there "the one that checks". Only the inspector
// checks; theCardOffTheTree in src/shared/roles.ts says which card that is.
// SINCE 1 OCTOBER 2026 THE MAILER CARD IS GONE: the mail tool is the person's own tool, not an agent or a role
// card. So the inspector is the one card beside the tree, and it is marked.
let app: LiveApp
const shots = process.env.W13K_PN_SHOTS

beforeAll(async () => {
  app = await liveApp({ name: 'only-the-checker-marked', workspace: 'default', viewport: { width: 1440, height: 1000 } })
})
afterAll(async () => { try { if (shots) await photograph(shots) } finally { await app?.stop() } })

/**
 * The Role cards page and the inspector card's own page (the mailer card's until that card left on
 * 1 October 2026), at the four widths in both looks and at 1440
 * in Chinese (chapter 6). Only when W13K_PN_SHOTS names a folder. The card's own page exists once
 * the cards are copied into the project, which is what the copy door does.
 */
async function photograph(folder: string): Promise<void> {
  mkdirSync(folder, { recursive: true })
  const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const copied = await fetch(`${app.api}/api/roles/mirror`, { method: 'POST', headers })
  expect(copied.status, await copied.clone().text()).toBe(200)
  const roles = await fetch(`${app.api}/api/roles`, { headers }).then((r) => r.json())
  const inspector = roles.mirror.find((one: { role: string }) => one.role === 'inspector')
  const pages = { roles: '#/roles', inspector: `#/r/${encodeURIComponent(String(inspector.record))}` }
  const context = await app.browser.newContext()
  try {
    for (const [name, address] of Object.entries(pages)) {
      for (const width of [1440, 990, 660, 390]) for (const look of ['light', 'dark']) for (const language of width === 1440 ? ['en', 'zh'] : ['en']) {
        const tab = await context.newPage()
        await tab.setViewportSize({ width, height: 1000 })
        await tab.addInitScript((one) => localStorage.setItem('mole-office.preset.theme', one), look)
        await tab.goto(`${app.site}/?lang=${language}${address}`)
        await waitForThePage(tab)
        await tab.waitForTimeout(400)
        await tab.screenshot({ path: join(folder, `${name}-${String(width)}-${look}-${language}.png`), fullPage: true })
        await tab.close()
      }
    }
  } finally { await context.close() }
}

it('marks the inspector as the one that checks, and draws no mailer card beside the tree', async () => {
  await app.page.goto(`${app.site}/?lang=en#/roles`)
  await waitForThePage(app.page)
  const beside = app.page.locator('main.page .rol-tree-beside')
  await beside.first().waitFor({ timeout: 10_000 })
  const cards = await beside.evaluateAll((nodes) => nodes.map((node) => ({
    name: node.querySelector('.rol-node-name')?.textContent ?? '',
    marks: [...node.querySelectorAll('.rol-tree-mark')].map((one) => one.textContent ?? ''),
  })))
  expect(cards.map((one) => one.name).sort()).toEqual(['inspector'])
  expect(cards.find((one) => one.name === 'inspector')?.marks).toEqual([en['g6b.roles.checks']])
})
