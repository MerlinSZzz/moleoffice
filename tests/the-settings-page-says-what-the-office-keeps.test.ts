// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE SAYS WHAT THE OFFICE KEEPS. Criterion U6, the drawing half.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The three numbers default to 3, 7 and 180, and the page must SAY nobody has chosen rather than
 * drawing the defaults as the person's choice. That is a claim about what is on a screen, so it is measured
 * on a screen. The backups folder is read from the directory at the moment somebody asks, and the
 * second half of this file proves it by adding a file and reloading: a cached reading could not
 * change.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Every case waits for the section to be drawn before asserting what is in it, so a page that failed
 * to render cannot pass by having nothing to find.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp

const OWNER_HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': 'person',
}

/** Open the Settings page and wait for the section to have drawn. */
async function openTheSettings(mode: 'normal' | 'inspect' = 'normal'): Promise<void> {
  await app.page.goto(`${app.site}/?mode=${mode}#/settings/whatiskept`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('[data-target="uiSurface/settings.whatiskept"] .wik', { timeout: 20_000 })
}

/** The facts the section draws about the backups folder, as one string. */
async function theFolderFacts(): Promise<string> {
  return app.page.$eval('.wik-facts', (one) => one.textContent ?? '')
}

beforeAll(async () => {
  app = await liveApp({ name: 'what-the-office-keeps', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the section says what the office keeps', () => {
  it('draws the three numbers, says nobody has chosen, and names the backups folder', async () => {
    mkdirSync(join(app.dir, 'backups'), { recursive: true })
    await openTheSettings()

    // THE PANEL IS THE ONE THE REGISTRY NAMES, drawn under its own title.
    const title = await app.page.$eval(
      '[data-target="uiSurface/settings.whatiskept"] .px-panel-title',
      (one) => one.textContent ?? '',
    )
    expect(title.trim()).toBe('What the office keeps')

    // THE THREE NUMBERS, each with what it means and the default said out loud.
    const labels = await app.page.$$eval('.wik-label', (all) => all.map((one) => one.textContent ?? ''))
    expect(labels).toEqual([
      'Backups to keep',
      'Days an untraced request is kept',
      'Days a traced request is kept',
    ])
    const states = await app.page.$$eval('.wik-state', (all) => all.map((one) => one.textContent ?? ''))
    expect(states.length, 'the section drew no states at all, so nothing below is measured').toBe(3)
    const values = await app.page.$$eval('.wik-input', (all) =>
      all.map((one) => (one as HTMLInputElement).value),
    )
    // NOBODY CHOSE, SO EACH NUMBER IS THE DEFAULT, said in the word list's words with the number drawn beside it.
    for (const [at, state] of states.entries()) {
      expect(state, 'a number is drawn without saying nobody chose').toBe(createI18n('en').t('settingsPanel.kept.defaultInForce', { n: values[at] ?? '' }))
    }
    expect(values).toEqual(['3', '7', '180'])

    // NORMAL MODE NAMES NO PATH, by plan row G5 and a decision. The folder's place is shown in
    // developer mode, and what is in it is shown in both.
    expect(await app.page.locator('.wik-path').count()).toBe(0)
    expect(await app.page.locator('[data-target="uiSurface/settings.whatiskept"]').innerText()).not.toContain(app.dir)
    expect(await theFolderFacts()).toContain('In it')

    // AND THE FOLDER: where it is, and that an empty one reads as none rather than as unreadable.
    await openTheSettings('inspect')
    const folder = await app.page.$eval('.wik-path', (one) => one.textContent ?? '')
    expect(folder).toContain(app.dir)
    const facts = await theFolderFacts()
    expect(facts).toContain('Folder')
    expect(facts).toContain('In it')
  }, 120_000)

  it('reads the folder again on the next request', async () => {
    await openTheSettings()
    // THE CONTROL: the folder was empty on the previous case, so a number below means this read.
    expect(await theFolderFacts()).toContain('none')

    writeFileSync(join(app.dir, 'backups', 'mole-office-first.db'), 'x'.repeat(1000))
    await openTheSettings()
    expect(await theFolderFacts(), 'the first file is not counted').toContain('1 file')

    writeFileSync(join(app.dir, 'backups', 'mole-office-second.db'), 'y'.repeat(500))
    await openTheSettings()
    // A CACHED READING could not see the second file.
    expect(await theFolderFacts(), 'the folder reading was cached').toContain('2 files')
  }, 120_000)

  it('draws a backup\'s folder of copied files beside the files, and its bytes in the size', async () => {
    await openTheSettings()
    // THE CONTROL: the previous case left two files and no folder, so the words below mean this read.
    expect(await theFolderFacts()).toContain('2 files, 1.5 KB')

    const files = join(app.dir, 'backups', 'mole-office-second.files', 'report-files')
    mkdirSync(files, { recursive: true })
    writeFileSync(join(files, 'a1.ts'), 'r'.repeat(1024))
    await openTheSettings()
    expect(await theFolderFacts(), 'the folder of copied files is not drawn').toContain(
      '2 files and 1 folder of copied files, 2.5 KB',
    )
    // AND WHAT A BACKUP IS, said above it, names the files it carries: all three folders since problem
    // 9AwaBTTDUh6H's sentence (uploaded pictures joined the other two on 27 September 2026). Normal mode draws it in
    // one short line since wave 13y round 121, and developer mode the whole of it.
    await openTheSettings('inspect')
    const lead = await app.page.$eval('[data-target="uiSurface/settings.whatiskept"]', (one) => one.textContent ?? '')
    expect(lead).toContain('report files, message pictures and uploaded pictures')
  }, 120_000)

  it('draws a list of what was left out as a list, not as one more backup file', async () => {
    await openTheSettings()
    // THE CONTROL: the previous case left two files and one folder, so the words below mean this read.
    expect(await theFolderFacts()).toContain('2 files and 1 folder of copied files, 2.5 KB')

    writeFileSync(join(app.dir, 'backups', 'mole-office-first.left-out.txt'), 'l'.repeat(512))
    await openTheSettings()
    expect(await theFolderFacts(), 'the left-out list is not drawn as a list').toContain(
      '2 files, 1 folder of copied files and 1 list of what was left out, 3.0 KB',
    )
  }, 120_000)

  it('writes a number the person types and reads it back', async () => {
    await openTheSettings()
    const box = '[data-kept="tracedRequestDays"] .wik-input'
    await app.page.fill(box, '200')
    // THE SAVE IS WAITED FOR BY ITS OWN ANSWER (acceptance finding 56, VtCw66ZmGn74). The box reads 200 as
    // soon as it is typed, so a wait on the box let the read below reach the server before the POST had landed, and the
    // case went red now and then on a slow server. The POST is held back here for a moment on purpose, so that a wait on
    // anything but its answer goes red every time rather than now and then.
    const theDoor = (url: URL): boolean => url.pathname === '/api/office/what-is-kept'
    const holdTheSave = async (route: Route): Promise<void> => {
      if (route.request().method() === 'POST') await new Promise((ok) => setTimeout(ok, 1_500))
      await route.continue()
    }
    // THE HOLD STAYS UNTIL THE SERVER HAS BEEN READ: taking it away earlier waits for the held save, which would let a
    // wait on the box pass by the hold's own doing.
    await app.page.route(theDoor, holdTheSave)
    try {
      const saved = app.page.waitForResponse((reply) => theDoor(new URL(reply.url())) && reply.request().method() === 'POST')
      await app.page.click('[data-kept="tracedRequestDays"] .wik-keep')
      expect((await saved).status()).toBe(200)
      // THE SERVER IS WHAT IS READ. A row that only changed its box would pass a wait on the box.
      const reply = await fetch(`${app.api}/api/office/what-is-kept`, { headers: OWNER_HEADERS })
      expect(reply.status, await reply.clone().text()).toBe(200)
      const said = (await reply.json()) as { numbers: { key: string; inForce: number | null; from: string }[] }
      const traced = said.numbers.find((one) => one.key === 'tracedRequestDays')
      expect(traced?.inForce).toBe(200)
      expect(traced?.from).toBe("the person's setting")
    } finally {
      await app.page.unroute(theDoor, holdTheSave)
    }
  }, 120_000)
})
