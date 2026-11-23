// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE PERSISTENT PRESSES ON REAL PAGES SAY HOW THEIR ANSWER ENDED.
 *
 * The shared button flashes its whole frame only when a caller proves the press succeeded, fades when the answer
 * failed, and ends plainly when nobody proved either. These are the three callers of audit report XIHE6Qc5EGNd that
 * are drawn on a page at 1adcfbcb2:
 *
 *   1. `MarkRead` on a report's own page ("I have read this"), where it is drawn since the reports left Home. Its
 *      success replaces the button with a sentence, so the press unmounts and only a refusal can show. The refusal fades with no flash, and the line that already said it failed stays.
 *   2. `LookForRuns` on Agent runs ("Look for runs on this computer"). A resolved reply proves success only when the
 *      sweep says nothing was left unread and no observed state was unstorable; a reply that says either happened
 *      ends plainly. A rejected reply is a failure. A `where` row marked "not filed" is a fact about a folder, not a
 *      failure, so a reply carrying one still proves the success.
 *   3. `InstallHarnesses` on Terminal management ("Install the ticked tools"). A reply that opens a terminal is a
 *      success, and the press is replaced by the terminal, so its light is cut. A readiness checklist means the press
 *      is waiting, not refused, and ends plainly. Any other refusal fades and its own line is drawn.
 *
 * EACH CASE HOLDS THE SERVER'S ANSWER, watches the press's light while it is in flight, then answers by `page.route`
 * and reads how the light ended. `roundRect` is the whole-frame flash; `animate` is the fade, whose duration names the
 * token. The two dead call sites the audit also listed (HomePage's SinceYouLooked and ModuleView's LinksPanel) are not
 * mounted by any page, so no press there is reachable and nothing here mounts one by hand.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { HEADERS_A_PAGE_MAY_READ } from '../src/config/what-a-page-may-read.mjs'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { t } from '../src/shared/i18n.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON_HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
/** Which world the test office says answered, copied onto every reply this file makes up. */
let worldAnswered = ''
/**
 * The reply headers a page is allowed to read: the office's own list, joined as the office joins it for a page it
 * takes. A reply to a request with no Origin carries no CORS headers, so the test process's own health read has none
 * to copy.
 */
const exposedHeaders = HEADERS_A_PAGE_MAY_READ.join(', ')

beforeAll(async () => {
  app = await liveApp({ name: 'page-button-outcomes', viewport: { width: 1440, height: 900 } })
  const health = await fetch(`${app.api}/api/health`)
  worldAnswered = health.headers.get(WORLD_HEADER) ?? ''
  if (worldAnswered === '') throw new Error('the test office did not say which world answered GET /api/health')
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

async function aPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  return { page, close: () => context.close() }
}

/** Wait until the press's light is drawn, then note any whole-frame flash and the duration of any fade. */
async function watchTheLight(page: Page): Promise<void> {
  const light = page.locator('canvas[data-wait-light]')
  await expect.poll(() => light.count(), { timeout: 10_000, message: 'the press draws its waiting light' }).toBe(1)
  await light.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!
    context.roundRect = new Proxy(context.roundRect, { apply(target, thisArg, args) { document.documentElement.dataset.testFlash = 'yes'; return Reflect.apply(target, thisArg, args) } })
    const animate = element.animate.bind(element)
    element.animate = (frames, options) => { const fade = animate(frames, options); document.documentElement.dataset.testFade = String(fade.effect?.getTiming().duration); return fade }
  })
}

/** Forget the previous press's marks, so a case reads only its own light. */
async function forgetTheLastLight(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete document.documentElement.dataset.testFlash
    delete document.documentElement.dataset.testFade
  })
}

/** How the light ended: whether the whole frame was lit, the fade's duration if it faded, and whether it has gone. */
async function howTheLightEnded(page: Page): Promise<{ flash: string | null; fade: string | null }> {
  const html = page.locator('html')
  return { flash: await html.getAttribute('data-test-flash'), fade: await html.getAttribute('data-test-fade') }
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return String(Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000))
  }, name)
}

async function theLightHasGone(page: Page): Promise<void> {
  await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000, message: 'the light has gone' }).toBe(0)
}

/**
 * THE CORS HEADERS A REPLY OWES A PAGE ON ANOTHER LOOPBACK PORT. The page is served on the web port and calls the API
 * on its own port; without these the browser refuses an intercepted answer and the component sees a network error
 * instead of the reply this case is about.
 */
function theHeadersThePageMayRead(): Record<string, string> {
  return {
    'access-control-allow-origin': app.site,
    vary: 'Origin',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': exposedHeaders,
    [WORLD_HEADER]: worldAnswered,
  }
}

it('MarkRead on a report\'s page fades after a refused "I have read this", with no flash, and keeps its failure line', async () => {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: PERSON_HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'The mast moved, not the calibration',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-11-09',
        blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text: 'The mount holds calibration; the mast moved.' }],
      },
    }),
  })
  if (!made.ok) throw new Error(`seeding a report answered ${String(made.status)}: ${await made.text()}`)
  const report = ((await made.json()) as { record: { id: string } }).record

  const { page, close } = await aPage()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let held = false
  await page.route((url) => url.pathname === `/api/records/${report.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    held = true
    await gate
    await route.fulfill({ status: 500, headers: theHeadersThePageMayRead(), contentType: 'application/json', body: JSON.stringify({ error: 'The reading point could not be stored in this test.' }) })
  })
  try {
    await page.goto(`${app.site}/#/r/${report.id}`)
    await waitForThePage(page)
    const press = page.locator('.att-rep-press .px-btn')
    await press.waitFor({ timeout: 30_000 })
    expect(await press.innerText()).toContain(t('home.iHaveRead'))
    await press.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await page.locator('.att-rep-failed').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused reading point is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await page.locator('.att-rep-failed').innerText()).toBe(t('home.reportReadFailed'))
    expect(await press.isVisible(), 'the press stays so it can be tried again').toBe(true)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 120_000)

/** A discovery answer whose four fields the page reads, with the cases saying what is not whole. */
function aSweepAnswer(report: {
  unreadable?: { path: string; reason: string }[]
  stateNotStorable?: number
  where?: { conversation: string; directory: string | null; action: 'filed' | 'observed' | 'not filed'; project: string | null; because: string }[]
}): { status: number; body: unknown } {
  return {
    status: 200,
    body: {
      report: {
        discovered: 2,
        created: 1,
        adopted: 0,
        updated: 0,
        unchanged: 1,
        stampOnly: 1,
        stateNotStorable: report.stateNotStorable ?? 0,
        unreadable: report.unreadable ?? [],
        notes: [],
        dryRun: false,
        where: report.where ?? [
          { conversation: 'claude-code:fixture-a', directory: '/srv/mole-office-fixtures/a', action: 'filed', project: 'default', because: 'The project holds this folder.' },
          { conversation: 'codex:fixture-b', directory: '/srv/mole-office-fixtures/b', action: 'observed', project: 'default', because: 'It already had a record here.' },
        ],
      },
      changeLog: { scanned: 0, alreadyRecordIds: 0, alreadyNamed: 0, migrated: [], dangling: [], namedElsewhere: [], rowsRepointed: 0, applied: true, note: 'Nothing in this test named a session.' },
      note: 'A made-up sweep answer for a test office.',
    },
  }
}

it('LookForRuns flashes only for a whole sweep, ends plainly for a partial one, and fades after a refusal', async () => {
  const { page, close } = await aPage()
  let answer: { status: number; body: unknown } = aSweepAnswer({})
  let release: () => void = () => {}
  let held = false
  await page.route((url) => url.pathname === '/api/sessions/discover', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    held = true
    await new Promise<void>((resolve) => { release = resolve })
    const thisAnswer = answer
    await route.fulfill({ status: thisAnswer.status, headers: theHeadersThePageMayRead(), contentType: 'application/json', body: JSON.stringify(thisAnswer.body) })
  })
  const press = page.locator('.sx-look .px-btn')
  try {
    await page.goto(`${app.site}/#/sessions`)
    await waitForThePage(page)
    await press.waitFor({ timeout: 30_000 })

    // A WHOLE SWEEP, even with one conversation filed nowhere: the folder is a fact about it, not a failure.
    await forgetTheLastLight(page)
    answer = aSweepAnswer({
      where: [
        { conversation: 'claude-code:fixture-a', directory: '/srv/mole-office-fixtures/a', action: 'filed', project: 'default', because: 'The project holds this folder.' },
        { conversation: 'kimi:fixture-c', directory: '/srv/mole-office-fixtures/nowhere', action: 'not filed', project: null, because: 'No single project holds this folder.' },
      ],
    })
    held = false
    await press.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await page.locator('.sx-look-did').waitFor({ timeout: 30_000 })
    await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(await token(page, '--motion-settle'))
    expect((await howTheLightEnded(page)).flash, 'a whole sweep lights the whole frame').toBe('yes')
    expect(await page.locator('.sx-look-did').innerText()).toContain(t('g6a.sessions.notFiledCount', { n: 1 }))

    // A PLACE THE SWEEP COULD NOT READ: part of it was not done, so the press proves nothing.
    await forgetTheLastLight(page)
    answer = aSweepAnswer({ unreadable: [{ path: '/srv/mole-office-fixtures/locked', reason: 'EACCES' }] })
    held = false
    await press.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a sweep with an unreadable place is not drawn as a success').toEqual({ flash: null, fade: null })
    expect(await page.locator('.sx-look-did').innerText()).toContain(t('g6a.sessions.discoveryIncomplete', { n: 1 }))

    // AN OBSERVED STATE THE RECORD CANNOT HOLD: the same partial answer, the same plain end.
    await forgetTheLastLight(page)
    answer = aSweepAnswer({ stateNotStorable: 1 })
    held = false
    await press.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a sweep that could not store a state proves no success').toEqual({ flash: null, fade: null })

    // A REJECTED SWEEP: a failure, and its own line says so.
    await forgetTheLastLight(page)
    answer = { status: 500, body: { error: 'The sweep could not be run in this test.' } }
    held = false
    await press.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await page.locator('.sx-look .px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused sweep is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await page.locator('.sx-look .px-error').innerText()).toContain(t('g6a.sessions.notFiled'))
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

const A_LISTED_TOOL = {
  id: 'claude-code',
  name: 'Claude Code',
  program: 'claude',
  install: { command: 'curl -fsSL https://claude.ai/install.sh | bash', source: 'https://claude.ai/install', read: '2026-11-09' },
  noInstall: null,
}
const A_READ_TOOL = {
  ...A_LISTED_TOOL,
  installed: { path: '/srv/mole-office-fixtures/bin/claude', version: '2.1.200 (Claude Code)', versionWasRead: true },
  newest: { read: true, version: '2.1.289', from: 'https://claude.ai/install', readAt: '2026-11-09 12:00:00' },
  newer: { answer: 'no' },
  beingReadAgain: { installed: null, newest: null },
}
const A_TERMINAL = {
  id: 'fixture-installer',
  who: null,
  agent: null,
  project: 'default',
  command: '/bin/sh',
  args: [],
  folder: '/srv/mole-office-fixtures/home',
  envNames: [],
  state: 'running',
  pid: 4242,
  cols: 100,
  rows: 30,
  openedAt: '2026-11-09 12:00:00',
  endedAt: null,
  exit: null,
  keeping: false,
}
const A_CHECKLIST = {
  id: 'fixture-checklist',
  workspaceId: 'default',
  operation: 'harnesses.install',
  inputs: { harnesses: ['claude-code'] },
  onWhat: 'fixture-on-what',
  shows: 'Install Claude Code, which every agent that runs on it uses.',
  level: 'everyone',
  signers: [
    { kind: 'agent', id: 'fixture-secretary', why: 'a-secretary', name: 'fixture-secretary', signedAt: null },
    { kind: 'person', id: THE_TEST_OFFICES_OWNER.id, why: 'the-person', name: 'the person', signedAt: '2026-11-09 12:00:00' },
  ],
  notSigned: [{ kind: 'agent', id: 'fixture-secretary', why: 'a-secretary', name: 'fixture-secretary', signedAt: null }],
  raisedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id, name: 'the person' },
  because: null,
  state: 'waiting',
  raisedAt: '2026-11-09 12:00:00',
  endsAt: '2026-11-09 12:30:00',
  closedAt: null,
  closedBy: null,
  outcome: null,
}

it('Install opens a terminal on success, ends plainly on a checklist, and fades after a refusal', async () => {
  const { page, close } = await aPage()
  let answer: { status: number; body: unknown } = { status: 201, body: { terminal: A_TERMINAL, installing: ['claude-code'] } }
  let release: () => void = () => {}
  let held = false
  await page.route((url) => url.pathname === '/api/harnesses', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const part = new URL(route.request().url()).searchParams.has('part')
    const harnesses = part ? [A_LISTED_TOOL] : [A_READ_TOOL]
    await route.fulfill({ status: 200, headers: theHeadersThePageMayRead(), contentType: 'application/json', body: JSON.stringify({ harnesses }) })
  })
  await page.route((url) => url.pathname === '/api/readiness/fixture-checklist', async (route) => {
    await route.fulfill({ status: 200, headers: theHeadersThePageMayRead(), contentType: 'application/json', body: JSON.stringify({ checklist: A_CHECKLIST }) })
  })
  await page.route((url) => url.pathname === '/api/harnesses/install', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    held = true
    await new Promise<void>((resolve) => { release = resolve })
    const thisAnswer = answer
    await route.fulfill({ status: thisAnswer.status, headers: theHeadersThePageMayRead(), contentType: 'application/json', body: JSON.stringify(thisAnswer.body) })
  })
  const install = page.getByRole('button', { name: t('harnesses.install') })
  const choose = page.getByRole('button', { name: t('harnesses.choose') })
  const arrange = async (): Promise<void> => {
    await choose.click()
    await page.getByLabel(t('harnesses.tick', { name: 'Claude Code' })).check()
  }
  try {
    await page.goto(`${app.site}/#/terminals`)
    await waitForThePage(page)
    await page.locator('.ih-row').first().waitFor({ timeout: 30_000 })

    // A REPLY THAT OPENS A TERMINAL: a success, and the press is replaced by the terminal it opened.
    await forgetTheLastLight(page)
    await arrange()
    held = false
    await install.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await page.locator('.ih-installer').waitFor({ timeout: 60_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'the press that opened the terminal has gone, so its light is cut').toEqual({ flash: null, fade: null })

    // A READINESS CHECKLIST: the press is waiting, not done and not refused, so it ends plainly.
    await forgetTheLastLight(page)
    answer = { status: 409, body: { error: 'This waits for signatures before it runs. The readiness checklist is fixture-checklist.', code: 'readinessWaits', values: { checklist: 'fixture-checklist' } } }
    await arrange()
    held = false
    await install.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await page.locator('.ih-waits').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a press waiting for signatures is not drawn as a success').toEqual({ flash: null, fade: null })
    expect(await page.locator('.ih-waits').innerText()).toContain(t('harnesses.state.waitingForSignatures'))

    // ANY OTHER REFUSAL: a failure, fading with no flash, and its own line is drawn.
    await forgetTheLastLight(page)
    answer = { status: 500, body: { error: 'The tools could not be installed in this test.' } }
    await arrange()
    held = false
    await install.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await page.locator('.ih .px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused install is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await page.locator('.ih .px-error').innerText()).toContain(t('harnesses.installRefused'))
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)
