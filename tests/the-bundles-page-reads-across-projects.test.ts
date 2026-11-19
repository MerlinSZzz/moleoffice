// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTEXT BUNDLES PAGE READS ACROSS PROJECTS. The general pages stand under All projects and read across
 * projects, as decided on 29 September 2026.
 *
 * What a person sees, in a real browser, on a database with two projects:
 *
 *   - the kept bundles of both projects, when Every project is chosen, each row naming its project;
 *   - one plain choice of project at the head, starting at the project the page was opened from, and
 *     narrowing the kept list to one project when one is chosen;
 *   - the kept list's count saying what it is counted over;
 *   - keeping a bundle with Every project chosen files it into the project the copy is about, which the
 *     About row names, and never into the project the page was opened from;
 *   - the search for One record finding records in the projects chosen, each naming its project, and the
 *     copy then saying which project it is about;
 *   - Copy it on a row kept in another project reading that bundle in its own project.
 *
 * The kept bundles hold no messages, so the rule about who may read a message has nothing to take out of
 * this list; tests/the-bundle-doors-read-across-projects.test.ts checks the doors' side of that rule.
 *
 * MUTATIONS, each proved after a control run and restored; the commit message names every run and log.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { exportFileName } from '../src/shared/zip-export/manifest.ts'
import { t } from '../src/shared/i18n.ts'

let app: LiveApp
let page: Page

const HERE = 'default'
const THERE = 'robotics'
const WORD = 'Heronfeather'
const titles = new Map<string, string>()
let thereBundle = ''
let hereProblem = ''
let thereProblem = ''

async function call(method: 'GET' | 'POST', path: string, workspace: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': workspace },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}
const idOf = (reply: Record<string, unknown>): string => (reply['record'] as { id: string }).id

beforeAll(async () => {
  app = await liveApp({ name: 'bundles-across', viewport: { width: 1440, height: 1000 } })
  page = app.page
  await call('POST', '/api/workspaces', HERE, { id: THERE, title: 'Robotics' })
  const listed = (await call('GET', '/api/workspaces', HERE))['workspaces'] as { id: string; title: string }[]
  for (const one of listed) titles.set(one.id, one.title)
  await call('POST', '/api/records', HERE, { kind: 'module', title: `${WORD} intake`, data: { context: 'Where frames enter.' } })
  await call('POST', '/api/records', THERE, { kind: 'module', title: `${WORD} gripper`, data: { context: 'Where parts are held.' } })
  // AN OPEN PROBLEM IN EACH PROJECT, because a copy's ledger names the open loops it carried.
  hereProblem = idOf(await call('POST', '/api/records', HERE, { kind: 'problem', title: 'The tray edge is lost', data: { symptom: 'Lost edge.', state: 'open' } }))
  thereProblem = idOf(await call('POST', '/api/records', THERE, { kind: 'problem', title: 'The gripper slips', data: { symptom: 'It slips.', state: 'open' } }))
  await call('POST', '/api/records', HERE, { kind: 'context_bundle', title: 'Kept in the first project', data: { scope: 'project', preset: 'recover_project' } })
  thereBundle = idOf(
    await call('POST', '/api/records', THERE, { kind: 'context_bundle', title: 'Kept in Robotics', data: { scope: 'project', preset: 'recover_project' } }),
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openFresh(): Promise<void> {
  await page.goto(`${app.site}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.bxp-choice .pch-select')
}

async function choose(project: string): Promise<void> {
  await page.selectOption('.bxp-choice .pch-select', project)
}

/** The kept rows once there are `n` of them, as the project each names and its words. */
async function keptRows(n: number): Promise<{ project: string | null; text: string }[]> {
  await page.waitForFunction((count) => document.querySelectorAll('.bx-row').length === count, n, { timeout: 20_000 })
  return page.$$eval('.bx-row', (rows) =>
    rows.map((row) => ({ project: row.querySelector('.pch-name')?.getAttribute('data-project') ?? null, text: row.textContent ?? '' })),
  )
}

const countLine = async (): Promise<string> => ((await page.textContent('.bxp-kept-count')) ?? '').trim()

describe('the kept bundles read across projects', () => {
  it('starts at the project it was opened from, reads every project when asked, and narrows to one', async () => {
    await openFresh()
    expect(await page.inputValue('.bxp-choice .pch-select')).toBe(HERE)
    const first = await keptRows(1)
    expect(first[0]?.project).toBe(HERE)
    // THE PROJECT'S TITLE IS READ AFTER THE PAGE OPENS; until then the page names the project by its id.
    await page.waitForFunction((title) => (document.querySelector('.bxp-kept-count')?.textContent ?? '').includes(title), titles.get(HERE) ?? HERE)
    expect(await countLine()).toBe(`1 kept bundle. Counted in ${titles.get(HERE) ?? HERE}.`)

    await choose('all')
    const both = await keptRows(2)
    expect(both.map((row) => row.project).sort()).toEqual([HERE, THERE].sort())
    expect(both.find((row) => row.project === THERE)?.text).toContain('Kept in Robotics')
    expect(await page.textContent('.bx-row .pch-name[data-project="robotics"]')).toBe('Robotics')
    await page.waitForFunction(() => (document.querySelector('.bxp-kept-count')?.textContent ?? '').startsWith('2 '))
    expect(await countLine()).toBe('2 kept bundles. Counted across every project.')

    await choose(THERE)
    const one = await keptRows(1)
    expect(one[0]?.project).toBe(THERE)
    await page.waitForFunction(() => (document.querySelector('.bxp-kept-count')?.textContent ?? '').includes('Robotics'))
    expect(await countLine()).toBe('1 kept bundle. Counted in Robotics.')
  }, 90_000)

  it('keeps a bundle into the project the copy is about when Every project is chosen', async () => {
    await openFresh()
    await choose('all')
    await keptRows(2)
    await page.selectOption('select[aria-label="Which project the copy is about"]', THERE)
    const name = await page.inputValue('#bx-name')
    expect(name).toContain('Robotics')
    await page.getByRole('button', { name: 'Keep it for later' }).click()
    await page.waitForSelector('.bx-said')
    const there = ((await call('GET', `/api/bundles?projects=${THERE}`, HERE))['bundles'] as { title: string }[]).map((row) => row.title)
    const here = ((await call('GET', `/api/bundles?projects=${HERE}`, HERE))['bundles'] as { title: string }[]).map((row) => row.title)
    expect(there).toContain(name)
    expect(here).not.toContain(name)
  }, 90_000)

  it('finds a record in the projects chosen, names its project, and the copy says which project it is about', async () => {
    await openFresh()
    await choose('all')
    await page.getByRole('radio', { name: /One record/ }).check()
    await page.fill('#bx-find', WORD)
    await page.waitForFunction(() => document.querySelectorAll('.bx-hit').length === 2, undefined, { timeout: 20_000 })
    const projects = await page.$$eval('.bx-hit .pch-name', (all) => all.map((one) => one.getAttribute('data-project')))
    expect(projects.sort()).toEqual([HERE, THERE].sort())
    await page.locator('.bx-hit', { hasText: 'gripper' }).click()
    await page.waitForSelector('.bxp-preview .bxp-about-project')
    expect(await page.textContent('.bxp-preview .bxp-about-project')).toBe('About Robotics')
    expect(await page.textContent('.bxp-primary .bxp-about-project')).toBe('About Robotics')
    expect(await page.textContent('.bx-chosen')).toContain('Robotics')

    // ONE PROJECT CHOSEN: the search reads that one only.
    await choose(HERE)
    await page.fill('#bx-find', `${WORD} `)
    await page.fill('#bx-find', WORD)
    await page.waitForFunction(() => document.querySelectorAll('.bx-hit').length === 1, undefined, { timeout: 20_000 })
    expect(await page.getAttribute('.bx-hit .pch-name', 'data-project')).toBe(HERE)
  }, 90_000)

  it('Copy it on a row kept in another project reads that bundle in its own project', async () => {
    await openFresh()
    await choose('all')
    const rows = await keptRows(3)
    expect(rows.filter((row) => row.project === THERE).length).toBe(2)
    await page.locator(`.bx-row:has(a[href$="${thereBundle}"]) .bx-hand`).click()
    await page.waitForSelector('.bx-row .bx-said')
    const record = (await call('GET', `/api/records/${thereBundle}`, THERE))['record'] as { data: { exports: { carried: { recordId: string }[] }[] } }
    const carried = (record.data.exports[0]?.carried ?? []).map((one) => one.recordId)
    expect(carried).toContain(thereProblem)
    expect(carried).not.toContain(hereProblem)
  }, 90_000)

  /**
   * THE FILES ANSWER ON A ROW KEPT IN ANOTHER PROJECT. The press asks the bundle's own project for
   * the zip, so the page must read the entry back in that project too. When it reads in the page's
   * project instead, the door has already recorded the export and answered the bytes, and the page
   * then says the office did not hand it over: one export with no file for the person.
   *
   * Mutation: drop the workspace header from the read-back and this case hands over no file.
   */
  it('hands over the zip for a bundle kept in another project, and records its files', async () => {
    await openFresh()
    await choose('all')
    await keptRows(3)
    const before = ((await call('GET', `/api/records/${thereBundle}`, THERE))['record'] as {
      data: { exports?: unknown[] }
    }).data.exports?.length ?? 0
    const row = page.locator(`.bx-row:has(a[href$="${thereBundle}"])`)
    await row.getByRole('radio', { name: t('zipExport.textAndFiles') }).check()
    const coming = page.waitForEvent('download', { timeout: 30_000 })
    await row.getByRole('button', { name: t('zipExport.bundlesDownload') }).click()
    const download = await coming
    expect(download.suggestedFilename()).toBe(exportFileName('Kept in Robotics', before + 1))
    const counts = t('zipExport.said', {
      went: t('zipExport.went', { n: 0 }),
      missing: t('zipExport.missing', { n: 0 }),
      leftOut: t('zipExport.leftOut', { n: 0 }),
    })
    expect((await row.locator('.bx-said').textContent()) ?? '').toContain(counts)
    const record = (await call('GET', `/api/records/${thereBundle}`, THERE))['record'] as {
      data: { exports: { files?: unknown }[] }
    }
    expect(record.data.exports.at(-1)?.files, 'the export entry did not record the files').toBeDefined()
  }, 120_000)
})
