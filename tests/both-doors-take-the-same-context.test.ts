// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE GRAMMAR FOR WHAT A COMMENT POINTS AT, AND BOTH DOORS TAKE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Sending a comment makes two writes with the SAME object. `POST /api/records` stores it as
 * `data.target`. `POST /api/agent/threads/:id/messages` takes it as `context`. The first REQUIRES a
 * `seen` key when the thing pointed at holds no stored text — `seenRuleFor` in
 * src/shared/targets.ts — and every part of Mole Office's own screen is such a thing. The second
 * was a strict object that did not declare `seen` at all, so it refused the object the first had
 * just demanded.
 *
 * WHAT THE OWNER SAW. They right-clicked the reading-length control on a report, wrote words, chose an
 * agent and pressed Send. The composer said:
 *
 *   Nothing was written. The request body is not usable: context: Unrecognized key: "seen".
 *
 * The comment WAS in the database, WAS addressed to the agent they chose, WAS in that conversation,
 * and the agent answered it. Invariant 1 of USER.md broken on a screen: a reply saying a thing did
 * not happen while it had. Problem `wgUEBO2o4AlI`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST IS SHAPED THIS WAY
 * ---------------------------------------------------------------------------------------
 *
 * It posts ONE object through BOTH doors and demands the same answer from each. Testing them apart
 * is what let them disagree: each door was right about its own grammar, and nothing asked whether
 * the two grammars were the same one. `tests/seven-surfaces.test.ts` already does this for `view`,
 * which is how `view` was found; this is the same check for `seen`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { seenRuleFor } from '../src/shared/targets.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * POINTING AT A PART OF MOLE OFFICE'S OWN SCREEN, which is what they were doing.
 *
 * A `uiSurface` holds no stored text of its own, so what the screen showed is the only evidence
 * there will ever be — and `seenRuleFor` requires it.
 */
const WHAT_THEY_POINTED_AT = {
  target: { kind: 'uiSurface', surfaceId: 'rail.messages' },
  place: { at: 'surface' },
  seen: { route: '#/r/abc123', quote: 'Gist', build: 'unknown' },
} as const

let threadId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'both-doors', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Doors',
      data: { handle: 'builder-doors', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)

  const opened = await fetch(`${app.api}/api/agent/threads`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ title: 'About the rail', mode: 'direct' }),
  })
  expect(opened.status, await opened.clone().text()).toBe(201)
  threadId = ((await opened.json()) as { thread: { id: string } }).thread.id
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the rule that requires what the screen showed is the rule both doors follow', () => {
  it('requires it for a thing that holds no stored text, which is what makes the two doors meet', () => {
    // THE CONTROL FOR EVERYTHING BELOW. If this rule ever stops requiring `seen` here, the two
    // doors could agree by neither taking it, and the tests below would pass while saying nothing.
    expect(seenRuleFor('uiSurface'), 'a uiSurface no longer requires what the screen showed').toBe('required')
  })

  it('is stored by the record door', async () => {
    const wrote = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'message',
        title: 'About the rail row',
        data: {
          body: 'This row and the one under it say the same thing.',
          target: WHAT_THEY_POINTED_AT,
          to: [{ kind: 'agent', id: 'builder-doors' }],
        },
      }),
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(wrote.status, await wrote.clone().text()).toBe(409)
  }, 120_000)

  it('is taken by the agent-thread door, which used to refuse it', async () => {
    const sent = await fetch(`${app.api}/api/agent/threads/${threadId}/messages`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        intent: 'ask',
        body: 'This row and the one under it say the same thing.',
        context: WHAT_THEY_POINTED_AT,
      }),
    })
    const said = await sent.clone().text()
    expect(said, 'the door refused the key the other door demanded').not.toContain('Unrecognized key: "seen"')
    expect(sent.status, said).toBe(201)
  }, 120_000)

  it('refuses the same object from both doors when it is not usable, in the same way', async () => {
    // A ROUTE THAT TOOK ANYTHING WOULD ALSO PASS THE TWO ABOVE. This is the other half: `seen` is
    // declared, not waved through, so a key inside it that nothing knows is still refused.
    const bad = { ...WHAT_THEY_POINTED_AT, seen: { ...WHAT_THEY_POINTED_AT.seen, madeUp: 'yes' } }
    const sent = await fetch(`${app.api}/api/agent/threads/${threadId}/messages`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ intent: 'ask', body: 'Nonsense inside.', context: bad }),
    })
    expect(sent.status, 'the door now takes anything at all inside `seen`').toBe(400)
  }, 120_000)
})
