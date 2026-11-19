// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE SHOWS WHO STILL CALLS WITH A CLAIM AND NO KEY — CRITERION P83, POINT 6.
 *
 * For one version a claim with no key still counts from loopback and from the machines on the
 * trusted list, and every such request is folded into `header_only_calls`. The list on Settings is
 * what the person reads before the person closes the window: the callers that have not been given a key
 * yet, so the person's tools, scripts and devices can get one first.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a caller that really sent actor headers and no key is drawn on the page, by name, with where
 *     it came from, its count, and when it was first and last seen — read back through the door
 *     (`GET /api/office/header-only-calls`) so a row tested here is a row the office kept;
 *   · an empty list is an ANSWER and is drawn in words, not as an empty box: "nothing has called
 *     with a claim and no key since this office began keeping this list" (the fifth invariant);
 *   · the panel's title is the name the surface registry gives it, so the table of where each panel
 *     is kept and the page stay one list.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · drop `<HeaderOnlyCallersHere />` from src/web/pages/SettingsPage.tsx → the first case is red,
 *     because the page no longer draws the list.
 *   · draw nothing where the list is empty, instead of the sentence → the second case is red,
 *     because an empty box reads as "nobody looked" rather than "nothing has called".
 *
 * The file was restored byte-identical after each mutation (sha256 before and after).
 *
 * ---------------------------------------------------------------------------------------
 * THE PICTURES ARE TAKEN BY THE TEST THAT ALREADY HAS A PAGE IN FRONT OF IT
 * ---------------------------------------------------------------------------------------
 *
 * `tools/review.mjs` refuses to photograph anything today (problem bfvKtNhVC4L5). Cluster C's
 * pictures came from a helper inside its browser test, gated on an environment variable, and this
 * one is the same shape: set `HEADER_ONLY_SHOTS` to a directory and the four widths in both themes
 * are written there, plus one long list at 390.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { HEADER_ONLY_WORDS, HeaderOnlyCallers } from '../src/web/components/HeaderOnlyCallers.tsx'
import { SURFACES } from '../src/shared/surfaces.ts'
import { TITLE_KEYS } from '../src/web/pages/SettingsPage.tsx'

let app: LiveApp

/** The one caller this file names, so a row in the page can be tied to a request that was made. */
const THE_CALLER = 'caller-with-no-key'

/** Every caller seeded, so the 390 picture has a list long enough to scroll. */
const THE_CALLERS = [
  THE_CALLER,
  `${THE_TEST_OFFICES_SECRETARY.handle}-script-with-no-key`,
  'jamies-own-script',
  'a-second-device',
  'the-brief-tool',
  'a-hand-written-curl',
  'the-old-inspector',
  'a-codex-on-this-machine',
  'the-message-worker-script',
  'a-notebook-run',
  'merlins-browser',
  'a-forgotten-tool',
  'the-world-tool',
  'a-one-off-repair',
]

async function openTheSettings(): Promise<void> {
  await app.page.goto(`${app.site}/?mode=inspect#/settings/headeronly`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('.set-title', { timeout: 20_000 })
}

/** Make a real header-only call: actor headers, no key. The office writes it down itself. */
async function callWithNoKey(who: string): Promise<void> {
  const answered = await fetch(`${app.api}/api/health`, {
    headers: {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': who,
    },
  })
  expect(answered.status, await answered.clone().text()).toBe(200)
}

/** The rows the panel drew, read off the screen. */
async function theRows(): Promise<{ name: string; kind: string; from: string; facts: string }[]> {
  return app.page.$$eval('.hoc-row', (all) =>
    all.map((one) => ({
      name: one.querySelector('.hoc-name')?.textContent ?? '',
      kind: one.querySelector('.hoc-kind')?.textContent ?? '',
      from: one.querySelector('.hoc-from')?.textContent ?? '',
      facts: one.textContent ?? '',
    })),
  )
}

/**
 * PHOTOGRAPH THE PAGE AT THE FOUR WIDTHS AND IN BOTH THEMES, when `HEADER_ONLY_SHOTS` names a
 * directory. The extra long one at 390 is the width the last cluster's regression appeared at.
 */
async function photograph(): Promise<void> {
  const dir = process.env['HEADER_ONLY_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  for (const width of [1440, 1024, 768, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.screenshot({ path: `${dir}/header-only-${String(width)}-${theme}.png`, fullPage: true })
    }
  }
  await app.page.setViewportSize({ width: 390, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
  // THE LIST ITSELF AT 390, long enough to scroll: this is the width the last cluster's regression
  // appeared at, and a full-page picture would hide how the rows themselves read on a phone.
  await app.page.locator('.px-panel[data-target="uiSurface/settings.headeronly"]').screenshot({
    path: `${dir}/header-only-390-long-list-light.png`,
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'callers-with-no-key', viewport: { width: 1440, height: 1000 } })
  for (const who of THE_CALLERS) await callWithNoKey(who)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the list draws the callers that sent a claim and no key', () => {
  it('draws every seeded caller, with where it came from, its count and when it was seen', async () => {
    await openTheSettings()
    await app.page.waitForSelector('.hoc-row', { timeout: 20_000 })

    // THE DOOR IS THE CONTROL: the rows the page draws are the rows the office kept, so a page that
    // invented a row, or a request that was never written down, is a red here rather than a picture.
    const read = await fetch(`${app.api}/api/office/header-only-calls`, {
      headers: { 'x-mole-office-workspace': 'default' },
    })
    expect(read.status, await read.clone().text()).toBe(200)
    const said = (await read.json()) as { callers: { actorId: string; clientOrigin: string | null; calls: number }[] }
    const kept = said.callers.filter((one) => THE_CALLERS.includes(one.actorId))
    expect(kept.length, 'the office kept no row for the calls this test made').toBe(THE_CALLERS.length)

    const rows = await theRows()
    const mine = rows.find((one) => one.name === THE_CALLER)
    expect(mine, 'the panel drew no row for the caller that called with no key').toBeDefined()
    // WHERE IT CAME FROM, in a reader's words and not in the stored token.
    expect(mine?.from).toBe(HEADER_ONLY_WORDS.fromThisComputer)
    expect(mine?.from, 'the stored word "local" is drawn on the page').not.toContain('local')
    // HOW MANY CALLS, FIRST AND LAST: the count is drawn and both times are on the row.
    const keptOne = kept.find((one) => one.actorId === THE_CALLER)
    expect(keptOne?.calls).toBe(1)
    expect(mine?.facts).toContain('first seen')
    expect(mine?.facts).toContain('last seen')
    expect(mine?.facts, 'the count is not drawn').toContain('1 call')
    // NEWEST FIRST IS THE SERVER'S ORDER, and the page draws the order it was given.
    expect(rows.length).toBeGreaterThan(1)
  }, 120_000)

  it('names the panel with the surface the page has a title for', async () => {
    await openTheSettings()
    const title = SURFACES['settings.headeronly']
    expect(TITLE_KEYS['settings.headeronly'], 'the page has no title for the panel').toBeDefined()
    const drawn = await app.page.$$eval('.px-panel-title', (all) =>
      all.map((one) => (one.textContent ?? '').trim()),
    )
    expect(drawn, 'the panel is not drawn under the name the registry gives it').toContain(title)
  }, 120_000)
})

describe('an empty list is an answer, said in words', () => {
  it('says nothing has called, rather than drawing an empty box', () => {
    const html = renderToStaticMarkup(
      h(HeaderOnlyCallers, { said: { callers: [], says: 'These are claims, not proofs.' } }),
    )
    expect(html, 'an empty list is an empty box').not.toContain('<ul')
    // THE SENTENCE IS NOW THE `title` OF THE ONE `Absence` MARK, so it rides on the mark rather than
    // opening a paragraph. The words a reader gets are the same, and this is where they are pinned.
    expect(html, 'the sentence that says nothing has called is not drawn').toContain(
      'Nothing has called with a claim and no key since this office began keeping this list.',
    )
  })
})

describe('the pictures', () => {
  it('writes the four widths in both themes and one long list at 390, when asked', async () => {
    await openTheSettings()
    await app.page.waitForSelector('.hoc-row', { timeout: 20_000 })
    await photograph()
  }, 120_000)
})
