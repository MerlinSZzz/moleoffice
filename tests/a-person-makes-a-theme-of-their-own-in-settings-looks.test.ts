// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON MAKES A THEME OF THEIR OWN IN SETTINGS, IN THE THEMES PANEL OF THE LOOKS TAB, in a browser,
 * in a test office of its own (j).
 *
 * The panel lists the three looks, the six themes and the person's own. A look cannot be copied and a
 * shipped theme can only be copied. The person copies a shipped theme, changes a colour and sees the
 * preview change before saving. The readability check marks each pair the change made too faint, with
 * the moves that would fix it. Save is refused by the office with the reader's own sentences, and
 * nothing is written. The person fixes the colour, saves, renames the theme, uses it and deletes it,
 * and the page is then drawn in the theme it was copied from. The row of the look in use says so, in a
 * pair of colours the readability check measures.
 *
 * Every expected sentence, pair and ratio is read from the shared code that makes it. The theme's
 * new name is made up.
 */
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { asATheme, readTheLook, type OwnTheme, type TheLook } from '../src/shared/own-themes.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { READABILITY_PAIRS, howToFixIt, ratioWords, whyTheThemeIsHardToRead } from '../src/shared/readability.ts'
import { THEMES } from '../src/shared/themes.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'

// A light theme, so a white text colour is too faint on it. Read from the data.
const SOURCE = THEMES.find((theme) => theme.look === 'light')!
const FAINT = '#ffffff'
const FIXED = '#000000'
const NEW_NAME = 'Made-up dusk'
const say = (key: Parameters<typeof sayInEnglish>[0], values?: Record<string, string | number>) => sayInEnglish(key, values)

describe('a person makes a theme of their own in the Themes panel of the Looks tab in Settings', () => {
  let app: LiveApp
  let asThePerson: Record<string, string>

  beforeAll(async () => {
    app = await liveApp({ name: 'a-theme-of-their-own', workspace: 'default', viewport: { width: 1440, height: 900 } })
    asThePerson = {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
      ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
    }
  }, 240_000)

  afterAll(async () => { await app?.stop() })

  async function theLookTheOfficeKeeps(): Promise<TheLook | null> {
    const read = await fetch(`${app.api}/api/participants?shape=page`, { headers: asThePerson })
    expect(read.status).toBe(200)
    const person = ((await read.json()) as { people: { id: string; themes?: TheLook | null }[] }).people.find((one) => one.id === THE_PERSON)
    expect(person?.themes).not.toBeUndefined()
    return person!.themes!
  }

  /** Press a button and wait for the office's answer to the change it sends. */
  async function pressAndWait(page: Page, press: () => Promise<void>): Promise<number> {
    const answered = page.waitForResponse((reply) => reply.request().method() === 'PATCH' && reply.url().includes(`/api/participants/person/${THE_PERSON}`))
    await press()
    return (await answered).status()
  }

  /**
   * THE ROW OF THE LOOK IN USE SAYS SO, and its words can be read. They are drawn in the text colour of a
   * pair the readability check measures, on that pair's ground, so every theme the check accepts draws
   * them readably. A line pair is held only to the floor for lines, so it does not count.
   */
  async function expectTheInUseWordsToRead(tab: Locator): Promise<void> {
    const words = tab.locator('.owth-row[data-in-use="true"] .owth-in-use')
    expect(await words.count()).toBe(1)
    expect(await words.innerText()).toBe(say('settingsPanel.ownThemes.inUse'))
    const drawn = await words.evaluate((element, pairs) => {
      const row = element.closest('.owth-row')!
      const colourOf = (name: string): string => {
        const probe = document.createElement('span')
        probe.style.color = `var(${name})`
        row.append(probe)
        const colour = getComputedStyle(probe).color
        probe.remove()
        return colour
      }
      const colour = getComputedStyle(element).color
      const ground = getComputedStyle(row).backgroundColor
      const measured = pairs.filter(([fg, bg]) => colourOf(fg) === colour && colourOf(bg) === ground).map(([fg, bg]) => `${fg} on ${bg}`)
      return { colour, ground, measured }
    }, READABILITY_PAIRS.filter((pair) => pair.floor !== 'line').map((pair) => [pair.fg, pair.bg] as const))
    expect(drawn.measured, `"In use" is drawn in ${drawn.colour} on ${drawn.ground}, which is no pair the check measures`).not.toEqual([])
  }

  it('copies a shipped theme, previews and checks a change, is refused, then saves, renames, uses and deletes it', async () => {
    const page = app.page
    await page.goto(`${app.site}/?lang=en#/settings`)
    await waitForThePage(page, 30_000)
    await openSettingsPanel(page, 'settings.ownthemes')
    const tab = page.locator('[data-settings-panel="settings.ownthemes"]')
    const row = (id: string) => tab.locator(`.owth-row[data-theme-id="${id}"]`)
    await row(SOURCE.id).waitFor()

    // THE LIST: three looks with no copy, six themes with copy and no change, and none of the person's own yet.
    for (const look of ['auto', 'light', 'dark']) {
      expect(await row(look).count(), look).toBe(1)
      expect(await row(look).getByRole('button', { name: say('settingsPanel.ownThemes.copy') }).count(), look).toBe(0)
    }
    for (const theme of THEMES) {
      expect(await row(theme.id).getByRole('button', { name: say('settingsPanel.ownThemes.copy') }).count(), theme.id).toBe(1)
      expect(await row(theme.id).getByRole('button', { name: say('settingsPanel.ownThemes.change') }).count(), theme.id).toBe(0)
    }
    expect(await tab.locator('.owth-says').innerText()).toBe(say('absence.none'))
    await expectTheInUseWordsToRead(tab)

    // COPY. The office keeps the copy at once, unchanged, and the panel opens it to be changed.
    const copyName = say('settingsPanel.ownThemes.copyName', { name: SOURCE.name.en })
    expect(await pressAndWait(page, () => row(SOURCE.id).getByRole('button', { name: say('settingsPanel.ownThemes.copy') }).click())).toBe(200)
    expect(await tab.locator('[role="status"]').innerText()).toContain(say('settingsPanel.ownThemes.copied', { name: copyName, from: SOURCE.name.en }))
    const afterCopy = await theLookTheOfficeKeeps()
    expect(afterCopy?.own).toHaveLength(1)
    const copy: OwnTheme = afterCopy!.own[0]!
    expect(copy.name).toBe(copyName)
    expect(copy.from).toBe(SOURCE.id)
    expect(copy.values).toEqual(SOURCE.values)
    const editor = tab.locator(`.owth-edit[data-editing="${copy.id}"]`)
    await editor.waitFor()

    // CHANGE A COLOUR. The preview is drawn with it before anything is saved.
    const preview = editor.locator('.owth-preview-body')
    const colourBefore = await preview.evaluate((element) => getComputedStyle(element).color)
    await editor.locator('details.owth-group[data-group="colour"] > summary').click()
    const textValue = editor.getByLabel(say('settingsPanel.ownThemes.valueOf', { name: '--text' }), { exact: true })
    await textValue.fill(FAINT)
    expect(await preview.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)')
    expect(colourBefore).not.toBe('rgb(255, 255, 255)')
    expect(await editor.innerText()).toContain(say('settingsPanel.ownThemes.notSaved', { n: 1 }))

    // THE CHECK MARKS EACH PAIR THE CHANGE MADE TOO FAINT, with its ratio and the moves that would fix it.
    const faint: OwnTheme = { ...copy, values: { ...copy.values, '--text': FAINT } }
    const answer = whyTheThemeIsHardToRead(asATheme(faint), faint.name)
    expect(answer.failing.length).toBeGreaterThan(0)
    const marked = await editor.locator('.owth-pair[data-passes="false"]').evaluateAll((items) => items.map((item) => Number(item.getAttribute('data-pair'))))
    expect(marked).toEqual(answer.failing.map(({ measurement }) => READABILITY_PAIRS.indexOf(measurement.pair)))
    for (const failing of answer.failing) {
      const { measurement } = failing
      const item = editor.locator(`.owth-pair[data-pair="${String(READABILITY_PAIRS.indexOf(measurement.pair))}"]`)
      const words = await item.innerText()
      expect(words).toContain(say('settingsPanel.ownThemes.ratio', { ratio: ratioWords(measurement.ratio), floor: measurement.floor }))
      expect(words).toContain(say(howToFixIt(failing), { fg: measurement.pair.fg, bg: measurement.pair.bg }))
    }
    expect(await editor.innerText()).toContain(say('settingsPanel.ownThemes.checkFailsCount', { failing: answer.failing.length, all: READABILITY_PAIRS.length }))

    // SAVE IS REFUSED by the office, with the reader's sentences, and nothing is written.
    const refused = readTheLook({ chosen: afterCopy!.chosen, own: [faint] })
    expect(refused.ok).toBe(false)
    const why = refused.ok ? '' : refused.why.join(' ')
    expect(await pressAndWait(page, () => editor.getByRole('button', { name: say('settingsPanel.ownThemes.save') }).click())).toBe(400)
    expect(await editor.locator('[role="alert"]').innerText()).toContain(say('settingsPanel.ownThemes.refused', { reason: `${why} Nothing was written.` }))
    expect((await theLookTheOfficeKeeps())?.own[0]?.values['--text']).toBe(SOURCE.values['--text'])

    // FIX AND SAVE.
    const fixed: OwnTheme = { ...copy, values: { ...copy.values, '--text': FIXED } }
    expect(whyTheThemeIsHardToRead(asATheme(fixed)).sentences).toEqual([])
    await textValue.fill(FIXED)
    expect(await editor.locator('.owth-pair[data-passes="false"]').count()).toBe(0)
    expect(await editor.innerText()).toContain(say('settingsPanel.ownThemes.checkPasses', { all: READABILITY_PAIRS.length }))
    expect(await pressAndWait(page, () => editor.getByRole('button', { name: say('settingsPanel.ownThemes.save') }).click())).toBe(200)
    expect(await tab.locator('[role="status"]').innerText()).toContain(say('settingsPanel.ownThemes.saved', { name: copyName }))
    expect((await theLookTheOfficeKeeps())?.own[0]?.values['--text']).toBe(FIXED)

    // RENAME.
    await editor.getByLabel(say('settingsPanel.ownThemes.name'), { exact: true }).fill(NEW_NAME)
    expect(await pressAndWait(page, () => editor.getByRole('button', { name: say('settingsPanel.ownThemes.rename') }).click())).toBe(200)
    expect(await tab.locator('[role="status"]').innerText()).toContain(say('settingsPanel.ownThemes.renamed', { name: NEW_NAME }))
    expect((await theLookTheOfficeKeeps())?.own[0]?.name).toBe(NEW_NAME)

    // USE IT, and the page is drawn in it.
    expect(await pressAndWait(page, () => row(copy.id).getByRole('button', { name: say('settingsPanel.ownThemes.use') }).click())).toBe(200)
    expect(await page.locator('html').getAttribute('data-theme')).toBe(copy.id)
    expect((await theLookTheOfficeKeeps())?.chosen).toBe(copy.id)
    await expectTheInUseWordsToRead(tab)

    // DELETE IT, asked twice. It was in use, so the choice becomes the theme it was copied from in the same write.
    await editor.getByRole('button', { name: say('settingsPanel.ownThemes.delete') }).click()
    expect(await editor.innerText()).toContain(say('settingsPanel.ownThemes.deleteSure', { name: NEW_NAME }))
    expect(await pressAndWait(page, () => editor.getByRole('button', { name: say('settingsPanel.ownThemes.deleteYes') }).click())).toBe(200)
    expect(await tab.locator('[role="status"]').innerText()).toContain(say('settingsPanel.ownThemes.deletedInUse', { name: NEW_NAME, from: SOURCE.name.en }))
    expect(await theLookTheOfficeKeeps()).toEqual({ chosen: SOURCE.id, own: [] })
    await page.waitForFunction((id) => document.documentElement.getAttribute('data-theme') === id, SOURCE.id, { timeout: 10_000 })
    expect(await row(copy.id).count()).toBe(0)
    expect(await tab.locator('.owth-says').innerText()).toBe(say('absence.none'))
  }, 240_000)
})
