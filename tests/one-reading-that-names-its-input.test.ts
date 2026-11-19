// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old closed-attachment examples had no submission. Only those two attachments are now explicitly historical; every input/presence assertion remains. */
/**
 * PRESENCE IS ONE READING OVER THREE INPUTS, AND IT SAYS WHICH ONE ANSWERED.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. No open attachment reads **Offline**, and the reading says no arrival input was consulted
 *      rather than reporting a missing one.
 *   2. An open attachment Mole Office has never heard from reads from `attachment-opened` — the weakest
 *      input — and goes **Stale** once the threshold has passed, and stays there.
 *   3. An open attachment that has sent a request reads from `request`, which is stronger, and the
 *      reply names it.
 *   4. The strongest input, `listen`, reports `reader-not-built` every time, because there is no
 *      held request anywhere in the server. That is a different answer from `nothing-recorded`, and
 *      this file asserts they stay different.
 *   5. The threshold is one declared number. The reply carries it and carries the sentence saying
 *      it is not yet measured, so no caller has to know either.
 *   6. Nothing here reads a work state or returns one. The two dimensions are read separately and
 *      meet only on a screen.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE CLOCK IS HANDED IN
 * ---------------------------------------------------------------------------------------
 *
 * `presenceOf` takes the moment to read against, defaulting to the server's clock. A test that
 * waited fifteen real minutes for Stale would never be run. Nothing stores the moment — this file's
 * subject writes nothing at all — so handing it in is a reading taken from a stated point, not a
 * fabricated observation.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { STALE_THRESHOLD_IS_UNMEASURED } from '../src/shared/lifecycle.ts'

const WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AN_AGENT_PROCESS = { type: 'agent', id: 'claude-code' } as const

let t: TestDb
let presence: typeof import('../src/server/lib/presence.ts')
let attachments: typeof import('../src/server/lib/attachments.ts')
/** Each case's agent records carry a handle of its own, because one project holds one live row per handle. */
let caseNumber = 0

/**
 * THE MOMENTS THIS FILE READS AGAINST ARE RELATIVE TO NOW, AND THAT IS NOT LAZINESS.
 *
 * An attachment opening moment is the record own `createdAt`, written by the server clock, so a
 * fixed date in the past would put the reading BEFORE the attachment opened and every silence would
 * come out negative. The reading takes the moment to read against, so a test states an offset from
 * now and never has to wait for one.
 */
const NOW = (): Date => new Date()
const minutesBefore = (n: number): Date => new Date(Date.now() - n * 60_000)
const minutesLater = (n: number): Date => new Date(Date.now() + n * 60_000)

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instances, imported after `freshDb` resets the module registry.
  presence = await import('../src/server/lib/presence.ts')
  attachments = await import('../src/server/lib/attachments.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
})

/** A durable agent with nothing attached to it. */
function anAgent(base = 'lifecycle'): string {
  const handle = `${base}-${String(caseNumber)}`
  return t.api.createRecord({
    kind: 'agent',
    title: `the ${handle} agent`,
    workspaceId: WORKSPACE,
    data: { handle, state: 'active' },
    actor: PERSON,
  }).id
}

/** One open attachment serving that agent. */
function aRunFor(agentId: string, title = 'a run working as it'): string {
  return attachments.openAttachment({ workspaceId: WORKSPACE, actor: PERSON, title, agentId }).attachment.id
}

/**
 * One `api_calls` row carrying an attachment as its session, at a stated moment.
 *
 * Written with raw SQL because the presence reading is about what that table HOLDS, and going
 * through the request path would tie this test to a route's behaviour rather than to the reading.
 */
function aRequestFrom(attachmentId: string, when: Date): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, ms, method, waits, status, session_id, identity_source) ' +
        'VALUES (?, ?, 1.0, ?, 0, 200, ?, ?)',
    )
    .run(`call-${when.getTime()}-${attachmentId}`, when.getTime(), 'GET', attachmentId, 'header')
}

/** What one input said, by name, so a failure names the input rather than an array position. */
function said(
  reading: { inputs: { input: string; answer: string; at: string | null; says: string }[] },
  input: string,
) {
  const one = reading.inputs.find((each) => each.input === input)
  if (one === undefined) throw new Error(`The reading did not mention the ${input} input at all.`)
  return one
}

// ============================================================ offline

describe('an agent with nothing open', () => {
  it('reads Offline, and says no arrival input was consulted rather than reporting a missing one', () => {
    const agentId = anAgent()
    const reading = presence.presenceOf(agentId, WORKSPACE, NOW())
    expect(reading.presence).toBe('offline')
    expect(reading.word).toBe('Offline')
    expect(reading.from, 'Offline is decided by the roster, not by an arrival').toBeNull()
    expect(reading.whyNoInput).toMatch(/No attachment is open/)
    expect(reading.lastArrival).toBeNull()
    expect(reading.quietForMinutes).toBeNull()
    expect(reading.openAttachments).toEqual([])
  })

  it('reads Offline once its only attachment is closed, and the close is what changed it', () => {
    const agentId = anAgent()
    const attachmentId = aRunFor(agentId)
    expect(presence.presenceOf(agentId, WORKSPACE, NOW()).presence).toBe('online')

    t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(attachmentId)
    attachments.closeAttachment(attachmentId, {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      because: 'The run ended and said so.',
      how: 'agent-said',
    })
    const after = presence.presenceOf(agentId, WORKSPACE, NOW())
    expect(after.presence).toBe('offline')
    expect(after.openAttachments).toEqual([])
  })
})

// ============================================================ the weakest input

describe('an open attachment Mole Office has never heard from', () => {
  it('reads from attachment-opened, which is the weakest input, and the reply names it', () => {
    const agentId = anAgent()
    const attachmentId = aRunFor(agentId)
    const reading = presence.presenceOf(agentId, WORKSPACE, NOW())
    expect(reading.from).toBe('attachment-opened')
    expect(reading.openAttachments).toEqual([attachmentId])
    expect(said(reading, 'request').answer, 'nobody has ever sent a session header for it').toBe('nothing-recorded')
    expect(said(reading, 'attachment-opened').answer).toBe('answered')
  })

  it('goes Stale once the threshold has passed and stays there, which is what Stale means', () => {
    const agentId = anAgent()
    aRunFor(agentId)
    const threshold = presence.presenceOf(agentId, WORKSPACE, NOW()).staleAfterMinutes

    const justInside = presence.presenceOf(agentId, WORKSPACE, minutesLater(threshold - 1))
    expect(justInside.presence).toBe('online')

    const atTheThreshold = presence.presenceOf(agentId, WORKSPACE, minutesLater(threshold + 1))
    expect(atTheThreshold.presence).toBe('stale')

    const muchLater = presence.presenceOf(agentId, WORKSPACE, minutesLater(600))
    expect(muchLater.presence, 'an attachment Mole Office never hears from stays Stale').toBe('stale')
    expect(muchLater.from).toBe('attachment-opened')
  })
})

// ============================================================ the request input

describe('an open attachment that has sent a request', () => {
  it('reads from request, which is stronger, and names it rather than the opening', () => {
    const agentId = anAgent()
    const attachmentId = aRunFor(agentId)
    aRequestFrom(attachmentId, minutesBefore(2))
    const reading = presence.presenceOf(agentId, WORKSPACE, NOW())
    expect(reading.from).toBe('request')
    expect(reading.presence).toBe('online')
    expect(reading.quietForMinutes).toBe(2)
    expect(said(reading, 'request').answer).toBe('answered')
    expect(said(reading, 'attachment-opened').answer, 'the weaker input still says what it had').toBe('answered')
  })

  it('reads Stale when the newest request is older than the threshold', () => {
    const agentId = anAgent()
    const attachmentId = aRunFor(agentId)
    aRequestFrom(attachmentId, minutesBefore(90))
    const reading = presence.presenceOf(agentId, WORKSPACE, NOW())
    expect(reading.from).toBe('request')
    expect(reading.presence).toBe('stale')
    expect(reading.quietForMinutes).toBe(90)
  })

  it('takes the newest of several requests and not the first one it finds', () => {
    const agentId = anAgent()
    const attachmentId = aRunFor(agentId)
    aRequestFrom(attachmentId, minutesBefore(200))
    aRequestFrom(attachmentId, minutesBefore(3))
    aRequestFrom(attachmentId, minutesBefore(400))
    expect(presence.presenceOf(agentId, WORKSPACE, NOW()).quietForMinutes).toBe(3)
  })

  it('counts no request belonging to another agent attachment', () => {
    const mine = anAgent('mine')
    const theirs = anAgent('theirs')
    aRunFor(mine)
    const theirRun = aRunFor(theirs, 'their run')
    aRequestFrom(theirRun, minutesBefore(1))

    const reading = presence.presenceOf(mine, WORKSPACE, NOW())
    expect(said(reading, 'request').answer, 'somebody else traffic is not this agent presence').toBe(
      'nothing-recorded',
    )
    expect(reading.from).toBe('attachment-opened')
  })

  it('counts no request that arrived through a closed attachment', () => {
    const agentId = anAgent()
    const closed = aRunFor(agentId, 'the run that ended')
    aRequestFrom(closed, minutesBefore(1))
    t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(closed)
    attachments.closeAttachment(closed, {
      workspaceId: WORKSPACE,
      actor: AN_AGENT_PROCESS,
      because: 'The run ended and said so.',
      how: 'agent-said',
    })
    aRunFor(agentId, 'the run that came after')

    const reading = presence.presenceOf(agentId, WORKSPACE, NOW())
    expect(said(reading, 'request').answer, 'a closed attachment traffic is history, not presence').toBe(
      'nothing-recorded',
    )
  })
})

// ============================================================ the input that does not exist

describe('the strongest input exists now, and the reading says what it found', () => {
  it('reports nobody listening when no page is open for this agent, whatever else answered', () => {
    const agentId = anAgent()
    const attachmentId = aRunFor(agentId)
    aRequestFrom(attachmentId, minutesBefore(1))
    for (const reading of [presence.presenceOf(agentId, WORKSPACE, NOW()), presence.presenceOf(anAgent('bare'), WORKSPACE, NOW())]) {
      expect(said(reading, 'listen').answer).toBe('nothing-recorded')
      expect(said(reading, 'listen').at).toBeNull()
    }
  })

  it('says somebody looked and found nothing, which is not nobody having looked', () => {
    const agentId = anAgent()
    aRunFor(agentId)
    const reading = presence.presenceOf(agentId, WORKSPACE, NOW())
    expect(said(reading, 'listen').answer).toBe('nothing-recorded')
    expect(said(reading, 'request').answer).toBe('nothing-recorded')
    expect(said(reading, 'listen').says).toMatch(/found nothing/)
    // AND IT NAMES THE STREAM, so a reader is not left thinking there is nothing to listen with.
    expect(said(reading, 'listen').says).toContain('/api/events')
  })
})

// ============================================================ the threshold

describe('the stale threshold', () => {
  it('is carried in every reply with the sentence saying it is not yet measured', () => {
    const agentId = anAgent()
    for (const reading of [
      presence.presenceOf(agentId, WORKSPACE, NOW()),
      (aRunFor(agentId), presence.presenceOf(agentId, WORKSPACE, NOW())),
    ]) {
      expect(reading.staleAfterMinutes).toBe(15)
      expect(reading.thresholdIsUnmeasured).toBe(STALE_THRESHOLD_IS_UNMEASURED)
      expect(reading.thresholdIsUnmeasured).toContain('15')
    }
  })

  it('is drawn into the sentence a person reads for Online and for Stale', () => {
    const agentId = anAgent()
    aRunFor(agentId)
    expect(presence.presenceOf(agentId, WORKSPACE, NOW()).says).toContain('15')
    expect(presence.presenceOf(agentId, WORKSPACE, minutesLater(60)).says).toContain('15')
  })
})

// ============================================================ the two dimensions stay two

describe('presence names no work state and no work state names a presence', () => {
  it('hands back no string that is one of the five work-state words', () => {
    const agentId = anAgent()
    aRunFor(agentId)
    const reading = presence.presenceOf(agentId, WORKSPACE, NOW())
    const leaves: string[] = []
    const walk = (value: unknown): void => {
      if (typeof value === 'string') leaves.push(value)
      else if (Array.isArray(value)) value.forEach(walk)
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk)
    }
    walk(reading)
    for (const word of ['working', 'reporting', 'standing-by', 'blocked', 'finished']) {
      expect(leaves, `a presence reading handed back the work-state word ${word}`).not.toContain(word)
    }
  })
})

// ============================================================ what it refuses

describe('what the reading refuses rather than answering wrongly', () => {
  it('refuses an id that names nothing', () => {
    expect(() => presence.presenceOf('no-such-agent', WORKSPACE, NOW())).toThrow(/No agent has the id/)
  })

  it('refuses an attachment id, because presence is about an agent and a run is not one', () => {
    const agentId = anAgent()
    const attachmentId = aRunFor(agentId)
    expect(() => presence.presenceOf(attachmentId, WORKSPACE, NOW())).toThrow(/not a durable agent/)
  })

  it('refuses an agent that belongs to another project', () => {
    const agentId = anAgent()
    expect(() => presence.presenceOf(agentId, 'another-project', NOW())).toThrow(/is an agent in/)
  })
})
