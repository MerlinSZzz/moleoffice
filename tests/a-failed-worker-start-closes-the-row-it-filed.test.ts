// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WORKER THAT DID NOT START DOES NOT LEAVE ITS SESSION ROW SAYING IT IS RUNNING.
 * Wave 13y round 33, item 9.8 (b).
 *
 * The server files the worker's session row before it starts the worker, so that the worker can be told its row. When
 * the start then threw, the server said the worker did not start, in its log and on the runtime page, and left the row
 * reading `running`. The row stayed so until a later start on the same port and checkout replaced it, and the server's
 * own shutdown wrote on it that the worker had stopped, which it never did. Round 32 read this and changed nothing.
 *
 * HOW THE START IS MADE TO FAIL. A real server is started from this checkout with the message worker on, as a person's
 * would be, and the test runner's variables taken out, as tests/a-stop-signal-ends-the-office-in-bounded-time.test.ts
 * does. Before it starts, the test makes a folder where the worker's log file goes, so the start throws when it opens
 * the log, after the row is filed and before any process is started. Nothing is replaced inside the server.
 *
 * WHAT THIS HOLDS:
 *   1. the worker's row says `crashed` while the server runs, and its sentence says the worker did not start and why;
 *   2. the server's own shutdown leaves that row as it is, rather than writing that the worker stopped.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { aFreePortBelowTheEphemeralRange } from './a-free-port-below-the-ephemeral-range.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/**
 * THE SERVER'S PORT, AND THE WORKER'S LOG PATH FOR IT MADE A FOLDER OF THIS TEST'S OWN. The checkout's .logs keeps the
 * logs of servers other tests started, and one of them may have had the same port (problem Tryd3T1O4MQA). The folder is
 * made without `recursive`, so the make fails if anything is at the path already, and then another port is picked. The
 * port is below the ephemeral range, so no other program is handed it before the server starts.
 */
async function aPortAndItsLogPath(): Promise<{ port: number; blocker: string }> {
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  for (let tries = 0; tries < 20; tries++) {
    const port = await aFreePortBelowTheEphemeralRange()
    // THE WORKER'S LOG PATH, as theWorkerLogPath in src/server/lib/worker.ts names it for a server from a checkout.
    const blocker = join(REPO, '.logs', `the-message-worker-${String(port)}.log`)
    try {
      mkdirSync(blocker)
      return { port, blocker }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('Twenty free ports in a row each had a worker log in .logs already, so this test could not make a log path of its own.')
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

/** The message worker's session rows in the office's database, read with a connection of their own. */
function theWorkersRows(database: string): { state: unknown; detail: unknown }[] {
  const db = new Database(database, { readonly: true })
  try {
    return db.prepare(
      "SELECT json_extract(data, '$.state') AS state, json_extract(data, '$.detail') AS detail FROM records " +
        "WHERE kind = 'session' AND title = 'The message worker'",
    ).all() as { state: unknown; detail: unknown }[]
  } finally {
    db.close()
  }
}

it('a worker start that throws after its row is filed leaves the row crashed, saying why, and the shutdown leaves it so', async () => {
  const dir = aTestDatabaseFolder('failed-worker-start')
  const database = join(dir, 'office.db')
  const { port, blocker } = await aPortAndItsLogPath()
  const remotePort = await aFreePortBelowTheEphemeralRange([port])
  let output = ''
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${String(process.pid)}`], {
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
      MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_MESSAGE_WORKER: 'on',
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
  const group = child.pid
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
  let exited = false
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, fail) => {
    child.once('error', fail)
    child.once('exit', (code, signal) => {
      exited = true
      done({ code, signal })
    })
  })
  try {
    expect(group, 'The test server did not start.').toBeDefined()
    const readyBy = Date.now() + 90_000
    const failed = /the message worker could not be started \((.+?)\)\. The API is serving/
    while (!failed.test(output) && !/the message worker is process \d+/.test(output) && !exited && Date.now() < readyBy) await sleep(50)
    const because = failed.exec(output)?.[1]
    expect(because, `The server did not say the worker failed to start.\n${output}`).toMatch(/EISDIR/)

    expect(theWorkersRows(database), 'while the server runs').toEqual([
      { state: 'crashed', detail: `The message worker did not start: ${String(because)}.` },
    ])

    signalGroup(group!, 'SIGTERM')
    expect(await ended, output).toEqual({ code: 0, signal: null })
    expect(output).toContain("The message worker's session row was left as it was")
    expect(theWorkersRows(database), 'after the server stopped').toEqual([
      { state: 'crashed', detail: `The message worker did not start: ${String(because)}.` },
    ])
  } finally {
    if (group !== undefined && !exited) signalGroup(group, 'SIGKILL')
    await ended
    rmdirSync(blocker)
    removeThisTestFolder(dir)
  }
}, 120_000)
