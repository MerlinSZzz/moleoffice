// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { readEverySettingsCategory } from './settings-folds.ts'
import { SETTINGS_PANELS, settingsPath } from '../src/shared/addresses.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { WINDOW_ONLY_PANELS } from '../src/web/pages/SettingsPage.tsx'
import { THEME_CHOICES, THEME_LABELS } from '../src/web/components/PresetBar.tsx'
import { isThemeId, themeById } from '../src/shared/themes.ts'
import { CIRCLE_PICTURES } from '../src/shared/messages.ts'
import { LANGUAGES } from '../src/shared/i18n.ts'
import { PANELS, type SettingsPanelDeclaration } from '../src/shared/settings-declaration.ts'

/** The API and the Settings page must describe the same panels and their controls. */
let app: LiveApp
beforeAll(async () => { app = await liveApp({ name: 'settings-structure', workspace: 'default', viewport: { width: 1440, height: 900 }, theDevServerBecause: 'The panel-addition case imports the live module graph and adds a temporary declaration in the browser.' }) }, 240_000)
afterAll(async () => { await app?.stop() })

type Control = { key: string; wordKey: string; words: string; english: string; address: string; whoMayPress: string; parameters: string[] }
type Panel = { key: string; words: string; english: string; address: string; controls: Control[] }
type Category = { key: string; words: string; english: string; panels: Panel[] }
async function structure(language: string): Promise<Category[]> {
  const response = await fetch(`${app.api}/api/settings/structure?lang=${language}`, { headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-reader' } })
  expect(response.status, await response.clone().text()).toBe(200)
  return (await response.json() as { categories: Category[] }).categories
}

it('includes every drawn Settings panel in its category, with a usable panel address and named controls', async () => {
  const categories = await structure('en')
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  const drawn: { category: string; panel: string }[] = []
  await readEverySettingsCategory(app.page, async (category) => {
    for (const panel of await app.page.locator('.set [data-settings-panel]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-settings-panel') ?? ''))) drawn.push({ category, panel })
  })
  const byPanel = new Map(categories.flatMap((category) => category.panels.map((panel) => [panel.key, { category, panel }] as const)))
  expect(byPanel.size).toBe(SETTINGS_PANELS.length)
  expect(drawn.map(({ panel }) => panel).sort()).toEqual([...byPanel.keys()].filter((panel) => !WINDOW_ONLY_PANELS.has(panel as typeof SETTINGS_PANELS[number])).sort())
  for (const { category, panel } of drawn) {
    const found = byPanel.get(panel)
    expect(found, panel).toBeDefined()
    expect(found?.category.key).toBe(category)
    expect(found?.panel.address).toBe(`#${settingsPath(panel as typeof SETTINGS_PANELS[number])}`)
  }
  for (const panel of byPanel.values()) {
    expect(panel.panel.words).toBeTruthy()
    expect(panel.panel.english).toBeTruthy()
    expect(Array.isArray(panel.panel.controls), panel.panel.key).toBe(true)
    for (const control of panel.panel.controls) {
      expect(control.key).toBeTruthy()
      expect(control.words).toBeTruthy()
      expect(control.english).toBeTruthy()
      expect(control.address).toBe(panel.panel.address)
      expect(control.whoMayPress).toBeTruthy()
    }
  }
}, 180_000)


it('puts an added declaration in both the page panel selection and the API answer', async () => {
  const modulePath = '../src/shared/settings-structure.ts'
  const { SETTINGS_STRUCTURE, panelsInCategory, readSettingsStructure } = await import(modulePath)
  const original = SETTINGS_STRUCTURE.panels.find((panel: { key: string }) => panel.key === 'settings.terminalholder')
  expect(original).toBeDefined()
  const added = { ...original, key: 'settings.example-added-panel' }
  const declaration = { ...SETTINGS_STRUCTURE, panels: [...SETTINGS_STRUCTURE.panels, added] }
  const pagePanels = panelsInCategory('tools', true, true, declaration)
  const answer = readSettingsStructure('en', declaration)
  expect(pagePanels.map((panel: { key: string }) => panel.key)).toContain(added.key)
  expect(answer.categories.find((category: Category) => category.key === 'tools')?.panels.map((panel: Panel) => panel.key)).toContain(added.key)
})

it('draws a panel added to the shared declaration and includes it in the same reading the door uses', async () => {
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  try {
    const modulePaths = { declaration: `/@fs${resolve('src/shared/settings-declaration.ts')}`, structure: `/@fs${resolve('src/shared/settings-structure.ts')}` }
    const inAnswer = await app.page.evaluate(async (paths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(paths.declaration)
      const structure = await load(paths.structure)
      const original = declaration.PANELS.find((panel: { key: string }) => panel.key === 'settings.terminalholder')
      declaration.PANELS.push({ ...original, key: 'settings.gates', body: original.key })
      return structure.readSettingsStructure('en').categories.find((category: Category) => category.key === 'tools').panels.some((panel: Panel) => panel.key === 'settings.gates')
    }, modulePaths)
    expect(inAnswer).toBe(true)
    await app.page.locator('.set .sf-jump[data-category="tools"]').click()
    const added = app.page.locator('.set [data-settings-panel="settings.gates"]')
    await expect.poll(() => added.count()).toBe(1)
    expect(await added.textContent()).toContain(englishWords()['settingsPanel.title.terminalholder'])
    expect(await added.locator('[data-target="uiSurface/settings.terminalholder"]').count()).toBe(1)
  } finally {
    await app.page.evaluate(async (paths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(paths.declaration)
      const at = declaration.PANELS.findIndex((panel: { key: string }) => panel.key === 'settings.gates')
      if (at !== -1) declaration.PANELS.splice(at, 1)
    }, { declaration: `/@fs${resolve('src/shared/settings-declaration.ts')}` })
  }
}, 120_000)


it('names the individual appearance choices, quick inputs and the restart steps', async () => {
  const categories = await structure('en')
  const panels = new Map(categories.flatMap((category) => category.panels.map((panel) => [panel.key, panel] as const)))
  const controls = (panel: string) => panels.get(panel)?.controls.map((control) => control.key) ?? []
  for (const key of ['settingsPanel.look.theme', 'settingsPanel.look.density', 'settingsPanel.look.corners', 'settingsPanel.look.type', 'settingsPanel.look.size']) expect(controls('settings.look')).toContain(key)
  for (const key of ['quickInputs.boxLabel', 'quickInputs.save', 'quickInputs.clear']) expect(controls('settings.quickinputs')).toContain(key)
  for (const key of ['terminalHolder.restart', 'terminalHolder.confirm', 'terminalHolder.confirmNone', 'terminalHolder.cancel']) expect(controls('settings.terminalholder')).toContain(key)
  const messageDoor = (PANELS as readonly SettingsPanelDeclaration[]).find((panel) => panel.key === 'settings.messagedoor')
  expect(messageDoor).toBeDefined()
  expect(controls('settings.messagedoor')).toEqual(messageDoor!.controls.map((control) => control.key))
})


it('keeps two equally named presses separate when they have different authority', async () => {
  const categories = await structure('en')
  const usage = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.usagenotices')
  const saves = usage?.controls.filter((control) => control.english === englishWords()['usageNotices.panel.save']) ?? []
  const declared = (PANELS as readonly SettingsPanelDeclaration[]).find((panel) => panel.key === 'settings.usagenotices')
  expect(declared).toBeDefined()
  const expected = declared!.controls.filter((control) => control.wordKey === 'usageNotices.panel.save')
  expect(saves.map(({ key, whoMayPress }) => ({ key, whoMayPress }))).toEqual(expected.map(({ key, whoMayPress }) => ({ key, whoMayPress })))
})


it('marks words that need a value from the live panel rather than presenting the template as a complete sentence', async () => {
  const categories = await structure('en')
  const terminal = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.terminalholder')
  const confirm = terminal?.controls.find((control) => control.key === 'terminalHolder.confirm')
  expect(confirm?.parameters).toContain('n')
  expect(confirm?.english).toContain('{n}')
})


it('lists each theme choice from the same option words the page draws', async () => {
  const categories = await structure('en')
  const look = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.look')
  for (const choice of THEME_CHOICES) {
    const control = look?.controls.find((one) => one.key === `preset.theme.${choice}`)
    // The six themes have no words: each is listed by the English name the data gives it.
    if (isThemeId(choice)) {
      expect(control?.english).toBe(themeById(choice).name.en)
      continue
    }
    expect(control?.wordKey).toBe(THEME_LABELS[choice])
    expect(control?.english).toBe(englishWords()[THEME_LABELS[choice]])
  }
})

it('includes the browser-address controls nested inside the access panel', async () => {
  const categories = await structure('en')
  const access = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.access')
  const keys = access?.controls.map((control) => control.key) ?? []
  for (const key of ['settingsPanel.addressForBrowsers.field', 'settingsPanel.addressForBrowsers.save', 'settingsPanel.addressForBrowsers.takeAway', 'settingsPanel.addressForBrowsers.takeAwayToNone']) expect(keys).toContain(key)
})

it('includes the visible word editor and restart searches', async () => {
  const categories = await structure('en')
  const panels = new Map(categories.flatMap((category) => category.panels.map((panel) => [panel.key, panel] as const)))
  const keys = (panel: string) => panels.get(panel)?.controls.map((control) => control.key) ?? []
  for (const key of ['wordTable.english', 'wordTable.chinese', 'wordTable.confirm', 'wordTable.reason', 'wordTable.previous', 'wordTable.more', 'wordTable.notUsedReason', 'wordTable.newerChoices', 'wordTable.olderChoices']) expect(keys('settings.words')).toContain(key)
  for (const key of ['officeRestart.read', 'officeRestart.searchDecision', 'officeRestart.findDecision', 'officePause.reason']) expect(keys('settings.restart')).toContain(key)
})


it('includes each chat picture choice and each queue layout choice', async () => {
  const categories = await structure('en')
  const panels = new Map(categories.flatMap((category) => category.panels.map((panel) => [panel.key, panel] as const)))
  const pictures = panels.get('settings.chatbutton')?.controls ?? []
  for (const picture of CIRCLE_PICTURES) {
    const control = pictures.find((one) => one.key === `chat.picture.${picture.name}`)
    expect(control?.wordKey).toBe(picture.word)
  }
  const queue = panels.get('settings.queueview')?.controls.map((control) => control.wordKey) ?? []
  expect(queue).toContain('decisions.cards')
  expect(queue).toContain('decisions.list')
})


it('names each language choice as it is drawn on the page', async () => {
  const categories = await structure('en')
  const panel = categories.flatMap((category) => category.panels).find((one) => one.key === 'settings.language')
  for (const [language, name] of Object.entries(LANGUAGES)) {
    const control = panel?.controls.find((one) => one.key === `language.${language}`)
    expect(control?.words).toBe(name)
    expect(control?.english).toBe(name)
  }
})

it('distinguishes the separate work-switch saves and names the decision search', async () => {
  const categories = await structure('en')
  const panels = new Map(categories.flatMap((category) => category.panels.map((panel) => [panel.key, panel] as const)))
  const switches = panels.get('settings.workswitches')?.controls ?? []
  for (const key of ['workSwitches.tags.save', 'workSwitches.runs.save', 'workSwitches.checks.save', 'workSwitches.checks.putBack', 'workSwitches.checks.bounds', 'workSwitches.pending.reason', 'workSwitches.held.edit', 'workSwitches.held.save']) expect(switches.map((control) => control.key)).toContain(key)
  expect(switches.find((control) => control.key === 'workSwitches.tags.save')?.wordKey).toBe('gates.save')
  expect(switches.find((control) => control.key === 'workSwitches.checks.save')?.wordKey).toBe('gates.save')
  const deadLetters = panels.get('settings.deadletters')?.controls.map((control) => control.key) ?? []
  for (const key of ['deadLetterThresholds.findDecision', 'deadLetterThresholds.chosenDecision']) expect(deadLetters).toContain(key)
})

it('names the person-only private login flow', async () => {
  const categories = await structure('en')
  const keys = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.keys')
  for (const key of ['privateLogin.add', 'privateLogin.open', 'privateLogin.code', 'privateLogin.submit', 'privateLogin.done', 'privateLogin.cancel']) {
    const control = keys?.controls.find((one) => one.key === key)
    expect(control?.whoMayPress).toMatch(/person/i)
  }
})

it('names the detail counter press and dynamic credential field labels', async () => {
  const categories = await structure('en')
  const panels = new Map(categories.flatMap((category) => category.panels.map((panel) => [panel.key, panel] as const)))
  const detail = panels.get('settings.detail')?.controls.find((control) => control.key === 'settingsPanel.detail.unwrittenAria')
  expect(detail?.parameters).toEqual(expect.arrayContaining(['n', 'cell']))
  const keys = panels.get('settings.keys')?.controls ?? []
  expect(keys.find((control) => control.key === 'settingsPanel.keys.keyLabel')?.parameters).toContain('label')
  expect(keys.find((control) => control.key === 'settingsPanel.logins.loginLabel')?.parameters).toContain('name')
})

it('draws the terminal restart control using the same declaration as the answer', async () => {
  const paths = { declaration: `/@fs${resolve('src/shared/settings-declaration.ts')}`, structure: `/@fs${resolve('src/shared/settings-structure.ts')}` }
  await app.page.route('**/api/terminals', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { holder: { state: 'running', pid: 1, startedAt: null }, terminals: [] } })
  })
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  try {
    const expected = await app.page.evaluate(async (modulePaths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      const control = declaration.PANELS.find((panel: { key: string }) => panel.key === 'settings.terminalholder').controls.find((one: { key: string }) => one.key === 'terminalHolder.restart')
      control.wordKey = 'terminalHolder.cancel'
      const structure = await load(modulePaths.structure)
      return structure.readSettingsStructure('en').categories.flatMap((category: Category) => category.panels).find((panel: Panel) => panel.key === 'settings.terminalholder').controls.find((one: Control) => one.key === 'terminalHolder.restart').english
    }, paths)
    // The page goes to the same address as before, so it is not loaded again. Another category first, so the holder's
    // panel is drawn afresh: it then reads the holder through the route above, and its press from the changed word.
    await app.page.locator('.set .sf-jump[data-category="looks"]').click()
    await app.page.locator('.set .sf-jump[data-category="tools"]').click()
    const press = app.page.locator('[data-settings-panel="settings.terminalholder"] .th-presses button')
    try { await press.waitFor({ state: 'visible', timeout: 15_000 }) }
    catch { throw new Error(`The test holder did not draw its restart press: ${await app.page.locator('[data-settings-panel="settings.terminalholder"]').innerText()}`) }
    expect((await press.innerText()).trim()).toBe(expected)
  } finally {
    await app.page.evaluate(async (modulePaths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      const control = declaration.PANELS.find((panel: { key: string }) => panel.key === 'settings.terminalholder').controls.find((one: { key: string }) => one.key === 'terminalHolder.restart')
      control.wordKey = 'terminalHolder.restart'
    }, paths)
    await app.page.unroute('**/api/terminals')
  }
}, 120_000)

it('draws the word-search control using the same declaration as the answer', async () => {
  const paths = { declaration: `/@fs${resolve('src/shared/settings-declaration.ts')}`, structure: `/@fs${resolve('src/shared/settings-structure.ts')}` }
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  try {
    const expected = await app.page.evaluate(async (modulePaths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      const control = declaration.PANELS.find((panel: { key: string }) => panel.key === 'settings.words').controls.find((one: { key: string }) => one.key === 'wordTable.find')
      control.wordKey = 'wordTable.more'
      const structure = await load(modulePaths.structure)
      return structure.readSettingsStructure('en').categories.flatMap((category: Category) => category.panels).find((panel: Panel) => panel.key === 'settings.words').controls.find((one: Control) => one.key === 'wordTable.find').english
    }, paths)
    await app.page.locator('.set .sf-jump[data-category="looks"]').click()
    const label = app.page.locator('[data-settings-panel="settings.words"] [data-word-table] > label').first()
    await label.waitFor({ state: 'visible', timeout: 30_000 })
    expect((await label.innerText()).trim()).toBe(expected)
  } finally {
    await app.page.evaluate(async (modulePaths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      const control = declaration.PANELS.find((panel: { key: string }) => panel.key === 'settings.words').controls.find((one: { key: string }) => one.key === 'wordTable.find')
      control.wordKey = 'wordTable.find'
    }, paths)
  }
}, 120_000)

it('keeps the two usage notice saves tied to their separate declarations', async () => {
  const paths = { declaration: `/@fs${resolve('src/shared/settings-declaration.ts')}`, structure: `/@fs${resolve('src/shared/settings-structure.ts')}` }
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  try {
    const expected = await app.page.evaluate(async (modulePaths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      const panel = declaration.PANELS.find((one: { key: string }) => one.key === 'settings.usagenotices')
      panel.controls.find((one: { key: string }) => one.key === 'usageNotices.panel.save').wordKey = 'usageNotices.panel.clear'
      const structure = await load(modulePaths.structure)
      const controls = structure.readSettingsStructure('en').categories.flatMap((category: Category) => category.panels).find((one: Panel) => one.key === 'settings.usagenotices').controls
      return ['usageNotices.panel.save', 'usageNotices.decision.save'].map((key) => controls.find((one: Control) => one.key === key).english)
    }, paths)
    await app.page.locator('.set .sf-jump[data-category="chat"]').click()
    const panel = app.page.locator('[data-settings-panel="settings.usagenotices"]')
    const first = panel.locator('[data-setting="usage-notice-secretary"] [data-press="choose"]')
    const second = panel.locator('[data-setting="usage-decision"] [data-press="save"]')
    await first.waitFor({ state: 'visible', timeout: 30_000 })
    expect([(await first.innerText()).trim(), (await second.innerText()).trim()]).toEqual(expected)
  } finally {
    await app.page.evaluate(async (modulePaths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      declaration.PANELS.find((one: { key: string }) => one.key === 'settings.usagenotices').controls.find((one: { key: string }) => one.key === 'usageNotices.panel.save').wordKey = 'usageNotices.panel.save'
    }, paths)
  }
}, 120_000)

async function compareChangedControl(panelKey: string, controlKey: string, replacement: string, category: string, selector: string, attribute?: string) {
  const paths = { declaration: `/@fs${resolve('src/shared/settings-declaration.ts')}`, structure: `/@fs${resolve('src/shared/settings-structure.ts')}` }
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  let original: string | undefined
  try {
    const changed = await app.page.evaluate(async ({ modulePaths, panelKey, controlKey, replacement }) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      const control = declaration.PANELS.find((one: { key: string }) => one.key === panelKey).controls.find((one: { key: string }) => one.key === controlKey)
      const original = control.wordKey as string
      control.wordKey = replacement
      const structure = await load(modulePaths.structure)
      const expected = structure.readSettingsStructure('en').categories.flatMap((category: Category) => category.panels).find((one: Panel) => one.key === panelKey).controls.find((one: Control) => one.key === controlKey).english as string
      return { original, expected }
    }, { modulePaths: paths, panelKey, controlKey, replacement })
    original = changed.original
    const expected = changed.expected
    if (category === 'you') await app.page.locator('.set .sf-jump[data-category="looks"]').click()
    await app.page.locator(`.set .sf-jump[data-category="${category}"]`).click()
    const control = app.page.locator(`[data-settings-panel="${panelKey}"] ${selector}`).first()
    await control.waitFor({ state: 'visible', timeout: 30_000 })
    expect(attribute ? await control.getAttribute(attribute) : (await control.textContent())?.trim()).toBe(expected)
  } finally {
    if (original !== undefined) await app.page.evaluate(async ({ modulePaths, panelKey, controlKey, original }) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      declaration.PANELS.find((one: { key: string }) => one.key === panelKey).controls.find((one: { key: string }) => one.key === controlKey).wordKey = original
    }, { modulePaths: paths, panelKey, controlKey, original })
  }
}

it('draws the profile picture press from its declaration', async () => {
  await compareChangedControl('settings.appearance', 'settingsPanel.profile.changePicture', 'settingsPanel.profile.editName', 'you', 'button.app-face', 'aria-label')
}, 120_000)

it('draws the appearance axis from its declaration', async () => {
  await compareChangedControl('settings.look', 'settingsPanel.look.theme', 'settingsPanel.look.density', 'looks', 'label[for="preset-theme"]')
}, 120_000)

it('draws a chat picture choice from its declaration', async () => {
  await compareChangedControl('settings.chatpictures', 'settingsPanel.pictures.word.shown', 'settingsPanel.pictures.word.pressed', 'chat', 'label.cpx-one:has(input[value="shown"]) .cpx-word')
}, 120_000)

it('includes the actual message-link choices in the answer', async () => {
  const categories = await structure('en')
  const controls = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.messagelinks')?.controls ?? []
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  await app.page.locator('.set .sf-jump[data-category="chat"]').click()
  const words = app.page.locator('[data-settings-panel="settings.messagelinks"] .mlk-word')
  await words.first().waitFor({ state: 'visible', timeout: 30_000 })
  const drawn = (await words.allTextContents()).map((word) => word.trim())
  expect(drawn.length).toBeGreaterThan(1)
  for (const word of drawn) expect(controls.map((control) => control.english)).toContain(word)
}, 120_000)

it('draws the quick-input label from its declaration', async () => {
  await compareChangedControl('settings.quickinputs', 'quickInputs.boxLabel', 'quickInputs.save', 'tools', '.qin-label')
}, 120_000)

it('draws the merge-queue picker from its declaration', async () => {
  await compareChangedControl('settings.mergequeueowner', 'mergeQueueOwner.pick', 'mergeQueueOwner.save', 'chat', '.agp-label')
}, 120_000)

// Test change (wave 13y round 175): Settings › Projects holds the rename press only, as decided, because a project is
// made from the end of the sidebar's Switch list now. The case read the make press; it reads the rename press.
it('draws the project rename press from its declaration', async () => {
  await compareChangedControl('settings.projects', 'nav.renameProject', 'nav.rename', 'work', '.project-action')
}, 120_000)

it('draws the run-model runtime label from its declaration', async () => {
  await compareChangedControl('settings.runmodels', 'settingsPanel.runModels.runtime', 'settingsPanel.runModels.model', 'devRuns', '.rm-box-name')
}, 120_000)

it('draws the machine-address label from its declaration', async () => {
  await compareChangedControl('settings.machinenames', 'settingsPanel.machineNames.address', 'settingsPanel.machineNames.name', 'chat', '.mn-add .mn-field span')
}, 120_000)

it('draws the storage save press from its declaration', async () => {
  await compareChangedControl('settings.whatiskept', 'settingsPanel.kept.keep', 'settingsPanel.kept.label.keepBackups', 'kept', '.wik-keep')
}, 120_000)

it('draws the stored backup number label from its declaration', async () => {
  await compareChangedControl('settings.whatiskept', 'settingsPanel.kept.label.keepBackups', 'settingsPanel.kept.label.untracedRequestDays', 'kept', '.wik-row[data-kept="keepBackups"] .wik-label')
}, 120_000)

it('draws the price input heading from its declaration', async () => {
  await compareChangedControl('settings.prices', 'settingsPanel.prices.input', 'settingsPanel.prices.output', 'devRuns', '.ptb-table thead th:nth-child(2)')
}, 120_000)

it('draws the language question from its declaration', async () => {
  await compareChangedControl('settings.language', 'settings.language.choose', 'settings.language.followBrowser', 'you', '.language-options legend')
}, 120_000)

it('draws the Go slot name from its declaration', async () => {
  const slots = '**/api/provider-router/key-slots'
  await app.page.route(slots, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, status: 200, json: { file: '~/.local/slots', slots: [], says: 'No slots have been added.' } })
  })
  try {
    await compareChangedControl('settings.keys', 'settingsPanel.goSlots.name', 'settingsPanel.goSlots.key', 'devRuns', 'label[for="go-slot-name"] .keys-box-name')
  } finally {
    await app.page.unroute(slots)
  }
}, 120_000)

it('draws the browser-address label from its declaration', async () => {
  await compareChangedControl('settings.access', 'settingsPanel.addressForBrowsers.field', 'settingsPanel.addressForBrowsers.save', 'devMachines', '.afb-field span')
}, 120_000)

it('draws the send-key choice from its declaration', async () => {
  await compareChangedControl('settings.sendkey', 'sendKey.word.enter', 'sendKey.word.shiftOrAlt', 'keys', '.sendk-one[data-key="enter"] .sendk-word')
}, 120_000)

it('draws the review level choice from its declaration', async () => {
  await compareChangedControl('settings.reviewlevel', 'settingsPanel.review.level.none', 'settingsPanel.review.level.full', 'work', '.rvl-choice[data-choice="none"] .rvl-word')
}, 120_000)

it('fails visibly when a settings control is not declared', async () => {
  const { settingsControlWord } = await import('../src/shared/settings-declaration.ts')
  expect(() => settingsControlWord('settings.reviewlevel', 'not-a-declared-control')).toThrow(/No Settings control/)
})

it('draws the add-storage press from its declaration', async () => {
  await compareChangedControl('settings.storage', 'storageDestinations.add', 'storageDestinations.save', 'kept', '.sd-list button:last-child')
}, 120_000)

it('names the storage kind choices and the fixed core choice', async () => {
  const categories = await structure('en')
  const controls = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.storage')?.controls ?? []
  expect(controls.map((control) => control.key)).toEqual(expect.arrayContaining(['storageDestinations.folder', 'storageDestinations.s3', 'storageDestinations.ssh', 'storageDestinations.core']))
})

it('draws the queue view choice from its declaration', async () => {
  await compareChangedControl('settings.queueview', 'decisions.list', 'decisions.cards', 'work', '.qv-one:has(input[value="list"]) .qv-word')
}, 120_000)

it('draws the view mode choice from its declaration', async () => {
  await compareChangedControl('settings.mode', 'settingsPanel.mode.normal', 'settingsPanel.mode.developer', 'you', '.viewswitch-seg button:first-child')
}, 120_000)

it('draws the review mark label from its declaration', async () => {
  await compareChangedControl('settings.review', 'settingsPanel.marks.local', 'settingsPanel.marks.global', 'work', 'label[for="rvm-local"]')
}, 120_000)

it('draws the writer selector name from its declaration', async () => {
  await compareChangedControl('settings.writer', 'nav.writerChoice', 'settingsPanel.title.writer', 'devRuns', '#settings-writer', 'aria-label')
}, 120_000)

it('draws the plugin switch state from its declaration', async () => {
  const plugins = '**/api/plugins'
  await app.page.route(plugins, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, status: 200, json: { folderFound: true, interface: 'office-read/1', plugins: [{ id: 'made-up-test', state: 'off', nobodyChose: true, refusal: null, refusedBecause: null, manifest: { id: 'made-up-test', name: { en: 'Made-up plugin' }, version: '0.1.0', interface: 'office-read/1', pages: [], reads: [], budget: { builtKilobytes: 1 } } }] } })
  })
  try {
    await compareChangedControl('settings.plugins', 'settingsPanel.plugins.off', 'settingsPanel.plugins.on', 'tools', '[data-plugin="made-up-test"] .plgs-word')
  } finally {
    await app.page.unroute(plugins)
  }
}, 120_000)

it('draws the window shutdown choice from its declaration', async () => {
  const context = await app.browser.newContext({ userAgent: 'Mozilla/5.0 MoleOfficeWindow/1', viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const paths = { declaration: `/@fs${resolve('src/shared/settings-declaration.ts')}`, structure: `/@fs${resolve('src/shared/settings-structure.ts')}` }
  try {
    await page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
    await waitForThePage(page, 30_000)
    const expected = await page.evaluate(async (modulePaths) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
      const declaration = await load(modulePaths.declaration)
      declaration.PANELS.find((panel: Panel) => panel.key === 'settings.windowshutdown').controls.find((control: Control) => control.key === 'shutDown.windowOnly.whole').wordKey = 'shutDown.windowOnly.window'
      const structure = await load(modulePaths.structure)
      return structure.readSettingsStructure('en').categories.flatMap((category: Category) => category.panels).find((panel: Panel) => panel.key === 'settings.windowshutdown').controls.find((control: Control) => control.key === 'shutDown.windowOnly.whole').english
    }, paths)
    await page.locator('.set .sf-jump[data-category="looks"]').click()
    await page.locator('.set .sf-jump[data-category="you"]').click()
    const choice = page.locator('[data-settings-panel="settings.windowshutdown"] .sd-one:has(input[value="whole"]) span')
    await choice.waitFor({ state: 'visible', timeout: 30_000 })
    expect((await choice.textContent())?.trim()).toBe(expected)
  } finally {
    await context.close()
  }
}, 120_000)

it('draws the work-switch skip field from its declaration', async () => {
  await compareChangedControl('settings.workswitches', 'workSwitches.skip.tags', 'workSwitches.skip.runs', 'work', '[data-skip-list="tags"] .ws-field label')
}, 120_000)

it('draws the held-gate edit press from its declaration', async () => {
  await compareChangedControl('settings.workswitches', 'workSwitches.held.edit', 'pagesFromSettings.stopEditing', 'work', '[data-work-switch="queue-held"] [data-gate] button')
}, 120_000)

it('declares the work-switch field words without a fallback', async () => {
  const { settingsControlWord } = await import('../src/shared/settings-declaration.ts')
  const expected: Record<string, string> = {
    'workSwitches.skip.tags': 'workSwitches.skip.tags', 'workSwitches.skip.runs': 'workSwitches.skip.runs',
    'workSwitches.tags.reason': 'gates.reason', 'workSwitches.runs.reason': 'gates.reason',
    'workSwitches.tags.save': 'gates.save', 'workSwitches.runs.save': 'gates.save',
    'workSwitches.checks.reason': 'gates.reason', 'workSwitches.pending.reason': 'gates.reason',
    'workSwitches.checks.bounds': 'gates.bounds', 'workSwitches.checks.save': 'gates.save',
    'workSwitches.checks.putBack': 'gates.putBack', 'gates.readAgain': 'gates.readAgain',
    'workSwitches.held.position': 'gates.position', 'workSwitches.held.edit': 'pagesFromSettings.edit',
    'workSwitches.held.reason': 'gates.reason', 'workSwitches.held.until': 'gates.until',
    'workSwitches.held.on': 'gates.on', 'workSwitches.held.off': 'gates.off',
    'workSwitches.held.save': 'gates.save', 'workSwitches.held.putBack': 'gates.putBack',
    'workSwitches.held.stopEditing': 'pagesFromSettings.stopEditing',
  }
  for (const [key, word] of Object.entries(expected)) expect(settingsControlWord('settings.workswitches', key), key).toBe(word)
  expect(() => settingsControlWord('settings.workswitches', 'workSwitches.missing')).toThrow(/No Settings control/)
})

it('includes the actual chat number choices in the answer', async () => {
  const categories = await structure('en')
  const controls = categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.chatbutton')?.controls ?? []
  await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
  await waitForThePage(app.page, 30_000)
  await app.page.locator('.set .sf-jump[data-category="chat"]').click()
  const words = app.page.locator('[data-settings-panel="settings.chatbutton"] .ccl-choice .ccl-word')
  await words.first().waitFor({ state: 'visible', timeout: 30_000 })
  const drawn = (await words.allTextContents()).map((word) => word.trim())
  expect(drawn.length).toBeGreaterThan(1)
  for (const word of drawn) expect(controls.map((control) => control.english)).toContain(word)
}, 120_000)

it('draws the chat number choice from its declaration', async () => {
  await compareChangedControl('settings.chatbutton', 'chat.circle.mergedLabel', 'chat.circle.twoLabel', 'chat', '.ccl-choice[data-choice="merged"] .ccl-word')
}, 120_000)
