// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH LINE IN THE KINDS THAT TELLS A WRITER TO MAKE A LINK SHOWS THE WHOLE LINK BODY, AND THE DECISION KIND'S
 * EXAMPLE IS ONE AN AGENT MAY SEND.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * An agent reads a kind at GET /api/kinds/<kind> before it files one. Four lines there named a link only by
 * its type, as "a `supersedes` link", and left the writer to guess the body of POST /api/links. Each now
 * shows the body. The decision kind told an agent to send `decided_by` holding its own handle, and a handle
 * that two agents bear is refused there; it now says the id or the handle. Its example had no `decided_by`,
 * no `authority` and no `replaces`, so an agent that sent it was refused. This file reads each line and the
 * example from GET /api/kinds, fills in only the parts in angle brackets with records of a fresh office, and
 * sends each body to its door, which must take it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Put the old words back in the annotation's body field: its case goes red.
 *   - Put the old words back in the annotation's rule on a correction: its case goes red.
 *   - Put the old words back in the rule on lifting what ran instead: its case goes red.
 *   - Put the old words back in the trajectory's note: its case goes red.
 *   - Put the old words back in the decision's note: its case goes red.
 *   - Put the old decision example back: its case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

const AGENT = 'kinds-reader'

let t: TestDb
let app: FastifyInstance
let agentId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': AGENT,
}

const THE_LINK_DOOR = 'POST /api/links '

interface AKind {
  whenToRecord: string
  rules: string[]
  fields: { key: string; description: string }[]
  example: Record<string, unknown>
}

/** One kind as GET /api/kinds/<kind> serves it to a writer. */
async function theKind(kind: string): Promise<AKind> {
  const reply = await app.inject({ method: 'GET', url: `/api/kinds/${kind}`, headers: AS_THE_AGENT })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { kind: AKind }).kind
}

/** Every body a line shows right after "POST /api/links ", as the JSON text it shows. */
function theLinkBodiesIn(line: string): string[] {
  const bodies: string[] = []
  for (let at = line.indexOf(THE_LINK_DOOR); at !== -1; at = line.indexOf(THE_LINK_DOOR, at + 1)) {
    const start = at + THE_LINK_DOOR.length
    if (line[start] !== '{') continue
    let depth = 0
    let inAString = false
    for (let i = start; i < line.length; i++) {
      const c = line[i]
      if (c === '"') inAString = !inAString
      else if (!inAString && c === '{') depth++
      else if (!inAString && c === '}' && --depth === 0) {
        bodies.push(line.slice(start, i + 1))
        break
      }
    }
  }
  return bodies
}

/** A value as the kind shows it, with each part in angle brackets filled in, and nothing else changed. */
function filledIn(shown: unknown, fill: Record<string, string>): Record<string, unknown> {
  return JSON.parse(typeof shown === 'string' ? shown : JSON.stringify(shown), (_key, value: unknown) => {
    if (typeof value !== 'string' || !/^<.+>$/.test(value)) return value
    const filled = fill[value]
    if (filled === undefined) throw new Error(`The body leaves ${value} to write, which this test does not fill in.`)
    return filled
  }) as Record<string, unknown>
}

/** Send one filled body to the link door and expect it to be taken. */
async function linked(body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/links', headers: AS_THE_PERSON, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** File one record through a door, and give back its id. */
async function filed(url: string, body: Record<string, unknown>, headers: Record<string, string> = AS_THE_PERSON): Promise<string> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

const anAnnotation = async (title: string): Promise<string> =>
  filed('/api/records', { kind: 'annotation', title, data: (await theKind('annotation')).example })

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: AGENT, name: AGENT, runtime: 'claude-code' } })
  expect(started.statusCode, started.body).toBe(201)
  agentId = (started.json() as { agent: { id: string } }).agent.id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('each line in the kinds on making a link shows a body the link door takes', () => {
  // MUTATION: the old words, 'a correction is a NEW annotation with a `supersedes` link to this one, so both ...': red.
  it("the annotation's body field, for the annotation that corrects it", async () => {
    const field = (await theKind('annotation')).fields.find((one) => one.key === 'body')
    const bodies = theLinkBodiesIn(field?.description ?? '')
    expect(bodies.length, 'the field shows no link body').toBe(1)
    const old = await anAnnotation('The bean count')
    const correcting = await anAnnotation('The bean count, corrected')
    await linked(filledIn(bodies[0]!, { '<the new annotation>': correcting, '<this annotation>': old }))
  })

  // MUTATION: the old words, 'a new annotation with a `supersedes` link from the new one to the old one.': red.
  it("the annotation's rule on a correction, beside its rule on what else it touches", async () => {
    const bodies = (await theKind('annotation')).rules.flatMap(theLinkBodiesIn)
    expect(bodies.length, 'the rules do not show both link bodies').toBe(2)
    const old = await anAnnotation('The pea count')
    const correcting = await anAnnotation('The pea count, corrected')
    const other = await filed('/api/records', { kind: 'pipeline', title: 'The pea rows', data: {} })
    const fill = { '<this annotation>': old, '<the other record>': other, '<the new annotation>': correcting, '<the old annotation>': old }
    for (const shown of bodies) await linked(filledIn(shown, fill))
  })

  // MUTATION: the old words, 'a `resolves` link into it from the record showing the canonical method ran.': red.
  it('the rule on lifting what ran instead, for the record showing the canonical method ran', async () => {
    const bodies = (await theKind('ran_instead')).rules.flatMap(theLinkBodiesIn)
    expect(bodies.length, 'the rules show no link body').toBe(1)
    const pipeline = await filed('/api/records', { kind: 'pipeline', title: 'The seed counts', data: {} })
    const step = await filed(`/api/records/${pipeline}/blocks`, { name: 'Count the seeds', state: 'doing' })
    const method = await app.inject({ method: 'PATCH', url: `/api/records/${step}`, headers: AS_THE_PERSON, payload: { dataPatch: { method: 'the camera count' } } })
    expect(method.statusCode, method.body).toBe(200)
    const instead = await filed(`/api/records/${step}/ran-instead`, {
      ran: 'A count by hand.',
      because: 'The camera was away for repair.',
      since: '2026-11-01',
      allowed_uses: ['planning the rows'],
      disallowed_claims: ['that the camera count works'],
      severity: 'limits_claims',
    })
    const ran = await filed('/api/records', { kind: 'decision', title: 'The camera count ran again', data: {
      ...governsTheWholeProject(), replaces: [], because: 'The camera came back.' } })
    await linked(filledIn(bodies[0]!, { '<the record showing the canonical method ran>': ran, '<this record>': instead }))
  })

  // MUTATION: the old words, 'Link it to what it plans for with a `plans_for` link; a trajectory has exactly one.': red.
  it("the trajectory's note, for the pipeline it plans for", async () => {
    const trajectory = await theKind('trajectory')
    const bodies = theLinkBodiesIn(trajectory.whenToRecord)
    expect(bodies.length, 'the note shows no link body').toBe(1)
    const pipeline = await filed('/api/records', { kind: 'pipeline', title: 'The squash rows', data: {} })
    const future = await filed('/api/records', { kind: 'trajectory', title: 'The squash rows next spring', data: trajectory.example })
    await linked(filledIn(bodies[0]!, { '<this trajectory>': future, '<the pipeline, module or block>': pipeline }))
  })
})

describe("the decision kind's example is one an agent may send", () => {
  // MUTATION: the old words, '`decided_by` holding your own handle.': red.
  // MUTATION: the old example, with no decided_by, authority or replaces: red.
  it('signed with the id, and again with the handle, as the note says, and the record door takes both', async () => {
    const decision = await theKind('decision')
    const signed = decision.example['decided_by']
    expect(typeof signed === 'string' && /^<.+>$/.test(signed), 'the example does not leave decided_by to write').toBe(true)
    expect(decision.whenToRecord).toContain(`\`decided_by\` holding ${String(signed).slice(1, -1)}`)
    for (const name of [agentId, AGENT]) {
      const data = filledIn(decision.example, { [String(signed)]: name })
      await filed('/api/records', { kind: 'decision', title: `Sow the beans in rows, signed as ${name}`, data }, AS_THE_AGENT)
    }
  })
})
