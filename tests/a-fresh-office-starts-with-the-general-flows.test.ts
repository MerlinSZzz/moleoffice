// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH OFFICE STARTS WITH THE TEN GENERAL OFFICE FLOWS, AND COPIES THEM ONLY ONCE.
 *
 * Point NF-1 of line 13r: a new office holds no office flow at all, so a start copies the ten general
 * flows into its own flow records. The words are the office's own ten flows, written for any office:
 * they say "the person", never "the owner", and carry no record ids, flow labels, chapter numbers,
 * project names or the two sentences that are true only of the office they came from. The set is
 * src/config/default-flows.json; src/server/lib/default-flows.ts is the copy.
 *
 * WHAT THIS FILE HOLDS THE OFFICE TO:
 *   1. a fresh office gets exactly the ten flows, with each stage, the same applies_to, and
 *      starts_on on the two flows that start a run; the words pass the blunt scan;
 *   2. a second copy writes nothing, not one record and not one change row;
 *   3. an office that holds a flow, and one whose only flow was deleted, get nothing from the copy;
 *   4. on a real start the first start copies, and a restart copies nothing;
 *   5. outside the copy, a flow whose stage has no why is still refused.
 *
 * THE TITLES AND STAGE COUNTS ARE WRITTEN HERE, not read from the shipped file, so a wrong count
 * in the file and the same wrong count in this test cannot agree with each other. The file is read
 * only by the scan, which must read what will actually ship.
 *
 * WHAT IS REAL HERE. The migrations, the record door, the office's own writer and the server's own
 * start are real. Every database is a temporary one this file makes; nothing reaches the live office.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, liveApp, theOfficesOwnId, type TestDb } from './helpers.ts'
import { FLOW_KIND } from '../src/shared/flow.ts'
import { FLOW_STARTING_EVENTS } from '../src/shared/flow-run.ts'
import { TWELVE_ID_CHARACTERS } from '../src/shared/record-id-shape.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import { THE_INSPECTOR, THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'

const REPO = join(import.meta.dirname, '..')
const THE_DEFAULT_FLOWS_FILE = 'src/config/default-flows.json'

/**
 * The ten flows, with the stage count each must have and the roles its source record is for. The
 * count is the number after the two stages that are true only of the office the words came from are
 * left out and the rest numbered again.
 */
const THE_TEN = [
  { title: 'Answering the person', stages: 5, evidenceAt: [], appliesTo: [THE_WORKER, THE_SUPERVISOR, THE_SECRETARY, THE_INSPECTOR], startsOn: [] },
  { title: 'Handing a requirement to a supervisor', stages: 5, evidenceAt: [], appliesTo: [THE_SUPERVISOR, THE_SECRETARY], startsOn: [] },
  { title: 'Running the work to done', stages: 8, evidenceAt: [], appliesTo: [THE_WORKER, THE_SUPERVISOR, THE_SECRETARY], startsOn: [FLOW_STARTING_EVENTS[0], FLOW_STARTING_EVENTS[1]] },
  { title: 'The check', stages: 4, evidenceAt: [], appliesTo: [THE_INSPECTOR], startsOn: [FLOW_STARTING_EVENTS[2]] },
  { title: 'Reviewing and releasing finished work', stages: 4, evidenceAt: [], appliesTo: [THE_SECRETARY], startsOn: [] },
  { title: 'Options for the person', stages: 6, evidenceAt: [], appliesTo: [THE_WORKER, THE_SUPERVISOR, THE_SECRETARY, THE_INSPECTOR], startsOn: [] },
  { title: 'The office report', stages: 4, evidenceAt: [], appliesTo: [THE_SECRETARY], startsOn: [] },
  { title: 'Backups', stages: 9, evidenceAt: [9], appliesTo: [THE_SECRETARY], startsOn: [] },
  { title: 'The decision reminder', stages: 6, evidenceAt: [1, 2, 3, 4, 5, 6], appliesTo: [THE_SECRETARY], startsOn: [] },
  { title: 'While the person is away', stages: 3, evidenceAt: [], appliesTo: [THE_WORKER, THE_SUPERVISOR, THE_SECRETARY, THE_INSPECTOR], startsOn: [] },
] as const

/** The sentence every copied flow carries, in place of a file it was declared in at the source office. */
const DECLARED_IN = "Copied from Mole Office's default flows at this office's first start."

/** The blunt words: the source office's name, and the two sentences that are true only of it. */
const THE_LOCAL_SENTENCES = ['only when developing mole office', 'only in the mole office project']

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': DEFAULT_WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface FlowStage {
  n: number
  does: string
  evidence?: string
}

interface FlowData {
  declared_in: string
  runs: string
  trigger: string
  stages: FlowStage[]
  leaves_behind: string
  applies_to: { scope: string; roles: string[]; rung?: number; project?: string }
  starts_on?: string[]
}

interface FlowRow {
  id: string
  title: string
  data: FlowData
  workspaceId: string
  origin: string
  deletedAt: string | null
}

let t: TestDb | null = null
let app: FastifyInstance | null = null

afterEach(async () => {
  await app?.close()
  t?.close()
  app = null
  t = null
})

async function aFreshOffice(): Promise<{ copy: typeof import('../src/server/lib/default-flows.ts') }> {
  t = await freshDb()
  // THE REAL APP IS BUILT SO THE ROLE CARDS ARE READ, as every start reads them: the copy's applies_to
  // check asks them, and asking before anything read them is an error by design.
  app = (await apiApp()).app
  await app.ready()
  return { copy: await import('../src/server/lib/default-flows.ts') }
}

/** Every flow record this office holds, deleted ones included unless asked for only the live ones. */
function flowRows(includeDeleted = false): FlowRow[] {
  const rows = t!.client.sqlite
    .prepare(
      `SELECT id, title, data, workspace_id AS workspaceId, origin, deleted_at AS deletedAt
         FROM records
        WHERE kind = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}
        ORDER BY title`,
    )
    .all(FLOW_KIND) as { id: string; title: string; data: string; workspaceId: string; origin: string; deletedAt: string | null }[]
  return rows.map((row) => ({ ...row, data: JSON.parse(row.data) as FlowData }))
}

function rowsIn(table: 'records' | 'changes'): number {
  return (t!.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

/** The one flow a test office files for itself, through the office's own record door. */
function oneFlowFiledByThePerson(): string {
  const record = t!.api.createRecord({
    kind: FLOW_KIND,
    title: 'One flow this office filed for itself',
    summary: 'Its own flow, before the copy runs.',
    workspaceId: DEFAULT_WORKSPACE,
    actor: { type: 'human', id: THE_PERSON },
    data: {
      declared_in: 'only in this office',
      runs: THE_SECRETARY,
      trigger: 'The person asks for it.',
      stages: [],
      leaves_behind: 'nothing yet',
      applies_to: { scope: 'general', roles: [THE_SECRETARY] },
    },
  })
  return record.id
}

/**
 * THE BLUNT SCAN. `owner` is looked for as a substring, so "owners" and "ownership" are caught too.
 * A record-id candidate is a run of twelve id characters: a real id has a digit, an underscore or a
 * capital after its first letter, and a twelve-letter English word is also a candidate, so the scan
 * is deliberately blunt and asks for no cleverness.
 */
function scanTheWords(where: string, text: string): void {
  const lower = text.toLowerCase()
  for (const word of ['owner', 'panelx']) {
    expect(lower.includes(word), `${where} contains "${word}"`).toBe(false)
  }
  for (const sentence of THE_LOCAL_SENTENCES) {
    expect(lower.includes(sentence), `${where} contains "${sentence}"`).toBe(false)
  }
  expect(text, where).not.toMatch(/\bS\d+\b/)
  expect(text, where).not.toMatch(/\bL\d+\b/)
  expect(text, where).not.toMatch(/\bchapter \d+/i)
  for (const candidate of text.match(TWELVE_ID_CHARACTERS) ?? []) {
    const looksLikeARecordId = /[0-9_]/.test(candidate) || /[A-Z]/.test(candidate.slice(1))
    expect(looksLikeARecordId, `${where} contains the record-id candidate "${candidate}"`).toBe(false)
  }
}

/** The flows a running server answers with, in the order the list sends them. */
async function theFlowsTheServerReads(api: string): Promise<{ id: string; title: string }[]> {
  const response = await fetch(`${api}/api/records?kind=${FLOW_KIND}&shape=full&limit=25`, { headers: AS_THE_PERSON })
  expect(response.status, await response.clone().text()).toBe(200)
  const body = (await response.json()) as { records: { id: string; title: string }[] }
  return body.records
}

describe('a fresh office', () => {
  it('gets exactly the ten general flows, with their stages, names, roles and starts', async () => {
    const { copy } = await aFreshOffice()
    expect(flowRows()).toEqual([])

    const did = copy.copyTheDefaultFlowsOnce()
    expect(did.copied).toBe(THE_TEN.length)
    expect(did.line).toBe(copy.theLineOfTheFlowsCopy({ held: 0, copied: THE_TEN.map((flow) => flow.title), project: DEFAULT_WORKSPACE }))

    const rows = flowRows()
    expect(rows.map((row) => row.title).sort()).toEqual(THE_TEN.map((flow) => flow.title).sort())
    for (const want of THE_TEN) {
      const got = rows.find((row) => row.title === want.title)!
      expect(got, `the copied flow "${want.title}"`).toBeDefined()
      expect(got.workspaceId).toBe(DEFAULT_WORKSPACE)
      expect(got.origin).toBe('authored')
      expect(got.data.declared_in).toBe(DECLARED_IN)
      expect(got.data.runs.length).toBeGreaterThan(0)
      expect(got.data.trigger.length).toBeGreaterThan(0)
      expect(got.data.leaves_behind.length).toBeGreaterThan(0)
      expect(got.data.applies_to.scope).toBe('general')
      expect([...got.data.applies_to.roles].sort()).toEqual([...want.appliesTo].sort())
      expect(got.data.applies_to.rung).toBeUndefined()
      expect(got.data.applies_to.project).toBeUndefined()
      expect(got.data.stages).toHaveLength(want.stages)
      expect(got.data.stages.filter((stage) => stage.evidence !== undefined).map((stage) => stage.n), `${want.title} evidence`).toEqual(want.evidenceAt)
      for (const [i, stage] of got.data.stages.entries()) {
        expect(stage.n, `${want.title} stage ${String(i + 1)}`).toBe(i + 1)
        expect(stage.does.length, `${want.title} stage ${String(i + 1)}`).toBeGreaterThan(0)
        if (stage.evidence !== undefined) expect(typeof stage.evidence, `${want.title} stage ${String(i + 1)} evidence`).toBe('string')
      }
      expect(got.data.starts_on ?? [], `${want.title} starts_on`).toEqual(want.startsOn)
    }

    // THE OFFICE WROTE THEM, as its own writes in the project a fresh office's chapters go to.
    const writers = t!.client.sqlite
      .prepare("SELECT DISTINCT actor_type || ' ' || actor_id AS who FROM changes WHERE record_id IN (SELECT id FROM records WHERE kind = ?)")
      .all(FLOW_KIND) as { who: string }[]
    expect(writers.map((writer) => writer.who)).toEqual([`system ${theOfficesOwnId(t!)}`])

    // THE SCAN, over every copied record's words and the file that will ship.
    for (const row of rows) scanTheWords(`the copied flow "${row.title}"`, `${row.title}\n${JSON.stringify(row.data)}`)
    scanTheWords(`the shipped file ${THE_DEFAULT_FLOWS_FILE}`, readFileSync(join(REPO, THE_DEFAULT_FLOWS_FILE), 'utf8'))
  })

  it('writes nothing the second time, not one record and not one change row', async () => {
    const { copy } = await aFreshOffice()
    expect(copy.copyTheDefaultFlowsOnce().copied).toBe(THE_TEN.length)
    const records = rowsIn('records')
    const changes = rowsIn('changes')
    const second = copy.copyTheDefaultFlowsOnce()
    expect(second.copied).toBe(0)
    expect(second.line).toBe(copy.theLineOfTheFlowsCopy({ held: THE_TEN.length, copied: [], project: DEFAULT_WORKSPACE }))
    expect(rowsIn('records')).toBe(records)
    expect(rowsIn('changes')).toBe(changes)
  })
})

describe('a flow written outside the copy', () => {
  it('is still refused when its stage has no why, so the copy is the only write let through', async () => {
    await aFreshOffice()
    let refusal: unknown = null
    try {
      t!.api.createRecord({
        kind: FLOW_KIND,
        title: 'A flow with a stage and no reason',
        workspaceId: DEFAULT_WORKSPACE,
        actor: { type: 'human', id: THE_PERSON },
        data: {
          declared_in: 'only in this office',
          runs: THE_SECRETARY,
          trigger: 'The person asks for it.',
          stages: [{ n: 1, does: 'A stage with no reason.' }],
          leaves_behind: 'nothing yet',
          applies_to: { scope: 'general', roles: [THE_SECRETARY] },
        },
      })
    } catch (error) {
      refusal = error
    }
    expect(refusal, 'a flow with a stage and no why').toBeDefined()
    expect((refusal as { code?: string }).code, refusal instanceof Error ? refusal.message : String(refusal)).toBe('flowStepNoWhy')
    expect(flowRows()).toEqual([])
  })
})

describe('an office that already holds a flow', () => {
  it('gets nothing from the copy when it holds one flow', async () => {
    const { copy } = await aFreshOffice()
    const own = oneFlowFiledByThePerson()
    const before = t!.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(own)
    const records = rowsIn('records')
    const changes = rowsIn('changes')

    const did = copy.copyTheDefaultFlowsOnce()
    expect(did.copied).toBe(0)
    expect(did.line).toBe(copy.theLineOfTheFlowsCopy({ held: 1, copied: [], project: DEFAULT_WORKSPACE }))
    expect(rowsIn('records')).toBe(records)
    expect(rowsIn('changes')).toBe(changes)
    expect(t!.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(own)).toEqual(before)
    expect(flowRows().map((row) => row.title)).toEqual(['One flow this office filed for itself'])
  })

  it('gets nothing when its only flow was deleted, and the deleted flow does not come back', async () => {
    const { copy } = await aFreshOffice()
    const own = oneFlowFiledByThePerson()
    const gone = t!.api.deleteRecord(own, { type: 'human', id: THE_PERSON })
    expect(gone.alreadyDeleted, JSON.stringify(gone)).toBe(false)
    expect(gone.record.deletedAt, JSON.stringify(gone)).toBeTruthy()
    expect(flowRows()).toEqual([])

    const did = copy.copyTheDefaultFlowsOnce()
    expect(did.copied).toBe(0)
    expect(did.line).toBe(copy.theLineOfTheFlowsCopy({ held: 1, copied: [], project: DEFAULT_WORKSPACE }))
    expect(flowRows()).toEqual([])
    expect(flowRows(true).map((row) => row.id)).toEqual([own])
  })
})

describe('a real start of a fresh office, and a restart', () => {
  it('copies the ten at the first start and copies nothing at the restart', async () => {
    t = await freshDb()
    const file = t.file
    let firstIds: string[] = []
    const first = await liveApp({ name: 'default-flows-first', viewport: { width: 1440, height: 1000 }, workspace: DEFAULT_WORKSPACE, database: file })
    try {
      const rows = await theFlowsTheServerReads(first.api)
      expect(rows.map((row) => row.title).sort()).toEqual(THE_TEN.map((flow) => flow.title).sort())
      firstIds = rows.map((row) => row.id).sort()
    } finally {
      await first.stop()
    }

    const second = await liveApp({ name: 'default-flows-again', viewport: { width: 1440, height: 1000 }, workspace: DEFAULT_WORKSPACE, database: file })
    try {
      const rows = await theFlowsTheServerReads(second.api)
      expect(rows.map((row) => row.id).sort()).toEqual(firstIds)
    } finally {
      await second.stop()
    }
  }, 240_000)
})
