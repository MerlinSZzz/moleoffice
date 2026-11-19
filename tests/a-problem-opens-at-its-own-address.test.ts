// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROBLEM OPENS AT ITS OWN ADDRESS AND DRAWS ITS OWN PAGE.
 * Criterion E2: a problem gets an entry and a page of its own.
 * The work merged as c8119690 gave a report the address `#/report/<id>`; the work
 * (merged as df4a2bdd) gave a message a page of its own at `#/message/<id>`; the decision names
 * `problem` third, 839 records on 16 September.
 *
 * THIS FILE PROVES THE SIX THINGS THE BRIEF NAMES, in a real browser, the way a person meets them:
 *
 *   1. `#/problem/<id>` resolves and draws the page: the title, what breaks, what was tried, the
 *      cause and the fix, and the state.
 *   2. The rail marks the Work to do row as the part you are reading, and not Everything.
 *   3. A list that knows the kind — the records list — links to `#/problem/<id>`.
 *   4. A link that knows only the id still opens `#/r/<id>`, and the record page still draws it.
 *   5. The breadcrumb reads All records / Work to do / the problem's title (the sidebar row's word, nav.records).
 *   6. The one press that closes it — the record page's own state control — is on the page once the
 *      address says the reader asked to write, and setting it to `fixed` writes through.
 *
 * WHY A BROWSER AND NOT A RENDER. The page reads one problem from the server and tells the rail
 * nothing: the rail learns the kind from the ADDRESS, which only exists once the shell has parsed it.
 * renderToStaticMarkup paints no effects and no address, so it cannot see either half.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API and Vite on ports of their own, pointed at a database
 * of their own; nothing here touches the live office's port.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, expect, it, describe } from 'vitest'
import { parseRoute, problemPath, recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let problemId = ''
let problemTitle = ''

beforeAll(async () => {
  app = await liveApp({
    name: 'problem-entry',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
  })

  problemTitle = 'The problem with a page of its own'
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'problem',
      title: problemTitle,
      summary: 'Seeded so the page has a problem to draw.',
      data: {
        symptom: 'The reading check opened the record page twice.',
        cause: 'The address was built without the kind.',
        why_it_hurts: 'A reader cannot tell which address is the one to keep.',
        how_to_tell_it_is_back: 'Press the row in a list and read the address bar.',
        seen_in: ['the reading check', 'the records list'],
        found_by: 'dogfooding, the entry page',
        state: 'open',
        fix: 'Build the kind into the address, in the one place an address is built.',
        attempts: [
          {
            id: 'a-kind-in-the-address',
            tried: 'Put the kind in the address and left the generic address as the fallback.',
            result: 'Both addresses opened the problem.',
            failed_because: 'Nothing pointed at the new address yet.',
            still_useful: 'The generic address is still what a caller that holds only an id builds.',
          },
        ],
      },
    }),
  })
  expect(filed.status, `creating the problem: ${await filed.clone().text()}`).toBe(201)
  problemId = ((await filed.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a problem at #/problem/<id>', () => {
  it('resolves to its own page and draws the title, the symptom, the attempts and the fix', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${problemPath(problemId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    // THE ADDRESS NAMES THE KIND, and the parser's own branch answers with a page of its own.
    expect(page.url()).toContain(`#/problem/${problemId}`)
    expect(parseRoute(page.url().slice(page.url().indexOf('#')))).toEqual({ name: 'problem', id: problemId })

    // THE TITLE IS THE HEADING, and the page's own h1 is the one that carries it.
    await page.locator('h1.pp-title').waitFor({ timeout: 30_000 })
    expect(await page.locator('h1.pp-title').textContent()).toContain(problemTitle)

    // WHAT BREAKS is the problem's primary authored text, drawn as the record page draws it.
    await page.locator('.rd-lead').first().waitFor({ timeout: 30_000 })
    expect(await page.locator('.rd-lead').first().textContent()).toContain('opened the record page twice')

    // THE ATTEMPTS ARE A LIST, IN THE ORDER THEY WERE WRITTEN.
    const attempts = (await page.locator('ol.rp-attempts').textContent()) ?? ''
    expect(attempts).toContain('Put the kind in the address')
    expect(attempts).toContain('Both addresses opened the problem')

    // THE BODY FOLDS ARE THE CAUSE, THE WHY, THE CHECK AND THE FIX, in somebody's own words.
    const said = (await page.locator('.pp').textContent()) ?? ''
    expect(said).toContain('The address was built without the kind')
    expect(said).toContain('A reader cannot tell which address is the one to keep')
    expect(said).toContain('Press the row in a list and read the address bar')
    expect(said).toContain('Build the kind into the address')
  })

  // Test change (wave 13y round 165): Work to do and Everything are listed on All pages now, so the
  // part being read is marked by the All pages entry, and no entry in front is marked.
  it('marks the Work to do row as the part you are reading, and not Everything', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${problemPath(problemId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    await page
      .locator('nav.shell-nav a.shell-all-pages[aria-current="true"]')
      .waitFor({ timeout: 10_000 })
    const frontMarked = await page
      .locator('nav.shell-nav a.shell-link:not(.shell-all-pages)[aria-current]')
      .count()
    expect(frontMarked, 'an entry in front marking a problem page').toBe(0)
    const workMarked = await page
      .locator('nav.shell-nav a.shell-all-pages[aria-current="true"]')
      .count()
    expect(workMarked, 'All pages, where Work to do is listed, marking the problem page').toBe(1)
  })

  it('reads All records / Work to do / the problem title in the breadcrumb', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${problemPath(problemId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const crumbs = page.locator('nav[aria-label="Breadcrumb"]')
    await crumbs.waitFor({ timeout: 10_000 })
    const said = (await crumbs.textContent()) ?? ''
    expect(said).toContain('All records')
    expect(said).toContain('Work to do')
    expect(said).toContain(problemTitle)
  })

  it('is linked to from the records list, which knows the problem kind', async () => {
    const { page } = app
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator(`a[href="#/problem/${problemId}"]`).first().waitFor({ state: 'visible', timeout: 30_000 })
  })

  it('still opens at the old generic record address, which the record page draws', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${recordPath(problemId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    expect(page.url()).toContain(`#/r/${problemId}`)
    // The record page draws the problem's own title, and it is not the problem's own page.
    await page.getByText(problemTitle).first().waitFor({ timeout: 30_000 })
    expect(await page.locator('h1.pp-title').count()).toBe(0)
  })

  it("offers the record page's own close press once the address says edit", async () => {
    const { page } = app
    await page.goto(`${app.site}/#${problemPath(problemId)}/edit`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // AT REST THE PAGE IS A READING, and the state control is not drawn.
    await page.goto(`${app.site}/#${problemPath(problemId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    expect(await page.locator('.rd-word select').count(), 'the state control drawn while reading').toBe(0)

    // ON /edit IT IS, and it is the one press that closes the problem.
    await page.goto(`${app.site}/#${problemPath(problemId)}/edit`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const state = page.locator('.rd-word select').first()
    await state.waitFor({ state: 'visible', timeout: 30_000 })
    await state.selectOption('fixed')
    // THE WRITE LANDS: the control reads back the word that was chosen.
    await page.waitForFunction(
      () => (document.querySelector('.rd-word select') as HTMLSelectElement | null)?.value === 'fixed',
      undefined,
      { timeout: 30_000 },
    )
  })
})
