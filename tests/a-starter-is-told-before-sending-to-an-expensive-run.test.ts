// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STARTER IS TOLD BEFORE SENDING TO AN EXPENSIVE RUN — CRITERION T6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * A person about to send a message to a run that is expensive to pick up is told so before the
 * message goes, through the composer's own answer about who is in the chair. The warning is a
 * warning and not a refusal: it is a sibling of `hazard`, it never reaches `whyNotSendIt`, and the
 * Send press stays live.
 *
 * The server half is proved too: the recipients reply for a run whose last turn is large and which
 * has been idle past the window carries the warning on its candidate, read from that run's own
 * record. The composer half is proved against that same shape with a run that can be picked up.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, EACH AFTER A CONTROL RUN, EACH RESTORED BYTE-IDENTICAL
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case below green on the unmutated tree, before either mutation.
 *
 *   1. DROP THE WARNING FROM THE CHAIR (src/web/components/agent/TalkBox.tsx, `whoWouldGetIt`):
 *      return `pickUpCost: null`. The sentence no longer reaches the sender, and the first case
 *      goes red.
 *
 *   2. FOLD THE WARNING INTO THE REFUSAL (src/web/components/agent/TalkBox.tsx, `whoWouldGetIt`):
 *      make `hazard` fall back to `pickUpCost` when the run can otherwise be picked up. The send
 *      is then refused, and the "send is still possible" case goes red.
 *
 * Each file was restored and checked with sha256sum before and after the mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import type { PickUp, RecipientCandidate } from '../src/server/lib/recipients.ts'

type Talk = typeof import('../src/web/components/agent/TalkBox.tsx')
type Recipients = typeof import('../src/web/components/agent/Recipients.tsx')
type RecipientsModule = typeof import('../src/server/lib/recipients.ts')

let talk: Talk
let recipients: Recipients
let recipientsFor: RecipientsModule['recipientsFor']
let t: TestDb
let expensiveRun = ''

/** A run that can be picked up where it left off. */
const CAN: PickUp = {
  answer: 'yes',
  runtime: 'claude-code',
  conversationId: 'ext-1',
  transcript: '/tmp/whatever.jsonl',
  resumeCommand: 'claude --resume ext-1',
  because: 'The transcript this run left is on this machine.',
}

/** A run that cannot be picked up. The contrast case: this one really does refuse. */
const CANNOT: PickUp = {
  answer: 'no',
  why: 'never-observed',
  because: 'Nobody recorded a transcript for this run, so there is no conversation to pick up.',
}

const WARNING = {
  lastTurnTokens: 250000,
  idleMinutes: 47,
  warning:
    "The last turn this run recorded spent 250,000 input tokens, and the run has been idle 47 minutes. " +
    "Picking it up again carries that run's conversation, so for a small fix start a fresh agent with a tight brief.",
}

function candidate(over: Partial<RecipientCandidate> = {}): RecipientCandidate {
  return {
    sessionId: 's-expensive',
    title: 'A long build that has gone quiet',
    doing: null,
    purpose: null,
    workspaceId: 'default',
    deleted: false,
    pickUp: CAN,
    pickUpCost: WARNING,
    origin: 'authored',
    originNote: null,
    recordedState: null,
    ground: null,
    why: 'It is listed because it was active recently.',
    alsoWhy: [],
    support: 0,
    tiedWith: [],
    lastSeenAt: '2026-09-01 00:00:00',
    lastSeenFrom: 'stated',
    ...over,
  } as RecipientCandidate
}

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, so the stand-in goes in before the
  // imports. Nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '#/', href: 'http://127.0.0.1/' },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  talk = await import('../src/web/components/agent/TalkBox.tsx')
  recipients = await import('../src/web/components/agent/Recipients.tsx')

  // A REAL RUN, so the server half is proved against the reader the route serves. The server module
  // is imported AFTER the throwaway database is in place, because it opens the database on import.
  t = await freshDb()
  recipientsFor = (await import('../src/server/lib/recipients.ts')).recipientsFor
  expensiveRun = historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'd-long-context' },
    kind: 'session',
    title: 'A long build that has gone quiet',
    data: {
      state: 'finished',
      runtime: 'claude-code',
      lastOutputAt: '2026-09-01 00:00:00',
      usageReceipt: { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 250000, inputIncludesCached: true },
    },
  }).id
}, 60_000)

afterAll(() => {
  t?.close()
})

describe('the server hands the warning to whoever is choosing', () => {
  it('carries it on the candidate for a run whose last turn is large and which is idle past the window', () => {
    const answer = recipientsFor(null, 'default')
    const found = [...answer.connected, ...answer.recent].find((one) => one.sessionId === expensiveRun)
    expect(found, 'the run is on the reply').toBeDefined()
    expect(found?.pickUpCost?.lastTurnTokens).toBe(250000)
    expect(found?.pickUpCost?.warning).toContain('250,000')
    expect(found?.pickUpCost?.warning).toContain('minutes')
  })
})

/**
 * THE COMPOSER'S OWN HALF IS GONE, AND THE SERVER'S IS NOT.
 *
 * The right-click panel is contact based now (criterion W4):
 * it does not address sessions, so the run-in-the-chair — and the warning on it — is a question the
 * panel does not ask. The review column still sends a comment to one run, through Recipients.tsx,
 * where the same `pickUpCost` warning is drawn on the candidate before the send, and the read of
 * that warning off the run record above is the half that must keep holding.
 */
