// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD PAGE SAYS WHO AND WHAT IN PLAIN WORDS. Wave 13k round 34.
 *
 * The reviews (report 3Zgf2lTGanJw, b-argus-review) and wave 13n's round 33 (report GMFtAC2grPQg,
 * b-3) found four things on a record's own page that this file holds:
 *
 *   1. A handle where a name belongs. "Last changed just now by kiln-ledger", "Filed by an agent
 *      kiln-ledger", the change log's rows and the history's rows ("person", "agent") named a writer
 *      by its stored id or by its kind. Each now names the person or agent as the registries do; the
 *      stored id is drawn in developer mode only.
 *
 * MADE-UP RECORDS: an agent registered as "Wren Okafor" (handle kiln-ledger) files a report and a
 * problem; the test office's person changes the report once. The test office's person is named by
 * whatever its registry row says, read at the start.
 *
 * PICTURES: only when TEST_SHOTS names a folder. The report's page and the problem's page in normal and
 * developer mode, and Home's attention panel, at 1440, 990, 660 and 390, light and dark, English and
 * Chinese, each of the whole page with every fold open.
 *
 * MUTATIONS, proved on 4 October 2026 after a control run (37 passed, 2 skipped, with the five changed tests
 * beside this one), each red for the reason its case states, then restored green (37 passed, 2 skipped):
 *   - src/web/lib/participant-lookup.ts: find a writer by registry id only, not by its handle. Case 1 goes
 *     red ("Wren Okafor" missing), and so does tests/the-notes-around-a-decision-say-who-changed-them.test.ts.
 *   - src/web/pages/RecordPage.tsx: "who filed it" drawn as the stored id again. Case 1 goes red.
 *   - src/web/components/RecordHistory.tsx: a version names its writer's kind again. Case 1 goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { deleteTheCopiedDefaultChapters, liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('record-page-plain-words')

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT: Record<string, string> = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'kiln-ledger' }
const AGENT_NAME = 'Wren Okafor'
const HANDLE = 'kiln-ledger'

let app: LiveApp
let page: Page
let reportId = ''
let problemId = ''
let personName = ''

type Mode = 'normal' | 'inspect'
type Language = 'en' | 'zh'

/** One record's page, in a language, a mode, a width and a look, with every fold open. */
async function open(id: string, language: Language, mode: Mode, width = 1440, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${app.site}/?lang=${language}#/r/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(([chosen, look]) => {
    localStorage.setItem('mole-office.mode', chosen!)
    localStorage.setItem('mole-office.preset.theme', look!)
  }, [mode, theme])
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.rd-changed').waitFor({ timeout: 30_000 })
  await page.locator('.rh-row').first().waitFor({ state: 'attached', timeout: 30_000 })
  // THE PAGE'S OWN FOLDS ONLY: the history and the rail. Opening every <details> also opened the "?" help
  // beside the missing detail, whose bubble then lay over the panel in every picture.
  await page.evaluate(() => document.querySelectorAll('main.page details.rh-fold, main.page details.rd-fold').forEach((one) => ((one as HTMLDetailsElement).open = true)))
  await page.locator('.chg-meta').first().waitFor({ timeout: 30_000 })
}

/** What a sighted reader sees in one element: its text without the words only a screen reader hears. */
async function seen(selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((all) =>
    all.map((one) => {
      const copy = one.cloneNode(true) as HTMLElement
      copy.querySelectorAll('.px-sr').forEach((hidden) => hidden.remove())
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
    }),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'record-page-plain-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await deleteTheCopiedDefaultChapters(app.api)
  const started = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ handle: HANDLE, name: AGENT_NAME, runtime: 'codex' }) })
  expect(started.status, await started.clone().text()).toBe(201)
  const report = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'report',
      title: 'The kiln ledger for September',
      summary: 'Twelve firings, two cracked shelves, and a new cone pack.',
      data: { date: '2026-10-02', blocks: [{ id: 'one', type: 'text', text: 'Twelve firings ran in September.' }] },
    }),
  })
  expect(report.status, await report.clone().text()).toBe(201)
  reportId = ((await report.json()) as { record: { id: string } }).record.id
  const problem = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_AGENT, body: JSON.stringify({ kind: 'problem', title: 'The kiln door seal leaks heat', data: {} }) })
  expect(problem.status, await problem.clone().text()).toBe(201)
  problemId = ((await problem.json()) as { record: { id: string } }).record.id
  const changed = await fetch(`${app.api}/api/records/${reportId}`, { method: 'PATCH', headers: AS_THE_PERSON, body: JSON.stringify({ summary: 'Twelve firings, two cracked shelves, and a new cone pack ordered.' }) })
  expect(changed.status, await changed.clone().text()).toBe(200)
  const who = await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })
  const people = ((await who.json()) as { people: { id: string; name: string }[] }).people
  personName = people.find((one) => one.id === THE_PERSON)?.name ?? ''
  expect(personName, 'the test office has no registry row for its person').not.toBe('')
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a record page', () => {
  it('1. names who filed and changed a record, never by its handle, and keeps the handle for developer mode', async () => {
    for (const language of ['en', 'zh'] as const) {
      await open(problemId, language, 'normal')
      expect((await seen('.rd-changed')).join(' '), `${language}: the last-changed line`).toContain(AGENT_NAME)
      expect((await seen('.rp-whose-move')).join(' '), `${language}: who filed it`).toContain(AGENT_NAME)
      expect((await seen('.chg-meta')).join(' '), `${language}: the change log's row`).toContain(AGENT_NAME)
      expect(await seen('.rh-who'), `${language}: the history's versions`).toEqual([AGENT_NAME])
      expect(await page.locator('main.page').innerText(), `${language}: the handle reached a normal page`).not.toContain(HANDLE)

      await open(reportId, language, 'normal')
      // Newest first: the person's change, then the agent's filing.
      expect(await seen('.rh-who'), `${language}: the report's versions`).toEqual([personName, AGENT_NAME])
      const rows = (await seen('.chg-meta')).join(' ')
      expect(rows).toContain(personName)
      expect(rows).toContain(AGENT_NAME)
      expect(await page.locator('main.page').innerText(), `${language}: the handle reached a normal page`).not.toContain(HANDLE)

      await open(problemId, language, 'inspect')
      expect(await page.locator('main.page').innerText(), `${language}: developer mode lost the handle`).toContain(HANDLE)
    }
  }, 300_000)




  it('5. photographs the pages and Home at four widths', async () => {
    if (!KEEP) return
    for (const language of ['en', 'zh'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          for (const [name, id] of [['report', reportId], ['problem', problemId]] as const) {
            for (const mode of ['normal', 'inspect'] as const) {
              await open(id, language, mode, width, theme)
              await page.screenshot({ path: join(SHOTS, `${name}-${mode === 'inspect' ? 'dev' : 'normal'}-${language}-${width}-${theme}.png`), fullPage: true })
            }
          }
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(`${app.site}/?lang=${language}#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await page.evaluate((look) => {
            localStorage.setItem('mole-office.mode', 'normal')
            localStorage.setItem('mole-office.preset.theme', look)
          }, theme)
          await page.reload({ timeout: 60_000 })
          await waitForThePage(page, 60_000)
          await page.locator('[data-home-section="needs"]').first().waitFor({ timeout: 30_000 })
          await page.screenshot({ path: join(SHOTS, `home-${language}-${width}-${theme}.png`), fullPage: true })
        }
      }
    }
  }, 1_800_000)
})
