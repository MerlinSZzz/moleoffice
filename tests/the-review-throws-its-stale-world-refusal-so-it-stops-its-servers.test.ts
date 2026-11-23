// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW THROWS ITS STALE-WORLD REFUSAL, SO IT STILL STOPS THE TWO SERVERS IT STARTED.
 *
 * WHAT WENT WRONG. tools/review.mjs starts an API server and Vite, each in a process group of its own, and asks the API
 * whether it serves the checkout's code. The question was asked through refuseAStaleWorld in tools/freshness.mjs, which
 * ends the process with process.exit when the answer is stale or nothing answers. process.exit skips the review's
 * `finally`, and that `finally` is the one place that stops the two groups. So after a refusal both servers kept
 * running, holding their ports.
 *
 * WHAT THIS FILE HOLDS.
 *   (a) theWorldIsFreshOrThrow, the review's own question, throws the stale-world refusal and does not end the process,
 *       for a made-up server that answers that its code is older than the checkout.
 *   (b) It throws, and does not end the process, when nothing answers.
 *   (c) It answers with the reply when the made-up server says its code is as new as the checkout.
 *   (d) tools/review.mjs asks through it and no longer calls refuseAStaleWorld. This one is read from the file's text,
 *       because the review's main function starts real servers and is not run here.
 *
 * It fails on main's code, where tools/review.mjs has no theWorldIsFreshOrThrow and calls refuseAStaleWorld.
 *
 * MADE UP. The server that answers is a made-up one in this test, on a free port of this machine. Its replies are made
 * up. No live office is asked and no review is run.
 */
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { theWorldIsFreshOrThrow } from '../tools/review.mjs'

const REVIEW = fileURLToPath(new URL('../tools/review.mjs', import.meta.url))

let server: Server | null = null

afterEach(async () => {
  vi.restoreAllMocks()
  if (server !== null) {
    server.close()
    await once(server, 'close')
  }
  server = null
})

/** A made-up API that answers its freshness door with this reply, and its address. */
async function aMadeUpApi(reply: object): Promise<string> {
  server = createServer((request, response) => {
    if (request.url !== '/api/runtime/freshness') {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

/** process.exit, made to throw instead of ending the test, so a call to it is seen. */
function theExitIsWatched() {
  return vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${String(code)}) was called`)
  })
}

it('(a) throws the stale-world refusal and does not end the process', async () => {
  const exit = theExitIsWatched()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const api = await aMadeUpApi({
    freshness: { verdict: 'older than the checkout', says: 'A made-up server built from an older commit.' },
    startedAt: '2026-11-22 09:00:00',
    world: { standing: { kind: 'made-up' }, repository: '/a/made-up/checkout' },
  })
  await expect(theWorldIsFreshOrThrow(api)).rejects.toThrow(
    'tools/review.mjs did not measure anything, because the world it would have measured is stale.\nThat server is serving older code than the checkout.',
  )
  expect(exit).not.toHaveBeenCalled()
})

it('(b) throws when nothing answers, and does not end the process', async () => {
  const exit = theExitIsWatched()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const api = await aMadeUpApi({})
  server!.close()
  await once(server!, 'close')
  server = null
  await expect(theWorldIsFreshOrThrow(api)).rejects.toThrow(`tools/review.mjs did not measure anything.\nNothing answered at ${api}`)
  expect(exit).not.toHaveBeenCalled()
})

it('(c) answers with the reply when the server serves the checkout\'s code', async () => {
  const exit = theExitIsWatched()
  const reply = { freshness: { verdict: 'as new as the checkout' }, startedAt: '2026-11-22 09:00:00' }
  const api = await aMadeUpApi(reply)
  await expect(theWorldIsFreshOrThrow(api)).resolves.toEqual(reply)
  expect(exit).not.toHaveBeenCalled()
})

it('(d) tools/review.mjs asks through it and no longer calls refuseAStaleWorld', () => {
  const source = readFileSync(REVIEW, 'utf8')
  expect(source, 'tools/review.mjs still calls refuseAStaleWorld, which ends the process before its servers are stopped').not.toMatch(/refuseAStaleWorld\(/)
  expect(source).toMatch(/await theWorldIsFreshOrThrow\(/)
})
