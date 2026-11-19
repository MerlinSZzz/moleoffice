// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LIVE SESSION HOLDS ITS AGENT'S HANDLE, AND SAYS SO UNTIL IT STOPS.
 *
 * Criterion H1 of design/messages/ACCEPTANCE.md section 10: the message pool exists to let an agent
 * be a durable agent, with every message it sends and receives handled by that same agent. A hold
 * says which session is answering as which agent; a hold nobody has beaten for longer
 * than it was allowed is released, with the reason, by the next reader.
 *
 * WHAT IS PROVED HERE, driven through the doors a caller drives: a claim writes a hold naming the
 * session, the machine and the runtime; a beat moves the heartbeat and nothing else; a hold that
 * goes quiet is released by the next READ rather than by a sweeper, and the reason is on it; letting
 * go is the session's own act; and nothing here signals anything.
 *
 * THE LAPSE WINDOW IS TURNED DOWN TO ONE SECOND for these tests, through the setting the product
 * reads. A test that waited ninety seconds for the real default would be a test nobody runs.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRuntimeWordsSaid } from '../src/shared/participants.ts'

let t: TestDb
let app: FastifyInstance
let resources: typeof import('../src/server/lib/resources.ts')
let sessionRecord: string
let secondSessionRecord: string

const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-h1-'))
let transcriptNumber = 0

/**
 * A transcript on disk for a session that is answering.
 *
 * Criterion M126: a live process alone is no longer enough without a transcript on record, because a
 * bridge or a waiter can outlive the session it speaks for. The fixture writes the transcript each
 * record points at, so the process row is read exactly as it was before and this file still tests
 * the hold mechanism rather than the answering rule.
 */
function aTranscript(): string {
  transcriptNumber += 1
  const path = join(transcripts, `h1-${String(transcriptNumber)}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: `answering as ${THE_TEST_OFFICES_SECRETARY.handle}` }] },
    })}\n`,
  )
  return path
}

const AS_ARGUS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
}

/** The two settings this file turns down, put back after every test that moved them. */
const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'
const LAPSE = 'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'
// A HANDLE IS NOT FREE UNTIL THE GRACE WINDOW IS PAST TOO. Criterion M81: past the lapse the handle
// is still its session's and reads as `kept`, so these cases turn it down with the others.
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'

beforeAll(async () => {
  t = await freshDb()
  resources = await import('../src/server/lib/resources.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: THE_TEST_OFFICES_SECRETARY.name,
    data: { handle: THE_TEST_OFFICES_SECRETARY.handle, runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  sessionRecord = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A terminal somebody opened',
    data: {
      state: 'running',
      runtime: 'claude-code',
      doing: `answering as ${THE_TEST_OFFICES_SECRETARY.handle}`,
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: 'h1-session-1',
          logPath: aTranscript(),
          resumeCommand: null,
          startedAt: null,
          entryPoint: null,
        },
      },
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  secondSessionRecord = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A second terminal',
    data: {
      state: 'running',
      runtime: 'claude-code',
      doing: 'also open on this checkout',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: 'h1-session-2',
          logPath: aTranscript(),
          resumeCommand: null,
          startedAt: null,
          entryPoint: null,
        },
      },
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  /**
   * A LIVE PROCESS FOR EACH SESSION, BECAUSE A SESSION THAT IS ANSWERING HAS ONE. Criterion M106:
   * the handle door and the presence dot no longer read a hold's session from the waiter's beat
   * alone, so a fixture that wants "a live session" has to describe a live session. Criterion M126
   * adds the transcript: a live process alone is not enough, so each record also points at the
   * transcript written just above. The process is this test's own, registered while it is running,
   * exactly as a session registers the process it starts.
   */
  for (const session of [sessionRecord, secondSessionRecord]) {
    resources.registerResource({
      workspaceId: 'default',
      sessionRecordId: session,
      type: 'process',
      key: String(process.pid),
      actor: { type: 'human', id: THE_PERSON },
    })
  }
})

afterEach(async () => {
  delete process.env[BEAT]
  delete process.env[LAPSE]
  delete process.env[GRACE]
  // EVERY TEST STARTS WITH NOBODY HOLDING THE HANDLE. The rows are kept — a released hold is history
  // — and only the live one is let go, through the same door a session uses.
  for (const session of [sessionRecord, secondSessionRecord]) {
    await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/release`,
      headers: AS_ARGUS,
      payload: { session, because: 'the test that took it has finished' },
    })
  }
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

/** Hold the handle for one of the two sessions. */
async function hold(session: string, runtime = 'claude-code') {
  return await app.inject({
    method: 'POST',
    url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`,
    headers: AS_ARGUS,
    payload: { session, machine: 'a-machine', runtime },
  })
}

/** Wait for wall-clock time to pass, so a heartbeat can really go stale. */
async function letTimePass(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('a session says it is answering as an agent', () => {
  it('writes a hold naming the session, the machine and the runtime', async () => {
    const reply = await hold(sessionRecord)

    expect(reply.statusCode).toBe(201)
    const said = reply.json() as {
      hold: { handle: string; session: string; machine: string; runtime: string; state: string; lastHeardAt: string }
      beatEvery: number
      lapsesAfter: number
    }
    expect(said.hold.handle).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.hold.session).toBe(sessionRecord)
    expect(said.hold.machine).toBe('a-machine')
    expect(said.hold.runtime).toBe('claude-code')
    expect(said.hold.state).toBe('fresh')
    // THE TWO NUMBERS COME BACK WITH THE HOLD, so the waiter beats at the rate this installation
    // declares rather than one written into the script.
    expect(said.beatEvery).toBeGreaterThan(0)
    expect(said.lapsesAfter).toBeGreaterThan(said.beatEvery)
  })

  it('says who is answering, and it is the live session and not a run', async () => {
    await hold(sessionRecord)

    const reply = await app.inject({ method: 'GET', url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}`, headers: AS_ARGUS })

    expect(reply.statusCode).toBe(200)
    const said = reply.json() as { answering: { how: string; session: string; says: string } }
    expect(said.answering.how).toBe('a live session')
    expect(said.answering.session).toBe(sessionRecord)
    expect(said.answering.says).toContain('Mole Office starts no run')
  })

  it('refuses a handle no agent is registered under, rather than writing a hold nobody can read', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/handles/nobody-by-that-name/hold',
      headers: AS_ARGUS,
      payload: { session: sessionRecord, machine: 'a-machine', runtime: 'claude-code' },
    })

    expect(reply.statusCode).toBe(404)
    expect(reply.json().error).toContain('No durable agent in this installation has the handle')
  })

  it('refuses a runtime word this product has no adapter for', async () => {
    const reply = await hold(sessionRecord, 'some-other-tool')

    expect(reply.statusCode).toBe(400)
    // READ FROM THE ONE PLACE THE WORDS ARE DECLARED, for the same reason the refusal itself now
    // reads it: a copy of the list here would keep this green while the refusal went out of date.
    expect(reply.json().error).toContain(theRuntimeWordsSaid())
  })
})

describe('the heartbeat', () => {
  it('moves the heartbeat and leaves everything else on the hold alone', async () => {
    const first = (await hold(sessionRecord)).json() as { hold: { id: string; claimedAt: string; lastHeardAt: string } }
    await letTimePass(1100)

    const reply = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/beat`,
      headers: AS_ARGUS,
      payload: { session: sessionRecord },
    })

    expect(reply.statusCode).toBe(200)
    const said = reply.json() as { hold: { id: string; claimedAt: string; lastHeardAt: string; state: string } }
    expect(said.hold.id).toBe(first.hold.id)
    expect(said.hold.claimedAt).toBe(first.hold.claimedAt)
    expect(said.hold.lastHeardAt).not.toBe(first.hold.lastHeardAt)
    expect(said.hold.state).toBe('fresh')
  })

  it('refuses a beat from a session that does not hold the handle', async () => {
    await hold(sessionRecord)

    const reply = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/beat`,
      headers: AS_ARGUS,
      payload: { session: secondSessionRecord },
    })

    expect(reply.statusCode).toBe(409)
    expect(reply.json().error).toContain(sessionRecord)
    expect(reply.json().error).toContain('Only the session that holds a handle may say it is still there')
  })

  it('refuses a beat when nothing holds the handle, rather than writing a hold nobody claimed', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/beat`,
      headers: AS_ARGUS,
      payload: { session: sessionRecord },
    })

    expect(reply.statusCode).toBe(409)
    expect(reply.json().error).toContain('Nothing is holding the handle')
  })
})

describe('a hold that goes quiet', () => {
  it('is released by the next reader, with the reason on it, and nobody is answering after that', async () => {
    process.env[BEAT] = '1'
    process.env[LAPSE] = '2'
    process.env[GRACE] = '3'
    const mineIs = ((await hold(sessionRecord)).json() as { hold: { id: string } }).hold.id
    await letTimePass(3500)

    const reply = await app.inject({ method: 'GET', url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}`, headers: AS_ARGUS })

    expect(reply.statusCode).toBe(200)
    expect((reply.json() as { answering: { how: string } }).answering.how).toBe('nobody')
    // AND THE REASON IS ON THE ROW, so a person reading the list is never shown a hold that ended
    // for no stated reason. This is the release the READ made — there is no sweeper. The row is
    // found BY ITS ID rather than by its session, because a released hold is kept and this session
    // has several from the tests above.
    const list = (
      await app.inject({ method: 'GET', url: '/api/handles', headers: AS_ARGUS })
    ).json() as { holds: { id: string; state: string; releasedBecause: string | null }[] }
    const mine = list.holds.find((one) => one.id === mineIs)
    expect(mine?.state).toBe('released')
    expect(mine?.releasedBecause).toContain('said nothing for')
    expect(mine?.releasedBecause).toContain('Nothing was signalled')
  })

  it('is still fresh while the session keeps saying it is there', async () => {
    process.env[BEAT] = '1'
    process.env[LAPSE] = '3'
    process.env[GRACE] = '30'
    await hold(sessionRecord)
    await letTimePass(1200)
    await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/beat`,
      headers: AS_ARGUS,
      payload: { session: sessionRecord },
    })
    await letTimePass(1200)

    const reply = await app.inject({ method: 'GET', url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}`, headers: AS_ARGUS })

    expect((reply.json() as { answering: { how: string; session: string } }).answering.how).toBe('a live session')
  })
})

describe('letting go', () => {
  it('keeps the hold and marks it over with the reason the session gave', async () => {
    await hold(sessionRecord)

    const reply = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/release`,
      headers: AS_ARGUS,
      payload: { session: sessionRecord, because: 'the session stopped the waiter' },
    })

    expect(reply.statusCode).toBe(200)
    const said = reply.json() as { hold: { state: string; releasedAt: string | null; releasedBecause: string } }
    expect(said.hold.state).toBe('released')
    expect(said.hold.releasedAt).not.toBeNull()
    expect(said.hold.releasedBecause).toBe('the session stopped the waiter')
  })

  it('refuses a session letting go of a handle it does not hold', async () => {
    await hold(sessionRecord)

    const reply = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/release`,
      headers: AS_ARGUS,
      payload: { session: secondSessionRecord, because: 'not mine to let go' },
    })

    expect(reply.statusCode).toBe(409)
    expect(reply.json().error).toContain('Only the session that holds a handle may let it go')
  })
})

describe('the two settings have to agree', () => {
  /**
   * THE REFUSAL IS READ FROM THE LIBRARY AND NOT THROUGH A ROUTE, on purpose.
   *
   * `handleLapsesAfterSeconds` throws a plain Error rather than a PanelError, because
   * src/server/lib/env.ts is loaded before the database is open and cannot import the error class —
   * its own comment says so and names the twenty tests that proved it. A plain error reaches a
   * caller as "internal error", so a route-level assertion could only prove that something went
   * wrong, not that the right thing did. What matters is the sentence, and this is where it is.
   */
  it('refuses to read a lapse window shorter than the beat, rather than raising it to something safe', async () => {
    process.env[BEAT] = '30'
    process.env[LAPSE] = '10'
    const { handleLapsesAfterSeconds } = await import('../src/server/lib/env.ts')

    expect(() => handleLapsesAfterSeconds()).toThrow(/MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS/)
    expect(() => handleLapsesAfterSeconds()).toThrow(/MOLE_OFFICE_HANDLE_BEAT_SECONDS/)
    expect(() => handleLapsesAfterSeconds()).toThrow(/no live session would ever answer/)
  })

  it('refuses rather than answering with a number nobody set', async () => {
    process.env[BEAT] = '30'
    process.env[LAPSE] = '10'

    const reply = await app.inject({ method: 'GET', url: '/api/handles', headers: AS_ARGUS })

    // NOT A 200. The point is that no reader is handed a lapse window the settings do not describe.
    expect(reply.statusCode).toBe(500)
  })
})
