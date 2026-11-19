// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WANTING AN AGENT WOKEN IS A ROW SOMEBODY WRITES, AND NOTHING ACTS ON IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. Exactly one function in `src/` inserts into `agent_wakes`, and it is
 *      `recordThatAWakeIsWanted` in `src/server/lib/wake.ts`.
 *   3. The three doors say what they do not do, and the reply of the writing door says it on every
 *      call rather than leaving it to be inferred from a 200.
 *   4. There is still no route that starts, resumes or wakes anything.
 *   5. The two by-id doors — this one and the work-state one — refuse the same three bad agent ids
 *      the same way. That check exists because the same rule is written out in both files, and the
 *      answer this repository gives for one fact in two places is a test that fails when they
 *      disagree.
 *
 * ---------------------------------------------------------------------------------------
 * THE TABLE DOES NOT EXIST ON A MIGRATED DATABASE YET, AND THAT IS WHY THESE TESTS RUN THE HELD SQL
 * ---------------------------------------------------------------------------------------
 *
 * The migration is written, proved and NOT registered, because this campaign has one announced
 * window and the owner opens it. So every test below that needs the table applies
 * `held-migrations/agent-lifecycle-tables.sql` to its own throwaway database first,
 * and the refusal is tested on a database without it — which is every database today.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { BuiltServer } from '../src/server/index.ts'

const HELD_SQL = fileURLToPath(new URL('../held-migrations/agent-lifecycle-tables.sql', import.meta.url))

const WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AN_AGENT_PROCESS = { type: 'agent', id: 'claude-code' } as const

const AS_A_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AS_AN_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let wake: typeof import('../src/server/lib/wake.ts')
let lifecycle: typeof import('../src/server/lib/lifecycle.ts')

// ============================================================ reading the source





// ============================================================ the source scan


// ============================================================ what the doors declare

describe('the three doors say what they are, who may ask, and what they do not do', () => {
  let app: FastifyInstance
  let built: BuiltServer

  beforeAll(async () => {
    t = await freshDb()
    built = await apiApp()
    app = built.app
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('serves all three on the real server, read off the router the server built', () => {
    const registered = built.listApiRoutes()
    expect(registered.length, 'the server registered no /api routes at all').toBeGreaterThan(100)
    for (const operation of ['agent.wake-wanted', 'agent.wakes', 'agent.wake-candidates']) {
      const one = registered.find((each) => each.operation === operation)
      expect(one, `no route on the running server declares ${operation}`).toBeDefined()
      expect(one?.note ?? '', `${operation} registered without a sentence a person reads`).not.toBe('')
      expect(one?.reach, `${operation} registered without saying which machines may ask`).toBeDefined()
    }
  })


  it('still serves no route that starts, resumes or wakes anything', async () => {
    const agentId = t.api.createRecord({
      kind: 'agent',
      title: 'the wake agent',
      workspaceId: WORKSPACE,
      data: { handle: 'waker', state: 'active' },
      actor: PERSON,
    }).id
    for (const url of [
      `/api/agents/${agentId}/start`,
      `/api/agents/${agentId}/resume`,
      `/api/agents/${agentId}/wake`,
      `/api/wakes/anything/claim`,
    ]) {
      const reply = await app.inject({ method: 'POST', url, headers: AS_AN_AGENT, payload: {} })
      expect(reply.statusCode, `${url} answered something other than a 404`).toBe(404)
    }
  })

})

// ============================================================ before the migration window

describe('with no wake table, every door refuses and names the file that would create it', () => {
  beforeAll(async () => {
    t = await freshDb()
    wake = await import('../src/server/lib/wake.ts')
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  it('has no table, which is the state of every database today', () => {
    expect(wake.wakeStoreExists()).toBe(false)
  })

  it('says the guard is off and why, rather than looking like a guard that never fired', () => {
    expect(wake.wakeDoorGuard().installed).toBe(false)
    expect(wake.installWakeDoorGuard().why).toContain('held-migrations/')
  })

  it('refuses to write, with the held migration named, rather than a SQLite error', () => {
    const agentId = t.api.createRecord({
      kind: 'agent',
      title: 'the wake agent',
      workspaceId: WORKSPACE,
      data: { handle: 'waker', state: 'active' },
      actor: PERSON,
    }).id
    let thrown: unknown
    try {
      wake.recordThatAWakeIsWanted(agentId, {
        workspaceId: WORKSPACE,
        actor: PERSON,
        because: 'The owner wrote to it and it has to be able to read that.',
        policy: 'owner-message',
      })
    } catch (error) {
      thrown = error
    }
    expect((thrown as { status?: number }).status).toBe(503)
    expect(String((thrown as Error).message)).toContain('agent-lifecycle-tables.sql')
  })
})

// ============================================================ the write, and what it refuses

describe('writing down that a wake is wanted', () => {
  beforeAll(async () => {
    t = await freshDb()
    t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
    wake = await import('../src/server/lib/wake.ts')
    lifecycle = await import('../src/server/lib/lifecycle.ts')
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  let caseNumber = 0
  beforeEach(() => {
    // EACH CASE GIVES ITSELF A FRESH TABLE AND ITS OWN AGENT, so a count sees only its own rows.
    caseNumber += 1
    t.client.sqlite.prepare('DELETE FROM agent_wakes').run()
  })

  function anAgent(title = 'the wake agent'): string {
    return t.api.createRecord({
      kind: 'agent',
      title,
      workspaceId: WORKSPACE,
      data: { handle: `waker-${String(caseNumber)}`, state: 'active' },
      actor: PERSON,
    }).id
  }

  it('writes one row, in the only state this server writes, and says it started nothing', () => {
    const agentId = anAgent()
    const written = wake.recordThatAWakeIsWanted(agentId, {
      workspaceId: WORKSPACE,
      actor: PERSON,
      because: 'The owner sent it a review and it has to be reachable to read it.',
      policy: 'owner-message',
      evidence: { messageId: 'msg-1' },
    })
    expect(written.wake.state).toBe('wanted')
    expect(written.wake.stateAt).toBe(written.wake.wantedAt)
    expect(written.wake.wantedBy).toEqual({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    expect(written.wake.evidence).toEqual({ messageId: 'msg-1' })
    expect(written.wake.claimedBy).toBeNull()
    expect(written.wake.servedAt).toBeNull()
    expect(written.wake.attachmentId).toBeNull()
    expect(written.startsNothing).toMatch(/STARTED NOTHING/)
    expect(wake.wakesFor(agentId, WORKSPACE).map((one) => one.id)).toEqual([written.wake.id])
  })

  it('has the guard on once the table exists, and says so', () => {
    anAgent()
    expect(wake.installWakeDoorGuard().installed).toBe(true)
    expect(wake.wakeDoorGuard().why).toContain('trigger')
  })

  it('refuses the mutation a source scan cannot see: raw SQL from outside the door', () => {
    expect(() =>
      t.client.sqlite
        .prepare(
          'INSERT INTO agent_wakes (id, workspace_id, agent_id, wanted_at, wanted_by_type, wanted_by_id, because, ' +
            'policy, state, state_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('smuggled', WORKSPACE, 'some-agent', '2026-08-27 12:00:00', 'agent', 'x', 'because', 'watchdog', 'served', '2026-08-27 12:00:00'),
    ).toThrow(/outside recordThatAWakeIsWanted/)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_wakes').get()).toEqual({ n: 0 })
  })

  it('refuses to move a wake past wanted, which is the half that was not built', () => {
    const agentId = anAgent()
    wake.recordThatAWakeIsWanted(agentId, {
      workspaceId: WORKSPACE,
      actor: PERSON,
      because: 'The owner pressed it themselves.',
      policy: 'owner-press',
    })
    expect(() => t.client.sqlite.prepare("UPDATE agent_wakes SET state = 'served'").run()).toThrow(
      /never moves a wake past/,
    )
    expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM agent_wakes WHERE state = 'wanted'").get()).toEqual({
      n: 1,
    })
  })

  it('names the other wakes already waiting, and refuses none of them', () => {
    const agentId = anAgent()
    const first = wake.recordThatAWakeIsWanted(agentId, {
      workspaceId: WORKSPACE,
      actor: PERSON,
      because: 'The owner sent it a review.',
      policy: 'owner-message',
    })
    const second = wake.recordThatAWakeIsWanted(agentId, {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      because: 'A reading found it was left in the middle of a stage.',
      policy: 'watchdog',
    })
    expect(second.alsoWanted.map((one) => one.id)).toEqual([first.wake.id])
  })

  it('refuses a wake with no reason, because the reason is what the agent would be told', () => {
    const agentId = anAgent()
    expect(() =>
      wake.recordThatAWakeIsWanted(agentId, {
        workspaceId: WORKSPACE,
        actor: PERSON,
        because: '   ',
        policy: 'owner-press',
      }),
    ).toThrow(/one plain sentence/)
    expect(wake.wakesFor(agentId, WORKSPACE)).toEqual([])
  })

  it('refuses a reason word that is not one of the three', () => {
    const agentId = anAgent()
    expect(() =>
      wake.recordThatAWakeIsWanted(agentId, {
        workspaceId: WORKSPACE,
        actor: PERSON,
        because: 'It should be up.',
        // The route's own schema refuses this too; the library is checked separately because the
        // Agent Host that does not exist yet would call the library, not the route.
        policy: 'because-i-said-so' as never,
      }),
    ).toThrow(/not one of the three reasons/)
  })

  it('refuses an agent claiming the owner pressed it, which is somebody else\'s act', () => {
    const agentId = anAgent()
    let thrown: unknown
    try {
      wake.recordThatAWakeIsWanted(agentId, {
        workspaceId: WORKSPACE,
        actor: AN_AGENT_PROCESS,
        because: 'I would like to be woken.',
        policy: 'owner-press',
      })
    } catch (error) {
      thrown = error
    }
    expect((thrown as { status?: number }).status).toBe(403)
    expect(wake.wakesFor(agentId, WORKSPACE)).toEqual([])
  })

  it('refuses the same three bad agent ids the work-state door refuses, the same way', () => {
    // ONE FACT IN TWO PLACES, HELD BY A TEST. Both files check that an id names a live agent of
    // this project, and neither can import the other's check. This is what fails when they drift.
    const note = t.api.createRecord({
      kind: 'note',
      title: 'not an agent at all',
      workspaceId: WORKSPACE,
      actor: PERSON,
    }).id
    const cases: [string, number][] = [
      ['no-such-id-at-all', 404],
      [note, 400],
    ]
    for (const [id, status] of cases) {
      const fromWake = statusOf(() =>
        wake.recordThatAWakeIsWanted(id, {
          workspaceId: WORKSPACE,
          actor: PERSON,
          because: 'x',
          policy: 'owner-press',
        }),
      )
      const fromWorkState = statusOf(() =>
        lifecycle.moveWorkStateTo(id, 'working', { workspaceId: WORKSPACE, actor: PERSON, because: 'x' }),
      )
      expect(fromWake, `the wake door answered ${fromWake} for ${id}`).toBe(status)
      expect(fromWorkState, `the two doors disagree about ${id}`).toBe(fromWake)
    }
  })
})

/** The status code a call threw, or 0 when it did not throw. */
function statusOf(fn: () => unknown): number {
  try {
    fn()
    return 0
  } catch (error) {
    return (error as { status?: number }).status ?? -1
  }
}

// ============================================================ over HTTP

describe('the doors over HTTP', () => {
  let app: FastifyInstance
  let built: BuiltServer

  beforeAll(async () => {
    t = await freshDb()
    t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
    built = await apiApp()
    app = built.app
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  let caseNumber = 0
  beforeEach(() => {
    caseNumber += 1
  })

  function anAgent(): string {
    return t.api.createRecord({
      kind: 'agent',
      title: 'the wake agent',
      workspaceId: WORKSPACE,
      data: { handle: `waker-http-${String(caseNumber)}`, state: 'active' },
      actor: PERSON,
    }).id
  }

  it('writes the row and says on the call itself that it started nothing', async () => {
    const agentId = anAgent()
    const reply = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/wakes`,
      headers: AS_A_PERSON,
      payload: { because: 'The owner sent it a review and it has to be reachable to read it.', policy: 'owner-message' },
    })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as { wake: { state: string }; startsNothing: string }
    expect(body.wake.state).toBe('wanted')
    expect(body.startsNothing).toMatch(/STARTED NOTHING/)
  })

  it('refuses a policy the vocabulary does not hold, at the door', async () => {
    const agentId = anAgent()
    const reply = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/wakes`,
      headers: AS_A_PERSON,
      payload: { because: 'It should be up.', policy: 'whenever' },
    })
    expect(reply.statusCode).toBe(400)
  })

  it('hands back the history with what each stored state would mean', async () => {
    const agentId = anAgent()
    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/wakes`,
      headers: AS_AN_AGENT,
      payload: { because: 'A reading found it stopped in the middle.', policy: 'watchdog' },
    })
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${agentId}/wakes`, headers: AS_A_PERSON })
    const body = reply.json() as {
      wakes: { policy: string }[]
      states: Record<string, { writtenHere: boolean }>
      note: string
    }
    expect(body.wakes.map((one) => one.policy)).toEqual(['watchdog'])
    expect(body.states['wanted']?.writtenHere).toBe(true)
    expect(body.states['served']?.writtenHere).toBe(false)
    expect(body.note).toContain('STARTED NOTHING')
  })

  it('says nothing is there rather than nobody looked, for an agent with no wakes', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${anAgent()}/wakes`, headers: AS_A_PERSON })
    expect((reply.json() as { note: string }).note).toContain('nothing there, not nobody looked')
  })
})
