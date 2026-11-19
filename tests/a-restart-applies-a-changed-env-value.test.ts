// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTART UNDER THE INSTALLED SERVICE APPLIES A CHANGED OR REMOVED `.env` VALUE.
 *
 * The server loads `.env` into its own environment when it starts. The restart press used to hand
 * the service command `mergedEnvironment({ ...process.env })`, and that environment still held the
 * values `.env` had at the last start. The new server then reads `.env` without overwriting a name
 * that is already set, so a changed value was not applied and a removed name came back (problem
 * OaNJukRMwRjG). A newly added name was applied, which is why the fault was easy to miss.
 *
 * WHAT THIS CASE READS: the environment the restart hands the service, built by the one function
 * the production restart manager calls. A made-up `.env` starts with two names, then one value
 * changes and the other name is removed. A name the shell set is not in the file at all.
 *
 * THE CRITERION. The changed name is the new value; the removed name is absent; the shell's name
 * is kept. The old code answers the first two with the old value and the removed value.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { forgetWhatTheEnvFileSupplied, loadEnvFileIntoProcess } from '../src/config/settings.mjs'
import { theEnvironmentTheRestartHandsTheService } from '../src/server/lib/the-environment-the-restart-hands-the-service.ts'

const WHOLE_FILE_CHANGED = 'A_NAME_THE_FILE_CHANGED'
const WHOLE_FILE_REMOVED = 'A_NAME_THE_FILE_REMOVED'
const FROM_THE_SHELL = 'A_NAME_THE_SHELL_SET'

afterEach(() => {
  forgetWhatTheEnvFileSupplied()
})

it('hands the restarted service the changed value, no removed name, and the shell name', () => {
  const folder = mkdtempSync(join(tmpdir(), 'the-restarts-environment-'))
  const file = join(folder, '.env')
  const before = {
    [WHOLE_FILE_CHANGED]: process.env[WHOLE_FILE_CHANGED],
    [WHOLE_FILE_REMOVED]: process.env[WHOLE_FILE_REMOVED],
    [FROM_THE_SHELL]: process.env[FROM_THE_SHELL],
  }
  try {
    delete process.env[WHOLE_FILE_CHANGED]
    delete process.env[WHOLE_FILE_REMOVED]
    process.env[FROM_THE_SHELL] = 'from-the-shell'
    writeFileSync(file, `${WHOLE_FILE_CHANGED}=the-old-value\n${WHOLE_FILE_REMOVED}=still-here\n`)
    loadEnvFileIntoProcess(file)
    writeFileSync(file, `${WHOLE_FILE_CHANGED}=the-new-value\n`)
    const handed = theEnvironmentTheRestartHandsTheService({ ...process.env }, file)
    expect(handed[WHOLE_FILE_CHANGED], 'a changed .env value was not applied').toBe('the-new-value')
    expect(handed[WHOLE_FILE_REMOVED], 'a name removed from .env came back').toBeUndefined()
    expect(handed[FROM_THE_SHELL], 'a name the shell set was dropped').toBe('from-the-shell')
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(folder, { recursive: true, force: true })
  }
})
