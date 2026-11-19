// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAWING THAT MARKS NO CARD SAYS WHAT RESTRICTS ITS RECORDS AND WHO IS WORKING ON THEM, SO IT DOES NOT READ AS ONE
 * NOTHING RESTRICTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * The canvas reads what restricts its records and who is working on them, marks the cards, and says in the page's body
 * what a mark cannot: that a read is still under way, that it failed, or that a check could not run. A pipeline's lanes
 * draw the same records and mark no card. Without words, that drawing reads as one that nothing restricts and nobody is
 * on. The two reads now live in one module, src/web/components/graph/restrictions-and-presence.ts, which the canvas
 * uses, and its `whatADrawingWithNoMarksSays` gives a drawing with no marks its sentences.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, from made-up reads of four made-up records
 * ---------------------------------------------------------------------------------------
 *
 *   1. while both reads run, it says so in the canvas's own words;
 *   2. when a read fails, it says so with the problem, in the canvas's own words;
 *   3. once both have answered, it names the restricted records and the records with a work domain, by title in the
 *      order given, says that this drawing does not mark them, and says each check that could not run in the canvas's
 *      own words; a record whose every restriction is resolved is not restricted, and one still to be checked is;
 *   4. one restricted record is named alone, and a drawing that nothing restricts, nobody is on and every check ran
 *      says nothing.
 *
 * The canvas says its sentences with the same functions of the module, so cases 1 to 3 hold its words too. Its words
 * about who is working are also read from a built page in tests/graph-presence-in-the-browser.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Each in src/web/components/graph/restrictions-and-presence.ts, copied first and restored with cp and checked with cmp:
 *   say nothing while the restriction read runs → case 1 goes red.
 *   say nothing when the presence read failed → case 2 goes red.
 *   count a record with any restriction, resolved or not → case 3 goes red.
 *   leave out the checks that could not run → case 3 goes red.
 *   say the restricted sentence with no restricted record → case 4 goes red.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { t, type WordKey, type WordValues } from '../src/shared/i18n.ts'
import { RESTRICTION_KINDS, RESTRICTION_SEVERITY } from '../src/shared/restriction.ts'
import { PRESENCE_STATES } from '../src/shared/workdomain.ts'
import type { RestrictionReading } from '../src/web/api.ts'
import type { PresenceHere } from '../src/web/components/graph/Presence.tsx'

/** A read in its three states. Declared here, as this test calls the module, so the test reads before the module exists. */
type Read<Answer> = { at: 'reading' } | ({ at: 'read' } & Answer) | { at: 'failed'; problem: string }
type Says = (
  read: {
    restrictions: Read<{ byRecord: Record<string, RestrictionReading[]>; couldNotCheck: readonly { what: string; because: string }[] }>
    presence: Read<{ byRecord: Record<string, PresenceHere[]>; domainsRead: number; couldNotCheck: number }>
  },
  records: readonly { id: string; title: string }[],
) => string[]

let says: Says

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope. Nothing in this stand-in is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const where = ['..', 'src', 'web', 'components', 'graph', 'restrictions-and-presence.ts'].join('/')
  const found: unknown = await import(/* @vite-ignore */ where).catch((err: unknown) => {
    throw new Error(`${where} could not be read, so no drawing can say what restricts its records: ${String(err)}`)
  })
  const said: unknown = Reflect.get(found as object, 'whatADrawingWithNoMarksSays')
  if (typeof said !== 'function') throw new Error(`${where} gives no whatADrawingWithNoMarksSays.`)
  says = said as Says
})

/** A word of the office, which must be there: a missing one is drawn as its bracketed key. */
function word(key: string, values?: WordValues): string {
  const said = t(key as WordKey, values)
  expect(said, `the word ${key} is in the English list`).not.toMatch(/^⟦/)
  return said
}

const RECORDS = [
  { id: 'record-first', title: 'Made-up record first' },
  { id: 'record-second', title: 'Made-up record second' },
  { id: 'record-third', title: 'Made-up record third' },
  { id: 'record-fourth', title: 'Made-up record fourth' },
]

const restriction = (standing: RestrictionReading['standing']): RestrictionReading => ({
  restrictionId: 'restriction-one',
  kind: RESTRICTION_KINDS[0],
  title: 'Made-up restriction',
  severity: RESTRICTION_SEVERITY[0],
  allowedUses: [],
  disallowedClaims: [],
  holdsField: null,
  reach: { how: 'direct' },
  standing,
})
const ACTIVE = restriction({ state: 'active' })
const RESOLVED = restriction({ state: 'resolved', resolvedAt: '2026-11-15 10:00:00', resolvedBy: 'person' })
const STILL_TO_CHECK = restriction({ state: 'resolved-unchecked', resolvedAt: '2026-11-15 10:00:00', resolvedBy: 'person', revalidationId: null })

const working: PresenceHere = {
  domainId: 'domain-one',
  domainTitle: 'Made-up domain',
  agentId: 'agent-one',
  objective: 'made-up objective',
  stage: 'working',
  presence: PRESENCE_STATES[0],
  quietForMinutes: 3,
  lastSignFrom: 'session',
  worstOverlapRank: null,
}

const CHECKS = [
  { what: 'made-up check one', because: 'made-up reason one' },
  { what: 'made-up check two', because: 'made-up reason two' },
]

/** The canvas's sentence for the checks that could not run, in its own words. */
const checksSentence = (checks: readonly { what: string; because: string }[]) =>
  `${String(checks.length)}${word('g7b.Canvas.restriction')} ${checks.length === 1 ? word('g7b.Canvas.check') : word('g7b.Canvas.checks')}` +
  `${word('g7b.Canvas.could_not_run')}: ${checks.map((gap) => `${gap.what} — ${gap.because}`).join('; ')}`

describe('a drawing that marks no card, about its records', () => {
  it("1. while both reads run, it says so in the canvas's own words", () => {
    expect(says({ restrictions: { at: 'reading' }, presence: { at: 'reading' } }, RECORDS)).toEqual([
      word('g7b.Canvas.reading_what_restricts_these_records'),
      word('g7b.Canvas.reading_who_is_working_on_these_records'),
    ])
  })

  it("2. when a read fails, it says so with the problem, in the canvas's own words", () => {
    const failed = says({ restrictions: { at: 'failed', problem: 'made-up problem one' }, presence: { at: 'failed', problem: 'made-up problem two' } }, RECORDS)
    expect(failed).toEqual([
      `${word('g7b.Canvas.what_restricts_these_records_could_not_be')}${word('g7b.Canvas.so_no_card_carries_a_restriction_mark')}made-up problem one`,
      `${word('g7b.Canvas.who_is_working_on_these_records_could')}${word('g7b.Canvas.so_no_card_shows_anybody')}made-up problem two`,
    ])
  })

  it('3. once read, it names the restricted records and those with a work domain, and says this drawing does not mark them', () => {
    const read = says(
      {
        restrictions: {
          at: 'read',
          byRecord: { 'record-first': [ACTIVE], 'record-second': [RESOLVED], 'record-third': [RESOLVED, STILL_TO_CHECK], 'record-fourth': [] },
          couldNotCheck: CHECKS,
        },
        presence: { at: 'read', byRecord: { 'record-second': [working], 'record-third': [working], 'record-fourth': [] }, domainsRead: 2, couldNotCheck: 0 },
      },
      RECORDS,
    )
    const restricted = word('drawingWithNoMarks.restricted', { n: 2, titles: '“Made-up record first”, “Made-up record third”' })
    const workDomain = word('drawingWithNoMarks.workDomain', { n: 2, titles: '“Made-up record second”, “Made-up record third”' })
    expect(read).toEqual([restricted, checksSentence(CHECKS), workDomain])
    expect(restricted, 'the sentence names the records').toContain('“Made-up record first”, “Made-up record third”')
    expect(restricted, 'and says that this drawing does not mark them').toMatch(/does not mark/)
    expect(workDomain, 'the sentence names the records').toContain('“Made-up record second”, “Made-up record third”')
    expect(workDomain, 'and says that this drawing does not mark them').toMatch(/does not mark/)
  })

  it('4. one restricted record is named alone, and a drawing nothing restricts and nobody is on says nothing', () => {
    const one = says(
      {
        restrictions: { at: 'read', byRecord: { 'record-first': [], 'record-second': [ACTIVE] }, couldNotCheck: [] },
        presence: { at: 'read', byRecord: { 'record-first': [] }, domainsRead: 3, couldNotCheck: 0 },
      },
      RECORDS,
    )
    expect(one).toEqual([word('drawingWithNoMarks.restricted', { n: 1, titles: '“Made-up record second”' })])
    const none = says(
      {
        restrictions: { at: 'read', byRecord: { 'record-first': [RESOLVED], 'record-second': [] }, couldNotCheck: [] },
        presence: { at: 'read', byRecord: {}, domainsRead: 3, couldNotCheck: 0 },
      },
      RECORDS,
    )
    expect(none).toEqual([])
  })
})
