// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE LINE TO AN AGENT WHO IS NOT RETIRED READS NO RUN AND NO LIST OF TITLES. Wave 13u round 34.
 *
 * Live, one reminder pass read about 60,000 rows in each of two steps, the checklists and the long sandbox runs, against
 * tens of rows in a usual pass. On a made-up office of the live counts, one reminder of each kind due, the rows were read
 * in the write of the one line each step sends, and not in the steps themselves:
 *
 *   · the reach of the addressee read every session record of the project with its data (7,700 rows there), and then one
 *     registry row per run. An office line routes on retired only, so for an addressee who is not retired that reading
 *     was not used;
 *   · the near list of titles read the title of every record of the project (18,800 rows there), and `createRecord`,
 *     which every office line is written through, gave back the record without it.
 *
 * Measured there with the same pass before and after: the long sandbox runs went from 3,620 statements and 33,032 rows
 * to 41 and 2,959, and the checklists from 3,626 and 31,078 to 47 and 1,005.
 *
 * WHAT IS MEASURED. The statements and rows one office line runs, through the server's own count
 * (src/server/lib/slow-requests.ts), before and after the project gets 200 more runs and 300 more records. The
 * statements are equal, and so are the rows but for one: nothing the line reads grows with either. The one row is the
 * check for another message written in the same millisecond, which finds the line before it or does not. The line is
 * still written to its addressee and routed nowhere.
 *
 * The mutation tried, red here: in src/server/lib/records.ts, delete the line that lets an office line to an agent who
 * is not retired skip the reach.
 *
 * This file listed two more as red, and both leave it green now (seen in wave 13s round 186):
 *   · in src/server/lib/superiors.ts, read the run rows when the readings are made (`let rows = everyRunRow(workspaceId)`).
 *     That is `theReadingsForOneSend`, and the record door now asks `theReadingsForOneMessage`, which reads no run row
 *     of the project, so the change no longer reaches an office line. It was green on the code before round 186 too;
 *   · in src/server/lib/records.ts, let `createRecord` call `createRecordWithReport(input)` without
 *     `namesWhatIsAlreadyFiled: false`. Since round 186 a message makes no near list, whatever its caller says.
 *     tests/a-sent-draft-reads-no-title-list.test.ts holds a message to no near list, in its case 1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AnOfficeLine } from '../src/shared/groups.ts'
import { freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const MORE_RUNS = 200
const MORE_RECORDS = 300

let t: TestDb
let groups: typeof import('../src/server/lib/groups.ts')
let counting: typeof import('../src/server/lib/slow-requests.ts')
let THE_OFFICE: typeof import('../src/server/lib/inspection.ts').THE_OFFICE

function anAgent(handle: string): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

/** One office line to the agent, and what it did inside SQLite. */
function oneLineTo(agentId: string, line: string): { id: string; statements: number; rows: number } {
  const did = counting.aFreshCount()
  const said: AnOfficeLine = { line, said: null, notice: 'aCounterFired' }
  const wrote = counting.countedTo(did, () => groups.writeASystemLineToOne({ kind: 'agent', id: agentId }, WORKSPACE, said, THE_OFFICE))
  return { id: wrote.id, statements: did.statements, rows: did.rows }
}

function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

let addressee = ''
let other = ''

beforeAll(async () => {
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  counting = await import('../src/server/lib/slow-requests.ts')
  THE_OFFICE = (await import('../src/server/lib/inspection.ts')).THE_OFFICE
  counting.measureTheStatementsOf(t.client.sqlite)
  addressee = anAgent('the-addressee')
  other = anAgent('another-agent')
})

afterAll(() => t?.close())

describe('an office line to an agent who is not retired', () => {
  it('runs the same statements and reads the same rows however many runs and records the project holds', () => {
    // THE FIRST LINE IS NOT COUNTED: it may read once what every later line finds already read.
    oneLineTo(addressee, 'A made-up line written first.')
    const before = oneLineTo(addressee, 'A made-up line before the runs.')

    for (let i = 0; i < MORE_RUNS; i += 1) {
      t.api.createRecord({
        workspaceId: WORKSPACE,
        kind: 'session',
        title: `A made-up run ${i}`,
        data: { state: 'running', runtime: 'claude-code', servingAgent: other },
        actor: t.api.HUMAN,
      })
    }
    for (let i = 0; i < MORE_RECORDS; i += 1) {
      t.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: `Mole Office made-up note ${i}`, data: { body: 'Made up.' }, actor: t.api.HUMAN })
    }

    const after = oneLineTo(addressee, 'A made-up line after the runs.')
    const both = `before: ${JSON.stringify(before)}; after: ${JSON.stringify(after)}`
    expect(after.statements, both).toBe(before.statements)
    // THE SAME-MILLISECOND CHECK GIVES 0 ROWS OR 1, so the rows may differ by one and by no more.
    expect(Math.abs(after.rows - before.rows), both).toBeLessThanOrEqual(1)

    // THE LINE IS STILL WRITTEN, to its addressee and routed nowhere, so the equal counts are not those of a line not sent.
    const data = dataOf(after.id)
    expect(data['to']).toEqual([{ kind: 'agent', id: addressee }])
    expect(data['body']).toBe('A made-up line after the runs.')
    expect(data['routed']).toBeUndefined()
  })
})
