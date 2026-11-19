// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED LIST OF QUICK INPUTS NAMES THE INPUT THAT WAS WRONG, AND THE RULE IT BROKE. Wave 13u round 31, item 11.
 *
 * THE OLD WORDING. Every refusal of a list carried one code, `quickInputListNotOne`, and the page drew the one
 * sentence of `server.quickInputListNotOne`, which states every rule and names no input. The server's English
 * sentence named the input in most cases, but the page draws a coded refusal from its code and not from that
 * sentence, so a person who typed a list with one wrong input was told the rules again and not which line was wrong.
 *
 * THE NEW WORDING. Each broken rule has a code of its own, and the refusal carries the input it concerns: its place
 * in the list (counted from 1, among the non-blank lines the panel sends) and what a person can see of it. A rule
 * about the whole list (not a list, an empty list, more than {most} inputs) carries what was wrong with the list.
 * An input that holds a key is named by its place and by the part before that key, never with the key in it.
 *
 * MADE-UP DATA, in a throwaway office: the panel's own starting list, and the lines this test types.
 *
 * MUTATIONS (each after a control run; the report has the runs and the logs):
 *   - the door answers every broken list with one code again: all three cases go red on the code's sentence.
 *   - the too-long refusal sends the whole input instead of its visible part: case 2 goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { photographWithNothingOver, testShots } from './where-shots-go.ts'

let app: LiveApp
let db: TestDb

const shots = testShots('quick-inputs-refused')
const keepTheShots = (process.env['TEST_SHOTS'] ?? '') !== ''
const en = createI18n('en')

beforeAll(async () => {
  db = await freshDb()
  app = await liveApp({ name: 'quick-inputs-refused', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(
    ({ person }) => {
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
      localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
    },
    { person: THE_TEST_OFFICES_OWNER.id },
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

/** Open Settings with the quick inputs panel open, at one width and theme, so the box is ready. */
async function open(width = 1440, theme = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1100 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${theme}&mode=normal#/settings`)
  await waitForThePage(app.page, 60_000)
  await openSettingsPanel(app.page, 'settings.quickinputs')
  await app.page.locator('.qin-box').waitFor()
}

/** Type a list, press Save, and answer the refusal the panel drew under the presses. */
async function saveAndReadTheRefusal(lines: string): Promise<string> {
  await app.page.locator('.qin-box').fill(lines)
  await app.page.getByRole('button', { name: en.t('quickInputs.save'), exact: true }).click()
  const refusal = app.page.locator('.qin-form .qin-refuse')
  await refusal.waitFor()
  return (await refusal.innerText()).trim()
}

describe('a refused list names the input and the rule', () => {
  it('names an input that does not begin with "/" by its place and its own words', async () => {
    await open()
    const drawn = await saveAndReadTheRefusal('/context\nyes')
    expect(drawn).toBe(en.t('server.quickInputListItemNoSlash', { place: 2, input: 'yes' }))
  })

  it('names an input that is too long by its place and its visible part', async () => {
    await open()
    const drawn = await saveAndReadTheRefusal(`/context\n/${'a'.repeat(200)}`)
    expect(drawn).toBe(en.t('server.quickInputListItemTooLong', { place: 2, longest: 200, input: `/${'a'.repeat(39)}` }))
  })

  it('names what was wrong with a list that holds too many inputs', async () => {
    await open()
    const drawn = await saveAndReadTheRefusal(Array.from({ length: 21 }, (_, n) => `/in-${String(n)}`).join('\n'))
    expect(drawn).toBe(en.t('server.quickInputListTooMany', { most: 20, count: 21 }))
  })
})

describe('the refused lists as pictures', () => {
  it('draws the two refused states at four widths in both themes', async () => {
    if (!keepTheShots) return
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await open(width, theme)
        expect(await app.page.locator('html').getAttribute('data-theme'), `${String(width)} ${theme}`).toBe(theme)
        await saveAndReadTheRefusal('/context\nyes')
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${String(width)} ${theme}`).toBe(true)
        await photographWithNothingOver(app.page, '[data-settings-panel="settings.quickinputs"]', `${shots}/refused-no-slash-${String(width)}-${theme}.png`)

        await open(width, theme)
        await saveAndReadTheRefusal(`/context\n/${'a'.repeat(200)}`)
        await photographWithNothingOver(app.page, '[data-settings-panel="settings.quickinputs"]', `${shots}/refused-too-long-${String(width)}-${theme}.png`)
      }
    }
  }, 240_000)
})
