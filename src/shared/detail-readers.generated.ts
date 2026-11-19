// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY PLACES IN `src/web` ASK EACH SURFACE HOW MUCH TO SAY. GENERATED — DO NOT EDIT.
 *
 * Written by `node tools/detail-readers.mjs`. `tests/detail-readers-are-current.test.ts` fails
 * the build when this file and `src/web` disagree, so a new reader lands with a regeneration in
 * the same commit.
 *
 * WHAT THE NUMBER MEANS AND WHAT IT DOES NOT. It is a text scan for two literals, and it cannot
 * see a call site reached through a prop, a constant or a loop. `0` here means "this scan found
 * none", never "this control does nothing" — `settings-and-governance.md` §3.4 measured exactly
 * that case and said what it costs to confuse them: a working control would vanish and the
 * person's stored choice would become unreachable from the page. The Settings row draws its full
 * radio group whatever this file says. TypeScript's scanner removes comment text before matching,
 * so prose that quotes a call adds no reader. Strings stay in the scan, including `//` in a URL.
 *
 * The second opinion is `DETAIL_SURFACES_EXPECTED_UNREAD` in `src/shared/detail.ts`, held
 * honest by a behaviour test rather than by this scan. This is a third opinion, not a cache.
 */

/** How many places in the built product ask each surface how much to say. */
export const DETAIL_READERS: Readonly<Record<string, number>> = {
  home: 1,
  review: 0,
  composer: 0,
  recipients: 0,
  messages: 0,
  reportIndex: 0,
  reportContent: 1,
  moduleCards: 0,
  graph: 2,
  tables: 0,
}
