// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION B29: THE COPY OPENS AS A PAGE OF PLAIN TEXT, AND IN A TEXT BOX ON THE PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * After B28 landed: one press that goes straight to a page of plain text, or a press that opens a
 * text box for copying by hand. `design/bundle/ACCEPTANCE.md`, criterion B29.
 *
 * Both work where the clipboard does not, and both sit beside the presses B28 added, because that
 * is where a person stands when the copy they asked for did not happen.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE BROWSER HERE HAS NO CLIPBOARD, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * The same address `tests/copying-on-a-browser-with-no-clipboard.test.ts` uses and for the same
 * reason: this machine's own host name over plain http. It resolves to a loopback address, so the
 * stack is reachable from nowhere but this machine, and it is a name rather than a loopback
 * literal, which is what makes a browser call the page insecure. `127.0.0.2` cannot be used —
 * Chromium treats all of 127.0.0.0/8 as trustworthy and a page there has a clipboard.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE ADDRESS SERVES text/plain, AND IT IS THE COPY. Fetched as a page rather than as an API
 *      call: the content type is read off the reply, and the body carries this project's records.
 *   2. THE PRESS ON THE PAGE GOES THERE. The link beside the B28 presses carries that address, and
 *      opening it draws the copy — measured in a real second tab, not from the href alone.
 *   3. THE TEXT BOX OPENS ON A PRESS, holds the whole copy, is read-only, and comes up selected, so
 *      the next key a person presses is the one that copies.
 *   4. THE FILED ROW HAS ITS OWN ADDRESS, which names no project because the record knows.
 *   5. THE DOOR NAMES ITS PROJECT OR REFUSES. A page that named none is answered with words saying
 *      so, and never with a copy of the default project.
 *   6. IT RECORDS NOTHING. Opening the page does not write an export, which is what tells this door
 *      apart from the export door it otherwise resembles.
 *
 * THE CONFINEMENT IS THE EXPORT'S, and the one thing not measured here is its 409: this corpus has
 * no record whose validity limits cannot be read, so there is nothing to make it refuse.
 * `tests/a-bundle-never-leaves-a-restriction-behind.test.ts` is where that refusal is measured on
 * the export, and `textOrTheRefusal` in `src/server/api/bundle.ts` is the one place both doors ask.
 *
 * FIVE MUTATIONS, MEASURED 7 SEPTEMBER 2026, after a control run of this file green (6 of 6). Each
 * one is red exactly where it should be and green everywhere else, which is what says these six
 * are six tests rather than one test written six times.
 *
 *   src/server/api/bundle.ts, serve the page as text/html                 3 red (1, 4, 5)
 *   src/server/api/bundle.ts, fall back to the default project            1 red (5)
 *   src/server/api/bundle.ts, let the filed page write an export entry     1 red (6)
 *   src/web/components/BundlePanel.tsx, open the box unselected           1 red (3)
 *   src/web/api.ts, point the press at the preview instead                1 red (2)
 *
 * Restored, six of six pass.
 */
import os from 'node:os'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, trustTheMachineThatCallsThroughTheOtherDoor, type LiveApp } from './helpers.ts'
import { BUNDLE_RUNGS } from '../src/shared/bundles.ts'

/**
 * THE LONGEST POSITION A COPY HAS, read from the declaration rather than spelled here.
 *
 * It was `full` until criterion B32 on 8 September 2026. This file is about the two text doors, so
 * it asks for the longest position and reads back what came through them.
 */
const TOP = String(BUNDLE_RUNGS[BUNDLE_RUNGS.length - 1])

/** The address that is not a secure context: this machine's own name, lower-cased. */
const THIS_MACHINE = os.hostname().toLowerCase()

/** What this file puts in the corpus, so finding it proves the page carried this project. */
const PROBLEM = 'The far edge of the tray is not segmented at 40 cm'
/** The opening line of every assembled copy. It is in the text and in no title. */
const THE_TEXT_OPENS_WITH = 'CONTEXT FROM MOLE OFFICE'

let app: LiveApp
let page: Page
let insecureSite = ''

beforeAll(async () => {
  app = await liveApp({
    name: 'bundle-as-plain-text',
    viewport: { width: 1440, height: 1000 },
    addressForOtherMachines: THIS_MACHINE,
  })
  page = app.page
  insecureSite = `http://${THIS_MACHINE}:${String(app.webPort)}`
  // THE PAGE ON THIS MACHINE'S NAME IS THE CASE OF THE OWNER'S OTHER COMPUTER, WHICH THE OWNER TRUSTS. Its requests carry the owner's name
  // and no key, and since item 1 of a decision, that counts as the owner only from a machine the office trusts while
  // the window is open. `trustTheMachineThatCallsThroughTheOtherDoor` in tests/helpers.ts says
  // how.
  await trustTheMachineThatCallsThroughTheOtherDoor(
    { api: app.api, keysFile: join(app.dir, 'keys.json') },
    `http://${THIS_MACHINE}:${String(app.apiPort)}`,
  )
  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'problem',
      title: PROBLEM,
      summary: 'Segmentation drops the far edge of the tray at forty centimetres.',
      data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
    }),
  })
  if (!res.ok) throw new Error(`the seed problem was not filed: ${String(res.status)} ${await res.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Which project this stack files into, which is what a link has to name. */
const WORKSPACE = 'default'

/** Open the bundles page on the address with no clipboard, and read what a copy would say. */
async function readWhatItWouldSay(): Promise<void> {
  await page.goto(`${insecureSite}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('.bx-text')
}

/** Press the copy, on a browser that has none, and wait for the block that answers it. */
async function pressCopyAndWaitForTheBlock(): Promise<void> {
  await page.getByRole('button', { name: 'Copy the bundle', exact: true }).click()
  await page.locator('.bx-nocopy').waitFor({ timeout: 15_000 })
}

/** How many exports the server has recorded across every filed bundle. */
async function exportsRecorded(): Promise<number> {
  const listed = (await (await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/bundles`)).json()) as {
    bundles: { exports: unknown[] }[]
  }
  return listed.bundles.reduce((n, one) => n + one.exports.length, 0)
}

describe('the copy can be opened as plain text', () => {
  it('is served as text/plain, and it is this project', async () => {
    const at = `http://127.0.0.1:${String(app.apiPort)}/api/bundles/as-text?workspace=${WORKSPACE}&preset=recover_project&detail=${TOP}`
    const reply = await fetch(at)
    expect(reply.status, 'the plain-text door did not answer').toBe(200)
    // THE CONTENT TYPE IS THE POINT. A browser draws what it is told this is, and told anything
    // else it would run some of what people wrote into their records.
    expect(reply.headers.get('content-type') ?? '').toContain('text/plain')
    const body = await reply.text()
    expect(body).toContain(THE_TEXT_OPENS_WITH)
    expect(body, 'the page carries no record of this project').toContain(PROBLEM)
    // AND IT IS TEXT, not a reply about text: a JSON envelope would start with a brace.
    expect(body.trimStart().startsWith('{'), 'the door answered JSON').toBe(false)
  }, 120_000)

  it('is where the press beside the B28 presses goes, opened in a real tab', async () => {
    await readWhatItWouldSay()
    await pressCopyAndWaitForTheBlock()
    const link = page.locator('.bx-nocopy').getByRole('link', { name: 'Open it as a page of text' })
    expect(await link.count(), 'there is no press that opens the copy as a page').toBe(1)
    const address = await link.getAttribute('href')
    expect(address ?? '', 'the press names no address').toContain('/api/bundles/as-text')
    // THE PROJECT IS IN THE ADDRESS, because the tab this opens sends none of the app's headers.
    expect(address ?? '').toContain(`workspace=${WORKSPACE}`)

    // OPENED, NOT INFERRED FROM THE href. A link that names the right address and opens a page
    // saying something else would pass every assertion above.
    const opened = await app.browser.newPage()
    await opened.goto(address ?? '', { waitUntil: 'domcontentloaded' })
    const drawn = await opened.locator('body').innerText()
    expect(drawn).toContain(THE_TEXT_OPENS_WITH)
    expect(drawn, 'the page carries no record of this project').toContain(PROBLEM)
    await opened.close()
  }, 180_000)

  it('opens the whole copy in a text box, read-only and already selected', async () => {
    await readWhatItWouldSay()
    await pressCopyAndWaitForTheBlock()
    const block = page.locator('.bx-nocopy')
    // IT IS BEHIND A PRESS. A text box drawn before anybody asked is the page opening on a control
    // nobody wanted, which is the reading rule the chooser above obeys.
    expect(await block.locator('textarea').count(), 'the text box is on the page before the press').toBe(0)

    await block.getByRole('button', { name: 'Open it in a text box' }).click()
    const box = block.locator('textarea')
    await box.waitFor({ timeout: 15_000 })
    const inside = await box.inputValue()
    expect(inside).toContain(THE_TEXT_OPENS_WITH)
    expect(inside, 'the box holds no record of this project').toContain(PROBLEM)
    expect(await box.getAttribute('readonly'), 'the box can be edited').not.toBeNull()

    // SELECTED, so the next key a person presses copies. Read off the element rather than assumed,
    // and polled rather than read once: the page selects it as the box is drawn, and a single read
    // taken in the same instant would be a race this test could lose on a loaded machine.
    const howMuchIsSelected = async (): Promise<number> =>
      await box.evaluate((el) => {
        const area = el as HTMLTextAreaElement
        return area.selectionEnd - area.selectionStart
      })
    const wholeLength = inside.length
    expect(wholeLength).toBeGreaterThan(100)
    await expect
      .poll(howMuchIsSelected, { timeout: 15_000, message: 'the box came up with nothing selected' })
      .toBe(wholeLength)
  }, 180_000)

  it('gives a filed row its own address, naming no project', async () => {
    await readWhatItWouldSay()
    await page.getByRole('button', { name: /^Keep it for later/ }).click()
    await page.waitForSelector('.bx-said')
    const row = page.locator('.bx-row').first()
    await row.waitFor({ timeout: 15_000 })
    await row.getByRole('button', { name: 'Copy it' }).click()
    await row.locator('.bx-nocopy').waitFor({ timeout: 30_000 })

    const address =
      (await row.locator('.bx-nocopy').getByRole('link', { name: 'Open it as a page of text' }).getAttribute('href')) ??
      ''
    expect(address, 'the row names no page of text').toMatch(/\/api\/bundles\/[^/]+\/as-text$/)
    // NO PROJECT IN IT: the bundle is a record and the record knows which project it is in.
    expect(address, 'the row address names a project it does not need').not.toContain('workspace=')

    const reply = await fetch(address)
    expect(reply.status).toBe(200)
    expect(reply.headers.get('content-type') ?? '').toContain('text/plain')
    expect(await reply.text()).toContain(PROBLEM)
  }, 240_000)

  it('refuses in words when the address names no project, and never answers about the default', async () => {
    const reply = await fetch(
      `http://127.0.0.1:${String(app.apiPort)}/api/bundles/as-text?preset=recover_project&detail=${TOP}`,
    )
    expect(reply.status, 'a page naming no project was answered as if it had').toBe(400)
    expect(reply.headers.get('content-type') ?? '').toContain('text/plain')
    const said = await reply.text()
    expect(said).toContain('named no project')
    expect(said, 'it answered with a copy anyway').not.toContain(THE_TEXT_OPENS_WITH)
  }, 60_000)

  it('records nothing, which is what tells this door from the export door', async () => {
    await readWhatItWouldSay()
    await page.getByRole('button', { name: /^Keep it for later/ }).click()
    await page.waitForSelector('.bx-said')
    const row = page.locator('.bx-row').first()
    await row.waitFor({ timeout: 15_000 })
    const filed = (await (await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/bundles`)).json()) as {
      bundles: { id: string }[]
    }
    const id = filed.bundles[0]?.id ?? ''
    expect(id, 'no bundle was filed, so there is nothing to open').not.toBe('')

    // BOTH DOORS, and the filed one first: it is the one that HAS a record to write an export on,
    // so it is the one where a future change could quietly make opening a page an act.
    const before = await exportsRecorded()
    for (const address of [
      `http://127.0.0.1:${String(app.apiPort)}/api/bundles/${id}/as-text`,
      `http://127.0.0.1:${String(app.apiPort)}/api/bundles/as-text?workspace=${WORKSPACE}&preset=recover_project&detail=${TOP}`,
    ]) {
      for (let i = 0; i < 3; i += 1) expect((await fetch(address)).status).toBe(200)
    }
    expect(await exportsRecorded(), 'opening the page as text recorded an export').toBe(before)
  }, 240_000)
})
