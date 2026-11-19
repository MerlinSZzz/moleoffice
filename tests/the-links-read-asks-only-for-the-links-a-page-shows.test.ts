// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINKS A PAGE SHOWS ARE THE LINKS ITS READ ASKS FOR (wave 14c, AT-5).
 *
 * The made-up office's whole link list is about 18.6 MB in one reply and the live one has been seen
 * at 18.7 MB and 7.2 s. Each page that draws links uses a small part of that: the Goals page reads
 * three link types into two kinds of record, the pipeline drawing reads links touching its own
 * structure, the family page joins modules to problems, and the block editor reads `implements`
 * links into one block. This file proves the door keeps exactly those and the client sends exactly
 * that filter.
 *
 * THE CONTROL IS THE OLD READ. On the tree before this change `api.listLinks(filter)` ignored the
 * filter and `GET /api/links?betweenKind=…` ignored every word but `projects`, so each case below
 * answers with every link, ungated and uncut.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { LinkType, RecordKind } from '@shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

const PERSON = { type: 'human' as const, id: 'owner' }
const HEADERS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': 'owner',
}

let office: TestDb
let app: FastifyInstance

beforeAll(async () => {
  office = await freshDb()
  ;({ app } = await apiApp())
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  office.close()
})

function make(kind: RecordKind, title: string, data: Record<string, unknown> = {}): string {
  return office.api.createRecord({ workspaceId: 'default', kind, title, data, actor: PERSON }).id
}

function join(fromId: string, toId: string, type: LinkType): string {
  return office.api.createLink({ fromId, toId, type, actor: PERSON }).id
}

async function read(query: string): Promise<{ status: number; body: any }> {
  const reply = await app.inject({ method: 'GET', url: `/api/links${query}`, headers: HEADERS })
  return { status: reply.statusCode, body: reply.json() }
}

const keysOf = (link: object) => Object.keys(link).sort()
const pairsOf = (links: readonly { fromId: string; toId: string }[]) =>
  links.map((one) => `${one.fromId}->${one.toId}`).sort()

describe('the door answers the links a page asks for, and only those', () => {
  let moduleId = ''
  let otherModuleId = ''
  let problemId = ''
  let taskId = ''
  let otherTaskId = ''
  let goalId = ''
  let partId = ''
  let blockId = ''
  let implementation = ''
  let moduleToProblem = ''
  let problemToModule = ''
  let moduleToModule = ''
  let taskServesGoal = ''
  let taskRealisesPart = ''
  let moduleServesGoal = ''
  let moduleAboutTask = ''
  let unrelated = ''

  beforeAll(() => {
    moduleId = make('module', 'A made-up module', { context: 'It exists.', state: 'active' })
    otherModuleId = make('module', 'Another made-up module', { context: 'It exists too.', state: 'active' })
    problemId = make('problem', 'A made-up problem', { state: 'open' })
    taskId = make('task', 'A made-up task', { state: 'todo' })
    otherTaskId = make('task', 'Another made-up task', { state: 'todo' })
    goalId = make('goal', 'A made-up goal', { horizon: 'short', what: 'It holds.', owner: 'owner', state: 'open' })
    partId = make('planned_state', 'A made-up part', { what: 'It closes.' })
    const pipelineId = make('pipeline', 'A made-up pipeline', { blockIds: [] })
    blockId = office.blocks.addBlock(pipelineId, { name: 'A made-up block', state: 'todo' }, PERSON).block.id
    implementation = join(moduleId, blockId, 'implements')
    moduleToProblem = join(moduleId, problemId, 'relates_to')
    problemToModule = join(problemId, moduleId, 'blocks')
    moduleToModule = join(moduleId, otherModuleId, 'part_of')
    taskServesGoal = join(taskId, goalId, 'serves')
    taskRealisesPart = join(taskId, partId, 'realises')
    moduleServesGoal = join(moduleId, goalId, 'serves')
    moduleAboutTask = join(moduleId, taskId, 'about')
    unrelated = join(taskId, otherTaskId, 'relates_to')
  })

  it('keeps only the module-to-problem links the family page joins', async () => {
    const reply = await read('?betweenKind=module,problem&shape=ends')
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(new Set(pairsOf(reply.body.links))).toEqual(new Set([
      `${moduleId}->${problemId}`, `${problemId}->${moduleId}`,
    ]))
    expect(reply.body.links).toHaveLength(2)
    for (const link of reply.body.links) expect(keysOf(link)).toEqual(['fromId', 'toId'])
  })

  it('keeps only links touching the drawing’s own structure, with the fields it draws', async () => {
    const reply = await read('?touchesKind=module,pipeline,block&shape=draw')
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(new Set(pairsOf(reply.body.links))).toEqual(new Set([
      `${moduleId}->${blockId}`, `${moduleId}->${problemId}`, `${problemId}->${moduleId}`,
      `${moduleId}->${otherModuleId}`, `${moduleId}->${goalId}`, `${moduleId}->${taskId}`,
    ]))
    for (const link of reply.body.links) {
      expect(keysOf(link)).toEqual(['broken', 'carries', 'fromId', 'gate', 'gateProblem', 'id', 'inferred', 'toId', 'type'])
    }
  })

  it('keeps only the type-and-far-kind pairs the Goals page reads', async () => {
    const reply = await read('?typeToKind=serves:goal,realises:planned_state,instead_of:planned_state&shape=answer')
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(new Set(pairsOf(reply.body.links))).toEqual(new Set([
      `${taskId}->${goalId}`, `${taskId}->${partId}`, `${moduleId}->${goalId}`,
    ]))
    for (const link of reply.body.links) {
      expect(keysOf(link)).toEqual(['createdAt', 'createdBy', 'createdByType', 'fromId', 'toId', 'type'])
    }
  })

  it('keeps only the implements links into the block the editor saves', async () => {
    const reply = await read(`?type=implements&toId=${encodeURIComponent(blockId)}&shape=draw`)
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(reply.body.links.map((one: { id: string }) => one.id)).toEqual([implementation])
  })

  it('leaves a read with no filter exactly as it was: every link, every field', async () => {
    const reply = await read('')
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(reply.body.links).toHaveLength(9)
    const first = reply.body.links[0]
    for (const field of ['id', 'fromId', 'toId', 'type', 'inferred', 'createdAt', 'createdBy', 'createdByType',
      'broken', 'gate', 'gateLabel', 'gateProblem', 'gateStage', 'carries']) {
      expect(Object.hasOwn(first, field), field).toBe(true)
    }
    expect(new Set(reply.body.links.map((one: { id: string }) => one.id))).toEqual(new Set([
      implementation, moduleToProblem, problemToModule, moduleToModule, taskServesGoal, taskRealisesPart,
      moduleServesGoal, moduleAboutTask, unrelated,
    ]))
  })

  it('refuses a filter it cannot read before it reads any link', async () => {
    for (const [query, expected] of [
      ['?type=not_a_link', 'not_a_link'],
      ['?typeToKind=serves', 'serves'],
      ['?typeToKind=serves:not_a_kind', 'not_a_kind'],
      ['?betweenKind=module', 'betweenKind'],
      ['?touchesKind=not_a_kind', 'not_a_kind'],
      ['?shape=bogus', 'shape'],
      ['?flavour=all', 'flavour'],
    ] as const) {
      const reply = await read(query)
      expect(reply.status, `${query} answered ${JSON.stringify(reply.body)}`).toBe(400)
      expect(JSON.stringify(reply.body)).toContain(expected)
    }
  })
})

describe('the client sends the filter it was given', () => {
  it('puts the type, the far end and the shape in the address', async () => {
    const { api } = await import('../src/web/api.ts')
    const asked: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (input) => {
      asked.push(String(input))
      return new Response(JSON.stringify({ links: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    try {
      await api.listLinks({ type: ['implements'], toId: 'block-1', shape: 'draw' })
      const at = new URL(asked[0]!, 'http://office.test')
      expect(at.pathname).toBe('/api/links')
      expect(at.searchParams.get('type')).toBe('implements')
      expect(at.searchParams.get('toId')).toBe('block-1')
      expect(at.searchParams.get('shape')).toBe('draw')

      await api.listLinks({ projects: 'all', typeToKind: [['serves', 'goal'], ['realises', 'planned_state']], shape: 'answer' })
      const twice = new URL(asked[1]!, 'http://office.test')
      expect(twice.searchParams.get('projects')).toBe('all')
      expect(twice.searchParams.get('typeToKind')).toBe('serves:goal,realises:planned_state')
      expect(twice.searchParams.get('shape')).toBe('answer')

      await api.listLinks()
      expect(new URL(asked[2]!, 'http://office.test').pathname).toBe('/api/links')
      expect(new URL(asked[2]!, 'http://office.test').search).toBe('')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
