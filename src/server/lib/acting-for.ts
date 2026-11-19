// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUPERVISOR'S RUN KEY ACTS FOR THE RUNS OF AGENTS IT REGISTERED AND STARTED, WHILE THOSE RUNS RUN.
 *
 * This is item 7 of a decision, on problem 296sqTPPdWsQ. An in-process subagent runs inside its
 * supervisor's process and shares its environment, so it cannot hold a key of its own there. To let each subagent write
 * as its own run, wave 13q saved every subagent's run key to a file in the sandbox's out/ folder, and every agent in
 * that sandbox runs as one user and could read every one of them. With this rule no key is put on disk: the subagent
 * sends its supervisor's run key, which it shares anyway, and names itself and its own run in the headers.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A request that carries a live run key, and whose headers name another agent A and a run R
 * (x-mole-office-actor-id and x-mole-office-session), is proved as A in R when every one of these holds:
 *
 *   1. R is a run this office holds, and it has not ended (RUN_IS_OVER_STATES in lib/keys.ts), which is exactly
 *      while R's own key would still be alive;
 *   2. R serves A (`theAgentARunServes`, the one reader of that);
 *   3. R was started from the run whose own key the request carries: R's `parentAttachment` names a run whose
 *      `data.extra.runKeyId` is that key's row, and that run has not ended either;
 *   4. A's registered starter is the key's holder (`theKeyHolderIsTheRegisteredStarterOf`, the one reader the
 *      run-key mint also asks).
 *
 * So the key acts only for its own run's children, only for agents its holder registered, and only while both runs run.
 * A key that is not a run key has no run whose record names it, so it acts for nothing. Anything else is the refusal it
 * always was: one agent's key under another agent's name (lib/keyheader.ts), which now also says which of the four did
 * not hold.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE CHANGE LOG KEEPS
 * ---------------------------------------------------------------------------------------
 *
 * The row names A, in R, and its `provedHolder` names the key's holder with the name the headers gave, as for any key
 * that proved somebody other than the name on the row (`actorFrom` in lib/http.ts). So every write done this way still
 * shows whose key did it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN FILE, HANDED IN TO lib/keys.ts
 * ---------------------------------------------------------------------------------------
 *
 * The rule reads run records and the registry, and those modules import lib/keys.ts, where every key is read. So the
 * reader lives here, and `buildApp` hands it in once (`letARunKeyActForTheRunsItStarted`). It never throws: it is asked
 * on every request that carries an agent key, the bookkeeping read included, so a fault in it answers "acts for nothing"
 * rather than refusing the request.
 */
import type { FastifyRequest } from 'fastify'

import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { theKeyHolderIsTheRegisteredStarterOf } from './claims.ts'
import { ACTOR_HEADERS } from '@shared/request-headers.ts'
import { headerValue } from './header-value.ts'
import { readWhatARunKeyActsForWith, type ARunKeyActsFor } from './keys.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { readParticipant } from '../db/read-participant.ts'
import { getRecord } from './records.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'

/**
 * WHAT ONE REQUEST'S RUN KEY ACTS FOR: `acts` when the rule holds, `not` with the one condition that did not hold when
 * the headers asked for it, and null when they did not ask (no run named, or the key's own agent named).
 */
export type WhatThisRunKeyActsFor = { acts: ARunKeyActsFor } | { not: string } | null

/**
 * ONE READING PER REQUEST. The key is read several times on one request (the refusal of a key under another name, the
 * role gate, the actor, the bookkeeping), and each must get the same answer: a request that ends its own run part-way
 * through is still the request its first reading proved.
 */
const readOnce = new WeakMap<FastifyRequest, WhatThisRunKeyActsFor>()

/** One of the three headers, trimmed, or undefined when it was not sent, was blank, or could not be read. */
function aClearHeader(req: FastifyRequest, name: string): string | undefined {
  try {
    const value = headerValue(req, name)?.trim()
    return value === undefined || value === '' ? undefined : value
  } catch {
    // A HEADER SENT TWICE WITH TWO VALUES is `actorFrom`'s to refuse, and it does; here it is only a name not read.
    return undefined
  }
}

/** The run a request names, as its record's kind, its state and its data, or null because this office holds none. */
function aRun(id: string): { id: string; data: Record<string, unknown> } | null {
  const record = getRecord(id)
  if (record === null || record.kind !== 'session' || (record.deletedAt ?? null) !== null) return null
  return { id: record.id, data: record.data as Record<string, unknown> }
}

/** The run key a run's own record names, or null because it names none. */
function theRunKeyOf(data: Record<string, unknown>): string | null {
  const extra = data['extra']
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) return null
  const id = (extra as Record<string, unknown>)['runKeyId']
  return typeof id === 'string' && id !== '' ? id : null
}

/** The rule, read once. See this file's own note. */
function readTheRule(req: FastifyRequest, key: { id: string; whoseId: string }): WhatThisRunKeyActsFor {
  if (aClearHeader(req, ACTOR_HEADERS.type) !== 'agent') return null
  const name = aClearHeader(req, ACTOR_HEADERS.id)
  const runId = aClearHeader(req, ACTOR_HEADERS.session)
  if (name === undefined || runId === undefined) return null
  const named = theOneAgentAStringNames(sqlite, name)
  // NAMES NOBODY, OR TWO AGENTS: the refusal of a key under another name answers that, as it always did.
  if (named === null) return null
  // THE KEY'S OWN AGENT: nothing to act for.
  if (named.id === key.whoseId) return null

  const run = aRun(runId)
  if (run === null) return { not: `run ${runId}, which the session header names, is not a run this office holds` }
  if (theRunHasEnded(run.data['state'])) return { not: `run ${runId} has ended (${String(run.data['state'])})` }
  const serves = theAgentARunServes(run.data)
  if (serves === null || serves.id !== named.id) return { not: `run ${runId} does not serve "${named.handle}"` }
  const parentId = run.data['parentAttachment']
  const parent = typeof parentId === 'string' && parentId !== '' ? aRun(parentId) : null
  if (parent === null || theRunKeyOf(parent.data) !== key.id) {
    return { not: `run ${runId} was not started from the run this key belongs to (its parentAttachment names another run, or none)` }
  }
  if (theRunHasEnded(parent.data['state'])) return { not: `the run this key belongs to, ${parent.id}, has ended` }
  const registry = readParticipant({ kind: 'agent', id: named.id })
  const agent = registry !== null && 'startedBy' in registry ? registry : null
  if (agent === null || !theKeyHolderIsTheRegisteredStarterOf(agent, key.whoseId)) {
    return { not: `"${named.handle}" was not registered by the agent this key belongs to` }
  }
  return { acts: { agentId: named.id, run: run.id, holdersRun: parent.id } }
}

/**
 * WHAT THIS REQUEST'S RUN KEY ACTS FOR, read once per request. `key` is the live key row the request carries, as
 * lib/keys.ts found it: its id and its holder.
 */
export function whatThisRunKeyActsFor(req: FastifyRequest, key: { id: string; whoseId: string }): WhatThisRunKeyActsFor {
  if (readOnce.has(req)) return readOnce.get(req) ?? null
  let answer: WhatThisRunKeyActsFor
  try {
    answer = readTheRule(req, key)
  } catch (err) {
    answer = { not: `the office could not read whether this key may act for that run (${err instanceof Error ? err.message : String(err)})` }
  }
  readOnce.set(req, answer)
  return answer
}

/**
 * WHY THIS REQUEST'S RUN KEY DID NOT ACT FOR THE RUN ITS HEADERS NAME, or null because it did, or the question did not
 * arise. For the refusal of a key under another name (lib/keyheader.ts), which is asked after the key was read.
 */
export function whyThisRunKeyDidNotActFor(req: FastifyRequest): string | null {
  const read = readOnce.get(req) ?? null
  return read !== null && 'not' in read ? read.not : null
}

/** Hand the rule to lib/keys.ts. `buildApp` in src/server/index.ts does, once. */
export function letARunKeyActForTheRunsItStarted(): void {
  readWhatARunKeyActsForWith((req, key) => {
    const read = whatThisRunKeyActsFor(req, key)
    return read !== null && 'acts' in read ? read.acts : null
  })
}
