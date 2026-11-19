// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Only the person may read or type into a terminal. The authorization and authorized-close
 * proofs retain real terminals, a real holder and a real server. Holder status, missing folders
 * and protocol errors use one in-process API with small socket stand-ins.
 */

import { createServer, type AddressInfo } from 'node:net'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AS_AN_AGENT,
  AS_THE_PERSON,
  aPlace as realPlace,
  ask as askTheRealServer,
  groups,
  isAlive,
  openThroughTheHolder,
  readTheStream,
  sleep,
  startAHolder,
  startAServer,
  stopEverything,
  theScreenNow,
  theStreamsScreen,
  until,
  untilTheScreenShows,
  type HeldTerminal,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'
import { THE_HOLDER_PROTOCOL, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let place: Place
let server: ScratchServer

let qualityDb: TestDb
let qualityApp: Awaited<ReturnType<typeof apiApp>>
const inlineWorlds = new Map<string, { place: Place; more: NodeJS.ProcessEnv }>()

function aPlace(name: string): Place {
  const made = realPlace(name)
  if (name === 'doors' || name === 'sbx') return made
  return { ...made, database: qualityDb.file,
    socket: theTerminalHolderSocket(qualityDb.file, made.env),
    log: theTerminalHolderLog(qualityDb.file, made.env) }
}

/** Select a small fixture for the API already built in beforeAll; start no server process. */
async function inlineServer(target: Place, _port?: number, more: NodeJS.ProcessEnv = {}) {
  const api = `inline:${inlineWorlds.size}`
  inlineWorlds.set(api, { place: target, more })
  return { api }
}

async function ask(api: string, path: string, init: Parameters<typeof askTheRealServer>[2] = {}) {
  const fixture = inlineWorlds.get(api)
  if (fixture === undefined) return askTheRealServer(api, path, init)
  const env = { ...fixture.place.env, MOLE_OFFICE_TERMINAL_HOLDER: 'off', ...fixture.more }
  const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]))
  try {
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    const response = await qualityApp.app.inject({ method: (init.method ?? 'GET') as 'GET' | 'POST',
      url: path, headers: init.headers ?? AS_THE_PERSON,
      ...(init.body === undefined ? {} : { payload: init.body as Record<string, unknown> }) })
    return { status: response.statusCode, body: response.json<Record<string, unknown>>() }
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

beforeAll(async () => {
  qualityDb = await freshDb()
  qualityApp = await apiApp()
  await qualityApp.app.ready()
  place = aPlace('doors')
  await startAHolder(place)
  server = await startAServer(place)
  // THE AGENT IS REGISTERED, so its requests reach the terminal doors' own check rather than being
  // refused earlier as an id nothing answers to.
  const registered = await ask(server.api, '/api/agents/started', {
    method: 'POST',
    body: { handle: AS_AN_AGENT['x-mole-office-actor-id'], name: 'Some agent', role: 'worker' },
  })
  if (registered.status !== 201) throw new Error(`The agent could not be registered: ${JSON.stringify(registered.body)}`)
}, 120_000)

beforeEach(() => qualityDb.client.sqlite.exec('SAVEPOINT terminal_case'))
afterEach(() => qualityDb.client.sqlite.exec('ROLLBACK TO terminal_case; RELEASE terminal_case'))
afterAll(async () => {
  await qualityApp.app.close()
  qualityDb.close()
  await stopEverything()
}, 60_000)

/** The terminals the server lists now. */
async function theList(api: string): Promise<HeldTerminal[]> {
  const listed = await ask(api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return (listed.body['terminals'] ?? []) as HeldTerminal[]
}

/** Open a shell as the person, and record its process group. */
async function aShell(api: string): Promise<HeldTerminal> {
  const opened = await ask(api, '/api/terminals', {
    method: 'POST',
    body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'], cols: 80, rows: 24 },
  })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  const terminal = opened.body['terminal'] as HeldTerminal
  groups.add(terminal.pid)
  return terminal
}

describe('the terminal doors', () => {
  it('1: refuse an agent at each of the six doors, the list among them, and nothing happens', async () => {
    const terminal = await aShell(server.api)
    const listBefore = (await theList(server.api)).map((one) => one.id).sort()

    const opened = await ask(server.api, '/api/terminals', {
      method: 'POST',
      headers: AS_AN_AGENT,
      body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'] },
    })
    const theDoorsOwnRefusal = 'Only the person may use the terminal doors of the office'
    // THE LIST IS THE PERSON'S TOO, since round 2: an agent with a key, in a sandbox as well, would
    // otherwise read every terminal's command, arguments and folder, by the coordinator's call.
    const listed = await ask(server.api, '/api/terminals', { headers: AS_AN_AGENT })
    expect(listed.status, JSON.stringify(listed.body)).toBe(403)
    expect(String(listed.body['error'])).toContain(theDoorsOwnRefusal)
    // WITH ITS CODE, so a page draws the refusal in its own language.
    expect(listed.body['code']).toBe('terminalsOnlyThePerson')
    expect(listed.body['terminals']).toBeUndefined()
    expect(opened.status, JSON.stringify(opened.body)).toBe(403)
    expect(String(opened.body['error'])).toContain(theDoorsOwnRefusal)
    const read = await readTheStream(server.api, terminal.id, AS_AN_AGENT)
    expect(read.status, read.refusal).toBe(403)
    expect(read.refusal).toContain(theDoorsOwnRefusal)
    expect(read.events).toEqual([])
    const agentsWords = `AGENT-${randomBytes(8).toString('hex')}`
    const typed = await ask(server.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', headers: AS_AN_AGENT, body: { data: `echo ${agentsWords}\r` } })
    expect(typed.status, JSON.stringify(typed.body)).toBe(403)
    expect(String(typed.body['error'])).toContain(theDoorsOwnRefusal)
    const resized = await ask(server.api, `/api/terminals/${terminal.id}/resize`, { method: 'POST', headers: AS_AN_AGENT, body: { cols: 50, rows: 10 } })
    expect(resized.status, JSON.stringify(resized.body)).toBe(403)
    expect(String(resized.body['error'])).toContain(theDoorsOwnRefusal)
    const closed = await ask(server.api, `/api/terminals/${terminal.id}/close`, { method: 'POST', headers: AS_AN_AGENT, body: {} })
    expect(closed.status, JSON.stringify(closed.body)).toBe(403)
    expect(String(closed.body['error'])).toContain(theDoorsOwnRefusal)

    // NOTHING HAPPENED. No terminal was opened, and this one runs at its own size.
    const listAfter = await theList(server.api)
    expect(listAfter.map((one) => one.id).sort()).toEqual(listBefore)
    const same = listAfter.find((one) => one.id === terminal.id)
    expect(same?.state).toBe('running')
    expect([same?.cols, same?.rows]).toEqual([80, 24])
    expect(isAlive(terminal.pid)).toBe(true)
    // The person types a line after the agent tried. Once its output is on the screen, anything the
    // agent's typing did would be there too, and it is not.
    await ask(server.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data: 'echo person-$((1+1))\r' } })
    const screen = await until(() => theStreamsScreen(server.api, terminal.id), (lines) => lines.includes('person-2'))
    expect(screen).toContain('person-2')
    expect(screen.join('\n')).not.toContain(agentsWords)
  }, 60_000)

  it('2: let the person open, read, type into, resize and close a terminal', async () => {
    const terminal = await aShell(server.api)
    expect((await theList(server.api)).map((one) => one.id)).toContain(terminal.id)
    const typed = await ask(server.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data: 'echo typed-$((3*3))\r' } })
    expect(typed.status, JSON.stringify(typed.body)).toBe(200)
    // READ: the screen, and then output as it comes, on one stream. The stream is opened first, and
    // the line it waits for is typed after.
    const watching = readTheStream(
      server.api,
      terminal.id,
      AS_THE_PERSON,
      (events) => events.some((e) => e.event === 'output' && String(e.data['data']).includes('later-8')),
      10_000,
    )
    await until(() => theStreamsScreen(server.api, terminal.id), (lines) => lines.includes('typed-9'))
    await ask(server.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data: 'echo later-$((4+4))\r' } })
    const streamed = await watching
    expect(streamed.status).toBe(200)
    expect(streamed.events[0]?.event).toBe('screen')
    expect(streamed.events.some((e) => e.event === 'output' && String(e.data['data']).includes('later-8'))).toBe(true)

    // A RESIZE REACHES EVERY READER: a terminal has one size, so a reader that is already reading is told.
    const aReader = readTheStream(server.api, terminal.id, AS_THE_PERSON, (events) => events.some((e) => e.event === 'resized'), 10_000)
    await until(() => theStreamsScreen(server.api, terminal.id), (lines) => lines.length > 0)
    await sleep(300)
    const resized = await ask(server.api, `/api/terminals/${terminal.id}/resize`, { method: 'POST', body: { cols: 100, rows: 30 } })
    expect(resized.status, JSON.stringify(resized.body)).toBe(200)
    const listed = (await theList(server.api)).find((one) => one.id === terminal.id)
    expect([listed?.cols, listed?.rows]).toEqual([100, 30])
    const toldOfTheSize = (await aReader).events.find((e) => e.event === 'resized')
    expect(toldOfTheSize?.data).toEqual({ cols: 100, rows: 30 })

    const closed = await ask(server.api, `/api/terminals/${terminal.id}/close`, { method: 'POST', body: {} })
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(closed.body['wasRunning']).toBe(true)
    expect((await theList(server.api)).map((one) => one.id)).not.toContain(terminal.id)
    expect(await until(() => isAlive(terminal.pid), (alive) => !alive, 5_000)).toBe(false)
  }, 60_000)

  it("3: with no holder running, the list and the health check say why, with the holder's own last line, and opening answers 503", async () => {
    // TURNED OFF: the tests' shared environment says MOLE_OFFICE_TERMINAL_HOLDER=off.
    const off = aPlace('holder-off')
    const offServer = await inlineServer(off)
    const listedOff = await ask(offServer.api, '/api/terminals')
    expect(listedOff.status, JSON.stringify(listedOff.body)).toBe(200)
    expect(listedOff.body['holder']).toEqual({ state: 'off', says: 'No terminal holder runs, because MOLE_OFFICE_TERMINAL_HOLDER is off, so none is started.' })
    expect(listedOff.body['terminals']).toBeNull()
    const healthOff = await ask(offServer.api, '/api/health')
    expect(healthOff.body['ok'], JSON.stringify(healthOff.body)).toBe(true)
    expect(healthOff.body['terminalHolder']).toEqual({ running: false, state: 'off', says: 'No terminal holder runs, because MOLE_OFFICE_TERMINAL_HOLDER is off.' })

    // MEANT TO RUN, AND NOT RUNNING: the holder's log holds its last word, which the list hands on as it is.
    const down = aPlace('holder-down')
    const lastWord = '2026-10-04 05:00:00 the terminal holder could not start: a reason only this test writes'
    mkdirSync(dirname(theTerminalHolderLog(down.database, down.env)), { recursive: true, mode: 0o700 })
    writeFileSync(theTerminalHolderLog(down.database, down.env), `2026-10-04 04:59:59 an earlier line\n${lastWord}\n`)
    const lonely = await inlineServer(down, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on' })
    const listed = await ask(lonely.api, '/api/terminals')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    const holder = listed.body['holder'] as { state: string; says: string; lastWord: string | null }
    expect(holder.state).toBe('not running')
    expect(holder.says).toContain('No terminal holder is running for this office')
    expect(holder.lastWord).toBe(lastWord)
    expect(listed.body).toMatchObject({ holder: { logUnread: null } })
    expect(listed.body['terminals']).toBeNull()
    const health = await ask(lonely.api, '/api/health')
    expect(health.body['ok'], JSON.stringify(health.body)).toBe(true)
    // HEALTH IS ANSWERED TO ANY CALLER, so it says the state in a fixed sentence and never the log's last line,
    // which can name a terminal's command and folder. That line is the person's, on the list door above.
    expect(health.body['terminalHolder']).toEqual({ running: false, state: 'not running', says: 'No terminal holder is running for this office.' })
    expect(JSON.stringify(health.body)).not.toContain('a reason only this test writes')
    const opened = await ask(lonely.api, '/api/terminals', { method: 'POST', body: { folder: down.dir, command: '/bin/bash' } })
    expect(opened.status, JSON.stringify(opened.body)).toBe(503)
    expect(opened.body['code']).toBe('terminalHolderNotRunning')
    expect(existsSync(down.socket)).toBe(false)

    // AND RUNNING: the server of this file, whose holder runs.
    const healthy = await ask(server.api, '/api/health')
    expect((healthy.body['terminalHolder'] as { running: boolean }).running).toBe(true)
  }, 180_000)

  it('4: refuse a folder that is not absolute or not there, and typing into a terminal the holder does not hold', async () => {
    const before = (await theList(server.api)).map((one) => one.id).sort()
    const relative = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: 'not/absolute', command: '/bin/bash' } })
    expect(relative.status, JSON.stringify(relative.body)).toBe(400)
    expect(String(relative.body['error'])).toContain('must be an absolute path')
    const missing = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: join(place.dir, 'not-there'), command: '/bin/bash' } })
    expect(missing.status, JSON.stringify(missing.body)).toBe(400)
    expect(String(missing.body['error'])).toContain('There is no folder at')
    expect((await theList(server.api)).map((one) => one.id).sort()).toEqual(before)
    const nobody = await ask(server.api, '/api/terminals/no-such-terminal/input', { method: 'POST', body: { data: 'x' } })
    expect(nobody.status, JSON.stringify(nobody.body)).toBe(400)
    expect(String(nobody.body['error'])).toContain('holds no terminal')
    expect(nobody.body['code']).toBe('terminalNotHeld')
    // A TERMINAL THAT HAS ENDED refuses typing with its own code.
    const ending = await aShell(server.api)
    await ask(server.api, `/api/terminals/${ending.id}/input`, { method: 'POST', body: { data: 'exit 0\r' } })
    await until(() => theList(server.api), (list) => list.find((one) => one.id === ending.id)?.state === 'ended', 10_000)
    const tooLate = await ask(server.api, `/api/terminals/${ending.id}/input`, { method: 'POST', body: { data: 'echo late\r' } })
    expect(tooLate.status, JSON.stringify(tooLate.body)).toBe(400)
    expect(tooLate.body['code']).toBe('terminalEnded')
  }, 30_000)

  it('6: refuse to type through a holder that speaks other words than the server, and ask it nothing more', async () => {
    // A STAND-IN ON THE HOLDER'S SOCKET, answering hello with another version of the holder's words and
    // writing down every other request it is sent. A holder half understood could be typed into wrongly.
    const other = aPlace('other-words')
    mkdirSync(dirname(other.socket), { recursive: true, mode: 0o700 })
    const asked: string[] = []
    const standIn = createServer((socket) => {
      socket.setEncoding('utf8')
      let pending = ''
      socket.on('data', (chunk: string) => {
        pending += chunk
        for (let newline = pending.indexOf('\n'); newline >= 0; newline = pending.indexOf('\n')) {
          const request = JSON.parse(pending.slice(0, newline)) as { id: unknown; op: string }
          pending = pending.slice(newline + 1)
          if (request.op === 'hello') {
            socket.write(`${JSON.stringify({ id: request.id, ok: true, protocol: THE_HOLDER_PROTOCOL + 1, pid: process.pid, startedAt: null, database: other.database })}\n`)
          } else {
            asked.push(request.op)
            socket.write(`${JSON.stringify({ id: request.id, ok: true })}\n`)
          }
        }
      })
    })
    await new Promise<void>((done) => standIn.listen(other.socket, () => done()))
    try {
      const otherServer = await inlineServer(other)
      const typed = await ask(otherServer.api, '/api/terminals/any-terminal/input', { method: 'POST', body: { data: 'echo half-understood\r' } })
      expect(typed.status, JSON.stringify(typed.body)).toBe(502)
      expect(typed.body['code']).toBe('terminalHolderUnusable')
      expect(String(typed.body['error'])).toContain(`speaks version ${String(THE_HOLDER_PROTOCOL + 1)}`)
      expect(asked).toEqual([])
    } finally {
      await new Promise<void>((done) => standIn.close(() => done()))
    }
  }, 120_000)
})

describe('a holder that cannot be read', () => {
  it("7: says a log that is there and cannot be read, and calls a holder that does not answer unusable, not missing", async () => {
    // THE LOG IS A FOLDER, so it is there and reading it fails: the list says why, rather than "no log", and
    // the door does not fail with it.
    const unreadable = aPlace('log-unread')
    mkdirSync(theTerminalHolderLog(unreadable.database, unreadable.env), { recursive: true })
    const one = await inlineServer(unreadable, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on' })
    const listed = await ask(one.api, '/api/terminals')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    const holder = listed.body['holder'] as { state: string; lastWord: string | null; logUnread: string | null }
    expect([holder.state, holder.lastWord]).toEqual(['not running', null])
    expect(holder.logUnread).toContain('EISDIR')

    // A HOLDER THAT TAKES THE CONNECTION AND NEVER ANSWERS is there and cannot be used.
    const hung = aPlace('hung')
    mkdirSync(dirname(hung.socket), { recursive: true, mode: 0o700 })
    const held = new Set<import('node:net').Socket>()
    const silent = createServer((socket) => {
      // It takes the connection and says nothing. The connection is kept so the stand-in can end it.
      held.add(socket)
      socket.once('close', () => held.delete(socket))
    })
    await new Promise<void>((done) => silent.listen(hung.socket, () => done()))
    try {
      const two = await inlineServer(hung, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on' })
      const asked = await ask(two.api, '/api/terminals')
      expect(asked.status, JSON.stringify(asked.body)).toBe(200)
      expect((asked.body['holder'] as { state: string }).state).toBe('unusable')
      const health = await ask(two.api, '/api/health')
      expect((health.body['terminalHolder'] as { state: string }).state).toBe('unusable')
    } finally {
      // close() waits for every open connection, and the scratch server goes on asking, so they are ended first.
      const closed = new Promise<void>((done) => silent.close(() => done()))
      for (const socket of held) socket.destroy()
      await closed
    }
  }, 180_000)
})

describe('a request from a sandbox', () => {
  type ResourcesLib = typeof import('../src/server/lib/resources.ts')
  let db: TestDb
  let app: FastifyInstance
  let res: ResourcesLib
  let thisMachine = ''
  let sandboxed: Place
  const before: Record<string, string | undefined> = {}

  beforeAll(async () => {
    db = await freshDb()
    // THE HOLDER OF THIS PROCESS'S DATABASE, with its socket in a folder this test made. The server in
    // this process reads XDG_CONFIG_HOME to find it, so it is set here and put back afterwards.
    const database = process.env['MOLE_OFFICE_DB']
    if (database === undefined) throw new Error('freshDb named no database.')
    sandboxed = { ...aPlace('sbx'), database }
    for (const name of ['XDG_CONFIG_HOME'] as const) {
      before[name] = process.env[name]
      process.env[name] = sandboxed.env[name]
    }
    sandboxed = { ...sandboxed, socket: theTerminalHolderSocket(database, sandboxed.env) }
    await startAHolder(sandboxed)
    res = await import('../src/server/lib/resources.ts')
    app = (await apiApp()).app
    await app.ready()
    await app.listen({ host: '127.0.0.1', port: 0 })
    thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  }, 60_000)

  afterAll(async () => {
    res?.useOsProbe(res.LINUX_PROBE)
    await app?.close()
    db?.close()
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  /** A stand-in machine that answers who sent a connection, and nothing else differently. */
  function aMachineWhereTheSenderIs(inAnotherContainer: boolean): ResourcesLib['LINUX_PROBE'] {
    const probe = Object.create(res.LINUX_PROBE) as ResourcesLib['LINUX_PROBE']
    Object.assign(probe, { senderOfAConnection: () => ({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer }) })
    return probe
  }

  it('5: with the person\'s headers is refused at the input door, and nothing reaches the terminal', async () => {
    const terminal = await openThroughTheHolder(sandboxed)
    const type = (data: string) =>
      fetch(`${thisMachine}/api/terminals/${terminal.id}/input`, {
        method: 'POST',
        headers: { ...AS_THE_PERSON, connection: 'close' },
        body: JSON.stringify({ data }),
      }).then(async (r) => ({ status: r.status, text: await r.text() }))

    res.useOsProbe(aMachineWhereTheSenderIs(true))
    const fromTheSandbox = await type('echo SANDBOX-$((5*5))\r')
    expect(fromTheSandbox.status, fromTheSandbox.text.slice(0, 300)).toBe(403)
    expect(fromTheSandbox.text).toContain('a program inside a container, which is a sandbox')
    expect(fromTheSandbox.text).toContain('Nothing that comes from a sandbox is the person')

    // THE SAME REQUEST FROM THIS COMPUTER'S OWN PROGRAM TYPES, so the refusal above was the sandbox's.
    res.useOsProbe(aMachineWhereTheSenderIs(false))
    const fromThisComputersProgram = await type('echo OWN-$((6*6))\r')
    expect(fromThisComputersProgram.status, fromThisComputersProgram.text.slice(0, 300)).toBe(200)
    const screen = await untilTheScreenShows(sandboxed, terminal.id, 'OWN-36')
    expect(screen).toContain('OWN-36')
    expect(screen.join('\n')).not.toContain('SANDBOX')
    expect((await theScreenNow(sandboxed, terminal.id)).join('\n')).not.toContain('SANDBOX')
  }, 60_000)
})
