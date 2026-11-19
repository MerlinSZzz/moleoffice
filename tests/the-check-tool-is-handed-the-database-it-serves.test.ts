// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK TOOL IS HANDED THE DATABASE ITS WORKER SERVES, AND NO OTHER RUN IS.
 *
 * Piece 4 of the keys wave (report 7eQG4ZyWuWCv). The check tool, tools/the-inspector.mjs, finds the
 * office's key beside `MOLE_OFFICE_DB` (`theOfficeKey`, src/config/office-key.mjs). `envFor` used to
 * drop every MOLE_OFFICE_ setting for every run. So a check started by a test world's worker read the
 * key file of the checkout it ran in, sent a key the world did not know, and the world refused its
 * verdict. It was decided that the check tool, which is the office's own process and not an agent, is
 * handed the database its worker serves, as an absolute path. Every other runtime is handed none.
 *
 * What each case guards:
 *   - `envFor` stops handing the database to the check tool      → the first two cases are red.
 *   - `startRun` stops telling `envFor` which runtime it starts   → the third case is red.
 *   - `envFor` hands the database to every runtime               → the fourth case is red.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/config/settings.mjs'
import { envFor, INSPECTION_RUNTIME, type RunRequest } from '../src/worker/runtimes/adapter.ts'
import { FAKE_INSPECTION_TOOL_SETTING, InspectionAdapter } from '../src/worker/runtimes/inspection.ts'
import { MERGE_TOOL_RUNTIME } from '../src/shared/merge-queue.ts'
import { THE_RUNTIMES_THE_OFFICE_DISPATCHES } from '../src/worker/runtimes/index.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const A_RUN: RunRequest = {
  session: 'a-session-id',
  agent: 'checker-x',
  prompt: 'check this run',
  cwd: REPO_ROOT,
  api: 'http://127.0.0.1:41999',
  workspace: 'panelx',
  outputPath: '/tmp/a-run/output.txt',
}

const WORLD_DB = '/tmp/a-test-world/world.db'

const made: string[] = []
afterEach(() => {
  for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('the check tool is handed the database its worker serves', () => {
  it('carries MOLE_OFFICE_DB as the absolute path of the served database', () => {
    const env = envFor(A_RUN, { PATH: '/usr/bin', MOLE_OFFICE_DB: WORLD_DB }, {}, INSPECTION_RUNTIME)
    expect(env['MOLE_OFFICE_DB']).toBe(WORLD_DB)
  })

  it('makes a relative database path absolute against the worker’s own checkout', () => {
    const env = envFor(A_RUN, { MOLE_OFFICE_DB: 'data/a-world.db' }, {}, INSPECTION_RUNTIME)
    expect(env['MOLE_OFFICE_DB']).toBe(resolve(REPO_ROOT, 'data/a-world.db'))
    expect(isAbsolute(env['MOLE_OFFICE_DB']!)).toBe(true)
  })

  it('reaches the program the inspection adapter starts', async () => {
    const folder = aTestDatabaseFolder('check-tool-db')
    made.push(folder)
    const tool = join(folder, 'says-its-db.mjs')
    writeFileSync(tool, "process.stdout.write(`DB<${process.env['MOLE_OFFICE_DB'] ?? 'none'}>`)\n")
    const adapter = new InspectionAdapter(
      { run: 'a-run-id', checkout: REPO_ROOT, model: 'a-model', minutes: 1 },
      { PATH: process.env['PATH'], MOLE_OFFICE_DB: WORLD_DB, [FAKE_INSPECTION_TOOL_SETTING]: tool },
    )
    const handle = adapter.start({ ...A_RUN, outputPath: join(folder, 'output.txt') })
    const deadline = Date.now() + 10_000
    while (adapter.alive(handle) && Date.now() < deadline) await new Promise((go) => setTimeout(go, 25))
    expect(readFileSync(handle.outputPath, 'utf8')).toContain(`DB<${WORLD_DB}>`)
  })
})

describe('every other run is handed no database and no new Mole Office setting', () => {
  it('carries only the Mole Office settings a run had before', () => {
    const from = { PATH: '/usr/bin', MOLE_OFFICE_DB: WORLD_DB, MOLE_OFFICE_PORT: '39017', MOLE_OFFICE_AGENT_MODEL: 'sonnet' }
    for (const runtime of [...THE_RUNTIMES_THE_OFFICE_DISPATCHES, 'fake', MERGE_TOOL_RUNTIME, undefined]) {
      const env = envFor(A_RUN, from, {}, runtime)
      expect(env['MOLE_OFFICE_DB'], `runtime ${String(runtime)}`).toBeUndefined()
      expect(JSON.stringify(env), `runtime ${String(runtime)}`).not.toContain(WORLD_DB)
      const mine = Object.keys(env).filter((key) => key.startsWith('MOLE_OFFICE_')).sort()
      expect(mine, `runtime ${String(runtime)}`).toEqual(['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE'])
    }
  })
})
