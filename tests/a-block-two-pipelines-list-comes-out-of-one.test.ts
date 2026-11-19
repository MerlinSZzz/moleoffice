// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let office: TestDb
let app: FastifyInstance
let holders: typeof import('../src/server/lib/records.ts').pipelinesHolding
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let serial = 0

beforeAll(async () => {
  office = await freshDb()
  ;({ pipelinesHolding: holders } = await import('../src/server/lib/records.ts'))
  ;({ app } = await apiApp())
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(async () => { await app.close(); office.close() })

async function send(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
}
async function pipeline() {
  serial += 1
  const reply = await send('POST', '/api/records', { kind: 'pipeline', title: `Pipeline ${serial}`, data: { blockIds: [] } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().record as { id: string; title: string }
}
async function add(id: string) {
  serial += 1
  const reply = await send('POST', `/api/records/${id}/blocks`, { name: `Block ${serial}`, state: 'todo' })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().record as { id: string; title: string }
}
async function list(id: string, ids: string[]) {
  const reply = await send('PATCH', `/api/records/${id}`, { dataPatch: { blockIds: ids } })
  expect(reply.statusCode, reply.body).toBe(200)
}
const order = (id: string) => office.api.getRecord(id)?.data['blockIds']
const remove = (p: string, b: string) => send('DELETE', `/api/records/${p}/blocks/${b}`)
const named = (b: string, except: string) => holders(b).filter(p => p.id !== except).map(({ id, title }) => ({ id, title }))

async function shared() {
  const a = await pipeline(), b = await pipeline()
  const block = await add(a.id), prefix = await add(b.id)
  await list(b.id, [prefix.id, block.id])
  return { a, b, block, prefix }
}

describe('taking a shared block out of a pipeline', () => {
  it('keeps it in the other order, then deletes it when the last pipeline removes it', async () => {
    const { a, b, block, prefix } = await shared()
    const other = named(block.id, a.id)
    const first = await remove(a.id, block.id)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json()).toMatchObject({ ok: true, deleted: false, stillListedBy: other })
    expect(other).toEqual([{ id: b.id, title: b.title }])
    expect(order(a.id)).toEqual([])
    expect(order(b.id)).toEqual([prefix.id, block.id])
    expect(office.api.getRecord(block.id)?.deletedAt).toBeNull()
    const last = await remove(b.id, block.id)
    expect(last.statusCode, last.body).toBe(200)
    expect(last.json()).toMatchObject({ ok: true, deleted: true, stillListedBy: [] })
    expect(office.api.getRecord(block.id)?.deletedAt).not.toBeNull()
  })
  it('deletes a block listed by only one pipeline', async () => {
    const a = await pipeline(), block = await add(a.id)
    const reply = await remove(a.id, block.id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ deleted: true, stillListedBy: [] })
    expect(office.api.getRecord(block.id)?.deletedAt).not.toBeNull()
  })
  it('names the other two pipelines in the order the membership reader returns', async () => {
    const { a, b, block } = await shared()
    const c = await pipeline()
    await list(c.id, [block.id])
    const expected = named(block.id, a.id)
    expect(expected).toHaveLength(2)
    const reply = await remove(a.id, block.id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ deleted: false, stillListedBy: expected })
    expect(new Set(expected.map(p => p.id))).toEqual(new Set([b.id, c.id]))
  })
  it('refuses an omitted shared block on reorder and names the other pipeline and removal door', async () => {
    const { a, b, block } = await shared()
    const before = order(a.id)
    const reply = await send('PUT', `/api/records/${a.id}/blocks`, { blockIds: [] })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json().error).toContain(b.title)
    expect(reply.json().error).toContain(`DELETE /api/records/${a.id}/blocks/${block.id}`)
    expect(reply.json().error).not.toContain('no pipeline lists')
    expect(order(a.id)).toEqual(before)
    expect(office.api.getRecord(block.id)?.deletedAt).toBeNull()
  })
  it('refuses restoration into another pipeline and its advice adds the live block', async () => {
    const a = await pipeline()
    const b = await pipeline()
    const block = await add(a.id)
    let refused: unknown
    try { office.blocks.restoreBlock(b.id, block.id, {}, office.api.HUMAN) } catch (error) { refused = error }
    expect(refused).toBeInstanceOf(office.api.PanelError)
    const error = refused as { status: number; code?: string; message: string }
    expect(error.status).toBe(404)
    expect(error.code).toBeUndefined()
    const method = 'PATCH'
    const url = `/api/records/${b.id}`
    expect(error.message).toContain(`${method} ${url}`)
    const dataPatch = { blockIds: [...(order(b.id) as string[]), block.id] }
    expect(error.message).toContain(`dataPatch.${Object.keys(dataPatch)[0]}`)
    const advice = (office.blocks as typeof office.blocks & { restoreBlockSharingAdvice: (pipelineId: string, blockId: string) => string }).restoreBlockSharingAdvice(b.id, block.id)
    expect(error.message).toContain(advice)
    const read = await app.inject({ method: 'GET', url, headers })
    expect(read.statusCode, read.body).toBe(200)
    const reply = await send(method, url, { ifVersion: read.json().version, dataPatch })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(order(b.id)).toContain(block.id)
    expect(order(a.id)).toContain(block.id)
  })
  it('refuses a patch omitting a shared block and names the other pipeline and removal door', async () => {
    const { a, b, block } = await shared()
    const before = order(a.id)
    const reply = await send('PATCH', `/api/records/${a.id}`, { dataPatch: { blockIds: [] } })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json().error).toContain(b.title)
    expect(reply.json().error).toContain(`DELETE /api/records/${a.id}/blocks/${block.id}`)
    expect(reply.json().error).not.toContain('no pipeline lists')
    expect(order(a.id)).toEqual(before)
    expect(office.api.getRecord(block.id)?.deletedAt).toBeNull()
  })
  it('names both removal doors on direct deletion and those doors work in turn', async () => {
    const { a, b, block } = await shared()
    const direct = await send('DELETE', `/api/records/${block.id}`)
    expect(direct.statusCode, direct.body).toBe(400)
    for (const p of [a, b]) {
      expect(direct.json().error).toContain(p.title)
      expect(direct.json().error).toContain(`DELETE /api/records/${p.id}/blocks/${block.id}`)
    }
    const first = await remove(a.id, block.id)
    expect(first.statusCode, first.body).toBe(200)
    const last = await remove(b.id, block.id)
    expect(last.statusCode, last.body).toBe(200)
    expect(office.api.getRecord(block.id)?.deletedAt).not.toBeNull()
  })
})
