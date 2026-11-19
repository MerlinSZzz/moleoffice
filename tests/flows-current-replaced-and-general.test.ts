// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOWS LIST: CURRENT FLOWS FIRST, THE REPLACED ONES FOLDED, THE GENERAL ONES AS GENERAL, AND WHOM A FLOW IS FOR.
 * Wave 13p round 40. The flows page showed fifty flows and nothing said what they were, and a general
 * flow is to be sorted as general. Proposal Ink4403JeASI part 5, gaps 2, 3 and 5. Two of the owner's
 * decisions stand.
 *
 * What is proved, against a test office of its own with flows in three projects:
 *   1. A flow may supersede a flow in another project. The link is filed in the newer flow's project. Every other link
 *      across a project is still refused, a `supersedes` from a flow to a record that is not a flow among them.
 *   2. A page of flows reads each project's own current flows. A flow another live flow supersedes is left out of
 *      them and counted under `replaced`; `?replaced=show` hands those back, each with what replaced it. A flow whose
 *      `applies_to.scope` is general is left out of them too and stands in `general`, read from every project,
 *      whichever projects were asked. A replaced general flow is replaced, not general.
 *   3. `applies_to` is stored when it says whom the flow is for in words the office can check, and refused with the
 *      code flowAppliesToUnreadable otherwise: a role that is not a role card, a rung not on the tree, a special flow
 *      with no project, a general flow with one, a project that is not there, no roles, or a key it does not hold.
 *   4. `?role=` keeps the flows that reach that role, by name or by rung, and counts the ones nobody classified.
 *   5. PATCH /api/flows/<id> changes a flow's trigger, who runs it and whom it is for, in its own project when
 *      `?projects=` names it, after the same version check as the stage doors.
 *
 * Three-run proof: node tools/run-named-tests.mjs tests/flows-current-replaced-and-general.test.ts
 * The mutations it is proved against are written in the round's report.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'garden', title: 'Garden' })
  createWorkspace({ id: 'kitchen', title: 'Kitchen' })
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

const AS = (project: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': project,
})

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, project = 'default'): Promise<{ status: number; body: Record<string, any> }> {
  const reply = await app.inject({ method, url, headers: AS(project), ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any> }
}

async function read(url: string): Promise<Record<string, any>> {
  const reply = await ask('GET', url)
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  return reply.body
}

function aFlow(title: string, workspaceId = 'default', extra: Record<string, unknown> = {}): string {
  const source = t.api.createRecord({ kind: 'report', title: `Test source of ${title}`, data: { blocks: [] }, workspaceId, actor: t.api.HUMAN }).id
  return t.api.createRecord({
    kind: 'flow',
    title,
    data: {
      declared_in: 'tools/test-kettle.mjs',
      runs: 'the office itself',
      trigger: `A test trigger for ${title}.`,
      stages: [{ n: 1, does: 'Test stage 1.', evidence: 'A test record.', why: 'Test why 1.', sources: [source] }],
      leaves_behind: 'a served kettle',
      ...extra,
    },
    workspaceId,
    actor: t.api.HUMAN,
  }).id
}

const GENERAL = { applies_to: { scope: 'general', roles: ['secretary'], rung: 2 } }
const supersede = (fromId: string, toId: string, project = 'default') => ask('POST', '/api/links', { fromId, toId, type: 'supersedes' }, project)
const ids = (rows: { id: string }[]) => rows.map((row) => row.id)
/** The rows a case added, by id: a whole-office list stays whole and the case reads its own rows out of it. */
const addedSince = (rows: { id: string }[], atStart: { id: string }[]): string[] => {
  const before = new Set(ids(atStart))
  return ids(rows).filter((id) => !before.has(id))
}

describe('the flows list, round 40', () => {
  it('1. lets a flow supersede a flow in another project, files the link with the newer flow, and refuses every other crossing', async () => {
    const newer = aFlow('Test: the new way to brew')
    const older = aFlow('Test: the old garden brew', 'garden')
    const made = await supersede(newer, older)
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const filed = t.client.sqlite.prepare("SELECT workspace_id AS w FROM links WHERE from_id = ? AND to_id = ? AND type = 'supersedes'").get(newer, older) as { w: string }
    expect(filed.w, 'the link is filed with the newer flow').toBe('default')

    const report = t.api.createRecord({ kind: 'report', title: 'Test: a garden report', data: { blocks: [] }, workspaceId: 'garden', actor: t.api.HUMAN }).id
    const toAReport = await supersede(newer, report)
    expect(toAReport.status, 'a flow superseding a record that is not a flow still crosses a project').toBe(409)
    const relates = await ask('POST', '/api/links', { fromId: newer, toId: older, type: 'relates_to' })
    expect(relates.status, 'a link of any other type between two flows still crosses a project').toBe(409)
  })

  it('2. reads the current flows, counts the replaced ones and hands them back when asked, and stands the general ones apart', async () => {
    const atStartEvery = await read('/api/flows?projects=all&replaced=show')
    const atStartGarden = await read('/api/flows?projects=garden')
    const general = aFlow('Test: answering anyone', 'default', GENERAL)
    const own = aFlow('Test: the kitchen brew', 'kitchen', { applies_to: { scope: 'special', roles: ['supervisor'], project: 'kitchen' } })
    const garden = aFlow('Test: the garden watering', 'garden')
    const oldHome = aFlow('Test: the old way to answer')
    const oldKitchen = aFlow('Test: the old kitchen brew', 'kitchen')
    const oldGeneral = aFlow('Test: an old general way', 'default', GENERAL)
    for (const [from, to] of [
      [general, oldHome],
      [general, oldKitchen],
      [own, oldKitchen],
      [general, oldGeneral],
    ] as const) {
      const made = await supersede(from, to)
      expect(made.status, JSON.stringify(made.body)).toBe(201)
    }
    // A flow superseded only by a deleted flow is current again.
    const gone = aFlow('Test: a deleted newer flow', 'garden')
    expect((await supersede(gone, garden, 'garden')).status).toBe(201)
    t.client.sqlite.prepare('UPDATE records SET deleted_at = updated_at WHERE id = ?').run(gone)

    const every = await read('/api/flows?projects=all')
    expect(addedSince(every.flows, atStartEvery.flows), 'each project\'s own current flows, by title').toEqual([garden, own])
    expect(every.matched - atStartEvery.matched).toBe(2)
    expect(addedSince(every.general.flows, atStartEvery.general.flows)).toEqual([general])
    expect(every.general.matched - atStartEvery.general.matched).toBe(1)
    expect(every.general.flows.find((row: any) => row.id === general).appliesTo).toEqual(GENERAL.applies_to)
    expect(every.replaced.matched - atStartEvery.replaced.matched).toBe(3)
    expect(every.replaced.retired).toBe(atStartEvery.replaced.retired)
    expect(every.replaced.flows).toBeNull()

    const shown = await read('/api/flows?projects=all&replaced=show')
    expect(addedSince(shown.replaced.flows, atStartEvery.replaced.flows)).toEqual([oldGeneral, oldKitchen, oldHome])
    const kitchen = shown.replaced.flows.find((row: any) => row.id === oldKitchen)
    expect(kitchen.replacedBy).toEqual([
      { id: general, title: 'Test: answering anyone', project: 'default' },
      { id: own, title: 'Test: the kitchen brew', project: 'kitchen' },
    ])

    const one = await read('/api/flows?projects=garden')
    expect(addedSince(one.flows, atStartGarden.flows)).toEqual([garden])
    expect(addedSince(one.general.flows, atStartGarden.general.flows), 'the general group stands in every project\'s view').toEqual([general])
    expect(one.replaced.matched - atStartGarden.replaced.matched, 'the replaced flows of the projects asked').toBe(0)
    const searched = await read('/api/flows?projects=garden&q=nothing-holds-this')
    expect(searched.general.matched, 'the search narrows the general group too').toBe(0)
    expect((await ask('GET', '/api/flows?projects=all&replaced=maybe')).status).toBe(400)
  })

  it('3. stores whom a flow is for when the office can check it, and refuses it with its code otherwise', async () => {
    const fine = aFlow('Test: a special garden flow', 'garden', { applies_to: { scope: 'special', roles: ['secretary', 'inspector'], project: 'garden' } })
    expect(t.api.getRecord(fine)?.data['applies_to']).toEqual({ scope: 'special', roles: ['secretary', 'inspector'], project: 'garden' })
    const wrong: [string, unknown][] = [
      ['a role that is not a card', { scope: 'general', roles: ['gardener'] }],
      ['a rung not on the tree', { scope: 'general', roles: ['worker'], rung: 9 }],
      ['a special flow with no project', { scope: 'special', roles: ['worker'] }],
      ['a general flow with a project', { scope: 'general', roles: ['worker'], project: 'garden' }],
      ['a project that is not there', { scope: 'special', roles: ['worker'], project: 'attic' }],
      ['no roles', { scope: 'general', roles: [] }],
      ['a scope that is neither', { scope: 'mostly', roles: ['worker'] }],
      ['a key it does not hold', { scope: 'general', roles: ['worker'], department: 'brewing' }],
    ]
    const source = t.api.createRecord({ kind: 'report', title: 'Test: a source', data: { blocks: [] }, workspaceId: 'default', actor: t.api.HUMAN }).id
    for (const [what, appliesTo] of wrong) {
      const reply = await ask('POST', '/api/records', {
        kind: 'flow',
        title: `Test: ${what}`,
        data: { declared_in: 'a test', runs: 'a test', trigger: 'a test', leaves_behind: 'a test', stages: [{ n: 1, does: 'Test.', why: 'Test why.', sources: [source] }], applies_to: appliesTo },
      })
      expect(reply.status, `${what}: ${JSON.stringify(reply.body)}`).toBe(400)
      expect(reply.body.code, what).toBe('flowAppliesToUnreadable')
    }
  })

  it('4. keeps the flows that reach a role, by name or by rung, and counts the ones nobody classified', async () => {
    const atStartSupervisor = await read('/api/flows?projects=all&role=supervisor')
    const atStartInspector = await read('/api/flows?projects=all&role=inspector')
    const byName = aFlow('Test: for supervisors', 'default', { applies_to: { scope: 'special', roles: ['supervisor'], project: 'default' } })
    const byRung = aFlow('Test: rung one and up', 'default', { applies_to: { scope: 'general', roles: ['inspector'], rung: 1 } })
    aFlow('Test: for secretaries only', 'default', { applies_to: { scope: 'special', roles: ['secretary'], project: 'default' } })
    aFlow('Test: nobody said')
    const asked = await read('/api/flows?projects=all&role=supervisor')
    expect(addedSince(asked.flows, atStartSupervisor.flows)).toEqual([byName])
    expect(addedSince(asked.general.flows, atStartSupervisor.general.flows), 'rung 1 reaches a supervisor, who stands on rung 2').toEqual([byRung])
    expect(asked.notClassified - atStartSupervisor.notClassified).toBe(1)
    const inspector = await read('/api/flows?projects=all&role=inspector')
    expect(addedSince(inspector.general.flows, atStartInspector.general.flows), 'the inspector is off the tree, so only its name reaches it').toEqual([byRung])
    expect(addedSince(inspector.flows, atStartInspector.flows)).toEqual([])
    expect((await read('/api/flows?projects=all')).notClassified, 'counted only when a role is asked').toBeNull()
    const refused = await ask('GET', '/api/flows?projects=all&role=gardener')
    expect(refused.status).toBe(400)
  })

  it('5. changes a flow\'s trigger, who runs it and whom it is for, in its own project, after the version check', async () => {
    const flow = aFlow('Test: the garden flow', 'garden')
    const before = await read(`/api/flows/${flow}?projects=garden`)
    const stale = await ask('PATCH', `/api/flows/${flow}?projects=garden`, { ifVersion: 'not-the-version', trigger: 'Test: rain.' })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('flowVersionStale')
    const appliesTo = { scope: 'special', roles: ['secretary'], project: 'garden' }
    const changed = await ask('PATCH', `/api/flows/${flow}?projects=garden`, { ifVersion: before.version, trigger: 'Test: rain.', runsBy: 'Test: the gardener.', appliesTo })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body).toMatchObject({ flow, project: 'garden', trigger: 'Test: rain.', runsBy: 'Test: the gardener.', appliesTo })
    const after = await read(`/api/flows/${flow}?projects=garden`)
    expect(after).toMatchObject({ version: changed.body.version, trigger: 'Test: rain.', runsBy: 'Test: the gardener.', appliesTo })
    const unreadable = await ask('PATCH', `/api/flows/${flow}?projects=garden`, { ifVersion: after.version, appliesTo: { scope: 'general', roles: ['gardener'] } })
    expect(unreadable.body.code).toBe('flowAppliesToUnreadable')
    const nothing = await ask('PATCH', `/api/flows/${flow}?projects=garden`, { ifVersion: after.version })
    expect(nothing.status, 'a change that sends nothing to change').toBe(400)
  })
})
