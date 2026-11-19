// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A POSITION A PERSON PICKS BY HAND IS HONOURED; THE PART BUDGETS SHAPE ONLY THE AUTOMATIC DEFAULT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion B25 of `design/bundle/ACCEPTANCE.md`, on the owner's first try of the bundles page and what
 * Builder BZ measured from it (message `pMVCzMUiIdlM`, problem `I8t-4xWcIp8h`).
 *
 * A copy asked for at the Conclusion came back as titles. It was not a defect in the copy button: the
 * part called *What is still open* was given 7,281 bytes, a line each with a conclusion is more
 * than that, and the copy stepped every entry down the ladder to fit. 101 of its 132 entries came
 * back at Level 2. The copy said so at the top, in a paragraph the owner did not notice.
 *
 * Measured again on 7 September 2026 on a copy of the owner's corpus, `recover_project` at the Conclusion:
 * 99 of 108 entries at Level 2, 24,668 characters. After: nothing steps down for the size, 340
 * entries, 120,289 characters, and the copy says which parts went over their share and by how much.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. A PICKED POSITION IS DRAWN. Ask for the Conclusion over a part far too small to hold it and
 *      every entry that has a conclusion is drawn with it.
 *   2. NOTHING IS DROPPED TO MAKE IT FIT. The same records are named as at the shortest position.
 *   3. THE COPY SAYS ITS SIZE — which parts went over their share, by how much, and that nothing
 *      was left out of them.
 *   4. A POSITION NOBODY PICKED IS STILL SHAPED BY THE SHARES. Send no position at all and the copy
 *      shortens itself as it always did.
 *   5. THE COUNT LINE STAYS AND STANDS OUT: it is ruled off above and below rather than sitting in
 *      the paragraphs.
 *
 * Proved by mutation with a control run of this file first: making `fitOnePart` ignore `picked` and
 * walk the ladder down as it did before turns cases 1, 2 and 3 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { partsLongerThanTheirShare } from '../src/shared/a-copys-levels-in-words.ts'

let WORKSPACE = 'default'
const HEADERS: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

/** The office is made once for the file. Each case gets its own project, so its copy holds its own records. */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `position-case-${String(caseNumber)}`
  HEADERS['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Position case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

/** Thirty problems, each with a conclusion of its own, and far more than a small share can hold. */
async function thirtyWithConclusions(): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < 30; i += 1) {
    const made = await post('/api/records', {
      kind: 'problem',
      title: `A problem nobody has fixed, number ${String(i)}`,
      summary: `What is wrong in problem ${String(i)}, said in a sentence about as long as a real one is.`,
      data: { state: 'open' },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    ids.push(made.body.record.id as string)
  }
  return ids
}

/** A share far too small for a conclusion each: one part, and the size is the share. */
const TOO_SMALL = '/api/bundles/preview?preset=custom&slots=problems&budgetBytes=1024'

describe('a position a person picks by hand is honoured', () => {
  it('draws every entry at the position that was asked for, however small the share', async () => {
    const ids = await thirtyWithConclusions()
    const picked = await get(`${TOO_SMALL}&detail=gist`)
    expect(picked.status, JSON.stringify(picked.body)).toBe(200)
    const text = String(picked.body.text)

    // 1. THE CONCLUSION IS THERE, on every one of them.
    for (let i = 0; i < 30; i += 1) {
      expect(text, `problem ${String(i)} is drawn with its conclusion`).toContain(
        `What is wrong in problem ${String(i)},`,
      )
    }
    expect(picked.body.drawnShorter.count, 'nothing fell back').toBe(0)

    // 2. AND NOTHING WAS DROPPED. Every record named at the shortest position is named here too.
    const shortest = await get(`${TOO_SMALL}&detail=title`)
    const short = String(shortest.body.text)
    for (const id of ids) {
      expect(short, `${id} at Level 2`).toContain(id)
      expect(text, `${id} at the Conclusion`).toContain(id)
    }
    expect(text).not.toContain('leaves out')
  })

  it('says which parts went over their share and by how much', async () => {
    await thirtyWithConclusions()
    const picked = await get(`${TOO_SMALL}&detail=gist`)
    const text = String(picked.body.text)
    // 3. THE SIZE, IN THE COPY'S OWN TEXT.
    expect(text).toContain(partsLongerThanTheirShare(1))
    expect(text).toContain('“Unfixed problems” took')
    expect(text).toContain('Nothing was left out of them to make them fit.')
    // AND THE REPLY SAYS IT, so a screen can draw the same fact without reading the text.
    const problems = (picked.body.parts as { name: string; tookMoreRoom: boolean; bytes: number; share: number }[])
      .find((one) => one.name === 'problems')
    expect(problems?.tookMoreRoom).toBe(true)
    expect(problems?.bytes ?? 0).toBeGreaterThan(problems?.share ?? 0)
  })

  it('shapes the copy by the shares when nobody picked a position', async () => {
    await thirtyWithConclusions()
    // 4. NO `detail` AT ALL. This is the automatic default, and the shares still shape it.
    const automatic = await get(TOO_SMALL)
    expect(automatic.status, JSON.stringify(automatic.body)).toBe(200)
    const text = String(automatic.body.text)
    expect(text).toContain('leaves out')
    const problems = (automatic.body.parts as { name: string; tookMoreRoom: boolean }[]).find(
      (one) => one.name === 'problems',
    )
    expect(problems?.tookMoreRoom, 'it shortened itself rather than taking more room').toBe(false)
  })

  it('keeps the count line at the top, ruled off so it is not one paragraph among several', async () => {
    // A record with no conclusion of its own, asked for at the Conclusion, so it falls back.
    const made = await post('/api/records', {
      kind: 'problem',
      title: 'A problem nobody wrote a conclusion for',
      data: { state: 'open' },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const picked = await get('/api/bundles/preview?preset=custom&slots=problems&detail=gist')
    const lines = String(picked.body.text).split('\n')
    // 5. RULED OFF ABOVE AND BELOW.
    const at = lines.findIndex((one) => one.includes('ENTRIES BELOW HAVE NOTHING WRITTEN AT'))
    expect(at, 'the count line is in the copy').toBeGreaterThan(0)
    expect(lines[at - 1]).toMatch(/^-{20,}$/)
    expect(lines[at + 2]).toMatch(/^-{20,}$/)
  })
})
