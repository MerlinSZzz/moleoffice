// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT TOOLS LIST ASKS A PROGRAM ITS VERSION AGAIN ONLY WHEN ITS FILE CHANGES. Wave 13x, round 10.
 *
 * `GET /api/harnesses` ran `<program> --version` for every tool on every read, and `opencode --version` took about
 * 320 ms of each read the Terminals page waited for. src/server/lib/harnesses.ts now keeps a version that was read
 * while the file the PATH finds is the same file, for at most ten minutes. A scratch server process runs with a
 * PATH holding only stand-ins this file writes. Each stand-in adds a line to a file of its own every time it runs,
 * so the test counts the runs. MOLE_OFFICE_HARNESS_REGISTRY points the newest-version reads at the stand-in
 * registry of tests/harness-stand-ins.ts, so nothing reaches the network.
 *
 *   1. Three reads run claude once, and each says the version it printed.
 *   2. A new file written in claude's place is asked at the next read, which says the new version.
 *   3. A program that fails is asked again at every read, and each read says it failed.
 *   0. Before any of these, GET /api/harnesses?part=list asks no program and no registry, and says of each tool
 *      exactly what the whole read says of it but its versions. Wave 13x round 12: the Terminals page draws its
 *      rows from this at once, and fills in the versions from the whole read.
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - src/server/lib/harnesses.ts, theInstalledVersion: `held.file === file &&` removed: case 2 goes red.
 *   - src/server/lib/harnesses.ts, theInstalledVersion: `&& answer.versionWasRead` removed: case 3 goes red.
 *   - src/server/lib/harnesses.ts, theInstalledVersion: the kept answer never returned: cases 1 and 2 go red.
 *   - src/server/api/terminal-harnesses.ts, GET /harnesses: `part=list` answered with the whole read: case 0 goes red.
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aPlace, ask, startAServer, stopEverything, type Place, type ScratchServer } from './terminal-holder-stand.ts'
import { aStandInRegistry, type StandInRegistry } from './harness-stand-ins.ts'

let place: Place
let server: ScratchServer
let registry: StandInRegistry
let standIns: string

interface Reading {
  id: string
  installed: { path: string | null; version: string; versionWasRead: boolean }
}

/** Write a stand-in that adds a line to `<name>.runs` each time it runs, then prints `printed` and ends with `status`. */
function aCountingStandIn(name: string, printed: string, status: number): void {
  const file = join(standIns, name)
  const next = `${file}.new`
  writeFileSync(next, `#!/bin/sh\necho ran >> "${file}.runs"\necho "${printed}"\nexit ${String(status)}\n`)
  chmodSync(next, 0o755)
  // A NEW FILE IN THE OLD ONE'S PLACE, as an installer leaves it.
  renameSync(next, file)
}

/** How many times the stand-in `name` has run. */
function runsOf(name: string): number {
  try {
    return readFileSync(join(standIns, `${name}.runs`), 'utf8').split('\n').filter((line) => line === 'ran').length
  } catch {
    return 0
  }
}

/** One read of the list, as a map from tool id to its installed version. */
async function aRead(): Promise<Record<string, Reading['installed']>> {
  const listed = await ask(server.api, '/api/harnesses')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return Object.fromEntries((listed.body['harnesses'] as Reading[]).map((one) => [one.id, one.installed]))
}

beforeAll(async () => {
  place = aPlace('kept')
  standIns = join(place.dir, 'bin')
  const system = join(place.dir, 'sys')
  mkdirSync(standIns)
  mkdirSync(system)
  // THE FEW SYSTEM PROGRAMS the server reaches for, linked so nothing else on this machine is on the PATH.
  for (const program of ['cat', 'env', 'git', 'getconf']) {
    for (const where of ['/usr/bin', '/bin']) {
      try {
        symlinkSync(join(where, program), join(system, program))
        break
      } catch {
        // Not in this folder; the next one is tried.
      }
    }
  }
  aCountingStandIn('claude', '2.1.200 (Claude Code)', 0)
  aCountingStandIn('codex', 'codex is broken', 1)
  registry = await aStandInRegistry()
  server = await startAServer(place, undefined, { PATH: `${standIns}:${system}`, MOLE_OFFICE_HARNESS_REGISTRY: registry.at })
}, 120_000)

afterAll(async () => {
  await registry.close()
  await stopEverything()
}, 60_000)

describe('the declared list', () => {
  it('0: part=list asks no program and no registry, and says what the whole read says but the versions', async () => {
    const listed = await ask(server.api, '/api/harnesses?part=list')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    // NOTHING WAS ASKED: this is the first read this server has had, so nothing kept could stand in for an ask.
    expect(runsOf('claude')).toBe(0)
    expect(runsOf('codex')).toBe(0)
    expect(registry.asked).toEqual([])
    const whole = await ask(server.api, '/api/harnesses')
    expect(whole.status, JSON.stringify(whole.body)).toBe(200)
    const withoutVersions = (whole.body['harnesses'] as Record<string, unknown>[]).map(({ installed: _i, newest: _n, newer: _w, beingReadAgain: _r, ...rest }) => rest)
    expect(listed.body['harnesses']).toEqual(withoutVersions)
    // The whole read is the one that asks.
    expect(registry.asked.length).toBeGreaterThan(0)
  }, 60_000)
})

describe('the installed version', () => {
  it('1: three reads run the program once, and each says the version it printed', async () => {
    // Case 0's whole read was the first: it ran claude once, and these three are answered from what it kept.
    for (let read = 0; read < 3; read += 1) {
      expect((await aRead())['claude-code']).toMatchObject({ version: '2.1.200 (Claude Code)', versionWasRead: true })
    }
    expect(runsOf('claude')).toBe(1)
  }, 60_000)

  it('2: a new file in the program\'s place is asked at the next read', async () => {
    const before = runsOf('claude')
    aCountingStandIn('claude', '2.1.289 (Claude Code)', 0)
    expect((await aRead())['claude-code']).toMatchObject({ version: '2.1.289 (Claude Code)', versionWasRead: true })
    expect(runsOf('claude')).toBe(before + 1)
    await aRead()
    expect(runsOf('claude')).toBe(before + 1)
  }, 60_000)

  it('3: a program that fails is asked again at every read', async () => {
    const before = runsOf('codex')
    for (let read = 0; read < 2; read += 1) expect((await aRead())['codex']?.versionWasRead).toBe(false)
    expect(runsOf('codex')).toBe(before + 2)
  }, 60_000)
})
