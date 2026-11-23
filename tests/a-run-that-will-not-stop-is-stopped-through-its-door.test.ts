// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT WILL NOT STOP IS STOPPED THROUGH ITS OWN DOOR, `POST /api/runtime/runs/:id/stop`. Wave 13s, round 62,
 * item 3.
 *
 * A run whose process will not end is stopped by the agent that started it, its supervisor or a secretary, each proved
 * by its own key. In one call the door revokes the run's key, so the run's writes to the office stop even while its
 * process lives; it stops the process group the ledger recorded for the run through the release the shutdown pause
 * uses; and, only when it signalled that group, it writes on the run who stopped it and why.
 *
 *   1. The starter stops a run whose group ignores the signal. The run's key is refused at once, the run says who
 *      stopped it and why, and it is not called crashed, because its process is still running.
 *   2. An agent that neither started nor supervises the run is refused, and so are a keyless claim to be the starter
 *      and the person. Nothing is done: nothing is signalled, the row stays open and the run's key still proves it.
 *   3. Only the group the ledger recorded is signalled, never another group running the same command. A run whose
 *      group is gone after the signal is recorded as crashed, with who stopped it and why.
 *   4. A secretary may stop a run it did not start.
 *   5. A run with no recorded group is refused with 409, naming that, and its key is revoked all the same.
 *   6. The run's own agent is refused, with its run's key and with its own registration key, and nothing is done.
 *      The office's rule on who may end a run admits a run's own agent, so the door's own check is the only thing
 *      that keeps it out.
 *   7. A second stop on a stopped run is refused with 409, saying what it found. The first stop revoked the key and
 *      its group is gone, so this call does nothing, and the run's data is as it was, byte for byte.
 *   8. The same for a run that has ended: it paused itself, which revoked its key, and its process exited with its
 *      row still open. The stop closes that row with no signal, and writes nothing on the run.
 *   9. A stop that revokes the key but finds no group to signal says exactly that on the run, and never that the run
 *      was stopped. What the run said before is kept after it, and its state is left as it was.
 *  10. The agent a run ran as is the run's own agent too, and is refused with its own key in the same words, and
 *      nothing is done. The office's rule on who may end a run admits it, as it admits the agent a run serves.
 *  11. A running run whose command exited without a finish, its row still open, is stopped by its starter. The door
 *      finds its group ended already and signals nothing, so it still answers 409. It revokes the run's key, closes
 *      the row, and writes the run crashed, because nothing of the run runs and nothing can write for it. The run
 *      says its key was revoked and what it said before, and never that it was stopped.
 *
 * Cases 7 to 9 are item 1 of round 62's fix round: the door wrote "stopped this run" on every call, including calls
 * that revoked no key and signalled nothing. Case 6 is that round's item 3.
 *
 * The machine is a stand-in probe: nothing on this computer is signalled. Every agent is registered through
 * POST /api/agents/started and every request goes through the real doors with `app.inject`. No assertion prints a key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. No revocation: the door's call of `revokeTheRunKeyRecordedOn` taken out. Cases 1, 5 and 9 go red: case 5
 *      because the run's key still proves it, case 1 on the reply's `keyRevoked`, and case 9 because the reply no
 *      longer says the key was revoked. With the reply still saying the key was revoked, case 1 goes red because the
 *      run's key still proves it.
 *   b. No caller check: the door admits every caller. Cases 2, 6 and 10 go red. In case 2 the decoy's stop signals the
 *      run's group, and the office's rule on who may end a run then refuses to write the run crashed for the decoy. In
 *      case 6 the run's own key stops its own run, and in case 10 the agent it ran as stops it.
 *   c. Signal by name: the door signals every group whose process runs the recorded process's command, read from the
 *      probe's process table, instead of releasing the row. Cases 1, 3 and 4 go red, because the decoy's group is
 *      signalled.
 *   d. The run's own agent admitted: the door's line that refuses it taken out. Cases 6 and 10 go red: the run's own
 *      key stops its own run, and so does the key of the agent it ran as.
 *   e. A call that revoked no key writes on the run all the same: the early answer in `signalledNothing` taken out.
 *      Cases 7 and 8 go red: the reply says the run's key was revoked, which this call did not do, and the run is
 *      written on.
 *   f. A group that had ended already counted as stopped: the door's check of `acted` taken out. Case 8 goes red: the
 *      stop is answered 200 and the run is told it was stopped, by a call that signalled nothing.
 *   g. The revoked key written as a stop: the line says "stopped this run" instead of "revoked this run's key". Case 9
 *      goes red.
 *   h. What the run said before dropped from the line. Case 9 goes red.
 *   i. The door's own line asks only the agent a run serves, the run's own agents read without its `ranAs`. Case 10
 *      goes red: the agent it ran as stops it.
 *   j. The door's words for the run's own agent renamed away from their export. Case 10 goes red, on the export.
 *
 * The run that added case 10 ran b and d again, and i and j, each after a control run.
 * Case 11 has none, because the round that added it made no mutation proofs.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The command every run's process and the decoy's process run, so a stop by name would find both. */
const THE_COMMAND = 'claude --print a round of work'
/** A process in a group of its own that runs the same command and belongs to no run here. */
const DECOY_PID = 4_290_001
/** The stand-in server's own group, which nothing here may signal. */
const OWN_GROUP = 4_390_001

/** The stand-in machine: its processes, the groups that ignore SIGTERM, and every signal sent. */
const live = new Map<number, OsProcess>()
const stubborn = new Set<number>()
const signalled: { pgid: number; signal: string }[] = []
let nextPid = 4_200_001

function standInProbe(): OsProbe {
  return {
    ...res.LINUX_PROBE,
    platform: 'stand-in',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    processTable: () => ({ ok: true, processes: [...live.values()].map((p) => ({ pid: p.pid, command: p.command, cwd: null })) }),
    listeningPorts: () => [],
    ownProcessGroup: () => OWN_GROUP,
    killProcessGroup: (pgid, signal) => {
      signalled.push({ pgid, signal })
      if (signal === 'SIGTERM' && stubborn.has(pgid)) return
      for (const p of [...live.values()]) if (p.pgid === pgid) live.delete(p.pid)
    },
  }
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{64}$/.test(value)
}

/** An agent's own headers: its name, and its key and its run where it sends them. */
function asAgent(handle: string, key?: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: (reply.body === '' ? {} : reply.json()) as Record<string, unknown> }
}

/** The words of a refusal, for the assertions on what it names. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

/** Register an agent through the starter door, as `by`, and hand back the key it was answered. */
async function register(handle: string, by: Record<string, string>, role?: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

let starterKey = ''
let workerKey = ''
let decoyKey = ''
let secretaryKey = ''
let ranAsKey = ''

interface ARun {
  id: string
  runKey: string
  pid: number | null
  row: string | null
}

/**
 * A worker's run, filed by its starter's key so it is minted a run key, and, unless `noGroup`, the process the launcher
 * started for it: a process row marked as started by the product, in a group of its own on the stand-in machine. With
 * `ranAs`, the run ran as that agent and names no agent it serves, so it is minted no run key.
 */
async function aWorkersRun(opts: { noGroup?: boolean; ignoresTerm?: boolean; doing?: string; ranAs?: string } = {}): Promise<ARun> {
  const filed = await ask('POST', '/api/records', asAgent('the-starter', starterKey), {
    kind: 'session',
    title: 'a-worker at work',
    data: {
      state: 'running', runtime: 'claude-code',
      ...(opts.ranAs === undefined ? { servingAgentId: idOf('a-worker'), servingAgent: 'a-worker' } : { ranAs: [{ workspaceId: 'default', agentId: idOf(opts.ranAs) }] }),
      ...(opts.doing === undefined ? {} : { doing: opts.doing }),
    },
  })
  expect(filed.status, said(filed.body)).toBe(201)
  const id = String((filed.body['record'] as { id?: string } | undefined)?.id ?? '')
  const runKey = (filed.body['runKey'] as { key?: string } | undefined)?.key ?? null
  if (opts.ranAs === undefined) expect(isAKey(runKey), 'the worker’s run was minted no key').toBe(true)
  if (opts.noGroup === true) return { id, runKey: runKey ?? '', pid: null, row: null }
  const createdAt = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(id) as { at: string }).at
  const pid = nextPid
  nextPid += 1
  live.set(pid, { pid, pgid: pid, ppid: 1, command: THE_COMMAND, startedAt: createdAt })
  if (opts.ignoresTerm === true) stubborn.add(pid)
  const row = await ask('POST', '/api/resources', AS_THE_PERSON, { sessionRecordId: id, type: 'process', key: String(pid), startedByTheProduct: true })
  expect(row.status, said(row.body)).toBe(201)
  return { id, runKey: runKey ?? '', pid, row: String((row.body['resource'] as { id?: string }).id) }
}

/**
 * WHETHER THE RUN'S OWN KEY STILL PROVES IT, read two ways. A door that takes only an agent's own key answers it, and a
 * note it writes is proved by an agent's key on its change row. Each is `true` only while the key proves the run.
 */
async function theRunsKeyStillProvesIt(run: ARun): Promise<{ door: boolean; note: boolean }> {
  const door = await ask('GET', '/api/messages/notice-rules', asAgent('a-worker', run.runKey, run.id))
  const note = await ask('POST', '/api/records', asAgent('a-worker', run.runKey, run.id), { kind: 'note', title: 'written by the run', data: { body: 'written by the run' } })
  const noteId = (note.body['record'] as { id?: string } | undefined)?.id
  const row = noteId === undefined
    ? undefined
    : (t.client.sqlite.prepare('SELECT proved_by AS provedBy FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1').get(noteId) as { provedBy: string | null } | undefined)
  return { door: door.status === 200, note: note.status === 201 && row?.provedBy === 'an-agent-key' }
}

function theRun(id: string): { state: unknown; doing: unknown } {
  const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
  return { state: data['state'], doing: data['doing'] }
}

/** The run's data as the office stores it, so "as it was" is compared byte for byte. */
function theRunsData(id: string): string {
  return (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data
}

function theRowIsOpen(row: string): boolean {
  return (t.client.sqlite.prepare('SELECT released_at AS at FROM session_resources WHERE id = ?').get(row) as { at: string | null }).at === null
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  res = await import('../src/server/lib/resources.ts')
  // THE STARTER REGISTERS THE WORKER, so the worker's run is the starter's to stop. The decoy is a supervisor too, and
  // registered nobody here; the secretary holds the secretary's card.
  starterKey = await register('the-starter', AS_THE_PERSON, 'supervisor')
  workerKey = await register('a-worker', asAgent('the-starter', starterKey))
  decoyKey = await register('a-decoy', AS_THE_PERSON, 'supervisor')
  secretaryKey = await register('the-secretary', AS_THE_PERSON, 'secretary')
  ranAsKey = await register('a-ran-as-worker', asAgent('the-starter', starterKey))
}, 60_000)

beforeEach(() => {
  live.clear()
  stubborn.clear()
  signalled.length = 0
  live.set(DECOY_PID, { pid: DECOY_PID, pgid: DECOY_PID, ppid: 1, command: THE_COMMAND, startedAt: '2026-10-17 00:00:00' })
  res.useOsProbe(standInProbe())
})

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a run that will not stop is stopped through its door', () => {
  it('by its starter: the run’s key is refused at once, even though its process lives on', async () => {
    const run = await aWorkersRun({ ignoresTerm: true })
    expect(await theRunsKeyStillProvesIt(run), 'the run’s key did not prove it before the stop').toEqual({ door: true, note: true })

    const stop = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter', starterKey), { why: 'it ignores every message' })
    expect(stop.status, said(stop.body)).toBe(200)
    expect(stop.body['keyRevoked']).toBe(true)
    expect(stop.body['stillAlive']).toBe(true)
    expect(signalled).toEqual([{ pgid: run.pid, signal: 'SIGTERM' }])

    // THE KEY IS REFUSED AT ONCE, while the process is still running.
    expect(live.has(run.pid ?? 0), 'the stand-in process should still be running').toBe(true)
    expect(await theRunsKeyStillProvesIt(run), 'the run’s key still proves it after the stop').toEqual({ door: false, note: false })
    // AND THE RUN SAYS WHO STOPPED IT AND WHY, and is not called crashed while its process runs.
    const after = theRun(run.id)
    expect(after.state).toBe('running')
    expect(String(after.doing)).toContain('the-starter')
    expect(String(after.doing)).toContain('it ignores every message')
  }, 30_000)

  it('refuses a caller who neither started nor supervises the run, and does nothing', async () => {
    const run = await aWorkersRun()
    const refused = [
      await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('a-decoy', decoyKey), { why: 'it is not mine' }),
      // A NAME IN THE HEADERS ALONE PROVES NOTHING, even the starter's.
      await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter'), { why: 'no key' }),
      // THE PERSON STOPS A RUN'S PROCESS FROM ITS ROW, and this door is for the agents above the run.
      await ask('POST', `/api/runtime/runs/${run.id}/stop`, AS_THE_PERSON, { why: 'the person' }),
    ]
    for (const one of refused) {
      expect(one.status, said(one.body)).toBe(403)
      expect(said(one.body)).toContain('Nothing was done')
    }
    expect(said(refused[0]?.body ?? {})).toContain('started')
    expect(signalled).toEqual([])
    expect(theRowIsOpen(run.row ?? ''), 'a refused stop closed the run’s row').toBe(true)
    expect(await theRunsKeyStillProvesIt(run), 'a refused stop revoked the run’s key').toEqual({ door: true, note: true })
    expect(theRun(run.id).state).toBe('running')
  })

  it('signals only the group the ledger recorded, never another group running the same command', async () => {
    const run = await aWorkersRun()
    const stop = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter', starterKey), { why: 'it is stuck in a loop' })
    expect(stop.status, said(stop.body)).toBe(200)
    expect(stop.body['stillAlive']).toBe(false)
    expect(signalled, 'a group other than the recorded one was signalled').toEqual([{ pgid: run.pid, signal: 'SIGTERM' }])
    expect(live.has(DECOY_PID), 'the decoy’s process was stopped').toBe(true)
    expect(theRowIsOpen(run.row ?? ''), 'the run’s row is still open after its group went').toBe(false)
    // ITS GROUP IS GONE, SO THE RUN IS OVER, and it says who ended it and why.
    const after = theRun(run.id)
    expect(after.state).toBe('crashed')
    expect(String(after.doing)).toContain('the-starter')
    expect(String(after.doing)).toContain('it is stuck in a loop')
  })

  it('lets a secretary stop a run it did not start', async () => {
    const run = await aWorkersRun()
    const stop = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-secretary', secretaryKey), { why: 'its supervisor is away' })
    expect(stop.status, said(stop.body)).toBe(200)
    expect(signalled).toEqual([{ pgid: run.pid, signal: 'SIGTERM' }])
    expect(String(theRun(run.id).doing)).toContain('the-secretary')
  })

  it('refuses a run with no recorded group, naming that, and revokes its key all the same', async () => {
    const run = await aWorkersRun({ noGroup: true })
    const stop = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter', starterKey), { why: 'it will not stop' })
    expect(stop.status, said(stop.body)).toBe(409)
    expect(said(stop.body)).toContain('no process group')
    expect(said(stop.body)).toContain('key was revoked')
    expect(signalled).toEqual([])
    expect(await theRunsKeyStillProvesIt(run), 'the run’s key still proves it').toEqual({ door: false, note: false })
    expect(String(theRun(run.id).doing)).toContain('it will not stop')
  })

  // THE OFFICE'S RULE ON WHO MAY END A RUN ADMITS THE RUN'S OWN AGENT (`mayEndARun`), so with the door's own line
  // taken out, this case's first stop is the run stopping itself.
  it('refuses the run’s own agent, with its run’s key and with its own key, and does nothing', async () => {
    const run = await aWorkersRun({ doing: 'working through the round' })
    const before = theRunsData(run.id)
    for (const own of [asAgent('a-worker', run.runKey, run.id), asAgent('a-worker', workerKey)]) {
      const refused = await ask('POST', `/api/runtime/runs/${run.id}/stop`, own, { why: 'it stops itself' })
      expect(refused.status, said(refused.body)).toBe(403)
      expect(said(refused.body)).toContain("The agent this key proves is the run's own agent.")
      expect(said(refused.body)).toContain('Nothing was done')
    }
    expect(signalled).toEqual([])
    expect(theRowIsOpen(run.row ?? ''), 'a refused stop closed the run’s row').toBe(true)
    expect(theRunsData(run.id), 'a refused stop wrote on the run').toBe(before)
    expect(await theRunsKeyStillProvesIt(run), 'a refused stop revoked the run’s key').toEqual({ door: true, note: true })
  })

  // THE AGENT A RUN RAN AS IS ITS OWN AGENT TOO, and the office's rule on who may end a run admits it, so with the door's
  // own line asking only the agent a run serves, this stop is the run stopping itself.
  it('refuses the agent the run ran as, with its own key, as the run’s own agent, and does nothing', async () => {
    const { THE_KEY_PROVES_THE_RUNS_OWN_AGENT } = await import('../src/server/api/runtime.ts')
    const run = await aWorkersRun({ ranAs: 'a-ran-as-worker', doing: 'working as the agent it ran as' })
    const before = theRunsData(run.id)
    const refused = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('a-ran-as-worker', ranAsKey), { why: 'it stops itself' })
    expect(refused.status, said(refused.body)).toBe(403)
    expect(said(refused.body)).toContain(THE_KEY_PROVES_THE_RUNS_OWN_AGENT)
    expect(signalled).toEqual([])
    expect(theRowIsOpen(run.row ?? ''), 'a refused stop closed the run’s row').toBe(true)
    expect(theRunsData(run.id), 'a refused stop wrote on the run').toBe(before)
  })

  it('refuses a second stop of a stopped run with 409, and leaves the run’s data as it was, byte for byte', async () => {
    const run = await aWorkersRun()
    const first = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter', starterKey), { why: 'it is stuck' })
    expect(first.status, said(first.body)).toBe(200)
    expect(theRun(run.id).state).toBe('crashed')
    const before = theRunsData(run.id)
    signalled.length = 0

    const second = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-secretary', secretaryKey), { why: 'once more' })
    expect(second.status, said(second.body)).toBe(409)
    expect(said(second.body)).toContain(`its process row ${run.row ?? ''} was closed at`)
    expect(said(second.body)).toContain('so nothing was signalled')
    expect(said(second.body)).toContain('This stop revoked no key')
    expect(said(second.body)).toContain('Nothing was written on the run: its doing line and its state are as they were.')
    expect(signalled).toEqual([])
    expect(theRunsData(run.id), 'a stop that did nothing wrote on the run').toBe(before)
  })

  it('refuses a stop of a run that has ended with 409, and leaves the run’s data as it was, byte for byte', async () => {
    const run = await aWorkersRun()
    // THE RUN PAUSES ITSELF, an end, which revokes its key, and then its process exits. Its row is still open. A pause
    // and not a finish, because a run's finish is answered with what to check before its seal and stores nothing.
    const ended = await ask('PATCH', `/api/records/${run.id}`, asAgent('a-worker', run.runKey, run.id), { dataPatch: { state: 'paused', doing: 'it paused at the end of its round' } })
    expect(ended.status, said(ended.body)).toBe(200)
    expect(theRun(run.id)).toEqual({ state: 'paused', doing: 'it paused at the end of its round' })
    live.delete(run.pid ?? 0)
    expect(theRowIsOpen(run.row ?? '')).toBe(true)
    const before = theRunsData(run.id)

    const stop = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter', starterKey), { why: 'it should be over' })
    expect(stop.status, said(stop.body)).toBe(409)
    expect(said(stop.body)).toContain(`Mole Office found its process group ${String(run.pid)} ended already. Nothing was signalled`)
    expect(said(stop.body)).toContain('This stop revoked no key')
    expect(said(stop.body)).toContain('Nothing was written on the run: its doing line and its state are as they were.')
    expect(signalled).toEqual([])
    // THE ROW IS CLOSED, with no signal, as any caller may close a row whose process has gone.
    expect(theRowIsOpen(run.row ?? ''), 'the row of a process that had gone is still open').toBe(false)
    expect(theRunsData(run.id), 'a stop that did nothing wrote on the run').toBe(before)
  })

  it('says on the run that its key was revoked and nothing was signalled, never that it was stopped, and keeps what it said before', async () => {
    const run = await aWorkersRun({ noGroup: true, doing: 'reading the brief for its third round' })
    const stop = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter', starterKey), { why: 'it went quiet' })
    expect(stop.status, said(stop.body)).toBe(409)
    expect(said(stop.body)).toContain("The run's key was revoked all the same, and its state was left as it was.")
    const after = theRun(run.id)
    expect(after.state).toBe('running')
    const doing = String(after.doing)
    expect(doing).toBe(
      "The agent the-starter revoked this run's key through its stop door: it went quiet. Its writes to the office stop now. " +
        `Mole Office has no process group recorded for run ${run.id}, so nothing was signalled. ` +
        'Before this, the run said: reading the brief for its third round',
    )
    expect(doing).not.toContain('stopped this run')
  })

  it('writes a running run crashed when its group had ended before the stop, revokes its key, and still answers 409', async () => {
    const run = await aWorkersRun({ doing: 'running its last command' })
    // ITS COMMAND EXITED WITHOUT A FINISH: its process is gone, its row is still open, and the run still says running.
    live.delete(run.pid ?? 0)
    expect(theRowIsOpen(run.row ?? ''), 'the run’s row was closed before the stop').toBe(true)
    expect(theRun(run.id).state).toBe('running')

    const stop = await ask('POST', `/api/runtime/runs/${run.id}/stop`, asAgent('the-starter', starterKey), { why: 'its command exited' })
    expect(stop.status, said(stop.body)).toBe(409)
    expect(said(stop.body)).toContain(`Mole Office found its process group ${String(run.pid)} ended already. Nothing was signalled`)
    expect(said(stop.body)).toContain("The run's key was revoked all the same, and its state is now crashed")
    expect(signalled).toEqual([])
    expect(theRowIsOpen(run.row ?? ''), 'the row of a process that had gone is still open').toBe(false)
    const after = theRun(run.id)
    expect(after.state, 'the run still says running with no process and no key').toBe('crashed')
    const doing = String(after.doing)
    expect(doing).toContain("revoked this run's key through its stop door: its command exited.")
    expect(doing).toContain('Before this, the run said: running its last command')
    expect(doing).not.toContain('stopped this run')
    expect(await theRunsKeyStillProvesIt(run), 'the run’s key still proves it after the stop').toEqual({ door: false, note: false })
  })

  it('answers 404 for a record that is no run', async () => {
    const stop = await ask('POST', '/api/runtime/runs/no-such-run/stop', asAgent('the-starter', starterKey), { why: 'no run' })
    expect(stop.status, said(stop.body)).toBe(404)
    expect(said(stop.body)).toContain('No run no-such-run')
  })
})
