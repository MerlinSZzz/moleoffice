// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THE OFFICE STARTS BY ITSELF TAKES THE CHORE PAIR; A BUILDER DOES NOT; THE AGENT'S ROW WINS.
 * Criterion T7 of design/tokens/ACCEPTANCE.md, and criterion U2's precedence.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * An agent's own registry row first, then the installation's chore runtime, then what happens today.
 * The agent's own row wins because it is the more specific thing a person set, and criterion U2 says
 * an agent's runs get what its profile says. The runtime word comes off the registry row in
 * `theQueue` in src/server/lib/worker.ts, which is the place this file drives.
 *
 * AND THE MODEL IS A PAIR, NOT ONE LINE. A run the office starts by itself is given the chore model
 * when one is named. A builder a secretary starts is given `MOLE_OFFICE_AGENT_MODEL`, which is read
 * by tools/agent-worker.mjs and is unchanged. OpenCode is passed no model at all when the chore
 * model is unset, because the agent model's default is an Anthropic name that means nothing to it.
 *
 * THE MUTATIONS, EACH RUN ALONE WITH A CONTROL BEFORE IT.
 *
 *   read the chore setting before the agent's row in `theQueue` (swap the two halves of the ternary)
 *   — red: *an agent whose row names a runtime keeps it*.
 *
 *   drop the chore fallback from `theModelAChoreIsGiven` — red: *a builder keeps the agent model*.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { theModelIn } from '../src/config/agent-model.mjs'
import {
  choreModelIn,
  choreRuntimeIn,
  theChoreRuntimeASettingNamed,
  theModelAChoreIsGiven,
} from '../src/config/chores.mjs'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

afterEach(() => {
  delete process.env['MOLE_OFFICE_CHORE_RUNTIME']
  delete process.env['MOLE_OFFICE_CHORE_MODEL']
})

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** File an agent of this handle and hand back the id the participant registry lists it under. */
async function anAgent(handle: string, runtime?: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', ...(runtime === undefined ? {} : { runtime }) },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  const found = (listed.agents ?? []).filter((one) => one.handle === handle)
  return one(found, `the registry row for ${handle}`).id
}

/** File one message to an agent and hand back its record id. */
async function messageTo(agentId: string, title: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title,
    data: { body: `A message for ${title}.`, to: [{ kind: 'agent', id: agentId }] },
  })
  return (filed['record'] as { id: string }).id
}

describe('the runtime word the office puts on a waiting run', () => {
  it('is the agent\u2019s own row when the row names one, even though the installation names another', async () => {
    const withRowId = await anAgent('has-a-runtime', 'claude-code')
    const withoutRowId = await anAgent('has-no-runtime')
    await messageTo(withRowId, 'to-the-row')
    await messageTo(withoutRowId, 'to-the-default')

    process.env['MOLE_OFFICE_CHORE_RUNTIME'] = 'opencode'
    const worker = await import('../src/server/lib/worker.ts')
    const queue = worker.theQueue('default')
    const byAgent = new Map(queue.map((one) => [one.to.id, one.runtime]))
    // THE ROW WINS OVER THE INSTALLATION'S SETTING.
    expect(byAgent.get(withRowId)).toBe('claude-code')
    // AND THE INSTALLATION'S SETTING ANSWERS WHERE THE ROW SAYS NOTHING.
    expect(byAgent.get(withoutRowId)).toBe('opencode')
  })

  it('is null when neither the row nor the installation names one, which is what happens today', () => {
    // READ THROUGH THE READER rather than through a running queue, because deleting a name from this
    // process does not reach the checkout's `.env` (the 28 August 2026 lesson in settings.mjs).
    expect(choreRuntimeIn({})).toBeNull()
    expect(theChoreRuntimeASettingNamed({}, '/no/such/env/at/all')).toBeNull()
  })
})

describe('the model pair', () => {
  it('gives the office\u2019s own run the chore model and a builder the agent model', () => {
    const both = { MOLE_OFFICE_CHORE_MODEL: 'openrouter/z-ai/glm-5.3-flash', MOLE_OFFICE_AGENT_MODEL: 'opus' }
    expect(choreModelIn(both)).toBe('openrouter/z-ai/glm-5.3-flash')
    expect(theModelAChoreIsGiven(both)).toBe('openrouter/z-ai/glm-5.3-flash')
    // THE BUILDER PAIR, which tools/agent-worker.mjs reads and which is unchanged.
    expect(theModelIn({ MOLE_OFFICE_AGENT_MODEL: 'opus' })).toBe('opus')
    expect(theModelAChoreIsGiven({ MOLE_OFFICE_AGENT_MODEL: 'opus' })).toBe('opus')
    // AND THE RUNTIME THAT READS IT PUTS IT ON THE COMMAND LINE.
    expect(new ClaudeCodeAdapter(both).modelItWouldUse()).toBe('openrouter/z-ai/glm-5.3-flash')
  })

  it('gives opencode no model at all from the builder pair, because that name means nothing there', () => {
    // THE DISTINCTION THAT MATTERS. A default installation that routes the office's own runs to
    // opencode passes no model; it never quietly passes the Anthropic builder name.
    const opencode = new OpenCodeAdapter({ MOLE_OFFICE_AGENT_MODEL: 'opus' })
    expect(opencode.modelItWouldUse).toBeUndefined()
    expect(opencode.commandFor({
      session: 's',
      agent: 'a',
      prompt: 'hello',
      cwd: '/tmp',
      api: 'http://127.0.0.1:1',
      workspace: 'default',
      outputPath: '/tmp/opencode-nothing.out',
    }).args).not.toContain('-m')
  })
})
