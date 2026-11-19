// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT WITH RUNS ON RECORD IS NOT CALLED INACTIVE, AND INACTIVE HAS ONE MEANING IN BOTH LANGUAGES. Wave 13k
 * round 39, piece 4.
 *
 * The decision: an agent that is registered and has no run recorded is inactive. The
 * presence reading measured something else, whether a run that has not ended had said when it last spoke. So an
 * agent whose two runs had finished read "Inactive" and "Registered, and no run recorded" in English, and 尚未运行
 * ("has not run yet") in Chinese, on a profile that listed its two runs. Both were false.
 *
 * WHAT IS CLAIMED:
 *
 *   1. An agent with no run recorded reads Inactive, with the inactive sentence.
 *   2. An agent whose runs have ended reads Offline, with the offline sentence, whether the run names the agent by
 *      its own record (as a run bound by the office does, and as the profile's list of runs reads it) or by its
 *      registry id.
 *   3. A run that is still marked running and never said when it spoke is a run as well: Offline, not Inactive.
 *   4. The Chinese word for Inactive is the same on the profile and on the home page's list of agents, so the one
 *      state does not read as "has not run yet" in one place and "not switched on" in another.
 *
 * MADE-UP RECORDS, in a fresh test database: one agent and its runs.
 *
 * MUTATIONS, each after a control run (the commit that added this file names the logs):
 *   - src/server/lib/presence.ts: Inactive whenever no open run said when it spoke, the old rule. Cases 2 and 3 go red.
 *   - src/server/lib/presence.ts: a run found by the registry id and the handle only, not by the agent's own record.
 *     The first case of 2 and case 3 go red, the two whose runs name the agent's own record.
 *   - src/shared/words/zh.ts: the home page's 未启用 again. Case 4 goes red.
 *
 * NOT HERE: the chat's sentence about who cannot take a message, and its setting, say 未启用 for the same state. They
 * are wave 13n's words, and the round's report names them for 13n.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PRESENCE } from '../src/shared/lifecycle.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'

type PresenceLib = typeof import('../src/server/lib/presence.ts')

const HUMAN = { type: 'human', id: THE_PERSON } as const
const HANDLE_PREFIX = 'made-up-runner'

let t: TestDb
let presence: PresenceLib
let agent: ParticipantRef
let agentRecord = ''
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  presence = await import('../src/server/lib/presence.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  const handle = `${HANDLE_PREFIX}-${caseNumber}`
  agentRecord = t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'agent',
    title: 'A made-up agent for this test',
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: HUMAN,
  }).id
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, 'the registry holds the made-up agent').toBeDefined()
  agent = { kind: 'agent', id: row!.id }
})

/** A run of the made-up agent, bound by the id given, in the state given, that never said when it spoke. */
function aRunBoundTo(agentId: string, state: 'finished' | 'running'): void {
  const input = {
    workspaceId: 'panelx',
    kind: 'session' as const,
    title: `A made-up ${state} run`,
    data: { state, runtime: 'claude-code', ranAs: [{ workspaceId: 'panelx', agentId }] },
    actor: HUMAN,
  }
  if (state === 'finished') historicalSession(t, input)
  else t.api.createRecord(input)
}

describe('the word under the grey dot', () => {
  it('1. an agent with no run recorded is Inactive', () => {
    const reading = presence.participantPresence(agent, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.word).toBe(PRESENCE.inactive.word)
    expect(reading.says).toBe(PRESENCE.inactive.sentence)
  })

  it('2. an agent with two finished runs bound to its own record is Offline, not Inactive', () => {
    expect(agentRecord, 'the agent record is not the registry row').not.toBe(agent.id)
    aRunBoundTo(agentRecord, 'finished')
    aRunBoundTo(agentRecord, 'finished')
    const reading = presence.participantPresence(agent, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.word).toBe(PRESENCE.offline.word)
    expect(reading.says).toBe(PRESENCE.offline.sentence)
    const row = presence.everybodysPresence('panelx').find((one) => one.who.kind === 'agent' && one.who.id === agent.id)
    expect(row?.word, 'the roster reads the same').toBe(PRESENCE.offline.word)
  })

  it('2. a finished run bound by the registry id is a run as well', () => {
    aRunBoundTo(agent.id, 'finished')
    expect(presence.participantPresence(agent, 'panelx').word).toBe(PRESENCE.offline.word)
  })

  it('3. a run still marked running that never said when it spoke is a run as well', () => {
    aRunBoundTo(agentRecord, 'running')
    expect(presence.participantPresence(agent, 'panelx').word).toBe(PRESENCE.offline.word)
  })
})

describe('one meaning in both languages', () => {
  it('4. the profile and the home page say Inactive in one Chinese word, and one English word', () => {
    for (const language of ['en', 'zh'] as const) {
      const { t: say } = createI18n(language)
      expect(say('home.agentPresence.inactive'), language).toBe(say('g6b.profile.inactive'))
    }
    expect(createI18n('en').t('g6b.profile.inactive')).toBe(PRESENCE.inactive.word)
  })
})
