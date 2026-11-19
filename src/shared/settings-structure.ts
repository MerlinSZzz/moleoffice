// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsPath, type SettingsPanel } from './addresses.ts'
import { createI18n, type Language, type WordKey } from './i18n.ts'

import { PANELS, CATEGORIES, CATEGORY_TITLES, type Category, type SettingsPanelDeclaration } from './settings-declaration.ts'
export { PANELS, CATEGORIES, CATEGORY_TITLES, UNDER_THE_DEVELOPER_HEADING, type Category, type SettingsPanelDeclaration } from './settings-declaration.ts'

export type SettingsDeclaration = { panels: readonly SettingsPanelDeclaration[] }
export const SETTINGS_STRUCTURE: SettingsDeclaration = { panels: PANELS }
export const TITLE_KEYS = Object.fromEntries(PANELS.map((panel) => [panel.key, panel.title])) as Record<SettingsPanel, WordKey>
export const CATEGORY_OF = Object.fromEntries(PANELS.map((panel) => [panel.key, panel.category])) as Record<SettingsPanel, Category>
export const DEVELOPER_ONLY_PANELS: ReadonlySet<SettingsPanel> = new Set(PANELS.filter((panel) => panel.developerOnly).map((panel) => panel.key))
export const WINDOW_ONLY_PANELS: ReadonlySet<SettingsPanel> = new Set(PANELS.filter((panel) => panel.windowOnly).map((panel) => panel.key))

export function panelsInCategory(category: Category, developer: boolean, inWindow: boolean, declaration: SettingsDeclaration = SETTINGS_STRUCTURE): readonly SettingsPanelDeclaration[] {
  return declaration.panels.filter((panel) => panel.category === category && (developer || !panel.developerOnly) && (inWindow || !panel.windowOnly))
}

export function readSettingsStructure(language: Language, declaration: SettingsDeclaration = SETTINGS_STRUCTURE) {
  const local = createI18n(language), english = createI18n('en')
  return { categories: CATEGORIES.map((key) => ({
    key, words: local.t(CATEGORY_TITLES[key]), english: english.t(CATEGORY_TITLES[key]),
    panels: declaration.panels.filter((panel) => panel.category === key).map((panel) => {
      const address = `#${settingsPath(panel.key as SettingsPanel)}`
      return { key: panel.key, words: local.t(panel.title), english: english.t(panel.title), address,
        controls: panel.controls.map((control) => {
          const translated = (t: typeof local.t) => control.values === undefined ? undefined : Object.fromEntries(Object.entries(control.values).map(([name, word]) => [name, t(word)]))
          const words = control.literalIn?.(language) ?? control.literal ?? local.t(control.wordKey, translated(local.t)), inEnglish = control.literalIn?.('en') ?? control.literal ?? english.t(control.wordKey, translated(english.t))
          const parameters = [...new Set([...words.matchAll(/\{(\w+)\}/g), ...inEnglish.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!))]
          return { key: control.key, wordKey: control.wordKey, words, english: inEnglish, parameters, address, whoMayPress: control.whoMayPress }
        }) }
    }),
  })) }
}
