// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RENAMING A PROJECT — the verb, over HTTP, and the control a person presses.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A workspace may be renamed: a project first called panelx should now be called Mole Office.
 * Problem `8U1oygjV1k98`. Until then the workspace routes were
 * GET and POST only, so a project could be established with a name and never renamed, and this
 * installation's own project was still called after what it was in August.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING WORTH TESTING HARDEST
 * ---------------------------------------------------------------------------------------
 *
 * THE ID DOES NOT MOVE. It is what every row in seven tables stores, what `x-mole-office-workspace`
 * carries, and what names a directory in the per-workspace export. A rename that touched it would
 * be a migration across the whole database, and every record filed under the old id would be
 * unreachable by a request spelling the new one. So the body may not carry an id at all — it is
 * refused by name rather than dropped — and the records in a renamed project are counted here
 * afterwards to prove none of them moved.
 *
 * The rest is the ordinary shape of a write in this API: a blank title refused, a body that changes
 * nothing refused, a project that is not there answered 404 with the ones that are, and the
 * strictObject refusing a key nobody declared.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/**
 * Two projects for the case alone, so the list a case reads holds the projects that case made. They
 * are made afresh for each case because a case renames one of them and the id is the thing a case
 * reads back.
 */
let PANELX = 'panelx'
let ROBOTICS = 'robotics'
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
  for (const [id, title] of [
    [PANELX, 'PanelX'],
    [ROBOTICS, 'Robotics'],
  ]) {
    const res = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
    expect(res.statusCode, res.body).toBe(201)
  }
})

/** Headers as an agent working in one project sends them. */
const asAgent = (workspaceId: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': workspaceId,
})

/** One project as `GET /api/workspaces` reports it, or undefined when it is not listed. */
async function listed(id: string): Promise<{ id: string; title: string; note: string | null; records: number } | undefined> {
  const res = await app.inject({ method: 'GET', url: '/api/workspaces', headers: asAgent(PANELX) })
  expect(res.statusCode, res.body).toBe(200)
  const reply = res.json() as { workspaces: { id: string; title: string; note: string | null; records: number }[] }
  return reply.workspaces.find((w) => w.id === id)
}

/**
 * One PATCH. `payload` is a plain object rather than `unknown` because `inject` will not take an
 * `unknown`, and the requests below deliberately send keys the route does not declare — which is
 * the point of several of them.
 *
 * AWAITED HERE rather than returned unawaited: `app.inject` answers with a chain object that is
 * also a promise, and a helper handing that back gives the caller a type whose `body` is a method.
 */
async function rename(id: string, payload: Record<string, unknown>, headers = asAgent(PANELX)) {
  return await app.inject({ method: 'PATCH', url: `/api/workspaces/${id}`, payload, headers })
}

describe('a project can be renamed', () => {
  it('changes the title a person reads, and the list says the new one', async () => {
    expect((await listed(PANELX))?.title).toBe('PanelX')

    const res = await rename(PANELX, { title: 'Mole Office' })
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json() as { id: string; title: string }).title).toBe('Mole Office')

    expect((await listed(PANELX))?.title).toBe('Mole Office')
  })

  it('leaves the id alone, so every record filed under it is still in it', async () => {
    // Two records in the project, so "the records came with it" is a number and not an assumption.
    for (const title of ['A thing that happened', 'Another thing that happened']) {
      const filed = await app.inject({
        method: 'POST',
        url: '/api/records',
        payload: { kind: 'note', title, summary: 'x', data: { body: 'x' } },
        headers: asAgent(PANELX),
      })
      expect(filed.statusCode, filed.body).toBe(201)
    }
    expect((await listed(PANELX))?.records).toBe(2)

    const res = await rename(PANELX, { title: 'Mole Office' })
    expect(res.statusCode, res.body).toBe(200)

    const after = await listed(PANELX)
    expect(after?.id, 'the id moved, and every row in the database still names the old one').toBe(PANELX)
    expect(after?.title).toBe('Mole Office')
    expect(after?.records, 'the records did not stay in the project that was renamed').toBe(2)

    // And the header still resolves, which is the whole reason the id is not renameable.
    const read = await app.inject({ method: 'GET', url: '/api/records', headers: asAgent(PANELX) })
    expect(read.statusCode, read.body).toBe(200)
    expect((read.json() as { records: unknown[] }).records).toHaveLength(2)
  })

  it('refuses an id in the body by name, rather than renaming the title and dropping it', async () => {
    const res = await rename(PANELX, { id: 'mole-office', title: 'Mole Office' })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body, 'the refusal does not name the key that was refused').toContain('id')

    const after = await listed(PANELX)
    expect(after?.title, 'the title changed even though the request was refused').toBe('PanelX')
    expect(await listed('mole-office'), 'a workspace was established by a refused request').toBeUndefined()
  })

  it('writes the note, and clears it with null, and leaves it alone when it is not sent', async () => {
    expect((await listed(PANELX))?.note).toBeNull()

    expect((await rename(PANELX, { note: 'This product’s own development record.' })).statusCode).toBe(200)
    expect((await listed(PANELX))?.note).toBe('This product’s own development record.')

    // A rename that says nothing about the note keeps it.
    expect((await rename(PANELX, { title: 'Mole Office' })).statusCode).toBe(200)
    const kept = await listed(PANELX)
    expect(kept?.title).toBe('Mole Office')
    expect(kept?.note, 'the note was dropped by a request that never mentioned it').toBe(
      'This product’s own development record.',
    )

    // Null is a different request from absent, and it clears.
    expect((await rename(PANELX, { note: null })).statusCode).toBe(200)
    expect((await listed(PANELX))?.note).toBeNull()
  })

  it('refuses a blank title, and says what the id and the title are each for', async () => {
    const res = await rename(PANELX, { title: '   ' })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body).toContain('title')
    expect((await listed(PANELX))?.title).toBe('PanelX')
  })

  it('refuses a body that would change nothing, rather than moving updatedAt and saying it renamed', async () => {
    const res = await rename(PANELX, {})
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body).toContain('changed nothing')
  })

  it('answers 404 for a project that is not here, and names the ones that are', async () => {
    const res = await rename('mole-office', { title: 'Mole Office' })
    expect(res.statusCode, res.body).toBe(404)
    expect(res.body).toContain(PANELX)
    expect(res.body).toContain(ROBOTICS)
  })

  it('renames a project other than the one the header names, because the address says which', async () => {
    // The workspace header says which project the REQUEST is working in; the id in the address says
    // which project is being renamed. They are two different questions and this proves it.
    const res = await rename(ROBOTICS, { title: 'Robots' }, asAgent(PANELX))
    expect(res.statusCode, res.body).toBe(200)
    expect((await listed(ROBOTICS))?.title).toBe('Robots')
    expect((await listed(PANELX))?.title).toBe('PanelX')
  })

  it('refuses a key nobody declared, so a caller is never told a field landed when it did not', async () => {
    const res = await rename(PANELX, { name: 'Mole Office' })
    expect(res.statusCode, res.body).toBe(400)
    expect((await listed(PANELX))?.title).toBe('PanelX')
  })

  it('is described on GET /api, so an agent that has never read this file can find it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api', headers: asAgent(PANELX) })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.body, 'the index does not publish the rename route').toContain('/api/workspaces/:id')
    expect(res.body, 'the published description does not say the id stays as it is').toContain('THE ID NEVER CHANGES')
  })
})
