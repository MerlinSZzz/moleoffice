// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY NOT WRITE WHICH MODULE GROUPINGS THE WHOLE-PROJECT DRAWING SHOWS.
 *
 * Criterion P38 of design/permissions/ACCEPTANCE.md stands on a decision that took option B of the
 * fork. The decision says: *"An agent may set a block's size and lane but not
 * choose which module groupings you look at."* The fork's reason: *"Changing a
 * drawing's arrangement is reversible and visible; changing which modules are drawn changes what you
 * notice, which is not."*
 *
 * WHERE THE LINE FALLS, AND THAT IT IS A JUDGEMENT. A block is a node on a pipeline's drawing, so
 * a block's size and lane is a pipeline scope and stays open. The drawing whose nodes are modules is
 * `structure`, and that is the one refused. The fork's question and the option's text do not agree
 * with each other — the question says "a pipeline drawing" and the option allows a block's lane —
 * and this is the reading that satisfies both. `assertMayArrangeTheModuleGraph` says so at length.
 *
 * AND THE OTHER HALF OF THE PERSON'S QUESTION HAS NOTHING TO GATE. The person also asked about *how much that drawing
 * asks to be read at*. Nothing stores a reading level on a drawing: a scope takes a direction and
 * nodes, and a node takes a lane, an order, a size, an emphasis, a fold, a neighbour and one dragged
 * coordinate. This file measures that absence rather than leaving it as a claim.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { STRUCTURE_SCOPE, pipelineScope } from '../src/shared/presentation.ts'

let t: TestDb
let app: FastifyInstance

const AS_AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' }
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let aModule: string
let aPipeline: string

async function arrange(
  headers: Record<string, string>,
  scope: string,
  intent: Record<string, unknown>,
): Promise<{ code: number; why: string }> {
  const reply = await app.inject({ method: 'PUT', url: `/api/presentation/${scope}`, headers, payload: { intent } })
  return { code: reply.statusCode, why: String((reply.json() as { error?: unknown }).error ?? '') }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  aModule = t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: 'A module on the drawing',
    data: { context: 'x', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  aPipeline = t.api.createRecord({
    workspaceId: 'default',
    kind: 'pipeline',
    title: 'A pipeline with its own drawing',
    data: { blockIds: [] },
    actor: { type: 'human', id: THE_PERSON },
  }).id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the whole-project module graph is the person’s to arrange', () => {
  it('refuses an agent, and says why and what it may do instead', async () => {
    const { code, why } = await arrange(AS_AN_AGENT, STRUCTURE_SCOPE, { nodes: { [aModule]: { lane: 'perception' } } })
    expect(code).toBe(403)
    expect(why).toContain("An agent may set a block's size and lane on a pipeline's own drawing")
    expect(why).toContain('Nothing was written')
    expect(why).toContain('pipeline:')
    expect(why).toContain('file a proposal')
  })

  it('writes nothing when it refuses', async () => {
    const rows = t.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM presentation_intent WHERE scope = ?')
      .get(STRUCTURE_SCOPE) as { n: number }
    expect(rows.n).toBe(0)
  })

  it('refuses every door into that drawing, not only the whole-scope one', async () => {
    for (const [method, url] of [
      ['PUT', `/api/presentation/${STRUCTURE_SCOPE}/nodes/${aModule}`],
      ['DELETE', `/api/presentation/${STRUCTURE_SCOPE}/nodes/${aModule}`],
      ['PUT', `/api/presentation/${STRUCTURE_SCOPE}/direction`],
      ['DELETE', `/api/presentation/${STRUCTURE_SCOPE}/direction`],
      ['DELETE', `/api/presentation/${STRUCTURE_SCOPE}`],
    ] as const) {
      const reply = await app.inject({
        method,
        url,
        headers: AS_AN_AGENT,
        ...(method === 'PUT' ? { payload: { intent: url.endsWith('direction') ? { direction: 'right' } : { lane: 'x' } } } : {}),
      })
      expect(reply.statusCode, `${method} ${url} was not refused`).toBe(403)
    }
  })

  it('lets the person arrange it, which is the whole point of refusing the agent', async () => {
    const { code } = await arrange(AS_THE_PERSON, STRUCTURE_SCOPE, { nodes: { [aModule]: { lane: 'perception' } } })
    expect(code).toBe(200)
  })
})

describe('a pipeline"s own drawing stays open to an agent', () => {
  it('lets an agent set a block"s lane and size there', async () => {
    const { code, why } = await arrange(AS_AN_AGENT, pipelineScope(aPipeline), {
      nodes: { [aModule]: { lane: 'the arm', role: 'prominent' } },
    })
    expect(code, why).toBe(200)
  })
})


describe('the other half of the person’s question has nothing to gate, and this measures that', () => {
  it('has no reading level anywhere in what a drawing stores', async () => {
    const { checkScopeIntent, checkNodeIntent } = await import('../src/shared/presentation.ts')
    // A vocabulary is closed here: an unknown key is refused by name. So asking for a reading level
    // and reading the refusal is how the absence is measured rather than asserted.
    for (const word of ['readingLevel', 'detail', 'zoom', 'level']) {
      expect(checkScopeIntent({ [word]: 3 }).length, `a scope accepted ${word}`).toBeGreaterThan(0)
      expect(checkNodeIntent({ [word]: 3 }, `nodes.a-node`).length, `a node accepted ${word}`).toBeGreaterThan(0)
    }
  })
})
