// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST ADDRESSED TO THE OWNER CANNOT BE DELETED BY AN AGENT, AND A SECRETARY THE OWNER RAISED MAY ANSWER IT.
 * Problem dfwh9AKntOs5, and a decision on a message, wave 13w round 4.
 *
 * A role request is an agent asking for a card. Its `answersTo` is whoever started the agent, and for an agent the person started
 * that is the person. The answer door (POST /api/roles/requests/:id/grant|refuse) let only the person, or the participant
 * named in `answersTo`, press. Two things were wrong:
 *   · the general delete door (DELETE /api/records/:id) had no rule for a role request, so an agent could make a request
 *     waiting for the person disappear before the person saw it;
 *   · a decision gives a secretary the person raised the person's acts but a few, answering a
 *     request is not one of the few, and the answer door ignored the raise. Another
 *     decision says it follows the raise.
 *
 * Every agent and record here is made up for the test, in a fresh test database.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · the asker, another registered agent, an unregistered agent and a secretary the person raised are each refused the delete of
 *     a request addressed to the person, in words, and the request is still there; the person may delete it.
 *     CONTROL on main before this change: every agent's delete answered 200.
 *     MUTATION: take the role-request rule out of the delete door (src/server/lib/records.ts). Red.
 *   · a delete of a request answered by an agent, by that agent, is not touched by this rule.
 *   · the person answers a request addressed to them.
 *     MUTATION: none needed for the person; this case is the control that the door works at all.
 *   · a secretary the person raised grants one, and the revision that wrote the answer names the person's raise.
 *     MUTATION: take the raise out of the answer door's guard (src/server/api/roles.ts). Red.
 *   · a request for the secretary card is not granted by a secretary the person raised: it gives only what its own card may
 *     give (chapter 8, rule 4), and is told so in words.
 *     MUTATION: take the raised secretary's card reading out of the answer door. Red.
 *   · a request to join the office is admitted by a secretary the person raised, and the admission names the person's raise; one that
 *     asks for the secretary card is not, because the raise gives only what the secretary's own card may give (chapter 8,
 *     rule 4; message vjafrEk1UXk0, answer 1); and a secretary the person raised may refuse one.
 *     CONTROL on the branch before this change: the admission answered 403.
 *     MUTATION: take the card reading out of the admission under the raise (src/server/api/roles.ts). Red: the
 *     request for the secretary card is admitted.
 *   · its own page carries the press to the person and to a secretary the person raised, each told who may press in a code the
 *     page draws in English and Chinese (`you`, `you-under-his-raise`); a secretary the person did not raise and any other
 *     agent are sent no press.
 *     MUTATION: in thePressOnThisAsk (src/server/lib/newkey.ts), tell every reader `you`. Red.
 *   · the press on a join that proved nobody says, in the word list's sentence, that the office cannot tell who sent it.
 *     MUTATION: give such a join the closed window's sentence (src/server/lib/newkey.ts). Red.
 *   · a secretary the person did not raise, and an agent that is not a secretary, are refused, and nothing is written.
 *     MUTATION: let any secretary card through the answer door, raised or not. The unraised case goes red.
 */
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

type Built = Awaited<ReturnType<typeof apiApp>>

const BY_THEIR_NAME = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (handle: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const OTHER_SECRETARY = 'rq-secretary-unraised'
const BYSTANDER = 'rq-bystander'

let t: TestDb
let app: Built
let secretaryRun = ''
let otherSecretaryRun = ''

async function ask(method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** A worker the person started, asking the person for the supervisor card: a request whose answersTo is the person. */
async function aRequestToThem(handle: string): Promise<string> {
  const started = await ask('POST', '/api/agents/started', BY_THEIR_NAME, { handle, name: handle, role: 'worker', workArea: ['work'] })
  expect(started.status, started.said).toBe(201)
  const asked = await ask('POST', '/api/roles/requests', asAgent(handle), { asking: 'supervisor', because: 'Test: to lead a wave' })
  expect(asked.status, asked.said).toBe(201)
  const id = String(asked.body['request'] ?? asked.body['record']?.id ?? asked.body['id'])
  const row = t.api.getRecord(id)
  expect(row?.kind).toBe('role_request')
  expect(row?.data['answersTo']).toEqual({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
  return id
}

async function aRunHeldBy(handle: string): Promise<string> {
  const session = await ask('POST', '/api/records', asAgent(handle), { kind: 'session', title: `${handle} answering`, data: { state: 'running' } })
  expect(session.status, session.said).toBe(201)
  const run = String(session.body['record'].id)
  const held = await ask('POST', `/api/handles/${handle}/hold`, asAgent(handle, run), { session: run, machine: 'a-machine', runtime: 'claude-code' })
  expect(held.status, held.said).toBe(201)
  return run
}

const stillThere = (id: string): boolean => {
  const row = t.client.sqlite.prepare('SELECT deleted_at FROM records WHERE id = ?').get(id) as { deleted_at: string | null } | undefined
  return row !== undefined && row.deleted_at === null
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  // A session registers itself as a request to join only while the key window is closed, and it closes only while no
  // live agent lacks a proved key, so it is closed before anybody is started.
  const window = await import('../src/server/lib/keywindow.ts')
  window.closeTheKeyWindow({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
  for (const handle of [SECRETARY, OTHER_SECRETARY]) {
    const started = await ask('POST', '/api/agents/started', BY_THEIR_NAME, { handle, name: handle, role: 'secretary' })
    expect(started.status, started.said).toBe(201)
  }
  const bystander = await ask('POST', '/api/agents/started', BY_THEIR_NAME, { handle: BYSTANDER, name: BYSTANDER, role: 'supervisor', workArea: ['work'] })
  expect(bystander.status, bystander.said).toBe(201)
  secretaryRun = await aRunHeldBy(SECRETARY)
  otherSecretaryRun = await aRunHeldBy(OTHER_SECRETARY)
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, { reason: 'Test: answer what waits for me' })
  expect(pressed.status, pressed.said).toBe(201)
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a request addressed to the person', () => {
  it('cannot be deleted by any agent, and each is told why in words', async () => {
    const request = await aRequestToThem('rq-asker-1')
    const tries: Array<readonly [string, Record<string, string>]> = [
      ['the asker', asAgent('rq-asker-1')],
      ['another registered agent', asAgent(BYSTANDER)],
      ['an agent nobody registered', asAgent('rq-nobody')],
      ['a secretary the person raised', asAgent(SECRETARY, secretaryRun)],
    ]
    const answered: Record<string, string> = {}
    for (const [who, headers] of tries) {
      const deleted = await ask('DELETE', `/api/records/${request}`, headers)
      answered[who] = `${deleted.status} ${deleted.status === 403 && deleted.said.includes('waits for the person') ? 'in words' : 'otherwise'} ${stillThere(request) ? 'still there' : 'gone'}`
      // A delete that went through is undone, so the next caller is asked about the same request.
      if (!stillThere(request)) t.client.sqlite.prepare('UPDATE records SET deleted_at = NULL WHERE id = ?').run(request)
    }
    expect(answered).toEqual(Object.fromEntries(tries.map(([who]) => [who, '403 in words still there'])))
  })

  it('may be deleted by the person', async () => {
    const request = await aRequestToThem('rq-asker-2')
    const deleted = await ask('DELETE', `/api/records/${request}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() })
    expect(deleted.status, deleted.said).toBeLessThan(300)
    expect(stillThere(request)).toBe(false)
  })

  it('is answered by the person', async () => {
    const request = await aRequestToThem('rq-asker-3')
    const answered = await ask('POST', `/api/roles/requests/${request}/refuse`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, { says: 'Test: not yet' })
    expect(answered.status, answered.said).toBe(200)
    expect(t.api.getRecord(request)?.data['answer']).toBe('refused')
  })

  it('is answered by a secretary the person raised, and the answer names the person\'s raise', async () => {
    const request = await aRequestToThem('rq-asker-4')
    const answered = await ask('POST', `/api/roles/requests/${request}/grant`, asAgent(SECRETARY, secretaryRun), { ...FOR_THE_PERSON, says: 'Test: yes, for the person' })
    expect(answered.status, answered.said).toBe(200)
    expect(t.api.getRecord(request)?.data['answer']).toBe('granted')
    const wrote = t.client.sqlite
      .prepare("SELECT elevation FROM changes WHERE record_id = ? AND field = 'data.answer' ORDER BY rowid DESC LIMIT 1")
      .get(request) as { elevation: string | null } | undefined
    expect(wrote?.elevation ?? null, 'the answer does not name the raise it was given under').not.toBeNull()
  })

  it('asking for the secretary card is not granted by a secretary the person raised, which may give only what its own card gives', async () => {
    const started = await ask('POST', '/api/agents/started', BY_THEIR_NAME, { handle: 'rq-asker-6', name: 'rq-asker-6', role: 'worker', workArea: ['work'] })
    expect(started.status, started.said).toBe(201)
    const asked = await ask('POST', '/api/roles/requests', asAgent('rq-asker-6'), { asking: 'secretary', because: 'Test: to answer for the person' })
    expect(asked.status, asked.said).toBe(201)
    const request = String(asked.body['request'])
    const answered = await ask('POST', `/api/roles/requests/${request}/grant`, asAgent(SECRETARY, secretaryRun), FOR_THE_PERSON)
    expect(answered.status, answered.said).toBe(403)
    expect(answered.said).toContain('chapter 8, rule 4')
    expect(t.api.getRecord(request)?.data['answer']).toBeUndefined()
  })

  it('to join the office is admitted by a secretary the person raised, unless it asks for a card that secretary may not give', async () => {
    // EACH JOIN GIVES A NAME THAT IS NOT ITS HANDLE, so a sentence that reads the stored handle is told apart from the
    // one that reads the name the person will look for.
    const names: Record<string, string> = {
      'rq-joiner-1': 'The First Made-Up Joiner',
      'rq-joiner-2': 'The Second Made-Up Joiner',
      'rq-joiner-3': 'The Third Made-Up Joiner',
      'rq-joiner-4': 'The Fourth Made-Up Joiner',
    }
    const join = async (handle: string, requestedRole: string): Promise<string> => {
      const filed = await ask('POST', '/api/agents/register-myself', asAgent(handle), {
        handle,
        name: names[handle],
        workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
        requestedRole,
      })
      expect(filed.status, filed.said).toBe(202)
      return String(filed.body['request'])
    }
    const toAdmit = await join('rq-joiner-1', 'worker')
    const admitted = await ask('POST', `/api/roles/requests/${toAdmit}/grant`, asAgent(SECRETARY, secretaryRun), FOR_THE_PERSON)
    expect(admitted.status, admitted.said).toBe(201)
    expect(t.api.getRecord(toAdmit)?.data['answer']).toBe('granted')
    expect(admitted.body['role']).toBe('worker')
    const wrote = t.client.sqlite
      .prepare("SELECT elevation FROM changes WHERE record_id = ? AND field = 'data.answer' ORDER BY rowid DESC LIMIT 1")
      .get(toAdmit) as { elevation: string | null } | undefined
    expect(wrote?.elevation ?? null, 'the admission does not name the raise it was given under').not.toBeNull()

    const asksForSecretary = await join('rq-joiner-4', 'secretary')
    const notAdmitted = await ask('POST', `/api/roles/requests/${asksForSecretary}/grant`, asAgent(SECRETARY, secretaryRun), FOR_THE_PERSON)
    expect(notAdmitted.status, notAdmitted.said).toBe(403)
    expect(notAdmitted.said).toContain('chapter 8, rule 4')
    expect(t.api.getRecord(asksForSecretary)?.data['answer']).toBeUndefined()
    expect(t.client.sqlite.prepare('SELECT 1 FROM agents WHERE handle = ?').get('rq-joiner-4')).toBeUndefined()

    const toRefuse = await join('rq-joiner-2', 'worker')
    const refused = await ask('POST', `/api/roles/requests/${toRefuse}/refuse`, asAgent(SECRETARY, secretaryRun), { ...FOR_THE_PERSON, says: 'Test: not now' })
    expect(refused.status, refused.said).toBe(200)
    expect(t.api.getRecord(toRefuse)?.data['answer']).toBe('refused')
  })

  it('is pressed on its own page by the person and a secretary the person raised, each told who may press, and by nobody else', async () => {
    const pressOn = async (id: string, headers: Record<string, string>): Promise<{ press?: string; name?: string; whoMayPress?: string; says?: string } | undefined> => {
      const page = await ask('GET', `/api/records/${id}`, headers)
      expect(page.status, page.said).toBe(200)
      return page.body['waitingForThePersonsPress'] as { press?: string; name?: string; whoMayPress?: string; says?: string } | undefined
    }
    const card = await aRequestToThem('rq-asker-7')
    const filed = await ask('POST', '/api/agents/register-myself', asAgent('rq-joiner-3'), {
      handle: 'rq-joiner-3',
      name: 'The Third Made-Up Joiner',
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      requestedRole: 'worker',
    })
    expect(filed.status, filed.said).toBe(202)
    const join = String(filed.body['request'])
    for (const [id, press] of [[card, 'card'], [join, 'admit']] as const) {
      expect(await pressOn(id, BY_THEIR_NAME), `${press}, to the person`).toMatchObject({ press, whoMayPress: 'you' })
      const toTheSecretary = await pressOn(id, asAgent(SECRETARY, secretaryRun))
      expect(toTheSecretary, `${press}, to a secretary the person raised`).toMatchObject({ press, whoMayPress: 'you-under-his-raise' })
      // THE SENTENCE OF WHAT THE PRESS DOES IS READ BY BOTH, so it never says "your key" to a secretary about the person's key.
      expect(toTheSecretary?.says, `${press}, what the press does`).not.toMatch(/\byour\b/i)
      expect(await pressOn(id, asAgent(OTHER_SECRETARY, otherSecretaryRun)), `${press}, to a secretary the person did not raise`).toBeUndefined()
      expect(await pressOn(id, asAgent(BYSTANDER)), `${press}, to another agent`).toBeUndefined()
    }
    // A JOIN WHILE THE WINDOW WAS CLOSED names the office name the session gave, not the stored handle, in both the
    // page's press and the waiting list's sentence.
    const closed = await pressOn(join, BY_THEIR_NAME)
    expect(closed, 'the closed admission page carries no press').toMatchObject({
      press: 'admit',
      whoMayPress: 'you',
      name: 'The Third Made-Up Joiner',
    })
    expect(closed?.says, 'the closed admission sentence draws the handle').not.toContain('rq-joiner-3')
    expect(closed?.says, 'the closed admission sentence does not draw the office name').toContain('The Third Made-Up Joiner')

    // A JOIN THAT PROVED NOBODY says in the sentence of what the press does that the office cannot tell who sent it, in
    // the word list's words, and that sentence names whose key was missing in words a raised secretary may read: the
    // person's, not "your".
    const { thePressOnThisAsk } = await import('../src/server/lib/newkey.ts')
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    const stored = t.api.getRecord(join)!
    const provedNobody = { ...stored, data: { ...stored.data, extra: { ...(stored.data['extra'] as object), selfRegistrationWaits: 'nothing-proved-who-asked' } } }
    const press = thePressOnThisAsk(provedNobody, 'a-raised-secretary')
    const said = press?.says
    expect(said, 'the sentence of a join that proved nobody').toContain(sayInEnglish('cardAsk.admit.unproved', { handle: String(press?.name), card: 'worker' }))
    expect(said, 'the sentence of a join that proved nobody draws the handle').not.toContain('rq-joiner-3')
    expect(said).not.toMatch(/\byour\b/i)
  })

  it('is refused to a secretary the person did not raise, and to an agent that is not a secretary', async () => {
    const request = await aRequestToThem('rq-asker-5')
    for (const [who, headers] of [
      ['a secretary the person did not raise', asAgent(OTHER_SECRETARY, otherSecretaryRun)],
      ['an agent that is not a secretary', asAgent(BYSTANDER)],
    ] as const) {
      const answered = await ask('POST', `/api/roles/requests/${request}/grant`, headers, {})
      expect(answered.status, `${who}: ${answered.said}`).toBe(403)
      expect(t.api.getRecord(request)?.data['answer'], who).toBeUndefined()
    }
  })
})
