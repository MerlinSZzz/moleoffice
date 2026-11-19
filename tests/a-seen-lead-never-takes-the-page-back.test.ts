// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEEN LEAD CANNOT TAKE A LATER PRESS BACK TO ITS REPORT.
 *
 * Four cases hold the rule. A held read is prepared in the real browser while the offer is unseen,
 * the server then marks the offer seen, and the old reply must not revive it: one case follows the
 * agent and one does not. An accepted surface lead from ai-news still opens the named report in
 * panelx, and a new offer from the followed agent still leads at once. All records belong to a
 * throwaway office.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Frame, Request } from 'playwright'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'

let app: LiveApp
let guideId = ''
let daily = ''
let second = ''
const shots = testShots('seen-lead')
const owner = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'ai-news',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const guide = { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'sample-quill' }
const events = (url: URL): boolean => url.pathname === '/api/events'
const offersRead = (url: URL): boolean => url.pathname === '/api/messages' && url.searchParams.get('leads') === '1'

async function write(headers: Record<string, string>, body: unknown): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const held = await res.json() as { record?: { id: string } }
  expect(res.status, JSON.stringify(held)).toBe(201)
  return held.record?.id ?? ''
}

async function offer(recordId: string, workspaceId = 'ai-news', headers = guide): Promise<string> {
  return write(headers, { kind: 'message', title: 'A made-up report to visit', data: {
    body: 'This is a made-up lead for the browser check.', to: [{ kind: 'person', id: THE_PERSON }],
    lead: { target: { kind: 'record', recordId, workspaceId }, place: { at: 'surface' } },
  } })
}

async function seen(id: string): Promise<void> {
  const res = await fetch(`${app.api}/api/messages/${id}/mark`, {
    method: 'POST', headers: owner, body: JSON.stringify({ mark: 'seen' }),
  })
  expect(res.status, await res.text()).toBe(200)
}

async function open(follow = true): Promise<void> {
  const res = await fetch(`${app.api}/api/messages?only=waiting-for-me`, { headers: owner })
  const waiting = await res.json() as { messages: { id: string }[] }
  expect(res.status, JSON.stringify(waiting)).toBe(200)
  for (const one of waiting.messages) await seen(one.id)
  await app.page.unrouteAll({ behavior: 'ignoreErrors' })
  await app.page.route(events, () => {})
  await app.page.addInitScript(({ key, value }) => {
    localStorage.setItem('mole-office.workspace', 'ai-news')
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem(key, value)
  }, { key: FOLLOWING_KEY, value: follow ? `agent:${guideId}` : '' })
  await app.page.goto(`${app.site}/?lang=en#/records`, { timeout: 60_000 })
  // THE OFFERS READS OF THIS MOUNT HAVE ANSWERED WHEN THIS RETURNS. Leading draws the stop card before
  // its read answers. A read still out when a case writes its offer can answer with that offer, and
  // following then takes it before the case holds its seen write. Counted from the reloaded document on.
  let reloaded = false
  let asked = 0
  const out = new Set<Request>()
  const committed = (frame: Frame): void => { if (frame === app.page.mainFrame()) reloaded = true }
  const askedFor = (request: Request): void => {
    if (!reloaded || !offersRead(new URL(request.url()))) return
    ++asked
    out.add(request)
  }
  const ended = (request: Request): void => { out.delete(request) }
  app.page.on('framenavigated', committed).on('request', askedFor).on('requestfinished', ended).on('requestfailed', ended)
  try {
    await app.page.reload({ timeout: 60_000 })
    // Test change (wave 13y round 165): the Switch is on All pages now, so the sidebar's All pages entry says the
    // sidebar is drawn.
    await app.page.locator('#shell-side .shell-all-pages').waitFor({ state: 'visible', timeout: 30_000 })
    if (follow) await app.page.locator('.px-lead-stop').waitFor({ timeout: 30_000 })
    await expect.poll(() => asked > 0 && out.size === 0,
      { timeout: 30_000, message: 'the page did not finish reading its offers after the reload' }).toBe(true)
  } finally {
    app.page.off('framenavigated', committed).off('request', askedFor).off('requestfinished', ended).off('requestfailed', ended)
  }
}

async function observe(step: string): Promise<{ hash: string; project: string | null; oldOffers: number }> {
  await app.page.waitForTimeout(1200)
  const held = await app.page.evaluate(() => ({ hash: location.hash,
    project: localStorage.getItem('mole-office.workspace'), oldOffers: document.querySelectorAll('.px-lead-offer').length }))
  console.log(step, JSON.stringify(held))
  if (process.env[TEST_SHOTS]) {
    appendFileSync(join(shots, 'observations.jsonl'), JSON.stringify({ step, ...held }) + '\n')
    await app.page.screenshot({ path: join(shots, `${step}.png`), fullPage: false })
    if (step.endsWith('return-project') || step === 'second-report' || step === 'old-read-after-project-press') {
      for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
        await app.page.setViewportSize({ width, height: 900 })
        await app.page.evaluate("import('/components/PresetBar.tsx').then(module => module.choosePreset('theme', '" + theme + "'))")
        await app.page.waitForTimeout(100)
        await app.page.screenshot({ path: join(shots, `${step}-${String(width)}-${theme}.png`), fullPage: false })
      }
      await app.page.setViewportSize({ width: 1440, height: 900 })
      await app.page.evaluate("import('/components/PresetBar.tsx').then(module => module.choosePreset('theme', 'light'))")
    }
  }
  return held
}

beforeAll(async () => {
  app = await liveApp({ name: 'seen-lead', viewport: { width: 1440, height: 900 },
    theDevServerBecause: 'the regression prepares the product shared read in the real browser while its offer is unseen' })
  app.page.setDefaultTimeout(15_000)
  for (const id of ['ai-news', 'panelx']) {
    const res = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers: { ...owner, 'x-mole-office-workspace': 'default' },
      body: JSON.stringify({ id, title: `${id} (made-up project)` }) })
    expect(res.status, await res.text()).toBe(201)
  }
  await write(owner, { kind: 'agent', title: 'Sample Quill', data: { handle: 'sample-quill', runtime: 'claude-code', state: 'active' } })
  const res = await fetch(`${app.api}/api/participants`, { headers: owner })
  const people = await res.json() as { agents: { id: string; handle: string }[] }
  guideId = people.agents.find(one => one.handle === 'sample-quill')?.id ?? ''
  expect(guideId).not.toBe('')
  for (const [where, title] of [['ai-news', "Sample Quill's daily report"], ['panelx', 'The second made-up report']]) {
    const id = await write({ ...owner, 'x-mole-office-workspace': where as string }, { kind: 'report', title,
      data: { for: 'The test reader', date: '2026-10-14', blocks: [{ id: 'sample', type: 'text', text: 'Made-up data for a browser regression.' }] } })
    if (where === 'ai-news') daily = id
    else second = id
  }
}, 300_000)

afterAll(async () => { await app?.page.unrouteAll({ behavior: 'ignoreErrors' }); await app?.stop() }, 60_000)

describe('a held unseen offer that is seen on the server', () => {
  for (const follow of [true, false]) {
    it(`${follow ? 'following' : 'not following'}: a read begun before a page press cannot revive the seen offer`, async () => {
      await open(follow)
      const id = await offer(daily)
      let release = (): void => {}
      let captured = (): void => {}
      const ready = new Promise<void>(done => { captured = done })
      const held = new Promise<void>(done => { release = done })
      let first = true
      await app.page.route(url => url.pathname === '/api/messages' && url.searchParams.get('leads') === '1', async route => {
        if (!first) return route.continue()
        first = false
        const response = await route.fetch()
        expect((await response.json() as { messages: { id: string }[] }).messages.map(one => one.id)).toContain(id)
        captured()
        await held
        await route.fulfill({ response })
      })
      try {
        await app.page.reload({ timeout: 60_000 })
        await ready
        await seen(id)
        // Test change (wave 13y round 165): the project's name, pressed here before, is on All pages now. The
        // sidebar's All pages entry is the press, and it opens a page with no record on it as the name did.
        await app.page.locator('#shell-side a.shell-all-pages').click()
        release()
        const after = await observe(`${follow ? 'following' : 'offer'}-old-read-after-page-press`)
        expect(after.hash).toBe('#/all-pages')
        expect(after.oldOffers, 'the old unread reply revived a seen offer on the new page').toBe(0)
      } finally { release() }
    }, 180_000)
  }

  it('one surface lead pressed in ai-news opens the exact second report in panelx', async () => {
    await open(false)
    const cross = await offer(second, 'panelx')
    await app.page.unroute(events)
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.locator(`[data-lead-message="${cross}"] .px-lead-go`).click()
    await app.page.waitForFunction(id => location.hash === `#/r/${id}`, second, { timeout: 30_000 })
    await expect.poll(() => app.page.locator('main.page').textContent(), { timeout: 30_000 }).toContain('The second made-up report')
    expect(await app.page.evaluate(() => localStorage.getItem('mole-office.workspace'))).toBe('panelx')
    await observe('second-report')
  }, 180_000)

  it('a new offer from the followed agent is still taken at once', async () => {
    await open(true)
    await app.page.unroute(events)
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await offer(second, 'panelx')
    await app.page.waitForFunction(id => location.hash === `#/r/${id}`, second, { timeout: 30_000 })
    expect(await app.page.evaluate(() => localStorage.getItem('mole-office.workspace'))).toBe('panelx')
    await app.page.locator('.px-lead-stop').waitFor({ timeout: 30_000 })
    await observe('new-followed-offer')
  }, 180_000)
})
