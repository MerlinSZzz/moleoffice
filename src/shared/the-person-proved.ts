// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE CALLER IS THE PERSON, PROVED.
 * `theWordsAllowThis` and `thePersonIsProved` were moved byte for byte out of src/server/lib/records.ts, with no
 * change of behaviour. That file imports them back and re-exports them. The guards that refuse on them, such as
 * `assertThePersonIsProved`, stayed there.
 *
 * `theProvedPerson` is in src/server/lib/records/served-doors.ts, and `thePersonPressedItThemselves` is in
 * src/server/lib/records/own-words.ts. Each one calls `thePersonIsProved`, and
 * tests/every-person-only-check-is-sorted-for-a-raise.test.ts counts those calls only in src/server.
 *
 * `Actor` is declared in src/server/lib/records/actor.ts, and records.ts hands it on. Its declaration reads types
 * from other server files, so this file imports it as a type only, and nothing of src/server is loaded when this
 * file runs.
 */

import type { Actor } from '../server/lib/records.ts'

/**
 * DOES THIS REQUEST CARRY THE PERSON'S OWN WORDS FOR THIS ACT, and mark them used if it does.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CHANGES AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * Four guards ask this as their FIRST question about an agent, and every one of them refuses in
 * exactly the words it refused in before when the answer is no. Nothing about a refusal moved. What
 * moved is that "no" is no longer the only answer available: an agent that can quote what the person
 * said, where and when, may make the act, and the act carries the words wherever it is shown.
 *
 * An agent may retain the person's exact authorization, including words given in a terminal,
 * and carry it with the act. `design/messages/ACCEPTANCE.md` criteria W1 and W2 are the contract.
 *
 * ---------------------------------------------------------------------------------------
 * IT ANSWERS ONLY THE ACTOR QUESTION. THE OTHER CLAUSES STILL RUN
 * ---------------------------------------------------------------------------------------
 *
 * Every one of these guards asks four things in order: is the caller a person, did it say who it is,
 * is that somebody Mole Office can place, and which machine did it come from. A warrant answers the
 * FIRST only. A request that arrived from another machine is still refused with a warrant, because
 * the machine question is not one anybody's words can answer, and a request that named nobody is
 * still refused, because a warrant says whose words these are and not who is acting on them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT MARKS THE ACTOR, AND WHAT THE MARK IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `logChange` and `saveRevision` write the warrant into the ledgers, and they must write it on the
 * act it allowed and on nothing else. A warrant sent with an ordinary edit opened no door, so
 * storing it there would put *on the person's words* beside a write that never needed them — a claim
 * about the person that the person did not make. So the guard that USES a warrant says so, here, and
 * the ledgers write it only for a request where one was used.
 *
 * A PERSON IS NEVER ASKED THIS. `readWarrant` is only ever reached for a non-human caller — see
 * `warrantFrom` in lib/http.ts, which refuses a person's own request that carries one — so a
 * person's write can never be marked, and their own act never says it was made on anybody's words.
 */
export function theWordsAllowThis(actor: Actor): boolean {
  if (actor.warrant === undefined) return false
  actor.warrantUsed = true
  return true
}

/**
 * IS THIS CALLER THE PERSON? Criterion P83, point 1, and the one question every one of the person's
 * declared acts asks.
 *
 * ---------------------------------------------------------------------------------------
 * THE ANSWER, AND WHY IT IS NOT `actor.type === 'human'`
 * ---------------------------------------------------------------------------------------
 *
 * `x-mole-office-actor-type: human` is the caller's own word for itself and proves nothing. Under
 * P83 a request is the person only when it carries the person's key — worked out in `actorFrom` and
 * carried as `provedBy` — or when the one-version window covers it: a header claim with no key from
 * loopback or from a machine this office trusts (P73). The office's key and an agent's key are
 * proofs of a process, not of the person, and neither makes its holder the person.
 *
 * AN IN-PROCESS CALLER IS THE OFFICE ITSELF. `from` is absent exactly when no listener carried the
 * request — a migration, a script, `app.inject()` in a test — and the key
 * rule applies to a request a listener carried. So absent `from` answers yes for a human claim, and
 * that is why four hundred test files that inject do not each need a key.
 *
 * IT DOES NOT READ `stated`. A header-less request on a real socket is refused the governance acts
 * by `assertMayWrite`'s own clause, and the guards that treat a header-less caller as nobody keep
 * doing so where their bodies say `stated !== false`. This function answers only the key question.
 *
 * THE WINDOW'S OWN STATE IS NOT ASKED AGAIN HERE. Whether the person has closed the window is read
 * once, in `theHeaderWindowCovers` in lib/http.ts, and carried on the actor as
 * `theKeyWindowCovers`; this function reads that one boolean. Asking the keywindow module a second
 * time would be the same fact worked out in two places, and the two could drift at the moment the
 * press writes.
 *
 * ONE FACT, ONE PLACE: every guard that treats a caller as the person calls this, and the four
 * person-only route checks outside this file import it. A guard that asked its own question could
 * drift from this one with nothing failing (invariant 9).
 */
export function thePersonIsProved(actor: Actor): boolean {
  // Inside the run of a signed item's act, the person's signature on that item is the proof.
  if (actor.signedItem !== undefined) return true
  if (actor.provedBy === 'the-person-key') return true
  // The office's key and an agent's key are proofs, and neither is the person's.
  if (actor.provedBy !== undefined) return false
  if (actor.type !== 'human') return false
  // NO LISTENER CARRIED IT: a migration, a script, `app.inject()` — the office itself.
  if (actor.from === undefined) return true
  // CARRIED BY A LISTENER, no key: only the window keeps it, and only on loopback or a trusted machine.
  return actor.theKeyWindowCovers === true
}
