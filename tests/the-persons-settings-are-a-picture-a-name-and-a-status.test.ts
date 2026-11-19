// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S SETTINGS: A PICTURE ON THE LEFT, `Name:` AND `Status:` ON THE RIGHT, EACH WITH A PENCIL.
 *
 * The settings page: the picture is changed by pressing the avatar, not by two separate buttons under it,
 * and "Use the drawn one" is not needed. A second, lower-case name drawn under the name was unclear.
 * So the page becomes: the avatar on the left, pressed to change it; on the right Name:, with a pencil
 * beside it to change it, and under it Status:, changed the same way. Criterion M37 of design/messages/ACCEPTANCE.md
 * section 9e; problem `U6Bl1OgxFIAo`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHY SOME OF IT IS GEOMETRY
 * ---------------------------------------------------------------------------------------
 *
 * "On the left" and "on the right" are claims about boxes on a screen, so they are measured as
 * boxes: the picture's box ends before the lines' box begins, and the status line sits under the
 * name line. Markup alone would satisfy neither.
 *
 * THE EDITS ARE DRIVEN AND THEN READ FROM THE SERVER. A pencil that opened a box and stored nothing
 * would draw exactly the same thing as one that worked, so each edit is read back through the door.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Each case reads the value before it changes it, and the first case asserts both lines and the
 * picture are drawn before it asserts what is NOT drawn beside them. A panel that failed to render
 * would otherwise pass every "this is not on the page" assertion.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel, readEverySettingsCategory } from './settings-folds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { STATE_PRESETS } from '../src/shared/participants.ts'
import { APPEARANCE_WORDS } from '../src/web/components/Appearance.tsx'
import { PICKER_WORDS } from '../src/web/components/AvatarPicker.tsx'
import { THIS_COMPUTER_WORDS } from '../src/web/components/ThisComputer.tsx'
import { DEVELOPER_ONLY_PANELS, TITLE_KEYS, WINDOW_ONLY_PANELS } from '../src/web/pages/SettingsPage.tsx'
import { SURFACES, type SurfaceId } from '../src/shared/surfaces.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Settings, with one panel's category chosen: Settings draws one category at a time (wave 13y round 125, item 62). */
async function openTheSettings(mode: 'normal' | 'inspect' = 'normal', panel: 'settings.appearance' | 'settings.thiscomputer' = 'settings.appearance'): Promise<void> {
  await app.page.goto(`${app.site}/?mode=${mode}#/settings`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await openSettingsPanel(app.page, panel)
  if (panel === 'settings.appearance') await app.page.waitForSelector('.app-face', { timeout: 20_000 })
}

/** The person's row as the registry holds it, read through the door. */
async function me(): Promise<{ name: string; state: string | null }> {
  const got = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { participant: { name: string; state: string | null } }).participant
}

/** The labelled lines, by the label each carries. */
async function theLines(): Promise<{ line: string; label: string; value: string }[]> {
  return app.page.$$eval('.app-line', (all) =>
    all.map((one) => ({
      line: one.getAttribute('data-line') ?? '',
      label: one.querySelector('.app-label')?.textContent ?? '',
      value: one.querySelector('.app-value')?.textContent ?? '',
    })),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-persons-settings', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the panel is a picture, a name and a status', () => {

  it('puts the picture on the left and the lines beside it, the status under the name', async () => {
    await openTheSettings()
    const boxes = await app.page.evaluate(() => {
      const box = (selector: string): { left: number; right: number; top: number } | null => {
        const one = document.querySelector(selector)
        if (one === null) return null
        const at = one.getBoundingClientRect()
        return { left: at.left, right: at.right, top: at.top }
      }
      return {
        face: box('.app-face'),
        lines: box('.app-lines'),
        name: box('.app-line[data-line="name"]'),
        status: box('.app-line[data-line="status"]'),
      }
    })
    const { face, lines, name, status } = boxes
    if (face === null || lines === null || name === null || status === null) {
      throw new Error('the panel does not draw a picture and two lines')
    }
    // ON THE LEFT: the picture's box ends before the lines begin.
    expect(lines.left, 'the lines are not beside the picture').toBeGreaterThanOrEqual(face.right - 1)
    // AND THE STATUS IS UNDER THE NAME, not beside it.
    expect(status.top, 'the status is not under the name').toBeGreaterThan(name.top)
    expect(status.left).toBeCloseTo(name.left, 0)
  }, 120_000)

  it('has no picture presses of its own, and opens the picker from the picture', async () => {
    await openTheSettings()
    const before = await app.page.$eval('.app-body', (one) => one.textContent ?? '')
    expect(before, 'the file chooser is still a press on this panel').not.toContain('Choose a picture')
    expect(before, '"Use the drawn one" is still drawn').not.toContain('Use the drawn one')
    expect(before, 'the picker is open before the picture is pressed').not.toContain(PICKER_WORDS.heading)

    await app.page.click('.app-face')
    await app.page.waitForSelector('.avp', { timeout: 20_000 })
    // AND THE FILE CHOOSER IS IN THERE, so nothing the owner could do before is gone.
    const inThePicker = await app.page.$eval('.avp', (one) => one.textContent ?? '')
    expect(inThePicker, 'the picker does not offer a picture from this computer').toContain(
      PICKER_WORDS.fromThisComputer,
    )
    expect(await app.page.$$eval('.avp-file input[type="file"]', (all) => all.length)).toBe(1)
  }, 120_000)
})

describe('each pencil edits its own line where it stands', () => {
  it('changes the name and stores it', async () => {
    await openTheSettings()
    expect((await me()).name, 'the name is already what this case sets it to').toBe(THE_TEST_OFFICES_OWNER.name)

    await app.page.click('.app-line[data-line="name"] .app-pencil')
    await app.page.waitForSelector('.app-line[data-line="name"] .app-box', { timeout: 20_000 })
    await app.page.fill('.app-line[data-line="name"] .app-box', 'Morgan Vale')
    await app.page.click('.app-line[data-line="name"] .app-keep')
    await app.page.waitForFunction(
      () => document.querySelector('.app-line[data-line="name"] .app-value')?.textContent === 'Morgan Vale',
      undefined,
      { timeout: 20_000 },
    )
    // THE REGISTRY IS WHAT IS READ. A pencil that only changed a drawing would pass the line above.
    expect((await me()).name).toBe('Morgan Vale')
  }, 120_000)

  it('changes the status, offers the presets inside the editor, and stores it', async () => {
    await openTheSettings()
    expect((await me()).state, 'a status is already set, so the case below proves nothing').toBeNull()
    const lines = await theLines()
    expect(lines[1]?.value, 'an unset status does not say so').toBe(APPEARANCE_WORDS.noState)

    await app.page.click('.app-line[data-line="status"] .app-pencil')
    await app.page.waitForSelector('.app-line[data-line="status"] .app-box', { timeout: 20_000 })
    // THE PRESETS ARE OFFERED INSIDE THE EDITOR, where the typing is, rather than on the panel at
    // rest. They are read from the declaration, so one added there is offered without editing this.
    const offered = await app.page.$$eval('.app-line[data-line="status"] .app-presets button', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    for (const preset of STATE_PRESETS) expect(offered, `${preset} is not offered`).toContain(preset)

    await app.page.fill('.app-line[data-line="status"] .app-box', 'writing the handback')
    await app.page.click('.app-line[data-line="status"] .app-keep')
    await app.page.waitForFunction(
      () => document.querySelector('.app-line[data-line="status"] .app-value')?.textContent === 'writing the handback',
      undefined,
      { timeout: 20_000 },
    )
    expect((await me()).state).toBe('writing the handback')
  }, 120_000)

  it('leaves the line exactly as it was when the edit is dropped', async () => {
    await openTheSettings()
    const before = await me()
    await app.page.click('.app-line[data-line="name"] .app-pencil')
    await app.page.waitForSelector('.app-line[data-line="name"] .app-box', { timeout: 20_000 })
    await app.page.fill('.app-line[data-line="name"] .app-box', 'Somebody Else')
    await app.page.click('.app-line[data-line="name"] .app-leave')
    await app.page.waitForFunction(
      () => document.querySelectorAll('.app-line[data-line="name"] .app-box').length === 0,
      undefined,
      { timeout: 20_000 },
    )
    const lines = await theLines()
    expect(lines[0]?.value, 'the dropped edit was drawn anyway').toBe(before.name)
    expect((await me()).name, 'the dropped edit was stored').toBe(before.name)
  }, 120_000)
})

describe('the page says what this computer is doing, and says nothing the server did not', () => {
  it('draws the database file, the checkout and the project the runtime record names, and offers no control', async () => {
    // The middle rung: the Settings page gets this machine's facts, and read-only. The owner
    // does not need to move their database from a settings page; they need not to be told something false about it,
    // and to be able to find it without knowing a Runtime page exists. Every value is compared with GET /api/runtime
    // rather than with a string typed here, because a panel drawing its own idea of the database path is the defect
    // this repairs.
    // This computer is a developer-mode panel since plan row G5 (report 7FEOshq3mBGG).
    await openTheSettings('inspect', 'settings.thiscomputer')
    await app.page.waitForSelector('.tcp', { timeout: 20_000 })
    const said = await fetch(`${app.api}/api/runtime`, { headers: AS_THE_OWNER })
    expect(said.status, await said.clone().text()).toBe(200)
    const record = (await said.json()) as {
      database: { path: string }
      repository: { path: string }
      addresses: { forOtherMachines: { web: string } | null }
    }

    const rows = await app.page.$$eval('.tcp-pair', (all) =>
      all.map((one) => ({
        key: one.querySelector('.tcp-key')?.textContent ?? '',
        value: one.querySelector('.tcp-val')?.textContent ?? '',
      })),
    )
    const valueOf = (key: string): string => rows.find((one) => one.key === key)?.value ?? ''
    // FIVE ROWS: the four facts, and since wave 13n round 32 the read-only line for the setting that
    // refuses a message to an agent nothing is answering as. That line has its own test file,
    // tests/the-settings-page-names-the-setting-that-refuses-a-message.test.ts.
    expect(rows.length, 'the panel drew no rows at all, so nothing below was measured').toBe(5)
    expect(valueOf(THIS_COMPUTER_WORDS.database)).toBe(record.database.path)
    expect(valueOf(THIS_COMPUTER_WORDS.checkout)).toBe(record.repository.path)
    expect(valueOf(THIS_COMPUTER_WORDS.project).length, 'the project row is empty').toBeGreaterThan(0)
    // The address, or the words for there being none. They are written at the point they are drawn,
    // inside the `Absence` that draws them, so this test names them rather than importing them.
    expect(valueOf(THIS_COMPUTER_WORDS.address)).toBe(
      record.addresses.forOtherMachines?.web ?? 'nothing — only this computer can open it',
    )

    // READ-ONLY END TO END. Nothing in .env becomes changeable from this page, which is the half of
    // the decision that is a refusal rather than a feature.
    const controls = await app.page.$$eval('[data-target="uiSurface/settings.thiscomputer"]', (all) =>
      all.map((one) => one.querySelectorAll('input, select, textarea, button').length),
    )
    expect(controls, 'the panel offers something to press or type into').toEqual([0])

    // AND THE REST IS ONE PRESS AWAY, so a person never has to know the Runtime page exists.
    const more = await app.page.getAttribute('.tcp-more', 'href')
    expect(more).toContain('runtime')
  }, 120_000)
})

describe('the page draws every panel it has a title for, and no other', () => {
  it('draws every panel on the page and no panel that is not on it', async () => {
    // WHAT WENT WRONG. The line read "These settings are remembered in this browser. They apply to
    // every project." That was true of the four panels the page opened with. Four more were added
    // that write to Mole Office, one of those is about a single project, and two more only report
    // what this computer is doing. Nothing failed when the sentence stopped being true, which is
    // the defect CLAUDE.md names. A decision drew the line from a table. Wave
    // 13y round 121 took the line and its table out, so this test compares the page with the panels
    // the page has a title for.
    await openTheSettings()
    // Every panel's title is drawn in its category, and the page draws one category at a time (wave 13y round 125),
    // so the titles are read category by category.
    const titles = async () => (await app.page.locator('.set .sf-title').allTextContents()).map((one) => one.trim())
    const drawn: string[] = []
    await readEverySettingsCategory(app.page, async () => { drawn.push(...await titles()) })
    // The developer panels (plan row G5) are left out in normal mode. So are the panels drawn only
    // in the standalone window, since this is a browser.
    const named = Object.keys(TITLE_KEYS)
      .filter((id) => !DEVELOPER_ONLY_PANELS.has(id as never) && !WINDOW_ONLY_PANELS.has(id as never))
      .map((id) => SURFACES[id as SurfaceId])
    expect(drawn.length, 'the page drew no panels at all, so nothing here was measured').toBeGreaterThan(5)
    expect([...drawn].sort()).toEqual([...named].sort())

    await app.page.goto(`${app.site}/?mode=inspect#/settings`)
    await waitForThePage(app.page, 30_000)
    await app.page.locator('html[data-mode="inspect"] .set .sf-jump').first().waitFor()
    const allDrawn: string[] = []
    await readEverySettingsCategory(app.page, async () => { allDrawn.push(...await titles()) })
    const allNamed = Object.keys(TITLE_KEYS).filter((id) => !WINDOW_ONLY_PANELS.has(id as never)).map((id) => SURFACES[id as SurfaceId])
    expect(allDrawn.sort()).toEqual(allNamed.sort())
  }, 120_000)
})
