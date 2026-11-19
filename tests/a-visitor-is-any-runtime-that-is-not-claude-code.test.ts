// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGISTRATION DOOR JUDGES BY THE LISTENER, NOT THE RUNTIME — CRITERION P88, AS AMENDED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * A decision first said, on 9 September 2026, that every Codex, and every agent from
 * another machine, is a visitor, and the door judged by the declared runtime. A later ruling
 * ended that: an agent on this machine is not a visitor whatever runtime it runs
 * on. A visitor is only an agent from another machine, which comes in through the Embassy on a
 * credential the person confirms. This file used to pin the old behavior and now pins the amendment.
 *
 * The secretary's ruling of 12 September 2026 is still here: the refusal applies to registrations
 * made from this merge onward, and the rows already registered are neither retired nor refused. A
 * row admitted before P88 says, on the Embassy and on the citizen's page, what runtime it declares
 * and the date it was admitted.
 *
 * Five things:
 *
 *   · a registration on this machine declaring claude-code goes through;
 *   · one declaring dsh goes through, because this office's own tools start it;
 *   · one declaring codex goes through, because this machine is not a visitor;
 *   · one declaring no runtime goes through, because the runtime no longer judges;
 *   · a row admitted before P88 keeps working, and its row carries the runtime and the date;
 *   · the Embassy row draws the runtime beside the machine.
 *
 * ---------------------------------------------------------------------------------------
 * A REAL LISTENER FOR THE REGISTRATIONS
 * ---------------------------------------------------------------------------------------
 *
 * P88 judges a registration that arrived on a listener. `app.inject()` is an in-process caller that
 * arrived through neither listener, and the gate's own doctrine says such a request is not a
 * registration from anywhere. So these cases go over this test's own loopback socket, and the second
 * listener supplies a visitor's measured machine.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   In src/server/lib/registrationgate.ts, make `whyThisRegistrationFromThisMachineIsRefused`
 *   refuse `codex` again → the codex case and the no-runtime case fail. That is the runtime gate
 *   being put back, which the self-registration tests also name.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { admittedBeforeP88Says } from '../src/shared/participants.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'

type EmbassyModule = typeof import('../src/web/pages/EmbassyPage.tsx')

let t: TestDb
let app: FastifyInstance
let here: string
let elsewhere: string
let ep: EmbassyModule
let visitorMachine = ''

const extraDoors: Server[] = []
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

/** A registration sent over this test's own loopback socket, which is a real listener. */
async function fromHere(
  path: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; said: string; json: Record<string, unknown> }> {
  const res = await fetch(`${here}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    body: JSON.stringify(body),
  })
  const said = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(said) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, said, json }
}

async function theEmbassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // A SECOND LISTENER, STAMPED AS ANOTHER MACHINE, so a credential's machine is measured rather
  // than claimed. It is the product's own door, not a copy of it.
  elsewhere = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )

  // THE PAGE'S OWN HALF, drawn with what the server actually said, the way the other Embassy test
  // does it.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '?mode=inspect' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ep = (await import('../src/web/pages/EmbassyPage.tsx')) as EmbassyModule

  /**
   * A ROW THE OLD DOOR ADMITTED, written straight into the registry as a record the gate never saw.
   * Its `created_at` is moved back to 8 September 2026 so it is before P88, and it declares codex
   * with no credential — exactly the shape of the 37 rows the secretary's ruling names.
   */
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'An old Codex row',
    // WHO STARTED IT: the person, so the chain reaches somebody and the row can register an agent
    // below it. That is not the point of the case; the point is that its runtime does not refuse it.
    data: {
      handle: 'old-codex',
      state: 'active',
      runtime: 'codex',
      startedBy: { kind: 'person', id: THE_PERSON },
    },
    actor: { type: 'human', id: THE_PERSON },
  })
  t.client.sqlite
    .prepare('UPDATE agents SET created_at = ? WHERE handle = ?')
    .run('2026-09-08 10:00:00', 'old-codex')

  // AND A VISITOR FROM ANOTHER MACHINE, confirmed, so an ordinary citizen row carries a runtime and
  // a measured machine. It is the row P88 says is listed with both.
  const asked = await fetch(`${elsewhere}/api/office/visitors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' },
    body: JSON.stringify({
      handle: 'pending-visitor',
      name: 'The visitor on loquat',
      role: 'worker',
      conversationPath: '/transcripts/loquat/pending.jsonl',
      runtime: 'codex',
    }),
  })
  expect(asked.status, await asked.clone().text()).toBe(201)
  const issued = (await asked.json()) as { credential: { id: string; machine: string | null } }
  visitorMachine = issued.credential.machine ?? ''
  expect(visitorMachine, 'the product measured a machine for the credential').not.toBe('')
  const confirmed = await fetch(`${here}/api/office/visitors/${issued.credential.id}/confirm`, {
    method: 'POST',
    headers: PERSON,
  })
  expect(confirmed.status, await confirmed.clone().text()).toBe(200)
})

afterAll(async () => {
  for (const s of extraDoors) await new Promise<void>((r) => s.close(() => r()))
  await app.close()
  t.close()
})

describe('the registration door judges by the listener, not the runtime', () => {
  it('lets a claude-code registration on this machine through', async () => {
    const said = await fromHere('/api/agents/started', PERSON, {
      handle: 'own-runtime',
      name: 'This machine’s own',
      runtime: 'claude-code',
    })
    expect(said.status, said.said).toBe(201)
  })

  it('lets a dsh registration on this machine through, because the office\u2019s own tools start it', async () => {
    // CRITERION P88, AS AMENDED 12 SEPTEMBER 2026. The first wording refused every runtime but
    // Claude Code, which would have locked out every worker building this project: a decision
    // has workers run on DeepSeek through dsh by default. Problem vae0bq5r1v6h.
    const said = await fromHere('/api/agents/started', PERSON, {
      handle: 'a-dsh-worker',
      name: 'A dsh worker',
      runtime: 'dsh',
    })
    expect(said.status, said.said).toBe(201)
    const back = await app.inject({ method: 'GET', url: '/api/participants/agent/a-dsh-worker', headers: PERSON })
    expect(back.statusCode, 'and it is a citizen like any other').toBe(200)
  })

  it('lets a codex registration on this machine through, because this machine is not a visitor', async () => {
    // CRITERION P88, AS AMENDED (this machine is not a visitor): the judgment by
    // runtime ends. A visitor is only an agent from another machine, which comes in through the
    // Embassy on a credential the person confirms. This case used to expect a 403; the 403 was the rule as
    // it was before that amendment, and the old test file pinned it. The old wording is in
    // design/permissions/ACCEPTANCE.md and in the commit that amended it.
    const said = await fromHere('/api/agents/started', PERSON, {
      handle: 'codex-here',
      name: 'A Codex on this machine',
      runtime: 'codex',
    })
    expect(said.status, said.said).toBe(201)
    const back = await app.inject({ method: 'GET', url: '/api/participants/agent/codex-here', headers: PERSON })
    expect(back.statusCode, 'and it is a citizen of this machine, not a visitor').toBe(200)
  })

  it('lets a registration that names no runtime through too, because the runtime no longer judges', async () => {
    // THE AMENDMENT ENDS THE WHOLE JUDGMENT, not only the codex branch. This case used to expect a
    // 403 naming the field; a registration on this machine is now judged by the listener it arrived
    // on, and a runtime it did not declare is recorded as nobody having said rather than refused.
    const said = await fromHere('/api/agents/started', PERSON, { handle: 'no-runtime', name: 'Nobody said' })
    expect(said.status, said.said).toBe(201)
    const back = await app.inject({ method: 'GET', url: '/api/participants/agent/no-runtime', headers: PERSON })
    expect(back.statusCode, 'and it is registered').toBe(200)
  })
})

describe('a row admitted before P88', () => {
  it('keeps working, and its row says its runtime and the date it was admitted', async () => {
    // IT STILL WORKS. The old codex row registers an agent of this machine's own runtime, which a
    // rule applied to stored rows would refuse before it ever reached the body.
    const made = await fromHere('/api/agents/started', {
      ...PERSON,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'old-codex',
    }, { handle: 'child-of-old-codex', name: 'A child of the old row', runtime: 'claude-code' })
    expect(made.status, made.said).toBe(201)

    // AND THE EMBASSY ROW SAYS WHAT IT IS. This is the point of the whole piece: a rule about new
    // registrations must not break the office it governs.
    const said = await theEmbassy()
    // THE EMBASSY ROW IS KEYED BY REGISTRY ID, and a row filed since the mint has an id of its own.
    const oldCodex = (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'old-codex'").get() as { id: string }).id
    const row = said.rows.find((one) => one.who.id === oldCodex)
    expect(row, 'the old row is on the Embassy').toBeDefined()
    expect(row?.runtime, 'and declares its runtime').toBe('codex')
    expect(row?.admittedBeforeP88, 'and says it was admitted before P88').toContain('before P88')
    expect(row?.admittedBeforeP88).toContain('codex')
    expect(row?.admittedBeforeP88).toContain('2026-09-08')
    expect(row?.admittedBeforeP88).toBe(admittedBeforeP88Says('codex', '2026-09-08 10:00:00'))

    // AND THE CITIZEN'S PAGE SAYS THE SAME SENTENCE.
    const profile = await app.inject({
      method: 'GET',
      url: '/api/participants/agent/old-codex/profile',
      headers: PERSON,
    })
    expect(profile.statusCode, profile.body).toBe(200)
    expect((profile.json() as { admittedBeforeP88: string | null }).admittedBeforeP88).toContain('before P88')
  })
})

describe('the Embassy row', () => {
  it('draws the runtime beside the machine in Inspect, under plan 7FEOshq3mBGG', async () => {
    const said = await theEmbassy()
    const markup = renderToStaticMarkup(h(ep.TheEmbassy, { said }))
    expect(markup, 'the runtime label').toContain('>runtime</span><span class="emb-value">codex<')
    expect(markup, 'and the measured machine beside it').toContain(
      `>machine</span><span class="emb-value">${visitorMachine}<`,
    )
    // AND THE OLD ROW'S SENTENCE IS ON THE PAGE, not only in the reply.
    // THE EMBASSY ROW IS KEYED BY REGISTRY ID, and a row filed since the mint has an id of its own.
    const oldCodex = (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'old-codex'").get() as { id: string }).id
    const row = said.rows.find((one) => one.who.id === oldCodex)
    expect(markup, 'the pre-P88 sentence is drawn on the row').toContain(String(row?.admittedBeforeP88))
  })
})
