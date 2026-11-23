// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTES AROUND A DECISION MAY BE CHANGED BY ANY AGENT, AND THE PAGE SAYS WHO AND WHEN.
 * Criterion P76.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * Whoever made the decision may change it, and the administrator may
 * too. The decision itself is closed to everyone but its maker and the person. The notes around it
 * — when to revisit it, what was rejected, its links and where it came from — are open to any
 * agent, and every such change says who and when on the page.
 *
 * THE HISTORY IS NOT A NEW ONE. The revisions ledger already stores who and when for every kind and
 * the record page draws it through `ChangeLog` and `RecordHistory`; this file checks that the notes
 * change reaches that ledger.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT TURNS THIS RED
 * ---------------------------------------------------------------------------------------
 *
 * Gate the notes the way the core is gated — make a notes-only change require the maker too — and
 * the first case goes red with a 403.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Change } from '../src/shared/types.ts'

type GovernanceModule = typeof import('../src/web/components/Governance.tsx')
type ChangeLogModule = typeof import('../src/web/components/ChangeLog.tsx')

let t: TestDb
let app: FastifyInstance
let gv: GovernanceModule
let cl: ChangeLogModule
let decision: string
const THE_OWNER = 'the owner'
const THE_AGENT = 'claude-code/a-worker'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT: Record<string, string> = {
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_AGENT,
}

beforeAll(async () => {
  // The component modules reach api.ts and touch window while they are being evaluated. This is the
  // smallest stand-in that lets them load; nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  gv = (await import('../src/web/components/Governance.tsx')) as GovernanceModule
  cl = (await import('../src/web/components/ChangeLog.tsx')) as ChangeLogModule
})

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
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'decision',
      title: 'Keep the port as it is',
      data: {
        ...governsTheWholeProject(),
        replaces: [], option_taken: 'a — keep it', because: 'it has worked for a month', decided_by: THE_OWNER },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  decision = ((made.json() as { record: { id: string } }).record).id
})

async function changesFor(recordId: string): Promise<Change[]> {
  const reply = await app.inject({ method: 'GET', url: `/api/changes?recordId=${recordId}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { changes: Change[] }).changes
}

describe('a note is open to an agent, and the record says who changed it and when', () => {
  it('lets any agent change the condition to revisit, and writes the change with the actor and the time', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${decision}`,
      headers: AS_AN_AGENT,
      payload: { dataPatch: { revisit_when: 'when the sensor is calibrated' } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)

    const made = await changesFor(decision)
    const row = made.find((one) => (one.field ?? '').endsWith('revisit_when'))
    expect(row, 'the notes change did not reach the change log').toBeDefined()
    expect(row?.actorId, 'the change does not say who made it').toBe(THE_AGENT)
    expect(String(row?.at).trim(), 'the change does not say when').not.toBe('')

    // AND THE PAGE DRAWS THE SAME LEDGER. `ChangeLog` is what the record page mounts; rendering it
    // with the row the server wrote is what makes "the page says who and when" a fact about the
    // page rather than about the database.
    //
    // BY THE NAME THE REGISTRY GIVES (criterion change, wave 13k round 34). The page names a writer as a
    // person knows them, and keeps the stored handle for developer mode; so the registry the record page
    // hands it is handed here too, with one made-up agent under this handle.
    const registry = { people: [], agents: [{ id: 'notes-agent-row', handle: THE_AGENT, name: 'Ash Merrow' }] }
    const drawn = renderToStaticMarkup(
      h(cl.ChangeLog, { changes: made, sessions: [], titles: new Map(), participants: registry as never }) as never,
    )
    expect(drawn, 'the page does not name the agent that changed the note').toContain('Ash Merrow')
    expect(drawn, 'the handle reached a normal page').not.toContain(THE_AGENT)
    // `Stamp` draws a relative time and carries the stored moment in the element's own `datetime`.
    // The page therefore says when the note moved; the raw moment is what the listing can be read
    // against, and a reader hovering it sees the same date.
    expect(drawn, 'the page does not carry the time the note was changed').toContain(String(row?.at))
  })

  it('lets a different agent change a different note', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${decision}`,
      headers: {
        ...AS_THE_PERSON,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'another-agent',
      },
      payload: { dataPatch: { alternatives_rejected: ['swap to a socket of its own'] } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const row = (await changesFor(decision)).find((one) => (one.field ?? '').endsWith('alternatives_rejected'))
    expect(row?.actorId).toBe('another-agent')
  })
})

