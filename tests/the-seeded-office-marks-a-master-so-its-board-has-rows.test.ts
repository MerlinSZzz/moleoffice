// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE THE SEED WRITES MARKS A MASTER PIPELINE, SO ITS PROJECT BOARD HAS ROWS.
 *
 * `node tools/review.mjs` photographs `#/board` on a throwaway office this seed wrote. The board's rows are the steps of
 * the project's master pipeline, and a project with no master draws only its title: that is the page's design, and
 * tests/the-project-board-page-draws-one-reading.test.ts pins it. The seed marked no master, so every picture of the
 * board was a heading alone and the review's empty-page check refused all of them. The seed now marks the corpus's
 * report pack, and this reads the board through its door, for the project the page asks about.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { corpusRecord, corpusSteps } from '../scripts/seed-corpus.ts'
import type { ProjectBoard } from '../src/shared/project-board.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let board: ProjectBoard

beforeAll(async () => {
  t = await freshDb()
  // Importing the seed RUNS it, into the throwaway database `freshDb` pointed the connection at.
  await import('../scripts/seed.ts')
  app = (await apiApp()).app
  await app.ready()
  const reply = await app.inject({ method: 'GET', url: `/api/projects/${DEFAULT_WORKSPACE}/board` })
  expect(reply.statusCode, reply.body).toBe(200)
  board = reply.json() as ProjectBoard
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the project board of the office the seed writes', () => {
  it('reads the corpus report pack as the master of the project the page asks about', () => {
    expect(board.master).toEqual({ project: DEFAULT_WORKSPACE, state: 'marked', id: expect.any(String), title: corpusRecord('pipe-report-pack').title })
  })

  it('has one row for each step of that pipeline, so the page draws more than its title', () => {
    const steps = corpusSteps('report-pack').steps.map((step) => step.name)
    expect(steps.length).toBeGreaterThan(0)
    expect(board.rows.map((row) => row.title).sort()).toEqual([...steps].sort())
  })
})
