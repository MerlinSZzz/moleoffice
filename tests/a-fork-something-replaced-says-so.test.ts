// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORK SOMETHING REPLACED LEAVES THE QUEUE, AND ONE THAT DID NOT COUNT SAYS SO ON THE ROW.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HALVES, AND ONLY THE SECOND WAS BROKEN
 * ---------------------------------------------------------------------------------------
 *
 * A `supersedes` link from a person takes a fork off both lists and names it under `leftTheQueue`.
 * That worked, and the first test here pins it so it goes on working.
 *
 * A `supersedes` link from an AGENT does not take one of the owner's forks off, and that refusal is
 * right: an agent that could take a question away from the owner with a link would be settling it by
 * another door. What was wrong is that nothing said so. Proposal `h6O_RMpeYBTD` carried such a link
 * from 24 August 2026, sat on the owner's list for ten days with the answer stored beside it, and was asked
 * of the owner twice — once tangled and once separated — while `GET /api/forks` promised in its own
 * description that a superseded fork stops waiting on anybody. Problem `lgcrmxPcWG9h`.
 *
 * The fork now carries `replacedButStillHere`: who claimed what, when, why it did not count, and the
 * one request that would make it count. The third test is the live shape, written straight into the
 * tables the way the 24 August row got there, before the guard that now refuses it existed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import type { ForksReply } from '../src/server/api/forks.ts'
import type { WaitingReply } from '../src/server/api/waiting.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'panelx'

const asAgent: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const asPerson: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * A fork the PERSON filed, with whatever it says about who settles it.
 *
 * FILED BY THE OWNER SINCE 3 SEPTEMBER 2026. Two things changed that day, both from the rule that
 * an engineering question is the agent's (`design/messages/ACCEPTANCE.md` W3): a fork an AGENT files
 * says `who_settles_it: "an agent"` unless the agent names something else, and an agent may correct
 * a classification IT wrote. Every fixture below is about a fork on the owner's queue, so filing it under
 * the owner's name is what it was always meant to be — an agent-filed fixture was giving the guard the
 * agent's own sentence to defend, which is a different question. Nothing else about these tests
 * moved.
 */
async function fileFork(title: string, settles?: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: {
      kind: 'proposal',
      title,
      data: {
        question: 'Is a module card a boundary?',
        options: ['a — yes', 'b — no'],
        ...(settles === undefined ? {} : { who_settles_it: settles }),
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function waiting(): Promise<WaitingReply> {
  const res = await app.inject({ method: 'GET', url: '/api/waiting', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as WaitingReply
}

async function desk(): Promise<ForksReply> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ForksReply
}

describe('a fork something replaced', () => {
  it('leaves both lists when the owner makes the link, and comes back when it is removed', async () => {
    const startedLeft = new Set((await desk()).leftTheQueue.map((left) => left.proposalId))
    const old = await fileFork('Is a module card a boundary? (tangled with the label question)')
    const fresh = await fileFork('The module-label question, asked again without the two concerns tangled')

    expect((await desk()).forks.map((fork) => fork.recordId), 'it should start on the desk').toContain(old)

    const made = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asPerson,
      payload: { fromId: fresh, toId: old, type: 'supersedes' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const linkId = (made.json() as { id: string }).id

    // OFF BOTH LISTS, AND NAMED ON THE WAY OUT WITH WHAT REPLACED IT.
    const read = await desk()
    expect(read.forks.map((fork) => fork.recordId), 'a superseded fork is still on the desk').not.toContain(old)
    expect((await waiting()).items.map((item) => item.id), 'a superseded fork is still on the owner’s list').not.toContain(old)
    const gone = one(
      read.leftTheQueue.filter((left) => left.proposalId === old),
      'the superseded fork under leftTheQueue',
    )
    expect(gone.why).toBe('superseded')
    expect(gone.insteadId).toBe(fresh)
    expect(gone.sentence).toContain('replaced it')

    // AND REMOVING THE LINK PUTS IT BACK, on both, because nothing was decided and nothing stored a flag.
    const removed = await app.inject({ method: 'DELETE', url: `/api/links/${linkId}`, headers: asPerson })
    expect(removed.statusCode, removed.body).toBe(200)
    expect((await desk()).forks.map((fork) => fork.recordId)).toContain(old)
    expect((await waiting()).items.map((item) => item.id)).toContain(old)
    const added = (await desk()).leftTheQueue.filter((left) => !startedLeft.has(left.proposalId))
    expect(added).toEqual([])
  })

  it('leaves both lists on an agent’s link when the fork is not the owner’s to settle', async () => {
    const old = await fileFork('Which internal file does the bundle call?', 'an agent')
    const fresh = await fileFork('The bundle question, asked once for all three callers', 'an agent')
    const made = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asAgent,
      payload: { fromId: fresh, toId: old, type: 'supersedes' },
    })
    expect(made.statusCode, made.body).toBe(201)
    expect((await desk()).forks.map((fork) => fork.recordId)).not.toContain(old)
    expect((await desk()).leftTheQueue.map((left) => left.proposalId)).toContain(old)
  })

  it('an agent’s link on the owner’s fork does not take it off, and the row says so', async () => {
    const startedLeft = new Set((await desk()).leftTheQueue.map((left) => left.proposalId))
    const old = await fileFork('Is a module card a boundary?', 'the owner')
    const fresh = await fileFork('The module-label question, asked again')

    // THE WRITE IS REFUSED TODAY, in as many words, and that refusal is not what this is about.
    const refused = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asAgent,
      payload: { fromId: fresh, toId: old, type: 'supersedes' },
    })
    expect(refused.statusCode, refused.body).toBe(403)

    // SO THE ROW IS WRITTEN THE WAY THE 24 AUGUST ONE GOT THERE: straight into the tables, before
    // the guard that now refuses it stood. An archive restored tomorrow can carry more of these.
    t.client.sqlite
      .prepare(
        'INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, created_by, created_at, updated_at) ' +
          `VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, 'supersedes', ?, ?, ?)`,
      )
      .run('legacy-super1', PROJECT, fresh, old, 'claude-round-ten', '2026-08-24 17:38:47', '2026-08-24 17:38:47')
    t.client.sqlite
      .prepare(
        'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, new_value, at) ' +
          "VALUES (?, ?, ?, 'link', 'agent', 'claude-round-ten', 'supersedes', ?, ?)",
      )
      .run('legacy-chg1', fresh, PROJECT, old, '2026-08-24 17:38:47')

    // STILL THE OWNER'S, ON BOTH LISTS. This is the refusal and it does not move.
    const read = await desk()
    expect(read.forks.map((fork) => fork.recordId), 'an agent took the owner’s fork off with a link').toContain(old)
    expect(read.leftTheQueue.filter((left) => !startedLeft.has(left.proposalId)), 'an agent’s link took a fork out of the queue').toEqual([])
    expect((await waiting()).items.map((item) => item.id)).toContain(old)

    // AND THE ROW SAYS WHAT WAS CLAIMED. This is the part that was missing: the link was stored, no
    // surface mentioned it, and the fork was asked of the owner again with the answer sitting beside it.
    const row = one(
      read.forks.filter((fork) => fork.recordId === old),
      'the fork somebody said was replaced',
    )
    const claim = row.replacedButStillHere
    expect(claim, 'the stored supersedes link is not reported anywhere').not.toBeNull()
    expect(claim?.why).toBe('superseded')
    expect(claim?.insteadId).toBe(fresh)
    expect(claim?.linkedBy).toBe('claude-round-ten')
    expect(claim?.linkedAt).toBe('2026-08-24 17:38:47')
    expect(claim?.sentence).toContain('did not take it off your queue')
    expect(claim?.sentence).toContain('IF YOU AGREE, IT IS ONE REQUEST')
    expect(claim?.sentence).toContain(fresh)

    // AND A FORK NOBODY CLAIMED ANYTHING ABOUT CARRIES NOTHING, so the field is not noise on every row.
    expect(
      one(
        read.forks.filter((fork) => fork.recordId === fresh),
        'the replacing fork',
      ).replacedButStillHere,
    ).toBeNull()
  })
})
