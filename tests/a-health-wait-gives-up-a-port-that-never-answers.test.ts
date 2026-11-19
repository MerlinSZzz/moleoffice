// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST'S SERVER LOST ITS PORT TO SOMETHING THAT TOOK THE CONNECTION AND NEVER ANSWERED, AND THE WAIT
 * FOR IT SAYS SO IN SECONDS, NOT AFTER FIVE MINUTES.
 *
 * On 2 November 2026, in the merge queue's pair suite at a high load, a browser test file waited for
 * its API server's `/api/health` for 285 s and then gave up its hook, with no line from the server.
 * The wait polls every 200 ms and has its own 90 s deadline, so one request was held for at least
 * 195 s: something had taken the connection and never answered it. Node's fetch waits 300 s for an
 * answer's headers. A port this helper reserves is held by a server that takes connections and never
 * answers them, and another test file reserved its ports 26 ms after this one let its own go.
 *
 * The case puts such a server on a port, and a child that tries to listen there a second later and
 * fails as the test's server fails. The wait must end as a taken port, with the child's own words.
 */
import { spawn } from 'node:child_process'
import { createServer, type Socket } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { readyOrSayThePortWentElsewhere, ThePortWasTaken } from './helpers.ts'

/** A child that tries to listen on the port in its first argument after a second, and fails if it is taken. */
const LISTENS_A_SECOND_LATER = "setTimeout(() => require('node:net').createServer().listen(Number(process.argv[1]), '127.0.0.1'), 1000)"

describe('the wait for a test server whose port went to something that never answers', () => {
  it('ends as a taken port within 20 s, with what the server said', async () => {
    const taken: Socket[] = []
    const silent = createServer((socket) => { taken.push(socket) })
    await new Promise<void>((done) => silent.listen(0, '127.0.0.1', done))
    const address = silent.address()
    if (address === null || typeof address === 'string') throw new Error('The silent server has no port.')
    const port = address.port
    // No office variable is passed: the child only listens.
    const child = spawn(process.execPath, ['-e', LISTENS_A_SECOND_LATER, String(port)], { env: {}, stdio: ['ignore', 'pipe', 'pipe'] })
    const service = { label: 'a server that loses its port', child, log: [] as string[], stopping: false, deathReported: false }
    const keep = (chunk: unknown): void => { for (const line of String(chunk).split('\n')) if (line.trim() !== '') service.log.push(line) }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const waited = readyOrSayThePortWentElsewhere(service, `http://127.0.0.1:${String(port)}/api/health`, port, true)
      .then(() => 'the wait took an answer', (err: unknown) => err)
    try {
      // 20 S IS THE WAIT'S OWN LIMIT FOR ONE REQUEST, 5 S, TWICE, AND ROOM FOR A CHILD THAT STARTS SLOWLY UNDER LOAD.
      const ended = await Promise.race([waited, sleep(20_000).then(() => 'still waiting after 20 s')])
      expect(taken.length, 'the wait never reached the silent server').toBeGreaterThan(0)
      expect(ended).toBeInstanceOf(ThePortWasTaken)
      const lost = ended as ThePortWasTaken
      expect(lost.port).toBe(port)
      expect(lost.ours).toBe(true)
      // What the server said, in Node's own words, and not the helper's sentence around them.
      expect(lost.said).toContain(service.label)
      expect(lost.said).toContain(`EADDRINUSE: address already in use 127.0.0.1:${String(port)}`)
    } finally {
      for (const socket of taken) socket.destroy()
      await new Promise<void>((done) => silent.close(() => { done() }))
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await waited
    }
  })
})
