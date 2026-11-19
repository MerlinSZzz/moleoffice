// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE PASS CADENCE AND THE BEAT, DECOUPLED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BUILT AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Measured by Cluster B on 11 September 2026: `GET /api/worker/queue` was read 28,115 times in 2.4
 * days at a mean of 1.8 seconds, over 633 dead letters — a flat two-second pass reading an empty
 * queue tens of thousands of times for nothing. The cut: Cluster B mends the door's server cost in
 * src/server/lib/worker.ts and does not touch src/worker/index.ts; the pass cadence is the
 * worker's own, and this file proves it.
 *
 * THE CADENCE IS ADAPTIVE: fast — two seconds — when the last pass changed something or a run is
 * in flight; slow — thirty seconds — when nothing changed and no run is going. THE HELD MESSAGES
 * ARE NOT A CHANGE: the 633 dead letters sat in the queue held for days, and a cadence that
 * counted them would never slow down, which is the exact defect this work exists to end.
 *
 * AND THE PART THAT MATTERS MORE: THE BEAT IS NOT ON THE PASS ANY MORE. Until 11 September 2026
 * `onePass` beat every held handle itself, which was safe while the pass ran every two seconds
 * and would have broken holds the moment the pass slowed. So the beat was taken out of the pass
 * and put on its own timer, every MOLE_OFFICE_HANDLE_BEAT_SECONDS — the handle's own beatEvery,
 * read by handleBeatSeconds in src/server/lib/env.ts — whatever the pass cadence is. Slowing the
 * pass can never slow the heartbeat again, at any future cadence. LIVING INSIDE THE 90-SECOND
 * LAPSE MARGIN IS NOT THE FIX; REMOVING THE COUPLING IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE FRESHNESS TEST DRIVES, AND WHY IT NEEDS NO PASS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * A run of the fake runtime that hangs (its "please hang" behaviour) takes its agent's handle and
 * keeps it. The worker's beat timer runs alone — NO PASS IS CALLED for six beats, which is the
 * strictest version of the property: if the beat survives six of its own windows with no pass at
 * all, it survives any pass cadence and any slow pass, and the coupling cannot come back through a
 * future change to the wait between passes. The hold is then read back with `quietFor`, the
 * seconds it has gone without a beat: beaten on time, `quietFor` stays under three quarters of the
 * window; never beaten, it is the whole window.
 *
 * THE BEAT IS TWO SECONDS IN THIS FILE, NOT TWENTY. This file sets MOLE_OFFICE_HANDLE_BEAT_SECONDS
 * to 2 for its own process, which is both the worker's beat timer and the server that reads the
 * hold, so six beats take twelve seconds rather than two minutes. The case asserts the server read
 * the same two seconds, so a beat nobody set cannot pass for this one. Until 25 September 2026 it
 * waited sixty seconds of the default twenty-second beat.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 4 cases, all green. Then, in src/worker/index.ts, the beat timer's
 * callback in `startTheBeatTimer` was emptied — the timer kept, the beat removed — which is what
 * the worker's old in-pass beat hid: no pass, no beat, and a hold nobody watches lapses.
 *
 * THE CASE THAT WENT RED, and it is the one this criterion is about:
 *
 *   × keeps the hold fresh, on its own timer, through six beats with no pass
 *
 * The change was put back and the control run again: 4 cases, all green.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PROCESS THIS FILE STARTS IS STOPPED BY ITS GROUP, AND THE FILE CHECKS NONE IS LEFT
 * ---------------------------------------------------------------------------------------
 *
 * The only process this file starts is the fake runtime's hanging run, and it starts it through the
 * worker. The worker starts every run in `startInItsOwnGroup` in src/worker/runtimes/os.ts, so this
 * file wraps that one function and writes down each group id at the moment it is started. The hanging
 * run starts nothing of its own. The teardown stops each group written down, waits for it to go, and
 * fails the file if any is still there.
 *
 * WHY NOT THE WORKER'S OWN LIST. Until 26 September 2026 the teardown stopped the runs on `watching`.
 * The worker adds a run to that list only at the end of a pass, after several requests to the office.
 * A case that timed out in the middle of that pass left the list empty, so the teardown stopped
 * nothing and the run hung on in its own group. On 25 September one did, for an hour. So the teardown
 * also waits for the pass in flight to end before it stops anything, or the pass could start a run
 * after the stop.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, startTheBeatTimer, waitAfterAPass, type PassReport, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

/** Every process group the worker started while this file ran, written down as it was started. */
const groupsStarted = vi.hoisted(() => new Set<number>())
vi.mock('../src/worker/runtimes/os.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/worker/runtimes/os.ts')>()
  return {
    ...real,
    startInItsOwnGroup: (what: Parameters<typeof real.startInItsOwnGroup>[0]) => {
      const started = real.startInItsOwnGroup(what)
      groupsStarted.add(started.pgid)
      return started
    },
  }
})

/** Whether any process of this group is still there. */
function groupIsAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
/** The beat timer this file started, so the teardown can stop it rather than leaving it running. */
let beat: NodeJS.Timeout | null = null
/** The worker's pass this file called, so the teardown can wait for it to end before stopping anything. */
let pass: Promise<PassReport> | null = null

/** The beat this file runs with, in seconds, and how many beats the case waits with no pass. */
const BEAT_SECONDS = 2
const BEATS_WITH_NO_PASS = 6
/** The beat setting as the runner had it, put back when this file ends. */
const beatBefore = process.env['MOLE_OFFICE_HANDLE_BEAT_SECONDS']

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** How long the hold on one handle has gone without a beat, and what state that reads as. */
/** One durable agent, registered the plain way, for the message below to be addressed to. */
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id as string
}

async function theHold(handle: string): Promise<{ state: string; quietFor: number; beatEvery: number }> {
  const read = (await get('/api/handles')) as {
    holds?: { handle: string; state: string; quietFor: number }[]
    beatEvery: number
  }
  const row = one((read.holds ?? []).filter((h) => h.handle === handle), `a hold on ${handle}`) as {
    state: string
    quietFor: number
  }
  return { state: row.state, quietFor: row.quietFor, beatEvery: read.beatEvery }
}

beforeAll(async () => {
  // BEFORE ANYTHING READS IT: the server's `beatEvery` and the worker's beat timer both read it.
  process.env['MOLE_OFFICE_HANDLE_BEAT_SECONDS'] = String(BEAT_SECONDS)
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-pass-cadence-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  beat?.unref()
  if (beat) clearInterval(beat)
  // A PASS STILL GOING COULD START A RUN AFTER THE STOP BELOW, so it ends first. Its own failure is not
  // this hook's to report: the case that called it has already failed on it.
  await pass?.catch(() => {})
  for (const group of groupsStarted) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
    }
  }
  const stopAsked = Date.now()
  while ([...groupsStarted].some(groupIsAlive) && Date.now() - stopAsked < 10_000) {
    await new Promise((go) => setTimeout(go, 100))
  }
  const stillRunning = [...groupsStarted].filter(groupIsAlive)
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
  if (beatBefore === undefined) delete process.env['MOLE_OFFICE_HANDLE_BEAT_SECONDS']
  else process.env['MOLE_OFFICE_HANDLE_BEAT_SECONDS'] = beatBefore
  // THE FILE'S OWN CHECK, LAST, so a group left running fails the file after everything else is put back.
  expect(stillRunning, 'a process group this file started is still running').toEqual([])
}, 60_000)

describe('the wait after a pass', () => {
  const anEmptyReport: PassReport = {
    started: [],
    held: [],
    answered: [],
    failed: [],
    pickedUp: [],
    waitedLongEnough: [],
    cutOff: [],
    resumed: [],
    deadLetters: null,
    merges: { started: [], ended: [], pickedUp: [], stopped: [], held: [], bounced: [] },
  }

  it('is thirty seconds when nothing changed and no run is going', () => {
    expect(waitAfterAPass(anEmptyReport, [])).toBe(30_000)
  })

  it('is two seconds when the pass changed something', () => {
    expect(waitAfterAPass({ ...anEmptyReport, started: [{ messageId: 'm', agent: 'a', runtime: 'fake', session: 's' }] }, [])).toBe(2_000)
    expect(waitAfterAPass({ ...anEmptyReport, failed: [{ messageId: 'm', because: 'b' }] }, [])).toBe(2_000)
    expect(waitAfterAPass({ ...anEmptyReport, waitedLongEnough: ['s'] }, [])).toBe(2_000)
  })

  it('is two seconds while a run is in flight, even on a pass that changed nothing', () => {
    const inFlight = [{ handleName: 'held' }] as unknown as Parameters<typeof waitAfterAPass>[1]
    expect(waitAfterAPass(anEmptyReport, inFlight)).toBe(2_000)
  })

  it('never counts the held messages as a change, or the dead letters would keep it fast for ever', () => {
    const held = { ...anEmptyReport, held: [{ messageId: 'm', because: 'nobody is answering' }] }
    expect(waitAfterAPass(held, [])).toBe(30_000)
  })
})

describe('the beat, on its own timer', () => {
  it('keeps the hold fresh, on its own timer, through six beats with no pass', async () => {
    const agentId = await anAgent('beaten-by-the-timer')
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'a run that hangs',
      data: { body: 'please hang, and nothing will age this record', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    await post(`/api/messages/${messageId}/start-an-agent`, {})
    pass = onePass(settings, watching)
    const started = one((await pass).started.filter((r) => r.messageId === messageId), 'the run')
    const handle = started.agent
    // THE GROUP THE TEARDOWN WILL STOP IS THE RUN'S OWN, written down when it started.
    expect([...groupsStarted], 'the run was started without its group being written down').toEqual(watching.map((run) => run.handle.pgid))
    // THE PASS THAT TOOK THE HOLD IS THE LAST PASS THIS CASE CALLS. From here to the reading below,
    // only the beat timer runs.
    beat = startTheBeatTimer(settings, watching)
    const holdAtStart = await theHold(handle)
    expect(holdAtStart.state).toBe('fresh')
    // THE SERVER READS THE SAME BEAT THE TIMER RUNS ON, the one this file set.
    expect(holdAtStart.beatEvery, 'the server does not read the beat this file set').toBe(BEAT_SECONDS)

    // SIX BEATS WITH NO PASS AT ALL. That is the strictest form of "an idle pass": no pass, however
    // idle, beats anything, and what keeps the hold alive is the timer alone.
    const windowSeconds = BEAT_SECONDS * BEATS_WITH_NO_PASS
    await new Promise((go) => setTimeout(go, windowSeconds * 1000))

    const after = await theHold(handle)
    // BEATEN EVERY TWO SECONDS, the hold has gone well under three quarters of the window without a
    // beat. A window of silence would put quietFor at the whole window. The 90-second lapse margin
    // is not the test: the hold is judged against the beat's own window, which is what keeps it
    // fresh.
    expect(after.quietFor).toBeLessThan((windowSeconds * 3) / 4)
    // AND STILL FRESH, so the agent it belongs to reads as answering the whole time.
    expect(after.state).toBe('fresh')
    // AND THE RUN IS STILL WATCHED — the run was not ended by anything here.
    expect(watching.length).toBe(1)
  }, 120_000)
})
