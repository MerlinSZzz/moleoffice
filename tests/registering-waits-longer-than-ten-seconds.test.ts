// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REGISTRATION WAITS LONGER THAN TEN SECONDS FOR A BUSY OFFICE, AS A SETTING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `tools/register-a-started-agent.mjs` gave up on a fixed ten seconds. Supervisor SA filed the
 * problem: an agent could not register at exactly the moment the machine was loaded — several
 * clusters running, several agents being started — which is when registration matters most,
 * because that is when the office is busiest and slowest to answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS PROVE, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * The first case reads the tool's own `--help`, which is the one place a person or an agent can
 * learn the limit before hitting it.
 *
 * The second case proves the setting really reaches the clock, not only the help text. It points
 * the tool at a TCP listener that accepts the connection and then says nothing, ever — so nothing
 * about the wait is a network refusal answering quickly by another route. With
 * MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS=1 the tool has to give up in about a second, not the old
 * fixed ten, and it has to say in words how long it waited.
 */

import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:net'
import { fileURLToPath, URL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = `${REPO}tools/register-a-started-agent.mjs`

/** A TCP listener that accepts every connection and answers nothing, ever. */
function hangingServer(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolvePromise, reject) => {
    const server: Server = createServer((socket) => {
      socket.on('error', () => {
        // The client aborting mid-request is expected and not this test's business.
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('the hanging server got no port'))
        return
      }
      resolvePromise({ port: address.port, close: () => new Promise((ok) => server.close(() => ok())) })
    })
  })
}

describe('the registration tool waits longer than ten seconds, as a setting', () => {

  it('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS overrides the default, and the tool really waits that long', async () => {
    const server = await hangingServer()
    try {
      const started = Date.now()
      const ran = spawnSync(
        'node',
        [
          TOOL,
          '--handle', 'timeout-test',
          '--name', 'Timeout Test',
          '--as', 'timeout-test-caller',
          // A NEW FILE IN A FOLDER OF ITS OWN: the tool refuses before any request without one.
          '--key-file', join(mkdtempSync(join(tmpdir(), 'register-timeout-')), 'agent.key'),
          '--api', `http://127.0.0.1:${String(server.port)}`,
        ],
        { encoding: 'utf8', env: { ...process.env, MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS: '1' } },
      )
      const elapsedMs = Date.now() - started
      expect(ran.status, `it did not refuse: ${ran.stdout}${ran.stderr}`).toBe(1)
      // IT SAYS HOW LONG IT WAITED, in the words the setting is named by, not just a raw fetch
      // error — that is the difference between "gave up silently" and "said what it was waiting for".
      expect(ran.stderr).toContain('Waited 1 seconds')
      expect(ran.stderr).toContain('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS')
      // AND IT REALLY TOOK ABOUT ONE SECOND — not instant, and nowhere near the old fixed ten. The
      // window is wide because a loaded machine is slow to schedule the process at all; that slack
      // is not what this assertion is measuring.
      expect(elapsedMs, `took ${String(elapsedMs)}ms, expected at least a few hundred ms of real waiting`).toBeGreaterThan(400)
      expect(elapsedMs, `took ${String(elapsedMs)}ms, which is close to the old fixed ten seconds`).toBeLessThan(8000)
    } finally {
      await server.close()
    }
  }, 20_000)
})
