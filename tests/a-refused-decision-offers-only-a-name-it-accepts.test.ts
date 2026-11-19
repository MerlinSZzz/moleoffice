// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION REFUSED FOR WHO SIGNED IT OFFERS ONLY A NAME THE SAME CHECK THEN ACCEPTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * An agent may sign a decision with its id or with its handle, and `sameAgent` in
 * src/server/lib/records.ts decides whether the name in `decided_by` is the caller. A handle that a
 * retired agent also bears names two agents, so `sameAgent` answers no to it and the decision is
 * refused. That is a governance check and it stays. But the refusal's own words, from
 * theNamesTheCallerMayWrite, offered that same handle as one of two names that would be accepted. An
 * agent that sent it again was refused again. The offer now asks the check itself which names pass.
 *
 * Seven other refusals of a decision offered, for `decided_by`, the name the request came under. An agent
 * asking under a handle that a retired agent also bears was offered that handle, and a decision signed with
 * it was refused. Those seven now offer what theNamesTheCallerMayWrite offers, as the refusal for who
 * signed it does.
 *
 * Each case reads the offer from the refusal, sends every name it offers, and expects each to be taken.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then the mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Offer both names without asking the check, as before: the shared-handle case goes red.
 *   - Offer only the id always: the case of a handle that names one agent goes red.
 *   - Offer the name the request came under in the seven other refusals, as before: each of the seven
 *     cases of those refusals goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_OWNER } from '../src/shared/kinds.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** A retired agent and a live one that bear one handle, and an agent whose handle names it alone. */
const BEFORE = { id: 'Rb7tW2kQ9mXa', handle: 'pea-sorter', name: 'Pea sorter, retired' }
const NOW = { id: 'Lv3nE8pS5cZd', handle: 'pea-sorter', name: 'Pea sorter' }
const ALONE = { id: 'Ow6gH1jK4rTy', handle: 'bean-sorter', name: 'Bean sorter' }
const SOMEBODY_ELSE = { id: 'Se2fV9bN7qLm', handle: 'seed-counter', name: 'Seed counter' }

/** Write an agent row straight at the table, with the picture row its foreign key needs. */
function insertAgent(who: { id: string; handle: string; name: string }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-11-07 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, '2026-11-07 10:00:00')
}

/** Send a decision with this data, and give back the status and the words of the answer. */
async function aDecisionSent(caller: string, data: Record<string, unknown>, title: string): Promise<{ code: number; said: string }> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(caller), payload: { kind: 'decision', title, data } })
  return { code: reply.statusCode, said: reply.body }
}

/** Send a decision signed with one name, and give back the status and the words of the answer. */
async function aDecisionSignedBy(caller: string, decidedBy: string, title: string): Promise<{ code: number; said: string }> {
  return aDecisionSent(caller, { replaces: [], decided_by: decidedBy, authority: 'a measurement', because: 'The sorter dropped 3 peas in 40.' }, title)
}

/** Every one of the caller's names that the refusal offers for `decided_by`, in every offer it makes. The owner's value is left out. */
function everyNameOffered(refusal: string): string[] {
  const words = (JSON.parse(refusal) as { error: string }).error
  const offers = [...words.matchAll(/`decided_by`: ("[^"]+"(?: or "[^"]+")?)/g)].map((offer) => offer[1]!)
  return offers.flatMap((offer) => [...offer.matchAll(/"([^"]+)"/g)].map((one) => one[1]!)).filter((name) => name !== THE_OWNER)
}

/** A decision the live agent signed with its id, so a record an agent wrote, for one of the seven to cite. */
let anAgentsRecord = ''

const BECAUSE = 'The sorter dropped 3 peas in 40.'

/** The seven other refusals: what is sent to meet each, and words that refusal alone says. */
const THE_SEVEN: { refusal: string; data: () => Record<string, unknown>; says: string }[] = [
  { refusal: 'no authority', data: () => ({ replaces: [], because: BECAUSE }), says: '`authority` is missing' },
  { refusal: 'nobody named as its maker', data: () => ({ replaces: [], authority: 'a measurement', because: BECAUSE }), says: '`decided_by` is missing' },
  {
    refusal: "the owner named as its maker, on an agent's authority",
    data: () => ({ replaces: [], decided_by: THE_OWNER, authority: 'a measurement', because: BECAUSE }),
    says: 'Those two cannot both be true',
  },
  {
    refusal: 'the owner named as its maker, citing nothing',
    data: () => ({ replaces: [], decided_by: THE_OWNER, authority: 'the owner said so', because: BECAUSE }),
    says: 'nothing here says where they said so',
  },
  {
    refusal: 'the owner named as its maker, citing a record nobody can open',
    data: () => ({ replaces: [], decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: 'no-such-record', because: BECAUSE }),
    says: 'nothing in Mole Office answers to that id',
  },
  {
    refusal: 'the owner named as its maker, citing a record an agent wrote',
    data: () => ({ replaces: [], decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: anAgentsRecord, because: BECAUSE }),
    says: 'somebody other than them wrote',
  },
  {
    refusal: "the caller's own, on the owner's authority",
    data: () => ({ replaces: [], decided_by: NOW.id, authority: 'the owner said so', because: BECAUSE }),
    says: 'This decision says you made it and that it stands on the owner having said so',
  },
]

/**
 * Every name the refusal offers for `decided_by` as the caller's own choice, in the order it offers them.
 * The offer is the part between "Send `decided_by`:" and "if this is your choice"; each name in it is quoted.
 */
function theNamesOffered(refusal: string): string[] {
  const words = (JSON.parse(refusal) as { error: string }).error
  const offer = /Send `decided_by`: (.*?) if this is your choice/.exec(words)
  if (offer === null) throw new Error(`The refusal makes no offer for the caller's own choice: ${words}`)
  return [...offer[1]!.matchAll(/"([^"]+)"/g)].map((one) => one[1]!)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  insertAgent(BEFORE)
  t.client.sqlite.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE id = ?').run('2026-11-01 09:00:00', BEFORE.id)
  insertAgent(NOW)
  insertAgent(ALONE)
  insertAgent(SOMEBODY_ELSE)
  const written = await aDecisionSignedBy(NOW.id, NOW.id, 'Weigh the peas')
  expect(written.code, written.said).toBe(201)
  anAgentsRecord = (JSON.parse(written.said) as { record: { id: string } }).record.id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a decision refused for who signed it', () => {
  // MUTATION: offer both names without asking the check: the handle is offered and refused again: red.
  it('signed with a handle a retired agent also bears, offers only the names the office then accepts', async () => {
    const refused = await aDecisionSignedBy(NOW.id, NOW.handle, 'Sort the peas by hand')
    expect(refused.code, 'a decision signed with a name two agents bear was taken').toBe(403)
    const offered = theNamesOffered(refused.said)
    expect(offered, 'the refusal offers no name at all').not.toEqual([])
    for (const name of offered) {
      const sent = await aDecisionSignedBy(NOW.id, name, `Sort the peas by hand, signed ${name}`)
      expect(sent.code, `the refusal offered "${name}", and a decision signed with it was refused: ${sent.said}`).toBe(201)
    }
  })

  // MUTATION: offer only the id: the handle is no longer offered: red.
  it('signed with another agent’s name, still offers both of the caller’s names when each names it alone', async () => {
    const refused = await aDecisionSignedBy(ALONE.id, SOMEBODY_ELSE.handle, 'Sort the beans by size')
    expect(refused.code, 'an agent signed a decision in another agent’s name').toBe(403)
    const offered = theNamesOffered(refused.said)
    expect([...offered].sort()).toEqual([ALONE.id, ALONE.handle].sort())
    for (const name of offered) {
      const sent = await aDecisionSignedBy(ALONE.id, name, `Sort the beans by size, signed ${name}`)
      expect(sent.code, `the refusal offered "${name}", and a decision signed with it was refused: ${sent.said}`).toBe(201)
    }
  })
})

describe('the seven other refusals of a decision', () => {
  // MUTATION: offer the name the request came under: the handle is offered and refused again: red.
  it.each(THE_SEVEN)('refused for $refusal, asked under a handle a retired agent also bears, offers only the names the office then accepts', async ({ refusal, data, says }) => {
    const refused = await aDecisionSent(NOW.handle, data(), `Sort the peas by colour, refused for ${refusal}`)
    expect(refused.code, `a decision meant to be refused for ${refusal} was not refused: ${refused.said}`).toBe(403)
    expect((JSON.parse(refused.said) as { error: string }).error, 'the decision was refused, but not by the refusal this case is about').toContain(says)
    const offered = everyNameOffered(refused.said)
    expect(offered, 'the refusal offers no name of the caller’s at all').not.toEqual([])
    for (const name of offered) {
      const sent = await aDecisionSignedBy(NOW.handle, name, `Sort the peas by colour, signed ${name} after ${refusal}`)
      expect(sent.code, `the refusal offered "${name}", and a decision signed with it was refused: ${sent.said}`).toBe(201)
    }
  })
})
