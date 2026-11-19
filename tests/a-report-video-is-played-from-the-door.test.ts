// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT'S VIDEO IS PLAYED FROM THE DOOR, A STRETCH AT A TIME, AND CAN BE SAVED WHOLE.
 *
 * A message (panelx, agreed in a second, in the shape set out in message
 * 7fFI7J3l5Gih) says a report's video could not be
 * watched in the page above the preview limit, so it had to be opened on the host.
 * Two things stood in the
 * way. The door read a file whole and refused one over 25 MB, which tests/file-preview.test.ts now
 * holds the other way. And this page fetched the file whole into a blob before its player saw a
 * byte. So a long recording arrived in full before its first frame, and the player never asked for a
 * stretch.
 *
 * WHAT IS MEASURED, in a real browser: the player is handed the door's own address, never a blob.
 * The address carries the project, because a player cannot send a header. The player asks the door
 * with Range, and is answered 206. Beside it is a link that saves the whole file.
 *
 * WHAT IS NOT: whether the video plays. The bytes here are not a real recording, because nothing in
 * the sandbox this runs in can write one, so the player asks for them and then says it cannot decode
 * them. That the player asks for a stretch and is answered one is what this change is. Playing a real
 * recording is checked by hand on the owner's reports.
 *
 * MUTATION PROOF, 24 September 2026, alone in src/web/components/SummaryBlocks.tsx: a video read
 * whole into a blob again, and this goes red.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/**
 * THIS FILE'S OWN FOLDER, made in beforeAll and removed in afterAll. It is a temporary folder inside
 * this checkout's .logs/, because the file door serves only from a preview root (see tests/a-message-carries-pictures.test.ts, which says why it is inside the checkout). It is
 * made by mkdtempSync, so two runs never share it (problem x25LcNeJ7RFi). `.logs/` is made first,
 * because a fresh checkout has none, and mkdtempSync does not make the folder it is given: a test
 * that skipped that step failed with ENOENT before any case ran (run 4DZRM3lSK_xc).
 */
let OURS = ''
/** The recording the report carries, in OURS. */
let VIDEO = ''
/** Bytes that are not a real recording, and say so. */
const NOT_A_REAL_RECORDING = Buffer.from('not a real recording: the player asks for it and cannot decode it. '.repeat(2000))
const WHAT_IT_SHOWS = 'A recording of the arm reaching for the cube'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let recordId = ''
/** Every request for a file's bytes this page made, with the Range it carried, and its answer's status. */
const asked: { url: string; range: string | null; status: number | null }[] = []

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  OURS = mkdtempSync(join(CHECKOUT, '.logs', 'video-from-the-door-test-'))
  VIDEO = join(OURS, 'a-recording.mp4')
  writeFileSync(VIDEO, NOT_A_REAL_RECORDING)

  app = await liveApp({ opensAt: 'full', name: 'video-from-the-door', viewport: { width: 1440, height: 1000 } })
  app.page.on('request', (req) => {
    if (req.url().includes('/api/file?path=')) asked.push({ url: req.url(), range: req.headers()['range'] ?? null, status: null })
  })
  app.page.on('response', (res) => {
    const one = asked.find((a) => a.url === res.url() && a.status === null)
    if (one !== undefined) one.status = res.status()
  })

  const setting = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: 'with-page' }),
  })
  expect(setting.status, await setting.clone().text()).toBe(200)

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report with a recording in it',
      summary: 'One video, played from the door.',
      data: {
        blocks: [
          { id: 'b-1', type: 'heading', text: 'What was recorded' },
          { id: 'b-2', type: 'text', text: 'The report body carries one recording, and the player is what asks for it.' },
          { id: 'b-3', type: 'image', path: VIDEO, alt: WHAT_IT_SHOWS },
        ],
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  recordId = ((await filed.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (OURS !== '') rmSync(OURS, { recursive: true, force: true })
}, 60_000)

describe("a report's video is played from the door", () => {
  it('hands the player the door address with its project, offers the whole file, and the player asks for a stretch', async () => {
    await app.page.goto(`${app.site}/#${recordPath(recordId)}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.sb-image video', { timeout: 30_000 })

    const src = await app.page.$eval('.sb-image video', (video) => video.getAttribute('src') ?? '')
    expect(src.startsWith('blob:'), `the player was handed a copy in the page: ${src}`).toBe(false)
    expect(src).toContain('/api/file?path=')
    expect(src).toContain(encodeURIComponent(VIDEO))
    expect(src).toContain('&workspace=default')

    const save = await app.page.$eval('.sb-image a.sb-video-save', (a) => a.getAttribute('href') ?? '')
    expect(save).toContain(encodeURIComponent(VIDEO))
    expect(save).toContain('&workspace=default')
    expect(save).toContain('&download=1')

    // THE PLAYER ASKED THE DOOR ITSELF, FOR A STRETCH, AND WAS ANSWERED ONE.
    await app.page.waitForFunction(
      () => (document.querySelector('.sb-image video') as HTMLVideoElement | null)?.networkState !== 0,
      undefined,
      { timeout: 30_000 },
    )
    const deadline = Date.now() + 30_000
    let byThePlayer = asked.filter((one) => one.url.includes('&workspace=default') && one.range !== null && one.status !== null)
    while (byThePlayer.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      byThePlayer = asked.filter((one) => one.url.includes('&workspace=default') && one.range !== null && one.status !== null)
    }
    expect(byThePlayer.length, `the player asked for no stretch: ${JSON.stringify(asked)}`).toBeGreaterThan(0)
    expect(byThePlayer[0]?.status).toBe(206)
  }, 180_000)
})
