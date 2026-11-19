// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONLY ITS WRITER CHANGES A MESSAGE, AND ONLY ITS WORDS, AND ONLY FOR A WHILE.
 * The rule comes from a decision on problem L6joIpuePIvP, and the edit window from
 * another.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `PATCH /api/records/:id` asked only whether the caller could read a message. So a recipient, a group member or the
 * person could rewrite somebody else's words, anybody who could read a notice from Mole Office could rewrite it, a
 * writer could rewrite its own words at any time with no mark, and a kind change out of a message made its words
 * ordinary text. `DELETE` and the restore door did not ask who wrote the message either. The mark door answered "No
 * message has the id" before it asked whether the caller could read the message, which told a stranger which ids
 * exist.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * One scratch office with a real listener, as tests/after-the-close-a-claim-with-no-key-is-nobody does. The person's
 * key closes the key window first, so every request below carries the key of whoever it names. Five callers: the
 * writer, the recipient, a member of a group the writer wrote to, a stranger in the same project, and the owner. One notice
 * Mole Office wrote, the line that opens the group. The writer's window is closed by moving the message's written
 * time back ten minutes in the scratch database.
 *
 * A directly addressed reader is held while its message is sent, so the cases can examine editing.
 * The keys are the ones this test's own scratch office handed out. No real key is read or printed.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, one line each, after a green control
 * ---------------------------------------------------------------------------------------
 *
 * (a) In `whatAChangeToAMessageMustCarry` (src/server/lib/records.ts), return null on its first line. Eight cases go
 *     red: every PATCH refusal, and the writer's edit loses its mark. The stranger's case stays green, because the
 *     read check refuses a stranger before this function is asked.
 * (b) In the same function, write `if (ago > window && false)`. (b) goes red.
 * (c) In the same function, write `if (false)` for the `isMoleOffice(sender)` refusal. (c) goes red: the owner changing
 *     the notice is answered by the writer check, with the wrong code.
 * (d) In `refuseADeleteOfAMessageByAnyoneButItsWriter`, return on its first line. (d) goes red, and (c) with it,
 *     because the notice is then deleted.
 * (e) In the mark door (src/server/api/messages.ts), delete the `refuseAMessageThisReaderMayNotRead` line. (e) goes
 *     red: the stranger is told "was not addressed to" for a message that exists and "No message has the id" for
 *     one that does not.
 * (f) In `askForARunFor` (src/server/lib/worker.ts), delete `[THE_START_AN_AGENT_DOOR]: true`. (f) goes red.
 * (g) In `createRecordWithReport` (src/server/lib/records.ts), delete the line that drops a sent `edited`. (g) goes red:
 *     the message is stored looking changed, with an original nobody wrote.
 * (h) In `whatAChangeToAMessageMustCarry`, ask the window of every message, as if each had gone out. (h) goes red: the owner's
 *     unsent comment is refused after two minutes, and so is the comment in (i) before anybody is handed it.
 * (i) In `aMessageHasGoneOut` (src/server/lib/messages.ts), answer false for every message. (i) goes red: a comment
 *     somebody has been handed can still be rewritten and turned into a note after two minutes. So do (b), the
 *     first case of (a), whose edit loses its mark, and the kind case of (i).
 * (j) In `whatAChangeToAMessageMustCarry`, refuse a kind change out of every message, as if each had gone out. (j)
 *     goes red: the owner's unsent comment cannot be corrected into a note.
 * (m) In `patchRecord` (src/server/lib/records.ts), skip `fileARecordWhoseKindChanged`. (j) goes red: the note stays in
 *     the message centre, and no list of its project finds it.
 * (k) In `whereAKindChangeFilesARecord` (src/server/lib/move.ts), answer the message centre when a message names no
 *     project. (k) goes red: the kind change is written and the note is left in the message centre.
 * (l) In the same function, skip the check of links left crossing. (l) goes red: the write is rolled back by the move's
 *     own last check, with a 500 that calls it a defect, instead of a refusal saying what to do.
 * (n) In `whatAChangeToAMessageMustCarry`, never let `data.to` through, as before round 31. (n) goes red: the writer
 *     cannot address a saved comment to the person.
 * (o) In the same function, let `data.to` through whether or not the message has gone out. (o) goes red: a comment
 *     somebody has been handed, and a message written to somebody, gain the person.
 *
 * ---------------------------------------------------------------------------------------
 * A MESSAGE THAT HAS NOT GONE OUT (problem FTSKBGVWL_Q8, check VRD-9qQrWH9O)
 * ---------------------------------------------------------------------------------------
 *
 * A decision gives the two-minute window to a message that has been sent. Writing a message to
 * somebody is sending it. A comment is a message that points at part of a page, and the owner's review comments are
 * written with nobody to hand them to. Until somebody is handed a comment's words it has not gone out: the review pane
 * offers Edit on it at any age, and it may be corrected into another kind like any record. Only its writer may do
 * either.
 *
 * A COMMENT WRITTEN STRAIGHT TO ITS AGENT, as the comment box's Send writes it, HAS GONE OUT WHEN IT IS WRITTEN. Writing
 * a comment to somebody is sending it, as for any message, so it has the window from then, before anybody is handed it.
 * Until 7 November 2026 it had not gone out until somebody was handed it, and the chat drew it *Not sent yet* until then.
 * The comments here that have not gone out are written to nobody and then have the agent chosen for them, as the review
 * column's Choose a recipient does.
 *
 * Wave 13n round 31 (from wave 13r's message): while a comment has not gone out, its writer may also add the person to
 * who it is for, in `data.to`. The record door then writes the person's delivery row. Every addressee it already had
 * stays, and only a person may be added this way. Once the comment has gone out, `data.to` is fixed like the rest.
 */

import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made up here. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

const WRITER = 'the-writer'
const RECIPIENT = 'the-recipient'
const MEMBER = 'a-group-member'
const STRANGER = 'a-stranger'

const WORKSPACE = { 'x-mole-office-workspace': 'default' }

interface Answer {
  status: number
  body: Record<string, unknown>
  error: string
  code: unknown
}

let t: TestDb
let app: FastifyInstance
let door: string
const keys = new Map<string, string>()
const ids = new Map<string, string>()

function as(who: string): Record<string, string> {
  if (who === 'the-owner') return { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': who, 'x-mole-office-key': keys.get(who) ?? '' }
}

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Answer> {
  const sent = body as { kind?: string; data?: { to?: { kind: string; id: string }[] } } | undefined
  const isDirectSend = method === 'POST' && path === '/api/records' && sent?.kind === 'message' &&
    sent.data?.to?.some((one) => one.kind === 'agent' && one.id === RECIPIENT) === true
  let holder = ''
  if (isDirectSend) {
    holder = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic holder', actor: t.api.HUMAN,
      data: { state: 'running', runtime: 'claude-code' } }).id
    const { registerResource } = await import('../src/server/lib/resources.ts')
    registerResource({ workspaceId: 'default', sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
    const held = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(RECIPIENT)}/hold`, headers: as('the-owner'),
      payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' } })
    expect(held.statusCode, held.body).toBe(201)
  }
  let res: Response
  try {
    res = await fetch(`${door}${path}`, {
      method,
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } finally {
    if (holder) {
      const released = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(RECIPIENT)}/release`, headers: as('the-owner'),
        payload: { session: holder, because: 'The synthetic send is complete.' } })
      expect(released.statusCode, released.body).toBe(200)
    }
  }
  const read = (await res.json()) as Record<string, unknown>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : '', code: read['code'] }
}

/** The record as it is stored, read by the owner, who reads every message. */
async function stored(id: string): Promise<{ title: string; kind: string; workspaceId: string; updatedAt: string; data: Record<string, unknown>; deletedAt: string | null }> {
  const read = await ask('GET', `/api/records/${id}`, as('the-owner'))
  expect(read.status, read.error).toBe(200)
  return read.body['record'] as { title: string; kind: string; workspaceId: string; updatedAt: string; data: Record<string, unknown>; deletedAt: string | null }
}

/** The ids a project's own list of one kind holds, read by the owner. */
async function listed(project: string, kind: string): Promise<string[]> {
  const read = await ask('GET', `/api/records?kind=${kind}`, { ...as('the-owner'), 'x-mole-office-workspace': project })
  expect(read.status, read.error).toBe(200)
  return (read.body['records'] as { id: string }[]).map((one) => one.id)
}

/** A message from the writer to the recipient, filed with the writer's key. */
async function aMessage(body: string): Promise<string> {
  const wrote = await ask('POST', '/api/records', as(WRITER), {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: [{ kind: 'agent', id: RECIPIENT }] },
  })
  expect(wrote.status, wrote.error).toBe(201)
  return (wrote.body['record'] as { id: string }).id
}

/** Move a message's written time ten minutes back, which closes its writer's window. */
function writtenTenMinutesAgo(id: string): void {
  const then = new Date(Date.now() - 10 * 60 * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${String(then.getFullYear())}-${pad(then.getMonth() + 1)}-${pad(then.getDate())} ${pad(then.getHours())}:${pad(then.getMinutes())}:${pad(then.getSeconds())}`
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stamp, id)
}

let groupMessage: string
let notice: string
let aRecordToPointAt: string

/** A comment pointing at a record, written by `who`, to `to` when named and otherwise to nobody. */
async function aComment(who: string, body: string, to?: string): Promise<string> {
  const wrote = await ask('POST', '/api/records', as(who), {
    kind: 'message',
    title: body.slice(0, 40),
    data: {
      body,
      target: { target: { kind: 'record', recordId: aRecordToPointAt, workspaceId: 'default' } },
      ...(to === undefined ? {} : { to: [{ kind: 'agent', id: to }] }),
    },
  })
  expect(wrote.status, wrote.error).toBe(201)
  return (wrote.body['record'] as { id: string }).id
}

/**
 * A COMMENT WRITTEN TO NOBODY BY `who`, AND THEN THE AGENT `agent` CHOSEN FOR IT, with the write the review column's
 * Choose a recipient makes. That is a comment that has not gone out while nobody has been handed it. A comment written
 * straight to an agent has gone out when it is written.
 */
async function aCommentChosenFor(who: string, body: string, agent: string): Promise<string> {
  const id = await aComment(who, body)
  const chosen = await ask('PATCH', `/api/records/${id}`, as(who), { dataPatch: { chosenRecipient: { kind: 'agent', agentId: ids.get(agent) } } })
  expect(chosen.status, chosen.error).toBe(200)
  return id
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // FOUR AGENTS, EACH REGISTERED BY THE OWNER WITH THE OWNER'S KEY, and each keeps the key its registration answered.
  for (const handle of [WRITER, RECIPIENT, MEMBER, STRANGER]) {
    const made = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY, 'content-type': 'application/json' },
      payload: { handle, name: handle },
    })
    if (made.statusCode !== 201) throw new Error(`registering ${handle} answered ${String(made.statusCode)}: ${made.body}`)
    const answered = made.json() as { agent: { id: string }; whatToGiveIt?: { key?: string } }
    keys.set(handle, String(answered.whatToGiveIt?.key ?? ''))
    ids.set(handle, answered.agent.id)
  }
  const closed = await ask('POST', '/api/office/key-window/close', { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY })
  if (closed.status !== 200) throw new Error(`closing the key window answered ${String(closed.status)}: ${closed.error}`)

  // A GROUP OF THE WRITER AND THE MEMBER, opened by the owner, because a worker may not open one. Opening it makes Mole
  // Office write the notice that opens it.
  const opened = await ask('POST', '/api/groups', as('the-owner'), {
    name: 'Two agents',
    because: 'the writer writes to the member here',
    members: [
      { who: { kind: 'agent', id: ids.get(WRITER) }, because: 'it writes here' },
      { who: { kind: 'agent', id: ids.get(MEMBER) }, because: 'it reads here' },
    ],
  })
  if (opened.status !== 201) throw new Error(`opening the group answered ${String(opened.status)}: ${opened.error}`)
  const groupId = (opened.body['group'] as { id: string }).id
  const lines = (await ask('GET', `/api/groups/${groupId}`, as('the-owner'))).body['messages'] as { id: string }[]
  notice = lines[0]?.id ?? ''
  if (notice === '') throw new Error('opening the group wrote no line')
  const wrote = await ask('POST', '/api/records', as(WRITER), { kind: 'message', title: 'To the group', data: { body: 'To the group.', toGroup: groupId } })
  if (wrote.status !== 201) throw new Error(`writing to the group answered ${String(wrote.status)}: ${wrote.error}`)
  groupMessage = (wrote.body['record'] as { id: string }).id
  const note = await ask('POST', '/api/records', as('the-owner'), { kind: 'note', title: 'Test: a page the owner reviews', data: {} })
  if (note.status !== 201) throw new Error(`writing the note answered ${String(note.status)}: ${note.error}`)
  aRecordToPointAt = (note.body['record'] as { id: string }).id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the writer', () => {
  it('(a) changes its words inside the window, and the first change keeps the words as first written', async () => {
    const id = await aMessage('The pots are in the east bay.')
    const first = await ask('PATCH', `/api/records/${id}`, as(WRITER), { title: 'The pots are in the west bay', dataPatch: { body: 'The pots are in the west bay.' } })
    expect(first.status, first.error).toBe(200)
    const once = await stored(id)
    expect(once.title).toBe('The pots are in the west bay')
    expect(once.data['body']).toBe('The pots are in the west bay.')
    const mark = once.data['edited'] as { at: string; by: unknown; original: unknown }
    expect(mark.by).toEqual({ kind: 'agent', id: ids.get(WRITER) })
    expect(mark.original).toEqual({ title: 'The pots are in the east bay.', body: 'The pots are in the east bay.' })
    expect(typeof mark.at).toBe('string')

    const second = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { body: 'The pots are in the north bay.' } })
    expect(second.status, second.error).toBe(200)
    const twice = await stored(id)
    expect(twice.data['body']).toBe('The pots are in the north bay.')
    expect((twice.data['edited'] as { original: unknown }).original, 'a later change keeps the original').toEqual(mark.original)
  })

  it('(a) may not change a field that is not its words, nor write the edit mark itself', async () => {
    const id = await aMessage('Urgent or not, this is what I said.')
    const urgent = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { urgent: true } })
    expect(urgent.status, urgent.error).toBe(403)
    expect(urgent.code).toBe('messageFieldNotAWord')
    expect(urgent.error).toContain('names data.urgent')
    const marked = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { edited: { at: 'never' } } })
    expect(marked.status, marked.error).toBe(403)
    expect(marked.error).toContain('Mole Office writes data.edited itself')
    const asked = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { runWasAskedFor: { at: '2026-09-29 10:00:00', by: THE_TEST_OFFICES_OWNER.id } } })
    expect(asked.status, 'a writer may not press start-an-agent for the owner').toBe(403)
    expect((await stored(id)).data['urgent']).toBeUndefined()
  })

  it('(b) may not change its words after the window, and is told when it wrote them', async () => {
    const id = await aMessage('Written long enough ago.')
    const inTime = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { body: 'Changed in time.' } })
    expect(inTime.status, inTime.error).toBe(200)
    writtenTenMinutesAgo(id)
    const late = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { body: 'Rewritten too late.' } })
    expect(late.status, late.error).toBe(403)
    expect(late.code).toBe('messageEditWindowClosed')
    expect(late.body['values']).toEqual({ seconds: 120 })
    expect(late.error).toContain('The words of this message can no longer be changed. Nothing was written.')

    // AND PUTTING THE FIRST REVISION BACK IS THE SAME CHANGE, asked the same way: refused to the recipient because
    // the words are not its own, and to the writer because its window has closed.
    const byTheRecipient = await ask('POST', `/api/records/${id}/revisions/1/restore`, as(RECIPIENT), {})
    expect(byTheRecipient.status, byTheRecipient.error).toBe(403)
    expect(byTheRecipient.code).toBe('messageNotYourWords')
    const byTheWriter = await ask('POST', `/api/records/${id}/revisions/1/restore`, as(WRITER), {})
    expect(byTheWriter.status, byTheWriter.error).toBe(403)
    expect(byTheWriter.code).toBe('messageEditWindowClosed')
    expect((await stored(id)).data['body']).toBe('Changed in time.')
  })

  it('(g) may not write a message that already looks edited', async () => {
    const wrote = await ask('POST', '/api/records', as(WRITER), {
      kind: 'message',
      title: 'Test: says it was changed',
      data: {
        body: 'Test: the words as sent',
        to: [{ kind: 'agent', id: RECIPIENT }],
        edited: { at: '2026-09-29 10:00:00', by: { kind: 'agent', id: WRITER }, original: { title: 'Test: made up', body: 'Test: words nobody wrote' } },
      },
    })
    expect(wrote.status, wrote.error).toBe(201)
    const id = (wrote.body['record'] as { id: string }).id
    expect((await stored(id)).data, 'a message was stored looking edited').not.toHaveProperty('edited')
  })

  it('(i) may not change a message that has gone out into another kind', async () => {
    const id = await aMessage('A message and nothing else.')
    const turned = await ask('PATCH', `/api/records/${id}`, as(WRITER), { kind: 'note' })
    expect(turned.status, turned.error).toBe(403)
    expect(turned.code).toBe('messageStaysAMessage')
  })
})

describe('a comment that has not gone out', () => {
  it('(h) is the owner\'s to change after two minutes, with no edit mark', async () => {
    const id = await aComment('the-owner', 'Test: this paragraph says two things.')
    writtenTenMinutesAgo(id)
    const changed = await ask('PATCH', `/api/records/${id}`, as('the-owner'), { title: 'Test: this paragraph says one thing', dataPatch: { body: 'Test: this paragraph says one thing.' } })
    expect(changed.status, changed.error).toBe(200)
    const now = await stored(id)
    expect(now.data['body']).toBe('Test: this paragraph says one thing.')
    expect(now.data, 'nobody was handed the words, so there is nothing to mark as changed').not.toHaveProperty('edited')
  })

  it('(i) is changed until somebody is handed it, and after that the window holds', async () => {
    const id = await aCommentChosenFor(WRITER, 'Test: the gripper slips at the second joint.', RECIPIENT)
    writtenTenMinutesAgo(id)
    const before = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { body: 'Test: the gripper slips at the first joint.' } })
    expect(before.status, before.error).toBe(200)
    const seen = await ask('POST', `/api/messages/${id}/mark`, as(RECIPIENT), { mark: 'seen' })
    expect(seen.status, seen.error).toBe(200)
    const after = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { body: 'Test: rewritten after it was read.' } })
    expect(after.status, after.error).toBe(403)
    expect(after.code).toBe('messageEditWindowClosed')
    const turned = await ask('PATCH', `/api/records/${id}`, as(WRITER), { kind: 'note' })
    expect(turned.status, turned.error).toBe(403)
    expect(turned.code).toBe('messageStaysAMessage')
    expect((await stored(id)).data['body']).toBe('Test: the gripper slips at the first joint.')
  })

  it('(j) may be corrected into another kind and back by its writer, and by nobody else', async () => {
    const id = await aComment(WRITER, 'Test: this should have been a note.')
    writtenTenMinutesAgo(id)
    // THE OWNER READS EVERY MESSAGE, so they are the one who could reach it. The words are still not theirs.
    const byTheOwner = await ask('PATCH', `/api/records/${id}`, as('the-owner'), { kind: 'note' })
    expect(byTheOwner.status, byTheOwner.error).toBe(403)
    expect(byTheOwner.code).toBe('messageNotYourWords')
    const changed = await ask('PATCH', `/api/records/${id}`, as('the-owner'), { dataPatch: { body: "Test: not the owner's words." } })
    expect(changed.status, changed.error).toBe(403)
    expect(changed.code).toBe('messageNotYourWords')
    const toANote = await ask('PATCH', `/api/records/${id}`, as(WRITER), { kind: 'note' })
    expect(toANote.status, toANote.error).toBe(200)
    // A NOTE IS KEPT IN THE PROJECT THE COMMENT WAS WRITTEN IN, where that project's list finds it. The message centre
    // holds only messages.
    const asANote = await stored(id)
    expect(asANote.kind).toBe('note')
    expect(asANote.workspaceId, 'the note went home to the project it was written in').toBe('default')
    expect(await listed('default', 'note')).toContain(id)
    const back = await ask('PATCH', `/api/records/${id}`, as(WRITER), { kind: 'message' })
    expect(back.status, back.error).toBe(200)
    const again = await stored(id)
    expect(again.workspaceId, 'a message is kept in the message centre').toBe('message-centre')
    expect((again.data['writtenIn'] as { project?: string } | undefined)?.project).toBe('default')
    expect(await listed('default', 'note')).not.toContain(id)
    expect(again.data['body']).toBe('Test: this should have been a note.')
  })

  it('(k) is refused another kind when it was written in no project, and is left as it was', async () => {
    const headers = { ...as(WRITER) }
    delete (headers as Record<string, string>)['x-mole-office-workspace']
    const wrote = await ask('POST', '/api/records', headers, {
      kind: 'message',
      title: 'Test: written from no project',
      data: { body: 'Test: written from no project.', target: { target: { kind: 'record', recordId: aRecordToPointAt, workspaceId: 'default' } } },
    })
    expect(wrote.status, wrote.error).toBe(201)
    const id = (wrote.body['record'] as { id: string }).id
    const was = await stored(id)
    expect(was.data['writtenIn'], 'the request named no project').toEqual({})
    const turned = await ask('PATCH', `/api/records/${id}`, as(WRITER), { kind: 'note' })
    expect(turned.status, turned.error).toBe(409)
    expect(turned.code).toBe('messageWrittenInNoProject')
    expect(turned.error).toContain('Nothing was written.')
    expect(await stored(id), 'the record is exactly as it was').toEqual(was)
  })

  it('(l) is refused another kind while a link would join it to a record in another project, and is left as it was', async () => {
    const opened = await ask('POST', '/api/workspaces', as('the-owner'), { id: 'robotics', title: 'Robotics' })
    expect([201, 409], opened.error).toContain(opened.status)
    const elsewhere = await ask('POST', '/api/records', { ...as('the-owner'), 'x-mole-office-workspace': 'robotics' }, { kind: 'note', title: 'Test: a robotics note', data: {} })
    expect(elsewhere.status, elsewhere.error).toBe(201)
    const id = await aComment(WRITER, 'Test: this is about the robotics note.')
    const linked = await ask('POST', '/api/links', as('the-owner'), { fromId: id, toId: (elsewhere.body['record'] as { id: string }).id, type: 'about' })
    expect(linked.status, linked.error).toBe(201)
    const was = await stored(id)
    const turned = await ask('PATCH', `/api/records/${id}`, as(WRITER), { kind: 'note' })
    expect(turned.status, turned.error).toBe(409)
    expect(turned.code).toBe('messageLinkedAcrossProjects')
    expect(turned.error).toContain(String(linked.body['id']))
    expect(await stored(id), 'the record is exactly as it was').toEqual(was)
  })
})

describe('a comment that has not gone out, and who it is for', () => {
  /** The person this scratch office is for, as `as('the-owner')` names them. */
  const thePerson = (): { kind: string; id: string } => ({ kind: 'person', id: as('the-owner')['x-mole-office-actor-id'] ?? '' })
  const deliveriesOf = (id: string): { kind: string; id: string; mark: string }[] =>
    t.client.sqlite
      .prepare('SELECT recipient_kind AS kind, recipient_id AS id, mark FROM message_delivery WHERE message_id = ? ORDER BY recipient_kind')
      .all(id) as { kind: string; id: string; mark: string }[]

  it('(n) may be addressed to the person by its writer, and the person is given a delivery row', async () => {
    const id = await aComment(WRITER, 'Test: the person should read this paragraph.')
    expect(deliveriesOf(id), 'a comment written to nobody has no delivery row').toEqual([])
    const added = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [thePerson()] } })
    expect(added.status, added.error).toBe(200)
    expect((await stored(id)).data['to']).toEqual([thePerson()])
    expect(deliveriesOf(id)).toEqual([{ ...thePerson(), mark: 'queued' }])
  })

  it('(n) may gain the person beside the agent it was already for, and the agent keeps its row', async () => {
    const id = await aCommentChosenFor(WRITER, 'Test: both of you should read this.', RECIPIENT)
    const added = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [{ kind: 'agent', id: ids.get(RECIPIENT) }, thePerson()] } })
    expect(added.status, added.error).toBe(200)
    expect((await stored(id)).data['to']).toEqual([{ kind: 'agent', id: ids.get(RECIPIENT) }, thePerson()])
    expect(deliveriesOf(id).map((one) => one.kind)).toEqual(['agent', 'person'])
  })

  it('(n) may not lose an addressee, nor gain an agent this way, nor be addressed by anybody but its writer', async () => {
    const id = await aCommentChosenFor(WRITER, 'Test: only for the recipient.', RECIPIENT)
    // THE ROWS BEFORE, compared whole afterwards. A comment to an agent nothing answers as may already hold a row for
    // the person that the office's routing wrote, so the test asks that nothing changed.
    const was = deliveriesOf(id)
    const dropped = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [thePerson()] } })
    expect(dropped.status, dropped.error).toBe(403)
    expect(dropped.code).toBe('messageFieldNotAWord')
    const agent = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [{ kind: 'agent', id: ids.get(RECIPIENT) }, { kind: 'agent', id: ids.get(MEMBER) }] } })
    expect(agent.status, agent.error).toBe(403)
    expect(agent.code).toBe('messageFieldNotAWord')
    const byTheOwner = await ask('PATCH', `/api/records/${id}`, as('the-owner'), { dataPatch: { to: [{ kind: 'agent', id: ids.get(RECIPIENT) }, thePerson()] } })
    expect(byTheOwner.status, byTheOwner.error).toBe(403)
    expect(byTheOwner.code).toBe('messageNotYourWords')
    expect(deliveriesOf(id)).toEqual(was)
    expect((await stored(id)).data['to']).toEqual([{ kind: 'agent', id: ids.get(RECIPIENT) }])
  })

  it('(o) may not gain the person once it has gone out', async () => {
    const id = await aComment(WRITER, 'Test: read already.', RECIPIENT)
    const seen = await ask('POST', `/api/messages/${id}/mark`, as(RECIPIENT), { mark: 'seen' })
    expect(seen.status, seen.error).toBe(200)
    const was = deliveriesOf(id)
    const added = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [{ kind: 'agent', id: ids.get(RECIPIENT) }, thePerson()] } })
    expect(added.status, added.error).toBe(403)
    expect(added.code).toBe('messageFieldNotAWord')
    expect(added.error).toContain('data.to')
    expect(deliveriesOf(id)).toEqual(was)
    expect((await stored(id)).data['to']).toEqual([{ kind: 'agent', id: ids.get(RECIPIENT) }])
  })

  it('(r) a comment written straight to its agent has gone out before anybody is handed it, so it may not gain the person, and its window holds', async () => {
    const id = await aComment(WRITER, 'Test: sent with Send.', RECIPIENT)
    const was = deliveriesOf(id)
    // THE ROUTING MAY HAVE WRITTEN THE PERSON A ROW BESIDE THE AGENT'S. Nobody has been handed it.
    expect(was.length > 0 && was.every((one) => one.mark === 'queued'), 'somebody was handed the comment').toBe(true)
    const added = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [{ kind: 'agent', id: ids.get(RECIPIENT) }, thePerson()] } })
    expect(added.status, added.error).toBe(403)
    expect(added.code).toBe('messageFieldNotAWord')
    expect(deliveriesOf(id)).toEqual(was)
    writtenTenMinutesAgo(id)
    const changed = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { body: 'Test: rewritten before it was read.' } })
    expect(changed.status, changed.error).toBe(403)
    expect(changed.code).toBe('messageEditWindowClosed')
    expect((await stored(id)).data['body']).toBe('Test: sent with Send.')
  })

  it('(o) a message written to somebody has gone out, so it may not gain the person', async () => {
    const id = await aMessage('Test: a message, not a comment.')
    const was = deliveriesOf(id)
    const added = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [{ kind: 'agent', id: ids.get(RECIPIENT) }, thePerson()] } })
    expect(added.status, added.error).toBe(403)
    expect(added.code).toBe('messageFieldNotAWord')
    expect(deliveriesOf(id)).toEqual(was)
    expect((await stored(id)).data['to']).toEqual([{ kind: 'agent', id: ids.get(RECIPIENT) }])
  })
})

describe('a comment that gains the person keeps the limits of an urgent message (check XjSkrxVdudii)', () => {
  /** The person this scratch office is for, as `as('the-owner')` names them. */
  const thePerson = (): { kind: string; id: string } => ({ kind: 'person', id: as('the-owner')['x-mole-office-actor-id'] ?? '' })
  const deliveriesOf = (id: string): { kind: string; id: string }[] =>
    t.client.sqlite.prepare('SELECT recipient_kind AS kind, recipient_id AS id FROM message_delivery WHERE message_id = ?').all(id) as {
      kind: string
      id: string
    }[]
  /** An urgent comment from `who`, written to nobody, pointing at the page the owner reviews. */
  async function anUrgentComment(who: string, body: string): Promise<string> {
    const wrote = await ask('POST', '/api/records', as(who), {
      kind: 'message',
      title: body.slice(0, 40),
      data: { body, urgent: true, target: { target: { kind: 'record', recordId: aRecordToPointAt, workspaceId: 'default' } } },
    })
    expect(wrote.status, wrote.error).toBe(201)
    return (wrote.body['record'] as { id: string }).id
  }

  it('(p) an urgent comment may not gain the person while its writer\'s earlier urgent message to the owner is unread', async () => {
    const first = await ask('POST', '/api/records', as(WRITER), {
      kind: 'message',
      title: 'Test: the first emergency',
      data: { body: 'Test: the first emergency.', to: [thePerson()], urgent: true },
    })
    expect(first.status, first.error).toBe(201)
    const id = await anUrgentComment(WRITER, 'Test: a second emergency, by the side door.')
    const added = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [thePerson()] } })
    expect(added.status, added.error).toBe(403)
    expect(added.error).toContain('has not been read')
    expect(deliveriesOf(id), 'the person was handed the second emergency').toEqual([])
    expect((await stored(id)).data['to']).toBeUndefined()
  })

  it('(p) an ordinary comment from the same writer still gains the person', async () => {
    const id = await aComment(WRITER, 'Test: an ordinary comment, while the emergency is unread.')
    const added = await ask('PATCH', `/api/records/${id}`, as(WRITER), { dataPatch: { to: [thePerson()] } })
    expect(added.status, added.error).toBe(200)
    expect(deliveriesOf(id)).toEqual([thePerson()])
  })

  it('(q) an urgent comment may not gain the person while the switch that lets agents inject is off', async () => {
    const off = await ask('POST', '/api/office/agents-may-inject', as('the-owner'), { may: false })
    expect(off.status, off.error).toBe(200)
    try {
      const id = await anUrgentComment(MEMBER, 'Test: an emergency while the switch is off.')
      const added = await ask('PATCH', `/api/records/${id}`, as(MEMBER), { dataPatch: { to: [thePerson()] } })
      expect(added.status, added.error).toBe(403)
      expect(added.error).toContain('the switch that lets agents inject is off')
      expect(deliveriesOf(id)).toEqual([])
    } finally {
      const on = await ask('POST', '/api/office/agents-may-inject', as('the-owner'), { may: true })
      expect(on.status, on.error).toBe(200)
    }
  })
})

describe('everybody else', () => {
  it('(a) refuses the recipient a change of the words, and lets it mark the message read', async () => {
    const id = await aMessage('For the recipient.')
    const changed = await ask('PATCH', `/api/records/${id}`, as(RECIPIENT), { dataPatch: { body: 'Changed by the recipient.' } })
    expect(changed.status, changed.error).toBe(403)
    expect(changed.code).toBe('messageNotYourWords')
    expect(changed.error).toContain(`A recipient marks it read with POST /api/messages/${id}/mark.`)
    const seen = await ask('POST', `/api/messages/${id}/mark`, as(RECIPIENT), { mark: 'seen' })
    expect(seen.status, seen.error).toBe(200)
    expect((await stored(id)).data['body']).toBe('For the recipient.')
  })

  it('(a) refuses a group member a change of the words, and lets it mark the message read', async () => {
    const changed = await ask('PATCH', `/api/records/${groupMessage}`, as(MEMBER), { dataPatch: { body: 'Changed by a member.' } })
    expect(changed.status, changed.error).toBe(403)
    expect(changed.code).toBe('messageNotYourWords')
    const seen = await ask('POST', `/api/messages/${groupMessage}/mark`, as(MEMBER), { mark: 'seen' })
    expect(seen.status, seen.error).toBe(200)
  })

  it('(a) refuses the owner a change of an agent’s words, though they read every message', async () => {
    const id = await aMessage("Not the owner's words.")
    const changed = await ask('PATCH', `/api/records/${id}`, as('the-owner'), { title: "The owner's title", dataPatch: { body: "The owner's words." } })
    expect(changed.status, changed.error).toBe(403)
    expect(changed.code).toBe('messageNotYourWords')
    expect((await stored(id)).title).toBe("Not the owner's words.")
  })

  it('refuses a stranger in the same project, without saying the message is there', async () => {
    const id = await aMessage('Nothing to do with the stranger.')
    const changed = await ask('PATCH', `/api/records/${id}`, as(STRANGER), { dataPatch: { body: 'Changed by a stranger.' } })
    expect(changed.status, changed.error).not.toBe(200)
    expect((await stored(id)).data['body']).toBe('Nothing to do with the stranger.')
  })
})

describe('a notice from Mole Office', () => {
  it('(c) may be changed by nobody, the owner included, and a member still marks it read', async () => {
    for (const who of ['the-owner', WRITER, MEMBER]) {
      const changed = await ask('PATCH', `/api/records/${notice}`, as(who), { dataPatch: { body: `Changed by ${who}.` } })
      expect(changed.status, `${who}: ${changed.error}`).toBe(403)
      expect(changed.code, who).toBe('messageIsTheOfficesNotice')
    }
    const deleted = await ask('DELETE', `/api/records/${notice}`, as('the-owner'))
    expect(deleted.status, deleted.error).toBe(403)
    expect(deleted.code).toBe('messageIsTheOfficesNotice')
    const seen = await ask('POST', `/api/messages/${notice}/mark`, as(MEMBER), { mark: 'seen' })
    expect(seen.status, seen.error).toBe(200)
    expect((await stored(notice)).deletedAt).toBeNull()
  })
})

describe('deleting and bringing back', () => {
  it('(d) is the writer’s alone', async () => {
    const id = await aMessage('Delete me only if you wrote me.')
    for (const who of [RECIPIENT, 'the-owner']) {
      const refused = await ask('DELETE', `/api/records/${id}`, as(who))
      expect(refused.status, `${who}: ${refused.error}`).toBe(403)
      expect(refused.code, who).toBe('messageNotYourWords')
    }
    const deleted = await ask('DELETE', `/api/records/${id}`, as(WRITER))
    expect(deleted.status, deleted.error).toBe(200)
    const notBack = await ask('POST', `/api/records/${id}/restore`, as('the-owner'))
    expect(notBack.status, notBack.error).toBe(403)
    expect(notBack.code).toBe('messageNotYourWords')
    const back = await ask('POST', `/api/records/${id}/restore`, as(WRITER))
    expect(back.status, back.error).toBe(200)
    expect((await stored(id)).deletedAt).toBeNull()
  })
})

describe('the mark door', () => {
  it('(e) tells a stranger the same thing about a message it may not read and an id that names nothing', async () => {
    const id = await aMessage('The stranger may not know this is here.')
    const there = await ask('POST', `/api/messages/${id}/mark`, as(STRANGER), { mark: 'seen' })
    const nothing = await ask('POST', '/api/messages/AAAAAAAAAAAA/mark', as(STRANGER), { mark: 'seen' })
    expect(there.status, there.error).toBe(404)
    expect(nothing.status, nothing.error).toBe(404)
    expect(there.error.replace(id, '<id>')).toBe(nothing.error.replace('AAAAAAAAAAAA', '<id>'))
    expect(there.error).toContain('No message you may read has the id')
  })

  it('marks for a recipient that sends no project header', async () => {
    const id = await aMessage('Marked from no project.')
    const { 'x-mole-office-workspace': _unused, ...noProject } = as(RECIPIENT)
    const seen = await ask('POST', `/api/messages/${id}/mark`, noProject, { mark: 'seen' })
    expect(seen.status, seen.error).toBe(200)
  })
})

describe('the office’s own write on a message', () => {
  it('(f) still lets the owner\'s start-an-agent press write runWasAskedFor on a message somebody else wrote', async () => {
    const id = await aMessage('Somebody should answer this.')
    const pressed = await ask('POST', `/api/messages/${id}/start-an-agent`, as('the-owner'), {})
    expect(pressed.status, pressed.error).toBe(200)
    expect((await stored(id)).data['runWasAskedFor']).toMatchObject({ by: THE_TEST_OFFICES_OWNER.id })
  })
})
