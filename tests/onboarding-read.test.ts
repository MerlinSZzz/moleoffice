// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE READS A NEW AGENT MAKES AT THE START, AND THE LIMIT FRICTION BESIDE THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EACH TEST IS HERE
 * ---------------------------------------------------------------------------------------
 *
 *   THE ONBOARDING READ is under its budget and says its own size, counted on the reply it really
 *   sent. Every door it names is a route the live route table holds, and the sentence beside the
 *   door is the route's own, not a second copy written here. It carries none of the brief's own
 *   content — no module list, no open-work list, no decisions — because a second "what to read
 *   first" door that drifts from the first is the ninth invariant broken in the one reply a cold
 *   agent trusts.
 *
 *   THE LIMIT sends a page and says what is left, and a limit over the maximum is refused with the
 *   maximum named rather than silently clamped.
 *
 *   THE COMPACT KIND READ gives the kind, the keys of its required fields, and every field's type
 *   under the field's key, pinned against the declaration the full read is generated from, and
 *   carries no prose.
 *
 *   THE BOOTSTRAP READ with no workspace header says in its first sentence that no project was
 *   named, and a working directory that matches no registered repository or work area is refused
 *   and names no project.
 *
 * Every one of the four is proved by mutation after a control run; the mutations and their sha256
 * are in the report, not in this file.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { ALL_ROUTE_NOTES, type ApiRoute } from '../src/server/api/kinds.ts'
import { KIND_SPECS } from '@shared/kinds.ts'
import { ONBOARDING_DOORS, ONBOARDING_TOKEN_BUDGET, firstSentenceOf } from '@shared/onboarding.ts'
import { CHARS_PER_TOKEN } from '../src/config/token-estimate.mjs'
import { NARROWED_BY_PERMISSION } from '../src/shared/disclosure.ts'

let t: TestDb
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The parsed body of one request, failing loudly if it was not a 2xx. */
async function read(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url, headers })
  expect(res.statusCode, `${url} answered ${String(res.statusCode)}: ${res.body.slice(0, 300)}`).toBeLessThan(300)
  return res.json() as Record<string, unknown>
}

/** The live route table as "METHOD /path". */
function liveRoutes(): Set<string> {
  return new Set(listRoutes().map((route) => `${route.method} ${route.path}`))
}

// ================================================================ the onboarding read, and its size

describe('the onboarding read fits its budget and says its own size', () => {
  it('fits the budget it states, counts itself, and drops nothing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/onboarding' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      size: {
        characters: number
        bytes: number
        tokensEstimated: number
        charsPerTokenAssumed: number
        budgetTokensEstimated: number
        fits: boolean
        tokensAreAnEstimate: string
      }
      leftOut: unknown[]
      leftOutNote: string
    }
    const size = body.size
    // THE TWO COUNTS THAT ARE EXACT, and the estimate built from them, checked against the reply
    // that was really sent rather than the object the handler built.
    expect(size.charsPerTokenAssumed).toBe(CHARS_PER_TOKEN)
    expect(size.tokensEstimated).toBe(Math.round(size.characters / CHARS_PER_TOKEN))
    expect(size.characters).toBeLessThanOrEqual(res.body.length)
    expect(size.tokensEstimated).toBeLessThanOrEqual(ONBOARDING_TOKEN_BUDGET)
    expect(size.budgetTokensEstimated).toBe(ONBOARDING_TOKEN_BUDGET)
    expect(size.fits).toBe(true)
    expect(size.tokensAreAnEstimate).toContain('estimate')
    // A REPLY THAT FITS DROPS NOTHING AND SAYS SO, which is a real answer and not an absence.
    expect(body.leftOut).toEqual([])
    expect(body.leftOutNote).toContain('Nothing was left out')
  })
})

// ================================================================================ the doors

describe('every door is a route the server really serves, with the route\'s own sentence', () => {
  it('names only live routes, walked from the route table and not from a list', async () => {
    const body = (await read('/api/onboarding')) as {
      doors: { route: string; what: string }[]
    }
    const live = liveRoutes()
    expect(body.doors.length, 'the onboarding read names fewer than ten doors').toBeGreaterThanOrEqual(10)
    for (const door of body.doors) {
      expect(live, `the onboarding read names ${door.route}, which the server does not serve`).toContain(door.route)
    }
  })

  it('takes each door\'s sentence from the route\'s own description, never a second copy', async () => {
    const body = (await read('/api/onboarding')) as {
      doors: { route: string; what: string }[]
    }
    const routes = listRoutes()
    for (const door of body.doors) {
      const found = routes.find((route) => `${route.method} ${route.path}` === door.route)
      expect(found, `${door.route} is not in the route table`).toBeDefined()
      const description = found?.note ?? ALL_ROUTE_NOTES[door.route] ?? null
      expect(description, `${door.route} has no sentence for the door to take`).not.toBeNull()
      // The first sentence of the route's own account, and nothing written here.
      expect(door.what).toBe(firstSentenceOf(description as string))
      expect((description as string).startsWith(door.what)).toBe(true)
    }
  })

  it('names every door the shared declaration names, so none is quietly dropped', async () => {
    const body = (await read('/api/onboarding')) as { doors: { route: string }[] }
    expect(body.doors.map((door) => door.route).sort()).toEqual([...ONBOARDING_DOORS].sort())
  })
})

// ================================================================ it is not the brief

describe('the onboarding read carries none of the brief\'s own content', () => {
  it('has no module list, no open-work list and no decisions', async () => {
    const body = await read('/api/onboarding')
    // THE BRIEF'S OWN KEYS. The brief answers the state of the project; this answers which doors
    // and which project. A reply carrying both would be one fact in two places, and the state
    // would be the copy that drifts.
    for (const key of ['modules', 'openWork', 'decisions', 'decidedSinceYouLastRan', 'hisWords', 'writing']) {
      expect(body, `the onboarding read carries the brief's "${key}"`).not.toHaveProperty(key)
    }
  })
})

// ================================================================================ the limit

describe('GET /api/records takes a limit and says what is left', () => {
  /** A module, with the one field the kind needs. */
  async function fileAModule(n: number): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      payload: {
        kind: 'module',
        title: `A module for the limit test ${String(n)}`,
        data: { context: 'Filed by tests/onboarding-read.test.ts.', parts: [] },
      },
    })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(201)
  }

  it('returns exactly the rows asked for, and says how many were left and how to ask for more', async () => {
    for (let i = 0; i < 5; i += 1) await fileAModule(i)
    const all = (await read('/api/records')) as { records: unknown[] }
    const total = all.records.length

    const page = (await read('/api/records?limit=2')) as {
      records: { id: string }[]
      matched: number
      returned: number
      left: number
      truncated: boolean
      next: string | null
    }
    expect(page.returned).toBe(2)
    expect(page.records.length).toBe(2)
    expect(page.matched).toBe(total)
    expect(page.left).toBe(total - 2)
    expect(page.truncated).toBe(true)
    expect(page.next, 'a truncated page named no request that carries the next one').not.toBeNull()
    expect(page.next).toContain('limit=2')
    expect(page.next).toContain('offset=2')

    // AND THE NEXT REQUEST REALLY CARRIES THE NEXT ROWS, not the same ones again.
    const nextRes = await app.inject({ method: 'GET', url: (page.next as string).replace('GET ', '') })
    expect(nextRes.statusCode).toBe(200)
    const nextPage = nextRes.json() as { records: { id: string }[] }
    expect(nextPage.records.length).toBe(2)
    const seen = new Set([...page.records, ...nextPage.records].map((row) => row.id))
    expect(seen.size, 'the next page repeated rows from the first').toBe(4)
  })

  it('refuses a limit over the maximum, naming the maximum rather than clamping', async () => {
    const { RECORD_LIST_MAX_LIMIT } = await import('../src/server/api/records.ts')
    const res = await app.inject({ method: 'GET', url: `/api/records?limit=${String(RECORD_LIST_MAX_LIMIT + 1)}` })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string }
    expect(body.error).toContain(String(RECORD_LIST_MAX_LIMIT))
    // NOT SILENTLY CLAMPED: the refusal is an error and no records came back.
    expect(body).not.toHaveProperty('records')
  })

  it('answers the whole list and says nothing was left when no limit was sent', async () => {
    await fileAModule(0)
    const body = (await read('/api/records')) as { left: number; truncated: boolean; next: string | null }
    expect(body.left).toBe(0)
    expect(body.truncated).toBe(false)
    expect(body.next).toBeNull()
  })
})

// ================================================================================ the compact kind

/**
 * WHAT THE COMPACT READ OF ONE KIND MUST BE, worked out from the declaration the full read is generated from: the
 * kind, the keys of the fields it marks required, and every field's type under the field's key.
 */
function compactShapeDeclaredFor(kind: keyof typeof KIND_SPECS): {
  required: string[]
  fields: Record<string, string>
} {
  const declared = KIND_SPECS[kind].fields
  return {
    required: declared.filter((field) => field.required).map((field) => field.key),
    fields: Object.fromEntries(declared.map((field) => [field.key, field.type])),
  }
}

/** A reply's keys, sorted, without the field every reply carries to say whether permission took anything off it. */
function ownKeysOf(body: object): string[] {
  return Object.keys(body)
    .filter((key) => key !== NARROWED_BY_PERMISSION)
    .sort()
}

describe('the compact kind read gives every field its type and names the required ones, and no prose', () => {
  it('answers kind, required and fields for the session kind, and nothing else', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/kinds/session/compact' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { kind: string; required: unknown; fields: unknown }
    expect(body.kind).toBe('session')

    // NO PROSE: three keys, and nothing else beside the field every reply carries (src/shared/disclosure.ts).
    expect.soft(ownKeysOf(body), 'the compact read answers kind, required and fields, and nothing else').toEqual([
      'fields',
      'kind',
      'required',
    ])

    // PINNED AGAINST THE DECLARATION THE FULL READ IS GENERATED FROM. Every required field of the
    // kind is named here; a cheap read that dropped one would be believed and then refused a write.
    const declared = compactShapeDeclaredFor('session')
    expect(declared.required.length, 'session has no required fields, so this proves nothing').toBeGreaterThan(0)
    expect.soft(body.required, 'the compact read lists exactly the fields the declaration marks required').toEqual(
      declared.required,
    )
    // Every field of the kind is a key, and its value is the field's type, which is what makes it a usable cheap read.
    // The fields only a door writes are there with their types too, as they were in the list this shape replaced.
    expect.soft(body.fields, 'the compact read gives one key for every declared field, and that field\'s type').toEqual(
      declared.fields,
    )
    // AND THE SAVING IS REAL: about a thousand estimated tokens against sixteen thousand.
    // 1,025 SINCE 4 OCTOBER 2026, from 1,000: the session's `flow` field (wave 1 of the office flow, M1) took the read to
    // 1,005. The field is the run naming its flow, which the office needs; the saving is still sixteen to one.
    // 1,050 SINCE 11 OCTOBER 2026, from 1,025: wave 13j round 54's two session fields, `remindedBeforeTheSeal` (what the
    // reminder before the seal did) and `checkAlso` (the starter's items for it), took the read to 1,039. Every field
    // must be named here, so neither can be left out; the saving is still about fifteen to one.
    // 1,100 SINCE 12 OCTOBER 2026, from 1,050: wave 13j round loop-1's two session fields, `howTheRoundEnded` (how the
    // round ended: sealed, or why not) and `commandEnded` (how the run's command ended), took the read to 1,075. Every
    // field must be named here, so neither can be left out.
    // 1,125 SINCE 13 OCTOBER 2026, from 1,100: wave 13j's two session fields `nextRound` (round loop-2: this agent's
    // next round, asked at the next-round door) and `workerRuns` (round loop-3: the workers this run asked the office
    // to start) took the read to 1,108. Every field must be named here, so neither can be left out.
    // 1,150 SINCE 14 OCTOBER 2026, from 1,125: wave 13s round 44's session field `castingRoll` (how the default router
    // chose a worker's program and model, kept on the worker's run) took the read to 1,126. Every field must be named
    // here, so it cannot be left out.
    // 1,175 SINCE 14 OCTOBER 2026, from 1,150: wave 13s round 49's two session fields `stopCause` (why a closed run
    // stopped) and `waitingOnALimit` (a run waiting on a usage limit) took the read to 1,156. Every field must be named
    // here, so neither can be left out.
    // 1,200 SINCE 21 OCTOBER 2026, from 1,175: wave 13u round 45's session field `territory` (the paths in the
    // repository a run means to change) took the read to 1,183. Its entry is 55 characters, about 14 tokens, and its
    // key and type together are 17 of them, so no shorter name brings the read back to 1,175. Every field must be
    // named here, so it cannot be left out.
    // 1,000 AGAIN SINCE 26 OCTOBER 2026, from 1,200: wave 13u round 98 gave each field as its key and its type, with the
    // required keys listed once, which halved what a field costs; the limit is back at its first value so that it again
    // stops a read that grows unnoticed.
    expect.soft(Math.round(res.body.length / CHARS_PER_TOKEN), 'the compact session read is at most 1,000 estimated tokens').toBeLessThanOrEqual(1000)
  })

  it('answers the other kinds from the same declaration, and refuses a name that is not one', async () => {
    const report = (await read('/api/kinds/report/compact')) as { kind: string; required: unknown; fields: unknown }
    expect(report.kind).toBe('report')
    const declared = compactShapeDeclaredFor('report')
    expect.soft(ownKeysOf(report)).toEqual(['fields', 'kind', 'required'])
    expect.soft(report.required).toEqual(declared.required)
    expect.soft(report.fields).toEqual(declared.fields)
    const wrong = await app.inject({ method: 'GET', url: '/api/kinds/not-a-kind/compact' })
    expect(wrong.statusCode).toBe(404)
    expect((wrong.json() as { error: string }).error).toContain('There is no record kind')
  })
})

// ================================================================================ bootstrap and the project

describe('the bootstrap read says which project it was asked about, in its first sentence', () => {
  it('says no project was named, first, when no workspace header is sent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/project/bootstrap' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { firstSentence: string; project: { id: string } }
    expect(Object.keys(body)[0], 'the project sentence is not the reply\'s first field').toBe('firstSentence')
    expect(body.firstSentence).toMatch(/no project/i)
    expect(body.firstSentence).toMatch(/default/i)
    expect(body.project.id).toBe('default')
  })

  it('names the project when the header names one', async () => {
    const body = (await read('/api/project/bootstrap', { 'x-mole-office-workspace': 'default' })) as {
      firstSentence: string
      asked: { workspaceHeader: boolean }
    }
    expect(body.asked.workspaceHeader).toBe(true)
    expect(body.firstSentence).toMatch(/named it with x-mole-office-workspace/i)
  })
})

describe('a working directory is matched against the registered repositories and work areas', () => {
  it('answers nothing matched, and names no project, when no project holds the directory', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/project/bootstrap?directory=/tmp/mole-office-nothing-registers-this',
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string }
    expect(body.error).toMatch(/nothing matched/i)
    expect(body.error).toMatch(/which project/i)
    // NEVER A FALLBACK TO THE DEFAULT: the refusal does not name it as the answer.
    expect(body.error).not.toMatch(/"default"/)
    expect(body).not.toHaveProperty('project')
  })

  it('answers the project whose registered repository root holds the directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'onboarding-root-'))
    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/api/implementation/repositories',
        payload: { name: 'onboarding-scratch', root },
      })
      expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)

      const directory = join(root, 'a', 'subdirectory')
      const body = (await read(`/api/project/bootstrap?directory=${encodeURIComponent(directory)}`)) as {
        firstSentence: string
        project: { id: string }
        asked: { directory: string | null }
      }
      expect(body.project.id).toBe('default')
      expect(body.asked.directory).toBe(directory)
      expect(body.firstSentence).toMatch(/working directory/i)
      expect(body.firstSentence).toMatch(/repository root/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('onboarding says nothing matched and names no project, and still carries the doors', async () => {
    const body = (await read('/api/onboarding?directory=/tmp/mole-office-nothing-registers-this')) as {
      project: { id: string | null; howWorkedOut: string }
      doors: unknown[]
    }
    expect(body.project.id).toBeNull()
    expect(body.project.howWorkedOut).toMatch(/nothing matched/i)
    expect(body.doors.length).toBeGreaterThan(0)
  })
})
