// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT BOUNDARY, OVER HTTP, WITH TWO PROJECTS IN ONE DATABASE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS BLACK-BOX AND WHY IT HAS TO BE
 * ---------------------------------------------------------------------------------------
 *
 * Every function under src/server/lib now takes a `workspaceId`, so a unit test of any of them
 * proves only that a parameter is used. The failure this work exists to end was never in those
 * functions — it was that NOTHING PASSED THE PARAMETER. The survey measured it end to end: `GET
 * /api/records` returned 389 live records across two projects, `POST /api/links` joined a robotics
 * record to a Mole Office one and answered 201, and a title typed inside one project resolved to a
 * record in another. Each of those was a route that read one undivided pile while every query
 * underneath it was ready to be scoped.
 *
 * So every test below goes through `app.inject`, with the header a real agent sends, against a
 * database holding two workspaces. A test that called `listRecords('robotics')` and asserted it
 * returned robotics records would have passed on the day the defect shipped.
 *
 * ---------------------------------------------------------------------------------------
 * THE NEXT-RECORD QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * A migration is judged on records 1..N; a boundary is judged on record N+1. The last describe
 * block asks it directly: where does the next record land, what happens when nothing says, and
 * what happens when what it says is not a project this installation has. A migration that placed
 * 385 rows perfectly and then filed every subsequent write into whichever project was default
 * would have fixed the past and left the present broken.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'

let t: TestDb
let app: FastifyInstance

/**
 * The two projects every test below works in, plus the default one `freshDb` already has. They are
 * made afresh for each case, so a reading that answers for one project sees only that case's rows.
 */
let PANELX = 'panelx'
let ROBOTICS = 'robotics'
/** Every project the office held before this case made its own pair. */
let projectsAtStart: string[] = []
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  PANELX = `panelx-case-${String(caseNumber)}`
  ROBOTICS = `robotics-case-${String(caseNumber)}`
  projectsAtStart = await projectIds()
  for (const [id, title] of [
    [PANELX, 'Mole Office'],
    [ROBOTICS, 'Robotics'],
  ]) {
    const res = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
    expect(res.statusCode, res.body).toBe(201)
  }
})

/** Every project the office lists, read whole, for the two cases about the list itself. */
async function projectIds(): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/workspaces' })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { workspaces: { id: string }[] }).workspaces.map((one) => one.id).sort()
}

/** Headers as an agent working in one project sends them. */
const inWorkspace = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': id,
})

/** File a record through the route, in one project, and hand back its id. */
async function file(workspaceId: string, kind: string, title: string, data: unknown = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: inWorkspace(workspaceId),
    payload: { kind, title, data },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

// ================================================================================ reads

describe('a read answers about one project', () => {
  it('lists only the records of the workspace the request names', async () => {
    await file(PANELX, 'module', 'The export')
    await file(ROBOTICS, 'module', 'The gripper')

    const mine = await app.inject({ method: 'GET', url: '/api/records', headers: inWorkspace(ROBOTICS) })
    const titles = (mine.json() as { records: { title: string }[] }).records.map((r) => r.title)
    expect(titles).toEqual(['The gripper'])

    // And the other project really does hold its own, so this is not a comparison against an
    // empty database — the failure it guards against is a filter that answers nothing at all.
    const theirs = await app.inject({ method: 'GET', url: '/api/records', headers: inWorkspace(PANELX) })
    expect((theirs.json() as { records: { title: string }[] }).records.map((r) => r.title)).toEqual(['The export'])
  })

  it('refuses to serve a record by id to a request working in another project', async () => {
    const id = await file(ROBOTICS, 'module', 'The gripper')

    const own = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: inWorkspace(ROBOTICS) })
    expect(own.statusCode).toBe(200)

    // MEASURED BEFORE THIS EXISTED: the same request with no workspace served the robotics record
    // in full, 200, with `workspaceId` in the body and nothing anywhere saying a boundary had been
    // crossed. A 404 is the right answer and not a 403: nothing here authenticates anybody, and
    // the record genuinely is not in the project this request is about.
    const other = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: inWorkspace(PANELX) })
    expect(other.statusCode).toBe(404)
    expect(other.body).toContain(PANELX)
  })

  it('answers the change log, attention and the unconsumed query about one project each', async () => {
    const source = await file(ROBOTICS, 'claim', 'The gripper holds at effort 13', { state: 'measured', evidence: ['n=40'] })
    await file(PANELX, 'claim', 'The export is byte-identical when nothing changed', { state: 'measured', evidence: ['two builds'] })

    for (const [url, key] of [
      ['/api/changes', 'changes'],
      ['/api/queries/unconsumed', 'records'],
    ] as const) {
      const res = await app.inject({ method: 'GET', url, headers: inWorkspace(ROBOTICS) })
      expect(res.statusCode, `${url}: ${res.body}`).toBe(200)
      const rows = (res.json() as Record<string, { recordId?: string; id?: string }[]>)[key] ?? []
      expect(rows.length, `${url} answered about nothing, so it proves nothing`).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.recordId ?? row.id, `${url} carried a record from another project`).toBe(source)
      }
    }

    const attention = await app.inject({ method: 'GET', url: '/api/attention', headers: inWorkspace(ROBOTICS) })
    expect(attention.statusCode).toBe(200)
    // The ranking is RELATIVE, so a mixed reading is not merely untidy: the busier project decides
    // what the quieter one's urgent work is worth.
    const body = attention.body
    expect(body).not.toContain('The export is byte-identical when nothing changed')
  })
})

// ================================================================================ titles

describe('a title resolves inside the project it was typed in', () => {
  it('reaches this project\'s record when both projects have one of that name', async () => {
    const mine = await file(ROBOTICS, 'module', 'Tray clamp')
    const theirs = await file(PANELX, 'module', 'Tray clamp')
    expect(mine).not.toBe(theirs)

    const from = await file(ROBOTICS, 'claim', 'It holds at effort 13', { state: 'measured', evidence: ['n=40'] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: inWorkspace(ROBOTICS),
      payload: { fromId: from, toTitle: 'Tray clamp', type: 'relates_to' },
    })
    expect(res.statusCode, res.body).toBe(201)
    // MEASURED BEFORE THE FIX: this resolved to the OTHER project's Tray clamp and replied "now
    // relates to Tray clamp", so the reply looked right and the link was in the wrong project.
    expect((res.json() as { to: { id: string } }).to.id).toBe(mine)
  })

  it('says a name is not here rather than reaching into another project for it', async () => {
    await file(PANELX, 'module', 'The export')
    const from = await file(ROBOTICS, 'note', 'A note', { body: 'x' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: inWorkspace(ROBOTICS),
      payload: { fromId: from, toTitle: 'The export' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('The export')
  })
})

// ================================================================================ links

describe('a link across the boundary is refused, loudly, naming both', () => {
  it('refuses by id and stores nothing', async () => {
    // The whole office's links, read before this case writes anything.
    const linksBefore = (t.client.sqlite.prepare('SELECT count(*) AS n FROM links').get() as { n: number }).n
    const robot = await file(ROBOTICS, 'module', 'The gripper')
    const panel = await file(PANELX, 'module', 'The export')

    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: inWorkspace(ROBOTICS),
      payload: { fromId: robot, toId: panel, type: 'relates_to' },
    })
    // MEASURED BEFORE THE FIX: 201, and the stored row said workspace_id 'default' — so the
    // boundary was crossed silently AND the link was filed in a third project neither end was in.
    // 409 rather than 400: the request is well formed and the database's state is what refuses it.
    expect(res.statusCode, res.body).toBe(409)
    // Both records and both projects, because "these two are not in the same project" is only
    // actionable if you can see which is where.
    for (const fragment of [robot, panel, ROBOTICS, PANELX]) {
      expect(res.body, `the refusal does not name ${fragment}`).toContain(fragment)
    }

    const stored = t.client.sqlite.prepare('SELECT count(*) AS n FROM links').get() as { n: number }
    expect(stored.n, 'a link was stored by a request that was refused').toBe(linksBefore)
  })

  it('refuses the same thing when the far end is named by title', async () => {
    const linksBefore = (t.client.sqlite.prepare('SELECT count(*) AS n FROM links').get() as { n: number }).n
    const robot = await file(ROBOTICS, 'module', 'The gripper')
    await file(PANELX, 'module', 'The export')
    // Named in the OTHER project, so title resolution finds it and the workspace check is what
    // has to refuse it — rather than the 404 that would refuse it for the wrong reason.
    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: inWorkspace(PANELX),
      payload: { fromId: robot, toTitle: 'The export' },
    })
    expect(res.statusCode).not.toBe(201)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM links').get()).toEqual({ n: linksBefore })
  })
})

// ================================================================================ discovery

describe('an agent can ask which project it is in and which exist', () => {
  it('GET /api names the current workspace, how to change it, and where the list is', async () => {
    const res = await app.inject({ method: 'GET', url: '/api', headers: inWorkspace(ROBOTICS) })
    expect(res.statusCode).toBe(200)
    const index = res.json() as { workspace: Record<string, unknown> }
    expect(index.workspace.current).toBe(ROBOTICS)
    expect(index.workspace.stated).toBe(true)
    // The header's own sentence has to say the three things an agent cannot work without: that a
    // request with none is answered from the default, that an unknown id is refused rather than
    // created, and that a cross-project link is refused.
    const sentence = String(index.workspace['x-mole-office-workspace'])
    expect(sentence).toContain(DEFAULT_WORKSPACE)
    expect(sentence).toContain('REFUSED')
    expect(sentence).toContain('different workspaces')
    expect(String(index.workspace.listing)).toContain('GET /api/workspaces')
  })

  it('says which workspace a request that named none was answered from', async () => {
    const res = await app.inject({ method: 'GET', url: '/api' })
    const index = res.json() as { workspace: { current: string; stated: boolean } }
    expect(index.workspace.current).toBe(DEFAULT_WORKSPACE)
    // The important half: it says the request did not choose, so "my writes are landing in default"
    // is answerable without reading any source.
    expect(index.workspace.stated).toBe(false)
  })

  it('GET /api/kinds says a record is filed in one project, beside how to write one', async () => {
    // The other half of "what does a POST need". A caller that read only this page would otherwise
    // learn every field a record takes and nothing about the boundary its record lands behind.
    const res = await app.inject({ method: 'GET', url: '/api/kinds' })
    expect(res.statusCode).toBe(200)
    const said = String((res.json() as { workspace: string }).workspace)
    expect(said).toContain('x-mole-office-workspace')
    expect(said).toContain('GET /api/workspaces')
    expect(said).toContain('refused')
  })

  it('GET /api/workspaces lists every project with how much is in it', async () => {
    await file(ROBOTICS, 'module', 'The gripper')
    const res = await app.inject({ method: 'GET', url: '/api/workspaces', headers: inWorkspace(ROBOTICS) })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      workspaces: { id: string; records: number; isDefault: boolean }[]
      current: { id: string; stated: boolean }
    }
    expect(body.workspaces.map((w) => w.id).sort()).toEqual([...projectsAtStart, PANELX, ROBOTICS].sort())
    expect(one(body.workspaces.filter((w) => w.id === ROBOTICS), 'the robotics row').records).toBe(1)
    expect(one(body.workspaces.filter((w) => w.isDefault), 'exactly one default').id).toBe(DEFAULT_WORKSPACE)
    expect(body.current).toEqual({ id: ROBOTICS, stated: true })
  })

  it('is the ONE endpoint that answers about all of them, so a project can be discovered from outside it', async () => {
    // A caller that could only see the workspace it was already in could never find the one it
    // wanted. Asked from `default`, the list still names both others.
    const res = await app.inject({ method: 'GET', url: '/api/workspaces' })
    expect((res.json() as { workspaces: { id: string }[] }).workspaces.map((w) => w.id).sort()).toEqual(
      [...projectsAtStart, PANELX, ROBOTICS].sort(),
    )
  })
})

// ================================================================================ the header

describe('the header is refused in the same shapes the actor headers are', () => {
  it('refuses a workspace that does not exist, naming the ones that do', async () => {
    const title = 'A note into a project nobody has'
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...inWorkspace('roboticss'), 'x-mole-office-workspace': 'roboticss' },
      payload: { kind: 'note', title, data: { body: 'x' } },
    })
    // The misspelt-actor-header defect, one door along: without the registry this would have filed
    // the write into a project nobody has, and nothing spelling it right would ever find it.
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('roboticss')
    expect(res.body).toContain(ROBOTICS)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE title = ?').get(title)).toEqual({ n: 0 })
  })

  it('refuses a header that is present and blank rather than reading it as absence', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/records',
      headers: { 'x-mole-office-workspace': '' },
    })
    expect(res.statusCode).toBe(400)
    // An unset variable in a client's header template produces exactly this, and reading it as
    // absence would answer about the default project rather than the one the caller meant.
    expect(res.body).toContain('blank')
  })

  it('refuses an id that is not the shape an id may have', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/records',
      headers: { 'x-mole-office-workspace': '../etc' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('../etc')
  })
})

// ================================================================================ record N+1

describe('the next record — what happens after the migration has run', () => {
  it('lands in the project the request named, not the one the migration used', async () => {
    const id = await file(ROBOTICS, 'problem', 'The wrist camera loses the hand below 300 mm', {
      state: 'open',
      symptom: 'the hand leaves the frame',
    })
    const row = t.client.sqlite.prepare('SELECT workspace_id FROM records WHERE id = ?').get(id) as { workspace_id: string }
    expect(row.workspace_id).toBe(ROBOTICS)
  })

  it('lands in the STATED DEFAULT when the request says nothing, and the answer says so', async () => {
    // Not a guess and not a refusal. A `curl` with no headers, and the browser, both arrive here,
    // and `GET /api` says in the same words where they land — which is the difference between a
    // default and an accident.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      payload: { kind: 'note', title: 'Filed by something that said nothing', data: { body: 'x' } },
    })
    expect(res.statusCode, res.body).toBe(201)
    const id = (res.json() as { record: { id: string } }).record.id
    const row = t.client.sqlite.prepare('SELECT workspace_id FROM records WHERE id = ?').get(id) as { workspace_id: string }
    expect(row.workspace_id).toBe(DEFAULT_WORKSPACE)

    const index = await app.inject({ method: 'GET', url: '/api' })
    expect((index.json() as { workspace: { current: string } }).workspace.current).toBe(DEFAULT_WORKSPACE)
  })

  it('is REFUSED, and stores nothing, when what the request said is not a project this installation has', async () => {
    // THE AMBIGUOUS WRITE. The caller named a project; the installation does not have it. There is
    // no honest place for this row — filing it under the default would put robotics work in the
    // unassigned pile and report success — so nothing is written and the refusal names the choices.
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-workspace': 'the-slam-project' },
      payload: { kind: 'note', title: 'Filed into a project nobody has', data: { body: 'x' } },
    })
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('the-slam-project')
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get()).toEqual(before)
  })

  it('files a block into its pipeline\'s project, whatever the request says', async () => {
    // A block's project is not a second fact: it is the pipeline's. A request that named another
    // project must not be able to split a pipeline across the boundary — and the check is that
    // the block follows the pipeline rather than the header.
    const blocksBefore = new Set(
      (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'block'").all() as { id: string }[]).map((one) => one.id),
    )
    const pipeline = await file(ROBOTICS, 'pipeline', 'Handover v3', { blockIds: [] })
    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${pipeline}/blocks`,
      headers: inWorkspace(ROBOTICS),
      payload: { name: 'Sense the pot', state: 'todo' },
    })
    expect(res.statusCode, res.body).toBe(201)
    const rows = t.client.sqlite.prepare("SELECT id, workspace_id FROM records WHERE kind = 'block'").all() as {
      id: string
      workspace_id: string
    }[]
    // THE WHOLE TABLE, read before and after: this case added exactly one block, and it is here.
    const added = rows.filter((row) => !blocksBefore.has(row.id))
    expect(added).toHaveLength(1)
    expect(one(added, 'the block').workspace_id).toBe(ROBOTICS)
  })

  it('writes the change row into the same project as the record it is about', async () => {
    const id = await file(ROBOTICS, 'note', 'A robotics note', { body: 'x' })
    const rows = t.client.sqlite
      .prepare('SELECT workspace_id FROM changes WHERE record_id = ?')
      .all(id) as { workspace_id: string | null }[]
    expect(rows.length).toBeGreaterThan(0)
    // Derived rather than passed in, so the two cannot disagree — `changes` is the daily view and
    // the attention rule's input, and a change filed in another project would show one project's
    // day inside another's.
    for (const row of rows) expect(row.workspace_id).toBe(ROBOTICS)
  })
})
