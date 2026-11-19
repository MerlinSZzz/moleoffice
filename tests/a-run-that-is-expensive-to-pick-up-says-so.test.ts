// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT IS EXPENSIVE TO PICK UP IS SAID SO — CRITERION T6, AS AMENDED 13 SEPTEMBER 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * The office knows two things about a run and says those two rather than guessing a third: the
 * input tokens on its own usage receipt, and how many minutes it has been idle. A run is drawn with
 * the warning on its Embassy row when the last turn is large AND it has been idle past the window
 * the installation names. It is NOT drawn when the same run is recently active, when the last turn
 * is small, or when nobody recorded a receipt at all. That last case is the one that matters most:
 * absence is not smallness, and a run nobody measured carries no warning.
 *
 * The warning's own words are checked against the one function that writes them: they name both
 * measured numbers and contain no context size.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, EACH AFTER A CONTROL RUN, EACH RESTORED BYTE-IDENTICAL
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case below green on the unmutated tree, before either mutation.
 *
 *   1. DROP THE IDLE HALF OF THE CONDITION (src/shared/pick-up-cost.ts, `pickUpCostSaid`): remove
 *      `if (idleMinutes < idleAtLeastMinutes) return null`, so every large run warns whatever its
 *      idle time. The recently-active case goes red.
 *
 *   2. TREAT A MISSING RECEIPT AS A MEASURED LARGE ONE (src/shared/pick-up-cost.ts,
 *      `lastTurnTokensOf`): return the token line instead of null when the runtime gave no count.
 *      The no-receipt case goes red, because a run nobody measured is suddenly called expensive.
 *
 * Each file was restored and checked with sha256sum before and after the mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { lastTurnTokensOf, pickUpCostSaid, thePickUpCostWarning } from '../src/shared/pick-up-cost.ts'
// THE DEFAULT AND THE BRIEF'S BUDGET ARE HELD TOGETHER, so neither can move without the other.
// BRIEF_TOKEN_BUDGET is NOT imported here: src/server/api/brief.ts reaches the database client, and
// a top-level import would open the operator's own corpus before freshDb() could name another. The
// guard in src/server/db/client.ts refuses exactly that and names this fix. It is imported inside
// the case instead, after beforeAll has named a database.
import { settingNamed } from '../src/config/settings.mjs'
import { localStamp } from '../src/shared/time.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A stamp far enough back that any sensible expensive window has passed. */
const LONG_AGO = '2026-09-01 00:00:00'

/** Register an agent through the door every agent comes through; returns the agent record id. */
async function register(handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['src'] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return String((reply.json() as { record: string }).record)
}

/** One finished run bound to the agent's own record through `ranAs`. */
function aRun(agentRecordId: string, title: string, data: Record<string, unknown>): string {
  return historicalSession(t, {
    workspaceId: 'default',
    // FILED BY THE PERSON, from inside the office: a session for an agent is filed only by that agent, those above it,
    // the person proved, or the office. It was an unregistered name, which may no longer file for an agent.
    actor: { type: 'human', id: THE_PERSON },
    kind: 'session',
    title,
    data: { state: 'running', ranAs: [{ workspaceId: 'default', agentId: agentRecordId }], ...data },
  }).id
}

async function embassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

/**
 * The Embassy row of one agent. A row names the agent by its registry id, which is not its handle,
 * so the id is read from the registry first.
 */
function rowFor(said: WhatTheEmbassySays, handle: string): EmbassyRow {
  const registered = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as
    | { id: string }
    | undefined
  expect(registered, `the registry holds a row for ${handle}`).toBeDefined()
  const id = (registered as { id: string }).id
  const row = said.rows.find((one) => one.who.kind === 'agent' && one.who.id === id)
  expect(row, `the Embassy holds a row for ${handle}`).toBeDefined()
  return row as EmbassyRow
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  // A LARGE LAST TURN AND A LONG IDLE — the case the warning is for.
  const expensive = await register('expensive-agent')
  aRun(expensive, 'A long and finished conversation', {
    usageReceipt: { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 250000, inputIncludesCached: true },
    lastOutputAt: LONG_AGO,
  })

  // THE SAME LAST TURN, RECENTLY ACTIVE — no warning.
  const recent = await register('recent-agent')
  aRun(recent, 'A long conversation still being worked on', {
    usageReceipt: { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 250000, inputIncludesCached: true },
    lastOutputAt: localStamp(new Date()),
  })

  // IDLE JUST AS LONG, A SMALL LAST TURN — no warning.
  const small = await register('small-agent')
  aRun(small, 'A short conversation left alone', {
    usageReceipt: { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 7, inputIncludesCached: true },
    lastOutputAt: LONG_AGO,
  })

  // IDLE JUST AS LONG, NO RECEIPT AT ALL — absence is not smallness, no warning.
  const unmeasured = await register('unmeasured-agent')
  aRun(unmeasured, 'A run nobody measured', { lastOutputAt: LONG_AGO })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the warning is carried when both measured numbers say so', () => {
  it('carries it on the Embassy row of a run with a large last turn and a long idle', async () => {
    const cost = rowFor(await embassy(), 'expensive-agent').pickUpCost
    expect(cost, 'the row says the pick-up is expensive').not.toBeNull()
    expect(cost?.lastTurnTokens, 'the measured last turn').toBe(250000)
    expect(cost?.idleMinutes ?? 0, 'a long idle, in whole minutes').toBeGreaterThan(5)
    expect(cost?.warning).toContain('250,000')
    expect(cost?.warning).toContain('minutes')
  })

  it('carries no warning for the same last turn when the run is recently active', async () => {
    expect(rowFor(await embassy(), 'recent-agent').pickUpCost).toBeNull()
  })

  it('carries no warning for a long idle when the last turn is small', async () => {
    expect(rowFor(await embassy(), 'small-agent').pickUpCost).toBeNull()
  })

  it('carries no warning for a run with no usage receipt, which is absence and not smallness', async () => {
    expect(rowFor(await embassy(), 'unmeasured-agent').pickUpCost).toBeNull()
  })
})

describe('the warning names the two measured numbers and no context size', () => {
  it('writes both numbers and never the word context', () => {
    const warning = thePickUpCostWarning(250000, 47)
    expect(warning).toContain('250,000')
    expect(warning).toContain('47')
    expect(warning.toLowerCase()).not.toContain('context')
  })

  it('reads a receipt with no input count as absent, never as zero', () => {
    expect(lastTurnTokensOf({ outputTokens: 5 })).toBeNull()
    expect(lastTurnTokensOf(undefined)).toBeNull()
    expect(lastTurnTokensOf({ inputTokens: 0 }), 'a measured zero is a number').toBe(0)
  })

  it('needs both numbers, and each threshold, before it says anything', () => {
    expect(pickUpCostSaid(250000, 47, 100000, 5), 'both cross').not.toBeNull()
    expect(pickUpCostSaid(250000, 1, 100000, 5), 'not idle enough').toBeNull()
    expect(pickUpCostSaid(7, 47, 100000, 5), 'last turn too small').toBeNull()
    expect(pickUpCostSaid(null, 47, 100000, 5), 'no token number').toBeNull()
    expect(pickUpCostSaid(250000, null, 100000, 5), 'no idle reading').toBeNull()
  })

  /**
   * THE CASE THAT WAS MISSING, AND THE DEFECT IT CATCHES. Problem Rn-hi48NaLnV.
   *
   * A Claude Code run's `inputTokens` is the UNCACHED input only — `claudeUsage` sets
   * `inputIncludesCached: false` and says so in its own comment. Measured on the owner's office,
   * the four runs that carry a receipt report inputTokens of 28, 20, 14 and 12 while their whole
   * turns are millions. Reading `inputTokens` alone made the warning unreachable for everybody.
   *
   * THE MUTATION: make `lastTurnTokensOf` return `receipt.inputTokens` alone again. The first case
   * below goes red.
   */
  it('counts the whole input side of a Claude turn, where the cache reads are the size', () => {
    const claudeShaped = {
      runtime: 'claude-code', inputTokens: 28, cachedInputTokens: 2452666,
      cacheCreationInputTokens: 178809, inputIncludesCached: false,
    }
    expect(lastTurnTokensOf(claudeShaped), 'the three counts are separate and add up').toBe(2631503)
    expect(pickUpCostSaid(lastTurnTokensOf(claudeShaped), 47, 12000, 5), 'a real Claude run warns').not.toBeNull()
  })

  it('does not count a Codex turn twice, because its own count already holds the cache reads', () => {
    const codexShaped = {
      runtime: 'codex', inputTokens: 250000, cachedInputTokens: 240000, inputIncludesCached: true,
    }
    expect(lastTurnTokensOf(codexShaped), 'the flag says they are already inside').toBe(250000)
  })

  it('adds nothing when nobody said the counts do not overlap', () => {
    expect(lastTurnTokensOf({ inputTokens: 900, cachedInputTokens: 500000 }), 'no flag, no sum').toBe(900)
  })

  /**
   * THE DEFAULT IS THE SIZE OF A BRIEF, and this case is what stops the two drifting apart. Past
   * the window, picking a run up re-reads its turn; starting fresh costs one brief. So the point
   * where a pick-up costs more than a fresh start is where the turn is bigger than a brief.
   *
   * THE MUTATION: change either number without the other. This goes red.
   */
  it('calls a turn large at exactly the size a brief is budgeted at', async () => {
    const { BRIEF_TOKEN_BUDGET } = await import('../src/server/api/brief.ts')
    expect(settingNamed('MOLE_OFFICE_LARGE_LAST_TURN_TOKENS').fallback).toBe(String(BRIEF_TOKEN_BUDGET))
  })
})
