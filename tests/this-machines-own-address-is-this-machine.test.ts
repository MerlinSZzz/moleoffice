// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST FROM ONE OF THIS MACHINE'S OWN ADDRESSES IS THIS MACHINE, BY THE CONNECTION'S ADDRESS ONLY.
 *
 * The owner's decision of 25 September 2026, with problem W770pR65Vnkq. The owner opened the
 * office on this machine at its tailnet address, and it treated them as another machine. Now the door bound to the
 * address other machines reach stamps a request as this machine when the socket's own address is one of this machine's
 * addresses. The door a network daemon passes requests through never does, because there the caller's address is only
 * in a forwarded header.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE MAKES A CONNECTION FROM AN ADDRESS OF THIS MACHINE, WITH NO NETWORK AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The door under test is the product's own, opened with `serveTheAddressForOtherMachines`, on
 * 127.0.0.2 as the other tests of this door do. A request is sent to it FROM 127.0.0.3, a socket bound
 * to that address with `localAddress`. The kernel keeps it as the connection's source, so the product
 * reads it off the socket. Every address here is on loopback, so the file runs the same on a machine
 * with no network interface but loopback, which is how the merge queue's container is (its entry
 * HWrLi4PFQatX bounced on 26 September 2026 because this file then needed a real interface).
 *
 * Which addresses count as this machine's is set by this file through the probe, over the real one:
 * `ownAddresses` is the one method replaced. Naming 127.0.0.3 there stands in for an address like the
 * tailnet's. That proves the rule, because the rule asks nothing but the probe's list: the probe is
 * where loopback is left out, by the operating system's own flag (`internal`), and the real probe's
 * answer is tested on its own below. So the same connection is this machine's in one test and another
 * machine's in the next, and the difference is only the list the probe gives.
 *
 * Every answer is read from GET /api/access, whose `caller.from` is the listener's stamp, and one test
 * drives the pairing press, an act kept on this machine.
 */

import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { OsProbe } from '../src/server/lib/resources.ts'

/** The door's own address, a second loopback address, as the other tests of this door use. */
const THE_DOORS_ADDRESS = '127.0.0.2'

/** An address the probe may name that is certainly not the one this file connects from. */
const SOMEBODY_ELSES = '192.0.2.44'

let t: TestDb | undefined
let app: FastifyInstance | undefined
/**
 * THE ADDRESS A REQUEST IS SENT FROM, standing in for one of this machine's own addresses such as its
 * tailnet address. A loopback address, so that no network interface is needed: see the header.
 */
const ownAddress = '127.0.0.3'
/**
 * The operating system layer, imported after `freshDb` has named this file's own database: importing
 * it opens the database, and before that it would open the one `.env` names.
 */
let resources: typeof import('../src/server/lib/resources.ts') | undefined

/** The app `beforeAll` started. A test that runs without it says so. */
function theApp(): FastifyInstance {
  if (app === undefined) throw new Error('the app was not started, so there is nothing to ask')
  return app
}

/** Replace only the list of this machine's own addresses; every other answer is the real probe's. */
function theMachineHas(addresses: readonly string[]): void {
  if (resources === undefined) throw new Error('the operating system layer was not loaded')
  const probe = Object.create(resources.LINUX_PROBE) as OsProbe
  probe.ownAddresses = () => addresses
  resources.useOsProbe(probe)
}

beforeAll(async () => {
  t = await freshDb()
  resources = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.ready()
})

afterEach(() => {
  resources?.useOsProbe(resources.LINUX_PROBE)
})

// NOTHING HERE ASSUMES `beforeAll` GOT AS FAR AS IT MEANT TO: a failure there is its own report, and
// this must not add a second one about an app that was never started.
afterAll(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  if (app !== undefined) await app.close()
  t?.close()
})

interface Answer {
  status: number
  body: Record<string, unknown>
  setCookie: string | undefined
}

/** One request to a door, sent FROM `from` (or from whatever the kernel picks, when undefined). */
function ask(
  door: Server,
  input: { from?: string; method?: string; path: string; headers?: Record<string, string> },
): Promise<Answer> {
  const port = (door.address() as AddressInfo).port
  const host = (door.address() as AddressInfo).address
  return new Promise((done, fail) => {
    const req = request(
      {
        host,
        port,
        path: input.path,
        method: input.method ?? 'GET',
        ...(input.from === undefined ? {} : { localAddress: input.from }),
        headers: { 'x-mole-office-workspace': 'default', ...input.headers },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          text += chunk
        })
        res.once('end', () => {
          const cookie = res.headers['set-cookie']
          done({
            status: res.statusCode ?? 0,
            body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
            setCookie: cookie === undefined ? undefined : cookie.join('; '),
          })
        })
      },
    )
    req.once('error', fail)
    req.end()
  })
}

/** Which machine the listener said asked, as GET /api/access reports it. */
async function whichMachine(door: Server, headers: Record<string, string> = {}, from = ownAddress): Promise<unknown> {
  // UNDER AN AGENT'S NAME: from another machine the office does not trust, a request that names nobody and carries no
  // key is refused. Which machine asked is the listener's stamp whoever is named.
  const answer = await ask(door, {
    from,
    path: '/api/access',
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-synthetic-caller', ...headers },
  })
  expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  return (answer.body['caller'] as { from?: unknown } | undefined)?.from
}

async function withTheDoor(
  open: (app: FastifyInstance) => Promise<Server>,
  run: (door: Server) => Promise<void>,
): Promise<void> {
  const door = await open(theApp())
  try {
    await run(door)
  } finally {
    await new Promise<void>((done) => door.close(() => done()))
  }
}

async function theDirectDoor(on: FastifyInstance): Promise<Server> {
  const { serveTheAddressForOtherMachines } = await import('../src/server/index.ts')
  return serveTheAddressForOtherMachines(on, 0, THE_DOORS_ADDRESS)
}

async function theProxyDoor(on: FastifyInstance): Promise<Server> {
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  return listenForOtherMachines(on, 0, '127.0.0.1')
}

describe('the door bound to the address other machines reach', () => {
  it('stamps a connection from one of this machine\'s own addresses as this machine', async () => {
    theMachineHas([ownAddress])
    await withTheDoor(theDirectDoor, async (door) => {
      expect(await whichMachine(door), `a connection from ${ownAddress}, one of this machine's own addresses`).toBe(
        'this machine',
      )
    })
  })

  it('stamps a connection from an address that is not this machine\'s as another machine', async () => {
    // The same connection, from the same address. Only the list of this machine's addresses differs.
    theMachineHas([SOMEBODY_ELSES])
    await withTheDoor(theDirectDoor, async (door) => {
      expect(await whichMachine(door), `a connection from ${ownAddress}, which the machine does not have`).toBe(
        'another machine',
      )
    })
  })

  it('leaves a loopback source as another machine, because the real probe names no loopback address', async () => {
    // The choice on record in the report of wave 13m's own-address piece: loopback has its own door, and a door
    // bound to a loopback address is how the tests stand in for another machine. The real probe
    // leaves out every address the operating system marks as loopback, so 127.0.0.1 is not on it.
    if (resources === undefined) throw new Error('the operating system layer was not loaded')
    const theRealList = resources.LINUX_PROBE.ownAddresses?.() ?? []
    expect(theRealList, 'the real probe named a loopback address').not.toContain('127.0.0.1')
    expect(theRealList, 'the real probe named a loopback address').not.toContain('::1')
    await withTheDoor(theDirectDoor, async (door) => {
      expect(await whichMachine(door, {}, '127.0.0.1'), 'a loopback source on the door bound directly').toBe(
        'another machine',
      )
    })
  })

  it('offers pairing, an act kept on this machine, to a browser at one of this machine\'s own addresses', async () => {
    theMachineHas([ownAddress])
    await withTheDoor(theDirectDoor, async (door) => {
      const offer = await ask(door, { from: ownAddress, path: '/api/office/pairing' })
      expect(offer.status, JSON.stringify(offer.body)).toBe(200)
      expect(offer.body['offered'], 'pairing was not offered at this machine\'s own address').toBe(true)
      const pressed = await ask(door, { from: ownAddress, method: 'POST', path: '/api/office/pairing' })
      expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
      expect(pressed.body['paired']).toBe(true)
      // The cookie's value is the person's key, so only its name is looked at.
      expect(pressed.setCookie?.startsWith('mole-office-key='), 'the press set no pairing cookie').toBe(true)
    })
  })
})

describe('the door a network daemon passes requests through', () => {
  it('stays another machine when a forwarded header names one of this machine\'s own addresses', async () => {
    // The socket's address is this machine's too, which is the daemon's case. Neither it nor the
    // header may make the caller this machine: on this door the caller's address is only in a header.
    theMachineHas([ownAddress, '127.0.0.1'])
    await withTheDoor(theProxyDoor, async (door) => {
      expect(
        await whichMachine(door, { 'x-forwarded-for': ownAddress }),
        'a forwarded header naming this machine\'s own address made the caller this machine',
      ).toBe('another machine')
    })
  })
})
