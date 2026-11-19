// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIVE DOORS TO THE REGISTRIES AND THE PICTURES, driven as a caller drives them.
 *
 * Criteria M2 and M3 of design/messages/ACCEPTANCE.md. The rules themselves are proved in
 * tests/who-may-change-a-participant.test.ts against the library; what is proved here is that the
 * doors reach those rules, that a refusal comes back with its sentence rather than only a number,
 * and that every one of the five publishes its own line on GET /api.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { avatarPng } from './avatar-upload-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { defaultAvatarAssetId } from '../src/shared/participants.ts'

let t: TestDb
let app: FastifyInstance
let avatarDirectory: () => string

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_BUILDER_X = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' }

/** A png that is really a png, base64 encoded, which is how a picture arrives. */
const A_REAL_PNG = avatarPng(67, 16, 16)

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  avatarDirectory = (await import('../src/server/lib/avatars.ts')).avatarDirectory
  for (const [title, handle] of [
    ['Builder X', 'builder-x'],
    ['Builder Y', 'builder-y'],
  ]) {
    t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'agent',
      title: title ?? '',
      data: { handle, runtime: 'claude-code', state: 'active' },
      actor: { type: 'human', id: THE_PERSON },
    })
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** How many pictures are on disk right now, so a refusal can be shown to have written none. */
function picturesOnDisk(): number {
  const directory = avatarDirectory()
  return existsSync(directory) ? readdirSync(directory).length : 0
}

// ============================================================================ reading

describe('reading the registries', () => {
  it('hands back both, each participant with the address of its picture', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/participants' })

    expect(reply.statusCode).toBe(200)
    const said = reply.json() as {
      people: { id: string; handle: string; avatarUrl: string; state: string | null }[]
      agents: { handle: string; runtime: string | null; retired: boolean; avatarUrl: string }[]
    }
    expect(said.people.map((p) => p.handle)).toEqual([THE_PERSON])
    // MOLE OFFICE'S OWN ROW IS ONE OF THEM, written by the migration that writes the owner's. M11
    // makes it a participant so that the lines saying a group was opened, a member was added or two
    // claims are in conflict have a sender and are not faked as an agent's.
    expect(said.agents.map((a) => a.handle)).toEqual(['builder-x', 'builder-y', 'mole-office'])
    // THE ADDRESS AND NOT THE ID, so no screen has to know how a picture is asked for. And for
    // somebody nobody has chosen a picture for it is the picture they are given — chill-bee,
    // criterion M53 — rather than the drawing their row still points at. `pictureShownFor` in
    // lib/avatars.ts is the one place that decides, and problem `wO9DpHLtXts_` is why.
    expect(said.people[0]?.avatarUrl).toBe('/api/avatars/drawn/chill-bee')
    expect(
      said.people[0]?.avatarUrl,
      'the person is still drawn with the pattern made from their id',
    ).not.toBe(`/api/assets/${defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })}`)
    expect(said.agents[0]?.runtime).toBe('claude-code')
    expect(said.agents[0]?.retired).toBe(false)
    // NOBODY HAS SET A STATE, which is a real answer and not an empty string.
    expect(said.people[0]?.state).toBeNull()
  })

  it('hands back one participant by kind and id', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/participants/person/${THE_PERSON}` })

    expect(reply.statusCode).toBe(200)
    expect((reply.json() as { participant: { name: string } }).participant.name).toBe(THE_TEST_OFFICES_OWNER.name)
  })

  it('answers 404 naming what was asked for, rather than an empty participant', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/participants/agent/nobody' })

    expect(reply.statusCode).toBe(404)
    expect(reply.json<{ error: string }>().error).toContain('nobody')
  })

  it('refuses a kind that is not one of the two, rather than reading it as one', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/participants/robot/builder-x' })

    expect(reply.statusCode).toBe(400)
  })
})

// ============================================================================ changing

describe('changing a name and a state through the door', () => {
  it('lets a person change an agent name, and answers with what is stored now', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/builder-y',
      headers: AS_THE_PERSON,
      payload: { name: 'The one that reads code' },
    })

    expect(reply.statusCode).toBe(200)
    expect((reply.json() as { participant: { name: string } }).participant.name).toBe('The one that reads code')
  })

  it('refuses an agent changing a name, with the sentence that says whose it is', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/builder-x',
      headers: AS_BUILDER_X,
      payload: { name: 'Something I chose myself' },
    })

    expect(reply.statusCode).toBe(403)
    expect(reply.json<{ error: string }>().error).toContain('only a person gives one')
  })

  it('lets an agent set its own state, and keeps the moment it did', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/builder-x',
      headers: AS_BUILDER_X,
      payload: { state: 'reading the migration tests' },
    })

    expect(reply.statusCode).toBe(200)
    const said = (reply.json() as { participant: { state: string; stateAt: string | null } }).participant
    expect(said.state).toBe('reading the migration tests')
    expect(said.stateAt).not.toBeNull()
  })

  it('refuses a body that would change nothing, rather than answering 200 over no work', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/builder-x',
      headers: AS_THE_PERSON,
      payload: {},
    })

    expect(reply.statusCode).toBe(400)
  })
})

// ============================================================================ pictures

describe('sending a picture, and going back to the drawn one', () => {
  it('takes a png as base64, stores it, and points the participant at it', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/participants/person/${THE_TEST_OFFICES_OWNER.id}/avatar`,
      headers: AS_THE_PERSON,
      payload: { bytes: A_REAL_PNG.toString('base64') },
    })

    expect(reply.statusCode).toBe(201)
    const url = (reply.json() as { participant: { avatarUrl: string } }).participant.avatarUrl
    expect(url).not.toBe(`/api/assets/${defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })}`)

    const served = await app.inject({ method: 'GET', url })
    expect(served.statusCode).toBe(200)
    expect(served.headers['content-type']).toBe('image/png')
    expect(served.rawPayload.equals(A_REAL_PNG)).toBe(true)
  })

  it('goes back to nobody having chosen when asked to reset, and shows what that gets you', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/participants/person/${THE_TEST_OFFICES_OWNER.id}/avatar`,
      headers: AS_THE_PERSON,
      payload: { reset: true },
    })

    expect(reply.statusCode).toBe(201)
    // THE ROW GOES BACK TO POINTING AT THE DRAWING, which is what "nobody has chosen" is stored as,
    // and what a screen is then given is the picture anybody with none is given. Criterion M53
    // changed the second of those on 6 September; this case used to assert the drawing here.
    expect((reply.json() as { participant: { avatarUrl: string } }).participant.avatarUrl).toBe(
      '/api/avatars/drawn/chill-bee',
    )
    // AND THE DRAWING IS STILL THERE, at its own address, with nothing having deleted it.
    const drawing = await app.inject({
      method: 'GET',
      url: `/api/assets/${defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })}`,
    })
    expect(drawing.statusCode).toBe(200)
    expect(drawing.headers['content-type']).toBe('image/svg+xml')
  })

  it('refuses an agent sending a picture for another agent, and writes no file at all', async () => {
    const before = picturesOnDisk()

    const reply = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/builder-y/avatar',
      headers: AS_BUILDER_X,
      payload: { bytes: A_REAL_PNG.toString('base64') },
    })

    expect(reply.statusCode).toBe(403)
    expect(reply.json<{ error: string }>().error).toContain("no other agent's")
    // THE REFUSAL COMES BEFORE THE FILE. Refusing afterwards would leave the bytes on disk under a
    // row naming somebody who was never allowed to send them, and nothing would take either away.
    expect(picturesOnDisk(), 'a refused upload left a file behind').toBe(before)
  })

  it('refuses bytes that are not a picture, whatever they were sent as', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/builder-x/avatar',
      headers: AS_BUILDER_X,
      payload: { bytes: Buffer.from('<svg>not a picture</svg>').toString('base64') },
    })

    expect(reply.statusCode).toBe(415)
    expect(reply.json<{ error: string }>().error).toContain('SVG')
  })
})

// ============================================================================ a picture that is too big

/**
 * WHICH REFUSAL A PERSON MEETS WHEN THE PICTURE IS TOO BIG.
 *
 * Problem `dTf3LgcTj78w`: the refusal that names the limit was almost unreachable. Base64 inflates a
 * picture by exactly four thirds, so a body limit of the setting plus a third landed on the same
 * picture size as the size check, and Fastify answered first with *Request body is too large* —
 * which names neither number and does not say what to change. A picture more than about 3 KB over
 * the limit never reached this product's own sentence.
 *
 * THE LIMIT IS MADE SMALL HERE ON PURPOSE. The pictures below are then kilobytes rather than
 * megabytes, and the arithmetic is the same arithmetic: a picture twice the limit, and a body past
 * even what this route reads. `maxAvatarBytes()` reads the setting on every call and the route
 * reads it once when it is registered, so the app for these tests is built while the setting is
 * small and closed again before anything else runs.
 */
describe('a picture bigger than the limit is refused in words this product wrote', () => {
  const SMALL_LIMIT = 4096
  let small: FastifyInstance
  let was: string | undefined

  /** A png of exactly this many bytes, base64 encoded, which is how a picture arrives. */
  const aPictureOf = (bytes: number): string =>
    Buffer.concat([A_REAL_PNG, Buffer.alloc(Math.max(0, bytes - A_REAL_PNG.length), 3)]).toString('base64')

  beforeAll(async () => {
    was = process.env['MOLE_OFFICE_AVATAR_MAX_BYTES']
    process.env['MOLE_OFFICE_AVATAR_MAX_BYTES'] = String(SMALL_LIMIT)
    small = (await apiApp()).app
    await small.ready()
  })

  afterAll(async () => {
    await small.close()
    if (was === undefined) delete process.env['MOLE_OFFICE_AVATAR_MAX_BYTES']
    else process.env['MOLE_OFFICE_AVATAR_MAX_BYTES'] = was
  })

  it('names both numbers for a picture twice the limit, rather than saying the body is too large', async () => {
    const reply = await small.inject({
      method: 'POST',
      url: '/api/participants/agent/builder-x/avatar',
      headers: AS_BUILDER_X,
      payload: { bytes: aPictureOf(SMALL_LIMIT * 2) },
    })

    expect(reply.statusCode).toBe(413)
    const said = reply.json<{ error: string }>().error
    expect(said, 'this is the sentence that names neither number').not.toContain('Request body is too large')
    expect(said).toContain(String(SMALL_LIMIT * 2))
    expect(said).toContain(String(SMALL_LIMIT))
    expect(said).toContain('MOLE_OFFICE_AVATAR_MAX_BYTES')
  })

  it('says how big a picture may be for a body past even what it reads, rather than answering nothing useful', async () => {
    // SIX TIMES THE LIMIT is past the four times this route reads, so nothing measures this picture
    // and the sentence cannot say how big it was. It still says how big one may be and where the
    // number lives, which is what the other sentence was refused for not saying.
    const reply = await small.inject({
      method: 'POST',
      url: '/api/participants/agent/builder-x/avatar',
      headers: AS_BUILDER_X,
      payload: { bytes: aPictureOf(SMALL_LIMIT * 6) },
    })

    expect(reply.statusCode).toBe(413)
    const said = reply.json<{ error: string }>().error
    expect(said, 'the refusal a caller of this route reads is written here').not.toContain('Request body is too large')
    expect(said).toContain(String(SMALL_LIMIT))
    expect(said).toContain('MOLE_OFFICE_AVATAR_MAX_BYTES')
  })
})

// ============================================================================ the bytes

describe('the picture itself', () => {
  // THE DRAWN PICTURE IS KEYED ON THE REGISTRY ID, and builder-x's id is minted, so it is read first.
  const builderX = (): string =>
    (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'builder-x'").get() as { id: string }).id

  it('draws the one Mole Office made, with its own type and a cache header', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/assets/${defaultAvatarAssetId({ kind: 'agent', id: builderX() })}`,
    })

    expect(reply.statusCode).toBe(200)
    expect(reply.headers['content-type']).toBe('image/svg+xml')
    expect(String(reply.headers['cache-control'])).toContain('immutable')
    expect(reply.body.startsWith('<svg')).toBe(true)
  })

  it('answers the same bytes for the same participant every time it is asked', async () => {
    const url = `/api/assets/${defaultAvatarAssetId({ kind: 'agent', id: builderX() })}`

    const once = await app.inject({ method: 'GET', url })
    const again = await app.inject({ method: 'GET', url })

    expect(again.body).toBe(once.body)
  })

  it('answers 404 for a picture nothing answers to', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/assets/no-such-picture' })).statusCode).toBe(404)
  })
})

// ============================================================================ the published lines

describe('every one of the five says what it is for', () => {
  it('publishes a sentence on GET /api for each of them', async () => {
    const index = await app.inject({ method: 'GET', url: '/api' })
    const endpoints = (index.json() as { endpoints: { method: string; path: string; description: string | null }[] })
      .endpoints

    for (const path of [
      'GET /api/participants',
      'GET /api/participants/:kind/:id',
      'PATCH /api/participants/:kind/:id',
      'POST /api/participants/:kind/:id/avatar',
      'GET /api/assets/:id',
    ]) {
      const [method, url] = path.split(' ')
      const found = endpoints.find((e) => e.method === method && e.path === url)
      expect(found, `${path} is not published at all`).toBeDefined()
      expect(found?.description, `${path} has no sentence`).not.toBeNull()
      expect(String(found?.description).length, `${path} has a label rather than a sentence`).toBeGreaterThan(40)
    }
  })
})
