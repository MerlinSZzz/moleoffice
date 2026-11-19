// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW KEEPS EVERY TRUSTED CALLER WORKING, AND A CLAIM FROM NOWHERE ELSE IS NOBODY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P83, point 6, and the ruling of 13 September 2026 on the plan (report
 * Shs0dwOcmIkm, the paragraph "The window's reach"). For one version a request that carries the
 * person's headers and NO key still counts when a listener carried it from loopback or from a
 * machine on the trusted list (P73). The owner's phone, the owner's MacBook and the browser on the owner's other computer come in by the
 * trusted list and can hold no key yet. A claim with no key from anywhere else is nobody from the
 * day this lands.
 *
 * A REQUEST NO LISTENER CARRIED IS NOT REACHED BY THE RULE. It is on no socket, so no listener saw
 * it, and it is the office itself. That half has its own file, because a rule like this fails by
 * becoming a censor and taking the office's own calls with it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY REAL LISTENERS AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The rule reads the listener's stamp, which no caller can set. An injected request is on no socket,
 * so the rule does not apply to it at all, and a test that reached the guard in-process would be
 * proving something about a caller this rule is not about. So this file opens a local listener and a
 * second one that stamps `another machine`, and drives both with `fetch`, which is what curl, the
 * browser and every JavaScript agent are.
 *
 * THE SECOND DOOR IS A PROXY, which is the door the owner's other machine really comes in through:
 * the caller's address is the forwarded one, and the trusted list is asked about that address. The
 * untrusted case sends a forwarded address no press has trusted; the trusted case trusts it first.
 *
 * The registry test in tests/the-registry-makes-the-person-hold-the-key.test.ts covers every one of
 * the person's declared acts by source. This file drives the doors those acts are reached through,
 * so a clause that is written but never fires is caught too.
 */

import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { settings } from '../src/config/settings.mjs'

/** The person's headers and no key: exactly the claim the window is about. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** A machine on the trusted list, and one that is not. Both are documentation addresses. */
const TRUSTED = '198.51.100.9'
const NOT_TRUSTED = '203.0.113.7'

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let anotherMachine: string
const extraDoors: Server[] = []

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  t = await freshDb()
  // A MACHINE THE PERSON TRUSTED. P73: the list is written by a press, and the test writes the same
  // row a press would.
  const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
  trustThisMachine(TRUSTED, null, 'a press', 'the test trusted this machine', null)

  const built = await apiApp()
  app = built.app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  anotherMachine = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'a proxy on this computer')
      app.routing(raw, res)
    }),
  )
})

afterAll(async () => {
  for (const server of extraDoors) await new Promise<void>((resolve) => server.close(() => resolve()))
  await app.close()
  t.close()
})

interface Answer {
  status: number
  error: string
  id: string | null
}

async function ask(
  door: string,
  method: 'POST' | 'DELETE',
  path: string,
  payload: unknown,
  forwardedFor: string | null,
): Promise<Answer> {
  const headers: Record<string, string> = forwardedFor === null ? { ...THE_PERSON } : { ...THE_PERSON, 'x-forwarded-for': forwardedFor }
  const res = await fetch(`${door}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = (await res.json()) as { error?: string; id?: string; record?: { id?: string } }
  return { status: res.status, error: body.error ?? '', id: body.id ?? body.record?.id ?? null }
}

function decisionTitles(): string[] {
  return t.api
    .listRecords({ workspaceId: 'default', kind: 'decision' })
    .map((r: { title: string }) => r.title)
}

/**
 * THE PERSON'S KEY, read from the file the office made at first run beside the database.
 *
 * IT IS NEVER PRINTED, ASSERTED ON, OR PUT IN A MESSAGE. The test sends it and reads the status,
 * which is the whole of what a test may do with a real key.
 */
function thePersonsKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { person?: unknown }
  if (typeof held.person !== 'string') throw new Error('the office made no person key beside the database')
  return held.person
}

/** The same request, with the person's key and from an address no press has trusted. */
async function askWithThePersonsKey(door: string, path: string, payload: unknown): Promise<Answer> {
  const res = await fetch(`${door}${path}`, {
    method: 'POST',
    headers: { ...THE_PERSON, 'x-mole-office-key': thePersonsKey(), 'x-forwarded-for': NOT_TRUSTED },
    body: JSON.stringify(payload),
  })
  const body = (await res.json()) as { error?: string; id?: string; record?: { id?: string } }
  return { status: res.status, error: body.error ?? '', id: body.id ?? body.record?.id ?? null }
}

/** A fork an agent filed, and a decision the person really wrote about it. */
function fork(name: string): { proposal: string; decision: string } {
  const proposal = t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title: `Should ${name} be settled by whoever asks?`,
    data: { question: `Who settles ${name}?`, options: ['a — the person', 'b — anybody'] },
    actor: { type: 'agent', id: 'claude-code' },
  })
  const decision = t.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: `${name} is settled by the person`,
    data: { replaces: [], because: 'a fork is answered by whoever the question is waiting on' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  })
  return { proposal: proposal.id, decision: decision.id }
}

describe('a header claim with no key, on each door', () => {
  it('is refused a decision from a machine this office does not trust, and writes nothing', async () => {
    const before = decisionTitles()
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'The gripper stays on position control',
      data: { replaces: [], because: 'a header is not a key' },
    }, NOT_TRUSTED)
    expect(answer.status, `an untrusted claim wrote a decision: ${answer.error}`).toBe(403)
    expect(decisionTitles()).toEqual(before)
  })

  it('writes the same decision from a machine this office trusts while the window is open', async () => {
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'The gripper stays on position control',
      data: { replaces: [], because: 'their own machine is on the trusted list' },
    }, TRUSTED)
    expect(answer.status, `a trusted machine was refused: ${answer.error}`).toBe(201)
    expect(decisionTitles()).toContain('The gripper stays on position control')
  })

  it('writes the same decision from this machine, which the window also covers', async () => {
    const answer = await ask(thisMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'The second listener is not the only door',
      data: { replaces: [], because: 'loopback is covered for one version' },
    }, null)
    expect(answer.status, answer.error).toBe(201)
  })

  it('lets the person through from an untrusted address when the request carries the key', async () => {
    // THE KEY IS THE PROOF AND THE ADDRESS DOES NOT MATTER. Point 1: a request is the person when it
    // carries the key, and the window is only for callers that have none yet.
    const answer = await askWithThePersonsKey(anotherMachine, '/api/records', {
      kind: 'decision',
      title: 'The person holds the key and the key is enough',
      data: { replaces: [], because: 'the office made this key at first run' },
    })
    expect(answer.status, `the person's key was refused: ${answer.error}`).toBe(201)
    expect(decisionTitles()).toContain('The person holds the key and the key is enough')
  })

  it('refuses a fork settled from an untrusted machine, and leaves it open', async () => {
    const { proposal, decision } = fork('an untrusted settling link')
    const answer = await ask(anotherMachine, 'POST', '/api/links', {
      fromId: decision,
      toId: proposal,
      type: 'derived_from',
    }, NOT_TRUSTED)
    expect(answer.status, `an untrusted claim settled a fork: ${answer.error}`).toBe(403)
    const { proposalResolution, getRecord } = await import('../src/server/lib/records.ts')
    expect(proposalResolution(getRecord(proposal) as never)?.resolved).toBe(false)
  })

  it('settles a fork from a trusted machine while the window is open', async () => {
    const { proposal, decision } = fork('a trusted settling link')
    const answer = await ask(anotherMachine, 'POST', '/api/links', {
      fromId: decision,
      toId: proposal,
      type: 'derived_from',
    }, TRUSTED)
    expect(answer.status, answer.error).toBe(201)
    const { proposalResolution, getRecord } = await import('../src/server/lib/records.ts')
    expect(proposalResolution(getRecord(proposal) as never)?.resolved).toBe(true)
  })

  it('refuses a fork deleted from an untrusted machine, and leaves it in the queue', async () => {
    const { proposal } = fork('an untrusted deletion')
    const answer = await ask(anotherMachine, 'DELETE', `/api/records/${proposal}`, undefined, NOT_TRUSTED)
    expect(answer.status, `an untrusted claim emptied the queue: ${answer.error}`).toBe(403)
    const { getRecord } = await import('../src/server/lib/records.ts')
    expect((getRecord(proposal) as { deletedAt: string | null }).deletedAt).toBeNull()
  })

  it('deletes the same fork from a trusted machine while the window is open', async () => {
    const { proposal } = fork('a trusted deletion')
    const answer = await ask(anotherMachine, 'DELETE', `/api/records/${proposal}`, undefined, TRUSTED)
    expect(answer.status, answer.error).toBe(200)
    const { getRecord } = await import('../src/server/lib/records.ts')
    expect((getRecord(proposal) as { deletedAt: string | null }).deletedAt).not.toBeNull()
  })
})

describe('every header-only call is written down cheaply, in the summary the Settings list reads', () => {
  function headerOnlyRows(): number {
    return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM header_only_calls').get() as { n: number }).n
  }

  it('folds a claim with no key into the summary and leaves a request that held the key out', async () => {
    const before = headerOnlyRows()
    // A READ, so no handler asked who this was: the recorder is the only thing that sees the claim.
    await app.inject({ method: 'GET', url: '/api/health', headers: THE_PERSON })
    const withTheClaim = headerOnlyRows()
    expect(withTheClaim).toBeGreaterThan(before)
    // THE SAME READ WITH THE KEY. It proved itself, so it is not a caller waiting for a key and the
    // summary must not grow.
    await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { ...THE_PERSON, 'x-mole-office-key': thePersonsKey() },
    })
    expect(headerOnlyRows()).toBe(withTheClaim)
  })
})
