// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL SAYS WHY A REQUEST GOT NO ANSWER. When the office does not answer, Node's fetch says only "fetch
 * failed", and the reason is in the error's cause: a code, such as UND_ERR_SOCKET, and its own words. Until this round
 * the office-keeper (tools/merge-tool/office-keeper.mjs) wrote only the message, so two problems of the queue's suite
 * ended with those two words and no kept log said why. Its `ask` now writes the cause's code and words beside the
 * message, and says so when the error gave no cause at all.
 *
 * The office here is a small HTTP server of this test's own. The causes are read from a fetch of the same server, made
 * by this test, so no cause and no sentence of the tool is copied here.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - `ask` writes only the error's message, as before: case 1 goes red;
 *   - `ask` says nothing when the error gave no cause: case 2 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let office: Server
let answer: (request: IncomingMessage, reply: ServerResponse) => void = (_request, reply) => reply.end('{}')
let at = ''
let scratch = ''
let keeper: typeof import('../tools/merge-tool/office-keeper.mjs')
let failure: typeof import('../tools/merge-tool/log-and-state.mjs').MergerFailure

beforeAll(async () => {
  office = createServer((request, reply) => answer(request, reply))
  await new Promise<void>((ok) => office.listen(0, '127.0.0.1', ok))
  at = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-keeper-no-answer-'))
  const argv = process.argv
  process.argv = [argv[0]!, argv[1]!, '--entry', 'synthetic-entry', '--session', 'synthetic-session', '--workdir', scratch,
    '--api', at, '--office-for', '6']
  try {
    keeper = await import('../tools/merge-tool/office-keeper.mjs')
    failure = (await import('../tools/merge-tool/log-and-state.mjs')).MergerFailure
  } finally {
    process.argv = argv
  }
})

afterAll(async () => {
  office.closeAllConnections()
  await new Promise<void>((ok) => office.close(() => ok()))
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** What a fetch of this test's office throws while the office answers as it does now. */
async function whatAFetchThrows(init: RequestInit): Promise<Error> {
  const thrown = await fetch(`${at}/a-probe`, init).then(() => null, (err: unknown) => err)
  expect(thrown, 'the probe fetch was answered, so it shows no cause').toBeInstanceOf(Error)
  return thrown as Error
}

describe('a request of the merge tool that got no answer', () => {
  it('1: a write whose connection broke says the cause\'s code and words beside "fetch failed"', async () => {
    answer = (request) => {
      request.resume()
      request.on('end', () => request.socket.destroy())
    }
    const probe = await whatAFetchThrows({ method: 'POST', body: '{}' })
    const cause = probe.cause as { code?: unknown, message?: unknown } | undefined
    expect(typeof cause?.code, 'the probe\'s cause carries a code').toBe('string')
    expect(typeof cause?.message, 'the probe\'s cause carries words').toBe('string')

    const ended = await keeper.toolStarted().then(() => null, (err: unknown) => err)
    expect(ended).toBeInstanceOf(failure)
    const said = String((ended as Error).message)
    expect(said).toContain(probe.message)
    expect(said, 'the failure names the cause\'s code').toContain(String(cause?.code))
    expect(said, 'the failure gives the cause\'s own words').toContain(String(cause?.message))
  }, 30_000)

  it('2: a read the office never answered says that its error gave no cause', async () => {
    answer = (request) => { request.resume() }
    const probe = await whatAFetchThrows({ signal: AbortSignal.timeout(300) })
    expect(probe.cause, 'a fetch that ran out of time gives no cause').toBeUndefined()
    const noCause = Reflect.get(keeper, 'NO_CAUSE_GIVEN') as string | undefined
    expect(noCause, 'the office-keeper exports the words it writes for an error with no cause').toBeDefined()

    const ended = await keeper.ask('GET', '/api/health', undefined, { retry: false, until: Date.now() + 500 }).then(() => null, (err: unknown) => err)
    expect(ended).toBeInstanceOf(failure)
    const said = String((ended as Error).message)
    expect(said).toContain(probe.message)
    expect(said, 'the failure says the error gave no cause').toContain(String(noCause))
  }, 30_000)
})
