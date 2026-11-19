// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { aFreePortBelowTheEphemeralRange } from './a-free-port-below-the-ephemeral-range.ts'
import { STARTER_FORCE_KILL_MS, STARTER_SHUTDOWN_GRACE_MS, STARTER_WATCH_PERIOD_MS } from '../src/server/lib/starter-watch.mjs'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Allow one additional watch period plus two seconds for scheduling and reaping on a loaded host.
const margin = STARTER_WATCH_PERIOD_MS + 2_000
const bound = STARTER_WATCH_PERIOD_MS + STARTER_FORCE_KILL_MS + margin

function killGroup(pgid: number, signal: NodeJS.Signals) {
  try { process.kill(-pgid, signal) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}
function ended(child: ChildProcess) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}
async function until(test: () => boolean | Promise<boolean>, limit: number, description: string) {
  const deadline = Date.now() + limit
  while (Date.now() < deadline) {
    if (await test()) return
    await sleep(50)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

it.each(['responsive', 'blocked', 'stuck-close'] as const)('ends after its starter dies; %s', async (mode) => {
  expect(STARTER_SHUTDOWN_GRACE_MS).toBeLessThan(STARTER_FORCE_KILL_MS)
  const dir = aTestDatabaseFolder('starter-watch')
  try {
    const livePorts = thePortsATestKeepsOff()
    const apiPort = await aFreePortBelowTheEphemeralRange(livePorts)
    const remotePort = await aFreePortBelowTheEphemeralRange([...livePorts, apiPort])
    const api = `http://127.0.0.1:${apiPort}`
    const trigger = join(dir, 'block')
    const blockedMarker = join(dir, 'blocked')
    const preload = join(dir, 'block.mjs')
    writeFileSync(preload, `import {existsSync,writeFileSync} from 'node:fs';
      import { Server } from 'node:http';
      if (${mode === 'stuck-close'}) {
        const close = Server.prototype.close;
        // Drop close's callback: the port is released but shutdown waits forever.
        Server.prototype.close = function () { return close.call(this); };
      }
      setInterval(() => { if (existsSync(${JSON.stringify(trigger)})) {
        writeFileSync(${JSON.stringify(blockedMarker)}, 'blocked');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      } }, 25).unref();`)
    let starter: ChildProcess | undefined
    let server: ChildProcess | undefined
    let starterEnded: ReturnType<typeof ended> | undefined
    let serverEnded: ReturnType<typeof ended> | undefined
    let result: { code: number | null; signal: NodeJS.Signals | null } | undefined
    let serverExited = false
    let output = ''
    try {
      starter = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
      starterEnded = ended(starter)
      if (starter.pid === undefined) throw new Error('Starter did not spawn')
      server = spawn(process.execPath, ['--import', preload, '--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${starter.pid}`], {
        cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: dir, MOLE_OFFICE_DB: join(dir, 'office.db'), MOLE_OFFICE_PORT: String(apiPort),
          MOLE_OFFICE_REMOTE_PORT: String(remotePort), MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: '127.0.0.2',
          MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_MESSAGE_WORKER: 'off',
          MOLE_OFFICE_PIXEL_OFFICE: 'off', MOLE_OFFICE_AGENT: undefined, MOLE_OFFICE_SESSION: undefined,
          MOLE_AGENT_KEY: undefined, VITEST: undefined, VITEST_WORKER_ID: undefined, NODE_ENV: 'development' },
      })
      serverEnded = ended(server).then((exit) => { serverExited = true; result = exit; return exit })
      if (server.pid === undefined) throw new Error('Server did not spawn')
      server.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
      server.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
      await until(async () => {
        if (serverExited) throw new Error(`Server exited early: ${output}`)
        try { await fetch(`${api}/api/health`); return true } catch (error) {
          if (error instanceof TypeError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ECONNREFUSED') return false
          throw error
        }
      }, 90_000, 'server readiness')
      // Give startup and at least one watch period time to run while the starter remains alive.
      await sleep(STARTER_WATCH_PERIOD_MS * 2)
      expect(serverExited, 'The server stopped while its starter was alive').toBe(false)
      const lock = `${join(dir, 'office.db')}.service.json`
      expect(existsSync(lock)).toBe(true)
      if (mode === 'blocked') {
        writeFileSync(trigger, '')
        await until(() => existsSync(blockedMarker), 5_000, 'main thread block')
        process.kill(server.pid, 'SIGTERM')
        await sleep(500)
        expect(serverExited, 'SIGTERM ended the server before its starter died').toBe(false)
      }
      killGroup(starter.pid, 'SIGKILL')
      await starterEnded
      const began = Date.now()
      await until(() => serverExited, bound, `server exit within ${bound} ms; ${output}`)
      const elapsed = Date.now() - began
      console.log(`starter watch: mode=${mode} elapsed=${elapsed} bound=${bound} result=${JSON.stringify(result)}`)
      if (mode === 'stuck-close') expect(elapsed).toBeGreaterThanOrEqual(STARTER_SHUTDOWN_GRACE_MS - STARTER_WATCH_PERIOD_MS)
      if (mode !== 'blocked') {
        expect(result).toEqual({ code: 0, signal: null })
        expect(existsSync(lock)).toBe(false)
      }
    } finally {
      if (server?.pid !== undefined) killGroup(server.pid, 'SIGKILL')
      if (starter?.pid !== undefined) killGroup(starter.pid, 'SIGKILL')
      if (serverEnded) await serverEnded
      if (starterEnded) await starterEnded
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)
