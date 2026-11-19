// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE SAVED FROM A REPORT IS NAMED AS THE REPORT SHOWS IT. Wave 13y round 135, item 80.
 *
 * On the remote web, the owner pressed save on a file in a report, and the file came down under a string of meaningless
 * characters. A file a report carries is stored on disk under a fresh id with its extension, so two files with one name
 * in two reports stay two files. The name a person reads is the file block's own `name`. The file door named every
 * download by the last part of the stored path, which is that id.
 *
 * On another machine the page and the door are two origins, so a browser ignores the save link's own `download`
 * attribute and takes the name the door sends. That is why the fault showed on the remote web. This test opens the
 * report on 127.0.0.2 and pairs through the product's own pairing page, as
 * tests/a-reports-pictures-and-files-are-saved-from-another-machine.test.ts does. Each case reads two names and
 * compares each with the label the report shows: the name the door gives this browser, and the name the browser gives
 * the download. The door is asked through the browser's own context, so the ask carries the pairing cookie.
 *
 * A browser takes the door's name only where its machine can write that name. This sandbox's browser runs in the POSIX
 * locale, and there Chromium names a file with Chinese characters "download", whatever the door sends. So the Chinese
 * case compares the door's name and not the browser's. Under the C.UTF-8 locale the browser gave the Chinese file the
 * door's name.
 *
 * The door now names the file by the `name` of the block that authorises the read. A picture block shows no name, so a
 * saved picture keeps the stored name: that is the fallback.
 *
 * A TEXT OR MARKDOWN FILE IS A SHOWN KIND IN THE CURRENT DRAWING. Once its type is read, its block draws
 * the name, the size, a Show press and a Save link, and no Open link. So the block is found by the
 * name it shows, and the press this test uses to save it is the block's Save link.
 *
 * Before the names are compared, each file case checks two facts that do not depend on the fix: the stored name on disk
 * is not the shown name, and the page shows the file under its name.
 *
 * Red before the code: cases 1 and 2 found each file named by its stored id. Case 3 is a guard on the fallback and
 * passed at the old code too.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { recordPath } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { png } from './checker-fixtures.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

/** The report lives in a project that is not `default`, as the owner's did. */
const PROJECT = 'robotics'
/** The address the server listens on for other machines, in this test's stack. */
const OTHER_MACHINE = '127.0.0.2'

/** Two made-up files, one with an English name and one with a Chinese one, and a made-up picture. */
const ENGLISH = { name: 'Grip test results.txt', bytes: Buffer.from('Test file: made-up grip test results.\n') }
const CHINESE = { name: '夹爪测试结果.txt', bytes: Buffer.from('Test file: made-up grip test results, in a file with a Chinese name.\n') }
const A_PICTURE = png({ width: 320, height: 180 })

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

interface Stored { path: string; name: string; size: number; hash: string }

let app: LiveApp
let english: Stored
let chinese: Stored
let picture: Stored

beforeAll(async () => {
  app = await liveApp({
    name: 'a-saved-file-is-named-as-the-report-shows-it',
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

  // THE PICTURE LOADS WITH THE PAGE, so its save link is drawn without a press,
  // as tests/a-reports-pictures-and-files-are-saved-from-another-machine.test.ts sets it.
  const setting = await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}`, {
    method: 'PATCH',
    headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': 'default' },
    body: JSON.stringify({ mediaLoad: 'with-page' }),
  })
  expect(setting.status, await setting.clone().text()).toBe(200)

  // EACH FILE GOES IN THROUGH THE DOOR A REPORT'S FILES GO IN BY, so it is stored under an id, as the owner's was.
  const store = async (name: string, bytes: Buffer): Promise<Stored> => {
    const sent = await post('/api/report-files', PROJECT, { bytes: bytes.toString('base64'), name })
    expect(sent.status, await sent.clone().text()).toBe(201)
    return ((await sent.json()) as { file: Stored }).file
  }
  english = await store(ENGLISH.name, ENGLISH.bytes)
  chinese = await store(CHINESE.name, CHINESE.bytes)
  picture = await store('slide-1.png', A_PICTURE)

  const filed = await post('/api/records', PROJECT, {
    kind: 'report',
    title: 'Test report · two files and a picture to save',
    summary: 'Each one is saved from another machine.',
    data: {
      blocks: [
        { id: 'b-1', type: 'text', text: 'The results, in two files, and the first slide.' },
        { id: 'b-2', type: 'file', ...english },
        { id: 'b-3', type: 'file', ...chinese },
        { id: 'b-4', type: 'image', path: picture.path, alt: 'The first slide' },
      ],
    },
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const recordId = ((await filed.json()) as { record: { id: string } }).record.id

  // THE MACHINE THE OFFICE SEES. A browser on this computer reaching the door for other machines arrives with
  // 127.0.0.1 as its peer, so that is the address trusted, as the pairing test does.
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
  const device = (await app.page.locator('.pair-device').first().textContent())?.trim() ?? ''
  await askPress.click()
  const deadline = Date.now() + 30_000
  let waiting: { id: string } | undefined
  while (waiting === undefined && Date.now() < deadline) {
    const listed = (await (
      await fetch(`${app.api}/api/office/visitors`, { headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': 'default' } })
    ).json()) as { credentials: { id: string; handle: string; standing: string }[] }
    waiting = listed.credentials.find((one) => one.handle === device && one.standing === 'pending')
    if (waiting === undefined) await new Promise((resolve) => setTimeout(resolve, 250))
  }
  expect(waiting, `no pending credential was issued for "${device}"`).toBeDefined()
  const confirmed = await post(`/api/office/visitors/${String(waiting?.id)}/confirm`, 'default', {})
  expect(confirmed.status, await confirmed.clone().text()).toBe(200)

  await app.page.goto(atOtherMachines(`/#${recordPath(recordId)}`), { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.sb-file').first().waitFor({ timeout: 30_000 })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Press one save link and wait for the browser's own download: the name the browser gives it, and its bytes. */
async function saved(link: ReturnType<LiveApp['page']['locator']>): Promise<{ name: string; bytes: Buffer }> {
  await link.waitFor({ timeout: 30_000 })
  const href = (await link.getAttribute('href')) ?? ''
  const [download] = await Promise.all([
    app.page.waitForEvent('download', { timeout: 20_000 }).catch(() => {
      throw new Error(`pressing the save link (${href}) started no download`)
    }),
    link.click(),
  ])
  expect(await download.failure(), `the download from ${href} failed`).toBeNull()
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) }
}

/**
 * The name the door gives this browser for one save link: the header's `filename*`, decoded as a browser decodes it. The
 * ask goes through the browser's own context, so it carries the pairing cookie that the press carries.
 */
async function theNameTheDoorGives(link: ReturnType<LiveApp['page']['locator']>): Promise<string> {
  await link.waitFor({ timeout: 30_000 })
  const href = new URL((await link.getAttribute('href')) ?? '', app.page.url()).toString()
  const answered = await app.page.context().request.get(href)
  expect(answered.status(), `${href}: ${(await answered.text()).slice(0, 300)}`).toBe(200)
  const disposition = answered.headers()['content-disposition'] ?? ''
  const encoded = /filename\*=UTF-8''([^;\s]+)/.exec(disposition)?.[1]
  expect(encoded, `the door sent no UTF-8 name: "${disposition}"`).toBeDefined()
  return decodeURIComponent(encoded ?? '')
}

/** The file block that shows this stored file, found by the name the page shows it under. */
function theFileBlockOf(file: Stored): ReturnType<LiveApp['page']['locator']> {
  return app.page.locator('.sb-file').filter({ hasText: file.name })
}

/** `byTheBrowser` is false for a name this sandbox's browser cannot write, as the head of this file says. */
async function aFileIsSavedUnderItsShownName(
  file: Stored,
  sent: { name: string; bytes: Buffer },
  { byTheBrowser }: { byTheBrowser: boolean },
): Promise<void> {
  // The fixture is the fault's: on disk the file is called by an id, not by the name a person reads.
  expect(basename(file.path)).not.toBe(sent.name)
  expect(basename(file.path)).not.toContain(sent.name.replace(/\.txt$/, ''))
  const block = theFileBlockOf(file)
  await expect.poll(() => block.count(), { timeout: 30_000 }).toBe(1)
  const shown = ((await block.locator('.sb-file-name').textContent()) ?? '').trim()
  expect(shown).toBe(sent.name)

  const link = block.locator('a.sb-file-save')
  expect(await theNameTheDoorGives(link), 'the door names the file by its stored id, not by the name the report shows').toBe(
    shown,
  )
  const got = await saved(link)
  expect(got.bytes.equals(sent.bytes)).toBe(true)
  if (byTheBrowser) expect(got.name, 'the saved file is named by its stored id, not by the name the report shows').toBe(shown)
}

describe('a file saved from a report on another machine', () => {
  it('is named as the report shows it', async () => {
    await aFileIsSavedUnderItsShownName(english, ENGLISH, { byTheBrowser: true })
  }, 120_000)

  it('is named as the report shows it when the name is Chinese', async () => {
    await aFileIsSavedUnderItsShownName(chinese, CHINESE, { byTheBrowser: false })
  }, 120_000)

  it('keeps the stored name for a picture, which the report shows with no name', async () => {
    await app.page.waitForSelector('.sb-image img', { timeout: 30_000 })
    const link = app.page.locator('a.sb-picture-save').first()
    expect(await theNameTheDoorGives(link)).toBe(basename(picture.path))
    const got = await saved(link)
    expect(got.bytes.equals(A_PICTURE)).toBe(true)
    expect(got.name).toBe(basename(picture.path))
  }, 120_000)
})
