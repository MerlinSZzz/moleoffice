// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO LEAD TESTS PAUSE THEIR DEV SERVER IN ONE PLACE, AND THE PAUSE DOES WHAT IT SAYS (wave 13y round 59).
 *
 * tests/a-checklist-lead-cannot-reclaim-a-later-page.test.ts and
 * tests/a-cross-project-lead-keeps-its-destination.test.ts each had their own copy of `passOn` and
 * of `theDevServerPausesAfterAnAnswer`, the same but for the name of the headers they sent. A
 * change to one copy could leave the other wrong with nothing failing. Both now come from
 * tests/a-dev-server-paused-after-an-answer.ts.
 *
 * The case runs the shared pause against stand-ins, without a browser. An idle child process
 * stands for the dev server, a small server answers the ledger read as the test's office would,
 * and a route records what it was asked to send.
 */
import { describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { theDevServerPausesAfterAnAnswer } from './a-dev-server-paused-after-an-answer.ts'

/** The state letter /proc gives a process: T while it is stopped, S or R while it runs. */
function stateOf(pid: number): string | undefined {
  const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
  return stat.slice(stat.lastIndexOf(') ') + 2)[0]
}

describe('the pause the two lead tests share', () => {
  it('hands the read on with connection: close, stops the dev server its office recorded, and lets it run again', async () => {
    const devServer = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    const pid = devServer.pid!
    const asked: { url: string | undefined; headers: IncomingHttpHeaders }[] = []
    const office = createServer((req, res) => {
      asked.push({ url: req.url, headers: req.headers })
      res.writeHead(200, { 'content-type': 'application/json' })
      // A port row with the same words is there too, so only a process row may be taken.
      res.end(JSON.stringify({ resources: [
        { type: 'port', key: '5173', detail: 'a dev server because the test asked for one' },
        { type: 'process', key: String(pid), detail: 'a dev server because the test asked for one' },
      ] }))
    })
    await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
    const sent: Record<string, string>[] = []
    const route = {
      request: () => ({ headers: () => ({ accept: 'text/javascript', referer: 'http://127.0.0.1/' }) }),
      fetch: (options: { headers: Record<string, string> }) => {
        sent.push(options.headers)
        return Promise.resolve({})
      },
    } as unknown as Route
    try {
      const api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
      await theDevServerPausesAfterAnAnswer(route, api, { 'x-mole-office-actor-type': 'human' })
      expect(stateOf(pid), 'the dev server is stopped when the pause returns').toBe('T')
      expect(sent, 'the read handed on, with the headers the page sent').toEqual([
        { accept: 'text/javascript', referer: 'http://127.0.0.1/', connection: 'close' },
      ])
      expect(asked.map((one) => [one.url, one.headers['x-mole-office-actor-type']])).toEqual([['/api/resources', 'human']])
      await expect.poll(() => stateOf(pid), { timeout: 15_000, interval: 200 }).not.toBe('T')
    } finally {
      // SIGKILL, because a stopped process holds any other signal until it runs again.
      devServer.kill('SIGKILL')
      await new Promise<void>((done) => office.close(() => { done() }))
    }
  })
})

