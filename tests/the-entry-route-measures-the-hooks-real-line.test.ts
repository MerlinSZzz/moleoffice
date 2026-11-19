// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ENTRY ROUTE MEASURES THE SESSION HOOK'S REAL LINE, BECAUSE IT HANDS THE HOOK A PAYLOAD THAT NAMES A SESSION.
 *
 * Problem VqRbgkaNGw6P, found by the check of run qTAAB0yMKX7h (29 September 2026, 12:15). `tools/how-long-to-the-first-write.mjs
 * --route entry` measures what a new agent reads before its first write, the session hook's printed line first, against
 * the start-cost ceiling. It ran the hook with nothing on stdin. Once the hook writes nothing
 * without a payload naming a session (problem WnVjoGd1bXx8), the route would have measured its one-line "wrote nothing"
 * and reported a start cost far below the real one, with nothing failing.
 *
 * WHAT IS REAL. The tool and the hook are the real ones, run as their own processes against the product's own API on a
 * port of its own, over a throwaway database. No live office is reached.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: the payload taken off the route's hook run, and the case goes red on the hook's
 * read, which the route now refuses to measure.
 */
import { execFile, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { theHookWroteNothing } from '../src/config/the-hook-run-by-hand.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const TOOL = fileURLToPath(new URL('../tools/how-long-to-the-first-write.mjs', import.meta.url))
const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string

beforeEach(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
})

afterEach(async () => {
  await server.app.close()
  t.close()
})

const environment = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_WORKSPACE: 'default', MOLE_HOOK_DETAILS_FOLDER: join(dirname(t.file), 'hook-details') }
  delete env['MOLE_OFFICE_API']
  delete env['TMUX_PANE']
  return env
}

describe('the entry route of the start-cost measure', () => {
  it("measures the hook's own start line, not its line for a run with no payload", async () => {
    // WHAT THE HOOK SAYS WHEN IT IS HANDED NO PAYLOAD: the line the route must never measure as an agent's first read.
    const unhanded = spawnSync(process.execPath, [HOOK, 'start'], { env: { ...environment(), MOLE_OFFICE_API: url }, input: '', encoding: 'utf8' })
    expect(theHookWroteNothing(unhanded.stdout), 'the hook run with no payload did not say it wrote nothing').toBe(true)

    const ran = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      execFile(process.execPath, [TOOL, '--api', url, '--route', 'entry', '--json'], { encoding: 'utf8', env: environment() }, (error, stdout, stderr) => {
        resolve({ code: error === null ? 0 : ((error as { code?: number }).code ?? 1), stdout, stderr })
      })
    })
    expect(ran.code, ran.stderr).toBe(0)
    const reading = JSON.parse(ran.stdout) as { failedAt?: string; said?: string; reads: { request: string; status: number; characters: number }[] }
    expect(reading.failedAt, reading.said).not.toBe('the SessionStart hook')
    const hook = reading.reads[0]
    expect(hook?.request).toBe('the SessionStart hook (tools/session-hook.mjs start)')
    expect(hook?.status).toBe(200)
    // THE REAL START LINE IS THE PROJECT'S STATE, and is longer than the sentence a run by hand gets.
    expect(hook?.characters, 'the route measured the line of a run with no payload').toBeGreaterThan(unhanded.stdout.length)
  })
})
