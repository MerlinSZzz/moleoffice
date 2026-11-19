// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD AND ITS RELATIONSHIPS IN ONE REQUEST, AND THE ALL-OR-NOTHING CONTRACT.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUESTION THIS ANSWERS, AND THE ANSWER THAT WAS RULED OUT
 * ---------------------------------------------------------------------------------------
 *
 * Seven agents recorded this project's own development through the API in one night, and every
 * relationship was a second request: one of them made roughly forty requests to file eleven
 * records. The links are not decoration — "a result nobody is using" and "work waiting on a result
 * that does not exist" are the two queries the whole typed-link system exists for — so a record
 * filed without them is a record the product cannot answer anything about.
 *
 * The shape that was ruled out is the tempting one: store the record, try each link, report what
 * happened to each. It answers 201 for work that did not happen, and leaves the caller checking a
 * record it was told had been filed. So the contract here is ALL OR NOTHING, and these tests are
 * about that contract rather than about the convenience:
 *
 *   - what the caller is told when it works: which record, and what is now linked to what, with
 *     every title resolved to the record it really meant;
 *   - what is LEFT BEHIND when one relationship is unusable: nothing. Not the record, not the
 *     links that would have been fine, not a change row. Each refusal below is checked for that,
 *     because "it returned 400" is a code path and "nothing half-happened" is the promise.
 *
 * POST /api/links has not moved, and the last test says so: relating two records that already
 * exist is still one request, and this route did not take that over.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, at, freshDb, one, type TestDb } from './helpers.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
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

function errorOf(res: { body: string }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  return message
}

interface MadeLink {
  id: string
  type: string
  from: { id: string; kind: string; title: string }
  to: { id: string; kind: string; title: string }
  newRecordIs: 'from' | 'to'
  note: string
}

let h: Harness

beforeEach(async () => {
  h = await freshApp()
})
afterEach(async () => {
  await h.app.close()
  h.db.close()
})

/** The workspace a filing lands in: something to be about, and something to be blocked by. */
function theWorkspace(): { module: string; reprint: string } {
  const module = h.db.api.createRecord({ workspaceId: 'default',
    kind: 'module',
    title: 'Wrist camera',
    data: { context: 'the fixed camera loses the hand at the moment that matters', parts: [] },
    actor: AGENT,
  })
  const reprint = h.db.api.createRecord({ workspaceId: 'default',
    kind: 'task',
    title: 'Reprint the v3 shell at effort 12',
    data: { state: 'doing' },
    actor: AGENT,
  })
  return { module: module.id, reprint: reprint.id }
}

/** Everything Mole Office would have to undo if a create is refused: rows, links and history. */
function everything(): { records: number; links: number; changes: number } {
  return {
    records: h.db.api.listRecords({ workspaceId: 'default', includeDeleted: true }).length,
    links: h.db.api.allLinks('default').length,
    changes: h.db.api.listChanges({ workspaceId: 'default' }).length,
  }
}

// ============================================================ 1. the record arrives joined up

describe('a record and its relationships arrive together', () => {
  it('files the record, writes both relationships, and says what is linked to what', async () => {
    const { module, reprint } = theWorkspace()

    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'problem',
        title: 'The wrist camera loses the hand below 300 mm',
        data: { symptom: 'tracking drops out inside 300 mm', state: 'open' },
        links: [
          // The new record is the FROM end: this problem is ABOUT that module. Named by title,
          // because a title is what somebody typing actually has.
          { type: 'about', toTitle: 'Wrist camera' },
          // The new record is the TO end: that task BLOCKS this problem. Named by id.
          { type: 'blocks', fromId: reprint },
        ],
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    const body = bodyOf(res)
    const filed = (body['record'] as { id: string }).id

    const links = body['links'] as MadeLink[]
    expect(links).toHaveLength(2)

    // THE TITLE WAS RESOLVED, and that is the whole reason the ends come back rather than being
    // echoed: a name is a belief about which record the caller meant, and this is where it is
    // confirmed. The reply names the real id, the real title and the kind at both ends.
    const about = at(links, 0, 'link')
    expect(about.type).toBe('about')
    expect(about.newRecordIs).toBe('from')
    expect(about.from.id).toBe(filed)
    expect(about.to).toEqual({ id: module, kind: 'module', title: 'Wrist camera' })
    expect(about.note).toContain('"The wrist camera loses the hand below 300 mm" about "Wrist camera"')

    // Direction is carried by WHICH KEY was sent, so the second entry means the other way round.
    const blocked = at(links, 1, 'link')
    expect(blocked.newRecordIs).toBe('to')
    expect(blocked.from.id).toBe(reprint)
    expect(blocked.to.id).toBe(filed)

    // And it is one sentence too, for a caller that reads the first line rather than the array.
    expect(String(body['linksNote'])).toContain('2 relationships were written with the record')

    // What the product now says about the record is what was asked for, read back where a page
    // reads it: the module shows it as its subject, and the task shows what it is holding up.
    const onTheRecord = h.db.api.resolveLinks(filed)
    expect(onTheRecord.map((l) => l.label).sort()).toEqual(['about', 'blocked by'])
    expect(one(h.db.api.resolveLinks(module), 'link on the module').label).toBe('subject of')
    expect(one(h.db.api.resolveLinks(reprint), 'link on the task').label).toBe('blocks')
  })

  it('carries the gate a dependency needs, so the blocked record can say how much it blocks', async () => {
    const { reprint } = theWorkspace()

    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'task',
        title: 'Measure grip force at effort 12',
        data: { state: 'blocked' },
        links: [{ type: 'blocks', fromId: reprint, gate: { kind: 'hard' } }],
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    const filed = (bodyOf(res)['record'] as { id: string }).id

    // The gate is stored on the link and read from the blocked end, which is the end that has to
    // say what it is waiting for — the same one row, read from the other side.
    const waiting = one(h.db.api.resolveLinks(filed), 'link')
    expect(waiting.gate).toEqual({ kind: 'hard' })
    expect(waiting.isBacklink).toBe(true)
    expect(String(at(bodyOf(res)['links'] as MadeLink[], 0, 'link').note)).toContain('blocked by')
  })

  it('defaults an entry with no type to the honest generic, and says which type it stored', async () => {
    const { module } = theWorkspace()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'note',
        title: 'Something I noticed about the camera',
        links: [{ toId: module }],
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    // `relates_to` means "somebody joined these and did not say how", which is true of a request
    // that did not say how — and the reply names it, so nobody has to guess what was stored.
    expect(at(bodyOf(res)['links'] as MadeLink[], 0, 'link').type).toBe('relates_to')
  })
})

// ============================================================ 2. all or nothing

describe('one unusable relationship refuses the whole request', () => {
  it('stores neither the record nor the relationships that would have been fine', async () => {
    const { module, reprint } = theWorkspace()
    const before = everything()

    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'problem',
        title: 'The wrist camera loses the hand below 300 mm',
        data: { state: 'open' },
        links: [
          { type: 'about', toId: module },
          // The mistake: a title nobody in this workspace holds. It sits BETWEEN two good entries
          // on purpose — the one before it would have been written by a route that tried each in
          // turn, and the one after would not have been.
          { type: 'relates_to', toTitle: 'A module nobody ever filed' },
          { type: 'blocks', fromId: reprint },
        ],
      },
    })
    expect(res.statusCode, res.body).toBe(404)

    // WHICH relationship failed, and why. An index alone would be useless to a caller that built
    // the list in a loop, so the entry it sent is quoted back.
    const message = errorOf(res)
    expect(message).toContain('links[1]')
    expect(message).toContain('A module nobody ever filed')
    expect(message).toContain('Nothing was stored')

    // AND NOTHING HAPPENED. Not the record, not the first link, not a change row: the database is
    // exactly as it was, which is the promise this route makes and the reason it is one
    // transaction rather than three writes and a report.
    expect(everything()).toEqual(before)
    expect(h.db.api.getRecordByTitle('The wrist camera loses the hand below 300 mm', 'default')).toBeNull()
    expect(h.db.api.resolveLinks(module)).toEqual([])
  })

  it('refuses an id that names nothing, and says the record was not created either', async () => {
    const before = everything()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'task',
        title: 'Something waiting on a record that does not exist',
        links: [{ type: 'blocks', fromId: 'rec_nothing_here' }],
      },
    })
    expect(res.statusCode, res.body).toBe(404)
    // A caller that is only told "no such record" cannot tell whether its task was filed. This is
    // the sentence that stops it having to look.
    expect(errorOf(res)).toContain('not the record')
    expect(everything()).toEqual(before)
  })

  it('refuses an entry that names both ends, or neither, rather than guessing which was meant', async () => {
    const { module, reprint } = theWorkspace()
    const before = everything()

    for (const [entry, expected] of [
      [{ type: 'about', toId: module, fromId: reprint }, '2 ends'],
      [{ type: 'about' }, 'no end'],
      [{ type: 'about', toId: module, toTitle: 'Wrist camera' }, '2 ends'],
    ] as const) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/records',
        headers: AS_AGENT,
        payload: { kind: 'note', title: `A note ${JSON.stringify(entry).length}`, links: [entry] },
      })
      expect(res.statusCode, `${JSON.stringify(entry)} -> ${res.body}`).toBe(400)
      // The record being created is the other end and has no id yet, so an entry naming two ends
      // is saying the new record is not in the link at all. Refused, never resolved to one of them.
      expect(errorOf(res)).toContain(expected)
    }
    expect(everything()).toEqual(before)
  })

  it('refuses a gate the link path would refuse, and writes nothing', async () => {
    // The gate rules are not restated here: this goes through the same `checkGate` POST /api/links
    // uses, so a gate that route refuses cannot arrive through this one instead.
    const { reprint } = theWorkspace()
    const before = everything()

    for (const gate of [{ kind: 'partial' }, { kind: 'hard', upTo: 'somewhere' }, { kind: 'sort of' }]) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/records',
        headers: AS_AGENT,
        payload: {
          kind: 'task',
          title: `A task with a gate ${JSON.stringify(gate).length}`,
          links: [{ type: 'blocks', fromId: reprint, gate }],
        },
      })
      expect(res.statusCode, `${JSON.stringify(gate)} -> ${res.body}`).toBe(400)
    }
    // A gate on a type that cannot carry one is the same refusal.
    const wrongType = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'task',
        title: 'A task with a gate on the wrong link',
        links: [{ type: 'relates_to', fromId: reprint, gate: { kind: 'hard' } }],
      },
    })
    expect(wrongType.statusCode, wrongType.body).toBe(400)
    expect(everything()).toEqual(before)
  })

  it('refuses the same relationship twice in one request rather than reporting it as two', async () => {
    // Making a link is idempotent, so the second would write nothing and the reply would say two
    // links were made where one row exists. Small, and still a success report for work that did
    // not happen.
    const { module } = theWorkspace()
    const before = everything()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'problem',
        title: 'Something about the camera',
        links: [
          { type: 'about', toId: module },
          { type: 'about', toTitle: 'Wrist camera' },
        ],
      },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain('links[0]')
    expect(everything()).toEqual(before)
  })

  it('refuses a title that names a deleted record, and accepts the same record by id', async () => {
    // A NAME IS A BELIEF THAT THE RECORD IS CURRENT; an id is a statement that you have seen which
    // record it is. So the two are answered differently, and the difference is not a technicality:
    // a task that consumes a claim somebody has since retracted is a real thing to file.
    const claim = h.db.api.createRecord({ workspaceId: 'default', kind: 'claim', title: 'Detection holds to 1.4 m', actor: AGENT })
    h.db.api.deleteRecord(claim.id, AGENT)

    const byName = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'task',
        title: 'Rerun the detection sweep',
        links: [{ type: 'consumes', toTitle: 'Detection holds to 1.4 m' }],
      },
    })
    expect(byName.statusCode, byName.body).toBe(409)
    expect(errorOf(byName)).toContain(claim.id)
    expect(h.db.api.getRecordByTitle('Rerun the detection sweep', 'default')).toBeNull()

    const byId = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'task',
        title: 'Rerun the detection sweep',
        links: [{ type: 'consumes', toId: claim.id }],
      },
    })
    expect(byId.statusCode, byId.body).toBe(201)
    const filed = (bodyOf(byId)['record'] as { id: string }).id
    // Stored, and shown as broken on both ends, which is the true state of it.
    expect(one(h.db.api.resolveLinks(filed), 'link').broken).toBe(true)
  })

  it('refuses an empty list rather than treating it as "no links"', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'note', title: 'A note with an empty links list', links: [] },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(h.db.api.getRecordByTitle('A note with an empty links list', 'default')).toBeNull()
  })

  it('answers the permission question before the relationship one, and writes neither', async () => {
    // An agent filing a decision WITH links is refused for being an agent, not for anything about
    // its links — and the links are not written on the way to finding that out.
    const { module } = theWorkspace()
    const before = everything()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'decision',
        title: 'A decision an agent tried to file with its links',
        links: [{ type: 'about', toId: module }],
      },
    })
    expect(res.statusCode, res.body).toBe(403)
    expect(everything()).toEqual(before)
  })
})

// ============================================================ 3. the separate route stays

describe('POST /api/links has not been taken over', () => {
  it('still relates two records that already exist', async () => {
    // The create carries what the caller knows at the moment it files. Everything learnt afterwards
    // — including a gate on somebody else's link — is still one request, and it is this one.
    const { module, reprint } = theWorkspace()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: AS_AGENT,
      payload: { fromTitle: 'Reprint the v3 shell at effort 12', toId: module, type: 'about' },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(one(h.db.api.resolveLinks(reprint), 'link').other.id).toBe(module)
  })
})
