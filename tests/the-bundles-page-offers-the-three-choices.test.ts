// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BUNDLES PAGE OFFERS THREE CHOICES, NOT TWO, AND SHOWS WHAT AN AGENT IS TOLD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criteria B6, B9, B11 and B17 of `design/bundle/ACCEPTANCE.md`, in a real browser, at 1440 and 390
 * and in the light theme.
 *
 * The page asked two things — what the copy is about, and what it is for — and the owner's register section 8 says
 * three are needed: scope, purpose and how detailed. A decision says the same: problem 8 is how detailed, problem 9 is
 * what to include, and they are not one axis.
 *
 * And `GET /api/brief` — what every arriving agent is handed — was called by no screen at all, so
 * nobody could check what an agent had been told. A decision puts it on this page,
 * read-only, saying it is made by different code.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Every one of these is a control a person presses and a sentence a person reads. A server test
 * proves the route takes a level; it cannot prove there is anywhere to choose one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE THIRD CONTROL EXISTS, and its options are the five positions of the one ladder, named
 *      the way the rest of the product names them.
 *   2. CHOOSING ONE CHANGES THE TEXT, and the page says how many records were drawn shorter.
 *   3. THE MODULES AND PIPELINES CAN BE NARROWED, and the copy then carries what was ticked.
 *   4. THE BRIEF IS ON THE PAGE, behind a press, saying it is made by different code.
 *   5. NONE OF IT OVERFLOWS at 390, in either theme.
 *   6. AN OLDER ANSWER THAT ARRIVES LATE IS NOT DRAWN over the answer to the latest question.
 *
 * Proved by mutation with a control run of this file first, against
 * `src/web/components/BundlePanel.tsx`:
 *
 *   the detail control deleted                          4 of 5 red
 *   the modules control deleted                         3 of 5 red
 *   the brief panel deleted                             1 of 5 red
 *
 * Case 6 was added on 27 September 2026, when two merge-queue runs failed case 3 that way. It is red
 * with the check on `lastQuestion` in `look` taken out, and green with it.
 */
import type { Page, Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { BUNDLE_RUNGS, howFarFromTheAutomaticLevel, rungsMoved, SCOPES } from '../src/shared/bundles.ts'
import { levelLabel, type Rung } from '../src/shared/detail.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import { createI18n } from '../src/shared/i18n.ts'

/** How a panel that declares a surface is found in the page, from the one function that writes it. */
const briefPanel = `[data-target="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'bundles.brief' })}"]`

let app: LiveApp
let page: Page
const en = createI18n('en')

const WHOLE = 'The perception stack'
const CHILD = 'Frame intake'
const ATOMIC = 'The logging shim'

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-three-choices', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const post = async (path: string, body: unknown): Promise<any> => {
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return res.json()
  }
  // A module made of modules and one that is not, which are the owner's own two cases.
  const whole = await post('/api/records', {
    kind: 'module',
    title: WHOLE,
    summary: 'Everything between the camera and a grasp pose.',
  })
  await post('/api/records', {
    kind: 'module',
    title: ATOMIC,
    summary: 'Where every line of output goes.',
  })
  const child = await post('/api/records', {
    kind: 'module',
    title: CHILD,
    summary: 'Where frames enter, and at what rate.',
  })
  await post('/api/links', { fromId: child.record.id, toId: whole.record.id, type: 'part_of' })
  await post('/api/records', {
    kind: 'problem',
    title: 'The far edge of the tray is not segmented at 40 cm',
    data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the page as somebody arriving at it does. The reload is why: a hash move keeps React state. */
async function openBundlesFresh(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
}

/**
 * Open the page in the developer view, which is the only view the agent brief is drawn in.
 *
 * Criterion B26 of `design/bundle/ACCEPTANCE.md`. B17, which
 * the brief test below is for, is unchanged — the brief is still on this page and still behind a
 * press. What B26 changed is which reader sees it, so the test that reads it names that reader.
 * `tests/the-agent-brief-is-only-in-the-developer-view.test.ts` is what pins B26 itself.
 */
async function openBundlesInTheDeveloperView(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/?mode=inspect#/bundles`, {
    waitUntil: 'domcontentloaded',
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
}

/** Open the page, where the controls already are since criterion B33. */
async function openTheChooser(): Promise<void> {
  await openBundlesFresh()
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
}

/**
 * READ THE COPY AT AN OFFSET FROM THE AUTOMATIC LEVELS, AND HAND BACK WHAT THE PAGE THEN SHOWS.
 *
 * CRITERION B31 REPLACED THE MENU OF FIVE ABSOLUTE LEVELS with two presses, less and more, so this
 * takes how far to move rather than which level to name. Zero reads the copy as it stands.
 *
 * IT WAITS FOR THE TEXT TO SAY WHAT WAS ASKED FOR. Waiting for `.bx-text` alone returns at once
 * when a previous reading is already on the screen, and the test then measures the old copy.
 */
async function readAt(moved: number): Promise<{ text: string; said: string }> {
  if (moved === 0) {
    await page.getByRole('button', { name: 'Read what it would say' }).click()
  } else {
    for (let i = 0; i < Math.abs(moved); i += 1) {
      await page.getByRole('button', { name: moved < 0 ? 'Less' : 'More' }).click()
    }
  }
  const wanted =
    moved === 0
      ? 'How detailed: each part at the longest level its share of the size fits'
      : `How detailed: each part ${rungsMoved(moved)}`
  await page.waitForFunction(
    (needle) => (document.querySelector('.bx-text')?.textContent ?? '').includes(needle),
    wanted,
    { timeout: 20_000 },
  )
  return {
    text: (await page.locator('.bx-text').first().innerText()).trim(),
    // BOTH CLASSES. The count of what came back shorter than asked moved into `.bx-shorter` so it
    // stands out — criterion B25 — and it is still one of the sentences this helper is about.
    said: [
      ...(await page.locator('.bx-size').allInnerTexts()),
      ...(await page.locator('.bx-shorter').allInnerTexts()),
    ].join(' '),
  }
}

/** Tick the part that draws the modules and pipelines, which is what makes their control appear. */
async function tickTheStructurePart(): Promise<void> {
  await page.selectOption('#bx-preset', 'custom')
  await page.waitForSelector('.bx-parts')
  await page.locator('.bx-parts').first().locator('.bx-part', { hasText: 'Modules and pipelines' }).first()
    .locator('input[type=checkbox]')
    .check()
  // THE SECOND FIELDSET IS DRAWN BY THAT TICK, and its own list is asked of the server, so waiting
  // for the fieldset is not enough — a test that read it while it still said "Loading" would find
  // no boxes and report that the control does not exist.
  await page.waitForFunction(
    () => {
      const sets = document.querySelectorAll('.bx-parts')
      return sets.length > 1 && (sets[1]?.querySelectorAll('input[type=checkbox]').length ?? 0) > 0
    },
    undefined,
    { timeout: 20_000 },
  )
}

describe('the bundles page offers three choices', () => {
  it('has a control for how detailed, and it is the two presses B31 replaced the menu with', async () => {
    await openTheChooser()
    // CRITERION B31: no absolute level is offered any more. The menu of five is gone and what is
    // there is less, more, and the phrase saying where the levels stand.
    expect(await page.locator('#bx-detail').count(), 'the absolute level menu is still there').toBe(0)
    expect(await page.locator('#bx-less').count(), 'the page has no control for how detailed').toBe(1)
    expect(await page.locator('#bx-more').count(), 'the page has no control for how detailed').toBe(1)
    expect(await page.locator('#bx-shift').innerText()).toBe(howFarFromTheAutomaticLevel(0))
  })

  it('draws a different copy at a different level, and says how many were drawn shorter', async () => {
    await openTheChooser()
    await tickTheStructurePart()

    const asItStands = await readAt(0)
    const oneLess = await readAt(-1)

    // THE TEXT ITSELF CHANGES. A control that changes nothing is the failure this criterion is
    // written against, because a brief is meant to carry fewer fields.
    expect(oneLess.text).not.toBe(asItStands.text)
    expect(oneLess.text).toContain(rungsMoved(-1))

    // AND THE PAGE STILL SAYS HOW MANY RECORDS HAVE NOTHING WRITTEN AT THE LONGEST POSITION. That
    // is a fact about what people wrote, not about the levels this copy came to, and it is the one
    // the count line has always been about — criterion B11.
    //
    // THE LONGEST POSITION IS READ FROM THE DECLARATION. It was Full until criterion B32 on
    // 8 September 2026, when the record itself stopped being a position a copy goes to.
    const longest = levelLabel(BUNDLE_RUNGS[BUNDLE_RUNGS.length - 1] as Rung)
    expect(asItStands.said).toMatch(
      new RegExp(`has words written at ${longest}|nothing written at ${longest}`),
    )
  })

  it('lets a person name which modules and pipelines go in', async () => {
    await openTheChooser()
    await tickTheStructurePart()
    // The second fieldset is the modules and pipelines; it is drawn only because a part that draws
    // them is ticked.
    const boxes = page.locator('.bx-parts').nth(1).locator('input[type=checkbox]')
    expect(await boxes.count(), 'the page has no control for which modules and pipelines').toBeGreaterThan(2)

    // ALL OF THEM TO START, which is a state a person can see rather than a default nobody can.
    const labels = await page.locator('.bx-parts').nth(1).locator('.bx-part strong').allInnerTexts()
    expect(labels).toContain(WHOLE)
    expect(labels).toContain(ATOMIC)

    // UNTICK THE ATOMIC ONE AND THE COPY DOES NOT CARRY IT.
    const at = labels.indexOf(ATOMIC)
    await boxes.nth(at).uncheck()
    const { text } = await readAt(0)
    // IN THE PART THE CHOICE IS ABOUT, and this used to be asserted over the whole copy.
    //
    // Since criterion B18 the change log names the record each row is about, so a module created a
    // moment ago is named there — by the part whose job is to say what was written, not by the part
    // somebody unticked. Asserting over the whole text would make this case fail on an honest
    // sentence and would stop being about the choice at all. `structure` is what B6 is about.
    const lines = text.split('\n')
    const from = lines.findIndex((line) => line.trim() === SCOPES.structure.heading)
    const rest = lines.slice(from + 2)
    const to = rest.findIndex((line) => /^-{20,}$/.test(line.trim()))
    const section = from === -1 ? '' : rest.slice(0, to === -1 ? rest.length : to).join('\n')
    expect(section, 'the modules and pipelines part is in the copy').not.toBe('')
    expect(section).toContain(WHOLE)
    expect(section, 'the copy carried a module that had been unticked').not.toContain(ATOMIC)
  })

  it('draws the answer to the latest question when an older answer arrives after it', async () => {
    await openTheChooser()
    // THE FIRST READING IS HELD. Choosing the copy type asks for a reading of the parts the page opens
    // with, which carry no modules and pipelines part. That question is let through to the server only
    // once the press after it has been answered, so its answer is the one that arrives last.
    let letItGo!: () => void
    const held = new Promise<void>((go) => {
      letItGo = go
    })
    const seen: { first: Request | null } = { first: null }
    const isAPreview = (url: URL): boolean => url.pathname === '/api/bundles/preview'
    await page.route(isAPreview, async (route) => {
      if (seen.first === null) {
        seen.first = route.request()
        await held
      }
      await route.continue()
    })
    try {
      await tickTheStructurePart()
      expect(seen.first, 'choosing the copy type asked for no reading').not.toBeNull()
      const latest = await readAt(0)
      const hasTheStructurePart = (text: string): boolean =>
        text.split('\n').some((line) => line.trim() === SCOPES.structure.heading)
      expect(hasTheStructurePart(latest.text), 'the answer to the press has no modules and pipelines part').toBe(true)

      // THE OLDER ANSWER NOW ARRIVES. Once the browser has it, and has had two frames to draw it,
      // the copy on screen must still be the answer to the press.
      const olderAnswer = page.waitForResponse((r) => r.request() === seen.first)
      letItGo()
      await (await olderAnswer).finished()
      await page.evaluate(
        () => new Promise<void>((go) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(go, 0)))),
      )
      const now = (await page.locator('.bx-text').first().innerText()).trim()
      expect(hasTheStructurePart(now), 'the older answer, with no modules and pipelines part, replaced the latest one').toBe(true)
      expect(now).toBe(latest.text)
    } finally {
      letItGo()
      await page.unroute(isAPreview)
    }
  })

  it('shows what an arriving agent is told', async () => {
    await openBundlesInTheDeveloperView()
    const panel = page.locator(briefPanel)
    expect(await panel.count(), 'the brief is not on the page').toBe(1)

    await panel.getByRole('button', { name: 'Read what an agent is told' }).click()
    await page.waitForSelector(`${briefPanel} .bx-text`)
    const shown = await panel.innerText()
    // WHAT AN AGENT IS ACTUALLY HANDED, and its size.
    expect(shown).toContain('the state of this project, from GET /api/brief')
    for (const piece of en.t('g7a.bundles.briefSize').split(/\{\w+\}/).map((one) => one.trim())) {
      if (piece !== '' && piece !== ',') expect(shown).toContain(piece)
    }
  })

  it('draws all of it inside a 390-wide screen, in the light theme', async () => {
    for (const theme of ['light'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 390, height: 844 })
      await openTheChooser()
      await tickTheStructurePart()
      // NOTHING SCROLLS SIDEWAYS. A layout that passes in the author's head still overflows at 390,
      // which is why this is measured rather than looked at.
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(over, `the page scrolls sideways at 390 in the ${theme} theme`).toBeLessThanOrEqual(1)
      // AND THE THREE CONTROLS ARE ALL REACHABLE THERE.
      for (const id of ['#bx-preset', '#bx-less', '#bx-more', '#bx-name']) {
        expect(await page.locator(id).count(), `${id} is missing at 390 in the ${theme} theme`).toBe(1)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ colorScheme: 'light' })
  })
})
