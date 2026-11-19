// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNTER'S TASK, A RUN'S FLOW RUN AND THE OFFICE'S TWO PROBLEMS READ NO TITLE, AND THE RECORD DOOR STILL NAMES
 * CLOSE TITLES. Wave 13u round 40.
 *
 * A write through `createRecordWithReport` (src/server/lib/records.ts) makes two lists unless its caller says not to:
 * the records already called what the new one is called, and the records whose titles are close to its title. The
 * second reads the id, kind and title of every live record of the project (`nearDuplicateTitles`). Four more writes
 * keep only the record they wrote, so these ask for neither list:
 *   - a counter's task, written by `runTheAction` (src/server/lib/counters.ts). Two doors reach it, and so does the
 *     counters' tick, which is not changed;
 *   - a run's flow run, written by `fileTheFlowRunOf` (src/server/lib/flow-runs.ts) for every session filed. Every flow
 *     run has the same title, so the first list was every flow run of the project;
 *   - the problem that says a flow run or a step of one was not written (`fileTheProblem`, same file);
 *   - the problem that says how a round ended was not recorded (`recordHowARoundEndedWithoutASeal`,
 *     src/server/lib/how-a-round-ended.ts).
 * The last two are written only after another write has failed. Here a trigger in this file's throwaway office makes
 * that write fail.
 *
 * Every id, handle and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. THE RECORD DOOR'S ANSWER TO A SESSION STILL NAMES BOTH LISTS, and its flow run is written. The statement that
 *      reads every title ran once, for the session, and not again for its flow run. This is also the guard for the
 *      cases after it: they count the same statement by its text, and if drizzle wrote that text differently they
 *      would count nothing whatever the code did. This case would fail first.
 *   2. A run opened through POST /api/attachments gets its one flow run, and the statement does not run.
 *   3. A flow run that cannot be written: the run is filed, an open problem about it is filed, and the statement does
 *      not run, for the flow run or for the problem.
 *   4. An addition that fires a counter whose action is a task: the task is filed with the title asked for and linked
 *      to the counter, the answer has the keys it had before this round, and the statement does not run. A note
 *      already called what the task is called, and a note with a close title, are filed first, so neither list would
 *      be empty.
 *   5. A sandbox round that ends without a seal, when the account of how it ended cannot be written: the run's end
 *      stands, an open problem about the run says why, and the statement does not run.
 *
 * THE LIMITS.
 *   · The counter's answer is compared with the keys it had before this round, written out below, and not with an
 *     answer from the code before this round.
 *   · The counters' tick is not run here. It reaches the same write as the door in case 4.
 *
 * WHAT TURNS EACH RED, each tried in wave 13u round 40, after a control run that was red on the counts alone:
 *   · cases 1, 2 and 3: take `namesWhatIsAlreadyFiled: false` out of `fileTheFlowRunOf` in src/server/lib/flow-runs.ts;
 *   · case 3: take it out of `fileTheProblem`, same file;
 *   · case 4: take it out of `runTheAction` in src/server/lib/counters.ts;
 *   · case 5: take it out of `recordHowARoundEndedWithoutASeal` in src/server/lib/how-a-round-ended.ts;
 *   · case 1: let `createRecordWithReport` make no list of close titles for a session.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_OFFICE = { type: 'agent' as const, id: 'mole-office/the-api-server' }
const A_SYNTHETIC_REFUSAL = 'a synthetic refusal of this test'
/** The statement of `nearDuplicateTitles`, as drizzle writes it. */
const EVERY_TITLE = 'select "id", "kind", "title" from "records" where ("records"."workspace_id" = ? and "records"."deleted_at" is null and "records"."kind" <> ?)'

const made = mkdtempSync(join(tmpdir(), 'a-task-and-a-flow-run-read-no-title-list-'))
let t: TestDb
let app: FastifyInstance
/** How many times the statement over every title ran, and how many rows it gave back. */
let everyTitle = { runs: 0, rows: 0 }

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    if (text !== EVERY_TITLE) return statement
    const all = statement['all'] as (...args: unknown[]) => unknown[]
    statement['all'] = function (this: unknown, ...args: unknown[]) {
      const rows = all.apply(this, args)
      everyTitle = { runs: everyTitle.runs + 1, rows: everyTitle.rows + rows.length }
      return rows
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  rmSync(made, { recursive: true, force: true })
})

/** A note called `title` and a note whose title is close to it, so that neither list would be empty. */
function alreadyFiled(title: string): { same: string; close: string } {
  const note = (called: string): string =>
    t.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: called, data: { body: 'Made up for this file.' }, actor: t.api.HUMAN }).id
  const filed = { same: note(title), close: note(`${title}s`) }
  // NOT AN EMPTY LIST: both notes are among the close titles before the write.
  expect(t.api.nearDuplicateTitles(title, PROJECT).map((one) => one.id).sort(), `the close titles of "${title}"`).toEqual([filed.same, filed.close].sort())
  return filed
}

/** What `act` answers, with the runs of the statement over every title counted while it ran. */
async function counted<T>(act: () => T | Promise<T>): Promise<{ answer: T; runs: number; rows: number }> {
  everyTitle = { runs: 0, rows: 0 }
  const answer = await act()
  return { answer, ...everyTitle }
}

/** A trigger that refuses a write in this file's throwaway office while `act` runs, and is dropped after. */
async function refusing<T>(name: string, when: string, act: () => Promise<T>): Promise<T> {
  t.client.sqlite.exec(`CREATE TRIGGER ${name} ${when} BEGIN SELECT RAISE(ABORT, '${A_SYNTHETIC_REFUSAL}'); END`)
  try {
    return await act()
  } finally {
    t.client.sqlite.exec(`DROP TRIGGER ${name}`)
  }
}

const liveRecords = (): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE workspace_id = ? AND deleted_at IS NULL').get(PROJECT) as { n: number }).n
const titleOf = (id: string): { kind: string; title: string } =>
  t.client.sqlite.prepare('SELECT kind, title FROM records WHERE id = ?').get(id) as { kind: string; title: string }
const flowRunsOf = (run: string): number =>
  (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'flow_run' AND deleted_at IS NULL AND json_extract(data, '$.run') = ?").get(run) as { n: number }).n
/** The problems linked about a record, with their titles and what they say. */
const problemsAbout = (id: string): { title: string; state: string; symptom: string }[] =>
  t.client.sqlite
    .prepare(
      "SELECT r.title AS title, json_extract(r.data, '$.state') AS state, json_extract(r.data, '$.symptom') AS symptom FROM records r " +
        "JOIN links l ON l.from_id = r.id AND l.type = 'about' WHERE l.to_id = ? AND r.kind = 'problem' AND r.deleted_at IS NULL",
    )
    .all(id) as { title: string; state: string; symptom: string }[]

describe('the lists of titles already filed', () => {
  it("1. the record door's answer to a session still names the close titles, and its flow run reads none", async () => {
    const title = 'The made-up glazing run of the spring kiln'
    const filed = alreadyFiled(title)
    const records = liveRecords()
    const sent = await counted(() =>
      app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'session', title, data: { state: 'running' } } }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(201)
    const reply = JSON.parse(sent.answer.body) as { record: { id: string }; similar?: { id: string }[]; sameTitle?: { id: string }[]; flowRun?: { written: boolean } }
    expect(reply.similar?.map((one) => one.id).sort(), 'the close titles in the answer').toEqual([filed.same, filed.close].sort())
    expect(reply.sameTitle?.map((one) => one.id), 'the records called the same').toEqual([filed.same])
    expect(reply.flowRun?.written).toBe(true)
    expect(flowRunsOf(reply.record.id)).toBe(1)
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 1, rows: records })
  })

  it('2. a run opened through the attachment door gets its one flow run, and reads no title', async () => {
    const sent = await counted(() =>
      app.inject({ method: 'POST', url: '/api/attachments', headers: AS_THE_PERSON, payload: { title: 'A made-up run at the spring kiln' } }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(200)
    const run = (JSON.parse(sent.answer.body) as { attachment: { id: string } }).attachment.id
    expect(titleOf(run)).toEqual({ kind: 'session', title: 'A made-up run at the spring kiln' })
    expect(flowRunsOf(run)).toBe(1)
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })

  it('3. a flow run that cannot be written: the run stands, an open problem says so, and neither write reads a title', async () => {
    const sent = await refusing('no_flow_run', "BEFORE INSERT ON records WHEN NEW.kind = 'flow_run'", () =>
      counted(() =>
        t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A made-up run whose flow run is refused', data: { state: 'running' }, actor: THE_OFFICE }),
      ),
    )
    const run = sent.answer.id
    expect(titleOf(run).kind).toBe('session')
    expect(flowRunsOf(run)).toBe(0)
    const problems = problemsAbout(run)
    expect(problems.map((one) => ({ title: one.title, state: one.state }))).toEqual([{ title: `No flow run was written for run ${run}`, state: 'open' }])
    expect(problems[0]!.symptom).toContain(A_SYNTHETIC_REFUSAL)
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })

  it("4. an addition that fires a counter's task reads no title, and the answer is as it was", async () => {
    const task = 'A made-up look at the kiln after its firing'
    alreadyFiled(task)
    const counter = await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: AS_THE_PERSON,
      payload: { title: 'A made-up counter of firings', counts: 'Made-up firings.', triggers: [{ kind: 'count', n: 1 }], action: { kind: 'task', title: task } },
    })
    expect(counter.statusCode, counter.body).toBe(201)
    const counterId = (JSON.parse(counter.body) as { counter: { id: string } }).counter.id
    const sent = await counted(() =>
      app.inject({ method: 'POST', url: `/api/counters/${counterId}/add`, headers: AS_THE_PERSON, payload: { because: 'Made up for this file.' } }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(201)
    const reply = JSON.parse(sent.answer.body) as { fired: { answer?: { kind: string; ids: string[] } } | null } & Record<string, unknown>
    expect(Object.keys(reply).sort()).toEqual(['counter', 'fired', 'heldBack', 'narrowedByPermission', 'row', 'says', 'workspaceId'])
    expect(reply.fired?.answer?.kind).toBe('task')
    expect(reply.fired?.answer?.ids).toHaveLength(1)
    const taskId = reply.fired!.answer!.ids[0]!
    expect(titleOf(taskId)).toEqual({ kind: 'task', title: task })
    expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM links WHERE from_id = ? AND to_id = ? AND type = 'about'").get(taskId, counterId)).toEqual({ n: 1 })
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })

  it('5. a round whose account cannot be written: its end stands, an open problem says why, and it reads no title', async () => {
    const run = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'session',
      title: 'A made-up round that ends without a seal',
      data: { state: 'running', sandbox: { template: 'made-up-template', container: 'made-up-row', folder: made } },
      actor: THE_OFFICE,
    }).id
    const sent = await refusing(
      'no_account',
      "BEFORE UPDATE ON records WHEN json_extract(NEW.data, '$.howTheRoundEnded') IS NOT NULL AND json_extract(OLD.data, '$.howTheRoundEnded') IS NULL",
      () => counted(async () => {
        const answer = t.api.patchRecord(run, { dataPatch: { state: 'orphaned', detail: 'Made up: the process was gone.' } }, THE_OFFICE)
        const until = Date.now() + 20_000
        while (problemsAbout(run).length === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50))
        return answer
      }),
    )
    expect(t.api.getRecord(run)!.data['state']).toBe('orphaned')
    expect(t.api.getRecord(run)!.data['howTheRoundEnded']).toBeUndefined()
    const problems = problemsAbout(run)
    expect(problems.map((one) => ({ title: one.title, state: one.state }))).toEqual([{ title: `How the round ended was not recorded for run ${run}`, state: 'open' }])
    expect(problems[0]!.symptom).toContain(A_SYNTHETIC_REFUSAL)
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })
})
