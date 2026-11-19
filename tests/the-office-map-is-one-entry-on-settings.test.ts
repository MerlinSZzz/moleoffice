// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE MAP IS ONE ENTRY ON THE SETTINGS PAGE, AND THE OLDER BUILT-IN MAP IS GONE. Wave 13y round 119, item 52
 * as it was rewritten once the older map was to be deleted. The design says a tool that needs its
 * own settings has one entry on the Settings page, which folds open to its settings, with no second-level page and
 * no separate window.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, IN A REAL BROWSER, IN A MADE-UP TEST OFFICE
 * ---------------------------------------------------------------------------------------
 *
 *   1. The Working page draws its list of who is working, with its made-up agents in it. It draws no Map view and no
 *      choice between views, in normal or developer mode.
 *   2. The office has no scene door. GET /api/office/scene is not a door of this office.
 *   3. The Settings page draws no look panel for the older map, in either mode. The office map plugin's row under
 *      Tools, Plugins folds open to its settings, in normal mode too. They hold one switch, which says whether the
 *      office map moves, and pressing it stores that choice.
 *   4. With the plugin on, its page is listed in the sidebar and drawn in its frame. The frame is told
 *      reducedMotion false while the map may move. After motion is switched off in the plugin's row, the frame is
 *      told reducedMotion true.
 *
 * THE PLUGIN IS THE REAL MANIFEST WITH A STAND-IN PAGE. The office map plugin's manifest is read from
 * plugins/office-map/plugin.json, so the office accepts the real one. Its built page is not in git, so a stand-in
 * page is written beside the manifest. The stand-in keeps every message the office sends it in `window.told`.
 *
 * THE PICTURES. When W13Y_R119_PICTURES names a folder, case 6 writes the Working page, the Settings page at the
 * looks category and the Settings page at the plugins panel, at 1440, 990, 660 and 390 pixels wide, in both themes
 * and both modes. Each is labelled as a made-up test office. Case 6 asserts only that each page fits its width and
 * shows the theme it was asked for, so it passes before the change and after it, and takes both sets of pictures.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Frame, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
const scratch = aTestDatabaseFolder('office-map-entry')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']

const THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const AS = (handle: string) => ({ ...THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const THE_ROW = 'li.plgs-row[data-plugin="office-map"]'
const THE_FRAME = '[data-target="uiSurface/plugins.page"] iframe.plgp-frame'
const MADE_UP_AGENTS = [
  { handle: 'quill', name: 'Quill', run: 'Made-up run: Quill tightens the bolts' },
  { handle: 'calliper', name: 'Calliper', run: 'Made-up run: Calliper measures the gap' },
]

/** The stand-in page's script. It keeps every message from the office, and says it is ready. */
const THE_STAND_IN_SCRIPT = `
window.told = []
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return
  window.told.push(event.data)
  if (event.data.kind === 'context') {
    document.documentElement.dataset.theme = event.data.theme
    document.getElementById('context').textContent = 'The office says: reduced motion ' + event.data.reducedMotion + '.'
  }
})
window.parent.postMessage({ interface: 'office-read/1', ask: 'ready' }, '*')
`

const THE_STAND_IN_PAGE = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<title>Stand-in office map</title>',
  '<script type="module" src="assets/app.js"></script>',
  '</head><body>',
  '<h1>Stand-in office map</h1>',
  '<p>A stand-in page for the office map plugin, drawn for a test. It is not the real map.</p>',
  '<p id="context">Waiting for the office.</p>',
  '</body></html>',
].join('\n')

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = THE_OWNER): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function open(page: Page, path: string, mode: 'normal' | 'inspect', theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.goto(`${app.site}/?lang=en&mode=${mode}&look=${theme}#${path}`)
  await page.evaluate((next) => localStorage.setItem('mole-office.preset.theme', next), theme)
  await page.reload()
  await waitForThePage(page, 60_000)
  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme)
}

/** The frame's document, once the stand-in page has been told its context. */
async function theFramesPage(page: Page): Promise<Frame> {
  const element = await page.waitForSelector(THE_FRAME, { timeout: 30_000 })
  const frame = await element.contentFrame()
  if (frame === null) throw new Error('The plugin frame has no document.')
  await frame.waitForFunction(() => (window as unknown as { told?: { kind: string }[] }).told?.some((one) => one.kind === 'context') === true, undefined, { timeout: 30_000 })
  return frame
}

/** The reducedMotion of the last context the office sent the frame. */
async function theLastReducedMotion(frame: Frame): Promise<unknown> {
  return frame.evaluate(() => (window as unknown as { told: { kind: string; reducedMotion?: unknown }[] }).told.filter((one) => one.kind === 'context').at(-1)?.reducedMotion)
}

beforeAll(async () => {
  const folder = join(scratch, 'plugins', 'office-map')
  mkdirSync(join(folder, 'dist', 'assets'), { recursive: true })
  copyFileSync(join(process.cwd(), 'plugins', 'office-map', 'plugin.json'), join(folder, 'plugin.json'))
  writeFileSync(join(folder, 'dist', 'main.html'), THE_STAND_IN_PAGE)
  writeFileSync(join(folder, 'dist', 'assets', 'app.js'), THE_STAND_IN_SCRIPT)
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  app = await liveApp({ name: 'office-map-entry', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await app.page.addInitScript(({ person }) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person })), { person: THE_TEST_OFFICES_OWNER.id })
  for (const agent of MADE_UP_AGENTS) {
    await send('POST', '/api/agents/started', { handle: agent.handle, name: agent.name, role: 'worker' })
    await send('POST', '/api/records', { kind: 'session', title: agent.run, data: { state: 'running', runtime: 'claude-code' } }, AS(agent.handle))
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  rmSync(scratch, { recursive: true, force: true })
}, 120_000)

describe('the office map is one entry on the Settings page, and the older built-in map is gone', () => {
  it('1. the Working page draws its list of who is working, with no Map view and no choice between views', async () => {
    const page = app.page
    for (const mode of ['normal', 'inspect'] as const) {
      await open(page, '/working', mode)
      const list = page.locator('.wrk ul.wrk-list')
      await list.waitFor({ timeout: 30_000 })
      for (const agent of MADE_UP_AGENTS) await expect.poll(() => list.innerText(), { message: `${mode}: ${agent.name}` }).toContain(agent.name)
      expect(await page.locator('.wrk .px-controls').count(), `${mode}: the choice between views`).toBe(0)
      expect(await page.locator('.wrk .px-office').count(), `${mode}: the map`).toBe(0)
      expect(await page.locator('.wrk a[href="#/settings/officecontrols"]').count(), `${mode}: a link to Office controls`).toBe(0)
    }
  }, 180_000)

  it('2. the office has no scene door', async () => {
    const reply = await fetch(`${app.api}/api/office/scene?scope=office`, { headers: THE_OWNER })
    expect(reply.status, await reply.text()).toBe(404)
  }, 60_000)

  it('3. the Settings page has no look panel for the older map, and the plugin row folds open to whether the map moves', async () => {
    const page = app.page
    for (const mode of ['normal', 'inspect'] as const) {
      await open(page, '/settings/plugins', mode)
      await page.locator(THE_ROW).waitFor({ timeout: 30_000 })
      expect(await page.locator('[data-settings-panel="settings.pixeloffice"]').count(), `${mode}: the older look panel`).toBe(0)
      const fold = page.locator(`${THE_ROW} details.plgs-settings`)
      expect(await fold.count(), `${mode}: the fold in the office map's row`).toBe(1)
      await fold.locator(':scope > summary').click()
      const motion = fold.getByRole('switch')
      expect(await motion.count(), `${mode}: the switches inside the fold`).toBe(1)
      expect((await motion.getAttribute('aria-label')) ?? (await motion.innerText()), `${mode}: the switch's name`).not.toBe('')
      expect(await motion.getAttribute('aria-checked'), `${mode}: the map moves until somebody says not`).toBe('true')
    }
    // ONLY THE OFFICE MAP'S ROW HAS THE FOLD. The other rows are drawn as before.
    expect(await page.locator('li.plgs-row details.plgs-settings').count()).toBe(1)
  }, 180_000)

  it('4. with the plugin on, its page is listed and drawn, and the frame is told reduced motion once motion is off', async () => {
    const page = app.page
    await send('POST', '/api/plugins/office-map/switch', { on: true })
    // Test change (wave 13y round 165): a plugin's page is listed on the All pages page, not in the sidebar.
    await open(page, '/all-pages', 'normal')
    await page.locator('#main [data-group="plugins"] a[href="#/plugin/office-map/main"]').waitFor({ state: 'attached', timeout: 30_000 })
    await open(page, '/plugin/office-map/main', 'normal')
    const before = await theFramesPage(page)
    expect(await theLastReducedMotion(before)).toBe(false)

    await open(page, '/settings/plugins', 'normal')
    const fold = page.locator(`${THE_ROW} details.plgs-settings`)
    await fold.locator(':scope > summary').click()
    const motion = fold.getByRole('switch')
    await motion.click()
    await expect.poll(() => motion.getAttribute('aria-checked')).toBe('false')
    expect((await send('GET', '/api/office/scene-settings', undefined))['settings']).toEqual({ motion: false })

    await open(page, '/plugin/office-map/main', 'normal')
    const after = await theFramesPage(page)
    await expect.poll(() => theLastReducedMotion(after)).toBe(true)

    // AND BACK AGAIN, so the cases after this one draw the map as it is by default.
    await open(page, '/settings/plugins', 'normal')
    await fold.locator(':scope > summary').click()
    await fold.getByRole('switch').click()
    await expect.poll(() => fold.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  }, 240_000)

  it('6. pictures: the Working page and the Settings page, at four widths, in both themes and both modes', async () => {
    const page = app.page
    const pictures = process.env['W13Y_R119_PICTURES']
    if (pictures) mkdirSync(pictures, { recursive: true })
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        for (const mode of ['normal', 'inspect'] as const) {
          await page.setViewportSize({ width, height: 1000 })
          for (const surface of ['working', 'settings-looks', 'settings-plugins'] as const) {
            let above
            if (surface === 'working') {
              await open(page, '/working', mode, theme)
              await page.locator('.wrk ul.wrk-list, .wrk .px-office, .wrk .px-error').first().waitFor({ timeout: 60_000 })
              above = page.locator('.wrk')
            } else if (surface === 'settings-looks') {
              await open(page, '/settings/look', mode, theme)
              const older = page.locator('[data-settings-panel="settings.pixeloffice"]')
              if ((await older.count()) > 0) {
                await openSettingsPanel(page, 'settings.pixeloffice')
                await page.waitForFunction(() => document.querySelectorAll('[data-settings-panel="settings.pixeloffice"] .px-loading').length === 0, undefined, { timeout: 30_000 })
                above = older
              } else above = page.locator('section.sf-cat[data-category="looks"]')
            } else {
              await open(page, '/settings/plugins', mode, theme)
              await page.locator(THE_ROW).waitFor({ timeout: 30_000 })
              const fold = page.locator(`${THE_ROW} details.plgs-settings`)
              if ((await fold.count()) > 0) await fold.locator(':scope > summary').click()
              above = page.locator('[data-settings-panel="settings.plugins"]')
            }
            await above.scrollIntoViewIfNeeded()
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${surface} ${width} ${theme} ${mode}`).toBe(true)
            await page.mouse.move(width - 1, 999)
            if (pictures) {
              const called = surface === 'working' ? 'the Working page' : 'the Settings page'
              await putTheMadeUpLabelIn(page, 'Made-up test office — two made-up agents; the office map plugin is a stand-in', above, called)
              await page.screenshot({ path: `${pictures}/${surface}-${width}-${theme}-${mode === 'inspect' ? 'developer' : 'normal'}.png`, fullPage: false })
            }
          }
        }
      }
    }
  }, 900_000)
})
