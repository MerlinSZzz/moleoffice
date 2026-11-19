// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSAL FROM ANOTHER COMPUTER READS AS ONE SENTENCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Every route kept on this computer declares beside itself an act in a person's words, and that
 * act starts the refusal a caller from another computer reads. The refusal joins the act to a
 * reason: "<act> works on the computer Mole Office is running on — its files, its ports, or
 * something it has running, and this request came from another computer." The act is therefore the
 * subject of that sentence, and it has to be a phrase that can be one.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE FOR AN ACT
 * ---------------------------------------------------------------------------------------
 *
 * A phrase that starts with a capital letter whose first word ends in -ing, with no clause in it: no
 * comma, colon or semicolon, and none of the words that open a clause — whether, what, which, whose,
 * who, how, why, where, when, that, until, so, because, if, while — as a whole word in any case.
 * The first-word pattern allows a hyphen, so "Re-reading" passes.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIMIT OF THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A word list cannot find a clause that has no clause word, such as "the agent tools the office
 * runs". The acts that broke the rule that way were read by hand in this change, and the second
 * case below keeps those eight old acts from coming back. Three more acts that failed the capital
 * and -ing part of the rule were read by hand in the same change.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * The route table is the one the app registers, read through `listApiRoutes()` after `app.ready()`,
 * and the refusal is the one `refusalFromAnotherMachine` builds. Nothing is stood in for: there is
 * no fixture of acts here and no browser.
 *
 * ---------------------------------------------------------------------------------------
 * ITS MUTATION PROOF
 * ---------------------------------------------------------------------------------------
 *
 * Put the mail tool's old act back in src/server/api/summons.ts and run this file: it goes red, and
 * the first case here names `GET /api/office/mail-tool`. Restore the line and it is green. A
 * registry test deleted on 13 November 2026 went red with it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'
import { refusalFromAnotherMachine } from '../src/server/lib/authority.ts'

/** The words that open a clause, matched as whole words and in any case. */
const CLAUSE_WORDS = [
  'whether',
  'what',
  'which',
  'whose',
  'who',
  'how',
  'why',
  'where',
  'when',
  'that',
  'until',
  'so',
  'because',
  'if',
  'while',
] as const

/** The ends of the rule that a word list can see. */
const PUNCTUATION = [',', ':', ';'] as const

/** A capital letter, then letters and hyphens, then -ing: the first word of an act. */
const STARTS_WITH_AN_ING_WORD = /^[A-Z][a-z-]*ing\b/

/**
 * THE EIGHT ACTS READ BY HAND: each ended in a clause with no clause word. They are written out
 * here so that one cannot come back without this case going red.
 */
const ACTS_READ_BY_HAND = [
  'Recording the process a session is running as',
  'Taking back something an agent did on your own words or under a period you granted',
  'Reading the agent tools the office runs',
  "Saying a resolving merge entry's hour is over",
  'Saying a run waited for the next message and none came',
  'Ending a run a restart cut off here',
  'Delivering a line Mole Office wrote without starting a run',
  'Stopping a world kept up for somebody to look at',
] as const

/** What is wrong with an act, or null when the word list finds nothing wrong. */
function whatTheWordListFinds(act: string): string | null {
  if (!STARTS_WITH_AN_ING_WORD.test(act)) return 'does not start with a capital -ing word'
  const mark = PUNCTUATION.find((one) => act.includes(one))
  if (mark !== undefined) return `holds "${mark}"`
  const word = CLAUSE_WORDS.find((one) => new RegExp(`\\b${one}\\b`, 'i').test(act))
  return word === undefined ? null : `holds the clause word "${word}"`
}

/** The first sentence of a refusal, which is the one the act starts. */
function firstSentence(refusal: string): string {
  const end = refusal.indexOf('. ')
  return end === -1 ? refusal : refusal.slice(0, end + 1)
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

describe('an act kept on this computer starts a refusal that reads as one sentence', () => {
  it('starts the refusal with the act, and the act holds no clause', () => {
    const keptHere = routes.filter((route) => route.keptHere !== undefined)
    // The scan is reading something: a route table with no acts would pass the case below for the
    // wrong reason.
    expect(keptHere.length).toBeGreaterThan(50)

    const joined = keptHere.flatMap((route) => {
      const { act, because } = route.keptHere!
      const refusal = refusalFromAnotherMachine({
        act,
        because,
        route: `${route.method} ${route.path}`,
        arrival: 'another machine',
        client: null,
      })
      const startsTheSentence = refusal.error.startsWith(`${act} `)
      const breaksTheRule = whatTheWordListFinds(act)
      if (startsTheSentence && breaksTheRule === null) return []
      return [`${route.method} ${route.path}: ${firstSentence(refusal.error)}`]
    })

    expect(joined).toEqual([])
  })

  it('does not let an act read by hand come back', () => {
    const acts = new Set(keptHereActs(routes))
    expect(ACTS_READ_BY_HAND.filter((act) => acts.has(act))).toEqual([])
  })
})

function keptHereActs(all: readonly ApiRoute[]): string[] {
  return all.flatMap((route) => (route.keptHere === undefined ? [] : [route.keptHere.act]))
}
