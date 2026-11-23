// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT OPENED AGAIN AFTER ANOTHER PROJECT'S REPORT IS DRAWN AT ONCE, IN ITS OWN PROJECT.
 *
 * WHAT THIS HOLDS. A reader opens a report in one project, then follows a link to a report of another
 * project, and the page moves to that project. Then they follow a link to the first report again. The
 * page has kept its answer for the first report, so it draws that report at once, as it does for a
 * report opened again in the same project: its title and its words are on screen while its read is
 * still out, marked as being read again ("Refreshing…" on the strip). No frame draws the reading
 * state. No frame draws the first report while the other project is open, because a kept answer
 * belongs to one reader and one project. And the first report is asked for in its own project only.
 *
 * WHY IT FAILS ON THE CODE BEFORE THE FIX. A record's address names no project. Following the link back
 * arrives while the other project is still open, so the page looked for its kept answer under that
 * project, found none, drew the reading state and asked the server there. The server answered that the
 * report is in another project, and only then did the page move to the report's project and draw the
 * kept answer. Here the read of the first report is held until the test lets it go, so that code draws
 * the reading state for as long as the hold lasts, and the report is never on screen while it is held.
 *
 * In a real browser against a Mole Office of its own, with two made-up projects. A link is followed as
 * a press on one does it: the address changes, and nothing else. Everything here is made up.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { theProjectIdOnScreen } from './switch-the-project.ts'

const FIRST = { id: 'alpha', title: 'Made-up Alpha', report: 'A made-up report of Alpha', words: 'A made-up paragraph of Alpha.' }
const SECOND = { id: 'beta', title: 'Made-up Beta', report: 'A made-up report of Beta', words: 'A made-up paragraph of Beta.' }
const VIEWPORT = { width: 1440, height: 900 }

let app: LiveApp
let firstReport = ''
let secondReport = ''

/** The person's own headers in one project. Built when asked, because the person is read after the build. */
function asThePerson(project: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

async function write(path: string, body: unknown, headers: Record<string, string>): Promise<string> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `POST ${path}: ${text}`).toBe(201)
  return (JSON.parse(text) as { record?: { id: string } }).record?.id ?? ''
}

const aReport = (project: typeof FIRST) => ({
  kind: 'report',
  title: project.report,
  data: { for: 'A made-up reader', date: '2026-11-22', blocks: [{ id: 'b-1', type: 'text', text: project.words }] },
})

beforeAll(async () => {
  app = await liveApp({ name: 'report-again-after-another-project', viewport: VIEWPORT })
  for (const project of [FIRST, SECOND]) await write('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
  firstReport = await write('/api/records', aReport(FIRST), asThePerson(FIRST.id))
  secondReport = await write('/api/records', aReport(SECOND), asThePerson(SECOND.id))
  expect(firstReport, 'the first report was made').not.toBe('')
  expect(secondReport, 'the second report was made').not.toBe('')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What one painted frame shows. */
type Frame = { stored: string | null; shown: string | null; first: boolean; loading: boolean; refreshing: boolean }

/** Take one sample in every frame from now on, just before the browser paints it. */
async function startTheFrames(page: Page, title: string): Promise<void> {
  await page.evaluate((title) => {
    const held = window as unknown as { __frames: Frame[] }
    held.__frames = []
    const take = (): void => {
      held.__frames.push({
        stored: window.localStorage.getItem('mole-office.workspace'),
        shown: document.querySelector('.sbp-block')?.getAttribute('data-project') ?? null,
        first: [...document.querySelectorAll('#main .rp-title')].some((one) => (one.textContent ?? '').includes(title)),
        loading: document.querySelector('#main .px-loading') !== null,
        refreshing: document.querySelector('.px-reread .px-reread-what') !== null,
      })
      requestAnimationFrame(take)
    }
    requestAnimationFrame(take)
  }, title)
}

async function theFrames(page: Page): Promise<Frame[]> {
  return (await page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames)) as Frame[]
}

/** The frames as lines, one for each change, for a failure to show what was painted. */
function told(frames: Frame[]): string {
  const out: string[] = []
  let last = ''
  frames.forEach((f, i) => {
    const one = `project ${String(f.stored)}, drawn as ${String(f.shown)}${f.first ? ', the first report' : ''}${f.loading ? ', the reading state' : ''}${f.refreshing ? ', Refreshing' : ''}`
    if (one !== last) out.push(`frame ${String(i)}: ${one}`)
    last = one
  })
  return out.join('\n')
}

/** Follow a link to this address, as a press on one does. */
async function followALinkTo(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    location.hash = to
  }, `#${path}`)
}

it('a report opened again after a report of another project is drawn at once, in its own project, while its read is held', async () => {
  const context = await app.browser.newContext({ viewport: VIEWPORT })
  await context.addInitScript((project: string) => {
    // ONLY A NEW BROWSER IS SEEDED: a later load must keep the project the page moved to.
    if (window.localStorage.getItem('mole-office.workspace') === null) {
      window.localStorage.setItem('mole-office.workspace', project)
      window.localStorage.setItem('mole-office.language', 'en')
      window.localStorage.setItem('mole-office.chat.open', 'no')
    }
  }, FIRST.id)
  const page = await context.newPage()
  let letGo!: () => void
  const gate = new Promise<void>((resolve) => {
    letGo = resolve
  })
  /** The project each held read of the first report named. */
  const askedIn: (string | undefined)[] = []
  try {
    // THE FIRST REPORT, read once in its own project.
    await page.goto(`${app.site}/?lang=en#${recordPath(firstReport, 'report')}`, { timeout: 60_000 })
    await page.locator('#main .rp-title', { hasText: FIRST.report }).waitFor({ timeout: 30_000 })
    await page.locator('#main .sb-text', { hasText: FIRST.words }).waitFor({ timeout: 30_000 })
    await waitForThePage(page, 60_000)
    expect(await theProjectIdOnScreen(page)).toBe(FIRST.id)

    // THE SECOND PROJECT'S REPORT, by a link followed while the first project is open. The page moves to its project.
    await followALinkTo(page, recordPath(secondReport, 'report'))
    await page.locator('#main .rp-title', { hasText: SECOND.report }).waitFor({ timeout: 30_000 })
    await page.locator('#main .sb-text', { hasText: SECOND.words }).waitFor({ timeout: 30_000 })
    await expect.poll(() => theProjectIdOnScreen(page), { timeout: 30_000 }).toBe(SECOND.id)
    await waitForThePage(page, 60_000)

    // THE READ OF THE FIRST REPORT IS HELD from here on, in whichever project it is asked.
    await page.route(`**/api/records/${firstReport}**`, async (route) => {
      const request = route.request()
      if (new URL(request.url()).pathname !== `/api/records/${firstReport}`) return route.continue()
      askedIn.push(request.headers()['x-mole-office-workspace'])
      await gate
      await route.continue()
    })
    await startTheFrames(page, FIRST.report)

    // BACK TO THE FIRST REPORT, by a link to it followed again.
    await followALinkTo(page, recordPath(firstReport, 'report'))
    await expect
      .poll(async () => (await theFrames(page)).some((one) => one.first), { timeout: 10_000, message: 'the first report was not drawn while its read was held' })
      .toBe(true)
    await expect.poll(() => askedIn.length, { timeout: 10_000, message: 'the first report was not read again behind its drawing' }).toBeGreaterThan(0)
    // Still held: the title, the words and the Refreshing strip are on screen together, in the first report's project.
    await page.locator('#main .sb-text', { hasText: FIRST.words }).waitFor({ timeout: 2_000 })
    expect(await page.locator('.px-reread-what').first().textContent({ timeout: 2_000 })).toBe(t('frameFiles.reread.refreshing'))
    expect(await theProjectIdOnScreen(page)).toBe(FIRST.id)
    const held = await theFrames(page)
    // No frame draws the reading state, or the first report while any project but its own is open, or the first report
    // without the mark.
    expect(held.filter((one) => one.loading), told(held)).toEqual([])
    expect(held.filter((one) => one.first && (one.stored !== FIRST.id || one.shown !== FIRST.id)), told(held)).toEqual([])
    expect(held.filter((one) => one.first && !one.refreshing), told(held)).toEqual([])
    // The first report is asked for in its own project, never first in the project just left.
    expect(askedIn.filter((one) => one !== FIRST.id), askedIn.join(', ')).toEqual([])

    // THE READ ANSWERS. The report stays, the mark goes, and the page is still in the first report's project.
    letGo()
    await expect.poll(() => page.locator('.px-reread-what').count(), { timeout: 30_000 }).toBe(0)
    await page.locator('#main .rp-title', { hasText: FIRST.report }).waitFor({ timeout: 2_000 })
    await page.locator('#main .sb-text', { hasText: FIRST.words }).waitFor({ timeout: 2_000 })
    expect(await theProjectIdOnScreen(page)).toBe(FIRST.id)
    const all = await theFrames(page)
    expect(all.filter((one) => one.loading || (one.first && (one.stored !== FIRST.id || one.shown !== FIRST.id))), told(all)).toEqual([])
  } finally {
    letGo()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }
}, 180_000)
