// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT WHOSE ID IS NOT ITS HANDLE WRITES UNDER ITS NAME, AND IS NOT CALLED UNREGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I9: *nothing running has to restart on the day.* Every agent alive when this cluster
 * lands goes on sending its handle in `x-mole-office-actor-id`, and after the id is split from the
 * handle that string is no longer the agent's id. Three readings stand between such an agent and its
 * own writes, and all three ask the same id-or-handle question:
 *
 *   `participantForActor` in src/server/lib/participants.ts — now the resolver.
 *   `whyAnUnregisteredAgentMayNotWrite` in src/server/lib/records/unregistered-agent.ts — reads that answer.
 *   `refuseAnUnregisteredAgentActor` in src/server/api/records.ts — turns its sentence into a 403.
 *
 * The last two landed on main on 16 September in commit f9193cf9 and belong to piece I-3b. This file
 * does not change them. It proves that they let such an agent through, so that the piece which
 * converts them knows what it must keep true.
 *
 * AND THE UNREGISTERED-WRITERS READING. `unregisteredAgentsSeen` excludes an actor id that is any
 * agent's id OR any agent's handle. The second half is what covers an agent writing under its name
 * once the two differ. Until now it was there by luck — every id equalled its handle, so the first
 * half already covered everything — and nothing in the repository proved it. This file is what makes
 * it there on purpose. The query itself is deliberately unchanged.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ROW IS WRITTEN STRAIGHT AT THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * The registration door still sets an agent's id to its handle on this branch: the mint is piece
 * I-1b and lands after the doors that read a handle as an id have been converted. So an agent whose
 * id is not its handle cannot be made through the door here, and this test inserts one — which is
 * also exactly what an agent renamed after registration looks like today, because the door follows a
 * record's handle with an UPDATE and never touches the id.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SOCKET AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * `whyAnUnregisteredAgentMayNotWrite` reads `actor.from`, which the listener that accepted the
 * connection writes. An injected request is on no socket, so the rule does not apply to it and a test
 * using one would prove nothing about the caller the rule is about.
 * tests/a-write-under-an-unregistered-agent-id-is-refused.test.ts says the same and this follows it.
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RegistryLib = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let app: FastifyInstance
let base: string
let registry: RegistryLib

/** The agent this file is about: a minted-shaped id, and a name that is not it. */
const ITS_ID = 'Yh3kQ2mVb8Tz'
const ITS_HANDLE = 'still-sends-its-name'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function ask(
  method: 'GET' | 'POST',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; body: string; said: Record<string, unknown> | null }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = await res.text()
  let said: Record<string, unknown> | null = null
  try {
    said = JSON.parse(body) as Record<string, unknown>
  } catch {
    said = null
  }
  return { status: res.status, body, said }
}

beforeAll(async () => {
  t = await freshDb()
  registry = await import('../src/server/lib/participants.ts')
  // THE PICTURE ROW FIRST. `agents.avatar_asset_id` carries a foreign key into `assets` and is never
  // null, so a row written straight at the table needs its picture row written first. This is the
  // same `default` origin row src/server/db/participants-migration.ts writes for every agent.
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${ITS_ID}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    )
    .run(ITS_ID, 'Still Sends Its Name', ITS_HANDLE, `avatar-default-agent-${ITS_ID}`, '2026-09-16 10:00:00')
  // AND THE PAIR THAT MAKES ONE STRING MEAN TWO AGENTS, for the block at the foot of this file.
  // `quill` is a retired agent's id — it kept that id because nothing is rewritten — and it is also
  // the live handle of a second agent that took the name afterwards.
  for (const one of [
    { id: 'quill', handle: 'quill-the-first', name: 'Quill', retired: 1 },
    { id: 'Qq8wR4nLc1Vx', handle: 'quill', name: 'Quill Two', retired: 0 },
  ]) {
    t.client.sqlite
      .prepare(
        'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
          "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
          "'generated') ON CONFLICT(id) DO NOTHING",
      )
      .run(`avatar-default-agent-${one.id}`, '2026-09-16 10:00:00')
    t.client.sqlite
      .prepare(
        'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        one.id,
        one.name,
        one.handle,
        `avatar-default-agent-${one.id}`,
        one.retired,
        one.retired === 1 ? '2026-09-10 14:00:00' : null,
        '2026-09-16 10:00:00',
      )
  }
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('an agent whose id is not its handle is still one the office knows', () => {
  it('is the row the resolver answers with, whichever of the two strings arrives', () => {
    expect(registry.participantForActor({ type: 'agent', id: ITS_HANDLE })).toEqual({ kind: 'agent', id: ITS_ID })
    expect(registry.participantForActor({ type: 'agent', id: ITS_ID })).toEqual({ kind: 'agent', id: ITS_ID })
  })

  it('writes under its name and is not refused, which is what criterion I9 rests on', async () => {
    const wrote = await ask(
      'POST',
      '/api/records',
      { kind: 'note', title: 'A note written under a name that is not an id', data: { body: 'under my own name' } },
      asAgent(ITS_HANDLE),
    )

    expect(wrote.status, wrote.body).toBe(201)

    // AND THE CHANGE ROW KEEPS THE HEADER'S OWN STRING. `actorFrom` stamps what arrived, on purpose,
    // so the permanent log goes on naming the agent that wrote each row. Nothing normalises it.
    const log = await ask('GET', '/api/changes', undefined, AS_THE_PERSON)
    const writers = ((log.said?.['changes'] ?? []) as { actorId: string }[]).map((one) => one.actorId)
    expect(writers, 'the change row does not carry the name the request sent').toContain(ITS_HANDLE)
    expect(writers, 'something rewrote the header into the id').not.toContain(ITS_ID)
  })

  it('is not on the list of agents nothing has registered, though the log names it by handle', () => {
    // `unregisteredAgentsSeen` reads `changes` and excludes an actor id that is any agent's id OR any
    // agent's handle. This is the half that covers the row written above.
    const seen = registry.unregisteredAgentsSeen().map((one) => one.id)

    expect(seen, 'an agent writing under its own registered name was called unregistered').not.toContain(ITS_HANDLE)
    expect(seen).not.toContain(ITS_ID)
  })

  it('still names an agent nothing has registered, so the reading has not been widened into uselessness', async () => {
    const unknown = 'claude-code/nobody-registered-this-one'
    const refused = await ask('POST', '/api/records', { kind: 'note', title: 'From nobody' }, asAgent(unknown))

    expect(refused.status, 'a write under an id no registry holds was accepted').toBe(403)
    expect(String(refused.said?.['error'] ?? '')).toContain(unknown)
  })

  it('answers nobody for a name nothing bears, which is what the unregistered rule reads', () => {
    expect(registry.participantForActor({ type: 'agent', id: 'nobody-bears-this-name' })).toBeNull()
  })
})

// =========================================================================== the other answer it gives

describe('participantForActor tells an absence from an ambiguity, because they are different facts', () => {
  it('answers null where nothing bears the name, exactly as it always did', () => {
    // About thirty doors are built on that answer, and the rule behind them is to name it,
    // never stop it. Nothing about this moved.
    expect(registry.participantForActor({ type: 'agent', id: 'nobody-bears-this-name' })).toBeNull()
  })

  it('re-raises the resolver’s refusal where the name means two agents, rather than calling it null', () => {
    // NULL WOULD BE A WRONG ANSWER HERE, NOT AN ABSENCE. It would make the unregistered-writer rule
    // refuse the write saying "Nothing is registered as the agent quill" when two things are — a
    // refusal that stops the right write for a reason that is false.
    let said: { message: string; status: number } | null = null
    try {
      registry.participantForActor({ type: 'agent', id: 'quill' })
    } catch (error) {
      const held = error as { message?: unknown; status?: unknown }
      said = { message: String(held.message ?? ''), status: Number(held.status ?? 0) }
    }

    expect(said, 'an ambiguous name was answered instead of refused').not.toBeNull()
    expect(said!.status).toBe(409)
    expect(said!.message).toContain('names two agents')
    expect(said!.message).toContain('Quill')
    expect(said!.message).toContain('Quill Two')
  })
})
