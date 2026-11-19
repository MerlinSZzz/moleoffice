// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE'S FIRST TEST OFFICE IS BUILT IN A HOOK, BEFORE ANY CASE RUNS.
 *
 * The first `freshDb()` in a test process migrates the schema and keeps the result on the process,
 * and the first `apiApp()` transforms the server's modules. Together they took 1.4 to 5.3 s on this
 * machine (wave 13t, round 33). A case has vitest's 5 s, so a case that made its file's first office
 * could time out on a busy machine although nothing it tests was slow (problem xfTXZK2YORok).
 * `buildTheFirstOfficeInAHook()` in tests/helpers.ts moves that first build into a `beforeAll`.
 *
 * Each test file runs in a process of its own (`pool: 'forks'` in vitest.config.ts), so nothing
 * before this file can have migrated the schema. If the schema is migrated when the first case
 * starts, the hook did it.
 *
 * WHAT GOES RED. Make `buildTheFirstOfficeInAHook` register nothing, or a hook that does not make an
 * office, and the first case fails.
 */
import { describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook } from './helpers.ts'

buildTheFirstOfficeInAHook()

/** The file `freshDb()` copies each test database from, once this process has migrated it. */
function theSchemaThisProcessMigrated(): string | null {
  const carrier = process as unknown as { __moleOfficeStartedByThisProcess?: { migratedSchema: string | null } }
  return carrier.__moleOfficeStartedByThisProcess?.migratedSchema ?? null
}

describe('the hook a file calls at its top', () => {
  it('has migrated the schema before the first case starts', () => {
    expect(theSchemaThisProcessMigrated()).not.toBeNull()
  })

  it('leaves each case the runner\'s five seconds, which is the reason the first build moved', (ctx) => {
    expect(ctx.task.timeout).toBe(5_000)
  })
})
