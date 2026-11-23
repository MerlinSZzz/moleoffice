// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMED-INSIDE DOOR ASKS THE INDEX OF THE RECORDS' TEXT FOR THE FOLDER'S LAST SEGMENT BESIDE A "/", AND LISTS THE
 * SAME. Wave 14c round 9.
 *
 * The door counts a record only where one of its strings holds the folder's last segment with a "/" just before or just
 * after it, or the name of a store when the data folder has moved. So it asks the index for "/<segment>" and
 * "<segment>/", and a record that holds the segment with no "/" beside it is not read. This file proves three things:
 *
 * 1. The ids the index keeps hold every record that names the folder: a report listed, a report in another project, an
 *    absolute path in prose and a relative path in prose. They hold a record that holds the segment beside a "/" under
 *    another folder too. They hold no record that holds the segment with no "/" beside it.
 * 2. The door's answer read by those ids is its answer read by its condition of round 63: the same records, the same
 *    hiddenCount and the same leftOut.
 * 3. A segment of fewer than three letters, and a folder written with another separator, are asked as written.
 *
 * Every record here is synthetic. The file makes one office, in a hook, before the door's module is first imported,
 * since that module and the mock below read the database that is open when they load.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

// The flag makes the door read every record by its condition, as it does when the index cannot be asked: while it is
// set, the index gives no ids.
const theIndex = vi.hoisted(() => ({ givesNoIds: false }))

vi.mock('../src/server/lib/record-text-index.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/record-text-index.ts')>()
  return {
    ...real,
    theRecordsThatMayHoldOneOf: (...args: Parameters<typeof real.theRecordsThatMayHoldOneOf>) =>
      theIndex.givesNoIds ? undefined : real.theRecordsThatMayHoldOneOf(...args),
  }
})

// ONE OFFICE FOR THE WHOLE FILE. The mock above is made once a file, from the real module the first import loads, and
// freshDb does not make it again. So the index it asks reads the database of the office that was open at that first
// import. With an office for each case, every case after the first import would ask a closed database. The hook also
// makes the server's first app, so the mock's first import reads this office and no case pays for that first build.
let t: TestDb

beforeAll(async () => {
  t = await freshDb()
  const { app } = await apiApp()
  await app.close()
})
afterAll(() => {
  t.close()
})
beforeEach(() => {
  theIndex.givesNoIds = false
})
afterEach(() => {
  theIndex.givesNoIds = false
})

/** A record of `kind` with this title and data, the data written straight into the table, so the triggers write the index. */
function aRecord(kind: 'report' | 'note', title: string, data: unknown, workspaceId = 'default'): string {
  const row = t.api.createRecord({ workspaceId, kind, title, actor: t.api.HUMAN })
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id)
  return row.id
}

/** The door's answer for `folder`, asked in this project: the ids it lists, its hiddenCount and the ids it leaves out. */
async function theDoorAnswers(folder: string): Promise<{ records: string[]; hiddenCount: number; leftOut: string[] }> {
  const app: FastifyInstance = (await apiApp()).app
  try {
    await app.ready()
    const reply = await app.inject({
      method: 'GET',
      url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`,
      headers: { 'x-mole-office-workspace': 'default' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const { records, hiddenCount, leftOut } = reply.json() as { records: { id: string }[]; hiddenCount: number; leftOut: { id: string }[] }
    return { records: records.map((record) => record.id), hiddenCount, leftOut: leftOut.map((record) => record.id) }
  } finally {
    await app.close()
  }
}

describe('the named-inside door', () => {
  it('reads by the ids of the records that hold the last segment beside a "/", and lists, counts and leaves out the same as by its condition', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'elsewhere', title: 'Synthetic other project' })
    const asked = '/test-worktrees/pebble-crate'
    const listed = aRecord('report', 'Synthetic folder-naming report', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/evidence.txt` }] })
    const elsewhere = aRecord('report', 'Synthetic report in another project', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/other.txt` }] }, 'elsewhere')
    const prose = aRecord('note', 'Synthetic note naming the folder in its text', { text: `Synthetic: the log is ${asked}/run.log.` })
    const relative = aRecord('note', 'Synthetic note naming a path inside the folder', { text: 'Synthetic: see pebble-crate/notes.txt in the worktree.' })
    const bench = [1, 2, 3].map((n) => aRecord('note', `Synthetic bench note ${String(n)}`, { text: 'Synthetic: the pebble-crate bench, with no path' }))
    const another = aRecord('note', 'Synthetic note naming another folder', { text: 'Synthetic: the log is /other-shelf/pebble-crate/run.log.' })

    const { whichRecordsCouldNameIt } = await import('../src/server/api/reportfiles.ts')
    const which = whichRecordsCouldNameIt(asked)
    expect(which, 'the door does not read by the ids the index keeps').toHaveProperty('ids')
    const ids = 'ids' in which ? which.ids : []
    const kept = [
      ['the report the door lists', listed],
      ['the report in another project', elsewhere],
      ['the note naming the folder in its text', prose],
      ['the note naming a relative path inside the folder', relative],
      ['the note naming the segment beside a "/" under another folder', another],
    ] as const
    for (const [what, id] of kept) expect(ids, `the index's ids leave out ${what}`).toContain(id)
    for (const id of bench) expect(ids, 'the index\'s ids hold a record that holds the last segment with no "/" beside it').not.toContain(id)

    const byTheIndex = await theDoorAnswers(asked)
    theIndex.givesNoIds = true
    expect(whichRecordsCouldNameIt(asked), 'with the flag set, the door does not read by its condition').toMatchObject({ alsoWhere: expect.anything() })
    const byTheCondition = await theDoorAnswers(asked)
    expect(byTheIndex, 'the answer read by the index\'s ids is not the answer read by the condition').toEqual(byTheCondition)
    expect(byTheIndex, 'the door does not list the report, so the comparison proved nothing').toEqual({ records: [listed], hiddenCount: 3, leftOut: [] })
  })
})

describe('the texts the index is asked for', () => {
  it('are the last segment with a "/" before it and with a "/" after it, or the segment as written when it is short or the separator is not "/"', async () => {
    const { theTextsTheIndexIsAskedFor, whichRecordsCouldNameIt } = await import('../src/server/api/reportfiles.ts')
    expect(theTextsTheIndexIsAskedFor('pebble-crate', '/'), 'a segment of three letters or more').toEqual(['/pebble-crate', 'pebble-crate/'])
    expect(theTextsTheIndexIsAskedFor('b7', '/'), 'a segment of two letters').toEqual(['b7'])
    expect(theTextsTheIndexIsAskedFor('C:\\shelf\\pebble-crate', '\\'), 'a folder written with "\\"').toEqual(['C:\\shelf\\pebble-crate'])
    expect(whichRecordsCouldNameIt('/test-worktrees/b7'), 'a folder whose last segment has two letters is not read by its condition').toHaveProperty('alsoWhere')
  })
})
