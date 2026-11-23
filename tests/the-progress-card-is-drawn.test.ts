// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT'S PROGRESS CARD IS DRAWN ON HOME. Wave 13s round 235, on a decision and the design report
 * 1NH-LLi6LGb-.
 *
 * WHAT IS REAL: a made-up office of this test's own (`liveApp`), never the live office. The project, the line, the
 * tasks, the decision and every title here are made up.
 *
 * WHAT THIS FILE PROVES, on the Home page:
 *   1. at 1440, four points in the four states are drawn as 1/1/1/1 and the one point with no state is a gap, said
 *      in the card's own attention sentence and not counted as to do; the briefs group says one brief is waiting;
 *      the card draws no line explaining what it counts, and no footnote;
 *   2. at 390, the same counts are drawn and the page does not scroll sideways;
 *   3. the card has no press inside it, and pressing its words changes no number: it only reads;
 *   4. with TEST_SHOTS naming a folder, Home is photographed at 1440, 990, 660 and 390 in light and dark, in
 *      English, as progress-<width>-<look>.png, and none of them scrolls sideways;
 *   5. a reading that failed is said in the card, and a project the office answers for with no backlog point and
 *      no brief draws no card at all.
 *
 * MUTATIONS, each run alone after a green control and restored after:
 *   - draw the point with no state as `todo` and leave the gap sentence out: case 1 goes red on the count and the
 *     sentence;
 *   - give the counts a fixed width wider than a phone: case 2 goes red on the sideways scroll.
 */

import { aMadeUpModuleForPackage, httpPackageFixture } from './module-package-fixture.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { TEST_SHOTS } from './where-shots-go.ts'

const HERE = 'default'
const LINE = '13s'
/** A made-up project of this office that holds no backlog point and no brief. */
const EMPTY = 'made-up-empty'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The folder the round asked the picture pass to write into, or nothing when the pass is not asked for. */
const SHOTS = process.env[TEST_SHOTS] ?? ''

let app: LiveApp

async function call<T>(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await reply.text()
  if (!reply.ok) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${text}`)
  return JSON.parse(text) as T
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const withReplaces = kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data
  const answer = await call<{ record: { id: string } }>('POST', '/api/records', AS_THE_PERSON, {
    kind,
    title,
    data: withReplaces,
  })
  return answer.record.id
}

/** One made-up backlog point of the line. A missing `state` is the gap this card must say out loud. */
function point(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  return file('backlog_item', title, {
    line: LINE,
    number: title,
    placedBy: { kind: 'person', id: THE_PERSON },
    why: `Made-up: ${title} is one point of the line.`,
    doneWhen: `Made-up: ${title} is true.`,
    ...extra,
  })
}

/** The four counts of one group, by the attribute each `<dd>` carries, as the page draws them. */
async function theCounts(): Promise<Record<string, string>> {
  return app.page.locator('[data-progress-card="project"] [data-progress-count]').evaluateAll((nodes) =>
    Object.fromEntries(
      nodes.map((node) => [node.getAttribute('data-progress-count') ?? '', (node.textContent ?? '').trim()]),
    ),
  )
}

/** The attention sentences, in the order the card draws them. */
async function theAttention(): Promise<string[]> {
  return app.page.locator('[data-progress-card="project"] .pg-attention').evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim()),
  )
}

async function openHome(width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: width < 700 ? 900 : 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${look}#/`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-progress-card="project"]').waitFor({ state: 'visible', timeout: 30_000 })
  await app.page.locator('[data-progress-count="todo"]').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Whether the page is no wider than the window it is drawn in. */
async function noSidewaysScroll(): Promise<boolean> {
  return app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-progress-card-is-drawn', viewport: { width: 1440, height: 1000 }, workspace: HERE })

  // FOUR POINTS IN THE FOUR STATES. Every one of them is later packaged into the one inside brief, so the point
  // with no state below is the one point that names no brief.
  const todo = await point('The card is drawn', { state: 'todo' })
  const doing = await point('The card is read', { state: 'doing' })
  const done = await point('The card is photographed', { state: 'done' })
  const dropped = await point('The card is put on another page', { state: 'dropped' })
  // THE GAP: no stored state at all. It must read as a gap, never as to do.
  await point('The card has no state at all')

  const decision = await file('decision', 'Made-up: the card is the project’s own reading')
  const brief = await file('task', 'Made-up: draw the project’s progress')
  await call('POST', `/api/delegation/${brief}/package`, AS_THE_PERSON, {
    moduleIds: [await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))],
    forTheOutside: 'Made-up: draw the card and bring its reading back.',
    acceptance: 'Made-up: the card draws the counts from the records.',
    parent: { kind: 'decision', id: decision },
    pointIds: [todo, doing, done, dropped],
  })
  await call('POST', '/api/workspaces', AS_THE_PERSON, { id: EMPTY, title: 'Made-up empty project' })

  // THE PAGE READS AS THE PERSON, in the look the address names, as the browser tests around it do.
  await app.page.addInitScript(
    ({ person }) => {
      const query = new URLSearchParams(location.search)
      localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    },
    { person: THE_PERSON },
  )
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('the project’s progress card is drawn on Home', () => {
  it('draws the four point counts, the gap sentence and one waiting brief at 1440', async () => {
    await openHome(1440, 'light')
    const counts = await theCounts()
    expect(counts).toMatchObject({
      todo: '1',
      doing: '1',
      done: '1',
      dropped: '1',
      waiting: '1',
      taken: '0',
      aligned: '0',
      handedBack: '0',
      returned: '0',
      briefsDone: '0',
    })
    const attention = await theAttention()
    expect(attention).toContain(sayInEnglish('progressCard.noStateOne'))
    expect(attention).toContain(sayInEnglish('progressCard.inNoBriefOne'))
    // THE TITLE AND THE COUNTS, AND NO LINE EXPLAINING THEM: no lead under the title and no footnote.
    const card = app.page.locator('[data-progress-card="project"]')
    expect((await card.locator('.hm-section-title').textContent())?.trim()).toBe(sayInEnglish('progressCard.title'))
    expect(await card.locator('.pg-lead').count(), 'a lead line is drawn under the title').toBe(0)
    expect(await card.locator('.pg-note').allInnerTexts(), 'a footnote is drawn in the card').toEqual([])
  }, 120_000)

  it('draws the same counts at 390 with no sideways scroll', async () => {
    await openHome(390, 'light')
    expect(await theCounts()).toMatchObject({
      todo: '1',
      doing: '1',
      done: '1',
      dropped: '1',
      waiting: '1',
    })
    expect(await theAttention()).toContain(sayInEnglish('progressCard.noStateOne'))
    expect(await noSidewaysScroll()).toBe(true)
    // THE CARD ITSELF IS NO WIDER THAN THE WINDOW, not only the page around it.
    const card = app.page.locator('[data-progress-card="project"]')
    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(390)
  }, 120_000)

  it('has no press inside the card, and pressing its words changes no number', async () => {
    await openHome(1440, 'light')
    const card = app.page.locator('[data-progress-card="project"]')
    expect(await card.locator('button').count()).toBe(0)
    const before = await theCounts()
    await card.locator('[data-progress-count="todo"]').click()
    expect(await theCounts()).toEqual(before)
  }, 120_000)

  it('photographs Home at four widths in both looks, when TEST_SHOTS names a folder', async () => {
    if (SHOTS === '') return
    mkdirSync(SHOTS, { recursive: true })
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        await openHome(width, look)
        expect(await noSidewaysScroll(), `the page scrolls sideways at ${String(width)} ${look}`).toBe(true)
        await app.page.screenshot({ path: join(SHOTS, `progress-${String(width)}-${look}.png`), fullPage: true })
      }
    }
  }, 600_000)

  // LAST, because it leaves the browser on the empty project.
  it('says a failed reading in the card, and draws no card for a project with no point and no brief', async () => {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    const card = app.page.locator('[data-progress-card="project"]')
    // A READING THAT FAILED IS SAID, in the card, and is never drawn as a project with nothing in it.
    await app.page.route('**/api/backlog/progress*', (route) => route.fulfill({ status: 500, json: { error: 'A made-up failure.' } }))
    try {
      await app.page.goto('about:blank')
      await app.page.goto(`${app.site}/?lang=en&look=light#/`)
      await waitForThePage(app.page, 60_000)
      await card.locator('.px-error').waitFor({ state: 'visible', timeout: 30_000 })
    } finally {
      await app.page.unroute('**/api/backlog/progress*')
    }
    // THE OFFICE ANSWERS FOR THE EMPTY PROJECT, and the answer counts nothing: the card is not drawn.
    await app.page.addInitScript(({ project }) => localStorage.setItem('mole-office.workspace', project), { project: EMPTY })
    const answered = app.page.waitForResponse(
      (reply) =>
        new URL(reply.url()).pathname === '/api/backlog/progress' &&
        reply.request().headers()['x-mole-office-workspace'] === EMPTY &&
        reply.ok(),
      { timeout: 60_000 },
    )
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}/?lang=en&look=light#/`)
    await waitForThePage(app.page, 60_000)
    const reading = (await (await answered).json()) as { points: { total: number }; briefs: { total: number } }
    expect([reading.points.total, reading.briefs.total], 'the made-up empty project holds a point or a brief').toEqual([0, 0])
    await app.page.locator('[data-home-section="today"]').waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(() => card.count(), { timeout: 10_000, message: 'the card is drawn for a project with nothing in it' }).toBe(0)
  }, 180_000)
})
