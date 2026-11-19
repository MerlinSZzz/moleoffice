// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SETTING READ THROUGH A MERGED ENVIRONMENT NAMES THE LAYER THAT ANSWERED, AND SEES A NEW `.env`.
 *
 * WHAT THIS HOLDS. `readSettingHere` answers the value of a setting and the layer that set it: the
 * `.env` file beside the caller, the environment the caller handed in, the office database, the
 * built-in default, or nothing at all. The cases here fix those answers for the three chore settings
 * and two other settings, with `.env` absent, present and empty, and present with values, each in a
 * temporary folder of its own. They also fix that an edit to `.env` between two asks is seen by the
 * second ask, because each ask makes its own merged environment.
 *
 * WHY IT IS WRITTEN NOW. Round 42's profile found the `.env` look on the model-read path, and round 43
 * counted it: a model read of every agent looked for the file once per setting read, 5,832 looks on
 * the made-up database. The change that would take those looks away is designed and deferred (wave
 * 13y round 43), and this file holds the behaviour that change must keep. The count case of that
 * criterion is kept outside the suite, because it is red on today's code.
 *
 * WHERE THE EXPECTED ANSWERS COME FROM. The declarations in src/config/settings.mjs: `fallback` is the
 * built-in default, and a null fallback with `absentMeans` means nobody set it. Each expected value
 * and source below was written out from those declarations, never read back from the code under test.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mergedEnvironment, readSettingHere } from '../src/config/settings.mjs'

const made: string[] = []

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A temporary folder this test removes when the case ends. */
function aFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-a-setting-read-'))
  made.push(dir)
  return dir
}

/** The declarations this test fixes: the setting, what its fallback is, and which source that fallback means. */
const FIXED = [
  { name: 'MOLE_OFFICE_CHORE_RUNTIME', whenNobodySetsIt: null, source: 'nothing set it' },
  { name: 'MOLE_OFFICE_CHORE_MODEL', whenNobodySetsIt: null, source: 'nothing set it' },
  { name: 'MOLE_OFFICE_CHORE_VARIANT', whenNobodySetsIt: null, source: 'nothing set it' },
  { name: 'MOLE_OFFICE_AGENT_MODEL', whenNobodySetsIt: null, source: 'nothing set it' },
  { name: 'MOLE_OFFICE_REPLY_REMINDER_MINUTES', whenNobodySetsIt: '3', source: 'the built-in default' },
] as const

/** What the valued `.env` holds. The quotes are there to be taken off, as a person writing the file would use them. */
const IN_THE_FILE = [
  "MOLE_OFFICE_CHORE_MODEL='made-up-chore-model'",
  'MOLE_OFFICE_AGENT_MODEL=made-up-agent-model',
  'MOLE_OFFICE_REPLY_REMINDER_MINUTES="9"',
]

/** Each name the valued `.env` sets, and the value after the quotes are taken off. */
const FROM_THE_FILE: Readonly<Record<string, string>> = {
  MOLE_OFFICE_CHORE_MODEL: 'made-up-chore-model',
  MOLE_OFFICE_AGENT_MODEL: 'made-up-agent-model',
  MOLE_OFFICE_REPLY_REMINDER_MINUTES: '9',
}

for (const state of ['absent', 'present and empty', 'present with values'] as const) {
  it(`answers each setting, and says which layer answered, with .env ${state}`, () => {
    const file = join(aFolder(), '.env')
    if (state !== 'absent') writeFileSync(file, state === 'present and empty' ? '' : `${IN_THE_FILE.join('\n')}\n`)
    const env = mergedEnvironment({}, file)
    for (const one of FIXED) {
      const setInTheFile = state === 'present with values' && Object.hasOwn(FROM_THE_FILE, one.name)
      const reading = readSettingHere(one.name, env, file)
      expect(reading.value, `${one.name}: its value with .env ${state}`).toBe(
        setInTheFile ? FROM_THE_FILE[one.name] : one.whenNobodySetsIt,
      )
      expect(reading.source, `${one.name}: the layer with .env ${state}`).toBe(setInTheFile ? '.env' : one.source)
    }
  })
}

it('takes the environment the caller handed in over the .env, and says the environment is the layer', () => {
  const file = join(aFolder(), '.env')
  writeFileSync(file, 'MOLE_OFFICE_CHORE_MODEL=from-the-file\n')
  const env = mergedEnvironment({ MOLE_OFFICE_CHORE_MODEL: 'from-the-shell' }, file)
  const reading = readSettingHere('MOLE_OFFICE_CHORE_MODEL', env, file)
  expect(reading.value, 'the shell value wins').toBe('from-the-shell')
  expect(reading.source, 'and the layer that set it is the environment').toBe('the environment')
})

/**
 * This case makes a fresh database inside the test, cold, so it has sixty seconds, as other files
 * that call `freshDb` inside a test do. In wave 13y round 43 the case took 3.8 s in one run and 5.6 s
 * in another on unchanged code, so the runner's five seconds is not enough for it.
 */
it('keeps a choice the office database holds, and says the database is the layer', async () => {
  const { freshDb } = await import('./helpers.ts')
  const t = await freshDb()
  try {
    t.client.sqlite
      .prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)')
      .run('MOLE_OFFICE_REPLY_REMINDER_MINUTES', '9')
    const { mergedEnvironment: merged, readSettingHere: read } = await import('../src/config/settings.mjs')
    const reading = read('MOLE_OFFICE_REPLY_REMINDER_MINUTES', merged())
    expect(reading.value, 'the value the office database holds').toBe('9')
    expect(reading.source, 'and the layer that set it is the office database').toBe('the office database')
  } finally {
    t.close()
  }
}, 60_000)

it('sees a change to .env between two asks, and each ask keeps its own answer', () => {
  const file = join(aFolder(), '.env')
  writeFileSync(file, 'MOLE_OFFICE_CHORE_MODEL=the-first-model\n')
  const first = mergedEnvironment({}, file)
  expect(readSettingHere('MOLE_OFFICE_CHORE_MODEL', first, file).value, 'the first ask').toBe('the-first-model')

  writeFileSync(file, 'MOLE_OFFICE_CHORE_MODEL=the-second-model\n')
  const second = mergedEnvironment({}, file)
  expect(readSettingHere('MOLE_OFFICE_CHORE_MODEL', second, file).value, 'the second ask sees the edit').toBe(
    'the-second-model',
  )

  expect(readSettingHere('MOLE_OFFICE_CHORE_MODEL', first, file).value, 'and the first ask still answers its own world').toBe(
    'the-first-model',
  )
})
