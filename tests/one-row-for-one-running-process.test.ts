// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LIVE LEDGER ROW FOR ONE RUNNING PROCESS, WHOEVER ASKED FOR IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `LYOhZtHE97Vj`, found by the third GROUND verifier on 4 September 2026. A server writes
 * itself into the ledger when it starts, under a session record it files for itself.
 * `POST /api/runtime/register` writes the same server down again, under the CALLER's session. The
 * only guard against two rows for one thing compared the session, so the two never met: one scratch
 * API ended up with two live rows for its pid and two for its port — four rows for one server — and
 * `tests/helpers.ts` makes exactly that call for every server `liveApp` starts.
 *
 * The ledger is the answer to what is running on this machine, and the orphan report is built to
 * read two rows for one thing as two orphans. So the list double-counted, and the thing it
 * double-counted was every test server this repository starts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A server that has registered itself, then a call to the route from a different session, leaves
 *    ONE live row. The route hands back the row that is already there.
 * 2. The row keeps its owner — the session that started the thing — and the second registrar is
 *    written into the change log, so the ledger can still say who else claimed it.
 * 3. A row with no world gets one filled in, which is still the only way a row written before
 *    servers could speak for themselves ever gets one.
 * 4. A row about a process that has GONE is a different case and still behaves as it did: a port
 *    row left by a process that has died is closed, and a fresh row is written for the process
 *    holding that port now.
 *
 * Point 4 is the control for points 1 to 3. Without it, "never write a second row for this key"
 * would pass by never writing a row at all.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:net'
import { AGENT, commandThatStopsWithItsOwner, freshDb, one, type TestDb } from './helpers.ts'
import type { LedgerEntry } from '../src/server/lib/resources.ts'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * ONE OFFICE FOR THE FILE. Every case here reads the ledger from empty, and `anEmptyLedger` gives
 * it that before the case runs, exactly as a database of its own did. The sessions and the server
 * are made once.
 */
let officeT: TestDb
let officeApp: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>

beforeAll(async () => {
  officeT = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  officeApp = await apiApp()
}, 60_000)

afterAll(async () => {
  await officeApp.app.close()
  officeT.close()
})

/** The ledger rows a case finds gone before it runs, and the modules the code reaches for point at this office. */
function anEmptyLedger(): void {
  process.env['MOLE_OFFICE_DB'] = officeT.file
  officeT.client.sqlite.prepare('DELETE FROM session_resources').run()
}


describe('a second registration of a live process writes no second row', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
  /** The session the server files for itself when it starts. */
  let theServersOwnSession: string
  /** Somebody else's session, which is what the route is called with. */
  let anotherSession: string
  let listener: Server | null = null
  let child: ChildProcess | null = null

  beforeEach(async () => {
    t = officeT
    app = officeApp
    anEmptyLedger()
    const file = (title: string): string =>
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title,
        data: { state: 'running' },
        actor: AGENT,
      }).id
    theServersOwnSession = file('the session the API server filed for itself')
    anotherSession = file('the session that called the route')
  })

  afterEach(async () => {
    if (listener !== null) await new Promise<void>((done) => { listener?.close(() => { done() }) })
    listener = null
    if (child?.pid !== undefined && child.pid !== null) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    child = null
  })

  const headers = (session: string): Record<string, string> => ({
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest',
    'x-mole-office-session': session,
    'x-mole-office-workspace': 'default',
  })

  /** What the server itself does on start, which is the same function the route calls. */
  async function theServerRegistersItself(): Promise<LedgerEntry[]> {
    const { registerThisServer } = await import('../src/server/lib/register-this-server.ts')
    return registerThisServer({
      workspaceId: 'default',
      sessionRecordId: theServersOwnSession,
      actor: { type: 'agent', id: 'mole-office/the-api-server' },
    }).resources
  }

  /** Every live row in the ledger, as a person reading the list would see them. */
  async function liveRows(): Promise<LedgerEntry[]> {
    const res = await app.app.inject({ method: 'GET', url: '/api/resources', headers: headers(anotherSession) })
    expect(res.statusCode, res.body).toBe(200)
    return (res.json() as { resources: LedgerEntry[] }).resources
  }

  it('leaves one row after the server registered itself and the route was called by somebody else', async () => {
    const mine = await theServerRegistersItself()
    const written = one(mine.filter((r) => r.type === 'process'), 'the row the server wrote for itself')
    expect(written.sessionRecordId).toBe(theServersOwnSession)

    const said = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: headers(anotherSession),
      payload: { detail: 'the API a browser test started' },
    })
    expect(said.statusCode, said.body).toBe(201)

    // THE SAME ROW HANDED BACK, not a second one written beside it.
    const handedBack = one(
      (said.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the process row in the route reply',
    )
    expect(handedBack.id).toBe(written.id)

    // AND ONE ROW IN THE LEDGER. This is the count that was four.
    const forThisProcess = (await liveRows()).filter((r) => r.type === 'process' && r.key === String(process.pid))
    expect(forThisProcess).toHaveLength(1)
    expect(forThisProcess[0]?.id).toBe(written.id)
  })

  it('and a third registration writes nothing either', async () => {
    await theServerRegistersItself()
    for (const session of [anotherSession, theServersOwnSession, anotherSession]) {
      const said = await app.app.inject({
        method: 'POST',
        url: '/api/runtime/register',
        headers: headers(session),
        payload: {},
      })
      expect(said.statusCode, said.body).toBe(201)
    }
    const forThisProcess = (await liveRows()).filter((r) => r.type === 'process' && r.key === String(process.pid))
    expect(forThisProcess).toHaveLength(1)
  })

  it('keeps the owner the session that started it, and writes the second registrar into the change log', async () => {
    const written = one((await theServerRegistersItself()).filter((r) => r.type === 'process'), 'the row')
    await app.app.inject({ method: 'POST', url: '/api/runtime/register', headers: headers(anotherSession), payload: {} })

    // THE OWNER IS UNCHANGED. "Has the owner ended" is the question this ledger answers, and the
    // second registrar did not start the process.
    const row = one(
      (await liveRows()).filter((r) => r.type === 'process' && r.key === String(process.pid)),
      'the row',
    )
    expect(row.sessionRecordId).toBe(theServersOwnSession)
    expect(row.id).toBe(written.id)

    // AND THE SECOND CLAIM IS WRITTEN DOWN, on the session record that owns the row.
    const changes = await app.app.inject({
      method: 'GET',
      url: `/api/changes?recordId=${theServersOwnSession}`,
      headers: headers(anotherSession),
    })
    expect(changes.statusCode, changes.body).toBe(200)
    const said = JSON.stringify((changes.json() as { changes: unknown[] }).changes)
    expect(said).toContain('registered again by')
    expect(said).toContain(anotherSession)
  })

  it('still fills in the world on a row that has none, rather than writing a row beside it', async () => {
    // A ROW WRITTEN BY SOMEBODY ELSE, THE WAY THEY WERE WRITTEN BEFORE SERVERS COULD SPEAK.
    const plain = await app.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: headers(anotherSession),
      payload: { type: 'process', key: String(process.pid), detail: 'written down by an agent', adopting: 'this test process started before the session the test filed for it' },
    })
    expect(plain.statusCode, plain.body).toBe(201)
    const written = (plain.json() as { resource: LedgerEntry }).resource
    expect(written.world).toBeNull()

    const filled = one((await theServerRegistersItself()).filter((r) => r.type === 'process'), 'the row')
    expect(filled.id).toBe(written.id)
    expect(filled.world).not.toBeNull()
    const forThisProcess = (await liveRows()).filter((r) => r.type === 'process' && r.key === String(process.pid))
    expect(forThisProcess).toHaveLength(1)
  })
})

/**
 * THE CONTROL: A PORT WHOSE HOLDER HAS GONE IS A DIFFERENT PROCESS, AND STILL GETS A NEW ROW.
 *
 * A rule that never wrote a second row for a key would pass every test above and be useless, because
 * a port changes hands: the row a dead process left is a claim about a number somebody else holds
 * now. That row is closed — its process has gone — and a fresh one is written for the holder.
 *
 * It uses a real child process holding a real port, because the identity of a row is a pid AND the
 * moment that pid started, and neither can be faked convincingly enough to be worth the doubt.
 */
describe('a port whose holder has gone is closed, and the process holding it now gets its own row', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
  let session: string
  let listener: Server | null = null
  let child: ChildProcess | null = null

  beforeEach(async () => {
    t = officeT
    app = officeApp
    anEmptyLedger()
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the session that registered the port',
      data: { state: 'running' },
      actor: AGENT,
    }).id
  })

  afterEach(async () => {
    if (listener !== null) await new Promise<void>((done) => { listener?.close(() => { done() }) })
    listener = null
    if (child?.pid !== undefined && child.pid !== null) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    child = null
  })

  const headers = (): Record<string, string> => ({
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest',
    'x-mole-office-session': session,
    'x-mole-office-workspace': 'default',
  })

  it('closes the dead process’s row and writes a new one for this process', async () => {
    // A CHILD PROCESS TAKES A PORT, and the ledger is told about it while it is alive, which is
    // when the ledger can read its group and its start time.
    const port = await new Promise<number>((resolve, reject) => {
      const probe = createServer()
      probe.on('error', reject)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        if (address === null || typeof address === 'string') {
          probe.close(() => { reject(new Error('the probe socket reported no port')) })
          return
        }
        const { port: got } = address
        probe.close(() => { resolve(got) })
      })
    })

    const watched = commandThatStopsWithItsOwner(
      process.execPath,
      ['-e', `require('net').createServer().listen(${String(port)}, '127.0.0.1', () => {})`],
    )
    child = spawn(watched.command, watched.args, { detached: true, stdio: 'ignore' })
    // Wait for the child to be visible as the holder of that port, which is what the ledger reads.
    const { osProbe } = await import('../src/server/lib/resources.ts')
    const stop = Date.now() + 20_000
    let holder: number | null = null
    while (Date.now() < stop && holder === null) {
      holder = osProbe().listeningPorts().find((p) => p.port === port)?.pid ?? null
      if (holder === null) await sleep(100)
    }
    expect(holder, 'the child never took the port, so there is nothing to register').toBe(child.pid)

    const registered = await app.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: headers(),
      payload: { type: 'port', key: String(port), detail: 'a port the child holds' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const dead = (registered.json() as { resource: LedgerEntry }).resource
    expect(dead.osStartedAt, 'the row has to carry the holder’s start time, or it identifies nothing').not.toBeNull()

    // THE CHILD DIES AND THIS PROCESS TAKES THE PORT.
    const dying = child
    process.kill(-(child.pid as number), 'SIGKILL')
    child = null
    while (dying.exitCode === null && dying.signalCode === null) await sleep(10)
    listener = createServer()
    await new Promise<void>((done, fail) => {
      listener?.on('error', fail)
      listener?.listen(port, '127.0.0.1', () => { done() })
    })

    const said = await app.app.inject({ method: 'POST', url: '/api/runtime/register', headers: headers(), payload: {} })
    expect(said.statusCode, said.body).toBe(201)

    const live = await app.app.inject({ method: 'GET', url: '/api/resources', headers: headers() })
    const rows = (live.json() as { resources: LedgerEntry[] }).resources.filter(
      (r) => r.type === 'port' && r.key === String(port),
    )
    // ONE LIVE ROW, and it is not the dead one.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).not.toBe(dead.id)

    // And the dead one is closed, with the reason written on it rather than merely gone.
    const all = await app.app.inject({
      method: 'GET',
      url: '/api/resources?includeReleased=true',
      headers: headers(),
    })
    const closed = (all.json() as { resources: LedgerEntry[] }).resources.find((r) => r.id === dead.id)
    expect(closed?.releasedAt).not.toBeNull()
    expect(closed?.releaseNote).toContain('has gone')
  }, 60_000)
})

/**
 * A RESTART LEAVES ONE LIVE ROW, NOT ONE FOR EVERY RUN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The fifth GROUND verifier counted 28 rows in its world at the end of one twenty-five minute run
 * of `npm run dev`, 27 of them processes, and three of those processes alive. Twenty-four rows were
 * about pids that had gone. On the owner's own ledger on 4 September 2026 there were 181 such rows,
 * 160 of them written that day, by the owner's API server and browser app.
 *
 * The cause is that a `tsx watch` restart is a new pid. The closing above only ever looked at rows
 * carrying the same key as one the server was about to write, so the row the old pid left was never
 * read. The port row was closed, because a port number does not change; the process row was not.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT STANDS IN FOR WHAT
 * ---------------------------------------------------------------------------------------
 *
 * REAL: a child process, its pid, its start time, its death, and the machine's answer about it
 * afterwards. Nothing about liveness is faked, because a pid and the moment it started are the
 * whole identity of a row and a made-up one would prove nothing.
 *
 * STANDS IN: the row for the earlier run is written through `POST /api/resources` rather than by a
 * second copy of this server, and it is given the world this server would write. That is the same
 * row in the same table with the same three facts — type, key and world — and it is the shape the
 * browser app's own registration takes.
 */
describe('a restart leaves one live row for the server, not one for every run', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
  let session: string
  let child: ChildProcess | null = null
  /**
   * THE CODE THESE TWO CASES REACH FOR, imported once against this office rather than inside a case,
   * so a reading here and the server's own writing come from the same module instance.
   */
  let worldNow: typeof import('../src/server/lib/runtime.ts').worldNow
  let theWorldThisProcessAnswersIn: typeof import('../src/server/lib/world.ts').theWorldThisProcessAnswersIn
  let formatWorldHeader: typeof import('../src/config/world-header.mjs').formatWorldHeader
  let osProbe: typeof import('../src/server/lib/resources.ts').osProbe
  let registerThisServer: typeof import('../src/server/lib/register-this-server.ts').registerThisServer

  beforeAll(async () => {
    t = officeT
    app = officeApp
    ;({ worldNow } = await import('../src/server/lib/runtime.ts'))
    ;({ theWorldThisProcessAnswersIn } = await import('../src/server/lib/world.ts'))
    ;({ formatWorldHeader } = await import('../src/config/world-header.mjs'))
    ;({ osProbe } = await import('../src/server/lib/resources.ts'))
    ;({ registerThisServer } = await import('../src/server/lib/register-this-server.ts'))
  }, 60_000)

  beforeEach(() => {
    anEmptyLedger()
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the session the run before this one filed',
      data: { state: 'running' },
      actor: AGENT,
    }).id
  })

  afterEach(() => {
    if (child?.pid !== undefined && child.pid !== null) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    child = null
  })

  const headers = (): Record<string, string> => ({
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest',
    'x-mole-office-session': session,
    'x-mole-office-workspace': 'default',
  })

  it('closes the row the run before it left, and leaves one live process row', async () => {
    const world = worldNow()
    const onTheWire = formatWorldHeader(theWorldThisProcessAnswersIn())
    // WITHOUT A PORT ON THE WORLD there is nothing to match rows against and this test would pass
    // by doing nothing at all.
    expect(world.port, 'the world this server writes has to name a port').not.toBeNull()

    // THE RUN BEFORE THIS ONE: a real process, written down while it is alive, which is when the
    // ledger can read its group and its start time.
    child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { detached: true, stdio: 'ignore' })
    const pidOfTheRunBefore = child.pid as number
    const earlier = await app.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: headers(),
      payload: {
        type: 'process',
        key: String(pidOfTheRunBefore),
        detail: 'the Mole Office API server, one run ago',
        world: onTheWire,
      },
    })
    expect(earlier.statusCode, earlier.body).toBe(201)
    const before = (earlier.json() as { resource: LedgerEntry }).resource
    expect(before.world?.port, 'the row has to carry the port, which is what says which stack it was').toBe(world.port)
    expect(before.osStartedAt, 'the row has to carry the start time, or it identifies nothing').not.toBeNull()

    // IT ENDS, and the machine is asked until it says so rather than a sleep being trusted.
    const ended = new Promise<void>((done) => { child?.once('exit', () => { done() }) })
    process.kill(-pidOfTheRunBefore, 'SIGKILL')
    await ended
    child = null
    const stop = Date.now() + 20_000
    while (Date.now() < stop && osProbe().processById(pidOfTheRunBefore) !== null) await sleep(100)
    expect(osProbe().processById(pidOfTheRunBefore), 'the run before this one is still running').toBeNull()

    // THE NEXT START.
    const written = registerThisServer({
      workspaceId: 'default',
      sessionRecordId: session,
      actor: { type: 'agent', id: 'mole-office/the-api-server' },
    })
    expect(written.closed, 'the next start says which rows it closed').toContain(before.id)

    // ONE LIVE PROCESS ROW, and it is this process's.
    const live = await app.app.inject({ method: 'GET', url: '/api/resources', headers: headers() })
    expect(live.statusCode, live.body).toBe(200)
    const rows = (live.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.key).toBe(String(process.pid))

    // AND THE OLD ROW IS CLOSED WITH THE REASON ON IT, rather than merely absent from a list.
    const all = await app.app.inject({
      method: 'GET',
      url: '/api/resources?includeReleased=true',
      headers: headers(),
    })
    const closed = (all.json() as { resources: LedgerEntry[] }).resources.find((r) => r.id === before.id)
    expect(closed?.releasedAt).not.toBeNull()
    expect(closed?.releaseNote).toContain('the process ended and the next start found it gone')
    expect(closed?.releaseNote).toContain(String(pidOfTheRunBefore))
  }, 60_000)

  /**
   * THE CONTROL: A LIVE PROCESS IN THE SAME WORLD IS LEFT ALONE.
   *
   * Without this, "close every process row in my world" would pass by closing everything, and the
   * ledger would forget the other half of a running dev stack every time the API restarted.
   */
  it('leaves a row alone while its process is still running', async () => {
    const onTheWire = formatWorldHeader(theWorldThisProcessAnswersIn())

    child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { detached: true, stdio: 'ignore' })
    const registered = await app.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: headers(),
      payload: {
        type: 'process',
        key: String(child.pid),
        detail: 'the browser app of this same stack, still running',
        world: onTheWire,
      },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const alive = (registered.json() as { resource: LedgerEntry }).resource

    const written = registerThisServer({
      workspaceId: 'default',
      sessionRecordId: session,
      actor: { type: 'agent', id: 'mole-office/the-api-server' },
    })
    expect(written.closed).not.toContain(alive.id)

    const live = await app.app.inject({ method: 'GET', url: '/api/resources', headers: headers() })
    const rows = (live.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process')
    expect(rows.map((r) => r.key).sort()).toEqual([String(child.pid), String(process.pid)].sort())
  }, 60_000)
})
