// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON LETS A SECRETARY ACT FOR THEM, AND WHAT THAT DOES. Criteria P59 and P60.
 *
 * A secretary may act for the person only after the person grants it by hand, in the product, and only a
 * secretary can be raised. Until then a secretary may not settle an important decision a supervisor raises,
 * or one only the person may make; once raised, it holds all the person's powers. Only the person raises a
 * secretary that far, and all three ways of ending a raise are kept.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS
 * ---------------------------------------------------------------------------------------
 *
 *   · BEFORE the press, a secretary is refused a decision and refused a fork that is the owner's,
 *     and the refusal NAMES THE PRESS.
 *   · The press is the person's. An agent is refused it, and an agent already acting for the owner is
 *     refused it exactly as one that is not — criterion P60.
 *   · AFTER the press, the same two acts go through.
 *   · EVERY WRITE MADE UNDER IT NAMES THE GRANT, on the change row and on the revision, and an
 *     ordinary write made by the same agent at the same moment names nothing.
 *   · THE THREE ENDS. A time passes with nothing having run. A piece of work is released. The owner says.
 *   · Only the person ends it early, and what was written under it is not rewritten.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { thePress } from '../src/shared/the-press.ts'
import { localStamp } from '../src/shared/time.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer
let elevationAtTheStart: string | null = null

const AS_THE_PERSON = {
  'content-type': 'application/json',
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
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String((body as { error?: unknown })['error'] ?? reply.body), body }
}

/** Let the secretary act for the owner, however it ends. */
async function press(endsWhen: string, until?: string): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  return ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen, ...(until === undefined ? {} : { until }) })
}

/**
 * THE ACT P59 NAMES: promoting a fork the owner reserved into a decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS ACT AND NOT "POST A DECISION"
 * ---------------------------------------------------------------------------------------
 *
 * MEASURED, not assumed. An agent may already file a decision it made ITSELF on one of the four
 * evidence authorities, and may already write down one the owner made when it can cite the record
 * carrying the owner's words — `assertMayDecide` is what allows both, and neither is refused. So "a
 * secretary may not write a decision" is not a thing to drive a POST at: the write that is actually
 * refused, and the one named above (the two kinds of decision a secretary may not settle), is
 * PROMOTING a fork the owner reserved. That is settling a fork and writing the decision in one act, it is
 * refused to every agent, and it is what an elevation opens.
 */
async function aForkTheOwnerReserved(title: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    kind: 'proposal',
    title,
    data: {
      question: 'Which of the two?',
      options: ['One', 'The other'],
      because: 'Because somebody has to choose.',
      who_settles_it: 'the owner',
    },
  })
  expect(filed.status, filed.said).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

/**
 * Promote it, which settles the fork and files the decision in one act.
 *
 * THE BODY IS `title`, `summary`, `data` AND NOTHING ELSE. `promoteBody` in api/records.ts is a
 * strict object and the kind is not on it — what a proposal is promoted INTO is the route's, not the
 * caller's. Sending `kind` here is answered 400, which is a refusal about the body and would make
 * this file green on a product that had never refused the act at all.
 */
async function promote(fork: string): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  return ask('POST', `/api/records/${fork}/promote`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    ...FOR_THE_PERSON,
    title: 'What was chosen',
    data: {
      decided_by: 'the owner',
      authority: 'the owner said so',
      because: 'One of them, and this is the reasoning.',
    },
  })
}

/**
 * ONE OFFICE FOR THE FILE. The secretary and its supervisor are registered once, and each case
 * files the forks, notes and work it names. A case that leaves the secretary acting for the person
 * has that grant ended after it, so the next case begins as this file did.
 */
beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await ask('POST', '/api/agents/started', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor', workArea: ['src'] })
  const row = t.client.sqlite.prepare('SELECT elevation FROM agents WHERE handle = ?').get(THE_TEST_OFFICES_SECRETARY.handle) as { elevation: string | null }
  elevationAtTheStart = row.elevation
}, 60_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

afterEach(() => {
  // PUT BACK THE GRANTS THE CASE MADE. The row keeps every grant the owner made, and one case
  // counts them, so the next case must begin with the row as this file found it.
  t.client.sqlite
    .prepare('UPDATE agents SET elevation = ? WHERE handle = ?')
    .run(elevationAtTheStart, THE_TEST_OFFICES_SECRETARY.handle)
})

describe('before the press, a secretary is refused the person’s acts and told about the press', () => {
  it('refuses it a fork the owner reserved, and the refusal names the press', async () => {
    const fork = await aForkTheOwnerReserved('A fork the owner reserved')
    const no = await promote(fork)
    expect(no.status).toBe(403)
    expect(no.said).toContain(thePress(THE_TEST_OFFICES_SECRETARY.name))
    // THE PRESS IS ON THE AGENT'S OWN PAGE, put there by criterion P64 and a decision.
    // This asked for #/roles until wave 13k's round 22 fix, and #/roles draws no press.
    expect(no.said).toContain(`#/who/agent/${THE_TEST_OFFICES_SECRETARY.handle}`)
    expect(no.said).not.toContain('#/roles')
    expect(no.said).toContain("one of the person's own")
  })

  it('says nothing about the press to a supervisor, which can never hold one', async () => {
    const filed = await ask('POST', '/api/records', asAgent('sup-one'), {
      kind: 'proposal',
      title: 'A fork a supervisor filed',
      data: { question: 'Which?', options: ['One', 'Two'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
    })
    const fork = String((filed.body['record'] as { id: string }).id)
    const refused = await ask('POST', `/api/records/${fork}/promote`, asAgent('sup-one'), {
      title: 'What was chosen',
      data: { decided_by: 'the owner', authority: 'the owner said so', because: 'One, and this is the reasoning.' },
    })
    expect(refused.status).toBe(403)
    // A SUPERVISOR CANNOT HOLD AN ELEVATION, so telling it to press one would send it looking for a
    // door that is not there. The refusal is otherwise the same refusal.
    expect(refused.said).not.toContain(thePress('Supervisor One'))
    expect(refused.said).not.toContain('on your card')
    expect(refused.said).not.toContain('on your page')
  })
})

describe('the press is the person’s, and elevation does not carry it. Criterion P60', () => {
  it('refuses an agent asking for it', async () => {
    const no = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { endsWhen: 'when you say' })
    expect(no.status).toBe(403)
    expect(no.said).toContain("is the person's own act")
    expect(no.said).toContain("the person's press")
  })

  it('refuses a secretary already acting for the owner asking for another, so it cannot extend itself', async () => {
    expect((await press('when you say')).status).toBe(201)
    const no = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { endsWhen: 'when you say' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('already acting for the person is refused this exactly as one that is not')
  })

  it('refuses a secretary already acting for the owner appointing another secretary', async () => {
    expect((await press('when you say')).status).toBe(201)
    const no = await ask('POST', '/api/agents/started', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 's-two',
      name: 'A second secretary',
      role: 'secretary',
    })
    expect(no.status).toBe(403)
    expect(no.said).toContain('Only the person appoints a secretary')
  })

  it('refuses a secretary already acting for the owner ending its own elevation', async () => {
    expect((await press('when you say')).status).toBe(201)
    const no = await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(no.status).toBe(403)
    const still = await ask('GET', '/api/roles', AS_THE_PERSON)
    // A LIST, since 7 September 2026 (P67: there may be more than one secretary): empty when nobody holds.
    expect((still.body['elevation'] as { holding: unknown[] }).holding).toHaveLength(1)
  })

  it('refuses a card that cannot hold one at all', async () => {
    const no = await ask('POST', '/api/roles/elevation/sup-one', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
    expect(no.status).toBe(403)
    expect(no.said).toContain('supervisor')
    expect(no.said).toContain('secretary')
  })
})

describe('after the press, the same acts go through', () => {
  it('lets the secretary settle a fork it was refused a moment before', async () => {
    const one = await aForkTheOwnerReserved('A fork it may not settle')
    expect((await promote(one)).status).toBe(403)
    expect((await press('when you say')).status).toBe(201)
    const two = await aForkTheOwnerReserved('A fork it may settle now')
    const done = await promote(two)
    expect(done.status, done.said).toBe(201)
  })

  it('says on the card, and in the reply, who is acting and until when', async () => {
    await press('at a time', '2099-01-01 09:00:00')
    const said = await ask('GET', '/api/roles', AS_THE_PERSON)
    const holders = (said.body['elevation'] as { holding: Record<string, unknown>[] }).holding
    expect(holders).toHaveLength(1)
    const holding = holders[0]
    expect(holding?.['agent']).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(String(holding?.['untilInWords'])).toContain('2099-01-01 09:00:00')
    // AND IT CARRIES NO CONNECTIVE OF ITS OWN. The card writes `Acting for <name> until <this>`, so
    // a value beginning "until" makes the card read *until until a time you name*. It did, and a
    // picture of the page at 1440 is what showed it.
    expect(String(holding?.['untilInWords']).toLowerCase().startsWith('until')).toBe(false)
    // THE PERSON BY NAME, not by the id a request carries.
    expect(String(holding?.['actingFor'])).not.toBe('')
  })

  it('names the piece of work by its title, and says "you say so" where nothing is named', async () => {
    const work = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'module', title: 'The thing being built' })
    const workId = String((work.body['record'] as { id: string }).id)
    await press('when a piece of work ends', workId)
    const byWork = await ask('GET', '/api/roles', AS_THE_PERSON)
    expect(String(((byWork.body['elevation'] as { holding: Record<string, unknown>[] }).holding)[0]?.['untilInWords'])).toBe(
      '"The thing being built" is finished',
    )

    await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)
    const again = await press('when you say')
    expect(again.status, again.said).toBe(201)
    const byWord = await ask('GET', '/api/roles', AS_THE_PERSON)
    expect(String(((byWord.body['elevation'] as { holding: Record<string, unknown>[] }).holding)[0]?.['untilInWords'])).toBe(
      'you say so',
    )

    // AND THE GRANT THE OWNER ENDED IS STILL ON THE RECORD, beside the one that replaced it. The field is
    // every grant the owner made, oldest first. It was one object once, and a fresh grant merged onto an
    // ended one kept the old `endedAt` and read as ended the moment it was made — `mergeData` walks
    // into a nested object and a nested null cannot clear a key, which is why this is a list.
    const row = t.client.sqlite.prepare(`SELECT elevation FROM agents WHERE handle = '${THE_TEST_OFFICES_SECRETARY.handle}'`).get() as {
      elevation?: unknown
    }
    // THE COLUMN HOLDS THE NORMALISED FORM, with the empty keys filled back in as null: the RECORD
    // stores no null keys because the validator refuses them, and `readElevations` puts them back so
    // the two places can be compared. So an unended grant reads null here and absent on the record.
    const every = JSON.parse(String(row.elevation)) as { endedAt: string | null }[]
    // TWO PRESSES IN THIS TEST: the one that ends with the work, and the one that ends when the owner says.
    expect(every.length, 'the grant the owner ended was written over').toBe(2)
    expect(every[0]?.endedAt, 'the first grant does not say it ended').toBeTruthy()
    expect(every[1]?.endedAt, 'the grant that holds says it ended').toBeNull()
  })
})

describe('every write made under it names the elevation, and nothing else does', () => {
  it('writes the grant onto the change row and the revision of the act it allowed', async () => {
    const done = await press('when you say')
    const grant = (done.body['elevation'] as { id: string }).id
    const fork = await aForkTheOwnerReserved('A fork settled under the elevation')
    const written = await promote(fork)
    expect(written.status, written.said).toBe(201)
    // THE PROMOTION ANSWERS WITH THE DECISION IT WROTE, not with a `record` key: `PromoteResult`
    // in records.ts carries `decision`, because the record that came back is a decision and the
    // proposal it came from is still there beside it.
    const id = String((written.body['decision'] as { id: string }).id)

    const change = t.client.sqlite
      .prepare('SELECT elevation FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(id) as { elevation?: unknown } | undefined
    expect(String(change?.elevation), 'the change row does not name the elevation').toContain(grant)

    const revision = t.client.sqlite
      .prepare('SELECT elevation FROM revisions WHERE record_id = ? ORDER BY seq ASC LIMIT 1')
      .get(id) as { elevation?: unknown } | undefined
    expect(String(revision?.elevation), 'the revision does not name the elevation').toContain(grant)
  })

  it('names nothing on an ordinary write the same agent could have made anyway', async () => {
    await press('when you say')
    const note = await ask('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { kind: 'note', title: 'An ordinary note' })
    const id = String((note.body['record'] as { id: string }).id)
    const change = t.client.sqlite
      .prepare('SELECT elevation FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(id) as { elevation?: unknown } | undefined
    // A NOTE IS SOMETHING A WORKER MAY FILE. Writing the grant beside it would say the person's
    // authority was spent on a write that never needed it.
    expect(change?.elevation ?? null).toBeNull()
  })
})

describe('the three ends', () => {
  // A TIME ALREADY PAST IS REFUSED AT THE PRESS (problem OpT-wLSCwlZ-, tests/a-raise-ends-at-the-time-it-says.test.ts), so
  // the raise is given a minute ahead and the clock is then moved past it.
  it('stops holding when the time passes, with nothing having run', async () => {
    const ends = new Date(Date.now() + 60_000)
    const pressed = await press('at a time', localStamp(ends))
    expect(pressed.status, pressed.said).toBe(201)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(ends.getTime() + 1_000)
    try {
      const said = await ask('GET', '/api/roles', AS_THE_PERSON)
      expect((said.body['elevation'] as { holding: unknown[] }).holding).toEqual([])
      const no = await promote(await aForkTheOwnerReserved('A fork after the time passed'))
      expect(no.status).toBe(403)
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds while the time has not passed', async () => {
    await press('at a time', '2099-01-01 00:00:00')
    const done = await promote(await aForkTheOwnerReserved('A fork before the time passes'))
    expect(done.status, done.said).toBe(201)
  })

  // AN END AT A TIME WITH NO TIME LASTS A DAY. A raise lasts a day unless the owner says
  // otherwise. "A day" is a calendar day: the raise ends at the same clock time on
  // the next day of the office's calendar, so across a clock change it is 23 or 25 hours on, not 24.
  // Before the decision that a raise lasts a day, the press refused an end at a time with no time; a piece of
  // work it cannot name is still refused, because nothing would ever end that one.
  //
  // THE OFFICE'S ZONE IS THIS PROCESS'S ZONE (`theClockZone`), so the case sets it to London, where the clocks change, and
  // puts the clock at 09:00 on three days. Each file runs in its own process (`pool: 'forks'`), and the zone is put back.
  it('gives an end at a time with no time a day, and refuses an end that names no work, rather than never ending', async () => {
    const HOUR = 3_600_000
    const theZoneBefore = process.env.TZ
    process.env.TZ = 'Europe/London'
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (const [now, ends, hours] of [
        // 09:00 BST on 13 October 2026, with no clock change before 09:00 the next day.
        [Date.UTC(2026, 9, 13, 8, 0), '2026-10-14 09:00:00', 24],
        // 09:00 BST on 24 October 2026. The clocks go back an hour at 02:00 on 25 October.
        [Date.UTC(2026, 9, 24, 8, 0), '2026-10-25 09:00:00', 25],
        // 09:00 GMT on 27 March 2027. The clocks go forward an hour at 01:00 on 28 March.
        [Date.UTC(2027, 2, 27, 9, 0), '2027-03-28 09:00:00', 23],
      ] as const) {
        vi.setSystemTime(now)
        const aDay = await press('at a time')
        expect(aDay.status, aDay.said).toBe(201)
        const until = String((aDay.body['elevation'] as { until?: unknown }).until)
        expect(until, `a raise with no time pressed at ${new Date(now).toISOString()}`).toBe(ends)
        expect((new Date(until.replace(' ', 'T')).getTime() - now) / HOUR, `a raise with no time ends at ${until}`).toBe(hours)
        expect((await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)).status).toBe(200)
      }
    } finally {
      vi.useRealTimers()
      if (theZoneBefore === undefined) delete process.env.TZ
      else process.env.TZ = theZoneBefore
    }
    const noWork = await press('when a piece of work ends')
    expect(noWork.status).toBe(400)
    expect(noWork.said).toContain('needs the record')
  })

  it('refuses a way of ending the declaration does not hold, and lists the ones it does', async () => {
    const no = await press('when the moon is full')
    expect(no.status).toBe(400)
    expect(no.said).toContain('when you say')
    expect(no.said).toContain('at a time')
  })

  it('ends when the piece of work it named is released, with nobody pressing anything', async () => {
    const work = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'module', title: 'A piece of work' })
    const workId = String((work.body['record'] as { id: string }).id)
    expect((await press('when a piece of work ends', workId)).status).toBe(201)
    expect((await promote(await aForkTheOwnerReserved('Settled while the work was live'))).status).toBe(201)

    // THE PRODUCT'S OWN ANSWER TO "A PIECE OF WORK ENDED": a claim on it is released. The same event
    // that retires the agents started for it — `releaseAClaim` in lib/claims.ts is the one place.
    // A claim names the RUN that made it, and only whoever made it may release it, so the supervisor
    // files a run of its own and releases its own claim.
    const run = await ask('POST', '/api/records', asAgent('sup-one'), { kind: 'session', title: 'A run doing the work' })
    expect(run.status, run.said).toBe(201)
    const claim = await ask('POST', '/api/claims', asAgent('sup-one'), {
      run: String((run.body['record'] as { id: string }).id),
      things: [{ what: 'record', id: workId }],
    })
    expect(claim.status, claim.said).toBe(201)
    const claimId = String((claim.body['claim'] as { id: string }).id)
    const released = await ask('POST', `/api/claims/${claimId}/release`, asAgent('sup-one'), { because: 'It is finished.' })
    expect(released.status, released.said).toBe(200)

    const said = await ask('GET', '/api/roles', AS_THE_PERSON)
    expect((said.body['elevation'] as { holding: unknown[] }).holding, 'it is still acting for the owner').toEqual([])
    const no = await promote(await aForkTheOwnerReserved('A fork after the work ended'))
    expect(no.status).toBe(403)
  })

  it('ends when the owner says, and what was written under it is not rewritten', async () => {
    const done = await press('when you say')
    const grant = (done.body['elevation'] as { id: string }).id
    const written = await promote(await aForkTheOwnerReserved('A fork settled while it held'))
    expect(written.status, written.said).toBe(201)
    // THE PROMOTION ANSWERS WITH THE DECISION IT WROTE, not with a `record` key: `PromoteResult`
    // in records.ts carries `decision`, because the record that came back is a decision and the
    // proposal it came from is still there beside it.
    const id = String((written.body['decision'] as { id: string }).id)

    const over = await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)
    expect(over.status, over.said).toBe(200)
    expect((await promote(await aForkTheOwnerReserved('A fork after the owner ended it'))).status).toBe(403)

    // AND THE LEDGER STILL SAYS WHAT THE WRITE STOOD ON.
    const change = t.client.sqlite
      .prepare('SELECT elevation FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(id) as { elevation?: unknown } | undefined
    expect(String(change?.elevation)).toContain(grant)
    // AND THE RECORD IT WROTE IS STILL THERE.
    const still = await ask('GET', `/api/records/${id}`, AS_THE_PERSON)
    expect(still.status).toBe(200)
  })

  it('refuses ending one that is not there, rather than answering 200 for nothing', async () => {
    const no = await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)
    expect(no.status).toBe(409)
    expect(no.said).toContain('not acting for you')
  })
})
