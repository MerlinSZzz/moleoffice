// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER CANNOT DELETE A BLOCK ANOTHER RUN STORED, AND WHAT THAT BUYS IS RECORDED HONESTLY.
 *
 * Criterion P41 of design/permissions/ACCEPTANCE.md. It comes from the ladder rather than from a
 * decision of the owner’s, and it narrows the hole one of the owner's decisions deliberately left open: an agent
 * may not mark a block that is already stored, the rule matches by id, and deleting the block and
 * writing the same words back under a new id gets the mark through.
 *
 * WHAT IS ENFORCED IS WIDER THAN THE CRITERION'S WORDS, AND THAT IS THE HONEST VERSION. Per-block
 * authorship is not stored, so nothing can tell a block this agent wrote from one somebody else
 * did. "Another run's" cannot be checked, so what is refused is deleting one at all. The worker card
 * says exactly that where a person reads it.
 *
 * WHAT IT BUYS, SAID PLAINLY: the hole is narrower and it is still open. A supervisor may still
 * delete a block, and per-block authorship is still not stored. Criterion P40 is where the signature
 * that would catch a real case is written down.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return reply.statusCode
}

/** A pipeline with one block in it, and the block's id. A block is a step of a pipeline. */
async function aPipelineWithABlock(
  headers: Record<string, string>,
  title: string,
): Promise<{ record: string; block: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'pipeline', title, data: { blockIds: [] } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const record = String((filed.json() as { record: { id: string } }).record.id)
  const added = await app.inject({
    method: 'POST',
    url: `/api/records/${record}/blocks`,
    headers,
    payload: { name: 'A step worth keeping', state: 'todo' },
  })
  expect(added.statusCode, added.body).toBe(201)
  const held = t.api.getRecord(record)
  const ids = held?.data['blockIds'] as string[]
  return { record, block: String(ids[0]) }
}

/** How many blocks that pipeline holds now. */
function blocksIn(record: string): number {
  return ((t.api.getRecord(record)?.data['blockIds'] as string[] | undefined) ?? []).length
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a worker may write a block and may not take one out', () => {
  it('lets it write one, which is most of what a worker does', async () => {
    const { block } = await aPipelineWithABlock(asAgent('w-one'), 'A pipeline a worker wrote')
    expect(block.length).toBeGreaterThan(0)
  })

  it('refuses it deleting one, in the card"s own words', async () => {
    const { record, block } = await aPipelineWithABlock(asAgent('w-one'), 'A pipeline with a block to remove')
    const reply = await app.inject({
      method: 'DELETE',
      url: `/api/records/${record}/blocks/${block}`,
      headers: asAgent('w-one'),
    })
    expect(reply.statusCode).toBe(403)
    const why = String((reply.json() as { error?: unknown }).error ?? '')
    expect(why).toContain('Take a block out of a record')
    expect(why).toContain('a worker may do')
    // AND THE BLOCK IS STILL THERE. A refusal that had already written would be worse than none.
    expect(blocksIn(record)).toBe(1)
  })

  it('refuses it even for a block that same worker wrote, and the refusal names the powers it holds', async () => {
    // Per-block authorship is not stored, so "another run's" cannot be checked, and the wider rule
    // is the only honest one available. It used to be a sentence on the worker card, in
    // `saidButNotChecked`; criterion P56 took every such line off the cards, because they were a
    // May-not list in prose and that is what made the card a second file of rules. What is left is
    // the thing that is actually true and actually enforced: `record.body-remove` is under a power
    // the worker does not hold, and the refusal says which powers it does hold.
    const { record, block } = await aPipelineWithABlock(asAgent('w-one'), 'A pipeline this worker wrote itself')
    const reply = await app.inject({
      method: 'DELETE',
      url: `/api/records/${record}/blocks/${block}`,
      headers: asAgent('w-one'),
    })
    expect(reply.statusCode).toBe(403)
    const why = String((reply.json() as { error?: unknown }).error ?? '')
    expect(why).toContain('a power it does not hold')
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const { powersFor } = await import('../src/shared/roles.ts')
    for (const power of powersFor(theRoleCards(), 'worker')) expect(why).toContain(power.name)
  })
})

describe('a supervisor may, which is what makes this narrower rather than closed', () => {
  it('lets a supervisor delete a block', async () => {
    const { record, block } = await aPipelineWithABlock(asAgent('sup-one'), 'A pipeline a supervisor may prune')
    const reply = await app.inject({
      method: 'DELETE',
      url: `/api/records/${record}/blocks/${block}`,
      headers: asAgent('sup-one'),
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(blocksIn(record)).toBe(0)
  })

  it('lets the person delete one, which never changed', async () => {
    const { record, block } = await aPipelineWithABlock(AS_THE_PERSON, 'The owner’s own pipeline')
    const reply = await app.inject({ method: 'DELETE', url: `/api/records/${record}/blocks/${block}`, headers: AS_THE_PERSON })
    expect(reply.statusCode).toBe(200)
  })
})

describe('taking a block out has its own name, so a card can refuse it on its own', () => {
  it('is a declared operation, separate from writing one', async () => {
    const { OPERATIONS } = await import('../src/shared/ops.ts')
    const names = OPERATIONS.map((one) => one.name)
    expect(names).toContain('record.body-remove')
    expect(names).toContain('record.body')
  })

  it('is what the worker card refuses, and the supervisor card adds', async () => {
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const { actsRefusedTo } = await import('../src/shared/roles.ts')
    expect([...actsRefusedTo(theRoleCards(), 'worker').keys()]).toContain('record.body-remove')
    expect([...actsRefusedTo(theRoleCards(), 'supervisor').keys()]).not.toContain('record.body-remove')
  })
})
