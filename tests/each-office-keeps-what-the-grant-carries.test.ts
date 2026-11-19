// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH OFFICE KEEPS ITS OWN LIST OF WHAT THE PERSON'S GRANT CARRIES, AND ONLY THE PERSON CHANGES IT. Wave 13s round 2a.
 *
 * The secretary card's lists are the default. The table `what_the_grant_carries` holds this office's answer about each
 * door its person changed (src/server/lib/what-the-grant-carries.ts), and the one check, `mayPressForThePerson` in
 * src/server/lib/records.ts, reads that answer before the card's. The read and the write door are
 * src/server/api/what-the-grant-carries.ts, and a request for one press, "change-what-the-grant-carries", makes the
 * same change when the person agrees (src/server/lib/one-press.ts).
 *
 *   1. With no row the check answers as the card does for every door the card keeps. A row that says "may press" lets
 *      the grant press a door the card keeps; a row that says "kept" keeps a door the card lets it press, and the refusal
 *      says it is this office's answer. The guard every hour-writing path calls asks about committing hours by that
 *      part's own name, so a row that keeps the part keeps the hours on each door they are written through.
 *   2. Only the person changes the list. An agent with no grant, the secretary holding the grant, and the secretary
 *      agreeing to a request for the change are each refused, and nothing changes. The read gives each caller the words
 *      the write would refuse it with. The person's change is kept with who made it and when, and is written in the
 *      change log; "default" removes the row. A signing package may not carry the change.
 *   3. A row left for a door the list no longer names is shown apart and never matched. It can only be removed. A door
 *      the list never named, and a door asked about twice, are refused, and nothing is written.
 *   4. The line that tells the secretary it was raised counts the doors the grant does not press from this office's
 *      answers, and names the acts the card says no grant carries. It names three kinds of door, each with its own
 *      number, and the three numbers make the whole. A door is counted once, in the first kind that fits it: a door that
 *      does not ask the check yet, whatever its answer; a door this office keeps for the person; a door that also needs
 *      the person's words for each change.
 *
 * MUTATIONS, each after a control run, named in the report of the run that added this file: `theAnswerAboutAPress` reads
 * the card's answer only (case 1 goes red); `whyThisCallerMayNotChangeTheList` lets everybody through (case 2 goes red);
 * `thisOfficesAnswerAbout` reads a row for any name (case 3 goes red); the line counts the card's answers only (case 4
 * goes red). Count a door that does not ask yet among the kept doors when its answer is kept, and case 4 goes red.
 */
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, thePersonsKeyHeader, A_TESTS_REASON_FOR_THE_PERSON, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb
let app: FastifyInstance
let forgetTheWorldsOwnAuthority: () => void = () => undefined
/** Loaded after `freshDb()`, so these are the modules the running app reads. */
let records: typeof import('../src/server/lib/records.ts')
let theList: typeof import('../src/server/lib/what-the-grant-carries.ts')
let roles: typeof import('../src/server/lib/roles.ts')

const SECRETARY = 'list-secretary'
const WORKER = 'list-worker'
const keys = new Map<string, string>()
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

/** A door the card keeps for the person, and a door the card lets the grant press. */
const A_KEPT_DOOR = 'office.set-quick-inputs'
const A_CARRIED_DOOR = 'office.set-what-is-kept'
/** A name the list never named and that is no door of the office. */
const A_DOOR_NO_LONGER_THERE = 'office.a-door-this-office-no-longer-has'

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, said: reply.body }
}

/** The secretary as a press of one door makes it, holding the grant the person pressed in `beforeAll`. */
function theSecretaryPressing(operation: string): Actor {
  return { type: 'agent', id: SECRETARY, sessionId: null, stated: true, press: { operation, aRead: false, reason: A_TESTS_REASON_FOR_THE_PERSON } }
}

const THE_PERSON_AS_AN_ACTOR = { type: 'human', id: THE_PERSON, sessionId: null, stated: true } as Actor

function theRows(): { door: string; answer: string; updated_by_kind: string; updated_by_id: string }[] {
  return t.client.sqlite.prepare('SELECT door, answer, updated_by_kind, updated_by_id FROM what_the_grant_carries ORDER BY door').all() as {
    door: string
    answer: string
    updated_by_kind: string
    updated_by_id: string
  }[]
}

function theChangeLogRows(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id = 'setting:what-the-grant-carries'").get() as { n: number }).n
}

type ADoor = { door: string; card: string; office: { answer: string; kind: string; id: string; at: string } | null; answer: string; asksTheCheck: boolean; alsoNeedsThePersonsWords: boolean }

async function theListAs(headers: Record<string, string>): Promise<{ doors: ADoor[]; counts: Record<string, number>; stale: { door: string }[]; refusal: string | null }> {
  const read = await call('GET', '/api/office/what-the-grant-carries', headers)
  expect(read.status, read.said).toBe(200)
  return read.body as never
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  forgetTheWorldsOwnAuthority = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  records = await import('../src/server/lib/records.ts')
  theList = await import('../src/server/lib/what-the-grant-carries.ts')
  roles = await import('../src/server/lib/roles.ts')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of [SECRETARY, WORKER]) {
    const made = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, workArea: ['src'] })
    expect(made.status, made.said).toBe(201)
    keys.set(handle, (made.body['whatToGiveIt'] as { key: string }).key)
  }
  expect((await call('POST', `/api/roles/card/${SECRETARY}`, PERSON, { role: 'secretary' })).status).toBe(201)
  const granted = await call('POST', `/api/roles/elevation/${SECRETARY}`, PERSON, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(granted.status, granted.said).toBe(201)
}, 60_000)

afterAll(async () => {
  forgetTheWorldsOwnAuthority()
  await app?.close()
  t?.close()
})

beforeEach(() => {
  t.client.sqlite.prepare('DELETE FROM what_the_grant_carries').run()
})

describe("1. the check reads this office's answer before the card's", () => {
  it('answers as the card does for every door the card keeps, while this office has no row', () => {
    const card = roles.theRoleCards().elevation.neverPresses
    expect(card.length).toBeGreaterThan(0)
    for (const door of card) {
      const answer = records.mayPressForThePerson(theSecretaryPressing(door))
      expect(answer, door).toMatchObject({ may: false, because: 'kept', name: door, by: 'the card' })
    }
    expect(records.mayPressForThePerson(theSecretaryPressing(A_CARRIED_DOOR))).toMatchObject({ may: true })
  })

  it("lets the grant press a door the card keeps where this office's row says it may", () => {
    theList.setThisOfficesAnswer(A_KEPT_DOOR, 'may-press', THE_PERSON_AS_AN_ACTOR)
    expect(records.mayPressForThePerson(theSecretaryPressing(A_KEPT_DOOR))).toMatchObject({ may: true })
  })

  it("keeps a door the card lets the grant press where this office's row keeps it, and says whose answer it is", () => {
    theList.setThisOfficesAnswer(A_CARRIED_DOOR, 'kept', THE_PERSON_AS_AN_ACTOR)
    const answer = records.mayPressForThePerson(theSecretaryPressing(A_CARRIED_DOOR))
    expect(answer).toMatchObject({ may: false, because: 'kept', name: A_CARRIED_DOOR, by: 'this office' })
    expect(answer.may === false && 'why' in answer ? answer.why : '').toMatch(
      new RegExp(`^This office's list of what the grant carries, since .+, keeps ${A_CARRIED_DOOR.replace(/\./g, '\\.')} for the person`),
    )
  })

  it('asks a door to ask the person first where the row says so, whatever the card says', () => {
    theList.setThisOfficesAnswer(A_CARRIED_DOOR, 'ask-first', THE_PERSON_AS_AN_ACTOR)
    expect(records.mayPressForThePerson(theSecretaryPressing(A_CARRIED_DOOR))).toMatchObject({ may: false, because: 'ask first', by: 'this office' })
  })

  it('asks the guard of the hours about committing hours by its own name, beside the door the hours come through', () => {
    const tail = 'Nothing was scheduled.'
    for (const door of ['plan.time', 'plan.write']) {
      expect(() => records.assertMayCommitTheHours(theSecretaryPressing(door), tail), door).not.toThrow()
    }
    theList.setThisOfficesAnswer('plan:committing-hours', 'kept', THE_PERSON_AS_AN_ACTOR)
    for (const door of ['plan.time', 'plan.write']) {
      expect(() => records.assertMayCommitTheHours(theSecretaryPressing(door), tail), door).toThrow(
        /^This office's list of what the grant carries, since .+, keeps committing hours on the calendar for the person/,
      )
    }
  })
})

describe('2. only the person changes the list', () => {
  const aChange = { changes: [{ door: A_KEPT_DOOR, answer: 'may-press' }] }

  it('refuses an agent with no grant, and the secretary holding the grant, and changes nothing', async () => {
    for (const [who, headers, body] of [
      ['an agent with no grant', asAgent(WORKER), aChange],
      ['the secretary holding the grant', asAgent(SECRETARY), { ...aChange, ...FOR_THE_PERSON }],
    ] as const) {
      const pressed = await call('POST', '/api/office/what-the-grant-carries', headers, body)
      expect(pressed.status, `${who}: ${pressed.said}`).toBe(403)
      expect(String(pressed.body['error']), who).toContain("Changing what the person's grant carries is the person's own act")
      expect(String(pressed.body['error']), who).toContain('Nothing was changed.')
      const read = await theListAs(headers)
      expect(read.refusal, who).toContain("is the person's own act")
    }
    expect(theRows()).toEqual([])
    expect(theChangeLogRows()).toBe(0)
  })

  it("keeps the person's change with who made it, writes it in the change log, and removes it on default", async () => {
    expect((await theListAs(PERSON)).refusal).toBeNull()
    const before = theChangeLogRows()
    const pressed = await call('POST', '/api/office/what-the-grant-carries', PERSON, aChange)
    expect(pressed.status, pressed.said).toBe(200)
    expect(pressed.body['changed']).toEqual([{ door: A_KEPT_DOOR, before: null, after: 'may-press' }])
    expect(theRows()).toEqual([{ door: A_KEPT_DOOR, answer: 'may-press', updated_by_kind: 'human', updated_by_id: THE_PERSON }])
    expect(theChangeLogRows()).toBe(before + 1)

    const read = await theListAs(PERSON)
    const door = read.doors.find((one) => one.door === A_KEPT_DOOR)
    expect(door).toMatchObject({ card: 'kept', answer: 'may-press', office: { answer: 'may-press', kind: 'human', id: THE_PERSON } })
    expect(read.counts['may-press']! + read.counts['kept']! + read.counts['ask-first']!).toBe(read.doors.length)

    const back = await call('POST', '/api/office/what-the-grant-carries', PERSON, { changes: [{ door: A_KEPT_DOOR, answer: 'default' }] })
    expect(back.status, back.said).toBe(200)
    expect(back.body['changed']).toEqual([{ door: A_KEPT_DOOR, before: 'may-press', after: null }])
    expect(theRows()).toEqual([])
    expect((await theListAs(PERSON)).doors.find((one) => one.door === A_KEPT_DOOR)).toMatchObject({ card: 'kept', office: null, answer: 'kept' })
  })

  it("makes the change through a request for one press only on the person's own press", async () => {
    const filed = await call('POST', '/api/one-press', asAgent(WORKER), {
      act: 'change-what-the-grant-carries',
      inputs: aChange,
      because: 'The person said the secretary may set the quick inputs.',
    })
    expect(filed.status, filed.said).toBe(201)
    const request = filed.body['request'] as { id: string; state: string; shows: string }
    const words = (await import('../src/shared/what-the-grant-carries-words.ts')).whatThisDoorDoes(A_KEPT_DOOR).en
    expect(request.shows).toBe(`Change what the person's grant carries: "${words}" from kept for the person (the card's answer) to the secretary may press it.`)

    const bySecretary = await call('POST', `/api/one-press/${request.id}/agree`, asAgent(SECRETARY), FOR_THE_PERSON)
    expect(bySecretary.status, bySecretary.said).toBe(403)
    expect(theRows()).toEqual([])
    const still = await call('GET', `/api/one-press/${request.id}`, PERSON)
    expect((still.body['request'] as { state: string }).state).toBe('waiting')

    const agreed = await call('POST', `/api/one-press/${request.id}/agree`, PERSON)
    expect(agreed.status, agreed.said).toBe(200)
    expect(agreed.body['request']).toMatchObject({ state: 'done', outcome: 'The answer about the door was changed.' })
    expect(theRows()).toEqual([{ door: A_KEPT_DOOR, answer: 'may-press', updated_by_kind: 'human', updated_by_id: THE_PERSON }])
  })

  it('is not an act a signing package may carry', async () => {
    const brought = await call('POST', '/api/signing-packages', asAgent(SECRETARY), {
      forAgent: WORKER,
      task: 'Change what the grant carries',
      items: [{ act: 'change-what-the-grant-carries', inputs: aChange, why: 'A test asks for it.' }],
    })
    expect(brought.status, brought.said).toBe(409)
    expect(String(brought.body['error'])).toContain('"change-what-the-grant-carries" is not an act a package may carry')
    expect(theRows()).toEqual([])
  })
})

describe('3. a row left for a door the list no longer names', () => {
  function aStaleRow(answer: string): void {
    t.client.sqlite
      .prepare("INSERT INTO what_the_grant_carries (door, answer, updated_at, updated_by_kind, updated_by_id) VALUES (?, ?, '2026-10-21 09:00:00', 'human', ?)")
      .run(A_DOOR_NO_LONGER_THERE, answer, THE_PERSON)
  }

  it('is shown apart and never matched', async () => {
    aStaleRow('kept')
    const read = await theListAs(PERSON)
    expect(read.stale).toEqual([expect.objectContaining({ door: A_DOOR_NO_LONGER_THERE, answer: 'kept' })])
    expect(read.doors.some((one) => one.door === A_DOOR_NO_LONGER_THERE)).toBe(false)
    expect(theList.thisOfficesAnswerAbout(A_DOOR_NO_LONGER_THERE)).toBeNull()
    expect(theList.theAnswerAboutAPress([A_DOOR_NO_LONGER_THERE])).toMatchObject({ answer: 'may-press', by: 'the card' })
  })

  it('can only be removed, and a door the list never named or one asked about twice is refused', async () => {
    aStaleRow('kept')
    for (const [what, changes, words] of [
      ['a stale row given an answer', [{ door: A_DOOR_NO_LONGER_THERE, answer: 'may-press' }], 'its row can only be removed, with "default"'],
      ['a door the list never named', [{ door: 'office.never-a-door', answer: 'default' }], 'is not a door the list of what the grant carries names'],
      ['a door asked about twice', [{ door: A_KEPT_DOOR, answer: 'may-press' }, { door: A_KEPT_DOOR, answer: 'kept' }], 'is asked about twice'],
    ] as const) {
      const pressed = await call('POST', '/api/office/what-the-grant-carries', PERSON, { changes })
      expect(pressed.status, `${what}: ${pressed.said}`).toBe(400)
      expect(String(pressed.body['error']), what).toContain(words)
      expect(String(pressed.body['error']), what).toContain('Nothing was changed.')
    }
    expect(theRows().map((one) => one.door)).toEqual([A_DOOR_NO_LONGER_THERE])

    const removed = await call('POST', '/api/office/what-the-grant-carries', PERSON, { changes: [{ door: A_DOOR_NO_LONGER_THERE, answer: 'default' }] })
    expect(removed.status, removed.said).toBe(200)
    expect(theRows()).toEqual([])
    expect((await theListAs(PERSON)).stale).toEqual([])
  })
})

describe('4. the line that tells the secretary it was raised counts from this list', () => {
  /** The person presses the grant again, and the line the office sent the secretary is read. */
  async function theRaiseLine(): Promise<string> {
    const pressed = await call('POST', `/api/roles/elevation/${SECRETARY}`, PERSON, { reason: 'A test raises it again.', endsWhen: 'when you say' })
    expect(pressed.status, pressed.said).toBe(201)
    const told = await call('GET', `/api/records/${String(pressed.body['told'])}`, PERSON)
    expect(told.status, told.said).toBe(200)
    return String((told.body['record'] as { data: { saidInFull?: string } }).data.saidInFull ?? '')
  }
  /** The three kinds of door the grant does not press, counted from the list: each door once, in the first kind that fits. */
  function theKinds(doors: ADoor[]): { doNotAskYet: number; kept: number; needWords: number } {
    const asking = doors.filter((one) => one.asksTheCheck)
    const notKept = asking.filter((one) => one.answer !== 'kept')
    return { doNotAskYet: doors.length - asking.length, kept: asking.length - notKept.length, needWords: notKept.filter((one) => one.alsoNeedsThePersonsWords).length }
  }
  const some = (count: number, one: string, many: string): string => `${String(count)} ${count === 1 ? one : many}`
  /** The sentence that names the three kinds, each with its number, and their sum as the whole. */
  const theSentence = (kinds: { doNotAskYet: number; kept: number; needWords: number }): string =>
    `It does not press ${String(kinds.doNotAskYet + kinds.kept + kinds.needWords)} of the person's doors: ` +
    `${some(kinds.doNotAskYet, 'that does not ask the check yet', 'that do not ask the check yet')}, whatever this office's answer; ` +
    `${String(kinds.kept)} more that this office keeps for them; and ` +
    `${some(kinds.needWords, "more that also needs the person's words for each change", "more that also need the person's words for each change")}.`

  it("counts the doors the grant does not press from this office's answers, names each kind with its number, and names the acts no grant carries", async () => {
    const before = theKinds((await theListAs(PERSON)).doors)
    expect(before.doNotAskYet, 'a door that does not ask the check yet').toBeGreaterThan(0)
    expect(before.kept, 'a door this office keeps for the person').toBeGreaterThan(0)
    expect(before.needWords, "a door the grant does not press only because it also needs the person's words").toBeGreaterThan(0)
    const withNoRow = await theRaiseLine()
    expect(withNoRow).toContain(theSentence(before))
    for (const one of roles.theRoleCards().elevation.doesNotCarry) {
      expect(withNoRow).toContain(one.name.charAt(0).toLowerCase() + one.name.slice(1))
    }

    theList.setThisOfficesAnswer(A_CARRIED_DOOR, 'kept', THE_PERSON_AS_AN_ACTOR)
    expect(theKinds((await theListAs(PERSON)).doors)).toEqual({ ...before, kept: before.kept + 1 })
    expect(await theRaiseLine()).toContain(theSentence({ ...before, kept: before.kept + 1 }))

    theList.setThisOfficesAnswer(A_CARRIED_DOOR, 'ask-first', THE_PERSON_AS_AN_ACTOR)
    const asking = await theRaiseLine()
    expect(asking).toContain(theSentence(before))
    expect(asking).toContain('For 1 more door, you ask the person first.')
  })

  it('counts a door that does not ask the check yet once, in its own kind, whatever its answer', async () => {
    const before = theKinds((await theListAs(PERSON)).doors)
    const notAsking = (await theListAs(PERSON)).doors.find((one) => !one.asksTheCheck)!
    for (const answer of ['kept', 'ask-first', 'may-press'] as const) {
      theList.setThisOfficesAnswer(notAsking.door, answer, THE_PERSON_AS_AN_ACTOR)
      expect(theKinds((await theListAs(PERSON)).doors), `${notAsking.door} at ${answer}`).toEqual(before)
      expect(await theRaiseLine(), `${notAsking.door} at ${answer}`).toContain(theSentence(before))
    }
  })
})
