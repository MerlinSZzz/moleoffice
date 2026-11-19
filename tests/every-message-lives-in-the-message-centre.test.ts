// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY MESSAGE LIVES IN THE OFFICE'S MESSAGE CENTRE, WITH A MARK OF WHERE IT WAS WRITTEN.
 *
 * A message from the person was filed in whichever project the person's page had open, so their conversation with an
 * agent landed in ai-news. A decision on problem cxRB633r_N37 changed that. Now:
 *
 *   1. every message is stored in one reserved home, `message-centre`, whatever project the request named;
 *   2. the project the request named, and the page it names, are kept as the mark `writtenIn`, written by the office;
 *      a key is present only when the request named it, so a request that names no project stores no project rather
 *      than a guessed `default` (the product stores no null: a key left out is the answer "nobody named one");
 *   3. a writer may say which project a message is about, in `aboutProject`, and it must be a real project;
 *   4. nothing but a message may be filed in the message centre, and no project may take its id;
 *   5. the project lists a person or an agent reads leave the message centre out;
 *   6. a message is read by id, and listed, from any project; `?projects=<id>` gives one project's filtered view and
 *      `?projects=all` every project, spelled as wave 13j's doors spell it (the secretary's message TL2JENjl3ZgH);
 *   7. a message may be linked `about` a record in any project, and the link is filed in the record's project, so the
 *      record's own read still lists it;
 *   8. a comment on a record is found from the record's project;
 *   9. the waiting door names where each message was written, and no longer a project to answer in.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   (a) In createRecordWithReport (lib/records.ts), store a message in the request's project again → case 1 goes red.
 *   (b) In POST /api/records (api/records.ts), stamp `writtenIn.project` from the workspace the route resolved,
 *       `default` included → case 2 goes red.
 *   (c) In `messagesInTheViewOf` (lib/message-centre.ts), keep every message for every project → case 6 goes red.
 *   (d) In refuseCrossWorkspaceLink (lib/records.ts), drop the message exception → case 7 goes red.
 *   (e) In `listWorkspaces` (lib/workspaces.ts), keep the message centre → case 5 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CENTRE = 'message-centre'

let t: TestDb
let app: FastifyInstance

const as = (project: string | null, extra: Record<string, string> = {}): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  ...(project === null ? {} : { 'x-mole-office-workspace': project }),
  ...extra,
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as Record<string, any> }
}

async function aMessage(project: string | null, body: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const made = await call('POST', '/api/records', as(project, headers), {
    kind: 'message',
    title: body,
    data: { body, to: [{ kind: 'agent', id: 'the-reader' }], ...extra },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(made.status, JSON.stringify(made.body)).toBe(409)
  return made.body['record'] as { id: string; workspaceId: string; data: Record<string, any> }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [id, title] of [['panelx', 'Mole Office'], ['robotics', 'Robotics']]) {
    const made = await call('POST', '/api/workspaces', as(null), { id, title })
    expect(made.status, JSON.stringify(made.body)).toBeLessThan(300)
  }
  const reader = await call('POST', '/api/agents/started', as('panelx'), { handle: 'the-reader', name: 'The reader', role: 'worker' })
  expect(reader.status, JSON.stringify(reader.body)).toBeLessThan(300)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('where a message is stored, and the mark it keeps', () => {
  it('1. is stored in the message centre whatever project the request named', async () => {
    const one = await aMessage('panelx', 'Test: written on a panelx page')
    const two = await aMessage('robotics', 'Test: written on a robotics page')
    expect(one.workspaceId).toBe(CENTRE)
    expect(two.workspaceId).toBe(CENTRE)
    const stored = t.client.sqlite.prepare('SELECT workspace_id AS w FROM records WHERE id IN (?, ?)').all(one.id, two.id) as { w: string }[]
    expect(stored.map((row) => row.w)).toEqual([CENTRE, CENTRE])
  })

  it('2. keeps the project and the page it was written on, and names no project when the request named none', async () => {
    const onAPage = await aMessage('panelx', 'Test: from the chat page', {}, { 'x-mole-office-page': '#/chat' })
    expect(onAPage.data['writtenIn']).toEqual({ project: 'panelx', page: '#/chat' })
    const nowhere = await aMessage(null, 'Test: from a tool that named no project')
    expect(nowhere.data['writtenIn']).toEqual({})
    // THE MARK IS THE OFFICE'S, NOT THE WRITER'S: what a caller sends under the same name is replaced.
    const claimed = await aMessage('robotics', 'Test: claims another place', { writtenIn: { project: 'panelx', page: '#/lies' } })
    expect(claimed.data['writtenIn']).toEqual({ project: 'robotics' })
  })

  it('3. keeps a project it is about, and refuses one that does not exist', async () => {
    const about = await aMessage('robotics', 'Test: about panelx, written in robotics', { aboutProject: 'panelx' })
    expect(about.data['aboutProject']).toBe('panelx')
    const refused = await call('POST', '/api/records', as('panelx'), {
      kind: 'message',
      title: 'Test: about nothing real',
      data: { body: 'Test: about nothing real', to: [{ kind: 'agent', id: 'the-reader' }], aboutProject: 'no-such-project' },
    })
    expect(refused.status).toBe(400)
    expect(String(refused.body['error'])).toContain('no-such-project')
  })

  it('4. files nothing but a message in the message centre, and no project may take its id', async () => {
    const note = await call('POST', '/api/records', as(CENTRE), { kind: 'note', title: 'Test: a note', data: { body: 'x' } })
    expect(note.status).toBe(400)
    expect(String(note.body['error'])).toContain('message centre')
    const project = await call('POST', '/api/workspaces', as(null), { id: CENTRE, title: 'Test: taking the id' })
    expect(project.status).toBeGreaterThanOrEqual(400)
  })

  it('5. is left out of the project list a person or an agent reads', async () => {
    const listed = await call('GET', '/api/workspaces', as(null))
    expect(listed.status).toBe(200)
    const ids = (listed.body['workspaces'] as { id: string }[]).map((one) => one.id)
    expect(ids).toContain('panelx')
    expect(ids).not.toContain(CENTRE)
  })
})

describe('reading across projects', () => {
  it('6. is read by id and listed from any project, and ?projects= gives one project\'s view or all', async () => {
    const inPanelx = await aMessage('panelx', 'Test: the view of panelx')
    const aboutPanelx = await aMessage('robotics', 'Test: about panelx from robotics', { aboutProject: 'panelx' })
    const inRobotics = await aMessage('robotics', 'Test: only robotics')
    for (const project of ['panelx', 'robotics', 'default']) {
      const byId = await call('GET', `/api/records/${inPanelx.id}`, as(project))
      expect(byId.status, `read from ${project}: ${JSON.stringify(byId.body)}`).toBe(200)
      const asAMessage = await call('GET', `/api/messages/${inRobotics.id}`, as(project))
      expect(asAMessage.status, `read from ${project}: ${JSON.stringify(asAMessage.body)}`).toBe(200)
    }
    const every = await call('GET', '/api/messages', as('default'))
    const everyId = (every.body['messages'] as { id: string }[]).map((one) => one.id)
    expect(everyId).toEqual(expect.arrayContaining([inPanelx.id, aboutPanelx.id, inRobotics.id]))
    const all = await call('GET', '/api/messages?projects=all', as('robotics'))
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    expect((all.body['messages'] as { id: string }[]).map((one) => one.id)).toEqual(expect.arrayContaining([inPanelx.id, aboutPanelx.id, inRobotics.id]))
    const nothing = await call('GET', '/api/messages?projects=no-such-project', as('robotics'))
    expect(nothing.status, 'a value that names no project is refused').toBe(400)
    // THE MESSAGE CENTRE IS NO PROJECT, so asking for it is asking for no project, and it is not a project the reader is kept out of.
    const theCentre = await call('GET', '/api/messages?projects=message-centre', as('robotics'))
    expect(theCentre.status, JSON.stringify(theCentre.body)).toBe(400)
    expect(JSON.stringify(theCentre.body)).not.toMatch(/may not read/)
    const view = await call('GET', '/api/messages?projects=panelx', as('robotics'))
    expect(view.status, JSON.stringify(view.body)).toBe(200)
    const viewIds = (view.body['messages'] as { id: string }[]).map((one) => one.id)
    expect(viewIds).toEqual(expect.arrayContaining([inPanelx.id, aboutPanelx.id]))
    expect(viewIds).not.toContain(inRobotics.id)
  })

  it('7. may be linked about a record in any project, and the record\'s own read lists it', async () => {
    const module = await call('POST', '/api/records', as('panelx'), { kind: 'module', title: 'Test: the sidebar', data: { context: 'x' } })
    expect(module.status).toBe(201)
    const recordId = module.body['record'].id as string
    const asked = await call('POST', '/api/records', as('panelx'), {
      kind: 'message',
      title: 'Test: which sidebar did you mean',
      data: { body: 'Test: which sidebar did you mean', to: [{ kind: 'agent', id: 'the-reader' }] },
      links: [{ type: 'about', toId: recordId }],
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(asked.status, JSON.stringify(asked.body)).toBe(409)
    const messageId = asked.body['record'].id as string
    const link = t.client.sqlite.prepare('SELECT workspace_id AS w FROM links WHERE from_id = ? AND to_id = ?').get(messageId, recordId) as { w: string } | undefined
    expect(link?.w, 'the link is filed in the record\'s project').toBe('panelx')
    const read = await call('GET', `/api/records/${recordId}`, as('panelx'))
    expect(JSON.stringify(read.body['links'])).toContain(messageId)
  })

  it('8. finds a comment on a record from the record\'s project', async () => {
    const module = await call('POST', '/api/records', as('panelx'), { kind: 'module', title: 'Test: the corner', data: { context: 'x' } })
    const recordId = module.body['record'].id as string
    const comment = await aMessage('panelx', 'Test: a comment on the corner', {
      target: { target: { kind: 'record', recordId, workspaceId: 'panelx' } },
    })
    expect(comment.workspaceId).toBe(CENTRE)
    const comments = await call('GET', '/api/messages/comments', as('panelx'))
    expect(comments.status, JSON.stringify(comments.body)).toBe(200)
    expect(JSON.stringify(comments.body)).toContain(comment.id)
    const elsewhere = await call('GET', '/api/messages/comments', as('robotics'))
    expect(JSON.stringify(elsewhere.body)).not.toContain(comment.id)
  })

  it('9. the waiting door names where each message was written, and no project to answer in', async () => {
    const waiting = await aMessage('robotics', 'Test: waits for the reader', {}, { 'x-mole-office-page': '#/chat' })
    const read = await call('GET', '/api/handles/the-reader/waiting', {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'the-reader',
    })
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const row = (read.body['waiting'] as { messageId: string; writtenIn?: unknown; inProject?: unknown }[]).find((one) => one.messageId === waiting.id)
    expect(row?.writtenIn).toEqual({ project: 'robotics', page: '#/chat' })
    expect(row).not.toHaveProperty('inProject')
  })
})
