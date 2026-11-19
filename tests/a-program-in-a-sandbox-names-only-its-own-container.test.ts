// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROGRAM IN A SANDBOX NAMES ONLY ITS OWN CONTAINER. Problem ytWensT7blOP, noted by the inspector releasing run
 * uVj0vGGNb0Cy and filed by the secretary: POST /api/resources took {"type":"process","container":…,"pidInContainer":…} from any
 * caller, so a program in one sandbox could write a row about another sandbox's process, and a release signals the
 * group a row names.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A program in container A that names container A has its process written down, by this machine's numbers.
 *   2. A program in container A that names container B is refused, and nothing is written.
 *   3. A program on this computer may name any container, as the launcher on the host does.
 *   4. A program the office cannot place is refused, and nothing is written.
 *   5. A row written in the office's own process is not asked, whatever container it names.
 *
 * The machine is a stand-in, as in tests/resources-in-container.test.ts: pid 8 is a shell on the host, a server in
 * container A and a sleep in container B. The operating system's answer about who holds a connection is the stand-in's
 * too. Requests go over the office's listener with an agent's key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the named container's namespace not compared with the caller's (lib/resources.ts): case 2 goes red;
 *   - the door not asking who sent the container form (api/resources.ts): cases 2 and 4 go red.
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

const HOST_NS = 'pid:[4026531836]'
const A_NS = 'pid:[4026533021]'
const B_NS = 'pid:[4026533099]'
const A_ID = 'a'.repeat(64)
const B_ID = 'b'.repeat(64)

interface FakeProcess {
  proc: OsProcess
  ns: OsPidNamespace
}
const onHost = (pid: number, command: string): FakeProcess => ({
  proc: { pid, pgid: pid, ppid: 1, command, startedAt: '2026-09-27 08:00:00' },
  ns: { namespace: HOST_NS, nspid: [pid] },
})
const inContainer = (ns: string, hostPid: number, innerPid: number, command: string): FakeProcess => ({
  proc: { pid: hostPid, pgid: hostPid, ppid: 1, command, startedAt: '2026-09-27 09:00:00' },
  ns: { namespace: ns, nspid: [hostPid, innerPid] },
})
const MACHINE: FakeProcess[] = [
  onHost(8, 'bash'),
  onHost(9, 'the launcher on the host'),
  inContainer(A_NS, 5001, 1, '/sbin/docker-init -- sleep infinity'),
  inContainer(A_NS, 5040, 8, 'a server in sandbox A'),
  inContainer(A_NS, 5050, 30, 'an agent in sandbox A'),
  inContainer(B_NS, 6001, 1, '/sbin/docker-init -- sleep infinity'),
  inContainer(B_NS, 6040, 8, 'a server in sandbox B'),
]

/** Who the stand-in says holds the other end of the connection; each case sets it. */
let theSender: OsSender | null = null

function standInProbe(): OsProbe {
  const live = new Map(MACHINE.map((p) => [p.proc.pid, p]))
  const first: Record<string, number> = { [A_ID]: 5001, [B_ID]: 6001 }
  return {
    ...res.LINUX_PROBE,
    platform: 'stand-in',
    processById: (pid) => live.get(pid)?.proc ?? null,
    processesInGroup: (pgid) => [...live.values()].map((p) => p.proc).filter((p) => p.pgid === pgid),
    processTable: () => ({ ok: true, processes: [...live.values()].map((p) => ({ pid: p.proc.pid, command: p.proc.command, cwd: null })) }),
    pidNamespaceOf: (pid) => live.get(pid)?.ns ?? null,
    containers: () => ({
      available: true,
      containers: [
        { id: A_ID, name: 'sandbox-a', image: 'mole-office-dev', status: 'Up 5 minutes' },
        { id: B_ID, name: 'sandbox-b', image: 'mole-office-dev', status: 'Up 4 minutes' },
      ],
    }),
    containerFirstProcess: (id) => {
      const pid = first[id]
      return pid === undefined ? { ok: false, reason: `container ${id} is not running` } : { ok: true, pid }
    },
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
    title: 'the session that owns the rows',
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
}

function rowsIn(session: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM session_resources WHERE session_record_id = ?').get(session) as { n: number }).n
}

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

describe('the container form, asked of the program that sent it', () => {
  it('1: from a program in container A naming container A, writes the process down by this machine\'s numbers', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(5050, true)
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.key).toBe('5040')
  })

  it('2: from a program in container A naming container B, is refused, and nothing is written', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(5050, true)
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', container: 'sandbox-b', pidInContainer: 8 })
    expect(r.status, r.text.slice(0, 400)).toBe(403)
    expect(r.said.error).toContain('may name only its own container')
    expect(rowsIn(session)).toBe(0)
  })

  it('3: from a program on this computer, may name any container, as the launcher on the host does', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(9, false)
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', container: 'sandbox-b', pidInContainer: 8 })
    expect(r.status, r.text.slice(0, 400)).toBe(201)
    expect(r.said.resource.key).toBe('6040')
  })

  it('4: from a program the office cannot place, is refused, and nothing is written', async () => {
    res.useOsProbe(standInProbe())
    theSender = null
    const session = aSession()
    const r = await registerOverTheListener({ sessionRecordId: session, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.status, r.text.slice(0, 400)).toBe(409)
    expect(r.said.error).toContain('whether container sandbox-a is the sender\'s own')
    expect(rowsIn(session)).toBe(0)
  })

  it('5: written in the office\'s own process, is not asked, whatever container it names', async () => {
    res.useOsProbe(standInProbe())
    theSender = asThisUser(5050, true)
    const session = aSession()
    const r = await app.inject({ method: 'POST', url: '/api/resources', headers: AS_THE_PERSON, payload: { sessionRecordId: session, type: 'process', container: 'sandbox-b', pidInContainer: 8, adopting: 'the stand-in process started on 27 September, before this test filed its session' } })
    expect(r.statusCode, r.body.slice(0, 400)).toBe(201)
    expect((r.json() as { resource: { key: string } }).resource.key).toBe('6040')
  })
})
