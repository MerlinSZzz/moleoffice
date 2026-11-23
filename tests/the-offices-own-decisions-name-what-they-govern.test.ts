// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN DECISION WRITERS SAY WHAT EACH DECISION GOVERNS, SO EVERY DECISION MEETS THE DOOR.
 *
 * What is proved, against a test office of its own:
 *   1. `whatTheOfficeSendsItGoverns` (src/server/lib/what-a-record-names.ts) adds nothing when the press said one of the
 *      three fields. Otherwise it carries the live pages the replaced decisions named, else their whole project, else
 *      the live pages the writer knows of; it moves their files to governsFiles; it keeps their nothingFits entries
 *      with a nearest page that is no longer live left out; and with nothing left it says why in one entry.
 *   2. Confirming a tool category files a decision that governs that category.
 *   3. Choosing again carries what the decision it replaces governed.
 *   4. Choosing again on an old decision that holds a path in governs moves the path to governsFiles, and the new
 *      decision is not refused: through the door, with the old row written below it as an old row is.
 *
 * The other writers, answers in a report and a residency confirmed or declined, send what case 1 proves through the
 * same function or a nothingFits entry of their own; their own tests file through them.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

function aRecord(kind: 'module' | 'task' | 'tool_category', title: string): string {
  const data = kind === 'module' ? { context: 'made up' } : kind === 'tool_category' ? { says: 'Made-up tools.' } : {}
  return t.api.createRecord({ kind, title, data, workspaceId: 'default', actor: t.api.HUMAN }).id
}

describe("the office's own decisions name what they govern", () => {
  it('1: what a writer sends: what the press said, what the replaced named, the pages it knows, or why none', async () => {
    const { whatTheOfficeSendsItGoverns: send } = await import('../src/server/lib/what-a-record-names.ts')
    const { MISSING_KIND_NOT_SAID } = await import('../src/shared/what-a-record-names.ts')
    const live = aRecord('module', 'Test: the kiln module')
    const other = aRecord('module', 'Test: the glaze module')
    const gone = aRecord('module', 'Test: a module that was deleted')
    t.api.deleteRecord(gone, t.api.HUMAN)
    const task = aRecord('task', 'Test: a task, which is not a page')
    const why = 'A made-up reason no page is named.'

    // THE PRESS SAID: nothing is added, and the door checks what it said.
    expect(send({ said: { governs: [{ record: live }] }, workspaceId: 'default', pages: [other], whyNoPage: why })).toEqual({})
    expect(send({ said: { nothingFits: [] }, workspaceId: 'default', pages: [other], whyNoPage: why })).toEqual({})

    // WHAT THE REPLACED DECISION NAMED: its live pages, its files from both parts, its entries with a dead nearest left out.
    expect(
      send({
        said: { option_taken: 'Made up.' },
        workspaceId: 'default',
        replaced: [
          {
            governs: [{ record: live }, { record: gone }, { path: 'src/kiln.ts' }],
            governsFiles: ['src/glaze'],
            nothingFits: [{ missing: 'flow', what: 'the firing order', nearest: gone }],
          },
        ],
        pages: [other],
        whyNoPage: why,
      }),
    ).toEqual({ governs: [{ record: live }], governsFiles: ['src/kiln.ts', 'src/glaze'], nothingFits: [{ missing: 'flow', what: 'the firing order' }] })

    // ITS WHOLE PROJECT, when it named no live page.
    expect(send({ said: undefined, workspaceId: 'default', replaced: [{ governs: [{ wholeProject: true }] }], pages: [other], whyNoPage: why })).toEqual({
      governs: [{ wholeProject: true }],
    })

    // THE PAGES THE WRITER KNOWS, only the live ones of the page kinds.
    expect(send({ said: undefined, workspaceId: 'default', replaced: [{ governs: [{ record: gone }] }], pages: [task, gone, other], whyNoPage: why })).toEqual({
      governs: [{ record: other }],
    })

    // NOTHING LEFT: one entry says why, with the missing kind not said.
    expect(send({ said: undefined, workspaceId: 'default', pages: [task], whyNoPage: why })).toEqual({ nothingFits: [{ missing: MISSING_KIND_NOT_SAID, what: why }] })
  })

  it('2: confirming a tool category files a decision that governs the category', async () => {
    const category = aRecord('tool_category', 'Test: kiln tools')
    const reply = await app.inject({ method: 'POST', url: `/api/toolset/categories/${category}/confirm`, headers: PERSON, payload: { why: 'Kiln tools are a kind we keep needing.' } })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBeLessThan(300)
    const decision = (reply.json() as { decision: { id: string } }).decision.id
    expect(t.api.getRecord(decision)?.data?.['governs']).toEqual([{ record: category }])
  })

  it('3: choosing again carries what the replaced decision governed', async () => {
    const module = aRecord('module', 'Test: the chimney module')
    const first = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: PERSON,
      payload: {
        kind: 'decision',
        title: 'Test: the chimney is swept monthly',
        data: { option_taken: 'Monthly.', because: 'A made-up reason.', replaces: [], governs: [{ record: module }], governsFiles: ['src/chimney.ts'] },
      },
    })
    expect(first.statusCode, first.body.slice(0, 400)).toBe(201)
    const again = await app.inject({
      method: 'POST',
      url: `/api/records/${String(first.json().record.id)}/choose-again`,
      headers: PERSON,
      payload: { title: 'Test: the chimney is swept weekly', data: { option_taken: 'Weekly.', because: 'A made-up reason, later.' } },
    })
    expect(again.statusCode, again.body.slice(0, 400)).toBeLessThan(300)
    const id = (again.json() as { decision: { id: string } }).decision.id
    const data = t.api.getRecord(id)?.data ?? {}
    expect({ governs: data['governs'], governsFiles: data['governsFiles'] }).toEqual({ governs: [{ record: module }], governsFiles: ['src/chimney.ts'] })
  })

  it('4: choosing again on an old decision with a path in governs moves the path to governsFiles', async () => {
    const module = aRecord('module', 'Test: the flue module')
    const first = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: PERSON,
      payload: {
        kind: 'decision',
        title: 'Test: the flue is checked yearly',
        data: { option_taken: 'Yearly.', because: 'A made-up reason.', replaces: [], governs: [{ record: module }] },
      },
    })
    expect(first.statusCode, first.body.slice(0, 400)).toBe(201)
    const oldId = String(first.json().record.id)
    // AN OLD ROW, written below the door as one stored before the files part was: a path in governs, and nothing else.
    const held = (t.api.getRecord(oldId)?.data ?? {}) as Record<string, unknown>
    writeDataBypassingTheGate(t, oldId, { ...held, governs: [{ path: 'src/flue.ts' }] })

    const again = await app.inject({
      method: 'POST',
      url: `/api/records/${oldId}/choose-again`,
      headers: PERSON,
      payload: { title: 'Test: the flue is checked monthly', data: { option_taken: 'Monthly.', because: 'A made-up reason, later.' } },
    })
    expect(again.statusCode, again.body.slice(0, 400)).toBeLessThan(300)
    const id = (again.json() as { decision: { id: string } }).decision.id
    const data = t.api.getRecord(id)?.data ?? {}
    expect(data['governsFiles']).toEqual(['src/flue.ts'])
    expect(JSON.stringify(data['governs'] ?? []), 'no path is carried in governs').not.toContain('src/flue.ts')
  })
})
