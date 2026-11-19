// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ACTUAL_OFFICE_ASKED, actualBootstrapOffice, prepareAndAuthorize, injected, rememberResult, privateImage, identity, write, git } from './stable-bootstrap-actual-office-fixture.ts'

it.skipIf(!ACTUAL_OFFICE_ASKED)('verifies an unchanged actual development topology when failure precedes the first supervisor stop', async () => {
  const f = await actualBootstrapOffice(), config = await prepareAndAuthorize(f)
  const failed = await injected(f, config, [{ step: 'stop-original-supervisor', phase: 'before' }]); rememberResult(failed.result)
  expect(failed.result?.state, JSON.stringify(failed.result)).toBe('unchanged'); expect(identity(f.config.topology.supervisor.pid)).toEqual(f.config.topology.supervisor)
  expect((await f.object('/api/runtime')).repository.path).toBe(f.dev)
}, 900000)

