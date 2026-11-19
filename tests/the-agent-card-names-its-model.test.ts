// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT CARD SAYS WHICH MODEL ITS NEWEST RUN WAS STARTED ON, IN THE MODEL'S OWN NAME. Problem 2tbFWxiFyjtv.
 *
 * A person had to ask which model wrote an agent's report. The card on an agent's page now says which model its newest
 * run in this project was started on, in the plain view, by the model's name ("Claude Opus 5.5"). The stored id is
 * drawn only in developer mode, and a model the office has no name for is said to be one, never shown as its id.
 *
 * WHAT THIS FILE PROVES, with the server's own reply drawn by the card itself:
 *   1. the newest run's model is named, and an older run's is not; the id is not in the plain view, and is in
 *      developer mode;
 *   2. a model the office has no name for is said to be one, and its id is not in the plain view;
 *   3. an agent with no run here says so;
 *   4. a provider prefix does not stop a model being named;
 *   5. when the runtime reported that a different model answered the newest run, the card adds the run page's own
 *      sentence for it (the engineering decision in wave 13q's round 39); when it reported the same model, or
 *      "not reported", the card adds nothing.
 *
 * MUTATION for case 5 (after a green control): in src/web/components/TheirCard.tsx, `ItsModel` drawing nothing for
 * `answered`. Case 5's first check goes red, because the sentence for the model that answered is gone.
 *
 * Everybody and everything here is made up.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theModelsName } from '../src/shared/model-names.ts'
import { en } from '../src/shared/words/en.ts'

let t: TestDb
let app: FastifyInstance
let card: typeof import('../src/web/components/TheirCard.tsx')
let mode: typeof import('../src/web/lib/mode.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function register(handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { runtime: 'claude-code', handle, name: 'Morgan Vale', role: 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return String((reply.json() as { record: string }).record)
}

/** One finished run, bound to the agent's own record in this project through `ranAs`. */
function aRun(title: string, agentRecordId: string, model: string, served?: string): void {
  historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'human', id: THE_PERSON },
    kind: 'session',
    title,
    data: {
      state: 'finished',
      ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
      model,
      runtime: 'claude-code',
      // WHAT THE RUNNER WRITES AT A RUN'S END, the Served shape, when the case asks for it.
      ...(served === undefined ? {} : { served: { model: served, temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } } }),
    },
  })
}

/** The card's model line, drawn from the server's reply, in the plain view or in developer mode. */
async function theLine(handle: string, as: 'normal' | 'inspect'): Promise<string> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}/profile`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  mode.setMode(as)
  const html = renderToStaticMarkup(h(card.TheirCard, { said: reply.json(), onChanged: () => {} } as never))
  const line = /<p class="tc-model" data-testid="their-card-model">(.*?)<\/p>/s.exec(html)
  expect(line, `the card draws its model line:\n${html.slice(0, 400)}`).not.toBeNull()
  return line![1]!.replace(/<[^>]+>/g, '')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  card = await import('../src/web/components/TheirCard.tsx')
  mode = await import('../src/web/lib/mode.ts')
  const named = await register('kiln-writer')
  aRun('Its older run', named, 'gpt-6.1-sol')
  aRun('Its newest run', named, 'claude-opus-5-5')
  const unnamed = await register('kiln-stranger')
  aRun('Its one run', unnamed, 'kiln-model-9')
  await register('kiln-idle')
  aRun('Its run that another model answered', await register('kiln-switched'), 'claude-opus-5-5', 'claude-sonnet-5')
  aRun('Its run the same model answered', await register('kiln-steady'), 'claude-opus-5-5', 'anthropic/claude-opus-5-5')
  aRun('Its run whose model was not reported', await register('kiln-unsaid'), 'claude-opus-5-5', 'not reported')
}, 90_000)

afterAll(async () => {
  mode?.setMode('normal')
  await app?.close()
  t?.close()
})

describe('the agent card names its model', () => {
  it("names the newest run's model in words, and shows the id only in developer mode", async () => {
    const plain = await theLine('kiln-writer', 'normal')
    expect(plain).toBe(en['agentPage.model.named'].replace('{model}', 'Claude Opus 5.5'))
    expect(plain).not.toContain('claude-opus-5-5')
    expect(plain).not.toContain('GPT-6.1 Sol')
    expect(await theLine('kiln-writer', 'inspect')).toContain('claude-opus-5-5')
  })

  it('says a model it has no name for is one, and does not show its id in the plain view', async () => {
    const plain = await theLine('kiln-stranger', 'normal')
    expect(plain).toBe(en['agentPage.model.unnamed'])
    expect(plain).not.toContain('kiln-model-9')
    expect(await theLine('kiln-stranger', 'inspect')).toContain('kiln-model-9')
  })

  it('says so when no run of the agent is recorded here', async () => {
    expect(await theLine('kiln-idle', 'normal')).toBe(en['agentPage.model.noRun'])
  })

  it('adds the sentence for the model that answered only when the runtime reported a different one', async () => {
    const named = en['agentPage.model.named'].replace('{model}', 'Claude Opus 5.5')
    // Both models by name since wave 13q's round 40; this expectation followed that change (it read the ids before).
    const answered = en['runPage.modelAnswered'].replace('{registered}', 'Claude Opus 5.5').replace('{answered}', 'Claude Sonnet 5')
    expect(await theLine('kiln-switched', 'normal'), 'another model answered and the card did not say so').toBe(`${named} ${answered}`)
    expect(await theLine('kiln-steady', 'normal'), 'the same model answered').toBe(named)
    expect(await theLine('kiln-unsaid', 'normal'), 'the runtime did not report a model').toBe(named)
  })

  it('names a model whose id carries its provider', () => {
    expect(theModelsName('anthropic/claude-opus-5-5')).toBe('Claude Opus 5.5')
    expect(theModelsName('kiln-model-9')).toBeNull()
  })
})
