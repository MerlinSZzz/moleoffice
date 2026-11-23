// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { PANELS } from '../src/shared/settings-declaration.ts'
import { SURFACES } from '../src/shared/surfaces.ts'

it('declares provider key setup as a developer-only Settings panel with person-only controls', () => {
  const panel = PANELS.find((one) => one.key === 'settings.providerkeys')
  expect(panel).toBeDefined()
  expect(panel?.developerOnly).toBe(true)
  expect(panel?.controls.length).toBeGreaterThan(3)
  expect(panel?.controls.every((control) => control.whoMayPress.includes('person'))).toBe(true)
  expect(Object.keys(SURFACES).includes('settings.providerkeys')).toBe(true)
})
