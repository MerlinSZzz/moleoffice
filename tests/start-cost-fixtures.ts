// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION WHOSE START IS FULLY KNOWN: a startedAt, a usage receipt, the office's own `api_calls`
 * rows for the steps, and a first write under the session at a chosen, exact gap from startedAt.
 *
 * EVERY TIME IS FIXED, NEVER RACED AGAINST THE WALL CLOCK. `startedAtMs` is a constant instant, the
 * call rows and the first-write change row are written at exact offsets from it, and the session
 * record's own create change is moved to that instant rather than left to `logChange`'s real
 * `now()`. A test asserting an exact step window cannot depend on how long the test process happens
 * to take between two statements.
 *
 * WHAT A CALLER CAN LEAVE OUT, TO BUILD AN UNMEASURED FIXTURE: `withReceipt: false` (no usage
 * receipt at all), `withFirstWrite: false` (the start has not finished), or `withStartedAt: false`
 * (the start cannot be timed). There is no transcript and no tool round any more: a decision
 * retired both. A caller that wants a step measured sends `calls`, and one that wants
 * a step with no request of its kind simply leaves that step's operations out.
 */
import { nanoid } from 'nanoid'
import type { TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'

export interface KnownCall {
  /** How many milliseconds after startedAt the office answered this request. */
  offsetMs: number
  /** The operation name from src/shared/ops.ts the route declared. */
  operation: string
  /** The request's own latency in milliseconds. Defaults to 5. */
  ms?: number
}

export interface KnownStartOptions {
  workspaceId?: string
  /** Epoch ms for the session's own startedAt. Defaults to a fixed instant, never `Date.now()`. */
  startedAtMs?: number
  /** How many ms after startedAt the first write outside the session lands. */
  windowMs?: number
  /** The receipt's raw inputTokens. cachedInputTokens and cacheCreationInputTokens are both 0. */
  inputTokens?: number
  /** The office's own api_calls rows for this session, each at an offset from startedAt. */
  calls?: KnownCall[]
  /** Where to put the session record's own create change. Default 0; null leaves it at real now(). */
  sessionRecordOffsetMs?: number | null
  withReceipt?: boolean
  withFirstWrite?: boolean
  /** Set false to omit startedAt itself, so the start cannot be timed at all. */
  withStartedAt?: boolean
  actorId?: string
}

export interface KnownStart {
  sessionId: string
  startedAtMs: number
  firstWriteAtMs: number | null
}

export function aKnownStart(t: TestDb, opts: KnownStartOptions = {}): KnownStart {
  const workspaceId = opts.workspaceId ?? 'panelx'
  const startedAtMs = opts.startedAtMs ?? Date.UTC(2026, 8, 14, 10, 0, 0)
  const windowMs = opts.windowMs ?? 60_000
  const inputTokens = opts.inputTokens ?? 100
  const actorId = opts.actorId ?? 'a-fixture-agent'

  const data: Record<string, unknown> = {
    state: 'finished',
    runtime: 'claude-code',
    ...(opts.withStartedAt === false ? {} : { startedAt: localStamp(new Date(startedAtMs)) }),
  }

  if (opts.withReceipt !== false) {
    data['usageReceipt'] = {
      runtime: 'claude-code',
      model: 'claude-sonnet-5',
      inputTokens,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      inputIncludesCached: false,
    }
  }

  const session = t.api.createRecord({
    kind: 'session',
    title: 'A fixture start, known end to end',
    workspaceId,
    data,
    actor: { type: 'agent', id: actorId },
  })

  // THE SESSION RECORD'S OWN FIRST WRITE, at a clock the test chose rather than at now().
  if (opts.sessionRecordOffsetMs !== null) {
    t.client.sqlite
      .prepare("update changes set at = ? where record_id = ? and op = 'create'")
      .run(localStamp(new Date(startedAtMs + (opts.sessionRecordOffsetMs ?? 0))), session.id)
  }

  // THE OFFICE'S OWN CALL LOG FOR THIS SESSION. One row per step request, at an exact instant, so
  // the step arithmetic can be asserted to the millisecond without racing the wall clock.
  for (const call of opts.calls ?? []) {
    t.client.sqlite
      .prepare(
        'insert into api_calls (id, at_ms, operation, effect, route, method, waits, status, ms, identity_source, session_id) ' +
          "values (?, ?, ?, 'read', '/api/fixture', 'GET', 0, 200, ?, 'header', ?)",
      )
      .run(nanoid(12), startedAtMs + call.offsetMs, call.operation, call.ms ?? 5, session.id)
  }

  let firstWriteAtMs: number | null = null
  if (opts.withFirstWrite !== false) {
    firstWriteAtMs = startedAtMs + windowMs
    const target = t.api.createRecord({
      kind: 'note',
      title: 'The first real thing this fixture start wrote',
      workspaceId,
      data: {},
      actor: { type: 'agent', id: actorId, sessionId: session.id },
    })
    t.client.sqlite
      .prepare("update changes set at = ? where record_id = ? and op = 'create'")
      .run(localStamp(new Date(firstWriteAtMs)), target.id)
  }

  return { sessionId: session.id, startedAtMs, firstWriteAtMs }
}
