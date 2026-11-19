// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A real service stop ends its terminal holder too, by the process group the office's ledger recorded for it, and says
 * so in one sentence. A restart keeps the holder and its terminals. Releasing the holder's own row stops it too.
 * The upgrade's stop list keeps the holder, and tests/the-upgrade-reads-a-worker-started-through-tsx.test.ts shows that.
 * Startup explanations use the command's holder seam without three additional API servers.
 * Every service or holder group named by the real command is recorded for cleanup.
 *
 * ONLY A MADE-UP OFFICE: a database, a socket and holders in a folder this test made. The command finds the holder by
 * the socket of that database, and checks that the holder names it, so no other holder is asked to stop.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { A_RESTART_KEEPS_THE_HOLDER, NO_HOLDER_RUNS, startTheHolder, theHolderWasStoppedWords } from '../src/config/the-service-command.mjs'
import { theTerminalHolderLog } from '../src/config/the-terminal-holder.mjs'
import { THE_TERMINAL_HOLDER } from '../src/config/own-rows.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { askTheHolder } from '../src/config/the-terminal-holder.mjs'
import {
  REPO,
  aFreePort,
  aPlace,
  aServerEnvironment,
  ask,
  groups,
  isAlive,
  openThroughTheHolder,
  stopEverything,
  until,
  type Place,
} from './terminal-holder-stand.ts'

const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')

afterAll(stopEverything, 60_000)

interface World {
  place: Place
  api: string
  env: NodeJS.ProcessEnv
  lockPath: string
}

async function aWorld(name: string, holder: 'on' | 'off'): Promise<World> {
  const place = aPlace(name)
  const port = await aFreePort()
  const env: NodeJS.ProcessEnv = {
    ...(await aServerEnvironment(place, port)),
    MOLE_OFFICE_TERMINAL_HOLDER: holder,
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
  }
  return { place, api: `http://127.0.0.1:${String(port)}`, env, lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: place.database }) }
}

/** The holder's pid in what `start` printed, recorded at once as a group to stop. */
function theHolderNamedIn(out: string): number | null {
  const found = /The terminal holder is process (\d+), in process group (\d+)\./.exec(out)
  if (found === null) return null
  groups.add(Number(found[2]))
  return Number(found[1])
}

/** Run the command to its end. The server group its lock names is recorded before anything is asserted. */
function theCommand(world: World, what: string): Promise<{ code: number | null; out: string }> {
  const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env: world.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 150_000)
  return new Promise((done) => {
    child.on('close', (code) => {
      clearTimeout(timer)
      const lock = readTheServiceLock(world.lockPath)
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      theHolderNamedIn(out)
      done({ code, out })
    })
  })
}

interface SessionRow {
  id: string
  title: string
  data: { state?: string; extra?: { discovered?: { pid?: number } } }
}

async function theHolderRows(api: string): Promise<SessionRow[]> {
  const read = await ask(api, '/api/records?kind=session&shape=full')
  return ((read.body['records'] ?? []) as SessionRow[]).filter((row) => row.title === THE_TERMINAL_HOLDER)
}

describe('the service command and the terminal holder', () => {
  it('1: start starts the holder, restart keeps it, stop ends it by its recorded group, and the release door ends the next', async () => {
    const world = await aWorld('svc-on', 'on')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const pid = theHolderNamedIn(started.out)
    expect(pid, started.out).not.toBeNull()
    const holderPid = pid as number
    expect(started.out).toContain(`The terminal holder is process ${String(holderPid)}, in process group ${String(holderPid)}.`)
    const hello = await askTheHolder(world.place.socket, { op: 'hello' })
    expect(hello['pid']).toBe(holderPid)
    expect(hello['database']).toBe(world.place.database)

    // THE SERVER RECORDS IT: a running session record titled as the holder, with its pid.
    const rows = await until(() => theHolderRows(world.api), (all) => all.some((row) => row.data.state === 'running'), 20_000)
    const running = rows.filter((row) => row.data.state === 'running')
    expect(running.length, JSON.stringify(rows)).toBe(1)
    expect(running[0]?.data.extra?.discovered?.pid).toBe(holderPid)

    // A RESTART KEEPS IT, AND ITS TERMINAL: the restart press restarts the server alone.
    const terminal = await openThroughTheHolder(world.place)
    const restarted = await theCommand(world, 'restart')
    expect(restarted.code, restarted.out).toBe(0)
    expect(restarted.out).toContain(A_RESTART_KEEPS_THE_HOLDER)
    expect(restarted.out).toContain(`The terminal holder is already running: process ${String(holderPid)}.`)
    expect((await askTheHolder(world.place.socket, { op: 'hello' }))['pid']).toBe(holderPid)
    expect(isAlive(terminal.pid), 'the restart ended the terminal').toBe(true)

    // STOP ENDS IT TOO, by the group the ledger recorded, and says so in one sentence. Its terminal was told to end.
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
    expect(stopped.out).toContain(theHolderWasStoppedWords(holderPid, holderPid))
    expect(await until(() => isAlive(holderPid), (alive) => !alive, 5_000), 'the holder still runs after the stop').toBe(false)
    expect(await until(() => isAlive(terminal.pid), (alive) => !alive, 10_000), "the holder's terminal still runs after the stop").toBe(false)
    expect(existsSync(world.place.socket), "the holder's socket is still there").toBe(false)

    // START AGAIN STARTS ANOTHER, and the office's row for the one that was stopped no longer says running.
    const again = await theCommand(world, 'start')
    expect(again.code, again.out).toBe(0)
    const next = theHolderNamedIn(again.out)
    expect(next, again.out).not.toBeNull()
    expect(next).not.toBe(holderPid)
    const nextPid = next as number
    const now = await until(
      () => theHolderRows(world.api),
      (all) => all.some((row) => row.data.state === 'running' && row.data.extra?.discovered?.pid === nextPid),
      20_000,
    )
    expect(now.filter((row) => row.data.state === 'running').map((row) => row.data.extra?.discovered?.pid), JSON.stringify(now)).toEqual([nextPid])

    // THE LEDGER'S RELEASE DOOR STOPS IT. The holder's session still says running, so the release is
    // forced, and it is confirmed with the sentence the door gives.
    const resources = await ask(world.api, '/api/resources')
    const row = ((resources.body['resources'] ?? []) as { id: string; type: string; key: string }[]).find(
      (one) => one.type === 'process' && one.key === String(nextPid),
    )
    expect(row, JSON.stringify(resources.body).slice(0, 800)).toBeDefined()
    const asked = await ask(world.api, `/api/resources/${row!.id}/release`, { method: 'POST', body: { force: true } })
    expect(asked.status, JSON.stringify(asked.body)).toBe(400)
    const sentence = /"([^"]+)"\s*$/.exec(String(asked.body['error']))?.[1]
    expect(sentence, String(asked.body['error'])).toBeDefined()
    const released = await ask(world.api, `/api/resources/${row!.id}/release`, { method: 'POST', body: { force: true, expect: sentence } })
    expect(released.status, JSON.stringify(released.body)).toBe(200)
    expect(await until(() => isAlive(nextPid), (alive) => !alive, 10_000), 'the holder still runs after its release').toBe(false)
    expect(await until(() => existsSync(world.place.socket), (there) => !there, 5_000), "the holder's socket is still there").toBe(false)

    // THE LAST STOP FINDS NO HOLDER, and says so.
    const last = await theCommand(world, 'stop')
    expect(last.code, last.out).toBe(0)
    expect(last.out).toContain(NO_HOLDER_RUNS)
  }, 300_000)

  it.each(['off', 'unwritable folder', 'early exit'] as const)('holder startup explains %s without an API server', async mode => {
    const world = await aWorld('svc-seam', mode === 'off' ? 'off' : 'on')
    if (mode === 'unwritable folder') {
      const file = join(world.place.dir, 'a-file')
      writeFileSync(file, 'not a folder\n')
      world.env['XDG_CONFIG_HOME'] = file
    } else if (mode === 'early exit') {
      const config = join(world.place.dir, 'x'.repeat(120))
      mkdirSync(config)
      world.env['XDG_CONFIG_HOME'] = config
    }
    for (const name of ['MOLE_OFFICE_DB', 'MOLE_OFFICE_TERMINAL_HOLDER', 'XDG_CONFIG_HOME', 'HOME']) {
      vi.stubEnv(name, world.env[name])
    }
    let output = ''
    const wrote = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { output += String(chunk); return true })
    try {
      await expect(startTheHolder({ databasePath: world.place.database, port: 0, lockPath: world.lockPath,
        logPath: join(world.place.dir, 'service.log') })).resolves.toBeUndefined()
      expect(theHolderNamedIn(output)).toBeNull()
      if (mode === 'off') {
        expect(output).toContain('The terminal holder was not started, because MOLE_OFFICE_TERMINAL_HOLDER is off.')
        expect(existsSync(world.place.socket)).toBe(false)
      } else if (mode === 'unwritable folder') {
        expect(output).toContain('The terminal holder could not be started: ')
        expect(output).toContain('No terminal holder was started.')
        expect(output).toContain("could not be written to the holder's log either")
      } else {
        expect(output).toContain('The terminal holder did not start: it ended with exit code 1.')
        expect(readFileSync(theTerminalHolderLog(world.place.database), 'utf8')).toContain(
          'the service command: The terminal holder did not start: it ended with exit code 1.',
        )
      }
    } finally { wrote.mockRestore(); vi.unstubAllEnvs() }
  }, 30_000)
})
