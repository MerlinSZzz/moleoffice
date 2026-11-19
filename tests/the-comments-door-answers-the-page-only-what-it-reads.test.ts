// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The comments door keeps its whole answer and cuts only the page's explicit reading. */
import type Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

// Written independently of the shared tuples: dropping a drawn field must fail this criterion.
const DRAWN_OF_A_COMMENT = [
  'id', // src/web/components/agent/marks.ts notesWaiting
  'kind', // src/shared/messages.ts targetOfRecord
  'writtenOrder', // src/web/components/agent/AgentSaidHere.tsx whatAgentsSaidOn
  'data',
]
const DRAWN_OF_ITS_DATA = [
  'body', // src/web/components/agent/marks.ts notesWaiting
  'target', // src/shared/messages.ts targetOfRecord, a comment that is a message
  'context', // src/shared/messages.ts targetOfRecord, a comment written as an annotation
  'sentBy', // src/web/components/agent/AgentSaidHere.tsx senderOf
]
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-lark' }
// The answer's id sorts before the remark's, by code unit and by locale.
const REMARK_ID = 'Z9madeUpRmrk'
const ANSWER_ID = 'A1madeUpAnsr'
type Row = Record<string, unknown> & { data: Record<string, unknown> }
type Answer = { comments: Row[]; recipientNames: Record<string, string | null>; workspaceId: string }
let t: TestDb
let app: FastifyInstance
let builds: () => number

/** Give a stored message another id in every table that names it, in one transaction. */
function renameAMessage(db: Database.Database, from: string, to: string): void {
  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON')
    for (const [table, column] of [['records', 'id'], ['message_delivery', 'message_id'], ['revisions', 'record_id'], ['changes', 'record_id']]) {
      db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(to, from)
    }
  })()
}

async function write(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  expect(made.statusCode, made.body).toBe(theAnswerToAWriteInATestOffice(headers, payload))
  return made.json<{ record: { id: string } }>().record.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  builds = (await import('../src/server/lib/comments-answer.ts')).howManyCommentsAnswersWereBuilt
  await write(PERSON, { kind: 'agent', title: 'Made-up Lark', data: { handle: 'made-up-lark', runtime: 'claude-code', state: 'active' } })
  const page = await write(PERSON, { kind: 'module', title: 'A made-up page', summary: 'A made-up page with comments on it.', data: { context: 'This module is only a test fixture.' } })
  const place = { target: { kind: 'region', recordId: page, regionId: 'section.links' }, place: { at: 'surface' } }
  const remark = await write(AGENT, { kind: 'message', title: 'A made-up remark', data: { body: 'This made-up reading needs one more check.', to: [{ kind: 'person', id: THE_PERSON }], target: place } })
  const answer = await write(PERSON, { kind: 'message', title: 'A made-up answer', data: { body: 'Checked again; it holds.', to: [{ kind: 'agent', id: 'made-up-lark' }], target: place } })
  await write(PERSON, { kind: 'annotation', title: 'A made-up older comment', data: { body: 'Written the older way.', context: { target: { kind: 'record', recordId: page, workspaceId: 'default' } } } })
  // THE ANSWER IN THE SAME SECOND AS THE REMARK, WITH AN ID THAT SORTS FIRST. The remark was stored
  // first. An order that breaks a tie of stamps by id puts the answer first.
  const db = t.client.sqlite
  db.prepare('UPDATE records SET created_at = (SELECT created_at FROM records WHERE id = ?) WHERE id = ?').run(remark, answer)
  renameAMessage(db, remark, REMARK_ID)
  renameAMessage(db, answer, ANSWER_ID)
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

describe('the comments door', () => {
  it('still answers whole rows when shape is left out', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/messages/comments', headers: PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const whole = reply.json<Answer>()
    expect(whole.comments.map(one => one['kind']).sort()).toEqual(['annotation', 'message', 'message'])
    for (const row of whole.comments) {
      expect(row).toHaveProperty('updatedAt')
      expect(row).toHaveProperty('workspaceId')
      expect(row).toHaveProperty('title')
      expect(row).toHaveProperty('origin')
    }
    expect(whole.comments.some(one => Object.hasOwn(one.data, 'to'))).toBe(true)
    expect(Object.keys(whole.recipientNames).length).toBeGreaterThan(0)
    const again = await app.inject({ method: 'GET', url: '/api/messages/comments', headers: PERSON })
    expect(again.body).toBe(reply.body)
  })

  it('answers the same comments in order, with exactly the drawn fields each whole one carries, from the same build', async () => {
    const whole = await app.inject({ method: 'GET', url: '/api/messages/comments', headers: PERSON })
    const builtBefore = builds()
    const short = await app.inject({ method: 'GET', url: '/api/messages/comments?shape=page', headers: PERSON })
    const wholeAfter = await app.inject({ method: 'GET', url: '/api/messages/comments', headers: PERSON })
    expect(whole.statusCode, whole.body).toBe(200)
    expect(short.statusCode, short.body).toBe(200)
    expect(builds(), 'the page shape is cut from the answer already kept').toBe(builtBefore)
    expect(wholeAfter.body, 'cutting the page shape leaves the kept answer whole').toBe(whole.body)
    const full = whole.json<Answer>()
    const cut = short.json<Answer>()
    expect(cut.comments.map(one => one['id'])).toEqual(full.comments.map(one => one['id']))
    for (const [index, row] of cut.comments.entries()) {
      const original = full.comments[index]!
      const kept = DRAWN_OF_A_COMMENT.filter(field => Object.hasOwn(original, field))
      expect(Object.keys(row).sort(), `comment ${index}`).toEqual(kept.sort())
      for (const field of kept) if (field !== 'data') expect(row[field], field).toEqual(original[field])
      const keptData = DRAWN_OF_ITS_DATA.filter(field => Object.hasOwn(original.data, field))
      expect(Object.keys(row.data).sort(), `comment ${index} data`).toEqual(keptData.sort())
      for (const field of keptData) expect(row.data[field], field).toEqual(original.data[field])
    }
    expect(cut.recipientNames).toEqual(full.recipientNames)
    expect(cut.workspaceId).toBe(full.workspaceId)
    expect(Object.keys(cut).sort()).toEqual(Object.keys(full).sort())
  })

  it('numbers each comment in the order it was written: by its stamp, then by the order it was stored in, and never by id', async () => {
    const db = t.client.sqlite
    const stamps = db.prepare('SELECT id, created_at AS at FROM records WHERE id IN (?, ?) ORDER BY rowid').all(REMARK_ID, ANSWER_ID) as { id: string; at: string }[]
    expect(stamps.map(one => one.id), 'the remark was stored first').toEqual([REMARK_ID, ANSWER_ID])
    expect(stamps[0]?.at, 'in the same second as the answer').toBe(stamps[1]?.at)
    for (const url of ['/api/messages/comments', '/api/messages/comments?shape=page']) {
      const reply = await app.inject({ method: 'GET', url, headers: PERSON })
      expect(reply.statusCode, reply.body).toBe(200)
      const rows = reply.json<Answer>().comments
      const ids = rows.map(one => String(one['id']))
      const stored = (db.prepare(`SELECT id FROM records WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY created_at, rowid`).all(...ids) as { id: string }[]).map(one => one.id)
      expect(stored.length, url).toBe(3)
      expect(Object.fromEntries(rows.map(one => [one['id'], one['writtenOrder']])), url).toEqual(Object.fromEntries(stored.map((id, at) => [id, at + 1])))
    }
  })

  it('refuses unknown shapes with the same refusal as the groups door', async () => {
    for (const shape of ['whole', '']) {
      const wrong = await app.inject({ method: 'GET', url: `/api/messages/comments?shape=${shape}`, headers: PERSON })
      const group = await app.inject({ method: 'GET', url: `/api/groups?shape=${shape}`, headers: PERSON })
      expect(wrong.statusCode).toBe(400)
      expect(wrong.json<{ error: string }>().error).toBe(group.json<{ error: string }>().error)
    }
  })
})
