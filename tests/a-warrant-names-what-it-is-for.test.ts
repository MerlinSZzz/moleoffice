// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WARRANT NAMES THE RECORDS IT IS FOR, AND THE PLACE IT CITES HAS TO BE THERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A warrant was bound to nothing. Verifier 6 sent one warrant on one fork, got a 200, sent the
 * identical JSON on a different and unrelated fork, and got a 200 again. Nothing tied a sentence to
 * the act it was written for, so one sentence an agent had ever been told was a standing key to
 * every governance act there is. The same run sent `where: "message:NOSUCHIDxxxx"` and that was
 * accepted too: the cited place was never looked up, so a fabricated citation was drawn on the
 * record page looking exactly like a real one. Problem `TrWSYI1XYOSu` has both reproductions.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHY BOTH HALVES ARE NEEDED
 * ---------------------------------------------------------------------------------------
 *
 * A file that only proved the refusals would pass with the door welded shut, so each refusal has
 * its acceptance beside it: a warrant that names this record goes through, a warrant naming two
 * records is carried once for each of the two, and a citation this installation really holds is
 * accepted. `design/messages/ACCEPTANCE.md` W1 is the contract.
 *
 * COUNTING IS DELIBERATELY NOT TESTED, BECAUSE IT IS DELIBERATELY NOT BUILT. A warrant is bound to
 * records and not spent by use: one naming three forks may be carried for each of the three, as
 * often as those three acts happen. The owner's sentence really does cover several forks, and the
 * honest way to say that is to name them.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'default'

const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}

/** What the owner said, and where and when. The owner’s sentence, kept as the owner wrote it. */
const THE_OWNERS_WORDS = {
  saidBy: THE_TEST_OFFICES_OWNER.id,
  words: '如果本身是工程中间的问题，agent应当可以决策',
  where: 'terminal',
  when: '2026-09-03 09:14',
} as const

/** A whole warrant: the owner’s words, and the records those words cover. */
function about(...ids: string[]): Record<string, unknown> {
  return { ...THE_OWNERS_WORDS, for: ids }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A WARRANT ON A PROPOSAL IS SPENT BY THE SECRETARY since the owner decided so on 15 September
  // 2026. So the agent carrying the owner’s words holds that card.
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'claude-code', name: 'Claude Code', role: 'secretary' },
  })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================================ fixtures

/** A fork the person filed and reserved for themselves, so settling it is a governance act. */
function theOwnersFork(question: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'proposal',
    title: `Fork · ${question}`,
    data: { question, options: ['a — one way', 'b — the other'], who_settles_it: 'the owner' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

/** A problem the person was asked about, so closing it is a governance act. */
function askedOfTheOwner(symptom: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'problem',
    title: `Whose move · ${symptom}`,
    data: { whose_move: 'person', symptom },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; error: string }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_AGENT, payload })
  const body = res.json() as { error?: string }
  return { status: res.statusCode, error: body.error ?? '' }
}

/** What the record holds now, straight out of the database rather than out of a reply. */
function stored(id: string): Record<string, unknown> {
  return (t.api.getRecord(id) as { data: Record<string, unknown> }).data
}

// ============================================================================ 1. what it is for

describe('a warrant is for named records and for nothing else', () => {
  it('refuses on a record the warrant does not name, and nothing is written', async () => {
    const named = theOwnersFork('Does an orphaned session count as over?')
    const other = theOwnersFork('May Mole Office start processes on this machine?')

    // The same act on the record the owner’s words name goes through.
    expect((await patch(named, { dataPatch: { who_settles_it: 'an agent' }, warrant: about(named) })).status).toBe(200)

    // The identical warrant, replayed on a fork it never mentioned, does not.
    const replayed = await patch(other, { dataPatch: { who_settles_it: 'an agent' }, warrant: about(named) })
    expect(replayed.status).toBe(403)
    expect(replayed.error).toContain('which it does not name')
    expect(replayed.error).toContain(named)
    expect(stored(other)['who_settles_it'], 'the replayed warrant moved a fork it never named').toBe('the owner')
  })

  it('carries one sentence once for each record it names', async () => {
    const first = theOwnersFork('Does an orphaned session count as over?')
    const second = theOwnersFork('May Mole Office start processes on this machine?')
    const both = about(first, second)

    expect((await patch(first, { dataPatch: { who_settles_it: 'an agent' }, warrant: both })).status).toBe(200)
    expect((await patch(second, { dataPatch: { who_settles_it: 'an agent' }, warrant: both })).status).toBe(200)
    expect(stored(first)['who_settles_it']).toBe('an agent')
    expect(stored(second)['who_settles_it']).toBe('an agent')
  })

  it('refuses a warrant that names no record at all', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')

    const none = await patch(id, { dataPatch: { state: 'accepted' }, warrant: about() })
    expect(none.status).toBe(403)
    expect(none.error).toContain('`for` is an empty list')

    const absent = await patch(id, { dataPatch: { state: 'accepted' }, warrant: { ...THE_OWNERS_WORDS } })
    expect(absent.status).toBe(403)
    expect(absent.error).toContain('has to be a list of record ids')

    expect(stored(id)['state'], 'a warrant naming nothing closed a record').toBeUndefined()
  })

  it('refuses a `for` that is not a list of ids', async () => {
    const id = askedOfTheOwner('the wrist camera drops a frame')
    const aString = await patch(id, { dataPatch: { state: 'accepted' }, warrant: { ...THE_OWNERS_WORDS, for: id } })
    expect(aString.status).toBe(403)
    expect(aString.error).toContain('has to be a list of record ids')
    expect(stored(id)['state']).toBeUndefined()
  })

  it('names the fork and not the decision when a promotion is the act', async () => {
    const fork = theOwnersFork('May Mole Office start processes on this machine?')
    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${fork}/promote`,
      headers: AS_AGENT,
      payload: {
        title: 'Mole Office may start processes on this machine',
        data: { because: 'The owner said so in the terminal on 3 September.' },
        warrant: about(fork),
      },
    })
    expect(res.statusCode, res.body).toBe(201)
  })
})

// ============================================================================ 2. where the owner said it

describe('a warrant that cites a message or a comment cites one Mole Office holds', () => {
  /**
   * A message this installation really holds, so a reader could go and read it.
   *
   * IT NAMES WHO IT IS TO, because since 4 September 2026 a message that names nobody and points at
   * nothing is refused rather than stored as addressed to the owner. What this file needs of it is
   * that the message exists and that the owner wrote it, and both still hold.
   */
  function aMessage(body: string): string {
    return t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'message',
      title: 'A message the owner wrote',
      data: { body, to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id
  }

  /** A comment this installation really holds. A comment is filed as an `annotation`. */
  function aComment(body: string, on: string): string {
    return t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'annotation',
      title: 'A comment the owner left',
      data: { body, context: { target: { kind: 'record', recordId: on, workspaceId: PROJECT } } },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id
  }

  it('refuses a message id nothing holds, because a citation that leads nowhere looks like evidence', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    const refused = await patch(id, {
      dataPatch: { state: 'accepted' },
      warrant: { ...about(id), where: 'message:NOSUCHIDxxxx' },
    })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('which Mole Office does not hold')
    expect(stored(id)['state'], 'a fabricated citation closed a record').toBeUndefined()
  })

  it('accepts a message it does hold', async () => {
    const id = askedOfTheOwner('the wrist camera drops a frame')
    const said = aMessage('如果本身是工程中间的问题，agent应当可以决策')
    const done = await patch(id, {
      dataPatch: { state: 'accepted' },
      warrant: { ...about(id), where: `message:${said}` },
    })
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['state']).toBe('accepted')
  })

  it('refuses a comment id nothing holds and accepts one it does', async () => {
    const first = askedOfTheOwner('the belt slips under load')
    const second = askedOfTheOwner('the belt slips when it is cold')

    const refused = await patch(first, {
      dataPatch: { state: 'accepted' },
      warrant: { ...about(first), where: 'comment:NOSUCHIDxxxx' },
    })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('which Mole Office does not hold')
    expect(stored(first)['state']).toBeUndefined()

    const remark = aComment('这个我看过了，可以close', second)
    const done = await patch(second, {
      dataPatch: { state: 'accepted' },
      warrant: { ...about(second), where: `comment:${remark}` },
    })
    expect(done.status, done.error).toBe(200)
    expect(stored(second)['state']).toBe('accepted')
  })

  it('looks nothing up for the two places that name no row', async () => {
    const inTheTerminal = askedOfTheOwner('the gantry stalls at the far end')
    const inTheProduct = askedOfTheOwner('the gantry stalls when it is cold')

    expect(
      (await patch(inTheTerminal, { dataPatch: { state: 'accepted' }, warrant: about(inTheTerminal) })).status,
    ).toBe(200)
    expect(
      (
        await patch(inTheProduct, {
          dataPatch: { state: 'accepted' },
          warrant: { ...about(inTheProduct), where: 'ui' },
        })
      ).status,
    ).toBe(200)
  })

  it('refuses a message whose record has been deleted, because nobody can open it', async () => {
    const id = askedOfTheOwner('the feeder jams on the second pass')
    const said = aMessage('close it')
    t.api.deleteRecord(said, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true })
    const refused = await patch(id, {
      dataPatch: { state: 'accepted' },
      warrant: { ...about(id), where: `message:${said}` },
    })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('which Mole Office does not hold')
    expect(stored(id)['state']).toBeUndefined()
  })
})
