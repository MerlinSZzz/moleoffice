// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN UNWRITTEN POSITION SAYS SO, AND IS NEVER A CUT-DOWN COPY OF THE ONE ABOVE.
 *
 * Criterion C8 of design/rules/ACCEPTANCE.md: "An unwritten position says so and is never a
 * cut-down copy of the one above. (The owner’s ruling on the third POINTING handback: lines copied from
 * the report under a summary are deception.) Measured the way that ruling is already measured: the
 * same words appearing at two positions fail."
 *
 * A chapter's sketch and digest (positions 5 and 6) are today deliberately unwritten — section 4 of
 * the same file: "Positions 4, 5 and 6 ... are left unwritten." This file proves the general
 * mechanism that has to hold for that to be honest: when a chapter-shaped record carries a long,
 * distinctive `full` text (its `context`) but nobody has written a sketch or a digest, those two
 * positions must read as unwritten rather than as a shortened echo of the full text. It does not
 * depend on any real chapter: it makes its own record, which is what makes it a test of the
 * mechanism and not a copy of one day's data.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. Sketch and digest carry `text: null`, never a slice of the full content.
 *   2. Nowhere in either position's own reading does a run of the full content's distinctive
 *      words appear — the whole reading is checked, not just its `text` field, so a field renamed
 *      to carry the same cut-down copy would still be caught.
 *
 * Proved by mutation with a control run of this file first: in src/server/lib/zoom.ts, inside the
 * by-part branch of the reading (`parts === null`, the unwritten case both sketch and digest share),
 * changing `text: null` to a 40-character slice of the record's own `context` field turns this
 * file's second case red — the exact defect the owner’s ruling names, made to happen on purpose and then
 * undone.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})
afterEach(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

// A long, distinctive sentence: unlikely to appear anywhere by coincidence, so finding it inside a
// sketch or digest reading can only mean it was copied in from the full text.
const DISTINCTIVE_FULL_TEXT =
  'Zebra-quilted narwhal spreadsheets explain why the loading-dock thermostat argues with the ' +
  'ceiling fan every third Tuesday of a leap year.'

async function aChapterWithFullTextButNoSketchOrDigest(): Promise<string> {
  const made = await post('/api/records', {
    kind: 'module',
    title: 'Chapter for C8, a stand-in',
    data: { context: DISTINCTIVE_FULL_TEXT },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

describe('an unwritten sketch or digest is never a cut-down copy of the full text', () => {
  it('carries no text at all for sketch or digest, not a shortened one', async () => {
    const id = await aChapterWithFullTextButNoSketchOrDigest()
    const read = await get(`/api/records/${id}/short-forms`)
    const levels = read.body.levels as { rung: string; text: string | null }[]
    for (const rung of ['sketch', 'digest']) {
      const one = levels.find((l) => l.rung === rung)
      expect(one?.text, `${rung} should be null, not a shortened copy of the full text`).toBeNull()
    }
  })

  it('never echoes a run of the full text\'s own words at the sketch or digest position', async () => {
    const id = await aChapterWithFullTextButNoSketchOrDigest()
    const read = await get(`/api/records/${id}/short-forms`)
    const levels = read.body.levels as { rung: string }[]
    // A DISTINCTIVE SLICE, LONG ENOUGH THAT NO SHORT WORD COULD COINCIDE WITH IT.
    const tell = DISTINCTIVE_FULL_TEXT.slice(0, 40)
    for (const rung of ['sketch', 'digest']) {
      const whole = JSON.stringify(levels.find((l) => l.rung === rung))
      expect(whole, `${rung}'s own reading carries a slice of the full text — a cut-down copy dressed as a written one`).not.toContain(tell)
    }
  })
})
