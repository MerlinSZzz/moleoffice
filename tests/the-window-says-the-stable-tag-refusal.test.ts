// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW SAYS THE STABLE-TAG REFUSAL IN THE SENTENCE THE OWNER READS (the supervisor's addition to round 12, on an agent's ask).
 *
 * serve-dev keeps the office's port with its stand-in after a refused start (tools/serve-dev.mjs, and
 * the header in src/config/stand-in-header.mjs). When that start was refused because the copy the
 * office runs from is not at a dated stable tag, serve-dev passes `--refusal=THE_STABLE_TAG_REFUSAL`
 * (src/config/stable-tag.mjs) to the stand-in, whose 503 body then carries `refusal`
 * (tools/serve-dev-stand-in.mjs). whoIsAt keeps it on its not-answering answer, the self-check
 * carries it into the answer, and the window says the owner sentence with one press: Check again.
 *
 * The stand-ins here are the real tools/serve-dev-stand-in.mjs, each started on a port this file
 * holds and stopped again. No office is started and no page is opened.
 *
 * MUTATIONS, in src/config/world-address.mjs:
 *   - whoIsAt stops carrying the stand-in's refusal: the answer cases go red.
 * MUTATIONS, in src/config/the-self-check.mjs:
 *   - whatTheWindowSays gives the plain not-answering line for the refusal: the sentence cases go red;
 *   - the refusal is compared with the wrong constant: the sentence cases go red;
 *   - the Developer mode detail drops the label before the put-back steps: the label case goes red.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { THE_STABLE_TAG_REFUSAL } from '../src/config/stable-tag.mjs'
import { whatAnswersForThisOffice } from '../src/config/the-self-check.mjs'
import { whoIsAt } from '../src/config/world-address.mjs'
import { holdThePort } from '../tools/serve-dev.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_STAND_IN = join(REPO, 'tools', 'serve-dev-stand-in.mjs')


const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

/** Every stand-in this file started, with what stops each one. */
const running: { stop: () => void }[] = []

afterEach(() => {
  for (const one of running.splice(0)) one.stop()
})

/**
 * THE REAL STAND-IN, on a port this file holds, carrying `refusal` when one is given, exactly as
 * serve-dev starts it. Its reply to anything is 503 with the stand-in header and its own body.
 */
async function aStandIn(refusal: string | null, reason = 'a test holds the port'): Promise<string> {
  const port = await aFreePort()
  const held = holdThePort(port)
  const args = [THE_STAND_IN, `--supervisor-pid=${String(process.pid)}`, `--reason=${reason}`]
  if (refusal !== null) args.push(`--refusal=${refusal}`)
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe', held as never] })
  let said = ''
  child.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString()))
  running.push({
    stop: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      held.close()
    },
  })
  const deadline = Date.now() + 20_000
  while (!said.includes('listening') && Date.now() < deadline) await sleep(25)
  if (!said.includes('listening')) throw new Error(`the stand-in did not listen in 20 seconds: ${said}`)
  return `http://127.0.0.1:${String(port)}`
}

describe('the stand-in refusal reaches the window', () => {
  it('whoIsAt carries the refusal the stand-in names', async () => {
    const address = await aStandIn(THE_STABLE_TAG_REFUSAL)
    const found = await whoIsAt(address, { asks: 1, waitMs: 2_000 })
    expect(found.answering).toBe(false)
    if (found.answering) return
    expect(found.failure).toBe('unreadable')
    expect(found.refusal).toBe(THE_STABLE_TAG_REFUSAL)
  })

  it('the self-check answers not-answering with the refusal', async () => {
    const address = await aStandIn(THE_STABLE_TAG_REFUSAL)
    const found = await whatAnswersForThisOffice({ address, asks: 1, waitMs: 2_000 })
    expect(found.answer).toBe('not-answering')
    if (found.answer !== 'not-answering') return
    expect(found.refusal).toBe(THE_STABLE_TAG_REFUSAL)
  })


})
