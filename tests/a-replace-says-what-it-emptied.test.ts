// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A write that took fields off a record says which fields it took.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A wholesale `data` is allowed to empty the fields it does not carry, as long as the caller says
 * it means to. So the loss is now asked for — and it still has to be REPORTED, because a caller
 * that says "replace" is not thereby saying it knows the list. The write that emptied seven fields
 * of one problem record on 4 September 2026 came back 200 with an empty `incomplete` list and
 * nothing anywhere in it naming what had gone; the loss was found two hours later by somebody
 * reading the record.
 *
 * `emptied` is that list. It is on every reply to a request that sent `data`, empty when the
 * rewrite took nothing, and absent on a merge — a merge cannot empty a field it does not name, and
 * it has its own report of what it changed and deleted, which this file also pins as still there.
 *
 * WHY THE EMPTY LIST IS NOT AN OMISSION. Sending `data` asks what the whole-object rewrite cost.
 * "Nothing" is an answer to that question, and a key that appears only when the news is bad is one
 * a caller has to know about in advance to read. It is the rule `kindChange` already follows for
 * a kind that did not change.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

/** The `emptied` list of a reply, checked to be one. */
function emptiedOf(res: { body: string }): string[] {
  const list = bodyOf(res)['emptied']
  if (!Array.isArray(list) || list.some((one) => typeof one !== 'string')) {
    throw new Error(`expected emptied to be a list of field names, got ${res.body.slice(0, 300)}`)
  }
  return list as string[]
}

function aProblemWithNineFields(): Record<string, unknown> {
  return {
    symptom: 'A partial data PATCH empties the fields it leaves out.',
    cause: 'The route offers two bodies that do opposite things.',
    why_it_hurts: 'A destructive write is answered exactly like a harmless one.',
    fix: 'Refuse it, name what would go, and report what went.',
    state: 'open',
    whose_move: 'agent',
    found_by: 'two builders, twenty minutes apart',
    how_to_tell_it_is_back: 'PATCH a record with a partial data object and read back the fields you did not send.',
    seen_in: ['panelx', 'src/server/lib/records.ts'],
  }
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  const harness = await freshApp()
  t = harness.db
  app = harness.app
})

afterEach(async () => {
  await app.close()
  t.close()
})

function fileTheProblem(): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'problem',
    title: 'a problem with nine fields',
    data: aProblemWithNineFields(),
    actor: AGENT,
  }).id
}

describe('what a replace says it emptied', () => {
  it('names every field it took off the record', async () => {
    const id = fileTheProblem()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { state: 'fixed', fix: 'done' }, replace: true },
    })

    expect(res.statusCode, res.body.slice(0, 400)).toBe(200)
    expect(emptiedOf(res).sort()).toEqual(
      ['cause', 'found_by', 'how_to_tell_it_is_back', 'seen_in', 'symptom', 'whose_move', 'why_it_hurts'],
    )
    // AND THE REPORT IS ABOUT THE RECORD, not about the request: the fields it names are exactly the
    // ones a reader can no longer find.
    expect(Object.keys(t.api.getRecord(id)?.data ?? {}).sort()).toEqual(['fix', 'state'])
  })

  it('is never absent when something was removed, so one field going is as visible as seven', async () => {
    const id = fileTheProblem()
    const whole = aProblemWithNineFields()
    delete whole['seen_in']

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: whole, replace: true },
    })

    expect(res.statusCode, res.body.slice(0, 400)).toBe(200)
    expect(emptiedOf(res)).toEqual(['seen_in'])
  })

  it('is an empty list, not a missing key, when the replace took nothing', async () => {
    const id = fileTheProblem()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { ...aProblemWithNineFields(), fix: 'rewritten, and nothing lost' } },
    })

    expect(res.statusCode, res.body.slice(0, 400)).toBe(200)
    // The key is there. A key that appears only when the news is bad is one a caller has to know
    // about in advance to read.
    expect('emptied' in bodyOf(res)).toBe(true)
    expect(emptiedOf(res)).toEqual([])
  })

  it('says the same thing when the replace changed nothing at all and wrote no revision', async () => {
    const id = fileTheProblem()
    const whole = aProblemWithNineFields()
    delete whole['seen_in']

    // First the replace itself, so the record now holds exactly `whole`.
    const first = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: whole, replace: true },
    })
    expect(first.statusCode, first.body.slice(0, 400)).toBe(200)

    // Then the same body again. Nothing is written — `newSeq` is null — and the reply still answers
    // the question the body asked.
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: whole },
    })
    expect(again.statusCode, again.body.slice(0, 400)).toBe(200)
    expect(bodyOf(again)['newSeq']).toBeNull()
    expect(emptiedOf(again)).toEqual([])
  })
})

describe('what a merge says, which is unchanged', () => {
  it('reports what it changed and what it deleted, and carries no `emptied` at all', async () => {
    const id = fileTheProblem()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { state: 'fixed', seen_in: null } },
    })

    expect(res.statusCode, res.body.slice(0, 400)).toBe(200)
    const report = bodyOf(res)['dataPatch'] as { changed: string[]; deleted: string[]; note: string }
    expect(report.changed).toEqual(['data.state'])
    expect(report.deleted).toEqual(['data.seen_in'])
    // And a sentence a person reads, with no stored paths in it.
    expect(report.note).toContain('seen in')

    // NO `emptied`. A merge cannot empty a field it does not name, so there is no question here for
    // an empty list to answer, and a key on every reply is a key that stops being read.
    expect('emptied' in bodyOf(res)).toBe(false)

    // The seven fields the merge never mentioned are all still there.
    expect(Object.keys(t.api.getRecord(id)?.data ?? {}).sort()).toEqual(
      ['cause', 'fix', 'found_by', 'how_to_tell_it_is_back', 'state', 'symptom', 'whose_move', 'why_it_hurts'],
    )
  })

  it('carries no `emptied` on a patch that touches no data either', async () => {
    const id = fileTheProblem()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { title: 'the same problem, renamed' },
    })

    expect(res.statusCode, res.body.slice(0, 400)).toBe(200)
    expect('emptied' in bodyOf(res)).toBe(false)
  })
})
