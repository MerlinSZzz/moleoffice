// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { parseRoute, SETTINGS_PANELS, settingsPanelFrom, settingsPath } from '../src/shared/addresses.ts'

/**
 * AN ADDRESS MAY NAME ONE SETTINGS PANEL: "#/settings/<word>", the word being the panel's
 * surface id without "settings.". The builder makes it, the one reader reads it back, and a word no panel has lands
 * on the not-found page like any other typo. The server reads a lead's address with the same reader.
 */
describe('the Settings address', () => {
  it('reads back every panel the builder writes, and the page itself without one', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' })
    expect(settingsPath()).toBe('/settings')
    for (const panel of SETTINGS_PANELS) {
      const address = settingsPath(panel)
      expect(address, panel).toBe(`/settings/${panel.slice('settings.'.length)}`)
      expect(parseRoute(`#${address}`), panel).toEqual({ name: 'settings', panel })
    }
    expect(settingsPanelFrom('inject')).toBe('settings.inject')
  })

  it('sends a word no panel has, a third segment and the edit word to the not-found page', () => {
    for (const address of ['#/settings/nothing', '#/settings/theme', '#/settings/inject/more', '#/settings/edit', '#/settings/inject/edit', '#/settings/settings.inject']) {
      expect(parseRoute(address).name, address).toBe('unknown')
    }
  })
})
