// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN IS MARKED AS METHOD WORK, OR AS GO, BY WHOEVER ANSWERS FOR IT, ONCE, AND ONLY THROUGH ITS DOOR. Part 6 of the
 * design-first build of wave 13s's requirements. hL0xQI9EfpCO answer 4 says the assigning agent marks method work in
 * the run's own record with its reason, and that an office run is told by the office's own classification. The
 * supervisor's decision vinDV1XnZ2dG, points 1 and 2, says where: the run's field `methodWork`, written only by POST
 * /api/runs/<run>/method-work, by the person or by the agent that started the agent the run serves, never by the run's
 * own agent, once; and a run the office started (`startedByMoleOffice`) is refused.
 *
 * The door is in src/server/api/project-rules.ts, its rules in src/server/lib/design-reminders.ts, and the guard that
 * keeps the general record doors off the field is `TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS` in
 * src/server/lib/check-field-doors.ts, read by src/server/lib/records.ts.
 *
 * WHAT IS REAL: the made-up world of tests/a-world-of-method-runs.ts, in a scratch office. Nothing here is real work.
 *
 * THE CASES, in order, on one world:
 *   1. the assigner marks a run as method work with its reason: the run's record holds the work, the reason, the
 *      assigner and when, and the record's history names the assigner;
 *   2. a second mark of the same run is refused with 409, by the assigner and by the person, and the mark stays;
 *   3. the run's own agent, with the run's own key, a bystander with its own key, and the assigner's name with no key
 *      are each refused, and nothing is marked;
 *   4. the person marks another run as go;
 *   5. a run the office started is refused with 409, even to the person;
 *   6. a work that is not method-work or go, no reason, and an id that is not a run are refused, and nothing is marked;
 *   7. the general record doors never write the field: a run filed carrying it, a patch naming it, and a whole data that
 *      changes it are each refused with 403 naming the door, even to the person, and a whole data that sends the stored
 *      mark back unchanged is written.
 *
 * RED BEFORE THE CODE, 8 November 2026, at 17adf3aef (since remade with its author set, as e6a155c12, the same tree),
 * with this file and tests/a-world-of-method-runs.ts in the worktree and the code not yet written: cases 1 to 7 red.
 * Cases 1 to 6 found no such door (404), and case 7 found no door named for the field.
 * MUTATION PROOF, 8 November 2026, after a control run of 7 green. Each mutation alone, then restored:
 * - any agent with its own key taken as the starter of the run's agent: case 3 red.
 * - a second mark not refused: case 2 red.
 * - a run the office started not refused: case 5 red.
 * - the mark's reason stored empty: cases 1, 2, 4 and 7 red.
 * - methodWork taken off the run fields only their doors write (src/server/lib/check-field-doors.ts): case 7 red.
 * - the door's mark body no longer strict, so a `by` sent with it is dropped and the mark written: case 6 red.
 * - the door's refusal of an id that is not a run removed: GREEN. The design kind's own field check then refuses the
 *   unknown field methodWork with 400, so nothing is written. Case 6 still holds, by that second check.
 * - the door taking any string as the work: GREEN. The session kind's own field check then refuses a work that is not
 *   method-work or go with 400. Case 6 still holds, by that second check.
 * The two green ones were read by printing the refusal in case 6, on 8 November at 22:45 and 22:48, then restored.
 * WHAT THIS FILE DOES NOT CATCH YET: which of the two checks refuses a work off the list, or an id that is not a run.
 * Each holds alone, so removing one is not seen.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theOfficesKeyHeader } from './helpers.ts'
import { aWorldOfMethodRuns, type ARun, type AWorldOfMethodRuns } from './a-world-of-method-runs.ts'

let w: AWorldOfMethodRuns
let marked: ARun

const theMarkOf = (run: string): unknown => w.t.api.getRecord(run)!.data['methodWork']

beforeAll(async () => {
  w = await aWorldOfMethodRuns()
  marked = await w.aRun()
}, 60_000)

afterAll(async () => {
  await w?.close()
})

describe('the method mark door', () => {
  it('1. the assigner marks a run as method work with its reason', async () => {
    const done = await w.mark(marked.id, w.assigner.headers, { work: 'method-work', because: 'Made-up: the run builds the grasp method.' })
    expect(done.status, done.raw).toBe(200)
    const mark = theMarkOf(marked.id) as Record<string, unknown>
    expect(mark).toEqual({ work: 'method-work', because: 'Made-up: the run builds the grasp method.', by: { kind: 'agent', id: w.assigner.id }, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) })
    expect(done.body.methodWork).toEqual(mark)
    const history = await w.call('GET', `/api/records/${marked.id}/revisions`, w.person)
    expect(history.status, history.raw).toBe(200)
    expect(history.raw, 'the record of the mark does not name who marked it').toContain(w.assigner.id)
  })

  it('2. a second mark of the same run is refused, and the mark stays', async () => {
    const before = theMarkOf(marked.id)
    for (const who of [w.assigner.headers, w.person]) {
      const again = await w.mark(marked.id, who, { work: 'go', because: 'Made-up: a second mark.' })
      expect(again.status, again.raw).toBe(409)
      expect(theMarkOf(marked.id)).toEqual(before)
    }
  })

  it("3. the run's own agent, a bystander and a name with no key are refused", async () => {
    const run = await w.aRun()
    const noKey = { ...w.assigner.headers }
    delete noKey['x-mole-office-key']
    for (const [who, headers] of [
      ["the run's own agent", run.headers],
      ['a bystander', w.bystander.headers],
      ['a name with no key', noKey],
    ] as const) {
      const refused = await w.mark(run.id, headers)
      expect([401, 403], `${who}: ${refused.raw}`).toContain(refused.status)
      expect(theMarkOf(run.id), who).toBeUndefined()
    }
  })

  it('4. the person marks a run as go', async () => {
    const run = await w.aRun()
    const done = await w.mark(run.id, w.person, { work: 'go', because: 'Made-up: the pilot is ready.' })
    expect(done.status, done.raw).toBe(200)
    expect(theMarkOf(run.id)).toMatchObject({ work: 'go', because: 'Made-up: the pilot is ready.', by: { kind: 'person' } })
  })

  it('5. a run the office started is refused, even to the person', async () => {
    const filed = await w.call('POST', '/api/records', { ...w.person, ...theOfficesKeyHeader(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }, {
      kind: 'session',
      title: 'Made-up run the office started',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: w.worker.handle, doing: 'Made-up office work.' },
    })
    expect(filed.status, filed.raw).toBe(201)
    const id = String(filed.body.record.id)
    for (const who of [w.person, w.assigner.headers]) {
      const refused = await w.mark(id, who)
      expect(refused.status, refused.raw).toBe(409)
      expect(theMarkOf(id)).toBeUndefined()
    }
  })

  it('6. a work off the list, no reason, and an id that is not a run are refused', async () => {
    const run = await w.aRun()
    for (const body of [
      { work: 'research', because: 'Made-up.' },
      { work: 'method-work' },
      { work: 'method-work', because: '   ' },
      { work: 'method-work', because: 'Made-up.', by: { kind: 'agent', id: w.bystander.id } },
    ]) {
      const refused = await w.mark(run.id, w.assigner.headers, body)
      expect(refused.status, `${JSON.stringify(body)}: ${refused.raw}`).toBe(400)
      expect(theMarkOf(run.id)).toBeUndefined()
    }
    const design = await w.aDesign()
    const notARun = await w.mark(design, w.person)
    expect(notARun.status, notARun.raw).toBe(400)
  })

  it('7. the general record doors never write the field', async () => {
    const { THE_DOOR_OF } = await import('../src/server/lib/check-field-doors.ts')
    const door = (THE_DOOR_OF as Record<string, string>)['methodWork']
    expect(door, 'the field names no door of its own').toBe('POST /api/runs/<run>/method-work')
    const aMark = { work: 'method-work', because: 'Made-up.', by: { kind: 'person', id: w.person['x-mole-office-actor-id'] }, at: '2026-11-08 10:00:00' }

    const filed = await w.call('POST', '/api/records', w.assigner.headers, {
      kind: 'session',
      title: 'Made-up run filed already marked',
      data: { state: 'running', runtime: 'claude-code', servingAgent: w.worker.handle, doing: 'Made-up.', methodWork: aMark },
    })
    expect(filed.status, filed.raw).toBe(403)
    expect(filed.body.error).toContain(door)

    const run = await w.aRun()
    for (const who of [w.person, run.headers]) {
      const patched = await w.call('PATCH', `/api/records/${run.id}`, who, { dataPatch: { methodWork: aMark } })
      expect(patched.status, patched.raw).toBe(403)
      expect(patched.body.error).toContain(door)
      expect(theMarkOf(run.id)).toBeUndefined()
    }
    const whole = await w.call('PATCH', `/api/records/${run.id}`, w.person, { data: { ...w.t.api.getRecord(run.id)!.data, methodWork: aMark } })
    expect(whole.status, whole.raw).toBe(403)
    expect(theMarkOf(run.id)).toBeUndefined()

    const before = theMarkOf(marked.id)
    const changed = await w.call('PATCH', `/api/records/${marked.id}`, w.person, { data: { ...w.t.api.getRecord(marked.id)!.data, methodWork: { ...(before as object), because: 'Made-up: changed.' } } })
    expect(changed.status, changed.raw).toBe(403)
    expect(theMarkOf(marked.id)).toEqual(before)
    const dropped = { ...w.t.api.getRecord(marked.id)!.data }
    delete dropped['methodWork']
    const drop = await w.call('PATCH', `/api/records/${marked.id}`, w.person, { data: dropped })
    expect(drop.status, drop.raw).toBe(403)
    expect(theMarkOf(marked.id)).toEqual(before)
    const same = await w.call('PATCH', `/api/records/${marked.id}`, w.person, { data: { ...w.t.api.getRecord(marked.id)!.data, doing: 'Made-up: the same mark sent back.' } })
    expect(same.status, same.raw).toBe(200)
    expect(theMarkOf(marked.id)).toEqual(before)
  })
})
