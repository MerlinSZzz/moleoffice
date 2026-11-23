// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTICE AT 80% SETS THE USAGE DECISION'S WORDS APART, EXACTLY AS THE SETTING HOLDS THEM. Wave 13y round 137,
 * item 79c.
 *
 * What went wrong: when the notice went to the first secretary appointed because the agent chosen could not take it,
 * the reason followed the usage decision's words after one space. Words with no full stop at the end ran into the
 * reason. It was decided: the words stand on a line of their own, exactly as set, and the reason starts on the next
 * line. No full stop is added, and words without one are not refused.
 *
 * Read from the line that builds the notice (`theLoginsWeekIsPartUsed` in src/shared/groups.ts) and from the door that
 * sets the words, with made-up words that end with no full stop:
 *   1. at 80%, with a reason: the words are the second line, exactly as set, and the reason is the third;
 *   2. at 80%, with no reason: the words are the last line, exactly as set;
 *   3. at 80% with no usage decision, and at 50%: one line, and a reason follows after one space, as before;
 *   4. the door takes words with no full stop at the end, and the reading holds them as they were sent, with the
 *      decision's id and, since round 140's item 79d, its title.
 *
 * Cases 3 and 4 are guards: they pass before the change and must still pass after it.
 *
 * MUTATIONS, one at a time, each after a green control and restored with cp and checked with cmp:
 *   A. in src/shared/groups.ts, a space instead of the newline before the decision's words: cases 1 and 2 go red.
 *   B. the same file, the newline before the reason in every notice: case 3 goes red.
 *   C. in src/server/lib/usage-notices.ts `setTheUsageDecision`, a refusal of words that do not end with a full stop:
 *      case 4 goes red.
 *   D. (round 140) the same file, a reading that leaves out the decision's title: case 4 goes red.
 *
 * Everything here is made up: the login's name, the words, the reason and the times.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Made-up words of a usage decision, with no full stop at the end. */
const WORDS = 'Made-up words of a usage decision, 7777: hold the long checks until the reset'
/** A made-up reason sentence, in the place the reading's own sentence goes. */
const WHY = 'Made-up reason, 8888: the agent chosen here is retired, so this secretary takes the notices.'
const DECISION = 'madeUpDec777'
/** The made-up decision record's title, which the reading carries beside its id. */
const DECISION_TITLE = 'A made-up usage decision'

/** The notice the builder makes for a made-up login at `share`, 83% used, with these settings. */
const theNotice = (share: number, atEighty: { decision: string; whatToDo: string } | null, why: string | null): string => {
  const words = SYSTEM_LINES.theLoginsWeekIsPartUsed('A made-up login', share, 0.83, '2026-11-09 18:00:00', 'Europe/London', atEighty, why)
  expect(words.said).toBe(words.line)
  return words.line
}

describe('the notice at 80% sets the words of the usage decision apart', () => {
  it('1: at 80% with a reason, the words are the second line exactly as set, and the reason is the third', () => {
    const lines = theNotice(80, { decision: DECISION, whatToDo: WORDS }, WHY).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain(DECISION)
    expect(lines[1]).toBe(WORDS)
    expect(lines[2]).toBe(WHY)
  })

  it('2: at 80% with no reason, the words are the last line exactly as set', () => {
    const lines = theNotice(80, { decision: DECISION, whatToDo: WORDS }, null).split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe(WORDS)
  })

  it('3: with no usage decision, and at 50%, the notice is one line and a reason follows after one space', () => {
    for (const notice of [theNotice(80, null, WHY), theNotice(50, { decision: DECISION, whatToDo: WORDS }, WHY)]) {
      expect(notice).not.toContain('\n')
      expect(notice.endsWith(` ${WHY}`)).toBe(true)
    }
    expect(theNotice(50, { decision: DECISION, whatToDo: WORDS }, WHY)).not.toContain(WORDS)
  })
})

describe('the door takes words with no full stop', () => {
  let t: TestDb
  let app: FastifyInstance

  beforeAll(async () => {
    t = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('4: the words are stored and read back exactly as they were sent', async () => {
    const decided = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'decision', title: DECISION_TITLE, data: { ...governsTheWholeProject(), replaces: [] } },
    })
    expect(decided.statusCode, decided.body).toBe(201)
    const decision = (decided.json() as { record: { id: string } }).record.id
    const set = await app.inject({ method: 'POST', url: '/api/office/usage-decision', headers: AS_THE_PERSON, payload: { whatToDo: WORDS, decision } })
    expect(set.statusCode, set.body).toBe(200)
    expect((set.json() as { inForce: unknown }).inForce).toEqual({ from: 'set here', whatToDo: WORDS, decision, title: DECISION_TITLE })
    const read = await app.inject({ method: 'GET', url: '/api/office/usage-decision', headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON } })
    expect((read.json() as { inForce: unknown }).inForce).toEqual({ from: 'set here', whatToDo: WORDS, decision, title: DECISION_TITLE })
  })
})
