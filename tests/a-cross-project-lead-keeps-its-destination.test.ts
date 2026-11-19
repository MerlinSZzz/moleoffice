// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A single cross-project press must keep its destination, including late answers for the old page.
 *
 * The case "chat checklist, delayed route" also pauses the page's dev server for six seconds just
 * after it answered, as a loaded box does. The page must still get every file it asks for.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, type LiveApp } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { passOn, theDevServerPausesAfterAnAnswer } from './a-dev-server-paused-after-an-answer.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let guideId = ''
let oldReport = ''
let destination = ''
let checklist = ''
let message = ''
let checklistMessage = ''
let activeCase = 'setup'
const proofs = testShots('cross-project-lead')
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
function trace(value: unknown): void {
  if (process.env[TEST_SHOTS]) appendFileSync(join(proofs, 'routes.jsonl'), JSON.stringify({ case: activeCase, at: new Date().toISOString(), value }) + '\n')
}
// Set by the case that pauses the page's dev server just after an answer. Why it pauses, and why
// every read here is handed on with `connection: close`: tests/a-dev-server-paused-after-an-answer.ts.
let pauseTheDevServer = false
async function write(path: string, body: unknown, project = 'default', agent = false): Promise<any> {
  const reply = await fetch(`${app.api}/api${path}`, { method: 'POST', headers: { ...headers,
    'x-mole-office-workspace': project, ...(agent ? { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'sample-guide' } : {}) }, body: JSON.stringify(body) })
  const held = await reply.json()
  expect(reply.status, JSON.stringify(held)).toBe(201)
  return held
}
beforeAll(async () => {
  app = await liveApp({ name: 'cross-project-lead', viewport: { width: 1440, height: 900 },
    theDevServerBecause: 'trace project notifications and real hash routing during a cross-project press' })
  app.page.setDefaultTimeout(20_000)
  trace({ api: app.api, site: app.site })
  await write('/workspaces', { id: 'sample-project-b', title: 'Sample project B' })
  await write('/agents/started', { handle: 'sample-guide', name: 'Sample Guide', role: 'worker' })
  const registry = await fetch(`${app.api}/api/participants`, { headers })
  guideId = (await registry.json()).agents.find((one: { handle: string }) => one.handle === 'sample-guide').id
  destination = (await write('/records', { kind: 'report', title: 'Sample project B daily report', data: {
    for: 'The test reader', date: '2026-10-15', blocks: [{ id: 'daily', type: 'text', text: 'Made-up daily report in project B.' }] } }, 'sample-project-b')).record.id
  oldReport = (await write('/records', { kind: 'report', title: 'Sample project A open report', data: {
    for: 'The test reader', date: '2026-10-15', blocks: [{ id: 'old', type: 'text', text: `Made-up report. [Read the project B report](#/report/${destination})` }] } })).record.id
  checklist = (await write('/checklists', { title: 'Sample project B checklist', items: [{ words: 'Read the sample report', links: [destination] }] }, 'sample-project-b')).checklist.id
  for (const [id, isChecklist] of [[destination, false], [checklist, true]] as const) {
    const lead = { target: isChecklist ? { kind: 'page', route: `/checklists/${id}`, workspaceId: 'sample-project-b' }
      : { kind: 'record', recordId: id, workspaceId: 'sample-project-b' }, place: { at: 'surface' } }
    const sent = (await write('/records', { kind: 'message', title: 'Sample project B lead', data: {
      body: 'Open the made-up project B destination.', to: [{ kind: 'person', id: THE_PERSON }], lead } }, 'sample-project-b', true)).record.id
    if (isChecklist) checklistMessage = sent
    else message = sent
  }
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.following', '')
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem('mole-office.preset.theme', 'light')
    const log = (kind: string, value: unknown) => console.log('CROSS_PROJECT ' + JSON.stringify({ kind, value, at: Date.now(), hash: location.hash, project: localStorage.getItem('mole-office.workspace') }))
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      original.call(this, key, value)
      if (key === 'mole-office.workspace') log('project', value)
    }
    window.addEventListener('hashchange', event => log('hashchange', { old: event.oldURL, next: event.newURL }))
    document.addEventListener('click', event => {
      const element = event.target instanceof Element ? event.target.closest('a,button') : null
      if (element) log('press', { words: element.textContent?.trim(), href: element.getAttribute('href') })
    }, true)
  })
  app.page.on('console', entry => { if (entry.text().startsWith('CROSS_PROJECT ')) trace(JSON.parse(entry.text().slice(14))) })
  app.page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) trace({ request: request.url(), method: request.method(), project: request.headers()['x-mole-office-workspace'] })
  })
  app.page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/')) trace({ response: response.url(), status: response.status(), project: response.request().headers()['x-mole-office-workspace'] })
  })
  // The project store notifies synchronously; the browser delivers hashchange in a later task.
  // Hold that task until the old page's new-project reads have answered, making the owner's
  // intermittent ordering deterministic without changing any API answer or navigation target.
  await app.page.route('**/components/router.tsx', async route => {
    if (pauseTheDevServer) {
      pauseTheDevServer = false
      await theDevServerPausesAfterAnAnswer(route, app.api, headers)
    }
    const response = await passOn(route)
    const body = (await response.text()).replace('window.addEventListener("hashchange", onChange);',
      'window.addEventListener("hashchange", () => { if (window.holdRouteForCrossProjectTest) window.releaseRouteForCrossProjectTest = onChange; else onChange(); });')
    expect(body).not.toBe(await response.text())
    await route.fulfill({ response, body })
  })
}, 300_000)
afterAll(async () => { await app?.page.unrouteAll({ behavior: 'ignoreErrors' }); await app?.stop() }, 60_000)

for (const delayed of [false, true]) for (const kind of ['chat report', 'chat checklist', 'report link'] as const) it(`${kind}${delayed ? ', delayed route' : ''}: one press from a report in A stays at its destination in B`, async () => {
  activeCase = `${kind}${delayed ? ', delayed route' : ''}`
  pauseTheDevServer = kind === 'chat checklist' && delayed
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en#/report/${oldReport}`, { timeout: 60_000 })
  await app.page.locator('main.page', { hasText: 'Sample project A open report' }).waitFor()
  if (kind === 'report link') {
    await app.page.locator(`main.page a[href="#/report/${destination}"]`).click()
  } else {
    await openTheChatBeside(app.page)
    if (await app.page.locator('.px-chat-back').count()) await app.page.locator('.px-chat-back').click()
    await app.page.locator(`.px-chat-contact[data-contact="agent:${guideId}"]`).click()
    await app.page.evaluate(value => { (window as any).holdRouteForCrossProjectTest = value }, delayed)
    await app.page.locator(`.px-chat li[data-target*="${kind === 'chat checklist' ? checklistMessage : message}"] .px-chat-lead-go`).click()
  }
  await app.page.waitForTimeout(500)
  await app.page.evaluate('window.holdRouteForCrossProjectTest = false; window.releaseRouteForCrossProjectTest?.()')
  // Let every old-page 404 and automatic wrong-project recovery settle before checking the page.
  await app.page.waitForTimeout(2500)
  const observed = await app.page.evaluate(() => ({ hash: location.hash, project: localStorage.getItem('mole-office.workspace') }))
  trace({ oldReport, destination, checklist, observed })
  expect(observed.project, 'the old report reclaimed its project after the destination press').toBe('sample-project-b')
  const addresses = kind === 'chat checklist' ? [`#/checklists/${checklist}`]
    : kind === 'report link' ? [`#/r/${destination}`, `#/report/${destination}`] : [`#/r/${destination}`]
  expect(addresses, 'the first press lost its destination').toContain(observed.hash)
  expect(await app.page.locator('main.page').textContent()).toContain(kind === 'chat checklist' ? 'Sample project B checklist' : 'Sample project B daily report')
}, 90_000)
