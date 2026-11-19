// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY AGENT KEEPS A HANDOVER. Wave 13k round 46, item 2 of two of the person's
 * decisions.
 *
 *   PUT /api/agents/:id/handover   the agent itself, by its own key, or the person; another agent is refused
 *   GET /api/agents/:id/handover   the agent, the person and the agent that started it; ?history=1, newest first, at most 25
 *
 * Rows are only ever added (migration 0232, src/server/lib/handovers.ts). The agent's page carries the current
 * handover in its one reply, read by the door's own rule.
 *
 * Every write here is made to an office of this file's own, through `app.inject`. Case names name the source mutation
 * tried against each one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { HANDOVER_LONGEST_CHARACTERS } from '../src/config/settings.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string, key?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  }
}

async function inject(method: 'GET' | 'PUT' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: reply.statusCode, text: reply.body, json: reply.json() as any }
}

async function started(handle: string, headers: Record<string, string>, role = 'worker'): Promise<{ id: string; key: string }> {
  const reply = await inject('POST', '/api/agents/started', headers, { handle, name: `Agent ${handle}`, role })
  expect(reply.status, reply.text).toBe(201)
  const key = String(reply.json.whatToGiveIt?.key)
  expect(key).toMatch(/^[0-9a-f]{64}$/)
  return { id: reply.json.agent.id as string, key }
}

let writer: { id: string; key: string }
let other: { id: string; key: string }
let starter: { id: string; key: string }
let child: { id: string; key: string }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  writer = await started('handover-writer', AS_THE_PERSON)
  other = await started('handover-other', AS_THE_PERSON)
  starter = await started('handover-starter', AS_THE_PERSON, 'supervisor')
  child = await started('handover-child', asAgent('handover-starter', starter.key))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('PUT and GET /api/agents/:id/handover', () => {
  it('self write: refusing the agent its own key leaves an agent unable to write its own handover', async () => {
    const wrote = await inject('PUT', '/api/agents/handover-writer/handover', asAgent('handover-writer', writer.key), { text: 'My own words.' })
    expect(wrote.status, wrote.text).toBe(200)
    expect(wrote.json.handover).toMatchObject({ agentId: writer.id, workspaceId: WORKSPACE, text: 'My own words.', writtenByKind: 'agent', writtenById: writer.id, sessionId: null })
    const read = await inject('GET', '/api/agents/handover-writer/handover', asAgent('handover-writer'))
    expect(read.status, read.text).toBe(200)
    expect(read.json.current.text).toBe('My own words.')
    // A NAME IN A HEADER IS NOT ENOUGH TO WRITE: without its key the agent is refused.
    const unproved = await inject('PUT', '/api/agents/handover-writer/handover', asAgent('handover-writer'), { text: 'Not proved.' })
    expect(unproved.status, unproved.text).toBe(403)
  })

  it('person write: refusing the person leaves nobody to write a handover for an agent that cannot', async () => {
    const wrote = await inject('PUT', '/api/agents/handover-other/handover', AS_THE_PERSON, { text: 'Written by the person.' })
    expect(wrote.status, wrote.text).toBe(200)
    expect(wrote.json.handover).toMatchObject({ writtenByKind: 'person', writtenById: THE_PERSON, text: 'Written by the person.' })
  })

  it('another agent: accepting any agent key lets one agent put words in another agent\'s next session', async () => {
    const before = await inject('GET', '/api/agents/handover-writer/handover?history=1', AS_THE_PERSON)
    const wrote = await inject('PUT', '/api/agents/handover-writer/handover', asAgent('handover-other', other.key), { text: 'Not yours to write.' })
    expect(wrote.status, wrote.text).toBe(403)
    expect(wrote.json.error).toContain('Another agent may not write it')
    const after = await inject('GET', '/api/agents/handover-writer/handover?history=1', AS_THE_PERSON)
    expect(after.json.history).toEqual(before.json.history)
    // AND MAY NOT READ IT EITHER, while the agent that started an agent may.
    const otherReads = await inject('GET', '/api/agents/handover-writer/handover', asAgent('handover-other', other.key))
    expect(otherReads.status, otherReads.text).toBe(403)
    const starterReads = await inject('GET', '/api/agents/handover-child/handover', asAgent('handover-starter', starter.key))
    expect(starterReads.status, starterReads.text).toBe(200)
    expect(starterReads.json.current).toBeNull()
    expect(starterReads.json.says).toContain('No handover has been written for "handover-child" in this project.')
  })

  it('over the limit: dropping the length check stores a handover longer than the setting allows', async () => {
    // A CHINESE CHARACTER IS ONE CHARACTER: exactly the limit, in characters of three bytes each, is stored.
    const atTheLimit = '交'.repeat(HANDOVER_LONGEST_CHARACTERS)
    const fits = await inject('PUT', '/api/agents/handover-child/handover', AS_THE_PERSON, { text: atTheLimit })
    expect(fits.status, fits.text.slice(0, 300)).toBe(200)
    const tooLong = await inject('PUT', '/api/agents/handover-child/handover', AS_THE_PERSON, { text: `${atTheLimit}x` })
    expect(tooLong.status, tooLong.text.slice(0, 300)).toBe(400)
    expect(tooLong.json.error).toContain(`This handover is ${String(HANDOVER_LONGEST_CHARACTERS + 1)} characters long`)
    expect(tooLong.json.error).toContain(`at most ${String(HANDOVER_LONGEST_CHARACTERS)} characters`)
    const read = await inject('GET', '/api/agents/handover-child/handover', AS_THE_PERSON)
    expect(read.json.current.text).toBe(atTheLimit)
    expect(read.json.earlier).toBe(0)
  })

  it('history order: listing oldest first, or without a cap, answers a history the door does not promise', async () => {
    for (let n = 1; n <= 27; n += 1) {
      const wrote = await inject('PUT', '/api/agents/handover-starter/handover', asAgent('handover-starter', starter.key), { text: `Handover ${String(n)}` })
      expect(wrote.status, wrote.text).toBe(200)
    }
    const read = await inject('GET', '/api/agents/handover-starter/handover?history=1', asAgent('handover-starter'))
    expect(read.status, read.text).toBe(200)
    expect(read.json.historyLimit).toBe(25)
    expect(read.json.history.map((one: { text: string }) => one.text)).toEqual(
      Array.from({ length: 25 }, (_, i) => `Handover ${String(27 - i)}`),
    )
    expect(read.json.current.text).toBe('Handover 27')
    expect(read.json.earlier).toBe(26)
  })

  it('nothing updated in place: rewriting the current row loses the earlier handover', async () => {
    const first = await inject('PUT', '/api/agents/handover-other/handover', asAgent('handover-other', other.key), { text: 'First.' })
    expect(first.status, first.text).toBe(200)
    const second = await inject('PUT', '/api/agents/handover-other/handover', asAgent('handover-other', other.key), { text: 'Second.' })
    expect(second.status, second.text).toBe(200)
    expect(second.json.handover.id).not.toBe(first.json.handover.id)
    const read = await inject('GET', '/api/agents/handover-other/handover?history=1', AS_THE_PERSON)
    const [newest, earlier, earliest] = read.json.history as { id: string; text: string; writtenAt: string }[]
    expect(newest).toEqual(second.json.handover)
    expect(earlier).toEqual(first.json.handover)
    // The person's handover from the second case is still there, unchanged, under both.
    expect(earliest).toMatchObject({ text: 'Written by the person.', writtenByKind: 'person' })
    expect(read.json.history).toHaveLength(3)
  })
})

describe('the agent\'s page', () => {
  it('profile shape: leaving the handover off the profile reply leaves the page with nothing to draw', async () => {
    const asThePerson = await inject('GET', `/api/participants/agent/${writer.id}/profile`, AS_THE_PERSON)
    expect(asThePerson.status, asThePerson.text).toBe(200)
    const { history: _none, ...door } = (await inject('GET', '/api/agents/handover-writer/handover?history=1', AS_THE_PERSON)).json
    expect(asThePerson.json.handover).toEqual({ read: true, current: door.current, earlier: door.earlier, says: door.says })
    // A READER THE DOOR REFUSES is told so, and given no handover.
    const asAnother = await inject('GET', `/api/participants/agent/${writer.id}/profile`, asAgent('handover-other', other.key))
    expect(asAnother.status, asAnother.text).toBe(200)
    expect(asAnother.json.handover).toMatchObject({ read: false, current: null, earlier: 0 })
    expect(asAnother.json.handover.says).toContain('GET /api/agents/handover-writer/handover answers it.')
    // A PERSON'S PAGE has no handover.
    const person = await inject('GET', `/api/participants/person/${THE_PERSON}/profile`, AS_THE_PERSON)
    expect(person.status, person.text).toBe(200)
    expect(person.json.handover).toBeNull()
  })
})
