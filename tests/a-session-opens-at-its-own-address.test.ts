// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN OPENS AT ITS OWN ADDRESS AND DRAWS ITS OWN PAGE.
 * Criterion E2, point 3: a run has a way in and a page of its own.
 * The work merged as df4a2bdd gave a message the address `#/message/<id>`; this is the
 * same page for a run, the second kind the decision names.
 *
 * THIS FILE PROVES THE FIVE THINGS THE BRIEF NAMES, in a real browser, the way a person meets them:
 *
 *   1. `#/session/<id>` resolves and draws the page: the title, who it served, where it ran, the
 *      report section and the office's timeline.
 *   2. The rail marks the Agent runs row as the part you are reading, and not All records.
 *   3. A list that knows the kind — the records list — links to `#/session/<id>`.
 *   4. A link that knows only the id still opens `#/r/<id>`, and the record page still draws it.
 *   5. The breadcrumb names All records, the family the run belongs to, and the run's title.
 *
 * WHY A BROWSER AND NOT A RENDER. The page reads one run from the server and tells the rail nothing:
 * the rail learns the kind from the ADDRESS, which only exists once the shell has parsed it.
 * renderToStaticMarkup paints no effects and no address, so it cannot see either half.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API and Vite on ports of their own, pointed at a
 * database of their own; nothing here touches the live office's port.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it, describe } from 'vitest'
import { parseRoute, recordPath, sessionPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage, thePersonsKeyHeader } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let runId = ''
let runTitle = ''

beforeAll(async () => {
  app = await liveApp({
    name: 'session-entry',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
  })

  // AN AGENT TO SERVE, so the run's own record names a durable agent.
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Session',
      data: { handle: 'builder-session', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(agent.status, `creating the agent: ${await agent.clone().text()}`).toBe(201)

  // ONE RUN, filed by hand the way a run is when its tool wrote none. `servingAgent` names the agent
  // above by its handle, which is what the record's own reader looks up in the registry.
  runTitle = 'The run with a page of its own'
  const run = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({
      kind: 'session',
      title: runTitle,
      data: {
        state: 'running',
        runtime: 'claude-code',
        model: 'opus',
        servingAgent: 'builder-session',
        doing: 'reading one run back out of the office with a page of its own',
        workingDirectory: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/session-entry`,
        cutFrom: 'main',
        startedAt: '2026-09-16 10:00:00',
      },
    }),
  })
  expect(run.status, `creating the run: ${await run.clone().text()}`).toBe(201)
  runId = ((await run.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a run at #/session/<id>', () => {
  it('resolves to its own page and draws the title, where it ran and the timeline', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${sessionPath(runId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    // THE ADDRESS NAMES THE KIND, and the parser's own branch answers with a page of its own.
    expect(page.url()).toContain(`#/session/${runId}`)
    expect(parseRoute(page.url().slice(page.url().indexOf('#')))).toEqual({ name: 'session', id: runId })

    // THE TITLE IS THE HEADING, and the facts the record carries are drawn.
    await page.locator('h1.sp-title').waitFor({ timeout: 30_000 })
    expect(await page.locator('h1.sp-title').textContent()).toContain(runTitle)
    const where = page.locator('section[data-target="uiSurface/session.where"]')
    await where.waitFor({ timeout: 30_000 })
    expect(await where.textContent()).toContain('opus')
    expect(await where.textContent()).toContain('main')

    // THE OFFICE'S TIMELINE IS A SECTION OF THE PAGE, even when nothing called the office.
    const did = page.locator('section[data-target="uiSurface/session.did"]')
    await did.waitFor({ timeout: 30_000 })
    expect(await did.textContent()).toContain('What it did, in order')
  })

  // Test change (wave 13y round 165): Agent runs and All records are listed on All pages now, so the
  // part being read is marked by the All pages entry, and no entry in front is marked.
  it('marks Agent runs in developer mode and leaves All records unmarked', async () => {
    const { page } = app
    await page.goto(`${app.site}/?mode=inspect#${sessionPath(runId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    await page
      .locator('nav.shell-nav a.shell-all-pages[aria-current="true"]')
      .waitFor({ timeout: 10_000 })
    const frontMarked = await page
      .locator('nav.shell-nav a.shell-link:not(.shell-all-pages)[aria-current]')
      .count()
    expect(frontMarked, 'an entry in front marking a run page').toBe(0)
    const runsMarked = await page
      .locator('nav.shell-nav a.shell-all-pages[aria-current="true"]')
      .count()
    expect(runsMarked, 'All pages, where Agent runs is listed, marking the run page').toBe(1)
  })

  it('reads All records / the family / the run title in the breadcrumb', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${sessionPath(runId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const crumbs = page.locator('nav[aria-label="Breadcrumb"]')
    await crumbs.waitFor({ timeout: 10_000 })
    const said = (await crumbs.textContent()) ?? ''
    expect(said).toContain('All records')
    expect(said).toContain('Reports and notes')
    expect(said).toContain(runTitle)
  })

  it('is linked to from the records list, which knows the session kind', async () => {
    const { page } = app
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator(`a[href="#/session/${runId}"]`).first().waitFor({ state: 'visible', timeout: 30_000 })
  })

  it('still opens at the old generic record address, which the record page draws', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${recordPath(runId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    expect(page.url()).toContain(`#/r/${runId}`)
    // The record page draws the run's own title, and it is not the run's own page.
    await page.getByText(runTitle).first().waitFor({ timeout: 30_000 })
    expect(await page.locator('h1.sp-title').count()).toBe(0)
  })
})
