// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT OPENS AT ITS OWN ADDRESS, AND THE RAIL FOLLOWS THE RECORD'S FAMILY.
 * Criterion E2: a press on a report ran
 * the left rail to Everything, and the report itself had no place of its own. This tests the two
 * pieces of that, in a real browser, the way a person meets them:
 *
 *   1. A press on a report's row in Reports and notes takes you to `#/report/<id>` — the report's
 *      own word in the address — and the rail marks Reports and notes for that page.
 *   2. Going back returns to the list, and an old `#/r/<id>` still opens the report.
 *
 * It is a browser test and not a render test because the mark and the address only become true
 * together ON a page, after a record has been read: renderToStaticMarkup paints no effects, and
 * the record page tells the rail its kind once the record has been read.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API and Vite on ports of their own, pointed at a
 * database of their own; nothing here touches the live office's port and nothing is
 * written anywhere but the database the harness itself removes.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, expect, it, describe } from 'vitest'
import { familyPath, parseRoute, recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let reportId = ''
let noteId = ''

beforeAll(async () => {
  app = await liveApp({
    name: 'report-entry',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
  })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'The handback for the report entry',
      summary: 'Seeded so the list has a report to press.',
      data: { for: THE_TEST_OFFICES_OWNER.id, date: '2026-09-16', blocks: [{ id: 'b-1', type: 'text', text: 'The body of the press.' }] },
    }),
  })
  expect(filed.status, `creating the report: ${await filed.clone().text()}`).toBe(201)
  reportId = ((await filed.json()) as { record: { id: string } }).record.id

  const noted = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'note', title: 'A note beside the report' }),
  })
  expect(noted.status).toBe(201)
  noteId = ((await noted.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a press on a report in the list', () => {
  it('takes you to #/report/<id>, marks the family on the rail, and back returns to the list', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${familyPath('notes')}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    // The report's row, pressed by the address it carries before the press: the row that names the
    // report by its title is the one whose href the list built with the kind in hand.
    const row = page.locator(`a[href="#/report/${reportId}"]`).first()
    await row.waitFor({ state: 'visible', timeout: 30_000 })
    await row.click()

    // THE ADDRESS NAMES THE KIND, and the parser's own branch carries it into the route.
    await waitForThePage(page, 60_000)
    await page.waitForURL(/#\/report\//, { timeout: 30_000 })
    expect(page.url()).toContain(`#/report/${reportId}`)
    expect(parseRoute(page.url().slice(page.url().indexOf('#')))).toEqual({
      name: 'record',
      id: reportId,
      kind: 'report',
    })

    // THE RAIL MARKS THE FAMILY, not Everything. On this address the kind is in the route before
    // any record has come back, so the mark arrives with the page rather than after it. The rail's
    // count is read from the marks themselves, because a row with no mark is exactly as quiet as a
    // row with nothing waiting.
    await page
      .locator(`nav.shell-nav a.shell-link[href="#${familyPath('notes')}"][aria-current="true"]`)
      .waitFor({ timeout: 10_000 })
    const everythingMarked = await page
      .locator('nav.shell-nav a.shell-link[href="#/records"][aria-current]')
      .count()
    expect(everythingMarked, 'Everything marking a report page').toBe(0)
    const familyMarked = await page
      .locator(
        `nav.shell-nav a.shell-link[href="#${familyPath('notes')}"][aria-current="true"]`,
      )
      .count()
    expect(familyMarked, 'the Reports and notes row marking the report page').toBe(1)

    // AND BACK RETURNS TO THE LIST, the list presses the page and the page presses nothing back.
    // The press is the browser's own Back, which the hash router answers with the list again.
    await page.goBack()
    await page.waitForURL(/#\/notes$/, { timeout: 30_000 })
    await waitForThePage(page, 60_000)
    await page.locator(`a[href="#/report/${reportId}"]`).first().waitFor({ state: 'visible', timeout: 30_000 })
  })

  it('still opens the report at the old generic record address', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${recordPath(noteId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.getByText('A note beside the report').first().waitFor({ timeout: 30_000 })
    // And the record it opens is the note that record id names, unchanged.
    expect(page.url()).toContain(`#/r/${noteId}`)
  })
})
