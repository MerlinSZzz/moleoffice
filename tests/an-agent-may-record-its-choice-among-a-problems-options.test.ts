// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY RECORD ITS CHOICE AMONG A PROBLEM'S OPTIONS, WITH ITS EVIDENCE, INSTEAD OF BEING REFUSED.
 * Row 2 of report rFBoQG6mAEI0 and item 3 of a decision: a wave may choose among the
 * options a problem carries, with its evidence, and says in its report which it took and why.
 *
 * The door refused every open problem that carried options and said the next move was an agent's
 * (`assertOptionsForThemAreTheirMove` in src/server/lib/records.ts, problem qpq63k1PiBNb). An agent that had
 * chosen, with evidence, could not say so. Now the choice is an attempt on the problem: its `takes_option`
 * is the option word for word, its `tried` names that option with why, and its `result` is the evidence.
 * The problem keeps its seven agreed sections (merge entry 5dwoa2tuFfS4 bounced a version that added three),
 * and the attempts panel draws `tried` and `result`, so the person sees the choice.
 *
 * WHAT IS PROVED
 *   1. Without a choice, the refusal stands, and it now names the way to record one.
 *   2. With an attempt that takes an option, the problem is stored as sent and keeps the agent's move.
 *   3. An option that is not one of the options, a `tried` that does not name it, and a blank `result`
 *      are each refused, whoever's move it is.
 *   4. A later write that takes the chosen option out of `options` is refused.
 *   5. Once the attempt says why it failed, the choice is no longer made, and the refusal stands again.
 *   6. The problem's page draws the attempt: the option's words and the evidence, in both languages.
 *   7. A create whose move defaults to the agent's obeys the same refusal as a change, with no
 *      record, revision, change or link written, whether its state is open or absent and its choice
 *      is absent or failed (problem DaxQiJGC04hw).
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the early return for a recorded choice is taken out        → cases 2 and 4
 *   the check that the option is one of the options goes       → cases 3 and 4
 *   the check that `tried` names the option goes               → case 3
 *   the check for a blank `result` goes                        → case 3
 *   a failed attempt is still read as a choice                 → case 5
 *   the create guard reads input.data before the defaults     → all four cases of 7
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let rp: typeof import('../src/web/pages/RecordPage.tsx')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle }

const OPTIONS = ['restart the worker by its group id', 'wait for the rebuild']
const TAKEN = 'restart the worker by its group id'
const THE_CHOICE = {
  id: 'a-restart-by-group',
  takes_option: TAKEN,
  tried: `Took "${TAKEN}", because the rebuild is two days away and the worker is stuck now.`,
  result: 'ps showed the worker idle for 40 minutes; one restart by group id on a test office cleared it.',
}

async function file(data: Record<string, unknown>): Promise<{ code: number; said: string; id: string | null }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_AN_AGENT,
    payload: { kind: 'problem', title: 'A worker that stops answering', data },
  })
  const made = reply.statusCode === 201 ? (reply.json() as { record: { id: string } }) : null
  return { code: reply.statusCode, said: reply.body, id: made === null ? null : made.record.id }
}

function stored(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  expect(registered.statusCode, registered.body).toBeLessThan(300)
  rp = await import('../src/web/pages/RecordPage.tsx')
}, 60_000)

afterAll(async () => {
  setWordLanguage('en')
  await app.close()
  t.close()
})

describe("an agent's choice among a problem's options", () => {
  it('still refuses options under an agent’s move with no choice, and names the way to record one', async () => {
    const said = await file({ symptom: 'It stops answering.', options: OPTIONS, whose_move: 'agent', state: 'open' })
    expect(said.code).toBe(409)
    expect(said.said).toContain('takes_option')
    expect(said.said).toContain('Nothing was written')
  })

  it.each([
    { name: 'open with no choice', data: { state: 'open' } },
    { name: 'no state with no choice', data: {} },
    { name: 'open with a failed choice', data: { state: 'open', attempts: [{ ...THE_CHOICE, failed_because: 'The worker stopped again.' }] } },
    { name: 'no state with a failed choice', data: { attempts: [{ ...THE_CHOICE, failed_because: 'The worker stopped again.' }] } },
  ])('refuses a defaulted agent move ($name) as a change does, without writing a record, revision, change or link', async ({ data }) => {
    const made = await file({ symptom: 'It stops answering.' })
    expect(made.code, made.said).toBe(201)
    expect(stored(made.id!)['whose_move']).toBe('agent')
    const rows = (): unknown[][] => ['records', 'revisions', 'changes', 'links'].map((table) =>
      t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    )
    const before = rows()
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${made.id!}`,
      headers: AS_AN_AGENT,
      payload: { dataPatch: { ...data, options: OPTIONS } },
    })
    expect(changed.statusCode, changed.body).toBe(409)
    expect(rows()).toEqual(before)

    const created = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AN_AGENT,
      payload: {
        kind: 'problem',
        title: 'A worker that stops answering',
        data: { ...data, symptom: 'It stops answering.', options: OPTIONS },
        links: [{ type: 'relates_to', toId: made.id! }],
      },
    })
    expect(created.statusCode, created.body).toBe(409)
    const createError = (created.json() as { error: string }).error
    const changeError = (changed.json() as { error: string }).error
    expect(createError.slice(createError.indexOf(' carries '))).toBe(changeError.slice(changeError.indexOf(' carries ')))
    expect(createError).toContain('takes_option')
    expect(createError).toContain('Nothing was written')
    expect(rows()).toEqual(before)
  })

  it('stores an open problem whose attempt takes one of its options, and keeps the agent’s move', async () => {
    const said = await file({ symptom: 'It stops answering.', options: OPTIONS, whose_move: 'agent', state: 'open', attempts: [THE_CHOICE] })
    expect(said.code, said.said).toBe(201)
    const data = stored(said.id!)
    expect(data['whose_move']).toBe('agent')
    expect(data['options']).toEqual(OPTIONS)
    expect(data['attempts']).toEqual([THE_CHOICE])
  })

  it('refuses an option that is not one of the options, a tried that does not name it, and a blank result', async () => {
    const elsewhere = await file({ options: OPTIONS, whose_move: 'agent', state: 'open', attempts: [{ ...THE_CHOICE, takes_option: 'buy a new machine' }] })
    expect(elsewhere.code).toBe(409)
    expect(elsewhere.said).toContain('is not one of its options')
    const unnamed = await file({ options: OPTIONS, whose_move: 'agent', state: 'open', attempts: [{ ...THE_CHOICE, tried: 'Restarted it.' }] })
    expect(unnamed.code).toBe(409)
    expect(unnamed.said).toContain('does not name it')
    const bare = await file({ options: OPTIONS, whose_move: 'agent', state: 'open', attempts: [{ ...THE_CHOICE, result: '  ' }] })
    expect(bare.code).toBe(409)
    expect(bare.said).toContain('with no `result`')
    // AND WHOEVER'S MOVE IT IS: a choice the office cannot defend is not stored on the person's move either.
    const theirs = await file({ options: OPTIONS, whose_move: 'person', state: 'open', attempts: [{ ...THE_CHOICE, takes_option: 'buy a new machine' }] })
    expect(theirs.code).toBe(409)
  })

  it('refuses a later write that takes the chosen option out of the options', async () => {
    const made = await file({ options: OPTIONS, whose_move: 'agent', state: 'open', attempts: [THE_CHOICE] })
    expect(made.code, made.said).toBe(201)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${made.id!}`,
      headers: AS_AN_AGENT,
      payload: { dataPatch: { options: ['wait for the rebuild'] } },
    })
    expect(patched.statusCode, patched.body).toBe(409)
    expect(stored(made.id!)['options']).toEqual(OPTIONS)
  })

  it('reads an attempt that says why it failed as no choice, so the refusal stands again', async () => {
    const failed = await file({
      options: OPTIONS,
      whose_move: 'agent',
      state: 'open',
      attempts: [{ ...THE_CHOICE, failed_because: 'The worker stopped again within ten minutes.' }],
    })
    expect(failed.code).toBe(409)
    expect(failed.said).toContain('says the next move is an agent')
  })

  it('draws the attempt on the problem’s page: the option’s words and the evidence, in English and in Chinese', () => {
    const record = {
      id: 'p-1',
      workspaceId: 'default',
      kind: 'problem',
      title: 'A worker that stops answering',
      summary: null,
      data: { options: OPTIONS, whose_move: 'agent', attempts: [THE_CHOICE] },
      origin: 'authored',
      createdAt: '2026-10-06 09:00:00',
      updatedAt: '2026-10-06 09:00:00',
      deletedAt: null,
      ownerId: THE_PERSON,
    } as unknown as PanelRecord
    for (const language of ['en', 'zh'] as const) {
      setWordLanguage(language)
      try {
        const drawn = renderToStaticMarkup(h(rp.WhatWasTried, { record, declares: { surface: null } }))
        expect(drawn, language).toContain(TAKEN)
        expect(drawn, language).toContain(THE_CHOICE.result)
      } finally {
        setWordLanguage('en')
      }
    }
  })
})
