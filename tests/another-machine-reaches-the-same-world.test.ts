// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION R1: A REMOTE BROWSER KNOWS WHICH API IT TALKS TO.
 *
 * `design/ground/ACCEPTANCE.md` section 7: *the declaration names the address the product is served
 * on for another machine, beside the loopback one; the page reads the API address from where it was
 * served, never from a guess, and the runtime page names both addresses. A page served over the
 * tailnet talks to the same canonical world as the page served on loopback, and its world header
 * says so.*
 *
 * ---------------------------------------------------------------------------------------
 * WHICH SECOND ADDRESS THESE TESTS USE, AND WHY IT IS NOT THE TAILNET ONE
 * ---------------------------------------------------------------------------------------
 *
 * `127.0.0.2`. Every Linux machine has the whole of `127.0.0.0/8`, so this is a second address on
 * this machine that is not `127.0.0.1`, and it needs no network, no daemon and no second machine.
 * What it proves is the whole mechanism: a listener on an address the settings named, a client
 * reaching it by that address, and the same world answering on both.
 *
 * WHAT IT DOES NOT PROVE is that another machine can reach this one, because a loopback address is
 * reachable from nowhere else. That is not a gap these tests can close: this checkout has one
 * machine. It is closed by the human act written under R5 in the acceptance document, on the owner's
 * second machine over the tailnet, and by the run recorded in the handback against this machine's
 * own tailnet address. Writing a tailnet address into a test file would make the suite pass or fail
 * on whether a daemon happened to be running, which is a different question from whether this code
 * is right.
 *
 * The one thing here that IS about being off the machine is the last test: with nothing set, every
 * socket this server opens is on loopback. That needs no second address, because it is a statement
 * about all of them.
 */
import { apiServerArguments } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETTINGS,
  addressesForOtherMachines,
  addressForOtherMachinesFrom,
  settings,
  settingsFrom,
} from '../src/config/settings.mjs'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { namedWaits } from './a-start-names-its-wait.ts'

const REPO = fileURLToPath(new URL('../', import.meta.url))
const THE_SETTING = 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES'
/** A second address on this machine, and the reason it is this one is in the header above. */
const SECOND_ADDRESS = '127.0.0.2'

function sleep(ms: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, ms))
}

describe('the declaration names the address other machines reach this computer at', () => {
  it('declares it, with no default, because unset means nothing is served to another machine', () => {
    const declared = SETTINGS.find((s) => s.name === THE_SETTING)
    expect(declared, `${THE_SETTING} is not declared`).toBeTruthy()
    expect(declared?.fallback, 'it must have no default: a default would open the door for somebody').toBe(null)
    expect(declared?.absentMeans).toContain('127.0.0.1')
    expect(declared?.inTemplate, 'a setting nobody can find in .env.example is one nobody will turn').toBe(true)
  })

  it('is off in a plain environment, which is the state every installation is in', () => {
    expect(addressForOtherMachinesFrom({})).toBe(null)
    expect(addressesForOtherMachines({})).toBe(null)
    expect(settingsFrom({}).otherMachines).toBe(null)
  })

  it('derives both addresses from the one name and the ports already declared', () => {
    const resolved = settingsFrom({
      [THE_SETTING]: '192.0.2.10',
      MOLE_OFFICE_PORT: '39017',
      MOLE_OFFICE_WEB_PORT: '5173',
    })
    expect(resolved.otherMachines).toEqual({
      host: '192.0.2.10',
      apiAddress: 'http://192.0.2.10:39017',
      webAddress: 'http://192.0.2.10:5173',
    })
  })

  it('moves both addresses when the port moves, which is the fault of 28 August 2026', () => {
    // The port moved and the address did not, so the session hook went on resolving the old one.
    // Deriving is the fix, and it has to hold for these two as well or the fault is back twice.
    const moved = settingsFrom({ [THE_SETTING]: 'a-name', MOLE_OFFICE_PORT: '29000', MOLE_OFFICE_WEB_PORT: '29001' })
    expect(moved.otherMachines?.apiAddress).toBe('http://a-name:29000')
    expect(moved.otherMachines?.webAddress).toBe('http://a-name:29001')
  })

  it('refuses every address this computer has, by name and with the reason', () => {
    for (const every of ['0.0.0.0', '::', '*', '0']) {
      expect(() => addressForOtherMachinesFrom({ [THE_SETTING]: every }), `${every} was accepted`).toThrow(
        'every address this computer has',
      )
    }
    // The reason a person can act on, not just the refusal.
    expect(() => addressForOtherMachinesFrom({ [THE_SETTING]: '0.0.0.0' })).toThrow('no login')
  })

  it('refuses a port or a scheme written into it, because the ports are already declared', () => {
    expect(() => addressForOtherMachinesFrom({ [THE_SETTING]: 'http://192.0.2.31:5173' })).toThrow('a whole address')
    expect(() => addressForOtherMachinesFrom({ [THE_SETTING]: '192.0.2.31:5173' })).toThrow('MOLE_OFFICE_PORT')
    // An IPv6 address is a real value and the brackets are how it is told from a port.
    expect(addressForOtherMachinesFrom({ [THE_SETTING]: '[fd7a:115c:a1e0::1701:c50c]' })).toBe(
      '[fd7a:115c:a1e0::1701:c50c]',
    )
  })

  it('reads the word none as off, which is how a scratch stack turns off what .env named', () => {
    // WHY THERE IS A WORD FOR IT. A real environment can override a value in `.env` and cannot take
    // one away, so before this there was no way for a server started from a checkout whose `.env`
    // names an address to say it serves nobody. R3's last clause — a scratch stack is never
    // reachable from off the machine unless its declaration says so — was unmeetable for exactly
    // as long as that was true. Problem `ZYpE5zFO950O`.
    expect(addressForOtherMachinesFrom({ [THE_SETTING]: 'none' })).toBe(null)
    expect(addressesForOtherMachines({ [THE_SETTING]: 'none' })).toBe(null)
    expect(settingsFrom({ [THE_SETTING]: 'none' }).otherMachines).toBe(null)
    // AND IT BEATS THE FILE, which is the whole point: `mergedEnvironment` puts the real environment
    // over `.env`, so a server told `none` opens no door however the checkout is configured.
    expect(addressForOtherMachinesFrom({ ...{ [THE_SETTING]: '192.0.2.10' }, [THE_SETTING]: 'none' })).toBe(null)
    // Written with the spelling people type. It is one word, not four, so a near miss is an address
    // rather than a second way of saying off.
    expect(addressForOtherMachinesFrom({ [THE_SETTING]: 'None' })).toBe('None')
  })

  it('refuses set-and-empty rather than reading it as off', () => {
    // Set and empty and not set at all are different statements, and an unset variable in a template
    // produces a blank one. Reading blank as "off" would be guessing which was meant.
    expect(() => addressForOtherMachinesFrom({ [THE_SETTING]: '' })).toThrow('empty value')
  })
})

/**
 * AND THE SERVER REALLY BINDS BOTH, WHICH ONLY A SOCKET CAN SAY.
 *
 * A real server, started the way `npm start` starts one, because the subject is what it bound. A
 * built app driven with `inject` binds nothing at all and would pass every assertion here without
 * opening a socket, which is the shape of proof this repository has been caught by before.
 */
describe('a server told an address for other machines answers on both of them', () => {
  let dir = ''
  let port = 0
  let child: ChildProcess | undefined
  let unset: ChildProcess | undefined
  let unsetPort = 0

  function freePort(): Promise<number> {
    return new Promise((ok, fail) => {
      const probe = createServer()
      probe.on('error', fail)
      probe.listen(0, '127.0.0.1', () => {
        const at = probe.address()
        if (at === null || typeof at === 'string') {
          probe.close(() => fail(new Error('the probe socket reported no port')))
          return
        }
        const chosen = at.port
        probe.close(() => ok(chosen))
      })
    })
  }

  async function start(env: NodeJS.ProcessEnv, at: string, on: number): Promise<ChildProcess> {
    const started = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, LOG_LEVEL: 'warn', VITEST: undefined, VITEST_WORKER_ID: undefined, ...env },
    })
    // A WAIT OF 30 SECONDS IS NAMED IN THE LOG. tests/a-start-names-its-wait.ts.
    const waits = namedWaits(`the start of the server on port ${String(on)}`)
    waits.wait(`its first answer at ${at}/api/health`)
    try {
      for (let tries = 0; tries < 180; tries += 1) {
        try {
          if ((await fetch(`${at}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) return started
        } catch {
          // not answering yet
        }
        await sleep(500)
      }
    } finally {
      waits.done()
    }
    throw new Error(`the server never answered ${at}/api/health on port ${String(on)}`)
  }

  /**
   * By the group id written down when it was started, never by a pattern. Chapter 2 rule 1 of the
   * office regulations.
   */
  function stop(one: ChildProcess | undefined): void {
    if (one?.pid === undefined || one.pid === null) return
    try {
      process.kill(-one.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }

  beforeAll(async () => {
    dir = aTestDatabaseFolder('another-machine')
    port = await freePort()
    unsetPort = await freePort()
    child = await start(
      {
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_DB: join(dir, 'both.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        [THE_SETTING]: SECOND_ADDRESS,
      },
      `http://127.0.0.1:${String(port)}`,
      port,
    )
    unset = await start(
      {
        MOLE_OFFICE_PORT: String(unsetPort),
        MOLE_OFFICE_DB: join(dir, 'loopback.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        /**
         * THIS TEST CARRIES ITS OWN DECLARATION, AND `none` IS HOW IT SAYS IT.
         *
         * `undefined` here deletes the name from the child's environment, and deleting a name does
         * not reach `.env`. So in any checkout whose `.env` names an address — which is step 1 of
         * the human act in design/ground/ACCEPTANCE.md section 7 — this server read that address,
         * bound it, and the assertions below were about the owner's file rather than about the
         * code. Problem `ZYpE5zFO950O`. `none` is the word that says off in an environment, and it
         * is what a scratch stack anywhere should be sending.
         */
        [THE_SETTING]: 'none',
      },
      `http://127.0.0.1:${String(unsetPort)}`,
      unsetPort,
    )
  }, 200_000)

  /**
   * Anything this file started, whether or not it was meant to stay up. `started` carries the one
   * that is supposed to exit on its own, because "supposed to" is exactly the thing under test.
   */
  const started: ChildProcess[] = []

  afterAll(() => {
    stop(child)
    stop(unset)
    for (const one of started) stop(one)
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers on the address it was given as well as on 127.0.0.1', async () => {
    const there = await fetch(`http://${SECOND_ADDRESS}:${String(port)}/api/health`, {
      headers: { 'x-mole-office-workspace': 'default' },
    })
    expect(there.ok, `nothing answered on ${SECOND_ADDRESS}, so the second door never opened`).toBe(true)
  })

  it('is the same world on both addresses, and the world header is what says so', async () => {
    const head = { 'x-mole-office-workspace': 'default' }
    const here = await fetch(`http://127.0.0.1:${String(port)}/api/health`, { headers: head })
    const there = await fetch(`http://${SECOND_ADDRESS}:${String(port)}/api/health`, { headers: head })
    const onLoopback = here.headers.get(WORLD_HEADER)
    const onTheOther = there.headers.get(WORLD_HEADER)
    expect(onLoopback, 'the reply on loopback carried no world header').toBeTruthy()
    // Byte for byte: the database identity, the checkout, the port, the commit and the standing.
    // A second door onto a second world would differ here and this is the whole of R1's last clause.
    expect(onTheOther).toBe(onLoopback)
  })

  it('names both addresses in the runtime record', async () => {
    const reply = await fetch(`http://127.0.0.1:${String(port)}/api/runtime`, {
      headers: { 'x-mole-office-workspace': 'default' },
    })
    const record = (await reply.json()) as RuntimeRecord
    expect(record.addresses.api).toBe(`http://127.0.0.1:${String(port)}`)
    // ONE PORT, ONCE, though this process now holds two sockets on it. The page drew "29800, 29800"
    // on 4 September 2026 until the reading was deduplicated, which read as two servers.
    expect(record.listeningOn).toEqual([port])
    // THE WEB PORT IS READ THE WAY THE SERVER READS IT: `settings()`, which is `.env` under the real
    // environment. It used to be `settingsFrom(process.env)`, which never opens `.env` — so in any
    // checkout whose `.env` names a web port the test expected one number and the running server
    // reported another. Problem `C_2c-1ldADN5`. The child inherits this process's environment and
    // reads the same `.env`, so this is the same declaration and not a second copy of it.
    expect(record.addresses.forOtherMachines).toEqual({
      host: SECOND_ADDRESS,
      api: `http://${SECOND_ADDRESS}:${String(port)}`,
      web: `http://${SECOND_ADDRESS}:${String(settings().webPort)}`,
    })
  })

  /**
   * A DOOR THAT WILL NOT OPEN STOPS THE SERVER, WHICH IS WHY THE RECORD MAY DECLARE THE ADDRESS.
   *
   * `addresses.forOtherMachines` is read from the settings and not off a socket, unlike
   * `addresses.api`. That is only honest while this holds: there must be no state in which the
   * process is answering on 127.0.0.1 and the address its settings name is not bound. An address
   * this computer does not have is the way to ask for one.
   */
  it('refuses to run at all when the address for other machines cannot be bound', async () => {
    const nowhere = await freePort()
    const child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: REPO,
      /**
       * ITS OWN GROUP, AND THIS TEST STOPS IT WHATEVER HAPPENS. Measured on 4 September 2026: while
       * this test's own subject was mutated to swallow the bind failure, the server it starts did
       * NOT exit, the wait below ran out, and the run was killed before anything cleaned up — so a
       * server was left holding a port over a deleted temporary database. That is the exact leak
       * `tests/no-stray-servers.test.ts` exists to find, and it found it. A test proving that
       * something stops has to stop it when it does not.
       */
      detached: true,
      env: {
        ...process.env,
        MOLE_OFFICE_PORT: String(nowhere),
        MOLE_OFFICE_DB: join(dir, 'never-runs.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        // An address in the documentation range: routable nowhere, and certainly not one this
        // computer has, so the bind fails for a reason that is the same on every machine.
        [THE_SETTING]: '203.0.113.7',
        LOG_LEVEL: 'warn',
        VITEST: undefined,
        VITEST_WORKER_ID: undefined,
      } as NodeJS.ProcessEnv,
    })
    let said = ''
    child.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString()))
    child.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString()))
    // BOUNDED, so a server that does not stop makes this test FAIL rather than hang until the runner
    // gives up — and the group is signalled either way, which is what leaves nothing behind.
    const code = await new Promise<number | null | 'it never stopped'>((done) => {
      const givenUp = setTimeout(() => done('it never stopped'), 45_000)
      child.on('exit', (status) => {
        clearTimeout(givenUp)
        done(status)
      })
    })
    started.push(child)
    expect(code, 'the server carried on without the door it was told to open').not.toBe(0)
    expect(code, 'the server never stopped at all, so it is still holding a port').not.toBe('it never stopped')
    expect(said, 'the refusal does not name the setting a person has to change').toContain(
      'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES',
    )
    expect(said).toContain('This server is NOT running')
    // And it really took nothing: the loopback port it was given is free.
    await expect(
      fetch(`http://127.0.0.1:${String(nowhere)}/api/health`, { signal: AbortSignal.timeout(2000) }),
    ).rejects.toThrow()
  }, 90_000)

  /**
   * AND A STACK THAT SAYS IT SERVES NOBODY STAYS ON 127.0.0.1 — criterion R3's last clause.
   *
   * Read off the kernel rather than off the settings: the question is what this process bound, and a
   * declaration cannot answer it. Every listening socket the process holds is checked, not the one
   * we know about, because the fault this guards against is a door somebody opened without saying.
   *
   * THE SERVER THIS READS WAS STARTED WITH `none` IN ITS OWN ENVIRONMENT, so what it declares is
   * what this test declared and not what the checkout's `.env` happens to say. See the note beside
   * that value above for what it cost to leave it to absence.
   */
  it('opens nothing but loopback when its own environment says none', async () => {
    const answered = await fetch(`http://127.0.0.1:${String(unsetPort)}/api/runtime`, {
      headers: { 'x-mole-office-workspace': 'default' },
    })
    const record = (await answered.json()) as RuntimeRecord
    expect(record.addresses.forOtherMachines, 'a scratch stack claimed an address for other machines').toBe(null)

    const sockets = readFileSync('/proc/net/tcp', 'utf8')
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((fields) => fields.length > 3 && fields[3] === '0A')
      .map((fields) => (fields[1] ?? '').split(':'))
      .filter(([, hex]) => Number.parseInt(hex ?? '0', 16) === unsetPort)
    expect(sockets.length, `nothing is listening on ${String(unsetPort)}`).toBeGreaterThan(0)
    for (const [address] of sockets) {
      // Little-endian hex of 127.0.0.1. Anything else on this port is a door nobody declared.
      expect(address, `port ${String(unsetPort)} is bound to something that is not 127.0.0.1`).toBe('0100007F')
    }

    // And nothing answers on the second address, because nothing was told to listen there.
    await expect(
      fetch(`http://${SECOND_ADDRESS}:${String(unsetPort)}/api/health`, {
        headers: { 'x-mole-office-workspace': 'default' },
        signal: AbortSignal.timeout(3000),
      }),
    ).rejects.toThrow()
  })
})
