// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HELD HANDLE KEEPS THE MESSAGE — AND ONLY A SESSION THAT CAN ANSWER READS AS ANSWERING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHAT IT COST THE OWNER
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M74 of design/messages/ACCEPTANCE.md section 40 is about this defect:
 *
 *   While an agent got ready to reply, it showed as offline in the chat. It came back online
 *   only once it had replied. A picture sent during that time never arrived.
 *
 * The likely cause was that the agent's script was not mounted.
 *
 * The reference picture for the composer is the message that went missing.
 *
 * Two separate faults, both measured on this build before it changed:
 *
 *   1. THE AGENT READ AS OFFLINE FOR AS LONG AS IT WAS BUSY. For Claude Code the waiter's own EXIT
 *      is how a session is woken — `src/shared/waking.ts` measured that — so between the exit and
 *      the answer being written there is no open connection, no running process and no run output,
 *      and every one of the three presence inputs said nothing. The HOLD was there through all of
 *      it and presence never read it.
 *   2. ONLY THE FIRST WAITING MESSAGE WAS EVER HANDED OVER. The catch-up took them one at a time
 *      down a loop whose body ends in `process.exit(0)`, so the loop could run once. A second
 *      message written while the session answered waited for the hold after next.
 *
 * ---------------------------------------------------------------------------------------
 * M106: A HOLD IS ONLY AS GOOD AS THE SESSION BEHIND IT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M106: a secretary stopped for a long time by a usage limit still showed as online, though
 * it was offline all along. A hold is a claim written by a waiter process, and the waiter is not the
 * session: it can outlive the session it speaks for. The handle door and the presence dot both read
 * `theSessionBehindTheHold` in src/server/lib/answering.ts. Since 23 November 2026 a hold that still
 * beats is the base answer for every tool: the agent reads as answering unless something read of its
 * session says it is not. A hold past its lapse is read as before: the session's own recorded process
 * alive, or a live process resource row, or its transcript grown inside the lapse window. When none
 * can be read, the agent reads grey and the sentence names what could not be read.
 *
 * M81 IS UNCHANGED AND STILL PROVED HERE: past the lapse the handle is still its session's inside
 * the grace window, so a message waits for that session and no run starts. The two rules fit
 * together — the handle is held, and whether the agent reads as ANSWERING depends on the session
 * behind it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. While the waiter beats, the agent reads as answering on its hold. Once the waiter stops and
 *      the hold is kept, with nothing running at all, the agent does NOT read as answering. It
 *      reads offline, and the sentence names the process and the transcript that could not be read.
 *   2. A MESSAGE WRITTEN WHILE THE SESSION ANSWERS IS STILL THERE FOR THAT SESSION, and the next
 *      hold hands it over. Nothing else answered in its place.
 *   3. EVERYTHING WAITING GOES IN ONE WAKE, emergencies first, so two messages are two blocks in
 *      one printing rather than one message and a promise.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN ON 12 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 3 cases, all green. Then, in `theSessionBehindTheHold` in
 * src/server/lib/answering.ts, the reading was made to trust the hold alone again — the behaviour
 * M106 replaced — by returning `{ answering: true, from: 'a live process', says: null }` before any
 * process or transcript was read. Case 1 went red: it read answering again. Cases 2 and 3 stayed
 * green, because the waiter handing a message over does not depend on the answering reading. The
 * change was put back and the control run again: 3 cases, all green. This run was before
 * 23 November 2026, when case 1 still read a beating hold as grey; it was not run again since.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   make answering.ts trust the hold alone again   → case 1
 *   let the waiter take one message per wake        → cases 2 and 3
 */

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, aTestAgentsKeyEnvironment, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''
let keyEnv: NodeJS.ProcessEnv = {}
let agentId = ''
let session = ''
const started: ChildProcess[] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * THE THREE WINDOWS. Case 1 turns them down so it can reach `kept` in seconds, and puts them back
 * in a `finally`; the two cases after it run on the real defaults. The names are the product's own
 * settings, so there is no second place a window is written down.
 */
const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'
const LAPSE = 'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** Start the waiter, collecting everything it prints, and say when it stops. */
function startTheWaiter(): { child: ChildProcess; said: () => string; ended: Promise<number> } {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
      '--agent',
      'answering',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'default',
    ],
    { env: { ...keyEnv, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1', MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS: '120' } },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { child, said: () => printed, ended }
}

async function until(what: () => boolean | Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (await what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

async function sendTheAgent(body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  return (filed['record'] as { id: string }).id
}

async function markOn(messageId: string): Promise<string> {
  const read = (await get(`/api/messages/${messageId}`)) as { message?: { deliveries?: { mark: string }[] } }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`).mark
}

async function presence(): Promise<{ colour: string; word: string; from: string | null; says: string }> {
  const read = (await get(`/api/presence/agent/${agentId}`)) as {
    presence?: { colour: string; word: string; from: string | null; says: string }
  }
  return read.presence ?? { colour: '', word: '', from: null, says: '' }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  keyEnv = await aTestAgentsKeyEnvironment(app, 'answering', dirname(t.file))
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === 'answering'), 'the registry row').id
  const filed = await post('/api/records', {
    kind: 'session',
    title: 'A terminal answering as it',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as answering' },
  })
  session = (filed['record'] as { id: string }).id
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    // BY THE PID THIS FILE RECORDED WHEN IT STARTED THE PROCESS, and by nothing else.
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the outcome this wanted.
    }
  }
  await app.close()
  t.close()
})

describe('the waiter holds the handle while the session answers', () => {
  it('reads offline, not answering, while the hold is kept and nothing is running at all', async () => {
    // THE WINDOWS ARE TURNED DOWN FOR THIS CASE ONLY, so `kept` can be reached in seconds: beat 1,
    // lapse 2, grace 6. They are put back in the `finally`, so the two cases below run on the real
    // defaults and the hold this case leaves behind is still fresh for them.
    process.env[BEAT] = '1'
    process.env[LAPSE] = '2'
    process.env[GRACE] = '6'
    try {
      // THE CONTROL: with no hold, this agent is offline. Nothing else is serving it in this test —
      // no panel, no process, no run — so "answering" cannot pass for free.
      const before = await presence()
      expect(before.colour, 'nothing is serving this agent yet').toBe('grey')
      expect(before.from).toBe(null)

      const waiter = startTheWaiter()
      // WHILE THE WAITER RUNS, ITS HOLD BEATS AND THE AGENT READS AS ANSWERING. Nothing read of the
      // session says otherwise (no process recorded, no transcript), so the hold is the answer and
      // the sentence names that session. Until 23 November 2026 this was grey, because a hold alone
      // was not enough. The waiter's open connection is still not what answers (problem
      // h1S1MLK-SQ1I): the hold is.
      expect(
        await until(async () => {
          const now = await presence()
          return now.colour === 'green' && now.says.includes(session)
        }),
        waiter.said(),
      ).toBe(true)

      // AND NOW THE WAITER STOPS, which for Claude Code is how a session is woken. The process is
      // gone; the hold is not; and this is the whole of the window the owner was complaining about.
      const messageId = await sendTheAgent('聊天框样式example')
      expect(await until(() => waiter.said().includes(messageId)), waiter.said()).toBe(true)
      expect(await waiter.ended, 'the waiter stops, because stopping is the wake').toBe(0)

      // PAST THE LAPSE AND INSIDE THE GRACE. M81: the handle is still this session's. Three seconds
      // is past the two-second lapse and well short of the six-second grace, so the state is
      // unambiguously `kept` rather than a rounding away from `fresh`.
      await new Promise((go) => setTimeout(go, 3200))
      const listed = (await get('/api/handles')) as {
        holds?: { handle: string; state: string; releasedAt: string | null }[]
      }
      const mine = one(
        (listed.holds ?? []).filter((one) => one.handle === 'answering' && one.releasedAt === null),
        'the live hold on answering',
      )
      expect(mine.state, 'the handle is still its session inside the grace window').toBe('kept')

      // M106: WITH NOTHING BEHIND THE HOLD, the agent reads offline and not answering. No process
      // was recorded for it and it has no transcript, so the sentence names both absences.
      const answering = await presence()
      expect(answering.colour, 'a held handle alone is not answering').toBe('grey')
      expect(answering.word).toBe('Offline')
      expect(answering.from).toBe(null)
      expect(answering.says, 'the reading names what it could not read').toContain('no process was recorded for it')
      expect(answering.says, 'the reading names what it could not read').toContain('no transcript was recorded for it')
    } finally {
      delete process.env[BEAT]
      delete process.env[LAPSE]
      delete process.env[GRACE]
    }
  }, 120_000)

  it('keeps a message written while the session answers, for that same session', async () => {
    // NO WAITER IS RUNNING. A message sent while the secretary was replying, naming a made-up machine.
    const second = await sendTheAgent('参考图我在synthetic-host端已经发给你了')
    expect(await markOn(second), 'it is waiting, not lost and not taken by anything else').toBe('queued')
    // AND IT IS WAITING FOR THIS SESSION, which is what the hold means: no run answered in its place.
    const stands = (await get('/api/handles/answering/waiting')) as { waiting?: { messageId: string }[] }
    expect((stands.waiting ?? []).map((row) => row.messageId)).toContain(second)

    // THE NEXT HOLD HANDS IT OVER, without anybody sending it again.
    const again = startTheWaiter()
    expect(await until(() => again.said().includes(second)), again.said()).toBe(true)
    expect(await again.ended).toBe(0)
    // Hand-over is delivered; only the session's own act marks read.
    // Mutation: theLiveSessionTookIt writes seen again, or the waiter posts seen automatically.
    expect(await markOn(second), 'the hand-over is delivered').toBe('delivered')
  }, 120_000)

  it('hands over everything waiting in one wake, rather than one message per hold', async () => {
    const first = await sendTheAgent('第一条')
    const alsoFirst = await sendTheAgent('第二条')
    expect(await markOn(first)).toBe('queued')
    expect(await markOn(alsoFirst)).toBe('queued')

    const waiter = startTheWaiter()
    // BOTH ARE IN THE ONE PRINTING. Before M74 the first would be handed over and the second would
    // wait for the hold after next, because the wake for this runtime is the process stopping.
    expect(
      await until(() => waiter.said().includes(first) && waiter.said().includes(alsoFirst)),
      waiter.said(),
    ).toBe(true)
    expect(await waiter.ended).toBe(0)
    // Everything handed over is delivered, awaiting the session's own read mark.
    expect(await markOn(first)).toBe('delivered')
    expect(await markOn(alsoFirst)).toBe('delivered')
    // AND IT SAID SO, so a reader knows there is more than one to answer.
    expect(waiter.said()).toContain('2 MESSAGES ARE WAITING')
  }, 120_000)
})
