// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic archive preservation, including a seal written before the archive. */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { buildTheFirstOfficeInAHook, freshDb, apiApp, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()
const databases: TestDb[] = [], paths: string[] = []
afterAll(() => { for (const db of databases) db.close(); for (const path of paths) rmSync(path, { recursive: true, force: true }) })
const rows = (db: TestDb, name: string) => db.client.sqlite.prepare('SELECT * FROM ' + name).all().map((one) => JSON.stringify(one)).sort()
it('restores a previously sealed run without manufacturing capture events', async () => {
  const source = await freshDb(); databases.push(source)
  const app = (await apiApp()).app
  const actor = { type: 'agent' as const, id: 'archive-worker' }
  try {
    for (const [handle, as, type] of [['archive-starter',THE_TEST_OFFICES_OWNER.id,'human'],['archive-worker','archive-starter','agent']]) {
      const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { 'x-mole-office-workspace':'default','x-mole-office-actor-type':type!,'x-mole-office-actor-id':as! }, payload: { handle, name: handle, workArea: ['records'] } })
      expect(r.statusCode, r.body).toBe(201)
    }
    const record = source.api.createRecord({ kind:'note', title:'Synthetic archived content', data:{}, workspaceId:'default', actor, origin:'fixture' })
    const run = source.api.createRecord({ kind:'session', title:'Synthetic sealed archive run', data:{state:'running',servingAgent:actor.id,submission:{kind:'records',records:[record.id]}}, workspaceId:'default', actor, origin:'fixture' })
    source.api.patchRecord(run.id,{dataPatch:{state:'finished'}},actor)
    const sealed = source.api.getRecord(run.id)!.data['sealedTip']
    expect(typeof sealed).toBe('string')
    // The resource-lease evidence an older version of this test wrote down went with the lease
    // design, withdrawn by a decision. There is nothing left
    // to preserve, and the ledger round-trip below still refuses a fabricated row.
    mkdirSync('.logs',{recursive:true}); const archive=mkdtempSync(join(process.cwd(),'.logs','seal-archive-'));paths.push(archive)
    const original = Object.fromEntries(['submission_baselines','legacy_unsealed_runs','session_resources'].map((name)=>[name,rows(source,name)]))
    const { writeExport } = await import('../src/server/lib/export.ts'); writeExport(archive)
    const restored=await freshDb();databases.push(restored)
    const { applyImport } = await import('../src/server/lib/import.ts')
    expect(applyImport(archive).applied).toBe(true)
    for (const [name, expected] of Object.entries(original)) expect(rows(restored,name),name).toEqual(expected)
    const read = (await import('../src/server/lib/sealed-tip.ts')).readRunSeal(run.id)!
    expect(read.id).toBe(sealed)
    // THE SEAL NAMES A REVISION AND THE ARCHIVE CARRIES THAT REVISION. Criterion C34: a seal copies
    // nothing, so a restored archive proves the seal only if the row its pointer names came back too.
    expect(
      (restored.client.sqlite.prepare('SELECT title FROM revisions WHERE id = ?').get(read.seal.records!.records[0]!.after.id) as { title: string }).title,
    ).toBe('Synthetic archived content')
    expect(applyImport(archive).applied).toBe(true)
    for (const [name, expected] of Object.entries(original)) expect(rows(restored,name),name).toEqual(expected)
    // AN ORDINARY EDIT AFTER A RESTORE WRITES A REVISION AND NOT A COPY OF ONE. `submission_events`
    // held the copies and was dropped by migration 0154 (criterion C34).
    const count = rows(restored,'revisions').length
    restored.api.patchRecord(record.id,{summary:'An ordinary edit after restore'},actor)
    expect(rows(restored,'revisions').length).toBeGreaterThan(count)
    expect((await import('../src/server/lib/sealed-tip.ts')).readRunSeal(run.id)!.seal).toEqual(read.seal)
  } finally { await app.close() }
},60000)

it('an older archive gains an explicit legacy inventory without fabricated submission events', async () => {
  const source = await freshDb(); databases.push(source)
  // Synthetic pre-contract writers had no capture triggers or baseline tables.
  // The copying triggers went with migration 0154; only the baseline trigger is left to drop.
  source.client.sqlite.exec('DROP TRIGGER submission_run_baseline')
  const actor = { type: 'agent' as const, id: 'historical-archive-fixture' }
  const run = source.api.createRecord({ kind: 'session', title: 'Synthetic pre-contract finish', data: { state: 'finished', cutFrom: 'historical-main' }, workspaceId: 'default', actor, origin: 'fixture' })
  const original = source.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(run.id)
  const history = source.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ?').all(run.id)
  // .logs IS GITIGNORED: made here too, so this case does not lean on the case above having run first.
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  const archive = mkdtempSync(join(process.cwd(), '.logs', 'legacy-archive-')); paths.push(archive)
  ;(await import('../src/server/lib/export.ts')).writeExport(archive)
  const restored = await freshDb(); databases.push(restored)
  const { applyImport } = await import('../src/server/lib/import.ts')
  expect(applyImport(archive).applied).toBe(true)
  expect(restored.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(run.id)).toEqual(original)
  expect(restored.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ?').all(run.id)).toEqual(history)
  expect(rows(restored, 'submission_baselines')).toEqual([])
  const seals = await import('../src/server/lib/sealed-tip.ts')
  expect(seals.isLegacyUnsealed(run.id)).toBe(true)
  expect(seals.readRunSeal(run.id)).toBeNull()
})
