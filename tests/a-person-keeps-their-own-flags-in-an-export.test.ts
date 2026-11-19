// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S SETTINGS FOR THE SHIPPED FLAGS GO OUT WITH THE EXPORT (wave 14d, DB-3, case h).
 *
 * The export is the archive a person can carry away, so a setting that only existed on the row would be lost by a
 * restore. This reads the archive's own text, not the plan of it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const SETTINGS = { 'just-ask': { name: 'Answer plainly', instruction: 'Answer only.' }, none: { name: 'Nothing at all' } }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
}, 120_000)

afterAll(async () => {
  await app?.close()
  await t?.close()
}, 60_000)

describe('the export', () => {
  it('carries the person\'s settings for the shipped flags', async () => {
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/participants/person/${encodeURIComponent(THE_TEST_OFFICES_OWNER.id)}`,
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' },
      payload: { shippedFlags: SETTINGS },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    const { buildExport } = await import('../src/server/lib/export.ts')
    const people = buildExport().files.find((file) => file.path === 'participants.md')
    expect(people, 'the export has no people file').toBeDefined()
    expect(people?.text).toContain('shippedFlags:')
    expect(people?.text).toContain('Answer plainly')
    expect(people?.text).toContain('Nothing at all')

    // AND AN IMPORT PUTS THE SAME SETTINGS BACK ON A FRESH OFFICE.
    const archive = aTestDatabaseFolder('flags-archive')
    try {
      const { writeExport } = await import('../src/server/lib/export.ts')
      writeExport(archive)
      const restored = await freshDb()
      const { applyImport } = await import('../src/server/lib/import.ts')
      const imported = applyImport(archive)
      expect(imported.applied, JSON.stringify(imported.refusals ?? [])).toBe(true)
      const row = restored.client.sqlite.prepare('SELECT shipped_flags AS flags FROM people WHERE id = ?').get(THE_TEST_OFFICES_OWNER.id) as { flags: string }
      expect(JSON.parse(row.flags)).toEqual(SETTINGS)
      restored.close()
    } finally {
      removeThisTestFolder(archive)
    }
  }, 120_000)
})
