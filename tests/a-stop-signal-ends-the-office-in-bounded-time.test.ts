// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn, execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { beforeAll, expect, it } from 'vitest'
import { SHUTDOWN_LIMIT_MS } from '../src/config/settings.mjs'
import { saysThePortWasTaken, thePersonsKeyHeader } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const LIMIT_MS = 3_000
const MARGIN_MS = 2_000
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

// The same free-port and detached-server pattern as another-machine-reaches-the-same-world.
async function freePort(): Promise<number> {
  const probe = createServer()
  return new Promise((done, fail) => {
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const at = probe.address()
      if (at === null || typeof at === 'string') throw new Error('The port probe has no address.')
      probe.close(() => done(at.port))
    })
  })
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

function groupIsRunning(pgid: number): boolean {
  // A child waiting to be reaped has already stopped; it cannot hold a socket or do more work.
  return execFileSync('ps', ['-eo', 'pgid=,stat='], { encoding: 'utf8' })
    .split('\n').some((line) => {
      const [group, state] = line.trim().split(/\s+/)
      return Number(group) === pgid && state !== undefined && !/^[ZX]/.test(state)
    })
}

beforeAll(() => { expect(SHUTDOWN_LIMIT_MS).toBe(40_000) })

it.each([
  { name: 'stops its worker and writes both session rows', stuck: false },
  { name: 'exits with a failure when a listener never calls back', stuck: true },
])('with streams open on every listener, $name', async ({ stuck }) => {
  const streams: ReadableStreamDefaultReader<Uint8Array>[] = []
  const controllers: AbortController[] = []
  let dir = ''
  let database = ''
  let port = 0
  let remotePort = 0
  let api = ''
  let output = ''
  let workerGroup: number | undefined
  let group: number | undefined
  let exited = false
  let ended: Promise<{ code: number | null; signal: NodeJS.Signals | null }> = Promise.resolve({ code: null, signal: null })
  let current = 0
  // THE PORTS ARE CHOSEN AGAIN WHEN SOMETHING ELSE TOOK ONE (wave 13y round 58). The probe lets go of a port, and the
  // server binds it only after its tsx start, seconds later. In a whole run of the suite on 21 October 2026 something
  // else took the port in that gap, the server refused to start, and this case failed; alone it passed. The ports are
  // this test's own choice and not its subject, so a start that lost one is made again on two new ports, up to three
  // times in all, as liveApp does with `retryWhenAPortWasTaken` in tests/helpers.ts.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      await ended
      rmSync(dir, { recursive: true, force: true })
    }
    current = attempt
    dir = aTestDatabaseFolder('bounded-shutdown')
    database = join(dir, 'office.db')
    port = await freePort()
    remotePort = await freePort()
    while (remotePort === port) remotePort = await freePort()
    api = `http://127.0.0.1:${port}`
    output = ''
    workerGroup = undefined
    exited = false
    // A real listener whose close callback never arrives exercises the whole-shutdown limit.
    const preload = join(dir, 'a-listener-that-never-calls-back.mjs')
    if (stuck) writeFileSync(preload, `
      import { Server } from 'node:http';
      const close = Server.prototype.close;
      Server.prototype.close = function () { return close.call(this); };
    `)
    const child = spawn(process.execPath, [
      ...(stuck ? ['--import', preload] : []),
      '--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${process.pid}`,
    ], {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOME: dir,
        MOLE_OFFICE_DB: database,
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_REMOTE_PORT: String(remotePort),
        MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: '127.0.0.2',
        MOLE_OFFICE_API: api,
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_MESSAGE_WORKER: 'on',
        MOLE_OFFICE_TEST_SHUTDOWN_LIMIT_MS: String(LIMIT_MS),
        MOLE_OFFICE_PIXEL_OFFICE: 'off',
        MOLE_OFFICE_AGENT: undefined,
        MOLE_OFFICE_SESSION: undefined,
        MOLE_AGENT_KEY: undefined,
        VITEST: undefined,
        VITEST_WORKER_ID: undefined,
        LOG_LEVEL: 'info',
        NODE_ENV: 'development',
      },
    })
    group = child.pid
    const readOutput = (chunk: Buffer): void => {
      if (current !== attempt) return
      output += chunk.toString()
      const started = /the message worker is process \d+ in group (\d+)/.exec(output)
      if (started !== null) workerGroup = Number(started[1])
    }
    child.stdout.on('data', readOutput)
    child.stderr.on('data', readOutput)
    ended = new Promise((done, fail) => {
      child.once('error', fail)
      child.once('exit', (code, signal) => {
        exited = true
        done({ code, signal })
      })
    })
    if (group === undefined) break
    const readyBy = Date.now() + 90_000
    while (workerGroup === undefined && !exited && Date.now() < readyBy) await sleep(50)
    if (!(exited && saysThePortWasTaken(output, port))) break
  }
  try {
    expect(group, 'The test server did not start.').toBeDefined()
    expect(workerGroup, output).toBeDefined()
    expect(exited, output).toBe(false)

    // Keep the local, proxy and direct-address streams open until the server ends them. EACH IS THE PERSON'S PAIRED BROWSER,
    // which carries the person's key on every request: since a decision, a request with no key and no name from another
    // machine the office does not trust is refused. This test is about streams that are open, not about
    // who may open one. The key is this office's own, in the key file beside its database.
    const theirKey = thePersonsKeyHeader(join(dir, 'keys.json'))
    for (const address of [api, `http://127.0.0.1:${remotePort}`, `http://127.0.0.2:${port}`]) {
      const controller = new AbortController()
      controllers.push(controller)
      const opening = setTimeout(() => controller.abort(), 10_000)
      try {
        const reply = await fetch(`${address}/api/events`, {
          headers: { 'x-mole-office-workspace': 'default', ...theirKey },
          signal: controller.signal,
        })
        expect(reply.status, await (reply.ok ? Promise.resolve('') : reply.text())).toBe(200)
        expect(reply.headers.get('content-type')).toContain('text/event-stream')
        const reader = reply.body!.getReader()
        streams.push(reader)
        const first = await reader.read()
        expect(first.done).toBe(false)
        expect(new TextDecoder().decode(first.value)).toContain(': open')
      } finally {
        clearTimeout(opening)
      }
    }

    const began = performance.now()
    signalGroup(group!, 'SIGTERM')
    let clock: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
      ended,
      new Promise<null>((done) => { clock = setTimeout(() => done(null), LIMIT_MS + MARGIN_MS) }),
    ])
    clearTimeout(clock)
    const elapsed = Math.round(performance.now() - began)
    console.log(`SIGTERM measurement: ${JSON.stringify({ stuck, elapsedMs: elapsed, limitMs: LIMIT_MS, streams: streams.length, result })}`)
    expect(result, `The server was still running after ${elapsed} ms.\n${output}`).not.toBeNull()
    expect(elapsed).toBeLessThan(LIMIT_MS + MARGIN_MS)
    expect(result, output).toEqual({ code: stuck ? 1 : 0, signal: null })

    const db = new Database(database, { readonly: true })
    try {
      const rows = db.prepare("SELECT title, json_extract(data, '$.state') AS state, json_extract(data, '$.detail') AS detail FROM records WHERE kind = 'session' AND title IN ('The API server', 'The message worker')").all()
      console.log(`Session rows after exit: ${JSON.stringify(rows)}`)
      expect(rows).toHaveLength(2)
      for (const row of rows as { title: string; state: string; detail: string }[]) {
        // The rows are written before the drain is waited for, so a listener that never calls back
        // leaves them finished too. Until round 6f of wave 13x the listeners closed first.
        expect(row.state, row.title).toBe('finished')
        expect(row.detail).toContain('SIGTERM received')
      }
    } finally {
      db.close()
    }
    if (stuck) {
      expect(elapsed).toBeGreaterThanOrEqual(LIMIT_MS)
      expect(output).toContain(`the ${LIMIT_MS} ms limit expired while answering the reads this server had already taken`)
      expect(output).not.toContain('shutdown: finished')
      return
    }
    const workerStoppedBy = Date.now() + MARGIN_MS
    while (groupIsRunning(workerGroup!) && Date.now() < workerStoppedBy) await sleep(50)
    expect(groupIsRunning(workerGroup!), 'The message worker is still running.').toBe(false)
    let previous = -1
    // THE THREE EVENT STREAMS ARE ENDED AT ONCE, and the drain waits for no read (round 6f of wave 13x).
    expect(output).toContain('shutdown: this server takes no new reads, ended the 3 held open on purpose')
    expect(output).toContain('shutdown: every read this server had taken was answered')
    for (const step of ['stopping the message worker', 'writing the session rows', 'answering the reads this server had already taken', 'closing the app', 'closing the database', 'finished']) {
      expect(output, output).toContain(`shutdown: ${step}`)
      const position = output.indexOf(`shutdown: ${step}`)
      expect(position).toBeGreaterThan(previous)
      previous = position
    }
    expect(output).toContain('was asked to stop')
    expect(output).toContain("The API server's session row says it finished")
    expect(output).toContain("The message worker's session row says it finished")
  } finally {
    // Record only groups this test started, including the worker its server reported starting.
    if (workerGroup !== undefined) signalGroup(workerGroup, 'SIGKILL')
    if (group !== undefined && !exited) signalGroup(group, 'SIGKILL')
    await ended
    for (const controller of controllers) controller.abort()
    await Promise.allSettled(streams.map((reader) => reader.cancel()))
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)
