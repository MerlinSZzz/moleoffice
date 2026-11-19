// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REACH: WHETHER A ROUTE MAY BE ANSWERED FOR A REQUEST FROM ANOTHER MACHINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office listens on loopback and has no login. `design/round-ten/design/remote-access.md` is the
 * plan for letting the owner's other machine reach it over their own private network, and its rule
 * is that an act is allowed when the ACTOR may perform it AND the MACHINE it was asked from may
 * perform it. This file is the second half: one word per route saying whether another machine may
 * ask for it at all.
 *
 * IT IS NOT AUTHENTICATION AND IT IS NOT ABOUT WHO IS WRITING. The actor headers still say who a
 * write is attributed to, unchanged, and a person at the other machine is still the same person.
 * This says which machine the act may be performed FROM.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING ENFORCES IT YET, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * Today Mole Office has one listener and it is on loopback, so every request already comes from this
 * machine and there is nothing for the word to refuse. The declarations land first, on their own,
 * because the check that every route has declared has to be green before the second listener is
 * built — a route nobody has classified is a hole nobody has looked at, and finding that out on
 * the day the bind address changes is the wrong day.
 *
 * The reader and the refusal live in `src/server/lib/reach.ts` and land with the second listener.
 * `src/server/api/kinds.ts` is what refuses to register a route that declared nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS STORED ARE NOT THE WORDS ON SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * `local` and `remote` are the declaration. A person reads "this machine" and "another machine",
 * which is what somebody would say out loud. The spelling is `agent-coordination.md` section 5's,
 * adopted rather than re-minted, because that thread had already declared eleven routes with it.
 *
 * `local` means the request must have arrived on the listener for this machine. It does not mean
 * the loopback interface: under the arrangement remote-access.md settles, BOTH listeners are on
 * loopback and the proxy is what reaches the second one, so the interface cannot be the test.
 */

/** The two words a route may declare. */
export const REACHES = ['local', 'remote'] as const

/** Whether another machine may ask for this route. */
export type Reach = (typeof REACHES)[number]

/** Whether a string is one of the two words. */
export function isReach(value: unknown): value is Reach {
  return typeof value === 'string' && (REACHES as readonly string[]).includes(value)
}
