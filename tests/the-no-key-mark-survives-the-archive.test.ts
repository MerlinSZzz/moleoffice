// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARK OF AN AGENT REGISTERED WITH NO KEY OF ITS OWN SURVIVES THE ARCHIVE. Migration 0273.
 *
 * A restore that dropped the mark would leave 0 on the row, and a write in the agent's name would then be taken without
 * a run key again (src/server/lib/run-keys-only.ts). tests/export-format.test.ts proves that the export declares the
 * column. This proves that an archive carries the mark and that a restore writes it back, and that an agent without it
 * comes back without it. The office and its agents are made up.
 *
 * MUTATION PROOF (after a green control, each alone, restored with cp and checked with cmp, then green again): in the
 * commit that registers an agent with no key of its own (wave 13j, the round after the cut), which names its logs.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { buildTheFirstOfficeInAHook, freshDb, apiApp, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so no case below pays for it.
buildTheFirstOfficeInAHook()

const databases: TestDb[] = []
const paths: string[] = []
afterAll(() => {
  for (const db of databases) db.close()
  for (const path of paths) rmSync(path, { recursive: true, force: true })
})

const markOf = (db: TestDb, handle: string): number | null => {
  const row = db.client.sqlite.prepare('SELECT run_keys_only AS mark FROM agents WHERE handle = ?').get(handle) as { mark: number } | undefined
  return row?.mark ?? null
}

it('an archive carries which agents have no key of their own, and a restore holds the same marks', async () => {
  const source = await freshDb()
  databases.push(source)
  const app = (await apiApp()).app
  try {
    for (const handle of ['archived-no-key', 'archived-keyed']) {
      const started = await app.inject({
        method: 'POST',
        url: '/api/agents/started',
        headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
        payload: { handle, name: handle },
      })
      expect(started.statusCode, started.body).toBe(201)
    }
    // MARKED HERE AS A REGISTRATION WITH `noKey: true` MARKS IT. That door's own proof is in
    // tests/a-supervisor-starts-its-own-worker.test.ts; this file is about the archive.
    source.client.sqlite.prepare("UPDATE agents SET run_keys_only = 1 WHERE handle = 'archived-no-key'").run()
    expect([markOf(source, 'archived-no-key'), markOf(source, 'archived-keyed')]).toEqual([1, 0])

    mkdirSync('.logs', { recursive: true })
    const archive = mkdtempSync(join(process.cwd(), '.logs', 'no-key-mark-archive-'))
    paths.push(archive)
    const { writeExport } = await import('../src/server/lib/export.ts')
    writeExport(archive)

    const restored = await freshDb()
    databases.push(restored)
    const { applyImport } = await import('../src/server/lib/import.ts')
    expect(applyImport(archive).applied, 'the archive is accepted').toBe(true)
    expect([markOf(restored, 'archived-no-key'), markOf(restored, 'archived-keyed')], 'the restored rows hold the same marks').toEqual([1, 0])
  } finally {
    await app.close()
  }
}, 60000)
