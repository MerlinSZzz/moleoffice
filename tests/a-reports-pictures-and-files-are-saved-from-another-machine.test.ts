// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT'S PICTURES AND FILES ARE SAVED FROM ANOTHER MACHINE, AS ITS VIDEOS ARE.
 *
 * Problem YnVxZz0Md_G4, 4 October 2026, the owner through an agent: on the owner's other machine, report
 * -_6OyH5dmrjM in the robotics project let only its videos be saved. Its two file blocks (a .zip and
 * a .pptx) and its eight pictures could not be. On the workstation the same files came whole from
 * GET /api/file, so the files and the door were sound.
 *
 * WHAT WAS DIFFERENT. A video's save link was built with the project in its address and the API's own
 * origin. A file block's link was the bare `/api/file?path=…`: it named no project, so the door read
 * it in `default` and refused a file a robotics report points at; and it was a path on the page's own
 * server, which is not the API when the page is served apart from it. A picture had no save link at
 * all. Every test before this one filed its report in `default`, the one project in which a link that
 * names none still works, and opened the page on loopback.
 *
 * HOW ANOTHER MACHINE EXISTS IN ONE PROCESS, as tests/the-pairing-page-on-a-trusted-machine.test.ts
 * does it: the server's second listener is on 127.0.0.2, the page is opened there, and the browser
 * pairs through the product's own pairing page, so it holds the key as a cookie, as the browser on the owner's other computer
 * would. The report is filed in a project that is not `default`. Each save link is pressed, and what
 * is measured is the browser's own download: it finished, and it holds every byte of the file. The
 * file block's archive is over the preview limit, as the owner's 134 MB archive was.
 *
 * MUTATION PROOF: in src/web/components/SummaryBlocks.tsx, `whereALinkFetches` made to return the bare
 * `previewUrl(path)` again turns the picture and file cases red, and the video case with them.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { recordPath } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { scrollThePageBy } from './the-page-scroller.ts'
import { testShots } from './where-shots-go.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/** The project the report lives in. Any project but `default` is what the fault needed. */
const PROJECT = 'robotics'
/** The address the server listens on for other machines, in this test's stack. */
const OTHER_MACHINE = '127.0.0.2'

/** A real PNG, 320 by 180 and one colour, large enough to be seen above its save press. */
const A_PICTURE = aPng(320, 180, [91, 141, 239])

/** Over the 25 MB a page may be shown whole, as the owner's archive was. Not a real archive. */
const AN_ARCHIVE = Buffer.alloc(26 * 1024 * 1024, 'not a real archive. ')
/** Bytes that are not a real recording: the player asks for them and cannot decode them. */
const A_RECORDING = Buffer.from('not a real recording. '.repeat(4000))

/** A PNG of one colour, written by hand so the test needs no picture on disk. */
function aPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length)
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc32(typed))
    return Buffer.concat([length, typed, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())])
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** This file's own folder inside .logs/, which is inside a preview root. Removed in afterAll. */
let OURS = ''
let PICTURE = ''
let ARCHIVE = ''
let RECORDING = ''
let app: LiveApp
let recordId = ''
/** The page's address on the other machine, set once the browser is paired. */
let site = ''

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  OURS = mkdtempSync(join(CHECKOUT, '.logs', 'saved-from-another-machine-test-'))
  PICTURE = join(OURS, 'slide-1.png')
  ARCHIVE = join(OURS, 'the-code.zip')
  RECORDING = join(OURS, 'the-arm.mp4')
  writeFileSync(PICTURE, A_PICTURE)
  writeFileSync(ARCHIVE, AN_ARCHIVE)
  writeFileSync(RECORDING, A_RECORDING)

  app = await liveApp({
    name: 'saved-from-another-machine',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
    addressForOtherMachines: OTHER_MACHINE,
  })

  const post = async (path: string, project: string, body: unknown): Promise<Response> =>
    fetch(`${app.api}${path}`, {
      method: 'POST',
      headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': project },
      body: JSON.stringify(body),
    })

  const made = await post('/api/workspaces', 'default', { id: PROJECT, title: 'Robotics' })
  expect([200, 201], await made.clone().text()).toContain(made.status)

  const setting = await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}`, {
    method: 'PATCH',
    headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': 'default' },
    body: JSON.stringify({ mediaLoad: 'with-page' }),
  })
  expect(setting.status, await setting.clone().text()).toBe(200)

  const filed = await post('/api/records', PROJECT, {
    kind: 'report',
    title: 'A report with a picture, a file and a recording',
    summary: 'Each of the three is saved from another machine.',
    data: {
      blocks: [
        { id: 'b-1', type: 'text', text: 'The slide, the code and the recording of the arm.' },
        { id: 'b-2', type: 'image', path: PICTURE, alt: 'The first slide' },
        { id: 'b-3', type: 'file', path: ARCHIVE, name: 'the-code.zip', size: AN_ARCHIVE.length, hash: createHash('sha256').update(AN_ARCHIVE).digest('hex').slice(0, 16) },
        { id: 'b-4', type: 'image', path: RECORDING, alt: 'The arm reaching for the cube' },
      ],
    },
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  recordId = ((await filed.json()) as { record: { id: string } }).record.id

  // THE MACHINE THE OFFICE SEES. A browser on this computer reaching the door for other machines
  // arrives with 127.0.0.1 as its peer, so that is the address trusted, as the pairing test does.
  const trusted = await post('/api/office/trusted-machines', 'default', {
    address: '127.0.0.1',
    note: 'the peer address the other-machines door sees',
  })
  expect([200, 201], await trusted.clone().text()).toContain(trusted.status)

  const atOtherMachines = (path: string): string => `http://${OTHER_MACHINE}:${String(app.webPort)}${path}`
  await app.page.addInitScript((project) => {
    window.localStorage.setItem('mole-office.workspace', project)
  }, PROJECT)

  // THE BROWSER PAIRS THROUGH THE PRODUCT'S OWN PAGE, and the owner confirms on loopback.
  await app.page.goto(atOtherMachines('/#/pairing'), { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  const askPress = app.page.getByRole('button', { name: 'Ask to pair this browser' })
  await askPress.waitFor({ timeout: 30_000 })
  const name = (await app.page.locator('.pair-device').first().textContent())?.trim() ?? ''
  await askPress.click()
  const deadline = Date.now() + 30_000
  let waiting: { id: string } | undefined
  while (waiting === undefined && Date.now() < deadline) {
    const listed = (await (
      await fetch(`${app.api}/api/office/visitors`, { headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': 'default' } })
    ).json()) as { credentials: { id: string; handle: string; standing: string }[] }
    waiting = listed.credentials.find((one) => one.handle === name && one.standing === 'pending')
    if (waiting === undefined) await new Promise((resolve) => setTimeout(resolve, 250))
  }
  expect(waiting, `no pending credential was issued for "${name}"`).toBeDefined()
  const confirmed = await post(`/api/office/visitors/${String(waiting?.id)}/confirm`, 'default', {})
  expect(confirmed.status, await confirmed.clone().text()).toBe(200)

  await app.page.goto(atOtherMachines(`/#${recordPath(recordId)}`), { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  site = atOtherMachines('')
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (OURS !== '') rmSync(OURS, { recursive: true, force: true })
}, 60_000)

/** Press one save link and wait for the browser's own download; the bytes it saved, or why there are none. */
async function saved(selector: string): Promise<Buffer> {
  const link = app.page.locator(selector).first()
  await link.waitFor({ timeout: 30_000 })
  const href = (await link.getAttribute('href')) ?? ''
  const [download] = await Promise.all([
    app.page.waitForEvent('download', { timeout: 20_000 }).catch(() => {
      throw new Error(`pressing ${selector} (${href}) started no download`)
    }),
    link.click(),
  ])
  const failure = await download.failure()
  expect(failure, `the download from ${href} failed`).toBeNull()
  const at = await download.path()
  expect(statSync(at).isFile()).toBe(true)
  return readFileSync(at)
}

describe('a report in another project, opened on another machine', () => {
  it('saves its picture whole, from the door, in its own project', async () => {
    await app.page.waitForSelector('.sb-image img', { timeout: 30_000 })
    const href = await app.page.locator('a.sb-picture-save').first().getAttribute('href')
    expect(href).toContain(`http://${OTHER_MACHINE}:${String(app.apiPort)}/api/file?path=`)
    expect(href).toContain(`&workspace=${PROJECT}`)
    expect(href).toContain(`&record=${recordId}`)
    expect(href).toContain('&download=1')
    expect((await saved('a.sb-picture-save')).equals(A_PICTURE)).toBe(true)
  }, 120_000)

  it("saves a file block's archive whole, over the preview limit", async () => {
    const href = await app.page.locator('.sb-file a.sb-file-save').first().getAttribute('href')
    expect(href).toContain(`&record=${recordId}`)
    const bytes = await saved('.sb-file a.sb-file-save')
    expect(bytes.length).toBe(AN_ARCHIVE.length)
    expect(bytes.equals(AN_ARCHIVE)).toBe(true)
  }, 120_000)

  it('opens a file block from the door in its own project', async () => {
    const href = await app.page.locator('.sb-file a.sb-file-open').first().getAttribute('href')
    expect(href).toContain(`http://${OTHER_MACHINE}:${String(app.apiPort)}/api/file?path=`)
    expect(href).toContain(`&workspace=${PROJECT}`)
    expect(href).toContain(`&record=${recordId}`)
    expect(href).not.toContain('download=1')
  }, 60_000)

  it('saves its video whole, as it did before', async () => {
    expect((await saved('a.sb-video-save')).equals(A_RECORDING)).toBe(true)
  }, 120_000)

  it.skipIf(!process.env['TEST_SHOTS'])('photographs the save presses at 1440, 990, 660 and 390, light and dark, in English and Chinese', async () => {
    const shots = testShots('a-reports-pictures-and-files-are-saved-from-another-machine')
    for (const lang of ['en', 'zh'] as const) {
      for (const width of [1440, 990, 660, 390] as const) {
        for (const scheme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: scheme })
          await app.page.goto('about:blank')
          await app.page.goto(`${site}/?lang=${lang}#${recordPath(recordId)}`, { timeout: 60_000 })
          await waitForThePage(app.page, 60_000)
          await app.page.waitForSelector('.sb-image img', { timeout: 30_000 })
          await app.page.locator('a.sb-picture-save').first().waitFor({ timeout: 30_000 })
          await app.page.locator('.sb-file a.sb-file-save').first().waitFor({ timeout: 30_000 })
          const pictureTop = await app.page.locator('figure.sb-image').first().evaluate((el) => el.getBoundingClientRect().top)
          await scrollThePageBy(app.page, pictureTop - 120)
          await app.page.waitForTimeout(250)
          await app.page.screenshot({ path: join(shots, `save-${String(width)}-${lang}-${scheme}.png`) })
        }
      }
    }
  }, 420_000)
})
