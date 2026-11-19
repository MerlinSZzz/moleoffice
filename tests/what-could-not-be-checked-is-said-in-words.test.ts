// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SENTENCE ABOUT WHAT COULD NOT BE CHECKED NAMES THE THING, NOT THE KEY THAT HOLDS IT — AND
 * THERE IS ONLY ONE OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The Placeholders page opened with *"1 thing could not be checked; see couldNotCheck."*
 * `couldNotCheck` is a key in the JSON reply. A person reading that page has no JSON, so the
 * sentence told them a thing had been missed and then pointed at somewhere they cannot go. The
 * health check of 27 August 2026 found it — `design/round-eleven/verify-before-rename/report.md`.
 *
 * AND IT WAS WORKED OUT IN TWO PLACES, BYTE FOR BYTE: `restrictionNote` in
 * `src/shared/restriction.ts` and `everythingNote` in `src/server/api/restrictions.ts`. Repairing
 * one left the other printing the old words on the page, which is this codebase's named recurring
 * defect. There is one function now, `whatCouldNotBeCheckedSaid`, and both sentences call it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * 1. Neither sentence carries a key from the reply, and both name what was not looked at.
 * 2. The two sentences say that part in the SAME words, so a second wording cannot come back
 *    quietly. Two copies is the state this test exists to fail on.
 * 3. The record page draws it, and what a person reads there has no key name in it either. The
 *    Placeholders page prints the route's sentence unchanged, so assertion 1 is that page's too.
 * 4. More than one gap is named, not counted.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { whatCouldNotBeCheckedSaid } from '@shared/restriction.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

interface Reply {
  found: unknown[]
  couldNotCheck: { what: string; because: string }[]
  note: string
}

async function get(url: string): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Reply
}

/** A result that rests on a placeholder, so the record answer has rows as well as a gap. */
async function aGuessedCalibration(): Promise<string> {
  const file = async (kind: string, title: string, data: Record<string, unknown>): Promise<string> => {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
    expect(made.statusCode, made.body).toBe(201)
    return (made.json() as { record: { id: string } }).record.id
  }
  const result = await file('claim', 'The wrist camera reprojection error is 0.4px', {})
  const placeholder = await file('placeholder', "The wrist camera's intrinsics have never been calibrated", {
    what: "The wrist camera's intrinsics have never been calibrated.",
    slot: 'stand_in',
    substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
    resolved_when: 'A checkerboard calibration run on the wrist camera, with the residuals recorded.',
    allowed_uses: ['pipeline plumbing'],
    disallowed_claims: ['geometric accuracy claims'],
    severity: 'stops_final',
  })
  const linked = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers: HUMAN,
    payload: { fromId: placeholder, toId: result, type: 'about' },
  })
  expect(linked.statusCode, linked.body).toBe(201)
  return result
}

describe('the sentence a person reads names what could not be checked', () => {
  it('the whole-project answer names the thing and carries no key from the reply', async () => {
    await aGuessedCalibration()
    const reply = await get('/api/restrictions?everything=true')
    expect(reply.couldNotCheck.length, 'the reply admits no gaps, so this proves nothing').toBeGreaterThan(0)
    // WHAT WAS NOT LOOKED AT, BY NAME. Its own words, so a reader knows which part of the answer is
    // short without leaving the page.
    for (const gap of reply.couldNotCheck) expect(reply.note).toContain(gap.what)
    expect(reply.note, 'a key from the JSON reply is printed on the Placeholders page').not.toContain('couldNotCheck')
  })

  it('the record answer names it in the same words, because there is one function that says it', async () => {
    const result = await aGuessedCalibration()
    const whole = await get('/api/restrictions?everything=true')
    const one = await get(`/api/restrictions?record=${result}`)
    expect(one.found.length, 'nothing reaches the record, so this proves nothing').toBeGreaterThan(0)

    // THE SAME CLAUSE, ENDING BOTH SENTENCES. The two notes differ everywhere else on purpose: one
    // says how many restrictions REACH a thing, the other how many EXIST in the project. What could
    // not be checked is the same fact in both, and this fails the day it is worded twice.
    const clause = whatCouldNotBeCheckedSaid(whole.couldNotCheck)
    expect(clause.length, 'the shared clause is empty, so the two notes agree about nothing').toBeGreaterThan(0)
    expect(whole.note.endsWith(clause), `the whole-project sentence ends: ${whole.note.slice(-90)}`).toBe(true)
    expect(one.note.endsWith(clause), `the record sentence ends: ${one.note.slice(-90)}`).toBe(true)
    expect(one.note).not.toContain('couldNotCheck')
  })

  it('the record page draws it, and a person reads no key name there', async () => {
    const result = await aGuessedCalibration()
    const read = await app.inject({ method: 'GET', url: `/api/records/${result}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    const reading = (read.json() as { restrictions: Reply }).restrictions
    expect(reading.found.length, 'the panel would draw nothing, so this proves nothing').toBeGreaterThan(0)
    expect(reading.couldNotCheck.length, 'the reply admits no gaps, so this proves nothing').toBeGreaterThan(0)

    const mod = await panel()
    const html = renderToStaticMarkup(
      h(mod.RestrictionsHere, { recordId: result, reading, onJudged: () => {} } as never),
    )
    const said = drawnText(html)
    for (const gap of reading.couldNotCheck) expect(said).toContain(gap.what)
    // THE PAGE QUOTES THE SERVER'S `because` WHOLE, whatever its words are, so no reader depends on
    // one wording of it (wave 13q round 47 shortened them).
    for (const gap of reading.couldNotCheck) expect(said).toContain(gap.because)
    expect(said, 'a key from the JSON reply is drawn on the record page').not.toContain('couldNotCheck')
  })

  it('more than one gap is named, not counted', () => {
    const said = whatCouldNotBeCheckedSaid([
      { what: 'code dependencies between records' },
      { what: 'two deleted records on the path' },
    ])
    expect(said).toContain('2 things could not be checked')
    expect(said).toContain('code dependencies between records')
    expect(said).toContain('two deleted records on the path')
    // NOTHING AT ALL WHEN NOTHING WAS MISSED. An empty clause is what makes the presence of one mean
    // something.
    expect(whatCouldNotBeCheckedSaid([])).toBe('')
  })
})

const drawnText = (markup: string): string =>
  markup
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')

type Panel = typeof import('../src/web/components/Restrictions.tsx')

/** The record page's panel, imported with the browser globals it reads at module load. */
async function panel(): Promise<Panel> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  return (await import('../src/web/components/Restrictions.tsx')) as Panel
}
