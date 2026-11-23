// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH NOTE THAT TELLS A WRITER TO MAKE A LINK SHOWS THE WHOLE REQUEST BODY, AND THE LINK DOOR TAKES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * A link is written at POST /api/links with `fromId`, `toId` and `type` at the top of the body. Three
 * notes in GET /api named only the link's type, as "a `supersedes` link", and left the writer to guess
 * the rest. A writer who named the other end `target` was refused. Each of these notes now shows the
 * whole body. This file reads each note from GET /api, takes every link body it shows, fills in only
 * the parts in angle brackets with records of a fresh office, and sends the body to the link door.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Put the old words back in the note on adding a block: its case goes red.
 *   - Put the old words back in the note on what ran instead: its case goes red.
 *   - Put the old words back in the note on settling a proposal: its case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_LINK_DOOR = 'POST /api/links '

/** The sentence GET /api gives for one door, as a writer reads it there. */
async function theNoteOn(method: string, path: string): Promise<string> {
  const index = await app.inject({ method: 'GET', url: '/api', headers: AS_THE_PERSON })
  expect(index.statusCode, index.body).toBe(200)
  const endpoints = (index.json() as { endpoints: { method: string; path: string; description: string | null }[] }).endpoints
  const door = endpoints.find((one) => one.method === method && one.path === path)
  if (door === undefined) throw new Error(`GET /api lists no ${method} ${path}.`)
  return door.description ?? ''
}

/** Every body a note shows right after "POST /api/links ", as the JSON text it shows. */
function theLinkBodiesIn(note: string): string[] {
  const bodies: string[] = []
  for (let at = note.indexOf(THE_LINK_DOOR); at !== -1; at = note.indexOf(THE_LINK_DOOR, at + 1)) {
    const start = at + THE_LINK_DOOR.length
    if (note[start] !== '{') continue
    let depth = 0
    let inAString = false
    for (let i = start; i < note.length; i++) {
      const c = note[i]
      if (c === '"') inAString = !inAString
      else if (!inAString && c === '{') depth++
      else if (!inAString && c === '}' && --depth === 0) {
        bodies.push(note.slice(start, i + 1))
        break
      }
    }
  }
  return bodies
}

/** A body as the note shows it, with each part in angle brackets filled in, and nothing else changed. */
function filledIn(shown: string, fill: Record<string, string>): Record<string, unknown> {
  return JSON.parse(shown, (_key, value: unknown) => {
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

/** File one record through the record door, as the person, and give back its id. */
async function filed(url: string, body: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url, headers: AS_THE_PERSON, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

const aDecision = (title: string): Promise<string> =>
  filed('/api/records', { kind: 'decision', title, data: { ...governsTheWholeProject(), replaces: [], because: 'The beans came up in nine days.' } })

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('each note on making a link shows a body the link door takes', () => {
  // MUTATION: the old words, 'they are POST /api/links, `implements` from the module to the block ...': red.
  it('the note on adding a block, for the module that carries it and the block it waits on', async () => {
    const bodies = theLinkBodiesIn(await theNoteOn('POST', '/api/records/:id/blocks'))
    expect(bodies.length, 'the note does not show both link bodies').toBe(2)
    const pipeline = await filed('/api/records', { kind: 'pipeline', title: 'The bean rows', data: {} })
    const first = await filed(`/api/records/${pipeline}/blocks`, { name: 'Dig the rows', state: 'doing' })
    const block = await filed(`/api/records/${pipeline}/blocks`, { name: 'Sow the beans', state: 'doing' })
    const module = await filed('/api/records', { kind: 'module', title: 'The sowing', data: {} })
    const fill = { '<the module>': module, '<this block>': block, '<the block that has to move first>': first }
    for (const shown of bodies) await linked(filledIn(shown, fill))
  })

  // MUTATION: the old words, 'POST /api/links with a `resolves` link into it.': red.
  it('the note on what ran instead, for the record that lifts it', async () => {
    const bodies = theLinkBodiesIn(await theNoteOn('POST', '/api/records/:id/ran-instead'))
    expect(bodies.length, 'the note shows no link body').toBe(1)
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
    const ran = await aDecision('The camera count ran again')
    await linked(filledIn(bodies[0]!, { '<the record showing the canonical method ran>': ran, '<the id this returns>': instead }))
  })

  // MUTATION: the old words, 'say what it does to the old one with a `supersedes` link.': red.
  it('the note on settling a proposal, for a new decision that replaces the one that settled it', async () => {
    const bodies = theLinkBodiesIn(await theNoteOn('POST', '/api/records/:id/promote'))
    expect(bodies.length, 'the note shows no link body').toBe(1)
    const old = await aDecision('Sow the beans in rows of ten')
    const replacing = await aDecision('Sow the beans in rows of twelve')
    await linked(filledIn(bodies[0]!, { '<the new decision>': replacing, '<the decision that settled it>': old }))
  })
})
