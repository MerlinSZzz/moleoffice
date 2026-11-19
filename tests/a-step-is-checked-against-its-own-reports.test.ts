// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE STEP THAT IS NOT DONE IS CHECKED AGAINST THE REPORTS LINKED TO IT, NOT AGAINST EVERY REPORT.
 *
 * Problem `Bhy7KCOaCxY5`: on 21 August 2026 the campaign pipeline said round nine was in progress after
 * the round had finished and its report was filed. The check `campaign-block-vs-report` in
 * src/server/lib/contradictions.ts was added to catch that shape: a step that is not done, with a report
 * about it that is newer than the step. Until 5 October 2026 it compared each step with every report in
 * the project, so any unfinished step older than the newest report anywhere failed it, and on a busy
 * office it was always red. These cases hold that only a linked report counts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let contradictionsFor: typeof import('../src/server/lib/contradictions.ts').contradictionsFor
let workspace: string
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  workspaces = await import('../src/server/lib/workspaces.ts')
  ;({ contradictionsFor } = await import('../src/server/lib/contradictions.ts'))
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(() => {
  t.close()
})

beforeEach(() => {
  // The check reads every record of one project, so each case gets a project of its own.
  caseNumber += 1
  workspace = `step-report-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: workspace, title: `Step report case ${String(caseNumber)}` })
})

const OLDER = '2026-08-20 10:00:00'
const NEWER = '2026-08-21 10:00:00'

function stepIn(state: 'todo' | 'done'): string {
  const pipeline = t.api.createRecord({
    workspaceId: workspace,
    kind: 'pipeline',
    title: 'The campaign',
    data: { blockIds: [] },
    actor: t.api.HUMAN,
  })
  const step = t.blocks.addBlock(pipeline.id, { name: 'Round nine', state }, t.api.HUMAN).block
  t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(OLDER, step.id)
  return step.id
}

function report(title: string): string {
  const id = t.api.createRecord({
    workspaceId: workspace,
    kind: 'report',
    title,
    data: {
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-08-21',
      blocks: [{ id: 'b-1', type: 'text', heading: 'What happened', text: 'The round finished and its work landed.' }],
    },
    actor: t.api.HUMAN,
  }).id
  t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(NEWER, id)
  return id
}

function theCheck(): { passed: boolean | null; rightN: number | null } {
  const found = contradictionsFor(workspace).checks.find((check) => check.id === 'campaign-block-vs-report')
  if (found === undefined) throw new Error('the check campaign-block-vs-report did not run at all')
  return found
}

describe('a step that is not done, against the reports about it', () => {
  it('fails when a report linked to the step is newer than the step', () => {
    const step = stepIn('todo')
    const about = report('Round nine is finished')
    t.api.createLink({ fromId: about, toId: step, type: 'about', actor: t.api.HUMAN })
    expect(theCheck()).toMatchObject({ passed: false, rightN: 1 })
  })

  it('passes when the only newer report is about something else', () => {
    stepIn('todo')
    report('A report about the gripper')
    expect(theCheck()).toMatchObject({ passed: true, rightN: 0 })
  })

  it('passes when the step is done, whatever reports are linked to it', () => {
    const step = stepIn('done')
    const about = report('Round nine is finished')
    t.api.createLink({ fromId: about, toId: step, type: 'about', actor: t.api.HUMAN })
    expect(theCheck()).toMatchObject({ passed: true, rightN: 0 })
  })
})
