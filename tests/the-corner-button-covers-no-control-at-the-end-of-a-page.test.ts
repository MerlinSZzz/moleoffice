// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AT THE END OF A PAGE THE CORNER CHAT BUTTON COVERS NO PRESS AND NO ARROW. Round 27 of wave 13t.
 *
 * The chat button is fixed to the window's bottom-right corner (.px-chat-circle in Chat.tsx). While a
 * page scrolls, its rows pass under the button, and that is the owner's rule: no space needs to be
 * left and covering is fine, because a person who cannot see something scrolls. Scrolling to the end
 * is where that rule sends the person, so there nothing may stay under the button. The .shell-main
 * rule in App.tsx leaves --fab-room (tokens.css) under the page for that.
 *
 * WHAT IS MEASURED. Seven pages, at 1440, 990, 660 and 390 wide, in the light look, in English, in a
 * window 1000 tall. The dark look is not measured: whether a control sits under the button does not
 * depend on the colours, so half the page openings said the same thing twice. These are the pages where round 27's measurement found a press or
 * an arrow under the button at the top of the page: Settings, Modules, Bundles, Agents, Queries,
 * Roles and the Regulations contents. Each page is scrolled to its end. No press, link, summary,
 * field or fold arrow inside the page's main element may have a box that meets the button's box.
 * Each page must draw its own kind of control first, so a page that drew nothing cannot pass.
 *
 * MUTATION PROOF (after a green control): in src/web/tokens.css, set --fab-room to 0px. Each page then
 * ends at the window's foot, and the test goes red. Since wave 13y round 125 Settings opens on one
 * category, You, and nothing sits under the button at its end at any width. So the first page that
 * turns the test red is Roles at 1440 wide, whose explain summary sits under the button. Before that
 * round, Settings went red first: its last fold row's press and arrow sat under the button. Round 125
 * also measured each Settings category with --fab-room at 0px: only Tools has a control under the
 * button at its end, its "For developers" summary at 990, 660 and 390 wide. Settings draws one category
 * at a time, so this test chooses each category in turn, waits until its panels have loaded, and reads it
 * at its end, as it read the whole folded page before.
 *
 * The servers come from `liveApp` in tests/helpers.ts, with a test office of its own and its own
 * made-up records. Nothing here touches the live office. With TEST_SHOTS naming a folder, each Settings
 * category at its end is photographed at each width, in the light look.
 *
 * THE TEST'S OFFICE HOLDS MADE-UP MODULES, wave 13y round 135. A new office's only module records are the
 * regulation chapters the server copies into it, and since that round the Modules page leaves the chapters
 * out. So in a fresh office the Modules page drew no row, and the wait for its own control timed out before
 * anything was measured. Before it reads the pages, the test files made-up modules into its own office
 * through the office's API, one for each chapter the office holds. The number is read from the office, so
 * the Modules page draws as many rows as it drew when it listed the chapters. Each module says in its title
 * and its summary that it is made-up.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { chapterNumberOf } from '../src/shared/office-rules.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { readEverySettingsCategory } from './settings-folds.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
const shots = testShots('the-corner-button-covers-no-control-at-the-end-of-a-page')
const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light'] as const

/** Each page, and the control it draws once it has drawn its content. */
const PAGES = [
  { address: 'settings', drawn: '.sf-jump' },
  { address: 'modules', drawn: 'a.flst-open' },
  { address: 'bundles', drawn: 'button.bx-look' },
  { address: 'agents', drawn: 'a.px-category-card' },
  { address: 'queries', drawn: 'a.px-row-title' },
  { address: 'roles', drawn: 'summary.px-explain-sum' },
  { address: 'regulations', drawn: 'button.ofc-toc-go' },
] as const

/** The test office's owner writes the made-up modules, as a person files records in a test office. */
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** One made-up module for each regulation chapter the test's office holds, counted from the office's own list. */
async function fileAMadeUpModuleForEachChapter(): Promise<void> {
  const listed = await fetch(`${app.api}/api/records?kind=module&shape=full`, { headers: AS_THE_OWNER })
  const said = await listed.text()
  expect(listed.status, said.slice(0, 300)).toBe(200)
  const { records } = JSON.parse(said) as { records: { kind: string; data: unknown }[] }
  const chapters = records.filter((record) => chapterNumberOf(record.kind, record.data) !== null).length
  expect(chapters, 'the test office holds no regulation chapter, so there is no number of modules to file').toBeGreaterThan(0)
  for (let n = 1; n <= chapters; n += 1) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'module',
        title: `Made-up module ${String(n)}`,
        summary: 'A made-up module of this test office, so that the Modules page has rows to draw.',
        data: {},
      }),
    })
    expect(filed.status, (await filed.text()).slice(0, 300)).toBe(201)
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'corner-button-covers-no-control', viewport: { width: 1440, height: 1000 } })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  await fileAMadeUpModuleForEachChapter()
  // DESIGN D DRAWS THE CORNER CIRCLE AT 1440 ONLY WHILE A MESSAGE WAITS, so one waits for this file.
  const keeper = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'End Keeper', data: { handle: 'end-keeper', runtime: 'claude-code', state: 'active' } }),
  })
  expect(keeper.status, await keeper.clone().text()).toBe(201)
  const waiting = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'end-keeper' },
    body: JSON.stringify({ kind: 'message', title: 'A made-up line at the page end', data: { body: 'A made-up line at the page end.', to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] } }),
  })
  expect(waiting.status, await waiting.clone().text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

/** The page is scrolled to its end, and every control of the page whose box meets the button's box is named. */
async function underTheButtonAtTheEnd(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await new Promise<void>((done) => {
      scrollTo(0, document.documentElement.scrollHeight)
      requestAnimationFrame(() => requestAnimationFrame(() => done()))
    })
    const button = document.querySelector('.px-chat-circle')
    if (button === null) return ['the corner button is not drawn']
    const circle = button.getBoundingClientRect()
    const under: string[] = []
    const controls = 'main button, main a[href], main [role=button], main summary, main select, main input, main textarea, main .sf-chev'
    for (const control of document.querySelectorAll<HTMLElement>(controls)) {
      if (!control.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      for (const box of control.getClientRects()) {
        if (box.width === 0 || box.height === 0) continue
        if (box.left < circle.right && box.right > circle.left && box.top < circle.bottom && box.bottom > circle.top) {
          under.push(`${control.tagName.toLowerCase()}.${String(control.className).split(' ')[0]} "${(control.textContent ?? '').trim().slice(0, 40)}"`)
          break
        }
      }
    }
    return under
  })
}

it('leaves every press and arrow of seven pages clear of the corner button at the page end where design D draws it, at four widths in the light look', async () => {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const context = await app.browser.newContext({ viewport: { width, height: 1000 } })
      await context.addInitScript((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
      try {
        const page = await context.newPage()
        for (const { address, drawn } of PAGES) {
          await page.goto('about:blank')
          await page.goto(`${app.site}/?lang=en#/${address}`)
          await waitForThePage(page, 30_000)
          // DESIGN D DRAWS THE CORNER CIRCLE AT THE WIDTH AT WHICH THE PAGE TURNS WIDE (THE_SHELL_WIDTH) AND WIDER. Below it there is no floating
          // chat button, so the rule that a control is clear of one cannot be broken there.
          if (width >= THE_SHELL_WIDTH) await page.locator('.px-chat-circle').waitFor()
          else expect(await page.locator('.px-chat-circle').count(), `${String(width)}: the corner circle was drawn below ${String(THE_SHELL_WIDTH)}`).toBe(0)
          await page.locator(`main ${drawn}`).first().waitFor({ timeout: 30_000 })
          expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
          if (address === 'settings') {
            await readEverySettingsCategory(page, async (category) => {
              // A wheel first, as a person scrolls: after a choice the page keeps the chosen category's heading in
              // view while its panels load, until the person scrolls, presses or types.
              await page.mouse.wheel(0, 400)
              await page.screenshot({ path: `${shots}/settings-${category}-end-${String(width)}-${theme}-en.png` })
              if (width >= THE_SHELL_WIDTH) {
                const under = await underTheButtonAtTheEnd(page)
                expect(under, `the settings page's ${category} category at ${String(width)} wide in the ${theme} look, scrolled to its end`).toEqual([])
              }
            })
            continue
          }
          if (width >= THE_SHELL_WIDTH) {
            const under = await underTheButtonAtTheEnd(page)
            expect(under, `the ${address} page at ${String(width)} wide in the ${theme} look, scrolled to its end`).toEqual([])
          }
        }
      } finally {
        await context.close()
      }
    }
  }
}, 420_000)
