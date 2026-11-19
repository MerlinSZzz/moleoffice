// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON PICKS THE PARTS AND COPIES THEM, WITHOUT REPLAYING ANY NAVIGATION BY HAND.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S SENTENCE THIS FILE IS THE PROOF OF
 * ---------------------------------------------------------------------------------------
 *
 * `design/ROUND-ELEVEN-OWNER-MESSAGE.md` §13: *"The owner therefore has to open Waiting on you
 * items one by one and manually copy them to another Agent. This defeats the reason Context
 * Bundles exist."* And the acceptance in the same section: *"select semantic scope → Copy for
 * agent / export bundle without replaying UI navigation manually."*
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED ON 27 AUGUST 2026, IN CHROMIUM, BEFORE ANY OF THIS
 * ---------------------------------------------------------------------------------------
 *
 * The preset called *Choose what goes in* was offered on every subject and offered no choice:
 *
 *     select #bx-preset -> "custom"
 *     checkboxes in the page: 0
 *     form controls: 2 radios (subject), 1 select (preset), 1 text input (name)
 *     sub-caption: "The person picks the parts."
 *
 * `src/web/api.ts` had no way to send a list of parts, so the caption was false. And the shortest
 * route from a reading to a clipboard was three presses and a hunt: file the bundle, find the row
 * it made in the list below, press Copy it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER, AND WHY NOTHING HERE TOUCHES THE API AFTER THE SEED
 * ---------------------------------------------------------------------------------------
 *
 * The claim is not that a function exists; it is that a person can do this from a screen. The seed
 * records are written over HTTP because they are the PROJECT rather than the act, and from the
 * moment the browser opens `#/bundles` nothing here speaks to the server again. Each block below
 * names the mutation that turns it red.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { BUNDLE_PRESETS, SCOPES } from '../src/shared/bundles.ts'
import { createI18n } from '../src/shared/i18n.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page
const en = createI18n('en')

/** The fork only a person can settle. This is the thing a person would otherwise copy out by hand. */
const FORK = 'Should the tray be re-textured or replaced?'
const QUESTION = 'Should the pads be re-textured, or the whole tray replaced?'
const OPTION = 'Replace the tray: two days, and it makes the regression impossible to attribute.'
const RECOMMENDATION = 'Re-texture the pads. It is reversible and it can be measured on Thursday.'
const EVIDENCE = 'The pads measured 0.3 mm on 26 August 2026, against 0.9 mm when they were fitted.'
/** Read inside the browser, so the two constants have to be spelled where the page can see them. */
const QUESTION_ON_THE_CLIPBOARD = QUESTION
const RECOMMENDATION_ON_THE_CLIPBOARD = RECOMMENDATION

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-parts', viewport: { width: 1440, height: 1000 } })
  page = app.page
  // THE CLIPBOARD IS ASKED FOR RATHER THAN ASSUMED. A headless Chromium refuses a clipboard write
  // by default, and a test that read the refusal as a product fault would be measuring the browser.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.site })

  const post = async (path: string, body: unknown): Promise<any> => {
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return res.json()
  }
  await post('/api/records', {
    kind: 'proposal',
    title: FORK,
    data: {
      question: QUESTION,
      options: ['Re-texture the pads: half a day, and it may not hold.', OPTION],
      recommendation: RECOMMENDATION,
      evidence: [EVIDENCE],
    },
  })
  await post('/api/records', {
    kind: 'problem',
    title: 'The far edge of the tray is not segmented at 40 cm',
    data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheChooser(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  // CRITERION B33 REMOVED THE PRESS THAT USED TO OPEN THIS. The controls are on the page on
  // arrival, so this waits for them rather than pressing *Choose a reading* first.
  await page.waitForSelector('#bx-preset')
}

// ====================================================== the preset named for picking parts picks parts

describe('the preset called Choose what goes in lets a person choose what goes in', () => {
  /** Mutation: draw the fieldset for every preset, or for none. */
  it('draws a box for every declared part, and only on that preset', async () => {
    await openTheChooser()
    // THE CONTROL. On a preset that IS its list, no box is drawn — a control that did nothing
    // would be worse than none, because the server refuses a list sent with any other preset.
    expect(await page.locator('.bx-part input[type=checkbox]').count()).toBe(0)

    await page.selectOption('#bx-preset', 'custom')
    await page.waitForSelector('.bx-part input[type=checkbox]')
    const boxes = await page.locator('.bx-part input[type=checkbox]').count()
    expect(boxes, 'one box per declared part').toBe(Object.keys(SCOPES).length)

    // AND EACH ONE IS NAMED FOR WHAT IT IS TO THE READER, from the one declaration.
    const words = await page.$$eval('.bx-part', (all) => all.map((one) => (one.textContent ?? '').trim()))
    expect(words.some((one) => one.includes(SCOPES.plan.label) && one.includes(SCOPES.plan.says))).toBe(true)
    expect(words.some((one) => one.includes(SCOPES.waitingOnYou.label))).toBe(true)
    expect(words.some((one) => one.includes(SCOPES.schedule.label))).toBe(true)
  }, 90_000)

  /**
   * Mutation: stop sending `slots` from `api.bundlePreview`, which is what the page did before.
   *
   * THE ASSERTION IS THAT THE TICKS REACH THE SERVER, and it is made in both directions: a part
   * that was ticked is in the text and a part that was not is absent from it. One direction alone
   * would pass on a page that sent nothing and got the whole default reading back.
   */
  it('sends what was ticked, so the text holds those parts and not the others', async () => {
    await openTheChooser()
    await page.selectOption('#bx-preset', 'custom')
    await page.waitForSelector('.bx-part input[type=checkbox]')
    // Clear every box, then tick two.
    for (const box of await page.locator('.bx-part input[type=checkbox]').all()) {
      if (await box.isChecked()) await box.uncheck()
    }
    // THE BOX IS NAMED EXACTLY. A loose /Decisions/ matched this part AND the next box, which is
    // called "Decisions already made": a landing renamed the part once called Waiting on
    // you to Decisions while another box already began with that word. The accessible name of the
    // box is its label followed by its `says` sentence, because the label element wraps both, so
    // the whole name is built from SCOPES rather than retyped.
    await page
      .getByRole('checkbox', {
        name: `${SCOPES.waitingOnYou.label} ${SCOPES.waitingOnYou.says}`,
        exact: true,
      })
      .check()
    await page.getByRole('checkbox', { name: new RegExp(SCOPES.schedule.label) }).check()
    await page.getByRole('button', { name: 'Read what it would say' }).click()
    await page.waitForSelector('.bx-text')

    const text = (await page.textContent('.bx-text')) ?? ''
    expect(text).toContain(SCOPES.waitingOnYou.heading)
    expect(text).toContain(SCOPES.schedule.heading)
    expect(text, 'a part nobody ticked must not be in the copy').not.toContain(SCOPES.openLoops.heading)
    expect(text).not.toContain(SCOPES.recentChanges.heading)
  }, 90_000)

  /**
   * OLD WORDING: `draws the server’s refusal in words when nothing is ticked`, and it pressed *Read
   * what it would say*, waited for `.px-error, .bx-text`, and read the refusal off `.px-error`.
   *
   * THE PRESS IT DROVE IS GONE and the request it made must not happen. Criterion B33: the list
   * preset with no part ticked cannot be read, so the page asks the server nothing and says what is
   * needed in the words the shared refusal already holds. It was proving that the server refuses
   * this; that refusal still exists and `tests/a-refusal-writes-nothing.test.ts` still covers the
   * door. What is asserted here now is that the page does not reach the door at all.
   *
   * Mutation: draw the fieldset for every preset, or let the press fire with nothing ticked.
   */
  it('says what is needed when nothing is ticked, and asks the server nothing', async () => {
    await openTheChooser()
    await page.selectOption('#bx-preset', 'custom')
    await page.waitForSelector('.bx-part input[type=checkbox]')
    for (const box of await page.locator('.bx-part input[type=checkbox]').all()) {
      if (await box.isChecked()) await box.uncheck()
    }
    // NOTHING IS ASSEMBLED AND THE PERSON IS TOLD WHY, in the refusal `whyTheseSlotsCannotBeUsed`
    // writes rather than by asking a door whose answer is already known.
    await page.waitForSelector('.px-empty[data-tier="must-act-on"]')
    const said = (await page.textContent('.px-empty[data-tier="must-act-on"]')) ?? ''
    expect(said).toContain(BUNDLE_PRESETS.custom.word)
    expect(said, 'the page does not say a part is still needed').toContain(en.t('g7a.bundles.choosePart', { preset: BUNDLE_PRESETS.custom.word }))
    expect(await page.locator('.bx-text').count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Read what it would say' }).isDisabled()).toBe(true)
  }, 90_000)
})

// ================================================ the whole queue, in one press, from the same screen

describe('the waiting-on-you queue is copied whole, without opening the items one at a time', () => {
  /**
   * Mutation: remove the one-press button and leave only `File this bundle`.
   *
   * THIS IS THE ACCEPTANCE. From a cold page — pick the reading, read it again if you want to, then
   * Copy this text — the fork's question, its options, its recommendation and the evidence on it
   * are all in the copy Mole Office recorded as having left.
   */
  it('carries the fork whole, and records the export, from one press on the reading', async () => {
    await openTheChooser()
    await page.selectOption('#bx-preset', 'owner_governance')
    await page.getByRole('button', { name: 'Read what it would say' }).click()
    await page.waitForSelector('.bx-text')

    const text = (await page.textContent('.bx-text')) ?? ''
    // EVERY FACT THE OWNER'S §13 ASKS FOR, on the one fork this project holds.
    expect(text).toContain(FORK)
    expect(text).toContain(QUESTION)
    expect(text).toContain(OPTION)
    expect(text).toContain(RECOMMENDATION)
    expect(text).toContain(EVIDENCE)
    expect(text).toContain('it is holding nothing up')

    // Plan 7FEOshq3mBGG: the reading names its parts without exposing source paths.
    await page.waitForSelector('.bx-partsread')
    const table = (await page.textContent('.bx-partsread')) ?? ''
    expect(table).toContain(SCOPES.waitingOnYou.label)
    expect(table).not.toContain('forks.ts')

    // AND THE COPY IS ONE PRESS FROM HERE. What lands on the clipboard is what is on the screen,
    // and the button says nothing was recorded in its own words rather than in a sentence under it.
    await page.getByRole('button', { name: 'Copy the bundle', exact: true }).click()
    await page.waitForSelector('button:has-text("Copied")', { timeout: 15_000 })
    const onTheClipboard = await page.evaluate(async () => navigator.clipboard.readText())
    expect(onTheClipboard, 'the fork must reach the clipboard whole').toContain(QUESTION_ON_THE_CLIPBOARD)
    expect(onTheClipboard).toContain(RECOMMENDATION_ON_THE_CLIPBOARD)
  }, 90_000)

  /**
   * Mutation: make one button do both acts, or make `File this and hand it over` copy without
   * writing an export.
   *
   * TWO ACTS ARE TWO BUTTONS. Copying is a person taking what is on their screen; filing and
   * handing over is Mole Office recording that text left the building. A page that drew one as the
   * other would claim an export nobody made, or lose the record of one somebody did.
   */
  it('files and hands over on the other button, and the list says so', async () => {
    await openTheChooser()
    await page.getByRole('button', { name: 'Read what it would say' }).click()
    await page.waitForSelector('.bx-text')
    await page.getByRole('button', { name: 'File this and hand it over' }).click()
    await page.waitForSelector('.bx-said')
    const note = (await page.textContent('.bx-said')) ?? ''
    expect(note).toContain('Export 1')
    expect(note).toMatch(
      // THE SIZE IS IN THE SENTENCE SINCE 8 SEPTEMBER 2026. Third criterion of bundle-5.
      /on your clipboard, [\d,]+ characters, and Mole Office recorded what it carried|was recorded, [\d,]+ characters, and Mole Office kept what it carried/,
    )
    await sleep(300)
    const rows = await page.$$eval('.bx-row', (all) => all.map((r) => (r.textContent ?? '').trim()))
    expect(rows.some((r) => r.includes('handed over once')), 'the press must record an export').toBe(true)
  }, 90_000)

  /** Mutation: hide the preset from a project by declaring it `offeredOn: ['proposal']`. */
  it('offers the governance reading on the project, where a person looking for it would be', async () => {
    await openTheChooser()
    const words = await page.$$eval('#bx-preset option', (all) => all.map((o) => (o.textContent ?? '').trim()))
    expect(words).toContain(BUNDLE_PRESETS.owner_governance.word)
  }, 90_000)
})
