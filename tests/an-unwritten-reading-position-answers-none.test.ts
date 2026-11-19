// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHAPTER HAS ALL SEVEN READING POSITIONS, OR NAMES THE ONES NOBODY HAS WRITTEN.
 *
 * Criterion C7 of design/rules/ACCEPTANCE.md: "A chapter has all seven reading positions, or names
 * the ones nobody has written. Measured: GET the chapter and every position is either written or
 * reported as unwritten."
 *
 * A chapter is a `module` record (design/rules/ACCEPTANCE.md section 4), and reading positions 4,
 * 5 and 6 (outline, sketch, digest) of a chapter are deliberately left unwritten today — section 4
 * says so in as many words: "`GET /api/records/<a chapter>/short-forms` therefore answers `none` at
 * positions 4, 5 and 6." This file does not depend on any real chapter existing: it proves the
 * general mechanism every chapter's page relies on, against a `module` record this test makes
 * itself, which is what makes it a test of the mechanism and not a copy of one day's data.
 *
 * `none` GOT NARROWER ON 15 SEPTEMBER 2026. A position this kind has a place for and this record has
 * room for, which nobody has written, is `none`: the one a reader can act on. A position the record
 * cannot have at all is `cannot_write`, and `why` says which of the two reasons it is. That is what
 * problems `JAclI-oGvUvh` and `Cb1WeNip14Lt` asked for, and this chapter is the second case: its
 * own words are nine, so it has no level above the conclusion for a summary written by part.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. ALL SEVEN POSITIONS COME BACK, in ladder order: label, title, gist, outline, sketch, digest,
 *      full — never fewer, whether or not anybody wrote them.
 *   2. A POSITION NOBODY WROTE ANSWERS `state: "none"` where the record could have it, never a
 *      truncated copy of a longer one: `text` is `null`, not a shortened string. A position the
 *      record cannot have answers `cannot_write`, so it is never named as one somebody skipped.
 *   3. A POSITION SOMEBODY DID WRITE (here, the title, which is always written) answers
 *      `state: "current"` and carries the real words.
 *
 * Proved by mutation with a control run of this file first: in src/server/lib/zoom.ts, changing the
 * unwritten gist's `state: absent.state` back to `state: 'none' as const` in `columnAt` turns the
 * gist case red, and changing `absentAt` so every reason reads `none` turns the by-part case red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(async () => {
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

/** A chapter-shaped module: a title (written), no summary, no blocks — nothing else written. */
async function aChapterWithNothingWrittenBeyondItsTitle(): Promise<string> {
  const made = await post('/api/records', {
    kind: 'module',
    title: 'Chapter 11 — a stand-in, for this test only',
    data: { context: 'This module exists only so this test has something to ask short-forms about.' },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

describe('a chapter has all seven reading positions, or names the ones nobody has written', () => {
  it('answers with all seven positions, in ladder order, whether or not they are written', async () => {
    const id = await aChapterWithNothingWrittenBeyondItsTitle()
    const read = await get(`/api/records/${id}/short-forms`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const levels = read.body.levels as { rung: string; position: number; state: string; text: string | null }[]
    expect(levels.map((one) => one.rung)).toEqual(['label', 'title', 'gist', 'outline', 'sketch', 'digest', 'full'])
    expect(levels.map((one) => one.position)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('says "none" for every position nobody wrote, and never fills text in for one', async () => {
    const id = await aChapterWithNothingWrittenBeyondItsTitle()
    const read = await get(`/api/records/${id}/short-forms`)
    const levels = read.body.levels as { rung: string; state: string; why: string | null; text: string | null }[]
    const byRung = new Map(levels.map((one) => [one.rung, one]))

    // NOBODY WROTE A LABEL OR A GIST FOR THIS CHAPTER, AND THIS RECORD HAS ROOM FOR BOTH. These are
    // the positions a person can still act on, so they say `none` in its narrowed meaning.
    for (const rung of ['label', 'gist']) {
      const one = byRung.get(rung)
      expect(one?.state, `${rung} should read "none": nobody wrote it and this record can hold it`).toBe('none')
      expect(one?.why, `${rung} should carry the reason a reader can act on`).toBe('notWritten')
      expect(one?.text, `${rung} should carry no text at all, not a shortened one`).toBeNull()
    }

    // THIS CHAPTER'S OWN WORDS ARE NINE, SO IT HAS NO LEVEL ABOVE THE CONCLUSION FOR A SUMMARY
    // WRITTEN BY PART. The three by-part positions are not "nobody wrote them" — nobody can write
    // them — and they say so. Problem `Cb1WeNip14Lt`.
    for (const rung of ['outline', 'sketch', 'digest']) {
      const one = byRung.get(rung)
      expect(one?.state, `${rung} should read "cannot_write": this record is too short for it`).toBe('cannot_write')
      expect(one?.why, `${rung} should name the reason`).toBe('tooShort')
      expect(one?.text, `${rung} should carry no text at all, not a shortened one`).toBeNull()
    }
  })

  it('says "current" for the position that was written, with the real words', async () => {
    const id = await aChapterWithNothingWrittenBeyondItsTitle()
    const read = await get(`/api/records/${id}/short-forms`)
    const levels = read.body.levels as { rung: string; state: string; text: string | null }[]
    const title = levels.find((one) => one.rung === 'title')
    expect(title?.state).toBe('current')
    expect(title?.text).toBe('Chapter 11 — a stand-in, for this test only')

    const full = levels.find((one) => one.rung === 'full')
    expect(full?.state, 'Full is the record itself, never "none"').toBe('is_the_record')
  })
})
