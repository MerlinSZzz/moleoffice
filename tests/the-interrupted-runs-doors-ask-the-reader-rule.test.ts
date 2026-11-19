// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO INTERRUPTED-RUN DOORS HAND A MESSAGE ONLY TO A CALLER WHO MAY READ IT, AND STOPPED STAYS
 * THE TIME THE RUN STOPPED. Criterion W7, round 11b of wave 13t, on check MjRQ67Ax4BMg.
 *
 * An agent reads only the messages it is a party to; a secretary and the owner read every
 * message. GET /api/office/interrupted-runs and GET /api/worker/resumes ask
 * it through `theMessagesThisReaderMayRead` in lib/messages.ts, as GET /api/worker/runs does: a run
 * whose message the caller may not read is left out.
 *
 * The office is this test's own, in process (`freshDb` and `apiApp`), never the live office. Its
 * server runs under the test runner, so no message worker starts and an asked resume stays asked.
 * Every record here is synthetic, and its words say so.
 *
 *   1. ada writes to bo; bo's run for it was paused, and the person asked to resume it. dee, an agent
 *      that is no party, gets neither the run nor the message's title or words through either door.
 *      bo (the addressee), ada (the sender), a secretary and the person do.
 *   2. A crashed run's Stopped is when it crashed. A press to resume it, and a resume that failed,
 *      both write to its record later, and neither moves Stopped.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-interrupted-runs-doors-ask-the-reader-rule.test.ts
 * MUTATIONS:
 *   - src/server/api/interrupted.ts GET /office/interrupted-runs passes the owner's reader instead of the
 *     caller's: case 1 red, because dee sees the title;
 *   - src/server/api/interrupted.ts GET /worker/resumes passes the owner's reader instead of the
 *     caller's: case 1 red, because dee sees the words;
 *   - src/server/lib/interrupted.ts reads Stopped from the record's updatedAt again: case 2 red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REPO_ROOT } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY } from '../src/shared/roles.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const WORKER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
const asAgent = (handle: string): Record<string, string> => ({ 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

// Found nowhere else, so a reply that holds them holds the message.
const TITLE = 'Synthetic ledger of the kittiwake count'
const WORDS = 'synthetic-words-only-bo-and-ada-may-read'

let t: TestDb
let app: FastifyInstance
let bo = ''
let message = ''
let run = ''

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  return { status: reply.statusCode, body: reply.body, json: reply.json() as Record<string, unknown> }
}

async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
  return { status: reply.statusCode, body: reply.body }
}

async function anAgent(handle: string, role: string | null = null): Promise<string> {
  const made = await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'opencode', ...(role === null ? {} : { role }) } }, OWNER)
  expect(made.status, made.body).toBe(201)
  const listed = (await get('/api/participants', OWNER)).json as { agents?: { id: string; handle: string }[] }
  return (listed.agents ?? []).find((one) => one.handle === handle)!.id
}

/** A run the message worker started for `messageId` as bo, filed as the worker files one. */
function aRunFor(messageId: string, data: Record<string, unknown>): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run of bo',
    workspaceId: HERE,
    data: {
      runtime: 'opencode',
      startedByMoleOffice: true,
      servingAgent: 'bo-reader',
      servingAgentId: bo,
      deliveringMessage: messageId,
      providerSession: 'synthetic-conversation',
      workingDirectory: REPO_ROOT,
      ...data,
    },
    actor: { type: 'agent', id: 'mole-office/the-message-worker' } as never,
  }).id
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await anAgent('ada-writer')
  bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  await anAgent('sam-secretary', THE_SECRETARY)
  message = t.api.createRecord({
    kind: 'message',
    title: TITLE,
    workspaceId: HERE,
    data: { body: WORDS, to: [{ kind: 'agent', id: bo }] },
    actor: { type: 'agent', id: 'ada-writer' } as never,
  }).id
  run = aRunFor(message, {
    state: 'paused',
    paused: { at: '2026-10-03 09:15:00', by: { kind: 'person', id: THE_PERSON }, because: 'Synthetic: the office was shut down.' },
    resume: { askedBy: { kind: 'person', id: THE_PERSON }, askedAt: '2026-10-03 09:20:00' },
  })
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the interrupted-run doors and the reader rule', () => {
  it('give an agent that is no party neither the run nor the message, and give it to every reader who may read it', async () => {
    // dee IS NO PARTY: nothing of the run or the message, through either door.
    const listed = await get('/api/office/interrupted-runs', asAgent('dee-bystander'))
    expect(listed.status, listed.body).toBe(200)
    expect(listed.json['runs']).toEqual([])
    expect(listed.body).not.toContain(TITLE)
    expect(listed.body).not.toContain(run)
    const resumes = await get('/api/worker/resumes', asAgent('dee-bystander'))
    expect(resumes.status, resumes.body).toBe(200)
    expect(resumes.json['resumes']).toEqual([])
    expect(resumes.body).not.toContain(WORDS)
    expect(resumes.body).not.toContain(message)

    // THE ADDRESSEE, THE SENDER, A SECRETARY AND THE PERSON each see the run, its title and its words.
    for (const [who, headers] of [
      ['bo, the addressee', asAgent('bo-reader')],
      ['ada, the sender', asAgent('ada-writer')],
      ['a secretary', asAgent('sam-secretary')],
      ['the person', OWNER],
    ] as const) {
      const theirs = await get('/api/office/interrupted-runs', headers)
      expect(theirs.status, `${who}: ${theirs.body}`).toBe(200)
      const runs = theirs.json['runs'] as { session: string; message: { title: string } | null }[]
      expect(runs.map((one) => one.session), who).toEqual([run])
      expect(runs[0]!.message?.title, who).toBe(TITLE)
      const asked = await get('/api/worker/resumes', headers)
      expect(asked.status, `${who}: ${asked.body}`).toBe(200)
      const rows = asked.json['resumes'] as { session: string; body: string }[]
      expect(rows.map((one) => one.session), who).toEqual([run])
      expect(rows[0]!.body, who).toBe(WORDS)
    }
    // And the message worker, which starts the resume, is given it.
    const forTheWorker = (await get('/api/worker/resumes', WORKER)).json['resumes'] as { session: string }[]
    expect(forTheWorker.map((one) => one.session)).toEqual([run])
  })

  it('keeps Stopped at the time the run crashed when a resume is asked and when it fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 9, 3, 8, 0, 0))
      const second = t.api.createRecord({
        kind: 'message',
        title: 'Synthetic second message to bo',
        workspaceId: HERE,
        data: { body: 'Synthetic words.', to: [{ kind: 'agent', id: bo }] },
        actor: { type: 'agent', id: 'ada-writer' } as never,
      }).id
      const crashed = aRunFor(second, { state: 'running', doing: 'Synthetic: answering.' })
      // THE CRASH, found at 08:05.
      vi.setSystemTime(new Date(2026, 9, 3, 8, 5, 0))
      t.api.patchRecord(crashed, { dataPatch: { state: 'crashed', doing: 'Synthetic: it ended without answering.' } }, { type: 'agent', id: 'mole-office/the-message-worker' } as never)
      const stopped = async (): Promise<string | null> => {
        const runs = (await get('/api/office/interrupted-runs', OWNER)).json['runs'] as { session: string; stoppedAt: string | null }[]
        return runs.find((one) => one.session === crashed)!.stoppedAt
      }
      expect(await stopped()).toBe('2026-10-03 08:05:00')

      // THE PRESS, at 08:30.
      vi.setSystemTime(new Date(2026, 9, 3, 8, 30, 0))
      const pressed = await post(`/api/office/interrupted-runs/${crashed}/resume`, {}, OWNER)
      expect(pressed.status, pressed.body).toBe(200)
      expect(await stopped()).toBe('2026-10-03 08:05:00')

      // THE RESUME FAILS, at 08:40.
      vi.setSystemTime(new Date(2026, 9, 3, 8, 40, 0))
      const failed = await post(`/api/worker/runs/${crashed}/resumed`, { failed: 'Synthetic: the tool would not start.' }, WORKER)
      expect(failed.status, failed.body).toBe(200)
      expect(await stopped()).toBe('2026-10-03 08:05:00')
    } finally {
      vi.useRealTimers()
    }
  })
})
