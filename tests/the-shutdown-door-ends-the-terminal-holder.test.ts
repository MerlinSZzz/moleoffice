// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S SHUT DOWN ENDS THE TERMINAL HOLDER, AFTER ITS TERMINALS ARE TOLD, AND ITS SOCKET GOES WITH IT. Problem
 * IrRyMyx6XN19.
 *
 * On a Mac on 4 November, 'Shut down Mole Office' stopped the office and the holder ran on for 14 hours, from the Trash.
 * The window hands its Shut down to the office page when one is open (src/desktop/main.mjs), the page presses
 * POST /api/office/shut-down, and the server leaves through its own way out (src/server/index.ts). Until this file only
 * the stop command ended the holder, so the press most people make left it running.
 *
 * WHAT IS MEASURED, on an office of this file's own, started with the `mole-office` command, with its holder on: a
 * terminal is open in the holder, the owner presses the shutdown door, and then the server has ended, the holder has
 * ended, its terminal has ended, its socket is gone, the holder's log says it was asked to stop before it stopped, and
 * the office's log says so in the stop command's own sentence.
 *
 * WHAT IT DOES NOT MEASURE. It runs on Linux. The Mac's holder is ended the same way, by SIGTERM to its recorded
 * group, and is checked on the Mac test user after the next package. Windows is not measured here: there the holder
 * takes no stop request and the ledger records no group for it, so the same way out ends the Job Object the holder's
 * starter made, which tests/the-holder-on-windows-ends-with-its-job-object.test.ts checks with Windows stood in.
 *
 * A HOLDER THE WAY OUT CANNOT END IS SAID, NOT LEFT IN SILENCE (round W40). The way out ends the holder only when the
 * office's process ledger proves it, as the stop command does. When it cannot, the server's log says the holder is still
 * running and why, and the server exits with the stop's own code for it, HOLDER_NOT_STOPPED, not 0. The case gives the
 * holder's ledger row no group, as a row the office could not read a group for. The holder step runs after the server
 * has closed its own database handle: the first case shows the holder ended all the same, so the step read the ledger
 * through a handle of its own. After the server has gone, the window's way of asking what was left
 * (src/desktop/what-the-shut-down-left.mjs) runs the real stop, which says the same. Nothing here ran on Windows or a Mac.
 *
 * MUTATIONS, after a control run: the shutdown door's way out in src/server/index.ts does not end the holder (red: the
 * holder still runs); the way out exits 0 when it left the holder (red: the second case's exit code); the way out does
 * not log that it left the holder (red: the second case's log line).
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { EXIT, THE_HOLDERS_ROW_CARRIES_NO_GROUP, theHolderHasNoRecordedGroupWords, theHolderWasStoppedWords, theShutDownLeftTheHolderWords } from '../src/config/the-service-command.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { serviceLockPathFrom, serviceLogPathFrom } from '../src/config/settings.mjs'
import { whatTheShutDownLeft } from '../src/desktop/what-the-shut-down-left.mjs'
import { theAskedToStopLine, theStopsLastLine } from '../src/holder/index.mjs'
import {
  REPO,
  aFreePort,
  aPlace,
  aServerEnvironment,
  ask,
  groups,
  isAlive,
  openThroughTheHolder,
  sleep,
  startAHolder,
  startAServer,
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
  logPath: string
}

async function aWorld(name: string): Promise<World> {
  const place = aPlace(name)
  const port = await aFreePort()
  const env: NodeJS.ProcessEnv = {
    ...(await aServerEnvironment(place, port)),
    MOLE_OFFICE_TERMINAL_HOLDER: 'on',
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
  }
  return {
    place,
    api: `http://127.0.0.1:${String(port)}`,
    env,
    lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: place.database }),
    logPath: serviceLogPathFrom({ MOLE_OFFICE_DB: place.database }),
  }
}

/** Run the command to its end, recording the server's group and the holder's before anything is asserted. */
function theCommand(world: World, what: string): Promise<{ code: number | null; out: string }> {
  const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env: { ...world.env, MOLE_OFFICE_MESSAGE_WORKER: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 150_000)
  return new Promise((done) => {
    child.on('close', (code) => {
      clearTimeout(timer)
      const lock = readTheServiceLock(world.lockPath)
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      const holder = /The terminal holder is process (\d+), in process group (\d+)\./.exec(out)
      if (holder !== null) groups.add(Number(holder[2]))
      done({ code, out })
    })
  })
}

interface SessionRow {
  title: string
  data: { state?: string; extra?: { discovered?: { pid?: number } } }
}

describe("the owner's Shut down and the terminal holder", () => {
  it('ends the holder after its terminal is told, and its socket goes with it', async () => {
    const world = await aWorld('shut-holder')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const named = /The terminal holder is process (\d+), in process group (\d+)\./.exec(started.out)
    expect(named, started.out).not.toBeNull()
    const holderPid = Number(named![1])
    const lock = readTheServiceLock(world.lockPath)
    expect(lock.state).toBe('read')
    const serverPid = lock.state === 'read' ? lock.lock.pid : 0

    // THE SERVER HAS RECORDED THE HOLDER, so its group is in the office's process ledger, as for the stop command.
    const rows = await until(
      async () => ((await ask(world.api, '/api/records?kind=session&shape=full')).body['records'] ?? []) as SessionRow[],
      (all) => all.some((row) => row.data.state === 'running' && row.data.extra?.discovered?.pid === holderPid),
      20_000,
    )
    expect(rows.some((row) => row.data.state === 'running' && row.data.extra?.discovered?.pid === holderPid), JSON.stringify(rows).slice(0, 800)).toBe(true)
    const terminal = await openThroughTheHolder(world.place)

    const shut = await ask(world.api, '/api/office/shut-down', { method: 'POST', body: { why: 'this test shuts its own office down' } })
    expect(shut.status, JSON.stringify(shut.body)).toBe(200)
    expect(shut.body['shuttingDown']).toBe(true)

    expect(await until(() => isAlive(serverPid), (alive) => !alive, 30_000), 'the server still runs after the shut down').toBe(false)
    expect(await until(() => isAlive(holderPid), (alive) => !alive, 15_000), 'the holder still runs after the shut down').toBe(false)
    expect(await until(() => isAlive(terminal.pid), (alive) => !alive, 10_000), "the holder's terminal still runs after the shut down").toBe(false)
    expect(existsSync(world.place.socket), "the holder's socket is still there").toBe(false)

    // TOLD FIRST, THEN STOPPED, in the holder's own log; and the office's log says it in the stop command's sentence.
    const holderLog = readFileSync(world.place.log, 'utf8')
    const asked = holderLog.indexOf(theAskedToStopLine('SIGTERM'))
    expect(asked, holderLog.slice(-1200)).toBeGreaterThan(-1)
    expect(holderLog.indexOf(theStopsLastLine([]), asked), holderLog.slice(-1200)).toBeGreaterThan(asked)
    expect(readFileSync(world.logPath, 'utf8')).toContain(theHolderWasStoppedWords(holderPid, holderPid))
  }, 240_000)

  it('says it left a holder the ledger does not prove, exits HOLDER_NOT_STOPPED, and the stop the window runs says the same', async () => {
    const place = aPlace('shut-left')
    const holder = await startAHolder(place, { toTheLog: true })
    const server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on', MOLE_OFFICE_MESSAGE_WORKER: 'off' })
    const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: place.database })

    // THE SERVER HAS RECORDED THE HOLDER IN ITS LEDGER. Then the row loses its group, as a row the office could not read a
    // group for, so nothing proves which group the holder is in.
    const openRows = (): number => {
      const db = new Database(place.database, { readonly: true, fileMustExist: true })
      try {
        const row = db.prepare("SELECT COUNT(*) AS n FROM session_resources WHERE type = 'process' AND key = ? AND released_at IS NULL").get(String(holder.pid)) as { n: number }
        return row.n
      } finally {
        db.close()
      }
    }
    expect(await until(openRows, (n) => n === 1, 30_000), 'the server did not record the holder in its ledger').toBe(1)
    const db = new Database(place.database, { fileMustExist: true })
    try {
      db.prepare("UPDATE session_resources SET pgid = NULL WHERE type = 'process' AND key = ? AND released_at IS NULL").run(String(holder.pid))
    } finally {
      db.close()
    }

    const shut = await ask(server.api, '/api/office/shut-down', { method: 'POST', body: { why: 'this test shuts its own office down' } })
    expect(shut.status, JSON.stringify(shut.body)).toBe(200)
    const ended = await Promise.race([server.exited, sleep(90_000).then(() => null)])
    expect(ended, `the server did not end within 90 seconds. It printed: ${server.output().slice(-2000)}`).not.toBeNull()
    expect(ended!.code, server.output().slice(-2000)).toBe(EXIT.HOLDER_NOT_STOPPED)
    expect(isAlive(holder.pid), 'the holder was ended, so this case did not measure a holder that was left').toBe(true)
    const said = server.output()
    expect(said, said.slice(-2000)).toContain(theShutDownLeftTheHolderWords(theHolderHasNoRecordedGroupWords(holder.pid, THE_HOLDERS_ROW_CARRIES_NO_GROUP)))
    expect(said, said.slice(-2000)).toContain(theHolderHasNoRecordedGroupWords(holder.pid, THE_HOLDERS_ROW_CARRIES_NO_GROUP))
    expect(readTheServiceLock(lockPath).state, 'the server ended and left its lock').toBe('absent')

    // WHAT THE WINDOW ASKS THEN: the real stop, once the lock has gone, says the holder was left.
    const world: World = { place, api: server.api, env: { ...server.env, MOLE_OFFICE_TERMINAL_HOLDER: 'on' }, lockPath, logPath: serviceLogPathFrom({ MOLE_OFFICE_DB: place.database }) }
    const left = await whatTheShutDownLeft({
      lockPath,
      runTheStop: async () => {
        const stopped = await theCommand(world, 'stop')
        return { ok: stopped.code === 0, said: `exit code ${String(stopped.code)}. ${stopped.out}` }
      },
    })
    expect(left.ok, left.said).toBe(false)
    expect(left.said).toContain(`exit code ${String(EXIT.HOLDER_NOT_STOPPED)}.`)
    expect(left.said).toContain(theHolderHasNoRecordedGroupWords(holder.pid, THE_HOLDERS_ROW_CARRIES_NO_GROUP))
    expect(isAlive(holder.pid), 'the stop ended a holder the ledger does not prove').toBe(true)
  }, 240_000)
})
