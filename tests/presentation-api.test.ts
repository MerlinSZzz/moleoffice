// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Presentation intent over HTTP: what may be stored, what is refused, and what the refusal says.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The boundary in `src/shared/presentation.ts` is a rule about what goes in a database:
 *
 *     STORE MEANING AND PRESENTATION INTENT. DERIVE RENDERING.
 *
 * A rule like that fails quietly. Nothing breaks the day somebody stores an x — it works, and it
 * goes on working until the graph changes and every stored coordinate has to be reconciled by hand.
 * So these tests do not check that a store endpoint stores: they check that the things the boundary
 * excludes are refused BY NAME, that the refusal carries the explanation shared/presentation.ts
 * wrote rather than a paraphrase of it, and that every problem in a request comes back at once.
 *
 * THE MESSAGES ARE NOT COPIED INTO THIS FILE. Where a test asserts on wording it takes that wording
 * from `checkScopeIntent` or `checkNodeIntent` at run time and asserts the served refusal contains
 * it. A test holding its own copy of the sentence would pass while the server said something else,
 * which is this codebase's recurring defect written as a test.
 *
 * `app.inject` runs a request through the whole stack without opening a port, so nothing has to be
 * started and these cannot collide with a running dev server on 8787.
 *
 * WHAT IS NOT TESTED HERE, said plainly: whether ELK honours a stored `order`, a `lane` or a
 * `near`. The runner has no DOM and the layout runs in the browser. What the server can check is
 * that a stored hint still NAMES something in the drawing, and that half is tested below under
 * "hints that can no longer be honoured".
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { freshDb, one, type TestDb } from './helpers.ts'
import {
  checkNodeIntent,
  checkScopeIntent,
  EMPHASIS_ROLES,
  GRAPH_DIRECTIONS,
  NODE_ROLES,
  pipelineScope,
  STRUCTURE_SCOPE,
} from '../src/shared/presentation.ts'
import { THE_PERSON } from '../src/shared/person.ts'

interface Harness {
  t: TestDb
  app: FastifyInstance
  /** A module record, in the whole-project structure graph. */
  gripper: string
  camera: string
  /** A pipeline with three blocks. Their record ids are in `blocks`, in order. */
  pipeline: string
  /** The three block record ids, in the pipeline's order. A block is addressed by its record id. */
  blocks: [string, string, string]
  pipelineScopeName: string
}

async function freshApp(): Promise<Harness> {
  const t = await freshDb()
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { presentationRoutes } = await import('../src/server/api/presentation.ts')

  const app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(presentationRoutes, { prefix: '/api' })
  await app.ready()

  // Real records, because every reference this feature stores is checked against them. A test that
  // invented ids would prove the refusals work on ids nothing could ever have.
  const gripper = t.api.createRecord({ workspaceId: 'default',
    kind: 'module',
    // Mixed script is real here: titles include ones like OCR 与二值化, and a lane name may be Chinese too.
    title: '夹具标定',
    data: { context: 'The gripper calibration rig.', summary: 'Calibrated to 0.4 mm.' },
    actor: t.api.HUMAN,
  }).id
  const camera = t.api.createRecord({ workspaceId: 'default',
    kind: 'module',
    title: 'LeafCam 2 overhead camera',
    data: { context: 'Chest-mast camera watching the bench.', summary: 'Timing is the open problem.' },
    actor: t.api.HUMAN,
  }).id
  const pipeline = t.api.createRecord({ workspaceId: 'default',
    kind: 'pipeline',
    title: 'Model-to-bench growth check',
    data: { blockIds: [] },
    actor: t.api.HUMAN,
  }).id
  // Filed through the pipeline, which is the only way a block can be filed, so the ids below are
  // real record ids and every reference this feature stores is checked against a real row.
  const blocks = (
    [
      ['Freeze the URDF both sides', 'done'],
      ['Run the targets headless', 'doing'],
      ['Compare sim against real', 'todo'],
    ] as const
  ).map(([name, state]) => t.blocks.addBlock(pipeline, { name, state }, t.api.HUMAN).block.id) as [
    string,
    string,
    string,
  ]

  return { t, app, gripper, camera, pipeline, blocks, pipelineScopeName: pipelineScope(pipeline) }
}

let h: Harness

beforeEach(async () => {
  h = await freshApp()
})

afterEach(async () => {
  await h.app.close()
  h.t.close()
})

/** What an agent's requests carry, so a write is attributed to one rather than to the owner. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-presentation',
}

/**
 * AN AGENT MAY NOT ARRANGE THE WHOLE-PROJECT MODULE GRAPH SINCE 6 SEPTEMBER 2026.
 *
 * Criterion P38, item 4 of a decision: option B. A pipeline's own drawing is still an
 * agent's to arrange and every case below that uses one still sends `AS_AGENT`. The cases that write
 * the `structure` scope are about ATTRIBUTION and about what the listing says — not about who may
 * arrange it — so they send this instead, and what they were proving is unchanged.
 *
 * The session is kept, so a write is still attributed to a run.
 */
const AS_THEM = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-session': 'sess-presentation',
}

function put(
  path: string,
  body: InjectOptions['payload'],
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return h.app.inject({
    method: 'PUT',
    url: `/api/presentation/${path}`,
    payload: body,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const get = (path = ''): Promise<LightMyRequestResponse> =>
  h.app.inject({ method: 'GET', url: `/api/presentation${path === '' ? '' : `/${path}`}` })

const del = (path: string, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> =>
  h.app.inject({ method: 'DELETE', url: `/api/presentation/${path}`, headers })

/** The error sentence from a failed reply. Fails loudly if the body was not an error at all. */
function errorOf(res: LightMyRequestResponse): string {
  const body = res.json() as { error?: unknown }
  if (typeof body.error !== 'string') throw new Error(`expected an { error } body, got ${res.body}`)
  return body.error
}

/** The `intent` of a GET reply. */
function intentOf(res: LightMyRequestResponse): Record<string, unknown> {
  const body = res.json() as { intent?: unknown }
  if (typeof body.intent !== 'object' || body.intent === null) {
    throw new Error(`expected an intent object, got ${res.body.slice(0, 300)}`)
  }
  return body.intent as Record<string, unknown>
}

interface WriteBody {
  changed: string[]
  removed: string[]
  unchanged: string[]
  report: { honoured: string[]; unhonoured: { target: string; hint: string; because: string }[] }
  note: string
  anchoredToTheScope?: string
}

function writeOf(res: LightMyRequestResponse): WriteBody {
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as WriteBody
}

function reportOf(res: LightMyRequestResponse): WriteBody['report'] {
  const body = res.json() as { report?: WriteBody['report'] }
  if (!body.report) throw new Error(`no report in ${res.body.slice(0, 300)}`)
  return body.report
}

/** Every change row in the throwaway database, newest last. */
function changeRows(): { recordId: string; field: string | null; oldValue: string | null; newValue: string | null; actorType: string; actorId: string }[] {
  return h.t.api
    .listChanges({ workspaceId: 'default' })
    .map((c) => ({
      recordId: c.recordId,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      actorType: c.actorType,
      actorId: c.actorId,
    }))
    .reverse()
}

/** Only the rows this feature wrote, so the records created by the fixture do not drown them. */
function presentationChanges(): ReturnType<typeof changeRows> {
  return changeRows().filter((c) => (c.field ?? '').startsWith('presentation['))
}

// ============================================================================ the boundary

describe('geometry, colour and CSS are refused by name', () => {
  it('refuses a coordinate at the top of a scope, in the words shared/presentation.ts wrote', async () => {
    const res = await put(STRUCTURE_SCOPE, { intent: { x: 420, y: 180 } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)

    // Taken from the checker at run time, not copied. If the explanation is ever softened, the
    // server's answer and this assertion move together or this test goes red.
    for (const problem of checkScopeIntent({ x: 420, y: 180 })) {
      expect(message).toContain(problem.problem)
    }
    // The part that makes it teach rather than merely refuse: it says a coordinate is never
    // stored, says why nobody has to maintain one, and names what to send instead.
    expect(message).toContain('is never stored')
    expect(message).toContain('Nobody maintains a coordinate in Mole Office')
    expect(message).toContain('lane')
    expect(message).toContain('emphasis')
  })

  it('refuses a colour on a node, and says emphasis is a meaning rather than a colour', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { colour: '#c0392b' } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    for (const problem of checkNodeIntent({ colour: '#c0392b' }, h.gripper)) {
      expect(message).toContain(problem.problem)
    }
    // A colour is refused for a DIFFERENT reason than a coordinate, and the message has to say the
    // right one: a coordinate is derived, a colour is not a fact about the work. The answer offered
    // is the semantic one, so the reader learns what to send instead of only what not to.
    expect(message).toContain('appearance is not stored')
    expect(message).toContain('emphasis')
    expect(message).toContain('accessibility')
  })

  it('refuses every geometry spelling a caller is likely to reach for, in the checker’s words', async () => {
    // `x` AND `y` CAME OFF THIS LIST ON 6 SEPTEMBER 2026 and are now node intent: the old rule
    // that a block's position is never stored was withdrawn. They are the one
    // coordinate a node may carry — where somebody put it — and every other spelling is still
    // refused by name with the explanation shared/presentation.ts wrote. The case below stores one.
    for (const key of ['width', 'height', 'position', 'left', 'top', 'waypoints', 'style', 'css', 'zIndex']) {
      const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { [key]: 1 } })
      expect(res.statusCode, `${key} was not refused`).toBe(400)
      const message = errorOf(res)
      expect(message).toContain(key)
      // The explanation, not merely the key name: a caller told only "invalid field" goes and
      // guesses again. Taken from the checker at run time so the served words cannot drift from it.
      for (const problem of checkNodeIntent({ [key]: 1 }, h.gripper)) {
        expect(message).toContain(problem.problem)
      }
    }
    // Nothing was stored by any of them.
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({})
  })

  it('names a style key refused beside a stored place, and stores nothing', async () => {
    // THE ONE COORDINATE AND AN APPEARANCE IN ONE REQUEST. An x and a y together are stored on a
    // node; `fill` is still refused by name. Neither half lands: a write is a whole thing, and a
    // caller that kept the place would believe the fill was kept too.
    const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { x: 10, y: 24, fill: '#c0392b' } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('"fill"')
    expect(message).toContain('appearance is not stored')
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({})
  })

  it('stores where somebody put a node, and refuses half a place', async () => {
    // THE ONE COORDINATE, and both halves of it or neither. A node with only an x would be drawn at
    // the layout's y and somebody's x, which is a position nobody chose.
    const half = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { x: 10 } })
    expect(half.statusCode, 'half a place was accepted').toBe(400)
    expect(errorOf(half)).toContain('x and y go together')
    const whole = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { lane: 'the arm', x: 10, y: 24 } })
    expect(whole.statusCode, 'a node somebody moved was refused a place').toBe(200)
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({ nodes: { [h.gripper]: { lane: 'the arm', x: 10, y: 24 } } })
    await del(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`)
  })

  it('stores nothing at all when one key of a request is geometry', async () => {
    const res = await put(STRUCTURE_SCOPE, {
      intent: { direction: 'down', nodes: { [h.gripper]: { lane: 'the arm', width: 10 } } },
    })
    expect(res.statusCode).toBe(400)
    // The lane was perfectly good and it is not stored either: a write is a whole thing.
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({})
    expect(presentationChanges()).toEqual([])
  })
})

describe('the vocabulary is closed', () => {
  it('refuses a key that is not part of presentation intent, naming the ones that are', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { prominence: 'high' } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('"prominence" is not node intent')
    for (const key of ['lane', 'order', 'role', 'emphasis', 'collapsed', 'near']) {
      expect(message).toContain(key)
    }
  })

  it('refuses a direction that is not one of the two, listing them', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/direction`, { intent: { direction: 'sideways' } })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain(GRAPH_DIRECTIONS.join(', '))
  })

  it('refuses a role and an emphasis outside their lists, in the checker’s words', async () => {
    const role = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { role: 'huge' } })
    expect(role.statusCode).toBe(400)
    expect(errorOf(role)).toContain(NODE_ROLES.join(', '))

    const emphasis = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { emphasis: 'red' } })
    expect(emphasis.statusCode).toBe(400)
    expect(errorOf(emphasis)).toContain(EMPHASIS_ROLES.join(', '))
    expect(errorOf(emphasis)).toContain('a meaning, not a colour')
  })

  it('refuses an empty node intent rather than storing a row that says nothing', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: {} })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('says nothing')
  })
})

describe('a refusal lists every problem, not the first', () => {
  it('reports four problems in one answer, each at its own address', async () => {
    const res = await put(STRUCTURE_SCOPE, {
      intent: {
        x: 1,
        direction: 'diagonal',
        nodes: {
          [h.gripper]: { role: 'enormous', colour: 'red' },
        },
      },
    })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('4 problems')
    expect(message).toContain('x:')
    expect(message).toContain('direction:')
    expect(message).toContain(`nodes.${h.gripper}.role`)
    expect(message).toContain(`nodes.${h.gripper}.colour`)
  })

  it('says how many there were, so a caller knows it has the whole list', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { colour: 'red' } })
    expect(errorOf(res)).toContain('1 problem,')
  })
})

// ============================================================================ what it stores

describe('storing and reading an arrangement', () => {
  it('gives back exactly what was stored', async () => {
    const intent = {
      direction: 'right',
      nodes: {
        [h.gripper]: { lane: 'the arm', order: 1, role: 'prominent', emphasis: 'safety' },
        [h.camera]: { lane: 'perception', order: 2, collapsed: true, near: h.gripper },
      },
    }
    const written = writeOf(await put(STRUCTURE_SCOPE, { intent }))
    expect(written.changed.sort()).toEqual(['(scope)', h.camera, h.gripper].sort())

    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual(intent)
  })

  it('keeps a Chinese lane name exactly as it was written', async () => {
    const intent = { nodes: { [h.gripper]: { lane: '夹爪与力控', role: 'prominent' } } }
    writeOf(await put(STRUCTURE_SCOPE, { intent }))
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual(intent)
  })

  it('is empty until something is written, and says so rather than inventing a default', async () => {
    const res = await get(STRUCTURE_SCOPE)
    expect(res.statusCode).toBe(200)
    expect(intentOf(res)).toEqual({})
    expect((res.json() as { note: string }).note).toContain('Mole Office decides')
  })

  it('lets the same module be prominent in one pipeline and compact in another', async () => {
    // This is the whole reason intent is keyed by scope rather than stored on the record.
    const second = h.t.api.createRecord({ workspaceId: 'default',
      kind: 'pipeline',
      title: 'Transplant v2',
      data: { blockIds: [] },
      actor: h.t.api.HUMAN,
    }).id

    writeOf(await put(h.pipelineScopeName, { intent: { nodes: { [h.camera]: { role: 'prominent' } } } }))
    writeOf(await put(pipelineScope(second), { intent: { nodes: { [h.camera]: { role: 'compact' } } } }))

    expect(intentOf(await get(h.pipelineScopeName))).toEqual({ nodes: { [h.camera]: { role: 'prominent' } } })
    expect(intentOf(await get(pipelineScope(second)))).toEqual({ nodes: { [h.camera]: { role: 'compact' } } })
    // And the record itself carries neither. Presentation intent is a fact about a drawing.
    expect(h.t.api.getRecord(h.camera)?.data['role']).toBeUndefined()
  })

  it('arranges a pipeline block by its RECORD id, like every other node', async () => {
    // ONE FORM OF TARGET. It used to be `step:<step id>` for a step and a record id for anything
    // else, and the prefix was declared twice, in the server and in the browser, each with a header
    // saying it should be built in one place. A block is a record, so the second form is gone.
    const intent = { nodes: { [h.blocks[1]]: { lane: 'on the real arm', emphasis: 'active' } } }
    writeOf(await put(h.pipelineScopeName, { intent }))
    expect(intentOf(await get(h.pipelineScopeName))).toEqual(intent)
  })
})

describe('a whole-scope write REPLACES, and says what it removed', () => {
  it('removes a node the new arrangement does not name, and names it in the reply', async () => {
    writeOf(
      await put(STRUCTURE_SCOPE, {
        intent: { nodes: { [h.gripper]: { lane: 'the arm' }, [h.camera]: { lane: 'perception' } } },
      }),
    )
    const second = writeOf(await put(STRUCTURE_SCOPE, { intent: { nodes: { [h.gripper]: { lane: 'the arm' } } } }))

    expect(second.removed).toEqual([h.camera])
    expect(second.unchanged).toEqual([h.gripper])
    expect(second.note).toContain('removed')
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({ nodes: { [h.gripper]: { lane: 'the arm' } } })
  })

  it('writes nothing at all when the arrangement sent is the one already stored', async () => {
    const intent = { direction: 'down', nodes: { [h.gripper]: { lane: 'the arm' } } }
    writeOf(await put(STRUCTURE_SCOPE, { intent }))
    const before = presentationChanges().length

    // Same intent, different key order. Two ways of writing one arrangement are one arrangement.
    const again = writeOf(await put(STRUCTURE_SCOPE, { intent: { nodes: { [h.gripper]: { lane: 'the arm' } }, direction: 'down' } }))
    expect(again.changed).toEqual([])
    expect(again.unchanged.sort()).toEqual(['(scope)', h.gripper].sort())
    // No change row, because nothing changed. A day's page must not carry work nobody did.
    expect(presentationChanges().length).toBe(before)
  })
})

describe('changing one thing is a request that changes one thing', () => {
  it('sets the direction without touching the nodes', async () => {
    writeOf(await put(STRUCTURE_SCOPE, { intent: { nodes: { [h.gripper]: { lane: 'the arm' } } } }))
    writeOf(await put(`${STRUCTURE_SCOPE}/direction`, { intent: { direction: 'right' } }))

    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({
      direction: 'right',
      nodes: { [h.gripper]: { lane: 'the arm' } },
    })
  })

  it('refuses nodes sent to the direction route, and points at the two routes that take them', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/direction`, {
      intent: { direction: 'right', nodes: { [h.gripper]: { lane: 'the arm' } } },
    })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('/nodes/')
    expect(errorOf(res)).toContain('REPLACES')
  })

  it('sets one node without touching the others', async () => {
    writeOf(
      await put(STRUCTURE_SCOPE, {
        intent: { nodes: { [h.gripper]: { lane: 'the arm' }, [h.camera]: { lane: 'perception' } } },
      }),
    )
    writeOf(await put(`${STRUCTURE_SCOPE}/nodes/${h.camera}`, { intent: { lane: 'perception', role: 'compact' } }))

    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({
      nodes: { [h.gripper]: { lane: 'the arm' }, [h.camera]: { lane: 'perception', role: 'compact' } },
    })
  })

  it('removes one node’s intent and leaves the rest, and removing nothing is not an error', async () => {
    writeOf(
      await put(STRUCTURE_SCOPE, {
        intent: { nodes: { [h.gripper]: { lane: 'the arm' }, [h.camera]: { lane: 'perception' } } },
      }),
    )
    const removed = writeOf(await del(`${STRUCTURE_SCOPE}/nodes/${h.camera}`))
    expect(removed.removed).toEqual([h.camera])

    const again = writeOf(await del(`${STRUCTURE_SCOPE}/nodes/${h.camera}`))
    expect(again.removed).toEqual([])
    expect(again.note).toContain('Nothing was stored, removed or changed')
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({ nodes: { [h.gripper]: { lane: 'the arm' } } })
  })

  it('will not reach the scope’s own settings through the node route, in either direction', async () => {
    const sentinel = encodeURIComponent('(scope)')
    const written = await put(`${STRUCTURE_SCOPE}/nodes/${sentinel}`, { intent: { lane: 'the arm' } })
    expect(written.statusCode).toBe(400)
    expect(errorOf(written)).toContain('reserved for the scope')

    writeOf(await put(`${STRUCTURE_SCOPE}/direction`, { intent: { direction: 'down' } }))
    const removed = await del(`${STRUCTURE_SCOPE}/nodes/${sentinel}`)
    expect(removed.statusCode).toBe(400)
    expect(errorOf(removed)).toContain('/direction')
    // And it really did not remove it: one way in, not two.
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({ direction: 'down' })
  })

  it('clears a whole scope so Mole Office decides the drawing again', async () => {
    writeOf(await put(STRUCTURE_SCOPE, { intent: { direction: 'down', nodes: { [h.gripper]: { lane: 'the arm' } } } }))
    const cleared = writeOf(await del(STRUCTURE_SCOPE))
    expect(cleared.removed.sort()).toEqual(['(scope)', h.gripper].sort())
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({})
  })
})

// ============================================================================ references

describe('a reference that names nothing is refused, not stored', () => {
  it('refuses a node id no record has, and says how a node is addressed', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/nodes/no-such-record`, { intent: { lane: 'the arm' } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('no record has the id "no-such-record"')
    expect(message).toContain("one of a pipeline's blocks")
  })

  it('refuses a `near` that names nothing, at the near’s own address', async () => {
    const res = await put(STRUCTURE_SCOPE, {
      intent: { nodes: { [h.gripper]: { lane: 'the arm', near: 'nobody' } } },
    })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain(`nodes.${h.gripper}.near`)
    expect(errorOf(res)).toContain('"nobody"')
  })

  it('refuses a padded `near` rather than trimming it into a hint that does nothing', async () => {
    // Trimming it would store the trimmed value, which is a write path rewriting what was sent; NOT
    // trimming it and storing it would be a hint the drawing silently never matches. Refusing is the
    // only answer that neither rewrites nor goes quiet.
    const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { near: ` ${h.camera} ` } })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain(`" ${h.camera} "`)
  })

  it('refuses a node kept near itself', async () => {
    const res = await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { near: h.gripper } })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('cannot be kept near itself')
  })

  it('refuses the retired `step:` form, and says which record id to send instead', async () => {
    // NOT REWRITTEN QUIETLY. An agent that learnt the old form gets the exact string that works,
    // because the migration kept every author-written step id as the block's record id — so
    // `step:p-01` really can be answered with "send p-01" and be right. Accepting it silently would
    // leave two spellings of one target in the table, which is how this reference space grew four.
    const res = await put(`${h.pipelineScopeName}/nodes/step:p-01`, { intent: { lane: 'the arm' } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('old way of naming a pipeline step')
    expect(message).toContain('"p-01"')
  })

  it('refuses a block of ANOTHER pipeline, which this drawing has no node for', async () => {
    // THIS COULD NOT BE EXPRESSED BEFORE. A step id was only unique inside its own pipeline, so
    // being in the right pipeline was automatic; a record id is global, so arranging another
    // pipeline's block in this drawing is now a thing a caller can ask for, and it is refused.
    const other = h.t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Another pipeline', data: { blockIds: [] }, actor: h.t.api.HUMAN }).id
    const stranger = h.t.blocks.addBlock(other, { name: 'Somebody else\'s step', state: 'todo' }, h.t.api.HUMAN).block.id

    const res = await put(`${h.pipelineScopeName}/nodes/${stranger}`, { intent: { lane: 'later' } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('block of another pipeline')
    for (const id of h.blocks) expect(message).toContain(id)
  })

  it('refuses a block target on a pipeline that has no blocks written yet, saying so', async () => {
    const stub = h.t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'A pipeline nobody has written blocks for', actor: h.t.api.HUMAN }).id
    const res = await put(`${pipelineScope(stub)}/nodes/${h.blocks[0]}`, { intent: { lane: 'later' } })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('has no blocks yet')
  })
})

describe('a scope that names nothing is refused, not created', () => {
  it('refuses a word that is neither structure nor a pipeline, naming both forms', async () => {
    const res = await put('everything', { intent: { direction: 'down' } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain(STRUCTURE_SCOPE)
    expect(message).toContain('pipeline:')
  })

  it('answers 404 for a pipeline id nothing has', async () => {
    const res = await get(pipelineScope('nope'))
    expect(res.statusCode).toBe(404)
    // Same as graph-model: the refusal no longer puts the id in the sentence. It still refuses, and
    // it still says nothing was stored, which is what a caller acts on.
    expect(errorOf(res)).toContain('no pipeline at that address')
  })

  it('reads a scope written the way a browser writes it, with the colon escaped', async () => {
    // `encodeURIComponent('pipeline:abc')` is what any caller building the URL properly produces.
    // The two spellings must be ONE drawing, or an arrangement made from the browser would be
    // invisible to an agent that wrote the plain form.
    writeOf(await put(`${h.pipelineScopeName}/direction`, { intent: { direction: 'right' } }))
    const res = await get(encodeURIComponent(h.pipelineScopeName))
    expect(res.statusCode).toBe(200)
    expect(intentOf(res)).toEqual({ direction: 'right' })
  })

  it('reads a block target the same whether or not the caller escaped it', async () => {
    writeOf(await put(`${h.pipelineScopeName}/nodes/${encodeURIComponent(h.blocks[1])}`, { intent: { lane: 'on the real arm' } }))
    expect(intentOf(await get(h.pipelineScopeName))).toEqual({ nodes: { [h.blocks[1]]: { lane: 'on the real arm' } } })
  })

  it('does not let a padded scope name become a second drawing', async () => {
    // "structure " and "structure" would be two rows that look identical in any list — a silent
    // split, and the second reader would find the arrangement they made had gone.
    writeOf(await put(`${encodeURIComponent(`${STRUCTURE_SCOPE} `)}/nodes/${h.gripper}`, { intent: { lane: 'the arm' } }))
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({ nodes: { [h.gripper]: { lane: 'the arm' } } })

    const body = (await get()).json() as { scopes: { scope: string }[] }
    expect(body.scopes.map((s) => s.scope)).toEqual([STRUCTURE_SCOPE])
  })

  it('refuses a pipeline scope naming a module, and says where that module’s intent goes', async () => {
    const res = await get(pipelineScope(h.gripper))
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('is a module')
    expect(message).toContain(STRUCTURE_SCOPE)
  })
})

// ============================================================================ hints that cannot be honoured

describe('a hint the drawing cannot honour is reported, never quietly dropped', () => {
  it('reports intent whose record has been deleted, and keeps the intent', async () => {
    writeOf(await put(STRUCTURE_SCOPE, { intent: { nodes: { [h.camera]: { lane: 'perception', role: 'compact' } } } }))
    h.t.api.deleteRecord(h.camera, h.t.api.HUMAN)

    const res = await get(STRUCTURE_SCOPE)
    const report = reportOf(res)
    expect(report.unhonoured.map((u) => u.hint).sort()).toEqual(['lane', 'role'])
    expect(one([...new Set(report.unhonoured.map((u) => u.target))], 'target')).toBe(h.camera)
    expect(report.unhonoured[0]?.because).toContain('was deleted')
    // Nothing was thrown away: restoring the record brings the arrangement back.
    expect(intentOf(res)).toEqual({ nodes: { [h.camera]: { lane: 'perception', role: 'compact' } } })
  })

  it('reports a block that has since been taken out of its pipeline', async () => {
    writeOf(await put(h.pipelineScopeName, { intent: { nodes: { [h.blocks[2]]: { emphasis: 'blocked' } } } }))
    h.t.blocks.removeBlock(h.pipeline, h.blocks[2], h.t.api.HUMAN)

    const report = reportOf(await get(h.pipelineScopeName))
    const gone = one(report.unhonoured, 'unhonoured hint')
    expect(gone.target).toBe(h.blocks[2])
    expect(gone.hint).toBe('emphasis')
    // Removing a block takes it out of the order AND deletes the record, in one transaction, so the
    // reason a reader is given is the deletion — which is the more specific of the two true things
    // and the one that says how to get the arrangement back.
    expect(gone.because).toContain('was deleted')
    expect(gone.because).toContain('Compare sim against real')
  })

  it('reports a block that is still alive but no longer in this pipeline', async () => {
    // The other half of the same question, and it needs its own sentence: the block is not deleted
    // and is not missing, so neither "no record has that id" nor "it was deleted" is true of it.
    //
    // THE SHORTER ORDER IS WRITTEN STRAIGHT INTO THE TABLE, because no write path produces this
    // state any more: `checkBlockIds` refuses an order that leaves out a live block, through the
    // ordinary PATCH, through a kind change and through putting an earlier revision back. The
    // reader still has to defend itself, for the reason tests/helpers.ts gives about a settling
    // link written the same way — an archive restored tomorrow carries whatever it carries, and
    // rows written before the rule existed are in the corpus now.
    writeOf(await put(h.pipelineScopeName, { intent: { nodes: { [h.blocks[2]]: { emphasis: 'blocked' } } } }))
    const kept = h.t.api.getRecord(h.pipeline)
    h.t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(JSON.stringify({ blockIds: h.blocks.slice(0, 2) }), h.pipeline)
    expect(kept).not.toBeNull()

    const gone = one(reportOf(await get(h.pipelineScopeName)).unhonoured, 'unhonoured hint')
    expect(gone.target).toBe(h.blocks[2])
    expect(gone.because).toContain('no longer one of this pipeline')
  })

  it('reports a `near` that has gone while the node itself is still drawn', async () => {
    writeOf(
      await put(STRUCTURE_SCOPE, {
        intent: { nodes: { [h.gripper]: { lane: 'the arm', near: h.camera } } },
      }),
    )
    h.t.api.deleteRecord(h.camera, h.t.api.HUMAN)

    const report = reportOf(await get(STRUCTURE_SCOPE))
    const gone = one(report.unhonoured, 'unhonoured hint')
    expect(gone.target).toBe(h.gripper)
    expect(gone.hint).toBe('near')
    expect(gone.because).toContain(h.camera)
    // The lane on the same node is unaffected and is still reported as standing.
    expect(report.honoured).toContain(`${h.gripper}.lane`)
  })

  it('never lets an empty unhonoured list read as "the layout honoured everything"', async () => {
    writeOf(await put(STRUCTURE_SCOPE, { intent: { nodes: { [h.gripper]: { order: 3 } } } }))
    const body = (await get(STRUCTURE_SCOPE)).json() as { note: string; report: WriteBody['report'] }
    expect(body.report.unhonoured).toEqual([])
    // The server cannot know whether ELK took the order. The note says which half this report is.
    expect(body.note).toContain('references only')
    expect(body.note).toContain('browser')
  })
})

// ============================================================================ the change log

describe('every write appears in the change log, attributed to whoever made it', () => {
  it('files a node’s intent under the record it is about, naming the agent that wrote it', async () => {
    // ON A PIPELINE'S DRAWING AND NOT THE WHOLE-PROJECT ONE, since criterion P38: the module graph
    // is the owner's to arrange and an agent may still arrange a pipeline's. What this case is about — the
    // change row hanging off the node's own record, and naming the agent — is unchanged, and it
    // needs an agent's write to prove the second half at all.
    const node = h.blocks[1] ?? ''
    writeOf(await put(`${h.pipelineScopeName}/nodes/${node}`, { intent: { lane: 'the arm', emphasis: 'safety' } }, AS_AGENT))

    const row = one(presentationChanges(), 'presentation change row')
    expect(row.recordId).toBe(node)
    expect(row.field).toBe(`presentation[${h.pipelineScopeName}].${node}`)
    expect(row.actorType).toBe('agent')
    expect(row.actorId).toBe('claude-code')
    expect(row.oldValue).toBeNull()
    expect(JSON.parse(row.newValue ?? 'null')).toEqual({ emphasis: 'safety', lane: 'the arm' })
  })

  it('defaults to the human when no actor headers are sent — an agent and a person use one API', async () => {
    writeOf(await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { role: 'prominent' } }))
    const row = one(presentationChanges(), 'presentation change row')
    expect(row.actorType).toBe('human')
    expect(row.actorId).toBe(THE_TEST_OFFICES_OWNER.id)
  })

  it('files a block’s intent under the BLOCK, which now has a history to file it under', async () => {
    // It used to hang off the block's PIPELINE, because a step had no record of its own — the same
    // "a block has no history" problem that made version comparison impossible, in one more place.
    writeOf(await put(`${h.pipelineScopeName}/nodes/${h.blocks[1]}`, { intent: { lane: 'on the real arm' } }, AS_AGENT))
    const row = one(presentationChanges(), 'presentation change row')
    expect(row.recordId).toBe(h.blocks[1])
    expect(row.field).toBe(`presentation[${h.pipelineScopeName}].${h.blocks[1]}`)
  })

  it('logs a pipeline’s direction under the pipeline record, as the bare word', async () => {
    writeOf(await put(`${h.pipelineScopeName}/direction`, { intent: { direction: 'right' } }, AS_AGENT))
    const row = one(presentationChanges(), 'presentation change row')
    expect(row.recordId).toBe(h.pipeline)
    expect(row.field).toBe(`presentation[${h.pipelineScopeName}].direction`)
    expect(row.newValue).toBe('right')
  })

  it('files the whole-project direction under the scope, and SAYS SO in the reply', async () => {
    // The whole-project structure graph is not a record, so this one row has no record to hang off.
    // It is the only such row this feature writes, and the reply names it rather than leaving it to
    // be discovered by whoever finds the row later.
    const written = writeOf(await put(`${STRUCTURE_SCOPE}/direction`, { intent: { direction: 'down' } }, AS_THEM))
    expect(written.anchoredToTheScope).toContain(STRUCTURE_SCOPE)
    expect(written.anchoredToTheScope).toContain('not a fact about any one record')

    const row = one(presentationChanges(), 'presentation change row')
    expect(row.recordId).toBe(STRUCTURE_SCOPE)
    expect(row.field).toBe(`presentation[${STRUCTURE_SCOPE}].direction`)
  })

  it('does NOT say that for a node write in the same scope, which hangs off its record', async () => {
    const written = writeOf(await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { role: 'compact' } }))
    expect(written.anchoredToTheScope).toBeUndefined()
  })

  it('logs a removal as an update whose new value is nothing, not as a deleted record', async () => {
    writeOf(await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { lane: 'the arm' } }))
    writeOf(await del(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`))

    const rows = presentationChanges()
    expect(rows).toHaveLength(2)
    const removal = rows[1]
    expect(removal?.newValue).toBeNull()
    expect(JSON.parse(removal?.oldValue ?? 'null')).toEqual({ lane: 'the arm' })
    // The record itself was not deleted, so the log must not say `delete`.
    expect(h.t.api.listChanges({ workspaceId: 'default', recordId: h.gripper }).every((c) => c.op !== 'delete')).toBe(true)
  })

  it('writes one row per target, so a three-node arrangement is three rows', async () => {
    writeOf(
      await put(STRUCTURE_SCOPE, {
        intent: {
          direction: 'down',
          nodes: { [h.gripper]: { lane: 'the arm' }, [h.camera]: { lane: 'perception' } },
        },
      }),
      )
    expect(presentationChanges()).toHaveLength(3)
  })
})

// ============================================================================ the front door

describe('what the endpoint tells a caller that has never seen it', () => {
  it('serves the vocabulary from the shared lists, so it cannot describe a value the checker refuses', async () => {
    const body = (await get()).json() as {
      vocabulary: { direction: string[]; node: { role: string[]; emphasis: string[] }; neverStored: string }
      note: string
    }
    expect(body.vocabulary.direction).toEqual([...GRAPH_DIRECTIONS])
    expect(body.vocabulary.node.role).toEqual([...NODE_ROLES])
    expect(body.vocabulary.node.emphasis).toEqual([...EMPHASIS_ROLES])
    // THE VOCABULARY SAID "No x, no y" UNTIL THIS CHANGED, and that sentence was written before
    // 6 September 2026, when the ban on a node's position was lifted (criterion D19, explained
    // in src/shared/presentation.ts). The door stores both on a node, so the sentence
    // served to every caller has to say so, and must not promise the refusal it does not make.
    expect(body.vocabulary.neverStored).toContain('an x and a y together')
    expect(body.vocabulary.neverStored).toContain('src/shared/presentation.ts')
    expect(body.vocabulary.neverStored.toLowerCase()).not.toContain('no x')
    expect(body.note).toContain('Mole Office decides')
  })

  it('lists the scopes that have something stored, with who touched each last', async () => {
    // TWO SCOPES, TWO WRITERS, AND WHICH WAY ROUND CHANGED ON 6 SEPTEMBER 2026. The whole-project
    // graph is the owner's to arrange since criterion P38, so the owner writes that one and the agent writes the
    // pipeline's own drawing. What this case is about — the listing naming who touched each scope
    // last — is unchanged, and it still contrasts two writers rather than reporting one twice.
    writeOf(await put(STRUCTURE_SCOPE, { intent: { nodes: { [h.gripper]: { lane: 'the arm' } } } }, AS_THEM))
    writeOf(await put(h.pipelineScopeName, { intent: { direction: 'right' } }, AS_AGENT))

    const body = (await get()).json() as { scopes: { scope: string; nodes: number; hasDirection: boolean; updatedBy: string }[] }
    const structure = body.scopes.find((s) => s.scope === STRUCTURE_SCOPE)
    expect(structure).toEqual({
      scope: STRUCTURE_SCOPE,
      nodes: 1,
      hasDirection: false,
      updatedAt: expect.any(String),
      updatedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    })
    const pipeline = body.scopes.find((s) => s.scope === h.pipelineScopeName)
    expect(pipeline?.hasDirection).toBe(true)
    expect(pipeline?.nodes).toBe(0)
    expect(pipeline?.updatedBy).toBe('agent:claude-code')
  })

  it('says who wrote each target and when', async () => {
    writeOf(await put(`${STRUCTURE_SCOPE}/nodes/${h.gripper}`, { intent: { lane: 'the arm' } }, AS_THEM))
    const body = (await get(STRUCTURE_SCOPE)).json() as { targets: { target: string; updatedBy: string; updatedAt: string }[] }
    const target = one(body.targets, 'stored target')
    expect(target.target).toBe(h.gripper)
    // THE OWNER AND NOT AN AGENT SINCE CRITERION P38: the whole-project graph is the owner's to arrange.
    expect(target.updatedBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(target.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('the envelope', () => {
  it('refuses a body with no intent key rather than storing nothing', async () => {
    const res = await put(STRUCTURE_SCOPE, {})
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('"intent"')
  })

  it('tells a caller that sent the arrangement unwrapped what shape was expected', async () => {
    const res = await put(STRUCTURE_SCOPE, { direction: 'down', nodes: {} })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('{"intent"')
    expect(message).toContain('"direction"')
    expect(message).toContain('INSIDE')
  })

  it('accepts an empty arrangement, which is a real thing to say', async () => {
    writeOf(await put(STRUCTURE_SCOPE, { intent: { nodes: { [h.gripper]: { lane: 'the arm' } } } }))
    const cleared = writeOf(await put(STRUCTURE_SCOPE, { intent: {} }))
    expect(cleared.removed).toEqual([h.gripper])
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({})
  })

  it('refuses malformed JSON with a 400, not a 500', async () => {
    const res = await h.app.inject({
      method: 'PUT',
      url: `/api/presentation/${STRUCTURE_SCOPE}`,
      payload: '{"intent": ',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuses an arrangement over the size limit, saying how big it was', async () => {
    const nodes: Record<string, unknown> = {}
    // A lane long enough that a hundred of them pass 256 KB. Every one of them is a legal lane, so
    // this is the size check and not the vocabulary check doing the refusing.
    for (let i = 0; i < 100; i += 1) nodes[`node-${i}`] = { lane: 'x'.repeat(4000) }
    const res = await put(STRUCTURE_SCOPE, { intent: { nodes } })
    expect(res.statusCode).toBe(413)
    expect(errorOf(res)).toContain('bytes and the limit is')
  })
})

// ============================================================================ lanes

/**
 * LANES ARE STORED ON A PIPELINE'S DRAWING, AS A CLOSED LIST OF NAMED ARRANGEMENTS.
 *
 * A lane is a named part of the drawing with an arrangement: a row, a stack or a grid. It may sit
 * inside another lane, carry a record at its head, or stand beside a lane at the top. A node says
 * which lane it is in with its own `lane`, and once a scope lists its lanes, a node may only name
 * one of them. A scope that lists none keeps today's free lane names.
 *
 * Every refusal below is checked for two things: the address of the problem, and the lane's name in
 * the words, so a caller with ten lanes is told which one was wrong.
 *
 * THE TINTS ARE READ FROM THE MODULE AT RUN TIME rather than imported by name, so this file still
 * loads when the list is not exported and each case fails on its own answer instead.
 */
describe('lanes are stored on a pipeline’s drawing, and every lane is checked', () => {
  let tints: readonly string[] = []

  beforeAll(async () => {
    const exported = Reflect.get(await import('../src/shared/presentation.ts'), 'LANE_TINTS') as unknown
    tints = Array.isArray(exported) ? (exported as string[]) : []
  })

  /** A whole lanes list: nested twice, one headed grid with columns, one lane beside, and tints. */
  function fullLanes(): Record<string, unknown>[] {
    return [
      { name: 'intake', arrange: 'row', order: 1, tint: tints[0] },
      { name: 'bench', arrange: 'grid', columns: 2, head: h.blocks[0], order: 2, tint: tints[1] },
      { name: 'checks', arrange: 'stack', in: 'bench' },
      { name: 'late checks', arrange: 'row', in: 'checks', order: 1 },
      { name: 'notes', arrange: 'stack', beside: 'right', of: 'bench', tint: tints[tints.length - 1] },
    ]
  }

  /** One lanes list on the pipeline's drawing, refused: the reply's status and its words. */
  async function refused(lanes: unknown, nodes?: Record<string, unknown>): Promise<string> {
    const intent = nodes === undefined ? { lanes } : { lanes, nodes }
    const res = await put(h.pipelineScopeName, { intent }, AS_AGENT)
    expect(res.statusCode, res.body).toBe(400)
    // A refusal stores nothing at all: no lane, and no node beside it.
    expect(intentOf(await get(h.pipelineScopeName))).toEqual({})
    return errorOf(res)
  }

  it('stores a whole lanes list and gives it back exactly as it was sent', async () => {
    const intent = {
      lanes: fullLanes(),
      nodes: {
        [h.blocks[1]]: { lane: 'late checks', order: 1 },
        [h.blocks[2]]: { lane: 'notes' },
      },
    }
    const written = writeOf(await put(h.pipelineScopeName, { intent }, AS_AGENT))
    expect(written.changed.sort()).toEqual(['(scope)', h.blocks[1], h.blocks[2]].sort())
    expect(intentOf(await get(h.pipelineScopeName))).toEqual(intent)
    // The tints the list was built from are the exported ones, and there is more than one of them.
    expect(tints.length).toBeGreaterThan(1)
    expect(intentOf(await get(h.pipelineScopeName))['lanes']).toEqual(
      expect.arrayContaining([expect.objectContaining({ tint: tints[0] })]),
    )
  })

  it('writes nothing when the same lanes come again with their keys in another order', async () => {
    writeOf(await put(h.pipelineScopeName, { intent: { lanes: fullLanes() } }, AS_AGENT))
    const before = presentationChanges().length
    const reordered = fullLanes().map((lane) => Object.fromEntries(Object.entries(lane).reverse()))
    const again = writeOf(await put(h.pipelineScopeName, { intent: { lanes: reordered } }, AS_AGENT))
    expect(again.changed).toEqual([])
    expect(presentationChanges().length).toBe(before)
  })

  it('files the lanes in the change log under the pipeline, by the name lanes', async () => {
    const lanes = fullLanes()
    writeOf(await put(h.pipelineScopeName, { intent: { lanes } }, AS_AGENT))
    const row = one(presentationChanges(), 'presentation change row')
    expect(row.recordId).toBe(h.pipeline)
    expect(row.field).toBe(`presentation[${h.pipelineScopeName}].lanes`)
    expect(JSON.parse(row.newValue ?? 'null')).toEqual(lanes)
  })

  it('keeps the lanes when the direction alone is set or forgotten', async () => {
    const lanes = fullLanes()
    writeOf(await put(h.pipelineScopeName, { intent: { lanes } }, AS_AGENT))
    writeOf(await put(`${h.pipelineScopeName}/direction`, { intent: { direction: 'right' } }, AS_AGENT))
    expect(intentOf(await get(h.pipelineScopeName))).toEqual({ direction: 'right', lanes })
    writeOf(await del(`${h.pipelineScopeName}/direction`, AS_AGENT))
    expect(intentOf(await get(h.pipelineScopeName))).toEqual({ lanes })
  })

  it('reports a lane head whose record was deleted, and keeps the lane', async () => {
    const lanes = [{ name: 'bench', arrange: 'row', head: h.gripper }]
    writeOf(await put(h.pipelineScopeName, { intent: { lanes } }, AS_AGENT))
    h.t.api.deleteRecord(h.gripper, h.t.api.HUMAN)

    const res = await get(h.pipelineScopeName)
    const gone = one(reportOf(res).unhonoured, 'unhonoured hint')
    expect(gone.target).toBe('(scope)')
    expect(gone.hint).toBe('lanes.bench.head')
    expect(gone.because).toContain('was deleted')
    expect(intentOf(res)).toEqual({ lanes })
  })

  it('refuses lanes that are not a list, an empty list, and a lane that is not an object', async () => {
    const notList = await refused({ bench: { arrange: 'row' } })
    expect(notList).toContain('lanes: ')
    expect(notList).toContain('has to be a list')
    const empty = await refused([])
    expect(empty).toContain('lanes: ')
    expect(empty).toContain('empty list')
    const notObject = await refused(['bench'])
    expect(notObject).toContain('lanes[0]: ')
    expect(notObject).toContain('place 1')
  })

  it('refuses a key that is not lane intent, naming the lane and the keys that are', async () => {
    const message = await refused([{ name: 'intake', arrange: 'row', size: 3 }])
    expect(message).toContain('lanes[0].size: ')
    expect(message).toContain('"size"')
    expect(message).toContain('"intake"')
    for (const key of ['name', 'arrange', 'order', 'in', 'head', 'columns', 'beside', 'of', 'tint']) {
      expect(message).toContain(key)
    }
  })

  it('refuses geometry and appearance on a lane in the words they have everywhere else', async () => {
    const message = await refused([{ name: 'intake', arrange: 'row', width: 200, fill: '#c0392b' }])
    expect(message).toContain('lanes[0].width: ')
    expect(message).toContain('lanes[0].fill: ')
    expect(message).toContain('"intake"')
    // Taken from the checker at run time, as everywhere in this file: the words a scope gets for
    // the same two keys, not a copy of them.
    for (const problem of [...checkScopeIntent({ width: 200 }), ...checkScopeIntent({ fill: '#c0392b' })]) {
      expect(message).toContain(problem.problem)
    }
  })

  it('refuses a lane with no name, naming it by its place in the list', async () => {
    const message = await refused([{ name: 'intake', arrange: 'row' }, { arrange: 'stack' }])
    expect(message).toContain('lanes[1].name: ')
    expect(message).toContain('place 2')
  })

  it('refuses two lanes with one name', async () => {
    const message = await refused([
      { name: 'bench', arrange: 'row' },
      { name: 'bench', arrange: 'stack' },
    ])
    expect(message).toContain('lanes[1].name: ')
    expect(message).toContain('"bench"')
  })

  it('refuses an arrangement that is missing or is not row, stack or grid', async () => {
    const message = await refused([
      { name: 'intake' },
      { name: 'bench', arrange: 'circle' },
    ])
    expect(message).toContain('2 problems')
    expect(message).toContain('lanes[0].arrange: ')
    expect(message).toContain('"intake"')
    expect(message).toContain('lanes[1].arrange: ')
    expect(message).toContain('"bench"')
    expect(message).toContain('row, stack, grid')
  })

  it('refuses an order that is not a number, in the words a node’s order gets', async () => {
    const message = await refused([{ name: 'intake', arrange: 'row', order: 'first' }])
    expect(message).toContain('lanes[0].order: ')
    expect(message).toContain('"intake"')
    for (const problem of checkNodeIntent({ order: 'first' }, 'a node')) {
      expect(message).toContain(problem.problem)
    }
  })

  it('refuses an "in" that names no listed lane', async () => {
    const message = await refused([{ name: 'checks', arrange: 'stack', in: 'nowhere' }])
    expect(message).toContain('lanes[0].in: ')
    expect(message).toContain('"checks"')
    expect(message).toContain('"nowhere"')
  })

  it('refuses a lane that sits inside itself, directly or through another lane', async () => {
    const direct = await refused([{ name: 'loop', arrange: 'row', in: 'loop' }])
    expect(direct).toContain('lanes[0].in: ')
    expect(direct).toContain('"loop"')
    expect(direct).toContain('inside itself')

    const round = await refused([
      { name: 'upper', arrange: 'row', in: 'lower' },
      { name: 'lower', arrange: 'row', in: 'upper' },
    ])
    expect(round).toContain('inside itself')
    expect(round).toContain('"upper"')
    expect(round).toContain('"lower"')
  })

  it('refuses a head that names no record, in the words a node’s id gets', async () => {
    const message = await refused([{ name: 'bench', arrange: 'row', head: 'no-such-record' }])
    expect(message).toContain('lanes[0].head: ')
    expect(message).toContain('"bench"')
    expect(message).toContain('no record has the id "no-such-record"')
  })

  it('refuses columns on a lane that is not a grid, and columns that are not a whole number from 1', async () => {
    const onRow = await refused([{ name: 'intake', arrange: 'row', columns: 2 }])
    expect(onRow).toContain('lanes[0].columns: ')
    expect(onRow).toContain('"intake"')
    expect(onRow).toContain('grid')

    const notWhole = await refused([
      { name: 'bench', arrange: 'grid', columns: 1.5 },
      { name: 'shelf', arrange: 'grid', columns: 0 },
    ])
    expect(notWhole).toContain('2 problems')
    expect(notWhole).toContain('lanes[0].columns: ')
    expect(notWhole).toContain('"bench"')
    expect(notWhole).toContain('lanes[1].columns: ')
    expect(notWhole).toContain('"shelf"')
  })

  it('refuses "beside" without "of", "of" without "beside", and a side that is not left or right', async () => {
    const message = await refused([
      { name: 'bench', arrange: 'row' },
      { name: 'notes', arrange: 'stack', beside: 'right' },
      { name: 'shelf', arrange: 'stack', of: 'bench' },
      { name: 'tray', arrange: 'stack', beside: 'above', of: 'bench' },
    ])
    expect(message).toContain('lanes[1].beside: ')
    expect(message).toContain('"notes"')
    expect(message).toContain('lanes[2].of: ')
    expect(message).toContain('"shelf"')
    expect(message).toContain('lanes[3].beside: ')
    expect(message).toContain('"tray"')
  })

  it('refuses an "of" that names a lane inside another lane, or no listed lane', async () => {
    const message = await refused([
      { name: 'bench', arrange: 'row' },
      { name: 'checks', arrange: 'stack', in: 'bench' },
      { name: 'notes', arrange: 'stack', beside: 'left', of: 'checks' },
      { name: 'shelf', arrange: 'stack', beside: 'left', of: 'nowhere' },
    ])
    expect(message).toContain('lanes[2].of: ')
    expect(message).toContain('"notes"')
    expect(message).toContain('"checks"')
    expect(message).toContain('lanes[3].of: ')
    expect(message).toContain('"shelf"')
    expect(message).toContain('"nowhere"')
  })

  it('refuses a lane that is both inside a lane and beside one', async () => {
    const message = await refused([
      { name: 'bench', arrange: 'row' },
      { name: 'notes', arrange: 'stack', in: 'bench', beside: 'left', of: 'bench' },
    ])
    expect(message).toContain('lanes[1].beside: ')
    expect(message).toContain('"notes"')
  })

  it('refuses a tint that is not one of the lane tints, listing them', async () => {
    const message = await refused([{ name: 'intake', arrange: 'row', tint: 'crimson' }])
    expect(message).toContain('lanes[0].tint: ')
    expect(message).toContain('"intake"')
    expect(message).toContain('"crimson"')
    expect(tints.length).toBeGreaterThan(1)
    for (const tint of tints) expect(message).toContain(tint)
  })

  it('refuses a node lane the listed lanes do not have, on both routes', async () => {
    const whole = await refused([{ name: 'bench', arrange: 'row' }], { [h.blocks[1]]: { lane: 'elsewhere' } })
    expect(whole).toContain(`nodes.${h.blocks[1]}.lane: `)
    expect(whole).toContain('"elsewhere"')

    writeOf(await put(h.pipelineScopeName, { intent: { lanes: [{ name: 'bench', arrange: 'row' }] } }, AS_AGENT))
    const single = await put(`${h.pipelineScopeName}/nodes/${h.blocks[1]}`, { intent: { lane: 'elsewhere' } }, AS_AGENT)
    expect(single.statusCode, single.body).toBe(400)
    expect(errorOf(single)).toContain(`${h.blocks[1]}.lane: `)
    expect(errorOf(single)).toContain('"elsewhere"')
    // A lane the list has is still a lane a node may name.
    writeOf(await put(`${h.pipelineScopeName}/nodes/${h.blocks[1]}`, { intent: { lane: 'bench' } }, AS_AGENT))
  })

  it('refuses lanes on the whole-project structure drawing', async () => {
    const res = await put(STRUCTURE_SCOPE, { intent: { lanes: [{ name: 'bench', arrange: 'row' }] } })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('lanes: ')
    expect(message).toContain('pipeline')
    // Refused as lanes on the wrong drawing, not as a key nobody knows.
    expect(message).not.toContain('is not part of presentation intent')
    expect(intentOf(await get(STRUCTURE_SCOPE))).toEqual({})
  })

  it('still stores a node lane on a drawing that lists no lanes', async () => {
    const intent = { nodes: { [h.blocks[1]]: { lane: 'any name at all' } } }
    writeOf(await put(h.pipelineScopeName, { intent }, AS_AGENT))
    expect(intentOf(await get(h.pipelineScopeName))).toEqual(intent)
    writeOf(await put(`${h.pipelineScopeName}/nodes/${h.blocks[2]}`, { intent: { lane: 'another name' } }, AS_AGENT))
  })
})
