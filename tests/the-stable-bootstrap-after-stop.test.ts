// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ACTUAL_OFFICE_ASKED, actualBootstrapOffice, prepareAndAuthorize, injected, rememberResult, privateImage, identity, write, git } from './stable-bootstrap-actual-office-fixture.ts'

it.skipIf(!ACTUAL_OFFICE_ASKED)('restarts and verifies the actual development topology after failure immediately following the first supervisor stop', async () => {
  const f = await actualBootstrapOffice(), config = await prepareAndAuthorize(f)
  const failed = await injected(f, config, [{ step: 'stop-original-supervisor', phase: 'after' }]); rememberResult(failed.result)
  expect(failed.result?.state, JSON.stringify(failed.result)).toBe('restored'); expect(failed.result.stopToRecoveredMs).toBeGreaterThan(0)
  const runtime = await f.object('/api/runtime'); expect(runtime.repository.path).toBe(f.dev); expect(runtime.supervisor.pid).not.toBe(f.config.topology.supervisor.pid); expect(identity(runtime.supervisor.pid).argv).toContain('--prepared')
  write(join(f.folder, 'RECOVERED-ELAPSED.json'), { stopToRecoveredMs: failed.result.stopToRecoveredMs, original: f.config.topology, recovered: failed.result.service })
}, 900000)

