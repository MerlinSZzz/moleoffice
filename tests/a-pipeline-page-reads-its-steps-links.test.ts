// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const project = 'default'
const headers = { 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a pipeline page reads the links its steps need', () => {
  it('leaves the other pipeline links in the database and keeps the step reading', async () => {
    const first = t.api.createRecord({ workspaceId: project, kind: 'pipeline', title: 'First pipeline', data: { blockIds: [] }, actor: t.api.HUMAN })
    const second = t.api.createRecord({ workspaceId: project, kind: 'pipeline', title: 'Second pipeline', data: { blockIds: [] }, actor: t.api.HUMAN })
    const firstStep = t.blocks.addBlock(first.id, { name: 'First step', state: 'todo' }, t.api.HUMAN).block
    const secondStep = t.blocks.addBlock(second.id, { name: 'Second step', state: 'todo' }, t.api.HUMAN).block
    const carrier = t.api.createRecord({ workspaceId: project, kind: 'module', title: 'A carrier', actor: t.api.HUMAN })
    const included = t.api.createLink({ fromId: carrier.id, toId: firstStep.id, type: 'implements', actor: t.api.HUMAN })
    const unrelated = t.api.createLink({ fromId: carrier.id, toId: secondStep.id, type: 'implements', actor: t.api.HUMAN })
    const blocks = await import('../src/server/lib/blocks.ts')
    const current = t.api.getRecord(first.id)
    if (current === null) throw new Error('The first pipeline is missing')
    const expected = blocks.readOnePipelinesBlocks(current, project, blocks.blockLinkRowsIn(project))

    const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, unknown> }
    const original = sqlite.prepare
    const linkRows: unknown[] = []
    sqlite.prepare = function (this: unknown, text: string) {
      const statement = original.call(this, text)
      if (/\bfrom\s+["`]?links["`]?/i.test(text)) {
        for (const method of ['all', 'get'] as const) {
          const read = statement[method] as (...args: unknown[]) => unknown
          statement[method] = function (this: unknown, ...args: unknown[]) {
            const rows = read.apply(this, args)
            linkRows.push(rows)
            return rows
          }
        }
      }
      return statement
    }
    try {
      const reply = await app.inject({ method: 'GET', url: `/api/records/${first.id}`, headers })
      expect(reply.statusCode).toBe(200)
      expect(reply.json().blocks).toEqual(expected)
    } finally {
      sqlite.prepare = original
    }
    const returned = JSON.stringify(linkRows)
    expect(returned).toContain(included.id)
    expect(returned, 'a link into a different pipeline was returned from the database').not.toContain(unrelated.id)
  })
})
