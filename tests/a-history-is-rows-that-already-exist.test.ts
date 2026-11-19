// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HISTORY IS ROWS THAT ALREADY EXIST, GATHERED AT READ TIME. IT WRITES NOTHING AND STORES NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/history.ts` answers "what happened to this record, and to the work it carries".
 * The brief's line 813 — *do not duplicate the same event into several independent histories* — is
 * why there is one function and not one per kind, and these tests are what makes a second copy a
 * failure rather than a discovery.
 *
 * The four things that have to be true, and each one is a defect somebody could ship without:
 *
 *   1. ONE ROW IS ONE EVENT. For every link a module filed on a block it carries, the same change
 *      row matches two of the four reasons — the module is the from end (its own change row) and a
 *      block it carries is the to end. Without the dedupe a module's History says *took in ZED*
 *      twice, once per link.
 *   2. A LINK FILED FROM OUTSIDE STILL COUNTS. `logChange` writes one row per link act on the FROM
 *      end. So a link wired at a module's block by a record that is not in the module never appears
 *      in that module's own change rows. The fixture below files it from outside, and as a second
 *      actor, so that reason E3 is the only thing that can put it there.
 *   3. A PIPELINE REVISION THAT MERELY LISTS A BLOCK IS NOT AN EVENT. Only gaining or losing one
 *      is. A pipeline listing eighteen blocks would otherwise hand every one of its title edits to
 *      every module carrying any of them.
 *   4. NOTHING IS WRITTEN. Not below the route and not through it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE "NOTHING IS WRITTEN" TEST ASSERTS A SET RATHER THAN EXCLUDING ONE
 * ---------------------------------------------------------------------------------------
 *
 * An exclusion list goes quiet the day something new appears. So the test names the exact set of
 * tables whose row count moved. Today that set is EMPTY. When the telemetry thread lands and Mole Office
 * writes one row per request under `/api`, this line goes red and somebody has to change it to
 * `{api_calls}` on purpose — which is the point. A second new table, or a second row per call,
 * still turns it red after that.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, one, type TestDb } from './helpers.ts'
import type { HistoryEvent } from '../src/server/lib/history.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb
/**
 * The module under test, loaded AFTER the throwaway database exists.
 *
 * A plain top-level import would reach src/server/db/client.ts before any test body runs, and
 * client.ts refuses to open the file `.env` names under a test runner — which is the operator's
 * real corpus. tests/helpers.ts is written for exactly this.
 */
let lib: typeof import('../src/server/lib/history.ts')

beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/history.ts')
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(() => {
  t.close()
})

/** The person who owns the project, and a second session that is not them. */
const OTHER_AGENT = { type: 'agent', id: 'another-session' } as const

function pipeline(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title, data: { blockIds: [] }, actor: t.api.HUMAN })
}
function block(pipelineId: string, name: string) {
  return t.blocks.addBlock(pipelineId, { name, state: 'todo' }, t.api.HUMAN).block
}
function module_(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'module', title, actor: t.api.HUMAN })
}

/** The whole read, below the route. */
function history(id: string): HistoryEvent[] {
  const scope = lib.historySubjects(id, 'default')
  if (scope === null) throw new Error(`no record ${id}`)
  return lib.historyEvents(scope, 'default')
}

/** Every table's name and row count, which is what "nothing was written" means. */
function tableCounts(): Map<string, number> {
  const counts = new Map<string, number>()
  const names = t.client.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((raw) => (raw as { name: string }).name)
  for (const name of names) {
    const row = t.client.sqlite.prepare(`SELECT count(*) as n FROM "${name}"`).get() as { n: number }
    counts.set(name, row.n)
  }
  return counts
}

function movedBetween(before: Map<string, number>, after: Map<string, number>): string[] {
  const moved: string[] = []
  for (const [name, n] of after) if (before.get(name) !== n) moved.push(name)
  for (const name of before.keys()) if (!after.has(name)) moved.push(name)
  return moved.sort()
}

describe('one stored row is one event', () => {
  it('reads back one event per link change row for a module that filed its own links', () => {
    const p = pipeline('Transplant v2')
    const carried = ['Sense the pot', 'Close and hold', 'Hand it over'].map((n) => block(p.id, n))
    const gripper = module_('Tray clamp')
    for (const c of carried) {
      t.api.createLink({ fromId: gripper.id, toId: c.id, type: 'implements', actor: t.api.HUMAN })
    }

    const events = history(gripper.id)

    // Every event is a distinct stored row. This is the assertion the dedupe exists for: each of
    // the three `implements` rows is BOTH the module's own change row and a link filed at a block
    // the module carries, so each matches twice.
    const keys = events.map((e) => `${e.source.table}:${e.source.id}`)
    expect(new Set(keys).size).toBe(keys.length)

    // And the count is the number of distinct rows, worked out from the tables rather than typed.
    const rows = t.client.sqlite
      .prepare(
        'select (select count(*) from changes where record_id in (select value from json_each(?))) as c,' +
          ' (select count(*) from revisions where record_id in (select value from json_each(?))) as r',
      )
      .get(JSON.stringify([gripper.id, ...carried.map((c) => c.id)]), JSON.stringify([gripper.id, ...carried.map((c) => c.id)])) as {
      c: number
      r: number
    }
    // Every change row and revision of the module and its three blocks, plus the pipeline
    // revisions where the order gained one of them — three of those, one per block added.
    expect(events.length).toBe(rows.c + rows.r + 3)

    // The three link rows are there once each, and they are attributed to the module.
    const linkEvents = events.filter((e) => e.op === 'link' && e.field === 'implements')
    expect(linkEvents.length).toBe(3)
    expect(new Set(linkEvents.map((e) => e.subject.id))).toEqual(new Set([gripper.id]))
  })
})

describe('a link somebody else filed at a block this module carries', () => {
  it('appears in the module’s history exactly once, filed from outside by a second session', () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const gripper = module_('Tray clamp')
    t.api.createLink({ fromId: gripper.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })

    // A record that is NOT part of the module, and a session that is not the one that built any of
    // the rows above. `logChange` files the row on the FROM end, so this row's `record_id` is the
    // problem and not the module: if reason E3 were dropped, the module would never hear about a
    // problem raised against the step it carries.
    const problem = t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'The gripper drops the cube at effort 13',
      actor: OTHER_AGENT,
    })
    t.api.createLink({ fromId: problem.id, toId: sense.id, type: 'blocks', actor: OTHER_AGENT })

    const events = history(gripper.id)
    const fromOutside = events.filter((e) => e.op === 'link' && e.field === 'blocks')
    expect(fromOutside.length).toBe(1)
    const only = one(fromOutside, 'the link filed from outside')
    // It is in the module's history BECAUSE of the block, and it says so.
    expect(only.subject.id).toBe(sense.id)
    expect(only.because).toBe('carries')
    expect(only.who.actorId).toBe('another-session')

    // And the block's own history is a subset of the module's, which is what the subject set means.
    const blockEvents = new Set(history(sense.id).map((e) => `${e.source.table}:${e.source.id}`))
    const moduleEvents = new Set(events.map((e) => `${e.source.table}:${e.source.id}`))
    for (const key of blockEvents) expect(moduleEvents.has(key)).toBe(true)
  })
})

describe('a pipeline revision is an event only when the order gained or lost one of these blocks', () => {
  it('leaves out a revision that merely lists the block', () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const gripper = module_('Tray clamp')
    t.api.createLink({ fromId: gripper.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })

    const before = history(gripper.id).filter((e) => e.because === 'appearedIn').length
    expect(before).toBe(1)

    // The pipeline changes, and its order does not. This writes a revision that LISTS the block.
    t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)

    const after = history(gripper.id).filter((e) => e.because === 'appearedIn')
    expect(after.length).toBe(1)

    // And when the order really does lose it, that IS an event.
    t.blocks.removeBlock(p.id, sense.id, t.api.HUMAN)
    expect(history(gripper.id).filter((e) => e.because === 'appearedIn').length).toBe(2)
  })
})

describe('the subject set', () => {
  it('answers about a record that is not a block, a module or a pipeline, with its own rows', () => {
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'What the bench jig is for',
      actor: t.api.HUMAN,
    })
    const scope = lib.historySubjects(note.id, 'default')
    expect(scope).not.toBeNull()
    expect([...(scope?.subjects ?? [])]).toEqual([note.id])
    const events = history(note.id)
    expect(events.length).toBeGreaterThan(0)
    expect(new Set(events.map((e) => e.subject.id))).toEqual(new Set([note.id]))
  })

  it('refuses a record of another project rather than answering that nothing happened to it', async () => {
    const workspaces = await import('../src/server/lib/workspaces.ts')
    workspaces.createWorkspace({ id: 'robotics', title: 'Robotics' })
    const elsewhere = t.api.createRecord({
      workspaceId: 'robotics',
      kind: 'module',
      title: 'Tray clamp',
      actor: t.api.HUMAN,
    })
    // Below the route: no scope at all, rather than an empty one.
    expect(lib.historySubjects(elsewhere.id, 'default')).toBeNull()

    const { app } = await apiApp()
    try {
      const reply = await app.inject({
        method: 'GET',
        url: `/api/records/${elsewhere.id}/history`,
        headers: { 'x-mole-office-workspace': 'default' },
      })
      expect(reply.statusCode).toBe(404)
      // The other direction: asked in its own project, the same id answers.
      const own = await app.inject({
        method: 'GET',
        url: `/api/records/${elsewhere.id}/history`,
        headers: { 'x-mole-office-workspace': 'robotics' },
      })
      expect(own.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })
})

describe('nothing is written', () => {
  it('leaves every table’s name and row count unchanged, below the route', () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const gripper = module_('Tray clamp')
    t.api.createLink({ fromId: gripper.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })

    const before = tableCounts()
    for (let i = 0; i < 5; i += 1) {
      history(gripper.id)
      history(sense.id)
      history(p.id)
    }
    expect(movedBetween(before, tableCounts())).toEqual([])
  })

  it('leaves exactly no table changed when it is called through its route', async () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const gripper = module_('Tray clamp')
    t.api.createLink({ fromId: gripper.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })

    const { app } = await apiApp()
    try {
      // One call first, so that anything a route does once — a lazily created table, a first-run
      // stamp — happens before the snapshot rather than inside it.
      await app.inject({ method: 'GET', url: `/api/records/${gripper.id}/history` })
      const before = tableCounts()
      for (let i = 0; i < 3; i += 1) {
        const reply = await app.inject({ method: 'GET', url: `/api/records/${gripper.id}/history` })
        expect(reply.statusCode).toBe(200)
      }
      // THE EXACT SET, not an exclusion list. It was `[]` while Mole Office wrote no request log; the
      // recorder landed on 26 August 2026 and this line went red exactly as its own comment said it
      // would, so it is `['api_calls']` now. What one call costs, re-read: one row in one table.
      expect(movedBetween(before, tableCounts())).toEqual(['api_calls'])
    } finally {
      await app.close()
    }
  })
})
