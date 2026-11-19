// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW LONG A SERVER HAS BEEN RUNNING OLD CODE IS COUNTED FROM WHEN IT WENT OLD.
 *
 * Eight edits one second apart run against two real servers in a temporary copy of the code.
 * One server cannot reload; its stale count must keep rising across saves and pass its one-second
 * grace. The watching server must reload and become healthy. No file in this checkout is touched.
 */

import { apiServerArguments, commandThatStopsWithItsOwner } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, rmSync, symlinkSync, utimesSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { formatFreshnessHeader, parseFreshnessHeader } from '../src/config/freshness-header.mjs'
import { forgetTheWorldOnThisPage, howOldTheServerSaysItIs, worldTrouble } from '../src/web/lib/world.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { namedWaits } from './a-start-names-its-wait.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** One second, so eight edits cross it early and stay across it. */
const GRACE = 1

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** A port the operating system picks and nothing else is holding. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => { reject(new Error('the probe socket reported no port')) })
        return
      }
      const { port } = address
      probe.close(() => { resolve(port) })
    })
  })
}

interface Reading {
  ok: boolean
  wrong?: string[]
  code: { verdict: string; staleFor: number | null; grace: number }
}

/** One health reading and the freshness header that came with it, or null while it is restarting. */
async function health(api: string): Promise<{ reading: Reading; header: string } | null> {
  try {
    const answered = await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
    const header = answered.headers.get('x-mole-office-freshness') ?? ''
    return { reading: (await answered.json()) as Reading, header }
  } catch {
    return null
  }
}

/** Wait until a server answers at all, or say how long it was given. */
async function untilItAnswers(api: string, what: string, within = 90_000): Promise<Reading> {
  // A WAIT OF 30 SECONDS IS NAMED IN THE LOG. tests/a-start-names-its-wait.ts.
  const waits = namedWaits(`the start of ${what}`)
  waits.wait(`its first answer at ${api}/api/health`)
  const stop = Date.now() + within
  try {
    while (Date.now() < stop) {
      const now = await health(api)
      if (now !== null) return now.reading
      await sleep(250)
    }
  } finally {
    waits.done()
  }
  throw new Error(`${what} never answered ${api}/api/health within ${String(within / 1000)}s.`)
}

let dir = ''
let server: ChildProcess | null = null
let watching: ChildProcess | null = null
let api = ''
let watchingApi = ''
/** The last reading the server that cannot reload gave, at each one-second step. */
const steps: { second: number; ok: boolean; verdict: string; staleFor: number | null; header: string }[] = []

/** Start one server from the copy, as its own process group so one signal stops all of it. */
function start(port: number, name: string, watch: boolean): ChildProcess {
  const watched = commandThatStopsWithItsOwner(join(REPO, 'node_modules/.bin/tsx'), watch ? apiServerArguments(['watch']) : apiServerArguments())
  return spawn(watched.command, watched.args, {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, `${name}.db`),
      MOLE_OFFICE_STALE_CODE_GRACE: String(GRACE),
      LOG_LEVEL: 'warn',
      // Not under a test runner as far as the child is concerned: it is a real server, and these
      // would make src/server/db/client.ts refuse a database nobody named.
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
    } as NodeJS.ProcessEnv,
  })
}

function stop(child: ChildProcess | null): void {
  if (child?.pid === undefined || child.pid === null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    // Already gone, which is the outcome that was wanted.
  }
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('staleness')
  // What a server needs and nothing else: its code, its migrations, and the two files that say how
  // to load them. node_modules is linked rather than copied — it is the same tree either way.
  // src/config holds roles.json (copied with src), which the server reads before it serves and refuses to start
  // without (P3, P4): a copy of the program without it is not a program that starts.
  for (const part of ['src', 'drizzle', 'package.json', 'tsconfig.json', 'tools/check-worktrees.mjs', 'tools/live-processes.mjs']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))

  const [onePort, otherPort] = [await freePort(), await freePort()]
  api = `http://127.0.0.1:${String(onePort)}`
  watchingApi = `http://127.0.0.1:${String(otherPort)}`
  server = start(onePort, 'no-watch', false)
  watching = start(otherPort, 'watching', true)
  await untilItAnswers(api, 'the server that cannot reload')
  await untilItAnswers(watchingApi, 'the watching server')

  /**
   * EIGHT SECONDS OF EDITING, ONE SECOND APART. Nothing is written: `utimes` moves a modification
   * time and leaves the bytes alone, which is the whole of what the freshness reading looks at.
   */
  const edited = join(dir, 'src/shared/time.ts')
  for (let step = 1; step <= 8; step += 1) {
    const now = new Date()
    utimesSync(edited, now, now)
    await sleep(1_000)
    const reading = await health(api)
    if (reading !== null) {
      steps.push({
        second: step,
        ok: reading.reading.ok,
        verdict: reading.reading.code.verdict,
        staleFor: reading.reading.code.staleFor,
        header: reading.header,
      })
    }
  }
}, 240_000)

afterAll(async () => {
  stop(server)
  stop(watching)
  await sleep(500)
  rmSync(dir, { recursive: true, force: true })
  forgetTheWorldOnThisPage()
})

describe('a server that never reloaded says so, however recently a file changed', () => {
  it('says it has been stale for the whole run, not for the seconds since the last save', () => {
    expect(steps.length, 'the server answered no health check at all during the run').toBeGreaterThan(6)
    const last = steps[steps.length - 1]
    expect(last?.verdict).toBe('stale')
    /**
     * THE WHOLE OF THE FIX. A file changed one second before this reading, and the count is more than six
     * seconds: it runs from when the server was first found behind, not from the newest
     * file. The old count would read a handful of seconds here, whatever the run had been.
     */
    expect(last?.staleFor ?? 0).toBeGreaterThan(6)
    // AND IT NEVER WENT BACKWARDS. A clock that restarted on a save would show it here.
    const counts = steps.map((one) => one.staleFor ?? -1)
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i], `the count fell from ${String(counts[i - 1])} to ${String(counts[i])}`).toBeGreaterThanOrEqual(
        counts[i - 1] as number,
      )
    }
  })

  it('answers ok false, and says what to do, once it has been stale for longer than the grace', () => {
    const shouting = steps.filter((one) => !one.ok)
    expect(shouting.length, 'the health check never went red in eight seconds of stale code').toBeGreaterThan(4)
    // The grace is honoured at the start: the first reading is inside it, so it is not red.
    expect(steps[0]?.staleFor ?? 99).toBeLessThanOrEqual(GRACE)
    expect(steps[0]?.ok).toBe(true)
  })

  it('gives the page a banner about it, off the header on the same reply', () => {
    forgetTheWorldOnThisPage()
    const last = steps[steps.length - 1]
    const read = parseFreshnessHeader(last?.header ?? '')
    expect(read.ok, `the reply carried no readable freshness header: ${last?.header ?? ''}`).toBe(true)
    // THE PAGE'S OWN MODULE, fed the real header from the real reply. What it makes of it is the
    // banner, and this is the row it puts in it.
    howOldTheServerSaysItIs(last?.header ?? '')
    const trouble = worldTrouble()
    expect(trouble.map((one) => one.what)).toContain('the code the server is running')
    const row = trouble.find((one) => one.what === 'the code the server is running')
    expect(row?.onTheServer).toContain('running code older than the checkout')
    expect(row?.doThis).toContain('Restart it')
  })

  it('and the same page draws nothing when the server says it is fresh, which is the control', () => {
    forgetTheWorldOnThisPage()
    howOldTheServerSaysItIs(formatFreshnessHeader({ verdict: 'fresh', staleFor: null, grace: GRACE }))
    expect(worldTrouble()).toEqual([])
  })
})

/**
 * THE CONTROL: THE SAME EDITS, ON A SERVER THAT WATCHES THE TREE.
 *
 * It reloads on every one of them, so it is never behind for longer than a restart takes. If this
 * one shouted too, the case above would be a test of editing rather than of staleness.
 */
describe('the same edits against a watching server say nothing at all', () => {
  it('is as new as the checkout, and healthy, once its last reload has landed', async () => {
    const stop = Date.now() + 90_000
    let last: Reading | null = null
    while (Date.now() < stop) {
      const now = await health(watchingApi)
      if (now !== null && now.reading.code.verdict === 'fresh') {
        last = now.reading
        break
      }
      await sleep(500)
    }
    expect(last, 'the watching server never reported itself as new as the checkout').not.toBeNull()
    expect(last?.code.verdict).toBe('fresh')
    expect(last?.code.staleFor).toBeNull()
    // A scratch stack on its own port with its own database is healthy, and this proves the health
    // check is not simply red for everything this test starts.
    expect(last?.ok).toBe(true)
  }, 120_000)
})
