// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCREEN: WHAT screenWhatWouldLeave FINDS, AND WHAT IT NEVER PRINTS. Criterion F16 point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/screening.ts` reports on text about to leave Mole Office. It never strips,
 * redacts or rewrites anything, and — this is the property this file cares about most — it never
 * puts the value of a key into anything it returns. Every test below uses a plainly made-up value:
 * no real setting on this machine is ever read, because `secretSettingValues` is always injected.
 *
 * ---------------------------------------------------------------------------------------
 * NO DATABASE, ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * `screenWhatWouldLeave` touches no table and opens nothing: it takes a string and, optionally,
 * three injected functions in place of the office's own settings, the machine's home directory and
 * the registered person's name. So this file needs none of the database harness the rest of the
 * suite uses, and every test below is hermetic — its answer cannot depend on what happens to be
 * configured or logged in on whichever machine runs it.
 */

import { describe, expect, it } from 'vitest'
import {
  screenWhatWouldLeave,
  settingNameSaysSecret,
  SCREEN_CHECK_NAMES,
  SCREEN_CHECKS,
  SCREEN_SEVERITIES,
  type ScreeningAnswer,
} from '../src/server/lib/screening.ts'
import { screenCheckWord, screenSeverityWord } from '../src/shared/words.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

/** The made-up machine's home directory. Any absolute folder would do: the screen looks only under the one it is given. */
const FIXTURE_HOME = `${THE_TEST_FIXTURE_ROOT}/users/fixture-user`

/** A finding of this check, or a refusal saying there was none — so a test reads as a claim, not a guess. */
function only(answer: ScreeningAnswer, check: (typeof SCREEN_CHECK_NAMES)[number]) {
  const found = answer.findings.filter((f) => f.check === check)
  return found
}

describe('S1: the closed set of checks is total and has exactly two severities', () => {
  it('declares a severity and a sentence for every check, from exactly two severities', () => {
    expect(SCREEN_SEVERITIES).toEqual(['refused', 'look_before_you_paste'])
    for (const check of SCREEN_CHECK_NAMES) {
      const entry = SCREEN_CHECKS[check]
      expect(SCREEN_SEVERITIES as readonly string[], check).toContain(entry.severity)
      expect(entry.sentence.length, `${check} has no sentence worth reading`).toBeGreaterThan(20)
    }
  })
})

describe('the machine-word gate: a severity and a check name are read, never printed raw', () => {
  it('reads every declared severity to a word with no underscore', () => {
    for (const severity of SCREEN_SEVERITIES) {
      const word = screenSeverityWord(severity)
      expect(word.standing).toBe('known')
      expect(word.text).not.toContain('_')
    }
  })

  it('reads every declared check to a word with no underscore', () => {
    for (const check of SCREEN_CHECK_NAMES) {
      const word = screenCheckWord(check)
      expect(word.standing).toBe('known')
      expect(word.text).not.toContain('_')
    }
  })

  it('names a severity or a check no table knows, rather than handing it back', () => {
    expect(screenSeverityWord('fixture-nonsense').text).toBe('unknown screening severity: fixture-nonsense')
    expect(screenCheckWord('fixture-nonsense').text).toBe('unknown screening check: fixture-nonsense')
  })
})

describe('a setting only counts as a secret when a whole word in its name says so', () => {
  it('says yes to a name ending in KEY, SECRET, TOKEN or PASSWORD as a whole segment', () => {
    expect(settingNameSaysSecret('FIXTURE_API_KEY')).toBe(true)
    expect(settingNameSaysSecret('FIXTURE_SECRET')).toBe(true)
    expect(settingNameSaysSecret('FIXTURE_TOKEN')).toBe(true)
    expect(settingNameSaysSecret('FIXTURE_PASSWORD')).toBe(true)
  })

  it('says no to a name that only contains the word as part of a longer one', () => {
    // The two real settings this guards against: MOLE_OFFICE_WORLD_SECRETARIES (a list of agent
    // handles) and MOLE_OFFICE_LARGE_LAST_TURN_TOKENS (a count of language-model tokens). Neither
    // is a secret, and a bare substring match would call both one.
    expect(settingNameSaysSecret('MOLE_OFFICE_WORLD_SECRETARIES')).toBe(false)
    expect(settingNameSaysSecret('MOLE_OFFICE_LARGE_LAST_TURN_TOKENS')).toBe(false)
    expect(settingNameSaysSecret('FIXTURE_WORKSPACE')).toBe(false)
  })
})

describe('S2: a key is refused, and its value is never carried', () => {
  const FIXTURE_SECRET = 'not-a-real-secret-fixture-4f8b2c91'

  it('refuses text carrying the current value of a setting whose name says it is a secret', () => {
    const answer = screenWhatWouldLeave(`the setting is ${FIXTURE_SECRET} today`, {
      secretSettingValues: () => [{ name: 'FIXTURE_API_KEY', value: FIXTURE_SECRET }],
    })
    const hits = only(answer, 'key_in_text')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.severity).toBe('refused')
    expect(hits[0]?.where?.line).toBe(1)
  })

  it('never writes the secret’s value into the finding that reports it', () => {
    const answer = screenWhatWouldLeave(`the setting is ${FIXTURE_SECRET} today`, {
      secretSettingValues: () => [{ name: 'FIXTURE_API_KEY', value: FIXTURE_SECRET }],
    })
    const hits = only(answer, 'key_in_text')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.says).not.toContain(FIXTURE_SECRET)
    expect(hits[0]?.says).toContain('FIXTURE_API_KEY')
  })

  it('refuses a value shaped exactly like a key this office issues — 64 hexadecimal characters', () => {
    const shaped = '0123456789abcdef'.repeat(4) // 64 hex characters, plainly not a real key
    expect(shaped).toHaveLength(64)
    const answer = screenWhatWouldLeave(`copy this: ${shaped} please`, {
      secretSettingValues: () => [],
    })
    const hits = only(answer, 'key_in_text')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.severity).toBe('refused')
    expect(hits[0]?.says).not.toContain(shaped)
  })

  it('does not refuse a run of 63 or 65 hexadecimal characters, only exactly 64', () => {
    const tooShort = '0123456789abcdef'.repeat(4).slice(0, 63)
    const tooLong = `${'0123456789abcdef'.repeat(4)}0`
    const answer = screenWhatWouldLeave(`${tooShort} and ${tooLong}`, { secretSettingValues: () => [] })
    expect(only(answer, 'key_in_text')).toEqual([])
  })

  it('says a check that could not read the office’s own settings could not finish, rather than reading it as clean', () => {
    const answer = screenWhatWouldLeave('nothing suspicious here', {
      secretSettingValues: () => {
        throw new Error('fixture: settings unreadable')
      },
    })
    const incomplete = only(answer, 'check_incomplete')
    expect(incomplete).toHaveLength(1)
    expect(incomplete[0]?.severity).toBe('look_before_you_paste')
    expect(incomplete[0]?.says).toContain('settings')
    // The shape half of the key check still ran even though the settings half could not.
    expect(answer.ranChecks).toContain('key_in_text')
  })

  it('reads the whole answer and finds the secret’s value nowhere in it, however many things it also found', () => {
    const text =
      `the setting is ${FIXTURE_SECRET} today, contact fixture.person@example-not-real.test, ` +
      `ask FixtureRegisteredPerson, and see ${FIXTURE_HOME}/notes.txt`
    const answer = screenWhatWouldLeave(text, {
      secretSettingValues: () => [{ name: 'FIXTURE_API_KEY', value: FIXTURE_SECRET }],
      homeDirectory: () => FIXTURE_HOME,
      registeredPersonName: () => 'FixtureRegisteredPerson',
    })
    expect(only(answer, 'key_in_text').length).toBeGreaterThan(0)
    expect(JSON.stringify(answer)).not.toContain(FIXTURE_SECRET)
  })
})

describe('S3: an absolute path under the home directory is refused, a repository-relative one is not', () => {
  it('refuses an absolute path under the injected home directory', () => {
    const answer = screenWhatWouldLeave(`see ${FIXTURE_HOME}/notes.txt for the plan`, {
      homeDirectory: () => FIXTURE_HOME,
    })
    const hits = only(answer, 'home_directory_path')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.severity).toBe('refused')
    expect(hits[0]?.says).toContain(`${FIXTURE_HOME}/notes.txt`)
  })

  it('refuses the home directory itself, written with nothing after it', () => {
    const answer = screenWhatWouldLeave(`cd ${FIXTURE_HOME} and look around`, {
      homeDirectory: () => FIXTURE_HOME,
    })
    expect(only(answer, 'home_directory_path')).toHaveLength(1)
  })

  it('does not flag a repository-relative path such as src/server/lib/bundle.ts', () => {
    // The home directory here is a deliberately odd fixture value, chosen so this test can be
    // proved by mutation: "src/server/lib/bundle.ts" has no reachable "/" for the absolute-path
    // scanner to start a candidate at (every "/" in it follows a letter) — so even a home
    // directory of "/server/lib/bundle.ts", which is exactly the tail of that repository-relative
    // path with a "/" in front, must not be flagged. A scanner that started a candidate after any
    // "/" rather than only one not preceded by a letter, digit or "." would read the tail
    // "/server/lib/bundle.ts" out of the repository-relative path and wrongly match it.
    const answer = screenWhatWouldLeave('the files touched are src/server/lib/bundle.ts and src/shared/words.ts', {
      homeDirectory: () => '/server/lib/bundle.ts',
    })
    expect(only(answer, 'home_directory_path')).toEqual([])
  })

  it('resolves ".." lexically, so a path that only looks like it starts under home is judged by where it really points', () => {
    const answer = screenWhatWouldLeave(`see ${FIXTURE_HOME}/../../etc/passwd`, {
      homeDirectory: () => FIXTURE_HOME,
    })
    expect(only(answer, 'home_directory_path')).toEqual([])
  })

  it('says a check that could not work out the home directory could not finish', () => {
    const answer = screenWhatWouldLeave('nothing suspicious here', {
      homeDirectory: () => {
        throw new Error('fixture: no home directory on this machine')
      },
    })
    const incomplete = only(answer, 'check_incomplete')
    expect(incomplete).toHaveLength(1)
    expect(incomplete[0]?.severity).toBe('look_before_you_paste')
    expect(incomplete[0]?.says).toContain('home directory')
  })
})

describe('S4: names are found and flagged, and refuse nothing', () => {
  it('reports an email address at the weaker severity, refusing nothing', () => {
    const answer = screenWhatWouldLeave('write to fixture.person@example-not-real.test about it', {})
    const hits = only(answer, 'email_address')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.severity).toBe('look_before_you_paste')
    expect(hits[0]?.says).toContain('fixture.person@example-not-real.test')
  })

  it('reports the registered person’s name at the weaker severity, refusing nothing, whatever its case', () => {
    const answer = screenWhatWouldLeave('ask FixtureRegisteredPerson about it, or fixtureregisteredperson again', {
      registeredPersonName: () => 'FixtureRegisteredPerson',
    })
    const hits = only(answer, 'registered_person_name')
    expect(hits).toHaveLength(2)
    expect(hits.every((f) => f.severity === 'look_before_you_paste')).toBe(true)
  })

  it('does not match the registered person’s name as part of a longer word', () => {
    const answer = screenWhatWouldLeave('fixtureregisteredpersonal details go here', {
      registeredPersonName: () => 'FixtureRegisteredPerson',
    })
    expect(only(answer, 'registered_person_name')).toEqual([])
  })

  it('carries the one-line disclosure that other people’s names were not checked, whether or not there is a hit', () => {
    const clean = screenWhatWouldLeave('nothing here at all', {})
    const busy = screenWhatWouldLeave('ask FixtureRegisteredPerson at fixture.person@example-not-real.test', {
      registeredPersonName: () => 'FixtureRegisteredPerson',
    })
    for (const answer of [clean, busy]) {
      const disclosure = only(answer, 'other_peoples_names')
      expect(disclosure).toHaveLength(1)
      expect(disclosure[0]?.severity).toBe('look_before_you_paste')
      expect(disclosure[0]?.says).toContain('no roll')
      expect(disclosure[0]?.where).toBe(null)
    }
  })
})

describe('S5: a clean answer names which checks ran, and nothing is left silently unread', () => {
  it('says it looked and found nothing, naming which checks ran', () => {
    const answer = screenWhatWouldLeave('a perfectly ordinary sentence with nothing in it', {
      secretSettingValues: () => [],
      homeDirectory: () => FIXTURE_HOME,
      registeredPersonName: () => 'FixtureRegisteredPerson',
    })
    expect(answer.ranChecks).toEqual(['key_in_text', 'home_directory_path', 'email_address', 'registered_person_name', 'other_peoples_names'])
    expect(answer.summary).toContain('found nothing')
    expect(answer.summary.length).toBeGreaterThan(20)
  })

  it('names every finding with its check, its severity, and a sentence', () => {
    const answer = screenWhatWouldLeave('ask FixtureRegisteredPerson at fixture.person@example-not-real.test', {
      registeredPersonName: () => 'FixtureRegisteredPerson',
    })
    expect(answer.findings.length).toBeGreaterThan(0)
    for (const finding of answer.findings) {
      expect(SCREEN_CHECK_NAMES as readonly string[]).toContain(finding.check)
      expect(SCREEN_SEVERITIES as readonly string[]).toContain(finding.severity)
      expect(finding.says.length).toBeGreaterThan(10)
    }
  })
})
