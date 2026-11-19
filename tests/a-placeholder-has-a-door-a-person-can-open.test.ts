// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON CAN SEE A PLACEHOLDER, AND WHAT IT STOPS A RESULT PROVING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Round ten wave 8 built twelve routes, two record kinds, six marks, a boundary vocabulary and two
 * governance guards. Its step 10 — the screen — was the one step of twelve not built, and
 * `grep -rn 'restrictions' src/web/` returned nothing. `GET /api/records/<id>` had carried a
 * record's restrictions on every kind since that wave and no page read the key. So the owner could
 * open a result that rests on a guessed camera calibration and be told nothing at all, while an
 * agent with curl was told everything.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * It renders the record page's restrictions panel and reads what a person would see. It does not
 * assert on the shape of `restrictionsOn`'s reply — wave 8's own tests already do that, and every
 * one of them was green for the whole time the screen was missing.
 *
 * The rows come from the real reader over HTTP, so a change to what the read returns fails here
 * rather than drawing a blank panel.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { RESTRICTION_MARKS, withoutHueOfRestriction } from './restriction-helpers.ts'

/**
 * A project for the case alone. The Placeholders surface counts the restrictions in the project it
 * is asked for and puts the worst first, so a placeholder another case filed would change the count
 * and the order. Each case files its own and reads its own.
 */
let PROJECT = 'default'
let HUMAN: Record<string, string>
let caseNumber = 0

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

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `placeholder-case-${String(caseNumber)}`
  HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': PROJECT }
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'A project for one case' } })
  expect(made.statusCode, made.body).toBe(201)
})

type Panel = typeof import('../src/web/components/Restrictions.tsx')

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

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

async function link(fromId: string, toId: string, type: string): Promise<void> {
  const made = await app.inject({ method: 'POST', url: '/api/links', headers: HUMAN, payload: { fromId, toId, type } })
  expect(made.statusCode, made.body).toBe(201)
}

const DISALLOWED = 'geometric accuracy claims'
const ALLOWED = 'pipeline plumbing'

/** The owner's own worked example: a guessed camera calibration, and a result that rests on it. */
async function aCameraCalibrationNobodyRan(): Promise<{ placeholder: string; result: string }> {
  const result = await file('claim', 'The wrist camera reprojection error is 0.4px', {})
  const placeholder = await file('placeholder', "The wrist camera's intrinsics have never been calibrated", {
    what: "The wrist camera's intrinsics have never been calibrated.",
    slot: 'stand_in',
    substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
    resolved_when: 'A checkerboard calibration run on the wrist camera, with the residuals recorded.',
    allowed_uses: [ALLOWED, 'shape and interface testing'],
    disallowed_claims: [DISALLOWED, 'final performance comparison'],
    severity: 'stops_final',
  })
  await link(placeholder, result, 'about')
  return { placeholder, result }
}

/** Every restriction reaching one record, as the record read carries it. */
async function restrictionsOn(recordId: string): Promise<{
  found: unknown[]
  skippedDeleted: number
  couldNotCheck: { what: string; because: string }[]
}> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers: HUMAN })
  expect(read.statusCode, read.body).toBe(200)
  const reply = read.json() as { restrictions?: { found: unknown[]; skippedDeleted: number; couldNotCheck: { what: string; because: string }[] } }
  expect(reply.restrictions, 'the record read carries no restrictions key').toBeDefined()
  return reply.restrictions as { found: unknown[]; skippedDeleted: number; couldNotCheck: { what: string; because: string }[] }
}

const strip = (markup: string): string => markup.replace(/<style[\s\S]*?<\/style>/g, '')
const text = (markup: string): string => strip(markup).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('a result that rests on a placeholder says what it may not be used to claim', () => {
  it('draws the author’s own words, unchanged, on the restricted record’s page', async () => {
    const { result } = await aCameraCalibrationNobodyRan()
    const mod = await panel()
    const reading = await restrictionsOn(result)
    expect(reading.found.length, 'the reader returns nothing, so this proves nothing about the screen').toBe(1)
    const html = renderToStaticMarkup(
      h(mod.RestrictionsHere, { recordId: result, reading, onJudged: () => {} } as never),
    )
    const said = text(html)
    // WHAT IT STOPS THIS PROVING, in the author's words and not a paraphrase of them.
    expect(said).toContain(DISALLOWED)
    expect(said).toContain('final performance comparison')
    // AND WHAT IT IS STILL GOOD FOR. Both halves, because "not valid for geometry" and "fine for
    // plumbing" are the two things the owner's worked example says at once.
    expect(said).toContain(ALLOWED)
    // THE SEVERITY, IN THE WORD THE MARK TABLE CARRIES, not as the stored token.
    expect(said).toContain(RESTRICTION_MARKS['stops_final.active']!.word)
    expect(said).not.toContain('stops_final')
    // AND WHERE IT CAME FROM.
    expect(said).toContain('This record is what it is about.')
  })

  it('says what could not be checked, so a short answer cannot read as a complete one', async () => {
    const { result } = await aCameraCalibrationNobodyRan()
    const mod = await panel()
    const reading = await restrictionsOn(result)
    expect(reading.couldNotCheck.length, 'the reply admits no gaps, so this proves nothing').toBeGreaterThan(0)
    const html = renderToStaticMarkup(
      h(mod.RestrictionsHere, { recordId: result, reading, onJudged: () => {} } as never),
    )
    // The sentence is the reply's own. It is behind a press, which is where a fold belongs, so this
    // reads the markup rather than the drawn text.
    expect(strip(html)).toContain(reading.couldNotCheck[0]!.because.slice(0, 40))
  })

  it('draws a harmless one differently from a production-blocking one, and not in colour', async () => {
    const mod = await panel()
    const blocking = await aCameraCalibrationNobodyRan()
    const idle = await file('claim', 'The gripper closes in 240ms', {})
    const harmless = await file('placeholder', 'The log file name is made up for now', {
      what: 'The log file name is made up for now.',
      slot: 'stand_in',
      substitute: 'run.log',
      resolved_when: 'Somebody picks a naming scheme.',
      allowed_uses: [],
      disallowed_claims: [],
      severity: 'harmless',
    })
    await link(harmless, idle, 'about')

    const loud = renderToStaticMarkup(
      h(mod.RestrictionsHere, {
        recordId: blocking.result,
        reading: await restrictionsOn(blocking.result),
        onJudged: () => {},
      } as never),
    )
    const quiet = renderToStaticMarkup(
      h(mod.RestrictionsHere, { recordId: idle, reading: await restrictionsOn(idle), onJudged: () => {} } as never),
    )

    // THE MARK, COMPARED WITH THE COLOUR GONE, which is the product's own family rule. The row
    // carries the three drawn channels as attributes and the stylesheet strokes them, so this is
    // the difference a reader gets in every palette and at every text size.
    const marksOf = (markup: string): string[] =>
      [...markup.matchAll(/data-form="([^"]+)" data-glyph="([^"]+)" data-edge="([^"]+)"/g)].map(
        (m) => `${m[1] as string}/${m[2] as string}/${m[3] as string}`,
      )
    expect(marksOf(loud), 'the production-blocking row draws no mark').toHaveLength(1)
    expect(marksOf(quiet), 'the harmless row draws no mark').toHaveLength(1)
    expect(marksOf(loud)[0]).not.toBe(marksOf(quiet)[0])
    // AND `form` IS ONE OF THE CHANNELS THAT DIFFER, which is the channel deciding whether anything
    // is drawn in the margin at all: `stops_final` is a rail, `harmless` is bare text.
    expect((marksOf(loud)[0] as string).split('/')[0]).toBe('rail')
    expect((marksOf(quiet)[0] as string).split('/')[0]).toBe('text')
    expect(withoutHueOfRestriction('stops_final', 'active')).not.toBe(withoutHueOfRestriction('harmless', 'active'))
    // NO HUE ANYWHERE IN THE ROW. A severity is a word and a rail, never a colour.
    expect(strip(loud)).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('says nothing restricts a record in one line, and never as a panel of nothing', async () => {
    const idle = await file('note', 'A note about nothing', {})
    const mod = await panel()
    const reading = await restrictionsOn(idle)
    expect(reading.found).toHaveLength(0)
    const html = renderToStaticMarkup(
      h(mod.RestrictionsHere, { recordId: idle, reading, onJudged: () => {} } as never),
    )
    expect(text(html)).toContain('No placeholder or fallback was found that limits this record.')
    // NOT A PANEL. A panel saying nothing on every record in the corpus is furniture, and furniture
    // stops being read.
    expect(strip(html)).not.toContain('px-panel')
    // AND WHAT COULD NOT BE CHECKED IS STILL ONE PRESS AWAY. "Nothing restricts this" and "nobody
    // could look" must not read the same.
    expect(strip(html)).toContain(reading.couldNotCheck[0]!.because.slice(0, 40))
  })
})

describe('the Placeholders surface lists every restriction, including the ones that reach nothing', () => {
  it('lists one nobody linked to anything, and says why it reaches nobody', async () => {
    await aCameraCalibrationNobodyRan()
    const orphan = await file('placeholder', 'The mount stiffness is a guess', {
      what: 'Nobody has measured the mount stiffness.',
      slot: 'stand_in',
      substitute: '1e6 N/m, guessed',
      resolved_when: 'A stiffness measurement on the real mount.',
      allowed_uses: ['shape and interface testing'],
      disallowed_claims: ['any load claim'],
      severity: 'limits_claims',
    })
    const read = await app.inject({ method: 'GET', url: '/api/restrictions?everything=true', headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    const reply = read.json() as {
      found: { restrictionId: string; severity: string; reaches: number; about: unknown[]; answered: boolean }[]
      note: string
    }
    const ids = reply.found.map((row) => row.restrictionId)
    // THE ONE `restrictionsOn` CANNOT RETURN. A restriction with no `about` link is in no reading
    // anywhere, and a surface that lost it would quietly exclude the case the kind's rules name.
    expect(ids, 'the surface loses a restriction that is about nothing').toContain(orphan)
    const row = reply.found.find((one) => one.restrictionId === orphan)
    expect(row?.about).toEqual([])
    expect(row?.reaches).toBe(0)
    // WORST FIRST, read from RESTRICTION_SEVERITY rather than restated.
    expect(reply.found[0]?.severity).toBe('stops_final')
    expect(reply.note).toContain('2 restrictions in this project')
  })

  it('counts what rests on one, from the same walk the resolution path uses', async () => {
    const { placeholder, result } = await aCameraCalibrationNobodyRan()
    const downstream = await file('report', 'The calibration write-up', {})
    await link(downstream, result, 'derived_from')
    const read = await app.inject({ method: 'GET', url: '/api/restrictions?everything=true', headers: HUMAN })
    const reply = read.json() as { found: { restrictionId: string; reaches: number }[] }
    const row = reply.found.find((one) => one.restrictionId === placeholder)
    // The claim it is about, and the report derived from that claim.
    expect(row?.reaches).toBe(2)
  })

  it('says a harmless one reaches nothing, because it does not enter the walk at all', async () => {
    const idle = await file('claim', 'The gripper closes in 240ms', {})
    const harmless = await file('placeholder', 'The log file name is made up for now', {
      what: 'The log file name is made up for now.',
      slot: 'empty',
      resolved_when: 'Somebody picks a naming scheme.',
      allowed_uses: [],
      disallowed_claims: [],
      severity: 'harmless',
    })
    await link(harmless, idle, 'about')
    const read = await app.inject({ method: 'GET', url: '/api/restrictions?everything=true', headers: HUMAN })
    const reply = read.json() as { found: { restrictionId: string; reaches: number; about: { id: string }[] }[] }
    const row = reply.found.find((one) => one.restrictionId === harmless)
    // It is declared about that claim and still reaches nothing: that is the BEHAVIOUR half of
    // "harmless is not production-blocking", not a gap in the reading.
    expect(row?.about.map((a) => a.id)).toEqual([idle])
    expect(row?.reaches).toBe(0)
  })
})
