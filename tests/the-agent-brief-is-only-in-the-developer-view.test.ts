// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION B26: THE AGENT BRIEF IS DRAWN IN THE DEVELOPER VIEW AND NOWHERE ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE CRITERION ASKS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The agent brief can be hidden from the normal view and appear only in the developer view.
 * `design/bundle/ACCEPTANCE.md`, criterion B26.
 * criterion B26.
 *
 * The panel draws what `GET /api/brief` hands an agent arriving with no memory of the project. It
 * is machinery: a person copying context for somebody else makes no worse immediate decision for
 * not seeing it, which is the test `src/web/lib/mode.ts` states over every item in the product.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS, AND WHY EACH ASSERTION IS THE ONE IT IS
 * ---------------------------------------------------------------------------------------
 *
 *   1. IN THE NORMAL VIEW THE PANEL IS NOT ON THE PAGE. Not merely invisible: the panel is asked
 *      for by the attribute the surface registry writes, AND the page's own text is searched for
 *      the panel's words. A panel hidden with a CSS rule would pass the first and fail the second,
 *      and it is the second that matters to somebody using a screen reader.
 *   2. IN THE DEVELOPER VIEW IT IS THERE, still behind its press, and pressing it still reads the
 *      brief. Nothing is destroyed by B26 and this is what says so.
 *   3. THE REST OF THE PAGE IS THE SAME IN BOTH VIEWS. The heading and the one control the page
 *      opens on are in both, so a test going green because the page failed to draw at all is not
 *      possible.
 *
 * MUTATION, MEASURED 7 SEPTEMBER 2026, after a control run of this file green (3 of 3):
 * in `src/web/components/BundlePanel.tsx`, change `{inspect ? (` before the brief panel to
 * `{true ? (` — the panel is drawn in both views again. Test 1 goes red on both of its
 * assertions; tests 2 and 3 stay green, which is the shape a one-way fault has.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import { createI18n } from '../src/shared/i18n.ts'

/** How a panel that declares a surface is found, from the one function that writes the attribute. */
const briefPanel = `[data-target="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'bundles.brief' })}"]`
/** A sentence only that panel says, so its absence can be measured in the page's words as well. */
const en = createI18n('en')
const ONLY_THE_BRIEF_SAYS = en.t('g7a.bundles.briefHint').split(/\{\w+\}/).map((piece) => piece.trim())

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-brief-developer-view', viewport: { width: 1440, height: 1000 } })
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

/**
 * Open the bundles page in one of the two views.
 *
 * `?mode=inspect` goes BEFORE the hash and does not persist, which is what `src/web/lib/mode.ts`
 * declares it for: a test names a view instead of describing how to reach it. The reload is why the
 * address is read at all — a hash move keeps the React state and the module's boot-time read.
 */
async function open(view: 'normal' | 'developer'): Promise<void> {
  const search = view === 'developer' ? '?mode=inspect' : ''
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/${search}#/bundles`, {
    waitUntil: 'domcontentloaded',
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
}

describe('the agent brief is a developer-view thing', () => {
  it('is not on the page in the normal view, in its words as well as in its shape', async () => {
    await open('normal')
    expect(await page.locator(briefPanel).count(), 'the brief panel is drawn in the normal view').toBe(0)
    const words = await page.locator('body').innerText()
    for (const piece of ONLY_THE_BRIEF_SAYS) expect(words, 'the brief panel is hidden rather than not drawn, so a screen reader still reads it out').not.toContain(piece)
  }, 120_000)

  it('is there in the developer view, behind its press, and the press still reads the brief', async () => {
    await open('developer')
    const panel = page.locator(briefPanel)
    expect(await panel.count(), 'the brief panel is gone from the developer view too').toBe(1)
    // THE SENTENCE IS AT REST, before anything is pressed: a person has to be told what this panel
    // is before they decide to read 46,000 characters of it.
    for (const piece of ONLY_THE_BRIEF_SAYS) expect(await panel.innerText()).toContain(piece)

    await panel.getByRole('button', { name: 'Read what an agent is told' }).click()
    await page.waitForSelector(`${briefPanel} .bx-text`)
    const shown = await panel.innerText()
    expect(shown).toContain('the state of this project, from GET /api/brief')
    expect(shown).toContain('estimate')
  }, 180_000)

  it('changes nothing else: both views open on the same heading and the same controls', async () => {
    for (const view of ['normal', 'developer'] as const) {
      await open(view)
      expect(await page.locator('.px-page h1').innerText(), `the heading in the ${view} view`).toBe(
        'Context bundles',
      )
      // CRITERION B33 REPLACED *the one control the page opens on*: the making section is drawn on
      // arrival, so the page opens on the controls that make a copy, in both views alike.
      expect(
        await page.locator('#bx-preset').count(),
        `the making section is missing in the ${view} view`,
      ).toBe(1)
      expect(
        await page.getByRole('button', { name: 'Choose a reading' }).count(),
        `the removed press is back in the ${view} view`,
      ).toBe(0)
    }
  }, 180_000)
})
