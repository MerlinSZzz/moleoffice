// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The last content on Home can scroll above a floating lead, and the room goes with it. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { thePageAtRest, toTheEndOfThePage } from './the-page-scroller.ts'

const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const guide = 'made-up-footroom-guide'
let app: LiveApp
let key = ''
let report = ''
let probe = ''

async function post(path: string, body: unknown, headers: Record<string, string> = person): Promise<any> {
  const response = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`POST ${path}: ${String(response.status)} ${await response.text()}`)
  return response.json()
}

beforeAll(async () => {
  const built = await bundlePageCode({ stdin: { contents: `window.footroomShape = () => {
    const root = document.documentElement;
    const card = document.querySelector('.px-lead-here');
    const content = document.querySelector('.hm-page');
    const main = document.querySelector('.shell-main');
    return { cardTop: card?.getBoundingClientRect().top, contentBottom: content?.getBoundingClientRect().bottom,
      cardHeight: card?.getBoundingClientRect().height, cardBottom: card?.getBoundingClientRect().bottom,
      room: root.style.getPropertyValue('--lead-room'), band: root.getAttribute('data-lead-band'),
      foot: getComputedStyle(main).getPropertyValue('--page-end-room') };
  }`, loader: 'js' }, bundle: true, write: false, platform: 'browser' })
  probe = built.outputFiles[0]!.text
  app = await liveApp({ name: 'floating-lead-footroom', viewport: { width: 1440, height: 900 } })
  report = String((await post('/api/records', { kind: 'report', title: 'A made-up report for foot room', data: { blocks: [{ id: 'b1', type: 'text', text: 'Made-up report words.' }] } })).record.id)
  key = String((await post('/api/agents/started', { handle: guide, name: 'Made-up guide', role: 'worker', runtime: 'claude-code' })).whatToGiveIt.key)
}, 300_000)
afterAll(async () => { await app?.stop() }, 60_000)

for (const width of [1440, 660]) {
  it(`keeps the page clear and restores its foot at ${String(width)}`, async () => {
    const context = await app.browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => { localStorage.setItem('mole-office.chat.open', 'no') })
    const page = await context.newPage()
    let lead = ''
    try {
      await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator('.hm-agents').waitFor({ timeout: 30_000 })
      await page.addScriptTag({ content: probe })
      const shape = () => page.evaluate(() => (window as any).footroomShape())
      const before = await shape()
      lead = String((await post('/api/records', { kind: 'message', title: `A made-up lead at ${String(width)}`, data: { body: 'Made-up lead words.', to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'record', recordId: report, workspaceId: 'default' } } } }, { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': guide, 'x-mole-office-key': key })).record.id)
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator(`.px-lead-offer[data-lead-message="${lead}"]`).waitFor({ timeout: 30_000 })
      await page.addScriptTag({ content: probe })
      if (width <= 960) await expect.poll(async () => (await shape()).room).not.toBe('')
      await toTheEndOfThePage(page)
      await thePageAtRest(page)
      const withLead = await shape()
      expect(await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) > innerHeight || document.getElementById('main')!.scrollHeight > document.getElementById('main')!.clientHeight), 'Home is taller than its scroll box').toBe(true)
      if (width > 960) {
        expect(withLead.band).toBeNull()
        expect(withLead.contentBottom, `${String(width)}: last Home content clears the card`).toBeLessThanOrEqual(withLead.cardTop + 1)
        expect(parseFloat(withLead.room), 'the room reaches from the card top to the window foot').toBeGreaterThanOrEqual(Math.floor(withLead.cardHeight + 900 - withLead.cardBottom))
      } else {
        expect(withLead.band).toBe('yes')
        expect(parseFloat(withLead.room), 'the narrow band is counted once').toBe(Math.ceil(withLead.cardHeight))
      }
      await page.getByRole('button', { name: t('chatEnglish.lead.notNow'), exact: true }).click()
      await page.locator('.px-lead-here').waitFor({ state: 'detached', timeout: 30_000 })
      await expect.poll(async () => (await shape()).room).toBe('')
      expect((await shape()).foot).toBe(before.foot)
    } finally {
      if (lead !== '') await fetch(`${app.api}/api/messages/${lead}/mark`, { method: 'POST', headers: person, body: JSON.stringify({ mark: 'seen' }) })
      await context.close()
    }
  }, 180_000)
}
