// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR DOORS AN ADVERSARY WALKED THROUGH ON 27 AUGUST 2026, AND WHAT NOW STANDS IN EACH.
 *
 * The whole run is `design/round-eleven/wave-b/attack.md`. It was made over real HTTP against the
 * running server, with `GET /api/needs-you` counted immediately before and after every request. The
 * three guards commit 4941899 built held on the fork they were written for. These four doors were
 * beside them, and none of them was guarded.
 *
 * ---------------------------------------------------------------------------------------
 * 1. THE DELETE ASKED FEWER QUESTIONS THAN THE KIND CHANGE BUILT TO MATCH IT
 * ---------------------------------------------------------------------------------------
 *
 *     POST   /api/records/uBpy7J0RQixp/promote          the owner     201   queue 29 -> 28
 *     PATCH  /api/records/uBpy7J0RQixp {"kind":"note"}  agent         403
 *     DELETE /api/records/uBpy7J0RQixp                  agent         200
 *
 * `assertMayRemoveAFork` returned early on `proposalResolution(...).resolved` and asked nothing
 * else. So a fork the owner had settled one request earlier was deleted by an agent, and the pair
 * left every fork reading in Mole Office.
 *
 * ---------------------------------------------------------------------------------------
 * 2. AN AGENT WROTE ITS OWN PERMISSION, USED IT, AND REMOVED THE EVIDENCE
 * ---------------------------------------------------------------------------------------
 *
 *     PATCH  /api/records/80O122UfLuCv {"dataPatch":{"who_settles_it":"an agent"}}  200  27 -> 26
 *     POST   /api/links <its own decision> --derived_from--> 80O122UfLuCv           201
 *     DELETE /api/records/80O122UfLuCv                                              200
 *
 * Every step was allowed on purpose. Together they mean an agent classifies one of the owner's
 * unclassified forks as its own and then closes it.
 *
 * ---------------------------------------------------------------------------------------
 * 3. `DELETE /api/links/:id` ASKED NO FORK QUESTION AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Three of the owner's own governance acts undone by an agent in three requests, and the owner's queue went
 * from 24 to 27.
 *
 * ---------------------------------------------------------------------------------------
 * 4. A REFUSAL THAT SAID SOMETHING UNTRUE
 * ---------------------------------------------------------------------------------------
 *
 * `assertMayRemoveAFork` told a caller a fork was "still open, still in GET /api/needs-you, and
 * still the person's to answer" about a fork that had already been superseded and was marked
 * "an agent". Both halves were false.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EVERY TEST BELOW CHECKS BESIDES THE STATUS CODE
 * ---------------------------------------------------------------------------------------
 *
 * That the record is where it was afterwards. A 403 with the write already made is the defect this
 * repository was built to catch, so every refusal here is followed by a read.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_OWNER, type ForkSettler } from '../src/shared/kinds.ts'
import type { ForksReply } from '../src/server/api/forks.ts'
import type { NeedsYouReply } from '../src/server/api/needs-you.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'panelx'

const asAgent: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const asPerson: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}
/** A request that names nobody. Owner decision §36: that is not evidence a person made it. */
const namingNobody: Record<string, string> = { 'x-mole-office-workspace': PROJECT }

// ONE OFFICE FOR THE FILE. The workspace is made once; every case files its own forks, decisions and
// links, and the one case that compares the owner's queue compares it before and after its own work.
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** A fork, filed by an agent. `undefined` is the fifth answer: nobody has said. */
/**
 * A fork the PERSON filed, with whatever they said about who settles it.
 *
 * FILED BY THE OWNER SINCE 3 SEPTEMBER 2026. Two things changed that day, both by the rule that
 * an engineering question is the agent's (`design/messages/ACCEPTANCE.md` W3): a fork an AGENT files
 * says `who_settles_it: "an agent"` unless the agent names something else, and an agent may correct
 * a classification IT wrote. Every fixture below is about a fork on THE OWNER'S queue, so filing it under
 * the owner's name is what it was always meant to be — an agent-filed fixture was giving the guard the
 * agent's own sentence to defend, which is a different question. Nothing else about these tests
 * moved.
 */
async function fileFork(settles: ForkSettler | undefined, what = 'the handover'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: {
      kind: 'proposal',
      title: `Position or force control for ${what}? (${settles ?? 'unclassified'})`,
      data: {
        question: `Position control or force control for ${what}?`,
        options: ['a — position control', 'b — force control'],
        ...(settles === undefined ? {} : { who_settles_it: settles }),
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function fileRecord(
  kind: string,
  title: string,
  data: Record<string, unknown>,
  headers: Record<string, string> = asAgent,
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

interface Answer {
  statusCode: number
  body: string
  message: string
}

function readAnswer(res: { statusCode: number; body: string; json: () => unknown }): Answer {
  let message = ''
  try {
    const parsed = res.json() as { error?: string; message?: string; detail?: string }
    message = `${parsed.message ?? ''} ${parsed.error ?? ''} ${parsed.detail ?? ''}`
  } catch {
    message = res.body
  }
  return { statusCode: res.statusCode, body: res.body, message }
}

async function link(
  fromId: string,
  type: string,
  toId: string,
  headers: Record<string, string> = asAgent,
): Promise<Answer & { id: string | null }> {
  const res = await app.inject({ method: 'POST', url: '/api/links', headers, payload: { fromId, toId, type } })
  const answer = readAnswer(res)
  let id: string | null = null
  if (res.statusCode === 201) id = (res.json() as { id?: string; link?: { id: string } }).id ?? null
  return { ...answer, id }
}

async function unlink(id: string, headers: Record<string, string> = asAgent): Promise<Answer> {
  return readAnswer(await app.inject({ method: 'DELETE', url: `/api/links/${id}`, headers }))
}

async function remove(id: string, headers: Record<string, string> = asAgent): Promise<Answer> {
  return readAnswer(await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers }))
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = asAgent,
): Promise<Answer> {
  return readAnswer(await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload }))
}

/** Every link on a record, so a link made in one step can be found by type in the next. */
async function linkIdOf(recordId: string, type: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  const links = (res.json() as { links: { linkId: string; type: string }[] }).links
  const found = links.find((one) => one.type === type)
  expect(found, `no ${type} link on ${recordId}`).toBeDefined()
  return (found as { linkId: string }).linkId
}

async function isLive(id: string): Promise<boolean> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { record: { deletedAt: string | null } }).record.deletedAt === null
}

/** The fork reading, whole, so a fork that is in NO list can be told from one that is open. */
async function forks(): Promise<ForksReply> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ForksReply
}

/** How many things are waiting on the person. The count the attack run took before and after. */
async function queue(): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/needs-you', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as NeedsYouReply).actions.map((one) => one.recordId)
}

/** A decision the OWNER wrote, with everything the write door asks of one. */
async function ownersDecision(title: string): Promise<string> {
  return fileRecord(
    'decision',
    title,
    {
      replaces: [],
      because: 'They said so on the call.',
      authority: 'the owner said so',
      authority_reference: 'the call on 20 August',
      decided_by: THE_OWNER,
    },
    asPerson,
  )
}

/** A decision an AGENT wrote, carrying an authority, which is what lets an agent close a fork. */
async function agentsDecision(title: string): Promise<string> {
  return fileRecord('decision', title, {
    replaces: [],
    because: 'The bench run timed out at 200ms.',
    authority: 'a measurement',
    decided_by: 'claude-code',
  })
}

// ============================================================ 1. THE OWNER'S SETTLED FORK IS STILL THE OWNER'S

describe('a fork the owner settled', () => {
  it('may not be deleted by an agent, which is the request the adversary got a 200 for', async () => {
    const fork = await fileFork(THE_OWNER)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)

    // IT REALLY IS SETTLED, so this test is about a settled fork and not about a failed settle.
    expect((await forks()).settled.map((one) => one.proposalId)).toContain(fork)

    const refused = await remove(fork)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(await isLive(fork)).toBe(true)

    // AND THE PAIR IS STILL READABLE, which is what the delete took away.
    expect((await forks()).settled.map((one) => one.proposalId)).toContain(fork)
  })

  it('may not be changed into a note by an agent either, so the two doors answer the same', async () => {
    const fork = await fileFork(THE_OWNER)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)

    const refused = await patch(fork, { kind: 'note' })
    expect(refused.statusCode, refused.message).toBe(403)
    expect((await forks()).settled.map((one) => one.proposalId)).toContain(fork)
  })

  it('is still the owner’s to delete, so this is a guard and not a lock', async () => {
    const fork = await fileFork(THE_OWNER)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)

    const made = await remove(fork, asPerson)
    expect(made.statusCode, made.message).toBe(200)
    expect(await isLive(fork)).toBe(false)
  })

  it('is refused to a request that names nobody', async () => {
    // OWNER DECISION §36: an absent header is not evidence that a person made the write. The name
    // clause beside it is not asserted here, because `isSomebodyMoleOfficeCannotPlace` reads which door
    // the request arrived at and an injected request arrived at none. It is covered over real HTTP
    // in `design/round-eleven/wave-b/four-doors.md`.
    const fork = await fileFork(THE_OWNER)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)

    expect((await remove(fork, namingNobody)).statusCode).toBe(403)
    expect(await isLive(fork)).toBe(true)
  })
})

describe('a fork nobody has classified, after it has been answered', () => {
  it('may not be deleted by an agent, because nobody-has-said is the owner’s', async () => {
    const fork = await fileFork(undefined)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)

    const refused = await remove(fork)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(await isLive(fork)).toBe(true)
  })
})

describe('a fork the corpus says is an agent’s, filed that way and answered', () => {
  it('is still deletable by an agent, so the guard did not become a lock', async () => {
    // NOTHING IS TAKEN OFF THE OWNER. The fork said "an agent" from the moment it was filed, so it was
    // never in the owner's queue unclassified, and it has been answered, so nobody is waiting on it.
    const fork = await fileFork('an agent')
    const decision = await agentsDecision('The handover uses force control')
    expect((await link(decision, 'derived_from', fork)).statusCode).toBe(201)

    const made = await remove(fork)
    expect(made.statusCode, made.message).toBe(200)
    expect(await isLive(fork)).toBe(false)
  })

  it('answers the kind change the same way it answers the delete', async () => {
    // TWO DOORS ONTO ONE ACT, ASSERTED TO AGREE. `assertMayRemoveAFork` and
    // `assertMayReclassifyAFork` are both asked on a kind change, and a rule that fired in one and
    // not the other would refuse the change while allowing the delete beside it. That is this
    // repository's named recurring defect, and it is what door 1 was.
    const fork = await fileFork('an agent')
    const decision = await agentsDecision('The handover uses force control')
    expect((await link(decision, 'derived_from', fork)).statusCode).toBe(201)

    const made = await patch(fork, { kind: 'note' })
    expect(made.statusCode, made.message).toBe(200)
  })

  it('is NOT deletable by an agent while it is still unanswered', async () => {
    // THE HALF THAT DID NOT CHANGE, asserted so that widening it would fail here.
    const fork = await fileFork('an agent')
    const refused = await remove(fork)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(await isLive(fork)).toBe(true)
  })
})

// ============================================================ 2. THE ELEVENTH WAY

describe('an agent classifying one of the owner’s unclassified forks as its own', () => {
  it('is still allowed, because that is how the queue gets sorted', async () => {
    const fork = await fileFork(undefined)
    const done = await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })
    expect(done.statusCode, done.message).toBe(200)
  })

  it('does not let that agent then settle it', async () => {
    const fork = await fileFork(undefined)
    expect((await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })).statusCode).toBe(200)
    const decision = await agentsDecision('The handover uses force control')

    const refused = await link(decision, 'derived_from', fork)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('an agent wrote that onto the fork AFTER it was filed')
    expect(await queue()).toContain(fork)
  })

  it('does not let that agent supersede it or call it a duplicate either', async () => {
    const fork = await fileFork(undefined)
    expect((await patch(fork, { dataPatch: { who_settles_it: 'a measurement' } })).statusCode).toBe(200)
    const note = await fileRecord('note', 'The bench measurement that answers it', { body: '500ms.' })
    const other = await fileFork(undefined, 'the second arm')

    expect((await link(note, 'supersedes', fork)).statusCode).toBe(403)
    expect((await link(fork, 'duplicate_of', other)).statusCode).toBe(403)
    expect(await queue()).toContain(fork)
  })

  it('does not let that agent delete it or change its kind', async () => {
    const fork = await fileFork(undefined)
    expect((await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })).statusCode).toBe(200)

    expect((await remove(fork)).statusCode).toBe(403)
    expect((await patch(fork, { kind: 'note' })).statusCode).toBe(403)
    expect(await isLive(fork)).toBe(true)
    expect(await queue()).toContain(fork)
  })

  it('the whole three-request sequence leaves the fork exactly where it was', async () => {
    // THE ATTACK AS IT WAS RUN, end to end, with the queue counted before and after.
    const fork = await fileFork(undefined)
    const before = await queue()
    expect(before).toContain(fork)

    expect((await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })).statusCode).toBe(200)
    const decision = await agentsDecision('The handover uses force control')
    expect((await link(decision, 'derived_from', fork)).statusCode).toBe(403)
    expect((await remove(fork)).statusCode).toBe(403)

    expect(await queue()).toEqual(before)
    const read = await forks()
    expect(read.forks.map((one) => one.recordId)).toContain(fork)
    expect(read.settled.map((one) => one.proposalId)).not.toContain(fork)
    expect(read.leftTheQueue.map((one) => one.proposalId)).not.toContain(fork)
  })

  it('does not stop the PERSON classifying it and an agent settling it afterwards', async () => {
    // A CLASSIFICATION THE OWNER WROTE IS AUTHORITY, and this is the difference the rule turns on.
    const fork = await fileFork(undefined)
    expect((await patch(fork, { dataPatch: { who_settles_it: 'an agent' } }, asPerson)).statusCode).toBe(200)
    const decision = await agentsDecision('The handover uses force control')

    const made = await link(decision, 'derived_from', fork)
    expect(made.statusCode, made.message).toBe(201)
    expect(await queue()).not.toContain(fork)
  })

  it('does not stop an agent handing a fork TO the owner', async () => {
    const fork = await fileFork(undefined)
    const done = await patch(fork, { dataPatch: { who_settles_it: THE_OWNER } })
    expect(done.statusCode, done.message).toBe(200)
  })
})

// ============================================================ 3. THE LINK DELETE

describe('removing the link that took a fork off the owner’s queue', () => {
  it('is refused to an agent on the link the owner’s own decision settled a fork with', async () => {
    const fork = await fileFork(THE_OWNER)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)
    const linkId = await linkIdOf(decision, 'derived_from')

    const refused = await unlink(linkId)
    expect(refused.statusCode, refused.message).toBe(403)
    expect((await forks()).settled.map((one) => one.proposalId)).toContain(fork)
    expect(await queue()).not.toContain(fork)
  })

  it('is refused to an agent on a `supersedes` the person made', async () => {
    const fork = await fileFork(THE_OWNER)
    const note = await fileRecord('note', 'What replaced the handover question', { body: 'The rig changed.' })
    expect((await link(note, 'supersedes', fork, asPerson)).statusCode).toBe(201)
    const linkId = await linkIdOf(note, 'supersedes')

    const refused = await unlink(linkId)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(await queue()).not.toContain(fork)
  })

  it('is refused to an agent on a `duplicate_of` the person made', async () => {
    const fork = await fileFork(THE_OWNER)
    const other = await fileFork(THE_OWNER, 'the second arm')
    expect((await link(fork, 'duplicate_of', other, asPerson)).statusCode).toBe(201)
    const linkId = await linkIdOf(fork, 'duplicate_of')

    const refused = await unlink(linkId)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(await queue()).not.toContain(fork)
  })

  it('is refused to an agent even on a fork the corpus says is not the owner’s, when the PERSON made the link', async () => {
    // THE HALF THE CLASSIFICATION DOES NOT COVER. The owner settled a fork marked "an agent" during the
    // attack run; without this clause an agent could take that settlement apart.
    const fork = await fileFork('an agent')
    const decision = await ownersDecision('Force control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)
    const linkId = await linkIdOf(decision, 'derived_from')

    const refused = await unlink(linkId)
    expect(refused.statusCode, refused.message).toBe(403)
    expect((await forks()).settled.map((one) => one.proposalId)).toContain(fork)
  })

  it('is the person’s to do, so this is a guard and not a lock', async () => {
    const fork = await fileFork(THE_OWNER)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)
    const linkId = await linkIdOf(decision, 'derived_from')

    const made = await unlink(linkId, asPerson)
    expect(made.statusCode, made.message).toBe(200)
    expect(await queue()).toContain(fork)
  })

  it('still lets an agent remove its own exit link from a fork that is not the owner’s', async () => {
    // AN AGENT TIDYING UP AFTER ITSELF, and the direction is putting a question BACK.
    const fork = await fileFork('an agent')
    const decision = await agentsDecision('The handover uses force control')
    expect((await link(decision, 'derived_from', fork)).statusCode).toBe(201)
    const linkId = await linkIdOf(decision, 'derived_from')

    const made = await unlink(linkId)
    expect(made.statusCode, made.message).toBe(200)
  })

  it('leaves an ordinary link alone, because removing one takes nothing off anybody', async () => {
    const fork = await fileFork(THE_OWNER)
    const note = await fileRecord('note', 'What the bench says about the handover', { body: '500ms.' })
    expect((await link(note, 'relates_to', fork)).statusCode).toBe(201)
    const linkId = await linkIdOf(note, 'relates_to')

    const made = await unlink(linkId)
    expect(made.statusCode, made.message).toBe(200)
  })

})

// ============================================================ 4. THE REFUSAL TELLS THE TRUTH

describe('the refusal on a fork that is not open', () => {
  it('does not call a superseded fork open, or call one marked “an agent” the owner’s to answer', async () => {
    // THE EXACT SENTENCE THAT WAS FALSE, on the exact shape of fork it was false about. The fork
    // says "an agent" — filed that way — and something has replaced it.
    const fork = await fileFork('an agent')
    const note = await fileRecord('note', 'What replaced the handover question', { body: 'The rig changed.' })
    expect((await link(note, 'supersedes', fork)).statusCode).toBe(201)
    expect(await queue()).not.toContain(fork)

    const refused = await patch(fork, { kind: 'note' })
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message, 'the refusal calls a fork that has left the queue open').not.toContain('still open')
    expect(
      refused.message,
      'the refusal says a fork marked "an agent" is the person’s to answer',
    ).not.toContain("still the person's to answer")
    expect(refused.message).toContain('already out of GET /api/needs-you')
    expect(refused.message).toContain('What replaced the handover question')
    expect(refused.message).toContain('"an agent" settles it')
  })

  it('says a settled fork is settled rather than saying it is open', async () => {
    const fork = await fileFork(THE_OWNER)
    const decision = await ownersDecision('Position control for the handover')
    expect((await link(decision, 'derived_from', fork, asPerson)).statusCode).toBe(201)

    const refused = await remove(fork)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('already settled')
    expect(refused.message, 'the refusal calls a settled fork open').not.toContain('still open')
    expect(refused.message).toContain('nobody is waiting on any more')
  })

  it('still says a fork that IS open is open, and still names the queue', async () => {
    // THE CONTROL FOR THE THREE ABOVE. A test that only checks for absent sentences would pass on a
    // refusal that said nothing at all.
    const fork = await fileFork(THE_OWNER)
    const refused = await remove(fork)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('still open and still in GET /api/needs-you')
    expect(refused.message).toContain(`"${THE_OWNER}" settles it`)
    expect(refused.message).toContain('unsettled proposal')
  })

  it('says a fork an agent classified is still read as the owner’s, and why', async () => {
    const fork = await fileFork(undefined)
    expect((await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })).statusCode).toBe(200)

    const refused = await remove(fork)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('an agent wrote that onto a fork that was filed without it')
  })
})

// ============================================================ 5. A CLASSIFICATION IS DURABLE

describe('taking a classification off a fork', () => {
  it('is refused to an agent, on a fork the corpus says is an agent’s', async () => {
    // THE DIRECTION IS SAFE — it puts the fork BACK in the owner's queue — and it is refused for what it
    // makes possible next: a field that can be emptied can be written again from scratch, and that
    // is how an agent re-arms an exit link the archive already holds.
    const fork = await fileFork('an agent')
    const refused = await patch(fork, {
      data: { question: 'Position control or force control for the handover?', options: ['a', 'b'] },
    })
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('leaving the fork saying nothing about who settles it')

    const read = await app.inject({ method: 'GET', url: `/api/records/${fork}`, headers: asAgent })
    expect((read.json() as { record: { data: Record<string, unknown> } }).record.data['who_settles_it']).toBe(
      'an agent',
    )
  })

  it('is refused on a fork marked “the owner” too, which it always was', async () => {
    const fork = await fileFork(THE_OWNER)
    const refused = await patch(fork, {
      data: { question: 'Position control or force control for the handover?', options: ['a', 'b'] },
    })
    expect(refused.statusCode, refused.message).toBe(403)
  })

  it('is the person’s to do', async () => {
    const fork = await fileFork('an agent')
    // `replace: true` because emptying the field is the whole of what this test asks for, and a
    // wholesale `data` has to say that it means it. The guard being tested is the one about WHO may
    // do it, and the person may.
    const made = await patch(
      fork,
      {
        data: { question: 'Position control or force control for the handover?', options: ['a', 'b'] },
        replace: true,
      },
      asPerson,
    )
    expect(made.statusCode, made.message).toBe(200)
  })

  it('does not stop an agent sending the whole record back with the field on it', async () => {
    // THE GUARD FIRES ON THE FIELD GOING AWAY, NOT ON THE KEY BEING PRESENT. A rule written the
    // other way would make these forks uneditable by the agents that file them.
    const fork = await fileFork('an agent')
    const made = await patch(fork, {
      data: {
        question: 'Position control or force control for the handover?',
        options: ['a — position control', 'b — force control'],
        who_settles_it: 'a measurement',
      },
    })
    expect(made.statusCode, made.message).toBe(200)
  })
})
