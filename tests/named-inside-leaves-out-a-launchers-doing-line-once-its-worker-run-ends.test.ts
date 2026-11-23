// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMED-INSIDE DOOR LEAVES OUT A LAUNCHER'S DOING LINE ONCE THE WORKER RUN IT FILED HAS ENDED.
 *
 * GET /api/report-files/named-inside gates the removal of a landed worktree (tools/remove-a-worktree.mjs), so every
 * case here fails closed: what the door cannot show to be set aside counts. A launcher run ends with a `doing` line
 * that repeats the worker's last output and names the worker's worktree, and that line kept the worktree named long
 * after the worker run ended. The door now sets that line aside when the record is the launcher the office filed for a
 * worker run that was filed from its own session and has ended.
 *
 * WHAT IS MEASURED. Every record here is synthetic. Each case asks about a folder of its own, so one case's records do
 * not enter another's answer.
 *
 *   · (a) a launcher for a worker run that has ended and worked in the folder, whose doing line names the folder, and
 *     nothing else names it: the launcher is left out, named in leftOut with the place doing and the rule about the
 *     worker run;
 *   · (b) the same while the worker run still runs: the launcher counts;
 *   · (c) the same as (a), with a second field of the launcher also naming the folder: the launcher counts;
 *   · (d) a launcher whose extra.run names another supervisor's run than the worker run's parent: the launcher counts;
 *   · (e) a session that is not a launcher (no round-launcher runtime) from which an ended worker run was filed, whose
 *     doing line names the folder: that session counts.
 *
 * MUTATIONS, each run once against this file and then restored (src/server/api/reportfiles.ts):
 *   (a) the launcher's doing line is never set aside: case (a) goes red, because the launcher counts;
 *   (b) the record is not asked by theLauncherIsForThisWorkerRun: case (e) goes red, because a session that is not a
 *       launcher has its doing line set aside;
 *   (c) the worker run's ended state is not required: case (b) goes red, because the launcher's doing line is set
 *       aside while the worker run is still running;
 *   (d) the worker run's parentAttachment is not compared with the launcher's extra.run: case (d) goes red;
 *   (e) the whole launcher record is set aside, not only doing: case (c) goes red, because its other field still names
 *       the folder.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { ROUND_LAUNCHER_RUNTIME } from '../src/shared/next-round.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let worker: string

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** A session record, filed as one, with `data` written whole. */
async function aSession(title: string, data: Record<string, unknown>): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'session', title, data } })
  expect(created.statusCode, created.body).toBe(201)
  return (created.json() as { record: { id: string } }).record.id
}

/** The supervisor's run a worker run is filed under. Nothing else in a case uses it. */
async function aSupervisorsRun(title: string): Promise<string> {
  return aSession(title, { state: 'running' })
}

/**
 * THE LAUNCHER THE OFFICE FILES FOR A WORKER RUN: the round launcher's runtime, filed by the office, for a worker
 * under a supervisor's run. It has ended, and its doing line repeats the last output, which names the worktree.
 */
async function aLauncher(folder: string, extra: Record<string, unknown>): Promise<string> {
  return aSession('Synthetic launcher run', {
    state: 'finished',
    runtime: ROUND_LAUNCHER_RUNTIME,
    startedByMoleOffice: true,
    doing: `The worker's last output is in ${folder}.`,
    extra,
  })
}

/**
 * THE WORKER RUN, filed from `filer`'s session as the office files it: its first create change names that session. Its
 * own session names the supervisor's run as its parent, the worker it serves, and the folder it worked in.
 */
async function aWorkerRunFiledFrom(folder: string, parent: string, filer: string, state: string): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...asAgent('synthetic-worker'), 'x-mole-office-session': filer },
    payload: { kind: 'session', title: 'Synthetic worker run', data: { state: 'running', runtime: 'claude-code' } },
  })
  expect(created.statusCode, created.body).toBe(201)
  const id = (created.json() as { record: { id: string } }).record.id
  writeDataBypassingTheGate(t, id, {
    state, runtime: 'claude-code', servingAgent: 'synthetic-worker', servingAgentId: worker, parentAttachment: parent, workingDirectory: folder,
  })
  return id
}

interface Answer {
  records: { id: string }[]
  hiddenCount: number
  leftOut: { id: string; kind: string; title: string; setAside: { where: string; rule: string }[] }[]
  says: string
}
async function ask(folder: string): Promise<Answer> {
  const reply = await app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Answer
}
const leftOutIds = (answer: Answer): string[] => answer.leftOut.map((one) => one.id).sort()
const aboutTheWorkerRun = (run: string, state: string): string => `a start line about run ${run}, which has ended (${state}) and worked in this folder`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  worker = await register(AS_THE_PERSON, { handle: 'synthetic-worker', name: 'Synthetic worker', role: 'worker' })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a launcher for an ended worker run', () => {
  it('has its doing line set aside, with the place and the rule, when nothing else names the folder', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/launcher-ended`
    const parent = await aSupervisorsRun('Synthetic supervisor run')
    const launcher = await aLauncher(folder, { purpose: 'worker', run: parent, worker })
    const run = await aWorkerRunFiledFrom(folder, parent, launcher, 'crashed')
    const answer = await ask(folder)
    expect(answer).toMatchObject({ records: [], hiddenCount: 0 })
    expect(leftOutIds(answer)).toEqual([launcher, run].sort())
    expect(answer.leftOut.find((one) => one.id === launcher)).toEqual({ id: launcher, kind: 'session', title: 'Synthetic launcher run',
      setAside: [{ where: 'data.doing', rule: aboutTheWorkerRun(run, 'crashed') }] })
    expect(answer.leftOut.find((one) => one.id === run)!.setAside).toEqual([
      { where: 'data.workingDirectory', rule: `run ${run} has ended (crashed) and this folder is its working directory` },
    ])
    expect(answer.says).toContain('leftOut lists 2 readable records that name it only in places a rule sets aside.')
  })

  it('counts while its worker run still runs', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/launcher-running`
    const parent = await aSupervisorsRun('Synthetic supervisor run')
    const launcher = await aLauncher(folder, { purpose: 'worker', run: parent, worker })
    await aWorkerRunFiledFrom(folder, parent, launcher, 'running')
    expect(await ask(folder)).toMatchObject({ records: [], hiddenCount: 2, leftOut: [] })
  })

  it('counts when another field of the launcher also names the folder', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/launcher-two-fields`
    const parent = await aSupervisorsRun('Synthetic supervisor run')
    const launcher = await aLauncher(folder, { purpose: 'worker', run: parent, worker, says: `The launcher wrote ${folder}/launcher.log.` })
    const run = await aWorkerRunFiledFrom(folder, parent, launcher, 'crashed')
    const answer = await ask(folder)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(1)
  })

  it("counts when its extra.run names another supervisor run than the worker run's parent", async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/launcher-another-parent`
    const parent = await aSupervisorsRun('Synthetic supervisor run')
    const otherParent = await aSupervisorsRun('Synthetic other supervisor run')
    const launcher = await aLauncher(folder, { purpose: 'worker', run: otherParent, worker })
    const run = await aWorkerRunFiledFrom(folder, parent, launcher, 'crashed')
    const answer = await ask(folder)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(1)
  })

  it('counts a session that is not a launcher, even though the ended worker run was filed from it', async () => {
    const folder = `${THE_TEST_FIXTURE_ROOT}/worktrees/not-a-launcher`
    const parent = await aSupervisorsRun('Synthetic supervisor run')
    const notLauncher = await aSession('Synthetic session that is not a launcher', {
      state: 'finished', runtime: 'claude-code', startedByMoleOffice: true, doing: `The last output is in ${folder}.`,
    })
    const run = await aWorkerRunFiledFrom(folder, parent, notLauncher, 'crashed')
    const answer = await ask(folder)
    expect(leftOutIds(answer)).toEqual([run])
    expect(answer.hiddenCount).toBe(1)
    expect(answer.leftOut.every((one) => one.id !== notLauncher)).toBe(true)
  })
})
