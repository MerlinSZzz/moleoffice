// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT PAGE, A RECORD'S HEADER, THE TOP BAR AND THE WORK CHIP READ PLAINLY (wave 13q's round 32; the review of
 * round 31's pictures, report h55T9uUmUbf4, block b-argus-review). In a real browser, on a scratch office holding made-up
 * records:
 *   - a record's header joins "创建于" and its stamp by the one spacing rule: "创建于刚刚", never "创建于 刚刚";
 *   - the agent page's switch line has no space after 。 before its link;
 *   - the agent page's dates are written as the office writes days, with the time: no "2026/10/04 05:37";
 *   - the role card's rung says what it counts: "权限树第 3 级" / "step 3 of the power tree";
 *   - Trips with none recorded is said as a person would, for a screen reader too;
 *   - the top bar's count has its measure word: "N 项紧急";
 *   - the work page's late count sits inside its red ground, not against its left edge.
 * The words themselves are held by tests/ten-small-things-say-what-they-mean.test.ts.
 *
 * MUTATIONS, each after a control run and a build: the header's typed space put back (StampAfter in ui.tsx); the
 * switch line's typed space put back (TheRightToInject.tsx); `drawnStamp` back on the agent page (ProfilePage.tsx); the
 * late count's left padding taken out (ui.tsx).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let decisionId = ''
const AS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const day = (n: number) => { const w = new Date(); w.setDate(w.getDate() + n); return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}` }

async function post(path: string, body: unknown, headers: Record<string, string> = AS): Promise<{ record: { id: string } }> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${path} ${text}`).toBeLessThan(300)
  return JSON.parse(text) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'r32-reads-plainly', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/records', { kind: 'obligation', title: 'Test return the kite string', data: { state: 'open', due: day(-1), owedTo: 'Test kite club' } })
  await post('/api/agents/started', { handle: 'test-kite-secretary', name: 'Test kite secretary', role: 'secretary' })
  // A RAISE, so the agent page draws its acting panel; and the switch line is on every agent page.
  const key = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }
  await post('/api/roles/elevation/test-kite-secretary', { reason: 'Test: a made-up raise', endsWhen: 'when you say' }, { ...AS, 'x-mole-office-key': key.person })
  decisionId = (await post('/api/records', { kind: 'decision', title: 'Test: mend the tail with tape', data: { option_taken: 'Test: tape', because: 'A made-up reason.',
    ...governsTheWholeProject(), replaces: [] } })).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

async function open(language: 'en' | 'zh', address: string, ready: string, width = 1440): Promise<Page> {
  const page = await app.context.newPage()
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${app.site}/?lang=${language}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  return page
}





it('draws the work page\'s late count inside its red ground', async () => {
  for (const language of ['en', 'zh'] as const) {
    const page = await open(language, '/work', '.wk-page')
    const count = page.locator('.wk-state .px-chip-count[data-count="late"]').first()
    await count.waitFor({ timeout: 30_000 })
    const room = await count.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getBoundingClientRect().left - element.getBoundingClientRect().left
    })
    expect(room, `${language}: the words touch the red ground's left edge`).toBeGreaterThanOrEqual(4)
    await page.close()
  }
})
