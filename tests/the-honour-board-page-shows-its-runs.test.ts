// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HONOUR BOARD PAGE IN A BROWSER — criteria HB3 and HB5 of design/honour-board/ACCEPTANCE.md, wave 13u round 15.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, in a test office with a made-up project and made-up runs
 * ---------------------------------------------------------------------------------------
 *
 *   1. The rail's Agents group opens `#/honour-board`. Under the heading, one line draws how many records the
 *      reading read and how long it took, with the same record count the door gives. No threshold line is drawn.
 *   2. The exemplary runs stand newest first, each with its agent, the model it started with, its signals
 *      with their evidence as links, its conditions or "not recorded", and its brief.
 *   3. The noted runs are folded. A closed fold holds no run; opened, it shows them.
 *   4. The weekly table has one line for each model and temperature band, and no line above it on what it counts by.
 *
 * Before, the page drew a sentence on what the reading did not do, a sentence on what the threshold means, a sentence
 * on what the table counts by, and a sentence when no conditions were recorded. It draws the figures and a short state
 * word now, as decided, and this file reads each word from its key.
 *
 * Pictures are taken only when TEST_SHOTS names a folder: four widths, both themes, with the fold open.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run: the fold drawn open with its runs from the
 * start turns case 3 red; the cost line taken out turns case 1 red.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { testShots } from './where-shots-go.ts'

const PROJECT = { id: 'test-honour', title: 'Example office (made-up data)' }
const HEADERS = { 'content-type': 'application/json', 'x-mole-office-workspace': PROJECT.id, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const NOT_REPORTED = { model: 'not reported', temperature: 'not reported', briefBytes: 4207, contextTokens: { largestTurn: 11163, total: 231801 } }

let app: LiveApp
const runs: Record<string, string> = {}
let brief = ''

function aReading(standing: 'exemplary' | 'noted', signals: string[], evidence: string): Record<string, unknown> {
  return {
    read_at: '2026-10-10 12:00:00',
    standing,
    threshold: 2,
    signals: signals.map((signal) => ({ signal, evidence: [evidence], read_at: '2026-10-10 12:00:00' })),
    missing: [],
    cost: { records: 4, ms: 1 },
  }
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: { ...HEADERS, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.ok, `${method} ${path}: ${text}`).toBe(true)
  return JSON.parse(text) as unknown
}

async function aRun(key: string, title: string, model: string, honour: Record<string, unknown>, served?: Record<string, unknown>): Promise<void> {
  // A record's start is stamped to the second, and runs started in the same second are ordered by id.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const made = await call('POST', '/api/records', { kind: 'session', title, data: { state: 'running', runtime: 'dsh', servingAgent: 'example-worker', model, ...(served ? { served } : {}) } })
  runs[key] = made.record.id as string
  await call('PATCH', `/api/records/${runs[key]!}`, { dataPatch: { honour } })
}

beforeAll(async () => {
  app = await liveApp({ name: 'honour-board-page', workspace: 'default', viewport: { width: 1440, height: 900 } })
  await call('POST', '/api/workspaces', PROJECT)
  await call('POST', '/api/agents/started', { handle: 'example-worker', name: 'Example worker (made up)', role: 'worker' })
  // OLDEST FIRST, so the board's newest-first order is the reverse of this list.
  await aRun('E1', 'Example run: the parser rewrite (made up)', 'example-model-a', aReading('exemplary', ['needed no rework', 'proved every test by mutation'], 'EXAMPLE-EVIDENCE-1'), NOT_REPORTED)
  await aRun('N1', 'Example run: a small fix (made up)', 'example-model-b', aReading('noted', ['needed no rework'], 'EXAMPLE-EVIDENCE-2'))
  await aRun('E2', 'Example run: the cache layer (made up)', 'example-model-b', aReading('exemplary', ['corrected its brief', 'found a real defect outside its brief', 'needed no rework'], 'EXAMPLE-EVIDENCE-3'))
  await aRun('N2', 'Example run: the docs pass (made up)', 'example-model-a', aReading('noted', ['caught a blocking defect in review'], 'EXAMPLE-EVIDENCE-4'), NOT_REPORTED)
  const note = await call('POST', '/api/records', { kind: 'note', title: `Brief of example-worker's run ${runs['E2']!}`, data: { body: 'An example brief, made up for this test.' }, links: [{ type: 'about', toId: runs['E2'] }] })
  brief = note.record.id as string
  await app.page.addInitScript((project) => {
    localStorage.setItem('mole-office.workspace', project)
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('theme') ?? 'light')
  }, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

let loads = 0
async function open(width = 1440, theme = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 900 })
  loads += 1
  await app.page.goto(`${app.site}/?lang=en&theme=${theme}&load=${String(loads)}#/honour-board`)
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
  await app.page.locator('.hb-cost').waitFor()
}

describe('the honour board page', () => {
  it('is a row of the Agents group, and draws under its heading how many records the reading read, and no threshold line', async () => {
    await open()
    const page = app.page
    expect(await page.locator('h1.hb-title').textContent()).toBe('Honour board')
    const [records, ms] = ((await page.locator('.hb-cost').getAttribute('data-honour-cost')) ?? '').split(' ').map(Number)
    expect(await page.locator('.hb-cost').textContent()).toBe(sayInEnglish('honourBoardPage.readCost', { records: records!, ms: ms! }))
    const door = await call('GET', '/api/honour-board?standing=exemplary')
    expect(records).toBe(door.cost.records)
    expect(await page.locator('.hb-threshold').count()).toBe(0)
    // Test change (wave 13y round 165): the Agents group's rows are listed on All pages now.
    await page.evaluate(() => { location.hash = '#/all-pages' })
    await page.locator('#main .ap-group[data-group="agents"]').waitFor({ timeout: 30_000 })
    expect(await page.locator('#main .ap-group[data-group="agents"] a[href="#/honour-board"]').count()).toBe(1)
  })

  it('draws the exemplary runs newest first, with agent, model, signals and their evidence, conditions and brief', async () => {
    await open()
    const page = app.page
    const exemplary = page.locator('.hb-runs').first().locator('.hb-row')
    expect(await exemplary.evaluateAll((all) => all.map((one) => one.getAttribute('data-honour-run')))).toEqual([runs['E2'], runs['E1']])
    const newest = exemplary.first()
    expect(await newest.locator('.hb-facts dd').first().textContent()).toBe('Example worker (made up)')
    expect(await newest.locator('.hb-signal-name').allTextContents()).toEqual(['Corrected its brief', 'Found a real defect outside its brief', 'Needed no rework'])
    expect(await newest.locator('a.hb-evidence-link').first().getAttribute('href')).toContain('EXAMPLE-EVIDENCE-3')
    expect(await newest.locator('.hb-absent').first().textContent()).toBe(sayInEnglish('g6a.common.notRecorded'))
    expect(await newest.locator(`a[href*="${brief}"]`).count()).toBe(1)
    const older = exemplary.nth(1)
    expect(await older.locator('.hb-conditions').textContent()).toContain('Model served: not reported')
    expect(await older.locator('.hb-conditions').textContent()).toContain('Brief size: 4207 bytes')
  })

  it('folds the noted runs: a closed fold holds no run, and opened it shows them', async () => {
    await open()
    const page = app.page
    const fold = page.locator('details[data-honour-fold="noted"]')
    expect(await fold.getAttribute('open')).toBeNull()
    expect(await fold.locator('.hb-row').count()).toBe(0)
    expect(await fold.locator('.hb-count').textContent()).toBe('2')
    await fold.locator('summary').click()
    await fold.locator('.hb-row').first().waitFor()
    expect(await fold.locator('.hb-row').evaluateAll((all) => all.map((one) => one.getAttribute('data-honour-run')))).toEqual([runs['N2'], runs['N1']])
  })

  it('counts the signals by the model each run was started with, in one table', async () => {
    await open()
    const page = app.page
    expect(await page.locator('.hb-counts-by').count()).toBe(0)
    const lines = await page.locator('.hb-table tbody tr').evaluateAll((all) => all.map((row) => [...row.children].map((cell) => cell.textContent)))
    expect(lines).toEqual([
      ['example-model-a', 'not reported', '2', '3', '1', '1', '2', '3', '1', '1'],
      ['example-model-b', 'not recorded', '2', '4', '1', '1', '2', '4', '1', '1'],
    ])
  })

  it('takes its pictures at four widths in both themes when asked', async () => {
    if (process.env['TEST_SHOTS'] === undefined || process.env['TEST_SHOTS'] === '') return
    const dir = testShots('honour-board')
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await open(width, theme)
        await app.page.locator('details[data-honour-fold="noted"] summary').click()
        await app.page.locator('details[data-honour-fold="noted"] .hb-row').first().waitFor()
        await app.page.screenshot({ path: join(dir, `honour-board-${String(width)}-${theme}.png`), fullPage: true })
      }
    }
  })
})
