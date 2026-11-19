// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M110 — BEFORE AN AGENT SENDS, IT CHECKS THE OTHER SIDE IS ONLINE.
 *
 * design/messages/ACCEPTANCE.md, "The retire rule and dead letters": before an agent sends a message, it checks
 * that the other side is online. A message is sent only when the other side can receive it; otherwise it is a
 * message that does nothing. The message door refuses, for an agent sender, a message to an agent that
 * cannot receive it — and says what the sender may do instead: write to the person, to the agent's
 * starter, or to a secretary. The person is never refused by this rule.
 *
 * THE REFUSAL IS SPLIT IN TWO.
 * An agent that is retired cannot receive; refusing that is safe and correct today, and it needs no
 * setting. Refusing a recipient NOTHING IS ANSWERING AS is built as M110 says but sits behind
 * ONE SETTING, MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN, default OFF — because
 * presence is not yet true for an agent started as a subagent (the secretary measured it against the live
 * presence door: every worker of this office reads grey while working, because only a session that
 * runs a waiter reads green), and until M106 (Cluster B) and F9 make it true, refusing on that
 * reading would refuse the live org chart. The refusal sentence names the agent's actual state in the
 * office's words, never a colour.
 *
 * THE SENTENCE IS SHORT AND NAMES NO ROUTE (wave 13n round 31): it says what is wrong and what
 * to do, in words. It no longer names the setting by its variable, the criteria behind it, or
 * GET /api/participants. Where the setting is what refuses, it names the setting by the plain name
 * the Settings page gives it, and the normal-mode place that shows it, "Settings, Chat and messages"
 * (wave 13n round 32, the secretary's choice A in message 4TXyQKeEyRTI). Those names are word keys,
 * and this file reads them from the word list rather than typing them. The picker shows the same
 * sentence under the pointer before anything is sent, so the sentence itself does not say "Nothing
 * was sent"; the door adds that when it refuses.
 *
 * THE SENTENCE IS BUILT FROM FACTS, IN ANY LANGUAGE (wave 13n round 32, the secretary's review):
 * `whatStopsAMessageTo` gives the facts and `theCannotReceiveLine` (src/shared/cannot-receive.ts)
 * says them. The door's English and the picker's Chinese come from the same facts. The state is the
 * presence dot's own word ("it is inactive"), never the reading's inside words ("no run recorded",
 * "No process of this agent is running"). The person is named by their registry name, not "the
 * person", and the sentence no longer says "developer mode".
 *
 * The office is exempt from M110 entirely — the secretary's words, in writing: "the office is not an agent
 * sender. M105 is what makes its messages the office's." That exemption is proved here, because
 * otherwise M110 and F10's reminder mechanism would cancel each other out.
 *
 * Mutation: in src/server/lib/messages.ts, `whatStopsAMessageTo`, change
 * `if (!gone && !refusesGrey) return null` to `return null` unconditionally (the door never
 * refuses anything). Before round 37 of wave 13u the line asked
 * `theDoorRefusesAnAgentWithNoSessionAndNoRun()` itself; the setting is now read once, above it. Every "refused" case below — the retired ones
 * and the grey ones under the setting — goes red. The exemption, person and reachable-agent cases
 * are unaffected, because they never call the mutated line in the first place.
 *
 * Mutation for the setting's name (wave 13n round 32): in src/shared/cannot-receive.ts, make the
 * setting sentence name the setting with words typed there instead of the word key. The cases that
 * look for the plain name go red. In `whatStopsAMessageTo`, making `bySetting` ignore `gone` turns the
 * retired case red. Naming the person by a fixed "the person" turns the person cases red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')
// The registry ids the registrations answered. A new agent's id is not its handle, and a library
// call takes the id.
let wOneId: string
let goneAgentId: string
let secretaryId: string

const THE_OFFICE = { type: 'agent', id: 'mole-office/the-api-server' } as const
const SETTING = 'MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN'
// THE SETTING'S PLAIN NAME AND THE PANEL THAT SHOWS IT, read from the English word list: the
// Settings page draws the same two keys, so the sentence and the page cannot name it two ways.
const english = createI18n('en').t
const PLAIN_NAME = english('settingsPanel.computer.refuseUnanswered')
const THE_PLACE = english('cannotReceive.place', { settings: english('nav.settings'), category: english('settingsCats.cat.chat') })
// THE PERSON'S NAME, as the registry of this test's own office holds it. Read once the office exists.
let personName = ''
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function write(
  headers: Record<string, string>,
  to: { kind: string; id: string }[],
  body: string,
): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to, body } },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  const { readParticipant } = await import('../src/server/lib/participants.ts')
  personName = readParticipant({ kind: 'person', id: THE_PERSON })?.name ?? ''
  groups = await import('../src/server/lib/groups.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const secretary = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  secretaryId = (secretary.json() as { agent: { id: string } }).agent.id
  // w-one is a plain, never-connected registered agent: no session, no run, no open connection —
  // exactly "offline with no session and no run", the office's own presence reading (grey).
  const wOne = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle: 'w-one', name: 'Worker One', role: 'worker' },
  })
  wOneId = (wOne.json() as { agent: { id: string } }).agent.id
  // w-two is the sender: an ordinary registered agent so its own writes are never refused for being
  // unregistered, which would be a different refusal from the one under test.
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle: 'w-two', name: 'Worker Two', role: 'worker' },
  })
  // gone-agent is registered and then retired, so red/retired is reachable as well as grey.
  const reg = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle: 'gone-agent', name: 'Gone Agent', role: 'worker' },
  })
  const record = (reg.json() as { record: string }).record
  // A SEND TO IT NAMES IT BY THIS ID, as the chat does. A write that follows a handle to a retired
  // agent is refused by the resolver before M110 is asked (criterion I2), so the handle would not
  // reach the refusal this file is about.
  goneAgentId = (reg.json() as { agent: { id: string } }).agent.id
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'no longer needed' WHERE handle = 'gone-agent'").run()
  void record
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the setting is off, as it ships, and then only a retired or unknown recipient is refused', () => {
  it('lets a message through to an agent nothing is answering as', async () => {
    const { code, said } = await write(asAgent('w-two'), [{ kind: 'agent', id: 'w-one' }], 'Are you there?')
    // NOTHING HOLDS THE AGENT WRITTEN TO IN THE TEST OFFICE, so the office stores the message, routes it and answers 409.
    // The message is stored all the same. The setting's refusal also answers 409 but stores nothing, so the stored record
    // is what tells the two apart.
    expect(code, 'the offline refusal is behind the setting, which defaults to off').toBe(409)
    expect((said['record'] as { id?: unknown } | undefined)?.id, 'the offline refusal is behind the setting, which defaults to off').toEqual(expect.any(String))
  })

  it('refuses a message to a retired agent, and says it is retired', async () => {
    const { code, said } = await write(asAgent('w-two'), [{ kind: 'agent', id: goneAgentId }], 'Still working?')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain('retired')
    expect(why).not.toContain(SETTING)
  })

  it('names the alternatives: the starter and a registered secretary', async () => {
    const { said } = await write(asAgent('w-two'), [{ kind: 'agent', id: goneAgentId }], 'Still working?')
    const why = String(said['error'])
    // EVERY AGENT BY THE NAME THE REGISTRY HOLDS, never by its handle (wave 13n round 33).
    expect(why).toContain(`"${THE_TEST_OFFICES_SECRETARY.name}"`) // gone-agent's starter
    expect(why).not.toContain(`"${THE_TEST_OFFICES_SECRETARY.handle}"`)
    expect(why).toContain('The agent "Gone Agent" cannot get messages now')
    // THE PERSON BY THEIR NAME, never "the person".
    expect(personName.length, 'the test office holds a name for the person').toBeGreaterThan(0)
    expect(why).toContain(`Write to ${personName} or its starter "${THE_TEST_OFFICES_SECRETARY.name}" instead.`)
    expect(why).not.toContain('the person')
  })
})

describe('with the setting on, the door refuses a recipient nothing is answering as', () => {
  beforeAll(() => {
    process.env[SETTING] = '1'
  })
  afterAll(() => {
    delete process.env[SETTING]
  })

  // Mutation: map every grey word except Inactive to offline again. This case must fail.
  it('names an agent at work in an office terminal by the dot\'s own word, never offline', async () => {
    const registered = await app.inject({
      method: 'POST', url: '/api/agents/started',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { handle: 'terminal-worker', name: 'Terminal Worker', role: 'worker' },
    })
    expect(registered.statusCode).toBe(201)
    const id = (registered.json() as { agent: { id: string } }).agent.id
    t.api.createRecord({
      workspaceId: 'default', kind: 'session', title: 'Synthetic work in an office terminal',
      data: {
        state: 'running', servingAgentId: id,
        extra: { inATerminal: { terminal: 'synthetic-terminal' } },
      },
      actor: { type: 'agent', id },
    })
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    const { whatStopsAMessageTo, whyThisAgentCannotReceiveAMessage } = await import('../src/server/lib/messages.ts')
    const { theCannotReceiveLine } = await import('../src/shared/cannot-receive.ts')
    const to = { kind: 'agent', id } as const
    const reading = participantPresence(to, 'default')
    expect(reading.colour).toBe('grey')
    expect(reading.word).toBe('In a terminal')
    expect(reading.says).toContain('Working in a terminal is not the same as taking messages.')
    const facts = whatStopsAMessageTo(to, 'default')
    expect(facts).toMatchObject({ state: 'in a terminal', bySetting: true })
    const clause = "it is at work in one of the office's terminals, and a terminal cannot take a message"
    const shown = theCannotReceiveLine(facts!, english)
    expect(shown).toContain(`cannot get messages now: ${clause}.`)
    expect(shown).toBe(whyThisAgentCannotReceiveAMessage(to, 'default'))
    const { code, said } = await write(asAgent('w-two'), [to], 'Can you take this message?')
    expect(code).toBe(409)
    expect(String(said['error'])).toBe(`${shown} Nothing was sent.`)
    // The existing setting name contains "offline"; the sentence about this agent must not.
    expect(String(said['error']).split('. ')[0]!.toLowerCase()).not.toContain('offline')
    expect(String(said['error'])).toContain(`The setting "${PLAIN_NAME}" is on, so Mole Office refuses messages to it.`)
  })

  it('refuses a message to a grey agent — no session holds its handle, no run is going, no connection is open', async () => {
    const { code, said } = await write(asAgent('w-two'), [{ kind: 'agent', id: 'w-one' }], 'Are you there?')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain('The agent "Worker One" cannot get messages now')
  })

  it('the refusal names the agent\'s actual state in the office\'s words, not a colour', async () => {
    const { said } = await write(asAgent('w-two'), [{ kind: 'agent', id: 'w-one' }], 'Are you there?')
    const why = String(said['error'])
    // THE DOT'S OWN WORD for the reading, checkable by a person against the dot, and never the word
    // for the colour itself or the reading's inside words.
    expect(why).toContain('cannot get messages now: it is inactive.')
    expect(why).not.toContain('grey')
    expect(why).not.toContain('no run recorded')
    expect(why).not.toContain('No process')
    expect(why).not.toContain('connection')
  })

  it('the refusal names the setting as the Settings page names it, says where it is shown, and names no variable, criterion or route', async () => {
    const { said } = await write(asAgent('w-two'), [{ kind: 'agent', id: 'w-one' }], 'Are you there?')
    const why = String(said['error'])
    expect(why).toContain(`The setting "${PLAIN_NAME}" is on, so Mole Office refuses messages to it.`)
    expect(why).toContain(`You can see that setting in ${THE_PLACE}.`)
    expect(THE_PLACE).toBe('Settings, Chat and messages')
    expect(why).not.toContain('developer mode')
    expect(why).not.toContain(SETTING)
    expect(why).not.toContain('M106')
    expect(why).not.toContain('/api/')
    expect(why).toContain('Nothing was sent.')
  })

  it('the sentence the picker shows under the pointer is the same, without "Nothing was sent"', async () => {
    const { whyThisAgentCannotReceiveAMessage } = await import('../src/server/lib/messages.ts')
    const shown = whyThisAgentCannotReceiveAMessage({ kind: 'agent', id: wOneId }, 'default')
    expect(shown).not.toBeNull()
    expect(shown).toContain(`The setting "${PLAIN_NAME}" is on, so Mole Office refuses messages to it.`)
    expect(shown).not.toContain('Nothing was')
    expect(shown).not.toContain('/api/')
    const { said } = await write(asAgent('w-two'), [{ kind: 'agent', id: 'w-one' }], 'Are you there?')
    expect(String(said['error'])).toBe(`${String(shown)} Nothing was sent.`)
  })

  it('refuses a message to a retired agent whatever the setting is, and says it is retired', async () => {
    const { code, said } = await write(asAgent('w-two'), [{ kind: 'agent', id: goneAgentId }], 'Still working?')
    expect(code).toBe(409)
    const why = String(said['error'])
    expect(why).toContain('retired')
    expect(why).not.toContain(SETTING)
    expect(why, 'a retired agent is refused whatever the setting says').not.toContain(PLAIN_NAME)
    expect(why, 'a retired agent is refused whatever the setting says').not.toContain('The setting')
    expect(why).not.toContain('/api/')
    // SHORT: it was about 90 words with a route in it.
    expect(why.split(/\s+/).filter(Boolean).length, why).toBeLessThanOrEqual(50)
  })

  it('names the alternatives: the starter and a registered secretary', async () => {
    const { said } = await write(asAgent('w-two'), [{ kind: 'agent', id: 'w-one' }], 'Are you there?')
    const why = String(said['error'])
    expect(why).toContain(`"${THE_TEST_OFFICES_SECRETARY.name}"`) // w-one's starter
    expect(why).toContain(`Write to ${personName} or its starter "${THE_TEST_OFFICES_SECRETARY.name}" instead.`)
    expect(why).not.toContain('the person')
  })


  it('spaces a Latin name from the Chinese words around it, by the one spacing rule, in every join', async () => {
    const { theCannotReceiveLine } = await import('../src/shared/cannot-receive.ts')
    const { breaksTheSpacing } = await import('../src/shared/spacing.ts')
    const chinese = createI18n('zh').t
    // THE SECRETARY'S REVIEW of round 32 found "Avery加入了群聊", with a person's name where Avery stands here; this
    // sentence had the same fault: "请改为写给Avery。" and "Avery或它的启动者". Made-up facts, with every kind of name the
    // sentence can hold.
    const many = { agent: 'w-one', state: 'inactive' as const, bySetting: true, person: 'Avery Example', starter: 'builder', secretaries: ['Reed', 'Quill'] }
    const one = { ...many, bySetting: false, starter: null, secretaries: [] }
    for (const said of [many, one]) {
      const inChinese = theCannotReceiveLine(said, chinese)
      expect(breaksTheSpacing(inChinese), inChinese).toEqual([])
    }
    expect(theCannotReceiveLine(one, chinese)).toContain('请改为写给 Avery Example。')
    expect(theCannotReceiveLine(many, chinese)).toContain('写给 Avery Example、它的启动者“builder”或一位秘书')
    // AND THE ENGLISH KEEPS ITS OWN SPACES: no space is put before a comma.
    expect(theCannotReceiveLine(many, english)).toContain('Write to Avery Example, its starter "builder" or a secretary ("Reed", "Quill") instead.')
  })

  it('writes nothing on a refused send: no message record is created', async () => {
    const before = (await (await app.inject({ method: 'GET', url: '/api/messages' })).json() as { messages: unknown[] }).messages.length
    await write(asAgent('w-two'), [{ kind: 'agent', id: 'w-one' }], 'One more try')
    const after = (await (await app.inject({ method: 'GET', url: '/api/messages' })).json() as { messages: unknown[] }).messages.length
    expect(after).toBe(before)
  })
})

describe('the person is never refused by this rule, setting on or off', () => {
  it('lets an agent write to the person even though the person is "grey" by the same measure', async () => {
    process.env[SETTING] = '1'
    try {
      const { code } = await write(asAgent('w-two'), [{ kind: 'person', id: THE_PERSON }], 'A report for the owner')
      expect(code).toBe(201)
    } finally {
      delete process.env[SETTING]
    }
  })
})

describe('an agent whose recipient is reachable is never touched by this rule', () => {
  beforeAll(() => { process.env[SETTING] = '1' })
  afterAll(() => { delete process.env[SETTING] })

  // Mutation: remove extra.discovered below. The hold alone is grey, and the green assertion fails.
  it('lets a message through to an agent a live session answers as', async () => {
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: `A live session answering as ${THE_TEST_OFFICES_SECRETARY.handle}`,
      data: {
        state: 'running',
        extra: { discovered: { tool: 'claude-code', externalId: 'reachable-secretary', logPath: fakeTranscript('reachable-secretary'), resumeCommand: null, startedAt: null, entryPoint: null } },
      },
      actor: { type: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
    }).id
    const held = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { session, runtime: 'claude-code' },
    })
    expect(held.statusCode).toBe(201)
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    expect(participantPresence({ kind: 'agent', id: secretaryId }, 'default').colour).toBe('green')
    const { code } = await write(asAgent('w-two'), [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }], 'Reporting up')
    expect(code).toBe(201)
  })
})

describe('the office itself is exempt from M110 entirely', () => {
  it('writes to a grey, unreachable agent without being refused, because the office is not an agent sender', () => {
    expect(() =>
      groups.writeASystemLineToOne(
        { kind: 'agent', id: wOneId },
        'default',
        { line: 'A reminder', said: 'Re-read the regulations after a compaction.', notice: 'aCounterFired' },
        THE_OFFICE,
      ),
    ).not.toThrow()
  })

  it('writes to a retired agent without being refused, for the same reason', () => {
    expect(() =>
      groups.writeASystemLineToOne(
        { kind: 'agent', id: goneAgentId },
        'default',
        { line: 'Closing out', said: null, notice: 'aCounterFired' },
        THE_OFFICE,
      ),
    ).not.toThrow()
  })

  it('stays exempt with the setting on, which is what a reminder needs', () => {
    process.env[SETTING] = '1'
    try {
      expect(() =>
        groups.writeASystemLineToOne(
          { kind: 'agent', id: wOneId },
          'default',
          { line: 'A reminder with the setting on', said: null, notice: 'aCounterFired' },
          THE_OFFICE,
        ),
      ).not.toThrow()
    } finally {
      delete process.env[SETTING]
    }
  })
})

/**
 * WHAT M106 (CLUSTER B) HAS TO MAKE TRUE, CARRIED HERE AND NOT LOOSENED.
 *
 * Presence is not yet true for an agent started as a
 * subagent — one with a live session and no waiter reads grey while working perfectly well. When
 * M106 makes presence true for them, this expectation holds and the skip comes off. It is NOT
 * loosened to pass today: with the setting on, a live subagent session still reads grey, so an
 * unskipped run of this test would go red against the door as it stands — which is exactly the
 * gap M106 closes.
 */
describe.skip('what M106 must make true, and this test waits for it unloosened', () => {
  it('a registered agent with a live subagent session and no waiter is not refused', async () => {
    process.env[SETTING] = '1'
    try {
      await app.inject({
        method: 'POST',
        url: '/api/agents/started',
        headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
        payload: { handle: 'sub-worker', name: 'Sub Worker', role: 'worker' },
      })
      // A live subagent session: a session record serving the agent, state running, and no waiter
      // holding its handle — the exact state every worker of this office is in while it works.
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title: 'A live subagent session, no waiter',
        data: { state: 'running', servingAgent: 'sub-worker' },
        actor: { type: 'agent', id: 'sub-worker' },
      })
      const { code } = await write(asAgent('w-two'), [{ kind: 'agent', id: 'sub-worker' }], 'Into the working one')
      expect(code).toBe(201)
    } finally {
      delete process.env[SETTING]
    }
  })
})
