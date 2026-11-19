// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ACTUAL_OFFICE_ASKED, actualBootstrapOffice, measureBootstrapDry, handoffWithLostAfter, retryBootstrapDelivery, prepareAndAuthorize, injected, rememberResult, privateImage, identity, write, git } from './stable-bootstrap-actual-office-fixture.ts'

it.skipIf(!ACTUAL_OFFICE_ASKED)('hands off the actual Office at one commit and leaves later development main advancement outside the stable supervisor', async () => {
  const f = await actualBootstrapOffice(), oldKeys = statSync(f.keys), oldDatabase = statSync(f.database)
  await measureBootstrapDry(f)
  const refused = await f.cli({ ...f.config, evidence: { ...f.config.evidence, contentHash: '0000000000000000' } }, ['--prepare', '--dry'], 'wrong-evidence')
  expect(refused.code).toBe(1); expect(existsSync(f.stable)).toBe(false)
  const config = await prepareAndAuthorize(f)
  const handed = await handoffWithLostAfter(f, config); rememberResult(handed.result)
  expect(handed.code, readFileSync(join(f.folder, 'handoff.log'), 'utf8')).toBe(1); expect(handed.result.state).toBe('published'); expect(handed.result.notices.state).toBe('pending')
  const deliveryTrace = readFileSync(join(f.folder, 'lost-after.trace.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(deliveryTrace.some(row => row.dropped === 'response' && row.stage === 'after' && row.sendId === config.noticeSendIds.after && [200, 201].includes(row.status))).toBe(true)
  const runtime = await f.object('/api/runtime')
  expect(runtime.repository.path).toBe(f.stable); expect(runtime.repository.head.full).toBe(f.config.targetCommit); expect(runtime.database.path).toBe(f.database)
  expect(identity(runtime.supervisor.pid).argv).toContain('--prepared'); expect(git(f.stable, 'symbolic-ref', 'HEAD')).toBe('refs/heads/stable'); expect(lstatSync(join(f.stable, '.git')).isDirectory()).toBe(true); expect(git(f.dev, 'worktree', 'list', '--porcelain')).not.toContain(f.stable)
  expect(statSync(f.keys)).toMatchObject({ dev: oldKeys.dev, ino: oldKeys.ino, size: oldKeys.size, mtimeMs: oldKeys.mtimeMs }); expect(statSync(f.database).ino).toBe(oldDatabase.ino)
  privateImage(f, handed.result); expect(handed.result.stopToServingMs).toBeGreaterThan(0)
  const births = () => Object.values(handed.result.service).filter(Boolean).map((row: any) => identity(row.pid))
  const servingBirths = births(), observedAfter = await f.object(`/api/office/upgrades?sendId=${encodeURIComponent(config.noticeSendIds.after)}&limit=1`)
  expect(observedAfter.notice.event.request.sendId).toBe(config.noticeSendIds.after)
  const accepted = await f.officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'note', title: 'Synthetic accepted write after first publication', data: { body: 'Made-up accepted write after verified publication and before delivery-only retry.' } } })
  expect(accepted.status, accepted.body).toBe(201)
  const acceptedId = JSON.parse(accepted.body).record.id, acceptedOriginal = await f.object(`/api/records/${acceptedId}/revisions/1`)
  const retried = await retryBootstrapDelivery(f, handed.result.paths.noticeJournal)
  expect(retried.code).toBe(0); expect(retried.result.state).toBe('published'); expect(retried.result.notices.state).toBe('filed')
  expect(retried.result.notices.after).toEqual(observedAfter.notice.original); expect(births()).toEqual(servingBirths)
  expect((await f.object(`/api/records/${acceptedId}/revisions/1`)).contentHash).toBe(acceptedOriginal.contentHash)
  const reconciled = await f.object(`/api/office/upgrades?sendId=${encodeURIComponent(config.noticeSendIds.after)}&limit=1`)
  expect(reconciled.notice.original).toEqual(observedAfter.notice.original)
  write(join(f.folder, 'DELIVERY-ONLY-RETRY.json'), { servingBirths, after: observedAfter.notice.original, accepted: { id: acceptedId, seq: 1, contentHash: acceptedOriginal.contentHash }, retry: retried.result.notices, says: 'Proves delivery retry preserved this accepted synthetic write and exact serving process births. It does not prove lossless manual restore.' })
  const history = await f.object('/api/office/upgrades?limit=25'); expect(history.entries.some((row: any) => row.kind === 'first-handoff' && row.outcome === 'handed-off' && row.baselineTag === null)).toBe(true)
  const stableBirth = identity(runtime.supervisor.pid)
  write(join(f.dev, 'bootstrap-synthetic-main-advanced.txt'), 'Synthetic later main source; no stable edit.\n'); git(f.dev, 'add', 'bootstrap-synthetic-main-advanced.txt'); git(f.dev, 'commit', '-m', 'Synthetic later development main')
  await delay(700)
  expect(identity(runtime.supervisor.pid)).toEqual(stableBirth); expect((await f.object('/api/runtime')).repository.head.full).toBe(f.config.targetCommit)
  write(join(f.folder, 'ROOT-PHOTOGRAPH-HANDOFF.json'), { source: f.stable, development: f.dev, database: f.database, keys: f.keys, history, runtime, buildStamp: JSON.parse(readFileSync(join(f.stable, 'dist/web/build-stamp.json'), 'utf8')), stopToServingMs: handed.result.stopToServingMs, says: 'Fresh synthetic fixture only. Services stop in afterEach. Reopen only under a named root phase; fixture-credentials.json is private.' })
}, 900000)
