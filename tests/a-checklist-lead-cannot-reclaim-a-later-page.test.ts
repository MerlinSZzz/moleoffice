// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKLIST PRESS OUTRANKS AN EARLIER UNTAKEN OFFER FROM THE FOLLOWED AGENT, AND THE CHECKLIST'S
 * LEAD OUTRANKS A LATER PAGE IN ANOTHER PROJECT.
 *
 * Two cases hold the rule that a checklist lead never takes back a later page:
 *   - same-project, direct, with an untaken manual offer: after the checklist manual is pressed,
 *     the daily report stays, the earlier offer is still waiting, and pressing it opens the manual.
 *   - cross-project, direct: the checklist's manual is pressed in the default project, then the
 *     chat lead opens the daily report in sample-lab and the project follows it.
 * All records and servers here are made up and isolated.
 *
 * The direct case with an untaken offer also pauses the page's dev server for six seconds just
 * after it answered, as a loaded box does. The page must still get every file it asks for.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { passOn, theDevServerPausesAfterAnAnswer } from './a-dev-server-paused-after-an-answer.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let guideId = ''
const shots = testShots('checklist-lead')
function trace(value: unknown): void {
  if (process.env[TEST_SHOTS]) appendFileSync(join(shots, 'routes.jsonl'), JSON.stringify(value) + '\n')
}
const owner = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
// Set by the case that pauses the page's dev server just after an answer. Why it pauses, and why
// every read here is handed on with `connection: close`: tests/a-dev-server-paused-after-an-answer.ts.
let pauseTheDevServer = false
async function send(path: string, body: unknown, project = 'default', agent = false): Promise<any> {
  const reply = await fetch(`${app.api}/api${path}`, { method: 'POST', headers: { ...owner,
    'x-mole-office-workspace': project, ...(agent ? { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'sample-clerk' } : {}) }, body: JSON.stringify(body) })
  const held = await reply.json()
  expect(reply.status, JSON.stringify(held)).toBe(201)
  return held
}
beforeAll(async () => {
  app = await liveApp({ name: 'checklist-lead-repro', viewport: { width: 1440, height: 900 },
    theDevServerBecause: 'capture the actual navigate caller stacks without changing product source' })
  app.page.setDefaultTimeout(15_000)
  await send('/workspaces', { id: 'sample-lab', title: 'Sample robotics lab' })
  await send('/agents/started', { handle: 'sample-clerk', name: 'Sample Clerk', role: 'worker' })
  const registry = await fetch(`${app.api}/api/participants`, { headers: owner })
  guideId = (await registry.json()).agents.find((one: { handle: string }) => one.handle === 'sample-clerk').id
  expect(guideId).not.toBe('')
  await app.page.addInitScript(({ key, value }) => {
    const record = (kind: string, target: string, stack = '') => {
      console.log('ROUTE_TRACE ' + JSON.stringify({ kind, target, at: performance.now(), stack }))
    }
    ;(window as any).routeTrace = record
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history)
      history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
        record(method, String(url), new Error().stack)
        return original(data, unused, url)
      }
    }
    window.addEventListener('hashchange', event => record('hashchange', event.newURL))
    document.addEventListener('click', event => {
      const element = event.target instanceof Element ? event.target.closest('a,button,summary') : null
      if (element) record('press', `${element.textContent?.trim()} ${element.getAttribute('href') ?? ''}`)
    }, true)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem('mole-office.chat.with', '')
    localStorage.setItem(key, value)
  }, { key: FOLLOWING_KEY, value: `agent:${guideId}` })
  app.page.on('console', message => {
    if (message.text().startsWith('ROUTE_TRACE ')) trace(JSON.parse(message.text().slice(12)))
  })
  await app.page.route('**/components/router.tsx', async route => {
    if (pauseTheDevServer) {
      pauseTheDevServer = false
      await theDevServerPausesAfterAnAnswer(route, app.api, owner)
    }
    const response = await passOn(route)
    const body = (await response.text()).replace('window.location.hash = path;',
      'window.routeTrace("navigate", path, new Error().stack); window.location.hash = path;')
    await route.fulfill({ response, body })
  })
}, 300_000)
afterAll(async () => { await app?.page.unrouteAll({ behavior: 'ignoreErrors' }); await app?.stop() }, 60_000)

const cases = [
  { cross: true, mode: 'direct', pending: false },
  { cross: false, mode: 'direct', pending: true },
]
for (const { cross, mode, pending } of cases) it(`${cross ? 'cross-project' : 'same-project'} ${mode}${pending ? ' with an untaken manual offer' : ''}: the report stays after the checklist manual`, async () => {
  trace({ case: { cross, mode, pending }, stage: 'start' })
  pauseTheDevServer = pending
  await app.page.goto('about:blank')
  let release = (): void => {}
  const held = new Promise<void>(done => { release = done })
  let heldReads = 0
  const offersRead = (url: URL) => url.pathname === '/api/messages' && url.searchParams.get('leads') === '1'
  if (pending) await app.page.route(offersRead, async route => {
    const response = await passOn(route)
    ++heldReads
    trace({ stage: 'held-offers', response: await response.json() })
    await held
    await route.fulfill({ response }).catch(() => {})
  })
  try {
  const manualProject = 'default'
  const dailyProject = cross ? 'sample-lab' : 'default'
  const manual = (await send('/records', { kind: 'report', title: 'Sample robotics lab manual', data: {
    for: 'The test reader', date: '2026-10-15', blocks: [{ id: 'manual', type: 'text', text: 'Made-up lab manual.' }] } }, manualProject)).record.id
  const daily = (await send('/records', { kind: 'report', title: "Sample Clerk's daily report", data: {
    for: 'The test reader', date: '2026-10-15', blocks: [{ id: 'daily', type: 'text', text: 'Made-up daily report.' }] } }, dailyProject)).record.id
  const checklist = (await send('/checklists', { title: 'Sample robotics checklist', items: [{ words: 'Read the lab manual', links: pending ? [manual, daily] : [manual] }] })).checklist.id
  const lead = (await send('/records', { kind: 'message', title: 'Sample Clerk daily report', data: {
    body: 'Here is the made-up daily report.', to: [{ kind: 'person', id: THE_PERSON }],
    lead: { target: { kind: 'record', recordId: daily, workspaceId: dailyProject }, place: { at: 'surface' } } } }, 'default', true)).record.id
  // A previously read daily message retains its chat lead. Following must not consume the daily
  // offer before the owner's explicit press. The additional offer is unseen on the real server.
  const mark = await fetch(`${app.api}/api/messages/${lead}/mark`, { method: 'POST', headers: owner, body: JSON.stringify({ mark: 'seen' }) })
  expect(mark.status).toBe(200)
  let manualOffer = ''
  if (pending) manualOffer = (await send('/records', { kind: 'message', title: 'Sample manual offer still waiting', data: {
    body: 'A made-up earlier offer to the manual, not yet taken.', to: [{ kind: 'person', id: THE_PERSON }],
    lead: { target: { kind: 'record', recordId: manual, workspaceId: manualProject } } } }, 'default', true)).record.id
  await app.page.goto(`${app.site}/?lang=en#/checklists/${checklist}`, { timeout: 60_000 })
  if (!pending) await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-lead-stop').waitFor({ timeout: 30_000 })
  expect(await app.page.evaluate(key => localStorage.getItem(key), FOLLOWING_KEY)).toBe(`agent:${guideId}`)
  if (pending) await expect.poll(() => heldReads).toBeGreaterThan(0)
  const row = app.page.locator('main.page .ckp-item', { hasText: 'Read the lab manual' })
  await row.locator('summary').click()
  await row.locator(`.ckp-link a[href="#/report/${manual}"]`).click()
  await expect.poll(() => app.page.locator('main.page').textContent(), { timeout: 30_000 }).toContain('Sample robotics lab manual')
  if (pending) {
    const stillWaiting = await fetch(`${app.api}/api/messages?only=waiting-for-me&leads=1`, { headers: owner })
    expect((await stillWaiting.json()).messages.map((one: { id: string }) => one.id), 'the earlier offer was read before the report press').toContain(manualOffer)
    if (!await app.page.locator('.ckw-panel').isVisible()) await app.page.locator('.ckw-press').click()
    const pendingGroup = app.page.locator('.ckw-panel .ckw-group').filter({ has: app.page.locator(`a[href="#/checklists/${checklist}"]`) })
    const pendingRow = pendingGroup.locator('.ckp-item', { hasText: 'Read the lab manual' })
    if (!await pendingRow.locator('.ckp-link').first().isVisible()) await pendingRow.locator('summary').click()
    await pendingRow.locator(`a[href="#/report/${daily}"]`).click()
  } else {
    await openTheChat(app.page)
    if (await app.page.locator('.px-chat-back').count()) await app.page.locator('.px-chat-back').click()
    await app.page.locator(`.px-chat-contact[data-contact="agent:${guideId}"]`).click()
    await app.page.locator(`.px-chat li[data-target*="${lead}"] .px-chat-lead-go`).click()
  }
  await expect.poll(() => app.page.locator('main.page').textContent(), { timeout: 30_000 }).toContain("Sample Clerk's daily report")
  release()
  await app.page.waitForTimeout(2500)
  const observed = await app.page.evaluate(() => ({ hash: location.hash, project: localStorage.getItem('mole-office.workspace') }))
  trace({ cross, mode, pending, manualOffer, heldReads, manual, daily, observed })
  expect(observed.hash).toBe(`#/${pending ? 'report' : 'r'}/${daily}`)
  expect(observed.project).toBe(dailyProject)
  if (process.env[TEST_SHOTS] && pending) {
    await app.page.locator('.ckw-close').click()
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
      await app.page.setViewportSize({ width, height: 900 })
      await app.page.evaluate("import('/components/PresetBar.tsx').then(module => module.choosePreset('theme', '" + theme + "'))")
      await app.page.waitForTimeout(100)
      await app.page.screenshot({ path: join(shots, `${String(width)}-${theme}.png`) })
    }
    await app.page.setViewportSize({ width: 1440, height: 900 })
  }
  if (pending) {
    const waiting = await fetch(`${app.api}/api/messages?only=waiting-for-me&leads=1`, { headers: owner })
    expect((await waiting.json()).messages.map((one: { id: string }) => one.id), 'choosing another page must not silently read the older offer').toContain(manualOffer)
    await app.page.locator(`[data-lead-message="${manualOffer}"] .px-lead-go`).click()
    await app.page.waitForFunction(id => location.hash === `#/r/${id}`, manual, { timeout: 15_000 })
  }
  } finally {
    release()
    await app.page.unroute(offersRead)
    const waiting = await fetch(`${app.api}/api/messages?only=waiting-for-me`, { headers: owner })
    for (const one of (await waiting.json()).messages) await fetch(`${app.api}/api/messages/${one.id}/mark`, { method: 'POST', headers: owner, body: JSON.stringify({ mark: 'seen' }) })
  }
}, 180_000)
