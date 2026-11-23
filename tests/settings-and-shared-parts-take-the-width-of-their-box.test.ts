// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SETTINGS, CASTING, PAIRING, A VISITOR'S CREDENTIAL, THE STRUCTURE DRAWING'S CAPTIONS AND THE SHARED
 * PARTS TAKE THE WIDTH OF THEIR BOX, NOT A FIXED 58rem. Wave 13k, round 18, group C of the width rule.
 *
 * Problem EGr0VqwCLBda: --measure is a fixed 58rem (928 pixels), so a sentence drawn in a box wider
 * than that stops at 928 pixels and leaves a stranded band beside it. Item 2 of a decision put
 * every page onto one width rule, src/web/components/SideBySide.tsx, whose token for a line is
 * --measure-in-box in tokens.css: 58rem is the least a line is given, and its box is the width.
 * These pages are one kind of part each (settings panels, a table, one form), so they get no two
 * columns. They get only that token, and no switch width of their own.
 *
 * WHAT IS MEASURED:
 *   3. in a browser, on Settings with every panel open, on Casting and on Pairing, at 390 no page
 *      scrolls sideways and no line is wider than its own box, which is all the rule allows.
 * The 1440 stranded-band measurement was removed in wave 13n's round G: the 390 case keeps the fit
 * check.
 *
 * THE PAGES ARE OPENED IN THE DEVELOPER MODE, so Settings draws its two developer categories too. The
 * address names that mode by its stored word, which src/shared/mode.ts declares and src/web/lib/mode.ts
 * reads from the address; a word it does not know is ignored, and the page opens in the normal mode.
 *
 * PICTURES. With TEST_SHOTS naming a folder, the last case photographs the pages at 1440 in the light
 * look, Settings also at 390, and the structure drawing, into group-c under it.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { readEverySettingsCategory } from './settings-folds.ts'
import { testShots } from './where-shots-go.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import type { Mode } from '../src/shared/mode.ts'

/** The developer mode, by the word the address and the store use for it. */
const DEVELOPER: Mode = 'inspect'

/** The pages measured in the browser, with the box their lines are drawn in. */
const PAGES = [
  { name: 'Settings', address: '#/settings', root: '.set' },
  { name: 'Casting', address: '#/casting', root: '.cast' },
  { name: 'Pairing', address: '#/pairing', root: '.page' },
  // THREE SETTINGS PANELS THAT ARE PAGES since wave 13y round 125, measured as they were inside Settings. Gates and the
  // sidebar's arrangement open as a reading, so each is measured again on its editing face, where its controls are.
  { name: 'Gates', address: '#/gates', root: '.pfs' },
  { name: 'Gates editing', address: '#/gates/edit', root: '.pfs' },
  { name: 'Office controls', address: '#/office-controls', root: '.pfs' },
  { name: 'Sidebar arrangement', address: '#/sidebar-arrangement', root: '.pfs' },
  { name: 'Sidebar arrangement editing', address: '#/sidebar-arrangement/edit', root: '.pfs' },
] as const

const shots = process.env.TEST_SHOTS === undefined || process.env.TEST_SHOTS === '' ? null : testShots('group-c')

let app: LiveApp
let seedDir = ''

beforeAll(async () => {
  // THE MADE-UP CORPUS of scripts/reset.ts, into a database of this test's own, so Casting has rows
  // and the structure drawing has modules. The last afterAll deletes the folder.
  seedDir = aTestDatabaseFolder('group-c-seed')
  const seeded = join(seedDir, 'panelx.db')
  const run = spawnSync(join(process.cwd(), 'node_modules', '.bin', 'tsx'), ['scripts/reset.ts'], {
    env: { ...process.env, MOLE_OFFICE_DB: seeded },
    encoding: 'utf8',
  })
  expect(run.status, `the seed failed: ${run.stderr}${run.stdout}`).toBe(0)
  app = await liveApp({ name: 'group-c-width', workspace: 'default', viewport: { width: 1440, height: 1000 }, database: seeded })
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (seedDir !== '') rmSync(seedDir, { recursive: true, force: true })
})

interface Place { name: string; address: string; root: string }

async function open(page: Place, width: number, theme: 'light' | 'dark' = 'light', language = 'en'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto(`${app.site}/?lang=${language}&mode=${DEVELOPER}`)
  await app.page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), theme)
  await app.page.goto(`${app.site}/?lang=${language}&mode=${DEVELOPER}${page.address}`)
  // A NEW HASH ON THE SAME PAGE IS NOT A NEW LOAD, and the look is read when the page loads.
  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  await app.page.locator(page.root).first().waitFor({ state: 'attached', timeout: 30_000 })
}

/**
 * The lines of a page's box. Settings draws one category at a time (wave 13y round 125), so each is chosen in turn
 * and measured, and what each says is joined.
 */
async function linesOfThePage(page: Place): Promise<Lines> {
  if (page.name !== 'Settings') return lines(page.root)
  const all: Lines[] = []
  await readEverySettingsCategory(app.page, async () => {
    all.push(await lines(page.root))
  })
  return {
    measure: all[0]!.measure,
    stranded: all.flatMap((one) => one.stranded),
    over: all.flatMap((one) => one.over),
    scroll: Math.max(...all.map((one) => one.scroll)),
    viewport: all[0]!.viewport,
    counted: all.reduce((sum, one) => sum + one.counted, 0),
  }
}

interface Lines {
  measure: number
  stranded: string[]
  over: string[]
  scroll: number
  viewport: number
  counted: number
}

/**
 * Every element in the page's box that holds words of its own, measured against the box it is drawn in:
 * its nearest ancestor that is not drawn inline. A browser gives an inline element no width of its own,
 * so its client and scroll widths read 0, and the mode hint's words sit in one when they open under its
 * label. STRANDED: it is drawn at the fixed measure, that box's content box is wider, and given no cap it
 * would be wider (it wanted the space). OVER: it is wider than that box's content box, which is more than
 * the rule allows.
 */
async function lines(root: string): Promise<Lines> {
  return app.page.evaluate((selector) => {
    const probe = document.createElement('div')
    probe.style.width = 'var(--measure)'
    document.body.append(probe)
    const measure = probe.getBoundingClientRect().width
    probe.remove()
    const name = (one: HTMLElement) => `${one.tagName.toLowerCase()}.${[...one.classList].join('.')}`
    const inline = (one: HTMLElement) => {
      const shown = getComputedStyle(one).display
      return shown.startsWith('inline') || shown === 'contents'
    }
    const stranded: string[] = []
    const over: string[] = []
    let counted = 0
    for (const box of document.querySelectorAll<HTMLElement>(selector)) {
      for (const one of box.querySelectorAll<HTMLElement>('*')) {
        const words = [...one.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0)
        if (!words) continue
        const style = getComputedStyle(one)
        if (style.display === 'none' || style.display.startsWith('inline') || style.position === 'absolute' || style.position === 'fixed') continue
        let drawnIn = one.parentElement
        while (drawnIn !== null && inline(drawnIn)) drawnIn = drawnIn.parentElement
        if (drawnIn === null) continue
        const rect = one.getBoundingClientRect()
        if (rect.width === 0) continue
        counted += 1
        const p = getComputedStyle(drawnIn)
        const inner = drawnIn.clientWidth - Number.parseFloat(p.paddingLeft) - Number.parseFloat(p.paddingRight)
        if (drawnIn.scrollWidth <= drawnIn.clientWidth + 1 && rect.width > inner + 1 && p.overflowX === 'visible') over.push(`${name(one)} ${String(Math.round(rect.width))} in ${String(Math.round(inner))}`)
        if (Math.abs(rect.width - measure) < 1 && inner > measure + 8) {
          const was = { maxWidth: one.style.maxWidth, width: one.style.width }
          one.style.maxWidth = 'none'
          one.style.width = 'max-content'
          const wanted = one.getBoundingClientRect().width
          one.style.maxWidth = was.maxWidth
          one.style.width = was.width
          if (wanted > measure + 1) stranded.push(`${name(one)} stopped at ${String(Math.round(measure))} in ${String(Math.round(inner))}, wanted ${String(Math.round(wanted))}`)
        }
      }
    }
    return { measure, stranded, over, scroll: document.documentElement.scrollWidth, viewport: innerWidth, counted }
  }, root)
}

describe('group C: the pages in the browser', () => {
  it('does not scroll sideways at 390, and draws no line wider than its box', async () => {
    for (const page of PAGES) {
      await open(page, 390)
      const said = await linesOfThePage(page)
      expect(said.over, `${page.name} at 390: lines wider than their box`).toEqual([])
      expect(said.scroll, `${page.name} at 390 scrolls sideways`).toBeLessThanOrEqual(said.viewport)
    }
  }, 300_000)

  it.runIf(shots !== null)('photographs the pages at 1440, Settings at 390 and in dark, and the structure drawing', async () => {
    const folder = shots as string
    for (const page of PAGES) {
      await open(page, 1440)
      await app.page.screenshot({ path: join(folder, `${page.name.toLowerCase()}-1440-light-en.png`), fullPage: true })
    }
    await open(PAGES[0], 1440, 'dark')
    await app.page.screenshot({ path: join(folder, 'settings-1440-dark-en.png'), fullPage: true })
    await open(PAGES[0], 390)
    await app.page.screenshot({ path: join(folder, 'settings-390-light-en.png'), fullPage: true })
    await open(PAGES[0], 1440, 'light', 'zh')
    await app.page.screenshot({ path: join(folder, 'settings-1440-light-zh.png'), fullPage: true })
    await open({ name: 'The structure drawing', address: '#/pipeline/drawing', root: '.page' }, 1440)
    await app.page.waitForTimeout(1500)
    await app.page.screenshot({ path: join(folder, 'structure-1440-light-en.png'), fullPage: true })
  }, 600_000)
})
