// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE AGENT'S PRESENCE READS THE SESSIONS THAT COULD BE ITS RUNS, NOT EVERY SESSION OF THE PROJECT. Wave 13j, item 0.
 *
 * MEASURED FIRST, 18 October 2026, on a made-up office of the live shape: one `GET /api/participants/agent/:id/profile`
 * spent 172 to 183 ms of its 655 reading every live session of the project for the words beside the agent's grey dot,
 * and drizzle parsed the data of each one. Three readers use those rows, and each keeps only the runs that name this
 * agent: the output sign and the run that makes the agent Offline rather than Inactive by `ranAs`, and the terminal
 * sign by `servingAgentId`. Most sessions are other agents' runs.
 *
 * WHAT THIS HOLDS:
 *   1. the three readers parse no more JSON for one agent when the project holds three times as many sessions of other
 *      agents. Before the change each session of the project was parsed once for them, so the count grew with them.
 *      The whole presence is not counted, because the reading of who is answering reads the project's runs for itself,
 *      and that reading is not this change;
 *   2. the presence of each agent read alone is the presence the roster reads for it, from every session of the
 *      project: an agent whose runs name its record, one whose run names its handle, one with a recent output, one at
 *      work in two terminals where the newest run names the folder, one whose only sessions are another agent's runs,
 *      a run for another project, a deleted session and a session of another project, and one with no record in the
 *      project. Each gives the word it gave before.
 *
 * CONTROL: case 1 is red before the change. Case 2 is a guard and passes before and after. It goes red if the narrowing
 * drops a session one of the three readers keeps.
 *
 * MUTATION: make the narrowing in `sessionRecordsThatCouldBeOf` (src/server/lib/presence.ts) keep every session, so one
 * agent's presence reads them all again. Case 1 goes red. The commit that added this file names the logs.
 *
 * The agents and sessions here are made up for this file and stand for nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

type Presence = typeof import('../src/server/lib/presence.ts')

const HUMAN = { type: 'human', id: THE_PERSON } as const
const HERE = 'default'
const THERE = 'panelx'
const READERS = ['minutesSinceARunOfThisAgentSpoke', 'theTerminalThisAgentWorksIn', 'aRunOfThisAgentIsRecorded']

/** Sessions of other agents at the smaller size, and how many more are added for the larger one. */
const OTHERS = 25
const MORE = 50

type Agent = { id: string; handle: string; record: string }

let t: TestDb
let presence: Presence
const agents = new Map<string, Agent>()
const NOW = new Date()

/** A made-up agent with a record in that project. */
function anAgent(handle: string, workspaceId: string): Agent {
  const record = t.api.createRecord({ workspaceId, kind: 'agent', title: `Made-up agent ${handle}`, data: { handle, runtime: 'claude-code', state: 'active' }, actor: HUMAN }).id
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id?: unknown } | undefined
  expect(typeof row?.id, `the registry holds ${handle}`).toBe('string')
  const made = { id: String(row!.id), handle, record }
  agents.set(handle, made)
  return made
}

/** A finished session of that project. */
function aFinishedSession(workspaceId: string, title: string, data: Record<string, unknown>): string {
  return historicalSession(t, { workspaceId, actor: HUMAN, kind: 'session', title, data: { state: 'finished', ...data } }).id
}

/** A running session of this project, with more data put into what is stored. */
function aRunningSession(title: string, data: Record<string, unknown>, stored: Record<string, unknown> = {}): string {
  const id = t.api.createRecord({ workspaceId: HERE, kind: 'session', title, data: { state: 'running', ...data }, actor: HUMAN }).id
  if (Object.keys(stored).length > 0) {
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...(JSON.parse(row.data) as Record<string, unknown>), ...stored }), id)
  }
  return id
}

const boundTo = (id: string, workspaceId = HERE): { ranAs: { workspaceId: string; agentId: string }[] } => ({ ranAs: [{ workspaceId, agentId: id }] })

function sessionsOfAnotherAgent(count: number): void {
  const other = agents.get('made-up-busy')!
  for (let i = 0; i < count; i++) aFinishedSession(HERE, `A made-up run ${String(i)} of another agent`, { ...boundTo(other.record), servingAgent: other.handle, servingAgentId: other.id })
}

/** How many times JSON.parse runs under the three readers while one agent's presence is read. */
function parsesUnderTheReaders(who: Agent): number {
  const real = JSON.parse
  const limit = Error.stackTraceLimit
  let counted = 0
  Error.stackTraceLimit = Infinity
  JSON.parse = function (this: unknown, ...values: Parameters<typeof JSON.parse>) {
    const stack = new Error().stack ?? ''
    if (READERS.some((name) => stack.includes(name))) counted++
    return real.apply(JSON, values)
  } as typeof JSON.parse
  try {
    presence.participantPresence({ kind: 'agent', id: who.id }, HERE, NOW)
  } finally {
    JSON.parse = real
    Error.stackTraceLimit = limit
  }
  return counted
}

beforeAll(async () => {
  t = await freshDb()
  presence = await import('../src/server/lib/presence.ts')
  anAgent('made-up-busy', HERE)

  // RAN BEFORE, AND ITS RUNS NAME ITS RECORD ONLY, so only the run that makes it Offline rather than Inactive finds them.
  const byRecord = anAgent('made-up-by-record', HERE)
  aFinishedSession(HERE, 'A finished run naming the record', boundTo(byRecord.record))
  // RAN BEFORE, AND ITS RUN NAMES ITS HANDLE.
  const byHandle = anAgent('made-up-by-handle', HERE)
  aFinishedSession(HERE, 'A finished run naming the handle', boundTo(byHandle.handle))
  // A RUN THAT WROTE DOWN OUTPUT A FEW MINUTES AGO AND HAS NOT ENDED, bound by the registry id.
  const speaking = anAgent('made-up-speaking', HERE)
  aRunningSession('A run with recent output', { ...boundTo(speaking.id), lastOutputAt: localStamp(new Date(NOW.getTime() - 3 * 60_000)) })
  // AT WORK IN TWO OF THE OFFICE'S TERMINALS. The one filed last is moved to an older time than the other, so the
  // folder named is the newest run's by time and not by filing.
  const atWork = anAgent('made-up-at-work', HERE)
  aRunningSession('The newer terminal run', { servingAgent: atWork.handle, servingAgentId: atWork.id, workingDirectory: '/made-up/the-newer-folder' }, { extra: { inATerminal: { terminal: 'made-up-terminal-one' } } })
  const moved = aRunningSession('The terminal run moved back in time', { servingAgent: atWork.handle, servingAgentId: atWork.id, workingDirectory: '/made-up/the-older-folder' }, { extra: { inATerminal: { terminal: 'made-up-terminal-two' } } })
  const stamp = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(moved) as { at: string }).at
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(`2020${stamp.slice(4)}`, moved)
  // NEVER RAN HERE, though sessions name it: another agent's run that names it for another project, a run for another
  // project, a deleted run, and a run of it in another project.
  const named = anAgent('made-up-named-elsewhere', HERE)
  aFinishedSession(HERE, 'Another agent’s run naming it for another project', { ranAs: [{ workspaceId: THERE, agentId: named.record }, { workspaceId: HERE, agentId: agents.get('made-up-busy')!.record }] })
  aFinishedSession(HERE, 'A run for another project', boundTo(named.record, THERE))
  const deleted = aFinishedSession(HERE, 'A deleted run', boundTo(named.record))
  t.api.deleteRecord(deleted, HUMAN)
  aFinishedSession(THERE, 'A run in another project', boundTo(named.record))
  // NO RECORD IN THIS PROJECT, and a session here names the record it has in another.
  const noRecord = anAgent('made-up-no-record-here', THERE)
  aFinishedSession(HERE, 'A run naming its record in another project', boundTo(noRecord.record))

  sessionsOfAnotherAgent(OTHERS)
}, 120_000)

afterAll(() => {
  t?.close()
})

describe('one agent’s presence', () => {
  it('1. is read with no more JSON parsed by the three session readers when the project holds three times as many sessions of other agents', () => {
    const who = agents.get('made-up-by-record')!
    // ONE READ FIRST, so what a first read keeps for the rest of the process is not counted at the smaller size only.
    parsesUnderTheReaders(who)
    const smaller = parsesUnderTheReaders(who)
    sessionsOfAnotherAgent(MORE)
    const larger = parsesUnderTheReaders(who)
    // THE AGENT'S OWN RUN IS PARSED, so a count of nothing would mean the readers are not where this looks.
    expect(smaller, 'no JSON.parse under the three readers').toBeGreaterThan(0)
    expect(larger, `JSON.parse calls under the three readers with ${String(MORE)} more sessions of another agent`).toBe(smaller)
  }, 120_000)

  it('2. is the presence the roster reads for it from every session, with the word it had before', () => {
    const words: Record<string, string> = {}
    for (const [handle, agent] of agents) {
      const who = { kind: 'agent' as const, id: agent.id }
      const alone = presence.participantPresence(who, HERE, NOW)
      const fromEverySession = presence.participantPresence(who, HERE, NOW, null, false, undefined, () => presence.sessionRecordsIn(HERE))
      expect(alone, `${handle} read alone and read from every session`).toEqual(fromEverySession)
      words[handle] = alone.word
    }
    expect(words).toEqual({
      'made-up-busy': 'Offline',
      'made-up-by-record': 'Offline',
      'made-up-by-handle': 'Offline',
      'made-up-speaking': 'Offline',
      'made-up-at-work': 'In a terminal',
      'made-up-named-elsewhere': 'Inactive',
      'made-up-no-record-here': 'Inactive',
    })
    const atWork = presence.participantPresence({ kind: 'agent', id: agents.get('made-up-at-work')!.id }, HERE, NOW)
    expect(atWork.says).toContain('in /made-up/the-newer-folder')
    const speaking = presence.participantPresence({ kind: 'agent', id: agents.get('made-up-speaking')!.id }, HERE, NOW)
    expect(speaking.says).toContain('3 minutes ago')
  })
})
