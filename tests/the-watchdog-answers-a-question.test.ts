// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WATCHDOG READING ANSWERS A QUESTION AND DOES NOT ACT, AND SAYS WHICH CONDITIONS IT CANNOT ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. Only an agent whose work state is Working can ever be a candidate. Reporting, Standing by,
 *      Blocked, Finished and an agent nobody has spoken for are all refused by condition 1.
 *   2. **The three conditions this product cannot answer say so.** They never read as `holds` and
 *      never as `does-not-hold`, and an agent they stop reads *this cannot be decided* rather than
 *      *yes*. So no agent reads as a candidate today, and the reply says why in its own words.
 *   3. The conditions that CAN be answered are answered from the corpus, and each one changes its
 *      verdict when the fact behind it changes: work still open, a fork the owner has to settle,
 *      something changed in the last hour.
 *   4. It writes nothing. No wake row, no transition, no change row.
 *
 * ---------------------------------------------------------------------------------------
 * THE TEST MOST LIKELY TO BE FAKED, AND WHAT IS DONE ABOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * Section 9.5 of `design/round-eleven/design/agent-lifecycle.md` names it: a test that only proves
 * the watchdog stays quiet passes with the watchdog deleted. The answer here is that every quiet
 * case asserts WHICH condition silenced it, by number, so a reading that answered nothing at all
 * would fail every one of them.
 *
 * The mutation each case is written against is named in a comment above it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { NOBODY_HAS_SAID } from '../src/shared/lifecycle.ts'

const HELD_SQL = fileURLToPath(new URL('../held-migrations/agent-lifecycle-tables.sql', import.meta.url))

const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AN_AGENT_PROCESS = { type: 'agent', id: 'claude-code' } as const

let t: TestDb
let watchdog: typeof import('../src/server/lib/watchdog.ts')
let lifecycle: typeof import('../src/server/lib/lifecycle.ts')
let attachments: typeof import('../src/server/lib/attachments.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
/**
 * THE PROJECT ONE CASE FILES INTO. The office is shared, and the reading answers for one project, so
 * a case's own project keeps every other case's agents out of its reading.
 */
let WORKSPACE = 'default'
let caseNumber = 0
/** The table one case drops, with the SQL that puts it back, so the office is whole for the next case. */
let droppedWorkTransitions: { table: string; indexes: string[] } | null = null

beforeAll(async () => {
  t = await freshDb()
  t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
  watchdog = await import('../src/server/lib/watchdog.ts')
  lifecycle = await import('../src/server/lib/lifecycle.ts')
  attachments = await import('../src/server/lib/attachments.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `watchdog-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: 'A made-up project for one watchdog case' })
})

afterEach(() => {
  if (droppedWorkTransitions !== null) {
    t.client.sqlite.exec(droppedWorkTransitions.table)
    for (const index of droppedWorkTransitions.indexes) t.client.sqlite.exec(index)
    droppedWorkTransitions = null
  }
})

afterAll(() => {
  t.close()
})

// ============================================================ building a situation

/** A durable agent, one open attachment working as it, and a work state if one is asked for. */
function anAgentThatIs(state: 'working' | 'reporting' | 'standing-by' | 'blocked' | 'finished' | null): {
  agentId: string
  attachmentId: string
} {
  const agent = t.api.createRecord({
    kind: 'agent',
    title: 'the agent under the watchdog',
    workspaceId: WORKSPACE,
    data: { handle: 'watched', state: 'active' },
    actor: PERSON,
  })
  const opened = attachments.openAttachment({
    workspaceId: WORKSPACE,
    actor: PERSON,
    title: 'a run working as it',
    agentId: agent.id,
  })
  if (state !== null) {
    lifecycle.moveWorkStateTo(agent.id, state, {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      attachmentId: opened.attachment.id,
      because: 'The test put it in this state on purpose.',
    })
  }
  return { agentId: agent.id, attachmentId: opened.attachment.id }
}

/** A piece of work that has not ended, linked to the agent, so condition 2 has something to read. */
function anUnfinishedTaskFor(agentId: string): string {
  const task = t.api.createRecord({
    kind: 'task',
    title: 'the stage this agent is in the middle of',
    workspaceId: WORKSPACE,
    data: { state: 'doing' },
    actor: PERSON,
  })
  t.api.createLink({ fromId: task.id, toId: agentId, type: 'relates_to', actor: PERSON })
  return task.id
}

/** A fork nobody has settled that says only the owner may, linked to the agent. */
function anOwnerForkFor(agentId: string): string {
  const fork = t.api.createRecord({
    kind: 'proposal',
    title: 'a fork this agent is waiting on',
    workspaceId: WORKSPACE,
    data: {
      question: 'Should this go the first way or the second?',
      options: ['The first way, which costs a day.', 'The second way, which costs a week.'],
      who_settles_it: 'the owner',
    },
    actor: PERSON,
  })
  t.api.createLink({ fromId: fork.id, toId: agentId, type: 'relates_to', actor: PERSON })
  return fork.id
}

/** One reading of one agent, by id. */
function readingFor(agentId: string, ask: { quietForMinutes?: number; now?: Date } = {}) {
  const reading = watchdog.watchdogCandidates({ workspaceId: WORKSPACE, ...ask })
  const one = reading.agents.find((each) => each.agentId === agentId)
  if (one === undefined) throw new Error(`the reading did not include the agent ${agentId}`)
  return { whole: reading, agent: one }
}

/** What one numbered condition came out as. */
function verdict(agent: { conditions: { number: number; verdict: string }[] }, number: number): string {
  const one = agent.conditions.find((each) => each.number === number)
  if (one === undefined) throw new Error(`the reading has no condition ${number}`)
  return one.verdict
}

// ============================================================ the shape of the answer

describe('the reading says what it cannot answer, rather than answering it', () => {
  it('puts all seven conditions to every agent, with the evidence each needs', () => {
    const { agentId } = anAgentThatIs('working')
    const { agent } = readingFor(agentId)
    expect(agent.conditions.map((one) => one.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const condition of agent.conditions) {
      expect(condition.asks.length, `condition ${condition.number} says nothing about what it asks`).toBeGreaterThan(0)
      expect(condition.evidence.length, `condition ${condition.number} names no evidence`).toBeGreaterThan(0)
      expect(condition.says.length, `condition ${condition.number} says nothing about what it read`).toBeGreaterThan(0)
    }
  })

  it('names the conditions nothing here can evaluate, counted from the declaration', () => {
    // MUTATION: give one of the three a reader that returns `holds`. This goes red, because the
    // list is counted from THE_SEVEN rather than typed out.
    const { whole, agent } = readingFor(anAgentThatIs('working').agentId)
    expect(whole.cannotBeAnswered).toEqual([4, 5, 7])
    for (const number of [4, 5, 7]) {
      expect(verdict(agent, number), `condition ${number} was answered by something`).toBe('cannot-be-evaluated')
    }
    expect(whole.note).toContain('NO AGENT CAN READ AS A CANDIDATE HERE')
  })

  it('leaves an unanswerable condition unanswered rather than defaulting it to true', () => {
    // THE MUTATION THIS FILE EXISTS FOR: default conditions 4, 5 and 7 to `holds`. The agent below
    // then reads as a candidate and this goes red.
    const { agentId } = anAgentThatIs('working')
    anUnfinishedTaskFor(agentId)
    const { whole, agent } = readingFor(agentId)
    expect(verdict(agent, 1)).toBe('holds')
    expect(verdict(agent, 2)).toBe('holds')
    expect(verdict(agent, 3)).toBe('holds')
    expect(verdict(agent, 6)).toBe('holds')
    expect(agent.answer).toBe('cannot-be-decided')
    expect(whole.candidates).toEqual([])
    expect(agent.says).toContain('cannot be evaluated')
  })

  it('says nothing is there rather than nobody looked, in a project with no agents', () => {
    expect(watchdog.watchdogCandidates({ workspaceId: WORKSPACE }).note).toContain('nothing there, not nobody looked')
  })

  it('reports the quiet threshold with the sentence saying nobody has measured it', () => {
    const reading = watchdog.watchdogCandidates({ workspaceId: WORKSPACE })
    expect(reading.quietForMinutes).toBe(watchdog.QUIET_FOR_MINUTES)
    expect(reading.thresholdIsUnmeasured).toContain('nobody has measured')
  })
})

// ============================================================ only Working is ever a candidate

describe('only an agent that says it is working is ever a candidate', () => {
  // MUTATION: make condition 1 read elapsed time, or presence, instead of the work state. Every
  // case here goes red, because each names condition 1 as the one that stopped it.
  for (const state of ['reporting', 'standing-by', 'blocked', 'finished'] as const) {
    it(`never puts forward an agent that reads ${state}, whatever else is true of it`, () => {
      const { agentId } = anAgentThatIs(state)
      anUnfinishedTaskFor(agentId)
      const { whole, agent } = readingFor(agentId)
      expect(verdict(agent, 1)).toBe('does-not-hold')
      expect(agent.answer).toBe('not-a-candidate')
      expect(whole.notCandidates).toContain(agentId)
      expect(whole.candidates).toEqual([])
    })
  }

  it('never puts forward an agent nobody has said anything about', () => {
    const { agentId } = anAgentThatIs(null)
    const { agent } = readingFor(agentId)
    expect(verdict(agent, 1)).toBe('does-not-hold')
    expect(agent.conditions[0]?.says).toContain(NOBODY_HAS_SAID)
    expect(agent.answer).toBe('not-a-candidate')
  })

  it('cannot evaluate the work state at all when the store does not exist, and does not guess', () => {
    // The state of every database today. A reading that answered "not Working" here would be
    // reporting a fact about an agent from a table that is not there.
    const { agentId } = anAgentThatIs('working')
    // THE TABLE'S OWN DECLARATION, read from the database before it goes, so the office can be put
    // back whole when this case ends. Nothing here retypes its shape.
    const table = t.client.sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_work_transitions'")
      .get() as { sql: string } | undefined
    if (table === undefined) throw new Error('the office holds no agent_work_transitions table to drop')
    const indexes = (
      t.client.sqlite
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'agent_work_transitions' AND sql IS NOT NULL")
        .all() as { sql: string }[]
    ).map((one) => one.sql)
    droppedWorkTransitions = { table: table.sql, indexes }
    t.client.sqlite.exec('DROP TABLE agent_work_transitions')
    const { agent } = readingFor(agentId)
    expect(verdict(agent, 1)).toBe('cannot-be-evaluated')
    expect(agent.conditions[0]?.says).toContain('held-migrations/')
    expect(agent.answer).toBe('cannot-be-decided')
  })
})

// ============================================================ the conditions it can answer

describe('the four conditions with readers answer from the corpus', () => {
  it('holds condition 2 when work near the agent has not ended, and cannot answer it when none is there', () => {
    // MUTATION: make condition 2 return `holds` when nothing is found. The second half goes red.
    const { agentId } = anAgentThatIs('working')
    expect(verdict(readingFor(agentId).agent, 2)).toBe('cannot-be-evaluated')
    anUnfinishedTaskFor(agentId)
    expect(verdict(readingFor(agentId).agent, 2)).toBe('holds')
  })

  it('says an absence of open work is not a statement that the work is finished', () => {
    const { agentId } = anAgentThatIs('working')
    const condition = readingFor(agentId).agent.conditions.find((one) => one.number === 2)
    expect(condition?.says).toContain('does not say the work is complete')
  })

  it('refuses to call an agent a candidate while a fork the owner has to settle reaches it', () => {
    // MUTATION: drop condition 3, or read only forks nobody classified. This goes red.
    const { agentId } = anAgentThatIs('working')
    anUnfinishedTaskFor(agentId)
    expect(verdict(readingFor(agentId).agent, 3)).toBe('holds')

    const forkId = anOwnerForkFor(agentId)
    const { agent } = readingFor(agentId)
    expect(verdict(agent, 3)).toBe('does-not-hold')
    expect(agent.conditions.find((one) => one.number === 3)?.says).toContain(forkId)
    expect(agent.answer).toBe('not-a-candidate')
  })

  it('reads progress as something moving in the project, not as time passing', () => {
    // MUTATION: make condition 6 compare the clock to when the attachment opened. The second half
    // goes red, because nothing has changed in the project and the agent is still called quiet.
    const { agentId, attachmentId } = anAgentThatIs('working')
    anUnfinishedTaskFor(agentId)
    expect(verdict(readingFor(agentId).agent, 6), 'nothing this run did has ever changed anything').toBe('holds')

    // Something the run itself changed, a moment ago.
    t.api.createRecord({
      kind: 'note',
      title: 'a finding this run wrote down',
      workspaceId: WORKSPACE,
      actor: { ...AN_AGENT_PROCESS, sessionId: attachmentId },
    })
    const { agent } = readingFor(agentId)
    expect(verdict(agent, 6)).toBe('does-not-hold')
    expect(agent.conditions.find((one) => one.number === 6)?.says).toContain('making progress')
    expect(agent.answer).toBe('not-a-candidate')
  })

  it('calls the same agent quiet once that change is older than the threshold', () => {
    const { agentId, attachmentId } = anAgentThatIs('working')
    t.api.createRecord({
      kind: 'note',
      title: 'a finding this run wrote down',
      workspaceId: WORKSPACE,
      actor: { ...AN_AGENT_PROCESS, sessionId: attachmentId },
    })
    expect(verdict(readingFor(agentId).agent, 6)).toBe('does-not-hold')
    // Two hours later, with the same corpus, the same change is no longer recent.
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000)
    expect(verdict(readingFor(agentId, { now: later }).agent, 6)).toBe('holds')
  })

  it('cannot read progress for an agent with no open attachment, and says which nothing that is', () => {
    const { agentId, attachmentId } = anAgentThatIs('working')
    attachments.closeAttachment(attachmentId, {
      workspaceId: WORKSPACE,
      actor: PERSON,
      how: 'person-said',
      because: 'The run ended and this test needs an agent with nothing open.',
    })
    const condition = readingFor(agentId).agent.conditions.find((one) => one.number === 6)
    expect(condition?.verdict).toBe('cannot-be-evaluated')
    expect(condition?.says).toContain('no open attachment')
  })
})

// ============================================================ it does not act

describe('the reading acts on nobody', () => {
  it('records no wake, moves no work state and writes no change row', () => {
    const { agentId } = anAgentThatIs('working')
    anUnfinishedTaskFor(agentId)
    const before = {
      wakes: t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_wakes').get(),
      transitions: t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_work_transitions').get(),
      changes: t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get(),
    }
    const reading = watchdog.watchdogCandidates({ workspaceId: WORKSPACE })
    expect(reading.startsNothing).toMatch(/ANSWERED A QUESTION AND DID NOTHING ELSE/)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_wakes').get()).toEqual(before.wakes)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_work_transitions').get()).toEqual(
      before.transitions,
    )
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get()).toEqual(before.changes)
  })
})
