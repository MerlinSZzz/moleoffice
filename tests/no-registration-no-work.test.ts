// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO REGISTRATION, NO WORK — CRITERION P93.
 *
 * Without registration no work starts, with the one exception below. An
 * agent registered in Mole Office may not start work before its work area is registered. The door a
 * worker's first act really goes through is `POST /api/claims`: the claims file's own first line says
 * "An agent says what it is working on when it starts", and a live claim is what "at work" means for
 * P95's overlap. So the gate is in `fileAClaim`, which is the one writer behind that route.
 *
 * THE ONE EXCEPTION: a wild agent the person starts outside Mole Office, never registered, is not
 * the office's to govern. Nothing here may refuse or even notice it — and it is the pre-existing
 * registry check, one line above the new gate, that answers it with its own long-standing sentence.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a registered worker with no area cannot file a claim, and the refusal names the area and the
 *     door that registers one;
 *   · the same worker can file it once its area is registered;
 *   · a person may claim without any area, because the rule is about agents;
 *   · an unregistered wild agent is answered by the registry sentence and never by the area one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · drop the `if (input.claimant.kind === 'agent') { … }` gate in src/server/lib/claims.ts → the
 *     first case goes red, because the claim is filed with no area.
 *
 * src/server/lib/claims.ts was restored byte-identical after the mutation (sha256 before and after).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

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
let aTask = ''
let aRun = ''
/**
 * THE ROLE-CARD READER THE SERVER ITSELF USED. Imported after `freshDb`, like every other module
 * here, so it is the same instance `apiApp` read its cards into; the test reads the secretary's own
 * sentence out of that declaration instead of retyping it.
 */
let roles: typeof import('../src/server/lib/roles.ts')

async function ask(
  path: string,
  body: unknown,
  headers: Record<string, string> = AS_THE_PERSON,
  method: 'POST' | 'GET' = 'POST',
): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, payload: body as Record<string, unknown> })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The secretary card's own work-area refusal, read from the declaration the server loaded. */
function theSecretaryCardSays(): string {
  const card = roles.theRoleCards().cards.find((one) => one.name === 'secretary')
  return card?.workArea?.says ?? ''
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  roles = await import('../src/server/lib/roles.ts')

  // A SECRETARY, A SUPERVISOR, AND A WORKER STARTED BY THE SUPERVISOR WITH NO AREA. A registration
  // that names no area is legal — P92 is about the grain of one that is named — and P93 is what
  // stops the worker starting on the strength of an area nobody registered.
  const secretary = await ask('/api/agents/started', { handle: 'p93-sec', name: 'P93 secretary', role: 'secretary', runtime: 'claude-code' })
  expect(secretary.status, JSON.stringify(secretary.said)).toBe(201)
  const supervisor = await ask('/api/agents/started', { handle: 'p93-sup', name: 'P93 supervisor', role: 'supervisor', runtime: 'claude-code', workArea: ['src'] })
  expect(supervisor.status, JSON.stringify(supervisor.said)).toBe(201)
  const worker = await ask('/api/agents/started', { handle: 'p93-worker', name: 'P93 worker', role: 'worker', runtime: 'claude-code' }, asAgent('p93-sup'))
  expect(worker.status, JSON.stringify(worker.said)).toBe(201)

  const task = t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title: 'The work nobody may start',
    actor: { type: 'human', id: THE_PERSON },
    data: {},
  })
  aTask = task.id
  aRun = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A run for the worker to claim under',
    actor: { type: 'agent', id: 'p93-worker' },
    data: { state: 'running', runtime: 'claude-code' },
  }).id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a registered agent may not start work with no area', () => {
  it('refuses the claim, naming the area and the door that registers one', async () => {
    const filed = await ask('/api/claims', { run: aRun, things: [{ what: 'record', id: aTask }] }, asAgent('p93-worker'))
    expect(filed.status, JSON.stringify(filed.said)).toBe(403)
    expect(String(filed.said['error'])).toContain('no registered work area')
    expect(String(filed.said['error'])).toContain('/api/participants/agent/p93-worker/work-area')
    // AND IT NAMES THE CARD IT IS APPLYING, so it can never be read as the flat rule the work-area
    // door contradicted. The p93-worker row was registered with the worker card, so that is the name.
    expect(String(filed.said['error'])).toContain('"worker" card')
  })

  it('accepts the same claim once the area is registered, and refuses nothing else', async () => {
    const registered = await ask('/api/participants/agent/p93-worker/work-area', {
      workArea: ['src'],
      because: 'The supervisor agreed the scope before the work started.',
    })
    expect(registered.status, JSON.stringify(registered.said)).toBe(200)
    const filed = await ask('/api/claims', { run: aRun, things: [{ what: 'record', id: aTask }] }, asAgent('p93-worker'))
    expect(filed.status, JSON.stringify(filed.said)).toBe(201)
  })

  it('lets a person claim without any area, because the rule is about agents', async () => {
    const run = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'The person’s own run',
      actor: { type: 'human', id: THE_PERSON },
      data: { state: 'running' },
    }).id
    const filed = await ask('/api/claims', { run, things: [{ what: 'record', id: aTask }] })
    expect(filed.status, JSON.stringify(filed.said)).toBe(201)
  })

  it('answers a wild unregistered agent with the registry sentence, never with the area one', async () => {
    // THE WILD AGENT IS NEVER NOTICED BY P93. The claim route refuses it before `fileAClaim` even
    // runs, with the rule that a claim is made by somebody a registry holds — which is what a wild
    // agent has always met. The area sentence must not appear.
    const filed = await ask('/api/claims', { run: aRun, things: [{ what: 'record', id: aTask }] }, asAgent('a-wild-agent-nobody-registered'))
    expect(filed.status).toBe(403)
    expect(String(filed.said['error'])).toContain('Nothing in either registry answers')
    expect(String(filed.said['error'])).not.toContain('no registered work area')
  })
})

/**
 * THE SECRETARY'S TWO DOORS AGREE — problem XivYfQN8RLQz.
 *
 * The claims door demanded a registered area from every registered agent, and the work-area door
 * refused a secretary the very area it demanded, so no value of the area let a secretary claim.
 * The fact belongs to the card: a card whose work-area grain is `nothing` requires no area, so a
 * secretary's claim is accepted with none. These two cases drive the real doors over HTTP, and the
 * second reads the refusal out of the declaration rather than retyping it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · make `needsAnArea` in src/server/lib/claims.ts always true → the secretary's claim is refused
 *     and the first case goes red;
 *   · drop the role from `noWorkAreaToStart` in src/shared/claims.ts → the refusal above no longer
 *     names the card and that case goes red;
 *   · read the worker card in `changeWorkArea` in src/server/lib/participants.ts → the secretary's
 *     area is accepted and the second case goes red.
 *
 * The source files were restored byte-identical after each mutation (sha256 before and after).
 */
describe('a secretary claims with no area, and registers none', () => {
  it('accepts a secretary’s claim with no area registered', async () => {
    const filed = await ask('/api/claims', { run: aRun, things: [{ what: 'record', id: aTask }] }, asAgent('p93-sec'))
    expect(filed.status, JSON.stringify(filed.said)).toBe(201)
    expect(filed.said['claim']).toBeTruthy()
  })

  it('refuses the same secretary a work area, in the card’s own sentence', async () => {
    const refused = await ask(
      '/api/participants/agent/p93-sec/work-area',
      { workArea: ['src'], because: 'A secretary has no area to register.' },
      asAgent('p93-sec'),
    )
    expect(refused.status, JSON.stringify(refused.said)).toBe(400)
    // READ OFF THE DECLARATION, not a copy typed here: the card's grain is `nothing`, so its own
    // `says` is the refusal, and the door applying any other sentence fails this.
    expect(theSecretaryCardSays()).not.toBe('')
    expect(String(refused.said['error'])).toBe(theSecretaryCardSays())
  })
})
