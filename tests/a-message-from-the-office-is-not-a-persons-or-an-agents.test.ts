// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M105 — A MESSAGE FROM THE OFFICE HAS THE OFFICE AS ITS SENDER, TOLD APART, UNCOUNTED, NO RUN.
 *
 * design/messages/ACCEPTANCE.md asks for one more kind of sender, the Mole Office system message.
 * From F10 on, a reminder is a `message` whose `sentBy` is the office, drawn with its own mark
 * in the chat and the contact row, never counted as unread from a person, and never starting a run
 * by itself.
 *
 * MEASURED BEFORE THIS FILE WAS WRITTEN, AND NOT REBUILT HERE. Three of M105's four parts already
 * existed and are only proved by this test, not changed by it:
 *
 *   - `MOLE_OFFICE`/`isMoleOffice()` in src/shared/participants.ts:594,604 — the office's own,
 *     fixed identity, told apart from any person or any agent by one function every reader can call.
 *   - `unreadAmong()` in src/server/lib/messages.ts:1560, through `isASystemLine()` at :1590 — a
 *     line Mole Office wrote is never counted as unread.
 *   - `whyThisMessageNeedsNoRun()` in src/server/lib/worker.ts:297 — a line Mole Office wrote never
 *     starts a run.
 *
 * The fourth part — its own mark in the chat and the contact row — is drawn by
 * src/web/components/Chat.tsx's `SystemLine` component, which already exists but is on branch
 * chat-3, not yet on main; the brief for this cluster says not to touch it, so it is not tested here.
 *
 * WHAT THIS FILE ADDS: nothing to src/server or src/shared. It is a regression test for the three
 * backend parts above, exercised together through a real write — using the new
 * `writeASystemLineToOne` (this cluster's own commit widening the office-sender gate to one
 * participant) rather than the group/pair shapes those three functions already had coverage of
 * elsewhere, so a future F10 reminder to one agent is provably covered by the same three facts.
 *
 * Mutation: in src/server/lib/messages.ts, `unreadAmong`, delete `!isASystemLine(one) &&` so a
 * system line counts like an ordinary message. "is never counted as unread" below goes red; restored
 * after, it is green again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')
let messagesLib: typeof import('../src/server/lib/messages.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let participants: typeof import('../src/shared/participants.ts')
/** The registry id the starter door gave w-one. It is not the handle. */
let wOneId: string

const THE_OFFICE = { type: 'agent', id: 'mole-office/the-api-server' } as const

beforeAll(async () => {
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  messagesLib = await import('../src/server/lib/messages.ts')
  worker = await import('../src/server/lib/worker.ts')
  participants = await import('../src/shared/participants.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const wOne = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    payload: { handle: 'w-one', name: 'Worker One', role: 'worker' },
  })
  wOneId = (wOne.json() as { agent: { id: string } }).agent.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a message from the office is told apart from a person\'s and an agent\'s', () => {
  it('isMoleOffice is true of the office and false of a person and an ordinary agent', () => {
    expect(participants.isMoleOffice({ kind: 'agent', id: theOfficesOwnId(t) })).toBe(true)
    expect(participants.isMoleOffice({ kind: 'person', id: THE_PERSON })).toBe(false)
    expect(participants.isMoleOffice({ kind: 'agent', id: wOneId })).toBe(false)
  })

  it('a reminder-shaped office message carries sentBy: Mole Office, distinct from the agent it reached', () => {
    const written = groups.writeASystemLineToOne(
      { kind: 'agent', id: wOneId },
      'default',
      { line: 'A reminder', said: 'Re-read the regulations after a compaction.', notice: 'aCounterFired' },
      THE_OFFICE,
    )
    const pool = messagesLib.messagePool('default')
    const one = pool.find((row) => row.id === written.id)
    expect(one).toBeDefined()
    expect(participants.isMoleOffice(one!.sentBy!)).toBe(true)
    expect(one!.sentBy).not.toEqual({ kind: 'agent', id: wOneId })
  })

  it('is never counted as unread for the agent it reached', () => {
    const written = groups.writeASystemLineToOne(
      { kind: 'agent', id: wOneId },
      'default',
      { line: 'Second reminder', said: null, notice: 'aCounterFired' },
      THE_OFFICE,
    )
    const pool = messagesLib.messagePool('default')
    const one = pool.find((row) => row.id === written.id)
    expect(one).toBeDefined()
    // IT STILL HAS A DELIVERY ROW ADDRESSED TO THE AGENT — it was really sent — but the count a
    // person would read for that agent's unread messages does not move for it.
    expect(one!.deliveries.some((d) => d.to.kind === 'agent' && d.to.id === wOneId)).toBe(true)
    const unread = messagesLib.unreadAmong([one!], { kind: 'agent', id: wOneId })
    expect(unread).toBe(0)
  })

  it('never starts a run by itself', () => {
    const written = groups.writeASystemLineToOne(
      { kind: 'agent', id: wOneId },
      'default',
      { line: 'Third reminder', said: null, notice: 'aCounterFired' },
      THE_OFFICE,
    )
    const pool = messagesLib.messagePool('default')
    const one = pool.find((row) => row.id === written.id)
    expect(one).toBeDefined()
    const because = worker.whyThisMessageNeedsNoRun(one!.sentBy)
    expect(because).not.toBeNull()
    expect(because).toContain('No run was started')
  })

  it('an ordinary agent writing the same words starts a run in the usual way (the contrast case)', () => {
    const because = worker.whyThisMessageNeedsNoRun({ kind: 'agent', id: wOneId })
    expect(because).toBeNull()
  })
})
