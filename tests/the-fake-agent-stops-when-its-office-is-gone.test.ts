// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST SUITE'S FAKE AGENT STOPS WAITING WHEN ITS OFFICE IS GONE (problem jgGgPp02B97q, wave 13w round 2).
 *
 * tests/fake-runtime.mjs hangs when it is asked to, so a test can stop a run in flight. It used to hang for ever, and a
 * test that ended without stopping its run left it running for days. Now a hanging run asks its office every few
 * seconds and ends, saying so on standard error, when none has answered for its limit. This file shortens the limit to
 * two seconds with FAKE_RUNTIME_GIVES_UP_AFTER_SECONDS, and stands up a small HTTP server of its own as the office: what
 * is measured is whether the script notices the silence, and any reply counts as an answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · while its office answers, a hanging run keeps waiting past its limit; once the office is gone, it ends within the
 *     limit and a little more, with exit code 1, and says why on standard error.
 *     MUTATION: make hangWhileTheOfficeAnswers in tests/fake-runtime.mjs `setInterval(() => {}, 60_000)` again, as it
 *     was. The run never ends, and this case goes red.
 *     MUTATION: take out `answered = Date.now()` there. The run ends while its office still answers, and this goes red.
 *   · a hanging run whose environment names no office ends within its limit, and says so.
 *     MUTATION: the first one above.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const LIMIT_SECONDS = 2

/** Every process group this file started, by its id, so the teardown stops only those. */
const groups = new Set<number>()

afterAll(() => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Already ended, which is what the tests below want.
    }
  }
})

/** The environment a run is given: this one without Mole Office's settings, and with the office named or not. */
function anEnvironment(api: string | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('MOLE_OFFICE_')) env[key] = value
  if (api !== null) env['MOLE_OFFICE_API'] = api
  env['FAKE_RUNTIME_GIVES_UP_AFTER_SECONDS'] = String(LIMIT_SECONDS)
  return env
}

/** A hanging run in a process group of its own, and what it says on standard error. */
function aHangingRun(api: string | null): { child: ChildProcess; said: () => string; ended: Promise<number | null> } {
  const child = spawn(process.execPath, [FAKE, 'please hang'], { env: anEnvironment(api), detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  if (child.pid === undefined) throw new Error('The fake runtime did not start.')
  groups.add(child.pid)
  let said = ''
  child.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString()))
  const ended = new Promise<number | null>((done) => child.on('exit', (code) => done(code)))
  return { child, said: () => said, ended }
}

/** Whether a promise settles within a time, and its value if it does. */
async function within<T>(ms: number, promise: Promise<T>): Promise<{ settled: true; value: T } | { settled: false }> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<{ settled: false }>((done) => (timer = setTimeout(() => done({ settled: false }), ms)))
  const result = await Promise.race([promise.then((value) => ({ settled: true as const, value })), late])
  clearTimeout(timer)
  return result
}

describe('a hanging fake run', () => {
  it('keeps waiting while its office answers, and ends within its limit once the office is gone', async () => {
    const office: Server = createServer((_req, res) => res.writeHead(204).end())
    await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
    const api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
    const run = aHangingRun(api)

    // Twice the limit, with the office answering: still waiting.
    const early = await within(LIMIT_SECONDS * 2_000, run.ended)
    expect(early.settled, run.said()).toBe(false)

    office.closeAllConnections()
    await new Promise<void>((done) => office.close(() => done()))
    const late = await within(LIMIT_SECONDS * 1_000 + 3_000, run.ended)
    expect(late.settled, 'the run was still waiting after its office had gone').toBe(true)
    expect(late.settled && late.value).toBe(1)
    expect(run.said()).toContain(`the office at ${api} has not answered for ${LIMIT_SECONDS} seconds`)
  }, 20_000)

  it('ends within its limit when no office is named', async () => {
    const run = aHangingRun(null)
    const ended = await within(LIMIT_SECONDS * 1_000 + 3_000, run.ended)
    expect(ended.settled, 'the run was still waiting with no office named').toBe(true)
    expect(run.said()).toContain('no office was named in MOLE_OFFICE_API')
  }, 20_000)
})
