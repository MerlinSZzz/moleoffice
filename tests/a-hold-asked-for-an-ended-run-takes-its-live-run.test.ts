// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOLD ASKED FOR A RUN THAT HAS ENDED TAKES THE LIVE RUN OF THE SAME CONVERSATION (item 39, wave 13u round 109).
 *
 * On 27 October 2026 a secretary's hold rode on a run record that had finished nearly three weeks before, while two
 * records of the same conversation were running: one in the project the hold was asked in, one in another project. The
 * waiter is given the session record when it starts and sends that id to every door for as long as it runs, and
 * `holdTheHandle` in src/server/lib/handles.ts checked only that the record was in the project, never whether its run
 * had ended. So the hold took the ended record.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. A hold asked for a run that has not ended is on that run, as before, and says nothing more.
 * 2. A hold asked for an ended run takes the one run of the same conversation in the hold's project that has not
 *    ended, and the answer says which and why. A live run of that conversation in another project is not counted.
 * 3. Claiming again with the old id beats the same hold rather than being refused.
 * 4. The beat and the release take the old id only when it resolves to the hold's own run. A stranger's id, an old id
 *    that resolves to another run, and an old id that resolves to none are refused as before, and so are a stranger's
 *    id at the hand-over and process doors.
 * 5. With no live run of the conversation, the hold is on the ended run as asked, and the answer says why.
 * 6. With several, the same, and the answer names them.
 * 7. An ended run that names no conversation: the same, and the answer says so.
 * 8. The real waiter, started with the ended run's id, holds for the live run and hands a message over as that run, so
 *    the hand-over door is asked with the live id, and it prints the sentence the hold answered.
 * 9. A hold taken while its run was running, claimed again with that run's id after the run ended and its conversation
 *    went on under a new record, moves to the live run. It is not refused as somebody else's, and the old id still
 *    beats it.
 * 10. Only the run the hold is on moves it. A live run of another conversation, an ended run of another conversation
 *     with one live run, and a live run of the same conversation in another project each claim the handle and are
 *     refused with 409, as before, both while the hold is on the ended run and after it has moved.
 *
 * A conversation is the one the run's discovery stamp names (`stampOf` in src/server/lib/sessions.ts), the reading
 * src/server/lib/held-process.ts uses for the same question.
 */
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { theLiveSessionTookIt } from '../src/shared/handles.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const HANDLE = 'late-hand'
const ANOTHER_PROJECT = 'another-project'

let t: TestDb
let app: FastifyInstance
let api = ''
let agentId = ''
const started: ChildProcess[] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
}

/** The run records, by what each is for. */
const run = {
  ended: '',
  live: '',
  liveElsewhere: '',
  endedAlone: '',
  endedOfSeveral: '',
  severalA: '',
  severalB: '',
  endedOfAnother: '',
  liveOfAnother: '',
  endedNamingNothing: '',
  stranger: '',
}

/** What the hold door answers about an ended run, as this file reads it. */
interface EndedRunAsked {
  asked: string
  state: string
  conversation: string | null
  liveRuns: string[]
  took: string | null
  says: string
}

interface HoldAnswer {
  hold: { id: string; session: string; releasedAt: string | null }
  endedRunAsked: EndedRunAsked | null
}

/** A run record with a discovery stamp naming `conversation`, or with none when it is null. */
function aRun(title: string, state: string, conversation: string | null, workspaceId = 'default'): string {
  return t.api.createRecord({
    workspaceId,
    kind: 'session',
    title,
    data: {
      state,
      runtime: 'claude-code',
      ...(conversation === null
        ? {}
        : {
            extra: {
              discovered: {
                tool: 'claude-code',
                externalId: conversation,
                // A MADE-UP PATH: nothing here reads the transcript.
                logPath: `${THE_TEST_FIXTURE_ROOT}/transcripts/${conversation}.jsonl`,
              },
            },
          }),
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

async function door(path: string, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: `/api/handles/${HANDLE}/${path}`, headers: AS_THE_AGENT, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function hold(session: string): Promise<{ status: number; body: HoldAnswer & Record<string, unknown> }> {
  const said = await door('hold', { session, machine: 'a-machine', runtime: 'claude-code' })
  return said as { status: number; body: HoldAnswer & Record<string, unknown> }
}

/** A message from the person to the agent, written through the door a person writes through; its id. */
async function aMessageToTheAgent(words: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: { kind: 'message', title: words, data: { body: words, to: [{ kind: 'agent', id: agentId }] } },
  })
  return ((reply.json() as { record: { id: string } }).record).id
}

async function liveHolds(): Promise<{ id: string; session: string }[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/handles', headers: AS_THE_OWNER })
  const holds = (reply.json() as { holds?: { id: string; handle: string; session: string; releasedAt: string | null }[] }).holds ?? []
  return holds.filter((one) => one.handle === HANDLE && one.releasedAt === null)
}

async function until(what: () => boolean | Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (await what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ANOTHER_PROJECT, title: 'Made-up other project' })
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'Late Hand',
    data: { handle: HANDLE, runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })).json() as {
    agents?: { id: string; handle: string }[]
  }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === HANDLE), 'the registry row').id

  run.ended = aRun('The run that finished', 'finished', 'conversation-one')
  run.live = aRun('The same conversation, still running', 'running', 'conversation-one')
  run.liveElsewhere = aRun('The same conversation, running in another project', 'running', 'conversation-one', ANOTHER_PROJECT)
  run.endedAlone = aRun('A finished run with nothing after it', 'finished', 'conversation-two')
  run.endedOfSeveral = aRun('A crashed run', 'crashed', 'conversation-three')
  run.severalA = aRun('One of two runs after it', 'running', 'conversation-three')
  run.severalB = aRun('The other of two runs after it', 'running', 'conversation-three')
  run.endedOfAnother = aRun('A finished run of another conversation', 'finished', 'conversation-four')
  run.liveOfAnother = aRun('That conversation, still running', 'running', 'conversation-four')
  run.endedNamingNothing = aRun('A finished run with no stamp', 'finished', null)
  run.stranger = aRun('A running run of a conversation of its own', 'running', 'conversation-five')
}, 60_000)

afterEach(async () => {
  // EVERY CASE STARTS WITH NOBODY HOLDING THE HANDLE, let go through the door with the hold's own session.
  for (const held of await liveHolds()) {
    await door('release', { session: held.session, because: 'the case that took it has finished' })
  }
})

afterAll(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is what this wanted.
    }
  }
  await app.close()
  t.close()
})

describe('a hold asked for a run that has ended', () => {
  it('a hold asked for a live run is on that run, as before, and says nothing more', async () => {
    const said = await hold(run.live)
    expect(said.status, JSON.stringify(said.body)).toBe(201)
    expect(said.body.hold.session).toBe(run.live)
    expect(said.body.endedRunAsked).toBeNull()
  })

  it('takes the one live run of its conversation in this project, and says which and why', async () => {
    const said = await hold(run.ended)
    expect(said.status, JSON.stringify(said.body)).toBe(201)
    expect(said.body.hold.session, 'the hold rode on the ended run').toBe(run.live)
    const ended = said.body.endedRunAsked
    expect(ended).toMatchObject({ asked: run.ended, state: 'finished', conversation: 'conversation-one', liveRuns: [run.live], took: run.live })
    // THE RUN IN ANOTHER PROJECT IS NOT COUNTED: the hold is in this one.
    expect(ended?.liveRuns).not.toContain(run.liveElsewhere)
    expect(ended?.says).toContain(run.ended)
    expect(ended?.says).toContain(run.live)
    expect(ended?.says).toContain('finished')
  })

  it('claiming again with the old id beats the same hold', async () => {
    const first = await hold(run.ended)
    expect(first.status).toBe(201)
    const again = await hold(run.ended)
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(again.body.hold.id).toBe(first.body.hold.id)
    expect(again.body.hold.session).toBe(run.live)
    expect(await liveHolds()).toHaveLength(1)
  })

  it('the beat and the release take the old id only when it resolves to this hold', async () => {
    expect((await hold(run.ended)).status).toBe(201)

    const beat = await door('beat', { session: run.ended })
    expect(beat.status, JSON.stringify(beat.body)).toBe(200)

    // REFUSED AS BEFORE: a stranger, an old id that resolves to another run, and one that resolves to none.
    for (const session of [run.stranger, run.endedOfAnother, run.endedAlone]) {
      const refused = await door('beat', { session })
      expect(refused.status, `a beat from ${session}: ${JSON.stringify(refused.body)}`).toBe(409)
    }
    // THE HAND-OVER AND PROCESS DOORS REFUSE A STRANGER, as before.
    const sent = await aMessageToTheAgent('a question for the stranger case')
    const took = await door('took', { session: run.stranger, message: sent })
    expect(took.status, JSON.stringify(took.body)).toBe(409)
    // AND THE HOLD'S OWN RUN TAKES IT, so nothing is left waiting for the waiter's case below.
    const tookByTheHolder = await door('took', { session: run.live, message: sent })
    expect(tookByTheHolder.status, JSON.stringify(tookByTheHolder.body)).toBe(200)
    const processSaid = await door('process', { session: run.stranger, pid: process.pid, pidStartedAt: '2026-10-27 09:00:00' })
    expect(processSaid.status, JSON.stringify(processSaid.body)).toBe(409)
    const strangerLetGo = await door('release', { session: run.stranger, because: 'a stranger asked' })
    expect(strangerLetGo.status, JSON.stringify(strangerLetGo.body)).toBe(409)
    expect(await liveHolds()).toHaveLength(1)

    const letGo = await door('release', { session: run.ended, because: 'the session stopped' })
    expect(letGo.status, JSON.stringify(letGo.body)).toBe(200)
    expect(await liveHolds()).toHaveLength(0)
  })

  it('with no live run of the conversation, the hold is on the ended run as asked, and says why', async () => {
    const said = await hold(run.endedAlone)
    expect(said.status, JSON.stringify(said.body)).toBe(201)
    expect(said.body.hold.session).toBe(run.endedAlone)
    expect(said.body.endedRunAsked).toMatchObject({ asked: run.endedAlone, state: 'finished', liveRuns: [], took: null })
    expect(said.body.endedRunAsked?.says).toContain(run.endedAlone)
  })

  it('with several live runs, the hold is on the ended run as asked, and names them', async () => {
    const said = await hold(run.endedOfSeveral)
    expect(said.status, JSON.stringify(said.body)).toBe(201)
    expect(said.body.hold.session).toBe(run.endedOfSeveral)
    expect(said.body.endedRunAsked).toMatchObject({ asked: run.endedOfSeveral, state: 'crashed', took: null })
    expect([...(said.body.endedRunAsked?.liveRuns ?? [])].sort()).toEqual([run.severalA, run.severalB].sort())
    expect(said.body.endedRunAsked?.says).toContain(run.severalA)
    expect(said.body.endedRunAsked?.says).toContain(run.severalB)
  })

  it('an ended run that names no conversation: the hold is on it as asked, and says so', async () => {
    const said = await hold(run.endedNamingNothing)
    expect(said.status, JSON.stringify(said.body)).toBe(201)
    expect(said.body.hold.session).toBe(run.endedNamingNothing)
    expect(said.body.endedRunAsked).toMatchObject({ asked: run.endedNamingNothing, conversation: null, liveRuns: [], took: null })
  })

  it('a hold taken before its run ended moves to the live run when that run claims again, and is not refused', async () => {
    // HOW THE OWNER'S CASE BEGAN: the hold was taken while its run was running, the run ended later, and its
    // conversation went on under a new record. The waiter, started again, claims with the id it was given.
    const before = aRun('A run held while it was running', 'running', 'conversation-six')
    const first = await hold(before)
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    expect(first.body.hold.session).toBe(before)
    t.api.patchRecord(before, { dataPatch: { state: 'finished' } }, { type: 'human', id: THE_PERSON })
    const after = aRun('The same conversation after that run ended', 'running', 'conversation-six')

    const again = await hold(before)
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(again.body.hold.session, 'the hold stayed on the run that ended').toBe(after)
    expect(again.body.endedRunAsked).toMatchObject({ asked: before, took: after })
    expect((await liveHolds()).map((one) => one.session)).toEqual([after])
    const beat = await door('beat', { session: before })
    expect(beat.status, JSON.stringify(beat.body)).toBe(200)
  })

  it('a claim from another conversation or another project is refused 409, before the hold moves and after', async () => {
    const before = aRun('A run held while it was running, with strangers beside it', 'running', 'conversation-seven')
    expect((await hold(before)).status).toBe(201)
    t.api.patchRecord(before, { dataPatch: { state: 'finished' } }, { type: 'human', id: THE_PERSON })
    const after = aRun('That conversation after its run ended', 'running', 'conversation-seven')
    const elsewhere = aRun('That conversation, running in another project', 'running', 'conversation-seven', ANOTHER_PROJECT)

    const theStrangersAreRefused = async (when: string): Promise<void> => {
      // A LIVE RUN OF ANOTHER CONVERSATION, AND AN ENDED ONE whose one live run is not the hold's.
      for (const session of [run.stranger, run.endedOfAnother]) {
        const said = await hold(session)
        expect(said.status, `${when}, a claim from ${session}: ${JSON.stringify(said.body)}`).toBe(409)
      }
      // A LIVE RUN OF THE SAME CONVERSATION, FILED IN ANOTHER PROJECT AND CLAIMING FROM THERE.
      const fromThere = await app.inject({
        method: 'POST',
        url: `/api/handles/${HANDLE}/hold`,
        headers: { ...AS_THE_AGENT, 'x-mole-office-workspace': ANOTHER_PROJECT },
        payload: { session: elsewhere, machine: 'a-machine', runtime: 'claude-code' },
      })
      expect(fromThere.statusCode, `${when}, a claim from another project: ${fromThere.body}`).toBe(409)
    }

    await theStrangersAreRefused('while the hold is on the ended run')
    expect((await liveHolds()).map((one) => one.session)).toEqual([before])
    const moved = await hold(before)
    expect(moved.status, JSON.stringify(moved.body)).toBe(201)
    expect(moved.body.hold.session).toBe(after)
    await theStrangersAreRefused('after the hold moved')
    expect((await liveHolds()).map((one) => one.session)).toEqual([after])
  })
})

describe('the waiter started with an ended run', () => {
  it('holds for the live run, hands a message over as it, and prints why', async () => {
    // THE SENTENCE THE HOLD ANSWERS, read through the door first and let go, so the waiter's print can be held to it.
    const direct = await hold(run.ended)
    const sentence = direct.body.endedRunAsked?.says ?? ''
    expect(sentence).not.toBe('')
    await door('release', { session: run.live, because: 'read the sentence' })

    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
        '--agent',
        HANDLE,
        '--session',
        run.ended,
        '--api',
        api,
        '--workspace',
        'default',
      ],
      { env: { ...process.env, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
    )
    started.push(child)
    let printed = ''
    child.stdout?.on('data', (chunk) => (printed += String(chunk)))
    child.stderr?.on('data', (chunk) => (printed += String(chunk)))
    const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))

    expect(await until(async () => (await liveHolds()).some((one) => one.session === run.live)), printed).toBe(true)
    // THE HOLD IS STORED BEFORE THE WAITER READS THE ANSWER, so the print is waited for, as the message below is.
    expect(await until(() => printed.includes(sentence)), printed).toBe(true)

    const sent = await aMessageToTheAgent('is the waiter on the live run?')
    expect(await until(() => printed.includes(sent)), printed).toBe(true)
    expect(await ended, printed).toBe(0)
    const read = (await app.inject({ method: 'GET', url: `/api/messages/${sent}`, headers: AS_THE_OWNER })).json() as {
      message?: { deliveries?: { mark: string; because: string | null }[] }
    }
    const row = one(read.message?.deliveries ?? [], 'the delivery row')
    expect(row.mark).toBe('delivered')
    // HANDED OVER AS THE LIVE RUN: the hand-over door was asked with its id, not the ended one's.
    expect(row.because).toBe(theLiveSessionTookIt(run.live))
    expect(printed, 'the waiter claimed again on a beat').not.toContain('had lapsed')
  }, 60_000)
})
