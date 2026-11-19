// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT CANNOT TAKE SOMETHING OUT OF THE QUEUE OF THINGS THE OWNER WAS ASKED.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS FILE CLOSES, IN THE NUMBERS THAT MEASURED IT
 * ---------------------------------------------------------------------------------------
 *
 * `data.whose_move: "person"` means the next step on a piece of work needs a judgement, an approval,
 * a hand on the hardware or money. It is the owner's queue of what agents have asked them for.
 * Measured over real HTTP on 25 August 2026, against a copy of the corpus, as
 * `x-mole-office-actor-type: agent`: a `problem` carrying `whose_move: person` was created and DELETED —
 * **200**; a problem the owner had asked on was closed with `{"dataPatch":{"state":"fixed"}}` —
 * **200**; and the question itself was cleared with `{"dataPatch":{"whose_move":null}}` — **200**.
 * Problem `CwXCaXyWwH_Y`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND THE HALF THAT IS EASY TO FORGET
 * ---------------------------------------------------------------------------------------
 *
 * Both directions, because a guard that refuses everybody is not a guard:
 *
 *   · the three acts are refused to an agent, and nothing is written;
 *   · the OWNER can still do all three, and an agent can still withdraw its OWN request and then
 *     close or delete the record. That two-step is the whole reason this rule is not a lock an agent
 *     can put on the corpus, and a test suite that only proved refusals would pass with the lock in
 *     place.
 *
 * AND A SECOND AGENT IS DRIVEN AT THE FIRST AGENT'S ASK, which is the case nothing here drove and
 * the reason a hole shipped inside a wave named after it. The guard first compared the asker's TYPE
 * alone, so *"an agent may withdraw its own request"* was built as *"an agent may withdraw any
 * non-human's request"*. Wave 2's verifier reproduced it over real HTTP with two agent identities on
 * 25 August 2026: `agent-alice` filed problem `FL_3TBSBQpc0` carrying `whose_move: person`,
 * `agent-mallory` cleared it — **200** — and deleted it — **200**, with no person anywhere.
 * `design/round-ten/verification/wave-2.json`, `newFaults` entry 1. Section 3a below is that case.
 *
 * The arrival half — that neither new guard can be reached from another machine either — is in
 * tests/governance-from-another-machine.test.ts, beside the other three guards and driven through
 * three real listeners rather than through `app.inject()`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
// Type-only, so this import is erased before it runs. A value import of records.ts here would open
// a database before helpers.ts had pointed MOLE_OFFICE_DB at a throwaway one.
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)
afterAll(() => {
  t.close()
})

/** The owner, as the browser sends them: a stated person Mole Office can place. */
function person(): Actor {
  return { type: 'human', id: t.api.HUMAN.id, stated: true }
}

/**
 * A problem that asks the owner something, written by whoever is given.
 *
 * `whose_move` arrives WITH THE CREATE, which is the case the change log cannot answer and the whole
 * reason the guard reads the revision ledger instead. A fixture that patched it on afterwards would
 * be testing the easy half.
 */
function asked(actor: Actor, symptom = 'the arm stops at the same joint limit'): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'problem',
    title: `whose move · ${symptom}`,
    data: { whose_move: 'person', symptom },
    actor,
  }).id
}

/** What the record holds now, straight out of the database. */
function stored(id: string): { deletedAt: string | null; state: unknown; whoseMove: unknown } {
  const record = t.api.getRecord(id) as { deletedAt: string | null; data: Record<string, unknown> }
  return { deletedAt: record.deletedAt, state: record.data['state'], whoseMove: record.data['whose_move'] }
}

/**
 * Write an agent row straight at the table, with the picture row its foreign key needs.
 *
 * The registration door cannot make an agent whose id is not its handle until piece I-1b lands, so
 * this is written at the table exactly as tests/an-agent-owns-what-it-wrote-under-its-other-name.test.ts
 * does. It is the row the mint will produce, and it is what lets the refusal resolve a stored id to
 * an agent's name (problem LjE30nD92swA).
 */
function insertAgent(who: { id: string; handle: string; name: string }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
}

// ============================================================ 1. the three acts, refused

describe('a record that asks the person something', () => {
  it('is not deleted by an agent, and the record is exactly as it was', () => {
    const id = asked(AGENT)
    const before = stored(id)
    const refusal = expectPanelError(t, () => t.api.deleteRecord(id, AGENT), 403)
    expect(refusal.message).toContain('takes it out of their queue')
    expect(refusal.message).toContain('claude-code')
    expect(stored(id)).toEqual(before)
  })

  it('is not closed by an agent, whoever asked', () => {
    const id = asked(person())
    const refusal = expectPanelError(
      t,
      () => t.api.patchRecord(id, { dataPatch: { state: 'fixed' } }, AGENT),
      403,
    )
    expect(refusal.message).toContain('answers the question for them')
    expect(stored(id).state).toBeUndefined()
  })

  it('keeps its question when an agent tries to clear one the person wrote', () => {
    const id = asked(person())
    const refusal = expectPanelError(
      t,
      () => t.api.patchRecord(id, { dataPatch: { whose_move: null } }, AGENT),
      403,
    )
    // The refusal names who asked and when, so the agent can read why it is not its own to withdraw.
    // A person keeps the raw stamp, `human:owner`, because the person's id is their name (problem LjE30nD92swA).
    expect(refusal.message).toContain(`human:${t.api.HUMAN.id} wrote`)
    expect(stored(id).whoseMove).toBe('person')
  })

  it('keeps its question when an agent changes it to something else rather than clearing it', () => {
    // CHANGED, NOT CLEARED, and it is the same act: `whose_move: agent` takes the record out of the
    // owner's queue exactly as `null` does. A guard that only asked about null would be walked past
    // by one extra word.
    const id = asked(person())
    expectPanelError(t, () => t.api.patchRecord(id, { dataPatch: { whose_move: 'agent' } }, AGENT), 403)
    expect(stored(id).whoseMove).toBe('person')
  })

  it('is not emptied by a wholesale data write either', () => {
    // THE OTHER DOOR INTO THE SAME FIELD. `data` replaces the whole object, so leaving `whose_move`
    // out of it clears the question without ever naming it. The guard is handed the value that will
    // be STORED, which is what makes both doors one door.
    const id = asked(person())
    expectPanelError(
      t,
      () => t.api.patchRecord(id, { data: { symptom: 'the arm stops at the same joint limit' } }, AGENT),
      403,
    )
    expect(stored(id).whoseMove).toBe('person')
  })

  it('is not emptied by a request that said who nobody is', () => {
    // Owner decision §36: an absent header is not evidence that a person made the act. `stated:
    // false` is what `actorFrom` puts on a request that sent no actor header at all.
    const id = asked(person())
    const refusal = expectPanelError(
      t,
      () => t.api.deleteRecord(id, { type: 'human', id: t.api.HUMAN.id, stated: false }),
      403,
    )
    expect(refusal.message).toContain('sent no actor headers')
    expect(stored(id).deletedAt).toBeNull()
  })
})

// ============================================================ 2. where nobody recorded who asked

describe('where nobody recorded who asked', () => {
  /**
   * A record carrying the question and no revision holding it.
   *
   * It is written straight into the table, because no code path in the product can produce it: every
   * write saves a revision. It is what an archive import and a database from before the ledger
   * existed both leave behind, and it is the case where a guard that failed open would hand the
   * whole hole back for exactly the records whose history is missing.
   */
  function withNoLedger(): string {
    const id = asked(person())
    t.client.sqlite.prepare('delete from revisions where record_id = ?').run(id)
    return id
  }

  it('refuses to let an agent withdraw a question it cannot say was its own', () => {
    const id = withNoLedger()
    const refusal = expectPanelError(
      t,
      () => t.api.patchRecord(id, { dataPatch: { whose_move: null } }, AGENT),
      403,
    )
    expect(refusal.message).toContain('Nobody recorded who asked')
    expect(stored(id).whoseMove).toBe('person')
  })

  it('and refuses the delete and the close as well', () => {
    expectPanelError(t, () => t.api.deleteRecord(withNoLedger(), AGENT), 403)
    expectPanelError(
      t,
      () => t.api.patchRecord(withNoLedger(), { dataPatch: { state: 'fixed' } }, AGENT),
      403,
    )
  })

  it('still lets the person do all three, because absence is not a lock on the person', () => {
    const closing = withNoLedger()
    t.api.patchRecord(closing, { dataPatch: { state: 'fixed' } }, person())
    expect(stored(closing).state).toBe('fixed')

    const clearing = withNoLedger()
    t.api.patchRecord(clearing, { dataPatch: { whose_move: null } }, person())
    expect(stored(clearing).whoseMove).toBeUndefined()

    const deleting = withNoLedger()
    t.api.deleteRecord(deleting, person())
    expect(stored(deleting).deletedAt).not.toBeNull()
  })
})

// ============================================================ 3. and it is not a lock

describe('an agent may withdraw its own request', () => {
  it('clears a question it asked itself, and may then close the record', () => {
    // THE TWO-STEP THIS WHOLE RULE RESTS ON, and the half that would be missing if the guard simply
    // refused every write on a record carrying the field. Both writes are in the change log, so the
    // person can see that a question was asked and dropped.
    const id = asked(AGENT)
    t.api.patchRecord(id, { dataPatch: { whose_move: null } }, AGENT)
    expect(stored(id).whoseMove).toBeUndefined()
    t.api.patchRecord(id, { dataPatch: { state: 'fixed' } }, AGENT)
    expect(stored(id).state).toBe('fixed')
    t.api.deleteRecord(id, AGENT)
    expect(stored(id).deletedAt).not.toBeNull()
  })

  it('may not withdraw one the person wrote over the top of its own', () => {
    // The answer is who wrote the value the record holds NOW, not who wrote the first one. An agent
    // asked, the person cleared it, the person asked again: the standing question is the person's.
    const id = asked(AGENT)
    t.api.patchRecord(id, { dataPatch: { whose_move: null } }, AGENT)
    t.api.patchRecord(id, { dataPatch: { whose_move: 'person' } }, person())
    expectPanelError(t, () => t.api.patchRecord(id, { dataPatch: { whose_move: null } }, AGENT), 403)
    expect(stored(id).whoseMove).toBe('person')
  })
})

// ============================================ 3a. and one agent's ask is not another agent's to take

/**
 * TWO AGENTS ARE TWO ASKERS, and nothing in this file drove that case until the hole was found.
 *
 * `AGENT` and `ANOTHER_AGENT` differ in their id and in nothing else: both are stated agents on this
 * machine, so every clause of the guard except the one under test is already satisfied for both.
 * That is deliberate — a second agent refused by the header clause or the machine clause would prove
 * nothing about which agent asked.
 */
const ANOTHER_AGENT: Actor = { type: 'agent', id: 'another-agent', sessionId: 'sess-test' }

describe('a question one agent asked is not another agent’s to withdraw', () => {
  it('refuses the second agent the withdrawal, and the question stays in the queue', () => {
    const id = asked(AGENT)
    const refusal = expectPanelError(
      t,
      () => t.api.patchRecord(id, { dataPatch: { whose_move: null } }, ANOTHER_AGENT),
      403,
    )
    expect(refusal.message).toContain("takes it out of the person's queue")
    expect(stored(id).whoseMove).toBe('person')
  })

  it('refuses the second agent the delete and the close as well', () => {
    const deleting = asked(AGENT)
    expectPanelError(t, () => t.api.deleteRecord(deleting, ANOTHER_AGENT), 403)
    expect(stored(deleting).deletedAt).toBeNull()

    const closing = asked(AGENT)
    expectPanelError(
      t,
      () => t.api.patchRecord(closing, { dataPatch: { state: 'fixed' } }, ANOTHER_AGENT),
      403,
    )
    expect(stored(closing).state).toBeUndefined()
  })

  it('refuses the two writes in a row that took the ask out of the queue when this shipped', () => {
    // THE VERIFIER'S OWN SEQUENCE, END TO END: clear the question, then delete the record. Both were
    // 200 and the ask was gone. Either refusal on its own closes the hole; asserting both is what
    // says a second door was not left open beside the one that was shut.
    const id = asked(AGENT)
    expectPanelError(t, () => t.api.patchRecord(id, { dataPatch: { whose_move: null } }, ANOTHER_AGENT), 403)
    expectPanelError(t, () => t.api.deleteRecord(id, ANOTHER_AGENT), 403)
    expect(stored(id)).toEqual({ deletedAt: null, state: undefined, whoseMove: 'person' })
  })

  it('names whose question it is, and does not tell the second agent the request is its own', () => {
    // THE SENTENCE BESIDE THE HOLE. The refusal used to read "The request is yours, so withdraw it
    // first", which was false for every caller that was not the asker, and it was advice that could
    // not be followed. `claude-code` is a writer no registry row holds, so nothing can be placed and
    // the raw stored id is what the fallback says (problem LjE30nD92swA).
    const id = asked(AGENT)
    const refusal = expectPanelError(t, () => t.api.deleteRecord(id, ANOTHER_AGENT), 403)
    expect(refusal.message).toContain(`agent "${AGENT.id}"`)
    expect(refusal.message).toContain('asked the question')
    expect(refusal.message).toContain('so only they or the person can take it out of the queue')
    expect(refusal.message).not.toContain('The request is yours')
  })

  it('still lets the agent that asked withdraw it, so this is not a lock either', () => {
    // THE OTHER DIRECTION, AND IT IS WHY THIS SECTION IS NOT JUST A SECOND REFUSAL. A rule that
    // refused every agent would pass all four tests above and would be the lock §8.5 exists to
    // avoid. The asker's own two-step still works, on the same fixture the refusals were run on.
    const id = asked(AGENT)
    t.api.patchRecord(id, { dataPatch: { whose_move: null } }, AGENT)
    expect(stored(id).whoseMove).toBeUndefined()
    t.api.deleteRecord(id, ANOTHER_AGENT)
    expect(stored(id).deletedAt).not.toBeNull()
  })

  it('does not let an agent that borrowed the person’s name withdraw the person’s question', () => {
    // BOTH HALVES OF THE IDENTITY. The id alone would make this agent the asker, because the ids
    // match; the type is what says it is not. `actor_type` and `actor_id` are both free text in the
    // ledger, so an agent may call itself anything at all.
    const id = asked(person())
    const impostor: Actor = { type: 'agent', id: t.api.HUMAN.id, sessionId: 'sess-test' }
    expectPanelError(t, () => t.api.patchRecord(id, { dataPatch: { whose_move: null } }, impostor), 403)
    expect(stored(id).whoseMove).toBe('person')
  })
})

// ============================================ 3b. the refusal names the agent, not the ledger's string

/**
 * A REGISTERED AGENT WHOSE ID IS NOT ITS HANDLE. Piece I-1b is not on main, so a row of this shape
 * cannot be made through the registration door; `insertAgent` above writes it at the table. It is
 * the shape the mint produces, and the shape this refusal has to translate: `agent:<minted id>` must
 * read as an agent's name, not as twelve characters nobody chose (problem LjE30nD92swA).
 */
const A_MINTED_AGENT = { id: 'Wm4kP9xQ2bTz', handle: 'wanderer', name: 'Wanderer' }

describe('the refusal names the agent rather than printing the string the ledger holds', () => {
  it('names a registered agent that wrote under its minted id', () => {
    insertAgent(A_MINTED_AGENT)
    const id = asked({ type: 'agent', id: A_MINTED_AGENT.id, sessionId: 'sess-test' })
    const refusal = expectPanelError(t, () => t.api.deleteRecord(id, ANOTHER_AGENT), 403)
    // THE WHO-ASKED CLAUSE AND THE NOT-YOURS CLAUSE both read the same resolved name, and neither
    // prints the string the ledger holds at a reader.
    expect(refusal.message, 'the refusal does not name the agent that asked').toContain(A_MINTED_AGENT.name)
    expect(refusal.message, 'the refusal does not say which name that agent goes by').toContain(
      A_MINTED_AGENT.handle,
    )
    expect(refusal.message, 'the refusal printed the stored id at a reader').not.toContain(A_MINTED_AGENT.id)
  })

  it('falls back to the raw stored id where no registry row can be placed', () => {
    // `claude-code` is one of the six writers no registry row holds, so nothing resolves and the
    // office says the stored string rather than inventing an agent for it.
    const id = asked(AGENT)
    const refusal = expectPanelError(t, () => t.api.deleteRecord(id, ANOTHER_AGENT), 403)
    expect(refusal.message, 'the raw stored id is not said at all').toContain(AGENT.id)
    expect(refusal.message).toContain('which no registry row answers to')
  })
})

describe('the owner is refused nothing', () => {
  it('closes a record that asks the person something, which IS the answer', () => {
    const id = asked(AGENT)
    t.api.patchRecord(id, { dataPatch: { state: 'fixed' } }, person())
    expect(stored(id).state).toBe('fixed')
    // AND THE FIELD IS NOT AUTO-CLEARED. Queue membership is derived — live, not an end state, field
    // set — so the item leaves the queue by derivation and the stale field is a record of what was
    // once asked. Nothing writes twice.
    expect(stored(id).whoseMove).toBe('person')
  })

  it('clears the question, and deletes the record', () => {
    const clearing = asked(AGENT)
    t.api.patchRecord(clearing, { dataPatch: { whose_move: null } }, person())
    expect(stored(clearing).whoseMove).toBeUndefined()

    const deleting = asked(AGENT)
    t.api.deleteRecord(deleting, person())
    expect(stored(deleting).deletedAt).not.toBeNull()
  })
})

// ============================================================ 4. and it is narrow

describe('everything this guard leaves alone', () => {
  it('lets an agent edit, link and retitle a record that asks the person something', () => {
    const id = asked(person())
    t.api.patchRecord(id, { summary: 'measured again this morning, same joint' }, AGENT)
    t.api.patchRecord(id, { title: 'whose move · the arm stops at the same joint limit, still' }, AGENT)
    t.api.patchRecord(id, { dataPatch: { cause: 'the URDF limit is tighter than the controller' } }, AGENT)
    expect(stored(id).whoseMove).toBe('person')
  })

  it('lets an agent set a state that is not an end state', () => {
    const id = asked(person())
    t.api.patchRecord(id, { dataPatch: { state: 'open' } }, AGENT)
    expect(stored(id).state).toBe('open')
  })

  it('leaves a record nobody is asking about entirely alone', () => {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'whose move · nobody said whose move it is',
      data: { symptom: 'the log stops half way' },
      actor: AGENT,
    }).id
    t.api.patchRecord(id, { dataPatch: { state: 'fixed' } }, AGENT)
    t.api.deleteRecord(id, AGENT)
    expect(stored(id).deletedAt).not.toBeNull()
  })

  it('leaves a record that has already been answered alone', () => {
    // Already at an end state, so it is not in the queue and deleting it takes nothing from anybody.
    const id = asked(person())
    t.api.patchRecord(id, { dataPatch: { state: 'fixed' } }, person())
    t.api.deleteRecord(id, AGENT)
    expect(stored(id).deletedAt).not.toBeNull()
  })

  it('lets an agent delete a record that was already deleted, which writes nothing anyway', () => {
    const id = asked(person())
    t.api.deleteRecord(id, person())
    const again = t.api.deleteRecord(id, AGENT)
    expect(again.alreadyDeleted).toBe(true)
  })
})
