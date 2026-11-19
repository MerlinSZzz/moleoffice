// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { WordKey } from './i18n.ts'

/** The words on each appearance choice, shared by the page and its structure reading. */
export const PRESET_WORDS = {
  theme: {
  auto: 'settingsPanel.look.auto',
  light: 'settingsPanel.look.light',
  dark: 'settingsPanel.look.dark',
},
  density: {
  compact: 'settingsPanel.look.compact',
  default: 'settingsPanel.look.default',
  comfortable: 'settingsPanel.look.comfy',
},
  radius: {
  sharp: 'settingsPanel.look.sharp',
  default: 'settingsPanel.look.default',
  soft: 'settingsPanel.look.soft',
},
  font: {
  ui: 'settingsPanel.look.fontUi',
  mono: 'settingsPanel.look.fontMono',
  read: 'settingsPanel.look.fontRead',
},
  size: {
  small: 'settingsPanel.look.small',
  default: 'settingsPanel.look.default',
  large: 'settingsPanel.look.large',
},
} as const satisfies Readonly<Record<string, Readonly<Record<string, WordKey>>>>
