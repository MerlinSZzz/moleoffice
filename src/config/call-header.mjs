// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NAME OF THE HEADER THAT TELLS A CALLER WHICH ROW ITS OWN REQUEST WROTE.
 *
 * Mole Office writes one row in `api_calls` per request. This header carries that row's id back on
 * the reply, so an agent can say *the call I just made is this one* rather than guessing from a
 * timestamp. `src/server/lib/usage.ts` sets it; nothing else may.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE NAME LIVES HERE AND NOT BESIDE THE CODE THAT SETS IT
 * ---------------------------------------------------------------------------------------
 *
 * It was declared in `src/server/lib/usage.ts`, which opens the database when it is imported. So
 * anything that wanted only the NAME had to take the database with it. Two things wanted only the
 * name: the cors registration in `src/server/index.ts`, which has to say a page on another origin may
 * read this header, and a test. The test gave up and typed the string again
 * (`tests/usage-hook.test.ts` had `const CALL_ID_HEADER = 'x-mole-office-call'`), which is the same
 * fact in two places with nothing making them agree — the defect CLAUDE.md names at the top.
 *
 * So the name moved to where a name can be read on its own, beside `world-header.mjs` and
 * `freshness-header.mjs`, which are here for the same reason. `.mjs` for the reason those two are:
 * `tools/session-hook.mjs` runs under a Node that cannot read TypeScript, and a name is exactly the
 * kind of thing a tool wants.
 */

/**
 * The response header carrying the id of the `api_calls` row this request produced.
 *
 * Lower case, because a browser lower-cases every header name and a caller comparing them would
 * otherwise be comparing two spellings of one thing.
 */
export const CALL_ID_HEADER = 'x-mole-office-call'
