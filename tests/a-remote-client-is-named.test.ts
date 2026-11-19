// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION R3: A REMOTE CLIENT IS NAMED.
 *
 * `design/ground/ACCEPTANCE.md` section 7: *the runtime record and the listeners tool name the
 * clients that reached the API from off the machine (address, when, how many requests) without
 * storing anything a person did not do; a scratch stack is never reachable from off the machine
 * unless its declaration says so.*
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING NEW IS STORED, SO THE TEST IS THAT THE READ IS RIGHT
 * ---------------------------------------------------------------------------------------
 *
 * `api_calls` has held `client_addr` and `client_origin` since the recorder was built. This is a
 * read over them, so what can be wrong is the reading: counting local calls as remote ones, losing a
 * call whose address nobody could read, or naming an address that is a proxy on this computer rather
 * than the machine that called.
 *
 * The last of those is the one this build could have got wrong. There are two doors for another
 * machine and `req.ip` means opposite things on them: on the loopback door a private network daemon
 * passes requests through, the socket carries the daemon, and the caller is in `x-forwarded-for`; on
 * the door bound to the address other machines reach this computer at, nothing is in between and the
 * socket carries the caller. `stampArrival` takes both facts, and the two tests at the bottom hold
 * the two halves apart.
 *
 * The scratch-stack clause of R3 is proved in
 * `tests/another-machine-reaches-the-same-world.test.ts`, against the kernel's own list of listening
 * sockets, because it is a statement about every socket a process opened rather than about a call.
 */
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { desc } from 'drizzle-orm'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { apiCalls } from '../src/server/db/schema.ts'

let t: TestDb
let app: FastifyInstance
/** The door a network daemon passes requests through: on loopback, the socket carries the daemon. */
let throughAProxy = ''
/** The door bound to the address other machines reach this computer at: the socket carries them. */
let straightHere = ''
const open: Server[] = []

async function listenOn(server: Server): Promise<string> {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
  open.push(server)
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  // THE CALL LOG IS THE WHOLE OFFICE THIS FILE READS, and it is a log rather than a record table:
  // each case's reading must see only the calls that case made. Clearing it here is what a fresh
  // database gave each case before, and the reading below still runs over every row that is there.
  t.client.sqlite.exec('DELETE FROM api_calls')
  const { stampArrival } = await import('../src/server/lib/http.ts')
  throughAProxy = await listenOn(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'a proxy on this computer')
      app.routing(raw, res)
    }),
  )
  straightHere = await listenOn(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
})

afterEach(async () => {
  for (const server of open.splice(0)) await new Promise<void>((done) => server.close(() => done()))
})

const head = { 'x-mole-office-workspace': 'default' }

async function readTheClients(): Promise<
  { address: string | null; requests: number; firstAt: string; lastAt: string }[]
> {
  const { clientsFromOtherMachines } = await import('../src/server/lib/usage-reads.ts')
  return clientsFromOtherMachines()
}

describe('who reached this API from off this machine', () => {
  it('says nobody has when nobody has, which is what every machine says until one does', async () => {
    // Local calls only, and several of them, so an empty answer cannot be an empty call log.
    for (let i = 0; i < 4; i += 1) await app.inject({ method: 'GET', url: '/api/health', headers: head })
    const rows = t.client.db.select().from(apiCalls).all()
    expect(rows.length, 'no calls were recorded at all, so this proves nothing').toBeGreaterThan(0)
    expect(await readTheClients()).toEqual([])
  })

  it('counts a call through a door for another machine and never a local one', async () => {
    for (let i = 0; i < 3; i += 1) await fetch(`${straightHere}/api/health`, { headers: head })
    // Local calls on the ordinary door must not appear, however many there are.
    for (let i = 0; i < 5; i += 1) await app.inject({ method: 'GET', url: '/api/health', headers: head })

    const clients = await readTheClients()
    const total = clients.reduce((sum, one) => sum + one.requests, 0)
    expect(total, 'the local calls were counted as coming from another machine').toBe(3)
    expect(clients).toHaveLength(1)
    expect(clients[0]?.requests).toBe(3)
    expect(clients[0]?.firstAt, 'a first time is part of what R3 asks for').toBeTruthy()
    expect(clients[0]?.lastAt).toBeTruthy()
    expect((clients[0]?.lastAt ?? '') >= (clients[0]?.firstAt ?? '')).toBe(true)
  })

  it('names the caller on the door bound to the address other machines reach, from the socket', async () => {
    await fetch(`${straightHere}/api/health`, { headers: head })
    const clients = await readTheClients()
    // The socket's peer, because nothing stands between that door and the machine that called. Read
    // back from the row rather than asserted from the door, so the value is the one that was stored.
    const row = t.client.db.select().from(apiCalls).orderBy(desc(apiCalls.atMs)).limit(1).all()[0]
    expect(row?.clientOrigin).toBe('remote')
    expect(row?.clientAddr, 'the address of a caller with no proxy in between was thrown away').toBe('127.0.0.1')
    expect(clients.map((one) => one.address)).toEqual(['127.0.0.1'])
  })

  it('does not call a proxy on this computer the caller', async () => {
    // No forwarded header, so nothing on the way here said who called. Null is the honest answer and
    // `127.0.0.1` would be the one thing that is certainly false: it would name this machine as the
    // one that called from somewhere else.
    await fetch(`${throughAProxy}/api/health`, { headers: head })
    const row = t.client.db.select().from(apiCalls).orderBy(desc(apiCalls.atMs)).limit(1).all()[0]
    expect(row?.clientOrigin).toBe('remote')
    expect(row?.clientAddr).toBe(null)
    const clients = await readTheClients()
    expect(clients.map((one) => one.address)).toEqual([null])
  })

  it('believes a proxy that says who called, and takes the nearest value', async () => {
    await fetch(`${throughAProxy}/api/health`, {
      headers: { ...head, 'x-forwarded-for': '203.0.113.9, 192.0.2.20' },
    })
    const clients = await readTheClients()
    expect(clients.map((one) => one.address)).toEqual(['192.0.2.20'])
  })

  it('keeps an address nobody could read as its own row, so the total is not quietly short', async () => {
    await fetch(`${throughAProxy}/api/health`, { headers: head })
    await fetch(`${throughAProxy}/api/health`, { headers: { ...head, 'x-forwarded-for': '192.0.2.20' } })
    await fetch(`${straightHere}/api/health`, { headers: head })
    const clients = await readTheClients()
    expect(clients.reduce((sum, one) => sum + one.requests, 0), 'a remote call went missing from the count').toBe(3)
    expect(new Set(clients.map((one) => one.address))).toEqual(new Set([null, '192.0.2.20', '127.0.0.1']))
  })
})

/**
 * AND THE SAME THING THROUGH THE DOOR THE PRODUCT REALLY OPENS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS ON TOP OF EVERYTHING ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * Every test above builds its own listener and calls `stampArrival` by hand, so what is under test
 * is `callerAddressOf`'s handling of the two words. Which word the real door passes was never under
 * test. Measured on 4 September 2026 by the seventh verifier: change
 * `serveTheAddressForOtherMachines` to pass `a proxy on this computer` instead of `the caller`, and
 * this file stayed green 8 of 8 while a running server recorded three requests from `127.0.0.2` as
 * `{ address: null }` — R3 broken, with nothing failing. Problem `HmFM3B8A7k12`.
 *
 * So this calls the real function, opens the real socket, and connects to it from the address the
 * door is on. The address that comes back is measured off that socket by the product, not handed to
 * it by this test.
 *
 * IT DOES NOT SPAWN A SERVER. `serveTheAddressForOtherMachines` is exported and takes the app, so
 * the door under test is the one `npm start` opens, opened here in this process. A subprocess would
 * add four seconds and prove nothing more.
 */
describe('the door the product really opens says who called', () => {
  /** A second address on this machine, so the caller is not the same address as the connection. */
  const SECOND_ADDRESS = '127.0.0.2'

  /** One request to `host:port`, sent FROM `from`, because whose address is recorded is the subject. */
  function callFrom(from: string, host: string, port: number, path: string): Promise<void> {
    return new Promise((done, fail) => {
      const req = request({ host, port, path, method: 'GET', localAddress: from, headers: head }, (res) => {
        res.resume()
        res.once('end', () => done())
      })
      req.once('error', fail)
      req.end()
    })
  }

  it('names the machine that connected to it, read off the socket the real door opened', async () => {
    const { serveTheAddressForOtherMachines } = await import('../src/server/index.ts')
    const door = await serveTheAddressForOtherMachines(app, 0, SECOND_ADDRESS)
    try {
      const port = (door.address() as AddressInfo).port
      for (let i = 0; i < 3; i += 1) await callFrom(SECOND_ADDRESS, SECOND_ADDRESS, port, '/api/health')
      const clients = await readTheClients()
      expect(clients).toHaveLength(1)
      // THE ADDRESS, and it is the caller's rather than the door's, which is why the call is made
      // from 127.0.0.2 and not from 127.0.0.1. A door that told the recorder a proxy was in the way
      // would store null here, and a door that read a header instead of the socket would too.
      expect(clients[0]?.address, 'the real door did not say the socket carries the caller').toBe(SECOND_ADDRESS)
      expect(clients[0]?.requests).toBe(3)
      expect(clients[0]?.firstAt).toBeTruthy()
      expect(clients[0]?.lastAt).toBeTruthy()
      // AND NOTHING ELSE ABOUT THEM IS KEPT — R3 says so in as many words. The row holds the address
      // and the origin, and the rest of the call log is about the call and not about the caller.
      const row = t.client.db.select().from(apiCalls).orderBy(desc(apiCalls.atMs)).limit(1).all()[0]
      expect(row?.clientOrigin).toBe('remote')
      expect(row?.clientAddr).toBe(SECOND_ADDRESS)
    } finally {
      await new Promise<void>((done) => door.close(() => done()))
    }
  })

  it('does not believe a header when it can see the socket, because the socket cannot be typed', async () => {
    const { serveTheAddressForOtherMachines } = await import('../src/server/index.ts')
    const door = await serveTheAddressForOtherMachines(app, 0, SECOND_ADDRESS)
    try {
      const port = (door.address() as AddressInfo).port
      await new Promise<void>((done, fail) => {
        const req = request(
          {
            host: SECOND_ADDRESS,
            port,
            path: '/api/health',
            method: 'GET',
            localAddress: SECOND_ADDRESS,
            // A caller claiming to be somewhere else. On this door nothing is in the way, so the
            // claim is not read at all: an audit line naming a machine anybody could type would be
            // worth less than no audit line.
            headers: { ...head, 'x-forwarded-for': '198.51.100.4' },
          },
          (res) => {
            res.resume()
            res.once('end', () => done())
          },
        )
        req.once('error', fail)
        req.end()
      })
      const clients = await readTheClients()
      expect(clients.map((one) => one.address)).toEqual([SECOND_ADDRESS])
    } finally {
      await new Promise<void>((done) => door.close(() => done()))
    }
  })
})

describe('the runtime record and the listeners report name the same clients, from the same read', () => {
  it('both carry the list, and neither has a query of its own', async () => {
    await fetch(`${straightHere}/api/health`, { headers: head })
    const runtime = await app.inject({ method: 'GET', url: '/api/runtime', headers: head })
    const listeners = await app.inject({ method: 'GET', url: '/api/runtime/listeners', headers: head })
    const fromRuntime = runtime.json<{ fromOtherMachines: unknown[] }>().fromOtherMachines
    const fromListeners = listeners.json<{ fromOtherMachines: unknown[] }>().fromOtherMachines
    expect(fromRuntime).toEqual(fromListeners)
    expect(fromRuntime).toHaveLength(1)
  })

  it('is empty on a stack nothing has reached from elsewhere, rather than absent', async () => {
    const runtime = await app.inject({ method: 'GET', url: '/api/runtime', headers: head })
    const record = runtime.json<{ fromOtherMachines: unknown[] }>()
    expect(Array.isArray(record.fromOtherMachines), 'the field is missing, so a reader cannot tell').toBe(true)
    expect(record.fromOtherMachines).toEqual([])
  })
})
