// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `npm run mole-office` FROM A PAIRED DEVELOPMENT CHECKOUT STARTS THE STABLE OFFICE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * After the first handoff the person works in the development checkout, and the stable office serves
 * its database. The bootstrap writes `MOLE_OFFICE_STABLE_CHECKOUT=<stable>` into the development
 * checkout's `.env`. Round 12 Part B: when that line is set and nothing answers, `start` starts
 * `node tools/serve-dev.mjs --built --prepared` in the stable checkout, detached, with
 * MOLE_OFFICE_DEVELOPMENT_CHECKOUT (this checkout's real path), MOLE_OFFICE_DB (absolute, canonical),
 * MOLE_OFFICE_PORT and NODE_ENV=production. It never starts a server from this checkout on that
 * database. A stand-in holding the port means serve-dev is already there, so no second supervisor
 * starts. No terminal holder is started from the development checkout, because the runtime choice
 * cannot be read from the database the stable office serves.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORLDS AND WHAT EACH CASE USES
 * ---------------------------------------------------------------------------------------
 *
 * The development checkout is a fixture: `src`, `package.json` and `tsconfig.json` copied into a
 * temporary folder, `node_modules` symlinked, and a `.env` naming the port, the temporary database
 * and this worktree as the stable checkout. The stable checkout is this worktree itself, whose
 * `dist/web` must be built from its own commit (the same requirement the other command tests carry).
 *
 * The two cases that need a running stable office — the start and the restart — need the shared
 * self-check to accept a stable office for its development checkout (the world's `developmentCheckout`
 * and the self-check's excuse, another worker's commits); until those are joined the start cannot
 * report success. The stand-in, holder and inspector cases need none of that.
 *
 * MUTATIONS, each run after the control and then restored:
 *   - start in this checkout (drop the paired branch, so the ordinary start runs);
 *   - start a second serve-dev over a stand-in (drop the stand-in refusal);
 *   - start a holder from a paired development checkout (drop the skip that keys on the pairing);
 *   - accept any checkout in restart (drop the pairing from the allowed set);
 *   - drop THE_DEVELOPMENT_CHECKOUT from the inspector's default.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createServer as aTcpProbe } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { theTerminalHolderLog } from '../src/config/the-terminal-holder.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { TEST_DATABASE_PREFIX, theCheckoutsPageBuiltAtThisCommit } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Every folder this file made, and every child it started. */
const folders = new Set<string>()
const children: ChildProcess[] = []
/** Every server this file made, so `afterAll` can close each. */
const servers: Server[] = []
const groups = new Set<number>()

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = aTcpProbe()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

interface Paired {
  root: string
  dev: string
  home: string
  database: string
  port: number
  env: NodeJS.ProcessEnv
}

/** A development checkout that pairs with this worktree as its stable checkout. */
async function aPairedDevelopmentCheckout(name: string): Promise<Paired> {
  const root = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(root)
  const dev = join(root, 'development')
  mkdirSync(dev)
  for (const entry of ['src', 'package.json', 'tsconfig.json']) {
    cpSync(join(REPO, entry), join(dev, entry), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dev, 'node_modules'))
  // A DEVELOPMENT CHECKOUT IS A CHECKOUT: settings refuses a folder with no .git entry.
  const made = spawnSync('git', ['init', '--quiet', dev], { encoding: 'utf8' })
  if (made.status !== 0) throw new Error(`the fixture development checkout could not be a git checkout: ${made.stderr}`)
  const home = join(root, 'home')
  mkdirSync(home)
  const database = join(root, 'office.db')
  const port = await aFreePort()
  writeFileSync(
    join(dev, '.env'),
    `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${database}\nMOLE_OFFICE_STABLE_CHECKOUT=${REPO}\n`,
  )
  return { root, dev, home, database, port, env: theCommandEnvironment(home) }
}

/** The environment the command runs in: this test's, without any MOLE_ setting or test marker. */
function theCommandEnvironment(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HOME: home }
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('MOLE_') || name.startsWith('VITEST') || name === 'NODE_ENV') continue
    env[name] = value
  }
  return env
}

/** Run the command from the fixture development checkout, to its end. */
function theCommandAt(paired: Paired, what: string): Promise<{ code: number | null; out: string; pid: number }> {
  const child = spawn(process.execPath, [join(paired.dev, 'src', 'config', 'the-service-command.mjs'), what], {
    cwd: paired.dev,
    env: paired.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  return new Promise((done) => {
    child.on('close', (code) => {
      const lock = readTheServiceLock(join(paired.database + '.service.json'))
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      done({ code, out, pid: child.pid ?? -1 })
    })
  })
}

/** One process's own environment, read from /proc, as pairs of name and value. */
function theEnvironmentOf(pid: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const piece of readFileSync(`/proc/${String(pid)}/environ`, 'utf8').split('\0')) {
    const at = piece.indexOf('=')
    if (at > 0) out[piece.slice(0, at)] = piece.slice(at + 1)
  }
  return out
}

/** The serve-dev supervisors whose own environment names this database, with their cwd. */
function theSupervisorsOf(database: string): { pid: number; cwd: string }[] {
  const found: { pid: number; cwd: string }[] = []
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      if (!readFileSync(`/proc/${entry}/cmdline`, 'utf8').includes('tools/serve-dev.mjs')) continue
      const environment = readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0')
      if (!environment.includes(`MOLE_OFFICE_DB=${database}`)) continue
      found.push({ pid: Number(entry), cwd: readlinkSync(`/proc/${entry}/cwd`) })
    } catch {
      // Gone between the listing and the read: not a supervisor of this database.
    }
  }
  return found.sort((a, b) => a.pid - b.pid)
}

/** A stand-in answer on the paired port, as tools/serve-dev-stand-in.mjs sends it. */
function aStandInAt(port: number, supervisor: number): Server {
  const server = createServer((request, reply) => {
    request.resume()
    reply.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
      'x-mole-office-stand-in': String(supervisor),
      'retry-after': '5',
      connection: 'close',
    })
    reply.end(
      JSON.stringify({
        error:
          `The dev supervisor (process ${String(supervisor)}) holds this port, and no Mole Office server is answering on it now: ` +
          'the stable office refused to start. Nothing was read or written. Ask again in a few seconds.',
      }),
    )
  })
  servers.push(server)
  return server
}

beforeAll(async () => {
  await theCheckoutsPageBuiltAtThisCommit()
}, 300_000)

afterAll(async () => {
  for (const server of servers) await new Promise((done) => server.close(() => done(undefined)))
  const stillThere = (group: number): boolean => {
    try {
      process.kill(-group, 0)
      return true
    } catch {
      return false
    }
  }
  const running = [...groups].filter(stillThere)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 20_000
  while (running.some(stillThere) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter(stillThere)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('a stand-in at the port stops a second supervisor from starting', () => {
  let paired: Paired
  let standIn: Server

  beforeAll(async () => {
    paired = await aPairedDevelopmentCheckout('starts-the-stable-stand-in')
    standIn = aStandInAt(paired.port, 424242)
    await new Promise((done) => standIn.listen(paired.port, '127.0.0.1', () => done(undefined)))
  }, 60_000)

  it('says what the stand-in said and starts nothing', async () => {
    const said = await theCommandAt(paired, 'start')
    expect(said.code, said.out).toBe(11)
    expect(said.out).toContain('The dev supervisor (process 424242) holds this port')
    expect(said.out).toContain('Nothing was started.')
    expect(theSupervisorsOf(paired.database), 'a second supervisor was started').toEqual([])
  }, 120_000)
})

describe('no holder is started from a paired development checkout', () => {
  let paired: Paired
  let standIn: Server

  beforeAll(async () => {
    paired = await aPairedDevelopmentCheckout('starts-the-stable-holder')
    standIn = aStandInAt(paired.port, 424243)
    await new Promise((done) => standIn.listen(paired.port, '127.0.0.1', () => done(undefined)))
  }, 60_000)

  it('writes into the holder’s log that the pairing is why no holder was started', async () => {
    const said = await theCommandAt(paired, 'start')
    expect(said.code, said.out).toBe(11)
    const why = `No terminal holder was started from this checkout, because it pairs with the stable checkout at ${realpathSync(REPO)}.`
    expect(said.out).toContain(why)
    const log = theTerminalHolderLog(paired.database, paired.env)
    expect(existsSync(log), `no holder log was written at ${log}`).toBe(true)
    expect(readFileSync(log, 'utf8')).toContain(why)
    // NO HOLDER PROCESS: the process the holder would be names its own entry and this database.
    const holders: number[] = []
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      try {
        if (!readFileSync(`/proc/${entry}/cmdline`, 'utf8').includes('src/holder/index.mjs')) continue
        if (readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0').includes(`MOLE_OFFICE_DB=${paired.database}`)) holders.push(Number(entry))
      } catch {
        // Gone, or not ours to read.
      }
    }
    expect(holders, 'a holder was started from the development checkout').toEqual([])
  }, 120_000)
})

describe('the inspector’s default source is the development checkout', () => {
  it('names THE_DEVELOPMENT_CHECKOUT before the checkout it runs from', () => {
    // THE DEFAULT LIVES INSIDE the docker-driving function of tools/inspector-sandbox.mjs, which this
    // round may not export or restructure, so this reads the one line it changed. The mutation that
    // drops THE_DEVELOPMENT_CHECKOUT from it turns this red.
    const source = readFileSync(join(REPO, 'tools', 'inspector-sandbox.mjs'), 'utf8')
    expect(source).toContain("import { THE_DEVELOPMENT_CHECKOUT } from '../src/config/settings.mjs'")
    expect(source).toContain('asked.from ?? THE_DEVELOPMENT_CHECKOUT ?? rootOf(THIS_CHECKOUT)')
  })
})
