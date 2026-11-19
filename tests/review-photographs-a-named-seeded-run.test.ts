// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TOOLS/REVIEW.MJS PHOTOGRAPHS ONE NAMED SEEDED RUN, by a fixed rule. Wave 13y round 35, item 9.15 (a).
 *
 * The run page used to show the first run GET /api/records gave, newest change first. The review's own three
 * processes each file a run as they start, after the seed, so that was always one of those, and which one changed
 * from one review to the next (round 34's report, block "915"). The rule now names a run of the public corpus by its
 * key, and finds it by the title the corpus gives it among the seeded records.
 *
 * The three runs the review's own processes file are made here, in the list, newer than every seeded record. They are
 * not records of any office.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PHOTOGRAPHED_RUN, theReviewEnvironment, theRunThisReviewPhotographs } from '../tools/review.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type Row = { id: string; kind: string; title: string; origin: string | null; updatedAt: string }

const corpus = JSON.parse(readFileSync(new URL('../scripts/seed-corpus/public.json', import.meta.url), 'utf8')) as {
  records: { key: string; kind: string; title: string }[]
}

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let seeded: Row[]

beforeAll(async () => {
  t = await freshDb()
  // Importing the seed RUNS it, into the throwaway database `freshDb` pointed the connection at.
  await import('../scripts/seed.ts')
  app = (await apiApp()).app
  await app.ready()
  const reply = await app.inject({ method: 'GET', url: '/api/records' })
  expect(reply.statusCode, reply.body).toBe(200)
  seeded = (reply.json() as { records: Row[] }).records
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The list as the review reads it: the runs its own processes filed as they started, then everything the seed wrote. */
function asTheReviewReadsIt(): Row[] {
  const later = '2999-01-01 00:00:00'
  const itsOwn = ['The browser app', 'The API server', 'The message worker'].map(
    (title, i): Row => ({ id: `made-here-${String(i)}`, kind: 'session', title, origin: 'authored', updatedAt: later }),
  )
  return [...itsOwn, ...seeded]
}

describe('the run whose page the review photographs', () => {
  it('is the seeded run the public corpus files under its key, whichever runs are newer and in whatever order the list comes', () => {
    const spec = corpus.records.find((one) => one.key === THE_PHOTOGRAPHED_RUN)
    expect(spec?.kind, `the public corpus files a run under ${THE_PHOTOGRAPHED_RUN}`).toBe('session')
    const list = asTheReviewReadsIt()
    const chosen = theRunThisReviewPhotographs(list)
    expect({ kind: chosen.kind, title: chosen.title, origin: chosen.origin }).toEqual({ kind: 'session', title: spec!.title, origin: 'fixture' })
    expect(seeded.filter((row) => row.title === spec!.title).map((row) => row.id)).toEqual([chosen.id])
    // THE OLD RULE, the first run of the list, would have photographed one of the review's own runs.
    expect(list.find((row) => row.kind === 'session')?.id).not.toBe(chosen.id)
    expect(theRunThisReviewPhotographs([...list].reverse()).id).toBe(chosen.id)
    // A RUN OF THAT TITLE THE SEED DID NOT WRITE is not the seeded run.
    expect(theRunThisReviewPhotographs([{ ...chosen, id: 'made-here-not-seeded', origin: 'authored' }, ...list]).id).toBe(chosen.id)
  })

  it('stops the review, naming the run, when the office holds no such seeded run or two of them', () => {
    const list = asTheReviewReadsIt()
    const chosen = theRunThisReviewPhotographs(list)
    expect(() => theRunThisReviewPhotographs(list.filter((row) => row.id !== chosen.id))).toThrow(THE_PHOTOGRAPHED_RUN)
    expect(() => theRunThisReviewPhotographs([...list, { ...chosen, id: 'made-here-a-second-copy' }])).toThrow(THE_PHOTOGRAPHED_RUN)
  })

  it('is read from the corpus the review seeds: the caller cannot name another corpus', () => {
    const env = theReviewEnvironment({ MOLE_OFFICE_SEED_CORPUS: '/somewhere/else.json', PATH: process.env.PATH }, 1, 2, '/nowhere/review.db', () => {})
    expect(env.MOLE_OFFICE_SEED_CORPUS).toBeUndefined()
  })
})
