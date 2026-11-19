// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OLD WARRANT HEADER IS REFUSED ON THE DOORS THAT READ THEIR CALLER, NOT ONLY THE ONES THAT TAKE A WARRANT.
 *
 * ---------------------------------------------------------------------------------------
 * THE SILENCE THIS CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * A warrant goes in the write's own body and nowhere else (chapter 4, rule 5). The header that used
 * to carry it, `WARRANT_HEADER` in src/server/lib/http.ts, is refused rather than ignored, because a
 * header silently dropped on a door that takes no warrant turns the act into an ordinary one without
 * a word. The refusal stood only inside `actorWithTheWordsItActsOn`, which just the doors that take a
 * warrant call, so a door that reads its caller with `actorFrom` alone answered a request carrying
 * the header as if it were not there. `DELETE /api/links/:id` is one such door.
 *
 * This file drives that door twice: once as an agent, and once as the person with no actor headers at
 * all. Both requests carry a made-up value under the header's real name. Each must be refused with
 * the sentence that says where a warrant goes, and the link must still be there afterwards. Before
 * the refusal moved into `actorFrom`, each answered 200 and the link was gone.
 *
 * ---------------------------------------------------------------------------------------
 * THE SUMMONSES DOOR READS A KEY BEFORE IT READS ITS CALLER (wave 13s round 117)
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/office/summonses` calls `actorFrom` only when the key is not the mail tool's. Two keys
 * pass without it: the person's mail tool's own key, and the agent key of an old mail tool still on the card
 * that left. On those two the header was not judged at all. Two cases send the same made-up value
 * with each key. Each first reads the summonses without the header, to show the key reaches its
 * branch, and then must be refused with the same sentence and read nothing. Before the door called
 * the refusal itself, each answered 200 and read the summonses.
 *
 * ---------------------------------------------------------------------------------------
 * THE RESTORE DOORS READ A KEY OR A HANDLE AND NEVER THEIR CALLER (wave 13s round 118)
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/restore` reads the agent from its key, and `GET /api/restore/:handle` reads it from the
 * handle in the path when no key is sent. Neither calls `actorFrom`, so neither judged the header.
 * Two cases send the same made-up value, one to each door. Each first reads the restore without the
 * header, to show the door answers, and then must be refused with the same sentence and give no
 * restore. Before `theRestore` called the refusal itself, each answered 200 with the restore.
 *
 * The comment above `refuseTheOldWarrantHeader` in src/server/lib/http.ts names the doors it still
 * does not reach, and says why each is safe without it.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, EACH MUTATION ALONE AND RESTORED (26 October 2026)
 * ---------------------------------------------------------------------------------------
 *
 * Mutation 1: leave the call to `refuseTheOldWarrantHeader` out of `actorFrom`. Both link cases here
 * go red, and so do the two header cases in tests/an-agent-acts-on-the-owners-own-words.test.ts,
 * because the block no longer stands in `actorWithTheWordsItActsOn` either. The two summonses cases
 * stay green, because that door calls the refusal itself.
 *
 * Mutation 2: add `suppliedActorHeaders(req).length > 0` to the refusal's condition, so only a
 * request that names an actor is refused. The person's link case and both summonses cases go red,
 * each answering 200, because none of them names an actor. The agent's link case stays green.
 *
 * Mutation 3 (wave 13s round 117): leave the call to `refuseTheOldWarrantHeader` out of the
 * summonses door. Both summonses cases go red, each answering 200 with the summonses read, and both
 * link cases stay green.
 *
 * Mutation 4 (wave 13s round 118): leave the call to `refuseTheOldWarrantHeader` out of `theRestore`
 * in src/server/api/participants.ts. Both restore cases go red, each answering 200 with the restore,
 * and the four cases above stay green.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
/** The old header's name, read from the code that refuses it rather than copied here. */
let warrantHeader: string
/** A made-up key held as the person's mail tool's own, and the key the old mail tool's agent was given. */
let theMailToolsKey: string
let theOldMailToolsKey: string
/** The key the registration gave the made-up agent, which `GET /api/restore` reads the agent from. */
let theAgentsKey: string

const PROJECT = 'default'

const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}

const AS_THE_PERSON: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

/**
 * A MADE-UP HEADER VALUE, labelled so nobody reads it as real. This file never meant a
 * warrant: it sends the old header's name, and a value with nothing in it that could be acted on.
 */
const A_MADE_UP_HEADER_VALUE = JSON.stringify({ words: 'a made-up sentence that is not the owner’s' })

beforeAll(async () => {
  t = await freshDb()
  // After freshDb, so that resolving http.ts -> records.ts -> db/client.ts opens the throwaway file.
  const http = await import('../src/server/lib/http.ts')
  warrantHeader = http.WARRANT_HEADER
  app = (await apiApp()).app
  await app.ready()
  // THE AGENT MUST BE REGISTERED, or the door refuses it for that reason before the header is judged.
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'claude-code', name: 'Claude Code', role: 'worker' },
  })
  expect(started.statusCode, started.body).toBe(201)
  theAgentsKey = String((started.json() as { whatToGiveIt?: { key?: unknown } }).whatToGiveIt?.key ?? '')
  expect(theAgentsKey, 'the registration gave the agent no key').toMatch(/^[0-9a-f]{64}$/)
  // THE PERSON'S MAIL TOOL'S OWN KEY, held as the person's press holds it, with no agent behind it.
  const { holdTheKeyWhoseHashIs, keyHash } = await import('../src/server/lib/keys.ts')
  const { THE_MAIL_TOOL_HANDLE } = await import('../src/config/the-mail-tool.mjs')
  theMailToolsKey = 'a'.repeat(64)
  holdTheKeyWhoseHashIs('person-tool', THE_MAIL_TOOL_HANDLE, keyHash(theMailToolsKey), 'the-persons-press')
  // THE OLD MAIL TOOL'S AGENT, registered while the card that left is put back for the registration alone, as an
  // office that registered one before the card left holds it.
  const { withTheMailerCardBack } = await import('./the-mailer-card-that-left.ts')
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  const oldTool = await withTheMailerCardBack(theRoleCards(), () =>
    app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: THE_MAIL_TOOL_HANDLE, name: 'The old mail tool', role: 'mailer' },
    }),
  )
  expect(oldTool.statusCode, oldTool.body).toBe(201)
  theOldMailToolsKey = String((oldTool.json() as { whatToGiveIt?: { key?: unknown } }).whatToGiveIt?.key ?? '')
  expect(theOldMailToolsKey, 'the registration gave the old mail tool no key').toMatch(/^[0-9a-f]{64}$/)
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** Two made-up notes and a made-up link between them. */
function madeUpLink(): { fromId: string; linkId: string } {
  const fromId = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'note',
    title: 'Made up: the first note of a link',
    data: { body: 'Made up for a test.' },
    actor: t.api.HUMAN,
  }).id
  const toId = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'note',
    title: 'Made up: the second note of a link',
    data: { body: 'Made up for a test.' },
    actor: t.api.HUMAN,
  }).id
  const { id } = t.api.createLink({ fromId, toId, type: 'relates_to', actor: t.api.HUMAN })
  return { fromId, linkId: id }
}

/** Whether the link is still stored, read from the record it starts at rather than from a reply. */
function theLinkIsStillThere(fromId: string, linkId: string): boolean {
  return t.api.resolveLinks(fromId).some((link) => link.linkId === linkId)
}

describe('the old warrant header on a door that takes no warrant', () => {
  it('is refused when an agent sends it, and the link is not removed', async () => {
    const { fromId, linkId } = madeUpLink()
    const refused = await app.inject({
      method: 'DELETE',
      url: `/api/links/${linkId}`,
      headers: { ...AS_AGENT, [warrantHeader]: A_MADE_UP_HEADER_VALUE },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    const said = String((refused.json() as { error?: unknown }).error ?? '')
    expect(said).toContain('no longer reads it')
    expect(said).toContain('as a field of the body')
    expect(theLinkIsStillThere(fromId, linkId), 'the header was dropped without a word and the link went').toBe(true)
  })

  it('is refused when the person sends it with no actor headers, and the link is not removed', async () => {
    const { fromId, linkId } = madeUpLink()
    const refused = await app.inject({
      method: 'DELETE',
      url: `/api/links/${linkId}`,
      headers: { 'x-mole-office-workspace': PROJECT, [warrantHeader]: A_MADE_UP_HEADER_VALUE },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    const said = String((refused.json() as { error?: unknown }).error ?? '')
    expect(said).toContain('no longer reads it')
    expect(said).toContain('as a field of the body')
    expect(theLinkIsStillThere(fromId, linkId), 'the header was dropped without a word and the link went').toBe(true)
  })
})

describe('the old warrant header on the summonses door, which reads a key before it reads its caller', () => {
  /** Read the summonses with `key`, with or without the old header. */
  function readTheSummonses(key: string, withTheHeader: boolean) {
    return app.inject({
      method: 'GET',
      url: '/api/office/summonses',
      headers: { 'x-mole-office-workspace': PROJECT, 'x-mole-office-key': key, ...(withTheHeader ? { [warrantHeader]: A_MADE_UP_HEADER_VALUE } : {}) },
    })
  }

  it.each([
    ["the person's mail tool's own key", () => theMailToolsKey],
    ["the old mail tool's agent key", () => theOldMailToolsKey],
  ])('is refused with %s, and nothing is read', async (_which, key) => {
    const read = await readTheSummonses(key(), false)
    expect(read.statusCode, `without the header the key did not reach its branch: ${read.body}`).toBe(200)
    const refused = await readTheSummonses(key(), true)
    expect(refused.statusCode, refused.body).toBe(400)
    const said = String((refused.json() as { error?: unknown }).error ?? '')
    expect(said).toContain('no longer reads it')
    expect(said).toContain('as a field of the body')
    expect(refused.body, 'the header was dropped without a word and the summonses were read').not.toContain('"summonses"')
  })
})

describe('the old warrant header on the restore doors, which read a key or a handle and never their caller', () => {
  it.each([
    ["GET /api/restore, by the agent's key", '/api/restore', () => ({ 'x-mole-office-key': theAgentsKey })],
    ['GET /api/restore/:handle, by the handle with no key', '/api/restore/claude-code', () => ({})],
  ])('is refused on %s, and no restore is given', async (_which, url, who) => {
    const read = await app.inject({ method: 'GET', url, headers: { 'x-mole-office-workspace': PROJECT, ...who() } })
    expect(read.statusCode, `without the header the door did not answer: ${read.body}`).toBe(200)
    const refused = await app.inject({
      method: 'GET',
      url,
      headers: { 'x-mole-office-workspace': PROJECT, ...who(), [warrantHeader]: A_MADE_UP_HEADER_VALUE },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    const said = String((refused.json() as { error?: unknown }).error ?? '')
    expect(said).toContain('no longer reads it')
    expect(said).toContain('as a field of the body')
    expect(refused.body, 'the header was dropped without a word and the restore was given').not.toContain('"tokensEstimated"')
  })
})
