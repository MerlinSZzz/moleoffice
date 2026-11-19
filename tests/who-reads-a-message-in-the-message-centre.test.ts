// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO READS A MESSAGE IN THE MESSAGE CENTRE: ITS WRITER, ITS RECIPIENTS, THE MEMBERS OF ITS GROUP, AND THE OWNER; NOBODY ELSE.
 *
 * By point 2 of a decision, a message is read by its writer, its recipients (the members of a group it is sent to among
 * them) and the owner; the other agents of a project do not see it. Another decision still lets
 * the secretaries read every message. The first replaces no decision, so that stands and is not
 * what this file is about.
 *
 * Every message now lives in the message centre and belongs to no project, so a message is read from ANY project, and
 * the rule is the only thing between a stranger and its words. THROUGH A REAL LISTENER, WITH THE KEY WINDOW CLOSED, so
 * each caller is who its key proves and nothing else: a writer, a recipient, a group member, the owner, and a stranger
 * registered in the same project the message was written in.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   (a) In `theMessagesThisReaderMayRead` (lib/messages.ts), keep every id for every reader → the stranger reads both
 *       messages and the stranger's case goes red.
 *   (b) In `recordInWorkspace` (lib/records.ts), refuse a message from a project other than the centre again → the
 *       parties' reads from a second project go red.
 */

import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

const WRITER = 'the-writer'
const RECIPIENT = 'the-recipient'
const MEMBER = 'a-group-member'
const STRANGER = 'a-stranger-in-the-same-project'

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }

let t: TestDb
let app: FastifyInstance
let door: string
const keys = new Map<string, string>()
let direct = ''
let toTheGroup = ''

interface Answer {
  status: number
  body: Record<string, any>
  error: string
}

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Answer> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, any>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : '' }
}

const asAgent = (handle: string, project = 'panelx'): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
  'x-mole-office-workspace': project,
})

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
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

  for (const [id, title] of [['panelx', 'Mole Office'], ['robotics', 'Robotics']]) {
    const made = await ask('POST', '/api/workspaces', PERSON, { id, title })
    expect(made.status, made.error).toBeLessThan(300)
  }
  // EACH AGENT THROUGH A PROVED PATH, with the key its registration answers, because the close refuses while a live agent
  // holds no proved key. The key stays in this process and is never printed.
  for (const handle of [WRITER, RECIPIENT, MEMBER, STRANGER]) {
    const made = await ask('POST', '/api/agents/started', { ...PERSON, 'x-mole-office-workspace': 'panelx' }, { handle, name: handle, role: 'worker' })
    expect(made.status, made.error).toBe(201)
    keys.set(handle, String(made.body['whatToGiveIt']?.['key'] ?? ''))
  }
  const closed = await ask('POST', '/api/office/key-window/close', PERSON)
  expect(closed.status, closed.error).toBe(200)

  const sent = await ask('POST', '/api/records', asAgent(WRITER), {
    kind: 'message',
    title: 'Test: straight to the recipient',
    data: { body: 'Test: straight to the recipient', to: [{ kind: 'agent', id: RECIPIENT }] },
  })
  // NOTHING HOLDS THE RECIPIENT IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
  // message is stored all the same, and the answer still carries its record.
  expect(sent.status, sent.error).toBe(409)
  direct = sent.body['record'].id
  const group = await ask('POST', '/api/groups', { ...PERSON, 'x-mole-office-workspace': 'panelx' }, {
    name: 'Test: a group',
    because: 'Test: a group to send to',
    members: [
      { who: { kind: 'agent', id: WRITER }, because: 'Test: writes to it' },
      { who: { kind: 'agent', id: MEMBER }, because: 'Test: reads it' },
    ],
  })
  expect(group.status, group.error).toBe(201)
  const toGroup = await ask('POST', '/api/records', asAgent(WRITER), {
    kind: 'message',
    title: 'Test: said in the group',
    data: { body: 'Test: said in the group', toGroup: group.body['group'].id },
  })
  expect(toGroup.status, toGroup.error).toBe(201)
  toTheGroup = toGroup.body['record'].id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** Whether this caller reads the message by id, through both doors, asking from two projects. */
async function reads(headersFor: (project: string) => Record<string, string>, id: string): Promise<boolean[]> {
  const out: boolean[] = []
  for (const project of ['panelx', 'robotics']) {
    for (const path of [`/api/messages/${id}`, `/api/records/${id}`]) {
      const read = await ask('GET', path, headersFor(project))
      out.push(read.status === 200)
    }
  }
  return out
}

/** The ids this caller's pool lists, across projects. */
async function pool(headers: Record<string, string>): Promise<string[]> {
  const read = await ask('GET', '/api/messages', headers)
  expect(read.status, read.error).toBe(200)
  return (read.body['messages'] as { id: string }[]).map((one) => one.id)
}

describe('with the key window closed, through a real listener', () => {
  it('the writer reads both, from any project', async () => {
    expect(await reads((p) => asAgent(WRITER, p), direct)).toEqual([true, true, true, true])
    expect(await reads((p) => asAgent(WRITER, p), toTheGroup)).toEqual([true, true, true, true])
    expect(await pool(asAgent(WRITER))).toEqual(expect.arrayContaining([direct, toTheGroup]))
  })

  it('the recipient reads the one addressed to it, and not the group\'s', async () => {
    expect(await reads((p) => asAgent(RECIPIENT, p), direct)).toEqual([true, true, true, true])
    expect(await reads((p) => asAgent(RECIPIENT, p), toTheGroup)).toEqual([false, false, false, false])
    const listed = await pool(asAgent(RECIPIENT))
    expect(listed).toContain(direct)
    expect(listed).not.toContain(toTheGroup)
  })

  it('a member of the group reads the group\'s, and not the one addressed to somebody else', async () => {
    expect(await reads((p) => asAgent(MEMBER, p), toTheGroup)).toEqual([true, true, true, true])
    expect(await reads((p) => asAgent(MEMBER, p), direct)).toEqual([false, false, false, false])
  })

  it('the owner reads both', async () => {
    expect(await reads((p) => ({ ...PERSON, 'x-mole-office-workspace': p }), direct)).toEqual([true, true, true, true])
    expect(await reads((p) => ({ ...PERSON, 'x-mole-office-workspace': p }), toTheGroup)).toEqual([true, true, true, true])
  })

  it('a stranger in the same project reads neither, and its pool does not list them', async () => {
    expect(await reads((p) => asAgent(STRANGER, p), direct)).toEqual([false, false, false, false])
    expect(await reads((p) => asAgent(STRANGER, p), toTheGroup)).toEqual([false, false, false, false])
    const listed = await pool(asAgent(STRANGER))
    expect(listed).not.toContain(direct)
    expect(listed).not.toContain(toTheGroup)
  })
})
