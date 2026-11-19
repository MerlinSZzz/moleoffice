// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH CHANGE OF A RUN'S STEP SENDS EXACTLY ONE REMINDER OF ITS ROLE, ITS DUTIES AND ITS CURRENT STEP (wave 14d,
 * package RM, clause RM-2).
 *
 * A change of step is a step recorded on one of the run's flow runs while the run is running, by any writer. The step
 * of the minute pass that sends it is src/server/lib/step-reminders.ts.
 *
 * WHAT THIS HOLDS.
 *   1. A step through the hand-step door POST /api/sessions/<run>/flow-run/steps gives one reminder, and later passes
 *      give none. The run's first step, which says it was filed, gives none. The reminder is the new start of the
 *      step's minutes: the time reminder comes 45 minutes after it, not 45 minutes after the step began.
 *   2. Two steps recorded between two passes give two reminders, and the first says which step is current.
 *   3. The office's own writers: entering a flow files a flow run whose first step gives one reminder, and the tick
 *      that ends it records a step that gives one more, which names the run's own step as current again.
 *   4. A step recorded after the run stopped reminds nobody: the office's step saying the run ended, and a step through
 *      the hand-step door after it.
 *   5. A step recorded before the office started watching reminds nobody, and a step after it does.
 *
 * MADE UP. Every agent, run, flow and step here is made up for this test, in a fresh test database. No live office is
 * read. The pass is given a clock of its own, minutes after the real time a case's run was filed.
 *
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN:
 *   1. The run's first step counts as a change. Case 1 goes red: the first pass reminds.
 *   2. A change reminds only once for all the steps recorded since the last pass. Case 2 goes red.
 *   3. Steps held when the office started watching count as changes. Case 5 goes red.
 *   4. A step with no count at its start is counted from 0. The second case of 5 goes red.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { ENTERED_STEP_DOES, OFFICE_STEP_DOES } from '../src/shared/flow-run.ts'
import type { StepReminderMark } from '../src/server/lib/step-reminders.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_TOKENS_COUNTED } from '../src/config/tokens-so-far.mjs'

const WORKSPACE = 'default'
const THE_PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const asPerson = { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asAgent = (handle: string, session: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-session': session,
})
const THE_LINE = SYSTEM_LINES.aStepReminder('').line
/** Before every record of this file, so every step here is recorded while the office watches, but in case 5. */
const WATCHING_SINCE = new Date(Date.now() - 60_000)

let t: TestDb
let app: FastifyInstance
let stepReminders: typeof import('../src/server/lib/step-reminders.ts')

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  stepReminders = await import('../src/server/lib/step-reminders.ts')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
})

async function call(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, payload: payload as object })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

function make(kind: 'report' | 'flow' | 'note' | 'session', title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind, title, data, actor: THE_PERSON }).id
}

function dataOf(id: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, any>
}

/** One made-up agent of the worker card with one made-up running run. */
async function aRun(handle: string): Promise<{ run: string; flowRun: string; at: (minutes: number) => Date }> {
  const started = await call('POST', '/api/agents/started', asPerson, { handle, name: handle, role: 'worker' })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const run = make('session', `A made-up run of ${handle}`, { state: 'running', servingAgent: started.body['agent'].id, doing: 'A made-up piece of work' })
  const { id: flowRun } = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string }
  const r0 = new Date()
  return { run, flowRun, at: (minutes) => new Date(r0.getTime() + minutes * 60_000) }
}

/** A step through the hand-step door, as the agent the run serves. */
async function aHandStep(handle: string, run: string, does: string): Promise<number> {
  const added = await call('POST', `/api/sessions/${run}/flow-run/steps`, asAgent(handle, run), { does, how: 'by an agent', outcome: 'done' })
  expect(added.status, JSON.stringify(added.body)).toBe(201)
  return added.body['position'] as number
}

function aPass(run: string, now: Date, watchingSince: Date = WATCHING_SINCE): string[] {
  return stepReminders.sendTheStepRemindersThatAreDue(WORKSPACE, now, watchingSince).filter((one) => one === run)
}

function theRemindersAbout(run: string): { said: string; mark: StepReminderMark }[] {
  return (t.client.sqlite
    .prepare("SELECT json_extract(data, '$.saidInFull') AS said, json_extract(data, '$.extra.stepReminder') AS mark FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ? ORDER BY created_at, rowid")
    .all(run, THE_LINE) as { said: string; mark: string }[]).map((row) => ({ said: row.said, mark: JSON.parse(row.mark) as StepReminderMark }))
}

describe('1. a step through the hand-step door', () => {
  it('gives one reminder, later passes none, the first step none, and the reminder starts the step’s minutes again', async () => {
    const { run, flowRun, at } = await aRun('stepped-by-hand')
    expect(dataOf(flowRun)['stepsTaken'].map((step: { does: string }) => step.does)).toEqual([OFFICE_STEP_DOES.started])
    expect(aPass(run, at(0))).toEqual([])

    const position = await aHandStep('stepped-by-hand', run, 'A made-up step of the work.')
    expect(aPass(run, at(1))).toEqual([run])
    expect(aPass(run, at(2))).toEqual([])
    expect(aPass(run, at(3))).toEqual([])
    const [sent] = theRemindersAbout(run)
    expect(sent!.mark).toMatchObject({ flowRun, step: position, why: 'a new step' })
    expect(sent!.said).toContain(`Run ${run} has recorded a new step: step ${position} of its own flow run ${flowRun}, "A made-up step of the work.". It is now your current step.`)

    // 45 minutes after the step began is 44 after its reminder: nothing yet.
    expect(aPass(run, at(45))).toEqual([])
    expect(aPass(run, at(46))).toEqual([run])
    expect(theRemindersAbout(run).map((one) => one.mark.why)).toEqual(['a new step', 'minutes'])
  })
})

describe('2. two steps between two passes', () => {
  it('give two reminders', async () => {
    const { run, flowRun, at } = await aRun('stepped-twice')
    const first = await aHandStep('stepped-twice', run, 'A made-up first step.')
    const second = await aHandStep('stepped-twice', run, 'A made-up second step.')
    expect(aPass(run, at(1))).toEqual([run, run])
    expect(aPass(run, at(2))).toEqual([])
    const sent = theRemindersAbout(run)
    expect(sent.map((one) => one.mark.step)).toEqual([first, second])
    expect(sent[0]!.said).toContain(`Your current step is step ${second} of its own flow run ${flowRun}, "A made-up second step.".`)
    expect(sent[1]!.said).toContain('It is now your current step.')
  })
})

describe('3. the office’s own writers', () => {
  it('entering a flow gives one reminder, and the tick that ends it one more', async () => {
    const { run, flowRun: own, at } = await aRun('entered-a-flow')
    const source = make('report', 'A made-up source of a flow', { blocks: [] })
    const flow = make('flow', 'A made-up flow', {
      declared_in: 'a made-up flow of this test',
      runs: 'a made-up worker',
      trigger: 'A made-up piece of work is asked for.',
      stages: [{ n: 1, does: 'The made-up worker does the work.', evidence: 'a made-up commit', why: 'Without it the work is not done.', sources: [source] }],
      leaves_behind: 'a made-up commit',
      governed_by: 'this test file',
      reviewed_at: '2026-11-16',
    })
    const about = make('note', 'A made-up note the flow is about', { body: 'Made up.' })
    const entered = await call('POST', `/api/flows/${flow}/enter`, asAgent('entered-a-flow', run), { about })
    expect(entered.status, JSON.stringify(entered.body)).toBe(201)
    const flowRun = entered.body['flowRun'] as string
    expect(aPass(run, at(1))).toEqual([run])
    expect(aPass(run, at(2))).toEqual([])
    expect(theRemindersAbout(run)[0]!.said).toContain(`step 1 of the flow it entered ${flowRun}, "${ENTERED_STEP_DOES.entered}". It is now your current step.`)

    const url = `/api/checklists/${entered.body['checklist'].id as string}/items/${entered.body['item'].id as string}`
    const tick = await call('PATCH', url, asAgent('entered-a-flow', run), { state: 'done', addEvidence: [{ kind: 'run', record: run }] })
    expect(tick.status, JSON.stringify(tick.body)).toBe(200)
    const steps = dataOf(flowRun)['stepsTaken'] as { does: string }[]
    expect(dataOf(flowRun)['ended']).toBeDefined()
    expect(aPass(run, at(3))).toEqual(steps.slice(1).map(() => run))
    expect(aPass(run, at(4))).toEqual([])
    const last = theRemindersAbout(run).at(-1)!
    expect(last.mark).toMatchObject({ flowRun, step: steps.length, why: 'a new step' })
    expect(last.said).toContain(`Your current step is step 1 of its own flow run ${own}, "${OFFICE_STEP_DOES.started}".`)
  })
})

describe('4. after the run stopped', () => {
  it('a step reminds nobody', async () => {
    const { run, flowRun, at } = await aRun('stopped-before-its-steps')
    const ended = await call('PATCH', `/api/records/${run}`, asAgent('stopped-before-its-steps', run), { dataPatch: { state: 'crashed' } })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    expect(dataOf(flowRun)['stepsTaken'].at(-1).does).toBe(OFFICE_STEP_DOES.ended)
    await aHandStep('stopped-before-its-steps', run, 'A made-up step after the run ended.')
    expect(aPass(run, at(1))).toEqual([])
    expect(aPass(run, at(46))).toEqual([])
    expect(theRemindersAbout(run)).toEqual([])
  })
})

describe('5. before the office started watching', () => {
  it('a step reminds nobody, and a step after it does', async () => {
    const { run, flowRun, at } = await aRun('stepped-before-the-watch')
    await aHandStep('stepped-before-the-watch', run, 'A made-up step before the office watched.')
    // The office's stamps are whole seconds, so the watch begins at the next second, after the step's write.
    await new Promise((resolve) => setTimeout(resolve, 1_005 - (Date.now() % 1_000)))
    const since = new Date()
    expect(aPass(run, at(1), since)).toEqual([])
    const after = await aHandStep('stepped-before-the-watch', run, 'A made-up step after the office began watching.')
    expect(aPass(run, at(2), since)).toEqual([run])
    expect(theRemindersAbout(run).map((one) => [one.mark.flowRun, one.mark.step])).toEqual([[flowRun, after]])
  })

  it('a step begun before it has no count at its start, so it is reminded by time until a reminder carries one', async () => {
    const { run, at } = await aRun('counted-before-the-watch')
    await aHandStep('counted-before-the-watch', run, 'A made-up step before the office watched.')
    await new Promise((resolve) => setTimeout(resolve, 1_005 - (Date.now() % 1_000)))
    const since = new Date()
    const theCountIs = (tokens: number) =>
      t.api.patchRecord(run, { dataPatch: { tokensSoFar: tokens, whenTheTokensWereRead: localStamp(new Date()), howTheTokensWereReadAndCounted: `Read from a made-up output. Counted: ${THE_TOKENS_COUNTED}.` } }, { ...THE_PERSON, stated: true })
    theCountIs(200_000)
    expect(aPass(run, at(1), since)).toEqual([])
    expect(aPass(run, at(46), since)).toEqual([run])
    theCountIs(350_000)
    expect(aPass(run, at(47), since)).toEqual([run])
    const sent = theRemindersAbout(run)
    expect(sent.map((one) => [one.mark.why, one.mark.tokens])).toEqual([['minutes', 200_000], ['tokens', 350_000]])
    expect(sent[0]!.said).toContain('Its tokens so far are 200000, but its count when the step began is not known, so this step is reminded by time until a reminder carries a count.')
  })
})
