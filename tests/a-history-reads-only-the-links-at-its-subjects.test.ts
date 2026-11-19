// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HISTORY READS ONLY THE LINKS, AND THE LINKS MADE AND UNMADE, WITH AN END AT ONE OF ITS SUBJECTS, AND TELLS EACH ONE
 * AS IT DID.
 *
 * Wave 13y round 114, item 47, the fourth pass over the API's speed. MEASURED FIRST, 31 October 2026, on the made-up
 * office shaped to the live counts of that morning: the largest project holds 563,735 change rows, 43,252 of them links
 * made or unmade, and 41,791 links. A report's history read all 43,252 of those change rows and all 41,791 links, made
 * an object of each, and kept the few with an end at the report. A module's history read both lists twice, the second
 * time to find the blocks it carries.
 *
 * WHAT IS HELD HERE:
 *   1. No statement of a history hands back a link, or a change row, with no end at one of its subjects. That holds for a
 *      report, a pipeline and a module, and so for the module's search for the blocks it carries as well.
 *   2. Every link made, unmade or never logged at a report, at either end, is told once, from the row that holds it, and
 *      no other link is told.
 *   3. A module carries every block it was ever linked to by `implements`, from the change log and from the links, at
 *      either end, and only blocks. Each of those links is told once.
 *
 * Every row is made up. A link nobody logged is written straight into `links`, as the importer writes one.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { freshDb, type TestDb } from './helpers.ts'
import type { HistoryEvent } from '../src/server/lib/history.ts'

let WORKSPACE = 'default'
const OTHER_AGENT = { type: 'agent', id: 'another-session' } as const

let t: TestDb
let lib: typeof import('../src/server/lib/history.ts')
let createWorkspace: typeof import('../src/server/lib/workspaces.ts').createWorkspace
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/history.ts')
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // A project of this case's own, so a history sees only the rows this case made.
  caseNumber += 1
  WORKSPACE = `history-reads-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: `History reads case ${String(caseNumber)}` })
})

function aRecord(kind: Parameters<TestDb['api']['createRecord']>[0]['kind'], title: string, data?: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind, title, ...(data === undefined ? {} : { data }), actor: t.api.HUMAN }).id
}

function aBlock(pipelineId: string, name: string): string {
  return t.blocks.addBlock(pipelineId, { name, state: 'todo' }, t.api.HUMAN).block.id
}

/** The link and unlink change rows of the whole office, by id. */
function theLinkChanges(): Set<string> {
  const rows = t.client.sqlite.prepare("SELECT id FROM changes WHERE op IN ('link', 'unlink')").all() as { id: string }[]
  return new Set(rows.map((row) => row.id))
}

/** Does `act`, and gives the one link or unlink change row it filed. */
function theChangeFiledBy(act: () => unknown): string {
  const before = theLinkChanges()
  act()
  const filed = [...theLinkChanges()].filter((id) => !before.has(id))
  expect(filed, 'the link change rows one act filed').toHaveLength(1)
  return filed[0]!
}

type LinkInput = Parameters<TestDb['api']['createLink']>[0]

/** A link made and logged, as the record door makes one: its link id and its change row. */
function aLink(fromId: string, toId: string, type: LinkInput['type'], actor: LinkInput['actor'] = t.api.HUMAN): { link: string; change: string } {
  let link = ''
  const change = theChangeFiledBy(() => {
    link = t.api.createLink({ fromId, toId, type, actor }).id
  })
  return { link, change }
}

/** The change row an unmaking filed. */
function unmade(linkId: string): string {
  return theChangeFiledBy(() => t.api.deleteLink(linkId, t.api.HUMAN, WORKSPACE))
}

let unloggedNumber = 0
/** A link nobody logged, written straight into `links` as the importer writes one. */
function anUnloggedLink(fromId: string, toId: string, type: string): string {
  unloggedNumber += 1
  const id = `unlogged-${String(unloggedNumber).padStart(4, '0')}`
  t.client.sqlite
    .prepare(
      "INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, created_by) VALUES (?, ?, 'owner', '2026-10-30 09:00:00', '2026-10-30 09:00:00', ?, ?, ?, 'the importer')",
    )
    .run(id, WORKSPACE, fromId, toId, type)
  return id
}

/**
 * One project with a report, a pipeline and a module, each with links at it of every sort, and links among other
 * records that touch none of them.
 */
function aWorld() {
  const report = aRecord('report', 'A made-up report')
  const [x, y, z] = ['X', 'Y', 'Z'].map((name) => aRecord('note', `Made-up note ${name}`))
  const pipeline = aRecord('pipeline', 'A made-up pipeline', { blockIds: [] })
  const [b1, b2, b3, b4, b5] = ['one', 'two', 'three', 'four', 'five'].map((name) => aBlock(pipeline, `Made-up step ${name}`))
  const module = aRecord('module', 'A made-up module')
  const otherModule = aRecord('module', 'Another made-up module')
  const idea = aRecord('idea', 'A made-up idea')

  // AT THE REPORT. Filed at it from outside, by somebody else; filed by it; made and unmade at it; never logged, at
  // either end.
  const xToReport = aLink(x!, report, 'relates_to', OTHER_AGENT)
  const reportToY = aLink(report, y!, 'relates_to')
  const yToReport = aLink(y!, report, 'relates_to')
  const yToReportUnmade = unmade(yToReport.link)
  const zToReport = anUnloggedLink(z!, report, 'relates_to')
  const reportToZ = anUnloggedLink(report, z!, 'about')

  // AT THE MODULE. Carried and still carried; carried and let go; carried with nobody logging it, from either end; and
  // an `implements` link to a record that is not a block.
  const carriesB1 = aLink(module, b1!, 'implements')
  const carriesB2 = aLink(module, b2!, 'implements')
  const carriesB2Unmade = unmade(carriesB2.link)
  const carriesB3 = anUnloggedLink(module, b3!, 'implements')
  const b4ToModule = anUnloggedLink(b4!, module, 'implements')
  const moduleToIdea = anUnloggedLink(module, idea, 'implements')

  // AT NONE OF THEM. More links made, unmade and never logged among the other records than at the three together.
  const among: string[] = []
  for (const [from, to, type] of [
    [x, y, 'relates_to'],
    [x, z, 'relates_to'],
    [z, y, 'relates_to'],
    [y, x, 'relates_to'],
    [otherModule, b5, 'implements'],
    [x, idea, 'relates_to'],
  ] as const) {
    among.push(aLink(from!, to!, type).change)
  }
  const madeAndUnmade = aLink(z!, x!, 'relates_to')
  among.push(madeAndUnmade.change, unmade(madeAndUnmade.link))
  const unloggedAmong = [anUnloggedLink(y!, z!, 'relates_to'), anUnloggedLink(idea, x!, 'about'), anUnloggedLink(otherModule, b5!, 'about')]

  return {
    report,
    pipeline,
    module,
    blocks: { b1: b1!, b2: b2!, b3: b3!, b4: b4!, b5: b5! },
    atTheReport: { xToReport, reportToY, yToReport, yToReportUnmade, zToReport, reportToZ },
    atTheModule: { carriesB1, carriesB2, carriesB2Unmade, carriesB3, b4ToModule, moduleToIdea },
    among,
    unloggedAmong,
  }
}

/** The whole read, below the route. */
function history(id: string): HistoryEvent[] {
  const scope = lib.historySubjects(id, WORKSPACE)
  if (scope === null) throw new Error(`no record ${id}`)
  return lib.historyEvents(scope, WORKSPACE)
}

interface Ran {
  sql: string
  /** Each row handed back, by column name. Null when the statement was run some other way than `all` or `get`. */
  rows: Record<string, unknown>[] | null
}

/** Every statement run while `run` runs, with the rows it handed back. */
function theStatementsOf(run: () => unknown): Ran[] {
  type Statement = { source: string; reader: boolean; columns: () => { name: string }[] }
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

const reads = (ran: Ran[], table: string): Ran[] => ran.filter((one) => new RegExp(`\\bfrom\\s+"?${table}"?(\\s|$)`, 'i').test(one.sql))

/** The far end of a change row, as `logChange` files a link act: the new value of a link, the old value of an unlink. */
const theFarEnd = (row: Record<string, unknown>): unknown => (row['op'] === 'unlink' ? row['old_value'] : row['op'] === 'link' ? row['new_value'] : null)

const theLinkEvents = (events: HistoryEvent[]): HistoryEvent[] => events.filter((event) => event.op === 'link' || event.op === 'unlink')
const keyOf = (event: HistoryEvent): string => `${event.source.table}:${event.source.id}`

describe('a history', () => {
  it('1. hands back no link, and no change row, with no end at one of its subjects, for a report, a pipeline and a module', () => {
    const world = aWorld()
    for (const [what, id] of [
      ['a report', world.report],
      ['a pipeline', world.pipeline],
      ['a module', world.module],
    ] as const) {
      const scope = lib.historySubjects(id, WORKSPACE)!
      const subjects = new Set(scope.subjects)
      const ran = theStatementsOf(() => history(id))
      const changes = reads(ran, 'changes')
      const links = reads(ran, 'links')
      expect(changes.length, `${what}: the statements that read the change rows`).toBeGreaterThan(0)
      expect(links.length, `${what}: the statements that read the links`).toBeGreaterThan(0)
      for (const one of [...changes, ...links]) expect(one.rows, `${what}: a statement run as a list or a row (${one.sql})`).not.toBeNull()
      const strayChanges = changes
        .flatMap((one) => one.rows!)
        .filter((row) => !subjects.has(row['record_id'] as string) && !subjects.has(theFarEnd(row) as string))
      expect(strayChanges.map((row) => row['id']), `${what}: change rows with no end at a subject`).toEqual([])
      const strayLinks = links.flatMap((one) => one.rows!).filter((row) => !subjects.has(row['from_id'] as string) && !subjects.has(row['to_id'] as string))
      expect(strayLinks.map((row) => row['id']), `${what}: links with no end at a subject`).toEqual([])
    }
  })

  it('2. tells every link made, unmade or never logged at a report, at either end, once, from the row that holds it', () => {
    const world = aWorld()
    const at = world.atTheReport
    const told = theLinkEvents(history(world.report))
    expect(told.map(keyOf).sort()).toEqual(
      [
        `changes:${at.xToReport.change}`,
        `changes:${at.reportToY.change}`,
        `changes:${at.yToReport.change}`,
        `changes:${at.yToReportUnmade}`,
        `links:${at.zToReport}`,
        `links:${at.reportToZ}`,
      ].sort(),
    )
    for (const event of told) {
      expect(event.subject.id).toBe(world.report)
      expect(event.because).toBe('itself')
    }
    const byKey = new Map(told.map((event) => [keyOf(event), event]))
    expect(byKey.get(`changes:${at.xToReport.change}`)).toMatchObject({ op: 'link', field: 'relates_to', who: { actorId: 'another-session' } })
    expect(byKey.get(`changes:${at.yToReportUnmade}`)).toMatchObject({ op: 'unlink', field: 'relates_to' })
    expect(byKey.get(`links:${at.zToReport}`)).toMatchObject({ op: 'link', field: 'relates_to', at: '2026-10-30 09:00:00', who: { actorId: 'the importer' } })
    expect(byKey.get(`links:${at.reportToZ}`)).toMatchObject({ op: 'link', field: 'about' })
  })

  it('3. finds every block a module carries, from the change log and from the links, at either end, and only blocks, and tells each link once', () => {
    const world = aWorld()
    const scope = lib.historySubjects(world.module, WORKSPACE)!
    const { b1, b2, b3, b4 } = world.blocks
    expect([...scope.subjects].sort()).toEqual([world.module, b1, b2, b3, b4].sort())
    expect(scope.because.get(world.module)).toBe('itself')
    for (const block of [b1, b2, b3, b4]) expect(scope.because.get(block)).toBe('carries')

    const at = world.atTheModule
    const told = theLinkEvents(history(world.module))
    expect(told.map(keyOf).sort()).toEqual(
      [
        `changes:${at.carriesB1.change}`,
        `changes:${at.carriesB2.change}`,
        `changes:${at.carriesB2Unmade}`,
        `links:${at.carriesB3}`,
        `links:${at.b4ToModule}`,
        `links:${at.moduleToIdea}`,
      ].sort(),
    )
    const byKey = new Map(told.map((event) => [keyOf(event), event]))
    // A link with both ends among the subjects is told from its from end, as the history always told it.
    expect(byKey.get(`links:${at.b4ToModule}`)).toMatchObject({ subject: { id: b4 }, because: 'carries', field: 'implements' })
    expect(byKey.get(`links:${at.carriesB3}`)).toMatchObject({ subject: { id: world.module }, because: 'itself' })
    expect(byKey.get(`changes:${at.carriesB2Unmade}`)).toMatchObject({ subject: { id: world.module }, op: 'unlink', field: 'implements' })
  })
})
