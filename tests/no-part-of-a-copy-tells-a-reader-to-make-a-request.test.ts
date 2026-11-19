// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO PART OF A COPY TELLS A READER WITH NO API TO MAKE A REQUEST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion B19 of `design/bundle/ACCEPTANCE.md`. A copy goes to a window Mole Office does not run:
 * no API, no repository, no earlier conversation. `waitingSentence` in
 * `src/server/lib/continuation.ts` ended every governance queue with
 * `GET /api/needs-you carries each one whole, with its question and its options.`
 *
 * It was wrong twice. The reader cannot make that request; and the part already carried each fork
 * whole — its question, its options, what somebody would do, what it is holding up and the evidence
 * on it — so the sentence sent a reader away from the thing they were standing on.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE WHOLE TEXT, SWEPT. Every part is asked for, at every position a copy offers, over a
 *      corpus whose own records name no route — so any `GET /api/…` left in the text is Mole
 *      Office's own prose and not something a person wrote in a record.
 *   2. THE PART THAT CARRIED THE SENTENCE still says how many are waiting, and names each one.
 *   3. A PART THAT LEAVES SOMETHING OUT SAYS SO IN ITS OWN WORDS — the alternative B19 allows —
 *      rather than pointing at a request that would carry it.
 *
 * A RECORD'S OWN WORDS ARE NOT SWEPT, and the fixture is what makes that honest rather than an
 * exception: this project's real corpus holds problems whose titles are about routes, and a gate
 * that failed on those would be a gate against writing down what is wrong with a route.
 *
 * Proved by mutation with a control run of this file first: restoring the `GET /api/needs-you`
 * clause in `waitingSentence` turns cases 1 and 3 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SCOPE_NAMES, BUNDLE_RUNGS } from '../src/shared/bundles.ts'

/** The project this case copies, made fresh so a part carries only the records this case filed. */
let HERE = 'default'
let caseNumber = 0

const HEADERS = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': HERE,
})

/** What a request looks like in prose. Any of the five verbs in front of this product's own path. */
const A_REQUEST = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\//

let t: TestDb
let app: FastifyInstance
let makeWorkspace: (input: { id: string; title: string }) => unknown

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  ;({ createWorkspace: makeWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  HERE = `copy-without-a-request-case-${String(caseNumber)}`
  makeWorkspace({ id: HERE, title: `Copy without a request case ${String(caseNumber)}` })
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS() })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS() })
  return { status: res.statusCode, body: res.json() }
}

async function aRecord(kind: string, title: string, data: unknown, summary?: string): Promise<string> {
  const made = await post('/api/records', { kind, title, ...(summary === undefined ? {} : { summary }), data })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/**
 * A CORPUS WITH SOMETHING IN EVERY PART THAT CAN HOLD SOMETHING, and no route in any of its words.
 * A part that finds nothing still writes its absence sentence, which is swept too.
 */
async function aProjectWithSomethingInIt(): Promise<void> {
  await aRecord('problem', 'The seed window closes too early', { state: 'open' }, 'It shuts before the run ends.')
  await aRecord('module', 'The durable archive', { state: 'active' }, 'What it holds and how it is proved.')
  await aRecord('report', 'What the first night measured', {})
  await aRecord('task', 'Repair the seed window', { state: 'todo' })
  await aRecord('stopping_point', 'Where the first night stopped', {
    doing: 'Measuring the seed window.',
    remains: 'The repair itself.',
  })
  // A WORK DOMAIN NAMES A DURABLE AGENT, so the agent has to exist before the claim does.
  const builder = await aRecord('agent', 'Builder One', { handle: 'builder-one', role: 'worker' })
  await aRecord('work_domain', 'The archive, claimed', { agent: builder, objective: 'Prove a restore.' })
  await aRecord('proposal', 'Should the seed window follow the run, or the clock?', {
    question: 'Should the seed window follow the run, or the clock?',
    options: ['Follow the run', 'Follow the clock'],
    recommendation: 'Follow the run.',
    who_settles_it: 'the owner',
  })
  const pipeline = await aRecord('pipeline', 'The first night, in order', { blockIds: [] })
  const block = await post(`/api/records/${pipeline}/blocks`, { name: 'Measure the window', state: 'done' })
  expect(block.status, JSON.stringify(block.body)).toBe(201)
}

describe('no part of a copy tells a reader with no API to make a request', () => {
  it('carries no request anywhere in its text, at any position, over every part', async () => {
    await aProjectWithSomethingInIt()
    const slots = SCOPE_NAMES.join(',')
    for (const detail of BUNDLE_RUNGS) {
      const preview = await get(
        `/api/bundles/preview?preset=custom&slots=${slots}&detail=${String(detail)}&budgetBytes=262144`,
      )
      expect(preview.status, JSON.stringify(preview.body)).toBe(200)
      const text = String(preview.body.text)
      const pointing = text.split('\n').filter((line) => A_REQUEST.test(line))
      expect(pointing, `at ${String(detail)}, these lines send the reader to a request`).toEqual([])
      // AND THE STRUCTURED REPLY, which is what a screen draws the same sentences from.
      for (const part of preview.body.parts as { name: string; says: string }[]) {
        expect(A_REQUEST.test(part.says), `the ${part.name} part's own sentence`).toBe(false)
      }
      for (const one of preview.body.leftOut as { bucket: string; says: string }[]) {
        expect(A_REQUEST.test(one.says), `the ${one.bucket} group's own sentence`).toBe(false)
      }
    }
  })

  it('the governance queue still says how many are waiting, and names each one', async () => {
    await aProjectWithSomethingInIt()
    const preview = await get(`/api/bundles/preview?preset=owner_governance&detail=${String(BUNDLE_RUNGS[BUNDLE_RUNGS.length - 1])}`)
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const text = String(preview.body.text)

    expect(text).toContain('1 thing only a person can do.')
    expect(text).toContain('Every one of them is named below.')
    // 2. AND THE THING ITSELF IS THERE, which is what made the old sentence wrong as well as unusable.
    expect(text).toContain('Should the seed window follow the run, or the clock?')
    expect(text).toContain('one answer: Follow the run')
    const { COPY_SAYS } = await import('../src/server/lib/continuation.ts')
    expect(text).toContain(COPY_SAYS.recommended('Follow the run.'))
  })

  it('asks the reader to quote back only what the copy actually carries', async () => {
    await aProjectWithSomethingInIt()
    const preview = await get('/api/bundles/preview?preset=recover_project&detail=title')
    const text = String(preview.body.text)
    // THE CLOSING LINE, FOUND BY THE COLD READ OF CRITERION B21. It asked the reader to quote the
    // export number, and a copy carries no export number: the text is assembled before anything
    // leaves the building, and a preview never leaves at all. A reader with no API cannot follow it.
    expect(text).not.toContain('quote the export number')
    expect(text).toContain('quote the two lines at the top of this text that begin About and Made')
    // AND THE TWO LINES IT NAMES ARE THERE.
    expect(text.split('\n').some((line) => line.startsWith('About: '))).toBe(true)
    expect(text.split('\n').some((line) => line.startsWith('Made: '))).toBe(true)
  })

  it('a part that leaves something out says so in its own words', async () => {
    await aProjectWithSomethingInIt()
    // Far too little room, and NO POSITION PICKED — so the shares shape it, the part has to shorten
    // itself, and it has to account for that. A picked position is honoured instead and says its
    // size, which is criterion B25 and is asserted in its own file.
    const preview = await get('/api/bundles/preview?preset=owner_governance&budgetBytes=2048')
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const text = String(preview.body.text)
    // 3. THE ACCOUNT IS A SENTENCE ABOUT WHAT IS MISSING, never a request that would carry it.
    expect(text).toMatch(/Drawn at .* rather than .* to fit the \d+ bytes this part was given|leaves out \d+/)
    expect(text.split('\n').filter((line) => A_REQUEST.test(line))).toEqual([])
  })
})
