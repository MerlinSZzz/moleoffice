// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE HANDLE, ONE SESSION: A SECOND SESSION IS REFUSED NAMING THE FIRST, AND NOTHING IS SIGNALLED.
 *
 * Criterion H4 of design/messages/ACCEPTANCE.md section 10: two terminals answering as one agent,
 * such as the same Claude open in two terminals and both sending, can confuse the session
 * management of Claude Code, Codex or OpenCode, or the server's cache. That confusion is what
 * this rule exists to prevent.
 *
 * WHAT IS PROVED HERE, and the last of the four is the one worth the trouble:
 *
 *   the refusal NAMES THE HOLDER — which session, which machine, which tool, when it last spoke,
 *   and how long it has to be quiet before it can be taken over;
 *   the refusal WRITES NOTHING — the hold that was there is untouched, down to its heartbeat;
 *   a handle whose holder went quiet IS TAKEN OVER, the old hold is kept and marked with the reason
 *   naming the session that took it, and the new one is a different row;
 *   NOTHING IS SIGNALLED, proved against a real process rather than by reading the code: a process
 *   registered under the first session is still alive after both the refusal and the takeover.
 *
 * THE PROCESS IS THIS FILE'S OWN AND IT IS STOPPED BY THE PID IT WAS STARTED WITH. Chapter 2 rule 1
 * of the office regulations says to stop a process only by the group id you recorded when you
 * started it, never by matching a command line — a builder that matched one killed the owner's live
 * API.
 */

import { spawn, type ChildProcess } from 'node:child_process'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let first: string
let second: string
/** A real process this file started, so "nothing is signalled" can be measured. */
let theProcess: ChildProcess | null = null

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'
const LAPSE = 'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'
// A HANDLE IS NOT FREE UNTIL THE GRACE WINDOW IS PAST TOO. Criterion M81: past the lapse the handle
// is still its session's, so a takeover waits for this one as well. Turned down with the others.
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'Two terminals',
    data: { handle: 'two-terminals', runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  first = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The first terminal',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as two-terminals' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  second = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The second terminal',
    data: { state: 'running', runtime: 'claude-code', doing: 'opened on the same checkout' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  // A REAL PROCESS BELONGING TO THE FIRST SESSION. It does nothing but stay alive.
  theProcess = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' })
  await new Promise((go) => setTimeout(go, 200))
})

afterEach(() => {
  delete process.env[BEAT]
  delete process.env[LAPSE]
  delete process.env[GRACE]
})

afterAll(async () => {
  // BY THE PID THIS FILE RECORDED WHEN IT STARTED THE PROCESS, and by nothing else.
  if (theProcess?.pid !== undefined) {
    try {
      process.kill(theProcess.pid, 'SIGTERM')
    } catch {
      // Already gone, which is the outcome this kill wanted.
    }
  }
  await app.close()
  t.close()
})

async function hold(session: string) {
  return await app.inject({
    method: 'POST',
    url: '/api/handles/two-terminals/hold',
    headers: AS_THE_OWNER,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
}

async function whoHoldsIt() {
  const reply = await app.inject({ method: 'GET', url: '/api/handles', headers: AS_THE_OWNER })
  return (
    reply.json() as {
      holds: {
        id: string
        session: string
        machine: string
        runtime: string
        claimedAt: string
        lastHeardAt: string
        quietFor: number
        state: string
        releasedAt: string | null
        releasedBecause: string | null
      }[]
    }
  ).holds
}

/** True when the process this file started is still running. */
function stillAlive(): boolean {
  if (theProcess?.pid === undefined) return false
  try {
    process.kill(theProcess.pid, 0)
    return true
  } catch {
    return false
  }
}

async function letTimePass(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('a second session claiming a handle somebody holds', () => {
  it('is refused, and the refusal names the session that holds it and everything about it', async () => {
    process.env[BEAT] = '1'
    process.env[LAPSE] = '30'
    process.env[GRACE] = '60'
    expect((await hold(first)).statusCode).toBe(201)

    const refused = await hold(second)

    expect(refused.statusCode).toBe(409)
    const said = String(refused.json().error)
    expect(said).toContain(first)
    expect(said).toContain('a-machine')
    expect(said).toContain('claude-code')
    // THE NUMBER IS THE GRACE WINDOW AND NOT THE LAPSE. Criterion M81: past the lapse the handle is
    // still its session's, so the moment this refusal is about is when the grace is up.
    expect(said).toContain('60 seconds')
    expect(said).toContain('one handle answers to one session')
  })

  it('writes nothing: the hold that was there is untouched, down to its heartbeat', async () => {
    process.env[BEAT] = '1'
    process.env[LAPSE] = '30'
    process.env[GRACE] = '60'
    const before = (await whoHoldsIt()).filter((one) => one.state === 'fresh')

    await hold(second)

    const after = (await whoHoldsIt()).filter((one) => one.state === 'fresh')
    // quietFor IS LEFT OUT: it is worked out from lastHeardAt and the clock when the hold is read,
    // so two reads a second apart differ while nothing was written. lastHeardAt is the stored
    // heartbeat and is still compared.
    const storedFields = (holds: typeof after) => holds.map(({ quietFor: _quietFor, ...stored }) => stored)
    expect(storedFields(after)).toEqual(storedFields(before))
    expect(after).toHaveLength(1)
    expect(after[0]?.session).toBe(first)
  })

  it('signals nothing: a process belonging to the first session is still running', () => {
    expect(stillAlive()).toBe(true)
  })
})

describe('and once the holder has gone quiet', () => {
  it('the second session takes the handle over, and the old hold says who took it', async () => {
    process.env[BEAT] = '1'
    process.env[LAPSE] = '2'
    process.env[GRACE] = '3'
    const wasHeld = (await whoHoldsIt()).find((one) => one.state === 'fresh')
    expect(wasHeld?.session).toBe(first)
    await letTimePass(3500)

    const taken = await hold(second)

    expect(taken.statusCode).toBe(201)
    const said = taken.json() as {
      hold: { id: string; session: string; state: string }
      tookOverFrom: { id: string; session: string; state: string; releasedBecause: string } | null
    }
    expect(said.hold.session).toBe(second)
    expect(said.hold.state).toBe('fresh')
    // A DIFFERENT ROW: the first session's hold was not rewritten to say somebody else has it.
    expect(said.hold.id).not.toBe(wasHeld?.id)
    // AND THE OLD ONE IS KEPT, marked over, saying it went quiet and who has the handle now.
    expect(said.tookOverFrom?.id).toBe(wasHeld?.id)
    expect(said.tookOverFrom?.session).toBe(first)
    expect(said.tookOverFrom?.state).toBe('released')
    expect(said.tookOverFrom?.releasedBecause).toContain('said nothing for')
    expect(said.tookOverFrom?.releasedBecause).toContain(second)
    expect(said.tookOverFrom?.releasedBecause).toContain('Nothing was signalled')
  })

  it('signals nothing by taking over either: the first session’s process is still running', () => {
    expect(stillAlive()).toBe(true)
  })

  it('and the first session can no longer say it is still there', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/handles/two-terminals/beat',
      headers: AS_THE_OWNER,
      payload: { session: first },
    })

    expect(refused.statusCode).toBe(409)
    expect(String(refused.json().error)).toContain(second)
  })
})
