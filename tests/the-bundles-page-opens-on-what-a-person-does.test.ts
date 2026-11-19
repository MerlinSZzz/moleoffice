// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION B27 AND CRITERION B33: THE PAGE OPENS ON WHAT A PERSON DOES, AND THE CONTROLS ARE HERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE CRITERIA ASK FOR
 * ---------------------------------------------------------------------------------------
 *
 * New copy is taken away, and the contents that used to appear only once it was pressed are drawn
 * at once.
 * `design/bundle/ACCEPTANCE.md`, criterion B27: the page opens on what a person does; the chooser's
 * contents appear without a heading announcing them.
 *
 * On report `u9_a7rjYnz5V`: Choose a reading is taken away, and what it showed is drawn at once.
 * Criterion B33: the making section is drawn on arrival, and the one press that said *Choose a
 * reading* is gone. Drawing the controls asks the server for nothing; the first press on a reading
 * is what produces one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. NO HEADING ANYWHERE ON THE PAGE READS New copy. Every heading is read, not just the panel
 *      titles, so a heading moved into a div and styled the same would still be caught.
 *   2. THE MAKING SECTION IS ON THE PAGE ON ARRIVAL. Its controls are drawn, and there is no
 *      *Choose a reading* press between the reader and them.
 *   3. NOTHING ANNOUNCES THE CONTENTS. The region's first words are the first control's own; a
 *      sentence introducing the controls would land here.
 *   4. THE REGION IS STILL DECLARED AND STILL NAMED, so a comment written on it still has something
 *      to be anchored to and still says what it was written on.
 *   5. THE PANELS THAT DO HAVE HEADINGS STILL HAVE THEM. B27 took one heading away and not the
 *      page's shape, and a test that could pass with every heading deleted would not say so.
 *
 * THE OLD WORDING THIS FILE USED TO DRIVE, AND WHY IT CHANGED. It opened the page, found exactly
 * one button reading *Choose a reading*, pressed it, and only then read the controls. Criterion B33
 * removed that press, so the second and third cases below assert the controls are already here.
 * Test 2 was proving the gate itself; what replaces it is the arrival test in
 * `tests/the-making-section-is-drawn-on-arrival.test.ts`, which also counts the requests.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { SURFACES } from '../src/shared/surfaces.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

/** How the region that makes a copy is found, from the one function that writes the attribute. */
const makesACopy = `[data-target="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'bundles.make' })}"]`
/** The words that used to be a heading over it, taken from the registry rather than typed twice. */
const THE_OLD_HEADING = SURFACES['bundles.make']

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-opens-on-what-a-person-does', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'module',
      title: 'The perception stack',
      summary: 'Everything between the camera and a grasp pose.',
    }),
  })
  if (!res.ok) throw new Error(`the seed module was not filed: ${String(res.status)} ${await res.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the page as somebody arriving at it does. The reload is why: a hash move keeps React state. */
async function openBundlesFresh(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  await page.waitForSelector('#bx-preset')
}

/** Every heading drawn on the page right now, whatever level it is. */
async function everyHeading(): Promise<string[]> {
  return await page.$$eval('.px-page h1, .px-page h2, .px-page h3, .px-page h4, .px-page legend', (all) =>
    all.map((one) => (one.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )
}

describe('the bundles page opens on what a person does', () => {
  it('has no heading reading New copy', async () => {
    await openBundlesFresh()
    expect(await everyHeading(), 'the New copy heading is still on the page').not.toContain(THE_OLD_HEADING)
  }, 120_000)

  it('draws the controls on arrival, with no press between the reader and them', async () => {
    await openBundlesFresh()
    const region = page.locator(makesACopy)
    expect(await region.count(), 'the region that makes a copy is not on the page').toBe(1)
    // THE THREE CHOICES ARE ALL INSIDE THE REGION on arrival: what it is about, what it is for, how
    // detailed. Criterion B33 removed the press that used to put them there.
    for (const id of ['#bx-preset', '#bx-less', '#bx-more', '#bx-name']) {
      expect(await region.locator(id).count(), `${id} is not inside the region on arrival`).toBe(1)
    }
    expect(
      await region.getByRole('button', { name: 'Choose a reading' }).count(),
      'the press that used to open the controls is still here',
    ).toBe(0)
  }, 120_000)

  it('draws the contents with nothing announcing them', async () => {
    await openBundlesFresh()
    const region = page.locator(makesACopy)
    // AND THE REGION ITSELF SAYS NOTHING BEFORE THE FIRST CONTROL. Its first words are the first
    // control's own; a sentence introducing the controls would land here.
    const firstWords = (await region.innerText()).trim().split('\n')[0] ?? ''
    expect(firstWords, 'something announces the contents before the first control').toBe('About')
  }, 120_000)

  it('still declares which part of the screen it is, and still says its name', async () => {
    await openBundlesFresh()
    const named = await page.locator(makesACopy).getAttribute('aria-label')
    expect(named, 'the region that makes a copy is no longer named for somebody pointing at it').toBe(
      THE_OLD_HEADING,
    )
  }, 120_000)

  it('leaves the headings the other panels have', async () => {
    await openBundlesFresh()
    const headings = await everyHeading()
    expect(headings, 'the page lost its own title').toContain('Context bundles')
    expect(headings, 'the filed bundles panel lost its heading').toContain(SURFACES['bundles.filed'])
  }, 120_000)
})
