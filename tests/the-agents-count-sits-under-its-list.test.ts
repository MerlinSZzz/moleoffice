// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor } from '../src/web/components/router.tsx'

// Criterion change, 29 September 2026: the work list now shows five rows, has a search field, and
// puts its count beside the heading. The old twelve-row count line below a scrolling box is gone.
let app: LiveApp
const shots = process.env.W13K_PN_SHOTS
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  app = await liveApp({ name: 'agents-count-390', workspace: 'default', viewport: { width: 390, height: 844 } })
  // Fourteen pieces of work, so the list shows its twelve and the sentence under it has a count to say.
  for (let n = 1; n <= 14; n++) {
    const title = n % 3 === 0 ? `Check the seed tray fan in the quiet room, week ${String(n)}, before the readings are written up` : `Seed tray week ${String(n)}`
    const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'task', title, data: { state: 'todo' } }) })
    expect(reply.status, await reply.clone().text()).toBeLessThan(300)
  }
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await app?.stop() })

it('shows five work rows, a search field, and the count beside the heading at 390 and 1440', async () => {
  for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1440, 'light']] as const) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await app.page.emulateMedia({ colorScheme: theme })
    // Agent conversations is the route `agents`, at #/conversations since wave 13q's category pages;
    // #/agents opens the Agents group. pathFor keeps the address in one place.
    await app.page.goto(`${app.site}/?lang=en#${pathFor('agents')}`)
    await waitForThePage(app.page)
    await app.page.locator('main.page .px-talk-source').first().waitFor({ timeout: 10_000 })
    const said = await app.page.evaluate(() => {
      const head = document.querySelector<HTMLElement>('main.page .px-ac-work-head')
      const count = head?.querySelector<HTMLElement>('.px-ac-work-count') ?? null
      const sources = [...document.querySelectorAll<HTMLElement>('main.page .px-ac-work-row')]
      return {
        heading: head?.querySelector('h2')?.textContent ?? '',
        count: count?.textContent ?? '',
        besideHeading: head !== null && count !== null,
        search: document.querySelector('main.page input[type="search"]') !== null,
        cards: sources.length,
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }
    })
    console.log('agents count', width, theme, JSON.stringify(said))
    if (shots) await app.page.screenshot({ path: join(shots, `agents-${String(width)}-${theme}.png`), fullPage: true })
    expect(said.cards).toBe(5)
    expect(said.search, 'the work list has no search field').toBe(true)
    expect(said.besideHeading, 'the count is not beside the work heading').toBe(true)
    expect(said.count).toMatch(/^5 of \d+ /)
    expect(said.document, 'the page overflows sideways').toBeLessThanOrEqual(said.viewport)
  }
})
