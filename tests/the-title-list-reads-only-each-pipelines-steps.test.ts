// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EDIT FORM'S TITLE LIST READS ONLY THE STEPS OF EACH PIPELINE OF A RECORD'S STORED FIELDS, AND OFFERS WHAT IT
 * OFFERED BEFORE.
 *
 * Wave 13y round 143, item 82. MEASURED FIRST, on the made-up office of 4 November with each kind's data at the live
 * average size: GET /api/records/title-options took 2.4 to 2.7 s alone, the median of three reads in each of five runs,
 * for an answer of 8 MB. It read every record of the project through `listRecords`, so every record's data was parsed
 * whole, and the list uses only its id, kind and title, and a pipeline's `blockIds` for the note beside a step whose
 * title another record has too.
 *
 * WHAT IS HELD HERE:
 *   1. No statement of the title list hands back a record's stored fields, other than the steps a pipeline names.
 *   2. The list is the one `titleOptions` makes from the whole records, for the owner and for an agent, so a message the
 *      agent may not read is left out for it, and a step's note names the pipelines it is a step of.
 *
 * Every record is made up.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { titleOptions } from '../src/shared/blocks.ts'

/** Put into every record's stored fields, so a statement that hands one back is found by it. */
const MARKER = 'made-up-stored-field-marker'

let WORKSPACE = 'default'
let t: TestDb
let records: typeof import('../src/server/lib/records.ts')
let messages: typeof import('../src/server/lib/messages.ts')
let createWorkspace: typeof import('../src/server/lib/workspaces.ts').createWorkspace
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  records = await import('../src/server/lib/records.ts')
  messages = await import('../src/server/lib/messages.ts')
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // A project of this case's own, so the list holds only the records this case made.
  caseNumber += 1
  WORKSPACE = `title-list-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: `Title list case ${String(caseNumber)}` })
})

function aRecord(kind: Parameters<TestDb['api']['createRecord']>[0]['kind'], title: string, data?: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind, title, ...(data === undefined ? {} : { data }), actor: t.api.HUMAN }).id
}

function aStep(pipelineId: string, name: string): string {
  return t.blocks.addBlock(pipelineId, { name, state: 'todo' }, t.api.HUMAN).block.id
}

/**
 * A PROJECT WITH WHAT THE NOTES TELL APART: two steps of one name in two pipelines, a step of another name, two notes of
 * one title, a deleted note, and a message between two others that an agent may not read. Every record's stored fields
 * then hold the marker beside what they held.
 */
function aProject(): { theMessage: string } {
  const first = aRecord('pipeline', 'Made-up first pipeline', { blockIds: [] })
  const second = aRecord('pipeline', 'Made-up second pipeline', { blockIds: [] })
  aStep(first, 'Made-up calibrate')
  aStep(second, 'Made-up calibrate')
  aStep(second, 'Made-up weigh')
  aRecord('note', 'Made-up shared title', { body: 'Made-up first note.' })
  aRecord('note', 'Made-up shared title', { body: 'Made-up second note.' })
  aRecord('report', 'Made-up shared title', { for: 'Made-up club', date: '2026-11-06', blocks: [] })
  const gone = aRecord('note', 'Made-up deleted note', { body: 'Made-up gone.' })
  t.api.deleteRecord(gone, t.api.HUMAN)
  // THE MESSAGE IS WRITTEN STRAIGHT INTO THE TABLE, so it needs no registered agents. No delivery names the agent that
  // reads below, and it neither sent the message nor is in a group, so that agent may not read it.
  const theMessage = `made-up-message-${String(caseNumber)}`
  t.client.sqlite
    .prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'message', ?, ?, 'authored')`)
    .run(theMessage, WORKSPACE, t.api.HUMAN.id, '2026-11-06 10:00:00', '2026-11-06 10:00:00', 'Made-up message between two others', JSON.stringify({
      body: 'Made-up words.',
      sentBy: { kind: 'agent', id: 'made-up-sender' },
      to: [{ kind: 'agent', id: 'made-up-receiver' }],
    }))
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.madeUpMarker', ?) WHERE workspace_id = ?").run(MARKER, WORKSPACE)
  return { theMessage }
}

type Ran = { sql: string; rows: Record<string, unknown>[] | null }

/** Runs `run` and gives each statement it ran, with the rows a list or a row statement handed back. */
function theStatementsOf(run: () => unknown): Ran[] {
  type Statement = { source: string; columns: () => { name: string }[] }
  type Call = (this: Statement, ...params: unknown[]) => unknown
  // THE STATEMENTS' OWN PROTOTYPE, so a statement prepared before this runs and kept is counted too.
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Call>
  const ran: Ran[] = []
  const originals = new Map<string, Call>()
  const byName = (statement: Statement, row: unknown): Record<string, unknown> => {
    if (!Array.isArray(row)) return row as Record<string, unknown>
    const names = statement.columns().map((column) => column.name)
    return Object.fromEntries(names.map((name, i) => [name, row[i]]))
  }
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const call = prototype[method]!
    originals.set(method, call)
    prototype[method] = function (this: Statement, ...params: unknown[]) {
      const got = call.apply(this, params)
      const rows =
        method === 'all' ? (got as unknown[]).map((row) => byName(this, row)) : method === 'get' ? (got === undefined ? [] : [byName(this, got)]) : null
      ran.push({ sql: this.source, rows })
      return got
    }
  }
  try {
    run()
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
  return ran
}

describe('the edit form\'s title list', () => {
  it('hands back no record\'s stored fields but the steps each pipeline names', () => {
    aProject()
    const owner = messages.theMessageReader({ type: 'human', id: t.api.HUMAN.id })
    const ran = theStatementsOf(() => records.recordTitleOptions(WORKSPACE, owner))
    const theRecords = ran.filter((one) => /\bfrom\s+"?records"?/i.test(one.sql))
    expect(theRecords.length, 'the statements that read the records').toBeGreaterThan(0)
    for (const one of theRecords) expect(one.rows, `a statement run as a list or a row (${one.sql})`).not.toBeNull()
    // THE VALUES ALONE: a column worked out by an expression is named by the expression, which names `blockIds`.
    const handedBack = theRecords.flatMap((one) => one.rows!).map((row) => JSON.stringify(Object.values(row)))
    expect(handedBack.length, 'the rows the records statements handed back').toBeGreaterThan(0)
    expect(handedBack.filter((row) => row.includes(MARKER)), 'rows that carry a stored field').toEqual([])
    // THE STEPS EACH PIPELINE NAMES ARE HANDED BACK, since the note beside a step is made from them.
    expect(handedBack.filter((row) => row.includes('blockIds')).length, 'rows that carry a pipeline\'s steps').toBe(2)
  })

  it('offers what the whole records make, to the owner and to an agent', () => {
    const { theMessage } = aProject()
    const owner = messages.theMessageReader({ type: 'human', id: t.api.HUMAN.id })
    const agent = messages.theMessageReader({ type: 'agent', id: 'made-up-agent' })
    expect(owner.readsEveryMessage, 'the owner reads every message').toBe(true)
    expect(agent.readsEveryMessage, 'the agent reads only some').toBe(false)
    for (const [who, reader] of [['the owner', owner], ['an agent', agent]] as const) {
      const whole = titleOptions(messages.onlyTheMessagesThisReaderMayRead(reader, records.listRecords({ workspaceId: WORKSPACE })))
      expect(records.recordTitleOptions(WORKSPACE, reader), `${who}: the list`).toEqual(whole)
    }
    // WHAT THE LISTS HOLD, so the comparison above is of lists that say something.
    const forTheOwner = records.recordTitleOptions(WORKSPACE, owner)
    const forTheAgent = records.recordTitleOptions(WORKSPACE, agent)
    expect(forTheOwner.map((one) => one.id), 'the owner is offered the message').toContain(theMessage)
    expect(forTheAgent.map((one) => one.id), 'the agent is not offered the message').not.toContain(theMessage)
    expect(forTheOwner.filter((one) => one.value === 'Made-up calibrate').map((one) => one.note).sort()).toEqual([
      'a step of Made-up first pipeline',
      'a step of Made-up second pipeline',
    ])
    expect(forTheOwner.filter((one) => one.value === 'Made-up shared title').map((one) => one.note).sort()).toEqual(['note', 'note', 'report'])
    expect(forTheOwner.find((one) => one.value === 'Made-up weigh')?.note).toBeNull()
    expect(forTheOwner.map((one) => one.value), 'a deleted record is not offered').not.toContain('Made-up deleted note')
  })
})
