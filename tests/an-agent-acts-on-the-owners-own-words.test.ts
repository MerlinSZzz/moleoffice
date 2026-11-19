// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY ACT ON THE OWNER'S OWN QUOTED WORDS, AND THE OWNER CAN TAKE IT BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Every governance write was refused to an agent outright. The refusals were right about one thing —
 * without the owner's words, nothing should move — and wrong about the other: with the owner's words, nothing could.
 * Measured on 3 September 2026 in report `qXwaBut1miSu`: 66 rows on the owner's list that only the owner's hand
 * could shorten, and an acceptance said in chat that no record could carry.
 *
 * So a yes said in the terminal is kept as words and may then authorise an acceptance, rather than never.
 * `design/messages/ACCEPTANCE.md` W1 to W5 is the contract this file is written against.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HALVES, AND NEITHER IS A TEST ON ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * A file that only proved the refusals would pass with the door welded shut. A file that only proved
 * the acceptances would pass with the door taken off. Both are here for every act, side by side, and
 * the refusal half asserts the sentence WORD FOR WORD rather than the status code — because the
 * whole promise of W1 is that a request with no warrant meets exactly what it met before.
 *
 * AND THE THIRD HALF, WHICH IS THE ONE THIS MECHANISM COULD MOST EASILY GET WRONG: a warrant that is
 * empty, dated in the future, or in a name Mole Office cannot place, is not a warrant. Each of those
 * would let an agent write itself the authority the whole design exists to stop it writing.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { ON_THE_OWNERS_WORDS } from '../src/shared/warrant.ts'
import type { ActOnTheirWords } from '../src/server/lib/warrants.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'default'

const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const AS_ANOTHER_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-other',
  'x-mole-office-workspace': PROJECT,
}
const AS_PERSON: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

/** What the owner said, and where and when. The words are theirs, kept as the owner wrote them. */
const THE_OWNERS_WORDS = {
  saidBy: THE_TEST_OFFICES_OWNER.id,
  words: 'POINTING我认为可以accept了',
  where: 'terminal',
  when: '2026-09-03 09:14',
} as const

/**
 * A whole warrant: what the owner said, and which records those words cover.
 *
 * `for` is the half added on 3 September 2026 after Verifier 6 replayed one warrant on two unrelated
 * forks. A warrant that names no record is refused, so every warrant in this file names the record
 * its act is on.
 */
function about(...ids: string[]): Record<string, unknown> {
  return { ...THE_OWNERS_WORDS, for: ids }
}

/**
 * A BROWSER-SHAPED GLOBAL, for the one test that renders the panel a person reads.
 *
 * `src/web/components/ui.tsx` reads which project the browser is looking at when it loads, and that
 * reading is a browser fact. Standing one up here is what lets a node test ask what the panel DRAWS
 * rather than only what the API answers — which is the half of W2 an API assertion cannot prove.
 * The same stand-in the fold-is-not-a-wall test used, for the same reason.
 */
function aBrowserShapedGlobal(): void {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

// ONE OFFICE FOR THE FILE. Every case below files its own records, so no case reads what another
// case wrote; only the server, its database and the card this file acts under are shared.
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE CARD THE SETTLING ACTS ASK FOR. One of the owner's decisions set it. Since then,
  // a warrant on a proposal is spent by the secretary and by nobody else. This file is about the
  // warrant mechanism, so the agent carrying them holds that card.
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_PERSON,
    payload: { handle: 'claude-code', name: 'Claude Code', role: 'secretary' },
  })
  aBrowserShapedGlobal()
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================================ fixtures

/** A problem the PERSON asked on, so the ask is the owner's and not the caller's own. */
function askedOfTheOwner(symptom: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'problem',
    title: `Whose move · ${symptom}`,
    data: { whose_move: 'person', symptom },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

/** A fork the PERSON filed and reserved for the owner. */
function theOwnersFork(question: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'proposal',
    title: `Fork · ${question}`,
    data: { question, options: ['a — one way', 'b — the other'], who_settles_it: 'the owner' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = AS_AGENT,
): Promise<{ status: number; error: string; body: unknown }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  const body = res.json() as { error?: string }
  return { status: res.statusCode, error: body.error ?? '', body }
}

async function promote(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = AS_AGENT,
): Promise<{ status: number; error: string; body: unknown }> {
  const res = await app.inject({ method: 'POST', url: `/api/records/${id}/promote`, headers, payload })
  const body = res.json() as { error?: string }
  return { status: res.statusCode, error: body.error ?? '', body }
}

async function read(id: string): Promise<{ onThePersonsWords: ActOnTheirWords[]; record: { data: Record<string, unknown> } }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as { onThePersonsWords: ActOnTheirWords[]; record: { data: Record<string, unknown> } }
}

/** What the record holds now, straight out of the database rather than out of a reply. */
function stored(id: string): Record<string, unknown> {
  return (t.api.getRecord(id) as { data: Record<string, unknown> }).data
}

// ============================================================================ 1. without a warrant

describe('without a warrant every refusal stands, in the words it always stood in', () => {
  it('refuses closing a record the person was asked about, and nothing is written', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    const refused = await patch(id, { dataPatch: { state: 'accepted' } })
    expect(refused.status).toBe(403)
    // WORD FOR WORD, AND NOT A STATUS CODE. W1's promise is that a request with no warrant meets
    // exactly what it met before this mechanism existed.
    expect(refused.error).toContain('answers the question for them')
    expect(refused.error).toContain('and this request came from agent "claude-code"')
    expect(refused.error).toContain('Nothing was written')
    expect(stored(id)['state']).toBeUndefined()
  })

  it('refuses clearing a question somebody else asked, and nothing is written', async () => {
    const id = askedOfTheOwner('the wrist camera drops a frame')
    const refused = await patch(id, { dataPatch: { whose_move: null } })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain("takes it out of the person's queue")
    expect(stored(id)['whose_move']).toBe('person')
  })

  it('refuses moving a fork away from the owner, and nothing is written', async () => {
    const id = theOwnersFork('Does an orphaned session count as over?')
    const refused = await patch(id, { dataPatch: { who_settles_it: 'an agent' } })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('This fork says "the owner" may settle it')
    expect(refused.error).toContain('That is the same act as settling it')
    expect(stored(id)['who_settles_it']).toBe('the owner')
  })

  it('refuses promoting a fork, and no decision is filed', async () => {
    const id = theOwnersFork('May Mole Office start processes on this machine?')
    const before = t.api.listRecords({ workspaceId: PROJECT, kind: 'decision' }).length
    const refused = await promote(id, { title: 'Yes, it may', data: { because: 'the owner said so' } })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('Only the human may promote a proposal into a decision')
    expect(t.api.listRecords({ workspaceId: PROJECT, kind: 'decision' }).length, 'a refused promotion filed a decision').toBe(before)
  })
})

// ============================================================================ 2. with one

describe('with the person’s own words the same acts go through', () => {
  it('closes a record the owner was asked about', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    const done = await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['state']).toBe('accepted')
  })

  it('clears a question another agent asked', async () => {
    const id = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'problem',
      title: 'Whose move · a question another agent asked the owner',
      data: { whose_move: 'person', symptom: 'a question another agent asked the owner' },
      actor: { type: 'agent', id: 'claude-other' },
    }).id
    const done = await patch(id, { dataPatch: { whose_move: null }, warrant: about(id) })
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['whose_move']).toBeUndefined()
  })

  it('moves a fork away from the owner', async () => {
    const id = theOwnersFork('Does an orphaned session count as over?')
    const done = await patch(id, { dataPatch: { who_settles_it: 'an agent' }, warrant: about(id) })
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['who_settles_it']).toBe('an agent')
  })

  it('promotes a fork, files the decision and marks the fork settled', async () => {
    const id = theOwnersFork('May Mole Office start processes on this machine?')
    const done = await promote(id, {
      title: 'Mole Office may start processes on this machine',
      data: { because: 'The owner said yes in the terminal on 3 September.' },
      warrant: about(id),
    })
    expect(done.status, done.error).toBe(201)
    const back = await read(id)
    expect(back.onThePersonsWords.length).toBe(1)
    expect(back.onThePersonsWords[0]?.warrant.words).toBe(THE_OWNERS_WORDS.words)
  })

  /**
   * THE HEADER IS REFUSED, AND THE BODY IS THE ONLY DOOR.
   *
   * `x-mole-office-warrant` carried the warrant until 3 September 2026 and could not carry the owner's
   * own words: a header value holds bytes 0 to 255, the owner's sentences are in Chinese, and the request
   * failed in the CLIENT with a ByteString error before Mole Office saw it. Problem `jeEKPrQg-g-K`.
   * Both routes that take a warrant have a body, so the header went rather than gaining an encoding.
   */
  it('refuses the header the warrant used to travel in, and says where it goes now', async () => {
    const id = askedOfTheOwner('a problem closed through the header door')
    const refused = await patch(
      id,
      { dataPatch: { state: 'accepted' } },
      { ...AS_AGENT, 'x-mole-office-warrant': JSON.stringify(about(id)) },
    )
    expect(refused.status).toBe(400)
    expect(refused.error).toContain('no longer reads it')
    expect(refused.error).toContain('as a field of the body')
    expect(refused.error).toContain('bytes 0 to 255')
    expect(stored(id)['state'], 'the header door is still open').toBeUndefined()
  })

  it('refuses the header even beside a warrant in the body, rather than reading one of the two', async () => {
    const id = askedOfTheOwner('a problem with two warrants on one request')
    const refused = await patch(
      id,
      { dataPatch: { state: 'accepted' }, warrant: about(id) },
      { ...AS_AGENT, 'x-mole-office-warrant': JSON.stringify(about(id)) },
    )
    expect(refused.status).toBe(400)
    expect(refused.error).toContain('no longer reads it')
    expect(stored(id)['state']).toBeUndefined()
  })

  /**
   * THE OWNER'S OWN WORDS, THROUGH THE DOOR THAT IS LEFT. The case the header could not serve at all: the
   * Chinese sentence goes through in the body, byte for byte, and comes back out of the ledger the
   * same.
   */
  it('carries the owner’s Chinese sentence in the body and stores it byte for byte', async () => {
    const id = askedOfTheOwner('a problem closed on the owner’s own sentence')
    const done = await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })
    expect(done.status, done.error).toBe(200)
    const back = await read(id)
    expect(back.onThePersonsWords[0]?.warrant.words).toBe('POINTING我认为可以accept了')
  })
})

// ============================================================================ 3. what is not a warrant

describe('three things that look like a warrant and are not', () => {
  it('refuses empty words, because there would be nothing to show the owner', async () => {
    const id = askedOfTheOwner('a problem with an empty warrant')
    const refused = await patch(id, { dataPatch: { state: 'accepted' }, warrant: { ...about(id), words: '   ' } })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('carries none')
    expect(stored(id)['state']).toBeUndefined()
  })

  it('refuses a time in the future, because words not yet said cannot be acted on', async () => {
    const id = askedOfTheOwner('a problem with a warrant from next year')
    const refused = await patch(id, {
      dataPatch: { state: 'accepted' },
      warrant: { ...about(id), when: '2099-01-01 00:00' },
    })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('later than now')
    expect(stored(id)['state']).toBeUndefined()
  })

  it('refuses a name Mole Office cannot place', async () => {
    const id = askedOfTheOwner('a problem with a warrant in a stranger’s name')
    const refused = await patch(id, {
      dataPatch: { state: 'accepted' },
      warrant: { ...about(id), saidBy: 'somebody-else' },
    })
    expect(refused.status).toBe(403)
    expect(refused.error).toContain('not somebody Mole Office can place')
    expect(stored(id)['state']).toBeUndefined()
  })

  it('refuses a place nobody has heard of, and a key that is not one of the four', async () => {
    const id = askedOfTheOwner('a problem with a warrant from nowhere')
    const nowhere = await patch(id, { dataPatch: { state: 'accepted' }, warrant: { ...about(id), where: 'the pub' } })
    expect(nowhere.status).toBe(403)
    expect(nowhere.error).toContain('not one of the places Mole Office knows')
    const misspelt = await patch(id, {
      dataPatch: { state: 'accepted' },
      warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, wordss: 'the owner said yes', where: 'terminal', when: '2026-09-03 09:14', for: [id] },
    })
    expect(misspelt.status).toBe(403)
    expect(misspelt.error).toContain('wordss')
    expect(stored(id)['state']).toBeUndefined()
  })
})

// ============================================================================ 4. the act shows the words

describe('the act shows the words, and the record page draws them', () => {
  it('serves the words, who said them, where, when, and what the write did', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    expect((await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })).status).toBe(200)
    const back = await read(id)
    const act = back.onThePersonsWords[0]
    expect(act?.warrant).toEqual(about(id))
    expect(act?.actorType).toBe('agent')
    expect(act?.actorId).toBe('claude-code')
    expect(act?.said).toContain("did this on the person's words")
    expect(act?.said).toContain('in a terminal conversation')
    expect(act?.said).toContain(THE_OWNERS_WORDS.when)
    // WHAT THE WRITE DID, named from the ledger rather than from the request, so it is what was
    // stored and not what was asked for.
    expect(act?.what).toContain('state: nothing to accepted')
    expect(act?.revoked).toBeNull()
  })

  it('draws the owner’s words whole on the record page, with the press that takes the act back', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    expect((await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })).status).toBe(200)
    const back = await read(id)
    const panel = await import('../src/web/components/OnYourWords.tsx')
    const html = renderToStaticMarkup(
      h(panel.ActsOnYourWords, { acts: back.onThePersonsWords, onRevoke: async () => undefined }),
    )
    expect(html, 'the owner’s own sentence is not on the page').toContain(THE_OWNERS_WORDS.words)
    expect(html, 'the words are not marked as somebody’s own words').toContain('px-owner-words')
    expect(html).toContain('Revoke')
  })

  it('says the same four words on the forks desk and on the waiting list', async () => {
    const id = theOwnersFork('Does an orphaned session count as over?')
    expect((await patch(id, { dataPatch: { who_settles_it: 'an agent' }, warrant: about(id) })).status).toBe(200)
    const forks = await app.inject({ method: 'GET', url: '/api/forks', headers: AS_PERSON })
    const open = (forks.json() as { forks: { recordId: string; onThePersonsWords: ActOnTheirWords | null }[] }).forks
    const row = open.find((one) => one.recordId === id)
    expect(row?.onThePersonsWords?.warrant.words, 'the desk row does not carry the owner’s words').toBe(THE_OWNERS_WORDS.words)
    // The four words are written once and both surfaces draw them from there.
    expect(ON_THE_OWNERS_WORDS).toBe("On the person's words")
  })
})

// ============================================================================ 5. one press undoes it

describe('one press undoes the act and keeps the whole trail', () => {
  it('puts a closed record back to what it held, and says who revoked it', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    expect((await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })).status).toBe(200)
    const act = (await read(id)).onThePersonsWords[0]
    expect(act).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/${String(act?.seq ?? 0)}/revoke`,
      headers: AS_PERSON,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(stored(id)['state'], 'the state was not put back').toBeUndefined()

    const after = await read(id)
    const same = after.onThePersonsWords.find((one) => one.seq === act?.seq)
    expect(same, 'the act was deleted rather than marked').toBeDefined()
    expect(same?.warrant.words, 'the owner’s words were removed with the act').toBe(THE_OWNERS_WORDS.words)
    expect(same?.revoked?.actorId).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(same?.revoked?.said).toContain(`person "${THE_TEST_OFFICES_OWNER.id}" revoked this on`)
  })

  it('retracts the decision a promotion filed, so the fork is open again', async () => {
    const id = theOwnersFork('May Mole Office start processes on this machine?')
    expect(
      (
        await promote(id, {
          title: 'Mole Office may start processes on this machine',
          data: { because: 'The owner said yes in the terminal.' },
          warrant: about(id),
        })
      ).status,
    ).toBe(201)
    const act = (await read(id)).onThePersonsWords[0]
    expect(act).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${act?.recordId ?? ''}/revisions/${String(act?.seq ?? 0)}/revoke`,
      headers: AS_PERSON,
    })
    expect(res.statusCode, res.body).toBe(200)

    const record = t.api.getRecord(id)
    expect(record).not.toBeNull()
    expect(t.api.proposalResolution(record as never)?.resolved, 'the fork is still settled').toBe(false)
    // THE DECISION IS KEPT, WITH EVERY WORD WRITTEN IN THE OWNER'S NAME. It is soft-deleted, not gone.
    const decision = t.api.getRecord(act?.recordId ?? '') as { deletedAt: string | null; title: string }
    expect(decision.deletedAt).not.toBeNull()
    expect(decision.title).toBe('Mole Office may start processes on this machine')
  })

  it('puts a fork’s classification back', async () => {
    const id = theOwnersFork('Does an orphaned session count as over?')
    expect((await patch(id, { dataPatch: { who_settles_it: 'an agent' }, warrant: about(id) })).status).toBe(200)
    const act = (await read(id)).onThePersonsWords[0]
    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/${String(act?.seq ?? 0)}/revoke`,
      headers: AS_PERSON,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(stored(id)['who_settles_it']).toBe('the owner')
  })

  it('is the person’s press and no agent’s, and it is pressed once', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    expect((await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })).status).toBe(200)
    const act = (await read(id)).onThePersonsWords[0]
    const url = `/api/records/${id}/revisions/${String(act?.seq ?? 0)}/revoke`

    const byAnAgent = await app.inject({ method: 'POST', url, headers: AS_AGENT })
    expect(byAnAgent.statusCode).toBe(403)
    // THE REFUSAL IS A SECRETARY'S NOW, because `claude-code` holds that card in this file so it can
    // settle on a warrant. The role gate gets there first and says the same thing in its own words:
    // the act is one of the person's own, and the card that could carry it is named.
    expect((byAnAgent.json() as { error: string }).error).toContain("one of the person's own")
    expect(stored(id)['state'], 'an agent revoked its own act').toBe('accepted')

    expect((await app.inject({ method: 'POST', url, headers: AS_PERSON })).statusCode).toBe(200)
    const again = await app.inject({ method: 'POST', url, headers: AS_PERSON })
    expect(again.statusCode).toBe(409)
    expect((again.json() as { error: string }).error).toContain('already revoked')
  })

  it('stops saying "on the owner’s words" on a list row once the owner has taken the act back', async () => {
    const id = theOwnersFork('Does an orphaned session count as over?')
    expect((await patch(id, { dataPatch: { who_settles_it: 'an agent' }, warrant: about(id) })).status).toBe(200)
    const before = await app.inject({ method: 'GET', url: '/api/forks', headers: AS_PERSON })
    const rowsBefore = (before.json() as { forks: { recordId: string; onThePersonsWords: ActOnTheirWords | null }[] }).forks
    expect(rowsBefore.find((one) => one.recordId === id)?.onThePersonsWords).not.toBeNull()

    const act = (await read(id)).onThePersonsWords[0]
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/records/${id}/revisions/${String(act?.seq ?? 0)}/revoke`,
          headers: AS_PERSON,
        })
      ).statusCode,
    ).toBe(200)

    const after = await app.inject({ method: 'GET', url: '/api/forks', headers: AS_PERSON })
    const rowsAfter = (after.json() as { forks: { recordId: string; onThePersonsWords: ActOnTheirWords | null }[] }).forks
    expect(
      rowsAfter.find((one) => one.recordId === id)?.onThePersonsWords,
      'a row still says it stands on the owner’s words after the owner took it back',
    ).toBeNull()
  })

  it('refuses to revoke an ordinary write, which stands on nobody’s words', async () => {
    const id = askedOfTheOwner('an ordinary edit')
    expect((await patch(id, { summary: 'an ordinary edit' }, AS_PERSON)).status).toBe(200)
    const res = await app.inject({ method: 'POST', url: `/api/records/${id}/revisions/2/revoke`, headers: AS_PERSON })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toContain('was an ordinary write')
  })
})

// ============================================================================ 6. what filing says

describe('what an agent filing a fork or a problem says by default', () => {
  it('files a fork as an agent’s, and a problem as an agent’s move', async () => {
    const fork = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'proposal', title: 'Which timeout on the gripper poll?', data: { question: 'a or b?', options: ['a', 'b'] } },
    })
    expect(fork.statusCode, fork.body).toBe(201)
    const forkId = (fork.json() as { record: { id: string } }).record.id
    expect(stored(forkId)['who_settles_it']).toBe('an agent')

    const problem = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'problem', title: 'The poll times out at 200ms', data: { symptom: 'it times out' } },
    })
    expect(problem.statusCode, problem.body).toBe(201)
    const problemId = (problem.json() as { record: { id: string } }).record.id
    expect(stored(problemId)['whose_move']).toBe('agent')
  })

  it('leaves the agent’s own choice alone, in both directions', async () => {
    const theirs = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'proposal',
        title: 'May Mole Office publish to a public repository?',
        data: { question: 'may it?', options: ['a', 'b'], who_settles_it: 'the owner' },
      },
    })
    expect(theirs.statusCode, theirs.body).toBe(201)
    expect(stored((theirs.json() as { record: { id: string } }).record.id)['who_settles_it']).toBe('the owner')

    const asked = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'problem', title: 'The arm needs a new fuse', data: { symptom: 'it is blown', whose_move: 'person' } },
    })
    expect(asked.statusCode, asked.body).toBe(201)
    expect(stored((asked.json() as { record: { id: string } }).record.id)['whose_move']).toBe('person')
  })

  it('keeps what the owner reads consistent with them: a fork an agent files is not on the owner’s list', async () => {
    // W3'S SECOND HALF, AND THE REASON THE DEFAULT EXISTS AT ALL. The owner's list had 43 forks on it and
    // most were engineering choices that reached the owner because nobody said whose they were.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'proposal', title: 'Which timeout on the gripper poll?', data: { question: 'a or b?', options: ['a', 'b'] } },
    })
    const forkId = (filed.json() as { record: { id: string } }).record.id
    const list = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_PERSON })
    const items = (list.json() as { items: { id: string }[] }).items
    expect(items.map((one) => one.id), 'a fork an agent filed as its own is on the owner’s list').not.toContain(forkId)
  })

  it('says nothing for a person filing the same two, so an unclassified fork is still reachable', async () => {
    const fork = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_PERSON,
      payload: { kind: 'proposal', title: 'A fork the owner filed themselves', data: { question: 'a or b?', options: ['a', 'b'] } },
    })
    expect(fork.statusCode, fork.body).toBe(201)
    expect(stored((fork.json() as { record: { id: string } }).record.id)['who_settles_it']).toBeUndefined()
  })

  it('lets an agent change its own classification without a warrant, and another agent’s only with one', async () => {
    const mine = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'proposal',
        title: 'A fork this agent handed up itself',
        data: { question: 'a or b?', options: ['a', 'b'], who_settles_it: 'the owner' },
      },
    })
    const mineId = (mine.json() as { record: { id: string } }).record.id
    // ITS OWN EARLIER CLASSIFICATION, changed with no warrant at all.
    expect((await patch(mineId, { dataPatch: { who_settles_it: 'an agent' } })).status).toBe(200)

    // ANOTHER AGENT'S, refused without one and allowed with one.
    const theirs = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_ANOTHER_AGENT,
      payload: {
        kind: 'proposal',
        title: 'A fork another agent handed up',
        data: { question: 'a or b?', options: ['a', 'b'], who_settles_it: 'the owner' },
      },
    })
    const theirsId = (theirs.json() as { record: { id: string } }).record.id
    const refused = await patch(theirsId, { dataPatch: { who_settles_it: 'an agent' } })
    expect(refused.status).toBe(403)
    expect(stored(theirsId)['who_settles_it']).toBe('the owner')
    expect((await patch(theirsId, { dataPatch: { who_settles_it: 'an agent' }, warrant: about(theirsId) })).status).toBe(200)
  })
})

// ============================================================================ 7. the person, and nobody's words

describe('a person’s own write needs no warrant and is never marked', () => {
  it('closes what the owner was asked about with no warrant, and the act draws no mark', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    expect((await patch(id, { dataPatch: { state: 'accepted' } }, AS_PERSON)).status).toBe(200)
    expect(stored(id)['state']).toBe('accepted')
    expect((await read(id)).onThePersonsWords, 'a person’s own act was marked as made on somebody’s words').toEqual([])
  })

  it('refuses a warrant on the owner’s own request, so the mark can only ever mean one thing', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    const refused = await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) }, AS_PERSON)
    expect(refused.status).toBe(400)
    expect(refused.error).toContain('came from a person')
    expect(stored(id)['state']).toBeUndefined()
  })

  it('never fills a warrant in for a caller that sent none', async () => {
    // AN ORDINARY EDIT AN AGENT IS ALREADY ALLOWED. It goes through, exactly as before, and nothing
    // in either ledger claims it was made on anybody's words — because nobody said anything.
    const id = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'problem',
      title: 'An ordinary problem nobody was asked about',
      data: { symptom: 'it is slow', whose_move: 'agent' },
      actor: { type: 'agent', id: 'claude-code' },
    }).id
    expect((await patch(id, { summary: 'measured at 400ms' })).status).toBe(200)
    expect((await read(id)).onThePersonsWords).toEqual([])
    expect(warrantsInTheLedgers(id)).toEqual([])
  })

  it('stores nothing when a warrant is sent with a write that needed none', async () => {
    // A WARRANT THAT OPENED NO DOOR IS NOT A CLAIM ABOUT THE OWNER. The edit is allowed either way, so
    // writing the owner's words into the ledger here would mark an ordinary edit "on the owner's words".
    const id = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'problem',
      title: 'An ordinary problem nobody was asked about',
      data: { symptom: 'it is slow', whose_move: 'agent' },
      actor: { type: 'agent', id: 'claude-code' },
    }).id
    expect((await patch(id, { summary: 'measured at 400ms', warrant: about(id) })).status).toBe(200)
    expect((await read(id)).onThePersonsWords).toEqual([])
    expect(warrantsInTheLedgers(id)).toEqual([])
  })
})

/**
 * Every warrant either ledger holds, read straight out of the tables. Given a record id, only that
 * record's rows: with one database for the file, "this write filled nothing in" is a question about
 * the record the write touched, not about every record another case wrote.
 */
function warrantsInTheLedgers(recordId?: string): string[] {
  const sql =
    'SELECT warrant FROM revisions WHERE warrant IS NOT NULL UNION ALL SELECT warrant FROM changes WHERE warrant IS NOT NULL'
  const rows = (recordId === undefined
    ? t.client.sqlite.prepare(sql).all()
    : t.client.sqlite
        .prepare(
          'SELECT warrant FROM revisions WHERE warrant IS NOT NULL AND record_id = ? UNION ALL ' +
            'SELECT warrant FROM changes WHERE warrant IS NOT NULL AND record_id = ?',
        )
        .all(recordId, recordId)) as { warrant: string }[]
  return rows.map((row) => row.warrant)
}

// ============================================================================ 8. the ledgers

describe('both ledgers carry the words, and they carry the same ones', () => {
  it('writes the warrant onto the revision and onto every change row of the same write', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    expect((await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })).status).toBe(200)
    const held = warrantsInTheLedgers(id)
    expect(held.length, 'one ledger carried the words and the other did not').toBeGreaterThan(1)
    for (const one of held) expect(JSON.parse(one)).toEqual(about(id))
  })
})

// ============================================================================ 9. the version history

/**
 * THE TRAIL IS READ WHERE THE LEDGER IS READ.
 *
 * `revisions.warrant` was filled and `GET /api/records/:id/revisions` did not serve it: its rows
 * carried `seq, op, who, at, changed, contentHash, note` and nothing about whose words the write
 * stood on. So the record page drew the act and the version history — the place a person goes to
 * read what happened to a record — said only that an agent had written it. Verifier 6 found it on
 * 3 September 2026. W2 asks that every surface saying who did something says it was done on the owner's
 * words.
 */
describe('the version history serves the words beside who wrote it', () => {
  interface Entry {
    seq: number
    who: { actorType: string; actorId: string }
    warrant: { words: string; where: string; when: string; saidBy: string; for: string[] } | null
  }

  async function history(id: string): Promise<Entry[]> {
    const res = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: AS_PERSON })
    expect(res.statusCode, res.body).toBe(200)
    return (res.json() as { revisions: Entry[] }).revisions
  }

  it('carries the warrant on the write it allowed and null on every other write', async () => {
    const id = askedOfTheOwner('the gripper drops the part on the third cycle')
    expect((await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })).status).toBe(200)

    const entries = await history(id)
    const act = entries.find((one) => one.warrant !== null)
    expect(act, 'the version history does not serve the warrant at all').toBeDefined()
    expect(act?.warrant?.words).toBe(THE_OWNERS_WORDS.words)
    expect(act?.warrant?.where).toBe('terminal')
    expect(act?.warrant?.for).toEqual([id])
    // BESIDE `who`, WHICH IS THE POINT: one row saying an agent wrote it and on whose words.
    expect(act?.who.actorType).toBe('agent')
    expect(act?.who.actorId).toBe('claude-code')
    // The create was the person's own write and stood on nobody's words.
    expect(entries.find((one) => one.seq === 1)?.warrant, 'an ordinary write carries a warrant').toBeNull()
  })

  it('carries it on one revision read whole, too', async () => {
    const id = askedOfTheOwner('the wrist camera drops a frame')
    expect((await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })).status).toBe(200)
    const entries = await history(id)
    const seq = entries.find((one) => one.warrant !== null)?.seq ?? 0
    const res = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions/${String(seq)}`, headers: AS_PERSON })
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json() as Entry).warrant?.words).toBe(THE_OWNERS_WORDS.words)
  })
})
