// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S NEW NAME TAKES EFFECT WHEN ITS APPROVER APPROVES IT. Item 42 of wave 13s, the decision of round 192,
 * with the conditions and rulings the secretary set on it.
 *
 * Every case drives the real doors in one test office: the registration door builds a chain of starters, the renames
 * doors propose, approve and refuse, and the participants PATCH door is the person's own rename. What is measured:
 *
 *   (a) the approver is the first secretary up the chain of starters, read from the walk a message up the chain takes:
 *       a worker under a supervisor under a secretary waits for the secretary, not its supervisor;
 *   (b) a secretary's new name waits for the person, so does one under no secretary, and so does one whose first
 *       secretary is retired;
 *   (c) the agent itself, an agent up its chain or the person may propose, and an agent outside the chain may not;
 *   (d) an agent never approves or refuses its own new name, and the person may answer any. What a raise lets a
 *       secretary answer is measured in tests/a-raised-secretary-answers-a-new-name-for-the-person.test.ts;
 *   (e) a proposal, an approval and a refusal each name a reason, and an empty one is refused with nothing written;
 *   (f) one row per rename, naming the proposer, the approver, the old and the new name and both reasons, and a
 *       refusal is a row too, with the name left as it was;
 *   (g) the handle and the id never change, and a message sent to the agent by its id or by its handle after the
 *       rename still reaches it;
 *   (h) the approver is told once, an agent by the two doors, the person with a lead to the agent's page; a proposer
 *       who is the approver is told nothing, and the reply says so;
 *   (i) two live agents never share a name, compared without case or spacing, at the proposal, at the approval and at
 *       the person's own rename; a retired agent's name may be borne again;
 *   (j) the person's own rename through the PATCH door writes one row, the person as proposer and approver, with the
 *       reason given beside the name or none, and an unchanged name writes none; an agent is sent to the renames door;
 *   (k) one new name waits at a time, and an approval of a proposal made for a name the agent no longer bears is refused;
 *   (l) before the role cards are read the office cannot tell who approves, and says so with 503;
 *   (m) the person's line about a new name ends when the new name is approved or refused, even after Not now: the
 *       office marks it read with a sentence naming who answered and when, the row reads as the office's act and not
 *       the reader's, and a line the person has already read keeps the person's own mark and sentence.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. In `theApproverOf` (src/server/lib/agent-renames.ts), answer the first rung of the walk instead of the last →
 *      (a) goes red: the worker's proposal waits for its supervisor. Eight more cases go red with it, each one that has
 *      a secretary answer a new name below it or be told of one, in (a), (c), (e), (f), (h), (i) and (k).
 *   2. In `theApproverOf`, drop the `retired` test → (b) goes red on the retired secretary.
 *   3. In `whyTheCallerMayNotAnswer`, drop the line that refuses the agent itself → (d) goes red, and so does the case
 *      of (k) in which the agent reads why it may not answer its own new name.
 *   4. In `theProposer`, accept any agent proved by its own key → (c) goes red on the outsider, and the case of (e)
 *      after it goes red too, because the outsider's new name is left waiting and refuses the next one.
 *   5. In `aReason`, return the reason without refusing an empty one → (e) goes red.
 *   6. In `whyALiveAgentBearsThisName` (src/server/lib/agent-names.ts), compare the names as written → (i) goes red in
 *      four of its cases, the name in another case among them.
 *   7. In `whyALiveAgentBearsThisName`, drop `retired = 0` → (i) goes red on the retired agent's name.
 *   8. In `setParticipantName` (src/server/lib/participants.ts), drop the call to `writeThePersonsOwnRename` → (j) red.
 *   9. In `proposeARename`, write the line to the approver whoever proposed → (c) goes red on the secretary proposing
 *      for its own worker, which is told; the case of (e) after it goes red too, because that new name is left waiting.
 *  10. In `answerARename`, drop the test that the agent still bears the old name → (k) goes red.
 *  11. In `answerARename`, drop the call to `markReadByTheOffice` → (m) goes red: the line still waits.
 *  12. In `markDelivery` (src/server/lib/messages.ts), write `because` whether or not the mark moves → (m) goes red on
 *      the line the person has already read.
 *  13. In `deliveryReading` (src/shared/messages.ts), drop the branch for a line the office marked read → (m) goes red
 *      on the reading.
 *  14. In `answerARename`, give `theNewNameWasAnswered` the old name in place of the new → (m) goes red in both cases:
 *      the sentence names a name the agent was not asked to bear.
 *
 * THE PRODUCT'S SENTENCES ARE READ FROM WHERE IT DEFINES THEM, never written out here: the press's name from the word
 * list, the self-approval refusal and the end of the office's sentence from src/shared/agent-renames.ts, and its start
 * from `theOfficeMarkedItRead` in src/shared/messages.ts. Each is imported inside its case, after freshDb.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

interface Reply {
  status: number
  json: Record<string, any>
  text: string
}

async function inject(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent, started by the person or by an agent already registered here, and keep its id and key. */
async function started(handle: string, role: string, by: string | null = null): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', by === null ? AS_THE_PERSON : as(by), { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  agents.set(handle, { id, key })
}
const as = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

function nameOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT name FROM agents WHERE id = ?').get(idOf(handle)) as { name: string }).name
}

function rowsOf(handle: string): Record<string, unknown>[] {
  return t.client.sqlite.prepare('SELECT * FROM agent_renames WHERE agent_id = ? ORDER BY rowid').all(idOf(handle)) as Record<string, unknown>[]
}

/** The lines telling somebody a new name waits, by the new name each names. */
function theLinesAbout(newName: string): { id: string; to: { kind: string; id: string }[]; said: string; lead: unknown }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'aRenameWaitsForYou'")
    .all() as { id: string; data: string }[]
  return rows
    .map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, any> }))
    .filter((row) => String(row.data['saidInFull'] ?? '').includes(`"${newName}"`))
    .map((row) => ({ id: row.id, to: row.data['to'], said: String(row.data['saidInFull']), lead: row.data['lead'] }))
}

function theLinesInAll(): number {
  return (
    t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'aRenameWaitsForYou'").get() as {
      n: number
    }
  ).n
}

async function propose(handle: string, name: string, by: Record<string, string>, because = 'A made-up reason for the new name.'): Promise<Reply> {
  return inject('POST', `/api/participants/agent/${idOf(handle)}/renames`, by, { name, because })
}

async function answer(renameId: string, how: 'approve' | 'refuse', by: Record<string, string>, because = 'A made-up reason for the answer.'): Promise<Reply> {
  return inject('POST', `/api/renames/${renameId}/${how}`, by, { because })
}

async function theRenames(handle: string, by: Record<string, string>): Promise<Reply> {
  return inject('GET', `/api/participants/agent/${idOf(handle)}/renames`, by)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // ONE CHAIN: a secretary started by the person, a supervisor it started, and two workers the supervisor started.
  await started('sec-made-up', 'secretary')
  await started('sup-made-up', 'supervisor', 'sec-made-up')
  await started('wkr-made-up', 'worker', 'sup-made-up')
  await started('wkr-second', 'worker', 'sup-made-up')
  // A SECOND SECRETARY, raised later, and an agent under no secretary at all.
  await started('sec-other', 'secretary')
  await started('lone-made-up', 'worker')
  // A SECRETARY THAT WILL BE RETIRED, with a supervisor under it.
  await started('sec-retiring', 'secretary')
  await started('sup-orphaned', 'supervisor', 'sec-retiring')
  // AGENTS WHOSE NAMES ARE TAKEN AND FREED.
  await started('wkr-bearer', 'worker', 'sup-made-up')
  await started('wkr-gone', 'worker', 'sup-made-up')
  await started('wkr-patched', 'worker', 'sup-made-up')
  await started('wkr-waits', 'worker', 'sup-made-up')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('(a) and (f): a worker\'s new name waits for the first secretary up its chain, who approves it', () => {
  let renameId: string

  it('(a) the worker proposes; it waits for the secretary, not its supervisor, and the name stays as it is', async () => {
    const proposed = await propose('wkr-made-up', 'Keel 守衡', as('wkr-made-up'), 'I keep the line steady.')
    expect(proposed.status, proposed.text).toBe(201)
    renameId = String(proposed.json['rename'].id)
    expect(proposed.json['rename'].approver).toMatchObject({ kind: 'agent', id: idOf('sec-made-up') })
    expect(proposed.json['rename'].answer).toBeNull()
    expect(nameOf('wkr-made-up')).toBe('wkr-made-up')
  })

  it('(h) the secretary is told once, by the two doors, with no lead to a page', () => {
    const lines = theLinesAbout('Keel 守衡')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([{ kind: 'agent', id: idOf('sec-made-up') }])
    expect(lines[0]!.said).toContain(`POST /api/renames/${renameId}/approve`)
    expect(lines[0]!.said).toContain('I keep the line steady.')
    expect(lines[0]!.lead).toBeUndefined()
    expect(rowsOf('wkr-made-up')[0]!['told_message_id']).toBe(lines[0]!.id)
  })

  it('(d) its supervisor, who is not its approver, may not answer it', async () => {
    const tried = await answer(renameId, 'approve', as('sup-made-up'))
    expect(tried.status, tried.text).toBe(403)
    expect(nameOf('wkr-made-up')).toBe('wkr-made-up')
  })

  it('(f) the secretary approves it: the name changes, and one row names both, both names and both reasons', async () => {
    const approved = await answer(renameId, 'approve', as('sec-made-up'), 'The name fits its work.')
    expect(approved.status, approved.text).toBe(200)
    expect(nameOf('wkr-made-up')).toBe('Keel 守衡')
    const rows = rowsOf('wkr-made-up')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      way: 'proposed',
      old_name: 'wkr-made-up',
      new_name: 'Keel 守衡',
      proposed_by_kind: 'agent',
      proposed_by_id: idOf('wkr-made-up'),
      proposed_because: 'I keep the line steady.',
      approver_kind: 'agent',
      approver_id: idOf('sec-made-up'),
      answer: 'approved',
      answered_by_kind: 'agent',
      answered_by_id: idOf('sec-made-up'),
      answered_because: 'The name fits its work.',
    })
    expect(theLinesAbout('Keel 守衡'), 'the approval told the approver a second time').toHaveLength(1)
  })

  it('(g) the handle and the id stay, and a message sent by its id or by its handle still reaches it', async () => {
    const row = t.client.sqlite.prepare('SELECT id, handle FROM agents WHERE id = ?').get(idOf('wkr-made-up')) as { id: string; handle: string }
    expect(row).toEqual({ id: idOf('wkr-made-up'), handle: 'wkr-made-up' })
    const sent: string[] = []
    for (const address of [idOf('wkr-made-up'), 'wkr-made-up']) {
      const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
        kind: 'message',
        title: 'A made-up note after the rename',
        data: { body: `A made-up note sent to ${address}.`, to: [{ kind: 'agent', id: address }] },
      })
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(filed.status, filed.text).toBe(409)
      sent.push(String(filed.json['record'].id))
    }
    const waiting = await inject('GET', '/api/handles/wkr-made-up/waiting', as('wkr-made-up'))
    expect(waiting.status, waiting.text).toBe(200)
    const ids = (waiting.json['waiting'] as { messageId: string }[]).map((one) => one.messageId)
    for (const id of sent) expect(ids).toContain(id)
  })
})

describe('(b) a secretary\'s new name, and one under no live secretary, wait for the person', () => {
  it('a secretary proposes its own: it waits for the person, who is told once with a lead to the agent\'s page', async () => {
    const proposed = await propose('sec-made-up', 'Tycho 第谷', as('sec-made-up'), 'A name for the office I keep.')
    expect(proposed.status, proposed.text).toBe(201)
    const rename = proposed.json['rename']
    expect(rename.approver).toMatchObject({ kind: 'person', id: THE_PERSON })
    const lines = theLinesAbout('Tycho 第谷')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([{ kind: 'person', id: THE_PERSON }])
    expect(lines[0]!.lead).toMatchObject({ target: { kind: 'page', route: `/who/agent/${idOf('sec-made-up')}` } })
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    expect(lines[0]!.said).toContain(sayInEnglish('agentRenames.approve'))
  })

  it('(d) the secretary may not answer its own, and the person may', async () => {
    const read = await theRenames('sec-made-up', AS_THE_PERSON)
    const renameId = String(read.json['waiting'].rename)
    expect(read.json['waiting'].whyTheCallerMayNotAnswer).toBeNull()

    const { AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME } = await import('../src/shared/agent-renames.ts')
    const itself = await answer(renameId, 'approve', as('sec-made-up'))
    expect(itself.status, itself.text).toBe(403)
    expect(String(itself.json['error'])).toContain(AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME)
    const itselfRefusing = await answer(renameId, 'refuse', as('sec-made-up'))
    expect(itselfRefusing.status, itselfRefusing.text).toBe(403)
    expect(nameOf('sec-made-up')).toBe('sec-made-up')

    const byThePerson = await answer(renameId, 'approve', AS_THE_PERSON, 'It reads well.')
    expect(byThePerson.status, byThePerson.text).toBe(200)
    expect(nameOf('sec-made-up')).toBe('Tycho 第谷')
    expect(byThePerson.json['rename']).toMatchObject({ answer: 'approved', answeredBy: { kind: 'person', id: THE_PERSON }, answeredBecause: 'It reads well.' })
  })

  it('an agent under no secretary waits for the person', async () => {
    const proposed = await propose('lone-made-up', 'A lone made-up name', as('lone-made-up'))
    expect(proposed.status, proposed.text).toBe(201)
    expect(proposed.json['rename'].approver).toMatchObject({ kind: 'person', id: THE_PERSON })
  })

  it('a supervisor whose first secretary is retired waits for the person', async () => {
    const retired = await inject('POST', `/api/participants/agent/sec-retiring/retire`, AS_THE_PERSON, { because: 'A made-up reason.' })
    expect(retired.status, retired.text).toBe(200)
    const proposed = await propose('sup-orphaned', 'An orphaned made-up name', as('sup-orphaned'))
    expect(proposed.status, proposed.text).toBe(201)
    expect(proposed.json['rename'].approver).toMatchObject({ kind: 'person', id: THE_PERSON })
  })
})

describe('(c) who may propose', () => {
  it('an agent up the chain may, and the secretary proposing for its worker is told nothing, being its approver', async () => {
    const before = theLinesInAll()
    const proposed = await propose('wkr-second', 'Second made-up name', as('sec-made-up'))
    expect(proposed.status, proposed.text).toBe(201)
    expect(proposed.json['rename'].proposedBy).toMatchObject({ kind: 'agent', id: idOf('sec-made-up') })
    expect(proposed.json['rename'].toldMessage).toBeNull()
    expect(String(proposed.json['says'])).toContain('Nobody was told.')
    expect(theLinesInAll()).toBe(before)
    const refused = await answer(String(proposed.json['rename'].id), 'refuse', as('sec-made-up'), 'On reflection, no.')
    expect(refused.status, refused.text).toBe(200)
  })

  it('an agent outside its chain may not, and nothing is written', async () => {
    const before = rowsOf('wkr-second').length
    const proposed = await propose('wkr-second', 'An outsider\'s made-up name', as('lone-made-up'))
    expect(proposed.status, proposed.text).toBe(403)
    expect(rowsOf('wkr-second')).toHaveLength(before)
  })
})

describe('(e) and (f): every proposal and answer names a reason, and a refusal is a row', () => {
  it('an empty reason is refused, for a proposal and for an answer, and nothing is written', async () => {
    const before = rowsOf('wkr-second').length
    const empty = await propose('wkr-second', 'A reasonless made-up name', as('wkr-second'), '   ')
    expect(empty.status, empty.text).toBe(400)
    expect(rowsOf('wkr-second')).toHaveLength(before)

    const proposed = await propose('wkr-second', 'A refused made-up name', as('wkr-second'), 'I would like it.')
    expect(proposed.status, proposed.text).toBe(201)
    const renameId = String(proposed.json['rename'].id)
    const emptyAnswer = await answer(renameId, 'refuse', as('sec-made-up'), '')
    expect(emptyAnswer.status, emptyAnswer.text).toBe(400)
    expect(rowsOf('wkr-second').at(-1)!['answer']).toBeNull()

    const refused = await answer(renameId, 'refuse', as('sec-made-up'), 'Another agent is called something close.')
    expect(refused.status, refused.text).toBe(200)
    expect(nameOf('wkr-second')).toBe('wkr-second')
    expect(rowsOf('wkr-second').at(-1)).toMatchObject({
      old_name: 'wkr-second',
      new_name: 'A refused made-up name',
      proposed_because: 'I would like it.',
      answer: 'refused',
      answered_by_id: idOf('sec-made-up'),
      answered_because: 'Another agent is called something close.',
    })
    const again = await answer(renameId, 'approve', AS_THE_PERSON)
    expect(again.status, again.text).toBe(409)
  })
})

describe('(i) two live agents never share a name', () => {
  it('a name a live agent bears is refused at the proposal, in another case and spacing too', async () => {
    const taken = await propose('wkr-bearer', '  keel   守衡 ', as('wkr-bearer'))
    expect(taken.status, taken.text).toBe(409)
    expect(String(taken.json['error'])).toContain('already bears the name')
  })

  it('a name taken between the proposal and the approval is refused at the approval', async () => {
    const proposed = await propose('wkr-bearer', 'A contested made-up name', as('wkr-bearer'))
    expect(proposed.status, proposed.text).toBe(201)
    const patched = await inject('PATCH', `/api/participants/agent/${idOf('wkr-gone')}`, AS_THE_PERSON, { name: 'A Contested Made-up Name' })
    expect(patched.status, patched.text).toBe(200)
    const approved = await answer(String(proposed.json['rename'].id), 'approve', as('sec-made-up'))
    expect(approved.status, approved.text).toBe(409)
    expect(nameOf('wkr-bearer')).toBe('wkr-bearer')
    expect((await answer(String(proposed.json['rename'].id), 'refuse', as('sec-made-up'))).status).toBe(200)
  })

  it('the person\'s own rename to a name a live agent bears is refused', async () => {
    const patched = await inject('PATCH', `/api/participants/agent/${idOf('wkr-bearer')}`, AS_THE_PERSON, { name: 'KEEL 守衡' })
    expect(patched.status, patched.text).toBe(409)
    expect(nameOf('wkr-bearer')).toBe('wkr-bearer')
  })

  it('a retired agent\'s name may be borne again', async () => {
    const retired = await inject('POST', `/api/participants/agent/wkr-gone/retire`, AS_THE_PERSON, { because: 'A made-up reason.' })
    expect(retired.status, retired.text).toBe(200)
    const proposed = await propose('wkr-bearer', 'A contested made-up name', as('wkr-bearer'))
    expect(proposed.status, proposed.text).toBe(201)
    const approved = await answer(String(proposed.json['rename'].id), 'approve', as('sec-made-up'))
    expect(approved.status, approved.text).toBe(200)
    expect(nameOf('wkr-bearer')).toBe('A contested made-up name')
  })
})

describe('(j) the person\'s own rename through the PATCH door', () => {
  it('writes one row, the person as proposer and approver, with the reason given beside the name', async () => {
    const patched = await inject('PATCH', `/api/participants/agent/${idOf('wkr-patched')}`, AS_THE_PERSON, {
      name: 'A patched made-up name',
      nameBecause: 'I like it better.',
    })
    expect(patched.status, patched.text).toBe(200)
    const rows = rowsOf('wkr-patched')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      way: 'at once',
      old_name: 'wkr-patched',
      new_name: 'A patched made-up name',
      proposed_by_kind: 'person',
      proposed_by_id: THE_PERSON,
      proposed_because: 'I like it better.',
      approver_kind: 'person',
      approver_id: THE_PERSON,
      answer: 'approved',
      answered_by_id: THE_PERSON,
      told_message_id: null,
    })
  })

  it('with no reason the row says none, and an unchanged name writes no row', async () => {
    expect((await inject('PATCH', `/api/participants/agent/${idOf('wkr-patched')}`, AS_THE_PERSON, { name: 'Another patched made-up name' })).status).toBe(200)
    expect((await inject('PATCH', `/api/participants/agent/${idOf('wkr-patched')}`, AS_THE_PERSON, { name: 'Another patched made-up name' })).status).toBe(200)
    const rows = rowsOf('wkr-patched')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ way: 'at once', proposed_because: null, new_name: 'Another patched made-up name' })
    const read = await theRenames('wkr-patched', AS_THE_PERSON)
    expect(read.status, read.text).toBe(200)
    expect((read.json['renames'] as { newName: string }[]).map((one) => one.newName)).toEqual(['Another patched made-up name', 'A patched made-up name'])
  })

  it('a reason with no name is refused, and an agent renaming itself here is sent to the renames door', async () => {
    const reasonOnly = await inject('PATCH', `/api/participants/agent/${idOf('wkr-patched')}`, AS_THE_PERSON, { nameBecause: 'A made-up reason.' })
    expect(reasonOnly.status, reasonOnly.text).toBe(400)
    const itself = await inject('PATCH', `/api/participants/agent/${idOf('wkr-patched')}`, as('wkr-patched'), { name: 'Its own made-up name' })
    expect(itself.status, itself.text).toBe(403)
    expect(String(itself.json['error'])).toContain(`/api/participants/agent/${idOf('wkr-patched')}/renames`)
    expect(rowsOf('wkr-patched')).toHaveLength(2)
  })
})

describe('(k) one new name waits at a time, and an out-of-date one is not approved', () => {
  it('a second proposal while one waits is refused', async () => {
    const first = await propose('wkr-waits', 'A first waiting made-up name', as('wkr-waits'))
    expect(first.status, first.text).toBe(201)
    const second = await propose('wkr-waits', 'A second waiting made-up name', as('sup-made-up'))
    expect(second.status, second.text).toBe(409)
  })

  it('after the person renames it at once, the waiting proposal is refused at the approval', async () => {
    const read = await theRenames('wkr-waits', as('sec-made-up'))
    expect(read.json['waiting'].whyTheCallerMayNotAnswer).toBeNull()
    const asTheAgent = await theRenames('wkr-waits', as('wkr-waits'))
    const { AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME } = await import('../src/shared/agent-renames.ts')
    expect(asTheAgent.json['waiting'].whyTheCallerMayNotAnswer).toBe(AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME)
    expect((await inject('PATCH', `/api/participants/agent/${idOf('wkr-waits')}`, AS_THE_PERSON, { name: 'A made-up name in between' })).status).toBe(200)
    const approved = await answer(String(read.json['waiting'].rename), 'approve', as('sec-made-up'))
    expect(approved.status, approved.text).toBe(409)
    expect(nameOf('wkr-waits')).toBe('A made-up name in between')
  })
})

describe('(m) the person\'s line about a new name ends when the new name is answered', () => {
  const AS_THE_KEYED_PERSON = (): Record<string, string> => ({ ...AS_THE_PERSON, ...thePersonsKeyHeader() })

  function theDeliveryOf(messageId: string): { mark: string; because: string | null } {
    return t.client.sqlite
      .prepare("SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person' AND recipient_id = ?")
      .get(messageId, THE_PERSON) as { mark: string; because: string | null }
  }

  async function theLinesWaitingForThePerson(): Promise<string[]> {
    const read = await inject('GET', '/api/messages?only=waiting-for-me', AS_THE_KEYED_PERSON())
    expect(read.status, read.text).toBe(200)
    return (read.json['messages'] as { id: string }[]).map((message) => message.id)
  }

  it('put off by Not now and then approved: the office marks it read, says who answered and when, and it waits no more', async () => {
    await started('sec-told', 'secretary')
    const proposed = await propose('sec-told', 'A told made-up name', as('sec-told'))
    expect(proposed.status, proposed.text).toBe(201)
    const toldIn = String(proposed.json['rename'].toldMessage)
    const putOff = await inject('POST', `/api/messages/${toldIn}/not-now`, AS_THE_KEYED_PERSON(), {})
    expect(putOff.status, putOff.text).toBe(200)
    // PUT OFF, THE LINE STILL WAITS, and that is why its offer would come back.
    expect(await theLinesWaitingForThePerson()).toContain(toldIn)

    const approved = await answer(String(proposed.json['rename'].id), 'approve', AS_THE_PERSON, 'It reads well.')
    expect(approved.status, approved.text).toBe(200)
    const rename = approved.json['rename']
    const delivery = theDeliveryOf(toldIn)
    expect(delivery.mark).toBe('seen')
    const { theNewNameWasAnswered } = await import('../src/shared/agent-renames.ts')
    const { deliveryReading, theOfficeMarkedItRead } = await import('../src/shared/messages.ts')
    expect(delivery.because).toBe(
      theOfficeMarkedItRead(theNewNameWasAnswered('A told made-up name', 'approved', String(rename.answeredBy.name), String(rename.answeredAt))),
    )
    expect(await theLinesWaitingForThePerson()).not.toContain(toldIn)
    // THE ROW READS AS THE OFFICE'S ACT: its own sentence alone, and not the reader's green.
    expect(deliveryReading(delivery)).toMatchObject({ sentence: delivery.because, shape: 'double-tick' })
  })

  it('a refusal ends it too, and a line the person has already read keeps the person\'s own mark and sentence', async () => {
    await started('sec-refused', 'secretary')
    const first = await propose('sec-refused', 'A refused made-up name', as('sec-refused'))
    expect(first.status, first.text).toBe(201)
    const refused = await answer(String(first.json['rename'].id), 'refuse', AS_THE_PERSON, 'It does not read well.')
    expect(refused.status, refused.text).toBe(200)
    const firstLine = theDeliveryOf(String(first.json['rename'].toldMessage))
    expect(firstLine.mark).toBe('seen')
    const { theNewNameWasAnswered } = await import('../src/shared/agent-renames.ts')
    const { theOfficeMarkedItRead } = await import('../src/shared/messages.ts')
    const answered = refused.json['rename']
    expect(firstLine.because).toBe(
      theOfficeMarkedItRead(theNewNameWasAnswered('A refused made-up name', 'refused', String(answered.answeredBy.name), String(answered.answeredAt))),
    )

    const second = await propose('sec-refused', 'A read made-up name', as('sec-refused'))
    expect(second.status, second.text).toBe(201)
    const secondIn = String(second.json['rename'].toldMessage)
    const read = await inject('POST', `/api/messages/${secondIn}/mark`, AS_THE_KEYED_PERSON(), { mark: 'seen' })
    expect(read.status, read.text).toBe(200)
    const asThePersonLeftIt = theDeliveryOf(secondIn)
    expect((await answer(String(second.json['rename'].id), 'refuse', AS_THE_PERSON, 'Nor this one.')).status).toBe(200)
    expect(theDeliveryOf(secondIn)).toEqual(asThePersonLeftIt)
  })
})

describe('(l) before the role cards are read', () => {
  it('a proposal is refused with 503, because nobody can tell who approves it', async () => {
    const roles = await import('../src/server/lib/roles.ts')
    roles.forgetTheRoleCards()
    const fresh = await propose('wkr-patched', 'A cardless made-up name', AS_THE_PERSON)
    expect(fresh.status, fresh.text).toBe(503)
    expect(String(fresh.json['error'])).toContain('role cards')
  })
})
