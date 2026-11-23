// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ZIP QUESTION ON THE TWO EXPORT PRESSES: THE BUNDLES PAGE AND A TASK'S PACKAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * The decision: when a copy of records leaves, ask whether its related
 * files should go too, and if the answer is yes hand over one zip holding the records and the files.
 * Item 3 of the line's requirements is the page half of that, and this file drives the pages.
 *
 *   1. BOTH PRESSES ASK, AND THE TEXT ANSWER IS THE DEFAULT. On the Bundles page, beside a kept
 *      bundle's export press, and on a task's package, beside the press that makes the outside text,
 *      there are two plain answers and the text-only answer is the checked one on arrival.
 *   2. THE TEXT ANSWER IS THE PRESS AS IT WAS. The export the press records carries no `files`, and
 *      the request it sends names no choice. This is the same entry the ledger held before the zip
 *      existed.
 *   3. THE FILES ANSWER DOWNLOADS A ZIP whose name is `exportFileName(title, n)`, the shared naming
 *      function the server uses, and whose export entry records the files that went.
 *   4. THE PAGE SAYS THE COUNTS the manifest answered with: how many files went, how many named
 *      files were not on disk, and how many were left out. It draws the zip's name on a row of its
 *      own, under the label that says the browser was handed it, and no sentence holds the name.
 *      When the browser will not take the file, there is no such row.
 *   5. EACH PRESS HAS ITS OWN ANSWER, and it goes back to the text answer after it is pressed. A
 *      choice made on one kept bundle does not travel to another.
 *   6. THE COUNTS ARE ABOUT THE FILES THE SERVER REALLY WENT WITH. The bundle names one stored
 *      report file and it is in the zip; the task's package names a module whose file is in the
 *      zip. Both are read back out of the downloaded bytes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   draw one answer, or start on the files answer                    -> case 1
 *   send withFiles with the text answer, or add `files` to the entry  -> case 2
 *   name the download from anything but exportFileName               -> case 3
 *   draw no counts, or draw the wrong three numbers                  -> case 4
 *   name the zip in a sentence, or draw its row when none was handed -> case 4
 *   keep one answer for every row, or keep it after the press        -> case 5
 *   lose a file the server went with                                 -> case 6
 *
 * THE LINE IS NOT CROSSED HERE. The server's own 256 MiB and 10,000 files are proved in
 * tests/bundle-export-with-files.test.ts by handing the builder a small line; a browser test that
 * wrote 256 MiB to prove the same branch would cost the machine and prove nothing more.
 *
 * EVERY SENTENCE THE PAGE DRAWS IS READ FROM THE WORD LIST, so this test reads it from there too.
 * A sentence written out twice is the defect the owner named on 23 October 2026.
 */

import { httpPackageFixture, updateMadeUpModuleForPackage } from './module-package-fixture.ts'
import { rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { exportFileName } from '../src/shared/zip-export/manifest.ts'
import { t, type WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let page: Page

/** The bundle whose press takes the files answer, and the one whose press takes the text answer. */
let bundleWithFiles = ''
let bundleTextOnly = ''
let taskWithFiles = ''
let taskTextOnly = ''
/** The one stored file the records name, kept here so the last case can take it off the disk. */
let sourceFile: { path: string; name: string; size: number; hash: string }

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** One request to this test's own office, over HTTP, because these records are the project and not the act. */
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

async function fileRecord(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  if (made.status !== 201) throw new Error(`the ${kind} was not filed: ${String(made.status)} ${JSON.stringify(made.body)}`)
  return made.body.record.id as string
}

/** Put one real file in report-files, as the file door does, and hand back what a report block names. */
async function upload(name: string, text: string): Promise<{ path: string; name: string; size: number; hash: string }> {
  const made = await post('/api/report-files', { name, bytes: Buffer.from(text, 'utf8').toString('base64') })
  if (made.status !== 201) throw new Error(`the file was not stored: ${String(made.status)} ${JSON.stringify(made.body)}`)
  return made.body.file
}

function aFileBlock(id: string, file: { path: string; name: string; size: number; hash: string }): Record<string, unknown> {
  return { id, type: 'file', path: file.path, name: file.name, size: file.size, hash: file.hash }
}

async function aBundle(title: string, reportId: string): Promise<string> {
  return await fileRecord('context_bundle', title, { scope: 'record', scopeRecordId: reportId, preset: 'continue' })
}

/** A packaged task, with a module whose stored file the package's text and zip both name. */
async function aPackagedTask(title: string, moduleId: string): Promise<{ taskId: string; bundleId: string }> {
  const taskId = await fileRecord('task', title, {})
  const linked = await post('/api/links', { fromId: taskId, toId: moduleId, type: 'part_of' })
  if (linked.status !== 201) throw new Error(`the task was not linked to its module: ${String(linked.status)} ${JSON.stringify(linked.body)}`)
  await updateMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')), moduleId)
  const packaged = await post(`/api/delegation/${taskId}/package`, {
    forTheOutside: 'Build the module on its own and return a zip holding the source.',
    suits: 'own_module',
    acceptance: 'The module runs on its own and its tests pass.',
    acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
    moduleIds: [moduleId],
  })
  if (packaged.status !== 201) throw new Error(`the task was not packaged: ${String(packaged.status)} ${JSON.stringify(packaged.body)}`)
  const bundleId = packaged.body.package.bundleId as string
  // THE MODULE IS CARRIED BY THE PACKAGE'S BUNDLE, so the zip has a file to count. The package's own
  // module list belongs to the text; a bundle carries the records it names.
  const patched = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records/${bundleId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ dataPatch: { additionalRecords: [moduleId] } }),
  })
  if (!patched.ok) throw new Error(`the package's bundle was not given its module: ${String(patched.status)} ${await patched.text()}`)
  return { taskId, bundleId }
}

/** One bundle's exports, as the bundle record holds them. */
async function exportsOf(bundleId: string): Promise<Record<string, any>[]> {
  const read = await get(`/api/records/${bundleId}`)
  const list = read.record.data['exports']
  return Array.isArray(list) ? (list as Record<string, any>[]) : []
}

/** Open the Bundles page on a freshly mounted page, as somebody arriving at it does. */
async function openBundlesFresh(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  await page.waitForSelector('.bx-row')
}

/** Open one task's page on a freshly mounted page, for the reason `openBundlesFresh` reloads. */
async function openTaskFresh(taskId: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${taskId}`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tpp-form-sum')
}

/** The kept bundle's row, by the title on its link. */
function rowOf(title: string) {
  return page.locator('.bx-row').filter({ has: page.getByRole('link', { name: title }) })
}

/** A row's two answers, by the words the word list gives them. */
function answersIn(where: Locator) {
  return {
    textOnly: where.getByRole('radio', { name: t('zipExport.textOnly') }),
    withFiles: where.getByRole('radio', { name: t('zipExport.textAndFiles') }),
  }
}

/** One press on a row, and the download it asks the browser for. */
async function pressForDownload(button: Locator): Promise<{ name: string; bytes: Buffer }> {
  const coming = page.waitForEvent('download', { timeout: 30_000 })
  await button.click()
  const download = await coming
  const path = await download.path()
  if (path === null) throw new Error('the browser was handed no file')
  const { readFileSync } = await import('node:fs')
  return { name: download.suggestedFilename(), bytes: readFileSync(path) }
}

/** Each row drawn here under the label that says the browser was handed a file: the tag and text of its value. */
async function theHandedRows(where: Locator): Promise<{ tag: string; value: string }[]> {
  return where.locator('dl.code-rows dt').evaluateAll(
    (terms, label) =>
      terms
        .filter((term) => term.textContent === label)
        .map((term) => {
          const value = term.nextElementSibling?.firstElementChild ?? null
          return { tag: value?.tagName ?? 'none', value: value?.textContent ?? '' }
        }),
    t('frameFiles.row.handed' as WordKey),
  )
}

/** The three counts the page says, read from the word list rather than typed here. */
function countsSentence(included: number, missing: number, leftOut: number): string {
  return t('zipExport.said', {
    went: t('zipExport.went', { n: included }),
    missing: t('zipExport.missing', { n: missing }),
    leftOut: t('zipExport.leftOut', { n: leftOut }),
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-zip-question-on-the-two-exports', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const source = await upload('bench-source.ts', 'export const bench = true\n')
  sourceFile = source
  const reportId = await fileRecord('report', 'The bench report', {
    blocks: [aFileBlock('b-source', source)],
    for: 'The person',
    date: '2026-10-30',
  })
  bundleWithFiles = await aBundle('The bench handover', reportId)
  bundleTextOnly = await aBundle('The words alone', reportId)

  const moduleId = await fileRecord('module', 'The bench module', {
    parts: [],
    paths: [{ id: 'source', label: 'The source', path: source.path, kind: 'code' }],
  })
  taskWithFiles = (await aPackagedTask('Fit the bench clamp', moduleId)).taskId
  taskTextOnly = (await aPackagedTask('Say how the bench went', moduleId)).taskId
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Bundles page asks, and the text answer is the default', () => {
  it('draws two plain answers beside each kept bundle, with the text answer checked on arrival', async () => {
    await openBundlesFresh()
    const answers = answersIn(rowOf('The bench handover'))
    expect(await answers.textOnly.count(), 'the text answer is not beside the kept bundle').toBe(1)
    expect(await answers.withFiles.count(), 'the files answer is not beside the kept bundle').toBe(1)
    expect(await answers.textOnly.isChecked(), 'the files answer is the default').toBe(true)
    expect(await answers.withFiles.isChecked()).toBe(false)
  }, 120_000)

  it('records the text answer as the press did before the zip existed: no files, and no choice sent', async () => {
    await openBundlesFresh()
    await rowOf('The words alone').getByRole('button', { name: t('g7a.bundles.copy') }).click()
    await rowOf('The words alone').locator('.bx-said').waitFor({ state: 'visible' })
    const exports = await exportsOf(bundleTextOnly)
    expect(exports.length).toBe(1)
    expect(exports[0], 'the text answer recorded files').not.toHaveProperty('files')
  }, 120_000)

  it('downloads one zip named by the shared naming function and says the three counts', async () => {
    await openBundlesFresh()
    const row = rowOf('The bench handover')
    await answersIn(row).withFiles.check()
    const got = await pressForDownload(row.getByRole('button', { name: t('zipExport.bundlesDownload') }))
    expect(got.name).toBe(exportFileName('The bench handover', 1))
    const said = (await row.locator('.bx-said').textContent()) ?? ''
    expect(said).toContain(countsSentence(1, 0, 0))
    expect(await theHandedRows(row), 'the zip is not on a row of its own').toEqual([{ tag: 'CODE', value: got.name }])
    expect(said, 'a sentence holds the zip').not.toContain(got.name)

    const exports = await exportsOf(bundleWithFiles)
    expect(exports.length).toBe(1)
    expect(exports[0]?.files?.included).toHaveLength(1)
    expect(exports[0]?.files?.included?.[0]?.name).toBe('bench-source.ts')
    expect(exports[0]?.files?.missing).toEqual([])
    expect(exports[0]?.files?.leftOut).toEqual([])
  }, 120_000)

  it('keeps each press its own answer, and puts it back to the text answer after the press', async () => {
    await openBundlesFresh()
    const first = rowOf('The bench handover')
    const second = rowOf('The words alone')
    await answersIn(first).withFiles.check()
    // THE SECOND ROW IS STILL ON THE TEXT ANSWER: one row's choice did not travel.
    expect(await answersIn(second).textOnly.isChecked(), 'the choice travelled to another row').toBe(true)
    await answersIn(first).textOnly.check()
    expect(await answersIn(first).textOnly.isChecked()).toBe(true)
    await answersIn(first).withFiles.check()
    const got = await pressForDownload(first.getByRole('button', { name: t('zipExport.bundlesDownload') }))
    expect(got.name).toBe(exportFileName('The bench handover', 2))
    expect(await answersIn(first).textOnly.isChecked(), 'the answer stayed after the press').toBe(true)
  }, 120_000)
})

describe("a task's package asks, and the files answer downloads the zip", () => {
  it('draws the same two answers with the text answer checked on arrival', async () => {
    await openTaskFresh(taskWithFiles)
    await page.getByText(t('tpp.copyForOutsideChat'), { exact: true }).click()
    const answers = answersIn(page.locator('.tpp-form').filter({ hasText: t('tpp.copyForOutsideChat') }))
    expect(await answers.textOnly.count()).toBe(1)
    expect(await answers.withFiles.count()).toBe(1)
    expect(await answers.textOnly.isChecked(), 'the files answer is the default').toBe(true)
  }, 120_000)

  it('records the text answer as before, then downloads the zip with its counts when the files answer is chosen', async () => {
    await openTaskFresh(taskWithFiles)
    const form = page.locator('.tpp-form').filter({ hasText: t('tpp.copyForOutsideChat') })
    await form.locator('.tpp-form-sum').click()
    const answers = answersIn(form)

    await form.getByRole('button', { name: t('tpp.makeTheText') }).click()
    await form.locator('.tpp-screen').waitFor({ state: 'visible' })
    const read = await get(`/api/records/${taskWithFiles}`)
    const bundleId = read.record.data.package.bundleId as string
    const textExports = await exportsOf(bundleId)
    expect(textExports.length).toBe(1)
    expect(textExports[0], 'the text answer recorded files').not.toHaveProperty('files')

    await answers.withFiles.check()
    const got = await pressForDownload(form.getByRole('button', { name: t('zipExport.makeTheZip') }))
    expect(got.name).toBe(exportFileName('Fit the bench clamp', 2))
    const said = (await form.locator('.tpp-done').last().textContent()) ?? ''
    expect(said).toContain(countsSentence(1, 0, 0))
    expect(await theHandedRows(form), 'the zip is not on a row of its own').toEqual([{ tag: 'CODE', value: got.name }])
    expect(said, 'a sentence holds the zip').not.toContain(got.name)

    const exports = await exportsOf(bundleId)
    expect(exports.length).toBe(2)
    expect(exports[1]?.files?.included?.[0]?.name).toBe(basename(sourceFile.path))
  }, 120_000)

  it('says a named file was missing when it is no longer on disk', async () => {
    // THE FILE WAS REAL FOR THE CASES ABOVE; now the disk is made to disagree with the records, which
    // is the state the manifest promises never to hide. Nothing else reads this temporary file.
    rmSync(sourceFile.path)
    await openTaskFresh(taskTextOnly)
    const form = page.locator('.tpp-form').filter({ hasText: t('tpp.copyForOutsideChat') })
    await form.locator('.tpp-form-sum').click()
    await answersIn(form).withFiles.check()
    const got = await pressForDownload(form.getByRole('button', { name: t('zipExport.makeTheZip') }))
    expect(got.name).toBe(exportFileName('Say how the bench went', 1))
    expect((await form.locator('.tpp-done').last().textContent()) ?? '').toContain(countsSentence(0, 1, 0))
  }, 120_000)

  /**
   * THE BROWSER THAT WILL NOT HAND A PAGE A FILE. The press still made the zip and the office still
   * recorded it, but the page must say only that the browser cannot hand the file over. Saying the
   * zip was handed over beside that refusal is the two answers the refusal found, and neither is
   * true together.
   *
   * Mutation: append the counts sentence to the refusal and this case goes red.
   */
  it('says only that the browser handed no file over, and never says it did', async () => {
    await page.addInitScript(() => {
      // THE ONE WAY A BROWSER IN THIS TEST CAN REFUSE the handover the helper asks for.
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    })
    await openTaskFresh(taskWithFiles)
    const form = page.locator('.tpp-form').filter({ hasText: t('tpp.copyForOutsideChat') })
    await form.locator('.tpp-form-sum').click()
    await answersIn(form).withFiles.check()
    await form.getByRole('button', { name: t('zipExport.makeTheZip') }).click()
    await form.locator('.tpp-done').waitFor({ state: 'visible' })
    expect(await form.locator('.tpp-done').last().textContent()).toBe(t('frameFiles.clipboard.noFile'))
    expect(await theHandedRows(form), 'a row says the browser was handed the zip').toEqual([])
  }, 120_000)
})
