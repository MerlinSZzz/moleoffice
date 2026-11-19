// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY MESSAGE ALREADY WRITTEN MOVES INTO THE MESSAGE CENTRE, KEEPING ITS OLD PROJECT AS THE MARK OF WHERE IT WAS SAID.
 *
 * By point 3 of a decision, the messages already written all move into the message centre, each keeping its old project
 * as the mark of where it was said; none is deleted. The step is
 * `moveMessagesIntoTheMessageCentre` (src/server/db/message-centre-migration.ts), which `npm run db:migrate` runs. This
 * file proves, on messages put back into the shape they had before the move:
 *
 *   1. every message, deleted ones included, is moved, and its old project becomes `writtenIn.project`;
 *   2. a mark a message already held is kept;
 *   3. nothing is deleted, and no message's words, title or sender change;
 *   4. each moved message's newest revision names what it holds, so it stays writable;
 *   5. a link between a message and a record is filed in the record's project;
 *   6. a second run changes nothing and says so;
 *   7. it says what it moved, by count and by project.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   (a) Skip deleted messages in the step's query → case 1 goes red.
 *   (b) Write the mark over one a message already held → case 2 goes red.
 *   (c) Leave out the revision the step writes → case 4 goes red.
 *   (d) Leave the links where they were → case 5 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

const CENTRE = 'message-centre'

let t: TestDb
let app: FastifyInstance
let step: typeof import('../src/server/db/message-centre-migration.ts')
let version: typeof import('../src/server/lib/version.ts')
const ids = { plain: '', deleted: '', marked: '', linked: '', module: '', inRobotics: '' }
let rowsBefore = 0
let bodiesBefore: { id: string; title: string; body: string; sentBy: string }[] = []

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function post(url: string, payload: object, project = 'panelx'): Promise<Record<string, any>> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': project }, payload })
  expect(reply.statusCode, reply.body).toBe(
    theAnswerToAWriteInATestOffice({ ...AS_THE_PERSON, 'x-mole-office-workspace': project }, payload),
  )
  return reply.json() as Record<string, any>
}

async function aMessage(title: string, project = 'panelx', extra: object = {}): Promise<string> {
  const made = await post('/api/records', { kind: 'message', title, data: { body: title, to: [{ kind: 'agent', id: 'the-reader' }] }, ...extra }, project)
  return made['record'].id as string
}

/** Put a message back into the shape every message had before the move: filed in a project, with no mark. */
function asBeforeTheMove(id: string, project: string, keepTheMark = false): void {
  const sql = keepTheMark
    ? 'UPDATE records SET workspace_id = ? WHERE id = ?'
    : "UPDATE records SET workspace_id = ?, data = json_remove(data, '$.writtenIn') WHERE id = ?"
  t.client.sqlite.prepare(sql).run(project, id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [id, title] of [['panelx', 'Mole Office'], ['robotics', 'Robotics']]) await post('/api/workspaces', { id, title })
  await post('/api/agents/started', { handle: 'the-reader', name: 'The reader', role: 'worker' })
  const module = await post('/api/records', { kind: 'module', title: 'Test: the sidebar', data: { context: 'x' } })
  ids.module = module['record'].id
  ids.plain = await aMessage('Test: a plain message')
  ids.deleted = await aMessage('Test: a message later deleted')
  ids.marked = await aMessage('Test: a message already marked', 'panelx')
  ids.linked = await aMessage('Test: a question about the sidebar', 'panelx', { links: [{ type: 'about', toId: ids.module }] })
  ids.inRobotics = await aMessage('Test: said in robotics', 'robotics')
  const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${ids.deleted}`, headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': 'panelx' } })
  expect(deleted.statusCode, deleted.body).toBeLessThan(300)
  asBeforeTheMove(ids.plain, 'panelx')
  asBeforeTheMove(ids.deleted, 'panelx')
  asBeforeTheMove(ids.marked, 'panelx', true)
  asBeforeTheMove(ids.linked, 'panelx')
  asBeforeTheMove(ids.inRobotics, 'robotics')
  // THE LINK AS AN OLD ROW MIGHT HOLD IT: filed somewhere neither end is.
  t.client.sqlite.prepare('UPDATE links SET workspace_id = ? WHERE from_id = ?').run('default', ids.linked)
  rowsBefore = (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
  bodiesBefore = t.client.sqlite
    .prepare("SELECT id, title, json_extract(data, '$.body') AS body, json_extract(data, '$.sentBy') AS sentBy FROM records WHERE kind = 'message' ORDER BY id")
    .all() as typeof bodiesBefore
  step = await import('../src/server/db/message-centre-migration.ts')
  version = await import('../src/server/lib/version.ts')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the move into the message centre', () => {
  let first: ReturnType<typeof step.moveMessagesIntoTheMessageCentre>
  let second: ReturnType<typeof step.moveMessagesIntoTheMessageCentre>

  it('1. moves every message, deleted ones included, and keeps its old project as the mark', () => {
    first = step.moveMessagesIntoTheMessageCentre(t.client.sqlite)
    expect(first.moved).toBe(5)
    expect(first.movedDeleted).toBe(1)
    expect(first.movedFrom).toEqual({ panelx: 4, robotics: 1 })
    const read = t.client.sqlite.prepare("SELECT workspace_id AS w, json_extract(data, '$.writtenIn.project') AS p, json_extract(data, '$.writtenIn.recordedBy') AS by FROM records WHERE id = ?")
    for (const [id, project] of [[ids.plain, 'panelx'], [ids.deleted, 'panelx'], [ids.linked, 'panelx'], [ids.inRobotics, 'robotics']] as const) {
      const row = read.get(id) as { w: string; p: string; by: string }
      expect(row.w, id).toBe(CENTRE)
      expect(row.p, id).toBe(project)
      expect(row.by, id).toContain('the move into the message centre')
    }
    const none = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND workspace_id != ?").get(CENTRE) as { n: number }
    expect(none.n).toBe(0)
  })

  it('2. keeps a mark a message already held', () => {
    expect(first.markKept).toBe(1)
    const row = t.client.sqlite.prepare("SELECT json_extract(data, '$.writtenIn') AS mark FROM records WHERE id = ?").get(ids.marked) as { mark: string }
    expect(JSON.parse(row.mark)).toEqual({ project: 'panelx' })
  })

  it('3. deletes nothing and changes no message\'s words, title or sender', () => {
    const rowsAfter = (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
    expect(rowsAfter).toBe(rowsBefore)
    const bodiesAfter = t.client.sqlite
      .prepare("SELECT id, title, json_extract(data, '$.body') AS body, json_extract(data, '$.sentBy') AS sentBy FROM records WHERE kind = 'message' ORDER BY id")
      .all()
    expect(bodiesAfter).toEqual(bodiesBefore)
  })

  it('4. leaves each moved message\'s newest revision naming what it holds', () => {
    for (const id of [ids.plain, ids.linked, ids.inRobotics]) {
      const row = t.client.sqlite.prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?').get(id) as {
        kind: string
        title: string
        summary: string | null
        data: string
        deleted_at: string | null
      }
      const newest = t.client.sqlite.prepare('SELECT content_hash AS h, workspace_id AS w FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as { h: string; w: string }
      const content = version.contentOf({ kind: row.kind, title: row.title, summary: row.summary, data: JSON.parse(row.data), deletedAt: row.deleted_at })
      expect(newest.h, id).toBe(version.versionOf(content))
      expect(newest.w, id).toBe(CENTRE)
    }
  })

  it('5. files a link between a message and a record in the record\'s project', () => {
    expect(first.linksRefiled).toBe(1)
    const link = t.client.sqlite.prepare('SELECT workspace_id AS w FROM links WHERE from_id = ? AND to_id = ?').get(ids.linked, ids.module) as { w: string }
    expect(link.w).toBe('panelx')
  })

  it('6. changes nothing the second time, and says so', () => {
    second = step.moveMessagesIntoTheMessageCentre(t.client.sqlite)
    expect(second).toEqual({ tablesMissing: false, registryRowWritten: false, moved: 0, movedDeleted: 0, movedFrom: {}, markKept: 0, linksRefiled: 0 })
    expect(step.describeTheMoveIntoTheMessageCentre(second)).toContain('no message was left in a project')
  })

  it('7. says what it moved, by count and by project', () => {
    const said = step.describeTheMoveIntoTheMessageCentre(first)
    expect(said).toContain('5 message(s) moved in (4 from panelx, 1 from robotics)')
    expect(said).toContain('1 of them deleted')
    expect(said).toContain('1 link(s) refiled')
    expect(said).toContain('nothing deleted')
  })
})
