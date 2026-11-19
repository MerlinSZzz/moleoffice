// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START MAKES NO DATABASE WHERE ONE WAS KEPT (design/window/the-data-folder-move.criteria.md, DF30).
 *
 * A data folder may be under a mount point that is not mounted now, or on a drive that is not connected. Its
 * path then names an empty folder, or no folder at all. Here an empty folder stands for the mount point that is
 * not mounted, and the database's folder moved aside stands for what the drive holds. The place is named through
 * the process environment, because a start from a checkout reads the checkout's `.env` and a test may not write
 * it. The rule asks about the place whatever chose it (src/config/may-a-start-make-the-database.mjs).
 *
 * THE CASES:
 *   1. An office that has kept its database, started while its folder is empty, refuses in DF30's words, ends
 *      with the failed exit code, and its folder holds exactly what it held before: nothing. Mounted again, it
 *      starts with its database. This is the fault: before this change, that start made a new empty database there.
 *   2. An office that has kept its database, started while its folder does not exist at all, is refused the same
 *      way, and the folder is still not there.
 *   3. The first start after `mole-office data-folder choose` makes the database, and the start leaves its mark.
 *   4. With no `.env` line, the default place is inside the install's own data root. The rule never refuses it and
 *      gives it no mark, so a first start there makes the database as before. This case asks the rule and starts nothing.
 *   5. An office that has its database starts as today, also when it has no mark yet, as after an update, and
 *      that start leaves its mark.
 *   6. The server started alone meets the same refusal, ends with the failed exit code, and makes nothing.
 *
 * THE MUTANTS, each to be run with a control before it and the restore after it, and the case each should turn red:
 *   - the refusal taken out of `mole-office start`: case 1;
 *   - the server's own start skips the question: case 6;
 *   - a first start after `choose` is refused: case 3;
 *   - the refusal makes the folder and the log before it refuses: case 1.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { apiServerArguments } from './helpers.ts'
import { REPO, aFreePort, aPlace, aServerEnvironment, groups, stopEverything, type Place } from './terminal-holder-stand.ts'

const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
// The old code has no such file, so it is imported where a case needs it, after what shows the fault.
const theRule = () => import('../src/config/may-a-start-make-the-database.mjs')

afterAll(stopEverything, 60_000)

interface World {
  place: Place
  /** The folder that stands for the mount point. */
  drive: string
  database: string
  env: NodeJS.ProcessEnv
  lockPath: string
}

/** A place whose data folder is `drive` in it, made and empty, as a mount point with a new drive mounted. */
async function aWorld(name: string): Promise<World> {
  const place = aPlace(name)
  const drive = join(place.dir, 'drive')
  const database = join(drive, 'mole-office.db')
  mkdirSync(drive)
  const env: NodeJS.ProcessEnv = {
    ...(await aServerEnvironment({ ...place, database }, await aFreePort())),
    MOLE_OFFICE_TERMINAL_HOLDER: 'off',
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
  }
  return { place, drive, database, env, lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: database }) }
}

/** Run a program to its end. The server group a lock names is recorded before anything is asserted. */
function toItsEnd(world: World, args: string[], detached = false): Promise<{ code: number | null; out: string }> {
  const child = spawn(process.execPath, args, { cwd: REPO, env: world.env, detached, stdio: ['ignore', 'pipe', 'pipe'] })
  if (detached && child.pid !== undefined) groups.add(child.pid)
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 150_000)
  return new Promise((done) => {
    child.on('close', (code) => {
      clearTimeout(timer)
      const lock = readTheServiceLock(world.lockPath)
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      done({ code, out })
    })
  })
}

const theCommand = (world: World, what: string) => toItsEnd(world, [THE_COMMAND, what])
const theServerAlone = (world: World) => toItsEnd(world, apiServerArguments(['--import', 'tsx']), true)

/** Start the office and stop it, so it has kept its database in the drive's folder. */
async function anOfficeThatHasKeptItsDatabase(name: string): Promise<World> {
  const world = await aWorld(name)
  const started = await theCommand(world, 'start')
  expect(started.code, started.out).toBe(0)
  expect(existsSync(world.database), started.out).toBe(true)
  const stopped = await theCommand(world, 'stop')
  expect(stopped.code, stopped.out).toBe(0)
  return world
}

/** The drive goes away: its files are moved aside. An empty folder is left, or none. */
function theDriveGoes(world: World, leave: 'an empty folder' | 'no folder'): string {
  const away = `${world.drive}-away`
  renameSync(world.drive, away)
  if (leave === 'an empty folder') mkdirSync(world.drive)
  return away
}

/** The drive comes back. */
function theDriveComesBack(world: World, away: string): void {
  if (existsSync(world.drive)) rmdirSync(world.drive)
  renameSync(away, world.drive)
}

async function theRefusalIn(world: World, said: { code: number | null; out: string }): Promise<void> {
  const rule = await theRule()
  expect(said.code, said.out).toBe(1)
  expect(said.out).toContain(rule.theMissingDatabaseWords(world.database, rule.theMarkOfTheDatabase(world.database, { env: world.place.env })))
}

describe('a start makes no database where the office has kept one', () => {
  it('1: with its folder empty, the start refuses and makes nothing; mounted again, it starts', async () => {
    const world = await anOfficeThatHasKeptItsDatabase('kept-e')
    const away = theDriveGoes(world, 'an empty folder')
    const refused = await theCommand(world, 'start')
    expect(readdirSync(world.drive), refused.out).toEqual([])
    await theRefusalIn(world, refused)
    expect(refused.out).toContain('If that folder is on a drive that is not connected, connect the drive and start Mole Office again.')

    theDriveComesBack(world, away)
    const again = await theCommand(world, 'start')
    expect(again.code, again.out).toBe(0)
    expect((await theCommand(world, 'stop')).code).toBe(0)
  }, 600_000)

  it('2: with its folder not there at all, the start refuses the same way and makes no folder', async () => {
    const world = await anOfficeThatHasKeptItsDatabase('kept-n')
    theDriveGoes(world, 'no folder')
    const refused = await theCommand(world, 'start')
    expect(existsSync(world.drive), refused.out).toBe(false)
    await theRefusalIn(world, refused)
  }, 600_000)

  it('3: the first start after data-folder choose makes the database and leaves its mark', async () => {
    const world = await aWorld('chosen')
    const { chooseTheDataFolder, whereTheDataIs } = await import('../src/config/the-data-folder-move.mjs')
    const envFile = join(world.place.config, 'mole-office', '.env')
    mkdirSync(join(world.place.config, 'mole-office'), { recursive: true })
    const chosen = chooseTheDataFolder(world.drive, envFile)
    expect(chosen.database).toBe(world.database)
    const where = whereTheDataIs({}, envFile)
    expect(join(where.folder, where.database)).toBe(world.database)
    expect(where.chosenBy).toBe('the .env line')
    const rule = await theRule()
    expect(rule.whyAStartMayNotMakeTheDatabase(world.database, { env: world.place.env })).toBeNull()

    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    expect(existsSync(world.database), started.out).toBe(true)
    expect(existsSync(rule.theMarkOfTheDatabase(world.database, { env: world.place.env })), started.out).toBe(true)
    expect((await theCommand(world, 'stop')).code).toBe(0)
  }, 600_000)

  it('4: with no .env line the default place is inside the data root: never refused, and given no mark', async () => {
    const place = aPlace('default')
    const { thePerUserDataFolder } = await import('../src/config/settings.mjs')
    const { whereTheDataIs } = await import('../src/config/the-data-folder-move.mjs')
    const rule = await theRule()
    const perUser = thePerUserDataFolder(place.env)
    const noLine = join(place.dir, 'no-line.env')
    const where = whereTheDataIs({}, noLine)
    expect(where.chosenBy).toBe('the default')
    // An installed office's data root is its per-user folder, and its default database is in its `data` folder.
    const theDefault = join(perUser, 'data', 'mole-office.db')
    const here = { env: place.env, dataRoot: perUser }
    expect(rule.keepTheMarkOfTheDatabase(theDefault, here)).toBeNull()
    expect(existsSync(rule.theMarkOfTheDatabase(theDefault, here))).toBe(false)
    expect(rule.whyAStartMayNotMakeTheDatabase(theDefault, here)).toBeNull()
  })

  it('5: an office that has its database starts as today, with a mark or none yet, and the start leaves its mark', async () => {
    const world = await anOfficeThatHasKeptItsDatabase('has-it')
    const rule = await theRule()
    const mark = rule.theMarkOfTheDatabase(world.database, { env: world.place.env })
    expect(existsSync(mark)).toBe(true)
    const withTheMark = await theCommand(world, 'start')
    expect(withTheMark.code, withTheMark.out).toBe(0)
    expect((await theCommand(world, 'stop')).code).toBe(0)

    // As an office from before the mark: its database is there and nothing marks it.
    rmSync(mark)
    const asAfterAnUpdate = await theCommand(world, 'start')
    expect(asAfterAnUpdate.code, asAfterAnUpdate.out).toBe(0)
    expect(existsSync(mark), asAfterAnUpdate.out).toBe(true)
    expect((await theCommand(world, 'stop')).code).toBe(0)
  }, 600_000)

  it('6: the server started alone meets the same refusal and makes nothing', async () => {
    const world = await anOfficeThatHasKeptItsDatabase('alone')
    theDriveGoes(world, 'an empty folder')
    const refused = await theServerAlone(world)
    expect(readdirSync(world.drive), refused.out).toEqual([])
    await theRefusalIn(world, refused)
  }, 600_000)
})
