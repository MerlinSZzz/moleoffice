// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RAISE'S PRESS NAMES THE AGENT, AND EVERY REFUSAL THAT QUOTES THE PRESS QUOTES THE SAME WORDS. Criterion P59, and
 * item 3 of a decision, which took round 19's recommendation (report bdR-Vb2wif9d block b-9) that the press read as the
 * agent page's drawing had it: "Let <its name> act for you", and in Chinese 让 <its name> 代你行事.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS
 * ---------------------------------------------------------------------------------------
 *
 *   · The press on the agent page names the agent by its registry name, the one the page's head shows, and not by
 *     its handle. The secretary here is registered as "ivo-sec" and named "Ivo Marsh", so the two cannot be
 *     confused. The press is drawn in English.
 *   · The role gate's refusal to a secretary with no raise quotes the same words (src/server/lib/rolegate.ts).
 *   · The record door's refusal to a secretary promoting a fork the person reserved quotes the same words
 *     (src/server/lib/records.ts, `thePressThatWouldAllowThis`).
 *   · All three read `thePress` in src/shared/the-press.ts, so a reader is never told to press a button that is
 *     called something else.
 *   · Both refusals say where the press is: on the agent's own page, #/who/agent/<handle>, where a decision and
 *     criterion P64 put the raise. They do not say #/roles, where it is not (chapter 8, rule 4:
 *     the person's press on the secretary's card is drawn on that agent's page). Wave 13k's round 22 fix, on the
 *     check Cae6mUuqIFfq's note.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   in TheirCard.tsx, draw the press with the handle (`thePress(handle, t)`) → the page case goes red: the press
 *     reads "Let ivo-sec act for you".
 *   in rolegate.ts, quote `thePress(mine.handle)` → the role gate case goes red.
 *   in records.ts, quote `thePress(row.handle)` in `thePressThatWouldAllowThis` → the promote case goes red.
 *   in either refusal, name #/roles again instead of the agent's page → that case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { thePress } from '../src/shared/the-press.ts'
import { participantPagePath, parseRoute } from '../src/shared/addresses.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule
// READ AFTER THE WINDOW IS SET, as the page reads it. A copy imported at the top of this file is not the one the
// page draws with, and setting its language changed nothing on the page (found while writing this file).
let i18n: typeof import('../src/shared/i18n.ts')

const HANDLE = 'ivo-sec'
const NAME = 'Ivo Marsh'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_SECRETARY = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE }

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}


beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: HANDLE, name: NAME, role: 'secretary' })
  expect(started.status, started.said).toBe(201)

  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  i18n = await import('../src/shared/i18n.ts')
})

afterAll(async () => {
  await app.close()
  t.close()
})


describe('a refusal that names the press quotes the press as the page draws it', () => {
  it('names the agent page by the address the router reads back', () => {
    expect(participantPagePath('agent', HANDLE)).toBe(`#/who/agent/${HANDLE}`)
    expect(parseRoute(participantPagePath('agent', HANDLE))).toEqual({ name: 'who', kind: 'agent', id: HANDLE })
  })

  it('the role gate, refusing the shared scene to a secretary with no raise', async () => {
    const settings = await ask('GET', '/api/office/scene-settings', AS_THE_PERSON)
    expect(settings.status, settings.said).toBe(200)
    const refused = await ask('PATCH', '/api/office/scene-settings', AS_THE_SECRETARY, settings.body['settings'])
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain(`pressing "${thePress(NAME)}" on your page in Mole Office, at #/who/agent/${HANDLE}`)
    expect(refused.said, 'the press is on the agent\'s own page, not on the Role cards page').not.toContain('#/roles')
  })

  it('the record door, refusing a secretary the promotion of a fork the person reserved', async () => {
    const filed = await ask('POST', '/api/records', AS_THE_SECRETARY, {
      kind: 'proposal',
      title: 'A fork the person reserved',
      data: { question: 'Which of the two?', options: ['One', 'The other'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
    })
    expect(filed.status, filed.said).toBe(201)
    const fork = String((filed.body['record'] as { id: string }).id)
    const refused = await ask('POST', `/api/records/${fork}/promote`, AS_THE_SECRETARY, {
      title: 'What was chosen',
      data: { decided_by: 'the owner', authority: 'the owner said so', because: 'One of them, and this is the reasoning.' },
    })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain(`pressing "${thePress(NAME)}" on your page in Mole Office, at #/who/agent/${HANDLE}`)
    expect(refused.said, 'the press is on the agent\'s own page, not on the Role cards page').not.toContain('#/roles')
  })
})
