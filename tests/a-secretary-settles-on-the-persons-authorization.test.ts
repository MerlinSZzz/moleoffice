// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WITH THE PERSON'S AUTHORIZATION, THE SECRETARY MAY SETTLE A PROPOSAL.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A rule is added here: with an authorization, the secretary may settle. The two stale proposals were
 * pressed by the person by hand.
 *
 * The authorization is one of the two keys the P59 door already reads: the person's own words, copied and
 * carried as a warrant, or the person's press of an elevation. The secretary's card is asked BEFORE the key, so
 * a warrant on a worker's request opens nothing and is never marked as used.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DRIVES, AND WHY EVERY DOOR IS THE REAL ONE
 * ---------------------------------------------------------------------------------------
 *
 * Both settling doors are driven over HTTP: `POST /api/records/:id/promote`, which writes the
 * decision and the link in one request, and `POST /api/links` with a `derived_from` link, which is
 * the settling act on its own. The fork is read back through the API rather than out of the tables,
 * because "settled" is a reading (`proposalResolution`), not a stored flag, and the reading changing
 * with the door is the defect this repository keeps meeting on the governance surface.
 *
 * The refusal half is here beside the acceptance half, because a file that only proved the
 * acceptances would pass with the door taken off, and a file that only proved the refusals would
 * pass with the door welded shut.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { thePress } from '../src/shared/the-press.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** The person's words as they said them, kept whole. The shape is the one every warrant test uses. */
const THE_WORDS_THEY_SAID = {
  saidBy: THE_PERSON,
  words: '这部分我按了，但是这部分需要加规则，如果有授权，秘书可以结',
  where: 'terminal',
  when: '2026-09-15 09:00',
} as const

/** The warrant, naming every record the person's words cover. */
function about(...ids: string[]): Record<string, unknown> {
  return { ...THE_WORDS_THEY_SAID, for: ids }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String((body as { error?: unknown })['error'] ?? reply.body), body }
}

/** A fork the owner reserved for themselves, filed by a registered worker. */
async function aForkTheyReserved(title: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent('worker-one'), {
    kind: 'proposal',
    title,
    data: {
      question: 'Which of the two?',
      options: ['One', 'The other'],
      because: 'Somebody has to choose.',
      who_settles_it: 'the owner',
    },
  })
  expect(filed.status, filed.said).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

/** A decision the person wrote and linked to nothing yet, for the link door to settle with. */
async function aDecisionTheyWrote(): Promise<string> {
  const made = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'decision',
    title: 'The answer, written down',
    data: { replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      because: 'The person answered in the terminal on 15 September.',
    },
  })
  expect(made.status, made.said).toBe(201)
  return String((made.body['record'] as { id: string }).id)
}

/** Is this fork read as settled, through the API rather than out of the tables? */
async function readsSettled(fork: string): Promise<boolean> {
  const back = await ask('GET', `/api/records/${fork}`, AS_THE_PERSON)
  expect(back.status, back.said).toBe(200)
  const resolution = back.body['resolution'] as { resolved?: boolean } | undefined
  return resolution?.resolved === true
}

/**
 * IS THIS FORK OFF THE PERSON'S OWN QUEUE? The queue reading is not `proposalResolution`: a
 * `derived_from` link makes a fork read resolved, and only a link the person made or one made on
 * their authorization takes it off their desk. The two readers must agree with the door that admitted
 * the write, which is the defect this whole repository names as its own.
 */
async function onTheirQueue(fork: string): Promise<{ open: boolean; settled: boolean }> {
  const desk = await ask('GET', '/api/forks', AS_THE_PERSON)
  expect(desk.status, desk.said).toBe(200)
  const open = (desk.body['forks'] as { recordId: string }[]).map((one) => one.recordId)
  const settled = (desk.body['settled'] as { proposalId: string }[]).map((one) => one.proposalId)
  return { open: open.includes(fork), settled: settled.includes(fork) }
}

/** What one ledger holds for a record: every non-null warrant or elevation, parsed. */
function ledgersFor(recordId: string): { warrant: string | null; elevation: string | null }[] {
  return t.client.sqlite
    .prepare(
      'SELECT warrant, elevation FROM changes WHERE record_id = ? UNION ALL ' +
        'SELECT warrant, elevation FROM revisions WHERE record_id = ?',
    )
    .all(recordId, recordId) as { warrant: string | null; elevation: string | null }[]
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: 'secretary' })
  await ask('POST', '/api/agents/started', asAgent('quill'), {
    handle: 'worker-one',
    name: 'Worker One',
    role: 'worker',
    workArea: ['src'],
  })
  await ask('POST', '/api/agents/started', asAgent('quill'), {
    handle: 'sup-one',
    name: 'Supervisor One',
    role: 'supervisor',
    workArea: ['src'],
  })
}, 60_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

// ============================================================================ (a) with a warrant

describe('the secretary carrying the person’s own words settles a proposal', () => {
  it('settles through the promote door, and the decision cites where the person’s words are', async () => {
    const fork = await aForkTheyReserved('A fork the owner reserved')
    const done = await ask('POST', `/api/records/${fork}/promote`, asAgent('quill'), {
      title: 'The answer the person gave in the terminal',
      data: { because: 'The person said so, in their own words.' },
      warrant: about(fork),
    })
    expect(done.status, done.said).toBe(201)

    const decision = done.body['decision'] as { id: string; data: Record<string, unknown> }
    expect(decision.data['authority']).toBe('the owner said so')
    expect(decision.data['decided_by']).toBe('the owner')
    // WHERE THE PERSON'S WORDS ARE: the warrant's own place field, not filled in from the fork.
    expect(decision.data['authority_reference']).toBe('terminal')

    // THE FORK READS SETTLED, which is the reading and not a stored flag.
    expect(await readsSettled(fork)).toBe(true)
    expect(await onTheirQueue(fork)).toEqual({ open: false, settled: true })

    // AND BOTH LEDGERS CARRY THE PERSON'S WORDS ON THE ACT THEY ALLOWED.
    const held = ledgersFor(decision.id).filter((row) => row.warrant !== null)
    expect(held.length).toBeGreaterThan(0)
    for (const row of held) expect(JSON.parse(String(row.warrant))).toEqual(about(fork))
  })

  it('settles through the link door, and the link ledger carries the person’s words', async () => {
    const fork = await aForkTheyReserved('A fork settled by a link')
    const decision = await aDecisionTheyWrote()
    const linked = await ask('POST', '/api/links', asAgent('quill'), {
      fromId: decision,
      toId: fork,
      type: 'derived_from',
      warrant: about(fork),
    })
    expect(linked.status, linked.said).toBe(201)

    expect(await readsSettled(fork)).toBe(true)
    expect(await onTheirQueue(fork)).toEqual({ open: false, settled: true })

    // THE LINK IS THE ACT, so the warrant is on the LINK's change row, on the decision it leaves from.
    const row = t.client.sqlite
      .prepare("SELECT warrant FROM changes WHERE record_id = ? AND op = 'link'")
      .get(decision) as { warrant: string | null } | undefined
    expect(row?.warrant, 'the link ledger does not carry the person’s words').not.toBeNull()
    expect(JSON.parse(String(row?.warrant)).words).toBe(THE_WORDS_THEY_SAID.words)
  })

  it('settles on an elevation with no warrant, and the decision cites the grant', async () => {
    const pressed = await ask('POST', '/api/roles/elevation/quill', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
    expect(pressed.status, pressed.said).toBe(201)
    const grant = String((pressed.body['elevation'] as { id: string }).id)
    try {
      const fork = await aForkTheyReserved('A fork settled under the grant')
      const done = await ask('POST', `/api/records/${fork}/promote`, asAgent('quill'), {
        ...FOR_THE_PERSON,
        title: 'The answer, under the person’s press',
        data: { because: 'The person pressed the grant.' },
      })
      expect(done.status, done.said).toBe(201)

      const decision = done.body['decision'] as { id: string; data: Record<string, unknown> }
      expect(decision.data['authority']).toBe('the owner said so')
      expect(decision.data['decided_by']).toBe('the owner')
      expect(decision.data['authority_reference']).toBe(grant)

      expect(await readsSettled(fork)).toBe(true)
      expect(await onTheirQueue(fork)).toEqual({ open: false, settled: true })
      const held = ledgersFor(decision.id).filter((row) => row.elevation !== null)
      expect(held.length, 'the elevation is not named on the act it allowed').toBeGreaterThan(0)
      for (const row of held) expect(JSON.parse(String(row.elevation))['id']).toBe(grant)
    } finally {
      // THE GRANT IS ENDED HERE, because the office is shared with the cases after this one: a raise
      // left open would make their secretary a person acting under a grant, which is a different case.
      const ended = await ask('DELETE', '/api/roles/elevation/quill', { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
      expect(ended.status, ended.said).toBe(200)
    }
  })
})

// ========================================================= (b) with no authorization at all

describe('the secretary with no warrant and no elevation is refused, and told what would admit it', () => {
  it('refuses the promote door and names both keys', async () => {
    const fork = await aForkTheyReserved('A fork it may not settle yet')
    const no = await ask('POST', `/api/records/${fork}/promote`, asAgent('quill'), {
      title: 'It may not',
      data: { because: 'nothing authorizes this' },
    })
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain(thePress('Quill'))
    // THE PRESS IS ON THE AGENT'S OWN PAGE, by a decision and criterion P64.
    // It asked for #/roles until wave 13k's round 22 fix, and #/roles draws no press.
    expect(no.said).toContain('#/who/agent/quill')
    expect(no.said).not.toContain('#/roles')
    expect(no.said).toContain("carrying the person's own words as a warrant")
    expect(await readsSettled(fork)).toBe(false)
  })

  it('refuses the link door and names both keys', async () => {
    const fork = await aForkTheyReserved('A fork a link may not settle yet')
    const decision = await aDecisionTheyWrote()
    const no = await ask('POST', '/api/links', asAgent('quill'), {
      fromId: decision,
      toId: fork,
      type: 'derived_from',
    })
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain(thePress('Quill'))
    expect(no.said).toContain("carrying the person's own words as a warrant")
    expect(await readsSettled(fork)).toBe(false)
  })
})

// ==================================================== (c) every other agent stays refused

describe('a worker or a supervisor carrying the person’s words is still refused the settling link', () => {
  for (const handle of ['worker-one', 'sup-one'] as const) {
    it(`refuses ${handle} the link door`, async () => {
      const fork = await aForkTheyReserved(`A fork ${handle} may not settle`)
      const decision = await aDecisionTheyWrote()
      const no = await ask('POST', '/api/links', asAgent(handle), {
        fromId: decision,
        toId: fork,
        type: 'derived_from',
        warrant: about(fork),
      })
      expect(no.status).toBe(403)
      expect(no.said).toContain(`agent "${handle}"`)
      expect(await readsSettled(fork)).toBe(false)
    })
  }
})

// ============================================================================ (d) the 409 stays

describe('a proposal already settled is refused a second settling, to the secretary too', () => {
  it('answers 409 on the promote door and names the decision that settled it', async () => {
    const fork = await aForkTheyReserved('A fork settled once')
    const first = await ask('POST', `/api/records/${fork}/promote`, asAgent('quill'), {
      title: 'The first answer',
      data: { because: 'The person said so.' },
      warrant: about(fork),
    })
    expect(first.status, first.said).toBe(201)
    const decisionId = String((first.body['decision'] as { id: string }).id)

    const second = await ask('POST', `/api/records/${fork}/promote`, asAgent('quill'), {
      title: 'A second answer',
      data: { because: 'The person said so too.' },
      warrant: about(fork),
    })
    expect(second.status).toBe(409)
    expect(second.said).toContain('already settled')
    expect(second.said).toContain(decisionId)
  })
})

// ============================================================= (e) the person's own path

describe("the person's own press is unchanged", () => {
  it('settles with no warrant, cites the proposal, and records no authorization', async () => {
    const fork = await aForkTheyReserved('A fork only the person settles')
    const done = await ask('POST', `/api/records/${fork}/promote`, AS_THE_PERSON, {
      title: 'The person’s own answer',
      data: { because: 'The person chose it.' },
    })
    expect(done.status, done.said).toBe(201)
    const decision = done.body['decision'] as { id: string; data: Record<string, unknown> }
    expect(decision.data['authority']).toBe('the owner said so')
    expect(decision.data['decided_by']).toBe('the owner')
    // THE PERSON HAS NO AUTHORIZATION TO CITE, so the durable record they decided from is the reference.
    expect(decision.data['authority_reference']).toBe(fork)
    expect(ledgersFor(decision.id).every((row) => row.warrant === null && row.elevation === null)).toBe(true)
    expect(await readsSettled(fork)).toBe(true)
    expect(await onTheirQueue(fork)).toEqual({ open: false, settled: true })
  })
})
