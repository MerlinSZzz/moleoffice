// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER AGENTS MAY INJECT IS ONE SETTING FOR EVERY AGENT. Criterion M91, settled by the owner's decision
 * of 25 September 2026: one switch for all agents, on the Settings page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. With nobody having chosen, an agent's injected message to the person goes through, and the
 *      reading says nobody chose.
 *   2. With the switch off, an injected message is refused, and the refusal names the Settings
 *      page. With it back on, the message goes through.
 *   3. It is one switch for every agent: switching it off refuses two different agents.
 *   4. A `mayInject: false` left on one agent's record changes nothing.
 *   5. Only the person may press it. An agent is refused, the refusal names who may, and nothing is
 *      written. A body the door cannot read is refused before anything is written.
 *   6. The profile says whether agents may inject and where the switch is, and offers no press.
 *   7. A stored value the office cannot read is refused out loud, at the door and at the message.
 *
 * The browser half, the toggle on the Settings page, is
 * tests/the-settings-page-has-the-inject-switch.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   read the switch as off when nobody chose                    → case 1
 *   the message door stops asking the reader                    → cases 2 and 3
 *   read `mayInject` off the agent's record again               → case 4
 *   let an agent through the write door                         → case 5
 *   read an unknown stored value as yes                         → case 7
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { INJECT_WORDS, type MayInject } from '../src/shared/profile.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Its installation row holds the one switch, so each case starts with
 * nobody having chosen and leaves it that way; and a handle belongs to one agent, so each case
 * registers its own two names. A case's records are its own.
 */
let caseNumber = 0
let lark = 'lark'
let wren = 'wren'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** The switch as the door reads it. */
async function theSwitch(): Promise<MayInject> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/agents-may-inject', headers: AS_THE_OWNER })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as MayInject
}

/** One press of the switch. */
async function press(
  body: unknown,
  headers: Record<string, string> = AS_THE_OWNER,
): Promise<{ status: number; said: string }> {
  const reply = await app.inject({ method: 'POST', url: '/api/office/agents-may-inject', headers, payload: body as object })
  return { status: reply.statusCode, said: reply.body }
}

/** Register one agent, with extra data on its record where a case needs it. */
async function register(handle: string, extra: Record<string, unknown> = {}): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', ...extra } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** One injected message from an agent to the person. */
async function inject(handle: string, body: string): Promise<{ status: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'person', id: THE_PERSON }], urgent: true },
    },
  })
  return { status: reply.statusCode, said: reply.body }
}

/** What one agent's profile says about injecting. */
async function itsProfile(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/participants/agent/${handle}/profile`,
    headers: AS_THE_OWNER,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = (reply.json() as { mayInject: Record<string, unknown> | null }).mayInject
  if (said === null) throw new Error('the agent profile said nothing about injecting')
  return said
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  lark = `lark-${String(caseNumber)}`
  wren = `wren-${String(caseNumber)}`
  t.client.sqlite.prepare('UPDATE installation SET agents_may_inject = NULL WHERE only_row = 1').run()
})

afterEach(() => {
  t.client.sqlite.prepare('UPDATE installation SET agents_may_inject = NULL WHERE only_row = 1').run()
})

describe('nobody having chosen reads as agents may inject', () => {
  it('says nobody chose, and lets an injected message through', async () => {
    const before = await theSwitch()
    expect(before).toMatchObject({
      may: true,
      nobodyChose: true,
      says: INJECT_WORDS.nobodyChose,
      whereItIsSet: INJECT_WORDS.whereItIsSet,
    })
    await register(lark)
    const sent = await inject(lark, 'The gripper slipped.')
    expect(sent.status, sent.said).toBe(201)
  })
})

describe('the switch is one for every agent', () => {
  it('refuses an injected message when it is off, names the Settings page, and lets it through when on', async () => {
    await register(lark)
    const off = await press({ may: false })
    expect(off.status, off.said).toBe(200)
    expect(await theSwitch()).toMatchObject({ may: false, nobodyChose: false, says: INJECT_WORDS.switchedOff })

    const no = await inject(lark, 'The gripper slipped.')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('may not inject')
    expect(no.said).toContain('the Settings page')
    expect(no.said).toContain('one switch for every agent')
    expect(no.said).toContain('Nothing was written')

    const on = await press({ may: true })
    expect(on.status, on.said).toBe(200)
    expect(await theSwitch()).toMatchObject({ may: true, nobodyChose: false, says: INJECT_WORDS.switchedOn })
    const yes = await inject(lark, 'The gripper slipped again.')
    expect(yes.status, yes.said).toBe(201)
  })

  it('names the refused agent by its name and handle, not by its minted id', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: { kind: 'agent', title: 'Lark Tester', data: { handle: lark, runtime: 'claude-code', state: 'active' } },
    })
    expect(made.statusCode, made.body).toBe(201)
    const all = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
    const row = (all.json() as { agents: { id: string; handle: string; name: string }[] }).agents.find(
      (one) => one.handle === lark,
    )
    // THE CONTROL: the registry id is not the handle, so naming by id would not name it by handle.
    expect(row).toBeDefined()
    expect(row!.id).not.toBe(lark)

    expect((await press({ may: false })).status).toBe(200)
    const no = await inject(lark, 'The gripper slipped.')
    expect(no.status, no.said).toBe(403)
    const said = String((JSON.parse(no.said) as { error: string }).error)
    expect(said).toContain(`The agent ${row!.name} ("${lark}") may not inject`)
    expect(said).not.toContain(`"${row!.id}"`)
  })

  it('refuses two different agents with one press', async () => {
    await register(lark)
    await register(wren)
    expect((await press({ may: false })).status).toBe(200)
    for (const handle of [lark, wren]) {
      const no = await inject(handle, `From ${handle}.`)
      expect(no.status, `${handle}: ${no.said}`).toBe(403)
      expect(no.said).toContain(INJECT_WORDS.whereItIsSet)
    }
  })

  it('reads nothing from a mayInject left on an agent record', async () => {
    await register(lark, { mayInject: false })
    // THE CONTROL: the field really is on the record, so the case below measures that it is ignored.
    const held = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.mayInject') AS may FROM records WHERE kind = 'agent' AND title = ?")
      .get(lark) as { may: unknown } | undefined
    expect(held?.may).toBe(0)

    expect((await itsProfile(lark))['may']).toBe(true)
    const sent = await inject(lark, 'Still allowed.')
    expect(sent.status, sent.said).toBe(201)
  })
})

describe('only the person may press it', () => {
  it('refuses an agent, names who may, and writes nothing', async () => {
    await register(lark)
    const refused = await press({ may: false }, asAgent(lark))
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain("the owner's own setting")
    expect(refused.said).toContain('The owner switches it on the Settings page')
    expect(refused.said).toContain('Nothing was changed')
    expect((await theSwitch()).nobodyChose).toBe(true)
  })

  it('lets the person press it', async () => {
    const done = await press({ may: false })
    expect(done.status, done.said).toBe(200)
    expect(JSON.parse(done.said)).toMatchObject({ may: false, nobodyChose: false })
  })

  it('refuses a body it cannot read before it writes anything', async () => {
    for (const body of [{ may: 'no' }, {}, { may: false, extra: 1 }]) {
      const wrong = await press(body)
      expect(wrong.status, `${JSON.stringify(body)}: ${wrong.said}`).toBe(400)
    }
    expect((await theSwitch()).nobodyChose).toBe(true)
  })

  it('takes the choice away again with null', async () => {
    expect((await press({ may: false })).status).toBe(200)
    expect((await press({ may: null })).status).toBe(200)
    expect((await theSwitch()).nobodyChose).toBe(true)
  })
})

describe('the profile says where the switch is', () => {
  it('carries the reading, where it is set, and nothing a press could write on', async () => {
    await register(lark)
    expect((await press({ may: false })).status).toBe(200)
    const said = await itsProfile(lark)
    expect(said).toEqual({
      may: false,
      nobodyChose: false,
      says: INJECT_WORDS.switchedOff,
      whereItIsSet: INJECT_WORDS.whereItIsSet,
    })
    expect(INJECT_WORDS.whereItIsSet).toContain('Settings page')
    expect(INJECT_WORDS.whereItIsSet).toContain('every agent')
  })
})

describe('a stored value the office cannot read', () => {
  it('is refused at the door and at the message, never read as yes', async () => {
    await register(lark)
    t.client.sqlite.prepare('UPDATE installation SET agents_may_inject = 7 WHERE only_row = 1').run()
    const reply = await app.inject({ method: 'GET', url: '/api/office/agents-may-inject', headers: AS_THE_OWNER })
    expect(reply.statusCode, reply.body).toBe(500)
    expect(reply.body).toContain('agents_may_inject')
    const sent = await inject(lark, 'Is this allowed?')
    expect(sent.status, sent.said).not.toBe(201)
  })
})
