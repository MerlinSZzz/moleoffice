// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORK SWITCHES PANEL SHOWS EACH OF THE FOUR SWITCHES WITH WHO CHANGED IT, WHEN AND WHY. Wave 13q, item 17 of its
 * list. The server half, the read call and the doors' refusals, is tests/the-four-work-switches-are-office-settings.test.ts.
 *
 * What is proved, in a browser on this test's own office:
 *   1. the panel ends Work, right after the review level, with its four rows in order, the queue hold drawn as the
 *      queue-held gate's own row, and each setting's name under its row (it sat right after Gates until wave 13y
 *      round 125 gave Gates a page of its own); the read call is named in Developer mode only, because
 *      Normal mode never shows an /api/ path;
 *   2. after changes through the doors, each row shows its value, who changed it, when and why;
 *   3. a skip list is saved only with a reason, one entry on each line, and an emptied box takes the list away;
 *   4. the producer's attempt is cleared only with a reason, and a row with no attempt offers no clearing;
 *   5. checks at once is set through its own door with a reason, its box carries the bounds, and a number outside them
 *      draws the door's refusal and leaves the value in force;
 *   6. Office controls draws a line to this panel in place of each of the three new settings;
 *   7. a reading that says this caller may not change them disables every box and press;
 *   8. a failed reading says so, and Read again reads it.
 * With W13Q_WORK_SWITCHES_SHOTS set to a folder, it also photographs the rows and the Office controls line at four
 * widths in both themes.
 *
 * Every word is read through the word list, and every bound and name from the code, so none is copied here.
 *
 * MUTATIONS, after a control run, are written in the commit that proves this file.
 *
 * All values, attempts and reasons belong to this test's temporary office.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { gateNamed } from '../src/config/gates.mjs'
import { CHECKS_AT_ONCE_BOUNDS, CHECKS_AT_ONCE_BY_DEFAULT } from '../src/shared/checks-in-merges-only.ts'
import { t } from '../src/shared/i18n.ts'
import { OWN_RELEASE_SKIP_RUNS, OWN_RELEASE_SKIP_TAGS, RECEIPT_PRODUCER_PENDING, THE_WORK_SWITCHES_READ_CALL, WORK_SWITCH_SETTINGS } from '../src/shared/work-switches.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const QUEUE_HELD = gateNamed('queue-held').setting
const ROWS = ['own-release-skip', 'queue-held', 'checks-at-once', 'receipt-producer-pending'] as const
const panel = () => app.page.locator('[data-target="uiSurface/settings.workswitches"]')
const row = (id: typeof ROWS[number]) => panel().locator(`[data-work-switch="${id}"]`)
const list = (which: 'tags' | 'runs') => row('own-release-skip').locator(`[data-skip-list="${which}"]`)

interface ALastChange { at: string; by: { type: string; id: string; name: string | null }; because: string | null }
interface TheWorkSwitches {
  ownReleaseSkip: Record<'tags' | 'runs', { entries: string[]; lastChange: ALastChange | null }>
  checksAtOnce: { value: number; lastChange: ALastChange | null }
  receiptProducerPending: { attempt: string | null; since: string | null; lastChange: ALastChange | null }
}

async function open(path = '#/settings/workswitches', mode = 'normal') {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=${mode}${path}`)
  await waitForThePage(app.page, 30_000)
}
async function ready() { await panel().waitFor(); await row('receipt-producer-pending').waitFor() }
async function saveThroughTheDoor(name: string, value: string | null, because: string) {
  const response = await fetch(`${app.api}/api/office/settings`, { method: 'POST', headers, body: JSON.stringify({ changes: [{ name, value }], because }) })
  expect(response.status, await response.clone().text()).toBe(200)
}
async function setTheChecksAtOnce(checksAtOnce: number | null, because: string) {
  const response = await fetch(`${app.api}/api/office/checks-in-merges-only`, { method: 'POST', headers, body: JSON.stringify({ checksAtOnce, because }) })
  expect(response.status, await response.clone().text()).toBe(200)
}
async function theReading(): Promise<TheWorkSwitches> {
  const response = await fetch(`${app.api}${THE_WORK_SWITCHES_READ_CALL}`, { headers })
  expect(response.status, await response.clone().text()).toBe(200)
  return await response.json() as TheWorkSwitches
}
/** The sentence a row draws for a change the reading gives, in the page's words. */
function said(last: ALastChange | null): string {
  expect(last).not.toBeNull()
  return t('workSwitches.last', { who: last!.by.name ?? last!.by.id, at: last!.at, because: last!.because ?? t('gates.noReason') })
}

beforeAll(async () => {
  app = await liveApp({ name: 'work-switches-panel', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.page.addInitScript((owner) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: owner })), THE_TEST_OFFICES_OWNER.id)
}, 240_000)
afterAll(async () => { await app?.stop() })

it('1: ends Work after the review level, with the four rows in order, the queue hold as its gate row, each setting named, and the read call in Developer mode only', async () => {
  await open(); await ready()
  const work = app.page.locator('[data-category="work"]')
  const panels = await work.locator('[data-settings-panel]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-settings-panel')))
  // Criterion change, wave 13y round 125 (item 62, message 068zuX0EZMQu): Gates is a page of its own, so the
  // switches no longer follow it on Settings. They end Work, after the review level, and Gates is not in Work at all.
  expect(panels).not.toContain('settings.gates')
  expect(panels[panels.indexOf('settings.reviewlevel') + 1]).toBe('settings.workswitches')
  expect(panels.at(-1)).toBe('settings.workswitches')
  expect(await panel().locator('[data-work-switch]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-work-switch')))).toEqual([...ROWS])
  expect(await row('queue-held').locator('[data-gate="queue-held"]').count()).toBe(1)
  expect(await panel().innerText()).not.toContain('/api/')
  for (const [id, names] of [['own-release-skip', [OWN_RELEASE_SKIP_TAGS, OWN_RELEASE_SKIP_RUNS]], ['receipt-producer-pending', [RECEIPT_PRODUCER_PENDING]]] as const) {
    expect(await row(id).locator('.gates-setting').allInnerTexts(), id).toEqual([...names])
  }
  // THE QUEUE HOLD IS A GATE ROW, and a gate row names its setting in Developer mode only (wave 13y round 121).
  expect(await row('queue-held').locator('.gates-setting').allInnerTexts(), 'queue-held in Normal mode').toEqual([])
  const number = row('checks-at-once').getByLabel(t('gates.bounds', CHECKS_AT_ONCE_BOUNDS), { exact: true })
  expect(await number.getAttribute('min')).toBe(String(CHECKS_AT_ONCE_BOUNDS.fewest))
  expect(await number.getAttribute('max')).toBe(String(CHECKS_AT_ONCE_BOUNDS.most))
  expect(await number.getAttribute('step')).toBe('1')
  await open('#/settings/workswitches', 'inspect'); await ready()
  expect(await panel().innerText()).toContain(THE_WORK_SWITCHES_READ_CALL)
  expect(await row('queue-held').locator('.gates-setting').allInnerTexts(), 'queue-held').toEqual([QUEUE_HELD])
}, 90_000)

it('2: shows each value with who changed it, when and why, after changes through the doors', async () => {
  await saveThroughTheDoor(OWN_RELEASE_SKIP_TAGS, 'w13s-r38\nw13x-r14', 'Made-up tags kept by hand')
  await saveThroughTheDoor(OWN_RELEASE_SKIP_RUNS, 'lTEX3kirjfRP', 'Made-up run kept by hand')
  await saveThroughTheDoor(RECEIPT_PRODUCER_PENDING, '/made/up/producer/attempt-1', 'Made-up attempt that began')
  await setTheChecksAtOnce(3, 'Made-up three at once')
  const reading = await theReading()
  await open(); await ready()
  expect(await list('tags').getByLabel(t('workSwitches.skip.tags'), { exact: true }).inputValue()).toBe('w13s-r38\nw13x-r14')
  expect(await list('tags').innerText()).toContain(t('workSwitches.skip.count', { n: 2 }))
  expect(await list('tags').innerText()).toContain(said(reading.ownReleaseSkip.tags.lastChange))
  expect(await list('runs').getByLabel(t('workSwitches.skip.runs'), { exact: true }).inputValue()).toBe('lTEX3kirjfRP')
  expect(await list('runs').innerText()).toContain(said(reading.ownReleaseSkip.runs.lastChange))
  expect(await row('checks-at-once').getByLabel(t('gates.bounds', CHECKS_AT_ONCE_BOUNDS), { exact: true }).inputValue()).toBe('3')
  expect(await row('checks-at-once').innerText()).toContain(t('gates.inForce', { value: '3', source: t('workSwitches.from.setHere') }))
  expect(await row('checks-at-once').innerText()).toContain(said(reading.checksAtOnce.lastChange))
  const pending = reading.receiptProducerPending
  expect(await row('receipt-producer-pending').innerText()).toContain(t('workSwitches.pending.set', { attempt: '/made/up/producer/attempt-1', since: pending.since! }))
  expect(await row('receipt-producer-pending').innerText()).toContain(said(pending.lastChange))
  expect(said(reading.ownReleaseSkip.tags.lastChange)).toContain(THE_TEST_OFFICES_OWNER.name)
}, 90_000)

it('3: saves a skip list only with a reason, one entry on each line, and an emptied box takes the list away', async () => {
  await saveThroughTheDoor(OWN_RELEASE_SKIP_TAGS, null, 'Made-up clean start')
  await open(); await ready()
  const tags = list('tags')
  const save = tags.getByRole('button', { name: t('gates.save'), exact: true })
  const requests: unknown[] = []
  const listener = (request: import('playwright').Request) => {
    if (request.url().endsWith('/api/office/settings') && request.method() === 'POST') requests.push(request.postDataJSON())
  }
  app.page.on('request', listener)
  try {
    await tags.getByLabel(t('workSwitches.skip.tags'), { exact: true }).fill('w13s-r38\nw13x-r14\n')
    expect(await save.isDisabled()).toBe(true)
    await tags.getByLabel(t('gates.reason'), { exact: true }).fill('   ')
    expect(await save.isDisabled()).toBe(true)
    expect(requests).toEqual([])
    await tags.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up reason for two tags')
    await save.click()
    await expect.poll(() => tags.innerText()).toContain(t('workSwitches.skip.count', { n: 2 }))
    expect(await tags.innerText()).toContain('Made-up reason for two tags')
    expect(requests).toEqual([{ changes: [{ name: OWN_RELEASE_SKIP_TAGS, value: 'w13s-r38\nw13x-r14' }], because: 'Made-up reason for two tags' }])
    // A list the door refuses leaves the list in force, and the door's words are drawn under it.
    const before = await tags.locator('.gates-position').innerText()
    await tags.getByLabel(t('workSwitches.skip.tags'), { exact: true }).fill('w13s r38')
    await tags.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up refused list')
    const answer = app.page.waitForResponse((response) => response.url().endsWith('/api/office/settings') && response.request().method() === 'POST')
    await save.click()
    const refused = await answer
    expect(refused.status()).toBe(400)
    await expect.poll(() => tags.innerText()).toContain((await refused.json() as { error: string }).error)
    expect(await tags.locator('.gates-position').innerText()).toBe(before)
    await tags.getByLabel(t('workSwitches.skip.tags'), { exact: true }).fill('  \n')
    await tags.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up empty list')
    await save.click()
    await expect.poll(() => tags.innerText()).toContain(t('workSwitches.skip.empty'))
    expect(requests.at(-1)).toEqual({ changes: [{ name: OWN_RELEASE_SKIP_TAGS, value: null }], because: 'Made-up empty list' })
  } finally { app.page.off('request', listener) }
}, 90_000)

it('4: clears the producer\'s attempt only with a reason, and offers no clearing when no attempt waits', async () => {
  await saveThroughTheDoor(RECEIPT_PRODUCER_PENDING, '/made/up/producer/attempt-2', 'Made-up attempt that began')
  await open(); await ready()
  const pending = row('receipt-producer-pending')
  const clear = pending.getByRole('button', { name: t('workSwitches.pending.clear'), exact: true })
  expect(await clear.isDisabled()).toBe(true)
  await pending.getByLabel(t('gates.reason'), { exact: true }).fill('   ')
  expect(await clear.isDisabled()).toBe(true)
  await pending.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up result read')
  const sent = app.page.waitForRequest((request) => request.url().endsWith('/api/office/settings') && request.method() === 'POST')
  await clear.click()
  expect((await sent).postDataJSON()).toEqual({ changes: [{ name: RECEIPT_PRODUCER_PENDING, value: null }], because: 'Made-up result read' })
  await expect.poll(() => pending.innerText()).toContain(t('workSwitches.pending.none'))
  expect(await pending.innerText()).toContain('Made-up result read')
  await pending.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up reason with nothing to clear')
  expect(await clear.isDisabled()).toBe(true)
}, 90_000)

it('5: sets checks at once through its own door with a reason, puts back the default, and draws a refusal outside the bounds', async () => {
  await setTheChecksAtOnce(null, 'Made-up clean start')
  await open(); await ready()
  const checks = row('checks-at-once')
  const save = checks.getByRole('button', { name: t('gates.save'), exact: true })
  const number = checks.getByLabel(t('gates.bounds', CHECKS_AT_ONCE_BOUNDS), { exact: true })
  expect(await number.inputValue()).toBe(String(CHECKS_AT_ONCE_BY_DEFAULT))
  await number.fill('3')
  expect(await save.isDisabled()).toBe(true)
  await checks.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up reason for three')
  let sent = app.page.waitForRequest((request) => request.url().endsWith('/api/office/checks-in-merges-only') && request.method() === 'POST')
  await save.click()
  expect((await sent).postDataJSON()).toEqual({ checksAtOnce: 3, because: 'Made-up reason for three' })
  await expect.poll(() => checks.locator('.gates-position').innerText()).toBe(t('gates.inForce', { value: '3', source: t('workSwitches.from.setHere') }))
  expect(await checks.innerText()).toContain('Made-up reason for three')
  const before = await checks.locator('.gates-position').innerText()
  await number.fill(String(CHECKS_AT_ONCE_BOUNDS.most + 1))
  await checks.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up number out of bounds')
  const answer = app.page.waitForResponse((response) => response.url().endsWith('/api/office/checks-in-merges-only') && response.request().method() === 'POST')
  await save.click()
  const refused = await answer
  expect(refused.status()).toBe(400)
  await expect.poll(() => checks.innerText()).toContain((await refused.json() as { error: string }).error)
  expect(await checks.locator('.gates-position').innerText()).toBe(before)
  await checks.getByLabel(t('gates.reason'), { exact: true }).fill('Made-up return to the default')
  sent = app.page.waitForRequest((request) => request.url().endsWith('/api/office/checks-in-merges-only') && request.method() === 'POST')
  await checks.getByRole('button', { name: t('gates.putBack'), exact: true }).click()
  expect((await sent).postDataJSON()).toEqual({ checksAtOnce: null, because: 'Made-up return to the default' })
  await expect.poll(() => checks.locator('.gates-position').innerText()).toBe(t('gates.inForce', { value: String(CHECKS_AT_ONCE_BY_DEFAULT), source: t('workSwitches.from.default') }))
}, 90_000)

it('6: replaces each of the three new settings in Office controls with a line linking to Work switches', async () => {
  await open('#/settings/officecontrols', 'inspect')
  const controls = app.page.locator('[data-target="uiSurface/settings.officecontrols"]')
  for (const name of WORK_SWITCH_SETTINGS) {
    const moved = controls.locator(`[data-setting="${name}"]`)
    await moved.waitFor()
    expect(await moved.innerText()).toBe(t('workSwitches.moved'))
    expect(await moved.getByRole('link').getAttribute('href')).toBe('#/settings/workswitches')
    expect(await moved.locator('button, input, textarea, summary').count()).toBe(0)
  }
}, 60_000)

it('7: disables every box and press when the reading says this caller may not change them', async () => {
  const theGateRead = (url: URL) => url.pathname === '/api/office/gates'
  await app.page.route(theGateRead, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...await response.json(), mayChange: false, mayChangeThePersonsOwn: false } })
  })
  try {
    await open(); await ready()
    const controls = panel().locator('button, input, textarea')
    expect(await controls.count()).toBeGreaterThan(8)
    for (const control of await controls.all()) expect(await control.isDisabled()).toBe(true)
  } finally { await app.page.unroute(theGateRead) }
}, 60_000)

it('8: says when the reading failed, and Read again reads it', async () => {
  const theRead = `**${THE_WORK_SWITCHES_READ_CALL}`
  await app.page.route(theRead, async (route) => route.fulfill({ response: await route.fetch(), status: 500, json: { error: 'Made-up reading failure' } }))
  try {
    // The office's error note draws the server's own sentence for a 500 only in Developer mode, so the page opens there.
    await open('#/settings/workswitches', 'inspect'); await panel().waitFor()
    await expect.poll(() => panel().innerText()).toContain(t('workSwitches.readFailed'))
    expect(await panel().innerText()).toContain('Made-up reading failure')
    expect(await panel().locator('[data-work-switch]').count()).toBe(0)
  } finally { await app.page.unroute(theRead) }
  await panel().getByRole('button', { name: t('gates.readAgain'), exact: true }).click()
  await ready()
}, 60_000)

it('photographs the four rows and the Office controls line at four widths in both themes', async () => {
  const shots = process.env.W13Q_WORK_SWITCHES_SHOTS
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await saveThroughTheDoor(OWN_RELEASE_SKIP_TAGS, 'w13s-r38\nw13x-r14\nw13y-r7', 'Made-up tags kept by hand for these pictures')
  await saveThroughTheDoor(OWN_RELEASE_SKIP_RUNS, 'lTEX3kirjfRP', 'Made-up run kept by hand for these pictures')
  await saveThroughTheDoor(QUEUE_HELD, '1', 'Made-up hold for these pictures')
  await setTheChecksAtOnce(3, 'Made-up three at once for these pictures')
  await saveThroughTheDoor(RECEIPT_PRODUCER_PENDING, '/made/up/producer/attempt-3', 'Made-up attempt for these pictures')
  try {
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
      await app.page.setViewportSize({ width, height: 2000 })
      await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
      await open(); await ready()
      expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      for (const id of ROWS) {
        await putTheMadeUpLabelIn(app.page, 'Made-up test office — made-up values and reasons', row(id).locator('h5').first(), `the ${id} row`)
        await row(id).screenshot({ path: join(shots, `work-switches-${id}-${width}-${theme}.png`) })
      }
      await open('#/settings/officecontrols', 'inspect')
      const controls = app.page.locator('[data-target="uiSurface/settings.officecontrols"]')
      await controls.getByLabel(t('runtimeSettings.find'), { exact: true }).fill('MOLE_OFFICE_OWN_RELEASE')
      await controls.locator(`[data-setting="${OWN_RELEASE_SKIP_TAGS}"]`).waitFor()
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await putTheMadeUpLabelIn(app.page, 'Made-up test office — the Work switches link in Office controls', controls, 'the Office controls link')
      // Office controls is a page of its own since wave 13y round 125, and #/settings/officecontrols leads there.
      const outer = app.page.locator('.pfs')
      const box = await outer.boundingBox()
      if (box !== null) await app.page.evaluate((top) => window.scrollBy(0, top - 300), box.y)
      await app.page.screenshot({ path: join(shots, `office-controls-work-switches-${width}-${theme}.png`) })
    }
  } finally {
    await saveThroughTheDoor(QUEUE_HELD, null, 'Made-up end of the pictures')
  }
}, 300_000)
