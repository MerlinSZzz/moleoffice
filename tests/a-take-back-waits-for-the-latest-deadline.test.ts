// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TAKE-BACK WAITS FOR THE LATEST DEADLINE.
 * Measures strict zoned time, the rule mark, the shared title and green-only moves without a server.
 * Mutations: choose the first autumn moment; accept a gap or unknown rule; prefer class one to take-back.
 * A hand-back stored with the moment it is due (wave 13u round 73, problem NHn0l-D7qvys) is due at that moment, though
 * its wall time names two; one stored without it is read as before. Mutations: the reader ignores the stored moment;
 * it does not check the moment against the wall time stored beside it.
 */
import { expect, it } from 'vitest'
import { latestMomentOfStampInZone } from '../src/shared/time.ts'
import { NEEDS_NO_CHECK_RULES, readNeedsNoCheck, needsNoCheckSays } from '../src/shared/releasing.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { handBackFacts, takeBackTitle, whenAHandBackIsDue } from '../src/shared/merge-class.ts'
import { mainSuiteFixReferenceSchema } from '../src/shared/main-suite-fix.ts'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'
it('reads an ordinary stamp and the later moment of the autumn hour', () => {
  expect(latestMomentOfStampInZone('2026-10-21 12:00:00', 'UTC')).toBe(Date.UTC(2026, 9, 21, 12))
  expect(latestMomentOfStampInZone('2026-10-25 01:30:00', 'Europe/London')).toBe(Date.UTC(2026, 9, 25, 1, 30))
})
it('reads a hand-back stored with the moment it is due as that moment, and one stored without it as the later moment', () => {
  // Synthetic facts. 24 hours after 01:30:23 London summer time on 24 October 2026 is the first 01:30:23 of 25 October.
  const facts = { entry: 'synthetic-entry', repository: '/synthetic-repository', files: ['tests/synthetic.test.ts'], commits: ['synthetic-commit'], line: { agent: null, starter: 'synthetic-starter', run: 'synthetic-run' }, landedAt: '2026-10-24 01:30:23', deadline: '2026-10-25 01:30:23', timeZone: 'Europe/London', hours: 24 }
  expect(whenAHandBackIsDue(handBackFacts.parse({ ...facts, dueAt: '2026-10-25T01:30:23.000+01:00' }))).toBe(Date.UTC(2026, 9, 25, 0, 30, 23))
  expect(whenAHandBackIsDue(handBackFacts.parse({ ...facts, dueAt: '2026-10-25T01:30:23.000+00:00' })), 'the second of the two').toBe(Date.UTC(2026, 9, 25, 1, 30, 23))
  expect(whenAHandBackIsDue(handBackFacts.parse(facts)), 'stored before the moment was: the later of the two, as before').toBe(Date.UTC(2026, 9, 25, 1, 30, 23))
  expect(whenAHandBackIsDue(handBackFacts.parse({ ...facts, dueAt: '2026-10-25T00:30:23.000+01:00' })), 'a moment the stored wall time does not name').toBeNull()
  expect(handBackFacts.safeParse({ ...facts, dueAt: '2026-10-25 01:30:23' }).success, 'a wall time with no offset').toBe(false)
})
it('refuses a spring gap, invalid stamp and unreadable zone', () => {
  for (const [stamp, zone] of [['2026-03-29 01:30:00', 'Europe/London'], ['yesterday', 'UTC'], ['2026-02-30 12:00:00', 'UTC'], ['2026-10-21 12:00:00', 'unknown/zone']]) expect(latestMomentOfStampInZone(stamp!, zone!)).toBeNull()
})
it('reads exactly one known rule or nonempty decision and gives each its words', () => {
  const rule = readNeedsNoCheck({ rule: NEEDS_NO_CHECK_RULES[0], at: '', because: '' })!
  const decision = readNeedsNoCheck({ decision: 'synthetic-decision', at: '', because: '' })!
  expect(rule).not.toBeNull(); expect(decision).not.toBeNull()
  expect(needsNoCheckSays(rule, sayInEnglish)).toContain('returns main to a state already checked')
  expect(needsNoCheckSays(decision, sayInEnglish)).toContain('synthetic-decision')
  for (const mark of [{}, { decision: '' }, { rule: 'unknown' }, { rule: NEEDS_NO_CHECK_RULES[0], decision: 'synthetic' }]) expect(readNeedsNoCheck(mark)).toBeNull()
})
it('names the original hours and accepts the new closed reason', () => {
  expect(takeBackTitle('A change', 1)).toBe('Taken back: A change, not fixed in 1 hour')
  expect(takeBackTitle('A change', 24)).toBe('Taken back: A change, not fixed in 24 hours')
  expect(mainSuiteFixReferenceSchema.safeParse({ problem: 'synthetic', kind: 'takeout', reason: 'not fixed in time' }).success).toBe(true)
})
it('bounces every nongreen take-back before house-rule or hand-back admission', () => {
  for (const more of [{}, { wideRed: true }, { handedBack: true }, { onlyHouseRulesRed: true }, { admittedForFixRound: true }]) expect(theMoveAStepMakes('testing', { step: 'tested', green: false, takeBack: true, ...more })).toEqual({ move: 'bounce', reason: 'red' })
})

it('says in both setting-word copies that an overdue open hand-back is taken back', async () => {
  const { SETTING_WORDS } = await import('../src/config/word-sources.mjs')
  const { enWave13u } = await import('../src/shared/words/en-wave-13u.ts')
  for (const words of [SETTING_WORDS.MOLE_OFFICE_HAND_BACK_HOURS, enWave13u['settingsWords.MOLE_OFFICE_HAND_BACK_HOURS']]) expect(words).toContain('When the deadline passes and the problem is still open, the queue takes the change back.')
})
