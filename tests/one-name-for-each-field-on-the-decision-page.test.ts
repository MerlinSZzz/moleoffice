// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE NAME FOR EACH FIELD ON THE DECISION PAGE (wave 13q's round 34; the rest of the review of round 33, report
 * jsUTdQgZEsnU, block b-argus-review, points 2, 3, 4, 7 and 8):
 *   2. the Decisions page's heads end in a count with its measure word in Chinese: 1 项 and 0 条;
 *   4. a filled field name and a grey one differ at a glance, by weight and by colour, and both read at 4.5:1 or more;
 *      round 35 made the filled name bold and the grey one lighter, as the review of round 34's pictures asked.
 * The first case reads the code; the others read a real browser on a scratch office holding made-up records.
 *
 * MUTATIONS, each after a control run and a build, are listed in the change's commit message.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { setWordLanguage } from '../src/shared/i18n.ts'

let app: LiveApp
let decisionId = ''
const AS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const KEEPER = { ...AS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-kite-keeper' }

async function post(path: string, body: unknown, headers: Record<string, string> = AS): Promise<{ record: { id: string } }> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${path} ${text}`).toBeLessThan(300)
  return JSON.parse(text) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'r34-one-name', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/agents/started', { handle: 'test-kite-keeper', name: 'Test kite keeper' })
  await post('/api/agents/started', { handle: 'test-kite-secretary', name: 'Test kite secretary', role: 'secretary' })
  const key = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }
  await post('/api/roles/elevation/test-kite-secretary', { reason: 'Test: a made-up raise', endsWhen: 'when you say' }, { ...AS, 'x-mole-office-key': key.person })
  // A DECISION WITH TWO FIELDS FILLED, so the band draws both a filled name and grey ones.
  decisionId = (await post('/api/records', { kind: 'decision', title: 'Test: mend the tail with tape', data: { option_taken: 'Test: tape', because: 'A made-up reason.', ...governsTheWholeProject(), replaces: [] } })).record.id
  // ONE QUESTION WAITING ON THE PERSON, so the settle tier is drawn with a count of 1.
  await post('/api/records', { kind: 'proposal', title: 'Test which glue for the spar', data: { question: 'Which glue should mend the spar?', options: ['a — wood glue', 'b — epoxy'], recommendation: 'Take (b).', because: 'A made-up reason.', who_settles_it: 'the owner' } }, KEEPER)
}, 240_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.stop()
}, 120_000)

async function open(language: 'en' | 'zh', address: string, ready: string, look: 'light' | 'dark' = 'light'): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript((l) => localStorage.setItem('mole-office.preset.theme', l), look)
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=${language}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  return page
}
const text = async (page: Page, selector: string) => ((await page.locator(selector).first().innerText()) ?? '').replace(/\s+/g, ' ').trim()

it('2. ends the Decisions page\'s heads in a count with its measure word in Chinese, and in a bare number in English', async () => {
  const head = (page: Page, title: string) => page.locator('.px-panel').filter({ has: page.locator('.px-panel-title', { hasText: title }) }).locator('.px-panel-actions .dq-count').first()
  const zh = await open('zh', '/decisions', '.px-panel-actions .dq-count')
  expect.soft((await head(zh, '等你决定').innerText()).trim()).toBe('1 项')
  expect.soft((await head(zh, '你还没读的消息').innerText()).trim()).toBe('0 条')
  await zh.context().close()
  const en = await open('en', '/decisions', '.px-panel-actions .dq-count')
  expect.soft((await head(en, 'Messages you have not read').innerText()).trim()).toBe('0')
  await en.context().close()
})


it('4. draws a filled name and a grey one so they differ at a glance, each at 4.5:1 or more on the drawn ground', async () => {
  for (const look of ['light', 'dark'] as const) {
    const page = await open('en', `/r/${decisionId}`, '.px-gov-half-missing', look)
    const fields = page.locator('.px-gov-half-fields').first()
    await fields.scrollIntoViewIfNeeded()
    // THE GROUND is the colour most of the list's drawn pixels hold, so a shadow over the band is read as it is drawn.
    const png = (await fields.screenshot()).toString('base64')
    const read = await page.evaluate(async (data) => {
      const picture = new Image()
      picture.src = `data:image/png;base64,${data}`
      await picture.decode()
      const canvas = document.createElement('canvas')
      canvas.width = picture.width
      canvas.height = picture.height
      const drawing = canvas.getContext('2d')!
      drawing.drawImage(picture, 0, 0)
      const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data
      const counts = new Map<string, number>()
      for (let at = 0; at < pixels.length; at += 4) {
        const key = `${pixels[at]},${pixels[at + 1]},${pixels[at + 2]}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const ground = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0].split(',').map(Number)
      const lum = (c: number[]) => c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0)
      const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05) }
      const style = (selector: string) => {
        const one = document.querySelector(selector)!
        // A MIXED COLOUR is computed as `color(srgb 0.39 0.43 0.5)`, in parts of one, and a plain one as `rgb(74, 85, 104)`.
        const said = getComputedStyle(one).color
        const c = said.match(/[\d.]+/g)!.map(Number).map((v) => said.startsWith('color(srgb') ? v * 255 : v)
        return { ink: [c[0]!, c[1]!, c[2]!], weight: Number(getComputedStyle(one).fontWeight) }
      }
      const filled = style('.px-gov-half-field:not(.px-gov-half-missing)')
      const grey = style('.px-gov-half-missing')
      return {
        filled: ratio(filled.ink, ground), grey: ratio(grey.ink, ground), between: ratio(filled.ink, grey.ink),
        filledWeight: filled.weight, greyWeight: grey.weight, ground: ground.join(','),
      }
    }, png)
    const says = `${look}: on rgb(${read.ground}), filled ${read.filled.toFixed(2)}:1 at ${read.filledWeight}, grey ${read.grey.toFixed(2)}:1 at ${read.greyWeight}, between them ${read.between.toFixed(2)}:1`
    expect.soft(read.filled, says).toBeGreaterThanOrEqual(4.5)
    expect.soft(read.grey, says).toBeGreaterThanOrEqual(4.5)
    // AT A GLANCE: a filled name is bold and a grey one plain, and their colours differ by 2.5:1 or more. Round 34's 600
    // against 400, at 1.95:1 in light, did not differ plainly in Chinese (the review of round 34, point 3; round 35).
    expect.soft(read.filledWeight - read.greyWeight, says).toBeGreaterThanOrEqual(300)
    expect.soft(read.between, says).toBeGreaterThanOrEqual(2.5)
    await page.context().close()
  }
})
