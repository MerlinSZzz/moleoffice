// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OVERLAP OPENS A GROUP AND REFUSES NOTHING — CRITERION P95.
 *
 * When a
 * registration or widening overlaps the area of another agent at work, the office opens a group with
 * both agents and their supervisors, and the secretary where there is none, and says so on both
 * citizen pages. NOTHING IS REFUSED BY THE OVERLAP ALONE — that sentence is the criterion, and it is
 * the one easiest to get backwards.
 *
 * "AT WORK" IS THE OFFICE'S OWN WORD: an agent with a live work claim, which is the moment P93's
 * gate and this file both read. The group-opening reuses the claim file's own core, so the same
 * overlap never opens a second group and no second mechanism is written.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a widening that overlaps an agent at work answers 200 and writes its new area;
 *   · one group is opened, holding both agents and their two supervisors, and NOT the owner;
 *   · the group's system line names the path both areas cover and both agents;
 *   · both citizen pages say the area overlaps and a group was opened.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · make `openTheGroupsForAWorkArea` in src/server/lib/claims.ts throw instead of opening the
 *     group → the widening answers with an error and the first case goes red, because the overlap
 *     refused the work it must not refuse.
 *
 * src/server/lib/claims.ts was restored byte-identical after the mutation (sha256 before and after).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { participantKey } from '../src/shared/messages.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance
let groupId = ''
let messages: typeof import('../src/server/lib/messages.ts')

async function ask(
  path: string,
  body: unknown,
  headers: Record<string, string> = AS_THE_PERSON,
  method: 'POST' | 'GET' = 'POST',
): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, payload: body as Record<string, unknown> })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  messages = await import('../src/server/lib/messages.ts')

  // A SECRETARY, which P95 adds only where an agent has no supervisor — so it must NOT be in this
  // group, because both agents below have one.
  const secretary = await ask('/api/agents/started', { handle: 'p95-sec', name: 'P95 secretary', role: 'secretary', runtime: 'claude-code' })
  expect(secretary.status, JSON.stringify(secretary.said)).toBe(201)
  const supA = await ask('/api/agents/started', { handle: 'p95-sup-a', name: 'P95 supervisor A', role: 'supervisor', runtime: 'claude-code', workArea: ['src/a'] })
  expect(supA.status, JSON.stringify(supA.said)).toBe(201)
  const supB = await ask('/api/agents/started', { handle: 'p95-sup-b', name: 'P95 supervisor B', role: 'supervisor', runtime: 'claude-code', workArea: ['src/b'] })
  expect(supB.status, JSON.stringify(supB.said)).toBe(201)
  const a = await ask('/api/agents/started', { handle: 'p95-a', name: 'P95 worker A', role: 'worker', runtime: 'claude-code', workArea: ['src/a/deep'] }, asAgent('p95-sup-a'))
  expect(a.status, JSON.stringify(a.said)).toBe(201)
  const b = await ask('/api/agents/started', { handle: 'p95-b', name: 'P95 worker B', role: 'worker', runtime: 'claude-code', workArea: ['src/b'] }, asAgent('p95-sup-b'))
  expect(b.status, JSON.stringify(b.said)).toBe(201)

  // A A CLAIMS THE WORK, so the office reads it as at work. Its area is nested inside the widening
  // B is about to be given.
  const task = t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title: 'The deep work',
    actor: { type: 'human', id: THE_PERSON },
    data: {},
  })
  const run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'P95 worker A’s run',
    actor: { type: 'agent', id: 'p95-a' },
    data: { state: 'running', runtime: 'claude-code' },
  }).id
  const claimed = await ask('/api/claims', { run, things: [{ what: 'record', id: task.id }] }, asAgent('p95-a'))
  expect(claimed.status, JSON.stringify(claimed.said)).toBe(201)

  // THE WIDENING THAT OVERLAPS. It must answer 200: the overlap opens a group and refuses nothing.
  const widened = await ask(
    '/api/participants/agent/p95-b/work-area',
    { workArea: ['src'], because: 'The supervisor widened B over the area A is working in.' },
    asAgent('p95-sup-b'),
  )
  expect(widened.status, JSON.stringify(widened.said)).toBe(200)
  expect((widened.said['agent'] as { workArea: string[] }).workArea).toEqual(['src'])

  const group = t.client.sqlite
    .prepare("SELECT id FROM groups WHERE about LIKE 'work-area|%'")
    .get() as { id: string } | undefined
  expect(group, 'the overlap opened a group').toBeDefined()
  groupId = group!.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('an overlap opens a group and refuses nothing', () => {
  it('holds both agents and their two supervisors, and not the owner', async () => {
    const members = t.client.sqlite
      .prepare('SELECT member_kind, member_id FROM group_members WHERE group_id = ? AND left_at IS NULL')
      .all(groupId) as { member_kind: string; member_id: string }[]
    const ids = members.map((one) => participantKey({ kind: one.member_kind as 'person' | 'agent', id: one.member_id }))
    expect(ids.sort()).toEqual(
      [
        participantKey({ kind: 'agent', id: idOf('p95-a') }),
        participantKey({ kind: 'agent', id: idOf('p95-b') }),
        participantKey({ kind: 'agent', id: idOf('p95-sup-a') }),
        participantKey({ kind: 'agent', id: idOf('p95-sup-b') }),
      ].sort(),
    )
    // THE OWNER IS NOT IN IT, and neither is the secretary: the claim conflict's members are not
    // P95's, and both agents here have a supervisor.
    expect(ids).not.toContain(participantKey({ kind: 'person', id: THE_PERSON }))
    expect(ids).not.toContain(participantKey({ kind: 'agent', id: idOf('p95-sec') }))
  })

  it('writes one system line naming the path both areas cover and both agents', async () => {
    const said = messages.messagesInAGroup(groupId, messages.EVERY_PROJECT)
    const line = said.find((one) => one.body.startsWith('Overlap on src:'))
    expect(line, 'the group does not name the path both areas cover and both agents').toBeDefined()
    // BOTH HANDLES ARE IN IT, whichever order the widening named them in.
    expect(line?.body).toContain('p95-a')
    expect(line?.body).toContain('p95-b')
    // ONE LINE AND NOTHING MORE. The reassurance that nothing is
    // refused is where criterion P95 puts it, on both citizen pages, and the next case reads it.
    expect(line?.saidInFull ?? null, 'the overlap line kept a hover sentence').toBeNull()
  })

  it('says so on both citizen pages', async () => {
    for (const handle of ['p95-a', 'p95-b']) {
      const profile = await ask(`/api/participants/agent/${handle}/profile`, undefined, AS_THE_PERSON, 'GET')
      expect(profile.status, JSON.stringify(profile.said)).toBe(200)
      const sentence = profile.said['workAreaOverlap']
      expect(sentence, `${handle} says its area overlaps`).not.toBeNull()
      expect(String(sentence)).toContain('Nothing is refused')
    }
  })
})
