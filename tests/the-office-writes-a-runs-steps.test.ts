// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE WRITES A RUN'S STEPS ON ITS FLOW RUN AS THEY HAPPEN, AND NOTHING ABOUT IT IS A GATE. Wave 1 of the office
 * flow, M1 (report 4IoRUKizcZXb, section 4): record first, no gates. Wave 13p
 * round 25.
 *
 * WHAT IS MEASURED, in a test world. Every record here is synthetic:
 *
 *   · each event the office already sees on a run becomes one step, with its actor, its start and its end: the seal
 *     at the finish, the release through the real verdict door, a refusal, the confirmation, a close unchecked (by
 *     hand, with its because as the why), a landing by hand (by hand, with its because), and the run's end;
 *   · a run that crashed ends with the outcome `failed`;
 *   · A CHECK WHOSE ANSWER THE VERDICT DOOR REFUSED is a step whose outcome is "refused by the verdict door", never
 *     "failed"; the refusal is answered with its own status and words, and says the office recorded it;
 *   · NO GATE: a run's own writes are answered exactly as they would be without flow runs. With a trigger in the test
 *     database that aborts every change to a flow run, a run is still finished (200), its seal still written, and
 *     an open problem about the run says the step was not written. A run's steps are never required, and no order
 *     is checked: a run released before it was ever sealed is released as before. A run moved to another project
 *     is moved, and its flow run goes with it.
 *   · A FLOW RUN IS WRITTEN ONLY BY THE OFFICE: POST /api/records of a flow_run, and a PATCH of one, are refused
 *     (403) and write nothing. This is the one refusal flow runs add, and it refuses only a forged copy of the
 *     office's own record.
 *
 * MUTATIONS (wave 13p round 25), each run once and put back:
 *   1. In `stepsOfAChange` (src/server/lib/flow-runs.ts), drop the closedUnchecked event. The steps case goes red.
 *   2. In POST /checks/:run (src/server/api/inspection.ts), record the refusal with outcome `failed`. The verdict case
 *      goes red.
 *   3. In `appendSteps`, take out the savepoint and the catch. The no-gate case goes red: the finish is refused.
 *   4. In `assertMayWrite` (src/server/lib/records.ts), drop the FLOW_RUN_KIND guard. The forgery case goes red.
 *   5. In the same guard, take out `verb !== 'move'`. The move case goes red: the run's own move is refused (403).
 *
 * ROUND 26d: a landing by hand read with no reason gets the office's own why, OFFICE_STEP_LANDED_NO_REASON from
 * src/shared/flow-run.ts, a fixed form the flow run's page says in the reader's language. The shape and the door both
 * refuse a landing with no reason, so this is asked of `stepsOfAChange` directly.
 *   6. In `stepsOfAChange`, write the because as it came, with no fixed why. The no-reason case goes red.
 *
 * ROUND 27, PIECE 1b: the verdict door's refusal is stored as a fixed form with its status, and its own English words
 * with the status beside it in `refusal`.
 *   7. In `recordAVerdictRefused`, write the door's words as the result, as before. The verdict case goes red.
 *
 * ROUND 27, PIECE 4 (the flow's unrecorded cases):
 *   · a run closed as superseded gets a step, read from either place the superseded door writes the mark;
 *   · a record changed into a session gets its flow run, and the PATCH answer names it;
 *   · steps the office could not write are named in the answer to the PATCH that made the change.
 *   8. In `stepsOfAChange`, drop the superseded event. The superseded case goes red.
 *   9. In `patchRecord` (src/server/lib/records.ts), always take the append branch, never filing a flow run on a kind
 *      change. The kind-change case goes red.
 *  10. In `recordTheStepsOfAChange`, return null whatever the append came to. The no-gate case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb, writeAVerdictAsItsDoorWould } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_FLOW_RUN_IS_WRITTEN_BY_THE_OFFICE, OFFICE_STEP_DOES, OFFICE_STEP_LANDED_NO_REASON, OFFICE_STEP_SUPERSEDED_BY, OFFICE_STEP_VERDICT_REFUSED_STATUS, theVerdictDoorRecordedIt } from '../src/shared/flow-run.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const THE_OFFICE = { type: 'agent' as const, id: 'mole-office/the-api-server' }
const A_RELEASE = { verdict: 'released', check: 'Read the brief and the changes; nothing is missing.', chaptersRead: [] }

// A FOLDER THIS FILE MAKES: a git repository the runs work in, so the office seals real git work. A home inside it,
// so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'the-office-writes-a-runs-steps-'))
const work = join(made, 'work')
function git(...args: string[]): void {
  execFileSync('git', ['-C', work, ...args], { env: { ...process.env, HOME: join(made, 'home') } })
}

type Step = { does: string; actor?: { kind: string; id: string }; startedAt: string; endedAt?: string; how: string; why?: string; outcome: string; result?: string; refusal?: unknown }

function stepsOf(run: string): Step[] {
  const row = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { data: string } | undefined
  expect(row, `the flow run of ${run}`).toBeDefined()
  return (JSON.parse(row!.data) as { stepsTaken: Step[] }).stepsTaken
}

async function aRun(handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title: `A synthetic run of ${handle}`, data: { state: 'running', servingAgent: handle, workingDirectory: work, doing: 'synthetic work' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function finish(run: string, handle: string, state = 'finished'): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(handle), payload: { dataPatch: { state } } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

beforeAll(async () => {
  mkdirSync(join(made, 'home'), { recursive: true })
  mkdirSync(join(work, 'src'), { recursive: true })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic steps fixture')
  writeFileSync(join(work, 'src', 'a.txt'), 'a synthetic file\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [headers, payload] of [
    [AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: 'secretary' }],
    [AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' }],
    [asAgent('quill'), { handle: 'step-worker', name: 'Step worker', role: 'worker', workArea: ['src'] }],
  ] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
    expect(reply.statusCode, reply.body).toBe(201)
  }
})

afterAll(async () => {
  await app?.close()
  t?.close()
  rmSync(made, { recursive: true, force: true })
})

describe("the office writes each event of a run as a step of the run's flow run", () => {
  // THE RELEASE AND THE CONFIRMATION ARE WRITTEN AS THEIR DOORS WRITE THEM (writeAVerdictAsItsDoorWould): the step is
  // read from the field, whichever door wrote it. The real verdict door is asked in the refusal case below.
  it('the seal, the release, the confirmation and the end, each with actor, start and end', async () => {
    const run = await aRun('step-worker')
    await finish(run, 'step-worker')
    writeAVerdictAsItsDoorWould(t, run, { released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-10-04 20:50:00', how: 'an inspector', check: 'Synthetic: nothing is missing.' } })
    writeAVerdictAsItsDoorWould(t, run, { confirmed: { by: { kind: 'agent', id: 'quill' }, at: '2026-10-04 21:00:00', because: 'The synthetic report is sound.' } })

    const steps = stepsOf(run)
    expect(steps.map((step) => step.does)).toEqual([
      OFFICE_STEP_DOES.started,
      OFFICE_STEP_DOES.sealed,
      OFFICE_STEP_DOES.ended,
      OFFICE_STEP_DOES.released,
      OFFICE_STEP_DOES.confirmed,
    ])
    for (const step of steps) {
      expect(step.startedAt, step.does).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/)
      expect(step.endedAt, step.does).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/)
      expect(step.outcome, step.does).toBe('done')
    }
    expect(steps[1]).toMatchObject({ how: 'by the office', result: expect.stringContaining('sealed tip ') })
    expect(steps[3]).toMatchObject({ how: 'by an agent', startedAt: '2026-10-04 20:50:00', actor: { kind: 'agent' } })
    expect(steps[4]).toMatchObject({ how: 'by an agent', startedAt: '2026-10-04 21:00:00', actor: { kind: 'agent' } })
  })

  it('a refusal, a close unchecked and a landing by hand, the last two by hand with their because as the why', async () => {
    const run = await aRun('step-worker')
    await finish(run, 'step-worker')
    writeAVerdictAsItsDoorWould(t, run, { refused: { by: { kind: 'agent', id: 'quill' }, at: '2026-10-04 21:10:00', missing: ['Synthetic: a criterion is missing.'] } })
    t.doors.asTheDoorOf('closedUnchecked', () =>
      t.api.patchRecord(run, { dataPatch: { closedUnchecked: { by: { kind: 'person', id: THE_PERSON }, at: '2026-10-04 21:20:00', because: 'Synthetic: nobody will check this one.' } } }, THE_OFFICE),
    )
    t.doors.asTheDoorOf('landedByHand', () =>
      t.api.patchRecord(
        run,
        {
          dataPatch: {
            theCheck: {
              landedByHand: {
                commit: 'a'.repeat(40),
                lane: work,
                by: { kind: 'agent', id: 'quill' },
                at: '2026-10-04 21:30:00',
                because: 'Synthetic: the queue could not land it.',
                contains: { how: 'same patches', laterCommit: 'a'.repeat(40), commits: [{ commit: 'b'.repeat(40), as: 'a'.repeat(40) }] },
              },
            },
          },
        },
        THE_OFFICE,
      ),
    )
    const steps = stepsOf(run).slice(3)
    expect(steps.map((step) => step.does)).toEqual([OFFICE_STEP_DOES.refused, OFFICE_STEP_DOES.closedUnchecked, OFFICE_STEP_DOES.landedByHand])
    expect(steps[0]).toMatchObject({ startedAt: '2026-10-04 21:10:00', outcome: 'done' })
    expect(steps[1]).toMatchObject({ how: 'by hand', why: 'Synthetic: nobody will check this one.', actor: { kind: 'person', id: THE_PERSON }, startedAt: '2026-10-04 21:20:00' })
    expect(steps[2]).toMatchObject({ how: 'by hand', why: 'Synthetic: the queue could not land it.', result: `commit ${'a'.repeat(40)}`, startedAt: '2026-10-04 21:30:00' })
  })

  // THE SHAPE REFUSES A LANDING WITH NO REASON (because is required and may not be blank), and so does its door, so no
  // stored write reaches the office's own why today. It is asked of the step builder directly, after the test world is
  // up, with the landing as it would be read.
  it('a landing by hand read with no reason gets the fixed why the page says in the reader\'s language', async () => {
    const { stepsOfAChange } = await import('../src/server/lib/flow-runs.ts')
    const landing = (because: string) => ({
      theCheck: {
        landedByHand: {
          commit: 'c'.repeat(40),
          lane: work,
          by: { kind: 'agent', id: 'quill' },
          at: '2026-10-04 21:40:00',
          because,
          contains: { how: 'same patches', laterCommit: 'c'.repeat(40), commits: [{ commit: 'd'.repeat(40), as: 'c'.repeat(40) }] },
        },
      },
    })
    for (const because of ['', '   ']) {
      const steps = stepsOfAChange({}, landing(because), THE_OFFICE, '2026-10-04 21:40:00')
      expect(steps, JSON.stringify(because)).toEqual([expect.objectContaining({ does: OFFICE_STEP_DOES.landedByHand, how: 'by hand', why: OFFICE_STEP_LANDED_NO_REASON })])
    }
    expect(stepsOfAChange({}, landing('Synthetic: the queue was down.'), THE_OFFICE, '2026-10-04 21:40:00')[0]).toMatchObject({ why: 'Synthetic: the queue was down.' })
  })

  // THE SUPERSEDED DOOR NEEDS A LATER RUN RELEASED AND CONFIRMED ON THE SAME BRANCH; its own tests build that. This asks
  // the step builder with the mark as the door writes it, in each of its two places (`theSupersededOn`).
  it('a run closed as superseded gets a step, from the mark on its check or on itself, with the later run as its result', async () => {
    const { stepsOfAChange } = await import('../src/server/lib/flow-runs.ts')
    const mark = (byWhom: { kind: 'agent' | 'person'; id: string }) => ({ by: 'synthetic-later', at: '2026-10-05 20:10:00', byWhom, because: 'Synthetic: a later round did the work.' })
    const byAgent = mark({ kind: 'agent', id: 'quill' })
    for (const after of [{ theCheck: { askedAt: '2026-10-05 19:00:00', superseded: byAgent } }, { superseded: byAgent }]) {
      expect(stepsOfAChange({}, after, THE_OFFICE, '2026-10-05 20:10:00'), JSON.stringify(after)).toEqual([
        expect.objectContaining({ does: OFFICE_STEP_DOES.superseded, actor: { kind: 'agent', id: 'quill' }, endedAt: '2026-10-05 20:10:00', outcome: 'done', result: `${OFFICE_STEP_SUPERSEDED_BY}synthetic-later` }),
      ])
      // THE SAME MARK AGAIN IS NO NEW STEP.
      expect(stepsOfAChange(after, after, THE_OFFICE, '2026-10-05 20:11:00')).toEqual([])
    }
    // A PERSON'S CLOSE IS BY HAND, AND ITS WHY IS THEIR BECAUSE.
    const byThePerson = stepsOfAChange({}, { superseded: mark({ kind: 'person', id: 'synthetic-person' }) }, THE_OFFICE, '2026-10-05 20:10:00')
    expect(byThePerson[0]).toMatchObject({ how: 'by hand', why: 'Synthetic: a later round did the work.' })
  })

  it('a record changed into a session gets its flow run, and the answer to the change names it', async () => {
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'note', title: 'A synthetic note that becomes a run', data: {} } })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_THE_PERSON,
      payload: { kind: 'session' },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    const flowRun = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(id) as { id: string } | undefined
    expect(flowRun, 'no flow run was filed for a record changed into a session').toBeDefined()
    expect((changed.json() as { flowRun?: unknown }).flowRun).toEqual({ written: true, id: flowRun!.id })
    expect(stepsOf(id).map((step) => step.does)).toEqual([OFFICE_STEP_DOES.started])
  })

  it('a run that crashed ends with the outcome failed', async () => {
    const run = await aRun('step-worker')
    await finish(run, 'step-worker', 'crashed')
    expect(stepsOf(run).at(-1)).toMatchObject({ does: OFFICE_STEP_DOES.ended, outcome: 'failed', result: 'The run crashed.' })
  })
})

describe('a check whose answer the verdict door refused', () => {
  it('is a step of its own, "refused by the verdict door", and the refusal is answered in the words of the door, with what was recorded beside them', async () => {
    const run = await aRun('step-worker')
    // THE RUN IS STILL RUNNING, so the door refuses any answer about it.
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'), payload: A_RELEASE })
    expect(reply.statusCode, reply.body).toBeGreaterThanOrEqual(400)
    expect(reply.statusCode, reply.body).toBeLessThan(500)
    expect(reply.statusCode).not.toBe(404)
    const answer = reply.json() as { error: unknown; recorded?: unknown }
    const error = String(answer.error)
    const step = stepsOf(run).at(-1)!
    expect(step).toMatchObject({ does: OFFICE_STEP_DOES.verdictRefused, outcome: 'refused by the verdict door', actor: { kind: 'agent' }, how: 'by an agent' })
    const flowRun = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string }).id
    // THE DOOR'S OWN WORDS STAY WHOLE in `error`, so a tool that reads them reads what the door said; the one thing
    // the refusal did write is said beside them, in `recorded`.
    // THE STEP'S RESULT IS A FIXED FORM WITH THE DOOR'S STATUS (round 27, piece 1b), so the page says it in the reader's
    // language; the door's own English words are kept whole beside it, with its status, for Developer mode.
    expect(step.result).toBe(`${OFFICE_STEP_VERDICT_REFUSED_STATUS}${reply.statusCode}`)
    expect(step.refusal).toEqual({ said: error, status: reply.statusCode })
    expect(answer.recorded).toBe(theVerdictDoorRecordedIt(flowRun))
    expect(t.api.getRecord(run)!.data['released']).toBeUndefined()
  })
})

describe('no gate', () => {
  it('a run whose flow run cannot be changed still finishes and is sealed, and a problem says the step was not written', async () => {
    const run = await aRun('step-worker')
    t.client.sqlite.exec("CREATE TRIGGER no_flow_run_change BEFORE UPDATE ON records WHEN NEW.kind = 'flow_run' BEGIN SELECT RAISE(ABORT, 'a synthetic refusal of this test'); END")
    let answer: Record<string, unknown>
    try {
      answer = await finish(run, 'step-worker')
    } finally {
      t.client.sqlite.exec('DROP TRIGGER no_flow_run_change')
    }
    const data = t.api.getRecord(run)!.data
    expect(data['state']).toBe('finished')
    expect(data['sealedTip']).toEqual(expect.any(String))
    expect(stepsOf(run).map((step) => step.does)).toEqual([OFFICE_STEP_DOES.started])
    const problems = t.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'problem' AND json_extract(data, '$.state') = 'open'")
      .all()
      .map((row) => row as { id: string; data: string })
      .filter((one) => one.data.includes(run) && one.data.includes('a synthetic refusal of this test'))
    expect(problems).toHaveLength(1)
    // THE ANSWER TO THE CHANGE NAMES THE STEPS THAT WERE NOT WRITTEN, why, and the problem filed about them (round 27).
    const flowRun = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string }).id
    expect(answer!['flowRunStepsNotWritten']).toEqual({
      flowRun,
      steps: [OFFICE_STEP_DOES.sealed, OFFICE_STEP_DOES.ended],
      because: expect.stringContaining('a synthetic refusal of this test'),
      problem: problems[0]!.id,
    })
  })

  it('no step is required and no order is checked: a run released before it was ever sealed is released as before', () => {
    const run = t.api.createRecord({ kind: 'session', title: 'A synthetic run released unsealed', workspaceId: WORKSPACE, actor: THE_OFFICE, data: { state: 'running', servingAgent: 'step-worker' } })
    writeAVerdictAsItsDoorWould(t, run.id, { released: { by: { kind: 'agent', id: 'inspector-one' }, at: '2026-10-04 22:00:00', how: 'an inspector', check: 'Synthetic.' } })
    expect(t.api.getRecord(run.id)!.data['released']).toBeDefined()
    expect(stepsOf(run.id).map((step) => step.does)).toEqual([OFFICE_STEP_DOES.started, OFFICE_STEP_DOES.released])
  })

  it('a run moved to another project is moved, and carries its flow run with it', async () => {
    const run = await aRun('step-worker')
    const project = await app.inject({ method: 'POST', url: '/api/workspaces', headers: AS_THE_PERSON, payload: { id: 'synthetic-elsewhere', title: 'A synthetic other project' } })
    expect([201, 409], project.body).toContain(project.statusCode)
    const moved = await app.inject({ method: 'POST', url: `/api/records/${run}/workspace`, headers: AS_THE_PERSON, payload: { to: 'synthetic-elsewhere' } })
    expect(moved.statusCode, moved.body).toBe(200)
    const where = (id: string): unknown => (t.client.sqlite.prepare('SELECT workspace_id AS w FROM records WHERE id = ?').get(id) as { w: string }).w
    const flowRun = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string }
    expect(where(run)).toBe('synthetic-elsewhere')
    expect(where(flowRun.id)).toBe('synthetic-elsewhere')
  })
})

describe('a flow run is written only by the office', () => {
  it('refuses a flow run filed or changed through the records door, and writes nothing', async () => {
    const run = await aRun('step-worker')
    const before = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'flow_run'").get() as { n: number }
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('quill'),
      payload: { kind: 'flow_run', title: 'A forged flow run', data: { run, noFlow: 'This run named no flow.', stepsTaken: [] } },
    })
    expect(filed.statusCode, filed.body).toBe(403)
    expect(String((filed.json() as { error: unknown }).error)).toContain(A_FLOW_RUN_IS_WRITTEN_BY_THE_OFFICE)
    expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'flow_run'").get()).toEqual(before)

    const held = t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string; data: string }
    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${held.id}`, headers: AS_THE_PERSON, payload: { dataPatch: { stepsTaken: [] } } })
    expect(changed.statusCode, changed.body).toBe(403)
    expect((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(held.id) as { data: string }).data).toBe(held.data)
  })
})
