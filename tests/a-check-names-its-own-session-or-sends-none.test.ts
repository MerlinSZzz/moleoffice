// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK NAMES ITS OWN SESSION, OR IT SENDS NO SESSION AT ALL (gap 2, hYSaAc6dw4_Y; problem dbygn38VFgti).
 *
 * The verdict door reads x-mole-office-session as the check's own session. A check run on the host with no --check sent a
 * random id there, which named no session, so the door took a verdict from a check that could not be stopped. Every check
 * that runs a model now needs --check, on the host as in the sandbox, and stops before it asks the office anything. A --dry
 * assembly with no --check sends no session header; its random name is only its worktree folder's.
 *
 * The office here is the fixture's stand-in, and no model runs: the stop cases put a stand-in claude and docker first on
 * PATH, which run nothing and write down that they were started.
 * Mutations: send the random id in the header again, and the --dry case turns red; let a check that runs a model start
 * with no --check, and both stop cases turn red.
 */
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectorFixture } from './inspector-tool-fixture.ts'

const NO_CHECK_NAMED =
  'Say which check this is, with --check <the session record of this check>. A check that runs a model needs it, ' +
  "in the inspector's sandbox and on the host, because the verdict door reads it as the check's own session. " +
  'Only --dry may leave it out. Nothing was assembled and nothing was written.'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
/** The x-mole-office-session header of every request the tool made, in order; undefined where it sent none. */
let sessionsSent: (string | undefined)[]
/** A folder holding a stand-in claude and docker, and the file either writes when it is started. */
let standIns: { bin: string; started: string }
beforeEach(async () => {
  fixture = await inspectorFixture()
  sessionsSent = []
  fixture.state.onRequest = (request) => {
    const header = request.headers['x-mole-office-session']
    sessionsSent.push(typeof header === 'string' ? header : undefined)
  }
  const bin = mkdtempSync(join(tmpdir(), 'no-check-named-'))
  standIns = { bin, started: join(bin, 'started') }
  for (const name of ['claude', 'docker']) {
    writeFileSync(
      join(bin, name),
      `#!/bin/sh\n# A stand-in written by a test. It runs no model and no container.\necho ${name} >> ${JSON.stringify(standIns.started)}\nexit 1\n`,
    )
    chmodSync(join(bin, name), 0o755)
  }
})
afterEach(async () => {
  await fixture.close()
  rmSync(standIns.bin, { recursive: true, force: true })
})

describe('a check names its own session or sends none', () => {
  it.each([
    ['on the host', true],
    ['in the sandbox', { dry: false }],
  ] as const)('stops a check %s that has no --check before it asks the office anything', async (_where, how) => {
    const result = await fixture.inspect([], { PATH: `${standIns.bin}:${process.env['PATH'] ?? ''}` }, how)
    expect(result.code, result.err).toBe(2)
    expect(result.err).toContain(NO_CHECK_NAMED)
    expect(fixture.state.requests).toEqual([])
    expect(existsSync(standIns.started), 'a stand-in claude or docker was started').toBe(false)
  })

  it('sends no session header from a --dry assembly with no --check, on its reads or on its assembled write', async () => {
    const result = await fixture.inspect([])
    expect(result.code, result.err).toBe(0)
    expect(fixture.state.writes.map((one) => one.path)).toContain(`/api/checks/${fixture.run}/assembled`)
    expect(sessionsSent.length).toBe(fixture.state.requests.length)
    expect(sessionsSent.length).toBeGreaterThan(1)
    expect(sessionsSent.filter((one) => one !== undefined)).toEqual([])
  })

  it('sends the session --check names on every request of a --dry assembly', async () => {
    const result = await fixture.inspect(['--check', 'synthCheck01'])
    expect(result.code, result.err).toBe(0)
    expect(sessionsSent.length).toBeGreaterThan(1)
    expect(new Set(sessionsSent)).toEqual(new Set(['synthCheck01']))
  })
})
