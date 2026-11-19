// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERIOD'S PAGE LISTS WHAT WAS DONE UNDER IT, AND ITS END UNDOES NOTHING. Criterion P19.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MISSING
 * ---------------------------------------------------------------------------------------
 *
 * The stamp was already written. `elevationWritten` in src/server/lib/records.ts puts the grant on
 * the change row and on the revision of the write it allowed, and only on that write. Nothing read
 * those rows BACK by period: there was no reader and no page, so the grant was one line — "Acting
 * for <name> until …" — and not one act it had allowed.
 *
 * So this file holds two things. The reader answers which acts were made under one grant, from the
 * ledger rows that name it. And ending a period changes none of it: the acts stand, the revisions
 * still say which period made them, and the person can still take one act back without touching the
 * other. Criterion P20, the sentence the page must carry, is its own file and its own commit.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE IS A SECTION ON A PAGE THAT EXISTS, NOT A NEW ADDRESS
 * ---------------------------------------------------------------------------------------
 *
 * The criterion says "the period's page" and no such page existed. A section on the secretary's own
 * profile was chosen over a new address in the Route union, because the period is granted and shown
 * there already and because a new address would be one more the review tool has to be taught to
 * reach (it already refuses to run over #/incident, problem bfvKtNhVC4L5). The section shows the
 * held grant while one holds and the last grant the owner made and ended afterwards, so the acts survive
 * the end.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS THAT TURN THIS FILE RED, each after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   · make `actsUnderThePeriod` return an empty list → the reply case and the drawn-list case go
 *     red; the acts are still stamped, they are simply not read.
 *   · drop the link half of `actsUnderThePeriod`, so it reads only revisions → the link-act case
 *     goes red; a fork settled under a period writes no revision.
 *   · drop `<TheActsOfThisPeriod … />` from TheirCard.tsx → the drawn case goes red.
 *   · build the period only while a grant still holds → the after-the-end case goes red, which is
 *     the clause that matters most: an act that disappears when the period ends.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROFILE_WORDS } from '../src/shared/profile.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** Press the period open. Returns the grant's id. The one secretary is registered in `beforeAll`. */
async function aSecretaryActingForTheOwner(): Promise<string> {
  const done = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
  expect(done.status, done.said).toBe(201)
  return String((done.body['elevation'] as { id: string }).id)
}

/** The person's own act, done by the secretary under the open period. Returns the decision's id. */
async function aDecisionUnderThePeriod(title: string): Promise<string> {
  const done = await ask('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    ...FOR_THE_PERSON,
    kind: 'decision',
    title,
    data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'Because they said so.' },
  })
  expect(done.status, done.said).toBe(201)
  return String((done.body['record'] as { id: string }).id)
}

/** The profile reply, exactly as the page receives it. */
async function profileOf(handle: string): Promise<Record<string, unknown>> {
  const reply = await ask('GET', `/api/participants/agent/${handle}/profile`, AS_THE_PERSON)
  expect(reply.status, reply.said).toBe(200)
  return reply.body
}

/** The period as the reply carries it: the grant, whether it holds, and the acts under it. */
interface ThePeriodRead {
  grant: { id: string }
  holds: boolean
  acts: {
    recordId: string
    title: string
    kind: string
    op: string
    what: string
    seq: number | null
    actorId: string
    at: string
  }[]
}

function thePeriodIn(said: Record<string, unknown>): ThePeriodRead {
  const held = said['theCardTheyHold'] as { elevation: { period: unknown } | null } | null
  const period = held?.elevation?.period
  expect(period, 'the profile reply carries no period').toBeTruthy()
  return period as ThePeriodRead
}

/** The profile page's own half, drawn with what the server actually said. */
function drawnProfile(said: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
}

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // ONE SECRETARY FOR THE FILE. Asking twice answers the registration it has, so the cases only
  // press a new period; registering it once keeps that answer out of every case.
  const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, {
    handle: THE_TEST_OFFICES_SECRETARY.handle,
    name: THE_TEST_OFFICES_SECRETARY.name,
    role: 'secretary',
  })
  expect(made.status, made.said).toBe(201)
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

// THE GRANT IS THE ONE THING SHARED BETWEEN CASES. Each case presses its own period, and ending it
// here leaves the office as the case found it. A case that ended it itself is answered "nothing to
// end", which is the same state.
afterEach(async () => {
  await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)
})

describe('the reply lists the acts made under the period, by the grant’s id', () => {
  it('answers the grant, that it holds, and the acts the ledger stamped with it', async () => {
    const grant = await aSecretaryActingForTheOwner()
    const first = await aDecisionUnderThePeriod('The first decision under the period')
    const second = await aDecisionUnderThePeriod('The second decision under the period')

    // THE STAMP THE READER DEPENDS ON, asserted first as the control. Both ledger rows name the
    // grant; without this the reader would have nothing to find.
    const change = t.client.sqlite
      .prepare('SELECT elevation FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(first) as { elevation?: unknown } | undefined
    expect(String(change?.elevation), 'the change row does not name the period').toContain(grant)
    const revision = t.client.sqlite
      .prepare('SELECT elevation, seq FROM revisions WHERE record_id = ? ORDER BY seq ASC LIMIT 1')
      .get(first) as { elevation?: unknown; seq?: number } | undefined
    expect(String(revision?.elevation), 'the revision does not name the period').toContain(grant)

    const period = thePeriodIn(await profileOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(period.grant.id).toBe(grant)
    expect(period.holds, 'the period is open and the reply says it has ended').toBe(true)
    const listed = period.acts.filter((one) => one.recordId === first || one.recordId === second)
    expect(listed.map((one) => one.recordId).sort()).toEqual([first, second].sort())
    const one = listed.find((row) => row.recordId === first)
    expect(one?.op).toBe('create')
    expect(one?.what).toBe('filed it')
    expect(one?.seq).toBe(Number(revision?.seq))
    expect(one?.kind).toBe('decision')
    expect(one?.actorId).toBe(THE_TEST_OFFICES_SECRETARY.handle)
  })

  it('lists a link act too, because a settling link writes no revision', async () => {
    const grant = await aSecretaryActingForTheOwner()

    // A fork the person reserved, filed by the person. Promoting it under the period files a
    // DECISION and a settling LINK: the decision writes a revision, the link writes only a change
    // row. Both must appear, or every fork settled under a period would be off the list.
    const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'proposal',
      title: 'A fork they reserved',
      data: { question: 'Which?', options: ['One', 'Two'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
    })
    expect(filed.status, filed.said).toBe(201)
    const fork = String((filed.body['record'] as { id: string }).id)
    const promoted = await ask('POST', `/api/records/${fork}/promote`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      ...FOR_THE_PERSON,
      title: 'The decision the period filed',
      data: { decided_by: 'the owner', authority: 'the owner said so', because: 'One of them.' },
    })
    expect(promoted.status, promoted.said).toBe(201)
    const decision = String((promoted.body['decision'] as { id: string }).id)

    // THE LINK'S CHANGE ROW NAMES THE PERIOD, which is the row this reader reads for a link act.
    const linkChange = t.client.sqlite
      .prepare("SELECT elevation FROM changes WHERE record_id = ? AND op = 'link' ORDER BY rowid DESC LIMIT 1")
      .get(decision) as { elevation?: unknown } | undefined
    expect(String(linkChange?.elevation), 'the settling link does not name the period').toContain(grant)

    const period = thePeriodIn(await profileOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(period.acts.some((a) => a.recordId === decision && a.op === 'create')).toBe(true)
    const link = period.acts.find((a) => a.recordId === decision && a.op === 'link')
    expect(link, 'the link act made under the period is not listed').toBeTruthy()
    expect(link?.what).toBe('linked it')
    expect(link?.seq, 'a link act carries no revision to undo').toBeNull()
  })
})

describe('the page draws the list and the sentence it cannot prove', () => {
  it('draws the acts under the period and the P16 sentence, from the exported constant', async () => {
    await aSecretaryActingForTheOwner()
    await aDecisionUnderThePeriod('A decision the period allowed')

    const html = drawnProfile(await profileOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(html, 'the heading over the acts').toContain(PROFILE_WORDS.periodActs)
    expect(html, 'the act the period allowed').toContain('A decision the period allowed')
    expect(html, 'what that act was, in the ledger’s own word').toContain('filed it')
  })
})

describe('ending the period leaves the acts standing and still revocable one at a time', () => {
  it('keeps every act and its stamp, and lets the person take one back without touching the other', async () => {
    const grant = await aSecretaryActingForTheOwner()
    const first = await aDecisionUnderThePeriod('The decision that will be taken back')
    const second = await aDecisionUnderThePeriod('The decision that will stand')

    const ended = await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)
    expect(ended.status, ended.said).toBe(200)

    // THE ACTS ARE STILL LISTED, under the same grant, now that it has ended.
    const period = thePeriodIn(await profileOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(period.grant.id).toBe(grant)
    expect(period.holds, 'the reply still says the ended period holds').toBe(false)
    const listed = period.acts.filter((one) => one.recordId === first || one.recordId === second)
    expect(listed.map((one) => one.recordId).sort()).toEqual([first, second].sort())

    // AND THE LEDGER IS NOT REWRITTEN. The revision that made the first act still names the grant.
    const revision = t.client.sqlite
      .prepare('SELECT elevation FROM revisions WHERE record_id = ? AND seq = 1')
      .get(first) as { elevation?: unknown } | undefined
    expect(String(revision?.elevation), 'ending the period rewrote the act it allowed').toContain(grant)

    // AND BOTH ACTS STAND.
    for (const id of [first, second]) {
      const read = await ask('GET', `/api/records/${id}`, AS_THE_PERSON)
      expect(read.status, read.said).toBe(200)
      expect((read.body['record'] as { deletedAt?: unknown }).deletedAt ?? null).toBeNull()
    }

    // ONE ACT BACK, AND ONLY THAT ONE. The person deletes the first decision; the second is
    // untouched. This is the clause that matters most: a period ending must not undo the work, and
    // an act must still be revocable on its own.
    const taken = await ask('DELETE', `/api/records/${first}`, AS_THE_PERSON)
    expect(taken.status, taken.said).toBe(200)
    const firstAgain = await ask('GET', `/api/records/${first}`, AS_THE_PERSON)
    expect((firstAgain.body['record'] as { deletedAt?: unknown }).deletedAt, 'the act was not taken back').toBeTruthy()
    const secondAgain = await ask('GET', `/api/records/${second}`, AS_THE_PERSON)
    expect(secondAgain.status, secondAgain.said).toBe(200)
    expect(
      (secondAgain.body['record'] as { deletedAt?: unknown }).deletedAt,
      'taking back one act took the other with it',
    ).toBeNull()
  })
})
