// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW AGENT MADE BY THE START A NEW AGENT PRESS IS NAMED BY A NAME, NOT BY ITS HANDLE.
 *
 * Problem pLvkWo_hQqpm. The press filed the new agent titled "<old name> (started again)". The
 * registry takes a title as the name only when it is a name it accepts, and at the time that was five
 * words or fewer. So an old name of four words or more left the new agent named by its handle, and
 * its conversation was headed by a machine name. Wave 13q's round 14 report (block b-4) found the
 * cause and proposed the rule this file holds: "<old name> (started again)", then "<old name> (again)",
 * then the old name itself.
 *
 * A SUFFIXED NAME ANOTHER AGENT HOLDS IS NOT REUSED, AND THE NAME STAYS A NAME (problem
 * hqbovBMnTu-z, the secretary's decisions of 3 October 2026, the second in message p_04qFPdNmoQ). The rule
 * tries, in order: "<old name> (started again)", "<old name> (again)" and "<old name> <number>" with
 * the number of the new handle, and keeps the first that is a name the registry accepts and that no
 * registered agent holds. When none is, the new agent keeps the old name, never cut and never a bare
 * handle, and the chat draws a small "new" mark beside the newer of the two names.
 *
 * WHAT IS PROVED
 *   1. A two-word old name gives "<old name> (started again)".
 *   2. A four-word old name gives "<old name> (again)", and not the handle.
 *   3. A five-word old name gives the old name itself, and not the handle. The participants list
 *      says the new agent is the newer of two agents with that name, and the old one is not.
 *   4. Pressing again for the same agent gives "(again)" and then "<old name> 4", because the names
 *      before them are held by the agents the earlier presses made.
 * Each case presses the real door, POST /api/agents/:id/start-a-new-agent, and reads the name the
 * registry holds for the new agent.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the press files "<old name> (started again)" again   → cases 2, 3 and 4
 *   the rule falls back to the handle                    → case 3
 *   the participants list stops marking the newer name   → case 3
 *   the rule stops asking which names are held           → case 4
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** THE REGISTRY ROWS EACH CASE FILES, taken away at its end so the whole-office name check sees only its own. */
const madeAgentIds: string[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers: AS_THE_OWNER, ...(body === undefined ? {} : { payload: body as never }) })
  return { status: reply.statusCode, json: (reply.body === '' ? {} : reply.json()) as Record<string, unknown> }
}

type Listed = { id: string; handle: string; name: string }

async function agents(): Promise<Listed[]> {
  return ((await call('GET', '/api/participants')).json['agents'] ?? []) as Listed[]
}

/** Register an agent under a name, leave a message waiting for it, press, and give back the new agent's registry row. */
async function pressFor(handle: string, name: string): Promise<Listed> {
  const filed = await call('POST', '/api/records', { kind: 'agent', title: name, data: { handle, state: 'active', runtime: 'claude-code' } })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  const old = one((await agents()).filter((a) => a.handle === handle), `the registry row for ${handle}`)
  expect(old.name).toBe(name)
  madeAgentIds.push(old.id)
  const said = await call('POST', '/api/records', { kind: 'message', title: 'The kiln', data: { body: 'Is the kiln still hot?', to: [{ kind: 'agent', id: old.id }] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, JSON.stringify(said.json)).toBe(409)
  const pressed = await call('POST', `/api/agents/${old.id}/start-a-new-agent`, {})
  expect(pressed.status, JSON.stringify(pressed.json)).toBe(200)
  const handleMade = String(pressed.json['handle'])
  expect(handleMade).not.toBe('')
  const made = one((await agents()).filter((a) => a.handle === handleMade), `the registry row for ${handleMade}`)
  madeAgentIds.push(made.id)
  return made
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

afterEach(() => {
  const marks = (count: number): string => Array.from({ length: count }, () => '?').join(', ')
  if (madeAgentIds.length > 0) {
    const which = `(${marks(madeAgentIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM agent_records WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM handle_holds WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM agents WHERE id IN ${which}`).run(...madeAgentIds)
  }
  madeAgentIds.length = 0
})

describe('the start a new agent press names the new agent by a name', () => {
  it('names it "<old name> (started again)" when the old name is short', async () => {
    const made = await pressFor('brio-writer', 'Brio Writer')
    expect(made.name).toBe('Brio Writer (started again)')
  })

  it('names it "<old name> (again)" when the old name is four words', async () => {
    const made = await pressFor('codex-here', 'Codex on this machine')
    expect(made.name).toBe('Codex on this machine (again)')
    expect(made.name).not.toBe(made.handle)
  })

  it('names it by the old name itself when the old name is five words, and says it is the newer of the two', async () => {
    const made = await pressFor('codex-there', 'Codex on the other machine')
    expect(made.name).toBe('Codex on the other machine')
    expect(made.name).not.toBe(made.handle)
    const listed = (await call('GET', '/api/participants')).json['agents'] as (Listed & { newerOfASharedName?: unknown })[]
    const marked = (handle: string) => listed.find((a) => a.handle === handle)?.newerOfASharedName
    expect(marked(made.handle), 'the new agent is not said to be the newer of two with its name').toBe(true)
    expect(marked('codex-there'), 'the old agent is said to be the newer').toBe(false)
    const one = (await call('GET', `/api/participants/agent/${made.id}`)).json['participant'] as { newerOfASharedName?: unknown }
    expect(one.newerOfASharedName, 'a read of the one agent says something else than the list').toBe(true)
  })

  it('names a second and a third new agent of one old agent by names nobody holds yet', async () => {
    const first = await pressFor('aria-writer', 'Aria Writer')
    expect(first.name).toBe('Aria Writer (started again)')
    const old = one((await agents()).filter((a) => a.handle === 'aria-writer'), 'the registry row for aria-writer')
    const pressAgain = async (): Promise<Listed> => {
      const said = await call('POST', '/api/records', { kind: 'message', title: 'The kiln', data: { body: 'Is the kiln cold now?', to: [{ kind: 'agent', id: old.id }] } })
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(said.status, JSON.stringify(said.json)).toBe(409)
      const pressed = await call('POST', `/api/agents/${old.id}/start-a-new-agent`, {})
      expect(pressed.status, JSON.stringify(pressed.json)).toBe(200)
      const handleMade = String(pressed.json['handle'])
      const made = one((await agents()).filter((a) => a.handle === handleMade), `the registry row for ${handleMade}`)
      madeAgentIds.push(made.id)
      return made
    }
    const second = await pressAgain()
    expect(second.handle).toBe('aria-writer-3')
    expect(second.name).toBe('Aria Writer (again)')
    const third = await pressAgain()
    expect(third.handle).toBe('aria-writer-4')
    expect(third.name).toBe('Aria Writer 4')
    const names = (await agents()).map((a) => a.name)
    expect(new Set(names).size, `two agents share a name: ${names.join(', ')}`).toBe(names.length)
  })
})
