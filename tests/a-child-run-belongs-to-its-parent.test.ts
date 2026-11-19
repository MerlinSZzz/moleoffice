// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old parent fixture closed with no submission. It is now explicitly historical so these attachment observations retain their original assertions; current worker finish refusal and seals are tested separately. */
/**
 * A CHILD RUN IS OBSERVED, KEPT UNDER ITS PARENT, AND NEVER PROMOTED INTO ANYTHING.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, IN SENTENCES A PERSON CAN CHECK
 * ---------------------------------------------------------------------------------------
 *
 *   1. A child records the attachment that started it, and that attachment is how it is reached.
 *      There is no children table and no count cached on the parent.
 *   2. **A child ends one of three ways and the row says which.** Its parent's word
 *      (`parent-said`), its provider's own event (`provider-event`), or Mole Office losing track of it
 *      (`went-stale`). Only the third hides a failure, and a close that could not tell them apart
 *      is what let a parent wait on a workflow that had already died.
 *   3. **A child is not a durable agent.** It cannot name one, it never appears in the attachments
 *      that hold an agent online, and it cannot move a work state.
 *   4. **A child is never a message recipient.** The picker does not offer one — dropped where the
 *      candidate list is built, so no resolver and no fuzzy match can reach one either.
 *   5. Nothing here decides when a child runs, gives one work, or restarts one. Mole Office observes a
 *      provider's subagents; it does not replace the provider's scheduler.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SWEEP TAKES A CLOCK
 * ---------------------------------------------------------------------------------------
 *
 * The threshold is fifteen minutes and a test that waited fifteen real minutes would never be run.
 * The sweep takes the moment to compare against, defaulting to the server's clock. Nothing about
 * that moment is stored: what is written is the server's own `nowStamp` for the close.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { ranAsIn } from '../src/shared/ran-as.ts'

/** The project one case works in, made afresh so its sweeps and lists see only its own children. */
let WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/**
 * THE RUN WRITES AS THE AGENT IT WORKS AS. The parent attachment runs as the lifecycle agent (its
 * ranAs), and a run may name as a child's parent only a session it has a part in, read the way the
 * finished-child line reads it (problem NlOyicZP_Jjt, check 2-sXnXxz1tf4). A caller with no part in
 * the lifecycle agent, as 'claude-code' was here, is refused.
 */
const A_RUN = { type: 'agent', id: 'lifecycle' } as const

let t: TestDb
let attachments: typeof import('../src/server/lib/attachments.ts')
let presence: typeof import('../src/server/lib/presence.ts')
let recipients: typeof import('../src/server/lib/recipients.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let caseNumber = 0

const minutesLater = (n: number): Date => new Date(Date.now() + n * 60_000)

beforeAll(async () => {
  t = await freshDb()
  attachments = await import('../src/server/lib/attachments.ts')
  presence = await import('../src/server/lib/presence.ts')
  recipients = await import('../src/server/lib/recipients.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `child-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: 'A made-up project for one child-run case' })
})

afterAll(() => {
  t.close()
})

function anAgent(): string {
  return t.api.createRecord({
    kind: 'agent',
    title: 'the lifecycle agent',
    workspaceId: WORKSPACE,
    data: { handle: 'lifecycle', state: 'active' },
    actor: PERSON,
  }).id
}

/** A top-level attachment working as a durable agent. */
function aParent(agentId: string, title = 'the parent run'): string {
  const id = attachments.openAttachment({ workspaceId: WORKSPACE, actor: A_RUN, title, agentId }).attachment.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  return id
}

/** A child run under that attachment. It names no agent, because it may not. */
function aChild(parentAttachment: string, title = 'the child run'): string {
  return attachments.openAttachment({ workspaceId: WORKSPACE, actor: A_RUN, title, parentAttachment }).attachment.id
}

// ============================================================ the relationship

describe('a child records the attachment that started it', () => {
  it('is reached through its parent, and the parent holds no count of its own', () => {
    const parent = aParent(anAgent())
    const first = aChild(parent, 'the first child')
    const second = aChild(parent, 'the second child')

    const children = attachments.childrenOf(parent, WORKSPACE)
    expect(children.map((one) => one.id).sort()).toEqual([first, second].sort())
    for (const child of children) expect(child.parentAttachment).toBe(parent)

    const parentRecord = t.api.getRecord(parent)
    expect(Object.keys(parentRecord?.data ?? {})).not.toContain('childCount')
    expect(Object.keys(parentRecord?.data ?? {})).not.toContain('children')
  })

  it('refuses a child under a parent that has already ended', () => {
    const parent = aParent(anAgent())
    attachments.closeAttachment(parent, {
      workspaceId: WORKSPACE,
      actor: A_RUN,
      how: 'agent-said',
      because: 'The stage it was for is finished.',
    })
    expect(() => aChild(parent)).toThrow(/cannot open under a parent that has already ended/)
  })
})

// ============================================================ not a durable agent

describe('a child is not a durable agent', () => {
  it('refuses to open a child that also names one, and says why', () => {
    const agentId = anAgent()
    const parent = aParent(agentId)
    expect(() =>
      attachments.openAttachment({
        workspaceId: WORKSPACE,
        actor: A_RUN,
        title: 'a child claiming an identity',
        parentAttachment: parent,
        agentId,
      }),
    ).toThrow(/does not name a durable agent of its own/)
  })

  it('does not hold the agent online by itself once the parent has closed', () => {
    const agentId = anAgent()
    const parent = aParent(agentId)
    aChild(parent)
    expect(presence.presenceOf(agentId, WORKSPACE).presence).toBe('online')

    attachments.closeAttachment(parent, {
      workspaceId: WORKSPACE,
      actor: A_RUN,
      how: 'agent-said',
      because: 'The parent finished its stage.',
    })
    // The child closed with it, and even had it not, a child names no agent and so is never one of
    // the attachments presence is read over.
    expect(presence.presenceOf(agentId, WORKSPACE).presence).toBe('offline')
  })

  it('carries no ranAs, so nothing can read one out of it', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    expect(ranAsIn(t.api.getRecord(child) ?? { data: {} }, WORKSPACE)).toBeNull()
  })
})

// ============================================================ never a recipient

describe('a child is never something a message may be addressed to', () => {
  it('is left out of the recipient candidates while its parent is offered', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    const answer = recipients.recipientsFor(null, WORKSPACE)
    const offered = [...answer.connected, ...answer.recent].map((one) => one.sessionId)
    expect(offered, 'the parent run is addressable').toContain(parent)
    expect(offered, 'a child run has no inbox and nobody responsible for reading it').not.toContain(child)
  })
})

// ============================================================ the three ways it ends

describe('a child ends one of three ways and the row says which', () => {
  it('closes with its parent, saying parent-said and naming the parent reason', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    const closed = attachments.closeAttachment(parent, {
      workspaceId: WORKSPACE,
      actor: A_RUN,
      how: 'agent-said',
      because: 'The stage it was for is finished.',
    })
    expect(closed.children.map((one) => one.id)).toEqual([child])
    const after = closed.children[0]
    expect(after?.closedHow).toBe('parent-said')
    expect(after?.closedBecause).toContain('The stage it was for is finished.')
    expect(closed.says, 'the close still says it touched no process').toMatch(/not.*(touch|kill)/i)
  })

  it('takes provider-event when whoever watched the provider says the child ended', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    const closed = attachments.closeAttachment(child, {
      workspaceId: WORKSPACE,
      actor: A_RUN,
      how: 'provider-event',
      because: 'The provider reported that this subagent finished and handed back its result.',
    })
    expect(closed.attachment.closedHow).toBe('provider-event')
    expect(attachments.openChildrenOf(parent, WORKSPACE)).toEqual([])
  })

  it('closes a child nobody has heard from as went-stale, which is not the same as ended', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    const swept = attachments.sweepQuietChildren({
      workspaceId: WORKSPACE,
      actor: PERSON,
      now: minutesLater(60),
    })
    expect(swept.closed.map((one) => one.attachment.id)).toEqual([child])
    expect(swept.closed[0]?.attachment.closedHow).toBe('went-stale')
    expect(swept.closed[0]?.attachment.closedBecause).toMatch(/stopped hearing from/)
    expect(swept.closed[0]?.attachment.closedBecause).toMatch(/was not observed/)
    expect(swept.note).toMatch(/No process was touched/)
  })

  it('leaves a child inside the threshold alone, and says how long it has been quiet', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    const swept = attachments.sweepQuietChildren({ workspaceId: WORKSPACE, actor: PERSON })
    expect(swept.closed).toEqual([])
    expect(swept.looked.map((one) => one.attachment.id)).toEqual([child])
    expect(swept.looked[0]?.closed).toBe(false)
    expect(swept.looked[0]?.says).toMatch(/inside the threshold/)
    expect(attachments.openChildrenOf(parent, WORKSPACE)).toHaveLength(1)
  })

  it('measures the silence from the last request when there was one, and says so', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    t.client.sqlite
      .prepare(
        'INSERT INTO api_calls (id, at_ms, ms, method, waits, status, session_id, identity_source) ' +
          'VALUES (?, ?, 1.0, ?, 0, 200, ?, ?)',
      )
      .run('a-call', Date.now(), 'GET', child, 'header')

    const insideTheThreshold = attachments.sweepQuietChildren({
      workspaceId: WORKSPACE,
      actor: PERSON,
      now: minutesLater(5),
    })
    expect(insideTheThreshold.closed).toEqual([])
    expect(insideTheThreshold.looked[0]?.from).toBe('request')

    const past = attachments.sweepQuietChildren({ workspaceId: WORKSPACE, actor: PERSON, now: minutesLater(60) })
    expect(past.closed).toHaveLength(1)
    expect(past.closed[0]?.from).toBe('request')
    expect(past.closed[0]?.attachment.closedBecause).toContain('the last request it sent')
  })

  it('sweeps children only: a quiet top-level attachment is left open and reads Stale instead', () => {
    const agentId = anAgent()
    const parent = aParent(agentId)
    const swept = attachments.sweepQuietChildren({ workspaceId: WORKSPACE, actor: PERSON, now: minutesLater(600) })
    expect(swept.closed, 'closing a top-level run would be the system deciding it had ended').toEqual([])

    const reading = presence.presenceOf(agentId, WORKSPACE, minutesLater(600))
    expect(reading.presence).toBe('stale')
    expect(attachments.listAttachments({ workspaceId: WORKSPACE, openOnly: true }).map((one) => one.id)).toEqual([
      parent,
    ])
  })

  it('sweeps nothing when there are no children, and says that rather than nothing', () => {
    aParent(anAgent())
    const swept = attachments.sweepQuietChildren({ workspaceId: WORKSPACE, actor: PERSON, now: minutesLater(600) })
    expect(swept.looked).toEqual([])
    expect(swept.note).toMatch(/nothing there, not nobody looked/)
  })
})

// ============================================================ what Mole Office does not do to a child

describe('Mole Office observes a provider subagents and schedules none of them', () => {
  it('offers nothing that starts, re-queues or restarts a child', () => {
    // The claim is about the library, so it is checked against the library rather than asserted.
    // A function that scheduled a child would have to be named here, and none is.
    const names = Object.keys(attachments).sort()
    for (const forbidden of ['startChild', 'runChild', 'requeue', 'retryChild', 'restart', 'schedule']) {
      expect(names.some((name) => name.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false)
    }
  })

  it('keeps an ended child in its parent history rather than tidying it away', () => {
    const parent = aParent(anAgent())
    const child = aChild(parent)
    attachments.closeAttachment(child, {
      workspaceId: WORKSPACE,
      actor: A_RUN,
      how: 'provider-event',
      because: 'The provider said this subagent finished.',
    })
    const history = attachments.childrenOf(parent, WORKSPACE)
    expect(history.map((one) => one.id)).toEqual([child])
    expect(history[0]?.open).toBe(false)
    expect(history[0]?.closedBecause).toBe('The provider said this subagent finished.')
  })
})
