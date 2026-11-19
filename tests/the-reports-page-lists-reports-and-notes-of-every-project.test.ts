// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REPORTS PAGE LISTS ONLY REPORTS AND NOTES, FROM EVERY PROJECT, IN THREE GROUPS.
 *
 * Problem nYadrL5AnC-A: the Reports page (#/notes, under All projects in the sidebar) listed agents,
 * flows, counters and incidents beside the reports, it read only the project chosen in the switcher,
 * and its title "Reports and notes" differed from the sidebar's "Reports". It was decided that
 * Reports lists only reports and notes, by question 9 of report n9Mjk3c_sJRu and a decision.
 * The page was built as that report's block b-5 proposed.
 *
 * Everything here is read off a real page, drawn by the built app from a real server. Two projects
 * each hold reports, notes and one record of another kind of the same family (a stopping point).
 *
 * MUTATIONS, each red here:
 *   1. src/shared/reports-page.ts: add 'stopping_point' to REPORTS_PAGE_KINDS. The stopping points are listed.
 *   2. src/server/api/records.ts: read `workspaceOf(req)` instead of ACROSS_WORKSPACES. The second
 *      project's rows are gone.
 *   3. src/shared/reports-page.ts: delete the line that puts an unread report in `needs-you`. The
 *      page has no Needs you group.
 *   4. src/web/pages/family/NotesPage.tsx: drop `setShow(next)` from the chooser. Pressing Notes
 *      still lists the reports.
 *   5. src/web/pages/family/NotesPage.tsx: title the page "Reports and notes", the family's label, as before. The
 *      heading reads "Reports and notes".
 */

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const SECOND = { id: 'lathe-shop', title: 'Lathe shop' }

async function post(workspace: string, body: unknown): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...PERSON, 'x-mole-office-workspace': workspace },
    body: JSON.stringify(body),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'reports-page', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: { ...PERSON, 'x-mole-office-workspace': 'default' },
    body: JSON.stringify(SECOND),
  })
  expect(made.status, await made.clone().text()).toBeLessThan(300)
  // THE FIRST PROJECT: a report nobody has marked, a note, and a stopping point.
  await post('default', { kind: 'report', title: 'Tailstock review', data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-01' } })
  await post('default', { kind: 'note', title: 'Bench note', data: { body: 'The bench is level.' } })
  await post('default', { kind: 'stopping_point', title: 'The chuck slipped', data: { doing: 'Turning the walnut blank', failed: 'The chuck slipped', remains: 'The last pass' } })
  // THE SECOND PROJECT: a report marked unread, a report marked read and a note, both made old.
  await post(SECOND.id, { kind: 'report', title: 'Spindle report', data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-02', read: 'unread' } })
  const oldReport = await post(SECOND.id, { kind: 'report', title: 'Old gauge report', data: { for: THE_TEST_OFFICES_OWNER.name, date: '2025-01-02', read: 'read' } })
  const oldNote = await post(SECOND.id, { kind: 'note', title: 'Walnut note', data: { body: 'Walnut, dried.' } })
  await post(SECOND.id, { kind: 'stopping_point', title: 'The belt snapped', data: { doing: 'Truing the spindle', failed: 'The belt snapped', remains: 'The finishing cut' } })
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    for (const id of [oldReport, oldNote]) {
      db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2025-01-02 09:00:00', '2025-01-02 09:00:00', id)
    }
  } finally {
    db.close()
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** Every group on the page, in order, with the titles of its rows and the words each row says. */
async function groups(): Promise<{ group: string; rows: { title: string; text: string }[] }[]> {
  return app.page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main.page .rpts-group')].map((section) => ({
      group: section.dataset['group'] ?? '',
      rows: [...section.querySelectorAll<HTMLElement>('.rpts-row')].map((row) => ({
        title: row.querySelector('.rpts-title')?.textContent ?? '',
        text: row.textContent ?? '',
      })),
    })),
  )
}

const titles = (said: { rows: { title: string }[] }[]) => said.flatMap((one) => one.rows.map((row) => row.title)).sort()

async function choose(word: string, expected: string[]): Promise<void> {
  await app.page.locator('main.page .rpts-choose').getByRole('button', { name: word, exact: true }).click()
  await app.page.waitForFunction(
    (want) =>
      [...document.querySelectorAll('main.page .rpts-title')].map((one) => one.textContent ?? '').sort().join('|') === want,
    [...expected].sort().join('|'),
    { timeout: 30_000 },
  )
}

describe('the Reports page', () => {
  it('lists the reports and notes of every project, in Needs you, This week and Earlier, and nothing else', async () => {
    await app.page.goto(`${app.site}/?lang=en#/notes`)
    await waitForThePage(app.page, 60_000)
    await app.page.locator('main.page .rpts-row').first().waitFor({ timeout: 60_000 })

    // THE TITLE IS THE SIDEBAR'S WORD.
    expect((await app.page.locator('main.page h1').first().textContent())?.trim()).toBe('Reports')

    const said = await groups()
    // ONLY REPORTS AND NOTES, FROM BOTH PROJECTS.
    expect(titles(said)).toEqual(['Bench note', 'Old gauge report', 'Spindle report', 'Tailstock review', 'Walnut note'])
    const text = (await app.page.locator('main.page').textContent()) ?? ''
    expect(text, 'a stopping point is on the Reports page').not.toContain('The chuck slipped')
    expect(text, 'a stopping point is on the Reports page').not.toContain('The belt snapped')

    // THE THREE GROUPS, IN ORDER. Needs you holds the two reports nobody has marked read, and says
    // which of them is marked unread and which is not marked at all.
    expect(said.map((one) => one.group)).toEqual(['needs-you', 'this-week', 'earlier'])
    const needsYou = said[0]!.rows
    expect(needsYou.map((row) => row.title).sort()).toEqual(['Spindle report', 'Tailstock review'])
    expect(needsYou.find((row) => row.title === 'Spindle report')?.text).toContain('marked unread')
    expect(needsYou.find((row) => row.title === 'Tailstock review')?.text).toContain('not marked read')
    expect(said[1]!.rows.map((row) => row.title)).toEqual(['Bench note'])
    expect(said[2]!.rows.map((row) => row.title).sort()).toEqual(['Old gauge report', 'Walnut note'])

    // EACH ROW NAMES ITS PROJECT.
    expect(needsYou.find((row) => row.title === 'Spindle report')?.text).toContain(SECOND.title)
  }, 120_000)

  it('shows only notes, then only reports, when the chooser says so', async () => {
    await choose('Notes', ['Bench note', 'Walnut note'])
    // A NOTE CANNOT BE MARKED READ, so with notes alone there is no Needs you group and no line for it.
    expect((await groups()).map((one) => one.group)).toEqual(['this-week', 'earlier'])
    expect(await app.page.locator('main.page .rpts-quiet').count()).toBe(0)

    await choose('Reports', ['Old gauge report', 'Spindle report', 'Tailstock review'])
    expect((await groups()).map((one) => one.group)).toEqual(['needs-you', 'earlier'])

    await choose('Reports and notes', ['Bench note', 'Old gauge report', 'Spindle report', 'Tailstock review', 'Walnut note'])

    // PICTURES, only when REPORTS_PAGE_SHOTS names a folder: the four widths in both looks.
    const shots = process.env['REPORTS_PAGE_SHOTS']
    if (shots === undefined) return
    mkdirSync(shots, { recursive: true })
    for (const width of [1440, 990, 660, 390] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        await app.page.waitForTimeout(300)
        await app.page.screenshot({ path: join(shots, `reports-${String(width)}-${theme}.png`), fullPage: true })
      }
    }
  }, 180_000)
})
