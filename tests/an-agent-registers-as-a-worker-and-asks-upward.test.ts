// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT REGISTERS AS A WORKER AND ASKS ITS STARTER FOR A HIGHER RUNG — CRITERION P65.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * An agent registers as a worker by default, and may ask upward for a higher role. It asks whoever started
 * it: a worker that finds its module needs more workers asks its supervisor to be made a supervisor,
 * and is raised if the supervisor agrees.
 *
 * Two things, and neither existed. `role` was required at registration, so a starter that had not
 * decided had to decide anyway. And there was no way up at all: an agent that needed a higher rung
 * could only have its record patched by hand, by anybody.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, BOTH DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 *   · a registration naming no card is accepted, writes no card, and the row reads as the worker
 *     card — with the reply saying nobody chose it, so no screen draws that word as a choice;
 *   · the ask files a record AND sends the starter a message carrying it. A record nobody was told
 *     about is a request nobody was asked;
 *   · who answers is the registry's answer: the agent that started the asker. Somebody else pressing
 *     is refused and nothing is written;
 *   · a grant raises the rung, and only within the starter's own rung — a supervisor cannot grant
 *     the secretary card it could not register anybody with;
 *   · a refusal leaves the rung alone and is still recorded, with who refused it and when;
 *   · an answered request is answered: a second press is refused with what the first one said.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `role: z.string()` back on `aStartedAgent` → the registration cases go red.
 *   drop the `createRecord({ kind: 'message' … })` from POST /api/roles/requests → the message case
 *     goes red.
 *   drop the `whyThisRoleMayNotBeGiven` call from the grant → the case that says a supervisor cannot
 *     grant the secretary card goes red.
 *   let anybody press: delete the `itsAnswerer` clause → the refusal-of-a-stranger case goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, NO_ROLE_SET } from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function register(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ code: number; said: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return {
    code: reply.statusCode,
    said: reply.body,
    json: reply.statusCode < 400 ? (reply.json() as Record<string, unknown>) : {},
  }
}

async function ask(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ code: number; said: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/roles/requests', headers, payload: body })
  return {
    code: reply.statusCode,
    said: reply.body,
    json: reply.statusCode < 400 ? (reply.json() as Record<string, unknown>) : {},
  }
}

async function press(
  headers: Record<string, string>,
  id: string,
  answer: 'grant' | 'refuse',
  says?: string,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/roles/requests/${id}/${answer}`,
    headers,
    payload: says === undefined ? {} : { says },
  })
  return { code: reply.statusCode, said: reply.body }
}

async function theRow(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { participant: Record<string, unknown> }).participant
}

async function theRecord(id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { record?: Record<string, unknown> }
  return (said.record ?? (said as Record<string, unknown>)) as Record<string, unknown>
}

/**
 * ONE OFFICE FOR THE FILE, and a project of its own for each case. An agent's handle belongs to a
 * project, and a grant changes the agent's rung, so a case's own project keeps its registry and its
 * requests to itself while the same made-up handles can be registered in each case.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

afterEach(() => {
  // A HANDLE IS OFFICE-WIDE, AND A SECOND REGISTRATION JOINS THE ROW IT FINDS AND CHANGES NOTHING ON
  // IT. So an agent a case raised is put back to the worker card the file began it as, or the next
  // case that registers the same made-up handle would join a supervisor.
  const held = t.client.sqlite
    .prepare("SELECT id FROM agents WHERE retired = 0 AND handle NOT IN ('mole-office', 'sup-one', 'sup-two', ?)")
    .all(THE_TEST_OFFICES_SECRETARY.handle) as { id: string }[]
  for (const { id } of held) {
    // THE RECORD AND THE ROW TOGETHER: the registry copies the record's card onto the row, so a row
    // put back alone would disagree with the record the next grant reads.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.role', ?, '$.cardChosenBy', json(?)) WHERE id IN (SELECT record_id FROM agent_records WHERE agent_id = ?)")
      .run(A_ROW_WITH_NO_ROLE_READS_AS, JSON.stringify({ how: 'the-rule' }), id)
    t.client.sqlite
      .prepare('UPDATE agents SET role = ?, card_chosen_by = ? WHERE id = ?')
      .run(A_ROW_WITH_NO_ROLE_READS_AS, JSON.stringify({ how: 'the-rule', who: null }), id)
  }
})

beforeEach(async () => {
  caseNumber += 1
  const project = `default-case-${String(caseNumber)}`
  AS_THE_PERSON['x-mole-office-workspace'] = project
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: project, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
  // THE OWNER'S OWN EXAMPLE: the owner starts an agent as a supervisor, and that supervisor starts a worker.
  expect((await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).code).toBe(201)
  expect((await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })).code).toBe(201)
})

// ============================================================ 1. registering with no card

describe('registering an agent without naming a card', () => {
  /**
   * WHAT THIS MEASURED UNTIL 8 SEPTEMBER 2026, AND WHY IT CHANGED.
   *
   * It measured that the row held NO card — `role` null, `roleReadAs` worker, `roleSays` "no role
   * set" — which is what criterion P65 built on the rule that a registered agent is a worker by default.
   *
   * Criterion P75 replaces that half, on the question of whether worker should be given by default. The
   * card is now WRITTEN, and a stored mark says the rule wrote it rather than a starter choosing it.
   * What P65 was protecting is unchanged and is still measured here: a default is never drawn as
   * somebody's choice. It is the mark that says so now instead of the absence.
   */
  it('is accepted, and writes the worker card on the row, marked as the rule’s', async () => {
    const said = await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One' })
    expect(said.code, said.said).toBe(201)
    const row = await theRow('w-one')
    expect(row['role'], 'the card is written rather than left absent').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
    expect(row['roleReadAs'], 'and every refusal reads it as this').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
    expect(row['cardChosenBy'], 'and nobody chose it: the rule did').toEqual({ how: 'the-rule', who: null })
  })

  it('tells the starter which card was written and that the rule chose it', async () => {
    const said = await register(asAgent('sup-one'), { handle: 'w-two', name: 'Worker Two' })
    const card = said.json['card'] as Record<string, unknown>
    expect(card['role'], 'the card that was written').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
    expect(card['chosenBy']).toEqual({ how: 'the-rule', who: null })
    expect(String(card['says']), 'and the way up is named').toContain('/api/roles/requests')
  })

  it('still checks a card the starter does name', async () => {
    const said = await register(asAgent('sup-one'), { handle: 'w-three', name: 'Worker Three', role: 'secretary' })
    expect(said.code).toBe(403)
    expect(said.said, 'the rule that refused').toContain('appoints')
  })
})

// ============================================================ 2. the ask

describe('an agent asking its starter for a higher rung', () => {
  beforeEach(async () => {
    expect((await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One' })).code).toBe(201)
  })

  it('files a request naming who asked and who answers, both read from the registry', async () => {
    const said = await ask(asAgent('w-one'), { asking: 'supervisor', because: 'This module needs more workers.' })
    expect(said.code, said.said).toBe(201)
    const record = await theRecord(String(said.json['request']))
    const data = record['data'] as Record<string, unknown>
    expect(record['kind']).toBe('role_request')
    // BOTH ARE STORED BY REGISTRY ID, which for an agent registered since the mint is not its handle.
    expect((data['asker'] as { id: string }).id).toBe((await theRow('w-one'))['id'])
    expect((data['answersTo'] as { id: string }).id, 'the agent that started it, from the registry').toBe(
      (await theRow('sup-one'))['id'],
    )
    expect(data['asking']).toBe('supervisor')
    expect(data['answer'], 'nobody has answered, which is absence and never a default').toBeUndefined()
  })

  it('sends the starter a message carrying the request', async () => {
    const said = await ask(asAgent('w-one'), { asking: 'supervisor' })
    const message = await theRecord(String(said.json['message']))
    const data = message['data'] as Record<string, unknown>
    expect(message['kind']).toBe('message')
    expect((data['to'] as { id: string }[])[0]?.id, 'it goes to the starter').toBe((await theRow('sup-one'))['id'])
    expect(
      ((data['target'] as { target?: { recordId?: string } } | undefined)?.target ?? {}).recordId,
      'and it carries the request itself, not a description of it',
    ).toBe(String(said.json['request']))
  })

  it('changes no rung by itself', async () => {
    await ask(asAgent('w-one'), { asking: 'supervisor' })
    expect((await theRow('w-one'))['role'], 'the press is what raises it').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
  })

  /**
   * THIS CASE ASSERTED A 409 UNTIL F15 POINT 2, AND THE CHANGE IS THE POINT OF THE CHANGE.
   *
   * It used to read: *refuses an agent whose starter is the person, and names the owner’s press instead*.
   * The door refused with 409 because a person appoints by a press rather than by answering a
   * request, and the refusal named `POST /api/roles/card/<handle>`. What that meant in practice was
   * measured on 14 September 2026 (problem pHFu8nivPZ_O): an agent started by the owner in another project's folder
   * could not turn "please give me a card" into anything the owner would ever see, so it said the sentence
   * out loud in a terminal, which is not a thing that happens.
   *
   * So the ask is now RECORDED with the owner as its answerer, and the needs-you list and the citizen's
   * page draw the press. The rung still does not move by itself — the case above this one holds
   * that — and only the owner can grant it. What changed is that the ask reaches the owner instead of dying in a
   * refusal.
   */
  it('records the ask when the starter is the person, and names the owner as the answerer', async () => {
    expect((await register(AS_THE_PERSON, { handle: 'their-own', name: 'Their Own' })).code).toBe(201)
    const said = await ask(asAgent('their-own'), { asking: 'supervisor' })
    expect(said.code, said.said).toBe(201)
    expect(said.json['request'], 'the ask is a record the owner can be shown').toBeTruthy()
    expect((said.json['answersTo'] as { kind?: string })?.kind, 'and it is the owner’s to answer').toBe('person')
    expect(String(said.json['note']), 'nothing moved on the row itself').toContain('has been asked')
    expect((await theRow('their-own'))['role'], 'the press is still what raises it').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
  })

  it('refuses a card no agent holds', async () => {
    const said = await ask(asAgent('w-one'), { asking: 'administrator' })
    expect(said.code).toBe(400)
    expect(said.said).toContain('administrator')
  })
})

// ============================================================ 3. the answer

describe('the starter answering with one press', () => {
  let request = ''

  beforeEach(async () => {
    expect((await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One' })).code).toBe(201)
    const said = await ask(asAgent('w-one'), { asking: 'supervisor', because: 'The module is large.' })
    request = String(said.json['request'])
  })

  it('raises the rung on a grant, and records who granted it', async () => {
    const said = await press(asAgent('sup-one'), request, 'grant', 'Take it.')
    expect(said.code, said.said).toBe(200)
    expect((await theRow('w-one'))['role']).toBe('supervisor')
    const data = (await theRecord(request))['data'] as Record<string, unknown>
    expect(data['answer']).toBe('granted')
    expect(data['answerSays']).toBe('Take it.')
    // WHO PRESSED IS ON THE LEDGER, which is where every write in this product is attributed. It is
    // not copied into `data`: it would usually be `answersTo` a second time.
    const reply = await app.inject({ method: 'GET', url: `/api/records/${request}/revisions`, headers: AS_THE_PERSON })
    const revisions = (reply.json() as { revisions: { who: { actorId: string } }[] }).revisions
    expect(revisions[0]?.who.actorId, 'the newest revision is the press').toBe('sup-one')
  })

  it('leaves the rung alone on a refusal, and still records it', async () => {
    const said = await press(asAgent('sup-one'), request, 'refuse', 'Not for this module.')
    expect(said.code, said.said).toBe(200)
    expect((await theRow('w-one'))['role'], 'refused, so nothing moved').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
    const data = (await theRecord(request))['data'] as Record<string, unknown>
    expect(data['answer']).toBe('refused')
    expect(data['answerSays']).toBe('Not for this module.')
  })

  it('refuses a press from anybody but the agent the request says answers it', async () => {
    expect((await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-two', name: 'Supervisor Two', role: 'supervisor' })).code).toBe(201)
    const said = await press(asAgent('sup-two'), request, 'grant')
    expect(said.code).toBe(403)
    expect(said.said, 'the agent that does answer it').toContain('sup-one')
    expect((await theRow('w-one'))['role'], 'and nothing moved').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
  })

  it('lets the person press for any of them', async () => {
    expect((await press(AS_THE_PERSON, request, 'grant')).code).toBe(200)
    expect((await theRow('w-one'))['role']).toBe('supervisor')
  })

  it('answers a request once, and says what the first answer was', async () => {
    expect((await press(asAgent('sup-one'), request, 'refuse')).code).toBe(200)
    const again = await press(asAgent('sup-one'), request, 'grant')
    expect(again.code).toBe(409)
    expect(again.said, 'what it was answered').toContain('refused')
    expect(again.said, 'and where to read who pressed').toContain('/revisions')
    expect((await theRow('w-one'))['role'], 'and the second press moved nothing').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
  })
})

// ============================================================ 4. a grant stays within the starter's rung

describe('a grant is within the starter’s own rung', () => {
  it('refuses a supervisor granting the secretary card, which only the person appoints', async () => {
    expect((await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One' })).code).toBe(201)
    const said = await ask(asAgent('w-one'), { asking: 'secretary' })
    expect(said.code, said.said).toBe(201)
    const answer = await press(asAgent('sup-one'), String(said.json['request']), 'grant')
    expect(answer.code).toBe(403)
    expect(answer.said, 'the same rule registration states').toContain('Only the person appoints')
    expect((await theRow('w-one'))['role'], 'and nothing moved').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
  })

  it('refuses a worker granting the supervisor card, which is above its own rung', async () => {
    expect((await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One' })).code).toBe(201)
    expect((await register(asAgent('w-one'), { handle: 'w-deep', name: 'Worker Deep' })).code).toBe(201)
    const said = await ask(asAgent('w-deep'), { asking: 'supervisor' })
    expect(said.code, said.said).toBe(201)
    const answer = await press(asAgent('w-one'), String(said.json['request']), 'grant')
    expect(answer.code).toBe(403)
    expect(answer.said).toContain('A worker may not make a supervisor')
    expect(answer.said).toContain('at or below its own rung')
    expect((await theRow('w-deep'))['role'], 'and nothing moved').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
  })
})
