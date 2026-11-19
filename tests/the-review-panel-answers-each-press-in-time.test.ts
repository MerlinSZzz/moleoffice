// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PRESS OF THE REVIEW PANEL ANSWERS WITHIN 0.3 S ON A QUIET MACHINE, IN THE TIMING GROUP.
 *
 * Wave 13r round 15, our fifth point. The office is seeded by ./an-office-the-size-of-the-real-one.ts: about 400 agents and the owner’s
 * record counts. Each press is timed in the browser, from the press until the panel has drawn its answer, the way round
 * 13 measured (`measure` in the round 13 proposal test, kept on that round's own branch and not on this one). Every door a press asked is
 * written down beside its time.
 *
 * The presses follow the tray at the foot of the window (wave 13y round 146, item 73a): open the panel, open this
 * page's review, Show comments, Change, a contact, and Send review. The recipient line is in the list that Show
 * comments opens, and Change and Send review are on the row, because the panel moved into the tray. One whole review is
 * run first to warm the server, then three are timed. The measured numbers go to PANEL_TIMES_OUT when it is set; round
 * 15 wrote them to r15-measure-after.json.
 *
 * Three costs were taken out to bring these under the limit: opening read every record a review is of one at a time,
 * the contact list read everybody's presence every time it opened, and a contact press read the list of collecting
 * reviews three times.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, theBuiltPage, waitForThePage, type LiveApp } from './helpers.ts'
import { reviewPanelSetup } from './review-panel-setup.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'
import { anOfficeTheSizeOfTheirs } from './an-office-the-size-of-the-real-one.ts'

const KEEP = process.env['SIZE_OF_HIS_KEEP']
const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''
const LIMIT_MS = 300
const FIXTURE_SETUP_MS = 60_000
const STARTUP_WAIT_MS = 30_000
const words = createI18n('en').t
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let coldFixtureMs: number
let app: LiveApp
let office: { file: string; remove: () => void }

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(STARTUP_WAIT_MS) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A page with a review collecting on it, holding one comment. Nobody is recorded as its writer, so the chip asks. */
async function aReview(title: string): Promise<{ about: string; review: string }> {
  const about = (await post<{ record: { id: string } }>('/api/records', { kind: 'note', title, data: { body: 'Two firings a week. The left shelf takes the big pots.' } })).record.id
  const target = { target: { kind: 'record', recordId: about, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = (await post<{ review: { id: string } }>('/api/reviews', { entry: target })).review.id
  await post('/api/records', { kind: 'message', title: 'About the shelves', data: { body: 'The left shelf is cracked.', target } })
  return { about, review }
}

async function theSwitch(want: boolean): Promise<void> {
  const switched = app.page.locator('.px-review-switch')
  if (((await switched.getAttribute('aria-pressed')) === 'true') === want) return
  const menu = app.page.locator('.shell-menu')
  if (await menu.isVisible()) await menu.click()
  await switched.click()
}

/** One door a press asked: `at` is when it was asked, in ms after the press, and `ms` how long it took. */
interface Door { method: string; path: string; status: number; bytes: number; at: number; ms: number }
interface Press { press: string; ms: number; doors: Door[] }

async function timed(press: string, act: () => Promise<void>, answered: () => Promise<void>): Promise<Press> {
  const doors: Promise<Door>[] = []
  let pressed = Date.now()
  const started = new Map<unknown, number>()
  const onRequest = (r: { url(): string }) => { if (new URL(r.url()).pathname.startsWith('/api/')) started.set(r, Date.now()) }
  const onResponse = (r: { url(): string; status(): number; request(): unknown; body(): Promise<Buffer> }) => {
    const u = new URL(r.url())
    if (!u.pathname.startsWith('/api/')) return
    const t0 = started.get(r.request()) ?? Date.now()
    const req = r.request() as { method(): string }
    doors.push(r.body().then((b) => b.length, () => -1).then((bytes) => ({ method: req.method(), path: u.pathname + u.search, status: r.status(), bytes, at: t0 - pressed, ms: Date.now() - t0 })))
  }
  app.page.on('request', onRequest)
  app.page.on('response', onResponse)
  const t = performance.now()
  pressed = Date.now()
  await act()
  await answered()
  const ms = performance.now() - t
  await app.page.waitForTimeout(500)
  app.page.off('request', onRequest)
  app.page.off('response', onResponse)
  return { press, ms: Math.round(ms), doors: await Promise.all(doors) }
}

/**
 * THE FIRST THING ON THE TRAY'S ROW THAT SHOWS A PERSON THE SEND WAS ANSWERED. The sent tray's row comes with the send's
 * answer and takes the press's place; a refused send keeps the press and its own light fades. Only the Send press's own
 * light counts: a light already on the page is marked before the press, and the light's box must hold the press's box as
 * measured before it. A refused send's fading light counts too, because a refusal is also an answer a person sees.
 */
async function theFirstVisibleSendAnswer(sendBox: { x: number; y: number; width: number; height: number }): Promise<void> {
  await app.page.waitForFunction((box) => {
    if (document.querySelector('[data-part="your-review-sent"] [data-part="your-review-bar"]') !== null) return true
    const light = [...document.querySelectorAll('[data-wait-light]')].find((one) => !one.hasAttribute('data-already-lit'))
    if (light === undefined || light.getAnimations().length === 0) return false
    const at = light.getBoundingClientRect()
    return at.left <= box.x && at.top <= box.y && at.right >= box.x + box.width && at.bottom >= box.y + box.height
  }, sendBox, { timeout: 60_000 })
}

async function oneWholeReview(label: string): Promise<Press[]> {
  const { about } = await aReview(`The kiln schedule, ${label}`)
  const presses: Press[] = []
  await app.page.goto(`${app.site}/#/r/${about}`)
  await waitForThePage(app.page)
  await theSwitch(false)
  const bar = app.page.locator('[data-part="your-review"] [data-part="your-review-bar"]')
  const row = app.page.locator(`.px-pane-list .px-rev-go[title*="The kiln schedule, ${label}"]`)
  presses.push(await timed('Open', () => theSwitch(true), () => row.waitFor({ timeout: 60_000 })))
  // THE TRAY'S LIST IS SHUT at first, so opening this page's review answers with the row at the window's foot.
  presses.push(await timed('Open this page\'s review', () => row.click(), () => bar.waitFor({ timeout: 60_000 })))
  const chip = app.page.locator('[data-part="goes-to"]')
  // SHOW COMMENTS is the row's one press that says whether the list is open, and the recipient line is in that list.
  const show = bar.getByRole('button', { name: words('review.tray.show'), exact: true })
  presses.push(await timed('Show comments', () => show.click(), () => chip.waitFor({ timeout: 60_000 })))
  // CHANGE IS ON THE ROW and opens the list with the contacts in it; the Change beside the recipient line is not drawn.
  const kiln = app.page.locator('[data-part="your-review"] .px-review-contacts .px-talk-contact', { hasText: 'Kiln Keeper' }).first()
  presses.push(await timed('Change who it goes to', () => bar.getByRole('button', { name: words('review.b.change'), exact: true }).click(), () => kiln.waitFor({ timeout: 60_000 })))
  const going = chip.getByText(words('review.b.goingTo', { name: 'Kiln Keeper' }), { exact: true })
  presses.push(await timed('Press a contact', () => kiln.click(), () => going.waitFor({ timeout: 60_000 })))
  // THE ROW'S SEND REVIEW SENDS. The sentence is in the tray's shut list, so this waits for the sent tray's row, which
  // comes with the answer and takes the press's place, or for the press's own light fading, which is what a refused
  // send shows. Send N at the foot of the list is not drawn.
  const send = bar.getByRole('button', { name: words('review.tray.send'), exact: true })
  const sendBox = await send.boundingBox()
  if (sendBox === null) throw new Error('the Send review press has no box to measure')
  await app.page.evaluate(() => {
    for (const light of document.querySelectorAll('[data-wait-light]')) light.setAttribute('data-already-lit', '1')
  })
  presses.push(await timed('Send review', () => send.click(), () => theFirstVisibleSendAnswer(sendBox)))
  return presses
}

beforeAll(async () => {
  // The cold fixture must finish within one minute. Each external startup wait
  // retains its own thirty-second limit and names the resource that did not start.
  const fixtureStart = performance.now()
  office = await reviewPanelSetup('building the synthetic database', FIXTURE_SETUP_MS, (checkpoint) => anOfficeTheSizeOfTheirs(KEEP, checkpoint), async (late) => late.remove())
  coldFixtureMs = Math.round(performance.now() - fixtureStart)
  await reviewPanelSetup('building the browser page or waiting for its build lock', STARTUP_WAIT_MS, () => theBuiltPage())
  let waitingOn = 'the browser stack to begin'
  app = await reviewPanelSetup('starting the browser stack', STARTUP_WAIT_MS, () => liveApp({
    name: 'panel-times', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: office.file,
    onSetupWait: (what) => { waitingOn = what },
  }), (late) => late.stop(), () => waitingOn)
  await reviewPanelSetup('registering the contact and pairing the browser', STARTUP_WAIT_MS, async () => {
    app.page.setDefaultTimeout(10_000)
    app.page.setDefaultNavigationTimeout(10_000)
    await post('/api/agents/started', { handle: 'kiln-keeper', name: 'Kiln Keeper', role: 'worker' })
    await app.page.goto(`${app.site}/#/pairing`)
    await waitForThePage(app.page)
    await app.page.getByRole('button', { name: words('g4.pairing.press'), exact: true }).click()
    await app.page.getByText(words('g4.pairing.paired'), { exact: true }).waitFor()
  })
}, FIXTURE_SETUP_MS + 3 * STARTUP_WAIT_MS + 20_000)

afterAll(async () => {
  await app?.stop()
  office?.remove()
}, 60_000)

describe('the review panel on an office the size of the owner’s', () => {
  it('answers each press within 0.3 s', async () => {
    await oneWholeReview('warm-up')
    const runs: Press[][] = []
    for (let i = 0; i < 3; i += 1) runs.push(await oneWholeReview(`run ${String(i + 1)}`))
    const slow = runs.flat().filter((one) => one.ms > LIMIT_MS).map((one) => `${one.press}: ${String(one.ms)} ms`)
    if (OUT !== '') writeFileSync(OUT, JSON.stringify({ ...JSON.parse(readFileSync(OUT, 'utf8')), limitMs: LIMIT_MS, coldFixtureMs, runs, passedAgainst300Ms: slow.length === 0 }, null, 2))
    expect(slow).toEqual([])
  }, 400_000)
})
