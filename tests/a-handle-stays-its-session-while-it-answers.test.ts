// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A HELD HANDLE WAITS FOR ITS SESSION — AND ONLY A SESSION THAT CAN ANSWER READS AS ANSWERING.
 *
 * Criterion M81 of design/messages/ACCEPTANCE.md section 42, on problem `i05BSaUcdfXF` of
 * 7 September 2026, and criterion M106: the secretary, stopped by a usage limit, still showed online long
 * afterwards, though it had been offline all along.
 *
 * ---------------------------------------------------------------------------------------
 * M81: THE HANDLE STAYS HELD INSIDE THE GRACE WINDOW AFTER THE BEAT STOPS
 * ---------------------------------------------------------------------------------------
 *
 * The waiter for a Claude Code session EXITS in order to wake it: a session reads a background
 * command's output when that command ends. So the beat stops every time a message arrives and starts
 * again once the session has answered. At 17:33:53 the gap was ninety-two seconds against a
 * ninety-second lapse window, the handle read as held by nobody, and the message worker started a
 * run under the secretary's handle that wrote in group RJ03J5R5EhDe as the secretary, contradicting what the secretary's own
 * session had said a minute before. So past the lapse the handle is still its session's inside the
 * grace window: a message waits for that session, and no run is started.
 *
 * ---------------------------------------------------------------------------------------
 * M106: A HELD HANDLE IS NOT, BY ITSELF, AN ANSWERING SESSION
 * ---------------------------------------------------------------------------------------
 *
 * A hold is a claim written by a waiter process, and the waiter is not the session: it can outlive
 * the session it speaks for — a usage limit, a crash, a closed terminal. The handle door and the
 * presence dot both read `theSessionBehindTheHold` in src/server/lib/answering.ts: the session's own
 * recorded process alive, or a live process resource row, or its transcript grown inside the lapse
 * window. When none of those can be read, the agent does not read as answering, and the sentence
 * says what could not be read. M81 is untouched: the handle is still held and a message still waits.
 *
 * WHAT IS PROVED HERE, in five parts.
 *
 * 1. A hold that has stopped beating reads as `kept` rather than as gone, and — because its session
 *    has no process on record and no transcript — the agent reads NOT answering: grey, with a
 *    sentence naming both absences.
 * 2. One pass of the REAL worker starts no run for a message that arrives in that window, and the
 *    delivery row says the message is waiting for that session rather than leaving a clock.
 * 3. The grace ends. Past it the hold is released with the reason, and the reason names the grace
 *    window rather than the lapse, because the grace is the window that was actually exceeded.
 * 4. A session that says it is done gives the handle up at once, whatever either window says.
 * 5. A hold whose session's OWN PROCESS is alive reads as answering (green), so the grey above is a
 *    reading of the session and not a rule that a held handle can never be green.
 *
 * IT DRIVES THE REAL WORKER, `onePass` from src/worker/index.ts against a server this file listens
 * on, with the fake runtime — the way every other worker test is written. A test that
 * re-implemented the decision would pass while the worker did the opposite.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN ON 12 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 5 cases, all green. Then, in `theSessionBehindTheHold` in
 * src/server/lib/answering.ts, the reading was made to trust the hold alone again — the behaviour
 * M106 replaced — by returning `{ answering: true, from: 'a live process', says: null }` before any
 * process or transcript was read.
 *
 * THE CASE THAT WENT RED, and it is the one this criterion is about:
 *
 *   × reads as still held, and not as answering, once the beat stops
 *
 * The worker's no-run case stayed green, because M81's hold does not depend on the answering
 * reading; and the process-alive case stayed green, because trusting every hold makes that one pass
 * for the wrong reason. The change was put back and the control run again: 5 cases, all green. So
 * the file holds the behaviour rather than passing beside it.
 *
 * AN EARLIER MUTATION, KEPT FOR THE M81 HALF (merge commit 300ea432, 8 September 2026): in `stateOf`
 * in src/server/lib/handles.ts, `return quiet <= handleGraceSeconds() ? 'kept' : 'lapsed'` was
 * replaced by `return 'lapsed'`. The first case and the worker's no-run case went red; the change
 * was put back.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ANSWERING_WORD } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let transcripts: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * THE THREE WINDOWS, SET SHORT SO A TEST CAN CROSS THEM.
 *
 * They are set for the whole file rather than per case because `handleGraceSeconds` reads them on
 * every call, and a case that changed one under a running worker would be measuring two rules at
 * once. Beat 1, lapse 2, grace 4: one second is the beat, a hold is `kept` between two and four
 * seconds of quiet, and it is given up after four.
 */
const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'
const LAPSE = 'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'

async function post(path: string, body: unknown, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return reply.json() as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

async function aSession(title: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code', doing: 'open in a terminal' },
  })
  return (filed['record'] as { id: string }).id
}

let transcriptNumber = 0

/**
 * A transcript on disk from two hours ago: older than this file's two-second lapse window, so a
 * reading that rests on it alone answers not answering. Only a live process can carry the case.
 */
function aTranscriptFromLongAgo(): string {
  transcriptNumber += 1
  const path = join(transcripts, `m106d-${String(transcriptNumber)}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    })}\n`,
  )
  return path
}

/**
 * A session whose record names its own process and points at a transcript, the way the session hook
 * writes both. Criterion M106: the process the hook recorded is the sign of life a waiting session
 * gives, and it is read here before the transcript's age is.
 */
function aSessionWithItsOwnProcess(title: string, pid: number, pidStartedAt: string): string {
  transcriptNumber += 1
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: {
      state: 'running',
      runtime: 'claude-code',
      doing: 'open in a terminal',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: `m106d-session-${String(transcriptNumber)}`,
          logPath: aTranscriptFromLongAgo(),
          resumeCommand: null,
          startedAt: null,
          entryPoint: null,
          pid,
          pidStartedAt,
        },
      },
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

/**
 * The start time of a process in the office's own stamp shape, read from the machine rather than
 * from the code under test. Same reading as tests/the-chats-presence-mark-is-true.test.ts.
 */
function theStartStampOf(pid: number): string {
  const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  return localStamp(new Date(out))
}

async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  return (filed['record'] as { id: string }).id
}

async function delivery(messageId: string): Promise<{ mark: string; because: string | null; run: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { mark: string; because: string | null; run: string | null }[] }
  }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
}

async function hold(handle: string, session: string) {
  return await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_THE_OWNER,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
}

/** The one hold on a handle, whatever state it is in, read straight off GET /api/handles. */
async function theHold(handle: string): Promise<{ state: string; releasedBecause: string | null }> {
  const read = (await get('/api/handles')) as { holds?: { handle: string; state: string; releasedBecause: string | null }[] }
  return one((read.holds ?? []).filter((h) => h.handle === handle), `a hold on ${handle}`)
}

async function letTimePass(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

beforeAll(async () => {
  process.env[BEAT] = '1'
  process.env[LAPSE] = '2'
  process.env[GRACE] = '4'
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-grace-'))
  transcripts = mkdtempSync(join(tmpdir(), 'mole-office-grace-logs-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  delete process.env[BEAT]
  delete process.env[LAPSE]
  delete process.env[GRACE]
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
  rmSync(transcripts, { recursive: true, force: true })
})

describe('a waiter that has stopped beating still has its handle', () => {
  let agentId: string
  let session: string
  let messageId: string

  it('reads as still held, and not as answering, once the beat stops', async () => {
    agentId = await anAgent('writing-an-answer')
    session = await aSession('The terminal writing an answer as writing-an-answer')
    await hold('writing-an-answer', session)

    // PAST THE LAPSE AND INSIDE THE GRACE: the waiter has exited, nothing is beating.
    await letTimePass(2600)

    expect((await theHold('writing-an-answer')).state).toBe('kept')

    // M106: A HELD HANDLE IS NOT AN ANSWERING AGENT. Nothing said the session behind this hold can
    // answer — no process was recorded for it and it has no transcript — so the agent reads not
    // answering, and the sentence names both absences.
    const read = (await get(`/api/presence/agent/${agentId}`)) as {
      presence?: { colour: string; word: string; from: string | null; says: string }
    }
    expect(read.presence?.colour).toBe('grey')
    expect(read.presence?.word).toBe('Offline')
    expect(read.presence?.from).toBeNull()
    expect(String(read.presence?.says)).toContain('no process was recorded for it')
    expect(String(read.presence?.says)).toContain('no transcript was recorded for it')
  })

  it('starts no run for a message that arrives in that window, and the row says it is waiting for that session', async () => {
    messageId = await messageTo(agentId, 'Did the inspector release builder-cd?')

    const report = await onePass(settings, watching)

    expect(report.started.filter((run) => run.messageId === messageId)).toEqual([])
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('queued')
    expect(stands.run).toBeNull()
    expect(String(stands.because)).toContain(session)
    expect(String(stands.because)).toContain('This message waits for that session, and no run was started.')
  })

  it('gives the handle up once the grace is over too, and the reason names the grace and not the lapse', async () => {
    await letTimePass(2000)

    const gone = await theHold('writing-an-answer')
    expect(gone.state).toBe('released')
    // THE NUMBER IS THE GRACE WINDOW. Four seconds is what this file set; naming the lapse here
    // would tell a reader the handle was given up two seconds before it was.
    expect(String(gone.releasedBecause)).toContain('which is longer than the 4 seconds it was allowed')
    expect(String(gone.releasedBecause)).toContain('Mole Office asks the person before it starts a run')
  })
})

describe('a session that says it is done gives the handle up at once', () => {
  it('is released on the session saying so, without waiting for either window', async () => {
    const agentId = await anAgent('done-already')
    const session = await aSession('The terminal that finished as done-already')
    await hold('done-already', session)

    const reply = await app.inject({
      method: 'POST',
      url: '/api/handles/done-already/release',
      headers: AS_THE_OWNER,
      payload: { session, because: 'the session said it was done' },
    })

    expect(reply.statusCode).toBe(200)
    const gone = await theHold('done-already')
    expect(gone.state).toBe('released')
    expect(gone.releasedBecause).toBe('the session said it was done')
    // AND NOTHING IS ANSWERING AS IT, so the next message is not held for a session that has gone.
    const answering = (await get(`/api/handles/done-already`)) as { answering?: { how: string } }
    expect(answering.answering?.how).toBe('nobody')
    expect(agentId).not.toBe('')
  })
})

describe("a hold whose session's own process is alive", () => {
  it('reads as answering, because the session it names can answer', async () => {
    const handle = 'really-there'
    const agentId = await anAgent(handle)
    const originalTitle = process.title
    try {
      // THE TEST'S OWN PROCESS MADE TO NAME THE CLAUDE PROGRAM, as
      // tests/the-chats-presence-mark-is-true.test.ts does: the office trusts a recorded pid only
      // when the live command line still names claude.
      process.title = 'claude'
      const pid = process.pid
      const session = aSessionWithItsOwnProcess('The terminal really open as really-there', pid, theStartStampOf(pid))
      await hold(handle, session)

      // THE TRANSCRIPT IS TWO HOURS OLD AND WOULD READ NOT ANSWERING BY ITSELF. The process the
      // session filed for itself is the reading that carries this, and the hold reads answering.
      const read = (await get(`/api/presence/agent/${agentId}`)) as {
        presence?: { colour: string; word: string; from: string | null }
      }
      expect(read.presence?.colour).toBe('green')
      expect(read.presence?.word).toBe(ANSWERING_WORD)
      expect(read.presence?.from).toBe('a session answering as it')
    } finally {
      process.title = originalTitle
    }
  })
})
