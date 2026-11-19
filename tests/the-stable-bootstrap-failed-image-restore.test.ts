// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ACTUAL_OFFICE_ASKED, actualBootstrapOffice, prepareAndAuthorize, injected, rememberResult, privateImage, identity, write, git } from './stable-bootstrap-actual-office-fixture.ts'

it.skipIf(!ACTUAL_OFFICE_ASKED)('retains the private exact image and reports NOT RESTORED when actual post-checkpoint recovery fails', async () => {
  const f = await actualBootstrapOffice(), config = await prepareAndAuthorize(f)
  const failed = await injected(f, config, [{ step: 'checkpoint-real-database', phase: 'after' }, { step: 'restore-private-exact-database', phase: 'before' }]); rememberResult(failed.result)
  expect(failed.result?.state, JSON.stringify(failed.result)).toBe('NOT RESTORED'); expect(failed.result.restoreFailure).toContain('restore-private-exact-database')
  expect(existsSync(failed.result.paths.lock)).toBe(true); privateImage(f, failed.result)
  const comparison = JSON.parse(readFileSync(join(f.folder, 'image-content-comparison.json'), 'utf8'))
  expect(comparison.equal).toBe(true); expect(comparison.source.hash).toBe(comparison.copy.hash); expect(comparison.source.tables).toContain('records'); expect(comparison.source.tables).toContain('held_keys')
}, 900000)
