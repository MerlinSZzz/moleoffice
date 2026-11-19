// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW STEP IS MADE STANDING THROUGH THE STAGE DOORS. Wave 13u round 185; REQUIREMENTS.md, the secretary, 8 November 2026
 * 14:3x, from qfW1_VYDD8RO.
 *
 * A standing step is given to every round and worker start its flow applies to. No door set the mark: POST
 * /api/flows/<id>/stages and PATCH /api/flows/<id>/stages/<n> refused `standing` as an unrecognized key, so a secretary
 * who wanted a step standing had to rewrite the whole stages array through the record door. Now both doors take it.
 *
 *   1. A step made standing by the change door is given to the next start, with the flow's new revision, and one change
 *      entry records it with its why and its cause. Made not standing by the same door, it is no longer given.
 *   2. A change of standing alone needs a why and a cause. Without either it is refused with its code, and nothing is
 *      written.
 *   3. The add door takes a standing step, and the next start is given it. A mark that is not true or false is refused
 *      at both doors, and nothing is written.
 *   4. A change that leaves `standing` out keeps the mark, so a page that does not show it cannot take it off. The next
 *      start is given the step's new words.
 *
 * "The next start" is readTheStandingStages in src/shared/round-chapters/standing.ts, the reader the launcher's worker
 * and round starts call, asked here as that agent through this file's own office. What a start then does with the
 * stages is proved in tests/a-start-carries-the-standing-stages.test.ts.
 *
 * WHAT GOES RED ON MAIN. Every case: the doors refuse `standing` as an unrecognized key, so the write is refused with no
 * code and nothing is marked. Case 4 also goes red when a change that leaves `standing` out takes the mark off.
 *
 * Every fixture is made up: the agent, the flows, their stages and their sources are made here, in a test office of
 * this file's own.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readTheStandingStages, type AskTheOfficeIn } from '../src/shared/round-chapters/standing.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const AGENT = 'made-standing-supervisor'

let t: TestDb
let app: FastifyInstance
let asPerson: Record<string, string>
let theAgentsKey = ''

type Reply = { status: number; body: Record<string, any>; raw: string }

async function send(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: object): Promise<Reply> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: r.statusCode, body: (r.body === '' ? {} : r.json()) as Record<string, any>, raw: r.body }
}

const asTheAgent = (project = 'default'): Record<string, string> => ({
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': AGENT,
  ...(theAgentsKey === '' ? {} : { 'x-mole-office-key': theAgentsKey }),
})

/** The office as the agent's start asks it: as the agent, in the project it names. */
const asItsStart: AskTheOfficeIn = async (path, project) => {
  const r = await send('GET', path, asTheAgent(project))
  return { status: r.status, body: r.body }
}

/** The stages the agent's next start is given from one flow, or null when that flow gives it none. */
async function whatTheNextStartIsGiven(flow: string): Promise<{ version: string; stages: { n: number; does: string }[] } | null> {
  const read = await readTheStandingStages({ agent: AGENT, request: asItsStart })
  expect(read.role, read.says).toBe('supervisor')
  const one = read.flows.find((each) => each.id === flow)
  return one === undefined ? null : { version: one.version, stages: one.stages }
}

/** A record a step or a change can name as its source or cause. */
const aSource = (title: string): string => t.api.createRecord({ kind: 'report', title, data: { blocks: [] }, workspaceId: 'default', actor: t.api.HUMAN }).id

/** The flow's data as stored, read past every door. */
const stored = (id: string): Record<string, any> => t.api.getRecord(id)!.data as Record<string, any>

/** The flow's revision, as its door answers it. */
async function versionOf(id: string): Promise<string> {
  const read = await send('GET', `/api/flows/${id}`, asPerson)
  expect(read.status, read.raw).toBe(200)
  return String(read.body['version'])
}

/** A made-up general flow for supervisors, with two stages, neither standing, each with its why and source. */
function aFlow(title: string, source: string): string {
  return t.api.createRecord({
    kind: 'flow',
    title,
    workspaceId: 'default',
    actor: t.api.HUMAN,
    data: {
      declared_in: 'tools/test-kettle.mjs',
      runs: 'the office itself',
      trigger: `A made-up trigger for ${title}.`,
      leaves_behind: 'a made-up served kettle',
      applies_to: { scope: 'general', roles: ['supervisor'] },
      stages: [1, 2].map((n) => ({ n, does: `Made-up stage ${String(n)} of ${title}.`, why: `Made-up why ${String(n)}.`, sources: [source] })),
    },
  }).id
}

/** Expect a refusal with this code and status, and the flow left exactly as it was. */
async function refusedAndUnwritten(flow: string, write: Promise<Reply>, code: string | undefined): Promise<Reply> {
  const before = JSON.stringify(stored(flow))
  const reply = await write
  expect(reply.status, reply.raw).toBe(400)
  expect(reply.body['code'], reply.raw).toBe(code)
  expect(JSON.stringify(stored(flow))).toBe(before)
  return reply
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  asPerson = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    ...thePersonsKeyHeader(),
  }
  const r = await send('POST', '/api/agents/started', asPerson, { handle: AGENT, name: 'Made-up standing supervisor', runtime: 'claude-code', workArea: ['work'], role: 'supervisor' })
  expect(r.status, r.raw).toBe(201)
  const key = r.body['whatToGiveIt']?.key
  if (typeof key === 'string') theAgentsKey = key
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a flow step is made standing through the stage doors', () => {
  it('1: a step made standing by the change door is given to the next start, and made not standing is not', async () => {
    const source = aSource('Made-up source of case 1')
    const cause = aSource('Made-up cause of case 1')
    const title = 'Made-up flow of case 1'
    const flow = aFlow(title, source)
    expect(await whatTheNextStartIsGiven(flow)).toBeNull()

    const url = `/api/flows/${flow}/stages/2`
    const marked = await send('PATCH', url, asPerson, { ifVersion: await versionOf(flow), standing: true, why: 'Made-up why 2.', sources: [source], cause })
    expect(marked.status, marked.raw).toBe(200)
    expect(stored(flow)['stages'][1]).toEqual({ n: 2, does: `Made-up stage 2 of ${title}.`, why: 'Made-up why 2.', sources: [source], standing: true })
    expect(stored(flow)['stages'][0]['standing']).toBeUndefined()
    const entry = (stored(flow)['step_changes'] as Record<string, unknown>[]).at(-1)
    expect(entry).toMatchObject({ why: 'Made-up why 2.', cause, what: `Stage 2 ("Made-up stage 2 of ${title}.") was made standing.` })
    expect(marked.body['change']).toContain('was made standing')
    expect(await whatTheNextStartIsGiven(flow)).toEqual({ version: await versionOf(flow), stages: [{ n: 2, does: `Made-up stage 2 of ${title}.` }] })

    const unmarked = await send('PATCH', url, asPerson, { ifVersion: await versionOf(flow), standing: false, why: 'Made-up why 2.', sources: [source], cause })
    expect(unmarked.status, unmarked.raw).toBe(200)
    expect(stored(flow)['stages'][1]['standing']).toBeUndefined()
    expect((stored(flow)['step_changes'] as Record<string, unknown>[]).at(-1)?.['what']).toBe(`Stage 2 ("Made-up stage 2 of ${title}.") was made not standing.`)
    expect(await whatTheNextStartIsGiven(flow)).toBeNull()

    // A MARK SENT AGAIN AS IT IS changes nothing, and is refused as a change that changes nothing.
    await refusedAndUnwritten(flow, send('PATCH', url, asPerson, { ifVersion: await versionOf(flow), standing: false, why: 'Made-up why 2.', sources: [source], cause }), 'flowStageUnchanged')
  })

  it('2: a change of standing alone needs a why and a cause, and nothing is written without them', async () => {
    const source = aSource('Made-up source of case 2')
    const cause = aSource('Made-up cause of case 2')
    const flow = aFlow('Made-up flow of case 2', source)
    const url = `/api/flows/${flow}/stages/1`
    await refusedAndUnwritten(flow, send('PATCH', url, asPerson, { ifVersion: await versionOf(flow), standing: true, sources: [source], cause }), 'flowStepNoWhy')
    await refusedAndUnwritten(flow, send('PATCH', url, asPerson, { ifVersion: await versionOf(flow), standing: true, why: 'Made-up why 1.', sources: [source] }), 'flowStepChangeNoCause')
    expect(await whatTheNextStartIsGiven(flow)).toBeNull()
  })

  it('3: the add door takes a standing step, given to the next start, and a mark that is not true or false is refused at both doors', async () => {
    const source = aSource('Made-up source of case 3')
    const cause = aSource('Made-up cause of case 3')
    const title = 'Made-up flow of case 3'
    const flow = aFlow(title, source)
    const words = 'Made-up standing stage added at place 2.'
    const add = { at: 2, does: words, why: 'Made-up why of the added stage.', sources: [source], cause }

    const notAMark = [
      await refusedAndUnwritten(flow, send('POST', `/api/flows/${flow}/stages`, asPerson, { ifVersion: await versionOf(flow), ...add, standing: 'yes' }), undefined),
      await refusedAndUnwritten(flow, send('PATCH', `/api/flows/${flow}/stages/1`, asPerson, { ifVersion: await versionOf(flow), standing: 1, why: 'Made-up why 1.', sources: [source], cause }), undefined),
    ]
    for (const reply of notAMark) expect(String(reply.body['error'])).toContain('standing')

    const added = await send('POST', `/api/flows/${flow}/stages`, asPerson, { ifVersion: await versionOf(flow), ...add, standing: true })
    expect(added.status, added.raw).toBe(200)
    expect(stored(flow)['stages'].map((stage: Record<string, unknown>) => stage['standing'] ?? null)).toEqual([null, true, null])
    expect((stored(flow)['step_changes'] as Record<string, unknown>[]).at(-1)).toMatchObject({ cause, what: `Stage 2 was added: "${words}". It is standing.` })
    expect(await whatTheNextStartIsGiven(flow)).toEqual({ version: await versionOf(flow), stages: [{ n: 2, does: words }] })
  })

  it('4: a change that leaves standing out keeps the mark, and the next start is given the new words', async () => {
    const source = aSource('Made-up source of case 4')
    const cause = aSource('Made-up cause of case 4')
    const flow = aFlow('Made-up flow of case 4', source)
    const url = `/api/flows/${flow}/stages/1`
    const marked = await send('PATCH', url, asPerson, { ifVersion: await versionOf(flow), standing: true, why: 'Made-up why 1.', sources: [source], cause })
    expect(marked.status, marked.raw).toBe(200)

    const words = 'Made-up stage 1, in new words.'
    const reworded = await send('PATCH', url, asPerson, { ifVersion: await versionOf(flow), does: words, why: 'Made-up why 1.', sources: [source], cause })
    expect(reworded.status, reworded.raw).toBe(200)
    expect(stored(flow)['stages'][0]).toMatchObject({ does: words, standing: true })
    expect((stored(flow)['step_changes'] as Record<string, unknown>[]).at(-1)?.['what']).toBe(`Stage 1 was changed from "Made-up stage 1 of Made-up flow of case 4." to "${words}".`)
    expect(await whatTheNextStartIsGiven(flow)).toEqual({ version: await versionOf(flow), stages: [{ n: 1, does: words }] })
  })
})
