// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT TOOLS PANEL ON TERMINAL MANAGEMENT, IN A REAL BROWSER. Wave 13u, round 3.
 *
 * The panel (src/web/components/InstallHarnesses.tsx) is opened on Terminal management (#/terminals) of a scratch
 * office beside a real terminal holder, and what a person sees is checked:
 *
 *   1. Each agent tool is a row with its installed version, its newest version, and "A newer version exists."
 *      only on the row where both were read and the newest is larger. A tool with no install command draws a short
 *      state word for it, and a newest version that could not be read draws "Could not be read." (as decided, the
 *      panel draws no explanation, so the sentences that said why are gone).
 *   2. At rest the panel shows no tick box. Choose tools to install shows one box for each tool that has an
 *      install command, and none for the others.
 *   3. Ticking two tools and pressing Install opens the installer's terminal in the page: its screen shows each
 *      vendor's command in order, what each stand-in installer printed, and the sentence telling the person to
 *      sign in themselves. The panel says the same in words.
 *   4. The open panel, at 1440 and 390 in the light theme, in English and Chinese, scrolls no page
 *      sideways. When INSTALL_PRESS_SHOTS names a folder it is photographed at 1440, 990, 660 and 390 in light
 *      and dark. Each picture holds the made-up label above the panel
 *      (tests/the-made-up-label-above-the-page.ts) and the whole panel.
 *   5. While the whole read is held back, every row is drawn from the declared list (GET /api/harnesses?part=list),
 *      its install command shown and both versions said to be being read; when the whole read comes, they fill in.
 *   6. When the whole read fails, the rows from the declared list say under the error note that each version could
 *      not be read, and none says it is being read; Read again then fills them in. The panel in that state scrolls no
 *      page sideways at 1440 and 390 in the light theme, and is photographed at four widths in both themes when
 *      INSTALL_PRESS_SHOTS is set.
 *
 * NO REAL INSTALLER RUNS AND NOTHING REACHES THE NETWORK. liveApp's server starts with tests/harness-stand-ins.ts's
 * folder first on its PATH: a stand-in curl, whose "installer script" is one echo the real shell then runs, and
 * stand-in claude, codex, opencode, kimi and dsh that print a version. MOLE_OFFICE_HARNESS_REGISTRY points the
 * newest-version reads at the stand-in registry. The holder is started in a place of this file's own, and liveApp's
 * server is given the same XDG_CONFIG_HOME and HOME, as in tests/the-terminal-pages-in-the-browser.test.ts.
 *
 * MUTATION (after a control run; the commit message that added this file has the three runs): in
 * InstallHarnesses, the tick box is drawn when `one.install !== null` without `choosing &&`: case 2 goes red,
 * because the page at rest shows boxes. Wave 13x round 12: in InstallHarnesses, `rows` taken from the whole read
 * only, without the declared list: case 5 goes red, because no row is drawn while the whole read is held back.
 * Wave 13x round 13b: in InstallHarnesses, `failed` given as false whatever the whole read did: case 6 goes red,
 * because each version cell says "Reading…" for good under the error note.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import { zh } from '../src/shared/words/zh.ts'
import { theResizeIsDrawn, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_MADE_UP_LABEL_MARKER, putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { aPlace, groups, startAHolder, stopEverything, until, type Place } from './terminal-holder-stand.ts'
import { aStandInRegistry, writeTheStandIns, type StandInRegistry } from './harness-stand-ins.ts'

const SHOTS = process.env['INSTALL_PRESS_SHOTS']
const SHOOT = SHOTS !== undefined && SHOTS !== ''
if (SHOOT) mkdirSync(SHOTS, { recursive: true })

let app: LiveApp | null = null
let place: Place
let registry: StandInRegistry

/**
 * Start liveApp with the place's homes, the stand-ins first on its PATH and the stand-in registry, and put the variables
 * back after. It starts with no SANDBOX_DIR, because the office refuses every install press inside a sandbox, and case 3
 * presses Install.
 */
async function liveAppWithTheStandIns(standIns: string): Promise<LiveApp> {
  const names = ['XDG_CONFIG_HOME', 'HOME', 'LANG', 'PATH', 'MOLE_OFFICE_HARNESS_REGISTRY', 'SANDBOX_DIR'] as const
  const was = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  delete process.env['SANDBOX_DIR']
  process.env['XDG_CONFIG_HOME'] = place.config
  process.env['HOME'] = place.home
  process.env['LANG'] = 'C.UTF-8'
  process.env['PATH'] = `${standIns}:${process.env['PATH'] ?? '/usr/bin:/bin'}`
  process.env['MOLE_OFFICE_HARNESS_REGISTRY'] = registry.at
  try {
    return await liveApp({ name: 'install-press', viewport: { width: 1440, height: 900 }, database: place.database })
  } finally {
    for (const name of names) {
      if (was[name] === undefined) delete process.env[name]
      else process.env[name] = was[name]
    }
  }
}

function theApp(): LiveApp {
  if (app === null) throw new Error('No app.')
  return app
}

async function visit(page: Page, site: string, lang: 'en' | 'zh' = 'en'): Promise<void> {
  await page.goto('about:blank')
  const search = lang === 'en' ? '?mode=inspect' : '?mode=inspect&lang=zh'
  await page.goto(`${site}/${search}#/terminals`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.ih-row').nth(4).waitFor({ state: 'visible', timeout: 60_000 })
  // THE ROWS ARE DRAWN BEFORE THE VERSIONS (wave 13x round 12), so the cases that read a version wait for the whole read.
  await page.locator('.ih-reading').first().waitFor({ state: 'detached', timeout: 60_000 })
}

const row = (page: Page, id: string) => page.locator(`.ih-row[data-harness="${id}"]`)
const sideways = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const squeezed = (text: string): string => text.replace(/\s+/g, '')

/**
 * The part of the page a picture of the open panel shows, in the page's own coordinates: the made-up label above the
 * panel and the whole panel, with 8 pixels of the page around them where the page has them. Throws when either is not
 * in the page, since a picture without its label is a picture of made-up data that does not say so.
 */
async function thePanelAndItsLabel(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const clip = await page.evaluate((marker) => {
    const panel = document.querySelector('.ih')
    const label = document.querySelector(marker)
    if (panel === null || label === null) return null
    const a = panel.getBoundingClientRect()
    const b = label.getBoundingClientRect()
    const pageWidth = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)
    const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    const left = Math.max(0, Math.min(a.left, b.left) + window.scrollX - 8)
    const top = Math.max(0, Math.min(a.top, b.top) + window.scrollY - 8)
    const right = Math.min(pageWidth, Math.max(a.right, b.right) + window.scrollX + 8)
    const bottom = Math.min(pageHeight, Math.max(a.bottom, b.bottom) + window.scrollY + 8)
    return { x: left, y: top, width: right - left, height: bottom - top }
  }, THE_MADE_UP_LABEL_MARKER)
  if (clip === null) throw new Error('thePanelAndItsLabel: the agent tools panel or its made-up label is not in the page, so no picture was taken')
  return clip
}

beforeAll(async () => {
  place = aPlace('ipb')
  const standIns = join(place.dir, 'bin')
  mkdirSync(standIns)
  writeTheStandIns(standIns, { programs: ['claude', 'codex', 'opencode', 'kimi', 'dsh'], shells: false })
  registry = await aStandInRegistry()
  await startAHolder(place)
  app = await liveAppWithTheStandIns(standIns)
}, 300_000)

afterAll(async () => {
  try {
    await app?.stop()
    await registry.close()
  } finally {
    await stopEverything()
  }
}, 120_000)

describe('the agent tools panel', () => {
  it('7. only the part being read again shows its age; the press reads again, and the page never does by itself', async () => {
    const { page, site } = theApp()
    const whole = (url: URL): boolean => url.pathname === '/api/harnesses' && !url.searchParams.has('part')
    let part: 'installed' | 'newest' | null = 'installed'
    let asked = 0
    await page.route(whole, async (route) => {
      asked += 1
      const real = await route.fetch()
      const body = await real.json() as { harnesses: Record<string, unknown>[] }
      for (const one of body.harnesses) {
        one['beingReadAgain'] = {
          installed: one['id'] === 'claude-code' && part === 'installed' ? new Date(Date.now() - 12 * 60_000).toISOString() : null,
          newest: one['id'] === 'claude-code' && part === 'newest' ? new Date(Date.now() - 3 * 60 * 60_000).toISOString() : null,
        }
      }
      await route.fulfill({ response: real, body: JSON.stringify(body) })
    })
    try {
      await visit(page, site)
      const claude = row(page, 'claude-code')
      expect(await claude.locator('[data-fact="installed"]').innerText()).toContain('Read 12m ago. It is being read again.')
      expect(await claude.locator('[data-fact="newest"]').innerText()).toBe('2.1.289')
      expect(await page.locator('.ih-read-again').count()).toBe(1)
      const before = asked
      await page.waitForTimeout(100)
      expect(asked).toBe(before)
      part = null
      await page.locator('.ih').getByRole('button', { name: t('harnesses.readAgain') }).click()
      await page.locator('.ih-read-again').waitFor({ state: 'detached', timeout: 30_000 })
      await page.locator('.ih-reading').first().waitFor({ state: 'detached', timeout: 30_000 })
      expect(asked).toBe(before + 1)
      expect(await claude.locator('[data-fact="installed"]').innerText()).toBe('2.1.200 (Claude Code)')
      part = 'newest'
      await visit(page, site)
      expect(await claude.locator('[data-fact="newest"]').innerText()).toContain('Read 3h ago. It is being read again.')
      expect(await claude.locator('[data-fact="installed"]').innerText()).toBe('2.1.200 (Claude Code)')
      expect(await row(page, 'codex').locator('.ih-read-again').count()).toBe(0)
      const shots = process.env['HARNESS_READ_AGAIN_SHOTS']
      if (shots) {
        mkdirSync(shots, { recursive: true })
        await page.evaluate(() => {
          const caption = document.createElement('p')
          caption.textContent = 'Made-up data: a test office with stand-in programs. One newest version is being read again.'
          caption.style.cssText = 'background:#7a1f1f;color:#fff;font:600 12px/1.3 sans-serif;padding:8px;overflow-wrap:anywhere'
          document.querySelector('.ih')?.appendChild(caption)
        })
      }
      const themes: readonly ('light' | 'dark')[] = shots ? ['light', 'dark'] : ['light']
      const widths = shots ? [1440, 990, 660, 390] : [1440, 390]
      for (const theme of themes) {
        await page.emulateMedia({ colorScheme: theme })
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 })
          await theResizeIsDrawn(page)
          expect(await sideways(page), `${String(width)} ${theme}`).toBeLessThanOrEqual(1)
          if (shots) await page.locator('.ih').screenshot({ path: join(shots, `harness-read-again-${String(width)}-${theme}-en.png`) })
        }
      }
    } finally {
      await page.unroute(whole)
      await page.emulateMedia({ colorScheme: 'light' })
      await page.setViewportSize({ width: 1440, height: 900 })
    }
  }, 180_000)

  it('1. each tool shows its installed and newest versions, and a newer one only where both compare', async () => {
    const { page, site } = theApp()
    await visit(page, site)
    const claude = row(page, 'claude-code')
    expect(await claude.locator('[data-fact="installed"]').innerText()).toBe('2.1.200 (Claude Code)')
    expect(await claude.locator('[data-fact="newest"]').innerText()).toBe('2.1.289')
    expect(await claude.innerText()).toContain(t('harnesses.newer.yes'))
    expect(await claude.innerText()).toContain('curl -fsSL https://claude.ai/install.sh | bash')
    const codex = row(page, 'codex')
    expect(await codex.innerText()).toContain(t('harnesses.newer.no'))
    expect(await codex.innerText()).not.toContain(t('harnesses.newer.yes'))
    // A NEWER ONE IS SAID ON CLAUDE, OPENCODE AND KIMI, whose stand-ins are older than the registry's, and nowhere else.
    expect(await page.locator('.ih-newer[data-newer="yes"]').count()).toBe(3)
    expect(await row(page, 'kimi').innerText()).toContain(t('harnesses.state.archived'))
    const dsh = row(page, 'dsh')
    expect(await dsh.innerText()).toContain(t('harnesses.state.installedSeparately'))
    expect(await dsh.locator('[data-fact="newest"]').innerText()).toContain(t('harnesses.versionNotRead'))
    expect(await dsh.innerText()).toContain(t('harnesses.state.newerNotKnown'))
  }, 120_000)

  it('2. no tick box at rest; Choose shows one for each tool with an install command', async () => {
    const { page, site } = theApp()
    await visit(page, site)
    expect(await page.locator('.ih input[type="checkbox"]').count()).toBe(0)
    await page.getByRole('button', { name: t('harnesses.choose') }).click()
    expect(await page.locator('.ih input[type="checkbox"]').count()).toBe(3)
    expect(await row(page, 'kimi').locator('input[type="checkbox"]').count()).toBe(0)
    expect(await row(page, 'dsh').locator('input[type="checkbox"]').count()).toBe(0)
    await page.getByRole('button', { name: t('harnesses.cancel') }).click()
    expect(await page.locator('.ih input[type="checkbox"]').count()).toBe(0)
  }, 120_000)

  it("3. Install opens the installer's terminal in the page, running each command in order, then saying to sign in", async () => {
    const { page, site } = theApp()
    await visit(page, site)
    await page.getByRole('button', { name: t('harnesses.choose') }).click()
    await page.getByLabel(t('harnesses.tick', { name: 'Codex' })).check()
    await page.getByLabel(t('harnesses.tick', { name: 'Claude Code' })).check()
    await page.getByRole('button', { name: t('harnesses.install') }).click()
    await page.locator('.ih-installer .tm-view .xterm-rows').waitFor({ state: 'visible', timeout: 60_000 })
    const shown = await until(
      () => page.locator('.ih-installer .tm-view .xterm-rows').innerText().catch(() => ''),
      (text) => squeezed(text).includes(squeezed('Sign in yourself')),
      30_000,
    )
    const text = squeezed(shown)
    const at = (words: string): number => text.indexOf(squeezed(words))
    expect(at('curl -fsSL https://claude.ai/install.sh | bash'), shown).toBeGreaterThan(-1)
    expect(at('curl -fsSL https://chatgpt.com/codex/install.sh | sh')).toBeGreaterThan(at('curl -fsSL https://claude.ai/install.sh | bash'))
    expect(at('the installer script fetched from https://claude.ai/install.sh')).toBeGreaterThan(-1)
    expect(at('the installer script fetched from https://chatgpt.com/codex/install.sh')).toBeGreaterThan(-1)
    expect(at('Sign in yourself')).toBeGreaterThan(at('curl -fsSL https://chatgpt.com/codex/install.sh | sh'))
    expect(await page.locator('.ih-sign-in').innerText()).toBe(t('harnesses.signIn'))
    // The installer's terminal is the holder's, and is stopped with the rest by its group.
    const listed = await fetch(`${theApp().api}/api/terminals`).then((r) => r.json() as Promise<{ terminals: { pid: number }[] }>)
    for (const one of listed.terminals ?? []) groups.add(one.pid)
  }, 120_000)

  it('4. the open panel scrolls no page sideways at 1440 and 390 in the light theme, in both languages', async () => {
    const { page, site } = theApp()
    const themes: readonly ('light' | 'dark')[] = SHOOT ? ['light', 'dark'] : ['light']
    const widths = SHOOT ? [1440, 990, 660, 390] : [1440, 390]
    for (const lang of ['en', 'zh'] as const) {
      await visit(page, site, lang)
      await page.getByRole('button', { name: lang === 'en' ? t('harnesses.choose') : zh['harnesses.choose'] }).click()
      for (const theme of themes) {
        await page.emulateMedia({ colorScheme: theme })
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 })
          await theResizeIsDrawn(page)
          expect(await sideways(page), `${String(width)} ${theme} ${lang}`).toBeLessThanOrEqual(1)
          if (SHOOT) {
            await putTheMadeUpLabelIn(page, 'Made-up data: a test office with stand-in programs, with tools chosen to install.', page.locator('.ih'), 'the Terminal management page')
            await page.screenshot({ path: join(SHOTS as string, `install-press-${String(width)}-${theme}-${lang}.png`), fullPage: true, clip: await thePanelAndItsLabel(page) })
            await takeTheMadeUpLabelOut(page)
          }
        }
      }
      await page.emulateMedia({ colorScheme: 'light' })
      await page.setViewportSize({ width: 1440, height: 900 })
    }
  }, 180_000)

  it('5. the rows are drawn before the versions arrive, and the versions fill in when they do', async () => {
    const { page, site } = theApp()
    let release: () => void = () => {}
    const held = new Promise<void>((done) => {
      release = done
    })
    const whole = (url: URL): boolean => url.pathname === '/api/harnesses' && !url.searchParams.has('part')
    await page.route(whole, async (route) => {
      await held
      // The page may have gone on to another address by the time the hold ends.
      await route.continue().catch(() => {})
    })
    try {
      await page.goto('about:blank')
      await page.goto(`${site}/?mode=inspect#/terminals`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      // Not waitForThePage, which waits for every request, and one is being held back.
      await page.locator('.ih-row').nth(4).waitFor({ state: 'visible', timeout: 60_000 })
      const claude = row(page, 'claude-code')
      expect(await claude.locator('[data-fact="installed"]').innerText()).toBe(t('harnesses.versionReading'))
      expect(await claude.locator('[data-fact="newest"]').innerText()).toBe(t('harnesses.versionReading'))
      expect(await claude.innerText()).toContain('curl -fsSL https://claude.ai/install.sh | bash')
      expect(await page.locator('.ih-reading').count()).toBe(10)
      expect(await page.locator('.ih-newer').count()).toBe(0)
      release()
      await page.locator('.ih-reading').first().waitFor({ state: 'detached', timeout: 60_000 })
      expect(await claude.locator('[data-fact="installed"]').innerText()).toBe('2.1.200 (Claude Code)')
      expect(await claude.locator('[data-fact="newest"]').innerText()).toBe('2.1.289')
    } finally {
      release()
      await page.unroute(whole)
    }
  }, 120_000)

  it('6. when the whole read fails, each version says it could not be read, and Read again fills them in', async () => {
    const { page, site } = theApp()
    const whole = (url: URL): boolean => url.pathname === '/api/harnesses' && !url.searchParams.has('part')
    // THE REAL REPLY'S HEADERS ARE KEPT, so the page knows which office answered, and only the status and body fail.
    await page.route(whole, async (route) => {
      const real = await route.fetch()
      await route.fulfill({ response: real, status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The whole read failed in this test.' }) })
    })
    try {
      await page.goto('about:blank')
      await page.goto(`${site}/?mode=inspect#/terminals`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.locator('.ih .px-error').first().waitFor({ state: 'visible', timeout: 60_000 })
      await page.locator('.ih-row').nth(4).waitFor({ state: 'visible', timeout: 60_000 })
      const claude = row(page, 'claude-code')
      expect(await claude.locator('[data-fact="installed"]').innerText()).toBe(t('harnesses.versionNotRead'))
      expect(await claude.locator('[data-fact="newest"]').innerText()).toBe(t('harnesses.versionNotRead'))
      expect(await claude.innerText()).toContain('curl -fsSL https://claude.ai/install.sh | bash')
      expect(await page.locator('.ih-unread').count()).toBe(10)
      expect(await page.locator('.ih-reading').count()).toBe(0)
      expect(await page.locator('.ih').innerText()).toContain(t('harnesses.refused'))
      const themes: readonly ('light' | 'dark')[] = SHOOT ? ['light', 'dark'] : ['light']
      const widths = SHOOT ? [1440, 990, 660, 390] : [1440, 390]
      for (const theme of themes) {
        await page.emulateMedia({ colorScheme: theme })
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 })
          await theResizeIsDrawn(page)
          expect(await sideways(page), `${String(width)} ${theme}`).toBeLessThanOrEqual(1)
          if (SHOOT) {
            await putTheMadeUpLabelIn(page, 'Made-up data: a test office with stand-in programs. The whole read of the agent tools is made to fail.', page.locator('.ih'), 'the Terminal management page')
            await page.screenshot({ path: join(SHOTS as string, `versions-not-read-${String(width)}-${theme}.png`) })
            await takeTheMadeUpLabelOut(page)
          }
        }
      }
      await page.emulateMedia({ colorScheme: 'light' })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.unroute(whole)
      await page.locator('.ih').getByRole('button', { name: t('harnesses.readAgain') }).first().click()
      await page.locator('.ih-unread').first().waitFor({ state: 'detached', timeout: 60_000 })
      await page.locator('.ih-reading').first().waitFor({ state: 'detached', timeout: 60_000 })
      expect(await claude.locator('[data-fact="installed"]').innerText()).toBe('2.1.200 (Claude Code)')
    } finally {
      await page.unroute(whole)
    }
  }, 180_000)
})
