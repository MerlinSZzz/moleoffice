// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE HAS A SWITCH FOR EACH PLUGIN, OFF UNTIL THE OWNER SWITCHES IT ON. Wave 13x round 14, step 1 of the
 * plugin pipeline udGnc-Bsr15R (block N0TWpg5xe6mo), the drawing half.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 *   1. The panel is in the Tools category under its title. A good plugin is drawn with a switch that is off, and the
 *      word Off beside it. A refused plugin draws no switch, the word "refused" and the reason: one for its manifest,
 *      and one whose folder is a link to another place (wave 13x round 19). One whose folder is a link that
 *      leads to nothing, and one whose plugin.json is a link, are drawn the same way, and the others are still drawn
 *      beside them (wave 13x round 20). One whose plugin.json is a folder, and one whose plugin.json this office has
 *      no permission to read, are drawn the same way too (wave 13x round 21). So are one whose folder this office has
 *      no permission to open, and one whose plugin.json is a named pipe (wave 13x round 23). A list the office could
 *      not read is drawn as an error in place of the panel, and this file says what that error said.
 *   2. Pressing the switch changes the stored value, read back through the door. A reload draws what is stored, and a
 *      second press switches it off again.
 *   3. Normal mode names a good plugin by its own name only, and Developer mode adds its folder name. A folder name is
 *      a name for machines, by c3Coy1jHZafx, from the owner's decision. A refused plugin has no
 *      name the office accepted, so its folder name is drawn in both modes.
 *
 * NORMAL MODE SAYS A REFUSED PLUGIN'S REASON IN PLAIN WORDS, by 2ofDpr3_ED-D and a decision.
 * Until this round both modes drew the server's own reader's text, such as "version: Invalid input: expected string,
 * received undefined". A person reads that panel, so Normal mode now draws the reason in plain words in the page's
 * language: made-up-broken names no version, so it says "Its plugin.json has no version." and the Chinese sentence on a
 * Chinese page. The reader's raw text is kept for Developer mode alone, which draws it in `.plgs-raw` where it says
 * more than the plain words: a plugin.json that is not JSON, and a manifest with fields the office cannot accept. The
 * folder and file causes draw their exact sentences in both modes and never a `.plgs-raw`, because the plain words and
 * the reader's text are the same English there.
 *
 * The server half is tests/a-plugin-has-a-manifest-and-a-switch.test.ts.
 *
 * THE PLUGINS ARE MADE UP, in a temporary folder this file makes and names to its scratch office with
 * MOLE_OFFICE_PLUGINS, so nothing is written into the checkout's plugins/ folder. Their names say they are made up.
 *
 * PICTURES. When `PLUGIN_SWITCH_SHOTS` names a directory, each picture is a crop of the whole page that shows the
 * panel whole with 16 pixels of the page around it where the page has them, and a made-up label above it saying the
 * plugins are made up. There is one picture at 1440, 990, 660 and 390, light and dark (chapter 6, rule 1), in Normal
 * mode and in Developer mode. With `PLUGIN_SWITCH_SHOTS` unset nothing is photographed and no label is put in.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { PluginsReading } from '../src/shared/plugins.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { chineseWords, englishWords } from '../src/shared/words/joined.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
const en = englishWords()
/**
 * THE CHINESE A PAGE DRAWS, read through the page's own reader so the values and the office's spacing are the page's.
 * The word must be in zh.ts: a key that is missing would read back in English, and this file must not pass that as
 * Chinese. The cast is here because the criterion commit that added this file ran before the keys existed.
 */
const zhAsWritten = chineseWords() as unknown as Record<string, string | undefined>
const scratch = aTestDatabaseFolder('plugin-switches')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_PANEL = '[data-target="uiSurface/settings.plugins"]'
/** The words on the made-up label drawn above the panel while a picture is taken. */
const THE_MADE_UP_LABEL = 'Made-up test office — every plugin here is made up'
const GOOD = `${THE_PANEL} [data-plugin="made-up-weather"]`
const REFUSED = `${THE_PANEL} [data-plugin="made-up-broken"]`
const NOT_JSON = `${THE_PANEL} [data-plugin="made-up-not-json"]`
const EXTRA = `${THE_PANEL} [data-plugin="made-up-extra"]`
const LINKED = `${THE_PANEL} [data-plugin="made-up-linked"]`
const GONE = `${THE_PANEL} [data-plugin="made-up-gone"]`
const POINTED = `${THE_PANEL} [data-plugin="made-up-pointed"]`
const BOXED = `${THE_PANEL} [data-plugin="made-up-boxed"]`
const LOCKED = `${THE_PANEL} [data-plugin="made-up-locked"]`
const SHUT = `${THE_PANEL} [data-plugin="made-up-shut"]`
const PIPED = `${THE_PANEL} [data-plugin="made-up-piped"]`
/** Where the error note is drawn when the plugin list could not be read: in the panel's place, in the Tools category. */
const THE_TOOLS_ERROR = '.sf-cat[data-category="tools"] .px-error'

function putAPlugin(id: string, manifest: object | string): void {
  mkdirSync(join(scratch, 'plugins', id), { recursive: true })
  writeFileSync(join(scratch, 'plugins', id, 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
}

async function theStoredState(): Promise<string | undefined> {
  const res = await fetch(`${app.api}/api/plugins`, { headers: AS_THE_OWNER })
  expect(res.status).toBe(200)
  return ((await res.json()) as PluginsReading).plugins.find((one) => one.id === 'made-up-weather')?.state
}

async function openTheSettings(mode: 'normal' | 'inspect' = 'normal', language: 'en' | 'zh' = 'en'): Promise<void> {
  await app.page.goto(`${app.site}/?lang=${language}&mode=${mode}#/settings/plugins`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector(`${GOOD} [role="switch"], ${THE_TOOLS_ERROR}`, { timeout: 20_000 })
  const drawnInstead = await app.page.$$eval(THE_TOOLS_ERROR, (all) => all.map((one) => one.textContent ?? ''))
  expect(drawnInstead, 'the error drawn in place of the plugin switches').toEqual([])
}

/**
 * The part of the page a picture shows, in the page's own coordinates: the whole panel, the made-up label above it,
 * and 16 pixels of the page on each side of the panel where the page has them. The page is read from its top, so the
 * panel's box is its place in the page and the sticky row of category buttons stays at the page's top. A panel that
 * is not in the page is a broken assumption and not a picture to skip, so this throws instead.
 */
async function thePartEachPictureShows(name: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const clip = await app.page.evaluate((selector) => {
    const panel = document.querySelector(selector)
    if (panel === null) return null
    const label = document.querySelector('[data-made-up-label]')
    const box = panel.getBoundingClientRect()
    const pageWidth = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)
    const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    const left = Math.max(0, box.left + window.scrollX - 16)
    const top = Math.max(
      0,
      Math.min(box.top + window.scrollY - 16, label === null ? Number.POSITIVE_INFINITY : label.getBoundingClientRect().top + window.scrollY - 8),
    )
    const right = Math.min(pageWidth, box.right + window.scrollX + 16)
    const bottom = Math.min(pageHeight, box.bottom + window.scrollY + 16)
    return { x: left, y: top, width: right - left, height: bottom - top }
  }, THE_PANEL)
  if (clip === null) throw new Error(`photograph(${name}): the panel ${THE_PANEL} is not in the page, so no picture was taken`)
  return clip
}

async function photograph(name: string): Promise<void> {
  const dir = process.env['PLUGIN_SWITCH_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await putTheMadeUpLabelIn(app.page, THE_MADE_UP_LABEL, app.page.locator(THE_PANEL), name)
  try {
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        // FROM THE TOP OF THE PAGE, over the whole page, so the sticky row of category buttons stays at the page's
        // top and not over the panel, and nothing of the panel's border is cut at a viewport's edge.
        await app.page.evaluate(() => {
          window.scrollTo(0, 0)
        })
        const clip = await thePartEachPictureShows(name)
        await app.page.screenshot({ path: `${dir}/${name}-${String(width)}-${theme}.png`, fullPage: true, clip })
      }
    }
  } finally {
    await takeTheMadeUpLabelOut(app.page)
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  putAPlugin('made-up-weather', {
    id: 'made-up-weather',
    name: { en: 'Made-up weather board', zh: '虚构的天气板' },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: [{ slug: 'board', title: { en: 'Board' } }],
    reads: ['projects', 'people', 'talk'],
    budget: { builtKilobytes: 120 },
  })
  // REFUSED: it names no version, so the office cannot tell which build it is.
  putAPlugin('made-up-broken', {
    id: 'made-up-broken',
    name: { en: 'Made-up broken plugin' },
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['work'],
    budget: { builtKilobytes: 50 },
  })
  // REFUSED: its plugin.json is not JSON at all. The raw text is what the parser wrote about it.
  mkdirSync(join(scratch, 'plugins', 'made-up-not-json'), { recursive: true })
  writeFileSync(join(scratch, 'plugins', 'made-up-not-json', 'plugin.json'), '{ this is not json')
  // REFUSED: its plugin.json holds a key this office does not know.
  putAPlugin('made-up-extra', {
    id: 'made-up-extra',
    name: { en: 'Made-up extra-key plugin' },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 50 },
    colour: 'green',
  })
  // REFUSED: its folder is a link to a good plugin kept outside the plugins folder.
  mkdirSync(join(scratch, 'away', 'made-up-linked'), { recursive: true })
  writeFileSync(
    join(scratch, 'away', 'made-up-linked', 'plugin.json'),
    JSON.stringify({
      id: 'made-up-linked',
      name: { en: 'Made-up linked plugin' },
      version: '0.1.0',
      interface: 'office-read/1',
      pages: [{ slug: 'main', title: { en: 'Main' } }],
      reads: ['projects'],
      budget: { builtKilobytes: 50 },
    }),
  )
  symlinkSync(join('..', 'away', 'made-up-linked'), join(scratch, 'plugins', 'made-up-linked'))
  // REFUSED: its folder is a link that leads to nothing.
  symlinkSync(join('..', 'away', 'made-up-nowhere'), join(scratch, 'plugins', 'made-up-gone'))
  // REFUSED: its plugin.json is a link to a good manifest kept outside the plugins folder.
  mkdirSync(join(scratch, 'away', 'made-up-pointed'), { recursive: true })
  writeFileSync(
    join(scratch, 'away', 'made-up-pointed', 'plugin.json'),
    JSON.stringify({
      id: 'made-up-pointed',
      name: { en: 'Made-up pointed plugin' },
      version: '0.1.0',
      interface: 'office-read/1',
      pages: [{ slug: 'main', title: { en: 'Main' } }],
      reads: ['projects'],
      budget: { builtKilobytes: 50 },
    }),
  )
  mkdirSync(join(scratch, 'plugins', 'made-up-pointed'), { recursive: true })
  symlinkSync(join('..', '..', 'away', 'made-up-pointed', 'plugin.json'), join(scratch, 'plugins', 'made-up-pointed', 'plugin.json'))
  // REFUSED: its plugin.json is a folder.
  mkdirSync(join(scratch, 'plugins', 'made-up-boxed', 'plugin.json'), { recursive: true })
  // REFUSED: its plugin.json is a good manifest that nobody may read. Checked unreadable, so a process that may read
  // every file (root) fails here rather than drawing a row that proves nothing.
  putAPlugin('made-up-locked', {
    id: 'made-up-locked',
    name: { en: 'Made-up locked plugin' },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 50 },
  })
  chmodSync(join(scratch, 'plugins', 'made-up-locked', 'plugin.json'), 0o000)
  expect(() => readFileSync(join(scratch, 'plugins', 'made-up-locked', 'plugin.json')), 'this test process may not read it either').toThrow(/EACCES/u)
  // REFUSED: its folder is one nobody may open. Empty, because rmSync removes an empty folder with mode 000 and throws
  // EACCES on one that holds a file. Checked unopenable, so a process that may open every folder (root) fails here.
  mkdirSync(join(scratch, 'plugins', 'made-up-shut'), { mode: 0o000 })
  expect(() => lstatSync(join(scratch, 'plugins', 'made-up-shut', 'plugin.json')), 'this test process may not look inside it either').toThrow(/EACCES/u)
  // REFUSED: its plugin.json is a named pipe that nothing ever writes to. Opening it to read would wait for good.
  mkdirSync(join(scratch, 'plugins', 'made-up-piped'), { recursive: true })
  const piped = spawnSync('mkfifo', [join(scratch, 'plugins', 'made-up-piped', 'plugin.json')], { encoding: 'utf8' })
  expect(piped.status, piped.stderr).toBe(0)
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  app = await liveApp({ name: 'plugin-switches', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  rmSync(scratch, { recursive: true, force: true })
}, 60_000)

describe('the plugin switches on the Settings page', () => {
  it('draws a good plugin off with a switch, and a refused one with its reason and no switch', async () => {
    await openTheSettings()
    const title = await app.page.$eval(`${THE_PANEL} .px-panel-title`, (one) => one.textContent ?? '')
    expect(title.trim()).toBe(en['settingsPanel.title.plugins'])
    expect(await app.page.$eval(THE_PANEL, (el) => el.closest('.sf-cat')?.getAttribute('data-category') ?? '')).toBe('tools')

    const drawn = await app.page.$eval(`${GOOD} [role="switch"]`, (el) => {
      const box = el.getBoundingClientRect()
      return { tag: el.tagName, checked: el.getAttribute('aria-checked'), name: el.getAttribute('aria-label'), wide: box.width > box.height }
    })
    expect(drawn).toEqual({ tag: 'BUTTON', checked: 'false', name: 'Made-up weather board', wide: true })
    expect(await app.page.$eval(`${GOOD} .plgs-word`, (el) => el.textContent ?? '')).toBe(en['settingsPanel.plugins.off'])
    // WHAT IT READS IS BUILT FROM THE WORD LIST as the page builds it: each view's word, joined by the list gap.
    const views = [en['settingsPanel.plugins.view.projects'], en['settingsPanel.plugins.view.people'], en['settingsPanel.plugins.view.talk']]
    const reads = createI18n('en').t('settingsPanel.plugins.reads', { views: views.join(en['sentence.listGap']) })
    expect(await app.page.$eval(`${GOOD} .plgs-reads`, (el) => el.textContent ?? '')).toBe(reads)
    expect(await app.page.$eval(`${GOOD} .plgs-name`, (el) => el.textContent ?? '')).toBe('Made-up weather board')
    expect(await app.page.$$(`${GOOD} .plgs-id`), 'Normal mode draws no folder name for a good plugin').toHaveLength(0)

    expect(await app.page.$$(`${REFUSED} [role="switch"]`)).toHaveLength(0)
    expect(await app.page.$eval(`${REFUSED} .plgs-refused`, (el) => el.textContent ?? '')).toBe(en['pluginState.refused'])
    // NORMAL MODE SAYS THE REASON IN PLAIN WORDS, never the reader's own text.
    expect(await app.page.$eval(`${REFUSED} .plgs-reason`, (el) => el.textContent ?? '')).toBe('Its plugin.json has no version.')
    const refusedSaid = await app.page.$eval(REFUSED, (el) => el.textContent ?? '')
    expect(refusedSaid).not.toContain('Invalid input')
    expect(refusedSaid).not.toContain('expected string')

    // A plugin.json that is not JSON says so in words, and never the parser's own sentence.
    let parserSaid = ''
    try {
      JSON.parse('{ this is not json')
    } catch (error) {
      parserSaid = (error as Error).message
    }
    expect(parserSaid, 'the made-up text must make JSON.parse throw').not.toBe('')
    expect(await app.page.$eval(`${NOT_JSON} .plgs-reason`, (el) => el.textContent ?? '')).toBe(
      'The plugin.json of "made-up-not-json" is not JSON, so the office could not read it.',
    )
    expect(await app.page.$eval(NOT_JSON, (el) => el.textContent ?? '')).not.toContain(parserSaid)

    expect(await app.page.$eval(`${EXTRA} .plgs-reason`, (el) => el.textContent ?? '')).toBe(
      'Its plugin.json has colour, which this office does not know.',
    )
    // NORMAL MODE DRAWS NO RAW TEXT ANYWHERE.
    expect(await app.page.$$(`${THE_PANEL} .plgs-raw`)).toHaveLength(0)

    expect(await app.page.$$(`${LINKED} [role="switch"]`)).toHaveLength(0)
    expect(await app.page.$eval(`${LINKED} .plgs-id`, (el) => el.textContent ?? '')).toBe('made-up-linked')
    expect(await app.page.$$(`${LINKED} .plgs-name`)).toHaveLength(0)
    expect(await app.page.$eval(`${LINKED} .plgs-refused`, (el) => el.textContent ?? '')).toBe(en['pluginState.refused'])
    expect(await app.page.$eval(`${LINKED} .plgs-reason`, (el) => el.textContent ?? '')).toBe(
      'The plugin\'s folder "made-up-linked" is a link to another place. A plugin is read only from a real folder of its ' +
        'own inside the plugins folder, so its plugin.json was not read.',
    )

    for (const [row, id, reason] of [
      [
        GONE,
        'made-up-gone',
        'The plugin\'s folder "made-up-gone" is a link that leads to nothing. A plugin is read only from a real folder of ' +
          'its own inside the plugins folder, so nothing was read.',
      ],
      [
        POINTED,
        'made-up-pointed',
        'The plugin.json of "made-up-pointed" is a link to another place. A plugin\'s manifest is read only from a real ' +
          'file in its own folder, so it was not read.',
      ],
      [
        BOXED,
        'made-up-boxed',
        'The plugin.json of "made-up-boxed" is a folder, not a file. A plugin\'s manifest is read only from a real file in ' +
          'its own folder, so nothing in it was read.',
      ],
      [
        LOCKED,
        'made-up-locked',
        'The plugin.json of "made-up-locked" could not be read, because this office has no permission to read it. Nothing ' +
          'was read.',
      ],
      [
        SHUT,
        'made-up-shut',
        'The plugin\'s folder "made-up-shut" could not be opened, because this office has no permission to look inside it. ' +
          'Nothing in it was read.',
      ],
      [
        PIPED,
        'made-up-piped',
        'The plugin.json of "made-up-piped" is a named pipe, not a file. A plugin\'s manifest is read only from a real file ' +
          'in its own folder, so it was not opened.',
      ],
    ] as const) {
      expect(await app.page.$$(`${row} [role="switch"]`), id).toHaveLength(0)
      expect(await app.page.$eval(`${row} .plgs-id`, (el) => el.textContent ?? '')).toBe(id)
      expect(await app.page.$$(`${row} .plgs-name`), id).toHaveLength(0)
      expect(await app.page.$eval(`${row} .plgs-refused`, (el) => el.textContent ?? '')).toBe(en['pluginState.refused'])
      // THE FOLDER AND FILE CAUSES KEEP TODAY'S EXACT ENGLISH, and their raw text is the same English, so no `.plgs-raw`.
      expect(await app.page.$eval(`${row} .plgs-reason`, (el) => el.textContent ?? '')).toBe(reason)
      expect(await app.page.$$(`${row} .plgs-raw`), id).toHaveLength(0)
    }
    expect(await app.page.$$(`${LINKED} .plgs-raw`)).toHaveLength(0)
    await photograph('settings-plugins-off')
  }, 180_000)


  it('changes the stored value when pressed, draws it after a reload, and switches it off again', async () => {
    await openTheSettings()
    // THE CONTROL: off before the press.
    expect(await theStoredState()).toBe('off')

    await app.page.click(`${GOOD} [role="switch"]`)
    await app.page.waitForSelector(`${GOOD} [role="switch"][aria-checked="true"]`, { timeout: 20_000 })
    expect(await theStoredState()).toBe('on')
    expect(await app.page.$eval(`${GOOD} .plgs-word`, (el) => el.textContent ?? '')).toBe(en['settingsPanel.plugins.on'])

    // A RELOAD DRAWS WHAT IS STORED, not what this page remembered.
    await openTheSettings()
    expect(await app.page.$eval(`${GOOD} [role="switch"]`, (el) => el.getAttribute('aria-checked'))).toBe('true')
    expect(await app.page.$eval(`${GOOD} .plgs-word`, (el) => el.textContent ?? '')).toBe(en['settingsPanel.plugins.on'])
    await photograph('settings-plugins-on')

    await app.page.click(`${GOOD} [role="switch"]`)
    await app.page.waitForSelector(`${GOOD} [role="switch"][aria-checked="false"]`, { timeout: 20_000 })
    expect(await theStoredState()).toBe('off')
    expect(await app.page.$eval(`${GOOD} .plgs-word`, (el) => el.textContent ?? '')).toBe(en['settingsPanel.plugins.off'])
  }, 180_000)

  it('adds the folder name of a good plugin in Developer mode, and draws the folder name of a refused one in both modes', async () => {
    await openTheSettings('inspect')
    expect(await app.page.$eval(`${GOOD} .plgs-name`, (el) => el.textContent ?? '')).toBe('Made-up weather board')
    expect(await app.page.$eval(`${GOOD} .plgs-id`, (el) => el.textContent ?? '')).toBe('made-up-weather')
    expect(await app.page.$eval(`${LINKED} .plgs-id`, (el) => el.textContent ?? '')).toBe('made-up-linked')
    // DEVELOPER MODE ALSO DRAWS THE READER'S OWN TEXT where it says more than the plain words.
    expect(await app.page.$eval(`${REFUSED} .plgs-reason`, (el) => el.textContent ?? '')).toBe('Its plugin.json has no version.')
    expect(await app.page.$eval(`${REFUSED} .plgs-raw`, (el) => el.textContent ?? '')).toContain('version: Invalid input')
    // THE FOLDER AND FILE CAUSES DRAW NO RAW TEXT IN EITHER MODE: the plain words are the reader's own English there.
    for (const row of [LINKED, GONE, POINTED, BOXED, LOCKED, SHUT, PIPED]) {
      expect(await app.page.$$(`${row} .plgs-raw`), row).toHaveLength(0)
    }
    await photograph('settings-plugins-developer')
    await openTheSettings('normal')
    expect(await app.page.$$(`${GOOD} .plgs-id`)).toHaveLength(0)
    expect(await app.page.$eval(`${LINKED} .plgs-id`, (el) => el.textContent ?? '')).toBe('made-up-linked')
  }, 180_000)
})
