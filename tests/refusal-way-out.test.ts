// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSAL FROM THE PLAN IS SHOWN WHOLE, AND THE BROWSER INVENTS NOTHING FROM IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE USED TO GUARD, AND WHY IT NOW GUARDS SOMETHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * Until 16 August 2026 a piece of work and its parts could not both hold hours in one period.
 * `createAllocation` refused the second write, and its sentence offered a way out written as
 * `take the hours off "<work>" (allocation <id>)`. `waysOutOf` in src/web/components/Planning.tsx
 * read the id out of that clause and drew a press that deleted the row, and this file provoked a
 * real refusal from a real server to keep the two sides of that sentence agreeing.
 *
 * Round five removed the refusal, because the owner plans coarse first and refines later: 15 hours
 * on a large piece of work, then 5 and 4 on parts of it. No refusal in the product writes that
 * clause any more, so the reader could never match anything and the press could never appear. Both
 * are deleted, and this file now pins what is left, which is the part that always mattered:
 *
 *   1. THE WRITE THAT USED TO BE REFUSED GOES THROUGH. Nothing is left to read a way out of.
 *   2. THE REFUSALS THAT REMAIN ARRIVE AS THE SERVER'S OWN SENTENCE and the browser prints every
 *      word of it. A summarised refusal is a refusal a person cannot act on.
 *   3. EVERY ONE OF THEM SAYS WHAT TO DO IN WORDS A PERSON CAN CARRY OUT — a screen and a press,
 *      never an HTTP request.
 *
 * It is still the only shape available for the second point: the browser cannot import the server's
 * refusal, because the sentence is built to be read by a person and not parsed. So a real server
 * refuses over HTTP and the real component draws what came back.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let WORKSPACE = 'refusal-case-0'
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let HEADERS: Record<string, string> = {}
let caseNumber = 0
let weekAtTheStart = { plannedHours: 0, rowHours: 0 }
type PlanningModule = typeof import('../src/web/components/Planning.tsx')

beforeAll(() => {
  // Planning.tsx reaches src/web/api.ts, which reads window.localStorage at module scope. The
  // smallest stand-in that lets the module load; nothing here is under test. Same stub as
  // tests/planning-surfaces.test.ts.
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
})

beforeAll(async () => {
  t = await freshDb()
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `refusal-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Mole Office case ${String(caseNumber)}` })
  HEADERS = { 'x-mole-office-workspace': WORKSPACE }
  const week = await app.inject({ method: 'GET', url: `/api/planning/week/${WEEK}`, headers: HEADERS })
  expect(week.statusCode, week.body).toBe(200)
  weekAtTheStart = (JSON.parse(week.body) as { fit: { load: { plannedHours: number; rowHours: number } } }).fit.load
})

const WEEK = '2026-W36'

/** A task worth planning. */
function task(title: string): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title, data: { state: 'todo' }, actor: AGENT }).id
}

interface Reply {
  status: number
  body: Record<string, unknown>
}

/** Hours in the week, as the browser asks for them. */
async function give(recordId: string, hours: number, period = WEEK, horizon = 'week'): Promise<Reply> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/planning/allocations',
    headers: HEADERS,
    payload: { horizon, period, recordId, plannedHours: hours },
  })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

/** The sentence the server put in front of the caller. */
const said = (reply: Reply): string => String(reply.body['error'] ?? reply.body['message'] ?? JSON.stringify(reply.body))

/**
 * The words a person reads out of rendered markup.
 *
 * The tags come off and the entities go back, so an assertion about a SENTENCE is about the sentence
 * and not about how React escaped a quotation mark.
 */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

async function drawn(message: string): Promise<string> {
  const planning = (await import('../src/web/components/Planning.tsx')) as PlanningModule
  return renderToStaticMarkup(h(planning.Refusal, { message }))
}

describe('the sentence the server refuses with, and what the browser does with it', () => {
  it('does not refuse a piece of work and a part of it, so there is no way out to read', async () => {
    // THE REFUSAL THIS FILE WAS BUILT AROUND, GONE. Coarse first and fine later is ordinary planning
    // since round five: both rows are written, and the week counts the piece of work once rather
    // than adding the two.
    const whole = task('Tray clamp work')
    const part = task('Replace the fingers')
    t.api.createLink({ fromId: part, toId: whole, type: 'part_of', actor: AGENT })

    const first = await give(whole, 3)
    expect(first.status, said(first)).toBe(201)
    const second = await give(part, 2)
    expect(second.status, said(second)).toBe(201)

    const week = await app.inject({ method: 'GET', url: `/api/planning/week/${WEEK}`, headers: HEADERS })
    expect(week.statusCode, week.body).toBe(200)
    const load = (JSON.parse(week.body) as { fit: { load: { plannedHours: number; rowHours: number } } }).fit.load
    // Three hours on the whole, two on a part of it: three hours of work in this week, and the rows
    // themselves still add up to five. The week is a whole-office reading, so the numbers are the
    // ones the case added to what was already there.
    expect(load.plannedHours - weekAtTheStart.plannedHours).toBe(3)
    expect(load.rowHours - weekAtTheStart.rowHours).toBe(5)
  })

  it('prints the refusal it did get, word for word', async () => {
    // THE REFUSAL A PERSON STILL MEETS: this work already has hours in this period. The sentence is
    // the whole of what they have to go on, so every word of it reaches the screen. A shortened one
    // would drop the row's id, the hours already on it, or the way out at the end.
    const work = task('Tray clamp work')
    expect((await give(work, 3)).status).toBe(201)
    const refused = await give(work, 4)
    expect(refused.status, said(refused)).toBe(409)
    const message = said(refused)

    expect(textOf(await drawn(message))).toContain(message)
  })

  it('offers no press under a refusal that says to CHANGE the row, and states the way out in words', async () => {
    // A delete press here would do the one thing the sentence did not ask for, and it would throw
    // away the note and the hours actually spent on the row it removed. Nothing in the browser reads
    // this sentence any more, so no press can be invented from it — this is what proves it.
    const work = task('Tray clamp work')
    expect((await give(work, 3)).status).toBe(201)
    const refused = await give(work, 4)
    expect(refused.status, said(refused)).toBe(409)
    const message = said(refused)

    const markup = await drawn(message)
    expect(markup, 'the browser drew a press out of a refusal nobody asked it to act on').not.toContain('<button')
    // AND THE WAY OUT IS STILL SOMETHING A PERSON CAN DO: the screen and the press, in words.
    expect(message).toContain('under Schedule')
    // CRITERION CHANGE (wave 13j round 12): it read 'press Edit'. The press that turns the Schedule
    // into fields is now the page's primary press, "Plan this week" on a week.
    expect(message).toContain('press "Plan this week"')
    expect(message).not.toContain('/api/')
  })

  it('names no HTTP request in any refusal this route hands a person', async () => {
    const pipeline = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'pipeline',
      title: 'Handover campaign',
      data: { blockIds: [] },
      actor: AGENT,
    }).id
    const work = task('Tray clamp work')
    expect((await give(work, 3)).status).toBe(201)

    const refusals: Reply[] = [
      // The work already has hours here.
      await give(work, 4),
      // A key that is not a week, sent as one.
      await give(work, 1, '2026-09'),
      // A kind a plan cannot give time to.
      await give(pipeline, 2),
      // No record at all.
      await give('no-such-record', 2),
    ]
    for (const refusal of refusals) {
      expect(refusal.status, said(refusal)).toBeGreaterThanOrEqual(400)
      const message = said(refusal)
      for (const verb of ['DELETE ', 'PATCH ', 'POST ', 'PUT ', '/api/']) {
        expect(message, `the refusal hands the reader ${verb}`).not.toContain(verb)
      }
      // And every one of them reaches the screen whole.
      expect(textOf(await drawn(message))).toContain(message)
    }
  })
})
