// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPENING THE REPORTS PAGE LEAVES THE RECORD PAGE AND SETTINGS AS THEY WERE.
 *
 * React keeps a page's stylesheet in the document after the page closes. The Reports page redesigned
 * in wave 13j's round 10 first named its classes `rp`, `rp-head`, `rp-title`,
 * `rp-facts`, `rp-count`, `rp-project`, `rp-row`, `rp-list` and `rp-when`, which the record page and the
 * Settings repositories panel then used. So once Reports had been opened, the record page's title went
 * from 32 px to 15 px, its facts box to display: contents, and its heading's case and font changed
 * (the check of round 10, refusal group 7RNvAs__gM55). The Reports page's classes are `rpts-*` now.
 *
 * This opens a record page and the repositories panel (drawn in developer mode), reads what they draw,
 * opens Reports, opens both again, and holds every measured style to what it was before.
 *
 * THE RECORD IS A TASK, NOT A NOTE. Since decision 8SkQQo1x69IV, revision 3, a note's page draws no origin
 * section and no state section, so it has no facts box to measure. A task's state section draws one in
 * developer mode, and a task opens on the record page itself. A problem would not do: it opens on a page
 * of its own, which has no h1.rp-title.
 *
 * MUTATIONS, each red: in src/web/pages/family/NotesPage.tsx, name the Reports title rule `.rp-title`
 * again (the record page's title changes), or name the Reports row rule `.repos-row` (the repositories
 * panel's rows change; the panel's classes are `repos-*` since wave 13q's round 10, problem 71zPx0Wyvu6_).
 * And in src/web/pages/RecordPage.tsx, give the state section's facts box and the whose-move box other classes:
 * the case fails, because the record page then draws no facts box to measure.
 *
 * THE `.repos-row` MUTATION, RUN ON 29 SEPTEMBER 2026 (wave 13q round 11, on main 5933ca6c), because
 * the rename to `repos-*` changed it and nobody had run it since (the inspector's check q5ljWVrbepH2):
 * - control: exit 0, 1 passed (.logs/named-tests-2026-09-29T05-33-02-664.log);
 * - mutation, NotesPage.tsx's `.rpts-row {` rule named `.repos-row {`: exit 1, "the repositories panel
 *   looks different after the Reports page was opened" (.logs/named-tests-2026-09-29T05-33-09-067.log);
 * - restore: exit 0, 1 passed (.logs/named-tests-2026-09-29T05-33-15-565.log).
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { openSettingsPanel } from './settings-folds.ts'

let app: LiveApp
let task = ''
/** The one query every address carries: developer mode, in one document. */
const SAME_DOCUMENT = '/?mode=inspect'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  expect(reply.status, await reply.clone().text()).toBeLessThan(300)
  return (await reply.json()) as Record<string, unknown>
}

/** The styles that changed when the class names were shared, read off what the page draws. */
async function recordPageLooks(): Promise<Record<string, string>> {
  await app.page.goto(`${app.site}${SAME_DOCUMENT}#${recordPath(task, 'task')}`)
  await waitForThePage(app.page)
  await app.page.locator('h1.rp-title').first().waitFor({ timeout: 30_000 })
  return await app.page.evaluate(() => {
    const out: Record<string, string> = {}
    const read = (selector: string, props: string[]): void => {
      const el = document.querySelector(selector)
      if (el === null) { out[selector] = 'absent'; return }
      const style = getComputedStyle(el)
      for (const prop of props) out[`${selector} ${prop}`] = style.getPropertyValue(prop)
    }
    read('h1.rp-title', ['font-size', 'font-weight', 'line-height'])
    read('header.rp-head', ['display', 'text-transform', 'font-family', 'font-size'])
    read('.rp-facts', ['display'])
    return out
  })
}

async function openTheReportsPage(): Promise<void> {
  await app.page.goto(`${app.site}${SAME_DOCUMENT}#/notes`)
  await waitForThePage(app.page)
  await app.page.locator('.rpts-row').first().waitFor({ timeout: 30_000 })
}

async function repositoriesLook(): Promise<Record<string, string>> {
  await app.page.goto(`${app.site}${SAME_DOCUMENT}#/settings`)
  await waitForThePage(app.page)
  await openSettingsPanel(app.page, 'settings.repositories')
  await app.page.locator('.repos-row').first().waitFor({ timeout: 30_000 })
  return await app.page.evaluate(() => {
    const out: Record<string, string> = {}
    for (const [selector, props] of [
      ['.repos-row', ['border-top-width', 'padding-top', 'display']],
      ['.repos-row .repos-head', ['display', 'text-transform', 'font-family', 'font-size']],
      ['.repos-row .repos-facts', ['display']],
    ] as const) {
      const el = document.querySelector(selector)
      if (el === null) { out[selector] = 'absent'; continue }
      const style = getComputedStyle(el)
      for (const prop of props) out[`${selector} ${prop}`] = style.getPropertyValue(prop)
    }
    return out
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'reports-leaves-others', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  task = ((await post('/api/records', { kind: 'task', title: 'Level the lathe bench', data: {} })).record as { id: string }).id
  await post('/api/records', { kind: 'report', title: 'The bench week in review', data: { for: 'Quill', date: '2026-09-27', blocks: [{ id: 'b-1', type: 'text', text: 'Three blanks faced.' }] } })
  await post('/api/implementation/repositories', { name: 'lathe-tools' })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

it('draws the record page and the repositories panel the same after the Reports page was opened', async () => {
  // DEVELOPER MODE for every reading (the repositories panel is drawn only there), and ONE DOCUMENT: every
  // address below carries the same query, so moving between them changes only the hash, as a person's
  // clicks do, and a stylesheet a page left behind is still in the document when the next page draws.
  await app.page.goto(`${app.site}${SAME_DOCUMENT}#/`)
  await waitForThePage(app.page)
  // EVERYTHING BUT REPORTS IS OPENED FIRST, so its stylesheets are in the document for both readings of each
  // page. Until wave 13q's round 10 the record page and Settings' repositories panel shared `rp-facts` and
  // `rp-head` (problem 71zPx0Wyvu6_; the panel's classes are `repos-*` now). Opening each before either is
  // measured still means that the only thing that differs between "before" and "after" is that the Reports
  // page has been opened.
  await recordPageLooks()
  const reposBefore = await repositoriesLook()
  const recordBefore = await recordPageLooks()
  expect(recordBefore['h1.rp-title'], 'the record page drew no title, so nothing is measured').toBeUndefined()
  expect(recordBefore['.rp-facts'], 'the record page drew no facts box, so nothing is measured').toBeUndefined()
  expect(reposBefore['.repos-row'], 'the repositories panel drew no row, so nothing is measured').toBeUndefined()

  await openTheReportsPage()

  expect(await recordPageLooks(), 'the record page looks different after the Reports page was opened').toEqual(recordBefore)
  expect(await repositoriesLook(), 'the repositories panel looks different after the Reports page was opened').toEqual(reposBefore)
}, 180_000)
