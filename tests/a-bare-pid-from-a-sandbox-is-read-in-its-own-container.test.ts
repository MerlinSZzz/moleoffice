// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BARE PID FROM A PROGRAM IN A SANDBOX IS READ IN THAT PROGRAM'S OWN CONTAINER. Problem xnfjNO3w2GCQ: on 25 September
 * 2026 wave 13j's supervisor started a measuring server inside its sandbox and registered it with the pid it saw there,
 * 1995; the ledger took it as a host pid, and a row named the wrong process. The secretary chose the fuller way (message
 * CEykh1fBwn1l): the door places a bare pid itself, from the connection, and translates it as the container form does;
 * a caller it cannot place is refused, naming the container form.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A bare pid from a program in a container is stored as the host pid of the process with that pid in the
 *      program's own pid namespace, with the host process group and start time, and the row says what was made of it.
 *   2. A bare pid from a program on this computer is this machine's pid, as before.
 *   3. A bare pid from a program the office cannot place is refused, saying how a sandbox's process is registered, and
 *      nothing is written (since problem ytWensT7blOP the container form is refused to such a caller too).
 *   4. A bare pid registered in the office's own process (no listener carried it) is this machine's pid, as before.
 *   5. A bare pid the caller's container does not have is refused, although this machine has a process with that
 *      number, and nothing is written.
 *
 * The machine is a stand-in, as in tests/resources-in-container.test.ts: pid 8 is a shell on the host, a sleep in
 * container A and another sleep in container B. The operating system's answer about who holds a connection is the
 * stand-in's too, so each case says which program sent the request. Requests go over the office's listener with an
 * agent's key, as an agent in a sandbox sends them.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the door not asking which program sent a bare pid (api/resources.ts): cases 1, 3 and 5 go red;
 *   - a caller the door cannot place taken as this computer's (api/resources.ts): case 3 goes red;
 *   - the namespace left out of the match (lib/resources.ts): case 1 goes red.
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type OsPidNamespace = NonNullable<ReturnType<NonNullable<OsProbe['pidNamespaceOf']>>>
type OsSender = NonNullable<ReturnType<NonNullable<OsProbe['senderOfAConnection']>>>

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let api = ''
let key = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

// ---------------------------------------------------------------------------- the stand-in machine

const HOST_NS = 'pid:[4026531836]'
const A_NS = 'pid:[4026533021]'
const B_NS = 'pid:[4026533099]'

interface FakeProcess {
  proc: OsProcess
  ns: OsPidNamespace
}
const onHost = (pid: number, command: string): FakeProcess => ({
  proc: { pid, pgid: pid, ppid: 1, command, startedAt: '2026-09-27 08:00:00' },
  ns: { namespace: HOST_NS, nspid: [pid] },
})
const inContainer = (ns: string, hostPid: number, innerPid: number, command: string, startedAt: string): FakeProcess => ({
  proc: { pid: hostPid, pgid: hostPid, ppid: 1, command, startedAt },
  ns: { namespace: ns, nspid: [hostPid, innerPid] },
})
const MACHINE: FakeProcess[] = [
  onHost(8, 'bash'),
  onHost(9, 'a host daemon'),
  inContainer(A_NS, 5001, 1, '/sbin/docker-init -- sleep infinity', '2026-09-27 09:00:00'),
  inContainer(A_NS, 5040, 8, 'a measuring server', '2026-09-27 09:00:05'),
  inContainer(A_NS, 5050, 30, 'the agent that registers it', '2026-09-27 09:00:06'),
  inContainer(B_NS, 6040, 8, 'sleep 200', '2026-09-27 10:00:05'),
]

/** Who the stand-in says holds the other end of the connection; each case sets it. */
let theSender: OsSender | null = null

function standInProbe(): OsProbe {
  const live = new Map(MACHINE.map((p) => [p.proc.pid, p]))
  return {
    ...res.LINUX_PROBE,
    platform: 'stand-in',
    processById: (pid) => live.get(pid)?.proc ?? null,
    processesInGroup: (pgid) => [...live.values()].map((p) => p.proc).filter((p) => p.pgid === pgid),
    processTable: () => ({ ok: true, processes: [...live.values()].map((p) => ({ pid: p.proc.pid, command: p.proc.command, cwd: null })) }),
    pidNamespaceOf: (pid) => live.get(pid)?.ns ?? null,
    senderOfAConnection: () => theSender,
    listeningPorts: () => [],
    killProcessGroup: () => {
      throw new Error('this test never signals a process')
    },
  }
}

const asThisUser = (pid: number, inAnotherContainer: boolean): OsSender => ({ uid: process.getuid?.() ?? 0, pid, inAnotherContainer })

function aSession(): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'the session that started the server in the sandbox',
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
}

function rowsIn(session: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM session_resources WHERE session_record_id = ?').get(session) as { n: number }).n
}

/** Over the listener, with the agent's key, as an agent in a sandbox sends it. */
async function registerOverTheListener(body: Record<string, unknown>): Promise<{ status: number; said: any; text: string }> {
  const reply = await fetch(`${api}/api/resources`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key },
    // The stand-ins are older than every session this file files (decision AOwsOHMVq6Ce).
    body: JSON.stringify({ ...body, adopting: 'the stand-in process started on 27 September, before this test filed its session' }),
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

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  res = await import('../src/server/lib/resources.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'a-supervisor', name: 'A supervisor', role: 'supervisor' } })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  key = String((started.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
}, 60_000)

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
  theSender = null
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a bare pid, placed by the program that sent it', () => {
  it('1: from a program in a container, is stored as the host pid of that container\'s pid, and says so', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(5050, true)
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', key: '8' })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    // Host 5040, container A's pid 8: not the host's own pid 8 and not container B's 6040.
    expect(r.said.resource.key).toBe('5040')
    expect(r.said.resource.pgid).toBe(5040)
    expect(r.said.resource.osStartedAt).toBe('2026-09-27 09:00:05')
    expect(r.said.resource.detail).toBe(
      'adopted, not started by this session: the stand-in process started on 27 September, before this test filed its session — pid 8 as the container it was sent from sees it (sent by pid 5050 on this machine), which is pid 5040 on this machine — a measuring server',
    )
  })

  it('2: from a program on this computer, is this machine\'s pid, as before', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(9, false)
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', key: '8' })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.key).toBe('8')
    expect(r.said.resource.detail).toBe('adopted, not started by this session: the stand-in process started on 27 September, before this test filed its session — bash')
  })

  it('3: from a program the office cannot place, is refused, saying how a sandbox\'s process is registered, and nothing is written', async () => {
    res.useOsProbe(standInProbe())
    theSender = null
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', key: '8' })
    expect(r.status, r.text.slice(0, 400)).toBe(409)
    expect(r.said.error).toContain('could not find which program on this computer sent this')
    expect(r.said.error).toContain('registered by the launcher on the host')
    expect(rowsIn(session)).toBe(0)
  })

  it('4: registered in the office\'s own process, is this machine\'s pid, whoever the connection would name', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(5050, true)
    const session = aSession()
    const r = await app.inject({ method: 'POST', url: '/api/resources', headers: AS_THE_PERSON, payload: { sessionRecordId: session, type: 'process', key: '8', adopting: 'the stand-in process started on 27 September, before this test filed its session' } })
    expect(r.statusCode, r.body.slice(0, 400)).toBe(201)
    expect((r.json() as { resource: { key: string } }).resource.key).toBe('8')
  })

  it('5: that the caller\'s container does not have, is refused, although this machine has that pid, and nothing is written', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(5050, true)
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', key: '9' })
    expect(r.status, r.text.slice(0, 400)).toBe(400)
    expect(r.said.error).toContain('No process in the container this was sent from has pid 9')
    expect(rowsIn(session)).toBe(0)
  })
})
