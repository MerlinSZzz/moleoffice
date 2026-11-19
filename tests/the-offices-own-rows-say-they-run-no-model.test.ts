// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 49, ITEM 1: THE OFFICE'S OWN ROWS SAY THEY RUN NO MODEL.
 *
 * Before: the API server and the message worker each file a session row for themselves, and neither carried a usage
 * receipt. The usage sums count every session row, so both were counted as runs whose tokens nobody recorded. Now each
 * row is filed with a receipt in words, from theOwnPartUsageReceipt in src/config/own-rows.mjs: it names the part,
 * says it runs no model, and carries no number. The message worker's words add that a run it starts has its own receipt.
 *
 * The first test starts a real API server on a free port, with a database in a folder it makes, and stops it by its
 * process group. The message worker is not filed under a test runner, so its row is held only through the shared
 * function, in the second and third tests. Each test was proved by a control run, its named mutation red, and the restore.
 *
 * ROUND 50 ADDS THE OFFICE'S OTHER TWO PARTS. The browser app's row and the terminal holder's row get a receipt in words
 * from the same function. The terminal holder's words also say that what runs in its terminals is not counted on its
 * row: its row stands for the holder's own process, and each terminal's program runs in a process group of its own. Where
 * each row is filed with its receipt is held beside the filing: tests/the-browser-app-files-where-its-pages-call.test.ts
 * and tests/a-terminal-outlives-a-server-restart.test.ts.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_API_SERVER, theOwnPartUsageReceipt } from '../src/config/own-rows.mjs'
import { apiServerArguments } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

let dir: string
let child: ChildProcess | null = null

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-own-rows-'))
})

afterEach(() => {
  if (child?.pid !== undefined && child.pid !== null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  child = null
  rmSync(dir, { recursive: true, force: true })
})

function freePort(): Promise<number> {
  return new Promise((ok, bad) => {
    const probe = createServer()
    probe.on('error', bad)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => bad(new Error('the probe socket reported no port')))
        return
      }
      const chosen = address.port
      probe.close(() => ok(chosen))
    })
  })
}

async function waitForHealth(api: string, budget = 90_000): Promise<void> {
  const deadline = Date.now() + budget
  for (;;) {
    try {
      if ((await fetch(`${api}/api/health`)).ok) return
    } catch {
      // Not answering yet.
    }
    if (Date.now() > deadline) throw new Error(`the server never answered ${api}/api/health`)
    await new Promise((go) => setTimeout(go, 300))
  }
}

function startTheApi(port: number, database: string, webPort: number): ChildProcess {
  return spawn(join(REPO, 'node_modules', '.bin', 'tsx'), apiServerArguments(), {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_WEB_PORT: String(webPort),
      MOLE_OFFICE_DB: database,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
      LOG_LEVEL: 'warn',
    },
  })
}

describe("the office's own rows say what they ran", () => {
  // Mutation: take `usageReceipt` out of the API server's createRecord (src/server/index.ts). Red: the row has no receipt.
  it("files the API server's running row with its no-model receipt", async () => {
    const port = await freePort()
    const webPort = await freePort()
    const api = `http://127.0.0.1:${String(port)}`
    child = startTheApi(port, join(dir, 'office.db'), webPort)
    await waitForHealth(api)

    const response = await fetch(`${api}/api/records?kind=session&shape=full`)
    expect(response.ok).toBe(true)
    const body = await response.json() as {
      records: { title: string; data: { state?: string; usageReceipt?: unknown } }[]
    }
    const ownRow = body.records.find((record) => record.title === THE_API_SERVER && record.data.state === 'running')
    expect(ownRow, 'the API server did not file a running session row').toBeDefined()
    expect(ownRow?.data.usageReceipt).toEqual(theOwnPartUsageReceipt(THE_API_SERVER, process.env))
  }, 120_000)


  // Mutation: answer the API server's receipt for any role (src/config/own-rows.mjs). Red: nothing is thrown.
  it("refuses a role outside the office's four parts and names it", () => {
    expect(() => theOwnPartUsageReceipt('A made-up part', process.env)).toThrow('A made-up part')
  })
})
