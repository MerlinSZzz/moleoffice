// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The archive is readable on the run page at 1440 and 390 in the light theme. All content is synthetic. */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let run: string
let sentence: string
const shots = process.env['CLOSED_UNCHECKED_SHOTS']
const reason = 'Synthetic review fixture: this check was asked while the message worker was off and nobody will run it.'
beforeAll(async () => {
  app = await liveApp({ name: 'closed-unchecked-page', viewport: { width: 1440, height: 900 } })
  const keys = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }
  const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': keys.person }
  const post = async (path: string, body: unknown, headers = person) => {
    const response = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const answer = await response.json()
    expect(response.status, `${path}: ${String(answer.error ?? '')}`).toBe(201)
    return answer
  }
  const registered = await post('/api/agents/started', { handle: 'archive-secretary', name: 'Synthetic archive secretary', role: 'secretary' })
  // The registration's key belongs only to this test office.
  const key = registered.whatToGiveIt.key as string
  expect(typeof key).toBe('string')
  const secretary = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'archive-secretary', 'x-mole-office-key': key }
  const created = await post('/api/records', { kind: 'session', title: 'Synthetic closed-unchecked run', data: {
    state: 'finished', doing: 'Synthetic review fixture for the closed-unchecked archive.',
    theCheck: { askedAt: '2026-09-26 09:00:00', checkout: {}, says: 'Synthetic check never started.' },
  } })
  run = created.record.id
  const closed = await post(`/api/checks/${run}/closed-unchecked`, { because: reason }, secretary)
  sentence = closed.says
  if (shots !== undefined) mkdirSync(shots, { recursive: true })
}, 120_000)
afterAll(async () => { await app?.stop() })
it('draws the whole closure sentence and no outstanding check at every required size and theme', async () => {
  for (const theme of ['light'] as const) for (const width of [1440, 390]) {
    await app.page.setViewportSize({ width, height: 900 })
    await app.page.emulateMedia({ colorScheme: theme })
    await app.page.goto(`${app.site}/#/session/${run}`, { waitUntil: 'domcontentloaded' })
    await app.page.reload()
    await waitForThePage(app.page)
    const panel = app.page.locator('.chk')
    await app.page.locator('.sp-facts').first().waitFor({ state: 'visible' })
    await panel.waitFor({ state: 'visible' })
    expect(await panel.innerText()).toContain(sentence)
    expect(sentence).toMatch(/^Closed unchecked by archive-secretary at \d{4}-\d\d-\d\d \d\d:\d\d:\d\d: /)
    expect(await panel.locator('[data-standing="closed unchecked"]').innerText()).toBe('Closed unchecked')
    expect(await panel.innerText()).toContain('Nothing is still owed for this run.')
    expect(await panel.locator('.chk-waiting, button').count()).toBe(0)
    expect(await app.page.locator('body').innerText()).not.toContain('Nobody recorded how this run ended.')
    expect(await app.page.locator('body').innerText()).not.toContain('This run has not ended.')
    const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${theme} ${width}`).toBeLessThanOrEqual(0)
    if (shots !== undefined) await app.page.screenshot({ path: join(shots, `run-${width}-${theme}.png`), fullPage: true })
  }
}, 120_000)
