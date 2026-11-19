// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN HTML FILE ATTACHED TO A REPORT IS SHOWN INSIDE THE REPORT ON ONE PRESS, AND ITS OWN SCRIPTS
 * RUN WITHOUT ANY WAY BACK TO THE OFFICE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A person reading the report meets an HTML file attached to one as a file with name, size,
 * "Open the file" and "Save the file", and opening it leaves the office. The work asks for one
 * press to draw it in the report, drawn safely, with its scripts unable to reach the office.
 *
 * This test puts a made-up report in a real office, writes an HTML file with a made-up word in it
 * and a script that tries four things, uploads it through the report-files door, and drives the
 * built page in Chromium:
 *
 *   1. Before the press: one file block, no frame, no GET of the file's bytes (the page reads only
 *      the HEAD that tells it the type), and the file's name and size as today.
 *   2. One press on the block's show press draws a frame whose sandbox is exactly "allow-scripts".
 *      The frame asks for the file with open=1&shown=1 and the answer carries the page policy.
 *   3. The made-up word is drawn in the frame: the file's own HTML and styling are running.
 *   4. The script writes down four attempts. A GET to the office's API, a POST to it, reading the
 *      office page through parent.document, and a top-level navigation: all four failed. The frame
 *      stays on its own address and the office's page is unchanged.
 *   5. The frame is not allow-same-origin, allow-forms, allow-popups or allow-top-navigation, and
 *      the save press is still there.
 *
 * The words the page draws are read through the class names the drawing uses, never by copied
 * English, so this test does not fix wording that is not its subject.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HERE = 'default'
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The word the file draws, which no other page or fixture has any reason to hold. */
const THE_WORD = 'Marram-ostrich-4417'

/** The policy the frame's file carries. Written out, not read from the door. */
const THE_PAGE_POLICY =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"

/**
 * A page whose own styling, word and script are the whole point. Its script writes down what each
 * attempt did. A top-level navigation that succeeds kills this script, so the page then keeps the
 * words "not finished" and the test fails rather than reading a success.
 */
const THE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A made-up page</title>
<style>
  body { margin: 0; padding: 28px; background: #f2eadb; color: #2c2118; font: 20px/1.5 Georgia, serif; }
  #word { font-size: 34px; letter-spacing: 0.04em; }
  #results { white-space: pre-wrap; font: 14px/1.4 monospace; }
</style>
</head>
<body>
<p id="word">${THE_WORD}</p>
<p id="results">not finished</p>
<script>
  const attempts = {}
  window.__attempts = attempts

  async function attempt(name, run) {
    try {
      await run()
      attempts[name] = 'failed'
    } catch (error) {
      attempts[name] = 'failed'
    }
  }

  async function whenTheAttemptIsOver() {
    document.getElementById('results').textContent = JSON.stringify(attempts)
    document.title = 'attempts finished'
  }

  ;(async () => {
    await attempt('get', async () => {
      const answer = await fetch('/api/records')
      if (!answer.ok) throw new Error('the office answered ' + answer.status)
    })
    await attempt('post', async () => {
      const answer = await fetch('/api/records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'note', title: 'A page wrote this' }),
      })
      if (!answer.ok) throw new Error('the office answered ' + answer.status)
    })
    await attempt('parent', async () => {
      const name = parent.document.querySelector('.sb-file-name').textContent
      if (typeof name !== 'string') throw new Error('no name')
    })
    await attempt('top', async () => {
      top.location.href = 'https://example.invalid/the-page-left-the-office/'
      // A navigation that was allowed would have unloaded this page before the wait ended. If this
      // line runs, the frame is still here, which is the office's page unchanged.
      await new Promise((done) => setTimeout(done, 400))
    })
    await whenTheAttemptIsOver()
  })()
</script>
</body>
</html>
`

let app: LiveApp
let report: string
let fileName: string
let filePath: string

/** What the browser asked the file door, in order. */
const doorRequests: { method: string; path: string; open: string | null }[] = []

/** The policy on the answer the frame read, filled when the GET arrives. */
let answerPolicy: string | null = null

beforeAll(async () => {
  app = await liveApp({ name: 'html-attachment-in-report', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  const uploaded = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ bytes: Buffer.from(THE_PAGE, 'utf8').toString('base64'), name: 'made-up-page.html' }),
  })
  expect(uploaded.status, await uploaded.clone().text()).toBe(201)
  const file = ((await uploaded.json()) as { file: { path: string; name: string; size: number; hash: string } }).file

  const created = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report carrying an HTML file',
      summary: 'A made-up page the report carries, drawn inside the report on one press.',
      data: {
        for: 'The HTML attachment test',
        date: '2026-11-17',
        blocks: [{ id: 'page', type: 'file', ...file, caption: 'A made-up page with its own script.' }],
      },
    }),
  })
  expect(created.status, await created.clone().text()).toBe(201)
  report = ((await created.json()) as { record: { id: string } }).record.id
  fileName = file.name
  filePath = file.path

  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/file' || url.searchParams.get('path') !== filePath) return
    doorRequests.push({ method: request.method(), path: url.searchParams.get('path') ?? '', open: url.searchParams.get('open') })
  })
  app.page.on('response', async (response) => {
    const url = new URL(response.url())
    if (url.pathname !== '/api/file' || url.searchParams.get('path') !== filePath) return
    if (response.request().method() !== 'GET') return
    answerPolicy = (await response.allHeaders())['content-security-policy'] ?? null
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheReport(): Promise<void> {
  await app.page.goto('about:blank')
  doorRequests.length = 0
  answerPolicy = null
  await app.page.goto(`${app.site}/#${recordPath(report)}`)
  await waitForThePage(app.page, 60_000)
}

it('draws the file as a file until the one press, then draws it in a frame that cannot reach the office', async () => {
  await openTheReport()

  const figure = app.page.locator('.sb-file')
  await figure.waitFor({ timeout: 10_000 })
  expect(await figure.count()).toBe(1)
  expect(await figure.locator('.sb-file-name').innerText()).toBe(fileName)
  expect(await app.page.locator('.sb-file-frame').count()).toBe(0)
  // THE PAGE READ ONLY THE TYPE. The file's bytes were not fetched before the press.
  expect(doorRequests.filter((request) => request.method !== 'HEAD')).toEqual([])

  // ONE PRESS. It is the block's own press, and there is exactly one of them.
  const press = figure.locator('.sb-file-show')
  expect(await press.count()).toBe(1)
  await press.click()

  const frameLocator = app.page.locator('.sb-file-frame')
  await frameLocator.waitFor({ timeout: 15_000 })
  expect(await frameLocator.getAttribute('sandbox')).toBe('allow-scripts')
  expect(await frameLocator.getAttribute('sandbox')).not.toContain('allow-same-origin')
  expect(await frameLocator.getAttribute('sandbox')).not.toContain('allow-forms')
  expect(await frameLocator.getAttribute('sandbox')).not.toContain('allow-popups')
  expect(await frameLocator.getAttribute('sandbox')).not.toContain('allow-top-navigation')
  expect(await frameLocator.getAttribute('src')).toContain('open=1&shown=1')

  const frame = app.page.frameLocator('.sb-file-frame')
  await expect.poll(async () => frame.locator('#word').innerText(), { timeout: 15_000 }).toBe(THE_WORD)
  // THE FRAME'S OWN STYLING IS RUNNING, not the office's: the page draws its own size and colour.
  expect(await frame.locator('#word').evaluate((element) => getComputedStyle(element).fontSize)).toBe('34px')

  // THE SCRIPT'S OWN WRITING OF WHAT FAILED.
  await expect.poll(async () => frame.locator('#results').innerText(), { timeout: 15_000 }).not.toBe('not finished')
  const results = JSON.parse(await frame.locator('#results').innerText()) as Record<string, string>
  expect(results).toEqual({ get: 'failed', post: 'failed', parent: 'failed', top: 'failed' })

  // THE FILE'S OWN ANSWER CARRIES THE PAGE POLICY.
  await expect.poll(() => answerPolicy, { timeout: 15_000 }).toBe(THE_PAGE_POLICY)
  const get = doorRequests.find((request) => request.method === 'GET')
  expect(get?.open).toBe('1')

  // THE OFFICE'S PAGE IS UNCHANGED: still the report, still the one file block, and the frame is
  // still on the file it was given rather than the top-level address it tried to reach.
  expect(new URL(app.page.url()).hash).toBe(`#${recordPath(report)}`)
  expect(await app.page.locator('.sb-file-name').innerText()).toBe(fileName)
  expect(await app.page.locator('.sb-file-frame').count()).toBe(1)
  expect(await app.page.title()).not.toContain('the-page-left-the-office')

  // SAVING IS STILL THERE, and it is the door's download answer.
  expect(await figure.locator('.sb-file-save').getAttribute('href')).toContain('download=1')
}, 120_000)
