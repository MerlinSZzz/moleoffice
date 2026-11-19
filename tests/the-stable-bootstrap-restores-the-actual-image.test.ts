// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ACTUAL_OFFICE_ASKED, actualBootstrapOffice, prepareAndAuthorize, injected, rememberResult, privateImage, identity, write } from './stable-bootstrap-actual-office-fixture.ts'

it.skipIf(!ACTUAL_OFFICE_ASKED)('restores every actual SQLite schema entry and row before restarting development after a post-snapshot synthetic change', async () => {
  const f = await actualBootstrapOffice(), oldKeys = statSync(f.keys)
  const title = 'Synthetic note present at the private snapshot'
  const filed = await f.officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'note', title, data: { body: 'Made-up record. The fixture changes its title after the private snapshot; recovery must bring this title back.' } } })
  expect(filed.status, filed.body).toBe(201)
  const recordId = JSON.parse(filed.body).record.id, config = await prepareAndAuthorize(f)
  const failed = await injected(f, config, [{ step: 'checkpoint-real-database', phase: 'after' }], { recordId, title: 'Synthetic post-snapshot title that recovery must discard' }); rememberResult(failed.result)
  expect(failed.result?.state, JSON.stringify(failed.result)).toBe('restored'); expect(failed.result.stopToRecoveredMs).toBeGreaterThan(0)
  const changed = JSON.parse(readFileSync(join(f.folder, 'post-snapshot-change.json'), 'utf8'))
  expect(changed.changes).toBe(1); expect(changed.differs).toBe(true)
  const restored = JSON.parse(readFileSync(join(f.folder, 'restored-image-comparison.json'), 'utf8'))
  expect(restored.equal).toBe(true); expect(restored.source.hash).toBe(restored.copy.hash); expect(restored.source.tables).toContain('records'); expect(restored.source.tables).toContain('held_keys')
  privateImage(f, failed.result)
  const runtime = await f.object('/api/runtime'); expect(runtime.repository.path).toBe(f.dev); expect(runtime.database.path).toBe(f.database)
  expect(runtime.supervisor.pid).not.toBe(f.config.topology.supervisor.pid); expect(identity(runtime.supervisor.pid).argv).toContain('--prepared')
  expect((await f.object(`/api/records/${recordId}`)).record.title).toBe(title)
  expect(statSync(f.keys)).toMatchObject({ dev: oldKeys.dev, ino: oldKeys.ino, size: oldKeys.size, mtimeMs: oldKeys.mtimeMs })
  const journal = readFileSync(failed.result.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const argv = journal.find(row => row.step === 'recovery-argv')
  expect(argv?.previous).toEqual(f.config.topology.supervisor.argv); expect(argv?.recovery).toContain('--prepared')
  write(join(f.folder, 'RESTORED-IMAGE-WITNESS.json'), { recordId, changed, restored, argv: { previous: argv.previous, recovery: argv.recovery }, original: f.config.topology, recovered: failed.result.service, stopToRecoveredMs: failed.result.stopToRecoveredMs, says: 'Fresh synthetic fixture only. Digests and table names leave the fixture; no row content does.' })
}, 900000)
