// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINALS PAGE'S FIRST USE IS SAID IN PLAIN WORDS. Wave 13u, round 6 (the coordinator's look at the landed terminal).
 *
 * On the person's office the terminal holder does not run until the person presses to start it on Terminal management. The
 * first time, it has never run and has written no log. This is that office: a server with the holder on, in a place
 * of its own where no holder has run, and a browser context whose API requests go to it (as case 4 of
 * tests/the-terminal-pages-in-the-browser.test.ts does, because liveApp's own server always has the holder off).
 *
 *   2. The press on the Chinese page starts the holder; the page then says it runs, in both languages, and says no
 *      terminal is open in words, not a dash.
 *   3. A terminal the person opens then appears; pressing its row opens it, and what they type into it runs.
 *   4. One press opens the person's shell in their home folder, and it opens where its row is and runs what they type.
 *   5. A folder the person enters behind the fold opens their shell there; a folder that is not there, and a path that
 *      is not a full path, are each refused with the whole sentence in the page's language.
 *   7. At 390, the round chat button in the corner covers no part of any button, link or fold of the page: each one,
 *      scrolled to, is the element found at its middle and just inside each of its corners.
 *
 * Every scene is measured at 1440 and 390, in light, and photographed into the folder FIRST_USE_SHOTS names, when it
 * names one.
 *
 * WAVE 13n ROUND F: the Start-at-login word checks (cases 1, 6, 8 and 9) are gone, and so are their two-language
 * comparisons. What stays is the first use itself: the press, the holder running, a shell opening and running, the
 * folder refusal and the corner button.
 *
 * MUTATION (after a control run; the commit message that added this file has the runs): Round 7's mutations, one at a
 * time: TerminalsPage.tsx draws the empty list as an Absence dash again (case 2); the server's open door requires a
 * folder again (case 4); openAShell sends no folder when one is written (case 5); App.tsx's room for the corner button
 * is taken away and Start at login's presses move to the right, under it (case 7). Round 7b's: theFolder's refusal of
 * a missing folder carries no code again (case 5, Chinese page).
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { aStandInRegistry, writeTheStandIns, type StandInRegistry } from './harness-stand-ins.ts'
import { AS_THE_PERSON, aPlace, ask, groups, startAServer, stopEverything, until, type HeldTerminal, type Place, type ScratchServer } from './terminal-holder-stand.ts'

const SHOTS = process.env['FIRST_USE_SHOTS']
const SHOOT = SHOTS !== undefined && SHOTS !== ''
if (SHOOT) mkdirSync(SHOTS, { recursive: true })

let app: LiveApp | null = null
let place: Place
let registry: StandInRegistry | undefined
let first: ScratchServer | null = null
let context: BrowserContext | null = null
let page: Page | null = null
let folder: string
/** A second folder, for the shell the person opens in a folder they write. */
let elsewhere: string
/** The folder whose files say what the systemd stand-ins answer: `enabled` there or not, `active` and `linger`. */
let systemd: string
/** The page's words in each language. */
const WORDS = { en: createI18n('en').t, zh: createI18n('zh').t }

beforeAll(async () => {
  place = aPlace('fu')
  folder = join(place.dir, 'first-yard')
  mkdirSync(folder)
  elsewhere = join(place.dir, 'other-yard')
  mkdirSync(elsewhere)
  const standIns = join(place.dir, 'stand-ins')
  mkdirSync(standIns)
  writeTheStandIns(standIns, { programs: ['claude', 'codex', 'opencode', 'kimi', 'dsh'], shells: false, systemd: true })
  // SYSTEMD STAND-INS THIS FILE CAN TURN (round 7b), written over the ones that always answer "off": the press's enable
  // and disable change what is-enabled says, and the test writes what is-active and loginctl say.
  systemd = join(place.dir, 'systemd-says')
  mkdirSync(systemd)
  theSystemdSays({ active: 'inactive', linger: 'no' })
  const said = (name: string): string => `"$(cat '${join(systemd, name)}')"`
  for (const [name, body] of [
    [
      'systemctl',
      `case "$2" in\n  show-environment) echo "HOME=$HOME" ;;\n  daemon-reload) ;;\n  enable) touch '${join(systemd, 'enabled')}' ;;\n  disable) rm -f '${join(systemd, 'enabled')}' ;;\n` +
        `  is-enabled) if [ -e '${join(systemd, 'enabled')}' ]; then echo enabled; else echo disabled; exit 1; fi ;;\n  is-active) echo ${said('active')} ;;\n  *) echo "The stand-in does not know $2." >&2; exit 1 ;;\nesac`,
    ],
    ['loginctl', `echo ${said('linger')}`],
  ] as const) {
    writeFileSync(join(standIns, name), `#!/bin/sh\n${body}\n`)
    chmodSync(join(standIns, name), 0o755)
  }
  registry = await aStandInRegistry()
  const env = { PATH: `${standIns}:${process.env['PATH'] ?? '/usr/bin:/bin'}`, MOLE_OFFICE_HARNESS_REGISTRY: registry.at, LANG: 'C.UTF-8', SHELL: '/bin/sh' }
  app = await liveApp({ name: 'first-use', viewport: { width: 1440, height: 900 }, database: join(place.dir, 'page.db') })
  // THE OFFICE OF THE FIRST USE: the holder on, and none has run in this place, so there is no log. It is told the
  // liveApp's web port, because it refuses a page on a loopback port that is not its own unless that port is its dev
  // page's.
  first = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on', MOLE_OFFICE_WEB_PORT: String(app.webPort), ...env })
  context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const theFirstApi = new URL(first.api)
  const thePagesApiPort = String(app.apiPort)
  await context.route(
    (url) => url.hostname === '127.0.0.1' && url.port === thePagesApiPort,
    (route) => {
      const to = new URL(route.request().url())
      to.port = theFirstApi.port
      return route.continue({ url: to.toString() })
    },
  )
  page = await context.newPage()
}, 300_000)

afterAll(async () => {
  try {
    await context?.close()
    await app?.stop()
  } finally {
    // The holder the press started, the server and the terminal, each by its process group.
    await stopEverything()
    await registry?.close()
  }
}, 120_000)

/** What the systemd stand-ins answer from now on. Whether it is enabled is the press's to change. */
function theSystemdSays(says: { active: 'inactive' | 'active' | 'failed'; linger: 'yes' | 'no' }): void {
  writeFileSync(join(systemd, 'active'), says.active)
  writeFileSync(join(systemd, 'linger'), says.linger)
}

function thePage(): Page {
  if (page === null || app === null) throw new Error('No page for the office of the first use.')
  return page
}

async function visit(lang: 'en' | 'zh', mode: 'inspect' | 'normal' = 'inspect'): Promise<void> {
  const on = thePage()
  await on.goto('about:blank')
  await on.goto(`${app?.site ?? ''}/?mode=${mode}${lang === 'zh' ? '&lang=zh' : ''}#/terminals`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(on, 60_000)
  expect(await on.evaluate(() => document.documentElement.lang)).toBe(lang)
}

/**
 * Measure a scene at the widest and the narrowest width in the light theme: it never scrolls sideways, and it is
 * photographed when asked. Whether a page scrolls sideways does not depend on the colours.
 */
async function sweep(scene: string, lang: 'en' | 'zh'): Promise<void> {
  const on = thePage()
  const theme = 'light'
  await on.emulateMedia({ colorScheme: theme })
  for (const width of [1440, 390]) {
    await on.setViewportSize({ width, height: 900 })
    await theResizeIsDrawn(on)
    expect(await on.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${scene} ${String(width)} ${theme} ${lang}`).toBeLessThanOrEqual(1)
    if (SHOOT) await on.evaluate(() => window.scrollTo(0, 0))
    if (SHOOT) await on.screenshot({ path: join(SHOTS as string, `${scene}-${String(width)}-${theme}-${lang}.png`), fullPage: true })
  }
  await on.emulateMedia({ colorScheme: 'light' })
  await on.setViewportSize({ width: 1440, height: 900 })
}

describe('the first use of Terminal management', () => {
  it('2. the press on the Chinese page starts the holder, and the page then says it runs, in both languages', async () => {
    if (first === null) throw new Error('No office of the first use.')
    const on = thePage()
    try {
      await visit('zh')
      await on.getByRole('button', { name: WORDS.zh('terminals.holder.start') }).click()
      await on.locator('.tm-holder-running').waitFor({ state: 'visible', timeout: 30_000 })
    } finally {
      // THE HOLDER THE PRESS STARTED is this test's to stop, by its process group, which is its pid.
      const holder = (await ask(first.api, '/api/terminals')).body['holder'] as { state: string; pid?: number }
      if (typeof holder.pid === 'number') groups.add(holder.pid)
    }
    for (const lang of ['zh', 'en'] as const) {
      const t = WORDS[lang]
      await visit(lang)
      expect(await on.locator('.tm-holder-running .tm-holder-line').innerText()).toBe(t('terminals.holder.running'))
      expect(await on.getByText(t('terminals.noneOpen')).count()).toBe(1)
      // SAID, NOT A DASH (round 7): the state words are the whole of what is drawn.
      expect(await on.locator('.tm-none').innerText()).toBe(t('terminals.noneOpen'))
      await sweep('first-use-after', lang)
    }
  }, 180_000)

  it('3. a terminal the person opens then appears, opens from its row, and runs what they type', async () => {
    if (first === null) throw new Error('No office of the first use.')
    const opened = await ask(first.api, '/api/terminals', { method: 'POST', headers: AS_THE_PERSON, body: { folder, command: '/bin/sh', args: [] } })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    groups.add((opened.body['terminal'] as HeldTerminal).pid)
    const on = thePage()
    for (const lang of ['zh', 'en'] as const) {
      await visit(lang)
      await on.locator('.tm-row').filter({ hasText: folder }).locator('.tm-row-press').click()
      await on.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
      await on.locator('.tm-view-screen').click()
      await on.keyboard.type(`echo first-${lang}-$((6*7))`)
      await on.keyboard.press('Enter')
      const rows = await until(() => on.locator('.tm-view .xterm-rows').innerText().catch(() => ''), (text) => text.includes(`first-${lang}-42`))
      expect(rows).toContain(`first-${lang}-42`)
      await sweep('first-use-opened', lang)
    }
  }, 180_000)

  /** The terminal open below its row: its folder, and that what the person types runs in it. */
  async function itRuns(lang: 'en' | 'zh', at: string, word: string): Promise<void> {
    const on = thePage()
    const row = on.locator(".tm-row[data-open='1']")
    await row.locator('.tm-view .xterm-rows').waitFor({ state: 'visible', timeout: 30_000 })
    expect(await row.locator('.tm-row-folder dd').nth(1).innerText()).toBe(at)
    await row.locator('.tm-view-screen').click()
    await on.keyboard.type(`echo ${word}-${lang}-$((6*7)) && pwd`)
    await on.keyboard.press('Enter')
    const rows = await until(() => row.locator('.tm-view .xterm-rows').innerText().catch(() => ''), (text) => text.includes(`${word}-${lang}-42`) && text.includes(at))
    expect(rows).toContain(`${word}-${lang}-42`)
    expect(rows).toContain(at)
  }

  /** The process groups of every terminal open now, so the end stops each one. */
  async function noteTheTerminals(): Promise<void> {
    if (first === null) return
    for (const one of ((await ask(first.api, '/api/terminals', { headers: AS_THE_PERSON })).body['terminals'] ?? []) as HeldTerminal[]) groups.add(one.pid)
  }

  for (const lang of ['en', 'zh'] as const) {
    it(`4. one press on the ${lang === 'en' ? 'English' : 'Chinese'} page opens the person's shell in their home folder, where its row is`, async () => {
      const on = thePage()
      try {
        await visit(lang)
        await on.getByRole('button', { name: WORDS[lang]('terminals.shell.openHome') }).click()
        await itRuns(lang, place.home, 'home')
      } finally {
        await noteTheTerminals()
      }
      await sweep('plain-terminal-home', lang)
    }, 180_000)
  }

  for (const lang of ['zh', 'en'] as const) {
    it(`5. on the ${lang === 'en' ? 'English' : 'Chinese'} page, a folder the person writes opens their shell there, and a folder that is not there is refused`, async () => {
      const t = WORDS[lang]
      const on = thePage()
      try {
        await visit(lang)
        await on.getByText(t('terminals.shell.elsewhere')).click()
        const box = on.getByLabel(t('terminals.shell.folder'))
        const before = await on.locator('.tm-row').count()
        // EACH REFUSAL IS THE WHOLE SENTENCE IN THE PAGE'S LANGUAGE, with what to write instead (round 7b): one English
        // word inside the Chinese sentence makes it differ.
        const refused = on.locator('.tm-open-refused')
        for (const [written, code] of [
          ['other-yard', 'server.terminalFolderNotAbsolute'],
          [join(place.dir, 'no-such-yard'), 'server.terminalFolderMissing'],
        ] as const) {
          await box.fill(written)
          await on.getByRole('button', { name: t('terminals.shell.openThere') }).click()
          await refused.waitFor({ state: 'visible' })
          await until(() => refused.innerText(), (text) => text.includes(written))
          expect(await refused.innerText()).toBe(`${t('terminals.shell.refused')} ${t(code, { folder: written })}`)
          expect(await on.locator('.tm-row').count()).toBe(before)
        }
        await sweep('open-refused', lang)
        await box.fill(elsewhere)
        await on.getByRole('button', { name: t('terminals.shell.openThere') }).click()
        await itRuns(lang, elsewhere, 'there')
        expect(await on.locator('.tm-open-refused').count()).toBe(0)
      } finally {
        await noteTheTerminals()
      }
      await sweep('plain-terminal-there', lang)
    }, 180_000)
  }

  it('7. at 390, the chat press covers no button, link or fold of the page', async () => {
    const on = thePage()
    for (const lang of ['en', 'zh'] as const) {
      await visit(lang, 'normal')
      await on.setViewportSize({ width: 390, height: 900 })
      await on.locator('.sal').getByRole('button').first().waitFor({ state: 'visible' })
      // A terminal open below its row, as the person would have it.
      await on.locator('.tm-row-press').first().click()
      await on.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
      // THE CHAT PRESS THIS CASE IS ABOUT IS THERE, or the case would pass with nothing to cover anything.
      // Below 1024 design D draws it in the top bar, not as the corner circle.
      await on.locator('.shell-bar .shell-chat-phone').waitFor({ state: 'visible', timeout: 5_000 })
      const covered = await on.evaluate(() => {
        const out: string[] = []
        const all = [...document.querySelectorAll<HTMLElement>('.tm button, .tm summary, .tm a[href], .tm input, .tm select, .tm textarea:not(.xterm-helper-textarea)')]
        for (const one of all) {
          // INSIDE A CLOSED FOLD it cannot be pressed at all, and its summary is measured instead.
          const fold = one.closest('details')
          if (fold !== null && !fold.open && one.tagName !== 'SUMMARY') continue
          const box = one.getBoundingClientRect()
          if (box.width === 0 || box.height === 0 || getComputedStyle(one).visibility === 'hidden') continue
          one.scrollIntoView({ block: 'center' })
          // A LINK THAT WRAPS is measured on its first line, since the middle of its whole box can fall between lines.
          const at = one.getClientRects()[0] ?? one.getBoundingClientRect()
          // NO PART OF IT IS COVERED: its middle and a point just inside each corner are each the element itself.
          const inset = Math.min(3, at.width / 4, at.height / 4)
          const points: [number, number][] = [
            [at.left + at.width / 2, at.top + at.height / 2],
            [at.left + inset, at.top + inset],
            [at.right - inset, at.top + inset],
            [at.left + inset, at.bottom - inset],
            [at.right - inset, at.bottom - inset],
          ]
          for (const [x, y] of points) {
            const found = document.elementFromPoint(x, y)
            if (found !== null && (one === found || one.contains(found))) continue
            out.push(`${one.tagName} "${(one.innerText || one.getAttribute('aria-label') || '').slice(0, 40)}" at ${String(Math.round(x))},${String(Math.round(y))} under ${found === null ? 'nothing' : `${found.tagName}.${String(found.className)}`}`)
            break
          }
        }
        return out
      })
      expect(covered, lang).toEqual([])
      await on.setViewportSize({ width: 1440, height: 900 })
    }
  }, 180_000)
})
