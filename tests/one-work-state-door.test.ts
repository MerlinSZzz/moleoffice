// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PLACE WRITES WHAT AN AGENT SAID IT WAS DOING — checked against the source AND at run time.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. Exactly one function in `src/` inserts into `agent_work_transitions`, and it is
 *      `moveWorkStateTo` in `src/server/lib/lifecycle.ts`.
 *   3. Exactly one function in `src/` writes `agent_wakes`, and it is `recordThatAWakeIsWanted` in
 *      `src/server/lib/wake.ts`. This used to assert that NOTHING wrote one, because nothing did.
 *
 * ---------------------------------------------------------------------------------------
 * THE SCAN ALONE IS NOT THE GUARD, AND THIS FILE SAYS SO RATHER THAN IMPLYING IT
 * ---------------------------------------------------------------------------------------
 *
 * A source scan cannot see an alias: `const t = agentWorkTransitions; db.insert(t).values(...)`
 * resolves at run time and the text says nothing. So the scan is PAIRED with a guard that fires
 * when the code runs — temporary SQLite triggers installed by `src/server/lib/lifecycle.ts` — and
 * the second half of this file drives a foreign write through the real database and watches it be
 * refused.
 *
 * Neither half is the whole answer and both are kept. The scan catches code no test runs; the
 * trigger catches code the scan cannot read.
 *
 * ---------------------------------------------------------------------------------------
 * THE TABLE DOES NOT EXIST ON A MIGRATED DATABASE YET, AND THAT IS WHY THESE TESTS RUN THE HELD SQL
 * ---------------------------------------------------------------------------------------
 *
 * The migration is written, proved and NOT registered, because this campaign has one announced
 * window and the owner opens it. So every test below that needs the table applies
 * `held-migrations/agent-lifecycle-tables.sql` to its own throwaway database first —
 * which is also the strongest thing that can be said about the held file: the tests run the SQL the
 * window will run.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { NOBODY_HAS_SAID } from '../src/shared/lifecycle.ts'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const HELD_SQL = fileURLToPath(new URL('../held-migrations/agent-lifecycle-tables.sql', import.meta.url))

let t: TestDb
let lifecycle: typeof import('../src/server/lib/lifecycle.ts')
let attachments: typeof import('../src/server/lib/attachments.ts')

const WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AN_AGENT_PROCESS = { type: 'agent', id: 'claude-code' } as const

// ============================================================ reading the source

/** Every .ts and .tsx file under src/, as paths relative to src/. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(relative(SRC, full))
  }
  return out.sort()
}

/**
 * The source with its comments taken out.
 *
 * Without this, every paragraph in `lifecycle.ts` explaining the rule would read as a breach of it.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

function code(file: string): string {
  return withoutComments(readFileSync(join(SRC, file), 'utf8'))
}

/** Which files name a write to this table, in drizzle or in raw SQL. */
function filesWriting(table: 'agentWorkTransitions' | 'agentWakes', sqlName: string): string[] {
  const drizzle = new RegExp(`\\b(?:insert|update|delete)\\s*\\(\\s*${table}\\b`)
  const raw = new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${sqlName}\\b`, 'i')
  return sourceFiles().filter((file) => {
    const text = code(file)
    return drizzle.test(text) || raw.test(text)
  })
}

// ============================================================ the source scan

describe('only one place in the source writes what an agent said it was doing', () => {
  it('walked the source, so nothing below can pass by finding no files', () => {
    // Every check here is "no file does X". A broken walk returns no files and every one of them
    // goes green while saying nothing at all.
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('server/lib/lifecycle.ts')
  })

  it('inserts a transition in exactly one file, and it is the lifecycle library', () => {
    expect(filesWriting('agentWorkTransitions', 'agent_work_transitions')).toEqual(['server/lib/lifecycle.ts'])
  })

  it('inserts it inside moveWorkStateTo and nowhere else in that file', () => {
    const text = code('server/lib/lifecycle.ts')
    const inserts = [...text.matchAll(/db\s*\n?\s*\.insert\(/g)]
    expect(inserts.length, 'more than one insert in the file that owns the one door').toBe(1)
    const before = text.slice(0, inserts[0]?.index ?? 0)
    const lastFunction = before.lastIndexOf('export function ')
    expect(before.slice(lastFunction)).toContain('moveWorkStateTo')
  })

  it('writes a wake row in exactly one file, and it is the wake library', () => {
    // THIS ASSERTION USED TO READ `.toEqual([])`, under the title "writes no wake row anywhere yet,
    // which is the absence a later step fills". That step has now been taken: the door that records
    // a wake is `recordThatAWakeIsWanted` in src/server/lib/wake.ts. The absence it asserted is
    // gone, and what replaces it is the same property the transition table has — one writer.
    //
    // The rest of that step is deliberately still missing, and it is not this file's subject:
    // nothing acts on a wake row, and whether anything ever may is the owner's open question.
    // tests/a-wake-is-wanted-and-nothing-starts.test.ts holds that half, and
    // design/round-eleven/design/the-wake-boundary.md is the account of what was built and why the
    // other half was not.
    expect(filesWriting('agentWakes', 'agent_wakes')).toEqual(['server/lib/wake.ts'])
  })
})

// ============================================================ the runtime half

describe('the runtime half: a write from outside the one door is refused by the database', () => {
  /** This block's own office, with the held SQL run once before the modules read the table. */
  beforeAll(async () => {
    t = await freshDb()
    t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
    lifecycle = await import('../src/server/lib/lifecycle.ts')
    attachments = await import('../src/server/lib/attachments.ts')
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  /** A durable agent and one open attachment working as it. The shape every move needs. */
  let agentsMade = 0
  function anAgentWithARun(): { agentId: string; attachmentId: string } {
    agentsMade += 1
    const agent = t.api.createRecord({
      kind: 'agent',
      title: 'the lifecycle agent',
      workspaceId: WORKSPACE,
      data: { handle: `lifecycle-${String(agentsMade)}`, state: 'active' },
      actor: PERSON,
    })
    const opened = attachments.openAttachment({
      workspaceId: WORKSPACE,
      actor: PERSON,
      title: 'a run working as it',
      agentId: agent.id,
    })
    return { agentId: agent.id, attachmentId: opened.attachment.id }
  }

  it('has the guard on, and says so rather than leaving it to be assumed', () => {
    expect(lifecycle.installWorkStateDoorGuard().installed).toBe(true)
    expect(lifecycle.workStateDoorGuard().why).toContain('trigger')
  })

  it('refuses the mutation a source scan cannot see: raw SQL from outside the door', () => {
    // THE COUNT IS OVER EVERY ROW IN THE OFFICE, so it is taken at the start and only what this
    // case added is expected not to be there.
    const rowsBefore = t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_work_transitions').get()
    expect(() =>
      t.client.sqlite
        .prepare(
          'INSERT INTO agent_work_transitions (id, workspace_id, agent_id, from_state, to_state, at, because, ' +
            'actor_type, actor_id) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)',
        )
        .run('smuggled', WORKSPACE, 'some-agent', 'working', '2026-08-27 12:00:00', 'because I said so', 'agent', 'x'),
    ).toThrow(/outside moveWorkStateTo/)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_work_transitions').get()).toEqual(rowsBefore)
  })

  it('refuses a rewrite of a transition that has already happened', () => {
    const { agentId, attachmentId } = anAgentWithARun()
    lifecycle.moveWorkStateTo(agentId, 'working', {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      attachmentId,
      because: 'It accepted the work in the message it woke to.',
    })
    expect(() =>
      t.client.sqlite.prepare("UPDATE agent_work_transitions SET to_state = 'finished'").run(),
    ).toThrow(/never rewritten/)
  })

  it('lets the one door through, and the newest row is what the current state reads as', () => {
    const { agentId, attachmentId } = anAgentWithARun()
    const first = lifecycle.moveWorkStateTo(agentId, 'working', {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      attachmentId,
      because: 'It accepted the work.',
      relatedKind: 'message',
      relatedId: 'msg-1',
    })
    expect(first.transition.from).toBeNull()
    expect(first.now.state).toBe('working')

    const second = lifecycle.moveWorkStateTo(agentId, 'reporting', {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      attachmentId,
      because: 'It filed the report the stage was for.',
    })
    expect(second.transition.from).toBe('working')
    expect(second.now.state).toBe('reporting')
    expect(second.now.previous?.to).toBe('working')
    expect(second.now.saidBy).toEqual({ type: 'agent', id: 'claude-code' })
  })

  it('leaves the door shut after a refusal inside the write', () => {
    const { agentId, attachmentId } = anAgentWithARun()
    lifecycle.moveWorkStateTo(agentId, 'working', {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      attachmentId,
      because: 'It accepted the work.',
    })
    expect(() =>
      lifecycle.moveWorkStateTo(agentId, 'working', {
        workspaceId: WORKSPACE,
        actor: AN_AGENT_PROCESS,
        attachmentId,
        because: 'again',
      }),
    ).toThrow(/already reads/)
    // The door is shut, so a foreign write is still refused after the failed one.
    expect(() =>
      t.client.sqlite
        .prepare(
          'INSERT INTO agent_work_transitions (id, workspace_id, agent_id, to_state, at, because, actor_type, ' +
            'actor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('after', WORKSPACE, agentId, 'blocked', '2026-08-27 12:00:00', 'x', 'agent', 'y'),
    ).toThrow(/outside moveWorkStateTo/)
  })
})

// ============================================================ what the writer refuses

describe('what the one writer refuses, and why each refusal is not fussiness', () => {
  /** This block's own office, with the held SQL run once before the modules read the table. */
  beforeAll(async () => {
    t = await freshDb()
    t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
    lifecycle = await import('../src/server/lib/lifecycle.ts')
    attachments = await import('../src/server/lib/attachments.ts')
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  let agentsMade = 0
  function anAgent(title = 'an agent'): string {
    agentsMade += 1
    return t.api.createRecord({
      kind: 'agent',
      title,
      workspaceId: WORKSPACE,
      data: { handle: `writer-agent-${String(agentsMade)}`, state: 'active' },
      actor: PERSON,
    }).id
  }

  it('refuses a move with no reason, because the reason is why this store exists', () => {
    const agentId = anAgent()
    expect(() =>
      lifecycle.moveWorkStateTo(agentId, 'working', { workspaceId: WORKSPACE, actor: PERSON, because: '  ' }),
    ).toThrow(/Say why/)
  })

  it('refuses a move to the word it already holds, which is what a heartbeat would look like', () => {
    const agentId = anAgent()
    lifecycle.moveWorkStateTo(agentId, 'standing-by', {
      workspaceId: WORKSPACE,
      actor: PERSON,
      because: 'The owner is keeping it available on purpose.',
    })
    expect(() =>
      lifecycle.moveWorkStateTo(agentId, 'standing-by', {
        workspaceId: WORKSPACE,
        actor: PERSON,
        because: 'still available',
      }),
    ).toThrow(/already reads/)
  })

  it('refuses a move the system says it made, because a process ending decides nothing about work', () => {
    const agentId = anAgent()
    expect(() =>
      lifecycle.moveWorkStateTo(agentId, 'finished', {
        workspaceId: WORKSPACE,
        actor: { type: 'system', id: 'the sweep' },
        because: 'The process exited.',
      }),
    ).toThrow(/THE SYSTEM NEVER WRITES A WORK STATE/)
  })

  it('refuses an agent moving another agent, and lets a person move anybody', () => {
    const mine = anAgent('mine')
    const yours = anAgent('yours')
    const opened = attachments.openAttachment({
      workspaceId: WORKSPACE,
      actor: PERSON,
      title: 'a run working as mine',
      agentId: mine,
    })
    expect(() =>
      lifecycle.moveWorkStateTo(yours, 'blocked', {
        workspaceId: WORKSPACE,
        actor: AN_AGENT_PROCESS,
        attachmentId: opened.attachment.id,
        because: 'It looked stuck to me.',
      }),
    ).toThrow(/may only move its own/)

    // A person may, and the row then carries no attachment, which is a real answer.
    const moved = lifecycle.moveWorkStateTo(yours, 'blocked', {
      workspaceId: WORKSPACE,
      actor: PERSON,
      because: 'The owner said it is waiting on the gripper.',
    })
    expect(moved.transition.attachmentId).toBeNull()
    expect(moved.transition.actorType).toBe('human')
  })

  it('refuses an agent that does not say which attachment it is moving from', () => {
    const agentId = anAgent()
    expect(() =>
      lifecycle.moveWorkStateTo(agentId, 'working', {
        workspaceId: WORKSPACE,
        actor: AN_AGENT_PROCESS,
        because: 'I accepted the work.',
      }),
    ).toThrow(/which attachment/)
  })

  it('takes every move between two different words, including Reporting back to Working', () => {
    // THE GRAPH IS NOT ORDERED, and this is the move an ordered one would refuse. The owner's list
    // names it: a review arrives, the agent goes back to work.
    const agentId = anAgent()
    const order = ['working', 'reporting', 'working', 'blocked', 'finished', 'standing-by'] as const
    for (const word of order) {
      lifecycle.moveWorkStateTo(agentId, word, {
        workspaceId: WORKSPACE,
        actor: PERSON,
        because: `The owner moved it to ${word}.`,
      })
    }
    const history = lifecycle.workStateHistory(agentId, WORKSPACE)
    expect(history.map((one) => one.to)).toEqual([...order].reverse())
  })

  it('says no work state is recorded, rather than Standing by, for an agent with no transitions', () => {
    const agentId = anAgent()
    const reading = lifecycle.workStateOf(agentId, WORKSPACE)
    expect(reading.state).toBeNull()
    expect(reading.says).toBe(NOBODY_HAS_SAID)
    expect(reading.since).toBeNull()
  })
})

// ============================================================ before the migration has run

describe('on a database the held migration has not been run on', () => {
  /** This block's own office, with the held SQL NOT run on it. */
  beforeAll(async () => {
    t = await freshDb()
    lifecycle = await import('../src/server/lib/lifecycle.ts')
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  it('says the table is not there and names the file that creates it, rather than failing strangely', () => {
    expect(lifecycle.transitionStoreExists()).toBe(false)
    // A REAL AGENT, because the reader checks the agent BEFORE it checks the store. That order is
    // deliberate — an id naming no agent in this project has to be refused as that rather than
    // told the only thing wrong was a migration — so an invented id here would prove the wrong
    // refusal and this test would pass with the store's own message deleted.
    const agent = t.api.createRecord({
      kind: 'agent',
      title: 'the lifecycle agent',
      workspaceId: WORKSPACE,
      data: { handle: 'before-the-migration-agent', state: 'active' },
      actor: PERSON,
    })
    expect(() => lifecycle.workStateOf(agent.id, WORKSPACE)).toThrow(
      /held-migrations\/agent-lifecycle-tables\.sql/,
    )
  })

  it('refuses an id that names no agent in this project before it mentions the store at all', () => {
    expect(() => lifecycle.workStateOf('any-agent', WORKSPACE)).toThrow(/No agent has the id any-agent/)
  })

  it('reports the guard as OFF with the reason, so it cannot look like a guard that never fired', () => {
    const state = lifecycle.installWorkStateDoorGuard()
    expect(state.installed).toBe(false)
    expect(state.why).toContain('no agent_work_transitions table')
  })
})
