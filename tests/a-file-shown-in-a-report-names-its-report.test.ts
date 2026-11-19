// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE SHOWN INSIDE A REPORT NAMES ITS REPORT IN THE FRAME AND IN ITS SAVE LINK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A report draws two kinds of file block. A file that is neither a picture nor a video is drawn
 * as a thing to fetch, and its Open and Save links name the report the block belongs to. An HTML,
 * PDF, Word or text file is drawn in a frame of its own on one press, and until this test its Save
 * link and its frame's address named no report: the same file block answered to two different
 * addresses depending on the type of the file it holds.
 *
 * This test puts a made-up report with one made-up HTML file in a made-up office, opens the
 * report, presses the block's Show press, and reads the two addresses the drawing gives:
 *
 *   1. The frame's `src` carries `record=` with the report's id, beside open=1 and shown=1.
 *   2. The Save link's `href` carries `record=` with the report's id, beside download=1.
 *
 * The values are read from the addresses and compared with the id of the report this test made,
 * never with copied English, so this test does not fix wording that is not its subject.
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

/** A made-up page whose only work is to be a file the report can show. */
const THE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A made-up page</title>
</head>
<body>
<p>A made-up page the report carries.</p>
</body>
</html>
`

let app: LiveApp
let report: string
let filePath: string

beforeAll(async () => {
  app = await liveApp({ name: 'a-file-shown-in-a-report', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  const uploaded = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ bytes: Buffer.from(THE_PAGE, 'utf8').toString('base64'), name: 'made-up-shown-page.html' }),
  })
  expect(uploaded.status, await uploaded.clone().text()).toBe(201)
  const file = ((await uploaded.json()) as { file: { path: string; name: string; size: number; hash: string } }).file
  filePath = file.path

  const created = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      kind: 'report',
      title: 'A made-up report carrying an HTML file',
      summary: 'A made-up page the report carries, with the report named in its frame and its save link.',
      data: {
        for: 'The shown file test',
        date: '2026-11-18',
        blocks: [{ id: 'page', type: 'file', ...file, caption: 'A made-up page the report shows.' }],
      },
    }),
  })
  expect(created.status, await created.clone().text()).toBe(201)
  report = ((await created.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('names the report in the frame and in the save link', async () => {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#${recordPath(report)}`)
  await waitForThePage(app.page, 60_000)

  const figure = app.page.locator('.sb-file')
  await figure.waitFor({ timeout: 10_000 })
  expect(await figure.count()).toBe(1)
  // THE PRESS APPEARS only after the page has read the file's type with a HEAD.
  const press = figure.locator('.sb-file-show')
  await press.waitFor({ timeout: 10_000 }).catch(() => {})
  expect(await press.count()).toBe(1)
  await press.click()

  const frame = app.page.locator('.sb-file-frame')
  await frame.waitFor({ timeout: 15_000 })
  const frameAddress = new URL((await frame.getAttribute('src')) ?? '', app.site)
  expect(frameAddress.searchParams.get('path')).toBe(filePath)
  expect(frameAddress.searchParams.get('open')).toBe('1')
  expect(frameAddress.searchParams.get('shown')).toBe('1')
  expect(frameAddress.searchParams.get('record')).toBe(report)

  const saveAddress = new URL((await figure.locator('.sb-file-save').getAttribute('href')) ?? '', app.site)
  expect(saveAddress.searchParams.get('path')).toBe(filePath)
  expect(saveAddress.searchParams.get('download')).toBe('1')
  expect(saveAddress.searchParams.get('record')).toBe(report)
}, 120_000)
