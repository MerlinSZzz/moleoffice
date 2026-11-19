// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN OF THE MESSAGE WORKER THIS SERVER STARTED IS REGISTERED, ALTHOUGH THE OFFICE CANNOT PLACE THE CALLER.
 *
 * A pid a program in a sandbox sent was once stored as this machine's pid, and a row named the wrong process. Since then
 * the door places a bare pid by the program that sent it, which the operating system names from the connection, and
 * refuses a caller it cannot place. Windows cannot name that program, and a Mac names only its own window's helper. On a
 * Windows 11 machine (wave 13t, round W9, the first label) the message worker started a run, the door refused the
 * worker's own registration of the run's pid, and the worker stopped the run again. It did that on every pass.
 *
 * One case is opened, and no other. Off Linux, a bare pid from a caller the office cannot place is taken only when this
 * computer reads it as a child of the message worker this server started, and the process started after the session was
 * filed. Every other such caller is refused as before. The parent and the start time are read once per registration, not
 * in a loop. Linux is as it was: there the door places every program of this computer's user, so a caller it cannot place
 * is another user's program, or one whose connection was not read in time, and the refusal is for exactly that caller.
 *
 * Which process is the worker. This server records the process it started. On Linux and the Mac that is the worker, and
 * a run's pid is its child. On Windows a start makes a starter that makes the group, and the starter starts the program
 * (src/config/systems/the-system.mjs). So there the recorded pid is the worker's starter, the worker is the starter's
 * child, and the run's pid is the worker's child. The door then reads the run's parent as well.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED, over the listener, from a caller the office cannot place
 * ---------------------------------------------------------------------------------------
 *
 *   1. On a Mac, a child of the worker this server started is taken, and the process table is read once.
 *   2. On Windows, a child of the worker, under the starter this server recorded, is taken, and the process table is
 *      read twice: the pid, then its parent.
 *   3. A pid that is no child of the worker is refused, in the words used before, and nothing is written.
 *   4. On Windows the worker itself is not its own child. It is refused, and nothing is written.
 *   5. A child of the worker that started before the session was filed is refused, and nothing is written.
 *   6. Such a child sent with adopting is refused, because adopting would pass a process older than the session.
 *   7. When this server started no worker, a pid is refused.
 *   8. A caller the office places, on this computer, is answered as before, and the door reads nothing more.
 *   9. On Linux, a child of the worker from a caller the office cannot place is refused in exactly the words used before
 *      this file, the door reads no process, and nothing is written.
 *
 * The machines are stand-ins with no answer for the sender of a connection. The Windows probe has none, and the Mac
 * probe has none outside the app. On Linux, case 9's stand-in is the caller the Linux probe cannot place. The worker is
 * stood in through what the server notes when it starts one. The cases about refusals are on a Mac, where the process
 * table is the plainer one; case 4 is the one the starter makes for Windows.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the door takes no pid from a caller it cannot place, as before this file: cases 1, 2 and 5 go red;
 *   - the door takes any pid from such a caller: cases 2, 3, 4, 6 and 7 go red;
 *   - the door takes such a pid with adopting: case 6 goes red;
 *   - on Windows the parent is not read, and a child of the recorded pid is taken: cases 2 and 4 go red;
 *   - the registration reads the pid again in place of the door's reading: cases 1 and 2 go red;
 *   - the door's case is open on Linux as well: case 9 goes red.
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type WorkerLib = typeof import('../src/server/lib/worker.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type OsSender = NonNullable<ReturnType<NonNullable<OsProbe['senderOfAConnection']>>>

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let worker: WorkerLib
let api = ''
let key = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

// ---------------------------------------------------------------------------- the stand-in machines

/** The pid this server recorded when it started the worker: the worker on a Mac, the worker's starter on Windows. */
const RECORDED = 7000
const LONG_AGO = '2026-09-27 08:00:00'

const aProcess = (pid: number, ppid: number, command: string, startedAt: string, pgid = pid): OsProcess => ({ pid, pgid, ppid, command, startedAt })

/**
 * A Mac: the worker, its run, the run's own child, an older child of the worker, and a shell. A run starts after its
 * session is filed, so it is given the session's own stamp.
 */
function aMac(sessionFiledAt: string): OsProcess[] {
  return [
    aProcess(50, 1, 'the server', LONG_AGO),
    aProcess(RECORDED, 50, 'node worker.mjs', LONG_AGO),
    aProcess(7100, RECORDED, 'node stand-in-run.mjs', sessionFiledAt),
    aProcess(7200, 7100, 'a server the run started', sessionFiledAt),
    aProcess(7300, RECORDED, 'node an-older-run.mjs', LONG_AGO),
    aProcess(8, 1, 'bash', LONG_AGO),
  ]
}

/** Windows: the worker's starter, the worker, the run's starter and the run's program. Windows names no group, so pgid 0. */
function aWindowsMachine(sessionFiledAt: string): OsProcess[] {
  return [
    aProcess(50, 1, 'node.exe server.mjs', LONG_AGO, 0),
    aProcess(RECORDED, 50, 'powershell.exe -EncodedCommand the worker\'s starter', LONG_AGO, 0),
    aProcess(7001, RECORDED, 'node.exe worker.mjs', LONG_AGO, 0),
    aProcess(7100, 7001, 'powershell.exe -EncodedCommand the run\'s starter', sessionFiledAt, 0),
    aProcess(7200, 7100, 'node.exe stand-in-run.mjs', sessionFiledAt, 0),
    aProcess(8, 1, 'cmd.exe', LONG_AGO, 0),
  ]
}

/** Every pid the process table was asked for, in order. */
let asked: number[] = []

/** A machine that cannot say which program holds a connection, or, given `sender`, one that can. */
function standInProbe(platform: string, processes: OsProcess[], sender?: OsSender): OsProbe {
  const live = new Map(processes.map((p) => [p.pid, p]))
  const nothing = (): never => {
    throw new Error('this stand-in machine answers only who a process is')
  }
  return {
    platform,
    processById: (pid) => {
      asked.push(pid)
      return live.get(pid) ?? null
    },
    processesInGroup: nothing,
    listeningPorts: () => [],
    gpu: nothing,
    containers: nothing,
    locks: nothing,
    ownProcessGroup: nothing,
    killProcessGroup: () => {
      throw new Error('this test never signals a process')
    },
    stopContainer: nothing,
    ...(sender === undefined ? {} : { senderOfAConnection: () => sender }),
  }
}

/** The server noting a worker it started, as src/server/index.ts does. */
function theServerStartedAWorker(): void {
  worker.noteTheWorker({ ...worker.theWorkerWeStarted(), started: true, pid: RECORDED, pgid: RECORDED })
}

function aSession(): { id: string; createdAt: string } {
  const filed = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'the session of a run the message worker started',
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  return { id: filed.id, createdAt: filed.createdAt }
}

function rowsIn(session: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM session_resources WHERE session_record_id = ?').get(session) as { n: number }).n
}

/** Over the listener, with the agent's key, as the worker sends it. */
async function registerOverTheListener(body: Record<string, unknown>): Promise<{ status: number; said: any; text: string }> {
  const reply = await fetch(`${api}/api/resources`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key },
    body: JSON.stringify(body),
  })
  const text = await reply.text()
  let said: any = null
  try {
    said = JSON.parse(text)
  } catch {
    said = null
  }
  return { status: reply.status, said, text }
}

/** The words the door refused an unplaced caller's bare pid with before this file, which it still uses. */
function expectTheRefusalOfAnUnplacedCaller(r: { status: number; said: any; text: string }): void {
  expect(r.status, r.text.slice(0, 400)).toBe(409)
  expect(r.said.error).toContain('could not find which program on this computer sent this')
  expect(r.said.error).toContain('registered by the launcher on the host')
  expect(r.said.error).toContain('message worker this server started')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  res = await import('../src/server/lib/resources.ts')
  worker = await import('../src/server/lib/worker.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'a-supervisor', name: 'A supervisor', role: 'supervisor' } })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  key = String((started.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
}, 60_000)

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
  worker.forgetTheWorker()
  asked = []
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a bare pid from a caller the office cannot place', () => {
  it('1: on a Mac, is taken when it is a child of the worker this server started, read once', async () => {
    theServerStartedAWorker()
    const session = aSession()
    res.useOsProbe(standInProbe('darwin', aMac(session.createdAt)))
    const r = await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: '7100' })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.key).toBe('7100')
    expect(r.said.resource.osStartedAt).toBe(session.createdAt)
    expect(r.said.resource.detail).toBe('node stand-in-run.mjs')
    expect(asked).toEqual([7100])
  })

  it('2: on Windows, is taken when it is a child of the worker under the starter this server recorded, read with its parent', async () => {
    theServerStartedAWorker()
    const session = aSession()
    res.useOsProbe(standInProbe('win32', aWindowsMachine(session.createdAt)))
    const r = await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: '7100' })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.key).toBe('7100')
    expect(r.said.resource.osStartedAt).toBe(session.createdAt)
    expect(asked).toEqual([7100, 7001])
  })

  it('3: is refused when it is no child of the worker, in the words used before, and nothing is written', async () => {
    theServerStartedAWorker()
    const session = aSession()
    res.useOsProbe(standInProbe('darwin', aMac(session.createdAt)))
    for (const pid of ['8', '7200', String(RECORDED), '99999']) {
      const r = await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: pid })
      expectTheRefusalOfAnUnplacedCaller(r)
      expect(r.said.error).toContain(`whether pid ${pid} is this machine's number or a container's`)
    }
    expect(rowsIn(session.id)).toBe(0)
  })

  it('4: on Windows, is refused when it is the worker itself, and nothing is written', async () => {
    theServerStartedAWorker()
    const session = aSession()
    res.useOsProbe(standInProbe('win32', aWindowsMachine(session.createdAt)))
    for (const pid of ['7001', '7200']) expectTheRefusalOfAnUnplacedCaller(await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: pid }))
    expect(rowsIn(session.id)).toBe(0)
  })

  it('5: is refused when the worker\'s child started before the session was filed, and nothing is written', async () => {
    theServerStartedAWorker()
    const session = aSession()
    res.useOsProbe(standInProbe('darwin', aMac(session.createdAt)))
    const r = await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: '7300' })
    expect(r.status, r.text.slice(0, 400)).toBe(400)
    expect(r.said.error).toContain(`before session ${session.id} was filed`)
    expect(rowsIn(session.id)).toBe(0)
  })

  it('6: is refused when the worker\'s child is sent with adopting, and nothing is written', async () => {
    theServerStartedAWorker()
    const session = aSession()
    res.useOsProbe(standInProbe('darwin', aMac(session.createdAt)))
    for (const pid of ['7300', '7100']) {
      expectTheRefusalOfAnUnplacedCaller(
        await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: pid, adopting: 'the run was started before its session' }),
      )
    }
    expect(rowsIn(session.id)).toBe(0)
  })

  it('7: is refused when this server started no worker', async () => {
    const session = aSession()
    res.useOsProbe(standInProbe('darwin', aMac(session.createdAt)))
    expectTheRefusalOfAnUnplacedCaller(await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: '7100' }))
    expect(rowsIn(session.id)).toBe(0)
  })
})

describe('a bare pid from a caller the office places', () => {
  it('8: on this computer, is this machine\'s pid as before, whoever started it, and the door reads nothing more', async () => {
    theServerStartedAWorker()
    const session = aSession()
    const onThisComputer: OsSender = { uid: process.getuid?.() ?? 0, pid: 8, inAnotherContainer: false }
    res.useOsProbe(standInProbe('stand-in', aMac(session.createdAt), onThisComputer))
    const r = await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: '8', adopting: 'a shell started before this session' })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.key).toBe('8')
    expect(r.said.resource.detail).toBe('adopted, not started by this session: a shell started before this session — bash')
    expect(asked).toEqual([8])
  })
})

describe('a bare pid from a caller the office cannot place, on Linux', () => {
  it('9: is refused in the words used before this file, although it is a child of the worker, and nothing is read or written', async () => {
    theServerStartedAWorker()
    const session = aSession()
    res.useOsProbe(standInProbe('linux', aMac(session.createdAt)))
    const r = await registerOverTheListener({ sessionRecordId: session.id, type: 'process', key: '7100' })
    expect(r.status, r.text.slice(0, 400)).toBe(409)
    expect(r.said.error).toBe(
      'Mole Office could not find which program on this computer sent this, so it cannot tell ' +
        "whether pid 7100 is this machine's number or a container's, and nothing was written. " +
        'A process in a sandbox is registered by the launcher on the host, or by a program ' +
        "in the sandbox that runs as this computer's user, which the office can find.",
    )
    expect(asked).toEqual([])
    expect(rowsIn(session.id)).toBe(0)
  })
})
