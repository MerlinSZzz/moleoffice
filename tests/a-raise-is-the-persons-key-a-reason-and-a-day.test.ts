// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RAISE IS THE PERSON'S KEY, A REASON AND A DAY, WRITTEN ON THE SECRETARY'S RUN, AND IT NEVER CARRIES THE ACTS THE PERSON KEEPS.
 * A decision set out the raise, built as the elevation that already existed (criterion P59) amended,
 * on the secretary's proposal and answers m0ciRes8jDRM: `POST /api/roles/elevation/<handle>` in
 * src/server/api/roles.ts, the grants in src/server/lib/elevation.ts, and the refusals in
 * src/server/lib/records.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Only the person's key raises: their name claimed with no key is refused and nothing is written; with their key and no reason
 *      the press is refused too, for a secretary answering in no session as well; an agent is refused before its body
 *      is read.
 *   2. With their key and a reason, the raise is written on the agent's record and on the session record of the run the
 *      secretary is in, with its start, its end and the person's reason, and the secretary is told by a line from the office.
 *      Ending it writes the end on that run, and the secretary is told again.
 *   3. While it holds, the secretary does the person's acts: it deletes a decision they wrote, which it may not do unraised.
 *   4. It never carries the acts the person keeps: writing a regulation, closing the key window, confirming a visitor as them,
 *      giving a card, and raising anybody. Each is refused to the raised secretary. The person's office keys were kept too until
 *      a decision, which lets a secretary set them for the person.
 *   5. A run's raises are written by the person's press and nothing else: the secretary writing a raise onto its own run, or
 *      taking its raises off, is refused, and nothing is written; so is a claim to be the person with no key.
 *   6. The page asks for the person's reason beside the press, and shows their reason while the raise lasts (the secretary's
 *      profile, src/web/components/TheirCard.tsx).
 *   7. It carries retiring an agent, the owner's own example in a decision: unraised, the secretary may not retire a
 *      secretary it did not start; raised, it may.
 *
 * A raise that ends at a time with no time given lasting a day is claimed in tests/a-secretary-acting-for-the-person.test.ts.
 * Each case ends any raise it leaves (afterEach), and none leans on another's writes, so a mutation turns red the
 * case it names and no other.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of run pzdakzeFExuI, which added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the press taking the person's name without their key: case 1 goes red;
 *   - the reason made optional: case 1 goes red;
 *   - the raise not written on the run: case 2 goes red;
 *   - the secretary not told: case 2 goes red;
 *   - a regulation written under a raise (the exception taken out of lib/records.ts): case 4 goes red;
 *   - deleting a decision not carried by a raise: case 2 goes red;
 *   - a run's raises open to any write: case 5 goes red;
 *   - the person's reason not drawn while the raise holds: case 6 goes red;
 *   - retiring not carried by a raise: case 7 goes red.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, FOR_THE_PERSON_IN_THE_QUERY, type TestDb } from './helpers.ts'
import { END_IT, WHY_ASKS } from '../src/shared/elevation.ts'
import { thePress } from '../src/shared/the-press.ts'

type Built = Awaited<ReturnType<typeof apiApp>>
type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

/** The person's name, and no key: what the window would count elsewhere and a raise does not. */
const BY_THEIR_NAME = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: Built
let run = ''
/** The secretary's registry id, which a line to him names. */
let argusId = ''

const asArgus = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
  ...(run === '' ? {} : { 'x-mole-office-session': run }),
})

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: Record<string, unknown>): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** The office's line to the secretary that a door answered by its id: its first line, what it says in full, and to whom. */
async function theLineToArgus(id: unknown): Promise<{ line: string; said: string; toArgus: boolean }> {
  const record = (await ask('GET', `/api/records/${String(id)}`, BY_THEIR_NAME)).body['record'] as { data: { body?: string; saidInFull?: string; to?: { kind: string; id: string }[] } }
  return {
    line: String(record.data.body ?? ''),
    said: String(record.data.saidInFull ?? ''),
    toArgus: (record.data.to ?? []).some((to) => to.kind === 'agent' && to.id === argusId),
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  // THE SECRETARY, AND THE RUN HE IS IN: a session record of his, holding his handle.
  const started = await ask('POST', '/api/agents/started', BY_THEIR_NAME, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  expect(started.status, started.said).toBe(201)
  argusId = String(started.body['agent']?.id ?? '')
  expect(argusId, `the start answered no registry id for ${THE_TEST_OFFICES_SECRETARY.handle}`).not.toBe('')
  const session = await ask('POST', '/api/records', asArgus(), { kind: 'session', title: `${THE_TEST_OFFICES_SECRETARY.handle} answering`, data: { state: 'running' } })
  expect(session.status, session.said).toBe(201)
  run = String(session.body['record'].id)
  const held = await ask('POST', `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`, asArgus(), { session: run, machine: 'a-machine', runtime: 'claude-code' })
  expect(held.status, held.said).toBe(201)
  // VESTA, A SECRETARY ANSWERING IN NO SESSION, so a press for her writes on her record alone.
  const vesta = await ask('POST', '/api/agents/started', BY_THEIR_NAME, { handle: 'vesta', name: 'Vesta', role: 'secretary' })
  expect(vesta.status, vesta.said).toBe(201)
})

// EVERY RAISE A CASE LEAVES IS ENDED, so the next case starts with nobody raised. Ending none is not an error here.
afterEach(async () => {
  await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, BY_THEIR_NAME)
  await ask('DELETE', '/api/roles/elevation/vesta', BY_THEIR_NAME)
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('the press', () => {
  it('1: needs the person\'s key and a reason, and an agent is refused before its body is read', async () => {
    const keyless = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, BY_THEIR_NAME, { reason: 'a test raises it' })
    expect(keyless.status, keyless.said).toBe(403)
    expect(keyless.said).toContain("pressed with the person's own key")
    const noReason = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, {})
    expect(noReason.status, noReason.said).toBe(400)
    // AND FOR A SECRETARY IN NO SESSION, where no run is written that could refuse it for another reason.
    const noReasonNoRun = await ask('POST', '/api/roles/elevation/vesta', { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, {})
    expect(noReasonNoRun.status, noReasonNoRun.said).toBe(400)
    const byAnAgent = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, asArgus(), {})
    expect(byAnAgent.status, byAnAgent.said).toBe(403)
    // NOTHING WAS WRITTEN: the secretary holds no grant.
    const card = await ask('GET', '/api/roles', BY_THEIR_NAME)
    expect(JSON.stringify(card.body)).not.toContain('a test raises it')
  })
})

describe('a raise', () => {
  it('2: is written on the agent and on its run with the person\'s reason, the secretary is told, and its end is written and told', async () => {
    const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, { reason: 'Delete the decision filed by mistake' })
    expect(pressed.status, pressed.said).toBe(201)
    expect(pressed.body['writtenOnTheRun']).toBe(run)
    const grant = pressed.body['elevation'] as { id: string; until: string; reason: string; run: string }
    expect(grant.reason).toBe('Delete the decision filed by mistake')
    expect(grant.run).toBe(run)

    const onTheRun = (await ask('GET', `/api/records/${run}`, BY_THEIR_NAME)).body['record'].data.raises as Record<string, unknown>[]
    expect(onTheRun.filter((one) => one['elevation'] === grant.id)).toEqual([
      { elevation: grant.id, from: expect.any(String), until: grant.until, reason: 'Delete the decision filed by mistake' },
    ])
    // THE LINE TO HIM, read by the id the press answered.
    const told = await theLineToArgus(pressed.body['told'])
    expect(told).toMatchObject({ line: 'The person raised you to act for them', toArgus: true })
    expect(told.said).toContain('Delete the decision filed by mistake')
    // WHAT IT DOES NOT CARRY, counted from this office's list and named from the card (each office's own list is
    // tested in each-office-keeps-what-the-grant-carries.test.ts).
    expect(told.said).toMatch(
      /of the person's doors: \d+ that do(?:es)? not ask the check yet, whatever this office's answer; \d+ more that this office keeps for them; and \d+ more that also needs? the person's words for each change\./,
    )
    expect(told.said).toContain('GET /api/office/what-the-grant-carries')
    expect(told.said).toContain('No grant carries these: appointing a secretary')
    // AND HOW IT ENDS THE RAISE ITSELF, by the raise's id.
    expect(told.said).toContain(`POST /api/roles/raises/${grant.id}/end`)

    // 3. WHILE IT HOLDS: a decision the person wrote, deleted by the raised secretary.
    const decision = await ask('POST', '/api/records', { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, {
      kind: 'decision',
      title: 'A decision filed by mistake',
      data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'It was filed by mistake.' },
    })
    expect(decision.status, decision.said).toBe(201)
    const deleted = await ask('DELETE', `/api/records/${String(decision.body['record'].id)}?${FOR_THE_PERSON_IN_THE_QUERY}`, asArgus())
    expect(deleted.status, deleted.said).toBeLessThan(300)

    // AND ITS END, on the run and to the secretary.
    const over = await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, BY_THEIR_NAME)
    expect(over.status, over.said).toBe(200)
    const after = (await ask('GET', `/api/records/${run}`, BY_THEIR_NAME)).body['record'].data.raises as Record<string, unknown>[]
    expect(after.find((one) => one['elevation'] === grant.id)).toMatchObject({ endedAt: expect.any(String), endedBecause: 'You ended it.' })
    expect(await theLineToArgus(over.body['told'])).toMatchObject({ line: 'Your raise has ended', toArgus: true })
  })

  it('3: without it, the secretary may not delete a written decision', async () => {
    const decision = await ask('POST', '/api/records', { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, {
      kind: 'decision',
      title: 'A decision the person made',
      data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'It stands.' },
    })
    expect(decision.status, decision.said).toBe(201)
    const no = await ask('DELETE', `/api/records/${String(decision.body['record'].id)}`, asArgus())
    expect(no.status, no.said).toBe(403)
  })

  it('4: never carries the acts the person keeps', async () => {
    const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, { reason: 'See what it does not carry' })
    expect(pressed.status, pressed.said).toBe(201)

    const regulation = await ask('POST', '/api/records', asArgus(), {
      kind: 'regulation',
      title: 'A regulation a secretary wrote',
      data: { sentence: 'A rule nobody made.', binds: 'person', since: '2026-09-26' },
    })
    expect(regulation.status, regulation.said).toBe(403)
    expect(regulation.said).toContain('a raise never carries a write of a regulation')

    const window = await ask('POST', '/api/office/key-window/close', asArgus(), {})
    expect(window.status, window.said).toBe(403)

    const credential = await ask('POST', '/api/office/visitors', BY_THEIR_NAME, { device: 'A made-up laptop' })
    expect(credential.status, credential.said).toBe(201)
    const confirm = await ask('POST', `/api/office/visitors/${String(credential.body['credential'].id)}/confirm`, asArgus(), {})
    expect(confirm.status, confirm.said).toBe(403)

    // THE PERSON'S OFFICE KEYS ARE NO LONGER KEPT FROM A RAISE: a decision lets a secretary set
    // them for the person on their words or under their raise.
    // tests/a-secretary-sets-the-persons-settings-on-their-words.test.ts holds it.

    const card = await ask('POST', `/api/roles/card/${THE_TEST_OFFICES_SECRETARY.handle}`, asArgus(), { role: 'secretary' })
    expect(card.status, card.said).toBe(403)

    const again = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, asArgus(), { reason: 'Raise myself' })
    expect(again.status, again.said).toBe(403)

    await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, BY_THEIR_NAME)
  })

  it('5: is written onto a run by the person\'s press and nothing else', async () => {
    // A CLAIM TO BE THE PERSON WITH NO KEY writes no raise either, as it presses none (the inspector's note on run pzdakzeFExuI).
    const keyless = await ask('PATCH', `/api/records/${run}`, BY_THEIR_NAME, {
      dataPatch: { raises: [{ elevation: 'elevation-20260926180000-keyless', from: '2026-09-26 18:00:00', reason: 'A raise with no key' }] },
    })
    expect(keyless.status, keyless.said).toBe(403)
    expect(keyless.said).toContain("without the person's key")

    // A RAISE ON THE RUN, written here by the person with their key, so this case does not lean on the press having written one.
    const seeded = await ask('PATCH', `/api/records/${run}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, {
      dataPatch: { raises: [{ elevation: 'elevation-20260926180000-seed', from: '2026-09-26 18:00:00', reason: 'A raise written here' }] },
    })
    expect(seeded.status, seeded.said).toBe(200)
    const before = (await ask('GET', `/api/records/${run}`, BY_THEIR_NAME)).body['record'].data.raises as unknown
    const written = await ask('PATCH', `/api/records/${run}`, asArgus(), {
      dataPatch: { raises: [{ elevation: 'elevation-made-up', from: '2026-09-26 19:00:00', reason: 'A raise nobody pressed' }] },
    })
    expect(written.status, written.said).toBe(403)
    expect(written.said).toContain("written by the person's press")
    expect((await ask('GET', `/api/records/${run}`, BY_THEIR_NAME)).body['record'].data.raises).toEqual(before)

    // AND NOT TAKEN OFF: the raise stays on the run, by a patch that empties them or by the whole data written again
    // without them.
    expect(Array.isArray(before) && before.length > 0, 'the raise written above is on the run').toBe(true)
    const emptied = await ask('PATCH', `/api/records/${run}`, asArgus(), { dataPatch: { raises: null } })
    expect(emptied.status, emptied.said).toBe(403)
    expect(emptied.said).toContain('take a raise off')
    const whole = { ...((await ask('GET', `/api/records/${run}`, BY_THEIR_NAME)).body['record'].data as Record<string, unknown>) }
    delete whole['raises']
    const rewritten = await ask('PATCH', `/api/records/${run}`, asArgus(), { data: whole })
    expect(rewritten.status, rewritten.said).toBe(403)
    expect(rewritten.said).toContain('take a raise off')
    expect((await ask('GET', `/api/records/${run}`, BY_THEIR_NAME)).body['record'].data.raises).toEqual(before)
  })
})

describe('the page', () => {
  it('6: asks for the person\'s reason beside the press, and shows it while the raise lasts', async () => {
    // THE PROFILE PAGE, loaded as the browser loads it: a window with storage, and the person's name as the page's actor.
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
    storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_TEST_OFFICES_OWNER.id }))
    const pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
    const drawn = async (): Promise<string> => {
      const said = (await ask('GET', `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/profile`, BY_THEIR_NAME)).body
      return renderToStaticMarkup(h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]))
    }

    const before = await drawn()
    expect(before).toContain(thePress(THE_TEST_OFFICES_SECRETARY.name))
    expect(before, 'the press asks for the person\'s reason').toContain(WHY_ASKS)

    const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, { reason: 'Tidy the notes filed twice' })
    expect(pressed.status, pressed.said).toBe(201)
    const during = await drawn()
    expect(during).toContain(END_IT)
    expect(during, 'the person\'s reason, shown while the raise lasts').toContain('Tidy the notes filed twice')

    await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, BY_THEIR_NAME)
  })
})

describe('what a raise carries outside the records', () => {
  it('7: retiring an agent, which the secretary may not do unraised', async () => {
    const started = await ask('POST', '/api/agents/started', BY_THEIR_NAME, { handle: 'ceres', name: 'Ceres', role: 'secretary' })
    expect(started.status, started.said).toBe(201)
    const because = { because: 'A secretary started for a test, now closed' }

    const unraised = await ask('POST', '/api/participants/agent/ceres/retire', asArgus(), because)
    expect(unraised.status, unraised.said).toBe(403)

    const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...BY_THEIR_NAME, ...thePersonsKeyHeader() }, { reason: 'Close the test secretary' })
    expect(pressed.status, pressed.said).toBe(201)
    const raised = await ask('POST', '/api/participants/agent/ceres/retire', asArgus(), { ...because, ...FOR_THE_PERSON })
    expect(raised.status, raised.said).toBe(200)

    await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, BY_THEIR_NAME)
  })
})
