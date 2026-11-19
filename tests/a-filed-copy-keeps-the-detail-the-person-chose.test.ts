// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY FILED AFTER LESS OR MORE KEEPS THE DETAIL THE PERSON CHOSE.
 *
 * Problem `MEFFlH9J6nY5`: on the bundles page, one press of Less or More and then File this and hand
 * it over was refused with unknown key "shift", because the page sends the Detail control's offset
 * in the filed bundle and the context_bundle kind declared no such field. The server already read a
 * stored shift when it assembled the copy. Decision gP_TJ0FWdg2U chose to store it, so the
 * kind now declares it. A shift outside the presses the page can make is refused when the bundle is
 * written (problem -gdJAlC4S0ob), and one stored before that is refused when the copy is assembled.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

const AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: AGENT })
  return { status: res.statusCode, body: res.json() }
}

/** A project scope carries open loops and nothing else, so it needs one to have anything in it. */
async function somethingOpen(): Promise<void> {
  const made = await post('/api/records', {
    kind: 'problem',
    title: 'The far edge of the tray is not segmented at 40 cm',
    data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
}

async function fileABundleMovedBy(shift: number): Promise<{ status: number; body: any }> {
  return post('/api/records', {
    kind: 'context_bundle',
    title: 'Hand this project to somebody else, one level shorter',
    data: { scope: 'project', preset: 'recover_project', shift },
  })
}

describe('a bundle filed after Less or More', () => {
  it('is stored with its shift, and the copy handed over says the levels were moved', async () => {
    await somethingOpen()
    const filed = await fileABundleMovedBy(-1)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(filed.body.record.data.shift).toBe(-1)

    const handed = await post('/api/bundles/export', { bundleId: filed.body.record.id })
    expect(handed.status, JSON.stringify(handed.body)).toBe(200)
    expect(handed.body.text).toMatch(/How detailed: each part .+ the longest level its share of the size fits/)
    expect(handed.body.text).not.toContain('nobody moved them')
  })

  it('is refused in words when it is written with a shift no press of Less or More can make, and nothing is stored', async () => {
    // Problem -gdJAlC4S0ob: a shift of 7 was stored and answered 201, and refused only when the copy was made.
    const before = (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'context_bundle'").get() as { n: number }).n
    const filed = await fileABundleMovedBy(7)
    expect(filed.status, JSON.stringify(filed.body)).toBe(400)
    expect(filed.body.error).toContain('A move is a whole number from -4 to 4')
    expect(filed.body.error).toContain('Nothing was filed.')
    expect((t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'context_bundle'").get() as { n: number }).n).toBe(before)

    const kept = await fileABundleMovedBy(-1)
    expect(kept.status, JSON.stringify(kept.body)).toBe(201)
    const id = kept.body.record.id as string
    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, payload: { ifVersion: kept.body.version, dataPatch: { shift: 2.5 } }, headers: AGENT })
    expect(patched.statusCode, patched.body).toBe(400)
    expect(patched.json().error).toContain('A move is a whole number from -4 to 4')
    expect(patched.json().error).toContain(`bundle ${id} is exactly as it was`)
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AGENT })
    expect(read.json().record.data.shift).toBe(-1)
  })

  it('is still refused when it is handed over with a shift stored before writes refused one', async () => {
    await somethingOpen()
    const filed = await fileABundleMovedBy(-1)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.shift', 7) WHERE id = ?").run(filed.body.record.id)

    const handed = await post('/api/bundles/export', { bundleId: filed.body.record.id })
    expect(handed.status).toBe(400)
    expect(JSON.stringify(handed.body)).toContain('A move is a whole number from -4 to 4')
  })
})
