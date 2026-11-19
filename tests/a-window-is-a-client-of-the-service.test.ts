// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WINDOW IS A CLIENT OF THE SERVICE, NEVER ITS PARENT (criterion W8 of the standalone window;
 * wave 13t's plan hp7Z-IW9JWSX, piece H3).
 *
 * The office is this test's own: `mole-office start` starts it on a database, a home and a port of
 * its own, never the live office's port. Then a real Electron window opens it, and the window files a session of its
 * own and registers itself as a `client` row of the process ledger. While the window is open:
 *   - the service's runtime names its service manager, `mole-office start`, and its parent is not the
 *     window;
 *   - the ledger refuses to record the service's own process as the window's client.
 * Then the window closes and its session ends, and:
 *   - no row of the service is an orphan: they stay under the service's own running session;
 *   - the window's client row is not an orphan either, because the window is gone.
 * At the end the office is stopped with `mole-office stop`, and anything left by the group recorded.
 *
 * It runs only under `node tools/run-named-tests.mjs --list window`, and skips with one sentence
 * otherwise, as every window test does (tests/the-window-display.ts).
 *
 * MUTATIONS:
 *   - the command stops setting MOLE_OFFICE_STARTED_BY: the service manager reads null, red;
 *   - registerResource's client case stops asking what the group serves: the service's own process
 *     is recorded as a client, red.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { executableOf, theProcessAt } from '../src/config/session-process.mjs'
import { keysPathFrom, serviceLockPathFrom } from '../src/config/settings.mjs'
import { TEST_DATABASE_PREFIX, devStackEnvironment, thePersonsKeyHeader, waitForThePage } from './helpers.ts'
import { electronsBinary, whyNoWindowOpensHere } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')

const WHY_NOT = whyNoWindowOpensHere()
if (WHY_NOT !== null) console.log(`a-window-is-a-client-of-the-service: skipped. ${WHY_NOT}`)

/** The office's process groups this file found in a service lock, so `afterAll` can stop each one. */
const groups = new Set<number>()
/** Every Electron this file started: its pid, which Playwright makes the leader of its own group, and its binary. */
const electrons = new Map<number, string>()
const folders = new Set<string>()

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

/** Run the mole-office command in this world, and record the group the lock names. */
function theCommand(what: string, env: NodeJS.ProcessEnv, database: string): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => {
      const lock = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: database }))
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      done({ code, out })
    })
  })
}

const THE_MAIN_PROCESS = `
const { app, BrowserWindow } = require('electron')
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1280, height: 800, show: true })
  window.loadURL(process.env.THE_OFFICE_ADDRESS)
})
`

afterAll(async () => {
  const stillOurs = (pid: number): boolean => {
    const binary = electrons.get(pid)
    const running = executableOf(pid)
    return binary !== undefined && running !== null && running === realpathSync(binary)
  }
  for (const group of [...electrons.keys()].filter(stillOurs)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const running = [...groups].filter((group) => theProcessAt(group).here)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => theProcessAt(group).here) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => theProcessAt(one).here)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 40_000)

describe('a window is a client of the service, never its parent', () => {
  if (WHY_NOT !== null) {
    it.skip(`skipped: ${WHY_NOT}`, () => {})
    return
  }

  it('leaves the service\'s rows owned when the window\'s session ends, and names the service manager', async () => {
    const missing = missingWebBuild(THE_BUILT_PAGE)
    if (missing !== null) throw new Error(`This test starts the office in production, which serves the built page. ${missing}`)
    const binary = electronsBinary()
    if ('missing' in binary) throw new Error(binary.missing)

    // The office: its own folder, database, home and port, started as the service.
    const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}window-client-`)
    folders.add(dir)
    const home = join(dir, 'home')
    mkdirSync(home)
    const database = join(dir, 'office.db')
    const port = await aFreePort()
    const env: NodeJS.ProcessEnv = {
      ...devStackEnvironment(dir, port, await aFreePort(), { database }),
      HOME: home,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
    }
    const started = await theCommand('start', env, database)
    expect(started.code, started.out).toBe(0)
    const lock = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: database }))
    if (lock.state !== 'read') throw new Error(`the service lock did not read: ${JSON.stringify(lock)}`)
    const service = lock.lock

    const office = `http://127.0.0.1:${String(port)}`
    const headers = {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      ...thePersonsKeyHeader(keysPathFrom({ MOLE_OFFICE_DB: database })),
    }

    // The window, in a group of its own.
    const main = join(dir, 'main.cjs')
    writeFileSync(main, THE_MAIN_PROCESS)
    const { _electron } = await import('playwright')
    const electron = await _electron.launch({
      executablePath: binary.path,
      args: ['--no-sandbox', main],
      env: { ...(process.env as Record<string, string>), HOME: home, THE_OFFICE_ADDRESS: `${office}/` },
      timeout: 60_000,
    })
    const windowPid = electron.process().pid
    if (windowPid === undefined) throw new Error('Electron started with no pid')
    electrons.set(windowPid, binary.path)
    let closed = false
    try {
      await waitForThePage(await electron.firstWindow())

      // The window files its own session, and registers its own process as a client of the service.
      const filed = await fetch(`${office}/api/records`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'session', title: 'A window of the office', data: { state: 'running' } }),
      })
      expect(filed.status, await filed.clone().text()).toBe(201)
      const windowSession = ((await filed.json()) as { record: { id: string } }).record.id
      // The window started before the session it files, so it adopts itself in words, and the service's pid
      // is sent the same way, so the refusal met is the client one (decision AOwsOHMVq6Ce).
      const asClient = await fetch(`${office}/api/resources`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionRecordId: windowSession,
          type: 'client',
          key: String(windowPid),
          adopting: 'the window registers itself under the session it filed after it started',
        }),
      })
      expect(asClient.status, await asClient.clone().text()).toBe(201)

      // The service's own process is never recorded as the window's client.
      const theServiceAsAClient = await fetch(`${office}/api/resources`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionRecordId: windowSession,
          type: 'client',
          key: String(service.pid),
          adopting: 'the window asks to take on the service, which it did not start',
        }),
      })
      const refusal = await theServiceAsAClient.text()
      expect(theServiceAsAClient.status, refusal).toBe(400)
      expect(refusal).toContain("A client never owns a server's process group or port")

      // The service names what manages it, and the window is not its parent.
      const runtime = (await (await fetch(`${office}/api/runtime`, { headers })).json()) as {
        supervisor: { serviceManager: string | null; says: string; parent: { pid: number } | null }
      }
      expect(runtime.supervisor.serviceManager).toBe('mole-office start')
      expect(runtime.supervisor.says).toContain('This server runs as the Mole Office service')
      expect(runtime.supervisor.parent?.pid ?? null).not.toBe(windowPid)

      // The window closes, and its session ends.
      await electron.close()
      closed = true
      const ended = await fetch(`${office}/api/records/${windowSession}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ dataPatch: { state: 'finished' } }),
      })
      expect(ended.status, await ended.clone().text()).toBe(200)

      // No row is an orphan: the service's stay with its own running session, and the window is gone.
      const orphans = (await (await fetch(`${office}/api/resources/orphans`, { headers })).json()) as { orphans: { key: string; type: string }[] }
      expect(orphans.orphans, JSON.stringify(orphans.orphans)).toEqual([])
      // The service filed its own process at its start; that row is still live, and it is the service's.
      const rows = (await (await fetch(`${office}/api/resources`, { headers })).json()) as { resources: { key: string; type: string; sessionRecordId: string }[] }
      const servicesProcess = rows.resources.find((one) => one.type === 'process' && one.key === String(service.pid))
      expect(servicesProcess, JSON.stringify(rows.resources)).toBeDefined()
      expect(servicesProcess?.sessionRecordId).not.toBe(windowSession)
    } finally {
      if (!closed) await electron.close()
    }

    const stopped = await theCommand('stop', env, database)
    expect(stopped.code, stopped.out).toBe(0)
  }, 240_000)
})
