// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION'S POINTS, FILED IN ONE ACT AND READ BACK. Wave 13s round 234, on a decision and the design report
 * 1NH-LLi6LGb-.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, with a project of its
 * own for each case. Every decision, line, number and reason here is made up.
 *
 * THE CASES, in order, on one world:
 *   1. a decision's points are filed in one call and read back in the line's order; each is a backlog item naming
 *      the decision, the line, its number and why, in the todo state, placed by the caller's REGISTRY id;
 *   2. the read names no other decision's points, no point that names no decision, and a decision from another
 *      project is refused, as is a record that is not a decision;
 *   3. the whole call is all or nothing: a duplicate number, a blank why, or a files entry that is not a string
 *      writes no record at all;
 *   4. a point with no doneWhen is filed incomplete and the reply says so; a point with one is complete;
 *   5. a caller who is not the person and not a registered agent is refused, and nothing is written.
 *
 * MUTATIONS, each run alone after a green control and restored after:
 *   - `thePointsOfADecision` sorts by the reverse of `inTheLinesOrder`: case 1 is red on the order, with the other
 *     four green;
 * The other four cases were green in the control run and are aimed at by the remaining guards named above: the
 * decision read refuses another project and another kind (case 2), every point is checked before the transaction
 * (case 3), `doneWhen` is written only when it was given (case 4), and the caller is resolved through the registry
 * (case 5). The supervisor asked for one mutation rather than one per case, because test seats were the bottleneck.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { PanelRecord } from '../src/shared/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let WORKSPACE = 'panelx'
let caseNumber = 0

let t: TestDb
let app: FastifyInstance

const human = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
})

const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': WORKSPACE,
})

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(() => {
  app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `points-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'Points' } })
  expect(made.statusCode, made.body).toBe(201)
})

/** File one record through the route and hand back its id. A decision says it replaces none, as the door requires. */
async function file(
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  headers: Record<string, string> = human(),
): Promise<string> {
  const withReplaces = kind === 'decision' && !Object.hasOwn(data, 'replaces') ? { replaces: [], ...data } : data
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: withReplaces } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** Register a durable agent through the route and hand back the registry id it gave. */
async function registerAgent(handle: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: human(),
    payload: { handle, name: handle },
  })
  expect(res.statusCode, res.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no registry row for ${handle}`).toBeDefined()
  return row!.id
}

/** File points through the door, with one body overridden. */
async function filePoints(body: Record<string, unknown>, headers: Record<string, string> = human()): Promise<ReturnType<FastifyInstance['inject']>> {
  return app.inject({ method: 'POST', url: '/api/backlog/points', headers, payload: body })
}

/** Read one decision's points through the door. */
async function readPoints(decision: string, headers: Record<string, string> = human()): Promise<ReturnType<FastifyInstance['inject']>> {
  return app.inject({
    method: 'GET',
    url: `/api/backlog/points?decision=${encodeURIComponent(decision)}`,
    headers,
  })
}

/** How many records the table holds, deleted or not. */
function recordsStored(): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
}

describe('the points of a decision', () => {
  it("1. files them in one call, and reads them back in the line's order, placed by a registry id", async () => {
    const decision = await file('decision', 'The decision whose points are filed')
    const filerId = await registerAgent(`points-filer-${String(caseNumber)}`)
    const said = await filePoints(
      {
        decisionId: decision,
        line: '13s',
        points: [
          { number: '2', why: 'Made-up: the second thing the decision asks for.', order: 2 },
          {
            number: '1',
            why: 'Made-up: the first thing the decision asks for.',
            doneWhen: 'Made-up: the first thing is true.',
            order: 1,
          },
        ],
      },
      asAgent(`points-filer-${String(caseNumber)}`),
    )
    expect(said.statusCode, said.body).toBe(201)
    const body = said.json() as {
      decision: { id: string; title: string }
      points: PanelRecord[]
      note: string
    }
    expect(body.decision).toEqual({ id: decision, title: 'The decision whose points are filed' })
    // THE REPLAY IS IN THE ORDER GIVEN, not in the line's order.
    expect(body.points.map((point) => point.data['number'])).toEqual(['2', '1'])
    for (const point of body.points) {
      expect(point.kind).toBe('backlog_item')
      expect(point.data['fromDecision']).toBe(decision)
      expect(point.data['line']).toBe('13s')
      expect(typeof point.data['number']).toBe('string')
      expect(typeof point.data['why']).toBe('string')
      expect(point.data['state']).toBe('todo')
      // THE REGISTRY ID, NEVER THE HANDLE THE CALLER SENT.
      expect(point.data['placedBy']).toEqual({ kind: 'agent', id: filerId })
      expect(point.data['placedBy']).not.toEqual({ kind: 'agent', id: `points-filer-${String(caseNumber)}` })
      expect(point.data['source']).toContain(decision)
      expect(point.title).toBe(`Point ${String(point.data['number'])} of 13s`)
    }

    const read = await readPoints(decision)
    expect(read.statusCode, read.body).toBe(200)
    const readBody = read.json() as { decisionId: string; points: PanelRecord[]; noneFiled: string | null }
    expect(readBody.decisionId).toBe(decision)
    expect(readBody.points.map((point) => point.id)).toEqual([body.points[1]!.id, body.points[0]!.id])
    expect(readBody.noneFiled).toBeNull()
  })

  it("2. names no other decision's points, and refuses a decision from another project or a record of another kind", async () => {
    const decision = await file('decision', 'The decision being read')
    const other = await file('decision', 'Another decision in the same project')
    const first = await filePoints({
      decisionId: decision,
      line: '13s',
      points: [{ number: '1', why: 'Made-up: this decision asks for one thing.' }],
    })
    expect(first.statusCode, first.body).toBe(201)
    const second = await filePoints({
      decisionId: other,
      line: '13s',
      points: [{ number: '1', why: 'Made-up: the other decision asks for its own thing.' }],
    })
    expect(second.statusCode, second.body).toBe(201)
    // AN ITEM THAT NAMES NO DECISION IS NOT ANY DECISION'S POINT.
    const noDecision = await file('backlog_item', 'A point that names no decision', {
      line: '13s',
      number: '9',
      placedBy: { kind: 'person', id: THE_PERSON },
      why: 'Made-up: it was placed by hand.',
      state: 'todo',
    })

    const read = await readPoints(decision)
    expect(read.statusCode, read.body).toBe(200)
    const ids = (read.json() as { points: PanelRecord[] }).points.map((point) => point.id)
    expect(ids).toEqual([(first.json() as { points: PanelRecord[] }).points[0]!.id])
    expect(ids).not.toContain((second.json() as { points: PanelRecord[] }).points[0]!.id)
    expect(ids).not.toContain(noDecision)

    // A DECISION IN ANOTHER PROJECT IS REFUSED, not answered with an empty list.
    const otherProject = `points-other-${String(caseNumber)}`
    const made = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { id: otherProject, title: 'Another project' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const foreign = await file('decision', 'A decision in another project', {}, {
      ...human(),
      'x-mole-office-workspace': otherProject,
    })
    const refused = await readPoints(foreign)
    expect(refused.statusCode, refused.body).toBe(400)

    // AND A RECORD THAT IS NOT A DECISION IS REFUSED TOO.
    const task = await file('task', 'A task is not a decision')
    const refusedKind = await readPoints(task)
    expect(refusedKind.statusCode, refusedKind.body).toBe(400)
  })

  it('3. writes nothing when one point is bad: a duplicate number, a blank why, or a files entry that is not a string', async () => {
    const decision = await file('decision', 'The decision whose points are all or nothing')
    const before = recordsStored()
    const badCalls: { what: string; points: unknown[] }[] = [
      {
        what: 'a duplicate number',
        points: [
          { number: '1', why: 'Made-up: the first version.' },
          { number: '1', why: 'Made-up: the same number again.' },
        ],
      },
      {
        what: 'a blank why',
        points: [
          { number: '1', why: 'Made-up: this one is fine.' },
          { number: '2', why: '   ' },
        ],
      },
      {
        what: 'a files entry that is not a string',
        points: [
          { number: '1', why: 'Made-up: this one is fine too.' },
          { number: '2', why: 'Made-up: the second is fine, its files are not.', files: ['src/one.ts', 7] },
        ],
      },
    ]
    for (const one of badCalls) {
      const refused = await filePoints({ decisionId: decision, line: '13s', points: one.points })
      expect(refused.statusCode, `${one.what}: ${refused.body}`).toBe(400)
      expect(recordsStored(), `${one.what} wrote a record`).toBe(before)
    }
    const read = await readPoints(decision)
    expect(read.statusCode, read.body).toBe(200)
    expect((read.json() as { points: PanelRecord[] }).points).toEqual([])
  })

  it('4. files a point with no doneWhen as incomplete, and the reply says so', async () => {
    const decision = await file('decision', 'The decision with an unfinished point')
    const said = await filePoints({
      decisionId: decision,
      line: '13s',
      points: [{ number: '1', why: 'Made-up: nobody has said what finished means.' }],
    })
    expect(said.statusCode, said.body).toBe(201)
    const body = said.json() as { points: PanelRecord[]; note: string }
    expect(body.note).toContain('incomplete')
    expect(body.note).toContain('doneWhen')
    const point = body.points[0]!
    // THE PERSON FILED IT, so who placed it is the person's registry reference.
    expect(point.data['placedBy']).toEqual({ kind: 'person', id: THE_PERSON })
    expect('doneWhen' in point.data).toBe(false)

    const stored = await app.inject({ method: 'GET', url: `/api/records/${point.id}`, headers: human() })
    expect(stored.statusCode, stored.body).toBe(200)
    expect(JSON.stringify((stored.json() as { incomplete: unknown }).incomplete)).toContain('doneWhen')

    // A POINT WITH WHAT FINISHED MEANS IS COMPLETE.
    const complete = await filePoints({
      decisionId: decision,
      line: '13s',
      points: [
        {
          number: '2',
          why: 'Made-up: somebody said what finished means.',
          doneWhen: 'Made-up: the second point is true.',
        },
      ],
    })
    expect(complete.statusCode, complete.body).toBe(201)
    const completePoint = (complete.json() as { points: PanelRecord[] }).points[0]!
    expect(completePoint.data['doneWhen']).toBe('Made-up: the second point is true.')
    const storedComplete = await app.inject({ method: 'GET', url: `/api/records/${completePoint.id}`, headers: human() })
    expect(storedComplete.statusCode, storedComplete.body).toBe(200)
    expect((storedComplete.json() as { incomplete: unknown[] }).incomplete).toEqual([])
  })

  it('5. refuses a caller who is neither the person nor a registered agent, in the door and in the library, and writes nothing', async () => {
    const decision = await file('decision', 'The decision nobody registered may file')
    const before = recordsStored()
    // THE DOOR AND THE LIBRARY REFUSE IT, and through `app.inject` the library's own sentence is the one that
    // comes back: an in-process caller has no listener, so `actorFrom`'s socket-only guard leaves the decision
    // to the library, which is the guard this piece was asked to add.
    const refused = await filePoints(
      {
        decisionId: decision,
        line: '13s',
        points: [{ number: '1', why: 'Made-up: an unregistered caller asks for this.' }],
      },
      asAgent('a-writer-nothing-registered'),
    )
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body).toContain('registered')
    expect(recordsStored()).toBe(before)

    // AND THE LIBRARY REFUSES IT FOR A CALLER THAT DOES NOT COME THROUGH THE DOOR, with its own sentence.
    const backlog = await import('../src/server/lib/backlog.ts')
    expect(() =>
      backlog.fileThePointsOfADecision({
        decisionId: decision,
        workspaceId: WORKSPACE,
        line: '13s',
        points: [{ number: '1', why: 'Made-up: the same unregistered caller, in process.' }],
        actor: { type: 'agent', id: 'a-writer-nothing-registered' },
      }),
    ).toThrow(/Only the person or a registered agent/)
    expect(recordsStored()).toBe(before)
  })
})
