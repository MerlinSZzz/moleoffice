// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/working READS EVERY RUN ONCE, AND ITS PRESENCE READINGS ARE THE SAME AS BEFORE.
 *
 * On a copy of the owner's office the roster took about 7.3 seconds a call (177 active agents, 2,982 open
 * runs, 944,834 rows in `api_calls`). A CPU profile on 27 September 2026 found two costs inside
 * `presenceOf`, paid once per agent:
 *   - it read every open run in the project to find that agent's own;
 *   - `newestRequestFor` walked `api_calls` backwards by time until it met one of the agent's runs,
 *     and walked the whole table for an agent whose runs had sent nothing.
 * Now the roster reads the open runs once and the newest request of every run in one grouped pass
 * (`newestRequestOfEachRun`), and hands both to `presenceOf`. A call takes about 0.3 seconds.
 *
 * These cases check the answer did not change: every row's presence is byte for byte what
 * `presenceOf` gives when it reads for itself, and `newestRequestAmong` gives what
 * `newestRequestFor` gives, including for runs that sent nothing at all.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AN_AGENT_PROCESS = { type: 'agent', id: 'claude-code' } as const

let t: TestDb
let presence: typeof import('../src/server/lib/presence.ts')
let attachments: typeof import('../src/server/lib/attachments.ts')
let arrivals: typeof import('../src/server/lib/arrivals.ts')
let working: typeof import('../src/server/lib/working.ts')
let createWorkspace: typeof import('../src/server/lib/workspaces.ts').createWorkspace
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  presence = await import('../src/server/lib/presence.ts')
  attachments = await import('../src/server/lib/attachments.ts')
  arrivals = await import('../src/server/lib/arrivals.ts')
  working = await import('../src/server/lib/working.ts')
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // A project of this case's own, so the roster a case reads sees only the agents it made.
  caseNumber += 1
  WORKSPACE = `roster-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: `Roster case ${String(caseNumber)}` })
})

function anAgent(handle: string, state = 'active'): string {
  return t.api.createRecord({
    kind: 'agent',
    title: `the ${handle} agent`,
    workspaceId: WORKSPACE,
    data: { handle, state },
    actor: PERSON,
  }).id
}

function aRunFor(agentId: string, title: string): string {
  return attachments.openAttachment({ workspaceId: WORKSPACE, actor: PERSON, title, agentId }).attachment.id
}

function closeRun(runId: string): void {
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(runId)
  attachments.closeAttachment(runId, {
    workspaceId: WORKSPACE,
    actor: AN_AGENT_PROCESS,
    because: 'The run ended and said so.',
    how: 'agent-said',
  })
}

/** One `api_calls` row carrying a run as its session, written straight into the table. */
function aRequestFrom(runId: string | null, minutesAgo: number): void {
  const when = Date.now() - minutesAgo * 60_000
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, ms, method, waits, status, session_id, identity_source) ' +
        'VALUES (?, ?, 1.0, ?, 0, 200, ?, ?)',
    )
    .run(`call-${String(when)}-${String(runId)}-${String(Math.random())}`, when, 'GET', runId, 'header')
}

/**
 * Agents in every shape the reading has a branch for, with the runs it must read and must not.
 * Returns the ids of every run made, so a case can ask about each.
 */
function aMixedOffice(): { busy: string; runs: string[] } {
  // Two open runs. The OLDER one sent the newest request, so "newest run first" and "newest
  // request" are different runs. A closed run sent a later request still, and must not count.
  const busy = anAgent('busy')
  const older = aRunFor(busy, 'the older run')
  const newer = aRunFor(busy, 'the newer run')
  aRequestFrom(older, 20)
  aRequestFrom(older, 3)
  aRequestFrom(newer, 9)
  const closed = aRunFor(busy, 'a closed run')
  aRequestFrom(closed, 1)
  closeRun(closed)
  // One open run that has sent nothing at all.
  const quiet = anAgent('quiet')
  const silent = aRunFor(quiet, 'a run that sent nothing')
  // One open run whose only request is old enough to read as stale.
  const old = anAgent('old')
  const oldRun = aRunFor(old, 'a run that went quiet')
  aRequestFrom(oldRun, 600)
  // No run at all, and a retired agent the roster does not draw.
  anAgent('idle')
  const retired = anAgent('retired', 'retired')
  const retiredRun = aRunFor(retired, 'a retired agent run')
  aRequestFrom(retiredRun, 2)
  // Calls that carry no run, or a run nobody here has.
  aRequestFrom(null, 0)
  aRequestFrom('not-a-run-of-this-office', 0)
  return { busy, runs: [older, newer, closed, silent, oldRun, retiredRun] }
}

describe('the roster reads every run once', () => {
  it('gives every agent the same presence reading as presenceOf reading for itself', () => {
    const { busy } = aMixedOffice()
    const now = new Date()
    const roster = working.whoIsWorking(WORKSPACE, now)
    expect(roster.rows.length, 'the roster drew the wrong agents, so this proves little').toBe(4)
    for (const row of roster.rows) {
      expect(JSON.stringify(row.presence), `the presence of ${row.handle} changed`).toBe(
        JSON.stringify(presence.presenceOf(row.agentId, WORKSPACE, now)),
      )
    }
    // The shapes the fixture is for really were read.
    const byHandle = new Map(roster.rows.map((row) => [row.handle, row.presence]))
    expect(byHandle.get('busy')?.openAttachments.length).toBe(2)
    expect(byHandle.get('busy')?.from).toBe('request')
    expect(byHandle.get('quiet')?.from).toBe('attachment-opened')
    expect(byHandle.get('old')?.presence).toBe('stale')
    expect(byHandle.get('idle')?.presence).toBe('offline')
    expect(roster.rows.some((row) => row.agentId === busy)).toBe(true)
  })

  it('finds the same newest request in one pass as newestRequestFor does run by run', () => {
    const { runs } = aMixedOffice()
    const read = arrivals.newestRequestOfEachRun(runs)
    // Every single run, every pair, and all of them together.
    const sets: string[][] = runs.map((one) => [one])
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) sets.push([runs[i] ?? '', runs[j] ?? ''])
    }
    sets.push(runs)
    let nulls = 0
    for (const set of sets) {
      const expected = arrivals.newestRequestFor(set)
      if (expected === null) nulls += 1
      expect(arrivals.newestRequestAmong(set, read), `runs ${set.join(', ')}`).toBe(expected)
    }
    expect(nulls, 'no set of runs that sent nothing was compared').toBeGreaterThan(0)
    expect(arrivals.newestRequestAmong([], read)).toBe(null)
  })

  it('refuses a run the one-pass read was not asked about, rather than calling it silent', () => {
    const { runs } = aMixedOffice()
    const read = arrivals.newestRequestOfEachRun(runs.slice(1))
    expect(() => arrivals.newestRequestAmong(runs, read)).toThrow(/was not read/)
  })
})
