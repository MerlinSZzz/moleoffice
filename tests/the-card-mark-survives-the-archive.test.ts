// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARK SAYING WHO CHOSE AN AGENT'S CARD SURVIVES THE ARCHIVE. Criterion P75, migration 0148.
 *
 * MEASURED FIRST, 8 September 2026: the column is declared as JSON, the export wrote it as the raw
 * text the row holds, and the import refused the whole archive — "agents.cardChosenBy is
 * "{\"how\":\"the-rule\",\"who\":null}", and it has to be a JSON object". tests/sealed-archive.test.ts
 * went red on main for that reason the moment perm-5b (the mark) was merged beside flow-2 (the
 * archive proof). An archive that cannot be restored is a backup that is not one.
 *
 * CONTROL: red before the export parsed the column, green after. MUTATION: drop the parse of
 * `cardChosenBy` in the agents block of src/server/lib/export.ts and this goes red with the import's
 * own sentence.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { buildTheFirstOfficeInAHook, freshDb, apiApp, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so no case below pays for it (wave 13t round 34).
buildTheFirstOfficeInAHook()

const databases: TestDb[] = []
const paths: string[] = []
afterAll(() => {
  for (const db of databases) db.close()
  for (const path of paths) rmSync(path, { recursive: true, force: true })
})

/** The mark exactly as the row holds it: one JSON object as text, or null where nobody recorded one. */
const markOf = (db: TestDb, handle: string): string | null => {
  const row = db.client.sqlite.prepare('SELECT card_chosen_by AS mark FROM agents WHERE handle = ?').get(handle) as
    | { mark: string | null }
    | undefined
  return row?.mark ?? null
}

it('an archive carries who chose each card, and a restore holds the same mark', async () => {
  const source = await freshDb()
  databases.push(source)
  const app = (await apiApp()).app
  try {
    const started = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { handle: 'archived-agent', name: 'archived-agent', workArea: ['records'] },
    })
    expect(started.statusCode, started.body).toBe(201)
    const before = markOf(source, 'archived-agent')
    expect(before, 'the registration wrote a mark').not.toBeNull()
    expect(JSON.parse(before!) as unknown, 'and it is one object saying who chose the card').toMatchObject({ how: expect.any(String) })

    mkdirSync('.logs', { recursive: true })
    const archive = mkdtempSync(join(process.cwd(), '.logs', 'card-mark-archive-'))
    paths.push(archive)
    const { writeExport } = await import('../src/server/lib/export.ts')
    writeExport(archive)

    const restored = await freshDb()
    databases.push(restored)
    const { applyImport } = await import('../src/server/lib/import.ts')
    expect(applyImport(archive).applied, 'the archive is accepted').toBe(true)
    expect(markOf(restored, 'archived-agent'), 'the restored row holds the same mark, as one JSON object').toBe(before)
  } finally {
    await app.close()
  }
}, 60000)
