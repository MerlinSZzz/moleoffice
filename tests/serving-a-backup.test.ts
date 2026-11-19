// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Worlds now require a reachable lease ledger. This fixture owns a child control API through every stop, preserves all loopback assertions and retains evidence if cleanup fails. */
import { liveApp, type LiveApp } from './helpers.ts'
/**
 * `--from <db>` — SERVING A NAMED DATABASE, AND EVERY REFUSAL THAT SURVIVES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `tools/isolated-mole-office.mjs` used to copy from one hard-coded path, the live corpus, and accept
 * three words: `start`, `stop`, `list`. So there was no way to read a backup except to copy it over
 * `data/panelx.db` — over the one file the tool exists to keep hands off — and `npm run db:backup --
 * --check-only` verifies a file without ever serving one. A backup nobody has restored is a promise.
 *
 * `--from <db>` closes that. It also widens the tool's front door, and a new argument on a tool whose
 * whole job is a refusal is the shape a way round the refusal takes. This file is the guard on that.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT PROVE, SAID OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * The refusal cases start no world; the later loopback regression DOES serve a synthetic copy.
 * It owns a separate control API for lease acquisition and cleanup. Originally this file said
 * nothing here starts a server: a test that boots
 * an API and a browser app on every `npm test` is a test that leaks two processes the day somebody
 * interrupts it, and this project has five orphaned-process incidents already. The serving proof is a
 * measurement, run by hand and recorded with its numbers in
 * `design/round-nine/step1-restore-proof.md`: an instance started from a named backup, `GET
 * /api/records` answering, and the record titles and per-table row counts equal to the live
 * instance's. `--check-only` verifies a file and does not serve one, and neither does this file.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT RUNS THE REAL COMMAND AS A SUBPROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The subject is a command an operator types, and the parts worth guarding are the parts a unit test
 * does not reach: the exit code, what is on stderr, and what is left on disk afterwards. The tool
 * runs its work at import, so there is no function to call. `tests/backup.test.ts` is a process for
 * the same reason.
 *
 * NOTHING HERE OPENS `data/panelx.db`. Two cases name its path, and both are cases where the tool is
 * required to refuse before it opens anything.
 */

import Database from 'better-sqlite3'
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalDatabasePath } from '../src/config/settings.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools/isolated-mole-office.mjs')
/**
 * THE LIVE DATABASE, READ FROM THE DECLARATION AND NEVER TYPED.
 *
 * This used to be `join(REPO, 'data/panelx.db')`, which is the declaration's default written a
 * second time, so the three cases below failed in every checkout whose `.env` names a database of
 * its own — which is what CLAUDE.md's worktree recipe produces. The tool refuses the database this
 * checkout serves, and that is `canonicalDatabasePath()`, whatever it is called. Problem
 * `3X-GCt-0TXUG`.
 */
const LIVE_DB = canonicalDatabasePath()
/** The same file the way a person types it, which is the second case below. */
const LIVE_DB_AS_TYPED = `./${relative(REPO, LIVE_DB)}`
/** Where the tool puts an instance. Nothing may be left here after a refusal. */
const ISOLATED = join(REPO, '.logs/isolated')

let control: LiveApp
beforeAll(async () => { control = await liveApp({ name: 'backup-lease-control', workspace: 'default', viewport: { width: 1280, height: 900 } }) }, 180_000)
afterAll(async () => { await control?.stop() })

let dir: string
/** Every instance name this file has used, so a leaked directory is cleaned up rather than kept. */
let named: string[]

beforeEach(() => {
  dir = aTestDatabaseFolder('from')
  named = []
})

/**
 * STOP WHATEVER STARTED, THEN DELETE. THE ORDER IS THE WHOLE POINT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FILE OF REFUSALS NEEDS A STOP AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * In the ordinary world nothing here starts anything, so there is nothing to stop. The world this
 * exists for is the one CLAUDE.md requires: proving a test by mutation. Every other guard in this
 * repository refuses a value, so disabling one changes a number. These guards stop a PROCESS being
 * started, so disabling one starts servers on this machine, and the test that catches the mutation
 * catches it after the servers are already up. On 4 September 2026 that left four processes running
 * eleven minutes after the run finished, holding ports 44487 and 40319. Problem `NR44vZ3jqfK4`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE STOP CANNOT COME SECOND
 * ---------------------------------------------------------------------------------------
 *
 * `stop` in tools/isolated-mole-office.mjs reads the process group ids out of
 * `.logs/isolated/<name>/where.json`. The removal below takes that directory away, so a stop after
 * it cannot work at all — it answers `Nothing here calls itself "…"` and the processes are then
 * findable only by hand, which is the state the problem describes.
 *
 * NOTHING IS SPAWNED WHEN NOTHING WAS STARTED. The tool writes the directory only once it is past
 * every refusal, so its absence is a reliable "this case refused", and this file has fourteen tests.
 *
 * AND IT SAYS SO IF THE STOP DID NOT WORK. `stop` deletes the instance directory when it has stopped
 * both processes and both ports have come back, so a directory still there afterwards means
 * something is still running. Deleting it silently is how a leak becomes invisible, which is what
 * happened last time.
 */
afterEach(() => {
  const stillRunning: string[] = []
  for (const name of named) {
    if (!existsSync(join(ISOLATED, name))) continue
    run(['stop', name])
    if (existsSync(join(ISOLATED, name))) stillRunning.push(name)
  }
  rmSync(dir, { recursive: true, force: true })
  if (stillRunning.length > 0) {
    throw new Error(
      `The tool started ${stillRunning.join(', ')} and its own stop did not end them. Something is ` +
        'still running on this machine. `node tools/stray-servers.mjs` names what, and ' +
        '`node tools/isolated-mole-office.mjs list` names any instance record left.',
    )
  }
})

/** A name no other run of anything holds, in the tool's own alphabet. */
function instanceName(what: string): string {
  const name = `t-from-${what}-${Math.random().toString(36).slice(2, 8)}`
  named.push(name)
  return name
}

/** Run the tool the way an operator does, and hand back everything it produced. */
function run(
  args: readonly string[],
  alsoInTheEnvironment: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const out = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, MOLE_OFFICE_API: control.api, MOLE_OFFICE_WORKSPACE: 'default', ...alsoInTheEnvironment },
  })
  return { status: out.status ?? -1, stdout: out.stdout ?? '', stderr: out.stderr ?? '' }
}

/** A database with Mole Office's own mark on it — a `records` table — and `rows` rows in it. */
function moleOfficeLike(file: string, rows: number): string {
  const db = new Database(file)
  db.exec('create table records (id text primary key, title text)')
  const put = db.prepare('insert into records (id, title) values (?, ?)')
  for (let n = 0; n < rows; n++) put.run(`r${String(n)}`, `row ${String(n)}`)
  db.close()
  return file
}

/** Preserve both checks when cleanup also fails. Problem e-ZODNdmOYhE,
 * wave 13t message JDCiM_ApIIZh: finally used to replace the start failure. */
function checkingAndStopping(check: () => void, stop: () => void): void {
  let first: { error: unknown } | undefined
  try {
    check()
  } catch (error) {
    first = { error }
    throw error
  } finally {
    try {
      stop()
    } catch (error) {
      if (first !== undefined) {
        throw new AggregateError([first.error, error],
          'The world check failed: ' + String(first.error) + '\nStopping the world also failed: ' + String(error))
      }
      throw error
    }
  }
}

// Mutation: let the finally throw only its own error, hiding the first failure.
it('names both failures when the world check and its stop fail', () => {
  const first = new Error('synthetic: start did not become ready')
  const second = new Error('synthetic: stop found no world')
  let caught: unknown
  try {
    checkingAndStopping(() => { throw first }, () => { throw second })
  } catch (error) { caught = error }
  expect(caught).toBeInstanceOf(AggregateError)
  expect((caught as AggregateError).errors).toEqual([first, second])
  expect(String(caught)).toContain(first.message)
  expect(String(caught)).toContain(second.message)
  expect(() => checkingAndStopping(() => { throw first }, () => {})).toThrow(first)
  expect(() => checkingAndStopping(() => {}, () => { throw second })).toThrow(second)
})

describe('--from refuses the live database', () => {
  it('refuses the live database by name, starts nothing, and leaves no instance behind', () => {
    const name = instanceName('live')
    const out = run(['start', name, '--from', LIVE_DB])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain(LIVE_DB)
    expect(out.stderr).toContain('will not be pointed at the live database')
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })

  it('refuses a relative path that resolves to the live database', () => {
    const name = instanceName('rel')
    const out = run(['start', name, '--from', LIVE_DB_AS_TYPED])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('will not be pointed at the live database')
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })

  it('refuses the live database write-ahead log, which is half a corpus wearing a database name', () => {
    const name = instanceName('wal')
    const out = run(['start', name, '--from', `${LIVE_DB}-wal`])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('will not be pointed at the live database')
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })
})

describe('--from refuses a source it cannot serve, and leaves nothing on disk', () => {
  it('refuses a path with no file at it, and names the path it looked at', () => {
    const name = instanceName('missing')
    const missing = join(dir, 'not-here.db')
    const out = run(['start', name, '--from', missing])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain(missing)
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })

  it('refuses a file that is not a database, in a sentence rather than a stack trace', () => {
    const name = instanceName('text')
    const notADb = join(dir, 'notes.txt')
    writeFileSync(notADb, 'this is not a database, it is a note about one\n')
    const out = run(['start', name, '--from', notADb])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('could not be opened as a database')
    // The tell of a stack trace out of node_modules. An operator's next move is to look at the file,
    // and a stack trace does not say which one.
    expect(out.stderr).not.toContain('node_modules')
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })

  it('refuses a database that is not Mole Office, names the tables it does hold, and copies nothing', () => {
    const name = instanceName('stranger')
    const stranger = join(dir, 'stranger.db')
    const db = new Database(stranger)
    db.exec('create table invoices (id integer primary key)')
    db.exec('create table customers (id integer primary key)')
    db.close()

    const out = run(['start', name, '--from', stranger])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('has no `records` table')
    expect(out.stderr).toContain('invoices')
    expect(out.stderr).toContain('customers')
    // THE PROTECTION THAT MATTERS HERE. A database left in .logs/isolated/<name>/ is one somebody
    // starts a server against tomorrow, long after this message has scrolled away.
    expect(existsSync(join(ISOLATED, name))).toBe(false)
    expect(existsSync(join(ISOLATED, name, 'copy.db'))).toBe(false)
  })

  it('says a refused source was only read', () => {
    const name = instanceName('unchanged')
    const stranger = join(dir, 'stranger.db')
    const db = new Database(stranger)
    db.exec('create table invoices (id integer primary key)')
    db.close()

    const out = run(['start', name, '--from', stranger])

    expect(out.stderr).toContain('The source itself was only read; it is unchanged.')
    // And it is: it still opens, and still holds the one table it was given.
    const after = new Database(stranger, { readonly: true, fileMustExist: true })
    const tables = after
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all() as { name: string }[]
    after.close()
    expect(tables.map((t) => t.name)).toEqual(['invoices'])
  })
})

describe('--from is a word with one meaning', () => {
  it('needs a path after it', () => {
    const name = instanceName('bare')
    const out = run(['start', name, '--from'])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('needs a path')
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })

  it('refuses a second --from rather than choosing between two sources', () => {
    const name = instanceName('twice')
    const a = moleOfficeLike(join(dir, 'a.db'), 1)
    const b = moleOfficeLike(join(dir, 'b.db'), 2)
    const out = run(['start', name, '--from', a, '--from', b])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('given twice')
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })

  it('belongs to start alone — stop and list read an instance that already exists', () => {
    const source = moleOfficeLike(join(dir, 'somewhere.db'), 1)
    for (const command of ['stop', 'list']) {
      const out = run([command, instanceName(command), '--from', source])
      expect(out.status).not.toBe(0)
      expect(out.stderr).toContain('belongs to `start`')
    }
  })

  it('does not let an unknown option through beside it', () => {
    const name = instanceName('unknown')
    const out = run(['start', name, '--serve-in-place'])

    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('Unknown option')
    expect(existsSync(join(ISOLATED, name))).toBe(false)
  })
})

/**
 * AN INSTANCE THIS TOOL STARTS IS SERVED TO NOBODY ELSE, WHATEVER THE CHECKOUT DECLARES.
 *
 * Criterion R3 of design/ground/ACCEPTANCE.md section 7: a scratch stack is never reachable from off
 * the machine unless its declaration says so. An isolated instance is a throwaway copy of the corpus
 * on ports nobody chose, so it is exactly the thing that must not open a door on a private network.
 *
 * MEASURED, 4 September 2026. Before this, the two processes inherited
 * MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES from the checkout's own `.env`, and two instances started
 * from a checkout naming 192.0.2.10 were bound to 192.0.2.10 on ports 44487 and 40319. They
 * were found by tools/stray-servers.mjs rather than by anybody expecting them.
 *
 * THIS TEST CARRIES ITS OWN DECLARATION, in the environment it hands the tool, so it says the same
 * thing in the owner's checkout — where no address is named at all — as in a worktree.
 */
describe('an instance is served to nobody else, whatever the checkout declares', () => {
  it('opens nothing but loopback, and its runtime record says it serves no other machine', () => {
    const name = instanceName('loopback')
    // A REAL DATABASE, not the hand-made stand-in the refusal cases use. Every other case here
    // refuses before anything starts, so a table called `records` is enough for them; this one has
    // to be SERVED, and the tool brings a copy up to date before it starts anything. The product's
    // own migration builds it, which takes half a second on an empty file.
    const source = join(dir, 'a-real-one.db')
    const built = spawnSync(process.execPath, [join(REPO, 'node_modules/.bin/tsx'), join(REPO, 'src/server/db/migrate.ts')], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, MOLE_OFFICE_DB: source },
    })
    expect(built.status, `${built.stdout ?? ''}${built.stderr ?? ''}`).toBe(0)
    // 127.0.0.2 is a second address this machine really has, so a door WOULD open here if the
    // instance inherited the setting. Naming an address the machine does not have would make the
    // server refuse to start, which is a different result and would pass this test for the wrong
    // reason.
    const out = run(['start', name, '--from', source], { MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: '127.0.0.2', MOLE_OFFICE_MESSAGE_WORKER:'on' })
    checkingAndStopping(() => {
      expect(out.status, `${out.stdout}${out.stderr}`).toBe(0)
      const api = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out.stdout)
      expect(api, `the tool printed no API address:\n${out.stdout}`).not.toBeNull()
      const port = Number(api?.[1])

      // An inherited 'on' is not the explicit test flag. The ordinary world must keep its queue still.
      const health = JSON.parse(execSync(`curl -fsS -H 'x-mole-office-workspace: default' -H 'x-mole-office-actor-type: agent' -H 'x-mole-office-actor-id: synthetic-world-reader' http://127.0.0.1:${String(port)}/api/health`,{encoding:'utf8'}))
      expect(health.messageWorker).toMatchObject({started:false})
      expect(health.messageWorker.says).toContain('MOLE_OFFICE_MESSAGE_WORKER=off')

      // WHAT IT BOUND, off the kernel rather than off the settings, because the question is what
      // this process really opened. Every listening socket on that port is checked, not the one we
      // know about: the fault this guards against is a door nobody said was open.
      const sockets = readFileSync('/proc/net/tcp', 'utf8')
        .split('\n')
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => fields.length > 3 && fields[3] === '0A')
        .map((fields) => (fields[1] ?? '').split(':'))
        .filter(([, hex]) => Number.parseInt(hex ?? '0', 16) === port)
      expect(sockets.length, `nothing is listening on ${String(port)}`).toBeGreaterThan(0)
      for (const [address] of sockets) {
        // Little-endian hex of 127.0.0.1.
        expect(address, `port ${String(port)} is bound to something that is not 127.0.0.1`).toBe('0100007F')
      }

      // And the instance says so about itself, which is what a person reads.
      const answered = execSync(
        `curl -s -H 'x-mole-office-workspace: default' http://127.0.0.1:${String(port)}/api/runtime`,
        { encoding: 'utf8' },
      )
      const record = JSON.parse(answered) as { addresses: { forOtherMachines: unknown } }
      expect(record.addresses.forOtherMachines, 'an isolated instance claimed an address for other machines').toBe(
        null,
      )
    }, () => {
      // BY THE TOOL'S OWN STOP, which kills by process group and deletes the copy. A test that
      // starts servers and leaves them is the thing tests/no-stray-servers.test.ts exists to find.
      const stopped = run(['stop', name])
      expect(stopped.status, stopped.stdout + stopped.stderr).toBe(0)
    })
  }, 120_000)
})

describe('the commands that were there before still parse', () => {
  it('list still answers and exits 0', () => {
    const out = run(['list'])
    expect(out.status).toBe(0)
  })

  it('stop on a name nothing holds still says so rather than throwing', () => {
    const out = run(['stop', instanceName('absent')])
    expect(out.status).not.toBe(0)
    expect(out.stderr).toContain('Try `list`')
  })

  it('no arguments still prints how to use it, and says --from in the same breath', () => {
    const out = run([])
    expect(out.status).toBe(0)
    expect(out.stdout).toContain('--from <db>')
  })
})
