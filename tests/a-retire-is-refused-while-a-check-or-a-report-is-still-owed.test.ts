// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RETIRE IS REFUSED WHILE A CHECK OR A REPORT IS STILL OWED, AS THE OWNER DECIDED.
 *
 * Option A of proposal `Dbo6FNK86ohz`: while a check or a report of a run is not yet concluded, retiring the
 * agent is refused, and the refusal says what is still owed. This is the premise F12 step 10 needs: a
 * supervisor retires its workers at the end of a cluster, and an office that let the retire through
 * while a run of that worker still waited on a check was the office losing the conclusion — the two
 * incidents behind the proposal.
 *
 * WHAT IS MEASURED
 *
 *   · a run standing `inspecting` (it said its work was finished, nothing released it) blocks the
 *     retire, with 409 and one sentence naming the run id, the check id, the standing word and who
 *     the run is waiting on;
 *   · a run standing `reporting` (a release recorded, the report waiting for the starter's confirm)
 *     blocks the retire, and names its waiter;
 *   · a run standing `closed` (its supervisor confirmed the report) does NOT block;
 *   · a run that never said it was finished and has no check asked does NOT block;
 *   · an agent with no runs at all does NOT block;
 *   · nothing is written on a refused retire: the row is not retired.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS REFUSAL RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `whatRetiringWhileACheckIsOwed` and `theRetireSentenceWhileACheckIsOwed` from the retire
 *   door in src/server/api/participants.ts → every "refused" case below goes red and every
 *   "allowed" case stays green, so both halves say what the check caught. The control is this file
 *   as committed: run it once unmutated, then remove the two calls, then restore byte-identical.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Retire through the door, and give back its status and body. */
async function retire(handle: string): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': 'default' },
    payload: { because: 'the piece of work is done' },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: handle === THE_TEST_OFFICES_SECRETARY.handle ? AS_THE_PERSON : asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle, name: handle, role: handle === THE_TEST_OFFICES_SECRETARY.handle ? 'secretary' : 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/**
 * A run of one agent, standing where the case needs it: opened as `running`, then patched to say
 * what it says, through `historicalSession` — the fixture-shaped way to reach a standing without
 * standing up the whole seal machinery, and the same way
 * tests/an-inspector-releases-or-refuses-in-one-act.test.ts does it.
 */
function aRun(handle: string, extra: Record<string, unknown> = {}): string {
  const made = historicalSession(t, {
    workspaceId: 'default',
    kind: 'session',
    title: `${handle}'s run`,
    actor: { type: 'agent', id: handle },
    data: { state: 'finished', servingAgent: handle, cutFrom: 'main', doing: 'building it', ...extra },
  })
  return made.id
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register(THE_TEST_OFFICES_SECRETARY.handle)
})

afterAll(() => {
  app.close()
  t.close()
})

describe('retire is refused while a check or a report is still owed, and says what is owed', () => {
  it('refuses, with 409, one sentence naming the run, the check, the standing and who is waited on', async () => {
    await register('looking-agent')
    const run = aRun('looking-agent', {
      theCheck: {
        askedAt: '2026-09-16 10:00:00',
        askedOf: 'an anonymous-inspector',
        message: 'check-request-message-1',
        checkout: {},
        says: 'The office asked an inspector to check this run.',
      },
    })
    const { code, said } = await retire('looking-agent')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain(`run ${run}`)
    expect(why).toContain('check-request-message-1')
    expect(why).toContain('being checked')
    expect(why).toContain('waits for')
    expect(why).toContain('Nothing was written.')
    const row = t.client.sqlite
      .prepare("SELECT retired FROM agents WHERE handle = 'looking-agent'")
      .get() as { retired: number }
    expect(row.retired, 'the refused retire writes nothing').toBe(0)
  })

  it('refuses a released run with no recorded recipient and says anybody registered may confirm it', async () => {
    await register('confirm-me')
    const run = aRun('confirm-me', {
      released: { by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-16 10:00:00', how: 'its starter' },
    })
    const { code, said } = await retire('confirm-me')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain(`run ${run}`)
    expect(why).toContain('waiting for its report to be confirmed')
    expect(why).toContain('anybody registered may confirm it')
    expect(why).not.toContain('supervisor')
    expect(why).toContain('confirm')
  })
})

describe('what is not owed does not block a retire', () => {
  it('an agent over whose runs everything is closed may be retired', async () => {
    await register('all-closed')
    const _ = aRun('all-closed', {
      released: { by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-16 10:00:00', how: 'its starter' },
      confirmed: { by: { kind: 'person', id: THE_PERSON }, at: '2026-09-16 11:00:00', because: 'the report is sound' },
    })
    const { code, said } = await retire('all-closed')
    expect(code, JSON.stringify(said)).toBe(200)
  })

  it('a run that never said it was finished and has no check asked does not block', async () => {
    await register('still-working')
    const _ = aRun('still-working', { state: 'running' })
    const { code, said } = await retire('still-working')
    expect(code, JSON.stringify(said)).toBe(200)
  })

  it('an agent with no runs at all may be retired', async () => {
    await register('no-runs')
    const { code, said } = await retire('no-runs')
    expect(code, JSON.stringify(said)).toBe(200)
  })
})


/** These gate choices, agents and counts are made up in this test's temporary office. */
describe('the retire gate counts a request only when a check or a report is owed', () => {
  const setting = 'MOLE_OFFICE_GATE_RETIRE_WHILE_OWED'
  const released = { released: { by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, at: '2026-09-16 10:00:00', how: 'its starter' } }
  beforeEach(() => {
    t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(setting)
    t.client.sqlite.prepare('DELETE FROM gate_counts WHERE gate = ?').run('retire-while-owed')
  })
  const count = () => t.client.sqlite.prepare('SELECT would_stop, stopped, reminded, ignored, heeded FROM gate_counts WHERE gate = ?').get('retire-while-owed')
  const retired = (handle: string) => (t.client.sqlite.prepare('SELECT retired FROM agents WHERE handle = ?').get(handle) as {retired: number}).retired
  const save = (value: string) => app.inject({method: 'POST', url: '/api/office/settings', headers: {...AS_THE_PERSON, 'x-mole-office-workspace': 'default'}, payload: {changes: [{name: setting, value}], because: 'Made-up retire gate choice'}})

  it('says in both gate words what block refuses and what off leaves owed', () => {
    const words = 'At block, refuse to retire an agent while a check or a report of one of its runs is still owed, and say what is owed. At off, retire the agent anyway. What the retired agent still owed is not passed on.'
    for (const key of ['gates.row.retire-while-owed', 'settingsWords.MOLE_OFFICE_GATE_RETIRE_WHILE_OWED']) expect(theWordAPageDraws('en', key)).toBe(words)
  })

  it('at the default block keeps the exact 409 sentence and live agent, and the count survives the refusal', async () => {
    const handle = 'made-up-owed-block'
    await register(handle)
    const run = aRun(handle, released)
    expect(t.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(setting)).toBeUndefined()
    expect(count()).toBeUndefined()
    const {code, said} = await retire(handle)
    expect(code, JSON.stringify(said)).toBe(409)
    expect(said['error']).toBe(
      `Retiring "${handle}" is refused while a check or a report of its runs is still owed: run ${run} stands waiting for its report to be confirmed and waits for the report to be confirmed. Nobody is recorded as having been told, so anybody registered may confirm it.. Settle that first; nothing can be closed on a run whose check or report has not finished. Nothing was written.`,
    )
    expect(retired(handle)).toBe(0)
    expect(count(), 'the counter write stands after the refused request returns').toEqual({would_stop: 1, stopped: 1, reminded: 0, ignored: 0, heeded: 0})
    expect((await retire(handle)).code).toBe(409)
    expect(count(), 'a second request adds exactly one encounter').toEqual({would_stop: 2, stopped: 2, reminded: 0, ignored: 0, heeded: 0})
  })

  it('at saved off retires with an owed report and returns no reminder', async () => {
    const handle = 'made-up-owed-off'
    await register(handle)
    aRun(handle, released)
    const saved = await save('off')
    expect(saved.statusCode, saved.body).toBe(200)
    const {code, said} = await retire(handle)
    expect(code, JSON.stringify(said)).toBe(200)
    expect(retired(handle)).toBe(1)
    expect(Object.keys(said).sort()).toEqual(['agent', 'keysRevoked', 'narrowedByPermission'])
    expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0, ignored: 0, heeded: 0})
  })

  it.each(['block', 'off'])('with two owed runs at %s counts once for the retire request', async (position) => {
    const handle = `made-up-two-owed-${position}`
    await register(handle)
    const first = aRun(handle)
    const second = aRun(handle, released)
    if (position === 'off') {
      const saved = await save(position)
      expect(saved.statusCode, saved.body).toBe(200)
    }
    const {code, said} = await retire(handle)
    expect(code, JSON.stringify(said)).toBe(position === 'block' ? 409 : 200)
    expect(retired(handle)).toBe(position === 'block' ? 0 : 1)
    if (position === 'block') {
      expect(said['error']).toContain(`run ${first}`)
      expect(said['error']).toContain(`run ${second}`)
    }
    expect(count(), 'two owed runs are one encounter at the retire door').toEqual({would_stop: 1, stopped: position === 'block' ? 1 : 0, reminded: 0, ignored: 0, heeded: 0})
  })

  it.each(['block', 'off'])('with nothing owed at %s retires and writes no counter row', async (position) => {
    const handle = `made-up-nothing-owed-${position}`
    await register(handle)
    aRun(handle, {state: 'running'})
    if (position === 'off') {
      const saved = await save(position)
      expect(saved.statusCode, saved.body).toBe(200)
    }
    const {code, said} = await retire(handle)
    expect(code, JSON.stringify(said)).toBe(200)
    expect(retired(handle)).toBe(1)
    expect(count()).toBeUndefined()
  })

  it('refuses remind with the settings door words for the positions this gate allows', async () => {
    const reply = await save('remind')
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json().error).toBe('MOLE_OFFICE_GATE_RETIRE_WHILE_OWED is "remind", and it must be block or off. Nothing was guessed from it. Nothing was changed.')
    expect(count()).toBeUndefined()
    expect(t.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(setting)).toBeUndefined()
  })
})
