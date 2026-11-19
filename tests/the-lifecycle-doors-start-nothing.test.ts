// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old close fixture had no submitted work. That one historical attachment is now inventoried explicitly; new worker finishes require seals, covered separately. Every lifecycle assertion remains. */
/**
 * SIX DOORS ONTO AN AGENT'S LIFECYCLE, AND NOT ONE OF THEM STARTS ANYTHING.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. Each of the six declares what a caller is asking for, whether another machine may ask, and
 *      a sentence a person reads. A route that left any of the three out does not register at all,
 *      and this file asserts all six arrived on the real server rather than in a private list.
 *   2. **None of them starts a process.** There is no start route and no resume route.
 *   3. Opening an attachment records a run that already exists. Closing one ends a period of
 *      participation and says, in the reply, that it touched no process.
 *   4. Presence and work state are two doors and neither hands back the other's word.
 *   5. The work-state doors answer 503 with the held migration's filename until the owner opens
 *      the announced window — rather than 200 with an empty reading, which would be a lie.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORK-STATE DOORS ARE TESTED BOTH WAYS
 * ---------------------------------------------------------------------------------------
 *
 * The transition store's tables are written, proved and deliberately not registered, so a database
 * the product serves today does not have them. The refusal is tested on a database without them —
 * which is every database today — and the behaviour is tested on a database this file applies the
 * held SQL to itself. Testing only the refusal would let the doors be broken and nobody would know
 * until the window opened.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { BuiltServer } from '../src/server/index.ts'
import { NOBODY_HAS_SAID, STALE_THRESHOLD_IS_UNMEASURED } from '../src/shared/lifecycle.ts'

const HELD_SQL = fileURLToPath(new URL('../held-migrations/agent-lifecycle-tables.sql', import.meta.url))

const AS_A_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
const AS_AN_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
let built: BuiltServer

/** The six doors this wave adds, as the operation each declares. */
const THE_SIX = [
  'attachment.list',
  'attachment.open',
  'attachment.close',
  'agent.presence',
  'agent.work-state',
  'agent.work-state-move',
]

beforeAll(async () => {
  t = await freshDb()
  built = await apiApp()
  app = built.app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** A durable agent to hang everything on. Each one gets its own handle, so no case reads another's. */
let agentsMade = 0
function anAgent(title = 'the lifecycle agent'): string {
  agentsMade += 1
  return t.api.createRecord({
    kind: 'agent',
    title,
    workspaceId: 'default',
    data: { handle: `lifecycle-${String(agentsMade)}`, state: 'active' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
}

/**
 * Open an attachment through the route, which is the only way this file makes one. One that names the agent is opened
 * by that agent: since the filing door of round 30 a session for an agent is filed only by that agent, those above
 * it, the person proved, or the office, and the program name this file sends otherwise is none of them.
 */
async function open(payload: Record<string, unknown>) {
  const agentId = payload['agentId']
  const handle = agentId === undefined ? 'claude-code' : String((t.api.getRecord(String(agentId))?.data as Record<string, unknown>)['handle'] ?? 'claude-code')
  const headers = agentId === undefined ? AS_AN_AGENT : { ...AS_AN_AGENT, 'x-mole-office-actor-id': handle }
  return app.inject({ method: 'POST', url: '/api/attachments', headers, payload })
}

// ============================================================ what each door declares

describe('every door says what it is, who may ask, and what it does', () => {
  it('serves all six on the real server, so nothing below is about a private list', () => {
    // Read off the router the server built, never off a list typed here: a route this file knew
    // about and the server did not is exactly the failure GET /api was rebuilt to end.
    const registered = built.listApiRoutes()
    expect(registered.length, 'the server registered no /api routes at all').toBeGreaterThan(100)
    for (const operation of THE_SIX) {
      const one = registered.find((each) => each.operation === operation)
      expect(one, `no route on the running server declares ${operation}`).toBeDefined()
      expect(one?.note ?? '', `${operation} registered without a sentence a person reads`).not.toBe('')
      expect(one?.reach, `${operation} registered without saying which machines may ask`).toBeDefined()
    }
  })

  it('lists all six at GET /api with a sentence each, which is where a caller looks', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api', headers: AS_A_PERSON })
    const endpoints = (reply.json() as { endpoints: { path: string; description: string | null }[] }).endpoints
    for (const path of ['/api/attachments', '/api/attachments/:id/close', '/api/agents/:id/presence', '/api/agents/:id/work-state']) {
      const rows = endpoints.filter((each) => each.path === path)
      expect(rows.length, `GET /api does not list ${path}`).toBeGreaterThan(0)
      for (const row of rows) expect(row.description, `${path} is listed with no sentence`).not.toBeNull()
    }
  })

  it('says in each sentence what the door does not do, where that is the thing to say', () => {
    const registered = built.listApiRoutes()
    const sentence = (operation: string): string =>
      registered.find((each) => each.operation === operation)?.note ?? ''
    expect(sentence('attachment.open')).toMatch(/STARTS NOTHING/)
    expect(sentence('attachment.close')).toMatch(/TOUCHES NO PROCESS/)
    expect(sentence('agent.presence')).toMatch(/NEVER STORED/)
    expect(sentence('agent.work-state')).toMatch(/NOTHING CACHES IT/)
    expect(sentence('agent.work-state-move')).toMatch(/STARTS NOTHING AND WAKES NOBODY/)
  })
})

// ============================================================ none of them starts anything

describe('no door here starts, resumes or signals a process', () => {
  it('serves no start route and no resume route, whatever it is asked', async () => {
    const agentId = anAgent()
    for (const url of [
      `/api/agents/${agentId}/start`,
      `/api/agents/${agentId}/resume`,
      `/api/agents/${agentId}/wake`,
      `/api/attachments/${agentId}/kill`,
    ]) {
      const reply = await app.inject({ method: 'POST', url, headers: AS_AN_AGENT, payload: {} })
      expect(reply.statusCode, `${url} answered something other than a 404`).toBe(404)
    }
  })
})

// ============================================================ open and close

describe('opening an attachment records a run that already exists', () => {
  it('opens one, hands it back, and lists it as open', async () => {
    const agentId = anAgent()
    const reply = await open({ title: 'a run working as it', agentId, providerSession: 'prov-1' })
    expect(reply.statusCode).toBe(200)
    const opened = reply.json() as { attachment: { id: string; open: boolean; providerSession: string | null } }
    expect(opened.attachment.open).toBe(true)
    expect(opened.attachment.providerSession).toBe('prov-1')

    const list = await app.inject({
      method: 'GET',
      url: `/api/attachments?agentId=${agentId}&openOnly=true`,
      headers: AS_A_PERSON,
    })
    const body = list.json() as { attachments: { id: string }[]; note: string }
    expect(body.attachments.map((one) => one.id)).toEqual([opened.attachment.id])
    expect(body.note).toContain('1 still open')
  })

  it('refuses an open with no title, because a person reads it in a list of runs', async () => {
    const reply = await open({ agentId: anAgent() })
    expect(reply.statusCode).toBe(400)
  })

  it('says when another attachment is already open for the same provider session, and does not refuse', async () => {
    const agentId = anAgent()
    await open({ title: 'the first run', agentId, providerSession: 'shared' })
    const second = await open({ title: 'the second run', agentId, providerSession: 'shared' })
    expect(second.statusCode, 'three live processes here share one provider session id').toBe(200)
    const body = second.json() as { alsoOpen: { forThisProviderSession: string[]; says: string } }
    expect(body.alsoOpen.forThisProviderSession).toHaveLength(1)
    expect(body.alsoOpen.says.length).toBeGreaterThan(0)
  })
})

describe('closing an attachment says what it did not do', () => {
  it('closes it, records how and why, and says the process was not touched', async () => {
    const agentId = anAgent()
    const opened = (await open({ title: 'a run', agentId })).json() as { attachment: { id: string } }
    t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(opened.attachment.id)
    const reply = await app.inject({
      method: 'POST',
      url: `/api/attachments/${opened.attachment.id}/close`,
      headers: AS_AN_AGENT,
      payload: { how: 'agent-said', because: 'The stage it was for is finished.' },
    })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as {
      attachment: { open: boolean; closedHow: string; closedBecause: string }
      says: string
    }
    expect(body.attachment.open).toBe(false)
    expect(body.attachment.closedHow).toBe('agent-said')
    expect(body.attachment.closedBecause).toBe('The stage it was for is finished.')
    expect(body.says, 'the close reply must say what it did not do').toMatch(/not.*(touch|kill)/i)
  })

  it('refuses a close that cannot say how it ended', async () => {
    const opened = (await open({ title: 'a run', agentId: anAgent() })).json() as { attachment: { id: string } }
    const reply = await app.inject({
      method: 'POST',
      url: `/api/attachments/${opened.attachment.id}/close`,
      headers: AS_AN_AGENT,
      payload: { because: 'It ended.' },
    })
    expect(reply.statusCode).toBe(400)
  })

  it('refuses a close with no reason, because a close nobody can explain is one nobody can act on', async () => {
    const opened = (await open({ title: 'a run', agentId: anAgent() })).json() as { attachment: { id: string } }
    const reply = await app.inject({
      method: 'POST',
      url: `/api/attachments/${opened.attachment.id}/close`,
      headers: AS_AN_AGENT,
      payload: { how: 'agent-said' },
    })
    expect(reply.statusCode).toBe(400)
  })
})

// ============================================================ presence

describe('the presence door', () => {
  it('reads Offline for an agent with nothing open, and names no input', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${anAgent()}/presence`, headers: AS_A_PERSON })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as { presence: string; from: string | null; staleAfterMinutes: number }
    expect(body.presence).toBe('offline')
    expect(body.from).toBeNull()
    expect(body.staleAfterMinutes).toBe(15)
  })

  it('names the input it used once something is open', async () => {
    const agentId = anAgent()
    await open({ title: 'a run', agentId })
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${agentId}/presence`, headers: AS_A_PERSON })
    const body = reply.json() as { presence: string; from: string; thresholdIsUnmeasured: string }
    expect(body.presence).toBe('online')
    expect(body.from).toBe('attachment-opened')
    expect(body.thresholdIsUnmeasured).toBe(STALE_THRESHOLD_IS_UNMEASURED)
  })

  it('hands back no work-state word, because presence is not a work state', async () => {
    const agentId = anAgent()
    await open({ title: 'a run', agentId })
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${agentId}/presence`, headers: AS_A_PERSON })
    const text = JSON.stringify(reply.json())
    for (const word of ['"working"', '"reporting"', '"standing-by"', '"blocked"', '"finished"']) {
      expect(text, `the presence door handed back ${word}`).not.toContain(word)
    }
  })

  it('refuses an attachment id, because presence is about the agent and a run is not one', async () => {
    const agentId = anAgent()
    const opened = (await open({ title: 'a run', agentId })).json() as { attachment: { id: string } }
    const reply = await app.inject({
      method: 'GET',
      url: `/api/agents/${opened.attachment.id}/presence`,
      headers: AS_A_PERSON,
    })
    expect(reply.statusCode).toBe(400)
  })
})

// ============================================================ work state, before the window

describe('the work-state doors before the migration window, which is where every database is today', () => {
  it('refuses the read with the held file named, rather than answering with an empty reading', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${anAgent()}/work-state`, headers: AS_A_PERSON })
    expect(reply.statusCode, 'a 200 with nothing in it would be a lie about what is known').toBe(503)
    expect(JSON.stringify(reply.json())).toContain('held-migrations/agent-lifecycle-tables.sql')
  })

  it('refuses the move the same way, and writes nothing', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/agents/${anAgent()}/work-state`,
      headers: AS_AN_AGENT,
      payload: { to: 'working', because: 'It accepted the work.' },
    })
    expect(reply.statusCode).toBe(503)
  })
})

// ============================================================ work state, after the window

describe('the work-state doors once the held migration has been run', () => {
  beforeEach(() => {
    t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
  })

  afterEach(() => {
    // PUT THE SHAPE BACK: the cases above this one are about a database without these tables.
    t.client.sqlite.exec('DROP TABLE agent_work_transitions; DROP TABLE agent_wakes;')
  })

  it('reads nobody has said for an agent with no transition, rather than a blank or Standing by', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/agents/${anAgent()}/work-state`, headers: AS_A_PERSON })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as { state: string | null; says: string; since: string | null }
    expect(body.state).toBeNull()
    expect(body.says).toBe(NOBODY_HAS_SAID)
    expect(body.since).toBeNull()
  })

  it('moves it, records why and who said so, and reads the new word back', async () => {
    const agentId = anAgent()
    const opened = (await open({ title: 'a run', agentId })).json() as { attachment: { id: string } }
    const moved = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/work-state`,
      headers: AS_AN_AGENT,
      payload: {
        to: 'working',
        because: 'It accepted the work in the message it woke to.',
        attachmentId: opened.attachment.id,
        relatedKind: 'message',
        relatedId: 'msg-1',
      },
    })
    expect(moved.statusCode).toBe(200)
    const body = moved.json() as { transition: { from: string | null; to: string }; now: { state: string } }
    expect(body.transition.from).toBeNull()
    expect(body.transition.to).toBe('working')
    expect(body.now.state).toBe('working')

    const read = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/work-state?history=true`,
      headers: AS_A_PERSON,
    })
    const reading = read.json() as {
      state: string
      because: string
      saidBy: { type: string; id: string }
      history: unknown[]
    }
    expect(reading.state).toBe('working')
    expect(reading.because).toBe('It accepted the work in the message it woke to.')
    expect(reading.saidBy).toEqual({ type: 'agent', id: 'claude-code' })
    expect(reading.history).toHaveLength(1)
  })

  it('refuses a move with no reason, through the door as well as under it', async () => {
    const agentId = anAgent()
    const opened = (await open({ title: 'a run', agentId })).json() as { attachment: { id: string } }
    const reply = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/work-state`,
      headers: AS_AN_AGENT,
      payload: { to: 'working', attachmentId: opened.attachment.id },
    })
    expect(reply.statusCode).toBe(400)
  })

  it('refuses a word that is not one of the five', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/agents/${anAgent()}/work-state`,
      headers: AS_A_PERSON,
      payload: { to: 'busy', because: 'It looked busy.' },
    })
    expect(reply.statusCode).toBe(400)
  })

  it('refuses an agent moving another agent, and takes it from a person', async () => {
    const mine = anAgent()
    const theirs = anAgent('the other agent')
    const opened = (await open({ title: 'a run', agentId: mine })).json() as { attachment: { id: string } }

    const refused = await app.inject({
      method: 'POST',
      url: `/api/agents/${theirs}/work-state`,
      headers: AS_AN_AGENT,
      payload: { to: 'finished', because: 'I say it is done.', attachmentId: opened.attachment.id },
    })
    expect(refused.statusCode).toBe(403)

    const byAPerson = await app.inject({
      method: 'POST',
      url: `/api/agents/${theirs}/work-state`,
      headers: AS_A_PERSON,
      payload: { to: 'finished', because: 'I read the report and the responsibility has ended.' },
    })
    expect(byAPerson.statusCode).toBe(200)
  })

  it('keeps the two dimensions apart: neither door hands back the other one word', async () => {
    const agentId = anAgent()
    const opened = (await open({ title: 'a run', agentId })).json() as { attachment: { id: string } }
    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/work-state`,
      headers: AS_AN_AGENT,
      payload: { to: 'finished', because: 'The responsibility ended.', attachmentId: opened.attachment.id },
    })

    const work = await app.inject({ method: 'GET', url: `/api/agents/${agentId}/work-state`, headers: AS_A_PERSON })
    const workText = JSON.stringify(work.json())
    for (const word of ['"online"', '"stale"', '"offline"']) {
      expect(workText, `the work-state door handed back the presence word ${word}`).not.toContain(word)
    }

    // AND THE PAIR THAT LOOKS LIKE A LEAK AND IS NOT. The attachment is still open while the work
    // state reads Finished. Nothing closed it, because a responsibility ending is not a run ending.
    const presence = await app.inject({ method: 'GET', url: `/api/agents/${agentId}/presence`, headers: AS_A_PERSON })
    expect((presence.json() as { presence: string }).presence).toBe('online')
    const stillOpen = await app.inject({
      method: 'GET',
      url: `/api/attachments?agentId=${agentId}&openOnly=true`,
      headers: AS_A_PERSON,
    })
    expect((stillOpen.json() as { attachments: unknown[] }).attachments).toHaveLength(1)
  })
})
