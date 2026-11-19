// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MOLE OFFICE IS FOR: one person, and the id Mole Office writes for them.
 *
 * ---------------------------------------------------------------------------------------
 * THE ID IS READ FROM THE OFFICE'S OWN DATABASE, NOT WRITTEN HERE
 * ---------------------------------------------------------------------------------------
 *
 * Until 30 September 2026 this file declared the id as a constant, the owner's own id, compiled into every
 * copy of the product. The recommendations at FLO-14 end that: a fresh office writes no built-in
 * person. Who owns an office is a setting kept in
 * that office's own database (people.office_owner, the owner migration `the_owner_comes_from_the_installer`), written at the first migrate
 * from MOLE_OFFICE_OWNER_ID, or `owner` when nothing said. The owner's own office keeps the old id because their
 * .env says so.
 *
 * ONE PLACE WORKS IT OUT. On the server that is src/server/lib/owner.ts, which reads the database
 * once and then tells this file with `theOwnerIsKnown`. In the browser it is src/web/owner.ts, which
 * asks the server with GET /api/office/owner before any of the app's own modules run, and then tells
 * this file the same way. `THE_PERSON` below is that one answer, held for the rest of the process.
 * The 39 files that read it before 30 September keep reading it by the same name, and each one reads
 * the value the one place worked out.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT REOPENED THE OLD "NO FETCH" DECISION
 * ---------------------------------------------------------------------------------------
 *
 * This header used to reject the browser asking the server for the name, for three reasons, and said
 * what would reopen it: "the name stopping being a constant. If Mole Office ever reads who the person
 * is from configuration ... the browser has to ask." That happened. Reasons ONE and TWO no longer
 * hold: the server now has a source of its own, the database, and the bundle cannot know which office
 * it will be served by. Reason THREE still holds, and it is why the browser asks BEFORE the app draws
 * (src/web/main.tsx): a governance click made before the browser knew who it was would be refused
 * for naming nobody, so there is no moment when a page is on screen and the owner is unknown.
 *
 * ---------------------------------------------------------------------------------------
 * BEFORE ANYBODY HAS SAID
 * ---------------------------------------------------------------------------------------
 *
 * A process that reads `THE_PERSON` before the one place has told it gets `NOBODY_HAS_SAID`, which
 * is not a usable id: it has spaces, so the handle rules refuse it, and a row written with it is
 * visibly wrong rather than filed under a plausible person. The server tells this file right after
 * its database is migrated and before it listens; the browser before its app's modules are loaded.
 *
 * THE VALUE IS ALSO KEPT ON `globalThis`, under one symbol. A test runner may load this module more
 * than once in one process (vitest's `resetModules`), and each load would otherwise start again at
 * `NOBODY_HAS_SAID` although the process was already told. There is one office per process and one
 * page per browser tab, so one value per global is the truth, not a shortcut.
 */

/** What `THE_PERSON` holds before the one place has said. Not a usable id, on purpose. */
export const NOBODY_HAS_SAID = 'nobody has said who owns this office yet'

const HELD = Symbol.for('mole-office.the-owner-id')

function heldBefore(): string {
  const held = (globalThis as Record<symbol, unknown>)[HELD]
  return typeof held === 'string' ? held : NOBODY_HAS_SAID
}

/**
 * The one person this office is for, by the id it writes for them.
 *
 * THIS IS AN IDENTITY AND NOT A DISPLAY NAME. It is the id on every row of the change log, the id
 * the server fills in for a request that names nobody, and the id the authority guard compares a
 * request against. The name a reader sees is on the person's row, and src/server/lib/owner.ts reads
 * it.
 *
 * IT IS NOT A SECRET AND NOTHING HERE PRETENDS IT IS. A caller that sends this id from a shell on
 * this machine is still taken at its word. The guard in src/server/lib/records.ts says so in its
 * own words, and proposal `gQy_g6iFREbh` is the owner's fork about closing that last step.
 */
export let THE_PERSON: string = heldBefore()

/**
 * THE ONE PLACE HAS SAID WHO OWNS THIS OFFICE. Called by src/server/lib/owner.ts and
 * src/web/owner.ts, and by the test setup that says whose office a test office is. Nothing else
 * calls it.
 *
 * A server opens one database for the life of its process, so it says this once. A test process
 * may open several databases one after another, each with its own owner, and the last one said is
 * the one in force.
 */
export function theOwnerIsKnown(id: string): void {
  ;(globalThis as Record<symbol, unknown>)[HELD] = id
  THE_PERSON = id
}

/**
 * THE LIMIT ON A GOVERNANCE ACT, IN ONE SENTENCE, WRITTEN ONCE AND READ IN THREE PLACES.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE RULE THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Fork `gQy_g6iFREbh` asked whether Mole Office should prove that a governance act really came from
 * the person. The answer is option A: no mechanism is needed for now, and it is written as a rule
 * that agents follow. Criterion P16
 * of `design/permissions/ACCEPTANCE.md`, and this is its whole implementation: nothing else is built
 * for that fork.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A CONSTANT AND NOT THREE PARAGRAPHS
 * ---------------------------------------------------------------------------------------
 *
 * The person's design says where it goes: the general rules file, the skill, and the refusal the guards
 * already write. Three copies of a sentence are three sentences that can drift, and the drift would
 * be invisible — every one of them would still read as a true statement about identity, and only the
 * three together would say different things about what Mole Office can prove. So the words live here,
 * and every place that says them reads them from here. CLAUDE.md and the skill are prose and cannot
 * import a constant; the test that compared their bytes was deleted on 12 November 2026.
 *
 * IT SAYS WHAT IS TRUE RATHER THAN WHAT IS PROTECTED. The guards can refuse an agent that names
 * itself, and they can do nothing about a program that sends the person's name; a sentence claiming otherwise
 * would be worse than no sentence, because somebody would rely on it.
 */
export const THE_LIMIT_ON_A_GOVERNANCE_ACT =
  "Mole Office cannot tell the person from a program on the person's machine that sends the person's name. " +
  "A governance act asked in the person's name is taken at its word. Do not ask in the person's name."

