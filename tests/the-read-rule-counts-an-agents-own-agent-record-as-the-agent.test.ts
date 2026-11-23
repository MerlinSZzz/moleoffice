// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READ RULE COUNTS AN AGENT'S OWN AGENT RECORD AS THE AGENT, in wave 13y round 90.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The decision says an agent reads the messages it is a party to: it sent them, they were addressed to it, or it was in
 * the group they went to. A message may store the id of the agent's own agent record where the agent is named, and the
 * pages name that agent by it. The read rule read a stored agent name only as a registry id or a handle, so the agent
 * was refused its own message.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Made-up agents: bell has four agent records, lamp has one, wren writes to bell. One case per place the rule reads a
 * stored agent name, each asked both ways on GET /api/messages/:id: bell reads a message that names bell by one of its
 * own agent records, and lamp, which is no party to it, still does not.
 *
 *   1. THE SENDER, stored as bell's newest record in this project, as an older record of bell's in this project (deleted
 *      before the newest was filed), and as bell's record in another project. The read rule counts each of them; the
 *      pages name by the newest live one in the page's project alone.
 *   2. THE ADDRESSEE: a delivery row that stores bell's record.
 *   3. THE MEMBER: a group membership that stores bell's record, on a group message with no delivery row for bell.
 *   4. A RECORD OF bell'S WHOSE KIND WAS CHANGED AWAY FROM AGENT names nobody, though the registry still maps it to bell.
 *   5. A LIST OF MORE THAN FIFTY MESSAGES is narrowed first (`theMessagesAReaderCouldBeAPartyTo`), and the narrowing
 *      keeps bell's five and none for lamp.
 *
 * Each "bell reads" case was red against the code before the change. Each "lamp does not" case passed against that code
 * too, since nothing let any agent read such a message then, so each is proved by a mutation. MUTATIONS, each run after a
 * control run, with the code restored after it:
 *
 *   1. `thePartiesOfMany` reads no agent record: the "bell reads" cases of 1, 2, 3 and 5 turn red.
 *   2. The agent records are read without their kind: case 4 turns red, and so does the "bell reads" case of 5, whose
 *      list then holds that message too.
 *   3. The read rule counts any agent among a message's parties as the reader: the "lamp does not" cases of 1, 2, 3 and
 *      5 turn red, and so do case 4 and the "bell reads" case of 5, whose list then holds case 4's message too.
 *   4. The narrowing leaves the reader's records out: the "bell reads" case of 5 turns red and 1 to 3 stay green.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'agent-records-elsewhere'

let t: TestDb
let app: FastifyInstance

const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

function asAgent(handle: string): Record<string, string> {
  return { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

const THE_REFUSAL = 'No message you may read has the id'

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

async function send(method: 'POST' | 'PATCH', url: string, payload: unknown, headers: Record<string, string>): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

/** File one agent record with this handle in this project, as the owner, and give back the record's id. */
async function anAgentRecord(handle: string, workspace: string = HERE): Promise<string> {
  const made = await send(
    'POST',
    '/api/records',
    { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
    { ...OWNER, 'x-mole-office-workspace': workspace },
  )
  expect(made.status, made.body).toBe(201)
  return (made.json['record'] as { id: string }).id
}

/** The registry id behind a handle. */
async function theAgent(handle: string): Promise<string> {
  const listed = (await get('/api/participants', OWNER)).json as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

/** Write one message in process as this agent, and give back its id. */
function say(handle: string, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ kind: 'message', title, workspaceId: HERE, data, actor: { type: 'agent', id: handle } as never }).id
}

// THE WORDS EACH MESSAGE CARRIES, each found nowhere else, so a reply that holds them holds the message.
const WORDS = {
  sentNow: 'brassbell-sent-under-the-newest-record',
  sentOlder: 'brassbell-sent-under-an-older-record',
  sentElsewhere: 'brassbell-sent-under-the-record-elsewhere',
  sentGone: 'brassbell-sent-under-a-record-now-a-note',
  toBell: 'wren-wrote-to-the-bell-record',
  toGroup: 'wren-wrote-to-the-belfry-group',
} as const
type Said = keyof typeof WORDS

/** The five messages that name bell by one of its own agent records, as kept above. */
const BELLS: readonly Said[] = ['sentNow', 'sentOlder', 'sentElsewhere', 'toBell', 'toGroup']

/** How many messages wren writes to the person, so a list holds more than the fifty a short list is. */
const FILLERS = 55

const ids = {} as Record<Said, string>
let bell = ''
let lamp = ''
let wren = ''
const bellsRecords = { gone: '', older: '', now: '', elsewhere: '' }

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const db = t.client.sqlite
  const made = await send('POST', '/api/workspaces', { id: ELSEWHERE, title: 'Another project' }, OWNER)
  expect(made.status, made.body).toBe(201)

  // bell'S FOUR AGENT RECORDS, ONE AGENT. A record filed with the handle of a live agent is that agent again
  // (`keepTheAgentRegistryInStep`). A project holds one live agent record for a handle (`assertHandleIsFree`), so an
  // older record of bell's in this project is one that left the project's live agents first: `gone` by a change of
  // kind, `older` by a delete. bell's record in the other project keeps bell a live agent all the while.
  bellsRecords.gone = await anAgentRecord('bell-ringer')
  bellsRecords.elsewhere = await anAgentRecord('bell-ringer', ELSEWHERE)
  // A RECORD WRITE NO LONGER CHANGES AN AGENT RECORD'S KIND, so `gone` is stored as the note such a change left:
  // every field under `extra`, and the mapping kept.
  const held = db.prepare('SELECT data FROM records WHERE id = ?').get(bellsRecords.gone) as { data: string }
  const { extra, ...fields } = JSON.parse(held.data) as Record<string, unknown>
  db.prepare("UPDATE records SET kind = 'note', data = ? WHERE id = ?").run(JSON.stringify({ extra: { ...(extra as object | undefined), ...fields } }), bellsRecords.gone)
  bellsRecords.older = await anAgentRecord('bell-ringer')
  const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${bellsRecords.older}`, headers: OWNER })
  expect(deleted.statusCode, deleted.body).toBe(200)
  bellsRecords.now = await anAgentRecord('bell-ringer')
  const lampsRecord = await anAgentRecord('lamp-lighter')
  await anAgentRecord('wren-writer')
  bell = await theAgent('bell-ringer')
  lamp = await theAgent('lamp-lighter')
  wren = await theAgent('wren-writer')
  const mapped = (agent: string): string[] =>
    (db.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ? ORDER BY record_id').all(agent) as { id: string }[]).map((row) => row.id)
  expect(mapped(bell), "bell's records, all mapped to bell").toEqual(Object.values(bellsRecords).sort())
  expect(mapped(lamp), "lamp's record").toEqual([lampsRecord])
  // WHAT EACH OF bell'S RECORDS IS NOW. The registry still maps `gone`, which is what case 4 is about.
  const now = (id: string) => db.prepare('SELECT kind, workspace_id AS project, deleted_at IS NOT NULL AS deleted FROM records WHERE id = ?').get(id)
  expect(
    Object.fromEntries(Object.entries(bellsRecords).map(([name, id]) => [name, now(id)])),
    "bell's records",
  ).toEqual({
    gone: { kind: 'note', project: HERE, deleted: 0 },
    elsewhere: { kind: 'agent', project: ELSEWHERE, deleted: 0 },
    older: { kind: 'agent', project: HERE, deleted: 1 },
    now: { kind: 'agent', project: HERE, deleted: 0 },
  })

  // THE SENDER. Each is written by bell, stored under bell's registry id by the door, and then stored under one record.
  const sentUnder = { sentNow: bellsRecords.now, sentOlder: bellsRecords.older, sentElsewhere: bellsRecords.elsewhere, sentGone: bellsRecords.gone } as const
  for (const [one, record] of Object.entries(sentUnder) as [keyof typeof sentUnder, string][]) {
    ids[one] = say('bell-ringer', `bell ${one}`, { body: WORDS[one], to: [{ kind: 'agent', id: wren }] })
    const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(ids[one]) as { sentBy: string }
    expect(JSON.parse(stored.sentBy), `what the door stored for ${one}`).toEqual({ kind: 'agent', id: bell })
    db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(record, ids[one])
  }

  // THE ADDRESSEE. wren writes to bell, and bell's delivery row then stores bell's newest record.
  ids.toBell = say('wren-writer', 'wren to bell', { body: WORDS.toBell, to: [{ kind: 'agent', id: bell }] })
  const moved = db
    .prepare("UPDATE message_delivery SET recipient_id = ? WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id = ?")
    .run(bellsRecords.now, ids.toBell, bell)
  expect(moved.changes, "bell's delivery row on the message to bell").toBe(1)

  // THE MEMBER. A group of wren and bell; wren writes to it, and bell is then a member under its newest record and has no
  // delivery row on the message, so membership is the only way bell is a party to it.
  const opened = await send(
    'POST',
    '/api/groups',
    {
      name: 'The belfry',
      because: 'A made-up group for this test.',
      members: [
        { who: { kind: 'agent', id: wren }, because: 'writes' },
        { who: { kind: 'agent', id: bell }, because: 'reads' },
      ],
    },
    OWNER,
  )
  expect(opened.status, opened.body).toBe(201)
  const group = (opened.json['group'] as { id: string }).id
  ids.toGroup = say('wren-writer', 'wren to the belfry', { body: WORDS.toGroup, toGroup: group })
  const member = db.prepare("UPDATE group_members SET member_id = ? WHERE group_id = ? AND member_kind = 'agent' AND member_id = ?").run(bellsRecords.now, group, bell)
  expect(member.changes, "bell's membership").toBe(1)
  db.prepare("DELETE FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id IN (?, ?)").run(ids.toGroup, bell, bellsRecords.now)
  const left = db.prepare('SELECT recipient_id AS id FROM message_delivery WHERE message_id = ?').all(ids.toGroup) as { id: string }[]
  expect(left.filter((row) => row.id === bell || Object.values(bellsRecords).includes(row.id)), 'delivery rows naming bell on the group message').toEqual([])

  // THE FILLERS, so the whole office holds more messages than a short list.
  for (let n = 0; n < FILLERS; n += 1) say('wren-writer', `filler ${String(n)}`, { body: `a filler line ${String(n)}`, to: [{ kind: 'person', id: THE_PERSON }] })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** What each of these messages answers at GET /api/messages/:id for this reader: 200, or the refusal's words. */
async function whatEachAnswers(handle: string, these: readonly Said[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const one of these) {
    const reply = await get(`/api/messages/${ids[one]}`, asAgent(handle))
    out[one] = reply.status === 200 && reply.body.includes(WORDS[one]) ? 'read' : reply.status === 404 && reply.body.includes(THE_REFUSAL) ? 'refused' : `${String(reply.status)} ${reply.body.slice(0, 200)}`
  }
  return out
}

const all = (these: readonly Said[], answer: string): Record<string, string> => Object.fromEntries(these.map((one) => [one, answer]))

describe('the sender', () => {
  const SENT: readonly Said[] = ['sentNow', 'sentOlder', 'sentElsewhere']

  it('an agent reads its own message stored under its newest record, an older record, or its record in another project', async () => {
    expect(await whatEachAnswers('bell-ringer', SENT)).toEqual(all(SENT, 'read'))
  })

  it("an agent cannot read another agent's message stored under that other agent's records", async () => {
    expect(await whatEachAnswers('lamp-lighter', SENT)).toEqual(all(SENT, 'refused'))
  })
})

describe('the addressee', () => {
  it('an agent reads a message whose delivery row stores its own record', async () => {
    expect(await whatEachAnswers('bell-ringer', ['toBell'])).toEqual({ toBell: 'read' })
  })

  it("an agent cannot read a message whose delivery row stores another agent's record", async () => {
    expect(await whatEachAnswers('lamp-lighter', ['toBell'])).toEqual({ toBell: 'refused' })
  })
})

describe('the member', () => {
  it('an agent reads a group message when its membership stores its own record', async () => {
    expect(await whatEachAnswers('bell-ringer', ['toGroup'])).toEqual({ toGroup: 'read' })
  })

  it("an agent cannot read a group message through another agent's membership stored under that agent's record", async () => {
    expect(await whatEachAnswers('lamp-lighter', ['toGroup'])).toEqual({ toGroup: 'refused' })
  })
})

describe('the kind', () => {
  it('a record whose kind was changed away from agent names nobody, though the registry still maps it', async () => {
    expect(await whatEachAnswers('bell-ringer', ['sentGone'])).toEqual({ sentGone: 'refused' })
  })
})

describe('a list of more than fifty messages', () => {
  /** Which of the six messages this reader's GET /api/messages holds, after a check that the list is a long one. */
  const theListHolds = async (handle: string): Promise<Said[]> => {
    const owner = await get('/api/messages?limit=200&full=1', OWNER)
    expect(owner.status, owner.body.slice(0, 500)).toBe(200)
    expect((owner.json['messages'] as unknown[]).length, 'how many messages the whole office lists').toBeGreaterThan(50)
    const listed = await get('/api/messages?limit=200&full=1', asAgent(handle))
    expect(listed.status, listed.body.slice(0, 500)).toBe(200)
    return (Object.keys(WORDS) as Said[]).filter((one) => listed.body.includes(WORDS[one]))
  }

  it('an agent finds in its list every message that names it by its own record', async () => {
    expect(await theListHolds('bell-ringer')).toEqual(BELLS)
  })

  it('another agent finds none of them', async () => {
    expect(await theListHolds('lamp-lighter')).toEqual([])
  })
})
