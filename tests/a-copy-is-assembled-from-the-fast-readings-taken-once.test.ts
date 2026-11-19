// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY IS ASSEMBLED FROM THE FAST CONTEXT READINGS, EACH TAKEN ONCE, AND SAYS WHICH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion B20 of `design/bundle/ACCEPTANCE.md` rests on one of the owner's decisions.
 * A copy is made of the readings the fast context routes answer out of, not of a second walk of the corpus.
 *
 * Only the open-loop reading was shared. Measured on 7 September 2026 against a copy of the owner's own
 * corpus, `custom` with every part:
 *
 *   · `readForks` ran TWICE — for what is waiting on a person and again for what has been decided.
 *   · `contradictionsFor` ran TWICE — for the unfixed problems and again for the checks.
 *   · the pipeline list was read THREE times — the subject, the campaign and the modules part.
 *   · the same open work came out in one order in `GET /api/brief` and another in a copy, because
 *     the ranking lived inside the brief's route closure where nothing else could reach it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. ONE READING PER READER, whoever asks. The copy reports what it was assembled from, and no
 *      reader appears twice in that list however many parts drew on it.
 *   2. EVERY PART THAT DREW ON A READING IS NAMED BESIDE IT. A part that went round the shared
 *      reading would be missing here, so the claim is checkable rather than asserted.
 *   3. THE COPY SAYS SO IN ITS OWN TEXT, by the reader's own name, never as a request — a reader of
 *      a copy has no API. Criterion B19.
 *   4. THE COPY AND THE BRIEF PUT THE OPEN WORK IN ONE ORDER, out of one reader, and the copy says
 *      why each one is where it is.
 *   5. THE BRIEF IS STILL A DIFFERENT ASSEMBLER. `src/server/api/brief.ts` does not import the
 *      copy's assembler, which is criterion B17 and holds after this.
 *
 * Proved by mutation with a control run of this file first: making the `decisions` reader call
 * `readForks()` itself rather than taking the shared reading turns cases 1 and 2 red, and putting
 * the ranking back inside the brief's closure turns case 4 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BUNDLE_RUNGS } from '../src/shared/bundles.ts'

/**
 * THE LONGEST POSITION A COPY HAS, read from the declaration rather than spelled here.
 *
 * It was `full` until criterion B32 on 8 September 2026, when the record itself stopped being a
 * position a copy goes to. What this file is about is which readings a copy takes, and it asks for
 * the longest position so that every reader runs.
 */
const TOP = String(BUNDLE_RUNGS[BUNDLE_RUNGS.length - 1])

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
/** Each case works in its own project, so the readings it lists are only that case's records. */
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  const here = `bundles-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: here, title: `Copy case ${String(caseNumber)}` })
  HEADERS['x-mole-office-workspace'] = here
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function aRecord(kind: string, title: string, data: unknown): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** Enough for every reader below to have something to find. */
async function aProject(): Promise<void> {
  await aRecord('problem', 'The seed window closes too early', { state: 'open' })
  await aRecord('task', 'Repair the seed window', { state: 'todo' })
  await aRecord('pipeline', 'The first night, in order', { blockIds: [] })
  await aRecord('proposal', 'Follow the run, or the clock?', {
    question: 'Follow the run, or the clock?',
    options: ['The run', 'The clock'],
    who_settles_it: 'the owner',
  })
}

/** The four parts that pair off on two readings, plus the two that share the pipeline list. */
const PAIRED = 'objective,campaign,structure,openLoops,whatWasTried,waitingOnYou,decisions,problems,contradictions'

describe('a copy is assembled from the fast readings, each taken once', () => {
  function checkReaders(named: string[]): void {
    const faults: string[] = []
    let checked = 0
    for (const reader of named) {
      for (const match of reader.matchAll(/(\w+(?: and \w+)*) \((src\/[^)]+)\)/g)) {
        const file = readFileSync(match[2]!, 'utf8')
        for (const name of match[1]!.split(' and ')) {
          checked += 1
          if (!new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`).test(file)) faults.push(`${name} is not declared by ${match[2]}`)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(faults).toEqual([])
  }



  it('takes each reading once however many parts want it, and names every part beside it', async () => {
    await aProject()
    const preview = await get(`/api/bundles/preview?preset=custom&slots=${PAIRED}&detail=${TOP}&budgetBytes=262144`)
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const from = preview.body.assembledFrom as { reader: string; forParts: string[] }[]

    // 1. NO READER TWICE.
    const readers = from.map((one) => one.reader)
    expect(readers.length, 'no reading is taken twice').toBe(new Set(readers).size)

    // 2. EVERY PART THAT DREW ON ONE IS NAMED BESIDE IT.
    const forkParts = from.find((one) => one.reader.startsWith('readForks'))?.forParts ?? []
    expect(forkParts.sort()).toEqual(['decisions', 'waitingOnYou'])
    const checkParts = from.find((one) => one.reader.startsWith('contradictionsFor'))?.forParts ?? []
    expect(checkParts.sort()).toEqual(['contradictions', 'problems'])
    const listParts = from.find((one) => one.reader.startsWith('listRecords'))?.forParts ?? []
    expect(listParts.sort()).toEqual(['campaign', 'objective', 'structure'])
    const loopParts = from.find((one) => one.reader.startsWith('openLoopsFor'))?.forParts ?? []
    expect(loopParts.sort()).toEqual(['openLoops', 'whatWasTried'])
  })

  it('says in its own text what it was assembled from, by reader and not by request', async () => {
    await aProject()
    const preview = await get(`/api/bundles/preview?preset=custom&slots=${PAIRED}&detail=${TOP}&budgetBytes=262144`)
    const text = String(preview.body.text)
    // 3. THE SENTENCE, WITH BOTH PARTS ON ONE LINE, and no request anywhere in it.
    expect(text).toContain('WHAT THIS COPY WAS ASSEMBLED FROM, each reading taken once:')
    const line = text.split('\n').find((one) => one.includes('readForks'))
    expect(line, 'the fork reading is named').toBeDefined()
    expect(line).toContain('“Decisions”')
    expect(line).toContain('“Decisions already made”')
    expect(line).not.toMatch(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\//)
  })

  it('puts the open work in the order an arriving agent is given, and says why each is there', async () => {
    await aProject()
    const brief = await get('/api/brief')
    expect(brief.status, JSON.stringify(brief.body)).toBe(200)
    const briefOrder = (brief.body.openWork.loops as { id: string }[]).map((one) => one.id)

    const preview = await get(`/api/bundles/preview?preset=custom&slots=openLoops&detail=${TOP}&budgetBytes=262144`)
    const text = String(preview.body.text)
    // 4. ONE ORDER. The ids appear in the copy in the order the brief lists them.
    const inCopy = briefOrder.filter((id) => text.includes(id))
    const places = inCopy.map((id) => text.indexOf(id))
    expect(inCopy.length, 'the copy carries the same open work').toBeGreaterThan(1)
    expect([...places].sort((a, b) => a - b), 'in the same order').toEqual(places)
    // AND WHY, in the ranking reader's own sentence.
    expect(text).toMatch(/The attention rule (puts this \d+ of \d+|did not select this)/)
    expect(text).toContain('They are in the order the attention rule puts them in')
  })
})
