// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START THAT MEETS A TERMINAL HOLDER FROM ANOTHER COPY OF MOLE OFFICE SAYS SO PLAINLY AND DOES NOT USE IT. Problem
 * IrRyMyx6XN19.
 *
 * An installed copy keeps its database in the user's own data folder, so every installed copy of the app finds the same
 * holder socket. On a Mac on 4 November the holder of a copy that had been dragged to the Trash still answered there,
 * and the next start of the app would have met it and used it as its own: the same database, the same words, and code
 * from a copy that was gone. The holder's hello now names the copy it runs from, and one check in
 * src/config/the-terminal-holder.mjs says whether that is this copy, for the start and for the server alike.
 *
 * WHAT IS MEASURED. A stand-in that answers only hello listens at the holder's socket of a place of this file's own,
 * naming that place's database, so nothing else is reached:
 *   1. it names another copy: the start says so, names that copy, says the holder was not used, and starts none;
 *   2. it names this copy: the start leaves it running as its own, as before (the control for case 1);
 *   3. it names another copy: a server of that place says the holder is unusable and names that copy, rather than
 *      using it;
 *   4. the rule, with the install given: from an installed copy, a holder of another build or another folder is
 *      another copy, and so is one that names no copy, since every holder of this version names its own. From a
 *      checkout, a holder of an installed copy is another copy. A holder of another checkout is used as before,
 *      because a paired development checkout uses the stable checkout's holder, and so is one that names no copy.
 *
 * MUTATIONS, each after a control run: the start does not ask the check (case 1 red); the server does not ask it
 * (case 3 red); the check takes a holder of another build for this copy (case 4 red).
 */

import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { startTheHolder } from '../src/config/the-service-command.mjs'
import { askTheHolder } from '../src/config/the-terminal-holder.mjs'
import { THE_INSTALL, serviceLockPathFrom, serviceLogPathFrom } from '../src/config/settings.mjs'
import { aPlace, ask, groups, startAServer, stopEverything, stopTheServer, type Place } from './terminal-holder-stand.ts'

afterAll(stopEverything, 60_000)

/** Another copy of the app, as its holder would name it. */
const ANOTHER_COPY = {
  from: 'bundle',
  root: '/Applications/An Older Mole Office.app/Contents/Resources/office/',
  build: { version: '0.1.0-beta.0', commit: '0000000', builtAt: '2026-10-01 00:00:00' },
}

/** A process that is not this test's, for the stand-in to name as its pid, stopped by its group with the rest. */
function aPidToName(): number {
  const child = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
  child.unref()
  if (child.pid === undefined) throw new Error('No process was made for the stand-in to name.')
  groups.add(child.pid)
  return child.pid
}

const standIns = new Set<{ server: Server; connections: Set<Socket> }>()
afterEach(async () => {
  for (const one of standIns) {
    for (const connection of one.connections) connection.destroy()
    await new Promise<void>((done) => one.server.close(() => done()))
  }
  standIns.clear()
})

/** A stand-in at the place's holder socket that answers hello for the place's database, naming `copy` or none. */
async function aStandIn(place: Place, copy: Record<string, unknown> | undefined): Promise<number> {
  mkdirSync(dirname(place.socket), { recursive: true, mode: 0o700 })
  const pid = aPidToName()
  const connections = new Set<Socket>()
  const server = createServer((socket) => {
    connections.add(socket)
    socket.on('close', () => connections.delete(socket))
    let heard = ''
    socket.setEncoding('utf8')
    socket.on('data', (part: string) => {
      heard += part
      for (let at = heard.indexOf('\n'); at !== -1; at = heard.indexOf('\n')) {
        const request = JSON.parse(heard.slice(0, at)) as Record<string, unknown>
        heard = heard.slice(at + 1)
        const id = request['id'] ?? null
        const answer =
          request['op'] === 'hello'
            ? { id, ok: true, protocol: 1, pid, startedAt: null, database: place.database, understands: ['typeALine', 'privateLoginV1'], ...(copy === undefined ? {} : { copy }) }
            : { id, ok: false, error: 'This stand-in answers only hello.' }
        socket.write(`${JSON.stringify(answer)}\n`)
      }
    })
  })
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(place.socket, () => done())
  })
  chmodSync(place.socket, 0o600)
  standIns.add({ server, connections })
  return pid
}

/** What startTheHolder printed for the place, run in this process with the place's names. */
async function whatTheStartSays(place: Place): Promise<string> {
  for (const [name, value] of Object.entries({ MOLE_OFFICE_DB: place.database, MOLE_OFFICE_TERMINAL_HOLDER: 'on', ...place.env })) vi.stubEnv(name, value)
  let output = ''
  const wrote = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    output += String(chunk)
    return true
  })
  try {
    await startTheHolder({
      databasePath: place.database,
      port: 0,
      lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: place.database }),
      logPath: serviceLogPathFrom({ MOLE_OFFICE_DB: place.database }),
    })
  } finally {
    wrote.mockRestore()
    vi.unstubAllEnvs()
  }
  return output
}

describe('a terminal holder from another copy of Mole Office', () => {
  it('1. the start says it is another copy, names it, and does not use it or start another', async () => {
    const place = aPlace('copy-start')
    const pid = await aStandIn(place, ANOTHER_COPY)
    const said = await whatTheStartSays(place)
    expect(said).not.toContain('It was left as it is.')
    expect(said).toContain(ANOTHER_COPY.root)
    expect(said).toContain('It was not used')
    expect((await askTheHolder(place.socket, { op: 'hello' }))['pid'], 'another holder answers now').toBe(pid)
  }, 30_000)

  it('2. the start leaves a holder of this copy running as its own', async () => {
    const place = aPlace('copy-ours')
    const pid = await aStandIn(place, { from: THE_INSTALL.from, root: THE_INSTALL.root, build: THE_INSTALL.build })
    const said = await whatTheStartSays(place)
    expect(said).toContain(`The terminal holder is already running: process ${String(pid)}. It was left as it is.`)
  }, 30_000)

  it("3. the server says another copy's holder is unusable, and names the copy", async () => {
    const place = aPlace('copy-server')
    await aStandIn(place, ANOTHER_COPY)
    const server = await startAServer(place)
    try {
      const health = await ask(server.api, '/api/health')
      const holder = health.body['terminalHolder'] as { running: boolean; state: string; says: string }
      expect(holder.state, JSON.stringify(holder)).toBe('unusable')
      expect(holder.running).toBe(false)
      const listed = await ask(server.api, '/api/terminals')
      expect(JSON.stringify(listed.body)).toContain(ANOTHER_COPY.root)
    } finally {
      await stopTheServer(server)
    }
  }, 120_000)

  it('4. the rule: which holder is this copy\'s, from an installed copy and from a checkout', async () => {
    const { whyTheHolderIsNotThisCopys } = (await import('../src/config/the-terminal-holder.mjs')) as unknown as {
      whyTheHolderIsNotThisCopys: (hello: Record<string, unknown>, install: Record<string, unknown>) => string | null
    }
    const installed = { from: 'bundle', root: '/Applications/Mole Office.app/Contents/Resources/office/', build: { version: '0.1.0-beta.2', commit: '1111111', builtAt: '2026-11-06 10:00:00' } }
    const hello = (copy: Record<string, unknown> | undefined): Record<string, unknown> => ({ ok: true, protocol: 1, pid: 4242, database: '/d/office.db', ...(copy === undefined ? {} : { copy }) })

    expect(whyTheHolderIsNotThisCopys(hello(installed), installed)).toBeNull()
    expect(whyTheHolderIsNotThisCopys(hello({ ...installed, build: { ...installed.build, commit: '0000000', version: '0.1.0-beta.1' } }), installed)).toContain('0.1.0-beta.1')
    expect(whyTheHolderIsNotThisCopys(hello({ ...installed, root: '/srv/a/.Trash/Mole Office.app/Contents/Resources/office/' }), installed)).toContain('.Trash')
    expect(whyTheHolderIsNotThisCopys(hello(undefined), installed)).not.toBeNull()

    const checkout = { from: 'checkout', root: '/srv/a/mole-office/', build: null }
    expect(whyTheHolderIsNotThisCopys(hello(checkout), checkout)).toBeNull()
    expect(whyTheHolderIsNotThisCopys(hello(undefined), checkout)).toBeNull()
    expect(whyTheHolderIsNotThisCopys(hello({ ...checkout, root: '/srv/a/the-stable-checkout/' }), checkout)).toBeNull()
    expect(whyTheHolderIsNotThisCopys(hello(installed), checkout)).toContain(installed.root)
  })
})
