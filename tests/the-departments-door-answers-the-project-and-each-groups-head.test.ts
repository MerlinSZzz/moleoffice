// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEPARTMENTS DOOR ANSWERS THE PROJECT AND EACH GROUP'S HEAD, AND ORDERS THE GROUPS BY IT. Wave 13s round 281, DT-2.
 *
 * WHAT IS PROVED, in a test office of its own with made-up agents and departments:
 *   1. With no department filed, GET /api/departments still answers project: the workspace's title, the office owner as
 *      theOfficeOwner reads it, and no departments and no teams.
 *   2. Each department read carries head. A department with no live department under it has none. A group whose lines
 *      share one recorded leader has an agreed head naming the lines it came from, and a merged line is not one of them.
 *      A group whose lines name different leaders says its lines disagree, with each leader and the lines behind it. A
 *      group whose lines record no leader says so in a sentence. A line whose leader is not recorded is left out of the
 *      head and keeps its own leader state.
 *   3. The top departments are ordered before the page is cut: agreed heads by the head's handle, then the groups whose
 *      lines disagree, then those with no head, each tie in the order filed. Read a page at a time, the pages join into
 *      that order, each says how many there are, and each answers the same project part, which counts the top
 *      departments that are not merged and the teams under them. The lines under a group stay in the order filed.
 *   4. The one-department door reads the same head.
 *   5. Nothing is stored: the reads write no record and no revision.
 *
 * The order filed is read from src/server/lib/departments.ts, whose read lists the departments in that order, so two
 * departments filed in one second are not taken to be in an order the store does not hold.
 */
import type { FastifyInstance } from 'fastify'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR } from '../src/shared/roles.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const made = mkdtempSync(join(tmpdir(), 'mole-office-departments-head-'))
const home = join(made, 'home')

/** The two made-up agents that lead lines: each line's supervisor is moved to one of them as its owner. */
const ALPHA = 'made-up-head-alpha'
const BRAVO = 'made-up-head-bravo'
/** One made-up supervisor for each line that has one, and the leader its owner is moved to; null removes the owner. */
const SUPERVISORS: readonly (readonly [string, string | null])[] = [
  ['made-up-line-2a', BRAVO],
  ['made-up-line-2b', ALPHA],
  ['made-up-line-3a', BRAVO],
  ['made-up-line-3b', null],
  ['made-up-line-5a', ALPHA],
  ['made-up-line-5b', ALPHA],
  ['made-up-line-5c', BRAVO],
  ['made-up-line-7a', ALPHA],
]

let t0: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const ids = new Map<string, string>()

const idOf = (handle: string): string => {
  const id = ids.get(handle)
  if (id === undefined || id === '') throw new Error(`the test registered no agent ${handle}`)
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown): Promise<{ status: number; body: any; raw: string }> {
  const reply = await app.inject({ method, url, headers: PERSON, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, raw: reply.body }
}

/** The person files a department by their own press, and the door answers 201. */
async function filed(name: string, more: Record<string, unknown> = {}): Promise<string> {
  const answer = await call('POST', '/api/departments', { nameEn: name, state: 'running', ...more })
  expect(answer.status, answer.raw).toBe(201)
  return String(answer.body.department.id)
}

/** The person merges a department into another, keeping its other fields. */
async function merged(id: string, name: string, into: string, more: Record<string, unknown> = {}): Promise<void> {
  const answer = await call('PUT', `/api/departments/${id}`, { nameEn: name, state: 'merged', mergedInto: into, ...more })
  expect(answer.status, answer.raw).toBe(200)
}

/** A supervisor of one made-up line, as a department names it. */
const supervisedBy = (handle: string): Record<string, unknown> => ({ supervisor: { kind: 'agent', id: idOf(handle) } })

/** The leader a made-up agent is, as a head names it. */
const theAgent = (handle: string): { kind: 'agent'; id: string } => ({ kind: 'agent', id: idOf(handle) })

/** How many records and revisions the test office holds. */
function theStore(): { records: number; revisions: number } {
  const count = (table: string): number => (t0.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  return { records: count('records'), revisions: count('revisions') }
}

/** The given departments in the order they were filed, as the product's own read of the store lists them. */
async function inTheOrderFiled(some: readonly string[]): Promise<string[]> {
  const { readTheDepartments } = await import('../src/server/lib/departments.ts')
  return readTheDepartments('default')
    .all.map((one) => one.id)
    .filter((id) => some.includes(id))
}

/** Every department of a page's tree, at any depth, by id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function byId(nodes: readonly any[], into = new Map<string, any>()): Map<string, any> {
  for (const node of nodes) {
    into.set(String(node.id), node)
    byId(node.subDepartments ?? [], into)
  }
  return into
}

/** The groups and lines this file files, by a short name. */
const d: Record<string, string> = {}

beforeAll(async () => {
  mkdirSync(home)
  process.env.HOME = home
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t0 = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  for (const [handle, role] of [[ALPHA, THE_SECRETARY], [BRAVO, THE_SECRETARY], ...SUPERVISORS.map(([one]) => [one, THE_SUPERVISOR] as const)] as const) {
    const started = await call('POST', '/api/agents/started', { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  for (const [supervisor, leader] of SUPERVISORS) {
    if (leader === null) continue
    const moved = await call('POST', `/api/agents/${idOf(supervisor)}/owner`, {
      owner: { kind: 'agent', id: idOf(leader) },
      because: 'A made-up leader for a made-up line.',
    })
    expect(moved.status, moved.raw).toBe(200)
  }
  t0.client.sqlite.prepare('UPDATE agents SET owner_id = NULL, owner_kind = NULL WHERE id = ?').run(idOf('made-up-line-3b'))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t0?.close()
  rmSync(made, { recursive: true, force: true })
})

describe('the departments door answers the project and each group’s head', () => {
  it('1: with no department filed, the project part is answered with the title, the owner and no counts', async () => {
    const { getWorkspace } = await import('../src/server/db/get-workspace.ts')
    const { theOfficeOwner } = await import('../src/server/db/the-office-owner.ts')
    const none = await call('GET', '/api/departments')
    expect(none.status, none.raw).toBe(200)
    expect(none.body.departments).toBeNull()
    expect(none.body.project).toEqual({
      title: getWorkspace('default')?.title,
      owner: { kind: 'person', id: theOfficeOwner().id },
      departments: 0,
      teams: 0,
    })
  })

  it('2-5: each group’s head, the order by it across pages, the same project part on each page, and nothing stored', async () => {
    // G1 has nothing under it. G2's lines name two leaders. G3 has one line led by bravo, one whose supervisor has no
    // recorded owner and a resting one with no supervisor. G4's one line has no supervisor. G5's two live lines are led
    // by alpha, and a line merged into one of them is led by bravo. G6 is merged into G1. G7's one line is led by alpha.
    d.g1 = await filed('Made-up group one')
    d.g2 = await filed('Made-up group two')
    d.g3 = await filed('Made-up group three')
    d.g4 = await filed('Made-up group four')
    d.g5 = await filed('Made-up group five')
    d.g6 = await filed('Made-up group six')
    d.g7 = await filed('Made-up group seven')
    d.l2a = await filed('Made-up line 2a', { parent: d.g2, ...supervisedBy('made-up-line-2a') })
    d.l2b = await filed('Made-up line 2b', { parent: d.g2, ...supervisedBy('made-up-line-2b') })
    d.l3a = await filed('Made-up line 3a', { parent: d.g3, ...supervisedBy('made-up-line-3a') })
    d.l3b = await filed('Made-up line 3b', { parent: d.g3, ...supervisedBy('made-up-line-3b') })
    d.l3c = await filed('Made-up line 3c', { parent: d.g3, state: 'resting' })
    d.l4a = await filed('Made-up line 4a', { parent: d.g4, state: 'resting' })
    d.l5a = await filed('Made-up line 5a', { parent: d.g5, ...supervisedBy('made-up-line-5a') })
    d.l5b = await filed('Made-up line 5b', { parent: d.g5, ...supervisedBy('made-up-line-5b') })
    d.l5c = await filed('Made-up line 5c', { parent: d.g5, ...supervisedBy('made-up-line-5c') })
    d.l7a = await filed('Made-up line 7a', { parent: d.g7, ...supervisedBy('made-up-line-7a') })
    await merged(d.l5c, 'Made-up line 5c', d.l5a, { parent: d.g5, ...supervisedBy('made-up-line-5c') })
    await merged(d.g6, 'Made-up group six', d.g1)

    const before = theStore()
    const { getWorkspace } = await import('../src/server/db/get-workspace.ts')
    const { theOfficeOwner } = await import('../src/server/db/the-office-owner.ts')
    const project = {
      title: getWorkspace('default')?.title,
      owner: { kind: 'person', id: theOfficeOwner().id },
      // Six top departments are not merged. Their teams: G1 is one, G2 two, G3 three, G4 one, G5 two and G7 one.
      departments: 6,
      teams: 10,
    }

    // THE ORDER: alpha's agreed heads, tied, in the order filed; bravo's; the lines that disagree; then no head.
    const expected = [
      ...(await inTheOrderFiled([d.g5, d.g7])),
      d.g3,
      d.g2,
      ...(await inTheOrderFiled([d.g1, d.g4, d.g6])),
    ]
    const whole = await call('GET', '/api/departments')
    expect(whole.status, whole.raw).toBe(200)
    expect(whole.body.departments.map((one: { id: string }) => one.id)).toEqual(expected)
    expect(whole.body.project).toEqual(project)

    const pages: string[] = []
    for (const offset of [0, 3, 6]) {
      const page = await call('GET', `/api/departments?offset=${String(offset)}&limit=3`)
      expect(page.status, page.raw).toBe(200)
      expect(page.body.total).toBe(7)
      expect(page.body.project).toEqual(project)
      pages.push(...page.body.departments.map((one: { id: string }) => String(one.id)))
    }
    expect(pages).toEqual(expected)

    // THE HEADS.
    const tree = byId(whole.body.departments)
    expect(tree.get(d.g1).head).toBeNull()
    expect(tree.get(d.g6).head).toBeNull()
    for (const line of [d.l2a, d.l2b, d.l3a, d.l3b, d.l3c, d.l4a, d.l5a, d.l5b, d.l5c, d.l7a]) {
      expect(tree.get(line).head, `${line} has no department under it`).toBeNull()
    }
    expect(tree.get(d.g5).head).toEqual({ state: 'agreed', leader: theAgent(ALPHA), handle: ALPHA, from: await inTheOrderFiled([d.l5a, d.l5b]) })
    expect(tree.get(d.g7).head).toEqual({ state: 'agreed', leader: theAgent(ALPHA), handle: ALPHA, from: [d.l7a] })
    expect(tree.get(d.g3).head).toEqual({ state: 'agreed', leader: theAgent(BRAVO), handle: BRAVO, from: [d.l3a] })
    expect(tree.get(d.l3b).leader.state).toBe('owner-not-recorded')
    expect(tree.get(d.l3c).leader.state).toBe('no-supervisor')

    const disagree = tree.get(d.g2).head
    expect(disagree.state).toBe('the-lines-disagree')
    expect(Object.keys(disagree).sort()).toEqual(['leaders', 'state'])
    expect([...disagree.leaders].sort((a: { handle: string }, b: { handle: string }) => a.handle.localeCompare(b.handle))).toEqual([
      { leader: theAgent(ALPHA), handle: ALPHA, from: [d.l2b] },
      { leader: theAgent(BRAVO), handle: BRAVO, from: [d.l2a] },
    ])

    const nobody = tree.get(d.g4).head
    expect(nobody.state).toBe('no-line-has-a-leader')
    expect(Object.keys(nobody).sort()).toEqual(['says', 'state'])
    expect(typeof nobody.says).toBe('string')
    expect(nobody.says).not.toBe('')
    expect(tree.get(d.l4a).leader.state).toBe('no-supervisor')

    // THE LINES UNDER A GROUP STAY IN THE ORDER FILED, merged ones too.
    for (const [group, lines] of [
      [d.g2, [d.l2a, d.l2b]],
      [d.g3, [d.l3a, d.l3b, d.l3c]],
      [d.g5, [d.l5a, d.l5b, d.l5c]],
    ] as const) {
      expect(tree.get(group).subDepartments.map((one: { id: string }) => one.id)).toEqual(await inTheOrderFiled(lines))
    }

    // THE ONE-DEPARTMENT DOOR READS THE SAME HEAD.
    const one = await call('GET', `/api/departments/${d.g5}`)
    expect(one.status, one.raw).toBe(200)
    expect(one.body.department.head).toEqual(tree.get(d.g5).head)

    // NOTHING IS STORED by any of these reads.
    expect(theStore()).toEqual(before)
  }, 60_000)
})
