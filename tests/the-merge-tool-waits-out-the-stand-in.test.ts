// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL WAITS OUT THE STAND-IN, AND DOES NOT SEND A WRITE TWICE (wave 13x, round 8). The merge tool's
 * office-keeper (tools/merge-tool/office-keeper.mjs) talks to the office across the restarts every landing causes. The
 * dev supervisor's stand-in answers during each of them with a 503 that says nothing was read or written, so a write
 * it answered is sent again. A write whose connection broke after it went out may have been written, so it is not
 * sent again: the tool fails and says why. Until this round it sent every write again whatever went wrong.
 *
 * The office here is a small HTTP server of this test's own. It answers as the stand-in does, with STAND_IN_HEADER,
 * and it counts every request.
 *
 * MUTATION PROOF, 9 October 2026 (logs named in the report of the run that added this file), each alone after a
 * green control:
 *   - the office-keeper's `ask` treats the stand-in's 503 as an answer: case 1 goes red;
 *   - it sends a write again whatever went wrong, as before this round: case 2 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'

let office: Server
let answer: (request: IncomingMessage, reply: ServerResponse) => void = (_request, reply) => reply.end('{}')
const posts: string[] = []
let scratch = ''
let keeper: typeof import('../tools/merge-tool/office-keeper.mjs')
let failure: typeof import('../tools/merge-tool/log-and-state.mjs').MergerFailure
let theLog = ''

beforeAll(async () => {
  office = createServer((request, reply) => {
    if (request.method === 'POST') posts.push(request.url ?? '')
    answer(request, reply)
  })
  await new Promise<void>((ok) => office.listen(0, '127.0.0.1', ok))
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-keeper-stand-in-'))
  const argv = process.argv
  process.argv = [argv[0]!, argv[1]!, '--entry', 'synthetic-entry', '--session', 'synthetic-session', '--workdir', scratch,
    '--api', `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`, '--office-for', '6']
  try {
    keeper = await import('../tools/merge-tool/office-keeper.mjs')
    const state = await import('../tools/merge-tool/log-and-state.mjs')
    failure = state.MergerFailure
    theLog = (await import('../tools/merge-tool/arguments.mjs')).LOG
  } finally {
    process.argv = argv
  }
})

afterAll(async () => {
  await new Promise<void>((ok) => office.close(() => ok()))
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe("the office-keeper's writes across a restart", () => {
  it("1: sends a write again after the stand-in's 503, and it is written once", async () => {
    posts.length = 0
    let standInFor = 1
    answer = (request, reply) => {
      request.resume()
      if (request.method === 'POST' && standInFor > 0) {
        standInFor -= 1
        reply.writeHead(503, { 'content-type': 'application/json', 'retry-after': '5', [STAND_IN_HEADER]: '1' })
        reply.end(JSON.stringify({ error: 'A synthetic stand-in: no server is answering. Nothing was read or written.' }))
        return
      }
      reply.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    }
    await keeper.toolStarted()
    expect(posts).toEqual(['/api/merge-queue/synthetic-entry/tool-started', '/api/merge-queue/synthetic-entry/tool-started'])
    expect(readFileSync(theLog, 'utf8')).toContain('the dev supervisor answered POST /api/merge-queue/synthetic-entry/tool-started for the office')
  }, 30_000)

  it('2: does not send a write again when its connection broke after it went out', async () => {
    posts.length = 0
    answer = (request) => {
      request.resume()
      request.on('end', () => request.socket.destroy())
    }
    const started = Date.now()
    const ended = await keeper.toolStarted().then(() => null, (err: unknown) => err)
    expect(ended).toBeInstanceOf(failure)
    expect(String((ended as Error).message)).toContain('The request may have reached it and been written, so it was not asked again.')
    expect(posts, 'a write that may have been written was sent again').toHaveLength(1)
    expect(Date.now() - started).toBeLessThan(5_000)
  }, 30_000)
})
