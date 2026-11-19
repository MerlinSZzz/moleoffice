// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The human-only rule, checked THROUGH HTTP rather than through lib/records.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS WHEN tests/records.test.ts ALREADY COVERS THIS
 * ---------------------------------------------------------------------------------------
 *
 * Because the guard was right and the answer was still wrong, and no test that called the library
 * directly could have noticed.
 *
 * `restoreRecord` in lib/records.ts refuses an agent, and tests/records.test.ts proves it. But the
 * route decided whether the restore was a NO-OP before it called that function:
 *
 *     const existing = getRecord(id)
 *     if (!existing.deletedAt) return recordReply(existing, ...)   // <- reached first
 *     restoreRecord(id, actor)                                     // <- the guard is in here
 *
 * So an agent asking to restore a decision that happened not to be deleted was answered **200 with
 * the record**. Nothing was corrupted, because nothing was written. What was wrong was the ANSWER:
 * an agent learns what it is allowed to do from what it is refused, and a 200 here teaches it that
 * restoring decisions is permitted. It would then be surprised only on the call that mattered — the
 * one against a decision a person had deliberately removed.
 *
 * It was found by black-boxing the running server, not by reading either file. From lib/ the guard
 * looked present; from the route the call looked correct; only the request showed it.
 *
 * THE LESSON THIS FILE ENCODES: a permission rule has to be tested where the caller stands. The
 * library test proves the rule exists. This proves the product applies it.
 *
 * ---------------------------------------------------------------------------------------
 * NO SECOND COPY OF THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * These tests read HUMAN_ONLY_KINDS rather than hard-coding `decision`, so a second human-only kind
 * is covered the day it is added instead of the day somebody remembers this file. The refusal
 * wording is not asserted word for word either — only the parts that make it useful to an agent:
 * which verb was refused, which kind, and who was asking.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND THING THIS FILE NOW PINS: YOU CANNOT REACH THE VERB BY LEAVING A HEADER OUT
 * ---------------------------------------------------------------------------------------
 *
 * Every defect this rule has actually had was an identity mistake rather than a permission mistake.
 * The guard asks whether the actor is human; three times over, something that was not human arrived
 * looking human, and the guard answered correctly about the wrong actor:
 *
 *   - a misspelt header name was read as no header, and no header means the person.
 *   - a header present and blank was read as no header, with the same result.
 *   - a header simply LEFT OUT while another was sent — `x-mole-office-actor-id: nightly-sweep` and no
 *     type — was read as the person too, and that one survived both fixes. It is now refused, per
 *     design/DECISIONS-PENDING.md §10.
 *
 * So the group at the bottom stops testing one header at a time and enumerates EVERY combination an
 * agent can send. Two answers are allowed and no others: an agent that has named itself in full is
 * refused the verb, and a request carrying none of the three headers is the person at the keyboard
 * and may use it. Everything in between is a 4xx. Writing it as an enumeration rather than as a list
 * of cases is deliberate — the three defects above were each a combination nobody had thought to
 * write down, and a loop over the whole set cannot leave one out.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { HUMAN_ONLY_KINDS } from '../src/shared/types.ts'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'

type App = Awaited<ReturnType<typeof apiApp>>['app']

let db: TestDb
let built: Awaited<ReturnType<typeof apiApp>>
let app: App

// ONE OFFICE FOR THE FILE. Every case below writes its own record through the human, so no case
// reads what another case wrote; only the server and its database are shared.
beforeAll(async () => {
  db = await freshDb()
  built = await apiApp()
  // `apiApp` returns the built server, which is the Fastify instance plus its route list. The
  // requests below want the instance itself.
  app = built.app
  // A LONGER WAIT THAN THE DEFAULT 10 SECONDS. The first test imports the whole server cold, and on
  // 30 September 2026 that took more than 10 seconds on a busy sandbox, so the one test this file
  // exists for failed on its set-up rather than on what it checks.
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
})

/** The headers an agent sends. `x-mole-office-actor-type`, not `x-mole-office-actor` — see actorFrom. */
const asAgent = { 'x-mole-office-actor-type': AGENT.type, 'x-mole-office-actor-id': AGENT.id }
const asHuman = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/** Create a record of `kind` as the human, and give back its id. */
async function createAsHuman(kind: string, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asHuman,
    // A DECISION SAYS WHAT IT REPLACES (problem ZSWftCSVUP2r): an empty list is saying none.
    payload: { kind, title, ...(kind === 'decision' ? { data: { replaces: [] } } : {}) },
  })
  expect(res.statusCode, `creating a ${kind} as the human: ${res.body}`).toBe(201)
  const id = (JSON.parse(res.body) as { record: { id: string } }).record.id
  return id
}

describe('a human-only kind is human-only over HTTP, not only in the library', () => {
  for (const kind of HUMAN_ONLY_KINDS) {
    describe(kind, () => {
      it('refuses an agent that asks to RESTORE one that was never deleted', async () => {
        // THE REGRESSION. This exact request answered 200 before the check moved ahead of the
        // no-op shortcut. The record is deliberately NOT deleted, because that is the path that
        // skipped the guard — a deleted one was refused correctly all along.
        const id = await createAsHuman(kind, `A ${kind} nobody deleted`)

        const res = await app.inject({
          method: 'POST',
          url: `/api/records/${id}/restore`,
          headers: asAgent,
        })

        expect(res.statusCode, `an agent restoring an undeleted ${kind}: ${res.body}`).toBe(403)
        const message = (JSON.parse(res.body) as { error: string }).error
        expect(message).toContain('restore')
        expect(message).toContain(kind)
        expect(message).toContain(AGENT.id)
      })

      it('refuses an agent that asks to restore one the human DID delete', async () => {
        const id = await createAsHuman(kind, `A ${kind} the human removed`)
        const removed = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asHuman })
        expect(removed.statusCode).toBe(200)

        const res = await app.inject({
          method: 'POST',
          url: `/api/records/${id}/restore`,
          headers: asAgent,
        })
        expect(res.statusCode).toBe(403)

        // And it really is still gone. A refusal that left the record restored would be worse than
        // no refusal, because the reply would say one thing and the database another.
        const after = await app.inject({ method: 'GET', url: `/api/records/${id}` })
        const record = (JSON.parse(after.body) as { record: { deletedAt: string | null } }).record
        expect(record.deletedAt).not.toBeNull()
      })

      it('refuses an agent that asks to DELETE one', async () => {
        const id = await createAsHuman(kind, `A ${kind} an agent tried to remove`)
        const res = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asAgent })
        expect(res.statusCode).toBe(403)

        const after = await app.inject({ method: 'GET', url: `/api/records/${id}` })
        const record = (JSON.parse(after.body) as { record: { deletedAt: string | null } }).record
        expect(record.deletedAt).toBeNull()
      })

      it('lets the human delete and restore the same record', async () => {
        // The other half, and it matters: a guard that refused everybody would pass every test
        // above while making the product unusable.
        const id = await createAsHuman(kind, `A ${kind} the human owns`)

        const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asHuman })
        expect(deleted.statusCode).toBe(200)

        const restored = await app.inject({
          method: 'POST',
          url: `/api/records/${id}/restore`,
          headers: asHuman,
        })
        expect(restored.statusCode, restored.body).toBe(200)

        const after = await app.inject({ method: 'GET', url: `/api/records/${id}` })
        const record = (JSON.parse(after.body) as { record: { deletedAt: string | null } }).record
        expect(record.deletedAt).toBeNull()
      })
    })
  }

  it('leaves a kind that is not human-only alone', async () => {
    // The guard must not have spread. An agent deleting a note is ordinary work.
    const id = await createAsHuman('note', 'A note an agent may remove')
    const res = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asAgent })
    expect(res.statusCode, res.body).toBe(200)
  })

  it('does not treat an unknown actor type as human', async () => {
    // The failure this whole rule exists to prevent is an agent being promoted by accident, and a
    // header nobody recognises is the likeliest way in.
    const id = await createAsHuman('decision', 'A decision behind a strange header')
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/records/${id}`,
      headers: { 'x-mole-office-actor-type': 'robot', 'x-mole-office-actor-id': 'whoever' },
    })
    expect(res.statusCode).not.toBe(200)
    expect(res.body).toContain('x-mole-office-actor-type')
  })
})

describe('no combination of missing headers gets an agent to a human-only verb', () => {
  /** The three headers an agent would send, each with the value it would honestly send. */
  const HONEST: [name: string, value: string][] = [
    ['x-mole-office-actor-type', AGENT.type],
    ['x-mole-office-actor-id', AGENT.id],
    ['x-mole-office-session', AGENT.sessionId],
  ]

  /**
   * Every subset of those three, as the request an agent would make by sending only that subset.
   *
   * Eight of them, from none to all. Enumerated rather than listed because each of the three
   * defects in this file's header was one combination somebody had not thought to write down, and
   * a loop is the only thing that cannot leave one out.
   */
  function everyCombination(): { headers: Record<string, string>; sent: string[] }[] {
    const all: { headers: Record<string, string>; sent: string[] }[] = []
    for (let mask = 0; mask < 1 << HONEST.length; mask += 1) {
      const chosen = HONEST.filter((_, i) => (mask & (1 << i)) !== 0)
      all.push({ headers: Object.fromEntries(chosen), sent: chosen.map(([name]) => name) })
    }
    return all
  }

  for (const kind of HUMAN_ONLY_KINDS) {
    for (const { headers, sent } of everyCombination()) {
      const named = sent.length === 0 ? 'nothing at all' : sent.join(' + ')
      const complete = sent.includes('x-mole-office-actor-type') && sent.includes('x-mole-office-actor-id')

      it(`sending ${named}: ${complete ? 'refused as the agent it is' : sent.length === 0 ? 'refused, because silence is not evidence of a person' : 'refused for not finishing the sentence'}`, async () => {
        const id = await createAsHuman(kind, `A ${kind} approached with ${named}`)
        const res = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers })

        if (sent.length === 0) {
          // THIS USED TO BE THE ONE ALLOWED CASE, and the owner closed it — §36, settled after an
          // independent reviewer showed that a request with no headers at all could promote a
          // proposal and the permanent log recorded the owner as having done it. Every request that
          // CLAIMED to be an agent was already refused; silence was not, and silence is the mistake
          // a client makes most easily.
          //
          // The identity is unchanged for every ordinary write: a header-less POST /api/records is
          // still the person typing by hand. What changed is that a GOVERNANCE act has to say so.
          expect(res.statusCode, `deleting a ${kind} with no headers at all: ${res.body}`).toBe(403)
          expect(res.body).toContain('x-mole-office-actor-type')
          return
        }

        expect(res.statusCode, `deleting a ${kind} having sent ${named}: ${res.body}`).toBeGreaterThanOrEqual(400)
        expect(res.statusCode).toBeLessThan(500)
        if (complete) {
          // It named itself in full, so the human-only rule is what answers, and it names the agent
          // back — the sentence an agent learns its limits from.
          expect(res.statusCode).toBe(403)
          expect(res.body).toContain(AGENT.id)
        } else {
          // It named itself halfway. That is refused BEFORE anything asks what it is allowed to do,
          // because the question cannot be asked about a writer nobody sent.
          expect(res.statusCode).toBe(400)
        }

        // In every branch except the person's, the record is untouched. A refusal that deleted the
        // record anyway would be worse than no refusal: the reply and the database would disagree.
        const after = await app.inject({ method: 'GET', url: `/api/records/${id}` })
        const record = (JSON.parse(after.body) as { record: { deletedAt: string | null } }).record
        expect(record.deletedAt, `a refused delete must leave the ${kind} alone`).toBeNull()
      })
    }

    it(`claiming to be human without saying which human does not delete a ${kind}`, async () => {
      // The strongest claim a caller can make, still incomplete. `x-mole-office-actor-type: human` with
      // no id used to be filed as the owner — the tool inherits the only name there is, and
      // with it the one privilege this product has. Nothing about the caller had to be true.
      const id = await createAsHuman(kind, `A ${kind} deleted by an anonymous human`)
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/records/${id}`,
        headers: { 'x-mole-office-actor-type': 'human' },
      })
      expect(res.statusCode, res.body).toBe(400)
      expect(res.body).toContain('x-mole-office-actor-id')

      const after = await app.inject({ method: 'GET', url: `/api/records/${id}` })
      expect((JSON.parse(after.body) as { record: { deletedAt: string | null } }).record.deletedAt).toBeNull()
    })

    it(`naming a run but no writer does not restore a ${kind} the human deleted`, async () => {
      // The other verb, and the one where the 200 was found. A run that says which run it is and
      // never says who is running it used to be filed as the owner with a session attached, which is the
      // person's own identity with a label on it.
      const id = await createAsHuman(kind, `A ${kind} restored by a nameless run`)
      const removed = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asHuman })
      expect(removed.statusCode).toBe(200)

      const res = await app.inject({
        method: 'POST',
        url: `/api/records/${id}/restore`,
        headers: { 'x-mole-office-session': 'sess-test' },
      })
      expect(res.statusCode, res.body).toBe(400)

      const after = await app.inject({ method: 'GET', url: `/api/records/${id}` })
      expect((JSON.parse(after.body) as { record: { deletedAt: string | null } }).record.deletedAt).not.toBeNull()
    })
  }
})
