// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SETTING CHANGED ON THE SETTINGS PAGE SAYS WHO CHANGED IT, FROM WHAT, TO WHAT AND WHEN. Problem 4f6oWJdzJbnk.
 *
 * The inject switch and the what-is-kept numbers kept only their new value. Every change to them is now written in the
 * office's own change log, on the row `setting:<which>` that a change under a raise already used, and the
 * setting-changes door answers the newest change to each. (The machine names are proved in
 * tests/another-machine-is-named-by-the-person.test.ts, case 4.)
 *
 * What is proved, through the doors:
 *   1. the person's press on the inject switch is written down: who, from what was chosen to what is chosen, and when;
 *      a press from nobody's choice to "on" is a change, although both read as "agents may inject";
 *   2. a press that changes nothing writes no row;
 *   3. the what-is-kept numbers are written down as the numbers chosen, not the whole reading with its folder;
 *   4. an agent's refused press writes nothing, and the door answers null for a setting nobody changed.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-changed-setting-says-who-changed-it.test.ts
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/server/api/inject-setting.ts: `writeDownASettingChange(actor, { setting: 'agents-may-inject'` back to
 *      `writeDownAnActUnderTheRaise(actor, { setting: 'agents-may-inject'`, and its import the same: cases 1 and 2 go red.
 *   B. src/server/api/inject-setting.ts `chosen`: `(reading.nobodyChose ? null : reading.may)` to `(reading.may)`:
 *      case 1 goes red.
 *   C. src/server/lib/records.ts `writeDownASettingChange`: the `return` after `writeDownAnActUnderTheRaise(actor, act)`
 *      removed, so a press that changed nothing is written down too: case 2 goes red.
 *   D. src/server/api/what-is-kept.ts: `before: theChosenNumbers(before), after: theChosenNumbers(after)` to
 *      `before, after`: case 3 goes red.
 *   E. 12 October 2026, wave 13j round loop-1: 'checks-in-merges-only' and 'stale-fork-bases' taken out of
 *      SETTINGS_WHOSE_CHANGES_ARE_KEPT in src/server/api/setting-changes.ts: case 4 goes red. Restored: green.
 *   F. 16 October 2026, wave 13j, the round after 9KKP-yCHFrFK: 'checks-in-merges-only-for' taken out of the same list:
 *      case 4 goes red. Restored: green.
 *   G. 5 November 2026, wave 13y round 137: 'usage-notice-secretary' and 'usage-decision' taken out of the same list:
 *      case 4 goes red. Restored: green.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'nib' }

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

/** Put back the two settings this file changes, so the next case starts from nobody's choice. */
afterEach(() => {
  t.client.sqlite
    .prepare("DELETE FROM changes WHERE record_id IN ('setting:agents-may-inject', 'setting:what-is-kept')")
    .run()
  t.client.sqlite
    .prepare(
      'UPDATE installation SET agents_may_inject = NULL, keep_backups = NULL, untraced_request_days = NULL, ' +
        'traced_request_days = NULL WHERE only_row = 1',
    )
    .run()
})

async function post(url: string, payload: object, headers: Record<string, string> = AS_THE_OWNER): Promise<number> {
  return (await app.inject({ method: 'POST', url, headers, payload })).statusCode
}

function rows(setting: string): { actor_id: string; field: string | null; old_value: string | null; new_value: string | null; at: string }[] {
  return t.client.sqlite
    .prepare('SELECT actor_id, field, old_value, new_value, at FROM changes WHERE record_id = ? ORDER BY rowid')
    .all(`setting:${setting}`) as { actor_id: string; field: string | null; old_value: string | null; new_value: string | null; at: string }[]
}

async function lastChanges(): Promise<Record<string, any>> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_AN_AGENT })
  expect(reply.statusCode, reply.body).toBe(200)
  return (JSON.parse(reply.body) as { settings: Record<string, any> }).settings
}

describe('a changed setting says who changed it', () => {
  it('1: the inject switch is written down, from what was chosen to what is chosen', async () => {
    expect(await post('/api/office/agents-may-inject', { may: true })).toBe(200)
    expect(await post('/api/office/agents-may-inject', { may: false })).toBe(200)
    expect(rows('agents-may-inject').map(({ at: _at, ...rest }) => rest)).toEqual([
      { actor_id: THE_PERSON, field: 'whether agents may inject', old_value: null, new_value: 'true' },
      { actor_id: THE_PERSON, field: 'whether agents may inject', old_value: 'true', new_value: 'false' },
    ])
    const last = (await lastChanges())['agents-may-inject']
    expect(last).toMatchObject({ by: { type: 'human', id: THE_PERSON }, field: 'whether agents may inject', from: 'true', to: 'false' })
    expect(last.at).toBe(rows('agents-may-inject')[1]?.at)
  })

  it('2: a press that changes nothing writes no row', async () => {
    expect(await post('/api/office/agents-may-inject', { may: false })).toBe(200)
    expect(await post('/api/office/agents-may-inject', { may: false })).toBe(200)
    expect(rows('agents-may-inject')).toHaveLength(1)
  })

  it('3: the what-is-kept numbers are written down as the numbers chosen', async () => {
    expect(await post('/api/office/what-is-kept', { keepBackups: 12 })).toBe(200)
    const [row] = rows('what-is-kept')
    expect(row?.actor_id).toBe(THE_PERSON)
    expect(JSON.parse(row?.old_value ?? 'null')).toEqual({ keepBackups: null, untracedRequestDays: null, tracedRequestDays: null })
    expect(JSON.parse(row?.new_value ?? 'null')).toEqual({ keepBackups: 12, untracedRequestDays: null, tracedRequestDays: null })
    expect((await lastChanges())['what-is-kept']).toMatchObject({ by: { id: THE_PERSON } })
  })

  it('4: an agent\'s refused press writes nothing, and a setting nobody changed answers null', async () => {
    expect(await post('/api/office/agents-may-inject', { may: false }, AS_AN_AGENT)).toBe(403)
    expect(await post('/api/office/what-is-kept', { keepBackups: 3 }, AS_AN_AGENT)).toBe(403)
    expect(rows('agents-may-inject')).toEqual([])
    expect(rows('what-is-kept')).toEqual([])
    // THE SECRETARY WHO TAKES THE DEAD LETTERS IS THE FOURTH SETTING WHOSE CHANGES ARE KEPT (problem 0WUuvB0IhRfb).
    // WHO IS REMINDED ABOUT EACH PROJECT'S MODULES IS THE SEVENTH (wave 13p round 29), after the merge queue's owner.
    expect(await lastChanges()).toEqual({
      'agents-may-inject': null,
      'what-is-kept': null,
      'machine-names': null,
      'dead-letter-secretary': null,
      'address-for-browsers': null,
      'merge-queue-owner': null,
      'module-reminder-secretaries': null,
      // WHETHER THE RELATED TESTS RUN FIRST IS THE EIGHTH (round 17c of wave 13v).
      'related-tests-first': null,
      // THE TOPS OF THE OFFICE'S LOAD RANGES ARE THE NINTH, IN WAVE 13Y ROUND 21.
      'office-load-ranges': null,
      // WHICH PLUGINS ARE SWITCHED ON IS THE TENTH (wave 13x round 14).
      'plugin-switches': null,
      // WHETHER A MERGES-ONLY WORKER STARTS CHECKS, AND THE STALE FORK BASES, ARE THE ELEVENTH AND TWELFTH (wave 13j round
      // loop-1).
      'checks-in-merges-only': null,
      'stale-fork-bases': null,
      // WHO IS THE GPU WATCHER IS THE THIRTEENTH (wave 13v round 35b).
      'gpu-watcher': null,
      // HOW MANY CHECKS A MERGES-ONLY WORKER RUNS AT ONCE IS THE FOURTEENTH (wave 13j, the round after X4FMBW2bGWp-).
      'checks-at-once': null,
      // THE PROJECTS A MERGES-ONLY WORKER STARTS CHECKS FOR IS THE FIFTEENTH (wave 13j, the round after 9KKP-yCHFrFK).
      'checks-in-merges-only-for': null,
      // WHO TAKES THE USAGE NOTICES AND WHAT THE ONE AT 80% SAYS TO DO ARE THE SIXTEENTH AND SEVENTEENTH (wave 13y round
      // 137).
      'usage-notice-secretary': null,
      'usage-decision': null,
    })
  })
})
