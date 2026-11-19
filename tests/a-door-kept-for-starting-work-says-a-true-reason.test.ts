// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DOOR KEPT FOR STARTING WORK SAYS A TRUE REASON.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Every door kept on this computer for the reason "starts-work-on-this-machine" is refused to a
 * caller from another computer with a sentence that is true of it. Most of those doors only read
 * or record: starting a next round, starting a worker run, resuming an interrupted run and sending
 * a thread to an agent are the only ones that start anything. A door that starts nothing must not
 * tell the caller it would start something.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE LIST OF DOORS IS MADE
 * ---------------------------------------------------------------------------------------
 *
 * The list is read from the app's own route table: `listApiRoutes()` after `app.ready()`, never
 * written out here. Every route whose `keptHere.because` is `starts-work-on-this-machine` is taken,
 * and at least twenty of them must be there, so a table that stopped declaring the reason cannot
 * pass this file for the wrong reason. The first word of each act places it: Starting, Resuming
 * and Sending start something; Reading, Recording, Writing, Filing, Marking, Removing, Ending,
 * Delivering and Submitting start nothing. A first word in neither list is reported as a fault, so
 * a new door with a new verb is placed here by a person rather than passing by default.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SCAN MISSES
 * ---------------------------------------------------------------------------------------
 *
 * It reads only the first word of an act. An act whose first word says it starts nothing but whose
 * remaining words say otherwise would pass. The refusal is the one `refusalFromAnotherMachine`
 * builds, and nothing is stood in for: there is no fixture of routes or acts here and no browser.
 *
 * ---------------------------------------------------------------------------------------
 * ITS MUTATION PROOFS
 * ---------------------------------------------------------------------------------------
 *
 * Put the old clause back in src/shared/authority.ts for `starts-work-on-this-machine`
 * ("would start something running on the computer Mole Office is running on"): the first case goes
 * red and names the doors that start nothing; the second stays green. Restore the line and both are
 * green.
 *
 * Make src/server/lib/authority.ts use a literal clause for `reserved-to-the-owner` only, such as
 * "is kept for the owner", instead of the shared one: the second case goes red and names that
 * reason; the first stays green. Restore the file and both are green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'
import { refusalFromAnotherMachine } from '../src/server/lib/authority.ts'
import { WHY_REFUSED, WHY_REFUSED_MEANS } from '../src/shared/authority.ts'

/**
 * THE FIRST WORD THAT SAYS THE ACT STARTS SOMETHING HERE, and the ones that say it does not.
 * Written out so a person places a new verb rather than the scan guessing.
 */
const FIRST_WORDS_THAT_START = ['Starting', 'Resuming', 'Sending'] as const
const FIRST_WORDS_THAT_START_NOTHING = [
  'Reading',
  'Recording',
  'Writing',
  'Filing',
  'Marking',
  'Removing',
  'Ending',
  'Delivering',
  'Submitting',
] as const

/** The words a refusal must not use when the act starts nothing. */
const SAYS_IT_WOULD_START = /\bwould start\b|\bstart something\b|\bstarts something\b/i

/** The act used to read a clause back out of a refusal. */
const TEST_ACT = 'Doing a test act'

/** The words a refusal puts after its clause. */
const REFUSAL_TAIL = ', and this request came from another computer.'

/** How many doors the reason must cover before the scan is believed to be reading. */
const AT_LEAST_THIS_MANY = 20

/** The first sentence of a refusal, which is the one the act and the clause make. */
function firstSentence(refusal: string): string {
  const end = refusal.indexOf('. ')
  return end === -1 ? refusal : refusal.slice(0, end + 1)
}

/** The first word of an act, or the whole act when it has no space. */
function firstWord(act: string): string {
  const end = act.indexOf(' ')
  return end === -1 ? act : act.slice(0, end)
}

let t: TestDb
let app: FastifyInstance
let routes: readonly ApiRoute[]

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a door kept for starting work says a true reason', () => {
  it('does not tell a door that starts nothing that it would start something', () => {
    const kept = routes.filter((route) => route.keptHere?.because === 'starts-work-on-this-machine')
    // The scan is reading something: a table with no such doors would pass the case below for the
    // wrong reason.
    expect(kept.length).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY)

    const startsSomething = new Set<string>(FIRST_WORDS_THAT_START)
    const startsNothing = new Set<string>(FIRST_WORDS_THAT_START_NOTHING)

    const broken = kept.flatMap((route) => {
      const { act, because } = route.keptHere!
      const where = `${route.method} ${route.path}`
      const word = firstWord(act)
      if (!startsSomething.has(word) && !startsNothing.has(word)) {
        return [`${where}: first word "${word}" is in neither list`]
      }
      if (startsSomething.has(word)) return []
      const refusal = refusalFromAnotherMachine({
        act,
        because,
        route: where,
        arrival: 'another machine',
        client: null,
      })
      if (!SAYS_IT_WOULD_START.test(refusal.error)) return []
      return [`${where}: ${firstSentence(refusal.error)}`]
    })

    expect(broken).toEqual([])
  })

  it('takes the refusal clause from the panel sentence', () => {
    const disagree = WHY_REFUSED.flatMap((reason) => {
      const refusal = refusalFromAnotherMachine({
        act: TEST_ACT,
        because: reason,
        route: 'GET /api/a-test-route',
        arrival: 'another machine',
        client: null,
      })
      const start = `${TEST_ACT} `
      const end = refusal.error.indexOf(REFUSAL_TAIL)
      if (!refusal.error.startsWith(start) || end === -1) return [reason]
      const clause = refusal.error.slice(start.length, end)
      if (clause === '') return [reason]
      if (WHY_REFUSED_MEANS[reason].startsWith(`This ${clause}`)) return []
      return [reason]
    })

    expect(disagree).toEqual([])
  })
})
