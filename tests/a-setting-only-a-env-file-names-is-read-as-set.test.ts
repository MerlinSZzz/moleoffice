// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SETTING THAT ONLY A `.env` FILE NAMES IS SET.
 *
 * An environment made by `bootstrapEnvironment` or `mergedEnvironment` keeps the layer each value came from, so
 * `readSetting` says `.env` for a value the file gave. The readers below ask a different question: whether anybody
 * set the setting at all. When they asked it as "is the source the environment", a MOLE_OFFICE_API written only in
 * a `.env` was passed over, and every tool reached the built-in port 8787 instead of the office the file named.
 */

import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  apiAddressFrom,
  bootstrapEnvironment,
  mergedEnvironment,
  pluginsFolderFrom,
  readSetting,
  viteCacheDirFrom,
  webAddressFrom,
} from '../src/config/settings.mjs'

let dir = ''
let file = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-env-only-'))
  file = join(dir, '.env')
  writeFileSync(
    file,
    [
      'MOLE_OFFICE_API=http://127.0.0.1:12345',
      'MOLE_OFFICE_WEB=http://127.0.0.1:12346',
      `MOLE_OFFICE_VITE_CACHE=${join(dir, 'vite-cache')}`,
      `MOLE_OFFICE_PLUGINS=${join(dir, 'plugins')}`,
      '',
    ].join('\n'),
  )
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

for (const [how, make] of [
  ['bootstrapEnvironment', () => bootstrapEnvironment({}, file)],
  ['mergedEnvironment', () => mergedEnvironment({}, file)],
] as const) {
  it(`reads what only the .env names out of ${how}, and says the .env set it`, () => {
    const env = make()
    expect(readSetting('MOLE_OFFICE_API', env).source).toBe('.env')
    expect(apiAddressFrom(env)).toBe('http://127.0.0.1:12345')
    expect(webAddressFrom(env)).toBe('http://127.0.0.1:12346')
    expect(viteCacheDirFrom(env)).toBe(join(dir, 'vite-cache'))
    expect(pluginsFolderFrom(env)).toBe(join(dir, 'plugins'))
  })
}
