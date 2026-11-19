// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST ADDRESSED TO THE OWNER IS NOT MOVED, ANSWERED OR REWORDED PAST THE OWNER, AND ITS ASKER'S WITHDRAWAL STAYS IN
 * SIGHT (check nktwJZR4jbWM, which refused wave 13w round 5; decision tFl1YWLH3eCl; wave 13w round 5b).
 *
 * Round 5 closed the delete door on a role request that waits for the person. The check found the other change doors
 * still open: PATCH /api/records/:id and a revision restore could change who the request answers to, write its answer,
 * or reword it, and the person's list would follow. Every agent and record here is made up for the test, in a fresh test database.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · PATCH: moving it (data.answersTo) and answering it (data.answer) are refused to the asker, another agent, a
 *     secretary the person raised and the person, in words that say nothing was written, and the request is as it was.
 *     Rewording it (its title, data.asking) is refused to every agent and allowed to the person. Changing its kind is
 *     refused to everybody, on a request of its own for each caller.
 *     CONTROL on the branch before this change: each agent's PATCH answered 200.
 *     MUTATION: take `refuseAChangeToARequestThatWaitsForThePerson` out of `patchRecord` (src/server/lib/records.ts). Red.
 *   · A revision restore: putting back a revision before the person's answer, one where it answered to an agent, and one with
 *     its earlier title, is refused in the same words; the person may put back the earlier title.
 *     CONTROL and MUTATION: the same as for PATCH.
 *   · The answer door still writes the answer, inside `asTheRoleRequestDoor`.
 *     MUTATION: take the door's wrapper off the refusal in src/server/api/roles.ts. Red: the door's own press is refused.
 *   · Withdrawal: the asker, sending its own key, withdraws its unanswered request. The request is kept with answer
 *     `withdrawn` and says when, which agent and as what. Another agent, and the asker without its key, are refused in
 *     words; a request the person has answered is not withdrawn.
 *     MUTATION: let any agent key through `withdrawARequestToThePerson` (src/server/lib/withdraw-a-request.ts). Red.
 *   · The person's list: a withdrawn request is not a row and is not counted, and the reading lists it under what is not
 *     counted, with its title, who withdrew it and when. Seven days after the withdrawal it leaves that list, and the
 *     request is still there.
 *     MUTATION: drop the withdrawn requests from the reading (src/server/lib/waiting.ts). Red. And: list them whatever
 *     their age. Red.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

type Built = Awaited<ReturnType<typeof apiApp>>

const BY_THEIR_NAME = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (handle: string, extra: { session?: string; key?: string } = {}): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(extra.session === undefined ? {} : { 'x-mole-office-session': extra.session }),
  ...(extra.key === undefined ? {} : { 'x-mole-office-key': extra.key }),
})
const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const BYSTANDER = 'rb-bystander'

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

let t: TestDb
let app: Built
let secretaryRun = ''
let bystanderKey = ''
const keys = new Map<string, string>()

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: hidden(String(body['error'] ?? reply.body)), body }
}

const THEIR_KEY = (): Record<string, string> => ({ ...BY_THEIR_NAME, ...thePersonsKeyHeader() })

/** Start an agent with the person's key and keep its own key in memory only. */
async function start(handle: string, role: string): Promise<string> {
  const started = await ask('POST', '/api/agents/started', THEIR_KEY(), { handle, name: handle, role, workArea: ['work'] })
  expect(started.status, started.said).toBe(201)
  const key = String((started.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  expect(key, 'the start gave the agent no key').toMatch(/^[0-9a-f]{64}$/)
  keys.set(handle, key)
  return key
}

/** A worker the person started, asking the person for the supervisor card: a request whose answersTo is the person. */
async function aRequestToThem(handle: string): Promise<string> {
  await start(handle, 'worker')
  const asked = await ask('POST', '/api/roles/requests', asAgent(handle), { asking: 'supervisor', because: 'Test: to lead a wave' })
  expect(asked.status, asked.said).toBe(201)
  const id = String(asked.body['request'] ?? asked.body['record']?.id ?? asked.body['id'])
  expect(t.api.getRecord(id)?.data['answersTo']).toEqual({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
  return id
}

async function aRunHeldBy(handle: string): Promise<string> {
  const session = await ask('POST', '/api/records', asAgent(handle), { kind: 'session', title: `${handle} answering`, data: { state: 'running' } })
  expect(session.status, session.said).toBe(201)
  const run = String(session.body['record'].id)
  const held = await ask('POST', `/api/handles/${handle}/hold`, asAgent(handle, { session: run }), { session: run, machine: 'a-machine', runtime: 'claude-code' })
  expect(held.status, held.said).toBe(201)
  return run
}

/** What a reader of the person's list would see of a request: the parts this round keeps from moving. */
const whatItSays = (id: string) => {
  const row = t.api.getRecord(id)!
  const { answersTo, answer, answeredAt, asking, because } = row.data
  return { kind: row.kind, title: row.title, answersTo, answer, answeredAt, asking, because }
}

const lastSeq = (id: string): number =>
  (t.client.sqlite.prepare('SELECT MAX(seq) AS seq FROM revisions WHERE record_id = ?').get(id) as { seq: number }).seq

/** A refusal this round makes: 403, in words that say what was refused and that nothing was written. */
const refusedInWords = (reply: { status: number; said: string }): string =>
  `${reply.status} ${reply.said.includes('waits for the person') && reply.said.includes('Nothing was written.') ? 'in words' : `otherwise: ${reply.said.slice(0, 200)}`}`

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const started = await ask('POST', '/api/agents/started', THEIR_KEY(), { handle: SECRETARY, name: SECRETARY, role: 'secretary' })
  expect(started.status, started.said).toBe(201)
  bystanderKey = await start(BYSTANDER, 'supervisor')
  secretaryRun = await aRunHeldBy(SECRETARY)
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, THEIR_KEY(), { reason: 'Test: answer what waits for me' })
  expect(pressed.status, pressed.said).toBe(201)
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a request addressed to the person, through PATCH /api/records/:id', () => {
  it('is not moved or answered by anybody, and not reworded by any agent; the person may reword it', async () => {
    const request = await aRequestToThem('rb-asker-1')
    const callers: Array<readonly [string, Record<string, string>]> = [
      ['the asker', asAgent('rb-asker-1', { key: keys.get('rb-asker-1') })],
      ['another agent', asAgent(BYSTANDER, { key: bystanderKey })],
      ['a secretary the person raised', asAgent(SECRETARY, { session: secretaryRun })],
      ['the person', THEIR_KEY()],
    ]
    const changes: Array<readonly [string, Record<string, unknown>]> = [
      ['move', { dataPatch: { answersTo: { kind: 'agent', id: BYSTANDER } } }],
      ['answer', { dataPatch: { answer: 'granted', answeredAt: '2026-10-05 12:00:00' } }],
      ['reword the title', { title: 'rb-asker-1 asks for nothing' }],
      ['reword what it asks', { dataPatch: { asking: 'worker' } }],
    ]
    const answered: Record<string, string> = {}
    for (const [who, headers] of callers) {
      for (const [what, body] of changes) {
        const before = whatItSays(request)
        const patched = await ask('PATCH', `/api/records/${request}`, headers, body)
        answered[`${who}: ${what}`] = `${refusedInWords(patched)}${JSON.stringify(whatItSays(request)) === JSON.stringify(before) ? '' : ', and it changed'}`
      }
    }
    const expected = Object.fromEntries(
      callers.flatMap(([who]) => changes.map(([what]) => [`${who}: ${what}`, who === 'the person' && what.startsWith('reword') ? 'reworded' : '403 in words'])),
    )
    // The person's two rewords are allowed: each answers 200 and changes what the request says.
    for (const what of ['reword the title', 'reword what it asks']) {
      if (answered[`the person: ${what}`]?.startsWith('200')) answered[`the person: ${what}`] = 'reworded'
    }
    expect(answered).toEqual(expected)
    expect(whatItSays(request)).toMatchObject({ title: 'rb-asker-1 asks for nothing', asking: 'worker', answersTo: { kind: 'person' } })
  })

  it('does not change kind, which would carry who it answers to off into extra', async () => {
    const answered: Record<string, string> = {}
    for (const [who, headers] of [
      ['the asker', (handle: string) => asAgent(handle, { key: keys.get(handle) })],
      ['a secretary the person raised', () => asAgent(SECRETARY, { session: secretaryRun })],
      ['the person', () => THEIR_KEY()],
    ] as const) {
      // A REQUEST OF ITS OWN FOR EACH CALLER, so one caller's change is never the next caller's starting point.
      const handle = `rb-kind-${who.replace(/\W+/g, '-')}`
      const request = await aRequestToThem(handle)
      const patched = await ask('PATCH', `/api/records/${request}`, headers(handle), { kind: 'note' })
      answered[who] = `${refusedInWords(patched)}, ${whatItSays(request).kind}`
    }
    expect(answered).toEqual({
      'the asker': '403 in words, role_request',
      'a secretary the person raised': '403 in words, role_request',
      'the person': '403 in words, role_request',
    })
  })

  it('is still answered through the answer door', async () => {
    // THE ANSWER DOOR STILL WRITES IT. The control that the guard did not close the one way in.
    const request = await aRequestToThem('rb-asker-2')
    const refused = await ask('POST', `/api/roles/requests/${request}/refuse`, asAgent(SECRETARY, { session: secretaryRun }), { ...FOR_THE_PERSON, says: 'Test: not now' })
    expect(refused.status, refused.said).toBe(200)
    expect(whatItSays(request)).toMatchObject({ answer: 'refused', answersTo: { kind: 'person' } })
  })
})

describe('a request addressed to the person, through a revision restore', () => {
  const restore = (id: string, seq: number, headers: Record<string, string>) =>
    ask('POST', `/api/records/${id}/revisions/${seq}/restore`, headers, { note: 'Test: put it back' })

  it('does not put back a revision from before the person’s answer', async () => {
    const request = await aRequestToThem('rb-asker-3')
    const unanswered = lastSeq(request)
    const answered = await ask('POST', `/api/roles/requests/${request}/grant`, THEIR_KEY(), { says: 'Test: yes' })
    expect(answered.status, answered.said).toBe(200)
    for (const [who, headers] of [['a secretary the person raised', asAgent(SECRETARY, { session: secretaryRun })], ['the person', THEIR_KEY()]] as const) {
      const restored = await restore(request, unanswered, headers)
      expect(refusedInWords(restored), who).toBe('403 in words')
      expect(whatItSays(request).answer, who).toBe('granted')
    }
  })

  it('does not put back a revision in which it answered to an agent', async () => {
    const request = await aRequestToThem('rb-asker-4')
    // THE HISTORY IS MADE BY THE DOOR'S OWN SCOPE, as only the door may write it: one revision that answers to an
    // agent, then the request back to the person. Made up for the test.
    const { asTheRoleRequestDoor, patchRecord } = await import('../src/server/lib/records.ts')
    const office = { type: 'system' as const, id: 'test-fixture' }
    asTheRoleRequestDoor(() => patchRecord(request, { dataPatch: { answersTo: { kind: 'agent', id: BYSTANDER } } }, office))
    const toAnAgent = lastSeq(request)
    asTheRoleRequestDoor(() => patchRecord(request, { dataPatch: { answersTo: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } } }, office))
    for (const [who, headers] of [['the asker', asAgent('rb-asker-4', { key: keys.get('rb-asker-4') })], ['the person', THEIR_KEY()]] as const) {
      const restored = await restore(request, toAnAgent, headers)
      expect(refusedInWords(restored), who).toBe('403 in words')
      expect(whatItSays(request).answersTo, who).toEqual({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    }
  })

  it('does not put back its earlier words for an agent, and does for the person', async () => {
    const request = await aRequestToThem('rb-asker-5')
    const firstWords = lastSeq(request)
    const reworded = await ask('PATCH', `/api/records/${request}`, THEIR_KEY(), { title: 'rb-asker-5 asks, in the person’s words' })
    expect(reworded.status, reworded.said).toBe(200)
    for (const [who, headers] of [['the asker', asAgent('rb-asker-5', { key: keys.get('rb-asker-5') })], ['a secretary the person raised', asAgent(SECRETARY, { session: secretaryRun })]] as const) {
      const restored = await restore(request, firstWords, headers)
      expect(refusedInWords(restored), who).toBe('403 in words')
      expect(whatItSays(request).title, who).toBe('rb-asker-5 asks, in the person’s words')
    }
    const their = await restore(request, firstWords, THEIR_KEY())
    expect(their.status, their.said).toBe(200)
    expect(whatItSays(request).title).not.toBe('rb-asker-5 asks, in the person’s words')
  })
})

describe('a request addressed to the person, withdrawn by its asker', () => {
  const withdraw = (id: string, headers: Record<string, string>) => ask('POST', `/api/roles/requests/${id}/withdraw`, headers, {})
  const waiting = async () => {
    const read = await ask('GET', '/api/waiting', THEIR_KEY())
    expect(read.status, read.said).toBe(200)
    return read.body as { items: Array<{ id: string }>; excluded: Array<{ reason: string; count: number; withdrawn?: Array<Record<string, string>> }> }
  }

  it('is withdrawn by the asker with its own key, and by nobody else', async () => {
    const request = await aRequestToThem('rb-asker-6')
    const refusals: Record<string, string> = {}
    for (const [who, headers] of [
      ['another agent with its own key', asAgent(BYSTANDER, { key: bystanderKey })],
      ['the asker without its key', asAgent('rb-asker-6')],
      ['a secretary the person raised', asAgent(SECRETARY, { session: secretaryRun })],
    ] as const) {
      const tried = await withdraw(request, headers)
      refusals[who] = `${refusedInWords(tried)}, ${whatItSays(request).answer === undefined ? 'unanswered' : 'answered'}`
    }
    expect(refusals).toEqual({
      'another agent with its own key': '403 in words, unanswered',
      'the asker without its key': '403 in words, unanswered',
      'a secretary the person raised': '403 in words, unanswered',
    })

    const withdrawn = await withdraw(request, asAgent('rb-asker-6', { key: keys.get('rb-asker-6') }))
    expect(withdrawn.status, withdrawn.said).toBe(200)
    const row = t.api.getRecord(request)!
    expect(row.deletedAt ?? null).toBeNull()
    expect(row.data['answer']).toBe('withdrawn')
    const said = (row.data['extra'] as Record<string, any>)['withdrawn']
    const asker = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('rb-asker-6') as { id: string }
    expect(said).toMatchObject({ by: asker.id, as: 'the-asker' })
    expect(String(said.at)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('is not withdrawn once the person has answered it', async () => {
    const request = await aRequestToThem('rb-asker-7')
    const answered = await ask('POST', `/api/roles/requests/${request}/refuse`, THEIR_KEY(), {})
    expect(answered.status, answered.said).toBe(200)
    const tried = await withdraw(request, asAgent('rb-asker-7', { key: keys.get('rb-asker-7') }))
    expect(tried.status, tried.said).toBe(409)
    expect(tried.said).toContain('Nothing was written.')
    expect(whatItSays(request).answer).toBe('refused')
  })

  it('leaves the rows of the person’s list, is listed with who withdrew it and when, and leaves that list after 7 days', async () => {
    const request = await aRequestToThem('rb-asker-8')
    expect((await waiting()).items.map((row) => row.id)).toContain(request)
    const withdrawn = await withdraw(request, asAgent('rb-asker-8', { key: keys.get('rb-asker-8') }))
    expect(withdrawn.status, withdrawn.said).toBe(200)

    const after = await waiting()
    expect(after.items.map((row) => row.id), 'a withdrawn request is still a row').not.toContain(request)
    const group = after.excluded.find((one) => one.reason === 'withdrawn-by-its-asker')
    expect(group, 'the reading does not list withdrawn requests').toBeDefined()
    const listed = group!.withdrawn?.find((one) => one['id'] === request)
    const at = String(((t.api.getRecord(request)!.data['extra'] as Record<string, any>)['withdrawn']).at)
    expect(listed).toMatchObject({ title: t.api.getRecord(request)!.title, by: 'rb-asker-8', as: 'the-asker', at })
    expect(group!.count).toBe(group!.withdrawn?.length)

    // EIGHT DAYS LATER, written straight into the test database: the withdrawal time is the only thing moved.
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(request) as { data: string }
    const data = JSON.parse(row.data)
    const { localStamp } = await import('../src/shared/time.ts')
    data.extra.withdrawn.at = localStamp(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000))
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), request)
    const later = await waiting()
    const stillListed = later.excluded.find((one) => one.reason === 'withdrawn-by-its-asker')?.withdrawn?.some((one) => one['id'] === request) ?? false
    expect(stillListed, 'a withdrawal eight days old is still listed').toBe(false)
    expect(later.items.map((one) => one.id)).not.toContain(request)
    expect(t.api.getRecord(request)?.data['answer']).toBe('withdrawn')
  })
})
