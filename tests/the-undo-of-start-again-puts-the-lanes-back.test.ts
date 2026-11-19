// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE UNDO OF START AGAIN PUTS BACK EVERYTHING THE PRESS FORGOT, LANES INCLUDED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Start again on the canvas (`putItBack` in src/web/components/graph/Canvas.tsx) reads what the
 * drawing stores and then forgets all of it with DELETE /api/presentation/:scope, which deletes every
 * row of the scope. Since a pipeline's drawing stores its lanes in the scope's own row, that includes
 * the lanes. Its undo put back the direction and each node, one request each, and nothing else; and
 * its check that nobody had arranged the drawing since the press looked at the direction and the
 * nodes only. So Start again and then Undo lost the lanes, while the undo said the drawing was back.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS TESTED, AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The server half of the undo is `putTheArrangementBack` in Edit.tsx, beside the client it writes
 * through. This file hands it the presentation routes themselves, in process, so what it sends is
 * checked and stored by the server and read back from it. The press and the button are not pressed
 * here: the runner has no DOM, and tests/a-drawing-is-put-back.test.ts drives them in a browser.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put back only the direction and the nodes, as before → the two put-back cases go red: the
 *     lanes stay forgotten.
 *   leave the lanes out of the check for a newer arrangement → the refusal case goes red: the undo
 *     replaces lanes stored after the press.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { t } from '../src/shared/i18n.ts'
import {
  GRAPH_DIRECTIONS,
  LANE_ARRANGEMENTS,
  LANE_TINTS,
  pipelineScope,
  type ScopeIntent,
} from '../src/shared/presentation.ts'

type EditModule = typeof import('../src/web/components/graph/Edit.tsx')
let edit: EditModule

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, and Edit.tsx reaches it. Nothing in
  // this stand-in is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  edit = await import('../src/web/components/graph/Edit.tsx')
})

/** What `putTheArrangementBack` is handed: the doors it reads and writes through. */
interface Doors {
  read: (scope: string) => Promise<{ intent: ScopeIntent }>
  putScope: (scope: string, intent: ScopeIntent) => Promise<unknown>
}

/** The undo's server half, read by name so that a file without it fails here and says so. */
function theUndo(): (scope: string, before: ScopeIntent, doors: Doors) => Promise<void> {
  const found = Reflect.get(edit, 'putTheArrangementBack') as unknown
  if (typeof found !== 'function') {
    throw new Error('Edit.tsx exports no putTheArrangementBack, so nothing puts a whole arrangement back, lanes included.')
  }
  return found as (scope: string, before: ScopeIntent, doors: Doors) => Promise<void>
}

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

describe('Start again and then Undo', () => {
  let db: TestDb
  let app: FastifyInstance
  let scope = ''
  let blocks: string[] = []

  beforeEach(async () => {
    db = await freshDb()
    const Fastify = (await import('fastify')).default
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    const { presentationRoutes } = await import('../src/server/api/presentation.ts')
    app = Fastify({ logger: false })
    installErrorHandling(app)
    await app.register(presentationRoutes, { prefix: '/api' })
    await app.ready()
    const pipeline = db.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Bench check',
      data: { blockIds: [] },
      actor: db.api.HUMAN,
    }).id
    blocks = ['Collect boards', 'Solve the fit', 'Compare the runs'].map(
      (name) => db.blocks.addBlock(pipeline, { name, state: 'todo' }, db.api.HUMAN).block.id,
    )
    scope = pipelineScope(pipeline)
  })

  afterEach(async () => {
    await app?.close()
    db?.close()
  })

  async function ask(method: 'GET' | 'PUT' | 'DELETE', payload?: unknown): Promise<unknown> {
    const said = await app.inject({
      method,
      url: `/api/presentation/${encodeURIComponent(scope)}`,
      headers: payload === undefined ? HUMAN : { ...HUMAN, 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { payload: payload as object }),
    })
    if (said.statusCode >= 400) throw new Error(`${method} answered ${String(said.statusCode)}: ${said.body}`)
    return JSON.parse(said.body) as unknown
  }

  /** The presentation routes, as the doors the undo writes through. */
  const doors: Doors = {
    read: async () => (await ask('GET')) as { intent: ScopeIntent },
    putScope: async (_scope, intent) => ask('PUT', { intent }),
  }

  /** What the press does on the server: read what is stored, then forget all of it. */
  async function startAgain(): Promise<ScopeIntent> {
    const before = (await doors.read(scope)).intent
    await ask('DELETE')
    return before
  }

  const twoLanes = () => [
    { name: 'Gather', arrange: LANE_ARRANGEMENTS[0] },
    { name: 'Judge', arrange: LANE_ARRANGEMENTS[1], tint: LANE_TINTS[1] },
  ]

  it('puts the lanes back with the direction and the nodes', async () => {
    const [first, second] = blocks as [string, string, string]
    const arranged: ScopeIntent = {
      direction: GRAPH_DIRECTIONS[1],
      lanes: twoLanes(),
      nodes: { [first]: { lane: 'Gather', order: 1 }, [second]: { lane: 'Judge' } },
    }
    await ask('PUT', { intent: arranged })
    const before = await startAgain()
    expect(before.lanes, 'the press read the lanes before it forgot them').toEqual(arranged.lanes)
    expect((await doors.read(scope)).intent.lanes, 'and the press forgot them').toBeUndefined()

    await theUndo()(scope, before, doors)

    const back = (await doors.read(scope)).intent
    expect(back.lanes, 'the lanes are back, in their order').toEqual(arranged.lanes)
    expect(back.direction, 'the direction is back').toBe(arranged.direction)
    expect(back.nodes, 'each node is back in its lane').toEqual(arranged.nodes)
  })

  it('puts back a drawing that stored only its lanes', async () => {
    await ask('PUT', { intent: { lanes: twoLanes() } })
    const before = await startAgain()

    await theUndo()(scope, before, doors)

    expect((await doors.read(scope)).intent.lanes, 'the lanes are back').toEqual(twoLanes())
  })

  it('refuses, and changes nothing, when lanes were stored after the press', async () => {
    await ask('PUT', { intent: { lanes: twoLanes() } })
    const before = await startAgain()
    const newer = [{ name: 'Since', arrange: LANE_ARRANGEMENTS[2] }]
    await ask('PUT', { intent: { lanes: newer } })

    await expect(theUndo()(scope, before, doors), 'the undo would replace a newer change').rejects.toThrow(
      t('g7b.undoChanged'),
    )

    expect((await doors.read(scope)).intent.lanes, 'the lanes stored after the press stay').toEqual(newer)
  })
})
