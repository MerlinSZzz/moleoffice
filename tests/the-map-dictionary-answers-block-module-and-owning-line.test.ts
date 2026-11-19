// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAP'S DICTIONARY ANSWERS A FILE PATH WITH ITS BLOCK, ITS MODULE AND THE LINE THAT OWNS IT. Wave 13u round 216,
 * package BV, point BV-6. Its criterion: "a test shows the door answers block, module and owning
 * line for a file path". The door is GET /api/map/dictionary; it reads src/server/lib/map-dictionary.ts.
 *
 * WHAT IS PROVED, in an empty test office with a made-up master pipeline of two blocks, a block pipeline hung on each
 * block, and three modules with stated rows in a made-up repository:
 *   1. a path two modules state answers both, each with the rows that matched, its owning line or null, and the box,
 *      block pipeline and block it implements; a pipeline that states the path is named apart, not followed;
 *   2. asked by module, a module that implements no box answers with no place, and a path nobody states answers with
 *      no module, not a guess from its folder;
 *   3. with no master marked, the map is not read, and each module's places is null rather than empty;
 *   4. both or neither of path and module, and a module id that is not a module, are refused with their codes.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in the dictionary, read no owner: cases 1 and 3 go red.
 *   2. in the dictionary, keep the records of every kind as modules: cases 1 and 3 go red.
 *   3. in the dictionary, answer a map that was not read as no place, [] in place of null: case 3 goes red.
 *   4. in the shared reading, give every box the first block: case 1 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { MapDictionary } from '../src/shared/big-map-reading.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const id: Record<string, string> = {}
let repository: string

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_LINE = { kind: 'agent', id: 'made-up-line' } as const

async function ask(query: string): Promise<MapDictionary> {
  const reply = await app.inject({ method: 'GET', url: `/api/map/dictionary?${query}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json()
}

function mark(pipeline: string | null) {
  return app.inject({ method: 'PUT', url: '/api/projects/default/master-pipeline', headers: AS_THE_PERSON, payload: { pipeline } })
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { registerRepository } = await import('../src/server/lib/repositories.ts')
  const { declareRelationship } = await import('../src/server/lib/implementation.ts')
  const record = (kind: 'pipeline' | 'module', name: string, data: Record<string, unknown>) =>
    (id[name] = t.api.createRecord({ kind, title: `Made-up ${kind} ${name}`, workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data }).id)
  const step = (pipeline: string, name: string, tier: string | null) => {
    id[name] = t.blocks.addBlock(id[pipeline]!, { name: `made-up step ${name}`, state: 'done' }, t.api.HUMAN).block.id
    if (tier !== null) t.api.patchRecord(id[name]!, { dataPatch: { tier } }, t.api.HUMAN)
  }
  const link = (from: string, to: string, type: 'part_of' | 'implements') => t.api.createLink({ fromId: id[from]!, toId: id[to]!, type, actor: t.api.HUMAN })
  const states = (name: string, pattern: string) =>
    declareRelationship({ workspaceId: 'default', recordId: id[name]!, repositoryId: repository, pattern, actor: t.api.HUMAN })

  // The master and its two blocks, M0 and M1, and a block pipeline hung on each.
  record('pipeline', 'master', { blockIds: [] })
  step('master', 'first block', null)
  step('master', 'second block', null)
  record('pipeline', 'upper', { blockIds: [] })
  link('upper', 'first block', 'part_of')
  step('upper', 'door', 'ways-in')
  step('upper', 'unplaced', null)
  record('pipeline', 'lower', { blockIds: [] })
  link('lower', 'second block', 'part_of')
  step('lower', 'store', 'stores')

  // Three modules: one owned by a line and on the first block, one on the second, and one on no block.
  record('module', 'narrow', { owner: THE_LINE })
  link('narrow', 'door', 'implements')
  record('module', 'wide', {})
  link('wide', 'store', 'implements')
  record('module', 'loose', {})
  repository = registerRepository({ workspaceId: 'default', name: 'made-up-repository', root: null, actor: t.api.HUMAN }).id
  states('narrow', 'src/made-up/door/**')
  states('wide', 'src/made-up/**')
  states('loose', 'src/loose.ts')
  states('upper', 'src/made-up/door/**')

  const marked = await mark(id['master']!)
  expect(marked.statusCode, marked.body.slice(0, 300)).toBe(200)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the map dictionary', () => {
  it('1. answers a path with each module that states it, its owning line, and its box, block pipeline and block', async () => {
    const answer = await ask('path=src/made-up/door/a.ts')
    expect(answer.asked).toEqual({ path: 'src/made-up/door/a.ts' })
    expect(answer.master).toMatchObject({ state: 'marked', id: id['master'] })
    const row = { repository: { id: repository, title: 'made-up-repository' }, relation: 'implements', authority: 'stated' }
    expect(answer.modules).toEqual([
      {
        id: id['narrow'],
        title: 'Made-up module narrow',
        matched: [{ ...row, pattern: 'src/made-up/door/**' }],
        owner: THE_LINE,
        places: [
          {
            box: { id: id['door'], title: 'made-up step door', name: 'made-up step door', tier: 'ways-in' },
            pipeline: { id: id['upper'], title: 'Made-up pipeline upper' },
            block: { id: id['first block'], title: 'made-up step first block', place: 0 },
          },
        ],
      },
      {
        id: id['wide'],
        title: 'Made-up module wide',
        matched: [{ ...row, pattern: 'src/made-up/**' }],
        owner: null,
        places: [
          {
            box: { id: id['store'], title: 'made-up step store', name: 'made-up step store', tier: 'stores' },
            pipeline: { id: id['lower'], title: 'Made-up pipeline lower' },
            block: { id: id['second block'], title: 'made-up step second block', place: 1 },
          },
        ],
      },
    ])
    expect(answer.others).toEqual([{ id: id['upper'], title: 'Made-up pipeline upper', kind: 'pipeline' }])
  })

  it('2. answers a module on no block with no place, and a path nobody states with no module', async () => {
    const loose = await ask(`module=${id['loose']!}`)
    expect(loose.modules).toEqual([{ id: id['loose'], title: 'Made-up module loose', matched: [], owner: null, places: [] }])
    const nobody = await ask('path=src/elsewhere/made-up.ts')
    expect(nobody.modules).toEqual([])
    expect(nobody.others).toEqual([])
  })

  it('3. reads no map when no master is marked, and says so with places null', async () => {
    expect((await mark(null)).statusCode).toBe(200)
    try {
      const answer = await ask('path=src/made-up/door/a.ts')
      expect(answer.master).toMatchObject({ state: 'unmarked' })
      expect(answer.modules.map((one) => [one.id, one.owner, one.places])).toEqual([
        [id['narrow'], THE_LINE, null],
        [id['wide'], null, null],
      ])
    } finally {
      expect((await mark(id['master']!)).statusCode).toBe(200)
    }
  })

  it('4. refuses both or neither of path and module, and a module id that is not a module, with their codes', async () => {
    for (const query of ['', `path=src/loose.ts&module=${id['loose']!}`]) {
      const refused = await app.inject({ method: 'GET', url: `/api/map/dictionary?${query}`, headers: AS_THE_PERSON })
      expect(refused.statusCode, query).toBe(400)
      expect(refused.json()).toMatchObject({ code: 'mapDictionaryAsksOneThing' })
    }
    const notAModule = await app.inject({ method: 'GET', url: `/api/map/dictionary?module=${id['upper']!}`, headers: AS_THE_PERSON })
    expect(notAModule.statusCode).toBe(404)
    expect(notAModule.json()).toMatchObject({ code: 'mapDictionaryNoSuchModule' })
  })
})
