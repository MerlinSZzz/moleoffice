// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON READS A GROUP THEY ARE NOT IN, FROM ANY MEMBER'S SIDE, AND AN AGENT MAY NOT.
 *
 * Criterion M12 of design/messages/ACCEPTANCE.md: *A person with the owner row may open an
 * agent-to-agent conversation and read it as either agent sees it. Reading writes nothing and is
 * recorded as a read, not as participation.* That is, switching to an agent's view.
 *
 * A GROUP IS WHERE TWO AGENTS IN CONFLICT TALK, so M12 has to reach it or the one conversation the owner
 * most wanted to be able to read would be the one they could not. The rule is the same rule and the
 * same sentence — `whyReadingSomebodyElsesIsRefused` decides both — so the two surfaces cannot come
 * to different answers.
 *
 * DRIVEN THROUGH THE DOOR, because what M12 gives the owner is a page they can open, and a library function
 * that would allow it says nothing about whether the route does.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { GROUP_WORDS } from '../src/shared/groups.ts'

let t: TestDb
let app: FastifyInstance
let groupId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'panelx',
}
const AS_BUILDER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-x',
  'x-mole-office-workspace': 'panelx',
}
const AS_CHECKER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'checker-y',
  'x-mole-office-workspace': 'panelx',
}
const AS_A_THIRD_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'reader-z',
  'x-mole-office-workspace': 'panelx',
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Mole Office' })
  for (const [title, handle] of [
    ['Builder X', 'builder-x'],
    ['Checker Y', 'checker-y'],
    ['Reader Z', 'reader-z'],
  ] as const) {
    t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active' },
      actor: { type: 'human', id: THE_PERSON },
    })
  }

  // A GROUP BETWEEN TWO AGENTS AND NOBODY ELSE. The owner is deliberately not in it: the whole
  // question is whether the owner may read a conversation they are not part of.
  const opened = await app.inject({
    method: 'POST',
    url: '/api/groups',
    // The owner opens the group: since the permissions cluster (P3, P4, 6 September) a worker may not
    // open a group for a piece of work, and builder-x is a worker. Its members are still the two agents.
    headers: AS_THE_OWNER,
    payload: {
      name: 'The gripper module',
      because: 'Two of us are changing the same file.',
      members: [
        { who: { kind: 'agent', id: 'builder-x' }, because: 'It opened the group.' },
        { who: { kind: 'agent', id: 'checker-y' }, because: 'It is on the same file.' },
      ],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  groupId = (opened.json() as { group: { id: string } }).group.id

  for (const [headers, body] of [
    [AS_BUILDER, 'I am holding the sweep until you answer.'],
    [AS_CHECKER, 'Take it. I will move to the wrist.'],
  ] as const) {
    const said = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers,
      payload: { kind: 'message', title: body.slice(0, 30), data: { body, toGroup: groupId } },
    })
    expect(said.statusCode, said.body).toBe(201)
  }
})

/** The registry id an agent of this file was given when it registered. Its handle is not its id. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  if (row === undefined) throw new Error(`no registry row has the handle ${handle}`)
  return row.id
}

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a person may read a group they are not in', () => {
  it('hands the owner everything said in it, from a member’s side, and says the person is not taking part', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/groups/${groupId}?as=builder-x`, headers: AS_THE_OWNER })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as {
      yours: boolean
      asSide: { id: string }
      messages: { body: string }[]
      says: string | null
      readBefore: unknown
    }
    expect(said.yours, 'the owner is not a member, and the reply must not say the person is').toBe(false)
    expect(said.asSide.id).toBe(idOf('builder-x'))
    expect(said.says).toBe(GROUP_WORDS.readingSomebodyElses)
    expect(said.messages.map((one) => one.body)).toContain('I am holding the sweep until you answer.')
    expect(said.messages.map((one) => one.body)).toContain('Take it. I will move to the wrist.')
  })

  it('reads the same list from the other side, because a group is one conversation', async () => {
    const one = await app.inject({ method: 'GET', url: `/api/groups/${groupId}?as=builder-x`, headers: AS_THE_OWNER })
    const other = await app.inject({ method: 'GET', url: `/api/groups/${groupId}?as=checker-y`, headers: AS_THE_OWNER })
    const bodies = (r: typeof one): string[] => (r.json() as { messages: { body: string }[] }).messages.map((m) => m.body)
    expect(bodies(other)).toEqual(bodies(one))
    expect((other.json() as { asSide: { id: string } }).asSide.id).toBe(idOf('checker-y'))
  })

  it('refuses a side that is not in the group, naming the ones that are', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/groups/${groupId}?as=reader-z`, headers: AS_THE_OWNER })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('reader-z')
    expect(reply.body).toContain('builder-x')
  })

  it('records the read, on a table that is kept, and says when the person last read it', async () => {
    await app.inject({ method: 'GET', url: `/api/groups/${groupId}?as=builder-x`, headers: AS_THE_OWNER })
    // ONE READ POINT FOR THE OWNER IN THIS GROUP, AND IT IS THIS READ. Since a decision of wave 13s round 64, a reader
    // keeps only the newest read of a conversation, and of reads in one second the one written
    // last. Until then every read was a row of its own, so this case counted one row more and
    // looked for one of them.
    const rows = t.client.sqlite
      .prepare('SELECT reader_kind, reader_id, as_side FROM conversation_reads WHERE pair = ?')
      .all(groupId) as { reader_kind: string; reader_id: string; as_side: string }[]
    expect(rows).toEqual([{ reader_kind: 'person', reader_id: THE_PERSON, as_side: idOf('builder-x') }])
    // AND THE NEXT READ SAYS WHEN THE LAST ONE WAS, read before this one is written down.
    const again = await app.inject({
      method: 'GET',
      url: `/api/groups/${groupId}?as=builder-x`,
      headers: AS_THE_OWNER,
    })
    expect((again.json() as { readBefore: { asSide: string } | null }).readBefore?.asSide).toBe(idOf('builder-x'))
  })

  it('leaves every mark where it was, because reading is not taking part', async () => {
    // ASSERTED AS THE VALUE AND NOT AS A DIFFERENCE. A before-and-after count is green when the
    // marks were already moved by an earlier read in this same file, so it would pass over exactly
    // the defect it exists to catch. Nothing in this file has been handed to either agent, so every
    // row is still queued, and that is what is asked.
    await app.inject({ method: 'GET', url: `/api/groups/${groupId}?as=checker-y`, headers: AS_THE_OWNER })
    await app.inject({ method: 'GET', url: `/api/groups/${groupId}?as=builder-x`, headers: AS_THE_OWNER })
    const marks = t.client.sqlite
      .prepare(
        'SELECT d.mark AS mark FROM message_delivery d JOIN records r ON r.id = d.message_id ' +
          "WHERE json_extract(r.data, '$.toGroup') = ?",
      )
      .all(groupId) as { mark: string }[]
    expect(marks.length, 'no delivery row for this group, so this proves nothing').toBeGreaterThan(0)
    expect(marks.every((one) => one.mark === 'queued')).toBe(true)
  })
})

describe('an agent may not read a group it is not in', () => {
  it('refuses a third agent with the sentence that names the rule', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/groups/${groupId}?as=builder-x`,
      headers: AS_A_THIRD_AGENT,
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.body).toContain('Only a person may read a conversation they are not part of')
  })

  it('lets a member read its own group, and says it is taking part in it', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/groups/${groupId}`, headers: AS_CHECKER })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as { yours: boolean; says: string | null; asSide: { id: string } }
    expect(said.yours).toBe(true)
    expect(said.says, 'a member is not reading somebody else’s conversation').toBeNull()
    expect(said.asSide.id).toBe(idOf('checker-y'))
  })

  it('records nothing when a member reads its own group, because that is not a read of somebody else’s', async () => {
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM conversation_reads').get() as { n: number }
    await app.inject({ method: 'GET', url: `/api/groups/${groupId}`, headers: AS_BUILDER })
    const after = t.client.sqlite.prepare('SELECT count(*) AS n FROM conversation_reads').get() as { n: number }
    expect(after.n).toBe(before.n)
  })
})
