// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RENAME SAYS WHAT ELSE IS CALLED THIS, and it says exactly what filing one says.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/records` has answered `sameTitle` since 17 August 2026. Before that, a repeated title
 * was refused. The rule now: **an id is identity, a title is presentation, and titles may repeat.**
 * So a create stores the record and reports what else answers to the name.
 *
 * `PATCH /api/records/:id` did not ask the question at all. Both writes put a name into a project,
 * and only one of them said anything about it — so filing "Wrist camera" beside an existing "Wrist
 * camera" told you, and RENAMING a record to "Wrist camera" did not. The record page had a comment
 * where the hint should be, saying it could not say anything true here yet.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE AGREEMENT TEST IS THE IMPORTANT ONE
 * ---------------------------------------------------------------------------------------
 *
 * "The live records in this project called exactly this" is now worked out in two places: inside
 * `createRecordWithReport` in lib/records.ts, and in the PATCH route in api/records.ts. That is the
 * defect this repository keeps producing, and the fix available here is the third one CLAUDE.md
 * lists: make a test fail when the two disagree. Both call the same two readers — `recordsByTitle`
 * and `liveMatches` — so the rule about what a typed name means is stated once; this file is what
 * fails if one of them ever grows a filter the other does not have.
 *
 * The comparison is exact, including the order. `recordsByTitle` orders oldest first with the id
 * breaking a tie, on purpose, so two answers listing the same records differently would be two
 * different facts.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { RecordKind } from '../src/shared/types.ts'
import { freshDb, type TestDb } from './helpers.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

let h: Harness
/** This case's own project, so its records are the only ones a name is compared with. */
let workspace = 'default'
let caseNumber = 0
let createWorkspace: typeof import('../src/server/lib/workspaces.ts')['createWorkspace']

/** What an agent's requests carry. The same three headers every write in this product needs. */
const asAgent = (workspace: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
  'x-mole-office-workspace': workspace,
})

beforeAll(() => {
  // ENOUGH OF A BROWSER TO IMPORT ONE COMPONENT. The last test in this file imports the drawer that
  // shows this answer to a person, and src/web/api.ts reads window.localStorage at module scope to
  // restore which project you are looking at. The same stand-in tests/graph-edit.test.ts uses, for
  // the same reason, and nothing in it is under test. The server side of this file never reads it.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

beforeAll(async () => {
  const db = await freshDb()
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
  h = { db, app }
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  workspace = `same-title-case-${String(caseNumber)}`
  createWorkspace({ id: workspace, title: 'Same title' })
})

afterAll(async () => {
  await h.app.close()
  h.db.close()
})

/** One named record, and the whole reply that filing it produced. */
interface Reply {
  status: number
  body: Record<string, unknown>
}

async function file(title: string): Promise<Reply> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(workspace),
    payload: { kind: 'task', title, data: { state: 'todo' } },
  })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

async function patch(id: string, body: Record<string, unknown>): Promise<Reply> {
  const res = await h.app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: asAgent(workspace),
    payload: body,
  })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> }
}

/** The id of the record a reply carries. */
function idOf(reply: Reply): string {
  const record = reply.body['record'] as { id: string } | undefined
  if (record === undefined) throw new Error(`no record in the reply: ${JSON.stringify(reply.body)}`)
  return record.id
}

type Named = { id: string; kind: RecordKind; title: string }

/** What else the reply says is called this, or null when it said nothing. */
function sameTitleOf(reply: Reply): Named[] | null {
  return (reply.body['sameTitle'] as Named[] | undefined) ?? null
}

describe('what else is already called this', () => {
  it('is answered by a create, which is the behaviour a rename had to match', async () => {
    const first = await file('Wrist camera')
    expect(first.status).toBe(201)
    // The control. Filing the FIRST record of that name says nothing, because nothing else holds it.
    expect(sameTitleOf(first)).toBeNull()

    const second = await file('Wrist camera')
    expect(second.status).toBe(201)
    expect(sameTitleOf(second)).toEqual([{ id: idOf(first), kind: 'task', title: 'Wrist camera' }])
  })

  it('is answered by a rename, naming every live record that already held the name', async () => {
    const first = await file('Wrist camera')
    const second = await file('Wrist camera')
    const third = await file('Left gripper')

    const renamed = await patch(idOf(third), { title: 'Wrist camera' })
    expect(renamed.status).toBe(200)
    // Sorted by id here, and NOT because the order is undefined. `recordsByTitle` orders oldest
    // first with the id breaking a tie, and `created_at` is a wall clock to the second — three
    // records filed inside one second are all tied, so the order this run produces is the id order
    // and asserting the filing order would be asserting how fast the machine is. The order the two
    // routes agree on is checked in the next test, where both answers come from the same reader.
    const byId = (rows: Named[] | null): Named[] => [...(rows ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(byId(sameTitleOf(renamed))).toEqual(
      byId([
        { id: idOf(first), kind: 'task', title: 'Wrist camera' },
        { id: idOf(second), kind: 'task', title: 'Wrist camera' },
      ]),
    )
  })

  it('answers a rename with exactly what a create at the same moment would answer', async () => {
    // THE DRIFT TEST. Two pieces of code work this out and this is what fails if they ever differ.
    await file('Wrist camera')
    await file('Wrist camera')
    const moving = await file('Left gripper')

    const renamed = await patch(idOf(moving), { title: 'Wrist camera' })
    const filed = await file('Wrist camera')

    // A create asks before its own row exists, so its answer holds the renamed record too. Take
    // that one out and the two answers are the same list, in the same order, or the two readings
    // have parted company.
    const fromCreate = (sameTitleOf(filed) ?? []).filter((one) => one.id !== idOf(moving))
    expect(sameTitleOf(renamed)).toEqual(fromCreate)
    expect(fromCreate.length).toBe(2)
  })

  it('does not report the record being renamed, which would be telling you about yourself', async () => {
    const alone = await file('Wrist camera')
    // The name is already this record's own. Nothing else holds it, so there is nothing to say.
    const again = await patch(idOf(alone), { title: 'Wrist camera' })
    expect(again.status).toBe(200)
    expect(sameTitleOf(again)).toBeNull()
    expect(again.body['sameTitleNote']).toBeUndefined()
  })

  it('says nothing on a patch that never named a title', async () => {
    await file('Wrist camera')
    const other = await file('Wrist camera')
    // The record shares its name with another and this patch does not touch the name. Answering
    // here would put a paragraph about a repeat on top of every ordinary edit.
    const edited = await patch(idOf(other), { dataPatch: { state: 'doing' } })
    expect(edited.status).toBe(200)
    expect(sameTitleOf(edited)).toBeNull()
    expect(edited.body['sameTitleNote']).toBeUndefined()
  })

  it('counts live records only, so a deleted one holding the name is not offered', async () => {
    const ghost = await file('Ghost')
    const gone = await h.app.inject({ method: 'DELETE', url: `/api/records/${idOf(ghost)}`, headers: asAgent(workspace) })
    expect(gone.statusCode).toBe(200)

    // Mole Office never really deletes, so the deleted row keeps the name for ever. A name somebody
    // types now is a belief about a record that is CURRENT, and offering a deleted one would offer
    // a link that shows as broken the moment it is made.
    const moving = await file('Left gripper')
    const renamed = await patch(idOf(moving), { title: 'Ghost' })
    expect(sameTitleOf(renamed)).toBeNull()

    // And the create path agrees, which is the whole point of both reading the same two functions.
    expect(sameTitleOf(await file('Ghost'))).toEqual([{ id: idOf(moving), kind: 'task', title: 'Ghost' }])
  })



  it('reports a title the record was renamed AWAY from as nobody else holding it', async () => {
    // A rename leaves the old name behind. The answer is about the name the record now holds, and
    // the record that used to hold the old one is gone from that name entirely.
    const first = await file('Wrist camera')
    const renamed = await patch(idOf(first), { title: 'Wrist camera, left' })
    expect(sameTitleOf(renamed)).toBeNull()
    // Nothing is called "Wrist camera" any more, and a create proves it from the other side.
    expect(sameTitleOf(await file('Wrist camera'))).toBeNull()
  })
})
