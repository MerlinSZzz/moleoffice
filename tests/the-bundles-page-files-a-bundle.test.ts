// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ACT THIS PAGE EXISTS FOR HAS A DOOR THAT IS NOT `curl`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, IN THE VERIFIER'S OWN MEASUREMENT
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/verification/wave-12.json`, fatal:
 *
 * > NOTHING ON ANY SCREEN FILES A BUNDLE […] `src/web/api.ts` has exactly three bundle calls —
 * > `bundles()`, `bundlePreview()` and `exportBundle(id)` — and no create […] On the owner's own
 * > corpus the page reads *No bundles are filed here yet* and there is no control that changes
 * > that. Every `Copy it` button I pressed exists only because I filed the bundle with curl first.
 *
 * And beside it, a major with the same cause:
 *
 * > THREE OF THE SIX PRESETS CAN NEVER BE CHOSEN. `BundlePanel.tsx` calls `presetsFor(null)` — the
 * > scope is hardcoded to the project […] `critique_module`, `investigate_problem` and
 * > `understand_pipeline` are `offeredOn: ['module'|'problem'|'pipeline']`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER, AND WHY NOTHING HERE TOUCHES THE API
 * ---------------------------------------------------------------------------------------
 *
 * The claim is not "a function exists". It is "a person can do this from a screen", and the four
 * waves this campaign has caught shipping a server half all had functions. So the whole of the act
 * below happens through the page: the seed records are written over HTTP because they are the
 * PROJECT, not the act, and from the moment the browser opens `#/bundles` nothing in this file
 * speaks to the server again. The bundle is filed by pressing buttons, and the proof it was filed
 * is that the page's own list — which is a fresh read of `GET /api/bundles` — draws the row.
 *
 * Rendering the component to markup would prove none of it. The chooser is behind a press, the
 * preset menu is behind choosing a subject, and both of those are state this page only reaches
 * after somebody does something. `tests/read-before-edit.test.ts` and
 * `tests/planning-refusal-visible.test.ts` make the same argument and use the same harness.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL, WITHOUT WHICH THE PRESET ASSERTIONS WOULD PASS ON A BROKEN PAGE
 * ---------------------------------------------------------------------------------------
 *
 * `the project is offered exactly what a project is offered` is here so that "the menu holds
 * critique this module" cannot pass by the menu holding everything. One of these two must be able
 * to fail whatever the page does, and together they say the menu is NARROWED rather than long.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { BUNDLE_PRESETS } from '../src/shared/bundles.ts'
import { createI18n } from '../src/shared/i18n.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page
let apiPort: number
const en = createI18n('en')

/** The records the project holds. Written over HTTP because they are the project, not the act. */
const MODULE = 'Wrist camera intake'
const PROBLEM = 'The far edge of the tray is not segmented at 40 cm'

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-door', viewport: { width: 1440, height: 1000 } })
  page = app.page
  apiPort = app.apiPort

  const post = async (path: string, body: unknown): Promise<unknown> => {
    const res = await fetch(`http://127.0.0.1:${String(apiPort)}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return res.json()
  }
  await post('/api/records', { kind: 'module', title: MODULE, data: { context: 'Where frames enter the pipeline.' } })
  // An open loop, so the project scope has something to carry.
  await post('/api/records', {
    kind: 'problem',
    title: PROBLEM,
    data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * OPEN `#/bundles` ON A FRESHLY MOUNTED PAGE.
 *
 * `page.goto` TO A URL THAT DIFFERS ONLY IN ITS FRAGMENT IS A SAME-DOCUMENT NAVIGATION — the
 * browser moves the hash and the React tree keeps every piece of state it had. Without the reload
 * below, the second test in this file left the chooser open and every later `Choose a reading`
 * waited thirty seconds for a button that was not there, which is a test harness measuring itself.
 * The reload is what makes each test below start where a person opening the page starts.
 */
async function openBundlesFresh(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
}

/** Open the page fresh, where every control lives since criterion B33. */
async function openTheChooser(): Promise<void> {
  await openBundlesFresh()
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
}

/** The words in the preset menu, as a person reading the dropdown would see them. */
async function presetWordsOnScreen(): Promise<string[]> {
  return page.$$eval('#bx-preset option', (options) => options.map((o) => (o.textContent ?? '').trim()))
}

/** Choose the record subject and pick the first hit whose title is this one. */
async function chooseTheRecord(title: string): Promise<void> {
  await page.getByRole('radio', { name: /One record/ }).check()
  await page.fill('#bx-find', title.slice(0, 24))
  await page.waitForSelector('.bx-hit')
  await page.getByRole('button', { name: new RegExp(title.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click()
  await page.waitForSelector('.bx-chosen')
}

describe('a person can file a bundle without an HTTP client', () => {
  it('draws the controls on arrival, with no press opening them', async () => {
    await openBundlesFresh()
    // CRITERION B33: the making section is on the page on arrival. It used to open on one button
    // reading *Choose a reading*, and this test used to assert that button and the absence of every
    // control behind it. That press is gone, so what is asserted is the controls themselves.
    expect(await page.locator('#bx-preset').count()).toBe(1)
    expect(await page.locator('#bx-name').count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Choose a reading' }).count()).toBe(0)
  }, 60_000)

  it('files one over the whole project, by pressing buttons and nothing else', async () => {
    await openTheChooser()
    // THE SUGGESTION NAMES THE PROJECT THE COPY IS ABOUT BY ITS TITLE, and the
    // titles are read after the page opens, so the box is read once the project's title has arrived.
    await page.waitForFunction(() => (document.querySelector('.bxp-kept-count')?.textContent ?? '').includes('Counted in Default'))
    // The name box carries a suggestion a person can read and change, rather than a value filled
    // in behind them. Whatever it holds is what gets stored, which is the next assertion.
    const suggested = await page.inputValue('#bx-name')
    expect(suggested).toContain('Default')
    expect(suggested.length, 'the name box must carry a readable suggestion').toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Keep it for later' }).click()
    await page.waitForSelector('.bx-said')

    // THE PAGE SAYS WHAT HAPPENED, and it says the thing that is easiest to get wrong: filing is
    // not handing over.
    const note = (await page.textContent('.bx-said')) ?? ''
    expect(note).toContain('Kept as')
    expect(note).toContain('Nothing has been handed over yet')

    // AND THE LIST BELOW DRAWS IT. That list is a fresh `GET /api/bundles`, so this is the server's
    // own answer and not this component remembering what it just did.
    await page.waitForSelector('.bx-row')
    const rows = await page.$$eval('.bx-row', (all) => all.map((r) => (r.textContent ?? '').trim()))
    expect(rows.length).toBe(1)
    expect(rows[0]).toContain(suggested)
    // Plan 7FEOshq3mBGG: an ordinary lack of exports is the short mark.
    expect(await page.locator('.bx-row .bx-exports .px-absent').count()).toBe(1)
    expect(rows[0]).not.toContain('never handed over')
  }, 60_000)

  it('and the bundle it filed can then be handed over from the same page', async () => {
    // THE OTHER HALF OF THE FATAL. The verifier could press `Copy it` only because they had filed
    // the bundle with curl; this row was filed by the test above, through the screen.
    await openBundlesFresh()
    await page.waitForSelector('.bx-row')
    await page.getByRole('button', { name: 'Copy it' }).first().click()
    await page.waitForSelector('.bx-said')
    const note = (await page.textContent('.bx-said')) ?? ''
    expect(note).toContain('Export 1')
    // EITHER SENTENCE IS THE RIGHT ONE, and which arrives depends on the browser rather than on
    // Mole Office: a browser gives a page the clipboard only over https or on the machine the page came
    // from, and a headless Chromium can refuse the write on top of that. The page's whole point here
    // is that the EXPORT is recorded either way and the sentence says which happened, so both are
    // asserted for rather than one being made to appear. Criterion B28 is what the second sentence
    // now reads, and tests/copying-on-a-browser-with-no-clipboard.test.ts is what pins it.
    // THE SENTENCE CARRIES THE SIZE SINCE 8 SEPTEMBER 2026, which is the third criterion of
    // bundle-5: the answer stands beside the press that made it and says how big what left was.
    expect(note).toMatch(
      /on your clipboard, [\d,]+ characters, and Mole Office recorded what it carried|was recorded, [\d,]+ characters, and Mole Office kept what it carried/,
    )
    // The row now says so, from the server's own read.
    await sleep(200)
    const row = (await page.textContent('.bx-row')) ?? ''
    expect(row).toContain('handed over once')
  }, 60_000)
})

describe('the subject decides the reading, so three presets stop being unreachable', () => {
  it('offers a project exactly what a project is offered, and not the whole declaration', async () => {
    // THE CONTROL. Without this, every assertion below would pass on a menu that listed all six.
    await openTheChooser()
    const words = await presetWordsOnScreen()
    expect(words).toContain(BUNDLE_PRESETS.recover_project.word)
    expect(words).toContain(BUNDLE_PRESETS.continue.word)
    expect(words).not.toContain(BUNDLE_PRESETS.critique_module.word)
    expect(words).not.toContain(BUNDLE_PRESETS.investigate_problem.word)
    expect(words).not.toContain(BUNDLE_PRESETS.understand_pipeline.word)
  }, 60_000)

  it('offers CRITIQUE THIS MODULE once the subject is a module, which no screen could reach before', async () => {
    await openTheChooser()
    await chooseTheRecord(MODULE)
    const words = await presetWordsOnScreen()
    expect(words).toContain(BUNDLE_PRESETS.critique_module.word)
    // And `recover_project` is gone, because a module is not a project. The narrowing is real.
    expect(words).not.toContain(BUNDLE_PRESETS.recover_project.word)
  }, 60_000)

  it('offers INVESTIGATE THIS PROBLEM once the subject is a problem', async () => {
    await openTheChooser()
    await chooseTheRecord(PROBLEM)
    const words = await presetWordsOnScreen()
    expect(words).toContain(BUNDLE_PRESETS.investigate_problem.word)
    expect(words).not.toContain(BUNDLE_PRESETS.critique_module.word)
  }, 60_000)

  it('files a bundle ABOUT a module, on a preset a project can never be given', async () => {
    // THE DOGFOOD'S OWN STEP 6, WORD FOR WORD: "From a real module: create a bundle."
    await openTheChooser()
    await chooseTheRecord(MODULE)
    await page.selectOption('#bx-preset', 'critique_module')
    const suggested = await page.inputValue('#bx-name')
    expect(suggested, 'the suggested name follows the subject and the reading').toContain(MODULE)
    await page.getByRole('button', { name: 'Keep it for later' }).click()
    await page.waitForSelector('.bx-said')
    await sleep(300)
    const rows = await page.$$eval('.bx-row', (all) => all.map((r) => (r.textContent ?? '').trim()))
    const filed = rows.find((r) => r.includes(suggested))
    expect(filed, `no row on the page carries "${suggested}"`).toBeDefined()
    expect(String(filed)).toContain(BUNDLE_PRESETS.critique_module.word)
  }, 60_000)

  it('reads the module rather than the project, so the record scope actually reaches the server', async () => {
    // A SCOPE THE PAGE DOES NOT SEND IS A SCOPE THAT DOES NOTHING, and the earlier version of this
    // page sent none: `api.bundlePreview({ preset })` with no scope at all. So this drives the
    // preview on a record subject and asserts the text is ABOUT that record.
    await openTheChooser()
    await chooseTheRecord(MODULE)
    await page.getByRole('button', { name: 'Read what it would say' }).click()
    await page.waitForSelector('.bx-text')
    const text = (await page.textContent('.bx-text')) ?? ''
    expect(text).toContain(MODULE)
    // The project reading of the same corpus opens on the project, not on the module's own name.
    await openTheChooser()
    await page.getByRole('button', { name: 'Read what it would say' }).click()
    await page.waitForSelector('.bx-text')
    const whole = (await page.textContent('.bx-text')) ?? ''
    expect(whole).not.toBe(text)
  }, 60_000)

  it('will not read or file a record scope with no record chosen, and says why rather than failing', async () => {
    await openTheChooser()
    await page.getByRole('radio', { name: /One record/ }).check()
    // THE SENTENCE COMES THROUGH `Absence` AT THE must-act-on TIER, so it is drawn as that
    // component's own box — `.px-empty[data-tier="must-act-on"]` — rather than as a paragraph of
    // this page's. `tests/absence-weight.test.ts` is what makes that the only way to draw it.
    await page.waitForSelector('.px-empty[data-tier="must-act-on"]')
    const need = (await page.textContent('.px-empty[data-tier="must-act-on"]')) ?? ''
    expect(need).toContain('No record is chosen')
    // AND THE WAY FORWARD IS BESIDE IT. An absence a reader must act on with no next step is a
    // dead end, which is the whole reason the tier carries an `action`.
    expect(need).toContain(en.t('g7a.bundles.chooseSubjectAction'))
    expect(await page.getByRole('button', { name: 'Read what it would say' }).isDisabled()).toBe(true)
    expect(await page.getByRole('button', { name: 'Keep it for later' }).isDisabled()).toBe(true)
  }, 60_000)
})

describe('at 390, the width a phone gives it', () => {
  it('files a bundle with nothing running off the side of the screen', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    try {
      await openTheChooser()
      await chooseTheRecord(PROBLEM)
      await page.selectOption('#bx-preset', 'investigate_problem')
      await page.getByRole('button', { name: 'Keep it for later' }).click()
      await page.waitForSelector('.bx-said')
      // NOTHING RUNS OFF THE SIDE. A control a phone cannot reach is a control a phone does not
      // have, and the page-level rule in this product is that the body never scrolls sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'the page must not scroll sideways at 390').toBeLessThanOrEqual(1)
    } finally {
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
  }, 60_000)
})
