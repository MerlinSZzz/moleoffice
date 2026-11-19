// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOTHING THAT COMES FROM A SANDBOX IS THE PERSON. The person's decision of 26 September 2026 was on problem
 * T5Dbi_Z55666. An ordinary sandbox shares this computer's network, so its requests arrive
 * where the person's browser's do, and while the key window is open a keyless claim to be the person from this machine
 * counted as the person, and the pairing press answered their key to any request from this machine. The office now asks
 * the operating system which program sent such a request
 * (`senderOfAConnection` in src/server/lib/resources.ts, `whoSentItFromThisComputer` in src/server/lib/from-a-sandbox.ts)
 * and counts it as the person only when that program is this computer's own, found, and in no container this server is not in.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The kernel's table and a cgroup are read as the probe needs them: IPv4, IPv6 and an IPv4 address in an IPv6
 *      socket; docker, containerd, podman and LXC containers named, and a snap's scope and a user's session not.
 *   2. The real probe finds the program behind a live connection: this test's own process, in no other container.
 *      So a keyless claim to be the person from this computer's own program still counts, as it did.
 *   3. A keyless claim to be the person from a program in another container is not the person: a person-only act is refused and the
 *      refusal names the sandbox and the decision. So is a request that named nobody, and the pairing press, which
 *      then sets no cookie.
 *   4. A program the office cannot find, and another user's program, are not the person either.
 *   5. An agent's own keyless claim from the same program is not narrowed, and a request with the person's key is not asked.
 *
 * The container is played by a stand-in probe, `Object.create(LINUX_PROBE)` with `senderOfAConnection` answered, the
 * way tests/sandbox-stand-ins.ts stands in for the machine: this test's own runner cannot start a container, and the
 * queue's has no network to start one in.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of run AYvZStDdQgnJ, which added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the claim with headers not asked who sent it (lib/http.ts): case 3 goes red;
 *   - the request that named nobody not asked who sent it (lib/http.ts): case 3 goes red;
 *   - the pairing press not asked who sent it (api/office.ts): case 3 goes red;
 *   - a program the office cannot find taken for the person's own (lib/from-a-sandbox.ts): case 4 goes red;
 *   - another user's program taken for the person's own (lib/from-a-sandbox.ts): case 4 goes red.
 */

import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { settings } from '../src/config/settings.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

/** The person's name claimed with no key, as a browser that is not paired sends it. */
const THE_PERSONS_NAME = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let thisMachine = ''

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(async () => {
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
})

/** A stand-in for the machine that answers who sent a connection, and nothing else differently. */
function aMachineWhereTheSenderIs(sender: { uid: number; pid: number | null; inAnotherContainer: boolean | null } | null): ResourcesLib['LINUX_PROBE'] {
  const probe = Object.create(res.LINUX_PROBE) as ResourcesLib['LINUX_PROBE']
  Object.assign(probe, { senderOfAConnection: () => sender })
  return probe
}

/** One request on a connection of its own, so an answer kept on an earlier connection is not what is read. */
async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; text: string; cookie: string | null }> {
  const r = await fetch(`${thisMachine}${path}`, {
    method,
    headers: { ...headers, connection: 'close' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, text: await r.text(), cookie: r.headers.get('set-cookie') }
}

/** A person-only act: whether the office map moves, which only the person changes. */
const aPersonOnlyAct = (headers: Record<string, string>): ReturnType<typeof ask> => ask('PATCH', '/api/office/scene-settings', headers, { motion: true })

describe('the kernel\'s table and a cgroup, as the probe reads them', () => {
  it('1: reads IPv4, IPv6 and a mapped IPv4 end, and names containers but not a snap or a session', () => {
    const table =
      '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n' +
      '   0: 0100007F:D431 0100007F:6DAB 01 00000000:00000000 00:00000000 00000000  1000        0 424242 1 0 20 4 30 10 -1\n'
    expect(res.connectionsInTheTable(table)).toEqual([{ local: { address: '127.0.0.1', port: 54321 }, remote: { address: '127.0.0.1', port: 28075 }, uid: 1000, inode: '424242' }])
    const six =
      '  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n' +
      '   0: 00000000000000000000000001000000:D431 00000000000000000000000001000000:6DAB 01 00000000:00000000 00:00000000 00000000     0        0 7 1\n' +
      '   1: 0000000000000000FFFF00000100007F:D432 0000000000000000FFFF00000100007F:6DAB 01 00000000:00000000 00:00000000 00000000  1000        0 8 1\n'
    const read = res.connectionsInTheTable(six)
    expect(read[0]?.local).toEqual({ address: '::1', port: 54321 })
    expect(read[0]?.uid).toBe(0)
    expect(read[1]?.local).toEqual({ address: '127.0.0.1', port: 54322 })

    expect(res.theContainerACgroupNames('0::/system.slice/docker-3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a.scope\n')).toMatch(/^docker:/)
    expect(res.theContainerACgroupNames('12:pids:/docker/3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a\n')).toMatch(/^docker:/)
    expect(res.theContainerACgroupNames('0::/system.slice/cri-containerd-3f2a1b0c9d8e.scope\n')).toMatch(/^cri-containerd:/)
    expect(res.theContainerACgroupNames('0::/machine.slice/libpod-3f2a1b0c9d8e.scope\n')).toMatch(/^libpod:/)
    expect(res.theContainerACgroupNames('0::/lxc/a-container\n')).toMatch(/^lxc:/)
    expect(res.theContainerACgroupNames('0::/user.slice/user-1000.slice/user@1000.service/app.slice/snap.firefox.firefox-1a2b.scope\n')).toBeNull()
    expect(res.theContainerACgroupNames('0::/user.slice/user-1000.slice/session-2.scope\n')).toBeNull()
    expect(res.theContainerACgroupNames('0::/\n')).toBeNull()
  })
})

describe('who sent a claim to be the person from this computer', () => {
  it('2: the real probe finds this test\'s own process behind its connection, and the person’s claim from it counts', async () => {
    // THE PROBE ITSELF, asked about a connection that is open while it asks.
    let found: ReturnType<NonNullable<ResourcesLib['LINUX_PROBE']['senderOfAConnection']>> | undefined
    const probe = Object.create(res.LINUX_PROBE) as ResourcesLib['LINUX_PROBE']
    Object.assign(probe, {
      senderOfAConnection: (peer: { address: string; port: number }, ours: { address: string; port: number }) => {
        found = res.LINUX_PROBE.senderOfAConnection?.(peer, ours) ?? null
        return found
      },
    })
    res.useOsProbe(probe)
    const done = await aPersonOnlyAct(THE_PERSONS_NAME)
    expect(done.status, done.text.slice(0, 300)).toBe(200)
    expect(found, 'the probe found no program behind the connection').not.toBeNull()
    expect(found?.pid).toBe(process.pid)
    expect(found?.inAnotherContainer).toBe(false)
  })

  it('3: a claim, a request that named nobody, and the pairing press from a program in another container are not the person', async () => {
    res.useOsProbe(aMachineWhereTheSenderIs({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer: true }))
    const claimed = await aPersonOnlyAct(THE_PERSONS_NAME)
    expect(claimed.status, claimed.text.slice(0, 300)).toBe(403)
    expect(claimed.text).toContain('a program inside a container, which is a sandbox')
    expect(claimed.text).toContain('Nothing that comes from a sandbox is the person')
    const nobody = await aPersonOnlyAct({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default' })
    expect(nobody.status, nobody.text.slice(0, 300)).toBe(403)
    const paired = await ask('POST', '/api/office/pairing', { 'content-type': 'application/json' }, {})
    expect(paired.status, paired.text.slice(0, 300)).toBe(403)
    expect(paired.cookie, 'the pairing press set a cookie for a sandbox').toBeNull()
    expect(paired.text).toContain('Nothing was paired')
  })

  it('4: a program the office cannot find, and another user\'s program, are not the person', async () => {
    res.useOsProbe(aMachineWhereTheSenderIs(null))
    const unfound = await aPersonOnlyAct(THE_PERSONS_NAME)
    expect(unfound.status, unfound.text.slice(0, 300)).toBe(403)
    expect(unfound.text).toContain('a program Mole Office could not find')
    res.useOsProbe(aMachineWhereTheSenderIs({ uid: 0, pid: null, inAnotherContainer: null }))
    const another = await aPersonOnlyAct(THE_PERSONS_NAME)
    expect(another.status, another.text.slice(0, 300)).toBe(403)
    expect(another.text).toContain('a program another user runs')
    // AND THE PERSON'S OWN PROGRAM, FOUND, IN NO OTHER CONTAINER, IS THE PERSON.
    res.useOsProbe(aMachineWhereTheSenderIs({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer: false }))
    const thePersonsAct = await aPersonOnlyAct(THE_PERSONS_NAME)
    expect(thePersonsAct.status, thePersonsAct.text.slice(0, 300)).toBe(200)
  })

  it('5: an agent\'s own keyless claim is not narrowed, and a request with the person’s key is not asked', async () => {
    const started = await ask('POST', '/api/agents/started', THE_PERSONS_NAME, { handle: 'an-agent-in-a-sandbox', name: 'An agent in a sandbox', role: 'worker' })
    expect(started.status, started.text.slice(0, 300)).toBe(201)
    res.useOsProbe(aMachineWhereTheSenderIs({ uid: process.getuid?.() ?? 0, pid: 4242, inAnotherContainer: true }))
    const agentsWrite = await ask('POST', '/api/records', {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'an-agent-in-a-sandbox',
    }, { kind: 'note', title: 'written by an agent in a sandbox, as before' })
    expect(agentsWrite.status, agentsWrite.text.slice(0, 300)).toBe(201)
    // THE PERSON'S KEY, from the file the office made beside the database, as other tests read it. Never printed.
    const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { person?: unknown }
    expect(typeof held.person, 'the office made no person key beside the database').toBe('string')
    const withThePersonsKey = await aPersonOnlyAct({ ...THE_PERSONS_NAME, 'x-mole-office-key': String(held.person) })
    expect(withThePersonsKey.status, withThePersonsKey.text.slice(0, 300)).toBe(200)
  })
})
