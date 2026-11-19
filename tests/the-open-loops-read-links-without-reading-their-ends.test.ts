// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OPEN LOOPS READ EVERY LINK BY ITS TWO ENDS, NOT BY READING EVERY END RECORD.
 *
 * `openLoopsInProject` builds one undirected neighbour map from every link in the project. It used
 * `allGatedLinks`, which also reads every end record by id, 500 ids to a statement (111 statements on
 * the made-up office of 13 November), and works out each link's gate and whether an end is gone. The
 * neighbour map uses none of that: only `fromId` and `toId`. `allLinks` reads the same rows in one
 * statement and nothing else.
 *
 * WHAT THIS PROVES
 *   1. The map `openLoopsInProject` builds is the one `allGatedLinks`'s rows give: every link, both
 *      ways, broken ends included.
 *   2. A module is still found as a module beside a task through that map.
 *   3. While the population is read, no statement reads `records` by a list of ids for `deleted_at`:
 *      the end read `allGatedLinks` makes is gone.
 *
 * WHAT WOULD MAKE IT GO RED
 *   the read goes back to `allGatedLinks` (case 3), or `allLinks` stops giving every link (case 1),
 *   or the neighbour map stops carrying module ids (case 2).
 *
 * WHAT THIS DOES NOT PROVE. The milliseconds saved. This proves the read that cost them is not made;
 * the times are measured on a copy of the made-up office, outside the suite.
 *
 * Every record here is made up. `freshDb` in tests/helpers.ts makes a throwaway database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import type { ProjectOpenLoops } from '../src/server/lib/openloops.ts'
import type { WorkspaceLink } from '../src/server/lib/records/link-readers.ts'

let t: TestDb
let openloops: typeof import('../src/server/lib/openloops.ts')
let linkReaders: typeof import('../src/server/lib/records/link-readers.ts')
let records: typeof import('../src/server/lib/records.ts')

const PROJECT = 'default'
let moduleId = ''
let taskId = ''

/** Every statement prepared while `work` runs, in the order they were prepared. */
function theStatementsDuring(work: () => void): string[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => unknown }
  const original = sqlite.prepare
  const asked: string[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    asked.push(text)
    return original.call(this, text)
  }
  try {
    work()
  } finally {
    sqlite.prepare = original
  }
  return asked
}

/** The neighbour map `allGatedLinks`'s rows give: every link, both ways. */
function theNeighboursOf(links: readonly WorkspaceLink[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const link of links) {
    for (const [from, to] of [[link.fromId, link.toId], [link.toId, link.fromId]] as const) {
      const set = out.get(from) ?? new Set<string>()
      set.add(to)
      out.set(from, set)
    }
  }
  return out
}

beforeAll(async () => {
  t = await freshDb()
  openloops = await import('../src/server/lib/openloops.ts')
  linkReaders = await import('../src/server/lib/records/link-readers.ts')
  records = await import('../src/server/lib/records.ts')
  const module = t.api.createRecord({ workspaceId: PROJECT, kind: 'module', title: 'A made-up module', actor: t.api.HUMAN })
  const task = t.api.createRecord({ workspaceId: PROJECT, kind: 'task', title: 'A made-up task', actor: t.api.HUMAN })
  moduleId = module.id
  taskId = task.id
  t.api.createLink({ fromId: taskId, toId: moduleId, type: 'relates_to', actor: t.api.HUMAN })
  const add = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, ?, 'owner', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'message', ?, NULL, ?, ?, 'fixture')`,
  )
  add.run('count-message-in-view', 'message-centre', 'Message in view', JSON.stringify({ writtenIn: { project: PROJECT }, aboutProject: PROJECT }), null)
  add.run('count-message-elsewhere', 'message-centre', 'Message elsewhere', JSON.stringify({ writtenIn: { project: 'elsewhere' } }), null)
  add.run('count-message-withdrawn', 'message-centre', 'Withdrawn message', JSON.stringify({ writtenIn: { project: PROJECT } }), '2026-01-02 00:00:00')
  add.run('count-message-filed-here', PROJECT, 'Message filed here', JSON.stringify({ writtenIn: { project: 'elsewhere' } }), null)
})

afterAll(() => {
  t.close()
})

describe('the open loops read the links, not every link end', () => {
  it('builds the same neighbour map from the links alone', () => {
    const opened: ProjectOpenLoops = openloops.openLoopsInProject(PROJECT)
    expect(opened.neighbours).toEqual(theNeighboursOf(linkReaders.allGatedLinks(PROJECT)))
  })

  it('still finds the module beside the task', () => {
    const opened = openloops.openLoopsInProject(PROJECT)
    expect(opened.modulesOf(taskId)).toEqual([moduleId])
  })

  it('counts a reader of all messages without returning message ids, and keeps limited readers narrow', () => {
    for (const project of [PROJECT, 'message-centre', 'elsewhere']) {
      const population = openloops.openLoopsInProject(project)
      const listed = records.listRecords({ workspaceId: project })
      const expected = listed.length
      for (const reader of [undefined, { readsEveryMessage: true as const, because: 'the owner' as const, who: null }]) {
        let count = -1
        const asked = theStatementsDuring(() => { count = population.readableCount(reader) })
        expect(count).toBe(expected)
        expect(asked.filter((text) => /^select \"id\" from \"records\"/i.test(text)), 'the count does not return message ids').toEqual([])
        expect(asked.filter((text) => /^select count\(\*\)/i.test(text))).toHaveLength(1)
      }
      const limited = { readsEveryMessage: false as const, who: null }
      expect(population.readableCount(limited)).toBe(listed.filter((one) => one.kind !== 'message').length)
    }
  })

  it('reads no record by a list of link-end ids while it builds the population', () => {
    let opened: ProjectOpenLoops | null = null
    const asked = theStatementsDuring(() => {
      opened = openloops.openLoopsInProject(PROJECT)
    })
    expect(opened).not.toBeNull()
    const byEnds = asked.filter(
      (text) => text.includes('"deleted_at" from "records"') && text.includes('"records"."id" in ('),
    )
    expect(byEnds, 'the link ends are read by id, once for each piece of 500').toEqual([])
  })
})
