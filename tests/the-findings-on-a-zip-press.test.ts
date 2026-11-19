// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOOK-BEFORE-YOU-PASTE FINDINGS ON A ZIP PRESS, AS ON THE TEXT PRESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Item 4 of the line's requirements, from round 2's report. On a task's package the text answer
 * draws the screen's findings before the person hands the text over. The files answer is a zip, and
 * until this round the page drew no findings for it. A person who chooses the zip must see what a
 * person who chooses the text sees.
 *
 *   1. THE TEXT PRESS IS THE PRESS AS IT WAS. It draws the screen's summary and every finding,
 *      including the email address put in this made-up task's words, and the export entry it records
 *      carries no `screening` and no `files`. Nothing about the text answer changes.
 *   2. THE ZIP PRESS DRAWS THE SAME FINDINGS. After the download, the page draws the same summary
 *      and the same findings, in the same order, read back from the export entry the press wrote.
 *      The entry now records the screen's answer beside the files it already recorded.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   stop drawing the text press's findings, or record `screening` on a text press   -> case 1
 *   draw no findings after a zip press, or draw different ones from the text press  -> case 2
 *
 * THE EMAIL ADDRESS IS MADE UP and belongs to no person. No sentence is written out twice: the
 * page's own words come from the word list, and the screen's finding is read from the page.
 */

import { join } from 'node:path'
import { aMadeUpModuleForPackage, httpPackageFixture } from './module-package-fixture.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { exportFileName } from '../src/shared/zip-export/manifest.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let page: Page
let taskId = ''
let bundleId = ''
/** The findings the text press drew, so the zip press can be held to the same ones. */
let textFindings: string[] = []

const TITLE = 'Ask about the bench clamp'
const MADE_UP_EMAIL = 'bench@example.com'

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** One request to this test's own office, over HTTP. */
async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

async function get(path: string): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}${path}`, { headers: HEADERS })
  if (!res.ok) throw new Error(`GET ${path} answered ${String(res.status)}: ${await res.text()}`)
  return res.json()
}

async function openTheTaskFresh(): Promise<ReturnType<Page['locator']>> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${taskId}`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tpp-form-sum')
  const form = page.locator('.tpp-form').filter({ hasText: t('tpp.copyForOutsideChat') })
  await form.locator('.tpp-form-sum').click()
  return form
}

async function pressForDownload(
  button: ReturnType<Page['locator']>,
): Promise<{ name: string; bytes: Buffer }> {
  const coming = page.waitForEvent('download', { timeout: 30_000 })
  await button.click()
  const download = await coming
  const path = await download.path()
  if (path === null) throw new Error('the browser was handed no file')
  const { readFileSync } = await import('node:fs')
  return { name: download.suggestedFilename(), bytes: readFileSync(path) }
}

async function exportsOf(): Promise<Record<string, any>[]> {
  const read = await get(`/api/records/${bundleId}`)
  const list = read.record.data['exports']
  return Array.isArray(list) ? (list as Record<string, any>[]) : []
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-findings-on-a-zip-press', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const task = await post('/api/records', { kind: 'task', title: TITLE, data: {} })
  if (task.status !== 201) throw new Error(`the task was not filed: ${String(task.status)} ${JSON.stringify(task.body)}`)
  taskId = task.body.record.id as string
  const packaged = await post(`/api/delegation/${taskId}/package`, {
    forTheOutside: `Write to ${MADE_UP_EMAIL} when the clamp is ready, and say what changed.`,
    suits: 'own_module',
    acceptance: 'The clamp holds, and its test passes.',
    acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
    moduleIds: [await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))],
  })
  if (packaged.status !== 201) {
    throw new Error(`the task was not packaged: ${String(packaged.status)} ${JSON.stringify(packaged.body)}`)
  }
  bundleId = packaged.body.package.bundleId as string
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe("a task's package draws the screen's findings on both answers", () => {
  it('draws them on the text press, and records the text answer as it was', async () => {
    const form = await openTheTaskFresh()
    await form.getByRole('button', { name: t('tpp.makeTheText') }).click()
    await form.locator('.tpp-screen').waitFor({ state: 'visible' })
    textFindings = await form.locator('.tpp-screen-finding').allTextContents()
    expect(textFindings.join('\n'), 'the text press drew no finding about the made-up address').toContain(MADE_UP_EMAIL)

    const exports = await exportsOf()
    expect(exports.length).toBe(1)
    expect(exports[0], 'the text answer recorded the files').not.toHaveProperty('files')
    expect(exports[0], 'the text answer recorded a screening').not.toHaveProperty('screening')
  }, 120_000)

  it('draws the same findings on the zip press, recorded in the export entry', async () => {
    const form = await openTheTaskFresh()
    await form.getByRole('radio', { name: t('zipExport.textAndFiles') }).check()
    const got = await pressForDownload(form.getByRole('button', { name: t('zipExport.makeTheZip') }))
    expect(got.name).toBe(exportFileName(TITLE, 2))
    expect(got.bytes.length, 'the browser was handed no zip').toBeGreaterThan(0)

    await form.locator('.tpp-done').waitFor({ state: 'visible' })
    const zipFindings = await form.locator('.tpp-screen-finding').allTextContents()
    expect(zipFindings, 'the zip press drew different findings from the text press').toEqual(textFindings)

    const exports = await exportsOf()
    expect(exports.length).toBe(2)
    const recorded = exports[1]?.screening as { findings?: { check?: unknown; says?: unknown }[] } | undefined
    expect(recorded, 'the zip press recorded no screening on its export entry').toBeDefined()
    const checks = (recorded?.findings ?? []).map((finding) => finding.check)
    expect(checks).toContain('email_address')
    expect(
      (recorded?.findings ?? []).map((finding) => String(finding.says)).join('\n'),
      'the recorded screening does not say what the page drew',
    ).toContain(MADE_UP_EMAIL)
  }, 120_000)
})
